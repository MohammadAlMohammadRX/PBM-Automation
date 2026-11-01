import { test, expect } from '../../../fixtures';
import type { PlanInactivateDialog } from '../../../pages/plan/PlanInactivateDialog';
import {
  APPROVAL,
  CANCELLED_DETAILS,
  CASE,
  DETAILS_LIMIT,
  DETAILS_WITHOUT_REASON,
  FORCED_DETAILS,
  INDEPENDENT_DETAILS,
  LIMIT_MESSAGE,
  MAINTAINED_REASONS,
  ONLY_ACTIVE_MESSAGE,
  PAYER_REQUEST,
  REASON_REQUIRED_MESSAGE,
  STATUS,
  detailsOfLength,
} from '../../../data/plans/planActivation.data';

/**
 * User story 14331: Activate or deactivate a plan from the list and detail
 * screens with a mandatory reason - the rules: the reason is mandatory and
 * chosen from the maintained list, details are capped at 500 characters, only
 * an Active plan can be deactivated and only an Inactive one activated, and
 * cancelling changes nothing. A refusal is asserted on the screen AND on the
 * wire. Twins: tests/network/40 (reason) and 39 (status prerequisites).
 */
test.describe('US 14331 - Plan deactivation rules', () => {
  test(`TC-${CASE.reasonRequired}: should refuse the deactivation with MSG-PLN-026 when no reason is selected`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active');
    let drawer: PlanInactivateDialog | null = null;
    let attempt = { closed: true, toast: '' };

    await steps.critical('Navigate to the Plans Management module - the Active plan is listed', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Choose Deactivate on the plan - the dialog opens with reason and details fields', async () => {
      drawer = await planManagementPage.openDeactivationDrawer(plan.name);
      expect(await drawer.getSelectedReason(), 'the reason field').not.toBe('');
    });

    await steps.step('Leave the reason unselected and enter details only - the reason stays blank', async () => {
      expect(await drawer!.typeDetails(DETAILS_WITHOUT_REASON)).toBe(DETAILS_WITHOUT_REASON);
      expect(MAINTAINED_REASONS, 'no reason should be chosen').not.toContain(await drawer!.getSelectedReason());
    });

    await steps.step('Attempt to confirm the dialog - the mandatory fields are validated before submission', async () => {
      attempt = await drawer!.attemptConfirm();
      expect(attempt.closed, 'the dialog must not submit without a reason').toBe(false);
    });

    await steps.step('MSG-PLN-026 says a reason is required, the dialog stays open and nothing is submitted', async () => {
      const errors = await drawer!.getFieldErrors();
      expect(`${errors.reason} ${attempt.toast}`, 'MSG-PLN-026').toMatch(REASON_REQUIRED_MESSAGE);
      expect(await drawer!.isOpen(), 'the dialog should stay open').toBe(true);
      await drawer!.cancel();
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.approved);
    });
  });

  test(`TC-${CASE.detailsLimit}: should accept exactly 500 characters of details and refuse 501 with MSG-PLN-027 when a deactivation is submitted`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const first = await planIn('Active');
    const second = await planIn('Active');
    let drawer: PlanInactivateDialog | null = null;

    await steps.critical('Navigate to the Plans Management module - the Active plan is listed', async () => {
      await planManagementPage.openListFor(first.payerName);
      expect(await planManagementPage.isListed(first.name)).toBe(true);
    });

    await steps.critical('Choose Deactivate on the plan - the dialog opens', async () => {
      drawer = await planManagementPage.openDeactivationDrawer(first.name);
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step('Select a reason and enter exactly 500 characters - the field accepts them without error', async () => {
      await drawer!.selectReason(PAYER_REQUEST.reason);
      expect((await drawer!.typeDetails(detailsOfLength(DETAILS_LIMIT))).length, 'all 500 characters kept').toBe(DETAILS_LIMIT);
      expect((await drawer!.getFieldErrors()).details, 'no error at the limit').toBe('');
    });

    await steps.step('Submit the dialog - the request is submitted to the approval gate', async () => {
      const attempt = await drawer!.attemptConfirm();
      expect(attempt.closed, `500 characters should be accepted: ${attempt.toast}`).toBe(true);
    });

    await steps.step('On another Active plan, 501 characters are blocked with MSG-PLN-027', async () => {
      await planManagementPage.openListFor(second.payerName);
      const over = await planManagementPage.openDeactivationDrawer(second.name);
      await over.selectReason(PAYER_REQUEST.reason);
      const kept = await over.typeDetails(detailsOfLength(DETAILS_LIMIT + 1));
      const errors = await over.getFieldErrors();
      const attempt = await over.attemptConfirm();
      expect(kept.length, 'more than 500 characters must never be kept').toBeLessThanOrEqual(DETAILS_LIMIT);
      expect(`${errors.details} ${attempt.toast}`, 'MSG-PLN-027').toMatch(LIMIT_MESSAGE);
    });
  });

  test(`TC-${CASE.alreadyInactive}: should refuse to deactivate a plan with MSG-PLN-021 when it is already Inactive`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Inactive');
    let forced = { status: 0, text: '' };

    await steps.critical('Navigate to the Plans Management module - the plan is listed Inactive', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planManagementPage.expectStatusText(plan.name, STATUS.inactive);
    });

    await steps.step('Deactivate is disabled or unavailable for the plan', async () => {
      await planManagementPage.expectRowActionUnavailable(plan.name, 'inactivate');
    });

    await steps.step('Forced anyway, the request is checked against the current status and refused', async () => {
      forced = await planDetailPage.requestInactivationViaApi(plan.id, FORCED_DETAILS);
      expect(forced.status, 'the server must refuse').toBeGreaterThanOrEqual(400);
    });

    await steps.step('MSG-PLN-021 says only an Active plan can be deactivated, and the status does not change', async () => {
      expect(forced.text, 'MSG-PLN-021').toMatch(ONLY_ACTIVE_MESSAGE);
      expect(await planManagementPage.readStatus(plan.name)).toBe(STATUS.inactive);
    });
  });

  // An already-Active plan is simply not offered Activate; the forced-request / MSG-PLN-022 checks were
  // dropped with the invalid bug (QA lead, 2026-11-01).
  test(`TC-${CASE.alreadyActive}: should not offer Activate and keep the plan Active when the plan is already Active`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active');

    await steps.critical('Navigate to the Plans Management module - the plan is listed Active', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planManagementPage.expectStatusText(plan.name, STATUS.active);
    });

    await steps.step('Activate is disabled or unavailable for the plan', async () => {
      await planManagementPage.expectRowActionUnavailable(plan.name, 'activate');
    });

    await steps.step('The plan stays Active', async () => {
      expect(await planManagementPage.readStatus(plan.name)).toBe(STATUS.active);
    });
  });

  test(`TC-${CASE.cancelDialog}: should leave the status and audit trail unchanged when the deactivation dialog is cancelled`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active');
    let drawer: PlanInactivateDialog | null = null;
    let entriesBefore = 0;

    await steps.critical('Navigate to the Plans Management module - the Active plan is listed', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      entriesBefore = (await planDetailPage.audit().readAllEntries()).length;
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.expectStatusText(plan.name, STATUS.active);
    });

    await steps.critical('Open the deactivation dialog and choose a reason with details - the dialog shows them', async () => {
      drawer = await planManagementPage.openDeactivationDrawer(plan.name);
      await drawer.selectReason(PAYER_REQUEST.reason);
      expect(await drawer.typeDetails(CANCELLED_DETAILS)).toBe(CANCELLED_DETAILS);
      expect(await drawer.getSelectedReason()).toContain(PAYER_REQUEST.reason);
    });

    await steps.step('Click Cancel instead of confirming - the dialog closes without submitting', async () => {
      await drawer!.cancel();
      expect(await drawer!.isOpen(), 'the dialog should be closed').toBe(false);
    });

    await steps.step('Refreshed, the plan is still Active with no pending request', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.readStatus(plan.name)).toBe(STATUS.active);
      expect(await planManagementPage.getApprovalCell(plan.name), 'no change should be staged').toMatch(APPROVAL.approved);
    });

    await steps.step('The audit history has no new entry for the cancelled attempt', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      expect((await planDetailPage.audit().readAllEntries()).length).toBe(entriesBefore);
    });
  });

  test(`TC-${CASE.reasonFromList}: should offer only the maintained reasons in a select list and a separate 500-character details field when the deactivation dialog opens`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active');
    let drawer: PlanInactivateDialog | null = null;

    await steps.critical('Navigate to the Plans Management module - the Active plan is listed', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the deactivation dialog - a reason control is shown', async () => {
      drawer = await planManagementPage.openDeactivationDrawer(plan.name);
      expect(await drawer.getSelectedReason(), 'the reason control').not.toBe('');
    });

    await steps.step('The reason control is a dropdown list, not a free-text field', async () => {
      expect((await drawer!.getReasonOptions()).length, 'the control should open a list of options').toBeGreaterThan(0);
    });

    await steps.step('Its options are exactly the maintained reasons, with nothing extra', async () => {
      expect(await drawer!.getReasonOptions()).toEqual([...MAINTAINED_REASONS]);
    });

    await steps.step('With a reason selected, details stay a separate free-text field limited to 500 characters', async () => {
      await drawer!.selectReason(PAYER_REQUEST.reason);
      expect(await drawer!.typeDetails(INDEPENDENT_DETAILS)).toBe(INDEPENDENT_DETAILS);
      expect(await drawer!.getSelectedReason(), 'typing details must not change the reason').toContain(PAYER_REQUEST.reason);
      expect(await drawer!.getDetailsMaxLength(), 'the details limit').toBe(DETAILS_LIMIT);
    });
  });
});
