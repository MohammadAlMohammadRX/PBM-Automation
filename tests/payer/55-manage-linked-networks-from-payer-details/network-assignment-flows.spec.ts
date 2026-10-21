import { test, expect } from '../../../fixtures';
import { NetworkAssignmentFlow, type OfferedNetwork } from '../../../utils/NetworkAssignmentFlow';
import { SETTLED_MARKER } from '../../../data/payers/draftAssignmentStates.data';
import { TIMESTAMP_PATTERN } from '../../../data/payers/auditHistoryFilters.data';

/**
 * User story: Manage Linked Networks from Payer Details - the assignment flows.
 *
 * WRITTEN 2026-10-13. These cases were placeholders reporting "no free network"
 * since the pool was empty; it now offers 500+ networks, so each is exercised
 * for real. Only the suite's own payers are used (publishedPayer and
 * secondPublishedPayer, purged at teardown), and networks are identified by
 * CODE - names are not unique in this register.
 */
const isSettled = (state: string): boolean => SETTLED_MARKER.test(state) || /^assigned$/i.test(state);

test.describe('Manage linked networks - assignment flows', () => {
  // Azure test case 15060
  test('15060: should add a valid network to a payer from the Linked Networks tab', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    let network!: OfferedNetwork;

    await steps.critical('Stage a free network on the payer from its Linked Networks tab', async () => {
      network = await flow.stage(publishedPayer.nameEn);
      expect(network.code, 'the drawer should have offered a network to stage').not.toBe('');
    });

    await steps.critical('Send the change for approval and approve it', async () => {
      await flow.submit(publishedPayer.nameEn);
      await flow.decide(publishedPayer.nameEn, 'Approve');
      expect(await flow.linkedCodes(publishedPayer.nameEn), 'the approved network should be listed').toContain(network.code);
    });

    await steps.step('The payer now lists the network as assigned', async () => {
      const state = await flow.stateOf(publishedPayer.nameEn, network.code);
      expect(isSettled(state), `"${network.label}" should be settled on the payer; its state reads "${state}"`).toBe(true);
    });
  });

  // Azure test case 15070
  test('15070: should walk an assignment through Draft, Pending Approval and its decision', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    let network!: OfferedNetwork;

    await steps.critical('Staging the network shows it as a Draft Assignment', async () => {
      network = await flow.stage(publishedPayer.nameEn);
      const state = await flow.stateOf(publishedPayer.nameEn, network.code);
      expect(state, `a staged network should read Draft Assignment; "${network.label}" reads "${state}"`).toMatch(/draft\s*assignment/i);
    });

    await steps.critical('Sending it for approval shows it as pending', async () => {
      await flow.submit(publishedPayer.nameEn);
      const state = await flow.stateOf(publishedPayer.nameEn, network.code);
      expect(state, `a submitted assignment should read pending; it reads "${state}"`).toMatch(/pending/i);
    });

    await steps.step('Approving it settles the assignment', async () => {
      await flow.decide(publishedPayer.nameEn, 'Approve');
      const state = await flow.stateOf(publishedPayer.nameEn, network.code);
      expect(isSettled(state), `an approved assignment should be settled; it reads "${state}"`).toBe(true);
    });
  });

  // Azure test case 15072
  test('15072: should revert the draft with no effect and no audit entry when a reviewer rejects a network change', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    let network!: OfferedNetwork;

    await steps.critical('Stage a network, send it for approval and have the reviewer reject it', async () => {
      network = await flow.stage(publishedPayer.nameEn);
      await flow.submit(publishedPayer.nameEn);
      await flow.decide(publishedPayer.nameEn, 'Reject');
      expect(network.code, 'a network should have been staged').not.toBe('');
    });

    await steps.step('The rejected network is not linked to the payer', async () => {
      expect(await flow.linkedCodes(publishedPayer.nameEn), `"${network.label}" should not be linked after the rejection`)
        .not.toContain(network.code);
    });

    await steps.step('And the network is free again', async () => {
      const offered = (await flow.offeredTo(publishedPayer.nameEn)).map((n) => n.code);
      expect(offered, `"${network.label}" should be offered again after the rejection`).toContain(network.code);
    });

    await steps.step('And no Network Assigned entry was written for it', async () => {
      const audit = (await flow.detailOf(publishedPayer.nameEn)).auditHistory();
      await audit.open();
      const entries = (await audit.getEntries()).filter((e) => /network assigned/i.test(e.action) && e.raw.includes(network.code));
      expect(entries.map((e) => e.raw), `a rejected change should leave no Network Assigned entry for ${network.code}`).toEqual([]);
    });
  });

  // Azure test case 15071
  test('15071: should record the correct audit details when a network change is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    let network!: OfferedNetwork;

    await steps.critical('Assign a network through approval', async () => {
      network = await flow.stage(publishedPayer.nameEn);
      await flow.submit(publishedPayer.nameEn);
      await flow.decide(publishedPayer.nameEn, 'Approve');
      expect(await flow.linkedCodes(publishedPayer.nameEn)).toContain(network.code);
    });

    await steps.step('The audit trail records it as Network Assigned, with the network, the user and the time', async () => {
      const audit = (await flow.detailOf(publishedPayer.nameEn)).auditHistory();
      await audit.open();
      const entry = (await audit.getEntries()).find((e) => /network assigned/i.test(e.action) && e.raw.includes(network.code));
      expect(entry, `a Network Assigned entry naming ${network.code} should be in the trail`).toBeDefined();
      expect(entry!.user, 'the entry should name who made the change').not.toBe('');
      expect(entry!.timestamp, 'the entry should carry a timestamp').toMatch(TIMESTAMP_PATTERN);
    });
  });

  // Azure test case 15085
  test('15085: should read the audit entry a network change writes', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    let network!: OfferedNetwork;

    await steps.critical('Assign a network through approval', async () => {
      network = await flow.stage(publishedPayer.nameEn);
      await flow.submit(publishedPayer.nameEn);
      await flow.decide(publishedPayer.nameEn, 'Approve');
      expect(await flow.linkedCodes(publishedPayer.nameEn)).toContain(network.code);
    });

    await steps.step('The entry\'s details name the network that was assigned', async () => {
      const audit = (await flow.detailOf(publishedPayer.nameEn)).auditHistory();
      await audit.open();
      const entries = await audit.getEntries();
      const index = entries.findIndex((e) => /network assigned/i.test(e.action) && e.raw.includes(network.code));
      expect(index, `a Network Assigned entry naming ${network.code} should be in the trail`).toBeGreaterThanOrEqual(0);
      const details = await audit.openEntryDetails(index);
      const text = `${details.summary} ${details.meta} ${details.diff.map((d) => `${d.field} ${d.before} ${d.after}`).join(' ')}`;
      expect(
        text.includes(network.code) || text.includes(network.name),
        `the entry's details should name ${network.code} / "${network.name}"; they read: ${text.replace(/\s+/g, ' ').slice(0, 300)}`,
      ).toBe(true);
      await audit.closeDetails();
    });
  });

  // Azure test case 15063
  test('15063: should remove a linked network with no policy dependency, through approval', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    let removed = '';
    let kept = '';

    await steps.critical('Give the payer a second network, so one can be removed', async () => {
      // A payer must keep at least one network (VERIFIED: removing the only
      // one is refused with 409), so a second is assigned first.
      const second = await flow.stage(publishedPayer.nameEn);
      await flow.submit(publishedPayer.nameEn);
      await flow.decide(publishedPayer.nameEn, 'Approve');
      const linked = await flow.linkedCodes(publishedPayer.nameEn);
      expect(linked.length, 'the payer should now hold two networks').toBeGreaterThanOrEqual(2);
      kept = second.code;
      removed = linked.find((c) => c !== kept)!;
    });

    await steps.critical('Stage the removal of the first network and have it approved', async () => {
      const detail = await flow.detailOf(publishedPayer.nameEn);
      await detail.unassignNetwork(removed);
      await flow.submit(publishedPayer.nameEn);
      await flow.decide(publishedPayer.nameEn, 'Approve');
      expect(removed, 'a network should have been chosen for removal').not.toBe('');
    });

    await steps.step('The removed network is no longer linked; the other one stays', async () => {
      const linked = await flow.linkedCodes(publishedPayer.nameEn);
      expect(linked, `${removed} should be gone from the payer`).not.toContain(removed);
      expect(linked, `${kept} should still be linked`).toContain(kept);
    });

    await steps.step('And the removed network is free again', async () => {
      const offered = (await flow.offeredTo(publishedPayer.nameEn)).map((n) => n.code);
      expect(offered, `${removed} should be offered again once its removal is approved`).toContain(removed);
    });
  });

  // Azure test case 15076
  test('15076: should confirm a network held by another payer\'s pending request is not offered', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    secondPublishedPayer,
    steps,
  }) => {
    test.slow();
    const flow = new NetworkAssignmentFlow(payerManagementPage, approvalManagementPage);
    let network!: OfferedNetwork;

    await steps.critical('Payer A stages a network and sends it for approval', async () => {
      network = await flow.stage(publishedPayer.nameEn);
      await flow.submit(publishedPayer.nameEn);
      expect(await flow.stateOf(publishedPayer.nameEn, network.code), 'A\'s assignment should be pending').toMatch(/pending/i);
    });

    await steps.step('Payer B is not offered that network while A\'s request is pending', async () => {
      const offered = (await flow.offeredTo(secondPublishedPayer.nameEn)).map((n) => n.code);
      expect(offered.length, 'payer B\'s drawer should offer networks').toBeGreaterThan(0);
      expect(offered, `"${network.label}" is held by payer A's pending request and must not be offered to B`).not.toContain(network.code);
    });
  });
});
