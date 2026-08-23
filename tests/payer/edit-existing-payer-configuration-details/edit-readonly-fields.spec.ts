import { test } from '../../../fixtures';
import { CHAIN_EDIT_FIELD, editedLicenseNumber } from '../../../data/payers/editPayer.data';

/**
 * User story: Edit Existing Payer Configuration Details.
 * System-generated identifiers must never be editable, and must survive an edit.
 */
test.describe('Edit Existing Payer Configuration Details - Non-editable identifiers', () => {
  test('TC-001: should keep the PayerID unchanged and non-editable when the payer is opened in edit mode', async ({
    payerManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    const idBefore = await payerManagementPage.getPayerIdFromDetailUrl(publishedPayer.nameEn);

    const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
    await form.expectFieldNotEditable('Payer ID');
    await form.closeAndDiscard();

    // Editing another field must not alter the identifier.
    await payerManagementPage.editSingleFieldAndSave(
      publishedPayer.nameEn,
      CHAIN_EDIT_FIELD.label,
      editedLicenseNumber(),
      CHAIN_EDIT_FIELD.kind,
    );
    const idAfter = await payerManagementPage.getPayerIdFromDetailUrl(publishedPayer.nameEn);
    await payerManagementPage.expectPayerIdUnchanged(idBefore, idAfter);
  });

  test('TC-002: should keep the PayerCode unchanged and non-editable when the payer is opened in edit mode', async ({
    payerManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    const codeBefore = await payerManagementPage.getPayerCode(publishedPayer.nameEn);

    const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
    await form.expectFieldNotEditable('Payer Code');
    await form.closeAndDiscard();

    // The code survives an unrelated edit untouched.
    await payerManagementPage.editSingleFieldAndSave(
      publishedPayer.nameEn,
      CHAIN_EDIT_FIELD.label,
      editedLicenseNumber(),
      CHAIN_EDIT_FIELD.kind,
    );
    await payerManagementPage.expectPayerCodeEquals(publishedPayer.nameEn, codeBefore);
  });
});
