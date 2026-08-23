import { test } from '../../../fixtures';
import { VALIDATION_MESSAGES } from '../../../data/payers/payer.data';
import {
  INVALID_EDIT_VALUES,
  NAME_LENGTH_BOUNDARY_CASES,
  payerNameOfLength,
} from '../../../data/payers/editPayer.data';

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
