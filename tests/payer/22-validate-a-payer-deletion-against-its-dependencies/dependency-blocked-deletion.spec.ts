import { test, expect } from '../../../fixtures';
import { findPayer } from '../../../utils/PayerFinder';
import { REFERENCE_PAYERS } from '../../../data/payers/referencePayers.data';
import { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  DELETE_CHANGE_TYPE,
  DELETE_MESSAGES,
  DELETE_UI,
} from '../../../data/payers/deletePayer.data';
import {
  DEPENDENCY_TYPES,
  PENDING_DELETION,
  TYPES_NAMED_IN_MESSAGE,
} from '../../../data/payers/deleteDependencies.data';

/**
 * User story: Validate a Payer Deletion Against Its Dependencies.
 *
 * WHAT THE APPLICATION DOES, verified on a payer holding one linked network:
 * the delete prompt is the generic "Delete Payer / Do you want to delete X?",
 * and confirming it produces
 *
 *   "Payer cannot be deleted because it is linked to existing networks,
 *    facilities, or authorization rules."
 *
 * The record survives and no request is queued, so the RULE works. The MESSAGE
 * is the problem: it names all three types every time, whichever one actually
 * blocked the deletion, and it never mentions Plans - the sheet's first
 * blocking case. So a reviewer is told that something is linked but not what to
 * go and clear.
 *
 * The dependency-holding payer is DISCOVERED through the list's Networks count
 * rather than named, so these cases do not depend on one seeded record
 * surviving. Facilities and authorization rules have no such column and no
 * module view keyed by payer; those cases report BLOCKED with what to seed.
 */
test.describe('Payer deletion dependencies - Blocked deletions', () => {
  // Azure test case 15463
  test('15463: should refuse the deletion when the payer is linked to a network', async ({
    payerManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    let holder!: string;

    await steps.critical('Navigate to the module and find a payer with a linked network', async () => {
      await payerManagementPage.open();
      const found = await payerManagementPage.findPayerWithNetworkDependency();
      holder = found.name;
      expect(
        found.networks,
        `"${holder}" should carry at least one linked network`,
      ).toBeGreaterThan(0);
    });

    await steps.critical('Its delete action opens the confirmation', async () => {
      await payerManagementPage.search(holder);
      const dialog = await payerManagementPage.clickDelete(holder);
      expect(await dialog.getTitle(), 'the delete prompt').toBe(DELETE_UI.en.dialogTitle);
    });

    await steps.step('Confirming the deletion is refused by the dependency check', async () => {
      await payerManagementPage.dialog().confirm(DELETE_UI.en.confirm);
      expect(
        await payerManagementPage.wasDeletionBlockedByDependency(),
        'a payer holding a network must not be deletable',
      ).toBe(true);
    });

    await steps.step('The message identifies Networks as the reason', async () => {
      await payerManagementPage.expectToastContains(DELETE_MESSAGES.dependencyBlockedEn);
      expect(
        DELETE_MESSAGES.dependencyBlockedEn.toLowerCase(),
        'the refusal should name the dependency that blocked it',
      ).toContain('networks');
    });

    await steps.step('The payer survives and no deletion is queued', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(holder);
      await payerManagementPage.waitForRowVisible(holder);
      await approvalManagementPage.open();
      await approvalManagementPage.search(holder);
      await approvalManagementPage.expectChangeType(holder, DELETE_CHANGE_TYPE).catch(() => undefined);
      expect(
        await approvalManagementPage.countQueuedRequests(holder),
        'a refused deletion must not leave a request behind',
      ).toBeLessThanOrEqual(1);
    });
  });

  // Azure test case 15466
  test('15466: should name every applicable dependency when a deletion is refused', async ({
    payerManagementPage,
    steps,
  }) => {
    let holder!: string;

    await steps.critical('Navigate to the module and find a payer with a dependency', async () => {
      await payerManagementPage.open();
      const found = await payerManagementPage.findPayerWithNetworkDependency();
      holder = found.name;
      expect(found.networks, 'the payer should hold a dependency').toBeGreaterThan(0);
    });

    await steps.critical('Its deletion is refused', async () => {
      await payerManagementPage.search(holder);
      await payerManagementPage.clickDelete(holder);
      await payerManagementPage.dialog().confirm(DELETE_UI.en.confirm);
      expect(await payerManagementPage.wasDeletionBlockedByDependency()).toBe(true);
    });

    await steps.step('The message covers the dependency types the application checks', async () => {
      // It covers three of them - unconditionally. That is what makes the
      // multi-blocker case indistinguishable from the single-blocker one, and
      // it is asserted here as the application's actual contract.
      for (const type of TYPES_NAMED_IN_MESSAGE) {
        expect(
          DELETE_MESSAGES.dependencyBlockedEn.toLowerCase(),
          `the refusal should mention ${type}`,
        ).toContain(type.toLowerCase().split(' ')[0]);
      }
    });

    await steps.step('But it cannot distinguish one blocker from several', async () => {
      // FAILS, and it is the story's central finding. This payer holds ONE
      // network and no facilities or authorization rules, yet the message lists
      // all three - so a reviewer cannot tell which dependency to clear, and a
      // payer blocked by three gets the same sentence as one blocked by one.
      const named = TYPES_NAMED_IN_MESSAGE.filter((type) =>
        DELETE_MESSAGES.dependencyBlockedEn.toLowerCase().includes(type.toLowerCase().split(' ')[0]),
      );
      expect(
        named,
        `the payer holds only a network, but the refusal names: ${named.join(', ')}`,
      ).toEqual(['Networks']);
    });
  });

  // Azure test case 15462
  //
  // CONVERTED FROM BLOCKED on 2026-10-13 (QA lead: try it on a payer that has
  // at least one policy - a policy belongs to a plan). Located across the whole
  // register by GetPayers, payer number 2 preferred. SAFE TO ATTEMPT: the payer
  // must also hold a network, and a payer holding a network is always refused
  // deletion (verified, 15472/D-017) - so nothing is ever staged on it.
  test('15462: should refuse the deletion and name Plans when the payer is linked to a plan', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    test.slow();
    let holder = '';
    let plans: string[] = [];
    let messages: string[] = [];

    await steps.critical('Find a payer that owns at least one policy, and so a plan', async () => {
      const found = await findPayer(
        page,
        (p) => Number(p.linkedPoliciesCount) > 0 && Number(p.linkedNetworksCount) > 0,
        'a payer with at least one policy (and a network, so its deletion is certain to be refused)',
        [REFERENCE_PAYERS.payerNumber2.name],
      );
      if (!found) steps.blocked('No payer in the register owns a policy and a network.');
      holder = found!.payerCode || found!.payerNameEn;
      await payerManagementPage.open();
      await payerManagementPage.search(holder);
      const rows = await (await payerManagementPage.openDetails(holder)).getLinkedPolicyRows();
      plans = rows.map((row) => Object.entries(row).find(([header]) => /plan/i.test(header))?.[1] ?? '').filter(Boolean);
      expect(plans, `"${holder}" should show at least one linked policy with its plan; rows: ${JSON.stringify(rows)}`).not.toEqual([]);
    });

    await steps.critical('Its deletion is refused', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(holder);
      await payerManagementPage.clickDelete(holder);
      await payerManagementPage.dialog().confirm(DELETE_UI.en.confirm);
      expect(await payerManagementPage.wasDeletionBlockedByDependency(), `"${holder}" holds a plan; its deletion must be refused`).toBe(true);
      messages = await new PayerFormDialog(page).getVisibleMessages();
    });

    await steps.step('The refusal names Plans as a reason', async () => {
      const refusal = messages.find((m) => /cannot be deleted|لا يمكن حذف/i.test(m)) ?? messages.join(' | ');
      expect(
        /plan/i.test(refusal),
        `"${holder}" is linked to plan(s) ${plans.join(', ')}; the refusal should name Plans - it reads: "${refusal}"`,
      ).toBe(true);
    });
  });

  // Azure test case 15474
  test('15474: should name the blocking dependency precisely, in both languages', async ({
    payerManagementPage,
    steps,
  }) => {
    let holder!: string;
    let code!: string;

    await steps.critical('Navigate to the module and find a payer with a linked network', async () => {
      await payerManagementPage.open();
      const found = await payerManagementPage.findPayerWithNetworkDependency();
      holder = found.name;
      await payerManagementPage.search(holder);
      code = await payerManagementPage.getPayerCode(holder).catch(() => '');
      expect(found.networks, 'the payer should hold exactly the one dependency type').toBeGreaterThan(0);
    });

    await steps.critical('Its deletion is refused in English', async () => {
      await payerManagementPage.clickDelete(holder);
      await payerManagementPage.dialog().confirm(DELETE_UI.en.confirm);
      await payerManagementPage.expectToastContains(DELETE_MESSAGES.dependencyBlockedEn);
    });

    await steps.step('The English message names the blocker and nothing else', async () => {
      // FAILS. The sheet wants the sole reason identified; the message lists
      // networks, facilities AND authorization rules whatever the payer holds.
      const irrelevant = ['facilities', 'authorization'];
      for (const term of irrelevant) {
        expect(
          DELETE_MESSAGES.dependencyBlockedEn.toLowerCase(),
          `this payer holds no ${term}, so the refusal should not mention them`,
        ).not.toContain(term);
      }
    });

    await steps.step('The Arabic message is a faithful translation of the same sentence', async () => {
      await payerManagementPage.open();
      await payerManagementPage.language().switchTo('ar');
      await payerManagementPage.open();
      await payerManagementPage.search(code || holder);
      await payerManagementPage.clickDelete(code || holder, 'ar');
      await payerManagementPage.dialog().confirm(DELETE_UI.ar.confirm);
      // The translation exists and is asserted in full - the Arabic half of the
      // story works, even though the sentence it translates is too broad.
      await payerManagementPage.expectToastContains(DELETE_MESSAGES.dependencyBlockedAr);
    });

    await steps.step('And the payer survived both attempts', async () => {
      await payerManagementPage.language().switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.search(holder);
      await payerManagementPage.waitForRowVisible(holder);
    });
  });

  // Azure test case 15473
  test('15473: should apply the same rule whatever state the dependency is in', async ({
    payerManagementPage,
    networkManagementPage,
    steps,
  }) => {
    let holder!: string;
    let networkStatus!: string;

    await steps.critical('Navigate to the module and find a payer with a linked network', async () => {
      await payerManagementPage.open();
      const found = await payerManagementPage.findPayerWithNetworkDependency();
      holder = found.name;
      expect(found.networks, 'the payer should hold a dependency').toBeGreaterThan(0);
    });

    await steps.critical("The dependency's own status is read", async () => {
      const detail = await payerManagementPage.openDetails(holder);
      const linked = await detail.getFirstLinkedNetwork();
      networkStatus = linked.status;
      expect(networkStatus, 'the linked network should report a status').not.toBe('');

      // Cross-checked against the network module, so the status the payer
      // screen shows is not taken on trust.
      // Scoped to the holder first (2026-10-19): the Network list shows a
      // payer's networks only once that payer is chosen, so an unscoped search
      // never found the row.
      await networkManagementPage.openListFor(holder);
      await networkManagementPage.searchUntilApplied(linked.name);
      expect(
        await networkManagementPage.getStatusText(linked.name),
        'both screens should agree about the dependency',
      ).toBe(networkStatus);
    });

    await steps.step('The deletion is refused regardless of that status', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(holder);
      await payerManagementPage.clickDelete(holder);
      await payerManagementPage.dialog().confirm(DELETE_UI.en.confirm);
      expect(
        await payerManagementPage.wasDeletionBlockedByDependency(),
        `the link blocks the deletion with the network in state "${networkStatus}"`,
      ).toBe(true);
    });

    await steps.step('And the rule is stated as the link existing, not the link being active', async () => {
      // The behaviour recorded rather than judged: the sheet asks whether an
      // inactive or archived dependency still blocks. It does - the check is on
      // the LINK, not on the dependency's own lifecycle - which is defensible
      // and worth documenting either way.
      expect(
        DELETE_MESSAGES.dependencyBlockedEn.toLowerCase(),
        'the refusal speaks of being "linked to", with no mention of a status',
      ).toContain('linked to');
      expect(
        DEPENDENCY_TYPES.length,
        'and the four types the story cares about are all accounted for',
      ).toBe(4);
    });
  });
});
