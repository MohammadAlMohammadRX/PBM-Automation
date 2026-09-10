import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { PAYER_NAME_AR_LABEL, buildUniquePayer } from '../../../data/payers/payer.data';
import { PAYER_TYPE_AR } from '../../../data/payers/payerTypes';
import { DateUtils } from '../../../utils/DateUtils';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  DATE_MESSAGES,
  DATE_MESSAGES_AR,
  RESTRICTED_ROLE_REQUIREMENT,
  expiryDate,
} from '../../../data/payers/expiryDateRules.data';

/**
 * User story: Restrict Expiry Date to Today or Later.
 * The rule as it applies to edits, to persistence, and across languages.
 *
 * See expiry-date-boundaries.spec.ts for the rules themselves and the one
 * contradiction in the story (an expiry of today is unreachable).
 */
test.describe('Restrict Expiry Date to Today or Later - Rules and persistence', () => {
  test('TC-005: should report the right combination of messages when each decision-table row is exercised', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    // Case A asks for a required-field error and the expiry error to appear
    // TOGETHER. They cannot: the wizard validates per step, so an empty Payer
    // Name on step 1 stops it advancing and the Expiry Date field on step 3 is
    // never reached, let alone filled with a past date. What is asserted is
    // that the required error appears AND the expiry field stays unreachable -
    // which is the honest form of the row, and explains why the sheet's "both
    // messages" expectation cannot hold in this wizard.
    await steps.step(
      'Case A - an empty mandatory field is reported and the expiry field is never reached',
      async () => {
        const payer = buildUniquePayer();
        await payerManagementPage.open();
        const form = await payerManagementPage.openCreateForm();
        await form.fillBasicInformation(payer, 'Payer Name');
        await form.attemptNext();
        await form.expectFieldRequired('Payer Name', DATE_MESSAGES.required);
        await form.expectActiveStep('Basic Information');
        await form.closeAndDiscard();
      },
    );

    // Case B: everything valid - the record saves.
    await steps.step(
      'Case B - every mandatory field is filled and the expiry is valid, so the payer saves',
      async () => {
        const payer = buildUniquePayer({ expiryDate: expiryDate(128) });
        await payerManagementPage.open();
        await payerManagementPage.createDraftPayer(payer);
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        await payerManagementPage.waitForRowVisible(payer.nameEn);
      },
    );

    // Case C: mandatory fields fine, expiry in the past - ONLY the expiry
    // message appears. The point of the row is that a valid form does not
    // attract unrelated required-field noise alongside the real problem.
    await steps.step(
      'Case C - only the expiry message is reported when everything else is valid',
      async () => {
        const payer = buildUniquePayer();
        await payerManagementPage.open();
        const form = await payerManagementPage.openCreateForm();
        await form.fillBasicInformation(payer);
        await form.clickNext();
        await form.fillContactInformation(payer);
        await form.clickNext();
        await form.fillDateField('Effective Date', payer.effectiveDate);
        await form.fillDateField('Expiry Date', expiryDate(-1));
        await form.expectFieldError('Expiry Date', DATE_MESSAGES.expiryBeforeToday);
        await form.expectNoFieldError('Effective Date');
        await form.closeAndDiscard();
      },
    );
  });

  test('TC-006: should block the save and keep the stored date when an existing expiry is changed to the past', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module with an existing payer on record', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.critical("Open the payer's record for editing", async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.goToStep('Effective Period');
      await form.expectFieldValue('Expiry Date', uniquePayer.expiryDate);
    });

    await steps.step('The Expiry Date is changed to a past date', async () => {
      await form.fillDateField('Expiry Date', expiryDate(-1));
      await form.expectFieldValue('Expiry Date', expiryDate(-1));
    });

    await steps.step('The save is blocked with the boundary message', () =>
      form.expectFieldError('Expiry Date', DATE_MESSAGES.expiryBeforeToday));

    await steps.step('Reopening the record shows the original expiry date intact', async () => {
      await form.closeAndDiscard();
      await payerManagementPage.open();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.goToStep('Effective Period');
      await reopened.expectFieldValue('Expiry Date', uniquePayer.expiryDate);
      await reopened.closeAndDiscard();
    });
  });

  test('TC-007: should display the saved expiry date when the newly created payer is reopened', async ({
    payerManagementPage,
    steps,
  }) => {
    const chosen = expiryDate(113);
    const payer = buildUniquePayer({ expiryDate: chosen });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.step('Every field shows an accepted value, including the expiry date', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillEffectivePeriod(payer);
      await form.expectFieldValue('Expiry Date', chosen);
      await form.expectNoFieldError('Expiry Date');
    });

    await steps.step('The record is created', async () => {
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, 'the create should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(200);
    });

    await steps.step('Reopening the record shows the expiry date it was saved with', async () => {
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      expect(await detail.getFieldValue('Expiry Date')).toBe(DateUtils.toIsoDate(chosen));
    });
  });

  test('TC-010: should record the intended calendar day when an expiry is submitted close to local midnight', async ({
    payerManagementPage,
    steps,
  }) => {
    // EXPLORATORY, as the sheet frames it. The timezone half cannot be driven -
    // the suite has no way to place the session in another offset, and no
    // amount of test code can move the server's clock. What IS assertable, and
    // is the invariant the case really cares about, is that the day stored is
    // the day chosen: no off-by-one from a UTC conversion.
    const chosen = expiryDate(1);
    const payer = buildUniquePayer({ expiryDate: chosen });

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.step('An expiry of tomorrow is accepted pending save', async () => {
      const form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillEffectivePeriod(payer);
      await form.expectFieldValue('Expiry Date', chosen);
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome!.status).toBe(200);
    });

    await steps.step('The stored expiry is the exact calendar day chosen', async () => {
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      // An off-by-one from a timezone conversion would show as the day either
      // side of the one submitted, which this exact comparison catches.
      expect(await detail.getFieldValue('Expiry Date')).toBe(DateUtils.toIsoDate(chosen));
    });
  });

  test('TC-011: should state the boundary in both languages when a past expiry date is refused', async ({
    payerManagementPage,
    languageSwitcher,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await languageSwitcher.switchTo('en');
      await payerManagementPage.open();
    });

    await steps.step('The English interface states the expiry boundary', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillDateField('Effective Date', payer.effectiveDate);
      await form.fillDateField('Expiry Date', expiryDate(-1));
      await form.expectFieldError('Expiry Date', DATE_MESSAGES.expiryBeforeToday);
    });

    // The list is reopened before switching: the header toggle sits behind the
    // drawer's overlay, which outlives the discard by a moment.
    await steps.step('The Arabic interface states the same boundary', async () => {
      await form.closeAndDiscard();
      await payerManagementPage.open();
      await languageSwitcher.switchTo('ar');
      await payerManagementPage.open();

      const arabicForm = await payerManagementPage.openCreateForm();
      await arabicForm.fillTextField('Payer Name', payer.nameEn);
      await arabicForm.fillTextField(PAYER_NAME_AR_LABEL, payer.nameAr);
      await arabicForm.selectDropdownOption('Payer Type', PAYER_TYPE_AR[payer.type]);
      await arabicForm.clickNext();
      await arabicForm.fillContactInformationInArabic(payer);
      await arabicForm.clickNext();
      await arabicForm.fillDateField('Effective Date', DateUtils.todayFormatted());
      await arabicForm.fillDateField('Expiry Date', expiryDate(-1));
      await arabicForm.expectFieldError('Expiry Date', DATE_MESSAGES_AR.expiryBeforeToday);
      await arabicForm.closeAndDiscard();
    });

    await steps.step('No payer was created by either refused attempt', async () => {
      await payerManagementPage.open();
      await languageSwitcher.switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectEmptyState();
    });
  });
});

test.describe('Restrict Expiry Date to Today or Later - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-012: should withhold the Expiry Date field when a payer is opened by a non-administrator', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // BLOCKED, not FAIL: without a restricted account the withholding this case
    // exists to prove can never be exercised.
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. ${
          RESTRICTED_ROLE_REQUIREMENT.reason
        } Set them to an account holding the "${RESTRICTED_ROLE_REQUIREMENT.role}" role, then `
          + 're-run this case.',
      );
    }

    await steps.critical('Navigate to the Payer Management module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    await steps.step('The list opens in restricted mode for this role', () =>
      payerManagementPage.expectSearchAccessRestricted());

    await steps.step('Neither creating nor editing a payer is offered', async () => {
      await payerManagementPage.expectCreateActionDenied();
      await payerManagementPage.expectEditActionDenied();
    });
  });
});
