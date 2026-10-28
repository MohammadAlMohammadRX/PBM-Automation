import { test, expect } from '../../../fixtures';
import {
  ACTION,
  CASE,
  EMPTY_PERIOD,
  INVALID_RANGE_MESSAGE,
  INVERTED_RANGE,
  auditDay,
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

  test(`TC-${CASE.combinedFilters}: should return only entries matching both conditions when action type and date range are combined`, async ({
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

    await steps.critical('Open the plan\'s Audit History tab - the full trail loads', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().expectEntry(ACTION.statusChange);
    });

    await steps.critical('Apply action type Status Change with a date range covering those entries - the list refreshes', async () => {
      const result = await planDetailPage.audit().applyFilter({ actionType: ACTION.statusChange, from: auditDay(-1), to: auditDay() });
      expect(result.applied, `the filters should apply: ${result.messages.join(' ')}`).toBe(true);
    });

    await steps.step('Only entries matching both the action type and the date range are shown', async () => {
      const entries = await planDetailPage.audit().readEntries();
      expect(entries.length, 'today\'s Status Change entries').toBeGreaterThan(0);
      expect(entries.filter((entry) => entry.action !== ACTION.statusChange), 'entries of other types').toEqual([]);
      expect(entries.filter((entry) => ![auditDay(-1), auditDay()].includes(entryDay(entry.when))), 'entries outside the range').toEqual([]);
    });

    await steps.critical('Change the date range to a period with no entries of that type - the list refreshes', async () => {
      const tab = planDetailPage.audit();
      await tab.clearFilters();
      const result = await tab.applyFilter({ actionType: ACTION.statusChange, from: auditDay(EMPTY_PERIOD.fromDays), to: auditDay(EMPTY_PERIOD.toDays) });
      expect(result.applied, `the filters should apply: ${result.messages.join(' ')}`).toBe(true);
    });

    await steps.step('No entries are shown - the combined filter correctly returns zero matches', async () => {
      expect(await planDetailPage.audit().readEntries(), 'the plan did not exist in that period').toEqual([]);
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

  test(`TC-${CASE.invalidRange}: should warn and not apply the filter when the start date is after the end date`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active');
    let before: string[] = [];

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan\'s Audit History tab - the entries load', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      before = (await planDetailPage.audit().readEntries()).map((entry) => entry.action);
      expect(before.length).toBeGreaterThan(0);
    });

    await steps.step('A start date after the end date is entered and applied - a validation message is shown and the filter is not applied', async () => {
      const result = await planDetailPage.audit().applyFilter({ from: auditDay(INVERTED_RANGE.fromDays), to: auditDay(INVERTED_RANGE.toDays) });
      expect(result.applied, 'the inverted range must be refused').toBe(false);
      expect(result.messages.join(' '), 'a clear validation message').toMatch(INVALID_RANGE_MESSAGE);
    });

    await steps.step('The trail is not silently replaced by a wrong result', async () => {
      expect((await planDetailPage.audit().readEntries()).map((entry) => entry.action)).toEqual(before);
    });
  });
});
