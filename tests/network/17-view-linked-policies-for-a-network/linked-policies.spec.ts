import { test, expect } from '../../../fixtures';
import { NETWORK_MESSAGE } from '../../../data/networks/network.data';
import {
  BLOCKED_CASES,
  CASE,
  COLUMN,
  DETACH_ACTION,
  FILTER_STATUS,
  MANY_POLICIES,
  REQUIRED_COLUMNS,
  isDateOrdered,
} from '../../../data/networks/linkedPolicies.data';

/**
 * User story 14136: View linked policies for a network.
 *
 * Every network with linked policies is a shared team record found by the
 * `policyNetwork` fixture and only READ - these cases detach, edit and re-date
 * nothing. The cases that need policies the suite may change are BLOCKED
 * (see BLOCKED_CASES), each naming the seed that would unblock it.
 */
test.describe('US 14136 - Linked policies tab', () => {
  test(`TC-${CASE.requiredFields}: should show number, name, plan, holder, status and dates when a network's linked policies are listed`, async ({
    networkDetailPage,
    policyNetwork,
    steps,
  }) => {
    const network = await policyNetwork();

    await steps.critical('Navigate to a network with linked policies - its detail page opens', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getName()).toBe(network.name);
    });

    await steps.critical('Select the Policies tab - it lists the linked policies', async () => {
      const tab = networkDetailPage.policies();
      await tab.open();
      expect((await tab.readRows()).length, 'the tab should list the network\'s policies').toBeGreaterThan(0);
    });

    await steps.step('A row shows every required field, populated', async () => {
      const tab = networkDetailPage.policies();
      expect(await tab.getHeaders(), 'required columns').toEqual(expect.arrayContaining([...REQUIRED_COLUMNS]));
      const [row] = await tab.readRows();
      for (const column of REQUIRED_COLUMNS) {
        expect(row[column], `"${column}" should be populated`).not.toBe('');
      }
    });
  });

  test(`TC-${CASE.countPartitions}: should show a count matching the register when a network has zero, one or many linked policies`, async ({
    networkDetailPage,
    networkIn,
    policyNetwork,
    steps,
  }) => {
    const none = await networkIn('Draft');
    const one = await policyNetwork({ minPolicies: 1, maxPolicies: 1 });
    const many = await policyNetwork({ minPolicies: MANY_POLICIES });

    await steps.critical('Navigate to the module - the zero-policy network opens', async () => {
      await networkDetailPage.open(none.id);
      expect(await networkDetailPage.getName()).toBe(none.name);
    });

    await steps.step('Zero policies: an empty list and a count of 0', async () => {
      const tab = networkDetailPage.policies();
      await tab.open();
      expect(await tab.readRows()).toEqual([]);
      expect(await tab.getEmptyText()).toBe(NETWORK_MESSAGE.noPolicies);
      expect(await tab.getCountIndicator()).toBe(0);
    });

    for (const [label, network] of [['One policy', one], ['Many policies', many]] as const) {
      await steps.step(`${label}: rows and count both match the register's ${network.policies}`, async () => {
        await networkDetailPage.open(network.id);
        const tab = networkDetailPage.policies();
        await tab.open();
        expect(await tab.getCountIndicator(), 'the count indicator').toBe(network.policies);
        expect((await tab.readRows()).length, 'the listed rows').toBe(network.policies);
      });
    }
  });

  test(`TC-${CASE.exploratory}: should sort, filter and search the linked policies correctly when a network has several`, async ({
    networkDetailPage,
    policyNetwork,
    steps,
  }) => {
    const network = await policyNetwork({ minPolicies: MANY_POLICIES });
    let first: Record<string, string> = {};

    await steps.critical('Navigate to a network with several policies - the tab lists them all', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.policies();
      await tab.open();
      const rows = await tab.readRows();
      expect(rows.length).toBe(network.policies);
      first = rows[0];
    });

    for (const column of [COLUMN.effectiveDate, COLUMN.expiryDate]) {
      await steps.step(`Sorting by ${column} reorders the rows ascending, then descending`, async () => {
        const tab = networkDetailPage.policies();
        expect(isDateOrdered(await tab.clickHeader(column), 'asc'), `${column} ascending`).toBe(true);
        expect(isDateOrdered(await tab.clickHeader(column), 'desc'), `${column} descending`).toBe(true);
      });
    }

    await steps.step(`Filtering by status ${FILTER_STATUS} leaves only matching rows`, async () => {
      const tab = networkDetailPage.policies();
      await tab.filterByStatus(FILTER_STATUS);
      expect((await tab.readColumn(COLUMN.status)).filter((s) => s !== FILTER_STATUS), 'rows of another status').toEqual([]);
      await networkDetailPage.open(network.id);
      await tab.open();
    });

    for (const column of [COLUMN.number, COLUMN.holder]) {
      await steps.step(`Searching by ${column} returns the matching policy`, async () => {
        const tab = networkDetailPage.policies();
        await tab.search(first[column]);
        const values = await tab.readColumn(column);
        expect(values, `the policy with ${column} "${first[column]}" should be returned`).toContain(first[column]);
        expect(values.filter((v) => !v.includes(first[column])), 'rows not matching the search').toEqual([]);
        await tab.search('');
      });
    }
  });

  test(`TC-${CASE.checklist}: should show the seven columns, an accurate count and a detach control on eligible rows when the tab opens`, async ({
    networkDetailPage,
    policyNetwork,
    steps,
  }) => {
    const network = await policyNetwork();

    await steps.critical('Navigate to a network with linked policies and select the Policies tab', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.policies().open();
    });

    await steps.step('All seven required columns are visible and populated', async () => {
      const tab = networkDetailPage.policies();
      expect(await tab.getHeaders()).toEqual(expect.arrayContaining([...REQUIRED_COLUMNS]));
      for (const row of await tab.readRows()) {
        expect(REQUIRED_COLUMNS.filter((column) => row[column] === ''), `empty cells in ${row[COLUMN.number]}`).toEqual([]);
      }
    });

    await steps.step('The count indicator is present and matches the register', async () => {
      expect(await networkDetailPage.policies().getCountIndicator()).toBe(network.policies);
    });

    await steps.step('A detach control is offered on the eligible (non-read-only) rows', async () => {
      const rows = await networkDetailPage.policies().readRows();
      expect(rows.filter((row) => DETACH_ACTION.test(row.actions)).length, 'rows offering Detach').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASE.consistency}: should show the Policy Management module's values when a linked policy is listed on the network`, async ({
    networkDetailPage,
    policyManagementPage,
    policyNetwork,
    steps,
  }) => {
    const network = await policyNetwork();
    let row: Record<string, string> = {};

    await steps.critical('Navigate to a network with linked policies - the tab lists them', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.policies();
      await tab.open();
      [row] = await tab.readRows();
      expect(row, 'a linked policy to compare').toBeDefined();
    });

    await steps.step('The row\'s status matches the policy as Policy Management (the source of truth) holds it', async () => {
      // The sheet's step 2 changes the policy in Policy Management first. That
      // is not done here: the policy belongs to a shared team record. What is
      // asserted is the claim itself - the network view shows what the source
      // module holds - on the policy as it stands.
      await policyManagementPage.openList(network.payer);
      await policyManagementPage.search(row[COLUMN.number]);
      const source = (await policyManagementPage.getPolicyRows()).find((policy) => policy.name === row.Name);
      expect(source, `Policy Management should list "${row.Name}"`).toBeDefined();
      expect(source!.status, 'the status must match the source module').toBe(row[COLUMN.status]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
