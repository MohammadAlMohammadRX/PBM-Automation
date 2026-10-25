import { test, expect } from '../../../fixtures';
import { ASSIGNMENT_STATE, BUDGET, FACILITY_ACTIVE, NO_FACILITIES } from '../../../data/networks/facilities.data';
import {
  BLOCKED_CASES,
  CASE,
  MANY,
  REQUIRED_COLUMNS,
  SECOND,
  SHOWN,
  SORTABLE_HEADERS,
} from '../../../data/networks/assignedFacilities.data';

/**
 * User story 14133: View assigned facilities for a network.
 * What the Facility Assignment tab shows, how its count agrees with the
 * directory, and what changes when a facility is approved or removed.
 */
test.describe('US 14133 - Assigned facilities view', () => {
  test(`TC-${CASE.displaysRow}: should show each assigned facility's name, code and status when the Facilities tab is opened`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [SHOWN.code] });

    await steps.critical('Navigate to the network - its detail screen opens', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getName()).toBe(network.name);
    });

    await steps.critical('The Facilities tab opens and lists the assigned facilities', async () => {
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().readRows()).length).toBe(1);
    });

    await steps.step('The row shows the facility name, code and status', async () => {
      expect(await networkDetailPage.facilities().findRow(SHOWN.code)).toMatchObject({
        name: SHOWN.name,
        code: SHOWN.code,
        status: FACILITY_ACTIVE,
      });
    });
  });

  test(`TC-${CASE.countClasses}: should count zero, one and many facilities exactly as the directory does`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.twoLiveNetworks);
    const none = await networkIn('Draft', { facilities: 0 });
    const one = await networkIn('Active', { facilityCodes: [SHOWN.code] });
    const many = await networkIn('Active', { facilityCodes: MANY });
    const classes = [
      { label: 'zero', network: none, count: 0 },
      { label: 'one', network: one, count: 1 },
      { label: 'many', network: many, count: MANY.length },
    ];

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    for (const entry of classes) {
      await steps.step(`The ${entry.label}-facility network shows ${entry.count} rows and a count of ${entry.count}, matching the directory`, async () => {
        await networkDetailPage.open(entry.network.id);
        await networkDetailPage.facilities().open();
        expect((await networkDetailPage.facilities().readRows()).length, 'rows').toBe(entry.count);
        expect(await networkDetailPage.getTabCount('facilities'), 'tab count').toBe(entry.count);
        await networkManagementPage.openList();
        expect((await networkManagementPage.readRow(entry.network.name)).facilities, 'directory count').toBe(String(entry.count));
      });
    }
  });

  test(`TC-${CASE.pendingToActive}: should show the facility as active once its pending assignment is approved`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [SHOWN.code] });

    await steps.critical('Navigate to the network - the newly proposed facility reads Pending', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([SECOND.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().expectAssignmentState(SECOND.code, ASSIGNMENT_STATE.pendingAssignment);
    });

    await steps.critical('The assignment is approved', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });

    await steps.step('Reopening the tab shows the facility as an active assignment', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toContain(SECOND.code);
      expect((await networkDetailPage.facilities().findRow(SECOND.code))?.status).toBe(FACILITY_ACTIVE);
    });
  });

  test(`TC-${CASE.removeUpdatesCount}: should remove only the targeted facility and keep the count in step with the directory`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [SHOWN.code, SECOND.code] });

    await steps.critical('Navigate to the network - two facilities are listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().readRows()).length).toBe(2);
    });

    await steps.critical('Remove prompts for confirmation, which is given', async () => {
      const attempt = await networkDetailPage.facilities().attemptRemove(SHOWN.code);
      expect(attempt.message).toContain(SHOWN.name);
      expect(attempt.outcome?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
    });

    await steps.step('Only that facility is gone and the count is 1 in the tab and the directory', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toEqual([SECOND.code]);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(1);
      await networkManagementPage.openList();
      expect((await networkManagementPage.readRow(network.name)).facilities).toBe('1');
    });
  });

  test(`TC-${CASE.exploreSortFilter}: should keep every row consistent when the list is sorted, searched and cleared`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: MANY });

    await steps.critical('Navigate to the network - every facility is listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getCodes()).sort()).toEqual([...MANY].sort());
    });

    for (const header of SORTABLE_HEADERS) {
      await steps.step(`Sorting by ${header} orders the rows without losing any`, async () => {
        const values = await networkDetailPage.facilities().sortByHeader(header);
        expect(values.length, 'no rows lost').toBe(MANY.length);
        const ascending = [...values].sort((a, b) => a.localeCompare(b));
        const descending = [...ascending].reverse();
        expect([ascending, descending], `"${header}" should be ordered: ${values.join(', ')}`).toContainEqual(values);
      });
    }

    await steps.step('Searching a facility code shows only that facility', async () => {
      await networkDetailPage.facilities().search(SHOWN.code);
      expect(await networkDetailPage.facilities().getCodes()).toEqual([SHOWN.code]);
    });

    await steps.step('Clearing the search brings every row back', async () => {
      await networkDetailPage.facilities().search('');
      expect((await networkDetailPage.facilities().getCodes()).sort()).toEqual([...MANY].sort());
    });
  });

  test(`TC-${CASE.checklist}: should show the required columns, a Remove on every row and a matching count indicator`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [SHOWN.code, SECOND.code] });

    await steps.critical('Navigate to the network and open the Facilities tab', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().readRows()).length).toBe(2);
    });

    await steps.step('Facility Name, Code and Assignment Status columns are present and populated', async () => {
      const headers = await networkDetailPage.facilities().getHeaders();
      for (const column of REQUIRED_COLUMNS) expect(headers.some((h) => column.test(h)), `a column matching ${column}`).toBe(true);
      for (const row of await networkDetailPage.facilities().readRows()) {
        expect(row.name).not.toBe('');
        expect(row.code).not.toBe('');
        expect(row.status).not.toBe('');
      }
    });

    await steps.step('Every row offers Remove', async () => {
      expect((await networkDetailPage.facilities().readRows()).every((row) => row.removable)).toBe(true);
    });

    await steps.step('The count indicator is shown and matches the directory', async () => {
      expect(await networkDetailPage.getTabCount('facilities')).toBe(2);
      await networkManagementPage.openList();
      expect((await networkManagementPage.readRow(network.name)).facilities).toBe('2');
    });
  });

  test(`TC-${CASE.integrity}: should never let the displayed count diverge from the directory count`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [SHOWN.code, SECOND.code] });
    let shown = -1;

    await steps.critical('Navigate to the network - the Facilities tab lists what it holds', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      shown = (await networkDetailPage.facilities().readRows()).length;
      expect(shown).toBeGreaterThan(0);
    });

    await steps.step('The tab count, the rows and the directory count agree', async () => {
      expect(await networkDetailPage.getTabCount('facilities'), 'tab count vs rows').toBe(shown);
      await networkManagementPage.openList();
      expect((await networkManagementPage.readRow(network.name)).facilities, 'directory vs rows').toBe(String(shown));
    });
  });

  test(`TC-${CASE.removeBlocked}: should withhold Remove from a user without the facility-removal permission`, async ({
    networkDetailPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: [SHOWN.code, SECOND.code] });

    await steps.critical('Navigate to the network as the administrator - Remove is offered (baseline)', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().readRows()).every((row) => row.removable)).toBe(true);
    });

    const session = await shapedNonAdmin({ without: ['unassignFacility'] });

    await steps.step('The restricted user sees the facilities but no Remove on any row', async () => {
      await session.networkDetail.open(network.id);
      await session.networkDetail.facilities().open();
      const rows = await session.networkDetail.facilities().readRows();
      expect(rows.length).toBe(2);
      expect(rows.filter((row) => row.removable).map((row) => row.code), 'rows still offering Remove').toEqual([]);
    });
  });

  test(`TC-${CASE.coordinatorRemoves}: should let an authorised coordinator remove a facility end to end`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [SHOWN.code, SECOND.code] });

    await steps.critical('Navigate to the network - Remove is enabled on its facilities', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().isRemoveOffered(SHOWN.code)).toBe(true);
    });

    await steps.step('Removing and confirming succeeds with a confirmation message', async () => {
      const attempt = await networkDetailPage.facilities().attemptRemove(SHOWN.code);
      expect(attempt.outcome?.status).toBeLessThan(300);
      expect(attempt.toast, 'a success confirmation message').not.toBe('');
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().expectRowAbsent(SHOWN.code);
    });
  });

  test(`TC-${CASE.emptyState}: should show an empty state with a zero count and no actions when no facility is assigned`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilities: 0 });

    await steps.critical('Navigate to the network with no facilities - its Facilities tab opens', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().readRows()).toEqual([]);
    });

    await steps.step('An empty-state message, a zero count and no Remove actions are shown', async () => {
      expect(await networkDetailPage.facilities().getEmptyText()).toMatch(NO_FACILITIES);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(0);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
