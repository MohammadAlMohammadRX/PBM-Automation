import { test, expect } from '../../../fixtures';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { DateUtils } from '../../../utils/DateUtils';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  COUNTRY_CITY_CASCADE,
  CREATION_MESSAGES,
  FIELD_DEFAULTS,
  PHONE_CASES,
  PHONE_MAX_DIGITS,
} from '../../../data/payers/payerCreationFields.data';
import { expiryDate } from '../../../data/payers/expiryDateRules.data';

/**
 * User story: Validate Payer Creation Input Fields.
 * The phone field, the country/city pair, and the date relationship.
 *
 * This is the half of the story that is genuinely new rather than a restatement
 * of folders 17, 18 and 20 - and it is where the sheet and the application part
 * company most sharply.
 *
 * THE PHONE FIELD IS MASKED, NOT VALIDATED. Verified digit by digit: it holds
 * at most ten digits and silently drops everything else. An eleventh digit
 * never arrives; letters and punctuation never register. So the sheet's
 * "a validation error is shown indicating at most 10 digits" and "…digits only"
 * describe messages that cannot appear - there is nothing invalid left in the
 * field to complain about. The constraint holds more firmly than a message
 * would, and these cases assert the CAP.
 *
 * COUNTRY AND DIAL CODE BOTH CARRY DEFAULTS - `Saudi Arabia` and `+966` - where
 * the sheet expects a blank placeholder until chosen. A real divergence.
 *
 * THE CITY LIST IS PROPERLY SCOPED, which the sheet gets right. Note it names
 * Egypt; this environment offers exactly three countries, so the cascade is
 * exercised with one that exists.
 */
test.describe('Validate Payer Creation Input Fields - Phone and location', () => {
  for (const phone of PHONE_CASES) {
    const behaviour = phone.sheetExpectsMessage
      ? `should cap the subscriber number at ${PHONE_MAX_DIGITS} digits`
      : 'should accept the subscriber number';

    test(`${phone.caseId}: ${behaviour} when ${phone.label} are entered`, async ({
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
        await form.expectFieldPresent('Phone Number');
      });

      await steps.step(`The dial code is pre-selected as ${FIELD_DEFAULTS.dialCode}`, async () => {
        // Part of the divergence recorded in TC-011: the sheet expects this to
        // be blank until chosen.
        expect(await form.getDialCode()).toContain(FIELD_DEFAULTS.dialCode);
      });

      // The masked behaviour: what the field KEEPS is the assertion, because
      // nothing invalid survives long enough to be validated.
      await steps.step(
        `Entering ${phone.label} leaves "${phone.expectedHeld}" in the field`,
        async () => {
          await form.fillTextField('Phone Number', phone.typed);
          await form.expectFieldValue('Phone Number', phone.expectedHeld);
          expect((await form.getFieldValue('Phone Number')).length)
            .toBeLessThanOrEqual(PHONE_MAX_DIGITS);
        },
      );

      await steps.step('No phone validation error is raised, the value having been masked', () =>
        form.expectNoFieldError('Phone Number'));
    });
  }

  test('TC-011: should require the Country and Dial Code to be chosen rather than pre-selecting them', async ({
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
      await form.expectFieldPresent('Country');
    });

    // DIVERGENCE, and the whole point of the case: the sheet expects both
    // controls to show a blank placeholder until the user chooses. They do not -
    // the wizard pre-selects Saudi Arabia and +966. Asserting the sheet's
    // expectation is what makes the divergence visible in the report.
    await steps.step('The Country dropdown shows a blank placeholder before any selection', async () => {
      const country = await form.getDropdownValue('Country');
      expect(
        country,
        `Country is pre-selected as "${country}" rather than left blank, so a payer can be `
          + 'created without the country ever being chosen deliberately.',
      ).toBe(COUNTRY_CITY_CASCADE.clearedPlaceholder);
    });

    await steps.step('The Dial Code shows a blank placeholder before any selection', async () => {
      const dialCode = await form.getDialCode();
      expect(
        dialCode,
        `The dial code is pre-selected as "${dialCode}" rather than left blank.`,
      ).not.toContain(FIELD_DEFAULTS.dialCode);
    });
  });

  test('TC-012: should scope the City list to the selected Country so a mismatched city cannot be chosen', async ({
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
      await form.expectFieldPresent('City');
    });

    // The sheet asks to "force a City value belonging to a different country
    // onto the form". There is no path to do that: City is a closed dropdown
    // whose options are re-fetched per country, so a mismatched value is
    // unselectable rather than rejected. Proving the list EXCLUDES it is the
    // same guarantee, reachable through the interface the application offers.
    await steps.step('Choosing a country lists only that country\'s cities', async () => {
      await form.selectDropdownOption('Country', COUNTRY_CITY_CASCADE.second.country);
      const offered = await form.getDropdownOptions('City');
      expect(offered).toEqual(
        expect.arrayContaining([...COUNTRY_CITY_CASCADE.second.expectedCities]),
      );
    });

    await steps.step('A city belonging to another country is not offered at all', async () => {
      const offered = await form.getDropdownOptions('City');
      expect(
        offered,
        `"${COUNTRY_CITY_CASCADE.first.city}" belongs to `
          + `${COUNTRY_CITY_CASCADE.first.country} and must not be selectable here.`,
      ).not.toContain(COUNTRY_CITY_CASCADE.first.city);
    });
  });

  test('TC-013: should reset the City and re-list its options when the Country selection changes', async ({
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
      await form.expectFieldPresent('City');
    });

    await steps.step(`Choosing ${COUNTRY_CITY_CASCADE.first.country} populates its cities`, async () => {
      await form.selectDropdownOption('Country', COUNTRY_CITY_CASCADE.first.country);
      const offered = await form.getDropdownOptions('City');
      expect(offered).toContain(COUNTRY_CITY_CASCADE.first.city);
    });

    await steps.step(`Selecting ${COUNTRY_CITY_CASCADE.first.city} shows it as chosen`, async () => {
      await form.selectDropdownOption('City', COUNTRY_CITY_CASCADE.first.city);
      expect(await form.getDropdownValue('City')).toBe(COUNTRY_CITY_CASCADE.first.city);
    });

    // The sheet names Egypt, which this environment does not offer - it holds
    // exactly three countries. Substituted for one that exists.
    await steps.step(
      `Changing the country to ${COUNTRY_CITY_CASCADE.second.country} clears the City and re-lists it`,
      async () => {
        await form.selectDropdownOption('Country', COUNTRY_CITY_CASCADE.second.country);
        expect(await form.getDropdownValue('City')).toBe(COUNTRY_CITY_CASCADE.clearedPlaceholder);
        const offered = await form.getDropdownOptions('City');
        expect(offered).not.toContain(COUNTRY_CITY_CASCADE.first.city);
        expect(offered).toEqual(
          expect.arrayContaining([...COUNTRY_CITY_CASCADE.second.expectedCities]),
        );
      },
    );
  });
});

test.describe('Validate Payer Creation Input Fields - Date relationship', () => {
  for (const dates of [
    {
      caseId: 'TC-014',
      label: 'the expiry date equals the effective date',
      effectiveInDays: 9,
      expiryInDays: 9,
      expectedMessage: CREATION_MESSAGES.expiryNotAfterEffective,
    },
    {
      caseId: 'TC-016',
      label: 'the expiry date is earlier than the effective date',
      effectiveInDays: 14,
      expiryInDays: 9,
      expectedMessage: CREATION_MESSAGES.expiryNotAfterEffective,
    },
    {
      caseId: 'TC-017',
      label: 'the expiry date has already passed',
      effectiveInDays: 0,
      expiryInDays: -17,
      expectedMessage: CREATION_MESSAGES.expiryBeforeToday,
    },
  ] as const) {
    test(`${dates.caseId}: should block the save and report the date rule when ${dates.label}`, async ({
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
        await form.fillContactInformation(payer);
        await form.clickNext();
        await form.expectFieldPresent('Expiry Date');
      });

      await steps.step('Both date fields display the entered values', async () => {
        await form.fillDateField('Effective Date', expiryDate(dates.effectiveInDays));
        await form.fillDateField('Expiry Date', expiryDate(dates.expiryInDays));
        await form.expectFieldValue('Expiry Date', expiryDate(dates.expiryInDays));
      });

      await steps.step('The date rule is reported against the Expiry Date', () =>
        form.expectFieldError('Expiry Date', dates.expectedMessage));

      await steps.step('No payer is created from the refused dates', async () => {
        await form.closeAndDiscard();
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        await payerManagementPage.expectEmptyState();
      });
    });
  }

  test('TC-015: should submit without a date error when the expiry date is one day after the effective date', async ({
    payerManagementPage,
    steps,
  }) => {
    const effective = DateUtils.todayFormatted();
    const expiry = expiryDate(1);
    const payer = buildUniquePayer({ effectiveDate: effective, expiryDate: expiry });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.expectFieldPresent('Expiry Date');
    });

    await steps.step('Both dates are accepted with no validation error', async () => {
      await form.fillEffectivePeriod(payer);
      await form.expectFieldValue('Expiry Date', expiry);
      await form.expectNoFieldError('Expiry Date');
      await form.expectNoFieldError('Effective Date');
    });

    await steps.step('The form submits and the payer is created', async () => {
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, 'the create should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(200);
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.waitForRowVisible(payer.nameEn);
    });
  });
});
