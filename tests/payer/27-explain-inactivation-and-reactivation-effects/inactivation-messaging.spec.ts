import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { INACTIVATION_REASONS } from '../../../data/payers/lifecycleGuardrails.data';
import {
  IMPACT_SUMMARY_PATTERN,
  INACTIVATION_WARNING,
  REQUIRED_DIALOG_ACTIONS,
  SUCCESS_TOAST,
} from '../../../data/payers/cascadeMessaging.data';

/**
 * User story: Explain Inactivation and Reactivation Effects Before They Are
 * Applied.
 * What the inactivation confirmation says, and what Cancel leaves behind.
 *
 * ONE ROUTE DIFFERENCE, STATED ONCE: the sheet opens the payer's detail view
 * and clicks Inactivate there. The detail screen carries no lifecycle action -
 * only tabs - so these cases act from the payer list's row action, which is
 * where the application puts it. That is a difference in journey, not in
 * capability, and it is not re-reported per case.
 *
 * WHAT THE APPLICATION GETS RIGHT HERE, verified before these were written: the
 * drawer explains all three things the story asks for - that active plans and
 * policies are inactivated too, that they are restored on reactivation, and
 * that the change is saved as a draft pending approval - and it adds a live
 * impact preview counting the plans, policies and members affected, which the
 * story does not even ask for.
 */
test.describe('Inactivation and reactivation effects - Inactivation messaging', () => {
  test('TC-001: should confirm the inactivation was saved when an active payer is inactivated', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    toast,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The payer is on screen showing Active', () =>
      payerManagementPage.expectLifecycleStatus(publishedPayer.nameEn, LIFECYCLE_STATUS.active.en));

    await steps.step('The Inactivate action opens a confirmation explaining the effects', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      const warning = await payerInactivateDialog.getWarningText();
      expect(warning, 'the confirmation should explain the cascade').toContain(
        INACTIVATION_WARNING.cascade,
      );
      expect(warning, 'and that the change needs approval').toContain(
        INACTIVATION_WARNING.approvalCaveat,
      );
    });

    await steps.step('Confirming closes the dialog and the update is accepted', async () => {
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      await payerInactivateDialog.confirm();
      expect(
        await payerInactivateDialog.isOpen(),
        'the dialog should close once the change is accepted',
      ).toBe(false);
    });

    await steps.step('A success message confirms what happened', () =>
      toast.expectText(SUCCESS_TOAST));
  });

  test('TC-005: should leave the payer Active and stage nothing when the inactivation is cancelled', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    let approvalBefore!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      approvalBefore = await payerManagementPage.getApprovalStatus(publishedPayer.nameEn);
      expect(approvalBefore, 'the payer should start with a published version').not.toBe('');
    });

    await steps.critical('The payer is on screen showing Active', () =>
      payerManagementPage.expectLifecycleStatus(publishedPayer.nameEn, LIFECYCLE_STATUS.active.en));

    await steps.step('The Inactivate action opens the confirmation', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.expectReasonAndDetailsOffered();
    });

    await steps.step('Cancel closes it without applying anything', async () => {
      await payerInactivateDialog.cancel();
      expect(await payerInactivateDialog.isOpen(), 'the dialog should be gone').toBe(false);
    });

    await steps.step('After a reload the payer is still Active with no draft change', async () => {
      // Both halves matter, and the second is the one a Cancel could get wrong:
      // a payer left at "v1 · Draft" would still READ Active in the status
      // column while carrying a staged inactivation nobody asked for.
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      expect(
        await payerManagementPage.getApprovalStatus(publishedPayer.nameEn),
        'a cancelled inactivation must not leave a staged change behind',
      ).toBe(approvalBefore);
    });
  });

  test('TC-013: should offer a title, an explanation and both actions in the inactivation confirmation', async ({
    payerManagementPage,
    payerInactivateDialog,
    payerSample,
    publishedPayer,
    steps,
  }) => {
    let inactivePayerName!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The inactivation confirmation is open', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.waitForOpen();
    });

    await steps.step('It carries a title, an explanation, and Confirm and Cancel', async () => {
      expect(
        await payerInactivateDialog.getWarningText(),
        'the explanation should be present and legible, not an empty container',
      ).toContain(INACTIVATION_WARNING.cascade);
      // Confirm is asserted as GATED rather than merely present: an enabled
      // Confirm on an untouched drawer would be a defect of its own, and the
      // reason field is what gates it.
      await payerInactivateDialog.expectConfirmDisabled();
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      await payerInactivateDialog.expectConfirmEnabled();
    });

    await steps.step('The reactivation confirmation carries the same four elements', async () => {
      await payerInactivateDialog.cancel();
      [inactivePayerName] = await payerSample('Inactive', LIFECYCLE_STATUS.inactive.en, 1);
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayerName);

      const dialog = await payerManagementPage.openActivationPrompt(inactivePayerName);
      expect(await dialog.getTitle(), 'the reactivation dialog should be titled').not.toBe('');
      expect(await dialog.getMessage(), 'and should explain itself').not.toBe('');
      expect(
        await dialog.getActionKeys(),
        'both a confirm and a cancel should be offered',
      ).toEqual(expect.arrayContaining([...REQUIRED_DIALOG_ACTIONS]));
      await dialog.cancel();
    });

    await steps.step('Neither payer was changed by being looked at', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayerName);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayerName,
        LIFECYCLE_STATUS.inactive.en,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  test('TC-015: should still explain the cascade and succeed when the payer has nothing to cascade', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    toast,
    steps,
  }) => {
    let impact!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The payer has no linked plans or policies', async () => {
      // A payer this suite created, so "zero linked records" is a property of
      // the fixture rather than a hope about the environment. The detail screen
      // states it in its own tab labels.
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        await detail.linkedNetworkCount(),
        'a freshly created payer should hold no linked networks',
      ).toBe(0);
    });

    await steps.step('The confirmation still explains the cascading effects', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);

      const warning = await payerInactivateDialog.getWarningText();
      expect(warning, 'the cascade explanation should not be suppressed').toContain(
        INACTIVATION_WARNING.cascade,
      );
      expect(warning, 'nor the restoration promise').toContain(INACTIVATION_WARNING.restoration);
      expect(warning, 'nor the draft caveat').toContain(INACTIVATION_WARNING.draftCaveat);
    });

    await steps.step('The impact preview reports zero of each rather than nothing at all', async () => {
      impact = await payerInactivateDialog.getImpactSummaryText();
      const counts = impact.match(IMPACT_SUMMARY_PATTERN);
      expect(counts, `the impact preview read "${impact}"`).not.toBeNull();
      expect(
        counts!.slice(1, 4).map(Number),
        'a payer with nothing linked should preview three zeroes, not an empty summary',
      ).toEqual([0, 0, 0]);
    });

    await steps.step('Confirming succeeds with no cascade errors', async () => {
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      await payerInactivateDialog.confirm();
      await toast.expectText(SUCCESS_TOAST);
      await payerManagementPage.expectNoUnexpectedDialog();
    });
  });
});
