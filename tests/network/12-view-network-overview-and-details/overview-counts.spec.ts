import { test, expect } from '../../../fixtures';
import { BLOCKED_CASES, CASE, LIVE_COUNT, TAB_SWITCH_ROUNDS } from '../../../data/networks/overviewDetails.data';

/**
 * User story 14126: View network overview and details.
 * The facility and policy counts - the numbers in the two tab labels - read
 * live, at zero, in every presence combination, and under rapid switching.
 *
 * Networks with linked policies are discovered (fixture `policyNetwork`) and
 * only READ: they are shared team records.
 */
test.describe('US 14126 - Facility and policy counts', () => {
  test(`TC-${CASE.facilitiesCountLive}: should recount assigned facilities live when a facility is added and the page reopened`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active', { facilities: LIVE_COUNT.initial });

    await steps.critical('Navigate to the network - the facility count reads the initial number', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(LIVE_COUNT.initial);
    });

    await steps.critical('Assign one more facility from the facilities tab - it is added to the list', async () => {
      const tab = networkDetailPage.facilities();
      await tab.open();
      await tab.openAssignDrawer();
      const pool = await tab.getAssignableOptions();
      expect(pool.length, 'a further facility should be assignable').toBeGreaterThan(0);
      await tab.selectFacilities([pool[0]]);
      const outcome = await tab.confirmAssign();
      expect(outcome?.status, `the assignment should be accepted: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      expect((await tab.readRows()).length).toBe(LIVE_COUNT.afterAssign);
    });

    await steps.step('Reopening the page shows the recalculated count', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getTabCount('facilities'), 'the count should be live, not cached').toBe(LIVE_COUNT.afterAssign);
    });
  });

  test(`TC-${CASE.zeroCounts}: should show 0 facilities and 0 policies when a new network has neither`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilities: 0 });

    await steps.critical('Navigate to the new network - the Overview loads', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getName()).toBe(network.name);
    });

    await steps.step('Both counts display 0, with no blank or error', async () => {
      expect(await networkDetailPage.getTabCount('facilities'), 'facility count').toBe(0);
      expect(await networkDetailPage.getTabCount('policies'), 'policy count').toBe(0);
      const row = await networkManagementPage.readRow(network.name);
      expect([row.facilities, row.linkedPolicies], 'the list agrees').toEqual(['0', '0']);
    });
  });

  test(`TC-${CASE.countMatrix}: should show the right facility and policy counts when networks hold facilities, policies or both`, async ({
    networkDetailPage,
    networkIn,
    policyNetwork,
    steps,
  }) => {
    const facilitiesOnly = await networkIn('Draft', { facilities: 1 });
    const policiesOnly = await policyNetwork({ withFacilities: false });
    const both = await policyNetwork({ withFacilities: true });

    await steps.critical('Navigate to the module - the facilities-only network opens', async () => {
      await networkDetailPage.open(facilitiesOnly.id);
      expect(await networkDetailPage.getName()).toBe(facilitiesOnly.name);
    });

    await steps.step('Facilities but no policies: a non-zero facility count and 0 policies', async () => {
      expect(await networkDetailPage.getTabCount('facilities')).toBe(1);
      expect(await networkDetailPage.getTabCount('policies')).toBe(0);
    });

    await steps.step('Policies but no facilities: 0 facilities and a non-zero policy count', async () => {
      await networkDetailPage.open(policiesOnly.id);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(0);
      expect(await networkDetailPage.getTabCount('policies')).toBe(policiesOnly.policies);
    });

    await steps.step('Both: each count shows its correct non-zero value', async () => {
      await networkDetailPage.open(both.id);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(both.facilities);
      expect(await networkDetailPage.getTabCount('policies')).toBe(both.policies);
    });
  });

  test(`TC-${CASE.rapidTabs}: should keep counts and tab content consistent when tabs are switched rapidly and the page reloaded`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active');
    const expected = network.facilityIds.length;

    await steps.critical('Navigate to the network - the detail screen loads', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getName()).toBe(network.name);
    });

    for (const phase of ['before reload', 'after reload'] as const) {
      await steps.step(`Rapid tab switching ${phase} keeps every tab and count correct`, async () => {
        await networkDetailPage.open(network.id);
        for (let round = 1; round <= TAB_SWITCH_ROUNDS; round += 1) {
          await networkDetailPage.openTab('overview');
          await networkDetailPage.facilities().open();
          expect((await networkDetailPage.facilities().readRows()).length, `round ${round}: facility rows`).toBe(expected);
          await networkDetailPage.policies().open();
          expect(await networkDetailPage.policies().readRows(), `round ${round}: policy rows`).toEqual([]);
          await networkDetailPage.audit().open();
          expect(await networkDetailPage.getTabCount('facilities'), `round ${round}: facility count`).toBe(expected);
          expect(await networkDetailPage.getTabCount('policies'), `round ${round}: policy count`).toBe(0);
        }
        await networkDetailPage.reload();
        await networkDetailPage.waitForLoaded();
      });
    }
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
