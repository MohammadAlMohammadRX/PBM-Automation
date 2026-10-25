import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import {
  APPROVAL_CELL,
  CASE,
  CHANGES,
  CHANGE_TYPE_FILTER,
  CHANGE_TYPE_LABEL,
  DELETION_DETAILS,
  LIFECYCLE,
  PUBLISHED_CODE,
  QUEUE_STATUS,
  REASON_LENGTH,
  REJECTED_NOTICE,
  REJECTION_REASON,
  UNATTACHED_LIVE,
  VERSION_STATUS,
  edited,
} from '../../../data/networks/pendingChangesReview.data';

/**
 * User story 14320: Review and approve or reject pending network changes.
 * The Approval Management > Network queue: what it lists, and what approving
 * or rejecting each kind of request does.
 *
 * Each request is the case's own (see the data file for how each change type
 * is staged). The reviewer is the single administrator account.
 */
test.describe('US 14320 - Pending network changes queue', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASE.allChangeTypes}: should list every pending change type with its label when the queue is reviewed`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(45 * 60_000);
    const registration = await networkIn('PendingApproval');
    const edit = await networkIn('Active');
    const activation = await networkIn('Inactive');
    const deactivation = await networkIn('Active');
    const facility = await networkIn('Active');
    const deletion = await networkIn('Pending', UNATTACHED_LIVE);

    await steps.critical('Navigate to the Network Management module and stage one request of each type', async () => {
      await networkManagementPage.proposeChange(edit.name, edited(CHANGES.edit));
      await networkManagementPage.openList();
      await networkManagementPage.stageAndSubmit(activation.name, 'activate');
      await networkManagementPage.openList();
      await networkManagementPage.stageAndSubmit(deactivation.name, 'inactivate');
      await networkManagementPage.proposeFacilityAssignment(facility);
      await networkManagementPage.proposeDeletion(deletion.name);
    });

    await steps.critical('Open the Pending Approvals queue - the list is displayed', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(registration.name);
    });

    await steps.step('Each of the six change types is present and labelled with its type', async () => {
      expect(await networkApprovalsPage.getChangeType(registration.name), 'registration').toMatch(CHANGE_TYPE_LABEL.registration);
      expect(await networkApprovalsPage.getChangeType(edit.name), 'edit').toMatch(CHANGE_TYPE_LABEL.edit);
      expect(await networkApprovalsPage.getChangeType(activation.name), 'activation').toMatch(CHANGE_TYPE_LABEL.activation);
      expect(await networkApprovalsPage.getChangeType(deactivation.name), 'deactivation').toMatch(CHANGE_TYPE_LABEL.deactivation);
      expect(await networkApprovalsPage.getChangeType(facility.name), 'facility membership change').toMatch(CHANGE_TYPE_LABEL.facility);
      expect(await networkApprovalsPage.getChangeType(deletion.name), 'deletion').toMatch(CHANGE_TYPE_LABEL.deletion);
    });

    await steps.step('Selecting a pending change opens its details with the submitted data', async () => {
      const rows = await networkApprovalsPage.openReview(edit.name);
      expect(rows.some((row) => row.after.includes(CHANGES.edit)), JSON.stringify(rows).slice(0, 300)).toBe(true);
      await networkApprovalsPage.closeReview();
    });
  });

  test(`TC-${CASE.approveRegistration}: should publish the new network and generate its code when a pending registration is approved`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('PendingApproval');

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Open the queue - the pending registration is listed', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('The request details show the submitted registration data', async () => {
      const rows = await networkApprovalsPage.openReview(network.name);
      expect(rows.some((row) => row.after.includes(network.name)), JSON.stringify(rows).slice(0, 300)).toBe(true);
      await networkApprovalsPage.closeReview();
    });

    await steps.critical('Approve - a confirmation prompt is displayed', async () => {
      const dialog = await networkApprovalsPage.openApproveDialog(network.name);
      expect(await dialog.getTitle()).not.toBe('');
      await dialog.confirm('Approve');
    });

    await steps.step('The request is approved and a version is published with a generated code', async () => {
      await networkApprovalsPage.waitForDecisionProcessed(network.name);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.published);
      expect(await networkManagementPage.readCode(network.name), 'an approved network gets its permanent code').toMatch(PUBLISHED_CODE);
    });
  });

  test(`TC-${CASE.rejectWithReason}: should store the reason, mark it Rejected and notify the requester when a change is rejected`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module with a pending change', async () => {
      await networkManagementPage.proposeChange(network.name, edited(CHANGES.edit));
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('Open the queue and select the change - its details load', async () => {
      await networkApprovalsPage.open();
      expect((await networkApprovalsPage.openReview(network.name)).length).toBeGreaterThan(0);
      await networkApprovalsPage.closeReview();
    });

    await steps.step('Reject opens a dialog with a reason field', async () => {
      const dialog = await networkApprovalsPage.openRejectDialog(network.name);
      expect(await dialog.getReasonOptions()).toContain(REJECTION_REASON);
      await dialog.cancel();
    });

    await steps.step('Rejecting with a valid reason stores it, marks the change Rejected and notifies the requester', async () => {
      await networkApprovalsPage.reject(network.name, REJECTION_REASON);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.rejected);
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v2', VERSION_STATUS.rejected);
      expect((await networkDetailPage.versions().viewVersion('v2')).reason, 'the reason stored against the request').toContain(REJECTION_REASON);
      await networkDetailPage.versions().closeVersion();
      const notices = await networkApprovalsPage.readMyNotifications();
      expect(notices.filter((n) => n.includes(network.name) && REJECTED_NOTICE.test(n)), 'a rejection notice to the requester').not.toEqual([]);
    });
  });

  test(`TC-${CASE.rejectWithoutReason}: should block the rejection and keep the request Pending when no reason is provided`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('PendingApproval');

    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Open the queue - the pending change is listed', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('With the reason left blank the rejection cannot be submitted', async () => {
      const dialog = await networkApprovalsPage.openRejectDialog(network.name);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('a rejection without a reason must be blocked');
      await dialog.cancel();
      await networkApprovalsPage.expectInQueue(network.name);
    });
  });

  test(`TC-${CASE.reasonLength}: should accept 1 and 500 characters and refuse 501 when the rejection reason is typed`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('PendingApproval');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Open the queue, select the change and click Reject - the dialog opens with a typable reason', async () => {
      await networkApprovalsPage.open();
      dialog = await networkApprovalsPage.openRejectDialog(network.name);
      expect(await dialog.hasFreeTextInput(), 'the reason should be a field the reviewer can type into').toBe(true);
    });

    await steps.step('A 1-character reason is accepted as the minimum', async () => {
      expect(await dialog.typeReasonText(REASON_LENGTH.min)).toBe(REASON_LENGTH.min);
    });

    await steps.step('A 500-character reason is accepted in full', async () => {
      expect(await dialog.typeReasonText(REASON_LENGTH.atMax)).toBe(REASON_LENGTH.atMax);
    });

    await steps.step('A 501-character reason is blocked or truncated', async () => {
      expect((await dialog.typeReasonText(REASON_LENGTH.overMax)).length).toBeLessThanOrEqual(REASON_LENGTH.max);
      await dialog.cancel();
    });
  });

  test(`TC-${CASE.facilityLifecycle}: should take a facility change from Pending through Approved to Published when it is approved`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Active');
    let facility = '';

    await steps.critical('Navigate to the module with a facility membership change pending', async () => {
      facility = await networkManagementPage.proposeFacilityAssignment(network);
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Its request shows status Pending', async () => {
      await networkApprovalsPage.open();
      expect((await networkApprovalsPage.readQueuedRow(network.name)).text).toMatch(QUEUE_STATUS);
    });

    await steps.step('Approving applies the change - the facility is settled with an Assigned On date', async () => {
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      const row = await networkDetailPage.facilities().findRow(facility.split(' — ')[0]);
      expect(row?.assignment ?? '(row absent)', 'the assignment should no longer be pending').not.toMatch(/Draft|Pending/);
      expect(row?.assignedOn ?? '', 'the Assigned On date is set at approval').toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    await steps.step('Reopened from history, the request reads Published and is read-only', async () => {
      await networkDetailPage.versions().open();
      await networkDetailPage.versions().expectVersionStatus('v2', VERSION_STATUS.published);
      const v2 = (await networkDetailPage.versions().readRows()).find((row) => row.version === 'v2');
      expect(v2?.actions ?? ['(row absent)'], 'only View is offered').toEqual(['View']);
    });
  });

  test(`TC-${CASE.activationDeactivation}: should approve activation and deactivation requests independently when filtered by change type`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const toActivate = await networkIn('Inactive');
    const toDeactivate = await networkIn('Active');

    await steps.critical('Navigate to the module with one activation and one deactivation pending', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.stageAndSubmit(toActivate.name, 'activate');
      await networkManagementPage.openList();
      await networkManagementPage.stageAndSubmit(toDeactivate.name, 'inactivate');
    });

    await steps.step('Filtering by Activation lists only activation requests', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.filterByChangeType(CHANGE_TYPE_FILTER.activation);
      const types = await networkApprovalsPage.readVisibleChangeTypes();
      expect(types.length).toBeGreaterThan(0);
      expect(types.filter((t) => !CHANGE_TYPE_LABEL.activation.test(t)), 'non-activation rows').toEqual([]);
    });

    await steps.step('Approving the activation makes the network Active', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(toActivate.name);
      expect(await networkManagementPage.readStatus(toActivate.name)).toBe(LIFECYCLE.active);
    });

    await steps.step('Filtering by Deactivation and approving makes the other network Inactive', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.filterByChangeType(CHANGE_TYPE_FILTER.deactivation);
      expect((await networkApprovalsPage.readVisibleChangeTypes()).filter((t) => !CHANGE_TYPE_LABEL.deactivation.test(t))).toEqual([]);
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(toDeactivate.name);
      expect(await networkManagementPage.readStatus(toDeactivate.name)).toBe(LIFECYCLE.inactive);
    });
  });

  test(`TC-${CASE.exploratory}: should keep the queue accurate when it is sorted, browsed and an approval is abandoned midway`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const first = await networkIn('PendingApproval');
    const second = await networkIn('PendingApproval');

    await steps.critical('Navigate to the module with several pending changes', async () => {
      await networkManagementPage.openList();
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(first.name);
    });

    await steps.step('Sorting and opening and closing detail panels keeps the queue stable', async () => {
      await networkApprovalsPage.open();
      expect(await networkApprovalsPage.sortByFirstOption()).not.toBe('');
      expect(await networkApprovalsPage.countVisibleRows()).toBeGreaterThan(0);
      for (const network of [first, second]) {
        expect((await networkApprovalsPage.openReview(network.name)).length).toBeGreaterThan(0);
        await networkApprovalsPage.closeReview();
      }
    });

    await steps.step('Leaving in the middle of an approval leaves no inconsistent state', async () => {
      await networkApprovalsPage.abandonApproval(first.name);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(first.name);
    });

    await steps.step('Back in the queue, every request shows its true current state', async () => {
      await networkApprovalsPage.expectSingleQueuedRequest(first.name);
      await networkApprovalsPage.expectSingleQueuedRequest(second.name);
    });
  });

  test(`TC-${CASE.deletionDetails}: should show the requester, target, reason and impact before a deletion request is approved`, async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', UNATTACHED_LIVE);

    await steps.critical('Navigate to the module with a deletion request pending', async () => {
      await networkManagementPage.proposeDeletion(network.name);
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Filtering by change type Deletion lists only deletion requests', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.filterByChangeType(CHANGE_TYPE_FILTER.deletion);
      expect((await networkApprovalsPage.readVisibleChangeTypes()).filter((t) => !CHANGE_TYPE_LABEL.deletion.test(t))).toEqual([]);
    });

    await steps.step('The request shows its requester, target, deletion reason and impact summary', async () => {
      await networkApprovalsPage.open();
      const row = await networkApprovalsPage.readQueuedRow(network.name);
      expect(row.requestedby ?? '', 'requester identity').not.toBe('');
      expect(row.text, 'target network').toContain(network.name);
      const review = JSON.stringify(await networkApprovalsPage.openReview(network.name));
      await networkApprovalsPage.closeReview();
      expect(review, 'a reason for the deletion').toMatch(DELETION_DETAILS.reason);
      expect(review, 'an impact summary').toMatch(DELETION_DETAILS.impact);
    });

    await steps.step('Approving the deletion applies it - the network leaves the directory', async () => {
      await networkApprovalsPage.approve(network.name);
      expect(await networkManagementPage.isListed(network.name)).toBe(false);
    });
  });
});
