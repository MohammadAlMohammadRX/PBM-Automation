import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import {
  CASE,
  CELL,
  EDIT,
  FORBIDDEN_STATUS,
  REASON,
  REASON_TEXT,
  STATUS,
  WITHDRAW,
} from '../../../data/plans/planChangeStatuses.data';

/**
 * User story 14337: Pending Approval, Published, Superseded, Rejected and
 * Withdrawn statuses for plan changes - the rules around them: no withdrawal
 * after a decision, bilingual labels, a mandatory reason, approvers only.
 */
test.describe('US 14337 - Plan change status rules', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.noWithdrawAfterDecision}: should offer no way to withdraw a plan change when it has already been published or rejected`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    requireBaseline,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const published = await planIn('Active');
    const rejected = await planIn('Rejected');
    const pending = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(published.payerName);
      expect(await planManagementPage.isListed(published.name)).toBe(true);
      requireBaseline((await planManagementPage.getOfferedRowActions(pending.name)).includes('edit'), 'the withdraw-by-edit route on a pending change');
    });

    await steps.step('Open a plan change that is already Published - its details are shown', async () => {
      await planDetailPage.open(published.id);
      await planDetailPage.versions().open();
      expect((await planDetailPage.versions().readRows()).map((row) => row.status)).toContain(STATUS.published.en);
    });

    await steps.step('Attempt to withdraw the Published change - the withdraw route is unavailable', async () => {
      const actions = (await planDetailPage.versions().readRows()).flatMap((row) => row.actions);
      expect(actions.filter((action) => WITHDRAW.test(action)), 'no Withdraw on any version').toEqual([]);
      expect(await planManagementPage.getOfferedRowActions(published.name), 'no Edit (the withdraw route) on a published plan').not.toContain('edit');
      await planApprovalsPage.expectNotInQueue(published.name);
    });

    await steps.step('Repeat with a Rejected change - the withdraw route is likewise unavailable', async () => {
      await planDetailPage.open(rejected.id);
      await planDetailPage.versions().open();
      const rows = await planDetailPage.versions().readRows();
      expect(rows.map((row) => row.status)).toContain(STATUS.rejected.en);
      expect(rows.flatMap((row) => row.actions).filter((action) => WITHDRAW.test(action)), 'no Withdraw on any version').toEqual([]);
      await planApprovalsPage.expectNotInQueue(rejected.name);
    });
  });

  test(`TC-${CASE.arabicLabels}: should label each plan change status with its English and Arabic name, a withdrawn change reading Draft, when the history is shown`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const pending = await planIn('PendingApproval');
    const history = await planIn('Inactive');
    const rejected = await planIn('Rejected');
    const withdrawn = await planIn('PendingApproval');
    const language = planManagementPage.languageSwitcher();

    /** The plan's version statuses in English, then (switching and back) in Arabic. */
    const readStatusLabels = async (planId: string): Promise<{ english: string[]; arabic: string }> => {
      await planDetailPage.open(planId);
      await language.switchTo('en');
      await planDetailPage.versions().open();
      const english =(await planDetailPage.versions().readRows()).map((row) => row.status);
      await language.switchTo('ar');
      const arabicRows = async (): Promise<string> => (await planDetailPage.versions().readRows()).map((row) => row.status).join(' | ');
      await expect.poll(arabicRows, { message: 'the version statuses should re-render in Arabic' }).toMatch(/[؀-ۿ]/);
      const arabic = await arabicRows();
      await language.switchTo('en');
      return { english, arabic };
    };

    await steps.critical('Navigate to the Plans Management module - the plan list loads, with one change in each status', async () => {
      await planManagementPage.openListFor(pending.payerName);
      const report = await planManagementPage.stageEdit(withdrawn.name, 'descriptionEn', EDIT.withdraw);
      expect(report.refused, report.text).toBe(false);
      await planManagementPage.expectApprovalCell(withdrawn.name, CELL.draft);
    });

    await steps.step('A plan change in Pending Approval reads "Pending Approval (بانتظار الموافقة)"', async () => {
      const labels = await readStatusLabels(pending.id);
      expect(labels.english).toContain(STATUS.pendingApproval.en);
      expect(labels.arabic).toMatch(STATUS.pendingApproval.ar);
    });

    await steps.step('A plan change in Published status reads "Published (منشور)"', async () => {
      const labels = await readStatusLabels(history.id);
      expect(labels.english).toContain(STATUS.published.en);
      expect(labels.arabic).toMatch(STATUS.published.ar);
    });

    await steps.step('A plan change in Superseded status reads "Superseded (مُستبدَل)"', async () => {
      const labels = await readStatusLabels(history.id);
      expect(labels.english).toContain(STATUS.superseded.en);
      expect(labels.arabic).toMatch(STATUS.superseded.ar);
    });

    await steps.step('A plan change in Rejected status reads "Rejected (مرفوض)"', async () => {
      const labels = await readStatusLabels(rejected.id);
      expect(labels.english).toContain(STATUS.rejected.en);
      expect(labels.arabic).toMatch(STATUS.rejected.ar);
    });

    await steps.step('A withdrawn plan change returns to Draft and reads "Draft (مسودة)"', async () => {
      const labels = await readStatusLabels(withdrawn.id);
      expect(labels.english).toContain(STATUS.withdrawn.en);
      expect(labels.arabic).toMatch(STATUS.withdrawn.ar);
    });
  });

  test(`TC-${CASE.rejectNeedsReason}: should refuse the rejection when the reason is empty and record it in full when it is one character or the maximum length`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const first = await planIn('PendingApproval');
    const second = await planIn('PendingApproval');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(first.payerName);
      expect(await planManagementPage.isListed(first.name)).toBe(true);
    });

    await steps.critical('Open the plan change in Pending Approval - its details are shown for review', async () => {
      await planApprovalsPage.open();
      expect((await planApprovalsPage.openReview(first.name)).length).toBeGreaterThan(0);
      await planApprovalsPage.closeReview();
    });

    await steps.step('Select Reject with the reason empty and confirm - the submission is blocked and the reason is required', async () => {
      dialog = await planApprovalsPage.openRejectDialog(first.name);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('Reject must stay unavailable with an empty reason');
      expect(await dialog.isReasonMarkedRequired(), 'the reason should be marked as required').toBe(true);
      await dialog.cancel();
    });

    await steps.step('Enter a single-character reason and confirm - the rejection is accepted and the reason recorded', async () => {
      const outcome = await planApprovalsPage.decideWithComment(first.name, 'reject', REASON_TEXT.minimal, REASON);
      expect(outcome.typed).toBe(REASON_TEXT.minimal);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
      await planDetailPage.open(first.id);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => row.status === STATUS.rejected.en);
      expect(`${entry?.reason ?? ''} ${await planDetailPage.versions().viewVersionText(entry?.version ?? '')}`).toContain(REASON_TEXT.minimal);
    });

    await steps.step(`On another pending change a ${REASON_TEXT.max}-character reason is accepted and recorded without truncation`, async () => {
      await planApprovalsPage.open();
      const outcome = await planApprovalsPage.decideWithComment(second.name, 'reject', REASON_TEXT.atMax, REASON);
      expect(outcome.typed, 'the full reason is kept in the field').toBe(REASON_TEXT.atMax);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
      await planDetailPage.open(second.id);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => row.status === STATUS.rejected.en);
      expect(await planDetailPage.versions().viewVersionText(entry?.version ?? ''), 'the full reason is recorded').toContain(REASON_TEXT.atMax);
    });
  });

  test(`TC-${CASE.approverOnly}: should offer approve and reject to the Approver and not to the Plan Administrator when a plan change is pending`, async ({
    planManagementPage,
    planApprovalsPage,
    nonAdminSession,
    requireBaseline,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let requestId = '';

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
      await planApprovalsPage.open();
      requestId = await planApprovalsPage.getPendingRequestId(plan.name);
      requireBaseline((await planApprovalsPage.getRowActionAvailability(plan.name, 'approve')) === 'available', 'Approve for a session holding the approver right');
    });

    await steps.step('The Plan Administrator opens the pending plan change - the change is reachable', async () => {
      await nonAdminSession.planApprovals.openHub();
      expect(await nonAdminSession.planApprovals.getOfferedTabs(), 'the approvals hub renders for the Plan Administrator').not.toEqual([]);
    });

    await steps.step('Approve and Reject are unavailable to the Plan Administrator', async () => {
      await nonAdminSession.planApprovals.expectApprovalActionsDenied();
      const answer = await nonAdminSession.planApprovals.approveRequestViaApi(requestId);
      expect(answer.status, answer.text.slice(0, 200)).toBe(FORBIDDEN_STATUS);
    });

    await steps.step('The Approver opens the same pending plan change - its details are shown', async () => {
      await planApprovalsPage.open();
      expect((await planApprovalsPage.openReview(plan.name)).length).toBeGreaterThan(0);
      await planApprovalsPage.closeReview();
    });

    await steps.step('Approve and Reject are both available and usable by the Approver', async () => {
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'approve')).toBe('available');
      expect(await planApprovalsPage.getRowActionAvailability(plan.name, 'reject')).toBe('available');
      await planApprovalsPage.approve(plan.name);
    });
  });
});
