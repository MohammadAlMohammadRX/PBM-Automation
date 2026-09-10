import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  COMBINED_VIOLATION_BLOCKER,
  DUPLICATE_EMAIL_RESPONSE,
  DUPLICATE_MESSAGE_PATTERNS,
  UNIQUE_EMAIL_STATUS,
} from '../../../data/payers/payerEmailUniqueness.data';

/**
 * User story: Enforce Payer Email Uniqueness Across the Register.
 * The rule as it applies to EDITS, to approval, and under concurrency.
 *
 * See email-uniqueness.spec.ts for what the rule does and the missing-message
 * defect that runs through every case in this story.
 */
test.describe('Enforce Payer Email Uniqueness - Edit and approval', () => {
  test('TC-004: should save without a duplicate-email error when a different field is edited and the email is left alone', async ({
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
      await form.expectFieldValue('Email Address', uniquePayer.email);
    });

    await steps.step('The phone number is changed and reflected in the field', async () => {
      await form.setFieldValue('Phone Number', '512340000', 'text');
      await form.expectFieldValue('Phone Number', '512340000');
    });

    // The point of the case: the record's OWN address must not be treated as a
    // duplicate of itself. A naive uniqueness check that ignored the record's
    // identity would refuse every edit that left the email untouched.
    await steps.step('The record saves with no duplicate-email error raised', async () => {
      const outcome = await form.saveAndCaptureOutcome();
      expect(outcome, 'the update should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(UNIQUE_EMAIL_STATUS);
      expect(outcome!.text).not.toContain('already taken');
    });

    await steps.step('The edited value persisted and the email is unchanged', async () => {
      await payerManagementPage.open();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.expectFieldValue('Phone Number', '512340000');
      await reopened.expectFieldValue('Email Address', uniquePayer.email);
      await reopened.closeAndDiscard();
    });
  });

  test('TC-005: should refuse the pending change when an edited email duplicates another payer at approval time', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    const other = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module with two payers on record', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(other);
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.critical("Open one payer and point its email at the other's address", async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.setFieldValue('Email Address', other.email, 'text');
      await form.expectFieldValue('Email Address', other.email);
    });

    // The sheet expects the conflict to surface when the change is APPROVED,
    // i.e. that the pending change is re-validated at that point. In practice
    // the save is refused immediately, before the change is ever staged - so
    // there is no pending change to approve. That is a stronger guarantee, and
    // asserting it is more honest than driving an approval that cannot exist.
    await steps.step('The change is refused at save time, before it can be staged', async () => {
      const outcome = await form.saveAndCaptureOutcome();
      expect(outcome, 'the update should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(DUPLICATE_EMAIL_RESPONSE.status);
      expect(outcome!.text).toContain(other.email);
    });

    await steps.step('A message names the conflicting address', async () => {
      const messages = await form.waitForVisibleMessages();
      expect(
        messages,
        'The refusal is correct but silent - no toast, no inline error, no dialog.',
      ).not.toEqual([]);
      expect(messages.some((m) => DUPLICATE_MESSAGE_PATTERNS.en.test(m))).toBe(true);
    });

    await steps.step("The record keeps its original address and no change is pending", async () => {
      await form.closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      await payerManagementPage.expectRowCellEquals(
        uniquePayer.nameEn,
        PAYER_COLUMN.email,
        uniquePayer.email,
      );
    });
  });

  test('TC-006: should report both violations when a single change carries a duplicate email and a deletion dependency', async ({
    payerManagementPage,
    steps,
  }) => {
    // BLOCKED rather than approximated. The sheet asks for ONE pending change
    // carrying both an email conflict and a staged deletion, then for both
    // violations to be reported together. The application stages those as two
    // independent actions - the wizard saves an edit, the row action stages a
    // deletion - with no path to submit them as a single change. So the
    // combined re-validation the case describes cannot be constructed, and
    // neither a pass nor a failure would say anything true about it.
    steps.blocked(COMBINED_VIOLATION_BLOCKER.reason);

    await steps.step('The payer module is reachable', () => payerManagementPage.open());
  });

  test('TC-011: should name the already-used address in both languages when a duplicate save is refused', async ({
    payerManagementPage,
    uniquePayer,
    languageSwitcher,
    steps,
  }) => {
    const duplicate = buildUniquePayer({ email: uniquePayer.email });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module with an existing payer on record', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.critical('Attempt to save a new payer with the same address', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(duplicate);
      await form.clickNext();
      await form.fillContactInformation(duplicate);
      await form.clickNext();
      await form.fillEffectivePeriod(duplicate);
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome!.status).toBe(DUPLICATE_EMAIL_RESPONSE.status);
    });

    await steps.step('The English interface shows a message naming the address', async () => {
      const messages = await form.waitForVisibleMessages();
      expect(messages, 'no message of any kind is shown on the 409').not.toEqual([]);
      expect(
        messages.some((message) => message.includes(uniquePayer.email)),
        `The message should name "${uniquePayer.email}". Saw: ${JSON.stringify(messages)}`,
      ).toBe(true);
    });

    // The list is reopened before switching: the header toggle sits behind the
    // drawer's overlay, which outlives the discard by a moment.
    await steps.step('The Arabic interface shows the same message naming the address', async () => {
      await form.closeAndDiscard();
      await payerManagementPage.open();
      await languageSwitcher.switchTo('ar');
      await payerManagementPage.open();

      const arabicForm = await payerManagementPage.openCreateForm();
      await arabicForm.fillBasicInformationInArabic(duplicate);
      await arabicForm.clickNext();
      await arabicForm.fillContactInformationInArabic(duplicate);
      await arabicForm.clickNext();
      await arabicForm.fillEffectivePeriod(duplicate);
      const outcome = await arabicForm.saveNewAndCaptureOutcome();
      expect(outcome!.status).toBe(DUPLICATE_EMAIL_RESPONSE.status);

      const messages = await arabicForm.waitForVisibleMessages();
      expect(messages, 'no message is shown in Arabic either').not.toEqual([]);
      expect(messages.some((message) => message.includes(uniquePayer.email))).toBe(true);
      await arabicForm.closeAndDiscard();
    });

    await steps.step('No duplicate payer was created in either language', async () => {
      await payerManagementPage.open();
      await languageSwitcher.switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.search(duplicate.nameEn);
      await payerManagementPage.expectEmptyState();
    });
  });

  test('TC-012: should let only the first save through when two sessions submit the same address', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    const second = buildUniquePayer({ email: uniquePayer.email });
    let secondForm!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.step('Session 1 fills the New Payer form without saving', async () => {
      const form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(uniquePayer);
      await form.clickNext();
      await form.fillContactInformation(uniquePayer);
      await form.clickNext();
      await form.fillEffectivePeriod(uniquePayer);
      await form.expectFieldValue('Effective Date', uniquePayer.effectiveDate);
    });

    await steps.step('Session 2 fills its form with the same address', async () => {
      await staleSession.payerPage.open();
      secondForm = await staleSession.payerPage.openCreateForm();
      await secondForm.fillBasicInformation(second);
      await secondForm.clickNext();
      await secondForm.fillContactInformation(second);
      await secondForm.expectFieldValue('Email Address', uniquePayer.email);
      await secondForm.clickNext();
      await secondForm.fillEffectivePeriod(second);
    });

    await steps.step("Session 1's payer is created successfully", async () => {
      const form = payerManagementPage.form();
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, "session 1's create should have reached the server").not.toBeNull();
      expect(outcome!.status).toBe(UNIQUE_EMAIL_STATUS);
    });

    await steps.step("Session 2's save is refused as a duplicate", async () => {
      const outcome = await secondForm.saveNewAndCaptureOutcome();
      expect(outcome, "session 2's create should have reached the server").not.toBeNull();
      expect(outcome!.status).toBe(DUPLICATE_EMAIL_RESPONSE.status);
      expect(outcome!.text).toContain(uniquePayer.email);
    });

    // Asserted by NAME, not by searching the address. The keyword search is
    // documented as name/code and was verified to match licence numbers, but its
    // behaviour for an email was never established - and an unverified search
    // returning three rows says nothing about how many payers hold the address.
    // Checking the winner kept it and the loser was never created says exactly
    // that, using lookups this suite already relies on everywhere else.
    await steps.step('Only one payer holds the address', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowCellEquals(
        uniquePayer.nameEn,
        PAYER_COLUMN.email,
        uniquePayer.email,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(second.nameEn);
      await payerManagementPage.expectEmptyState();
    });
  });
});
