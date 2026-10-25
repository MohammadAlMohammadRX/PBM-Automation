import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog, SaveReport } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_APPROVAL_STATE, NETWORK_TOAST } from '../../../data/networks/network.data';
import { CONFLICT, EDIT, ORIGINAL_DESCRIPTION } from '../../../data/networks/editNetwork.data';

/**
 * User story 14125: Edit existing network details.
 * The edit's maker-checker life: a private draft, sent for approval, approved
 * (published) or rejected (live untouched), protected against a concurrent
 * edit, and restricted to the roles allowed to edit or approve.
 *
 * Every case edits its own Active network, which starts with
 * ORIGINAL_DESCRIPTION so "the live network is unchanged" has a known value.
 */
test.describe('US 14125 - Edit drafts and approval', () => {
  test(`TC-${EDIT.draftPrivate.azureId}: should store a saved edit privately and leave the live network unchanged`, async ({
    networkManagementPage,
    networkIn,
    staleSession,
    toast,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Active', { descriptionEn: ORIGINAL_DESCRIPTION });
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module and open Edit - the live values are shown', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openEditForm(network.name);
      expect(await form.readField('descriptionEn')).toBe(ORIGINAL_DESCRIPTION);
    });

    await steps.step('Saving the changed description confirms a private draft', async () => {
      await form.editField('descriptionEn', EDIT.draftPrivate.description());
      const report = await form.saveEditAndReport();
      expect(report.created, report.text).toBe(true);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
    });

    await steps.step('A fresh view of the network still shows the original description', async () => {
      await staleSession.networkDetail.open(network.id);
      expect(await staleSession.networkDetail.readOverviewField('descriptionEn'), 'the live network must not change before approval').toBe(ORIGINAL_DESCRIPTION);
    });
  });

  test(`TC-${EDIT.sendForApproval.azureId}: should route the draft to the reviewer's queue when it is sent for approval`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Active', { descriptionEn: ORIGINAL_DESCRIPTION });

    await steps.critical('Navigate to the module - the network carries a private draft and offers Send for Approval', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openEditForm(network.name);
      await form.editField('descriptionEn', EDIT.sendForApproval.description());
      expect((await form.saveEditAndReport()).created).toBe(true);
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      expect(await networkManagementPage.getRowActionAvailability(network.name, 'submit-for-approval')).toBe('available');
    });

    await steps.step('Send for Approval moves the draft to Pending Approval', async () => {
      await networkManagementPage.submitForApproval(network.name);
      expect((await networkManagementPage.readRow(network.name)).approvalStatus).toContain(NETWORK_APPROVAL_STATE.pendingApproval);
    });

    await steps.step('The submitted draft is in the reviewer\'s pending queue', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });
  });

  test(`TC-${EDIT.approvePublishes.azureId}: should publish the drafted changes as the live network when the reviewer approves`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Active', { descriptionEn: ORIGINAL_DESCRIPTION });
    const description = EDIT.approvePublishes.description();
    let review: { field: string; before: string; after: string }[] = [];

    await steps.critical('Navigate to the module - a drafted change is pending approval', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openEditForm(network.name);
      await form.editField('descriptionEn', description);
      expect((await form.saveEditAndReport()).created).toBe(true);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      expect((await networkManagementPage.readRow(network.name)).approvalStatus).toContain(NETWORK_APPROVAL_STATE.pendingApproval);
    });

    await steps.step('The reviewer sees the proposed change', async () => {
      await networkApprovalsPage.open();
      review = await networkApprovalsPage.openReview(network.name);
      await networkApprovalsPage.closeReview();
      expect(review.map((row) => row.after).join(' | ')).toContain(description);
    });

    await steps.step('Approving it publishes the change', async () => {
      await networkApprovalsPage.approve(network.name);
      expect((await networkManagementPage.readRow(network.name)).approvalStatus).toContain(NETWORK_APPROVAL_STATE.published);
    });

    await steps.step('The network\'s overview now shows the drafted change', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('descriptionEn')).toBe(description);
    });
  });

  test(`TC-${EDIT.rejectKeepsLive.azureId}: should keep the live network unchanged when the reviewer rejects the draft`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Active', { descriptionEn: ORIGINAL_DESCRIPTION });

    await steps.critical('Navigate to the module - a drafted change is pending approval', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openEditForm(network.name);
      await form.editField('descriptionEn', EDIT.rejectKeepsLive.description());
      expect((await form.saveEditAndReport()).created).toBe(true);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Rejecting it marks the draft rejected', async () => {
      await networkApprovalsPage.reject(network.name);
      expect((await networkManagementPage.readRow(network.name)).approvalStatus).toContain(NETWORK_APPROVAL_STATE.rejected);
    });

    await steps.step('The live network keeps its original description', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('descriptionEn')).toBe(ORIGINAL_DESCRIPTION);
    });
  });

  test(`TC-${EDIT.concurrency.azureId}: should block the stale save when two sessions edit the same network at once`, async ({
    networkManagementPage,
    networkIn,
    staleSession,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Active', { descriptionEn: ORIGINAL_DESCRIPTION });
    let formA!: NetworkFormDialog;
    let staleSave!: SaveReport;

    await steps.critical('Navigate to the module - session A opens the network for edit', async () => {
      await networkManagementPage.openList();
      formA = await networkManagementPage.openEditForm(network.name);
      expect(await formA.readField('descriptionEn')).toBe(ORIGINAL_DESCRIPTION);
    });

    await steps.critical('Session B opens the same network and saves a change first', async () => {
      await staleSession.networks.openList();
      const formB = await staleSession.networks.openEditForm(network.name);
      await formB.editField('descriptionEn', EDIT.concurrency.sessionB());
      const report = await formB.saveEditAndReport();
      expect(report.created, `session B should save: ${report.text}`).toBe(true);
    });

    await steps.step('Session A\'s save with the stale stamp is refused as a conflict', async () => {
      await formA.editField('descriptionEn', EDIT.concurrency.sessionA());
      staleSave = await formA.saveEditAndReport();
      expect(staleSave.outcome?.status, `the stale save must be refused: ${staleSave.text}`).toBe(CONFLICT.status);
    });

    await steps.step('Session A is told the record changed and asked to reload', async () => {
      expect(staleSave.messages.join(' | ')).toMatch(CONFLICT.message);
    });
  });

  test(`TC-${EDIT.roles.azureId}: should restrict editing and approving to the roles authorised for each`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Active', { descriptionEn: ORIGINAL_DESCRIPTION });

    await steps.critical('Navigate to the module - an administrator is offered Edit', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      const offered = (await networkManagementPage.getRowActionAvailability(network.name, 'edit')) === 'available';
      requireBaseline(offered, 'the Edit action for a session holding UpdateNetwork');
      expect(offered).toBe(true);
    });

    await steps.step('A role without the edit right is not offered a usable Edit', async () => {
      const session = await shapedNonAdmin({ without: ['editNetwork'] });
      await session.networks.openList();
      await session.networks.search(network.name);
      expect(await session.networks.getRowActionAvailability(network.name, 'edit'), 'Edit must be hidden or disabled').not.toBe('available');
    });

    await steps.step('The administrator who drafted a change cannot approve it', async () => {
      const form = await networkManagementPage.openEditForm(network.name);
      await form.editField('descriptionEn', EDIT.sendForApproval.description());
      expect((await form.saveEditAndReport()).created).toBe(true);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectSelfApprovalPrevented(network.name);
    });
  });
});
