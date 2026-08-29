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
 *
 * The pattern throughout: reaching the state under test is `critical`, and each
 * verification of that state is a `step`, so one failing assertion still lets
 * the next one report.
 */
test.describe('Create New Payer Organization Record - Mandatory field validation', () => {
  test('TC-009: should block saving and show a required-field error when mandatory data is missing', async ({
    payerManagementPage,
    steps,
  }) => {
    let form!: Awaited<ReturnType<typeof payerManagementPage.openCreateForm>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Open the Create New Payer form', async () => {
      form = await payerManagementPage.openCreateForm();
    });

    // Attempt to advance the very first step with everything blank.
    await steps.critical('Attempt to advance the first step with every field blank', () =>
      form.clickNext());

    await steps.step('"Payer Name" shows a required-field error', () =>
      form.expectFieldRequired('Payer Name', VALIDATION_MESSAGES.required));

    await steps.step('"Payer Type" shows a required-field error', () =>
      form.expectFieldRequired('Payer Type', VALIDATION_MESSAGES.required));

    // The wizard did not advance and nothing was saved as Draft.
    await steps.step('The wizard did not advance, so nothing was saved as a Draft', () =>
      form.waitForOpen());
  });

  // TC-017: checklist test - one iteration per mandatory field, each proving the
  // field cannot be bypassed when every other field is valid.
  for (const field of MANDATORY_FIELDS) {
    test(`TC-017: should reject saving when the mandatory "${field.label}" field is left blank`, async ({
      payerManagementPage,
      steps,
    }) => {
      const data = buildUniquePayer();
      let form!: Awaited<ReturnType<typeof payerManagementPage.attemptCreateOmitting>>;

      await steps.critical('Open the payer list', () => payerManagementPage.open());

      await steps.critical(
        `Fill every field except "${field.label}" and attempt to save`,
        async () => {
          form = await payerManagementPage.attemptCreateOmitting(data, field);
        },
      );

      await steps.step(`"${field.label}" shows a required-field error`, () =>
        form.expectFieldRequired(field.label, VALIDATION_MESSAGES.required));

      // Record was never saved - the wizard is still open on the failing step.
      await steps.step('The wizard is still open, so the record was never saved', () =>
        form.waitForOpen());
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
    steps,
  }) => {
    const data = buildUniquePayer({ email: INVALID_FIELD_VALUES.email });
    let form!: Awaited<ReturnType<typeof payerManagementPage.openCreateForm>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Open the Create New Payer form', async () => {
      form = await payerManagementPage.openCreateForm();
    });

    await steps.critical('Fill Basic Information and advance', async () => {
      await form.fillBasicInformation(data);
      await form.clickNext();
    });

    // Everything on Contact Information is valid except the malformed email.
    await steps.critical(
      `Fill Contact Information with the malformed email "${INVALID_FIELD_VALUES.email}"`,
      () => form.fillContactInformation(data),
    );

    await steps.critical('Attempt to advance past Contact Information', () => form.clickNext());

    await steps.step('"Email Address" shows an invalid-format error', () =>
      form.expectFieldError('Email Address', VALIDATION_MESSAGES.invalidEmail));

    // The wizard did not advance past Contact Information - nothing was saved.
    await steps.step('The wizard did not advance, so nothing was saved', () => form.waitForOpen());
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
    steps,
  }) => {
    // 1) Establish an approved payer (real PayerCode) to duplicate.
    const original = buildUniquePayer({ effectiveDate: DateUtils.pastDate(10) });
    cleanup.register(() => payerManagementPage.deletePayer(original.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the original payer as a Draft', () =>
      payerManagementPage.createDraftPayer(original));

    await steps.critical('Send the original payer for approval', () =>
      payerManagementPage.sendForApproval(original.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Approve the original payer so it holds a real PayerCode', () =>
      approvalManagementPage.approve(original.nameEn));

    // 2) Attempt to create a second payer with identical identifying details.
    const duplicate = buildUniquePayer({
      nameEn: original.nameEn,
      licenseNumber: original.licenseNumber,
      email: original.email,
    });

    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    // Deliberately NOT critical. If the app does flag the duplicate, it does so
    // by refusing the save - so this step failing is a possible expected outcome,
    // and the check below is what tells the two apart. Making it critical would
    // suppress the only step that answers the question this case asks.
    await steps.step(
      'Attempt to create a second payer with identical name, licence and email',
      () => payerManagementPage.createDraftPayer(duplicate),
    );

    // 3) The system must warn/flag the duplicate rather than accept it silently.
    await steps.step('The system flags the potential duplicate rather than accepting it', () =>
      payerManagementPage.expectDuplicateWarning());
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
    steps,
  }) => {
    // If, despite the injected failure, a record somehow persists, clean it up.
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    let form!: Awaited<ReturnType<typeof payerManagementPage.openCreateForm>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // The injected route is removed in `finally` so the network is restored even
    // if a step aborts the rest of the test - otherwise the cleanup hook would
    // run against a page that cannot save.
    try {
      // Fault injection: fail every mutating (non-GET) request so the save cannot
      // complete, while leaving read traffic (the list, lookups) working.
      await steps.critical('Fail every mutating request so the save cannot complete', () =>
        NetworkUtils.failMutatingRequests(page));

      await steps.critical('Open the Create New Payer form', async () => {
        form = await payerManagementPage.openCreateForm();
      });

      await steps.critical('Fill the wizard and attempt to save', async () => {
        await form.fillBasicInformation(uniquePayer);
        await form.clickNext();
        await form.fillContactInformation(uniquePayer);
        await form.clickNext();
        await form.fillEffectivePeriod(uniquePayer);
        await form.save();
      });
    } finally {
      // Restore the network before anything else touches the page.
      await NetworkUtils.restore(page);
    }

    // Close the wizard (discarding) and confirm the failed save left no partial
    // or duplicate record behind - no page navigation needed.
    await steps.critical('Close the wizard, discarding the failed save', () =>
      form.closeAndDiscard());

    await steps.step('No partial or duplicate payer record was left behind', () =>
      payerManagementPage.expectRowNotVisible(uniquePayer.nameEn));
  });
});
