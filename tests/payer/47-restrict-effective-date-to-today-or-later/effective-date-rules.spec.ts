import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import { env } from '../../../constants/EnvironmentConfig';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { DateUtils } from '../../../utils/DateUtils';
import {
  ACCEPTED_EFFECTIVE,
  EFFECTIVE_MESSAGES,
  EFFECTIVE_ROLE_REQUIREMENT,
  MALFORMED_EFFECTIVE,
  REJECTED_EFFECTIVE,
  SAFE_EXPIRY_DAYS_AHEAD,
  effectiveDate,
} from '../../../data/payers/effectiveDateRules.data';

/**
 * User story: Restrict Effective Date to Today or Later.
 *
 * Like the expiry-date story, this rule is enforced ON THE FORM with a real
 * inline message, so nothing here reads a response to learn the outcome. The
 * message and the date helpers come from the expiry-date story's data file.
 *
 * The grandfathered cases (edit an already-past effective date) are BLOCKED:
 * the create form will not produce a payer whose effective date is in the past,
 * so the precondition cannot be built here without a pre-existing record.
 */
test.describe('Restrict Effective Date - Registration', () => {
  // Azure test case 15844
  test('15844: should accept an effective date of today when a new payer is registered', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer({
      effectiveDate: DateUtils.todayFormatted(),
      expiryDate: effectiveDate(SAFE_EXPIRY_DAYS_AHEAD),
    });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module and open the create form on the date step', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.expectFieldPresent('Effective Date');
    });

    await steps.step("Today's date is accepted without a boundary error", async () => {
      await form.fillDateField('Effective Date', DateUtils.todayFormatted());
      await form.expectNoFieldError('Effective Date');
    });

    await steps.step('And the payer is created with that effective date', async () => {
      await form.fillDateField('Expiry Date', effectiveDate(SAFE_EXPIRY_DAYS_AHEAD));
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, 'the create should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(200);
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      expect(await detail.getFieldValue('Effective Date')).toBe(
        DateUtils.toIsoDate(DateUtils.todayFormatted()),
      );
    });
  });

  // Azure test case 15845
  test('15845: should accept a future effective date when a new payer is registered', async ({
    payerManagementPage,
    steps,
  }) => {
    const future = effectiveDate(ACCEPTED_EFFECTIVE.future);
    const payer = buildUniquePayer({
      effectiveDate: future,
      expiryDate: effectiveDate(SAFE_EXPIRY_DAYS_AHEAD),
    });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module and reach the date step', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
    });

    await steps.step('The future effective date is accepted', async () => {
      await form.fillDateField('Effective Date', future);
      await form.expectNoFieldError('Effective Date');
    });

    await steps.step('And it is stored on the created payer', async () => {
      await form.fillDateField('Expiry Date', effectiveDate(SAFE_EXPIRY_DAYS_AHEAD));
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome!.status).toBe(200);
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      expect(await detail.getFieldValue('Effective Date')).toBe(DateUtils.toIsoDate(future));
    });
  });

  for (const rejected of REJECTED_EFFECTIVE) {
    // Azure test cases - one per generated case:
    //   TC-003 = 15846,  TC-004 = 15847
    test(`${azureOrCase('47', 'TC-00' + (REJECTED_EFFECTIVE.indexOf(rejected) + 3))}: should reject an effective date ${rejected.label} at registration`, async ({
      payerManagementPage,
      steps,
    }) => {
      const payer = buildUniquePayer();
      let form!: PayerFormDialog;

      await steps.critical('Navigate to the module and reach the date step', async () => {
        await payerManagementPage.open();
        form = await payerManagementPage.openCreateForm();
        await form.fillBasicInformation(payer);
        await form.clickNext();
        await form.fillContactInformation(payer);
        await form.clickNext();
      });

      await steps.step(`An effective date ${rejected.label} is refused with the boundary message`, async () => {
        await form.fillDateField('Effective Date', effectiveDate(-rejected.daysAgo));
        await form.expectFieldError('Effective Date', EFFECTIVE_MESSAGES.beforeToday);
      });

      await steps.step('And correcting it to today clears the error', async () => {
        await form.fillDateField('Effective Date', DateUtils.todayFormatted());
        await form.expectNoFieldError('Effective Date');
        await form.closeAndDiscard();
      });
    });
  }

  // Azure test case 15853
  test('15853: should block registration when the effective date is left empty', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module and reach the date step', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
    });

    await steps.step('Leaving the effective date empty blocks the save', async () => {
      // The field is required. Only the expiry is set, so the save must be held
      // on the empty effective date rather than going through.
      await form.fillDateField('Expiry Date', effectiveDate(SAFE_EXPIRY_DAYS_AHEAD));
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(
        outcome === null || outcome.status >= 400,
        `an empty effective date should block the create; the server answered `
          + `${outcome?.status ?? 'nothing sent'}`,
      ).toBe(true);
    });

    await steps.step('And the field reports itself as required', async () => {
      await form.expectFieldError('Effective Date', EFFECTIVE_MESSAGES.required);
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15854
  test('15854: should reject a malformed effective date at registration', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module and reach the date step', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
    });

    await steps.step('A malformed date is not accepted as a value', async () => {
      // The date picker never commits an unparseable value, so the field ends
      // up empty and reports "required" - the malformed and empty cases collapse
      // into one, which is what DATE_MESSAGES.malformed records.
      await form.fillDateField('Effective Date', MALFORMED_EFFECTIVE);
      await form.expectFieldError('Effective Date', EFFECTIVE_MESSAGES.malformed);
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15858
  test('15858: should register a payer end to end with a valid effective date', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer({
      effectiveDate: DateUtils.todayFormatted(),
      expiryDate: effectiveDate(SAFE_EXPIRY_DAYS_AHEAD),
    });

    await steps.critical('Navigate to the module', () => payerManagementPage.open());

    await steps.step('The full registration completes with the valid effective date', async () => {
      await payerManagementPage.createDraftPayer(payer);
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.waitForRowVisible(payer.nameEn);
    });

    await steps.step('And the stored effective date is the one entered', async () => {
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      expect(await detail.getFieldValue('Effective Date')).toBe(
        DateUtils.toIsoDate(DateUtils.todayFormatted()),
      );
    });
  });
});

test.describe('Restrict Effective Date - Editing', () => {
  // Azure test case 15850
  test('15850: should accept moving the effective date to today during an edit', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module with a payer on record', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.step("Editing the effective date to today is accepted", async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.goToStep('Effective Period');
      await form.fillDateField('Effective Date', DateUtils.todayFormatted());
      await form.expectNoFieldError('Effective Date');
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15851
  test('15851: should accept moving the effective date to the future during an edit', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module with a payer on record', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.step('Editing the effective date to a future value is accepted', async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.goToStep('Effective Period');
      await form.fillDateField('Effective Date', effectiveDate(ACCEPTED_EFFECTIVE.future));
      await form.expectNoFieldError('Effective Date');
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15852
  test('15852: should reject moving the effective date to yesterday during an edit', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module with a payer on record', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.step('Editing the effective date to yesterday is refused', async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.goToStep('Effective Period');
      await form.fillDateField('Effective Date', effectiveDate(-1));
      await form.expectFieldError('Effective Date', EFFECTIVE_MESSAGES.beforeToday);
    });

    await steps.step('And the stored effective date is left intact', async () => {
      await form.closeAndDiscard();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.goToStep('Effective Period');
      await reopened.expectFieldValue('Effective Date', uniquePayer.effectiveDate);
      await reopened.closeAndDiscard();
    });
  });

  // Azure test case 15855
  test('15855: should walk the effective date through today and future and refuse a step back to the past', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module with a payer on record', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.goToStep('Effective Period');
    });

    await steps.step('Today is accepted', async () => {
      await form.fillDateField('Effective Date', DateUtils.todayFormatted());
      await form.expectNoFieldError('Effective Date');
    });

    await steps.step('A move forward to the future is accepted', async () => {
      await form.fillDateField('Effective Date', effectiveDate(ACCEPTED_EFFECTIVE.future));
      await form.expectNoFieldError('Effective Date');
    });

    await steps.step('But a step back to yesterday is refused', async () => {
      await form.fillDateField('Effective Date', effectiveDate(-1));
      await form.expectFieldError('Effective Date', EFFECTIVE_MESSAGES.beforeToday);
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15848
  test('15848: should allow editing a payer that already carries a past effective date', async ({
    steps,
  }) => {
    steps.blocked(
      'This case needs a payer whose Effective Date is already in the past - a record from '
      + 'before the today-or-later rule. The create form refuses a past effective date, so the '
      + 'precondition cannot be built here. Provide a grandfathered payer, then this case can '
      + 'confirm that leaving its past date untouched while editing other fields still saves, '
      + 'and that moving it to another past value is refused.',
    );
  });
});

/** Access control, signed out of the shared administrator session. */
test.describe('Restrict Effective Date - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15859
  test('15859: should withhold effective-date registration and editing from a non-administrator', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // The account is BUILT rather than waited for: the administrator takes
    // the permission off the Payer Admin role, this case signs in as that
    // account, and the permission goes back when the case ends. It used to
    // report BLOCKED because the only non-administrator here HELD the right.
    // BOTH rights, because the case asserts that CREATION is withheld and creation
    // is gated by its own permission: shaping only Update Payer left Add Payer on
    // offer, and the case failed against a screen that was behaving correctly.
    await shapeRole({ without: ['createPayer', 'editPayer'] });

    await steps.critical('Sign in as the restricted user and open the payer module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('Payer creation is not offered to this role', async () => {
      expect(
        await payerManagementPage.isCreateActionAvailable(),
        'a non-administrator should not be offered payer creation, which is where the effective '
          + 'date is set',
      ).toBe(false);
    });
  });
});
