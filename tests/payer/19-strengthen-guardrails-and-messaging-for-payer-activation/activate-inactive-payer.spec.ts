import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { ACTIVATION_DIALOG } from '../../../data/payers/lifecycleGuardrails.data';

/**
 * User story: Strengthen Guardrails and Messaging for Payer Activation,
 * Inactivation and Reactivation.
 * The valid activation - and the valid REactivation, which is the same thing.
 *
 * ACTIVATE AND REACTIVATE ARE ONE CONTROL. The payer list offers a single
 * Activate action, and the dialog it raises is titled "Activate Payer" while
 * asking "Do you want to reactivate this payer? Its cascaded plans and policies
 * will be restored." So the sheet's separate activation and reactivation cases
 * exercise the same button. Both are kept, and TC-008 asserts the reactivation
 * wording explicitly - that assertion is what would catch a future build that
 * split the two apart or dropped the restore-cascade promise.
 *
 * Unlike inactivation, activation uses the SHARED confirmation dialog rather
 * than a drawer of its own: no reason, no details, just a prompt. It is
 * maker-checker all the same - the dialog says so - so both cases send the
 * staged change for approval before reading the status back.
 *
 * The precondition is provisioned, never sampled: `inactivePayer` builds a
 * payer and takes it through inactivation and approval. Activating one of the
 * environment's own inactive payers would consume it permanently, and the
 * status pool these stories sample from is small.
 */
test.describe('Payer lifecycle guardrails - Activating an inactive payer', () => {
  test('TC-003: should activate the payer when an Inactive record is confirmed for activation', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with the Inactive payer on screen', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.critical('The Activate action raises a confirmation prompt', async () => {
      const dialog = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      expect(await dialog.getTitle(), 'the prompt should name the action it is about').toBe(
        ACTIVATION_DIALOG.title,
      );
    });

    await steps.step('Confirming the activation is accepted and staged for approval', async () => {
      await payerManagementPage.dialog().confirm('Activate');
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(inactivePayer.nameEn);
      await approvalManagementPage.approve(inactivePayer.nameEn);
    });

    await steps.step('The payer now reads Active in the list', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  test('TC-008: should reactivate the payer and promise to restore its cascade when an Inactive record is reactivated', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with the Inactive payer on screen', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.critical('The Reactivate route is the Activate action, and it prompts', async () => {
      const dialog = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      const message = await dialog.getMessage();
      // The evidence that this IS the reactivation flow, rather than an
      // assumption that the two are the same. If a dedicated Reactivate action
      // is ever added, this is the assertion that will say so.
      expect(message, 'the prompt should describe the change as a reactivation').toContain(
        ACTIVATION_DIALOG.reactivationPhrase,
      );
      expect(
        message,
        'the prompt should state that the change needs approval before it takes effect',
      ).toContain(ACTIVATION_DIALOG.approvalPhrase);
    });

    await steps.step('Confirming the reactivation is accepted and staged for approval', async () => {
      await payerManagementPage.dialog().confirm('Activate');
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(inactivePayer.nameEn);
      await approvalManagementPage.approve(inactivePayer.nameEn);
    });

    await steps.step('The payer now reads Active in the list', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });
});
