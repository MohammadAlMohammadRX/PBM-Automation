import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  REACTIVATION_MESSAGE,
  REACTIVATION_TITLE,
  SUCCESS_TOAST,
} from '../../../data/payers/cascadeMessaging.data';

/**
 * User story: Explain Inactivation and Reactivation Effects Before They Are
 * Applied.
 * What the reactivation confirmation says, and what Cancel leaves behind.
 *
 * REACTIVATION IS THE ACTIVATE ACTION. There is no separate Reactivate control;
 * Activate serves that role and its own dialog says so - "Do you want to
 * reactivate this payer? Its cascaded plans and policies will be restored." So
 * these cases drive Activate and assert the reactivation wording, which is what
 * makes the two demonstrably the same thing rather than an assumption.
 *
 * Unlike inactivation, reactivation uses the shared confirmation dialog rather
 * than a drawer: no reason, no details, just the explanation and two actions.
 */
test.describe('Inactivation and reactivation effects - Reactivation messaging', () => {
  test('TC-004: should confirm the reactivation was saved when an inactive payer is reactivated', async ({
    payerManagementPage,
    inactivePayer,
    toast,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('The payer is on screen showing Inactive', () =>
      payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      ));

    await steps.step('The Reactivate action opens a confirmation explaining the restoration', async () => {
      const dialog = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      expect(await dialog.getTitle(), 'the confirmation should name the action').toBe(
        REACTIVATION_TITLE,
      );
      const message = await dialog.getMessage();
      expect(message, 'it should describe the change as a reactivation').toContain(
        REACTIVATION_MESSAGE.question,
      );
      expect(message, 'and promise the cascade is restored').toContain(
        REACTIVATION_MESSAGE.restoration,
      );
    });

    await steps.step('Confirming closes the dialog and the update is accepted', async () => {
      await payerManagementPage.dialog().confirm('Activate');
      expect(
        await payerManagementPage.dialog().isVisible(),
        'the dialog should close once the change is accepted',
      ).toBe(false);
    });

    await steps.step('A success message confirms what happened', () =>
      toast.expectText(SUCCESS_TOAST));
  });

  test('TC-006: should leave the payer Inactive and restore nothing when the reactivation is cancelled', async ({
    payerManagementPage,
    payerSample,
    steps,
  }) => {
    let payerName!: string;
    let approvalBefore!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      // A SAMPLED inactive payer, not a provisioned one: this case cancels, so
      // it changes nothing, and provisioning an inactive payer costs two
      // maker-checker round trips.
      [payerName] = await payerSample('Inactive', LIFECYCLE_STATUS.inactive.en, 1);
      await payerManagementPage.open();
      await payerManagementPage.search(payerName);
      approvalBefore = await payerManagementPage.getApprovalStatus(payerName);
      expect(approvalBefore, 'the payer should display an approval state').not.toBe('');
    });

    await steps.critical('The payer is on screen showing Inactive', () =>
      payerManagementPage.expectLifecycleStatus(payerName, LIFECYCLE_STATUS.inactive.en));

    await steps.step('The Reactivate action opens the confirmation', async () => {
      const dialog = await payerManagementPage.openActivationPrompt(payerName);
      expect(await dialog.getMessage(), 'the confirmation should explain itself').toContain(
        REACTIVATION_MESSAGE.restoration,
      );
    });

    await steps.step('Cancel closes it without applying anything', async () => {
      await payerManagementPage.dialog().cancel();
      expect(await payerManagementPage.dialog().isVisible(), 'the dialog should be gone').toBe(
        false,
      );
    });

    await steps.step('After a reload the payer is still Inactive with nothing staged', async () => {
      // The approval cell is the evidence that nothing was restored: a cascade
      // that had been staged would show as a draft version here, while the
      // status column would still read Inactive and look untouched.
      await payerManagementPage.open();
      await payerManagementPage.search(payerName);
      await payerManagementPage.expectLifecycleStatus(payerName, LIFECYCLE_STATUS.inactive.en);
      expect(
        await payerManagementPage.getApprovalStatus(payerName),
        'a cancelled reactivation must not leave a staged change behind',
      ).toBe(approvalBefore);
    });
  });
});
