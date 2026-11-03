import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { APPROVAL_STATUS, FORMULARY_STATUS } from '../../../data/formulary/formulary.data';
import {
  ASSIGNED_MESSAGE,
  BLOCKED_CASES,
  CASES,
  DELETE_MESSAGE,
  REASON,
  planCountShown,
} from '../../../data/formulary/deleteFormulary.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { Timeouts } from '../../../constants/Timeouts';
import {
  approveFormulary,
  readAuditTrail,
  readFormularyOrNull,
  readTiers,
  readTrades,
  readVersions,
  waitForFormularyStatus,
} from '../../../utils/FormularyProvisioning';
import {
  assignPlanFormulary,
  attemptDetailDelete,
  clickHeaderActionLabelled,
  headerActionLabels,
  submitDeletion,
} from '../../../utils/formulary/writerAHelpers';

const pendingBadge = new RegExp(`${APPROVAL_STATUS.pending}$`);

/**
 * User story 15213: Delete Formulary.
 * A formulary with no plan can be submitted for deletion, which is logical and
 * approval-gated (approved: gone from the active list but kept for audit;
 * rejected or withdrawn: back to Active); one assigned to a plan cannot be
 * deleted; the request needs a reason, cannot be duplicated, and blocks new
 * plan assignments. See the data file for how the sheet maps onto this build.
 */
test.describe('US 15213 - Delete Formulary', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.unassigned.azureId}: should route the deletion of a formulary with no plan for approval when it is requested with a reason`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Future');
    let dialog: ConfirmDialog | null = null;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the formulary that has no plan assignments - its details show a plan assignment count of zero', async () => {
      await formularyDetailPage.open(formulary.id);
      expect((await formularyDetailPage.readViaApi(formulary.id)).assignedPlanCount ?? 0).toBe(0);
      expect(await formularyDetailPage.getPageText(), 'the plan assignment count on the page').toMatch(planCountShown(0));
    });

    await steps.step('Click Delete - a deletion confirmation dialog requesting a reason is displayed', async () => {
      dialog = await formularyDetailPage.requestDelete();
      expect(await dialog.isVisible()).toBe(true);
      expect(await dialog.hasFreeTextInput(), 'a reason field in the deletion dialog').toBe(true);
    });

    await steps.step('Enter a valid reason and submit - a confirmation is shown and the formulary awaits deletion approval', async () => {
      const prompt = dialog !== null && (await dialog.isVisible()) ? dialog : await formularyDetailPage.requestDelete();
      await prompt.typeReasonText(REASON);
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.formularyDelete, async () => { await prompt.confirmWithFollowUps(); });
      expect(answer?.status ?? -1, answer?.text.slice(0, 200)).toBeLessThan(300);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 200)).toBeLessThan(300);
      expect(sent.messages.join(' | '), 'a confirmation message').not.toBe('');
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge(), 'the deletion awaits approval').toMatch(pendingBadge);
      expect(await readFormularyOrNull(page, formulary.id), 'not removed yet').not.toBeNull();
    });
  });

  for (const key of ['assignedBlocked', 'onePlanBlocks'] as const) {
    const data = CASES[key];
    const exactlyOne = key === 'onePlanBlocks';
    test(exactlyOne
      ? `TC-${data.azureId}: should block the deletion as soon as the formulary is assigned to exactly one plan`
      : `TC-${data.azureId}: should refuse to delete a formulary assigned to an active plan and leave it unchanged`, async ({
      formularyManagementPage,
      formularyDetailPage,
      formularyIn,
      planIn,
      page,
      steps,
    }) => {
      test.setTimeout(20 * 60_000);
      const formulary = await formularyIn('Active');
      await planIn('Active', { formularyId: formulary.id });
      let attempt: Awaited<ReturnType<typeof attemptDetailDelete>>;

      await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
        await formularyManagementPage.open();
      });

      await steps.step(exactlyOne ? 'Open the formulary with exactly one plan assignment - the count shows 1' : 'Open the formulary assigned to an active plan - its details show at least one plan assignment', async () => {
        await formularyDetailPage.open(formulary.id);
        const count = (await formularyDetailPage.readViaApi(formulary.id)).assignedPlanCount ?? 0;
        if (exactlyOne) expect(count, 'plans assigned').toBe(1);
        else expect(count, 'plans assigned').toBeGreaterThanOrEqual(1);
        expect(await formularyDetailPage.getPageText(), 'the plan assignment count on the page').toMatch(planCountShown(1));
      });

      await steps.step(exactlyOne ? 'Attempt to delete the formulary - the assignment count is evaluated against the rule' : 'Click Delete - the plan-assignment rule is checked before proceeding', async () => {
        attempt = await attemptDetailDelete(formularyDetailPage);
        expect(attempt.status === -1 || attempt.status >= 400, `the deletion was accepted (${attempt.status}): ${attempt.said}`).toBe(true);
      });

      await steps.step(exactlyOne ? 'The deletion is blocked with a message that the formulary is in use' : `The message "${ASSIGNED_MESSAGE}" is shown and the formulary stays Active and unchanged`, async () => {
        if (exactlyOne) expect(attempt.said).toMatch(DELETE_MESSAGE.inUse);
        else expect(attempt.said).toContain(ASSIGNED_MESSAGE);
        const record = await formularyDetailPage.readViaApi(formulary.id);
        expect({ status: await formularyDetailPage.readStatusCodeViaApi(formulary.id), hasDraft: record.hasDraft === true }).toEqual({ status: 'active', hasDraft: false });
        expect((await readTrades(page, formulary.id)).length, 'its trades').toBe(formulary.trades.length);
      });
    });
  }

  test(`TC-${CASES.zeroPlans.azureId}: should accept and queue the deletion request of a formulary with zero plan assignments`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the formulary with zero plan assignments - the count shows 0', async () => {
      await formularyDetailPage.open(formulary.id);
      expect((await formularyDetailPage.readViaApi(formulary.id)).assignedPlanCount ?? 0).toBe(0);
      expect(await formularyDetailPage.getPageText()).toMatch(planCountShown(0));
    });

    await steps.step('Click Delete and submit a reason - the request is accepted and queued for approval', async () => {
      const dialog = await formularyDetailPage.requestDelete();
      await dialog.typeReasonText(REASON);
      await dialog.confirmWithFollowUps();
      expect((await formularyDetailPage.sendForApproval()).status).toBeLessThan(300);
      await formularyApprovalsPage.open();
      expect(await formularyApprovalsPage.isInQueue(formulary.nameEn), 'the deletion request in the approval queue').toBe(true);
    });
  });

  test(`TC-${CASES.approved.azureId}: should remove the formulary from the active list when its deletion request is approved`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularyIn,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Future');
    await submitDeletion(page, formulary.id);
    let dialog: ConfirmDialog;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the formulary pending deletion approval - it shows the pending deletion', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(pendingBadge);
    });

    await steps.critical('As the approver, open the pending deletion request and click Approve - a confirmation prompt is displayed', async () => {
      await formularyApprovalsPage.open();
      dialog = await formularyApprovalsPage.openApproveDialog(formulary.nameEn);
      expect(await dialog.isVisible()).toBe(true);
    });

    await steps.step('Confirm the approval - the formulary is deleted and leaves the active list', async () => {
      await dialog.confirm();
      await formularyApprovalsPage.waitForDecisionProcessed(formulary.nameEn);
      await expect.poll(async () => readFormularyOrNull(page, formulary.id), { timeout: Timeouts.queuePropagation, message: 'the formulary should be deleted' }).toBeNull();
    });

    await steps.step('Search the active list for the formulary - it no longer appears', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(false);
    });
  });

  test(`TC-${CASES.rejected.azureId}: should keep the formulary Active with its configuration intact when its deletion request is rejected`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularyIn,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const before = { tiers: (await readTiers(page, formulary.id)).length, trades: (await readTrades(page, formulary.id)).length };
    await submitDeletion(page, formulary.id);
    let dialog: ConfirmDialog;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the formulary pending deletion approval - it shows the pending deletion', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(pendingBadge);
    });

    await steps.critical('As the approver, open the pending deletion request and click Reject - a reason field is displayed', async () => {
      await formularyApprovalsPage.open();
      dialog = await formularyApprovalsPage.openRejectDialog(formulary.nameEn);
      const reasons = await dialog.getReasonOptions();
      expect(reasons.length > 0 || (await dialog.hasFreeTextInput()), 'a rejection reason to give').toBe(true);
    });

    await steps.step('Enter a rejection reason and confirm - the formulary reverts to Active', async () => {
      await dialog.selectFirstReasonIfPresent();
      await dialog.typeReasonText('Deletion rejected by the automation suite.');
      await dialog.confirm();
      await formularyApprovalsPage.waitForDecisionProcessed(formulary.nameEn);
      expect(await formularyDetailPage.readStatusCodeViaApi(formulary.id)).toBe('active');
    });

    await steps.step('The formulary appears in the active list with its original configuration intact', async () => {
      await formularyManagementPage.open();
      const row = await formularyManagementPage.readRow(formulary.nameEn);
      expect(row.status).toBe(FORMULARY_STATUS.active);
      expect({ tiers: (await readTiers(page, formulary.id)).length, trades: (await readTrades(page, formulary.id)).length }).toEqual(before);
    });
  });

  test(`TC-${CASES.secondRequest.azureId}: should prevent a second deletion request while one is already pending`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Future');
    await submitDeletion(page, formulary.id);

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the formulary that already has a pending deletion request - it shows the pending deletion', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(pendingBadge);
    });

    await steps.step('Clicking Delete again is disabled or says a request is already pending', async () => {
      const attempt = await attemptDetailDelete(formularyDetailPage);
      expect(attempt.availability !== 'available' || DELETE_MESSAGE.alreadyPending.test(attempt.said), `Delete offered and answered ${attempt.status}: ${attempt.said}`).toBe(true);
      expect(attempt.status === -1 || attempt.status >= 400, 'a second request must not be accepted').toBe(true);
    });
  });

  test(`TC-${CASES.noNewPlan.azureId}: should block assigning a formulary that is pending deletion to a new plan`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    planIn,
    page,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const formulary = await formularyIn('Active');
    const plan = await planIn('Draft', { noFormulary: true });
    await submitDeletion(page, formulary.id);

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the formulary pending deletion - it shows the pending deletion', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(pendingBadge);
    });

    await steps.step('Assigning it to a plan from the plan assignment is blocked with a pending-deletion message', async () => {
      const answer = await assignPlanFormulary(page, plan.id, formulary.id);
      expect(answer.status, `AssignFormularyToPlan answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(DELETE_MESSAGE.pendingDeletion);
    });
  });

  test(`TC-${CASES.reasonRequired.azureId}: should require a reason before a deletion request can be submitted`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Future');
    let dialog: ConfirmDialog;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Open the unassigned formulary and click Delete - the deletion dialog with a reason field is displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      dialog = await formularyDetailPage.requestDelete();
      expect(await dialog.hasFreeTextInput(), 'a reason field').toBe(true);
    });

    await steps.step('Leave the reason empty and Submit - a required-reason message is shown and nothing is submitted', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.formularyDelete, () => dialog.clickAction('confirm'), Timeouts.short);
      expect(answer, `the deletion was sent without a reason (${answer?.status})`).toBeNull();
      expect(await dialog.isVisible(), 'the dialog stays open').toBe(true);
      expect(`${await dialog.getMessage().catch(() => '')} ${(await formularyDetailPage.waitForMessages()).join(' ')}`).toMatch(DELETE_MESSAGE.required);
    });

    await steps.step('Enter a reason and Submit - the deletion request is accepted', async () => {
      if (!(await dialog.isVisible())) dialog = await formularyDetailPage.requestDelete();
      await dialog.typeReasonText(REASON);
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.formularyDelete, async () => { await dialog.confirmWithFollowUps(); });
      expect(answer?.status ?? -1, answer?.text.slice(0, 200)).toBeLessThan(300);
    });
  });

  test(`TC-${CASES.withdraw.azureId}: should let the administrator withdraw a pending deletion request and return the formulary to Active`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    await submitDeletion(page, formulary.id);

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the formulary with the pending deletion request - it shows the pending deletion with a Withdraw option', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(pendingBadge);
      expect(await headerActionLabels(page), 'the header actions').toEqual(expect.arrayContaining([expect.stringMatching(DELETE_MESSAGE.withdraw)]));
    });

    await steps.step('Click Withdraw and confirm - the request is cancelled and the formulary is Active again', async () => {
      await clickHeaderActionLabelled(page, DELETE_MESSAGE.withdraw);
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).not.toMatch(pendingBadge);
      expect(await formularyDetailPage.readStatusCodeViaApi(formulary.id)).toBe('active');
    });
  });

  test(`TC-${CASES.reCheck.azureId}: should accept the deletion once the formulary's only plan assignment has been removed`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    planIn,
    page,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const formulary = await formularyIn('Active');
    const plan = await planIn('Draft', { formularyId: formulary.id });
    const record = await formularyDetailPage.readViaApi(formulary.id);
    if ((record.assignedPlanCount ?? 0) + (record.pendingPlanVersionCount ?? 0) === 0) {
      steps.blocked('A draft plan carrying the formulary does not count as an assignment in this build, and an Active plan cannot be '
        + 'left without a formulary to remove it again - so "assigned, then unassigned in the Plan module" cannot be built.');
    }

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Remove the formulary from the plan in the Plan module - it now shows zero plan assignments', async () => {
      const answer = await assignPlanFormulary(page, plan.id, null);
      expect(answer.status, answer.text.slice(0, 200)).toBeLessThan(300);
      const after = await formularyDetailPage.readViaApi(formulary.id);
      expect((after.assignedPlanCount ?? 0) + (after.pendingPlanVersionCount ?? 0)).toBe(0);
    });

    await steps.step('Attempt to delete the formulary - the current assignment status is re-checked, not a cached one', async () => {
      await formularyDetailPage.open(formulary.id);
      const attempt = await attemptDetailDelete(formularyDetailPage);
      expect(attempt.status, attempt.said).toBeGreaterThanOrEqual(200);
      expect(attempt.status).toBeLessThan(300);
    });

    await steps.step('The deletion request is accepted and moves to pending deletion approval', async () => {
      expect((await formularyDetailPage.sendForApproval()).status).toBeLessThan(300);
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(pendingBadge);
    });
  });

  test(`TC-${CASES.logical.azureId}: should hide a deleted formulary from the active list but keep its history and a Deleted audit record`, async ({
    formularyManagementPage,
    formularyIn,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Future');
    const versionsBefore = (await readVersions(page, formulary.id)).length;
    await submitDeletion(page, formulary.id);
    await approveFormulary(page, formulary.nameEn);
    // Status code '' = GetFormulary no longer returns it (the deletion applied); not fatal here - the steps judge it.
    await waitForFormularyStatus(page, formulary.id, '', 60_000).catch(() => undefined);

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Search the active list for the deleted formulary - it does not appear', async () => {
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(false);
    });

    await steps.step('Its version / audit history still holds the prior records and the deletion event', async () => {
      const versions = await readVersions(page, formulary.id);
      expect(versions.length, 'the prior versions are kept').toBeGreaterThanOrEqual(versionsBefore);
      const trail = await readAuditTrail(page, formulary.id);
      expect(trail.items.length, 'the audit trail is kept').toBeGreaterThan(0);
      expect(JSON.stringify(trail.items), 'the deletion event').toMatch(DELETE_MESSAGE.deleted);
    });

    await steps.step('The audit trail shows the formulary as Deleted rather than removed entirely', async () => {
      const trail = await readAuditTrail(page, formulary.id);
      expect(JSON.stringify(trail.items)).toMatch(/"Deleted"|status[^,]*Deleted/i);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
