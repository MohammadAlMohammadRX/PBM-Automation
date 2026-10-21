import { test, expect } from '../../../fixtures';
import {
  buildUniquePayer,
  VALIDATION_MESSAGES,
} from '../../../data/payers/payer.data';
import { MANDATORY_FIELDS } from '../../../data/payers/payerTypes';
import { DateUtils } from '../../../utils/DateUtils';

/**
 * User story: Create New Payer Organization Record.
 * Mandatory-field enforcement during creation.
 *
 * The pattern throughout: reaching the state under test is `critical`, and each
 * verification of that state is a `step`, so one failing assertion still lets
 * the next one report.
 */
test.describe('Create New Payer Organization Record - Mandatory field validation', () => {
  // Azure test case 15608
  test('15608: should block saving and show a required-field error when mandatory data is missing', async ({
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
    // Azure test case 15608
    test(`15608: should reject saving when the mandatory "${field.label}" field is left blank`, async ({
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
 * A payer whose identifying details duplicate an already-approved payer must be
 * flagged - never accepted silently.
 *
 * NOTE: verified live that the current app performs NO duplicate detection
 * (identical name + license saves silently), so this test is expected to FAIL
 * against the current build - that failure is the intended defect signal for the
 * dev team, not a test error.
 */
test.describe('Create New Payer Organization Record - Duplicate detection', () => {
  // Azure test case 15610
  test('15610: should flag a potential duplicate when a new payer matches an approved payer', async ({
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

    // EXPECTED RESULT UPDATED 2026-10-18 (QA lead): the system flags the
    // duplicate by REFUSING the save with a validation message - that is the
    // pass. The earlier version required the literal word "duplicate" and a
    // closed form, so the refusal it actually got was reported as a failure.
    let messages: string[] = [];
    await steps.step('Attempt to create a second payer with identical name, licence and email', async () => {
      const form = await payerManagementPage.openCreateForm();
      await form.createPayer(duplicate);
      messages = await form.waitForVisibleMessages();
      expect(await form.isOpen(), 'the duplicate should not be accepted - the form should stay open').toBe(true);
      await form.closeAndDiscard();
    });

    // 3) The system must flag the duplicate rather than accept it silently.
    await steps.step('The system flags the duplicate with a validation message', async () => {
      expect(
        messages.some((m) => /already|exist|duplicate|taken|unique|used/i.test(m)),
        `the refusal should say the record already exists; the form showed: ${messages.join(' | ') || '(nothing)'}`,
      ).toBe(true);
    });

    await steps.step('And no second payer was created', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(original.nameEn);
      const names = await payerManagementPage.getVisiblePayerNames();
      expect(names.filter((n) => n === original.nameEn).length, `exactly one "${original.nameEn}" should exist`).toBe(1);
    });
  });
});
