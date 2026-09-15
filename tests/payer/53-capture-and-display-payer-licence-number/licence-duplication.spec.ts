import { test, expect } from '../../../fixtures';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { PRIMARY_REASON } from '../../../data/payers/inactivationDecisions.data';
import { DUPLICATE_HINT, SHARED_LICENCE } from '../../../data/payers/licenceDuplication.data';

/**
 * User story: Capture and Display Payer Licence Number.
 *
 * Only the two cases the licence-number-length story did not cover: duplicate
 * handling across payers, and persistence of the licence through a status
 * transition. Everything else - length, required, trimming, special characters,
 * the list column, search, export - is REUSE, mapped in the traceability matrix.
 */
test.describe('Payer licence number - duplication and persistence', () => {
  test('TC-001: should handle a second payer taking a licence another payer already holds', async ({
    payerManagementPage,
    steps,
  }) => {
    const first = buildUniquePayer({ licenseNumber: SHARED_LICENCE });
    const second = buildUniquePayer({ licenseNumber: SHARED_LICENCE });
    let outcome: { status: number } | null = null;
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module and create the first payer with the licence', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(first);
      await payerManagementPage.open();
      await payerManagementPage.search(first.nameEn);
      await payerManagementPage.waitForRowVisible(first.nameEn);
    });

    await steps.step('A second payer tries to save with the same licence', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(second);
      await form.clickNext();
      await form.fillContactInformation(second);
      await form.clickNext();
      await form.fillEffectivePeriod(second);
      outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, 'the create attempt should have reached the server').not.toBeNull();
    });

    await steps.step('The duplicate is refused with a duplicate-licence error', async () => {
      // The sheet's expectation, asserted as stated. NO uniqueness rule was
      // specified with the story, so if the second payer is accepted this fails
      // and reports that the app allows a shared licence - the finding, and the
      // missing rule, both surfaced rather than guessed.
      const rejected = outcome !== null && outcome.status >= 400;
      const messages = await form.waitForVisibleMessages().catch(() => []);
      const named = messages.some((m) => DUPLICATE_HINT.test(m));
      expect(
        rejected || named,
        `a duplicate licence should be refused with a clear error; the server answered `
          + `${outcome?.status ?? 'nothing'} and the form showed: ${messages.join(' | ') || '(nothing)'}`,
      ).toBe(true);
      await form.closeAndDiscard().catch(() => undefined);
    });

    await steps.step('And no second payer was created with that licence', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(second.nameEn);
      await payerManagementPage.expectRowNotVisible(second.nameEn);
    });
  });

  test('TC-002: should keep the licence number through an inactivation status change', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    let licenceBefore = '';

    await steps.critical('Navigate to the module and read an Active payer\'s licence', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      licenceBefore = await detail.getFieldValue('License Number');
      expect(licenceBefore, 'the payer should carry a licence to track').not.toBe('');
    });

    await steps.step('The payer is inactivated and the change approved', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('The licence survives the transition unchanged', async () => {
      // A status change must not disturb the record's other data - a licence
      // that shifted during inactivation would be a silent data-integrity fault.
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        await detail.getFieldValue('License Number'),
        `the licence should be unchanged by the status transition; it was "${licenceBefore}"`,
      ).toBe(licenceBefore);
    });
  });
});
