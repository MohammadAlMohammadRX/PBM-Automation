import { test, expect } from '../../../fixtures';
import { PERMANENT_PLAN_CODE } from '../../../data/plans/plan.data';
import {
  CASE,
  CELL,
  EDIT,
  EDITING_ACTION,
  NOT_LIVE,
  REASON,
  REASON_TEXT,
  STATUS,
} from '../../../data/plans/planChangeStatuses.data';
import { LIFECYCLE, LIFECYCLE_WAIT_MS } from '../../../data/plans/approvePendingPlanVersion.data';

/**
 * User story 14337: Pending Approval, Published, Superseded, Rejected and
 * Withdrawn statuses for plan changes - how a change moves between them.
 *
 * Statuses are read in each plan's Version History; see the data file for how
 * each one is reached in this application.
 */
test.describe('US 14337 - Plan change status transitions', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.sendToPending}: should move the plan change to Pending Approval when the Plan Administrator sends it for approval`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the draft plan change - it opens for editing', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getActionAvailability('edit'), 'the draft should be editable').toBe('available');
    });

    await steps.critical('Select Send for Approval - the change is submitted for review', async () => {
      await planManagementPage.submitForApproval(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, CELL.pendingApproval);
    });

    await steps.step('The plan change status shows Pending Approval', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      expect((await planDetailPage.versions().readRows()).map((row) => row.status)).toContain(STATUS.pendingApproval.en);
    });
  });

  test(`TC-${CASE.approvePublishes}: should publish the change as the live configuration when an approver approves it`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the plan change in Pending Approval - its details are shown for review', async () => {
      await planApprovalsPage.open();
      expect((await planApprovalsPage.openReview(plan.name)).length, 'the review should list the change').toBeGreaterThan(0);
      await planApprovalsPage.closeReview();
    });

    await steps.critical('Approve the change - the approval is processed', async () => {
      await planApprovalsPage.approve(plan.name);
    });

    await steps.step('The change shows Published and is the live configuration', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      expect((await planDetailPage.versions().readRows()).map((row) => row.status)).toContain(STATUS.published.en);
      await planDetailPage.expectStatusEventually(LIFECYCLE.active, LIFECYCLE_WAIT_MS);
    });
  });

  test(`TC-${CASE.approveSupersedes}: should retire the previously published version as Superseded when a newer change is approved`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingChange');
    let prior = '';

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Confirm the plan\'s currently published version - it shows Published', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      prior = (await planDetailPage.versions().readRows()).find((row) => row.status === STATUS.published.en)?.version ?? '';
      expect(prior, 'a Published version before the new change is decided').not.toBe('');
    });

    await steps.critical('Open the new pending change for the plan and approve it - the approval is processed', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
    });

    await steps.step('The new version shows Published and the previously live one Superseded, kept as history', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      await planDetailPage.versions().expectVersionStatus(prior, STATUS.superseded.en);
      const newest = (await planDetailPage.versions().readRows())[0];
      expect(newest?.status, 'the newest version').toBe(STATUS.published.en);
      expect(newest?.version, 'a new version, not the old one').not.toBe(prior);
    });
  });

  test(`TC-${CASE.rejectRecordsReason}: should mark the change Rejected with its reason and never publish it when a reviewer rejects it`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the plan change in Pending Approval - its details are shown for review', async () => {
      await planApprovalsPage.open();
      expect((await planApprovalsPage.openReview(plan.name)).length).toBeGreaterThan(0);
      await planApprovalsPage.closeReview();
    });

    await steps.step('Select Reject without a reason - the rejection is blocked until a reason is given', async () => {
      const dialog = await planApprovalsPage.openRejectDialog(plan.name);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('Reject must stay unavailable without a reason');
      await dialog.cancel();
    });

    await steps.critical('Enter a rejection reason and confirm - the rejection is processed', async () => {
      const outcome = await planApprovalsPage.decideWithComment(plan.name, 'reject', REASON_TEXT.regulatoryCap, REASON);
      expect(outcome.stillQueued, outcome.answer).toBe(false);
    });

    await steps.step('The change shows Rejected with its reason recorded, and it never went live', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const entry = (await planDetailPage.versions().readRows()).find((row) => row.status === STATUS.rejected.en);
      expect(entry, 'a Rejected version').toBeDefined();
      expect(`${entry?.reason ?? ''} ${await planDetailPage.versions().viewVersionText(entry?.version ?? '')}`, 'the reason recorded').toContain(REASON_TEXT.regulatoryCap);
      expect(await planManagementPage.readStatus(plan.name), 'never live').toBe(NOT_LIVE);
      expect(await planManagementPage.readCode(plan.name), 'never published, so no permanent code').not.toMatch(PERMANENT_PLAN_CODE);
    });
  });

  test(`TC-${CASE.sendWithdrawResend}: should end in one consistent state when a change is sent, withdrawn, re-sent and approved`, async ({
    planManagementPage,
    planApprovalsPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Send the plan change for approval - it becomes Pending Approval', async () => {
      await planManagementPage.submitForApproval(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, CELL.pendingApproval);
    });

    await steps.critical('Immediately withdraw the change - it returns to Draft', async () => {
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', EDIT.withdraw);
      expect(report.refused, report.text).toBe(false);
      await planManagementPage.expectApprovalCell(plan.name, CELL.draft);
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      expect((await planDetailPage.versions().readRows()).map((row) => row.status)).toContain(STATUS.withdrawn.en);
    });

    await steps.critical('Send the same change for approval again - it is Pending Approval again', async () => {
      await planManagementPage.submitForApproval(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, CELL.pendingApproval);
    });

    await steps.step('The approver approves it - it is Published and any prior published version is Superseded', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      const statuses = (await planDetailPage.versions().readRows()).map((row) => row.status);
      expect(statuses.filter((status) => status === STATUS.published.en).length, `one Published version (${statuses.join(', ')})`).toBe(1);
      expect(statuses.filter((status) => status === STATUS.pendingApproval.en), 'nothing left pending').toEqual([]);
    });
  });

  test(`TC-${CASE.supersededViewable}: should keep a superseded version viewable read-only in the history when a newer version has been published`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const plan = await planIn('Inactive');
    let superseded = '';

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan and view its version history - the history list loads', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.versions().open();
      expect((await planDetailPage.versions().readRows()).length).toBeGreaterThan(1);
    });

    await steps.critical('Locate the Superseded version - it is listed with its status and date', async () => {
      const row = (await planDetailPage.versions().readRows()).find((r) => r.status === STATUS.superseded.en);
      expect(row, 'a Superseded version in the history').toBeDefined();
      expect(`${row?.reviewedOn ?? ''}${row?.requestedOn ?? ''}`, 'the superseded version carries its dates').not.toBe('');
      superseded = row?.version ?? '';
    });

    await steps.step('Open the Superseded version - its details open in a read-only, historical view', async () => {
      const text = await planDetailPage.versions().viewVersionText(superseded);
      expect(text, 'the historical details').toContain(plan.name);
      expect(text).toContain(STATUS.superseded.en);
      const row = (await planDetailPage.versions().readRows()).find((r) => r.version === superseded);
      expect(row?.actions.filter((action) => EDITING_ACTION.test(action)) ?? ['(row absent)'], 'nothing to change it with').toEqual([]);
    });
  });
});
