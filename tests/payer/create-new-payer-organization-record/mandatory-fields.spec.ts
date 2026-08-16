import { test } from '../../../fixtures';
import { buildUniquePayer, VALIDATION_MESSAGES } from '../../../data/payers/payer.data';
import { MANDATORY_FIELDS } from '../../../data/payers/payerTypes';

/**
 * User story: Create New Payer Organization Record.
 * Mandatory-field enforcement during creation.
 */
test.describe('Create New Payer Organization Record - Mandatory field validation', () => {
  test('TC-009: should block saving and show a required-field error when mandatory data is missing', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const form = await payerManagementPage.openCreateForm();

    // Attempt to advance the very first step with everything blank.
    await form.clickNext();

    await form.expectFieldRequired('Payer Name', VALIDATION_MESSAGES.required);
    await form.expectFieldRequired('Payer Type', VALIDATION_MESSAGES.required);
    // The wizard did not advance and nothing was saved as Draft.
    await form.waitForOpen();
  });

  // TC-017: checklist test - one iteration per mandatory field, each proving the
  // field cannot be bypassed when every other field is valid.
  for (const field of MANDATORY_FIELDS) {
    test(`TC-017: should reject saving when the mandatory "${field.label}" field is left blank`, async ({
      payerManagementPage,
    }) => {
      const data = buildUniquePayer();

      await payerManagementPage.open();
      const form = await payerManagementPage.attemptCreateOmitting(data, field);

      await form.expectFieldRequired(field.label, VALIDATION_MESSAGES.required);
      // Record was never saved - the wizard is still open on the failing step.
      await form.waitForOpen();
    });
  }
});
