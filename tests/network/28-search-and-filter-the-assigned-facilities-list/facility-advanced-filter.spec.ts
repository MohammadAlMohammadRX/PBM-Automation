import { test, expect } from '../../../fixtures';
import { BUDGET, FACILITY } from '../../../data/networks/facilities.data';
import {
  ALL,
  CASE,
  CHECKLIST_KEYS,
  FACILITY_STATUS,
  INVALID_RANGE,
  KEYWORD,
  RANGE,
  STATUS_VALUES,
} from '../../../data/networks/facilitySearchFilter.data';

/**
 * User story 14306: Search and filter the assigned facilities list.
 * The advanced search: facility status and assigned-on range, alone and
 * combined with the keyword, and who may use it.
 *
 * Date cases need REAL Assigned On dates, which only an approved assignment
 * carries - so they run on the case's own Active network, approved today.
 */
test.describe('US 14306 - Advanced filtering of assigned facilities', () => {
  test(`TC-${CASE.dateBoundaries}: should include and exclude a facility exactly at the assigned-on boundary dates`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [FACILITY.nathealth.code] });
    const tab = () => networkDetailPage.facilities();

    await steps.critical('Navigate to the network and open Advanced Search - status and date range are offered', async () => {
      await networkDetailPage.open(network.id);
      await tab().open();
      expect((await tab().readAdvancedSearchChecklist()).keys).toEqual(expect.arrayContaining([...CHECKLIST_KEYS]));
    });

    await steps.step('From = To = the assigned date includes the facility', async () => {
      await tab().advancedSearch({ assignedFrom: RANGE.exactDay.from, assignedTo: RANGE.exactDay.to });
      expect(await tab().getCodes()).toEqual([FACILITY.nathealth.code]);
    });

    await steps.step('From = the day after excludes it', async () => {
      await networkDetailPage.open(network.id);
      await tab().open();
      await tab().advancedSearch({ assignedFrom: RANGE.startsAfter.from, assignedTo: RANGE.startsAfter.to });
      expect(await tab().getCodes()).toEqual([]);
    });

    await steps.step('To = the day before excludes it', async () => {
      await networkDetailPage.open(network.id);
      await tab().open();
      await tab().advancedSearch({ assignedFrom: RANGE.endsBefore.from, assignedTo: RANGE.endsBefore.to });
      expect(await tab().getCodes()).toEqual([]);
    });
  });

  test(`TC-${CASE.statusDateTable}: should intersect status and date range correctly for every combination`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const members = [FACILITY.nathealth.code, FACILITY.pharmacyA.code];
    const network = await networkIn('Active', { facilityCodes: members });
    const tab = () => networkDetailPage.facilities();
    const fresh = async () => {
      await networkDetailPage.open(network.id);
      await tab().open();
    };

    await steps.critical('Navigate to the network and open Advanced Search', async () => {
      await fresh();
      expect((await tab().getCodes()).sort()).toEqual([...members].sort());
    });

    await steps.step('Active + a covering range returns the Active facilities in that range', async () => {
      await tab().advancedSearch({ status: FACILITY_STATUS.active, assignedFrom: RANGE.exactDay.from, assignedTo: RANGE.exactDay.to });
      expect((await tab().getCodes()).sort()).toEqual([...members].sort());
    });

    await steps.step('Inactive + no range returns only Inactive facilities', async () => {
      await fresh();
      await tab().advancedSearch({ status: FACILITY_STATUS.inactive });
      expect((await tab().readRows()).filter((row) => row.status !== FACILITY_STATUS.inactive)).toEqual([]);
    });

    await steps.step('No status + a range returns every facility in the range', async () => {
      await fresh();
      await tab().advancedSearch({ assignedFrom: RANGE.exactDay.from, assignedTo: RANGE.exactDay.to });
      expect((await tab().getCodes()).sort()).toEqual([...members].sort());
    });

    await steps.step('Active + a range covering none returns an empty result', async () => {
      await fresh();
      await tab().advancedSearch({ status: FACILITY_STATUS.active, assignedFrom: RANGE.lastMonth.from, assignedTo: RANGE.lastMonth.to });
      expect(await tab().getCodes()).toEqual([]);
    });
  });

  test(`TC-${CASE.transitions}: should move consistently between keyword, advanced and cleared filter states`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: ALL });
    const tab = () => networkDetailPage.facilities();

    await steps.critical('Navigate to the network with no filter applied', async () => {
      await networkDetailPage.open(network.id);
      await tab().open();
      expect((await tab().getCodes()).length).toBe(ALL.length);
    });

    await steps.step('A keyword filters the list', async () => {
      await tab().search(KEYWORD.partial.term);
      expect((await tab().getCodes()).sort()).toEqual([...KEYWORD.partial.expected].sort());
    });

    await steps.step('Adding status and date range combines with the keyword', async () => {
      await tab().advancedSearch({ status: FACILITY_STATUS.active, assignedFrom: RANGE.exactDay.from, assignedTo: RANGE.exactDay.to });
      expect(await tab().getSearchValue(), 'the keyword should still be applied').toBe(KEYWORD.partial.term);
      expect((await tab().getCodes()).sort()).toEqual([...KEYWORD.partial.expected].sort());
    });

    await steps.step('Clear Filters resets every field and restores the full list', async () => {
      await tab().clearAllFilters();
      expect(await tab().getChips()).toEqual([]);
      expect(await tab().getSearchValue()).toBe('');
      expect((await tab().getCodes()).length).toBe(ALL.length);
    });
  });

  test(`TC-${CASE.exploreCombined}: should always show the last applied combination when keyword and filters are changed freely`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: ALL });
    const tab = () => networkDetailPage.facilities();

    await steps.critical('Navigate to the network with a keyword and advanced filters applied', async () => {
      await networkDetailPage.open(network.id);
      await tab().open();
      await tab().search(KEYWORD.partial.term);
      await tab().advancedSearch({ status: FACILITY_STATUS.active, assignedFrom: RANGE.exactDay.from, assignedTo: RANGE.exactDay.to });
      expect((await tab().getCodes()).sort()).toEqual([...KEYWORD.partial.expected].sort());
    });

    await steps.step('Changing the keyword after the filters updates the list to the new combination', async () => {
      await tab().search(KEYWORD.single.term);
      await tab().search(KEYWORD.exact.term);
      expect(await tab().getCodes(), 'the last keyword should win').toEqual(KEYWORD.exact.expected);
    });
  });

  test(`TC-${CASE.checklist}: should offer every required advanced search control when the panel is opened`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: ALL });
    let checklist = { keys: [] as string[], labels: [] as string[], controls: { search: false, cancel: false, close: false } };

    await steps.critical('Navigate to the network and expand Advanced Search', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      checklist = await networkDetailPage.facilities().readAdvancedSearchChecklist();
      expect(checklist.keys.length).toBeGreaterThan(0);
    });

    await steps.step('Status dropdown, assigned-on From/To range, Search and Clear controls are present and labelled', async () => {
      expect(checklist.keys, 'status and assigned-on range criteria').toEqual(expect.arrayContaining([...CHECKLIST_KEYS]));
      expect(checklist.labels.filter((label) => label === ''), 'unlabelled criteria').toEqual([]);
      expect(checklist.controls.search, 'Search / Apply').toBe(true);
      expect(checklist.controls.cancel, 'Clear / Reset (the panel\'s Cancel)').toBe(true);
    });
  });

  test(`TC-${CASE.invalidRange}: should reject a range whose From date is after its To date and run no search`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: ALL });
    let attempt = { requests: -1, messages: [] as string[], stillOpen: false };

    await steps.critical('Navigate to the network and open Advanced Search', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getCodes()).length).toBe(ALL.length);
    });

    await steps.step('Applying From after To shows a validation error', async () => {
      attempt = await networkDetailPage.facilities().attemptAdvancedSearch({ assignedFrom: RANGE.reversed.from, assignedTo: RANGE.reversed.to });
      expect(attempt.messages.join(' | '), 'the user should be told From must not be after To').toMatch(INVALID_RANGE);
    });

    await steps.step('No search is executed', async () => {
      expect(attempt.requests, 'no facilities request should be sent for an invalid range').toBe(0);
    });
  });

  test(`TC-${CASE.statusValues}: should offer only the predefined facility status values in the status filter`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: ALL });
    let options: string[] = [];

    await steps.critical('Navigate to the network and open the status dropdown', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      options = await networkDetailPage.facilities().getStatusFilterOptions();
      expect(options.length).toBeGreaterThan(0);
    });

    await steps.step('Only Active, Inactive and Pending are selectable', async () => {
      expect(options).toEqual(expect.arrayContaining([...STATUS_VALUES]));
      expect(options.filter((option) => !(STATUS_VALUES as readonly string[]).includes(option)), 'unexpected values').toEqual([]);
    });
  });

  test(`TC-${CASE.roleAccess}: should offer search and filters only to a user with access to the network's facilities`, async ({
    networkDetailPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: ALL });

    await steps.critical('Navigate as the authorised user - search and advanced filters are usable', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().readAdvancedSearchChecklist()).controls.search).toBe(true);
    });

    const session = await shapedNonAdmin({ without: ['viewNetworkFacilities'] });

    await steps.step('A user without access cannot reach the facilities list or its controls', async () => {
      await session.networkDetail.openExpectingFailure(network.id);
      expect(await session.networkDetail.hasTab('facilities'), 'the Facility Assignment tab should not be offered').toBe(false);
    });
  });

  test(`TC-${CASE.reflectsCurrent}: should reflect an assignment's current state when the list is filtered after it changes`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [FACILITY.nathealth.code] });
    const changed = FACILITY.pharmacyA.code;

    await steps.critical('Navigate to the network and move a facility from Pending to approved', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([changed]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });

    await steps.step('Filtering by Status = Active lists the updated facility with its current status', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().advancedSearch({ status: FACILITY_STATUS.active });
      expect(await networkDetailPage.facilities().getSettledCodes()).toContain(changed);
      expect((await networkDetailPage.facilities().findRow(changed))?.status).toBe(FACILITY_STATUS.active);
    });
  });
});
