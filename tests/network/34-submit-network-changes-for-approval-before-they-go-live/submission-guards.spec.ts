import { test, expect } from '../../../fixtures';
import {
  ALREADY_PENDING,
  APPROVAL_CELL,
  CASE,
  CHANGES,
  DUPLICATE_SUBMITS,
  NOTHING_TO_SUBMIT,
  NO_CHANGES_TOAST,
  PENDING_BADGE,
  edited,
} from '../../../data/networks/submitForApproval.data';

/**
 * User story 14313: Submit network changes for approval before they go live.
 * The guards around Send for Approval - nothing to send, a no-op draft, one
 * pending change at a time, duplicate submissions, and who may decide.
 */
test.describe('US 14313 - Send for Approval guards', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.noDraftBlocked}: should block sending for approval with a clear message when the network has no draft change`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Open the network\'s detail screen - no draft indicator is shown', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getVersionBadge()).toMatch(APPROVAL_CELL.published);
    });

    await steps.step('Send for Approval is disabled, or refused if attempted', async () => {
      expect(await networkDetailPage.getActionAvailability('submit')).not.toBe('available');
      expect(await networkManagementPage.isSubmitOffered(network.name)).toBe(false);
    });

    await steps.step('A submission attempt is refused with a message that there is no draft to send', async () => {
      const answer = await networkManagementPage.submitViaApi(network.id);
      expect(answer.status, 'nothing to submit should be refused').toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(NOTHING_TO_SUBMIT);
    });

    await steps.step('The network\'s status is unchanged - no Pending Approval was created', async () => {
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.published);
    });
  });

  test(`TC-${CASE.noChangeBlocked}: should refuse to send for approval when a draft was saved without changing any value`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Open the network for editing - current values are pre-populated', async () => {
      const form = await networkManagementPage.openEditForm(network.name);
      expect(await form.readField('nameEn')).toBe(network.name);
      await form.closeAndDiscard();
    });

    await steps.step('Saving without a change creates no draft', async () => {
      const report = await networkManagementPage.saveUnchanged(network.name);
      expect(report.messages.join(' | ')).toContain(NO_CHANGES_TOAST);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.published);
    });

    await steps.step('Send for Approval is blocked because nothing changed', async () => {
      expect(await networkManagementPage.isSubmitOffered(network.name)).toBe(false);
      const answer = await networkManagementPage.submitViaApi(network.id);
      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(NOTHING_TO_SUBMIT);
    });
  });

  test(`TC-${CASE.secondPendingBlocked}: should allow only one pending change per network when a second change is sent while one is pending`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module with one change already pending approval', async () => {
      await networkManagementPage.openList();
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.address))).outcome?.status ?? 0).toBeLessThan(300);
      expect((await networkManagementPage.submitAndCapture(network.name))?.status ?? 0).toBeLessThan(300);
    });

    await steps.critical('The network shows it is currently Pending Approval', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getVersionBadge()).toMatch(PENDING_BADGE);
    });

    await steps.step('A further edit is blocked from submission', async () => {
      const report = await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.further));
      expect(report.outcome?.status ?? 0, 'the further edit should not be accepted while a change is pending').toBeGreaterThanOrEqual(400);
    });

    await steps.step('A second Send for Approval is rejected, stating only one pending change is allowed', async () => {
      const answer = await networkManagementPage.submitViaApi(network.id);
      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(ALREADY_PENDING);
    });

    await steps.step('The queue still holds exactly one request for the network', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectSingleQueuedRequest(network.name);
    });
  });

  test(`TC-${CASE.availabilityMatrix}: should enable Send for Approval only for a draft with a real change and nothing pending`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const clean = await networkIn('Active');
    const changed = await networkIn('Active');

    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('NET-C1 (no draft): Send for Approval is blocked', async () => {
      expect(await networkManagementPage.isSubmitOffered(clean.name)).toBe(false);
    });

    await steps.step('NET-C2 (draft saved, values unchanged): Send for Approval is blocked', async () => {
      await networkManagementPage.saveUnchanged(clean.name);
      expect(await networkManagementPage.isSubmitOffered(clean.name)).toBe(false);
    });

    await steps.step('NET-C3 (draft with a real change): Send for Approval is enabled and succeeds', async () => {
      expect((await networkManagementPage.stageEdit(changed.name, 'descriptionEn', edited(CHANGES.address))).outcome?.status ?? 0).toBeLessThan(300);
      expect(await networkManagementPage.isSubmitOffered(changed.name)).toBe(true);
      expect((await networkManagementPage.submitAndCapture(changed.name))?.status ?? 0).toBeLessThan(300);
      await networkManagementPage.expectApprovalCell(changed.name, APPROVAL_CELL.pending);
    });

    await steps.step('NET-C4 (already Pending Approval): Send for Approval is blocked', async () => {
      expect(await networkManagementPage.isSubmitOffered(changed.name)).toBe(false);
    });
  });

  test(`TC-${CASE.noSelfApproval}: should restrict approve and reject to an approver and prevent the submitter approving their own change`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module with a change submitted by this user', async () => {
      await networkManagementPage.openList();
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.address))).outcome?.status ?? 0).toBeLessThan(300);
      expect((await networkManagementPage.submitAndCapture(network.name))?.status ?? 0).toBeLessThan(300);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Submitter visibility: Approve/Reject are absent or disabled on the submitter\'s own request', async () => {
      await networkApprovalsPage.expectSelfApprovalPrevented(network.name);
    });

    await steps.step('Submitter API attempt: a direct approve call by the submitter is refused', async () => {
      const requestId = await networkApprovalsPage.getPendingRequestId(network.name);
      const answer = await networkApprovalsPage.approveRequestViaApi(requestId);
      expect(answer.status, 'self-approval through the API should be refused').toBeGreaterThanOrEqual(400);
    });

    await steps.step('Approver visibility: Approve and Reject are present and enabled for the approver', async () => {
      expect(await networkApprovalsPage.getRowActionAvailability(network.name, 'approve')).toBe('available');
      expect(await networkApprovalsPage.getRowActionAvailability(network.name, 'reject')).toBe('available');
    });

    await steps.step('Approver action: the approval is processed', () => networkApprovalsPage.approve(network.name));
  });

  test(`TC-${CASE.duplicateSubmits}: should create a single pending request when Send for Approval is fired twice at once`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    let answers: { status: number }[] = [];

    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('The network has a draft change ready - Send for Approval is enabled', async () => {
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.address))).outcome?.status ?? 0).toBeLessThan(300);
      expect(await networkManagementPage.isSubmitOffered(network.name)).toBe(true);
    });

    await steps.critical('Two near-simultaneous submissions are sent', async () => {
      answers = await networkManagementPage.submitConcurrently(network.id, DUPLICATE_SUBMITS);
      expect(answers).toHaveLength(DUPLICATE_SUBMITS);
    });

    await steps.step('Only one Pending Approval entry exists for the network', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectSingleQueuedRequest(network.name);
    });

    await steps.step('The duplicate submission was refused rather than queued', async () => {
      expect(answers.filter((answer) => answer.status < 300), JSON.stringify(answers)).toHaveLength(1);
    });
  });
});
