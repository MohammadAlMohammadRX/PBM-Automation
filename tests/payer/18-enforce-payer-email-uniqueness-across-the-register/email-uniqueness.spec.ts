import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  DUPLICATE_EMAIL_RESPONSE,
  DUPLICATE_MESSAGE_PATTERNS,
  DUPLICATE_VARIANTS,
  submittedFormOf,
  UNIQUE_EMAIL_STATUS,
} from '../../../data/payers/payerEmailUniqueness.data';

/**
 * User story: Enforce Payer Email Uniqueness Across the Register.
 *
 * WHAT WAS FOUND before these cases were written. The rule works, and works
 * better than the sheet asks: an exact duplicate, the same address in a
 * different letter case, and the same address padded with spaces are all
 * refused with HTTP 409 "Conflict Detected", the reason naming the address as
 * `Email 'x' is already taken.` So the check is case-insensitive and trims
 * before comparing.
 *
 * What is missing is the feedback. The interface shows NOTHING on that 409 - no
 * toast, no inline error under the Email field, no dialog - and the drawer
 * stays open exactly as if Save had not been pressed. Every case here expects
 * "a bilingual error message naming the already-used email", and none appears.
 *
 * So each case splits into two steps: the save is blocked, and the user is told
 * why. The first passes, the second fails. A single combined assertion would
 * have reported email uniqueness as broken, which is the opposite of true.
 *
 * The duplicate is always built from a payer the test creates itself, never
 * from a hard-coded mailbox - so no case depends on data that may or may not
 * exist in the environment.
 */
test.describe('Enforce Payer Email Uniqueness - Creation', () => {
  test('TC-001: should save the payer and list its email when the address is unique', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('Open the New Payer form with empty required fields', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    await steps.step('The Email field accepts and displays the unique address', async () => {
      await form.fillBasicInformation(uniquePayer);
      await form.clickNext();
      await form.fillContactInformation(uniquePayer);
      await form.expectFieldValue('Email Address', uniquePayer.email);
      await form.expectNoFieldError('Email Address');
    });

    await steps.step('Saving creates the payer, and the list shows the entered email', async () => {
      await form.clickNext();
      await form.fillEffectivePeriod(uniquePayer);

      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, 'the create should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(UNIQUE_EMAIL_STATUS);

      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      await payerManagementPage.expectRowCellEquals(
        uniquePayer.nameEn,
        PAYER_COLUMN.email,
        uniquePayer.email,
      );
    });
  });

  for (const variant of DUPLICATE_VARIANTS) {
    test(`${variant.caseId}: should block the save and name the conflicting address when a new payer reuses ${variant.label}`, async ({
      payerManagementPage,
      uniquePayer,
      steps,
    }) => {
      const typed = variant.transform(uniquePayer.email);
      // What the SERVER will receive: the field strips surrounding whitespace on
      // input, so the padded variant never sends its padding.
      const submitted = submittedFormOf(uniquePayer.email, variant);
      const duplicate = buildUniquePayer({ email: typed });
      let form!: PayerFormDialog;
      let outcome!: Awaited<ReturnType<PayerFormDialog['saveNewAndCaptureOutcome']>>;

      await steps.critical('Navigate to the module with an existing payer on record', async () => {
        await payerManagementPage.open();
        // The payer whose address will be reused is created here, so the case
        // never depends on a mailbox that may not exist in this environment.
        await payerManagementPage.createDraftPayer(uniquePayer);
        await payerManagementPage.open();
        await payerManagementPage.search(uniquePayer.nameEn);
        await payerManagementPage.expectRowCellEquals(
          uniquePayer.nameEn,
          PAYER_COLUMN.email,
          uniquePayer.email,
        );
      });

      await steps.critical('Open the New Payer form', async () => {
        form = await payerManagementPage.openCreateForm();
        await form.expectActiveStep('Basic Information');
      });

      await steps.step('The Email field accepts the reused address pending save', async () => {
        await form.fillBasicInformation(duplicate);
        await form.clickNext();
        await form.fillContactInformation(duplicate);
        // The TRIMMED value: the field strips surrounding spaces as they are
        // typed, so the sheet's "the field displays the entered text" does not
        // hold for the padded variant - the padding is gone before save.
        await form.expectFieldValue('Email Address', submitted);
        // Nothing is flagged at field level - the check is server-side only.
        await form.expectNoFieldError('Email Address');
      });

      await steps.step('The save is refused as a duplicate, the server naming the address', async () => {
        await form.clickNext();
        await form.fillEffectivePeriod(duplicate);

        outcome = await form.saveNewAndCaptureOutcome();
        expect(outcome, 'the create should have reached the server').not.toBeNull();
        expect(outcome!.status).toBe(DUPLICATE_EMAIL_RESPONSE.status);
        // The reason echoes the address AS SUBMITTED, not as stored - an
        // upper-case attempt comes back naming the upper-case form. So the
        // submitted value is what to look for.
        expect(outcome!.text).toContain(submitted);
      });

      // The step this story fails on. The block above is correct; what is
      // missing is any sign of it in the interface.
      await steps.step('A message tells the user the address is already taken', async () => {
        const messages = await form.waitForVisibleMessages();
        expect(
          messages,
          'A refused save must tell the user something. On this 409 the application shows no '
            + 'toast, no inline error under the Email field and no dialog - the drawer just '
            + 'stays open, which is indistinguishable from a click that never landed.',
        ).not.toEqual([]);
        expect(
          messages.some((message) => DUPLICATE_MESSAGE_PATTERNS.en.test(message)),
          `The message should say the address is already in use. Saw: ${JSON.stringify(messages)}`,
        ).toBe(true);
      });

      await steps.step('No second payer was created with that address', async () => {
        await form.closeAndDiscard();
        await payerManagementPage.open();
        await payerManagementPage.search(duplicate.nameEn);
        await payerManagementPage.expectEmptyState();
      });
    });
  }

  test('TC-008: should block the save when the duplicate address belongs to an Inactive payer', async ({
    payerManagementPage,
    payerSample,
    steps,
  }) => {
    let existingEmail!: string;
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module and locate an Inactive payer', async () => {
      await payerManagementPage.open();
      // Sampled rather than created: manufacturing an Inactive payer means a
      // full inactivate-plus-approve round trip, and the fixture reports
      // BLOCKED when the environment holds none - which is the honest outcome,
      // since the rule would never have been exercised.
      const [inactiveName] = await payerSample('Inactive', 'Inactive', 1);
      await payerManagementPage.search(inactiveName);
      existingEmail = await payerManagementPage.getCellValue(inactiveName, PAYER_COLUMN.email);
      expect(existingEmail, 'the sampled Inactive payer should carry an email').not.toBe('');
    });

    const duplicate = buildUniquePayer();

    await steps.critical('Open the New Payer form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    await steps.step("The Email field accepts the Inactive payer's address", async () => {
      await form.fillBasicInformation(duplicate);
      await form.clickNext();
      await form.fillContactInformation({ ...duplicate, email: existingEmail });
      await form.expectFieldValue('Email Address', existingEmail);
    });

    await steps.step(
      "The save is refused regardless of the other payer's Inactive status",
      async () => {
        await form.clickNext();
        await form.fillEffectivePeriod(duplicate);
        const outcome = await form.saveNewAndCaptureOutcome();
        expect(outcome!.status).toBe(DUPLICATE_EMAIL_RESPONSE.status);
        expect(outcome!.text).toContain(existingEmail);
      },
    );

    await steps.step('A message names the duplicate address', async () => {
      const messages = await form.waitForVisibleMessages();
      expect(
        messages,
        'The refusal is correct but silent - see the file comment.',
      ).not.toEqual([]);
    });
  });
});
