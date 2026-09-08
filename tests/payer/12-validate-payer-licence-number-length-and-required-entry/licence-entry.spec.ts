import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  ACCEPTED_LICENCE_LENGTHS,
  LICENCE_MAX_LENGTH,
  LICENCE_MESSAGES,
  LICENCE_MESSAGES_AR,
  OVERSIZED_LICENCE,
  licenceOfLength,
} from '../../../data/payers/licenceNumber.data';

/**
 * User story: Validate Payer Licence Number Length and Required Entry.
 * Entering a licence number when creating a payer.
 *
 * THE FIELD'S REAL CONSTRAINT. `payer-form-drawer-license-number-input` carries
 * `maxlength="100"`, verified on the live wizard in both languages, and the
 * browser enforces it - typing 101 characters leaves 100 in the field. So the
 * over-limit rule is enforced by PREVENTION rather than by validation, and the
 * "maximum length exceeded" message the sheet expects cannot exist because
 * nothing can ever exceed the maximum. TC-004 therefore asserts the cap and the
 * absence of any oversized record, which is what the acceptance criterion
 * actually requires and a stronger guarantee than a message would be. Recorded
 * as a divergence in the traceability matrix, not as a defect.
 *
 * The sheet calls the validation messages bilingual "English/French". The
 * application is English/Arabic throughout and contains no French at all;
 * treated as a slip in the sheet and asserted against the pair that exists.
 */
test.describe('Validate Payer Licence Number Length and Required Entry - Entry', () => {
  for (const accepted of ACCEPTED_LICENCE_LENGTHS) {
    test(`${accepted.caseId}: should save the payer when the licence number is ${accepted.length} character(s) long`, async ({
      payerManagementPage,
      steps,
    }) => {
      const licence = licenceOfLength(accepted.length);
      const payer = buildUniquePayer({ licenseNumber: licence });
      let form: PayerFormDialog;

      await steps.critical('Navigate to the Payer Management module', () =>
        payerManagementPage.open());

      await steps.critical('Open the payer creation form', async () => {
        form = await payerManagementPage.openCreateForm();
        await form.expectActiveStep('Basic Information');
      });

      await steps.step(
        `The Licence Number field accepts ${accepted.length} character(s) (${accepted.label}) without an inline error`,
        async () => {
          await form.fillBasicInformation(payer);
          await form.clickNext();
          await form.fillContactInformation(payer);
          await form.expectFieldPresent('License Number');
          await form.expectFieldValue('License Number', licence);
          await form.expectNoFieldError('License Number');
        },
      );

      await steps.step('Saving creates the payer with the entered licence number', async () => {
        await form.clickNext();
        await form.fillEffectivePeriod(payer);
        await form.save();
        await form.waitForClosed();

        // Searched rather than scanned: the register runs to 37 pages, so a new
        // record is almost never on the page the list happens to be showing.
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        await payerManagementPage.expectRowCellEquals(
          payer.nameEn,
          PAYER_COLUMN.licenseNumber,
          licence,
        );
      });
    });
  }

  test('TC-002: should block the save and report the field as required when the licence number is left empty', async ({
    payerManagementPage,
    languageSwitcher,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    await steps.step('The Licence Number field is left blank', async () => {
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer, 'License Number');
      await form.expectFieldPresent('License Number');
      await form.expectFieldValue('License Number', '');
    });

    await steps.step('The save is refused with a required-field message', async () => {
      await form.attemptNext();
      await form.expectFieldRequired('License Number', LICENCE_MESSAGES.required);
      // The wizard must not have advanced. If it had, the omission would reach
      // the server and the guard being tested would be the API's, not the
      // form's - a different rule with a different failure mode.
      await form.expectActiveStep('Contact Information');
    });

    // TWO THINGS THIS STEP WORKS AROUND, both learned against the live wizard.
    //
    // The language cannot be switched while the drawer is open: the header
    // toggle sits behind the drawer's overlay, so the click never lands. Hence
    // the discard-switch-reopen.
    //
    // And the contact step is NOT re-filled in Arabic. The field ids are
    // language-independent but the dropdown OPTION TEXT is translated, so
    // asking for "Riyadh" or "Email" in the Arabic form waits out a full action
    // timeout on options that do not exist there. It is also unnecessary:
    // clicking Next with step 2 empty reports every one of its fields as
    // required, the licence field included, which is exactly the message under
    // test.
    await steps.step('The same message is shown in Arabic', async () => {
      await form.closeAndDiscard();
      await languageSwitcher.switchTo('ar');
      await payerManagementPage.open();
      const arabicForm = await payerManagementPage.openCreateForm();
      await arabicForm.fillBasicInformationInArabic(payer);
      await arabicForm.clickNext();
      await arabicForm.expectFieldPresent('License Number');
      await arabicForm.attemptNext();
      await arabicForm.expectFieldRequired('License Number', LICENCE_MESSAGES_AR.required);
      await arabicForm.closeAndDiscard();
    });

    await steps.step('No payer was created by either refused attempt', async () => {
      await languageSwitcher.switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectEmptyState();
    });
  });

  test('TC-004: should cap the licence number at 100 characters when 101 are entered', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer({ licenseNumber: OVERSIZED_LICENCE });
    let form: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    // The sheet expects the field to hold all 101 characters at this point. It
    // cannot, and that is the application being stricter rather than wrong - so
    // the assertion is the cap itself, declared and observed.
    await steps.step(
      `The field holds only ${LICENCE_MAX_LENGTH} of the ${OVERSIZED_LICENCE.length} characters entered`,
      async () => {
        await form.fillBasicInformation(payer);
        await form.clickNext();
        await form.fillContactInformation(payer);
        await form.expectFieldMaxLength('License Number', LICENCE_MAX_LENGTH);
        await form.expectFieldValueLength('License Number', LICENCE_MAX_LENGTH);
      },
    );

    await steps.step('The oversized value is not what gets stored', async () => {
      await form.clickNext();
      await form.fillEffectivePeriod(payer);
      await form.save();
      await form.waitForClosed();

      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      const stored = await payerManagementPage.getCellValue(
        payer.nameEn,
        PAYER_COLUMN.licenseNumber,
      );
      expect(stored).toHaveLength(LICENCE_MAX_LENGTH);
      expect(stored).not.toBe(OVERSIZED_LICENCE);
    });

    await steps.step('No record exists carrying the full oversized value', async () => {
      await payerManagementPage.search(OVERSIZED_LICENCE);
      await payerManagementPage.expectEmptyState();
    });
  });
});
