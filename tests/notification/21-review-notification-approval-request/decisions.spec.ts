import { test, expect } from '../../../fixtures';
import { approveRequest, rejectRequest, type InboxNotification } from '../../../utils/notification/notificationApi';
import {
  ReviewScreen,
  approvalDefinitions,
  audienceOf,
  discardSubmittedNetworks,
  rejectionReasonId,
  submitNetwork,
  waitForRequestNotification,
  type ApprovalDefs,
  type Submission,
} from '../../../utils/notification/writerEHelpers';
import {
  ADMIN_AUDIENCE_NAME,
  CASES,
  DASHBOARD_PATH,
  DASHBOARD_URL,
  OWN_SUBMISSION_HINT,
  REJECTION_DETAILS,
  REJECTION_REASON,
  REJECT_TITLE,
  REQUIRED,
  REQUESTED_LABELS,
  REVIEWED_LABELS,
  STORY,
  SUBMISSION_APPROVED,
  SUBMISSION_REJECTED,
} from '../../../data/notification/reviewNotificationApprovalRequest.data';

/**
 * US 21009 - deciding a request from Notification Detail: Approve (and the
 * submitter's Approved notification), Reject with its required reason, the
 * self-approval block, and what a decided request shows. Requests are suite
 * network submissions; notifications come from the case's own ACTIVE
 * definitions. See data/notification/reviewNotificationApprovalRequest.data.ts.
 */
test.describe(STORY, () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test.afterEach(async ({ page }) => {
    await discardSubmittedNetworks(page);
  });

  test(`TC-${CASES.submitterNotifiedApproved.azureId}: should send the submitter an Approved notification when the reviewer approves the request`, async ({ steps, page, secondUser, suiteDefinitions, notificationBell, notificationDetail }) => {
    let defs!: ApprovalDefs;
    let sub!: Submission;

    await steps.critical('Precondition: a pending request submitted by maalmohammad and an active "Approved - Network" definition for it', async () => {
      defs = await approvalDefinitions(page, suiteDefinitions, 'network', ['approved'], [secondUser.audience()]);
      sub = await submitNetwork(secondUser.page, page);
      expect(sub.requestId).toBeTruthy();
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads as the reviewer (careconnect)', async () => {
      await notificationBell.goto(DASHBOARD_PATH);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Approve the submitter\'s pending request - "Submission approved." shows and the reviewer returns to the dashboard', async () => {
      const review = new ReviewScreen(page);
      await notificationDetail.open(sub.requestId);
      await review.viewAllChanges();
      await expect(review.approveButton()).toBeEnabled();
      const answer = await notificationDetail.approve();
      const toast = await notificationDetail.getToastMessage();
      expect(answer.status, `ApproveRequest: ${answer.text.slice(0, 200)}`).toBe(200);
      expect(toast.replace(/\s+/g, ' ')).toContain(SUBMISSION_APPROVED);
      await expect(page).toHaveURL(DASHBOARD_URL);
    });

    await steps.step('As the submitter, open the bell - a new Approved notification is listed', async () => {
      const n = await waitForRequestNotification(secondUser.page, defs.approved, sub.requestId, [sub.network.name], 120_000);
      expect(n, `no "${defs.approved.name}" notification reached the submitter`).not.toBeNull();
      await secondUser.notificationBell.goto(DASHBOARD_PATH);
      await secondUser.notificationBell.open();
      const row = (await secondUser.notificationBell.readRows()).find((r) => r.id === n?.id);
      expect(row?.type, 'the Approved notification in the submitter\'s bell').toBe(defs.approved.name);
    });
  });

  test(`TC-${CASES.reasonRequired.azureId}: should require a Rejection Reason before a rejection can be submitted`, async ({ steps, page, suiteDefinitions, notificationBell, notificationDetail }) => {
    let sub!: Submission;

    await steps.critical('Precondition: a pending request the reviewer (careconnect) may decide', async () => {
      await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [await audienceOf(page, ADMIN_AUDIENCE_NAME)]);
      sub = await submitNetwork(page, page);
      expect(sub.requestId).toBeTruthy();
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads', async () => {
      await notificationBell.goto(DASHBOARD_PATH);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Open the Notification Detail and click Reject - "Reject Submission" opens with a Rejection Reason list and a submit action', async () => {
      await notificationDetail.open(sub.requestId);
      await notificationDetail.openReject();
      await expect(notificationDetail.rejectEl('title')).toHaveText(REJECT_TITLE);
      await expect(notificationDetail.rejectEl('reasonSelect')).toBeVisible();
      await expect(notificationDetail.rejectEl('confirm')).toBeVisible();
    });

    await steps.step('Leave the Rejection Reason empty and try to submit - the submission is blocked and the reason is flagged required', async () => {
      const review = new ReviewScreen(page);
      const attempt = await review.submitRejectIfEnabled();
      expect(attempt.status, `RejectRequest was sent without a reason (answered ${attempt.status})`).toBeNull();
      await expect(notificationDetail.rejectEl('title'), 'the drawer stays open').toBeVisible();
      expect(
        await review.rejectDrawerMessages(),
        `the empty Rejection Reason should be flagged as required (Reject button disabled: ${attempt.disabled}; when enabled it was clicked and no RejectRequest left the browser) - the drawer, its inline errors and any toast read`,
      ).toMatch(REQUIRED);
    });

    await steps.step('Select a Rejection Reason and submit - the rejection proceeds', async () => {
      const answer = await notificationDetail.reject(REJECTION_REASON);
      expect(answer.status, `RejectRequest: ${answer.text.slice(0, 200)}`).toBe(200);
    });
  });

  test(`TC-${CASES.rejectConfirms.azureId}: should confirm a rejection and return the reviewer to the dashboard`, async ({ steps, page, suiteDefinitions, notificationBell, notificationDetail }) => {
    let sub!: Submission;

    await steps.critical('Precondition: a pending request the reviewer (careconnect) may decide', async () => {
      await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [await audienceOf(page, ADMIN_AUDIENCE_NAME)]);
      sub = await submitNetwork(page, page);
      expect(sub.requestId).toBeTruthy();
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads', async () => {
      await notificationBell.goto(DASHBOARD_PATH);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Open the Notification Detail, click Reject, choose a reason and submit - "Submission rejected." shows', async () => {
      await notificationDetail.open(sub.requestId);
      const answer = await notificationDetail.reject(REJECTION_REASON);
      const toast = await notificationDetail.getToastMessage();
      expect(answer.status, `RejectRequest: ${answer.text.slice(0, 200)}`).toBe(200);
      expect(toast.replace(/\s+/g, ' ')).toContain(SUBMISSION_REJECTED);
    });

    await steps.step('Wait for the message to clear - the reviewer is back on the dashboard', async () => {
      await expect(page).toHaveURL(DASHBOARD_URL, { timeout: 15_000 });
      await expect(notificationBell.bellButton()).toBeVisible();
    });
  });

  test(`TC-${CASES.noSelfApproval.azureId}: should block a reviewer without self-approval from deciding their own request`, async ({ steps, page, secondUser, suiteDefinitions }) => {
    let sub!: Submission;

    await steps.critical('Precondition: maalmohammad (may not approve its own requests) submitted the pending request', async () => {
      await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [secondUser.audience()]);
      sub = await submitNetwork(secondUser.page, page);
      expect(sub.requestId).toBeTruthy();
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads', async () => {
      await secondUser.notificationBell.goto(DASHBOARD_PATH);
      await expect(secondUser.notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Open the Notification Detail of the request the reviewer submitted - the page loads', async () => {
      await secondUser.notificationDetail.open(sub.requestId);
      await expect(secondUser.notificationDetail.el('header')).toBeVisible();
    });

    await steps.step('Check the content and the actions - the self-approval message shows and Approve / Reject are hidden', async () => {
      await expect(secondUser.notificationDetail.el('ownSubmissionHint')).toHaveText(OWN_SUBMISSION_HINT);
      expect(await secondUser.notificationDetail.hasDecisionButtons()).toEqual({ approve: false, reject: false });
    });
  });

  test(`TC-${CASES.decidedShowsOutcome.azureId}: should show the decision without Approve or Reject on an already-decided request`, async ({ steps, page, suiteDefinitions, notificationBell, notificationDetail }) => {
    let defs!: ApprovalDefs;
    let n: InboxNotification | null = null;

    await steps.critical('Precondition: a request that has already been decided (suite network submitted and rejected by careconnect)', async () => {
      defs = await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [await audienceOf(page, ADMIN_AUDIENCE_NAME)]);
      const sub = await submitNetwork(page, page);
      n = await waitForRequestNotification(page, defs.needApprove, sub.requestId, [sub.network.name]);
      const rejected = await rejectRequest(page, sub.requestId, await rejectionReasonId(page, REJECTION_REASON), REJECTION_DETAILS);
      expect(n, 'the Need to Approve notification of the request').not.toBeNull();
      expect(rejected.status, `RejectRequest: ${rejected.text.slice(0, 200)}`).toBe(200);
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads', async () => {
      await notificationBell.goto(DASHBOARD_PATH);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Open the Notification Detail of the decided request - Reviewed By, Reviewed On and Reason are shown', async () => {
      await notificationDetail.open(n?.relatedEntityId ?? '');
      const shown = await notificationDetail.text('root');
      expect(shown).toContain(REVIEWED_LABELS.by);
      expect(shown).toContain(REVIEWED_LABELS.on);
      expect(shown).toContain(REVIEWED_LABELS.reason);
      expect(shown).toContain(REJECTION_REASON);
    });

    await steps.step('Look for Approve and Reject - neither is shown', async () => {
      expect(await notificationDetail.hasDecisionButtons()).toEqual({ approve: false, reject: false });
    });
  });

  test(`TC-${CASES.fieldsPerState.azureId}: should show the required fields on Notification Detail for pending, approved and rejected requests`, async ({ steps, page, suiteDefinitions, notificationBell, notificationDetail }) => {
    let pending!: Submission;
    let approved!: Submission;
    let rejected!: Submission;

    await steps.critical('Precondition: three suite requests - one left pending, one approved, one rejected', async () => {
      await approvalDefinitions(page, suiteDefinitions, 'network', ['needApprove'], [await audienceOf(page, ADMIN_AUDIENCE_NAME)]);
      pending = await submitNetwork(page, page);
      approved = await submitNetwork(page, page);
      rejected = await submitNetwork(page, page);
      const a = await approveRequest(page, approved.requestId);
      const r = await rejectRequest(page, rejected.requestId, await rejectionReasonId(page, REJECTION_REASON), REJECTION_DETAILS);
      expect([a.status, r.status], `ApproveRequest ${a.text.slice(0, 120)} / RejectRequest ${r.text.slice(0, 120)}`).toEqual([200, 200]);
    });

    await steps.step('Navigate to the Notification Center Management module - the dashboard loads', async () => {
      await notificationBell.goto(DASHBOARD_PATH);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Open the pending request - the Notification message, Requested By, Requested On and Changes are shown', async () => {
      await notificationDetail.open(pending.requestId);
      expect(await notificationDetail.text('message'), 'the Notification message').not.toBe('');
      expect(await notificationDetail.text('requestedBy'), REQUESTED_LABELS.by).not.toBe('');
      expect(await notificationDetail.text('requestedOn'), REQUESTED_LABELS.on).not.toBe('');
      await expect(notificationDetail.el('changesTitle')).toBeVisible();
      expect(Object.keys(await notificationDetail.readDiff()).length, 'Changes rows').toBeGreaterThan(0);
    });

    await steps.step('Open the approved request - Reviewed By and Reviewed On are shown as well', async () => {
      await notificationDetail.open(approved.requestId);
      const shown = await notificationDetail.text('root');
      expect(await notificationDetail.text('requestedBy')).not.toBe('');
      expect(shown).toContain(REVIEWED_LABELS.by);
      expect(shown).toContain(REVIEWED_LABELS.on);
    });

    await steps.step('Open the rejected request - the Reason is shown as well', async () => {
      await notificationDetail.open(rejected.requestId);
      const shown = await notificationDetail.text('root');
      expect(shown).toContain(REVIEWED_LABELS.by);
      expect(shown).toContain(REVIEWED_LABELS.reason);
      expect(shown).toContain(REJECTION_REASON);
    });
  });
});
