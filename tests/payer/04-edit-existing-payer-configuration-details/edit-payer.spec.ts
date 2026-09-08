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

type EditForm = Awaited<ReturnType<PayerManagement['openEditForm']>>;
type PayerManagement = import('../../../pages/payer/PayerManagementPage').PayerManagementPage;

/**
 * User story: Edit Existing Payer Configuration Details.
 * Draft lifecycle: an edit is private until it is sent for approval.
 *
 * Note: while an edit is only a draft the list keeps showing the LIVE values,
 * so the payer is still located by its original (published) name.
 *
 * Steps are recorded through the `steps` fixture. Reading a baseline value and
 * performing the edit are `critical` - a comparison with nothing to compare
 * against, or an assertion about an edit that never happened, would report a
 * failure that says nothing about the application.
 */
test.describe('Edit Existing Payer Configuration Details - Draft lifecycle', () => {
  test('TC-007: should discard the change when the user leaves an in-progress edit without saving', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    const temporaryName = `${publishedPayer.nameEn} Temp Unsaved Name`;
    let versionBefore!: Awaited<ReturnType<typeof payerManagementPage.getVersionLabel>>;
    let codeBefore!: Awaited<ReturnType<typeof payerManagementPage.getPayerCode>>;
    let form!: EditForm;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Record the version and PayerCode before the edit', async () => {
      versionBefore = await payerManagementPage.getVersionLabel(publishedPayer.nameEn);
      codeBefore = await payerManagementPage.getPayerCode(publishedPayer.nameEn);
    });

    await steps.critical('Open the payer for editing', async () => {
      form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
    });

    await steps.critical('Type a temporary Payer Name without saving', () =>
      form.setFieldValue('Payer Name', temporaryName, 'text'));

    // Cancel / discard the edit instead of saving it.
    await steps.critical('Discard the edit instead of saving it', () => form.closeAndDiscard());

    await steps.critical('Navigate away from the module and return', () =>
      payerManagementPage.navigateAwayAndReturn());

    // Re-check the payer: nothing at all changed on the record.
    await steps.step('The unsaved name never appears in the list', () =>
      payerManagementPage.expectRowNotVisible(temporaryName));

    await steps.step('The version is unchanged', () =>
      payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, versionBefore));

    await steps.step('The PayerCode is unchanged', () =>
      payerManagementPage.expectPayerCodeEquals(publishedPayer.nameEn, codeBefore));
  });

  test('TC-010: should save the edit to a private draft when an editable field is changed', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let liveVersion!: Awaited<ReturnType<typeof payerManagementPage.getVersionNumber>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Record the live version before the edit', async () => {
      liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
    });

    await steps.critical('Rename the payer and save the edit', () =>
      payerManagementPage.renamePayer(publishedPayer.nameEn, editedName(publishedPayer.nameEn)));

    // The change lands in a private draft on top of the unchanged live version.
    await steps.step('The change lands in a Draft on top of the unchanged live version', () =>
      payerManagementPage.expectVersionAndStatus(publishedPayer.nameEn, liveVersion, 'Draft'));
  });

  test('TC-011: should leave the live payer untouched while the edit is only saved as a draft', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    const newName = editedName(publishedPayer.nameEn);
    let liveVersion!: Awaited<ReturnType<typeof payerManagementPage.getVersionNumber>>;
    let liveCode!: Awaited<ReturnType<typeof payerManagementPage.getPayerCode>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Record the live version and PayerCode before the edit', async () => {
      liveVersion = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
      liveCode = await payerManagementPage.getPayerCode(publishedPayer.nameEn);
    });

    await steps.critical('Rename the payer and save the edit as a draft', () =>
      payerManagementPage.renamePayer(publishedPayer.nameEn, newName));

    // The published record still shows its original name, version and code -
    // the draft change is not visible on the system-of-record. Four independent
    // facts about the live record, each reported on its own.
    await steps.step('The live record keeps its version, carrying a Draft change', () =>
      payerManagementPage.expectVersionAndStatus(publishedPayer.nameEn, liveVersion, 'Draft'));

    await steps.step('The PayerCode is unchanged', () =>
      payerManagementPage.expectPayerCodeEquals(publishedPayer.nameEn, liveCode));

    await steps.step('The lifecycle status is still Active', () =>
      payerManagementPage.expectLifecycleStatus(publishedPayer.nameEn, 'Active'));

    await steps.step('The edited name is not visible on the published record', () =>
      payerManagementPage.expectRowNotVisible(newName));
  });

  test('TC-012: should move the edited draft to Pending Approval when it is sent for approval', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Rename the payer and save the edit as a draft', () =>
      payerManagementPage.renamePayer(publishedPayer.nameEn, editedName(publishedPayer.nameEn)));

    await steps.critical('Send the edit for approval', () =>
      payerManagementPage.sendForApproval(publishedPayer.nameEn));

    await steps.step('The approval status becomes Pending Approval', () =>
      payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        'Pending Approval',
      ));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.step('The edit appears in the approval queue', () =>
      approvalManagementPage.expectInQueue(publishedPayer.nameEn));

    await steps.step('Approve and Reject controls are available to the reviewer', () =>
      approvalManagementPage.expectActionsAvailable(publishedPayer.nameEn));
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
    steps,
  }) => {
    let idBefore!: Awaited<ReturnType<typeof payerManagementPage.getPayerIdFromDetailUrl>>;
    let form!: EditForm;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Read the PayerID before the edit', async () => {
      idBefore = await payerManagementPage.getPayerIdFromDetailUrl(publishedPayer.nameEn);
    });

    await steps.critical('Open the payer in edit mode', async () => {
      form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
    });

    await steps.step('"Payer ID" is not editable', () => form.expectFieldNotEditable('Payer ID'));

    await steps.critical('Close the form, discarding', () => form.closeAndDiscard());

    // Editing another field must not alter the identifier.
    await steps.critical(`Edit the unrelated "${CHAIN_EDIT_FIELD.label}" field and save`, () =>
      payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        CHAIN_EDIT_FIELD.label,
        editedLicenseNumber(),
        CHAIN_EDIT_FIELD.kind,
      ));

    await steps.step('The PayerID is unchanged after editing another field', async () => {
      const idAfter = await payerManagementPage.getPayerIdFromDetailUrl(publishedPayer.nameEn);
      await payerManagementPage.expectPayerIdUnchanged(idBefore, idAfter);
    });
  });

  test('TC-002: should keep the PayerCode unchanged and non-editable when the payer is opened in edit mode', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let codeBefore!: Awaited<ReturnType<typeof payerManagementPage.getPayerCode>>;
    let form!: EditForm;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Read the PayerCode before the edit', async () => {
      codeBefore = await payerManagementPage.getPayerCode(publishedPayer.nameEn);
    });

    await steps.critical('Open the payer in edit mode', async () => {
      form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
    });

    await steps.step('"Payer Code" is not editable', () =>
      form.expectFieldNotEditable('Payer Code'));

    await steps.critical('Close the form, discarding', () => form.closeAndDiscard());

    // The code survives an unrelated edit untouched.
    await steps.critical(`Edit the unrelated "${CHAIN_EDIT_FIELD.label}" field and save`, () =>
      payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        CHAIN_EDIT_FIELD.label,
        editedLicenseNumber(),
        CHAIN_EDIT_FIELD.kind,
      ));

    await steps.step('The PayerCode survives the unrelated edit untouched', () =>
      payerManagementPage.expectPayerCodeEquals(publishedPayer.nameEn, codeBefore));
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
    steps,
  }) => {
    let form!: EditForm;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Open the payer in edit mode', async () => {
      form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
    });

    await steps.critical('Clear the mandatory "Payer Name" and attempt to advance', async () => {
      await form.clearField('Payer Name');
      await form.attemptNext();
    });

    // Field-level validation blocks progress to the next step.
    await steps.step('"Payer Name" shows a required-field error', () =>
      form.expectFieldRequired('Payer Name', VALIDATION_MESSAGES.required));

    await steps.step('The wizard stays on the Basic Information step', () =>
      form.expectActiveStep('Basic Information'));

    await steps.critical('Close the form, discarding', () => form.closeAndDiscard());
  });

  test('TC-004: should keep the wizard on the same step and show a format error when an edited field is invalid', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let form!: EditForm;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Open the payer in edit mode', async () => {
      form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
    });

    await steps.critical(
      `Set "Email Address" to the invalid value "${INVALID_EDIT_VALUES.email}" and attempt to advance`,
      async () => {
        await form.setFieldValue('Email Address', INVALID_EDIT_VALUES.email, 'text');
        await form.attemptNext();
      },
    );

    // The invalid value is rejected and never persisted to the draft.
    await steps.step('"Email Address" shows an invalid-format error', () =>
      form.expectFieldError('Email Address', VALIDATION_MESSAGES.invalidEmail));

    await steps.step('The wizard stays on the Contact Information step', () =>
      form.expectActiveStep('Contact Information'));

    await steps.critical('Close the form, discarding', () => form.closeAndDiscard());
  });

  // TC-005: max-length boundary - exactly the limit, and one character over.
  for (const boundary of NAME_LENGTH_BOUNDARY_CASES) {
    test(`TC-005: should ${boundary.expectAccepted ? 'accept' : 'reject'} the edit when Payer Name is ${boundary.label}`, async ({
      payerManagementPage,
      publishedPayer,
      steps,
    }) => {
      const candidateName = payerNameOfLength(boundary.length);
      let form!: EditForm;

      await steps.critical('Open the payer list', () => payerManagementPage.open());

      await steps.critical('Open the payer in edit mode', async () => {
        form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      });

      await steps.critical(`Set "Payer Name" to a name ${boundary.label} and save`, async () => {
        await form.setFieldValue('Payer Name', candidateName, 'text');
        await form.saveFromAnyStep();
      });

      await steps.step(
        `The edit is ${boundary.expectAccepted ? 'accepted' : 'rejected'}`,
        () =>
          payerManagementPage.expectNameLengthBoundaryOutcome(
            form,
            publishedPayer.nameEn,
            candidateName,
            boundary.expectAccepted,
          ),
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
      steps,
    }) => {
      const newValue = field.value();
      let codeBefore!: Awaited<ReturnType<typeof payerManagementPage.getPayerCode>>;

      await steps.critical('Open the payer list', () => payerManagementPage.open());

      await steps.critical('Read the PayerCode before the edit', async () => {
        codeBefore = await payerManagementPage.getPayerCode(publishedPayer.nameEn);
      });

      await steps.critical(`Edit "${field.label}" on its own and save`, () =>
        payerManagementPage.editSingleFieldAndSave(
          publishedPayer.nameEn,
          field.label,
          newValue,
          field.kind,
        ));

      // The edit is saved to the draft, and the identifiers are untouched. The
      // row is still located by the live (published) name, because a draft edit
      // does not change the published record.
      await steps.step('The edit is saved to a private Draft', () =>
        payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, 'Draft'));

      await steps.step('The PayerCode is untouched by the edit', () =>
        payerManagementPage.expectPayerCodeEquals(publishedPayer.nameEn, codeBefore));
    });
  }
});
