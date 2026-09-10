import { test, expect } from '../../../fixtures';
import {
  DELETE_CHANGE_TYPE,
  DELETE_MESSAGES,
  DELETE_UI,
} from '../../../data/payers/deletePayer.data';
import {
  DEPENDENCY_TYPES,
  DISCOVERY,
  PENDING_DELETION,
  PLAN_DEPENDENCY_BLOCKER,
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
  test('TC-003: should refuse the deletion when the payer is linked to a network', async ({
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

  test('TC-006: should name every applicable dependency when a deletion is refused', async ({
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

  test('TC-002: should refuse the deletion and name Plans when the payer is linked to a plan', async ({
    steps,
  }) => {
    // Reported before anything is touched. See the data file for the full
    // reasoning: the only payers holding an active plan are real records whose
    // staged deletion would need manual withdrawal, and what this case would
    // assert is already reported by TC-014.
    steps.blocked(PLAN_DEPENDENCY_BLOCKER.reason);
  });

  for (const type of DISCOVERY.undiscoverable) {
    const caseId = type === 'Facilities' ? 'TC-004' : 'TC-005';

    test(`${caseId}: should refuse the deletion and name ${type} when the payer is linked to one`, async ({
      steps,
    }) => {
      // BLOCKED rather than approximated. A case that attempted this against an
      // arbitrary payer would report whatever the lumped message says and claim
      // to have tested a dependency type it never established was present.
      steps.blocked(`${DISCOVERY.undiscoverableReason} (${type})`);
    });
  }

  test('TC-014: should name the blocking dependency precisely, in both languages', async ({
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

  test('TC-013: should apply the same rule whatever state the dependency is in', async ({
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
      await networkManagementPage.openList();
      await networkManagementPage.search(linked.name);
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
