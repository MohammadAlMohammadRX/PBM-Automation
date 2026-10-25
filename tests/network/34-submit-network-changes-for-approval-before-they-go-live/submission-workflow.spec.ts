import { test, expect } from '../../../fixtures';
import {
  APPROVAL_CELL,
  CASE,
  CHANGES,
  CHANGE_TYPE,
  DISCARD_ACTION,
  REJECTION_REASON,
  SAVED_TOAST,
  UNATTACHED_LIVE,
  edited,
} from '../../../data/networks/submitForApproval.data';

/**
 * User story 14313: Submit network changes for approval before they go live.
 * The happy and unhappy paths of the maker-checker cycle on a LIVE network:
 * save a draft, send it, approve or reject it, discard it, delete through it.
 *
 * Each case builds its own live network (fixture `networkIn`); the lifecycle
 * job makes it Active within a couple of minutes, hence the longer timeouts.
 */
test.describe('US 14313 - Submitting network changes for approval', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.saveAndSend}: should move the network to Pending Approval when a saved draft change is sent for approval`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Open the network for editing - its live values load', async () => {
      const form = await networkManagementPage.openEditForm(network.name);
      expect(await form.readField('nameEn')).toBe(network.name);
      await form.closeAndDiscard();
    });

    await steps.critical('Change a field and save - the change is a draft and the network shows a Draft indicator', async () => {
      const report = await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.address));
      expect(report.outcome?.status ?? 0).toBeLessThan(300);
      expect(report.messages.join(' | ')).toContain(SAVED_TOAST);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.draft);
    });

    await steps.critical('Send for Approval - the request is submitted', async () => {
      const outcome = await networkManagementPage.submitAndCapture(network.name);
      expect(outcome?.status ?? 0, outcome?.text.slice(0, 200)).toBeLessThan(300);
    });

    await steps.step('The status reads Pending Approval and the change is no longer directly editable', async () => {
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.pending);
      await networkManagementPage.expectRowActionUnavailable(network.name, 'edit');
    });
  });

  test(`TC-${CASE.approveTakesEffect}: should apply the new values to the live network when a reviewer approves the pending change`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    const value = edited(CHANGES.address);
    let before = '';

    await steps.critical('Navigate to the module with a change of the network pending approval', async () => {
      await networkManagementPage.openList();
      before = String((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn ?? '');
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', value)).outcome?.status ?? 0).toBeLessThan(300);
      expect((await networkManagementPage.submitAndCapture(network.name))?.status ?? 0).toBeLessThan(300);
    });

    await steps.critical('The reviewer opens the queue - the pending change is listed', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('The change details show the proposed value beside the live one', async () => {
      const rows = await networkApprovalsPage.openReview(network.name);
      expect(rows.some((row) => row.after.includes(value) && row.before.includes(before)), JSON.stringify(rows).slice(0, 400)).toBe(true);
      await networkApprovalsPage.closeReview();
    });

    await steps.critical('Approve - the decision is processed', () => networkApprovalsPage.approve(network.name));

    await steps.step('The detail screen shows the approved values and no pending state', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('descriptionEn')).toBe(value);
      expect(await networkDetailPage.getVersionBadge()).toMatch(APPROVAL_CELL.published);
    });
  });

  test(`TC-${CASE.rejectKeepsLive}: should leave the live data unchanged and keep the draft for correction when the reviewer rejects the change`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    const value = edited(CHANGES.address);
    let before = '';

    await steps.critical('Navigate to the module with a change pending approval', async () => {
      await networkManagementPage.openList();
      before = String((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn ?? '');
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', value)).outcome?.status ?? 0).toBeLessThan(300);
      expect((await networkManagementPage.submitAndCapture(network.name))?.status ?? 0).toBeLessThan(300);
    });

    await steps.critical('The reviewer opens the queue - the pending change is listed', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('Reject with a reason - the rejection is submitted', () =>
      networkApprovalsPage.reject(network.name, REJECTION_REASON));

    await steps.step('The network\'s status leaves Pending Approval for Rejected / Draft', async () => {
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.afterRejection);
    });

    await steps.step('The live record keeps its original values and the rejected edit stays in the draft', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('descriptionEn'), 'live data unaltered').toBe(before);
      const form = await networkManagementPage.reopenEditForm(network.name);
      expect(await form.readField('descriptionEn'), 'the rejected edit should be retained in the draft').toBe(value);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${CASE.editWithdraws}: should withdraw the pending request and return to Draft when a further edit is saved`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module with a change pending approval', async () => {
      await networkManagementPage.openList();
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.address))).outcome?.status ?? 0).toBeLessThan(300);
      expect((await networkManagementPage.submitAndCapture(network.name))?.status ?? 0).toBeLessThan(300);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.pending);
    });

    await steps.step('An additional field is changed and saved', async () => {
      const report = await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.contactPhone));
      expect(report.outcome?.status ?? 0, report.outcome?.text.slice(0, 200)).toBeLessThan(300);
    });

    await steps.step('The pending request is withdrawn and the network reverts to Draft', async () => {
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.draft);
    });

    await steps.step('The reviewer\'s queue no longer lists the withdrawn request', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectNotInQueue(network.name);
    });
  });

  test(`TC-${CASE.deleteWithdraws}: should withdraw the pending change when the network is deleted while it awaits approval`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', UNATTACHED_LIVE);

    await steps.critical('Navigate to the module with the network shown as Pending Approval', async () => {
      await networkManagementPage.openList();
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.address))).outcome?.status ?? 0).toBeLessThan(300);
      expect((await networkManagementPage.submitAndCapture(network.name))?.status ?? 0).toBeLessThan(300);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.pending);
    });

    await steps.critical('Delete the network and confirm - the deletion is submitted', async () => {
      const outcome = await networkManagementPage.deleteNetwork(network.name);
      expect(outcome?.status ?? 0, outcome?.text.slice(0, 200)).toBeLessThan(300);
    });

    await steps.step('The reviewer\'s queue no longer holds the update request', async () => {
      await networkApprovalsPage.open();
      expect(await networkApprovalsPage.getQueuedChangeTypes(network.name)).not.toContain(CHANGE_TYPE.update);
    });

    await steps.step('The network shows a pending deletion rather than disappearing at once', async () => {
      expect(await networkManagementPage.isListed(network.name), 'deletion of a live network is staged, not immediate').toBe(true);
    });
  });

  test(`TC-${CASE.discardDraft}: should restore the last live values when an unsent draft is discarded`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    let before = '';

    await steps.critical('Navigate to the module with an unsent draft change on the network', async () => {
      await networkManagementPage.openList();
      before = String((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn ?? '');
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.discarded))).outcome?.status ?? 0).toBeLessThan(300);
    });

    await steps.critical('The network shows its Draft indicator with the uncommitted change', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getVersionBadge()).toMatch(APPROVAL_CELL.draft);
    });

    await steps.critical('Discard Draft asks for confirmation', async () => {
      const prompt = await networkDetailPage.clickHeaderActionMatching(DISCARD_ACTION);
      expect(await prompt.getTitle()).not.toBe('');
      await prompt.confirm();
    });

    await steps.step('The network shows only its last live values, with no Draft indicator', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('descriptionEn')).toBe(before);
      expect(await networkDetailPage.getVersionBadge()).toMatch(APPROVAL_CELL.published);
    });
  });

  test(`TC-${CASE.deletionNeedsApproval}: should only remove a live network once its deletion request is approved`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', UNATTACHED_LIVE);

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Delete is triggered - a deletion draft is created instead of an immediate removal', async () => {
      const outcome = await networkManagementPage.deleteNetwork(network.name);
      expect(outcome?.status ?? 0, outcome?.text.slice(0, 200)).toBeLessThan(300);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.draft);
    });

    await steps.critical('The network is still listed, flagged with its draft deletion', async () => {
      expect(await networkManagementPage.isListed(network.name)).toBe(true);
    });

    await steps.critical('Send for Approval - a deletion request goes to Pending Approval', async () => {
      expect((await networkManagementPage.submitAndCapture(network.name))?.status ?? 0).toBeLessThan(300);
      await networkApprovalsPage.open();
      expect(await networkApprovalsPage.getChangeType(network.name)).toBe(CHANGE_TYPE.delete);
    });

    await steps.step('Approving the deletion removes the network from the live directory', async () => {
      await networkApprovalsPage.approve(network.name);
      expect(await networkManagementPage.isListed(network.name)).toBe(false);
    });
  });

  test(`TC-${CASE.overlappingEditDelete}: should keep the queue consistent when a delete is attempted while an update awaits approval`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', UNATTACHED_LIVE);

    await steps.critical('Navigate to the module with an update pending approval', async () => {
      await networkManagementPage.openList();
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.address))).outcome?.status ?? 0).toBeLessThan(300);
      expect((await networkManagementPage.submitAndCapture(network.name))?.status ?? 0).toBeLessThan(300);
    });

    await steps.step('Delete is attempted on the same network - the application answers it', async () => {
      const outcome = await networkManagementPage.deleteNetwork(network.name);
      expect(outcome, 'the delete should reach the server').not.toBeNull();
    });

    await steps.step('The update is not left pending alongside a deletion', async () => {
      await networkApprovalsPage.open();
      const types = await networkApprovalsPage.getQueuedChangeTypes(network.name);
      expect(types.includes(CHANGE_TYPE.update) && types.includes(CHANGE_TYPE.delete), `queued: ${types.join(', ')}`).toBe(false);
    });

    await steps.step('The queue holds no duplicate or orphaned request for the network', async () => {
      expect((await networkApprovalsPage.getQueuedChangeTypes(network.name)).length).toBeLessThanOrEqual(1);
    });

    await steps.step('The request that remains is approved against the current state without error', async () => {
      await networkManagementPage.submitViaApi(network.id);
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });
  });
});
