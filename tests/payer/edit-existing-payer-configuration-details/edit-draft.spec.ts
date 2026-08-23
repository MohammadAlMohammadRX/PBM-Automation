import { test } from '../../../fixtures';
import { editedName } from '../../../data/payers/editPayer.data';

/**
 * User story: Edit Existing Payer Configuration Details.
 * Draft lifecycle: an edit is private until it is sent for approval.
 *
 * Note: while an edit is only a draft the list keeps showing the LIVE values,
 * so the payer is still located by its original (published) name.
 */
test.describe('Edit Existing Payer Configuration Details - Draft lifecycle', () => {
  test('TC-007: should discard the change when the user leaves an in-progress edit without saving', async ({
    payerManagementPage,
    publishedPayer,
  }) => {
    const temporaryName = `${publishedPayer.nameEn} Temp Unsaved Name`;

    await payerManagementPage.open();
    const versionBefore = await payerManagementPage.getVersionLabel(publishedPayer.nameEn);
    const codeBefore = await payerManagementPage.getPayerCode(publishedPayer.nameEn);

    const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
    await form.setFieldValue('Payer Name', temporaryName, 'text');

    // Cancel / discard the edit instead of saving it.
    await form.closeAndDiscard();
    await payerManagementPage.navigateAwayAndReturn();

    // Re-check the payer: nothing at all changed on the record.
    await payerManagementPage.expectRowNotVisible(temporaryName);
    await payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, versionBefore);
    await payerManagementPage.expectPayerCodeEquals(publishedPayer.nameEn, codeBefore);
  });

  test('TC-010: should save the edit to a private draft when an editable field is changed', async ({
    payerManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    const liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);

    await payerManagementPage.renamePayer(
      publishedPayer.nameEn,
      editedName(publishedPayer.nameEn),
    );

    // The change lands in a private draft on top of the unchanged live version.
    await payerManagementPage.expectVersionAndStatus(publishedPayer.nameEn, liveVersion, 'Draft');
  });

  test('TC-011: should leave the live payer untouched while the edit is only saved as a draft', async ({
    payerManagementPage,
    publishedPayer,
  }) => {
    const newName = editedName(publishedPayer.nameEn);

    await payerManagementPage.open();
    const liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
    const liveCode = await payerManagementPage.getPayerCode(publishedPayer.nameEn);

    await payerManagementPage.renamePayer(publishedPayer.nameEn, newName);

    // The published record still shows its original name, version and code -
    // the draft change is not visible on the system-of-record.
    await payerManagementPage.expectVersionAndStatus(publishedPayer.nameEn, liveVersion, 'Draft');
    await payerManagementPage.expectPayerCodeEquals(publishedPayer.nameEn, liveCode);
    await payerManagementPage.expectLifecycleStatus(publishedPayer.nameEn, 'Active');
    await payerManagementPage.expectRowNotVisible(newName);
  });

  test('TC-012: should move the edited draft to Pending Approval when it is sent for approval', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    await payerManagementPage.renamePayer(
      publishedPayer.nameEn,
      editedName(publishedPayer.nameEn),
    );
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);

    await payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, 'Pending Approval');
    await approvalManagementPage.open();
    await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    await approvalManagementPage.expectActionsAvailable(publishedPayer.nameEn);
  });
});
