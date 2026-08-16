import { test } from '../../../fixtures';
import {
  buildUniquePayer,
  INVALID_FIELD_VALUES,
  VALIDATION_MESSAGES,
} from '../../../data/payers/payer.data';

/**
 * User story: Create New Payer Organization Record.
 * Data-format validation on constrained fields.
 *
 * Note: the Phone Number control is digit-masked (non-numeric input never
 * registers), so an invalid phone surfaces as a required error rather than a
 * format error. Email is the representative free-text format rule and is
 * asserted here.
 */
test.describe('Create New Payer Organization Record - Field format validation', () => {
  test('TC-010: should reject an invalid email format and block saving until it is corrected', async ({
    payerManagementPage,
  }) => {
    const data = buildUniquePayer({ email: INVALID_FIELD_VALUES.email });

    await payerManagementPage.open();
    const form = await payerManagementPage.openCreateForm();
    await form.fillBasicInformation(data);
    await form.clickNext();

    // Everything on Contact Information is valid except the malformed email.
    await form.fillContactInformation(data);
    await form.clickNext();

    await form.expectFieldError('Email Address', VALIDATION_MESSAGES.invalidEmail);
    // The wizard did not advance past Contact Information - nothing was saved.
    await form.waitForOpen();
  });
});
