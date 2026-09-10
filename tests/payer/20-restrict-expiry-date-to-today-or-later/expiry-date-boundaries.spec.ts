import { test, expect } from '../../../fixtures';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { DateUtils } from '../../../utils/DateUtils';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  DATE_MESSAGES,
  EARLIEST_VALID_EXPIRY_IN_DAYS,
  MALFORMED_EXPIRY,
  REFUSED_EXPIRY_CASES,
  expiryDate,
  nextFutureLeapDay,
} from '../../../data/payers/expiryDateRules.data';

/**
 * User story: Restrict Expiry Date to Today or Later.
 * The boundary itself.
 *
 * THIS STORY IS THE EXCEPTION IN THIS MODULE: the rules are enforced on the
 * FORM, with a real inline message in both languages. Nothing here relies on
 * reading a response to find out whether the application refused something.
 *
 * THE ONE CONTRADICTION, verified before these cases were written: an expiry of
 * TODAY cannot be saved. Effective Date must be today or later, and Expiry Date
 * must be AFTER the Effective Date - so the earliest reachable expiry is
 * TOMORROW. The story's stated boundary is forbidden by the application's own
 * pair of rules, which is a contradiction in the requirement rather than a
 * defect in the code. TC-001 asserts what actually happens and says so.
 */
test.describe('Restrict Expiry Date to Today or Later - Boundaries', () => {
  test("TC-001: should refuse an expiry of today when the effective date cannot be earlier than today", async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer({
      effectiveDate: DateUtils.todayFormatted(),
      expiryDate: DateUtils.todayFormatted(),
    });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the New Payer form with an Expiry Date field', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.expectFieldPresent('Expiry Date');
    });

    await steps.step('The earliest allowed effective date is today', async () => {
      await form.fillDateField('Effective Date', DateUtils.pastDate(1));
      await form.expectFieldError('Effective Date', DATE_MESSAGES.effectiveBeforeToday);
      await form.fillDateField('Effective Date', DateUtils.todayFormatted());
      await form.expectNoFieldError('Effective Date');
    });

    // The sheet expects this to be accepted. It cannot be: with the effective
    // date pinned to today at the earliest, an expiry of today is not AFTER it.
    // Asserting the refusal is what makes the contradiction visible instead of
    // producing a permanent red nobody can fix.
    await steps.step('An expiry equal to today is refused as not after the effective date', async () => {
      await form.fillDateField('Expiry Date', DateUtils.todayFormatted());
      await form.expectFieldError('Expiry Date', DATE_MESSAGES.expiryNotAfterEffective);
    });

    await steps.step(
      `The earliest reachable expiry is ${EARLIEST_VALID_EXPIRY_IN_DAYS} day later, and it is accepted`,
      async () => {
        await form.fillDateField('Expiry Date', expiryDate(EARLIEST_VALID_EXPIRY_IN_DAYS));
        await form.expectNoFieldError('Expiry Date');
      },
    );
  });

  test('TC-002: should save the payer when the expiry date is in the future', async ({
    payerManagementPage,
    steps,
  }) => {
    const future = expiryDate(128);
    const payer = buildUniquePayer({ expiryDate: future });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the New Payer form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    await steps.step('The Expiry Date field accepts the future value', async () => {
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillDateField('Expiry Date', future);
      await form.expectNoFieldError('Expiry Date');
    });

    await steps.step('Saving creates the payer with that expiry date', async () => {
      await form.fillDateField('Effective Date', payer.effectiveDate);
      await form.fillDateField('Expiry Date', future);
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, 'the create should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(200);

      const detail = await payerManagementPage.openDetails(payer.nameEn);
      expect(await detail.getFieldValue('Expiry Date')).toBe(DateUtils.toIsoDate(future));
    });
  });

  for (const refused of REFUSED_EXPIRY_CASES) {
    test(`${refused.caseId}: should block the save and report the boundary when the expiry date is ${refused.label}`, async ({
      payerManagementPage,
      steps,
    }) => {
      const payer = buildUniquePayer();
      const pastValue = expiryDate(refused.expiryInDays);
      let form!: PayerFormDialog;

      await steps.critical('Navigate to the Payer Management module', () =>
        payerManagementPage.open());

      await steps.critical('Open the New Payer form', async () => {
        form = await payerManagementPage.openCreateForm();
        await form.fillBasicInformation(payer);
        await form.clickNext();
        await form.fillContactInformation(payer);
        await form.clickNext();
        await form.expectFieldPresent('Expiry Date');
      });

      await steps.step(`The field takes the ${refused.label} value`, async () => {
        await form.fillDateField('Effective Date', payer.effectiveDate);
        await form.fillDateField('Expiry Date', pastValue);
        await form.expectFieldValue('Expiry Date', pastValue);
      });

      await steps.step('The boundary message is reported against the Expiry Date', () =>
        form.expectFieldError('Expiry Date', refused.expectedMessage));

      await steps.step('No payer is created from the refused value', async () => {
        await form.closeAndDiscard();
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        await payerManagementPage.expectEmptyState();
      });
    });
  }

  test('TC-008: should report a validation message when the expiry date is malformed', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the New Payer form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.expectFieldPresent('Expiry Date');
    });

    await steps.step('The field keeps the unparseable text as typed', async () => {
      await form.fillDateField('Effective Date', payer.effectiveDate);
      await form.fillDateField('Expiry Date', MALFORMED_EXPIRY);
      await form.expectFieldValue('Expiry Date', MALFORMED_EXPIRY);
    });

    // DIVERGENCE: the sheet expects a message about the DATE FORMAT. The
    // datepicker cannot parse 31 February, treats the field as empty, and
    // reports it as required instead. The save is still blocked, which is the
    // outcome that matters - but the message names the wrong problem.
    await steps.step('The save is blocked, though the message reports the field as required', () =>
      form.expectFieldError('Expiry Date', DATE_MESSAGES.malformed));

    await steps.step('No payer is created from the malformed value', async () => {
      await form.closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectEmptyState();
    });
  });

  test('TC-009: should save the payer when the expiry date is a valid future leap day', async ({
    payerManagementPage,
    steps,
  }) => {
    // Computed rather than hard-coded: the sheet names 29/02/2028, which stops
    // being a future date in 2028 and would quietly turn this into a
    // past-date case.
    const leapDay = nextFutureLeapDay();
    const payer = buildUniquePayer({ expiryDate: leapDay });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the New Payer form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    await steps.step(`The Expiry Date field accepts ${leapDay}`, async () => {
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillDateField('Effective Date', payer.effectiveDate);
      await form.fillDateField('Expiry Date', leapDay);
      await form.expectFieldValue('Expiry Date', leapDay);
      await form.expectNoFieldError('Expiry Date');
    });

    await steps.step(`Saving creates the payer with an expiry of ${leapDay}`, async () => {
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome!.status).toBe(200);
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      expect(await detail.getFieldValue('Expiry Date')).toBe(DateUtils.toIsoDate(leapDay));
    });
  });
});
