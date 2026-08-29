import { test, expect } from '../../../fixtures';
import {
  CHAIN_EDIT_FIELD,
  DETAIL_LABELS,
  EDIT_CHANGE_TYPE,
  EDIT_REJECTION_REASON,
  editedLicenseNumber,
} from '../../../data/payers/editPayer.data';

/**
 * User story: Edit Existing Payer Configuration Details.
 * Approval outcomes for an edited payer.
 *
 * These tests edit a non-identifying field (License Number) so the payer keeps
 * a stable name across the list and the approval queue while the change is
 * carried through the maker-checker workflow.
 *
 * Every case walks a record through edit -> submit -> decide. Those transitions
 * are `critical`: each is the precondition for the next, so a failure part-way
 * records the rest as NOT EXECUTED instead of a cascade of failures that all
 * describe the same root cause.
 */
test.describe('Edit Existing Payer Configuration Details - Edit approval', () => {
  test('TC-013: should update the live payer and stamp the modification when the edit is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    const newLicense = editedLicenseNumber();
    let detail!: Awaited<ReturnType<typeof payerManagementPage.openDetails>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Edit "${CHAIN_EDIT_FIELD.label}" and save the draft`, () =>
      payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        CHAIN_EDIT_FIELD.label,
        newLicense,
        CHAIN_EDIT_FIELD.kind,
      ));

    await steps.critical('Send the edit for approval', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.step(`The queue records the change type as "${EDIT_CHANGE_TYPE}"`, () =>
      approvalManagementPage.expectChangeType(publishedPayer.nameEn, EDIT_CHANGE_TYPE));

    await steps.critical('Approve the edit as the reviewer', () =>
      approvalManagementPage.approve(publishedPayer.nameEn));

    // The live record now carries the edited value...
    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The live record is Published', () =>
      payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, 'Published'));

    await steps.step('The live record carries the edited licence number', () =>
      payerManagementPage.expectRowShowsDetails(publishedPayer.nameEn, [newLicense]));

    // ...and records who modified it and when.
    await steps.critical('Open the payer detail view', async () => {
      detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
    });

    await steps.step(`"${DETAIL_LABELS.modifiedAt}" is recorded`, async () => {
      await expect.poll(() => detail.getFieldValue(DETAIL_LABELS.modifiedAt)).not.toEqual('');
    });

    await steps.step(`"${DETAIL_LABELS.modifiedBy}" is recorded`, async () => {
      await expect.poll(() => detail.getFieldValue(DETAIL_LABELS.modifiedBy)).not.toEqual('');
    });
  });

  test('TC-014: should leave the live payer unchanged and return the draft when the edit is rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    const newLicense = editedLicenseNumber();
    let liveVersion!: Awaited<ReturnType<typeof payerManagementPage.getVersionNumber>>;
    let statusBefore!: Awaited<ReturnType<typeof payerManagementPage.getApprovalState>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // The status the live record held before the edit - rejection must restore it.
    await steps.critical('Record the live version and status before the edit', async () => {
      liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
      statusBefore = await payerManagementPage.getApprovalState(publishedPayer.nameEn);
    });

    await steps.critical(`Edit "${CHAIN_EDIT_FIELD.label}" and save the draft`, () =>
      payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        CHAIN_EDIT_FIELD.label,
        newLicense,
        CHAIN_EDIT_FIELD.kind,
      ));

    await steps.critical('Send the edit for approval', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical(`Reject the edit with "${EDIT_REJECTION_REASON}"`, () =>
      approvalManagementPage.reject(publishedPayer.nameEn, EDIT_REJECTION_REASON));

    // The live record is untouched and returns to the state it held before the
    // edit - it is NOT left sitting as a draft - and the rejected value was
    // never promoted onto the live record.
    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The live record returns to its pre-edit version and status', () =>
      payerManagementPage.expectVersionAndStatus(
        publishedPayer.nameEn,
        liveVersion,
        statusBefore,
      ));

    await steps.step('The rejected value was never promoted onto the live record', () =>
      payerManagementPage.expectRowShowsDetails(publishedPayer.nameEn, [
        publishedPayer.licenseNumber,
      ]));

    await steps.critical('Reopen the approval queue', () => approvalManagementPage.open());

    await steps.step('The rejected request is no longer queued', () =>
      approvalManagementPage.expectNotInQueue(publishedPayer.nameEn));
  });

  test('TC-015: should prevent the submitting maker from approving their own payer edit', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // The signed-in account is both the maker and holds approver rights.
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Edit "${CHAIN_EDIT_FIELD.label}" and save the draft`, () =>
      payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        CHAIN_EDIT_FIELD.label,
        editedLicenseNumber(),
        CHAIN_EDIT_FIELD.kind,
      ));

    await steps.critical('Send the edit for approval as the maker', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    // Segregation of duties: the self-submitted request must not be approvable
    // by its own submitter - excluded from their queue or the action blocked.
    await steps.critical('Open the approval queue as the same user', () =>
      approvalManagementPage.open());

    await steps.step('The maker cannot approve their own edit', () =>
      approvalManagementPage.expectSelfApprovalPrevented(publishedPayer.nameEn));
  });
});

/**
 * User story: Edit Existing Payer Configuration Details.
 * Version lifecycle: v0 draft -> v1 on first publish, and every later edit
 * proposes the next version without disturbing the live one until approved.
 *
 * The Approval Status column renders "v<N> · <Status>", where N is the version
 * of the LIVE record and Status describes the change pending on top of it.
 */
test.describe('Edit Existing Payer Configuration Details - Versioning', () => {
  test('TC-009: should start a new payer at v0 Draft and publish it as v1 when first approved', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create a new payer as a Draft', () =>
      payerManagementPage.createDraftPayer(uniquePayer));

    // Initial save: v0, Draft.
    await steps.step('The initial save is v0, Draft', () =>
      payerManagementPage.expectVersionAndStatus(uniquePayer.nameEn, 0, 'Draft'));

    // Sent for approval: still v0, now pending.
    await steps.critical('Send the new payer for approval', () =>
      payerManagementPage.sendForApproval(uniquePayer.nameEn));

    await steps.step('Still v0, now Pending Approval', () =>
      payerManagementPage.expectVersionAndStatus(uniquePayer.nameEn, 0, 'Pending Approval'));

    // Approved: the first published version is v1.
    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Approve the new payer', () =>
      approvalManagementPage.approve(uniquePayer.nameEn));

    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The first published version is v1', () =>
      payerManagementPage.expectVersionAndStatus(uniquePayer.nameEn, 1, 'Published'));
  });

  test('TC-016: should create a pending version without changing the live version when a published payer is edited', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let liveVersion!: Awaited<ReturnType<typeof payerManagementPage.getVersionNumber>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Record the live version before the edit', async () => {
      liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
    });

    await steps.critical(`Edit "${CHAIN_EDIT_FIELD.label}" and save the draft`, () =>
      payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        CHAIN_EDIT_FIELD.label,
        editedLicenseNumber(),
        CHAIN_EDIT_FIELD.kind,
      ));

    await steps.critical('Send the edit for approval', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    // The live record stays on its published version while the edit is pending.
    await steps.step('The live record stays on its published version while pending', () =>
      payerManagementPage.expectVersionAndStatus(
        publishedPayer.nameEn,
        liveVersion,
        'Pending Approval',
      ));

    await steps.step('The PayerCode is still assigned', () =>
      payerManagementPage.expectPayerCodeAssigned(publishedPayer.nameEn));
  });

  test('TC-017: should publish the pending edit as the next live version when it is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let liveVersion!: Awaited<ReturnType<typeof payerManagementPage.getVersionNumber>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Record the live version before the edit', async () => {
      liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
    });

    await steps.critical(`Edit "${CHAIN_EDIT_FIELD.label}" and save the draft`, () =>
      payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        CHAIN_EDIT_FIELD.label,
        editedLicenseNumber(),
        CHAIN_EDIT_FIELD.kind,
      ));

    await steps.critical('Send the edit for approval', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Approve the pending edit', () =>
      approvalManagementPage.approve(publishedPayer.nameEn));

    // The version counter advances by exactly one and becomes the live record.
    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The version advances by exactly one and becomes the live record', () =>
      payerManagementPage.expectVersionAndStatus(
        publishedPayer.nameEn,
        liveVersion + 1,
        'Published',
      ));
  });

  test('TC-018: should keep the live version and consume no version number when a pending edit is rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let liveVersion!: Awaited<ReturnType<typeof payerManagementPage.getVersionNumber>>;
    let statusBefore!: Awaited<ReturnType<typeof payerManagementPage.getApprovalState>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Record the live version and status before the edit', async () => {
      liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
      statusBefore = await payerManagementPage.getApprovalState(publishedPayer.nameEn);
    });

    await steps.critical(`Edit "${CHAIN_EDIT_FIELD.label}" and save the draft`, () =>
      payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        CHAIN_EDIT_FIELD.label,
        editedLicenseNumber(),
        CHAIN_EDIT_FIELD.kind,
      ));

    await steps.critical('Send the edit for approval', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Reject the pending edit', () =>
      approvalManagementPage.reject(publishedPayer.nameEn, 'Incorrect Data'));

    // No version was consumed: the live record keeps its version number and
    // returns to the published state it held before the rejected edit.
    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('No version was consumed - the live version and status are restored', () =>
      payerManagementPage.expectVersionAndStatus(
        publishedPayer.nameEn,
        liveVersion,
        statusBefore,
      ));
  });
});
