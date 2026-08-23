import { test } from '../../../fixtures';
import { EDITABLE_FIELD_CHECKLIST } from '../../../data/payers/editPayer.data';

/**
 * User story: Edit Existing Payer Configuration Details.
 * TC-008 - checklist across every editable field. Each field is edited on its
 * own so a failure identifies exactly which field cannot be saved.
 */
test.describe('Edit Existing Payer Configuration Details - Editable field checklist', () => {
  for (const field of EDITABLE_FIELD_CHECKLIST) {
    test(`TC-008: should save the change when the editable field "${field.label}" is edited on its own`, async ({
      payerManagementPage,
      publishedPayer,
    }) => {
      const newValue = field.value();

      await payerManagementPage.open();
      const codeBefore = await payerManagementPage.getPayerCode(publishedPayer.nameEn);

      await payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        field.label,
        newValue,
        field.kind,
      );

      // The edit is saved to the draft, and the identifiers are untouched. The
      // row is still located by the live (published) name, because a draft edit
      // does not change the published record.
      await payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, 'Draft');
      await payerManagementPage.expectPayerCodeEquals(publishedPayer.nameEn, codeBefore);
    });
  }
});
