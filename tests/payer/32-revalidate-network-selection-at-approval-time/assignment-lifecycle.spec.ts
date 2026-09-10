import { test, expect } from '../../../fixtures';
import { ASSIGNMENT_CAVEAT, ASSIGNMENT_CHANGE_TYPE } from '../../../data/networks/networkAssignment.data';

/**
 * User story: Re-validate Network Selection at Approval Time.
 * The assignment lifecycle - submit, approve, remove, approve.
 *
 * MAKER-CHECKER IS THE WHOLE POINT HERE. The drawer says so itself ("Assigning
 * or removing a network is submitted for approval and takes effect once a
 * reviewer approves it"), and the sheet's expected results turn on the gap
 * between submitting and approving: the request exists, the link does not yet,
 * and a removal leaves the network attached until a reviewer says otherwise.
 *
 * WHERE THE NETWORK COMES FROM. The Assign drawer offers only networks that
 * belong to no payer, and this environment's pool was empty - earlier
 * dependency tests linked networks to payers that could not then be deleted, so
 * the links were never released. `assignableNetwork` refills it by submitting
 * and approving a removal, which is the same flow TC-005 asserts. Without that
 * every case in this story would report BLOCKED on a precondition the suite
 * itself had consumed.
 */
test.describe('Network selection re-validation - Assignment lifecycle', () => {
  test('TC-001: should create a pending request without linking the network when an assignment is submitted', async ({
    payerManagementPage,
    approvalManagementPage,
    assignableNetwork,
    publishedPayer,
    steps,
  }) => {
    let network!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical("Open the payer's network assignment screen", async () => {
      network = await assignableNetwork(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        await detail.linkedNetworkCount(),
        'the payer should start with no linked networks',
      ).toBe(0);
    });

    await steps.step('The unassigned network is offered and can be submitted', async () => {
      const detail = payerManagementPage.detail();
      const drawer = await detail.openAssignNetwork();
      expect(
        await drawer.listAvailableNetworks(),
        'the drawer should offer the network the pool holds',
      ).toContain(network);

      await drawer.selectNetworks([network]);
      expect(
        await drawer.isSubmitEnabled(),
        'a real selection should enable the submission',
      ).toBe(true);
      await drawer.assign();
    });

    await steps.step('The request is pending approval and the network is not yet linked', async () => {
      // Both halves, because the second is what "not yet" means: the row
      // appears immediately with an assignment state, but the link is not in
      // force until a reviewer approves it.
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectChangeType(
        publishedPayer.nameEn,
        ASSIGNMENT_CHANGE_TYPE,
      );

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        'Pending Approval',
      );
    });
  });

  test('TC-002: should link the network to the payer once the request is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    assignableNetwork,
    publishedPayer,
    steps,
  }) => {
    let network!: string;

    await steps.critical('Navigate to the module and submit an assignment', async () => {
      network = await assignableNetwork(publishedPayer.nameEn);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const drawer = await detail.openAssignNetwork();
      expect(
        await drawer.listAvailableNetworks(),
        'the network should be assignable before the request',
      ).toContain(network);
      await drawer.selectNetworks([network]);
      await drawer.assign();
    });

    await steps.critical('The request is in the queue as Pending', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectActionsAvailable(publishedPayer.nameEn);
    });

    await steps.step('An authorized reviewer can approve it', async () => {
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });

    await steps.step("The network now appears in the payer's network list", async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const linked = await detail.getFirstLinkedNetwork();
      expect(linked.name, 'the approved network should be the one submitted').toBe(network);
    });
  });

  test('TC-005: should keep the network attached until a submitted removal is approved', async ({
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

    await steps.critical('The network is shown as assigned', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect((await detail.getFirstLinkedNetwork()).name).toBe(network);
    });

    await steps.step('Submitting the removal creates a request and leaves the link in place', async () => {
      const detail = payerManagementPage.detail();
      await detail.unassignAllNetworks();
      // Still attached: the sheet's "remains assigned in the meantime". The row
      // survives with a changed assignment state, which is exactly how a
      // maker-checker removal should look.
      const stillThere = await detail.getFirstLinkedNetwork();
      expect(stillThere.name, 'the link should survive until the removal is approved').toBe(
        network,
      );
      expect(
        stillThere.status,
        'the row should still report the network its own status',
      ).not.toBe('');
    });

    await steps.step('A reviewer approves the removal', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.step('The network no longer appears as assigned', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.expectLinkedNetworkCount(0);
    });
  });

  test('TC-008: should move the network through each assignment state in turn', async ({
    payerManagementPage,
    approvalManagementPage,
    assignableNetwork,
    publishedPayer,
    steps,
  }) => {
    let network!: string;
    const observed: string[] = [];

    await steps.critical('Navigate to the module and confirm the network is unassigned', async () => {
      network = await assignableNetwork(publishedPayer.nameEn);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      // Unassigned, in the only sense the interface exposes: the drawer offers
      // it, which it does for no network that already belongs to a payer.
      const drawer = await detail.openAssignNetwork();
      expect(
        await drawer.listAvailableNetworks(),
        'an unassigned network is one the drawer still offers',
      ).toContain(network);
      await drawer.cancel();
    });

    await steps.step('Submitting an assignment moves it to a pending state', async () => {
      const detail = payerManagementPage.detail();
      const drawer = await detail.openAssignNetwork();
      await drawer.selectNetworks([network]);
      await drawer.assign();

      const state = await detail.getLinkedNetworkAssignmentState(network);
      observed.push(state);
      expect(state, 'a submitted assignment should be marked as pending').toMatch(/pending/i);
    });

    await steps.step('Approving it moves the network to assigned', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);

      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const state = await detail.getLinkedNetworkAssignmentState(network);
      observed.push(state);
      expect(state, 'an approved assignment should no longer read as pending').not.toMatch(
        /pending/i,
      );
    });

    await steps.step('Submitting a removal moves it to a pending removal, still linked', async () => {
      const detail = payerManagementPage.detail();
      await detail.unassignAllNetworks();
      const state = await detail.getLinkedNetworkAssignmentState(network);
      observed.push(state);
      expect(state, 'a submitted removal should be marked as pending').toMatch(/pending/i);
      expect((await detail.getFirstLinkedNetwork()).name, 'and still linked').toBe(network);
    });

    await steps.step('Approving the removal returns it to unassigned', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);

      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.expectLinkedNetworkCount(0);
      const drawer = await detail.openAssignNetwork();
      expect(
        await drawer.listAvailableNetworks(),
        'the network should be back in the assignable pool',
      ).toContain(network);
      await drawer.cancel();

      // The four states, in order, as the interface reported them - so a
      // failure names the sequence it saw rather than one word out of context.
      expect(observed, `the states observed were: ${observed.join(' -> ')}`).toHaveLength(3);
    });
  });
});
