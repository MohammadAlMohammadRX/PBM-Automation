import { test, expect } from '../../../fixtures';
import { ACTION, CASE } from '../../../data/networks/auditHistory.data';

/**
 * User story 14139: View network audit history.
 * The tab's filters - the action type filter used alone. The case's own
 * network carries every event it filters on.
 */
test.describe('US 14139 - Audit history filters', () => {
  test(`TC-${CASE.actionTypeOnly}: should show only Delete events across all dates when the action type filter is used alone`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', { facilities: 0 });

    await steps.critical('Navigate to a network with a recorded deletion and open Audit History', async () => {
      await networkDetailPage.open(network.id);
      expect((await networkDetailPage.deleteAndCapture()).outcome?.status).toBeLessThan(300);
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().expectEntry(ACTION.delete);
    });

    await steps.step('Filtering by Delete with no date range applies the action type alone', async () => {
      expect((await networkDetailPage.audit().applyFilter({ actionType: ACTION.delete })).applied).toBe(true);
    });

    await steps.step('Only Delete events are shown, from the whole history', async () => {
      const actions = (await networkDetailPage.audit().readEntries()).map((entry) => entry.action);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.filter((action) => action !== ACTION.delete), 'non-Delete events').toEqual([]);
    });
  });
});
