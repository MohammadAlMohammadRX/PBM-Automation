import { test } from '../../../fixtures';
import {
  editedName,
  CHAIN_EDIT_FIELD,
  editedLicenseNumber,
  INVALID_EDIT_VALUES,
  NAME_LENGTH_BOUNDARY_CASES,
  payerNameOfLength,
  EDITABLE_FIELD_CHECKLIST,
} from '../../../data/payers/editPayer.data';
import { VALIDATION_MESSAGES } from '../../../data/payers/payer.data';

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

/**
 * User story: Edit Existing Payer Configuration Details.
 * Edit-time validation reuses the same rules enforced during creation.
 *
 * Validation is applied at FIELD level: an empty required field or a badly
 * formatted value keeps the wizard on the current step, so the record can never
 * reach a saveable state with invalid data.
 */
test.describe('Edit Existing Payer Configuration Details - Validation', () => {
  test('TC-003: should keep the wizard on the same step and show a required-field error when a mandatory field is cleared', async ({
    payerManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);

    await form.clearField('Payer Name');
    await form.attemptNext();

    // Field-level validation blocks progress to the next step.
    await form.expectFieldRequired('Payer Name', VALIDATION_MESSAGES.required);
    await form.expectActiveStep('Basic Information');
    await form.closeAndDiscard();
  });

  test('TC-004: should keep the wizard on the same step and show a format error when an edited field is invalid', async ({
    payerManagementPage,
    publishedPayer,
  }) => {
    await payerManagementPage.open();
    const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);

    await form.setFieldValue('Email Address', INVALID_EDIT_VALUES.email, 'text');
    await form.attemptNext();

    // The invalid value is rejected and never persisted to the draft.
    await form.expectFieldError('Email Address', VALIDATION_MESSAGES.invalidEmail);
    await form.expectActiveStep('Contact Information');
    await form.closeAndDiscard();
  });

  // TC-005: max-length boundary - exactly the limit, and one character over.
  for (const boundary of NAME_LENGTH_BOUNDARY_CASES) {
    test(`TC-005: should ${boundary.expectAccepted ? 'accept' : 'reject'} the edit when Payer Name is ${boundary.label}`, async ({
      payerManagementPage,
      publishedPayer,
    }) => {
      const candidateName = payerNameOfLength(boundary.length);

      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue('Payer Name', candidateName, 'text');
      await form.saveFromAnyStep();

      await payerManagementPage.expectNameLengthBoundaryOutcome(
        form,
        publishedPayer.nameEn,
        candidateName,
        boundary.expectAccepted,
      );
    });
  }
});

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
