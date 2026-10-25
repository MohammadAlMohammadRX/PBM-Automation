import { test, expect } from '../../../fixtures';
import {
  ACTION,
  CASE,
  INVALID_RANGE_MESSAGE,
  auditDay,
  entryDay,
} from '../../../data/networks/auditHistory.data';

/**
 * User story 14139: View network audit history.
 * The tab's filters - action type, date range, both, neither - and how an
 * inverted range is refused. The case's own network carries every event it
 * filters on; all of it is recorded today, so "today" is the single-day and
 * earliest-day boundary.
 */
test.describe('US 14139 - Audit history filters', () => {
  test(`TC-${CASE.dateBoundaries}: should return exactly the matching day's events and refuse an inverted range when date-range boundaries are applied`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active');
    let all = 0;

    await steps.critical('Navigate to the network and open Audit History - the full list is shown', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().open();
      all = (await networkDetailPage.audit().readEntries()).length;
      expect(all, 'the network should have events to filter').toBeGreaterThan(0);
    });

    await steps.step('A single-day range (start = end, a day with events) shows only that day\'s events', async () => {
      const tab = networkDetailPage.audit();
      const result = await tab.applyFilter({ from: auditDay(), to: auditDay() });
      expect(result.applied, `the range should apply: ${result.messages.join(' ')}`).toBe(true);
      const entries = await tab.readEntries();
      expect(entries.length, 'every event happened today').toBe(all);
      expect(entries.filter((entry) => entryDay(entry.when) !== auditDay()), 'events from other days').toEqual([]);
      await tab.clearFilters();
    });

    await steps.step('The earliest event date as both start and end shows only the earliest events', async () => {
      const tab = networkDetailPage.audit();
      const earliest = entryDay((await tab.readAllEntries()).slice(-1)[0].when);
      const result = await tab.applyFilter({ from: earliest, to: earliest });
      expect(result.applied).toBe(true);
      expect((await tab.readEntries()).filter((entry) => entryDay(entry.when) !== earliest), 'events from other days').toEqual([]);
      await tab.clearFilters();
    });

    await steps.step('A start date after the end date shows a validation message and no results', async () => {
      const result = await networkDetailPage.audit().applyFilter({ from: auditDay(1), to: auditDay() });
      expect(result.applied, 'an inverted range must not be applied').toBe(false);
      expect(result.messages.join(' '), 'the user should be told the range is invalid').toMatch(INVALID_RANGE_MESSAGE);
    });
  });

  test(`TC-${CASE.filterMatrix}: should return the intersection of action type and date range and restore everything on clear when filters are combined`, async ({
    networkDetailPage,
    networkIn,
    publishEdit,
    publishFacilityChange,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active');
    await publishEdit(network);
    await publishFacilityChange(network, { assignAny: 1 });
    let all = 0;

    await steps.critical('Navigate to the network and open Audit History - the full list is shown', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().expectEntry(ACTION.update);
      all = (await networkDetailPage.audit().readEntries()).length;
    });

    await steps.step('Action type Update alone shows only Update events across all dates', async () => {
      const tab = networkDetailPage.audit();
      expect((await tab.applyFilter({ actionType: ACTION.update })).applied).toBe(true);
      const actions = (await tab.readEntries()).map((entry) => entry.action);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.filter((action) => action !== ACTION.update), 'non-Update events').toEqual([]);
      await tab.clearFilters();
    });

    await steps.step('A date range alone shows every event type within it', async () => {
      const tab = networkDetailPage.audit();
      expect((await tab.applyFilter({ from: auditDay(-7), to: auditDay() })).applied).toBe(true);
      expect((await tab.readEntries()).length, 'all of this week\'s events').toBe(all);
      await tab.clearFilters();
    });

    await steps.step('Facility Assigned plus a date range shows only Facility Assigned events in range', async () => {
      const tab = networkDetailPage.audit();
      expect((await tab.applyFilter({ actionType: ACTION.facilityAssigned, from: auditDay(-7), to: auditDay() })).applied).toBe(true);
      const actions = (await tab.readEntries()).map((entry) => entry.action);
      expect(actions.length, 'the facility assignment should be found').toBeGreaterThan(0);
      expect(actions.filter((action) => action !== ACTION.facilityAssigned), 'other event types').toEqual([]);
    });

    await steps.step('Clearing every filter restores the full list', async () => {
      const tab = networkDetailPage.audit();
      await tab.clearFilters();
      expect((await tab.readEntries()).length).toBe(all);
    });
  });

  test(`TC-${CASE.complianceReview}: should give a filtered, fully detailed facility-membership trail when a compliance officer reviews a network`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    publishFacilityChange,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active');
    const [assigned] = await publishFacilityChange(network, { assignAny: 1 });
    await publishFacilityChange(network, { unassign: [assigned] });

    await steps.critical('Search for and open the network - the detail view loads', async () => {
      const detail = await networkManagementPage.openDetails(network.name);
      expect(await detail.getName()).toBe(network.name);
    });

    await steps.critical('Select Audit History - the complete history loads', async () => {
      await networkDetailPage.audit().expectEntry(ACTION.facilityUnassigned);
    });

    for (const action of [ACTION.facilityAssigned, ACTION.facilityUnassigned]) {
      await steps.step(`Filtering by ${action} within the audit period shows only those events, each fully detailed`, async () => {
        const tab = networkDetailPage.audit();
        expect((await tab.applyFilter({ actionType: action, from: auditDay(-30), to: auditDay() })).applied).toBe(true);
        const entries = await tab.readEntries();
        expect(entries.length, `${action} events`).toBeGreaterThan(0);
        expect(entries.filter((entry) => entry.action !== action), 'other events').toEqual([]);
        const detail = await tab.openEntry(0);
        await tab.closeEntry();
        expect(detail.meta, 'timestamp and acting user').not.toBe('');
        expect(detail.changes.length, 'the specific changed values').toBeGreaterThan(0);
        await tab.clearFilters();
      });
    }
  });

  test(`TC-${CASE.invalidRange}: should show a clear validation message and keep the list when the end date is before the start date`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active');
    let before: string[] = [];

    await steps.critical('Navigate to the network and open Audit History - the full list is shown', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().open();
      before = (await networkDetailPage.audit().readEntries()).map((entry) => entry.action);
      expect(before.length).toBeGreaterThan(0);
    });

    await steps.step('An end date earlier than the start date is detected', async () => {
      const result = await networkDetailPage.audit().applyFilter({ from: auditDay(), to: auditDay(-9) });
      expect(result.applied, 'the inverted range must be refused').toBe(false);
      expect(result.messages.join(' '), 'a clear validation message').toMatch(INVALID_RANGE_MESSAGE);
    });

    await steps.step('The list is not silently replaced by an empty or wrong result', async () => {
      expect((await networkDetailPage.audit().readEntries()).map((entry) => entry.action)).toEqual(before);
    });
  });

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
