import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { EXPIRY_GUARDRAIL_MESSAGE } from '../../../data/payers/lifecycleGuardrails.data';
import { PRIMARY_REASON } from '../../../data/payers/inactivationDecisions.data';

/**
 * User story: Prevent Invalid Status Transitions Manually.
 *
 * MOST OF THIS STORY IS ALREADY AUTOMATED by the activation-guardrails story,
 * which owns the expiry boundaries that block a reactivation, the refusal
 * wording in both languages, the decision table of status against target
 * transition, the direct-API bypass attempt and the access-control refusal.
 * Those are not repeated - the traceability matrix maps each one.
 *
 * FOUR CASES ARE LEFT, and two of them report BLOCKED for a reason worth
 * stating plainly rather than working around: this environment cannot produce a
 * payer in the states they need.
 *
 *   AN EXPIRED PAYER cannot be manufactured. The expiry-date story pins expiry
 *   to today or later, so a payer created here is never expired. Expired payers
 *   do exist in the environment, but they are shared records - extending one's
 *   expiry to watch a transition unblock would take that payer's state away from
 *   every other case that samples it, which is a mistake this suite has made
 *   once already and will not repeat.
 *
 *   A PENDING PAYER cannot be produced either: reaching Pending needs an
 *   approved payer whose effective date has not arrived AND the scheduled job
 *   that later moves it to Active - the job this batch agreed to test manually.
 *
 * Both name the remedy, so they begin running the moment a disposable expired
 * payer or a seeded Pending payer exists.
 */
test.describe('Prevent invalid status transitions', () => {
  test('TC-001: should carry a payer through Active, Inactive and back with every step persisted', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // Two full lifecycle changes, each through approval.
    test.slow();

    await steps.critical('Navigate to the module with an Active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('Active to Inactive is permitted and takes effect', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('Inactive back to Active is permitted while the expiry is valid', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(publishedPayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('And every transition survives a reload', async () => {
      // The sheet's last step, and the one that separates a status that was
      // really persisted from one the screen was merely showing.
      await payerManagementPage.reload();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.openAuditHistory();
      const entries = await detail.getAuditEntryTexts();
      expect(
        entries.length,
        'both transitions should be on the record, not just the latest',
      ).toBeGreaterThanOrEqual(2);
    });
  });

  test('TC-002: should permit a reactivation once a lapsed expiry date is extended', async ({
    steps,
  }) => {
    steps.blocked(
      'This case needs a payer that is EXPIRED and disposable, and this environment offers '
      + 'neither. A payer created here can never be expired - the expiry-date story pins expiry '
      + 'to today or later - and the expired payers that do exist are shared records whose '
      + 'expiry this case would have to extend, taking their state away from every other case '
      + 'that samples an Expired payer. Remedy: run "npm run seed:status" and re-run once the '
      + 'seeded rows have lapsed, or provide one disposable expired payer for this suite to '
      + 'edit. The refusal itself - that an expired payer cannot be activated, with its '
      + `message "${EXPIRY_GUARDRAIL_MESSAGE.en}" - is already automated by the `
      + 'activation-guardrails story; what is missing here is only the unblocking half.',
    );
  });

  test('TC-003: should refuse a status change on a payer whose expiry date is missing', async ({
    page,
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    let cleared!: { status: number; text: string; validationErrors: string[] };

    await steps.critical('Navigate to the module and take a payer to Inactive', async () => {
      // Its own payer, inactivated properly, so the expiry can be cleared on a
      // record nothing else depends on.
      await payerManagementPage.open();
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.critical('Its expiry date is cleared on the wire', async () => {
      // The wizard will not save a payer without an expiry, so this state can
      // only be reached directly - and it is a state worth reaching, because an
      // expiry the system cannot read is an expiry it cannot evaluate a
      // transition against.
      const payerId = await payerManagementPage.getPayerId(publishedPayer.nameEn);
      cleared = await NetworkUtils.postAsSession(page, ApiEndpoints.payerUpdate, {
        id: payerId,
        expiryDate: null,
      });
      expect(cleared.status, 'the request should have reached the server').toBeGreaterThan(0);
    });

    await steps.step('Either the clearing itself is refused', async () => {
      // The best outcome, and the one to hope for: a payer never reaches the
      // ambiguous state at all. If the server accepts it, the next step decides
      // whether the transition guard catches what the field validation did not.
      const refused = cleared.status >= 400;
      expect(
        refused || cleared.status === 200,
        `the server answered ${cleared.status}: ${cleared.text.slice(0, 200)}`,
      ).toBe(true);
    });

    await steps.step('Or the activation is blocked because the expiry cannot be evaluated', async () => {
      // Asserted as the pair it is: a payer with no expiry must not be
      // activatable, whether that is prevented at the field or at the
      // transition. What must not happen is a silent activation of a payer
      // whose validity window nobody can determine.
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const availability = await payerManagementPage.getRowActionAvailability(
        publishedPayer.nameEn,
        'activate',
      );
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const expiry = (await detail.getFieldValue('Expiry Date')).trim();
      expect(
        expiry !== '' || availability !== 'available',
        `the payer has no expiry date ("${expiry}") yet Activate is "${availability}" - a `
          + 'transition is being offered against a validity window the system cannot evaluate',
      ).toBe(true);
    });
  });

  test('TC-004: should refuse a direct move from Pending to Inactive', async ({ steps }) => {
    steps.blocked(
      'This case needs a payer whose status is PENDING, which cannot be produced here. '
      + 'Reaching Pending requires an approved payer whose effective date has not yet arrived, '
      + 'and then the scheduled job that moves it to Active - the job this batch agreed to '
      + 'cover by manual testing (sheets 40 and 42). There is also an unresolved question about '
      + 'whether the payer list ever renders "Pending" as a lifecycle status at all: '
      + 'constants/ElementIds.ts records it as never doing so, while the expiry-precedence '
      + 'rules expect it. Remedy: seed a Pending payer, or settle that question first - the '
      + 'initial-status-derivation suite will answer it on its next run.',
    );
  });
});
