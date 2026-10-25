import { test, expect } from '../../../fixtures';
import {
  CASE,
  CHANGES,
  FORBIDDEN_STATUS,
  NO_LONGER_PENDING,
  PUBLISH_FAILED,
  REJECTION_REASON,
  RELOAD_NEEDED,
  edited,
} from '../../../data/networks/pendingChangesReview.data';

/**
 * User story 14320: Review and approve or reject pending network changes.
 * The guards: stale references to decided requests, a failing apply, a network
 * changed under a loaded request, and a user without the reviewer role.
 */
test.describe('US 14320 - Review guards', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.noLongerPending}: should approve only the pending request and refuse stale references to decided ones`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const pending = await networkIn('PendingApproval');
    const approved = await networkIn('PendingApproval');
    const rejected = await networkIn('PendingApproval');
    let approvedId = '';
    let rejectedId = '';

    await steps.critical('Navigate to the module with requests that are pending, approved and rejected', async () => {
      await networkManagementPage.openList();
      await networkApprovalsPage.open();
      approvedId = await networkApprovalsPage.getPendingRequestId(approved.name);
      rejectedId = await networkApprovalsPage.getPendingRequestId(rejected.name);
      await networkApprovalsPage.approve(approved.name);
      await networkApprovalsPage.reject(rejected.name, REJECTION_REASON);
    });

    await steps.critical('Open the queue - the pending request is listed', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(pending.name);
    });

    await steps.step('Approving the pending request succeeds', () => networkApprovalsPage.approve(pending.name));

    await steps.step('Approving the already-approved request through its stale reference is blocked', async () => {
      const answer = await networkApprovalsPage.approveRequestViaApi(approvedId);
      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(NO_LONGER_PENDING);
    });

    await steps.step('Approving the already-rejected request through its stale reference is blocked', async () => {
      const answer = await networkApprovalsPage.approveRequestViaApi(rejectedId);
      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(NO_LONGER_PENDING);
    });
  });

  test(`TC-${CASE.applyFailure}: should keep the request Pending and report the failure when the apply step fails`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('PendingApproval');
    let versionsBefore = 0;

    await steps.critical('Navigate to the module with a pending change', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      versionsBefore = (await networkDetailPage.versions().readRows()).length;
      await networkManagementPage.openList();
    });

    await steps.critical('Open the queue and select the change - its details load', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Approving while the apply call fails reports the failure', async () => {
      const attempt = await networkApprovalsPage.approveWithFailingService(network.name);
      expect(attempt.messages, 'the user should be told the publish failed').toMatch(PUBLISH_FAILED);
      expect(attempt.stillQueued, 'the request should stay open for re-action').toBe(true);
    });

    await steps.step('The request is still Pending and no partial version was created', async () => {
      await networkApprovalsPage.expectInQueue(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      expect((await networkDetailPage.versions().readRows()).length).toBe(versionsBefore);
    });
  });

  test(`TC-${CASE.modifiedSinceLoaded}: should block the approval and ask to reload when the network changed after the request was loaded`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    const proposed = edited(CHANGES.edit);

    await steps.critical('Navigate to the module with a change pending for the network', async () => {
      await networkManagementPage.proposeChange(network.name, proposed);
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('The reviewer loads the pending change - details are on screen', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('In a separate session another user edits the network - its version moves on', async () => {
      await staleSession.networks.openList();
      const report = await staleSession.networks.stageEdit(network.name, 'descriptionEn', edited(CHANGES.concurrent));
      expect(report.outcome, 'the concurrent edit should reach the server').not.toBeNull();
    });

    await steps.step('Approving the loaded request is blocked with a reload prompt and nothing is applied', async () => {
      const attempt = await networkApprovalsPage.attemptDecisionOnLoadedRow(network.name, 'approve');
      expect(attempt.answer, 'the approval should be refused').toMatch(/answered 4\d\d/);
      expect(`${attempt.answer} ${attempt.messages}`, 'the reviewer should be asked to reload').toMatch(RELOAD_NEEDED);
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('descriptionEn'), 'the loaded change must not be applied').not.toBe(proposed);
    });
  });

  test(`TC-${CASE.nonReviewer}: should refuse approve and reject with an authorization error when the user has no reviewer role`, async ({
    networkManagementPage,
    networkApprovalsPage,
    nonAdminSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('PendingApproval');
    let requestId = '';

    await steps.critical('Navigate to the module with a pending change', async () => {
      await networkManagementPage.openList();
      await networkApprovalsPage.open();
      requestId = await networkApprovalsPage.getPendingRequestId(network.name);
    });

    await steps.step('The queue offers the non-reviewer no Approve or Reject controls', async () => {
      await nonAdminSession.networkApprovals.openHub();
      await nonAdminSession.networkApprovals.expectApprovalActionsDenied();
    });

    await steps.step('A direct approve call is rejected by the server and the request stays pending', async () => {
      const answer = await nonAdminSession.networkApprovals.approveRequestViaApi(requestId);
      expect(answer.status).toBe(FORBIDDEN_STATUS);
      await networkApprovalsPage.expectInQueue(network.name);
    });
  });
});
