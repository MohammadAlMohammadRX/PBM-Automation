import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import { PAYER_NAME_AR_LABEL, buildUniquePayer } from '../../../data/payers/payer.data';
import { DateUtils } from '../../../utils/DateUtils';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  CREATION_MESSAGES,
  FIELD_DEFAULTS,
  MALFORMED_EMAIL,
} from '../../../data/payers/payerCreationFields.data';
import { DUPLICATE_EMAIL_RESPONSE } from '../../../data/payers/payerEmailUniqueness.data';

/**
 * User story: Validate Payer Creation Input Fields.
 * The name, email and mandatory-field rules.
 *
 * DELIBERATELY THIN, and reuses rather than restates. Three sibling stories
 * already cover these rules in depth - character sets in folder 17, email
 * uniqueness in folder 18, the date boundaries in folder 20 - so the messages
 * come from their data modules and these cases assert the rules from the
 * CREATION form's point of view rather than re-deriving them.
 *
 * Two divergences carried over from that work: the English Name field refuses a
 * value only when it contains ARABIC letters (digits and punctuation are fine,
 * so "النور123" is refused for its letters, not its digits), and a duplicate
 * email is refused by the SERVER with 409 while the interface shows nothing.
 */
test.describe('Validate Payer Creation Input Fields - Names and email', () => {
  test('TC-001: should submit without validation errors when every mandatory field holds valid data', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer({ nameAr: 'النور للتأمين' });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form with empty mandatory fields', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
      await form.expectFieldValue('Payer Name', '');
      await form.expectFieldValue(PAYER_NAME_AR_LABEL, '');
    });

    await steps.step('Both name fields accept their values without error', async () => {
      await form.fillTextField('Payer Name', payer.nameEn);
      await form.fillTextField(PAYER_NAME_AR_LABEL, payer.nameAr);
      await form.expectNoFieldError('Payer Name');
      await form.expectNoFieldError(PAYER_NAME_AR_LABEL);
    });

    await steps.step('The email field accepts the unique address with no error', async () => {
      await form.selectDropdownOption('Payer Type', payer.type);
      await form.clickNext();
      await form.fillTextField('Email Address', payer.email);
      await form.expectFieldValue('Email Address', payer.email);
      await form.expectNoFieldError('Email Address');
    });

    await steps.step('The dial code and subscriber number are both accepted', async () => {
      await form.fillTextField('Phone Number', payer.phone);
      await form.expectFieldValue('Phone Number', payer.phone);
      await form.expectNoFieldError('Phone Number');
    });

    await steps.step('Selecting a country enables a city list scoped to it', async () => {
      await form.selectDropdownOption('Country', FIELD_DEFAULTS.country);
      await form.selectDropdownOption('City', payer.city);
      expect(await form.getDropdownValue('City')).toBe(payer.city);
    });

    await steps.step('Both dates are accepted with no validation error', async () => {
      await form.fillTextField('License Number', payer.licenseNumber);
      await form.selectDropdownOption('Preferred Language', payer.language);
      await form.selectDropdownOption('Preferred Contact Method', payer.contactMethod);
      await form.clickNext();
      await form.fillEffectivePeriod(payer);
      await form.expectNoFieldError('Effective Date');
      await form.expectNoFieldError('Expiry Date');
    });

    await steps.step('The form submits with no validation errors displayed', async () => {
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, 'the create should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(200);
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.waitForRowVisible(payer.nameEn);
    });
  });

  test('TC-002: should report a character-set violation when the English Name field contains Arabic characters', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectFieldPresent('Payer Name');
    });

    // The sheet's value is "النور123" - Arabic letters plus digits. It is
    // refused for the LETTERS: digits alone are perfectly acceptable here.
    await steps.step('The field displays the entered characters', async () => {
      await form.fillTextField('Payer Name', 'النور123');
      await form.expectFieldValue('Payer Name', 'النور123');
    });

    await steps.step('Moving focus away reports that English letters are required', async () => {
      await form.fillTextField(PAYER_NAME_AR_LABEL, payer.nameAr);
      await form.expectFieldError('Payer Name', CREATION_MESSAGES.englishNameOnly);
    });
  });

  test('TC-003: should report a character-set violation when the Arabic Name field contains Latin characters', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectFieldPresent(PAYER_NAME_AR_LABEL);
    });

    await steps.step('The field displays the entered characters', async () => {
      await form.fillTextField(PAYER_NAME_AR_LABEL, 'Al Noor 123');
      await form.expectFieldValue(PAYER_NAME_AR_LABEL, 'Al Noor 123');
    });

    await steps.step('Moving focus away reports that Arabic letters are required', async () => {
      await form.fillTextField('Payer Name', payer.nameEn);
      await form.expectFieldError(PAYER_NAME_AR_LABEL, CREATION_MESSAGES.arabicNameOnly);
    });
  });

  test('TC-004: should report both names as required when the English and Arabic name fields are left blank', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    await steps.step('Every other mandatory field on the step accepts its value', async () => {
      await form.selectDropdownOption('Payer Type', payer.type);
      expect(await form.getDropdownValue('Payer Type')).toBe(payer.type);
    });

    await steps.step('Both name fields are reported as required', async () => {
      await form.attemptNext();
      await form.expectFieldRequired('Payer Name', CREATION_MESSAGES.required);
      await form.expectFieldRequired(PAYER_NAME_AR_LABEL, CREATION_MESSAGES.required);
      await form.expectActiveStep('Basic Information');
    });
  });

  test('TC-005: should report an invalid-format message when the email address is malformed', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.expectFieldPresent('Email Address');
    });

    await steps.step('The field displays the malformed text', async () => {
      await form.fillTextField('Email Address', MALFORMED_EMAIL);
      await form.expectFieldValue('Email Address', MALFORMED_EMAIL);
    });

    await steps.step('Moving focus away reports the format as invalid', () =>
      form.expectFieldError('Email Address', CREATION_MESSAGES.invalidEmail));
  });

  for (const stage of [
    { caseId: 'TC-006', label: 'an approved payer', approve: true },
    { caseId: 'TC-007', label: 'a payer still awaiting approval', approve: false },
  ] as const) {
    test(`${stage.caseId}: should refuse the save when the email is already used by ${stage.label}`, async ({
      payerManagementPage,
      approvalManagementPage,
      uniquePayer,
      steps,
    }) => {
      const duplicate = buildUniquePayer({ email: uniquePayer.email });
      let form!: PayerFormDialog;

      await steps.critical(`Navigate to the module with ${stage.label} holding the address`, async () => {
        await payerManagementPage.open();
        await payerManagementPage.createDraftPayer(uniquePayer);
        await payerManagementPage.open();
        await payerManagementPage.sendForApproval(uniquePayer.nameEn);
        // The two cases differ only in how far the holder got through the
        // maker-checker flow, which is the distinction the sheet is drawing.
        await payerManagementPage.expectApprovalStatusContains(
          uniquePayer.nameEn,
          'Pending Approval',
        );
      });

      await steps.critical('Bring the holder to the required approval state', async () => {
        await approvalManagementPage.open();
        await approvalManagementPage.expectInQueue(uniquePayer.nameEn);
        await (stage.approve
          ? approvalManagementPage.approve(uniquePayer.nameEn)
          : approvalManagementPage.expectActionsAvailable(uniquePayer.nameEn));
      });

      await steps.step('The creation form accepts the reused address pending save', async () => {
        await payerManagementPage.open();
        form = await payerManagementPage.openCreateForm();
        await form.fillBasicInformation(duplicate);
        await form.clickNext();
        await form.fillContactInformation(duplicate);
        await form.expectFieldValue('Email Address', uniquePayer.email);
        await form.expectNoFieldError('Email Address');
      });

      await steps.step('The save is refused, the server naming the address', async () => {
        await form.clickNext();
        await form.fillEffectivePeriod(duplicate);
        const outcome = await form.saveNewAndCaptureOutcome();
        expect(outcome, 'the create should have reached the server').not.toBeNull();
        expect(outcome!.status).toBe(DUPLICATE_EMAIL_RESPONSE.status);
        expect(outcome!.text).toContain(uniquePayer.email);
      });

      // Fails, as it does throughout folder 18: the refusal is correct and
      // silent.
      await steps.step('A message states the address is already in use', async () => {
        const messages = await form.waitForVisibleMessages();
        expect(
          messages,
          'The 409 renders no toast, no inline error and no dialog - see folder 18.',
        ).not.toEqual([]);
      });
    });
  }

  test('TC-018: should reject or safely sanitise hostile input when it is entered into the name and email fields', async ({
    payerManagementPage,
    steps,
  }) => {
    // EXPLORATORY. The sheet allows either rejection or safe sanitisation, so
    // the invariant asserted is the one that must hold either way: nothing is
    // executed, and whatever the application keeps round-trips unchanged.
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectFieldPresent('Payer Name');
    });

    await steps.step('A script tag in the English name is refused as a character-set violation', async () => {
      // Refused for containing no Arabic - the rule is about scripts, not about
      // markup - but refused all the same, which is what matters here.
      await form.fillTextField('Payer Name', '<script>alert(1)</script>');
      await form.fillTextField(PAYER_NAME_AR_LABEL, payer.nameAr);
      await form.expectFieldValue('Payer Name', '<script>alert(1)</script>');
    });

    await steps.step('No script executed and no dialog was raised by the input', async () => {
      // A real XSS would have surfaced as a native dialog, which BasePage
      // installs a handler for and treats as an unexpected event.
      await payerManagementPage.expectNoUnexpectedDialog();
    });

    await steps.step('An SQL-like string is held as literal text, not executed', async () => {
      await form.fillTextField('Payer Name', "Robert'); DROP TABLE payers;--");
      await form.expectFieldValue('Payer Name', "Robert'); DROP TABLE payers;--");
      await payerManagementPage.expectNoUnexpectedDialog();
    });

    await steps.step('The payer list is still readable afterwards', async () => {
      await form.closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
      await payerManagementPage.expectColumnPresent(PAYER_COLUMN.payerName);
    });
  });
});
