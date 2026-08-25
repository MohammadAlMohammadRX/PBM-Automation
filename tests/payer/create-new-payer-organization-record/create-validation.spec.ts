import { test } from '../../../fixtures';
import {
  buildUniquePayer,
  VALIDATION_MESSAGES,
  INVALID_FIELD_VALUES,
} from '../../../data/payers/payer.data';
import { MANDATORY_FIELDS } from '../../../data/payers/payerTypes';
import { DateUtils } from '../../../utils/DateUtils';
import { NetworkUtils } from '../../../utils/NetworkUtils';

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

/**
 * User story: Create New Payer Organization Record.
 * A payer whose identifying details duplicate an already-approved payer must be
 * flagged - never accepted silently.
 *
 * NOTE: verified live that the current app performs NO duplicate detection
 * (identical name + license saves silently), so this test is expected to FAIL
 * against the current build - that failure is the intended defect signal for the
 * dev team, not a test error.
 */
test.describe('Create New Payer Organization Record - Duplicate detection', () => {
  test('TC-015: should flag a potential duplicate when a new payer matches an approved payer', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
  }) => {
    // 1) Establish an approved payer (real PayerCode) to duplicate.
    const original = buildUniquePayer({ effectiveDate: DateUtils.pastDate(10) });
    cleanup.register(() => payerManagementPage.deletePayer(original.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(original);
    await payerManagementPage.sendForApproval(original.nameEn);
    await approvalManagementPage.open();
    await approvalManagementPage.approve(original.nameEn);

    // 2) Attempt to create a second payer with identical identifying details.
    const duplicate = buildUniquePayer({
      nameEn: original.nameEn,
      licenseNumber: original.licenseNumber,
      email: original.email,
    });

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(duplicate);

    // 3) The system must warn/flag the duplicate rather than accept it silently.
    await payerManagementPage.expectDuplicateWarning();
  });
});

/**
 * User story: Create New Payer Organization Record.
 * Graceful handling of a save-time backend failure (fault injection).
 *
 * Playwright aborts the mutating save request to simulate a connectivity/
 * backend error, then the test asserts no partial or duplicate Draft was
 * created - i.e. no PayerCode reserved or orphaned record left behind.
 */
test.describe('Create New Payer Organization Record - Save failure handling', () => {
  test('TC-020: should not create a partial or corrupt payer record when the save request fails', async ({
    page,
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    // If, despite the injected failure, a record somehow persists, clean it up.
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();

    // Fault injection: fail every mutating (non-GET) request so the save cannot
    // complete, while leaving read traffic (the list, lookups) working.
    await NetworkUtils.failMutatingRequests(page);

    const form = await payerManagementPage.openCreateForm();
    await form.fillBasicInformation(uniquePayer);
    await form.clickNext();
    await form.fillContactInformation(uniquePayer);
    await form.clickNext();
    await form.fillEffectivePeriod(uniquePayer);
    await form.save();

    // Restore the network, close the wizard (discarding), and confirm the failed
    // save left no partial/duplicate record behind - no page navigation needed.
    await NetworkUtils.restore(page);
    await form.closeAndDiscard();
    await payerManagementPage.expectRowNotVisible(uniquePayer.nameEn);
  });
});
