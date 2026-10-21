import { test, expect } from '../../../fixtures';
import { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import { NetworkAssignmentFlow, type OfferedNetwork } from '../../../utils/NetworkAssignmentFlow';
import { parseOptionLabel } from '../../../data/payers/manageLinkedNetworks.data';
import type { AssignNetworkDrawer } from '../../../pages/payer/AssignNetworkDrawer';

/**
 * User story: Show Draft Assignment/Removal States and Reserve Networks Being
 * Staged - the reservation cases.
 *
 * WRITTEN 2026-10-13. These were placeholders reporting "no free network"; the
 * pool now offers 500+ networks. Payer A and payer B are the suite's own
 * (publishedPayer, secondPublishedPayer), purged at teardown. 15673
 * needs a second person watching the pool: a SECOND TAB of the same
 * administrator plays that part - a second account is not configured - so
 * it proves the reservation across two sessions, not across two people.
 * (15682 was removed on 2026-10-18 - QA lead marked it invalid.)
 */
test.describe('Reserve networks being staged', () => {
  // Azure test case 15672
  test('15672: should not offer a network that another payer\'s pending request names', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    secondPublishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    let network!: OfferedNetwork;

    await steps.critical('Payer A stages a network (Draft Assignment, not yet sent)', async () => {
      network = await flow.stage(publishedPayer.nameEn);
      expect(await flow.stateOf(publishedPayer.nameEn, network.code)).toMatch(/draft\s*assignment/i);
    });

    await steps.step('While it is only staged, payer B is not offered it', async () => {
      // "Reserve networks BEING STAGED": the reservation starts at the draft.
      const offered = (await flow.offeredTo(secondPublishedPayer.nameEn)).map((n) => n.code);
      expect(offered, `"${network.label}" is staged by payer A and must not be offered to B`).not.toContain(network.code);
    });

    await steps.step('Once A sends it for approval, B is still not offered it', async () => {
      await flow.submit(publishedPayer.nameEn);
      const offered = (await flow.offeredTo(secondPublishedPayer.nameEn)).map((n) => n.code);
      expect(offered, `"${network.label}" is named by A's pending request and must not be offered to B`).not.toContain(network.code);
    });
  });

  // Azure test case 15674
  test('15674: should release the network back to the pool when a Draft Assignment is discarded', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    secondPublishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    let network!: OfferedNetwork;

    await steps.critical('Payer A stages a network; payer B is not offered it', async () => {
      network = await flow.stage(publishedPayer.nameEn);
      const offered = (await flow.offeredTo(secondPublishedPayer.nameEn)).map((n) => n.code);
      expect(offered, `"${network.label}" should be reserved by A's draft`).not.toContain(network.code);
    });

    await steps.critical('Payer A discards the Draft Assignment', async () => {
      const detail = await flow.detailOf(publishedPayer.nameEn);
      const offeredActions = await detail.getLinkedNetworkActions(network.code);
      const used = await detail.runLinkedNetworkAction(network.code, /discard|cancel|revert|remove|unassign|delete/i);
      expect(used, `the draft row should offer a way to discard it; it offers: ${offeredActions.join(', ') || '(nothing)'}`).not.toBe('');
      expect(await flow.linkedCodes(publishedPayer.nameEn), 'the discarded draft should be gone from payer A').not.toContain(network.code);
    });

    await steps.step('The network is back in the pool: payer B is offered it', async () => {
      const offered = (await flow.offeredTo(secondPublishedPayer.nameEn)).map((n) => n.code);
      expect(offered, `"${network.label}" should be offered again once A's draft is discarded`).toContain(network.code);
    });
  });

  // Azure test case 15673
  test('15673: should show a clear error when a network reserved by another payer\'s pending request is selected', async ({
    page,
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    secondPublishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    const tab2 = await page.context().newPage();
    const payersB = new PayerManagementPage(tab2);
    let network!: OfferedNetwork;
    let drawerB!: AssignNetworkDrawer;

    await steps.critical('Tab 2 opens payer B\'s Assign drawer and picks a free network', async () => {
      await payersB.open();
      await payersB.search(secondPublishedPayer.nameEn);
      drawerB = await (await payersB.openDetails(secondPublishedPayer.nameEn)).openAssignNetwork();
      const label = await drawerB.selectNetwork();
      network = { ...parseOptionLabel(label), label };
      expect(network.code, 'tab 2 should have picked a network').not.toBe('');
    });

    await steps.critical('Meanwhile, tab 1 stages that network on payer A and sends it for approval', async () => {
      await flow.stage(publishedPayer.nameEn, network.code);
      await flow.submit(publishedPayer.nameEn);
      expect(await flow.stateOf(publishedPayer.nameEn, network.code), 'A should now hold it pending').toMatch(/pending/i);
    });

    await steps.step('Tab 2 confirms its stale pick: a clear error, and nothing is staged on B', async () => {
      // The drawer in tab 2 still holds the network picked before A reserved
      // it. Confirming it is the race the case is about.
      await drawerB.assign().catch(() => undefined);
      // Toasts, inline errors and the shared dialog - wherever the app says it.
      const messages = await new PayerFormDialog(tab2).waitForVisibleMessages();
      await payersB.open();
      await payersB.search(secondPublishedPayer.nameEn);
      const onB = (await (await payersB.openDetails(secondPublishedPayer.nameEn)).getLinkedNetworkRows()).map((r) => r.code.trim());
      expect(onB, `${network.code} is reserved by payer A and must not be staged on B as well`).not.toContain(network.code);
      expect(messages, `selecting a network another payer's pending request holds should give a clear error; shown: ${messages.join(' | ') || '(nothing)'}`)
        .not.toEqual([]);
    });
    await tab2.close();
  });
});
