import { test, expect } from '../../../fixtures';
import { NO_CHANGE } from '../../../data/networks/networkAssignment.data';

/**
 * User story: Re-validate Network Selection at Approval Time.
 * Net-change detection - what happens when a submission would change nothing.
 *
 * THE SHEET EXPECTS A MESSAGE; THE DRAWER USES A GATE. Its primary action stays
 * disabled until the selection differs from what is already linked, so a
 * no-change submission cannot be made rather than being made and refused. Each
 * case asserts the gate first - that is the protection, and it holds - and then
 * looks for the "nothing to submit" message the sheet asks for, which does not
 * appear. Splitting them keeps a working guard from being reported as a defect
 * and a missing message from being passed over.
 *
 * ONE STRUCTURAL NOTE: an already-linked network is not offered in the drawer's
 * list at all, so "re-select the network that is already assigned" cannot be
 * done literally. What the drawer allows is a selection that nets out to
 * nothing - pick a network, then unpick it - which is the same question asked
 * the only way the interface permits, and is what TC-011 does.
 */
test.describe('Network selection re-validation - Net-change detection', () => {
  test('TC-004: should offer no way to resubmit a network that is already linked', async ({
    payerManagementPage,
    approvalManagementPage,
    assignableNetwork,
    publishedPayer,
    steps,
  }) => {
    let network!: string;

    await steps.critical('Navigate to the module with a network already assigned', async () => {
      network = await assignableNetwork(publishedPayer.nameEn);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const drawer = await detail.openAssignNetwork();
      await drawer.selectNetworks([network]);
      await drawer.assign();

      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.critical('The network is shown as currently assigned', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect((await detail.getFirstLinkedNetwork()).name).toBe(network);
    });

    await steps.step('The drawer no longer offers it, so no duplicate can be selected', async () => {
      const detail = payerManagementPage.detail();
      const drawer = await detail.openAssignNetwork();
      const available = await drawer.listAvailableNetworks();
      expect(
        available,
        `an already-linked network should not be re-selectable; the drawer offered: `
          + `${available.join(', ') || '(nothing)'}`,
      ).not.toContain(network);

      // And with nothing selected there is nothing to submit - the gate that
      // makes a no-change request impossible.
      expect(
        await drawer.isSubmitEnabled(),
        'the submission should be gated while the selection matches what is linked',
      ).toBe(!NO_CHANGE.expectSubmitDisabled);
      await drawer.cancel();
    });

    await steps.step('No new request is created for the payer', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });
  });

  test('TC-009: should request only the net-new network when a linked one is selected alongside it', async ({
    payerManagementPage,
    approvalManagementPage,
    assignableNetwork,
    publishedPayer,
    steps,
  }) => {
    let linkedNetwork!: string;
    let newNetwork!: string;

    await steps.critical('Navigate to the module with one network already assigned', async () => {
      linkedNetwork = await assignableNetwork(publishedPayer.nameEn);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const drawer = await detail.openAssignNetwork();
      await drawer.selectNetworks([linkedNetwork]);
      await drawer.assign();

      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.critical('A second, unassigned network is available', async () => {
      newNetwork = await assignableNetwork(publishedPayer.nameEn);
      expect(
        newNetwork,
        'the second network must be a different record from the linked one',
      ).not.toBe(linkedNetwork);
    });

    await steps.step('The combined selection can only include the net-new network', async () => {
      // The sheet selects both the linked and the new one. The drawer excludes
      // the linked one from its list, so the "combined selection" it evaluates
      // is already reduced to the net change - the duplicate cannot be
      // expressed, let alone recorded twice.
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const drawer = await detail.openAssignNetwork();
      const available = await drawer.listAvailableNetworks();
      expect(available, 'the new network should be selectable').toContain(newNetwork);
      expect(available, 'the linked one should not be').not.toContain(linkedNetwork);

      await drawer.selectNetworks([newNetwork]);
      await drawer.assign();
    });

    await steps.step('One request is created, covering the new network only', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);

      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.expectLinkedNetworkCount(2);
      expect(
        await detail.getLinkedNetworkAssignmentState(linkedNetwork),
        'the already-linked network should not have been re-processed',
      ).not.toMatch(/pending/i);
    });
  });

  test('TC-011: should offer nothing to submit when the selection is reverted before submitting', async ({
    payerManagementPage,
    approvalManagementPage,
    assignableNetwork,
    publishedPayer,
    steps,
  }) => {
    let network!: string;

    await steps.critical('Navigate to the module and open the assignment screen', async () => {
      network = await assignableNetwork(publishedPayer.nameEn);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const before = await detail.linkedNetworkCount();
      expect(before, 'the payer starts with a known set of networks').toBe(0);
    });

    await steps.step('Selecting and then deselecting a network reverts the selection', async () => {
      const detail = payerManagementPage.detail();
      const drawer = await detail.openAssignNetwork();
      await drawer.selectNetworks([network]);
      expect(await drawer.isSubmitEnabled(), 'a selection enables the submission').toBe(true);

      // Clicking the same option again unpicks it - the control is a
      // multi-select, so the second click is a toggle rather than a re-pick.
      await drawer.selectNetworks([network]);
      expect(
        await drawer.isSubmitEnabled(),
        'reverting the selection should gate the submission again',
      ).toBe(!NO_CHANGE.expectSubmitDisabled);
    });

    await steps.step('The user is told there is nothing to submit', async () => {
      // FAILS. The refusal is silent: the primary action simply goes back to
      // being disabled, with no message anywhere on the drawer. The record is
      // protected, which is what matters most, but a user who cannot see why
      // Submit is dead has nothing to go on.
      const detail = payerManagementPage.detail();
      const messages = await detail.waitForVisibleMessages();
      expect(
        messages,
        `the drawer should say there is nothing to submit; it showed: `
          + `${messages.join(' | ') || '(nothing)'}`,
      ).not.toEqual([]);
    });

    await steps.step('No request is created and the payer is unchanged', async () => {
      const detail = payerManagementPage.detail();
      await detail.expectLinkedNetworkCount(0);
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });
  });
});
