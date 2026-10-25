import { test, expect } from '../../../fixtures';
import { APPROVAL_CELL, CASE, CHANGES, REASON, VERSION_STATUS, edited } from '../../../data/networks/approveRejectChange.data';

/**
 * User story 14314: Approve or reject a submitted network change.
 * What a decision does to the network and its version history.
 *
 * Every case proposes a change on its own live network (fixture `networkIn`
 * plus NetworkManagementPage.proposeChange) and decides it in Approval
 * Management > Network.
 */
test.describe('US 14314 - Decision outcomes', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.approvePublishes}: should publish the change as the live configuration when a reviewer approves it`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    const value = edited(CHANGES.first);

    await steps.critical('Navigate to the Network Management module with a change submitted for review', async () => {
      await networkManagementPage.proposeChange(network.name, value);
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('Open the pending approvals queue - the submitted change is listed', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('Approve the change - a confirmation dialog is displayed', async () => {
      const dialog = await networkApprovalsPage.openApproveDialog(network.name);
      expect(await dialog.getTitle(), 'the approval confirmation').not.toBe('');
      await dialog.confirm('Approve');
    });

    await steps.step('The change is approved and becomes the published configuration', async () => {
      await networkApprovalsPage.waitForDecisionProcessed(network.name);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.published);
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('descriptionEn')).toBe(value);
    });
  });

  test(`TC-${CASE.supersedes}: should mark the previously published version Superseded when a new change is approved`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module - the network\'s current version is published', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v1', VERSION_STATUS.published);
    });

    await steps.critical('Approve a submitted change - the new version becomes active', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.first));
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });

    await steps.step('The previous version reads Superseded and the new one Published', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v1', VERSION_STATUS.superseded);
      await networkDetailPage.versions().expectVersionStatus('v2', VERSION_STATUS.published);
    });
  });

  test(`TC-${CASE.rejectWithReason}: should mark the change Rejected and never publish it when it is rejected with a reason`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    const value = edited(CHANGES.rejected);
    let live = '';

    await steps.critical('Navigate to the module with a submitted change', async () => {
      live = String((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn ?? '');
      await networkManagementPage.proposeChange(network.name, value);
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Opening the change shows its details', async () => {
      await networkApprovalsPage.open();
      const rows = await networkApprovalsPage.openReview(network.name);
      expect(rows.some((row) => row.after.includes(value))).toBe(true);
      await networkApprovalsPage.closeReview();
    });

    await steps.step('Reject opens a dialog asking for a reason', async () => {
      const dialog = await networkApprovalsPage.openRejectDialog(network.name);
      expect(await dialog.getReasonOptions(), 'a reason should be asked for').toContain(REASON.missingCoverage);
      await dialog.cancel();
    });

    await steps.step('With a valid reason the change is set to Rejected and is not published', async () => {
      await networkApprovalsPage.reject(network.name, REASON.missingCoverage);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.rejected);
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('descriptionEn'), 'the live configuration is unchanged').toBe(live);
    });
  });

  test(`TC-${CASE.rejectWithoutReason}: should block the rejection and keep the change submitted when no reason is given`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module with a submitted change', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.rejected));
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('Open the queue and select the change - its details are shown', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Reject with the reason left empty - the reason is required', async () => {
      const dialog = await networkApprovalsPage.openRejectDialog(network.name);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('Reject must stay unavailable until a reason is given');
      await dialog.cancel();
    });

    await steps.step('The rejection is not submitted and the change remains submitted', async () => {
      await networkApprovalsPage.expectInQueue(network.name);
    });
  });

  test(`TC-${CASE.reviewerBoth}: should let a reviewer approve one change and reject another`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const toApprove = await networkIn('Active');
    const toReject = await networkIn('Active');

    await steps.critical('Navigate to the module with two submitted changes', async () => {
      await networkManagementPage.proposeChange(toApprove.name, edited(CHANGES.first));
      await networkManagementPage.proposeChange(toReject.name, edited(CHANGES.rejected));
      await networkApprovalsPage.expectInQueue(toReject.name);
    });

    await steps.critical('Open the queue - both changes are listed', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(toApprove.name);
      await networkApprovalsPage.expectInQueue(toReject.name);
    });

    await steps.step('One is approved and the other rejected with a reason, each with its status', async () => {
      await networkApprovalsPage.approve(toApprove.name);
      await networkApprovalsPage.reject(toReject.name, REASON.incorrectProviders);
      await networkManagementPage.expectApprovalCell(toApprove.name, APPROVAL_CELL.published);
      await networkManagementPage.expectApprovalCell(toReject.name, APPROVAL_CELL.rejected);
    });
  });

  test(`TC-${CASE.repeatedCycles}: should supersede the prior version on every publish when changes are approved one after another`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module - the network has a published version', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v1', VERSION_STATUS.published);
    });

    await steps.critical('A new change is submitted', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.first));
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Approving it publishes v2 and supersedes v1', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v2', VERSION_STATUS.published);
      await networkDetailPage.versions().expectVersionStatus('v1', VERSION_STATUS.superseded);
    });

    await steps.step('A second change approved supersedes v2 and keeps the whole history', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.second));
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v3', VERSION_STATUS.published);
      await networkDetailPage.versions().expectVersionStatus('v2', VERSION_STATUS.superseded);
      await networkDetailPage.versions().expectVersionStatus('v1', VERSION_STATUS.superseded);
    });
  });

  test(`TC-${CASE.rejectedTerminal}: should keep a rejected change out of the live configuration and offer no way to approve it afterwards`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    let live = '';

    await steps.critical('Navigate to the module with a submitted change', async () => {
      live = String((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn ?? '');
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.rejected));
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('Reject it with a reason - its status becomes Rejected', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.reject(network.name, REASON.duplicate);
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v2', VERSION_STATUS.rejected);
    });

    await steps.step('The network keeps using the previously published configuration', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('descriptionEn')).toBe(live);
    });

    await steps.step('Re-approving is not available - Rejected is terminal', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectNotInQueue(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      const rejected = (await networkDetailPage.versions().readRows()).find((row) => row.version === 'v2');
      expect(rejected?.actions.filter((action) => /approve/i.test(action)) ?? ['(row absent)'], 'no approve action').toEqual([]);
    });
  });

  test(`TC-${CASE.supersededDetails}: should show a superseded version's full details read-only when it is opened from the history`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    let original = '';

    await steps.critical('Navigate to the module - the network has published history', async () => {
      original = String((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn ?? '');
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v1', VERSION_STATUS.published);
    });

    await steps.critical('Approve a submitted change - the old version becomes Superseded', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.first));
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v1', VERSION_STATUS.superseded);
    });

    await steps.step('Opening the superseded entry shows the prior configuration in full', async () => {
      const details = await networkDetailPage.versions().viewVersion('v1');
      expect(details.descriptionEn, 'the prior description').toBe(original);
      expect(details.nameEn).toBe(network.name);
      expect(details.approvalStatus).toMatch(VERSION_STATUS.superseded);
      await networkDetailPage.versions().closeVersion();
    });
  });
});
