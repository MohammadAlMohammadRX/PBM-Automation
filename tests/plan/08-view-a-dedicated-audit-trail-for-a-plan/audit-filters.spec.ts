import { test, expect } from '../../../fixtures';
import {
  ACTION,
  CASE,
  entryDay,
  shiftDay,
} from '../../../data/plans/planAuditTrail.data';

/**
 * User story 14157: View a dedicated audit trail for a plan.
 * The trail's filters - action type, date range, both together, the range
 * boundaries and an inverted range. Every case filters its own plan, whose
 * history (create, approval, inactivation) is built by fixture `planIn` and is
 * all recorded today. Twin: tests/network/20-view-network-audit-history/audit-filters.
 */
test.describe('US 14157 - Plan audit trail filters', () => {
  test(`TC-${CASE.actionTypeFilter}: should show only entries of the chosen action type when the action type filter is applied and changed`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Inactive');

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan\'s Audit History tab - the full, unfiltered trail loads', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().expectEntry(ACTION.statusChange);
    });

    await steps.critical('Apply a filter for action type Status Change - the list refreshes', async () => {
      const result = await planDetailPage.audit().applyFilter({ actionType: ACTION.statusChange });
      expect(result.applied, `the filter should apply: ${result.messages.join(' ')}`).toBe(true);
    });

    await steps.step('Only Status Change entries are shown', async () => {
      const actions = (await planDetailPage.audit().readEntries()).map((entry) => entry.action);
      expect(actions.length, 'the inactivation recorded a Status Change').toBeGreaterThan(0);
      expect(actions.filter((action) => action !== ACTION.statusChange), 'entries of other types').toEqual([]);
    });

    await steps.critical('Change the filter to action type Update (the sheet\'s "Edited") - the list refreshes again', async () => {
      const tab = planDetailPage.audit();
      await tab.clearFilters();
      const result = await tab.applyFilter({ actionType: ACTION.update });
      expect(result.applied, `the filter should apply: ${result.messages.join(' ')}`).toBe(true);
    });

    await steps.step('Only Update entries are shown', async () => {
      const actions = (await planDetailPage.audit().readEntries()).map((entry) => entry.action);
      expect(actions.length, 'the plan\'s edits should be listed').toBeGreaterThan(0);
      expect(actions.filter((action) => action !== ACTION.update), 'entries of other types').toEqual([]);
    });
  });

  test(`TC-${CASE.dateBoundaries}: should include entries on the boundary dates and exclude those just outside when a date range is applied`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Inactive');
    let earliest = '';
    let latest = '';
    let all = 0;

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan\'s Audit History tab - the full trail loads', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().expectEntry(ACTION.statusChange);
      const entries = await planDetailPage.audit().readAllEntries();
      all = entries.length;
      latest = entryDay(entries[0].when);
      earliest = entryDay(entries[entries.length - 1].when);
      expect(all).toBeGreaterThan(0);
    });

    await steps.critical('Set the range from the earliest entry\'s date to the latest entry\'s date - the filter applies', async () => {
      const result = await planDetailPage.audit().applyFilter({ from: earliest, to: latest });
      expect(result.applied, `the range should apply: ${result.messages.join(' ')}`).toBe(true);
    });

    await steps.step('Entries dated exactly on the start and end dates are included', async () => {
      const days = (await planDetailPage.audit().readAllEntries()).map((entry) => entryDay(entry.when));
      expect(days.length, 'every entry lies within its own first and last day').toBe(all);
      expect(days, 'the earliest-day entries').toContain(earliest);
      expect(days, 'the latest-day entries').toContain(latest);
    });

    await steps.critical('Narrow the end date to one day before the latest entry - the filter reapplies', async () => {
      const tab = planDetailPage.audit();
      await tab.clearFilters();
      const result = await tab.applyFilter({ from: shiftDay(earliest, -1), to: shiftDay(latest, -1) });
      expect(result.applied, `the range should apply: ${result.messages.join(' ')}`).toBe(true);
    });

    await steps.step('The latest entry is now excluded, so the boundary is respected', async () => {
      const days = (await planDetailPage.audit().readAllEntries()).map((entry) => entryDay(entry.when));
      expect(days.filter((day) => day === latest), 'entries of the excluded last day').toEqual([]);
    });
  });
});
