import { test, expect } from '../../../fixtures';
import {
  ACTION,
  ALL_ACTIONS,
  BLOCKED_CASES,
  CASE,
  ENTRY_TIME_PATTERN,
  STATUS_CHANGE,
  appearsInOrder,
} from '../../../data/networks/auditHistory.data';

/**
 * User story 14139: View network audit history.
 * Which events the tab records - create, update, status change, delete,
 * facility membership - with what detail, and who may see it.
 */
test.describe('US 14139 - Audit history events', () => {
  test(`TC-${CASE.eventList}: should list the network's Create, Update and Status Change events when its Audit History tab opens`, async ({
    networkDetailPage,
    networkIn,
    publishEdit,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Inactive');
    await publishEdit(network);

    await steps.critical('Navigate to the network - its detail view loads with tabs', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.hasTab('audit')).toBe(true);
    });

    await steps.critical('Select the Audit History tab - a chronological list of events is shown', async () => {
      await networkDetailPage.audit().expectEntry(ACTION.update);
    });

    await steps.step('Create, Update and Status Change entries are listed with their details', async () => {
      const entries = await networkDetailPage.audit().readEntries();
      const actions = entries.map((entry) => entry.action);
      for (const action of [ACTION.create, ACTION.update, ACTION.statusChange]) {
        expect(actions, `the history should hold a ${action} entry`).toContain(action);
      }
      expect(entries.filter((entry) => entry.when === '' || entry.by === ''), 'entries without time or user').toEqual([]);
    });
  });

  test(`TC-${CASE.noPermission}: should hide or refuse the Audit History tab when a user lacks the audit history permission`, async ({
    networkDetailPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active');

    await steps.critical('Navigate as the administrator - the tab is offered and shows the history (baseline)', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().open();
      expect((await networkDetailPage.audit().readEntries()).length).toBeGreaterThan(0);
    });

    await steps.step('The unpermitted user is given no audit data - the tab is hidden or refuses to load', async () => {
      const session = await shapedNonAdmin({ without: ['viewNetworkAuditTrail'] });
      const access = await session.networks.readActionAccess({ id: network.id, name: network.name });
      expect(access.auditLog, 'no audit entries may reach a user without the permission').toBe(false);
    });
  });

  test(`TC-${CASE.lifecycleSequence}: should record Create, Update, Status Change and Delete in order when a network goes through its lifecycle`, async ({
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    publishEdit,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the created network - a Create event is recorded', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().expectEntry(ACTION.create);
    });

    await steps.critical('Update a field - an Update event is recorded', async () => {
      await publishEdit(network, { descriptionEn: 'Lifecycle update' });
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().expectEntry(ACTION.update);
    });

    await steps.critical('Change the status from Active to Inactive - a Status Change event is recorded', async () => {
      await networkDetailPage.open(network.id);
      const drawer = await networkDetailPage.openInactivate();
      await drawer.inactivateWithFirstReason('Lifecycle status change');
      await networkDetailPage.open(network.id);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().expectEntry(ACTION.statusChange);
    });

    await steps.step('Delete the network - a Delete event is recorded', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.deleteAndCapture();
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().expectEntry(ACTION.delete);
    });

    await steps.step('All four events are listed in chronological order', async () => {
      const actions = (await networkDetailPage.audit().readAllEntries()).map((entry) => entry.action);
      expect(
        appearsInOrder(actions, [ACTION.create, ACTION.update, ACTION.statusChange, ACTION.delete]),
        `the order of ${actions.join(' < ')}`,
      ).toBe(true);
    });
  });

  test(`TC-${CASE.pdplChecklist}: should give every audit entry a formatted time, a user, an action type and changed values when entries are inspected`, async ({
    networkDetailPage,
    networkIn,
    publishEdit,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Inactive');
    await publishEdit(network);

    await steps.critical('Navigate to the network and open Audit History - the event list loads', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().expectEntry(ACTION.update);
    });

    await steps.step('Every entry has a consistently formatted timestamp', async () => {
      const entries = await networkDetailPage.audit().readEntries();
      expect(entries.filter((entry) => !ENTRY_TIME_PATTERN.test(entry.when)), 'malformed timestamps').toEqual([]);
    });

    await steps.step('Every entry identifies the acting user', async () => {
      const entries = await networkDetailPage.audit().readEntries();
      expect(entries.filter((entry) => entry.by === ''), 'entries without a user').toEqual([]);
    });

    await steps.step('Every entry carries one of the defined action types', async () => {
      const entries = await networkDetailPage.audit().readEntries();
      expect(entries.filter((entry) => !ALL_ACTIONS.includes(entry.action)), 'unlabelled or unknown actions').toEqual([]);
    });

    for (const action of [ACTION.update, ACTION.statusChange]) {
      await steps.step(`The ${action} entry shows the changed fields with before and after values`, async () => {
        const tab = networkDetailPage.audit();
        const index = (await tab.readEntries()).findIndex((entry) => entry.action === action);
        expect(index, `a ${action} entry to inspect`).toBeGreaterThanOrEqual(0);
        const detail = await tab.openEntry(index);
        await tab.closeEntry();
        expect(detail.changes.length, 'changed values').toBeGreaterThan(0);
        expect(detail.changes.filter((change) => change.field === ''), 'changes without a field name').toEqual([]);
      });
    }
  });

  test(`TC-${CASE.facilityEvents}: should log Facility Assigned and Facility Unassigned with the facility when a facility is assigned then unassigned`, async ({
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active');
    let facility = '';

    await steps.critical('Navigate to the network and assign a facility - the assignment is saved', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.facilities();
      await tab.open();
      await tab.openAssignDrawer();
      const [option] = await tab.getAssignableOptions();
      expect(option, 'a facility to assign').toBeDefined();
      facility = option.split('—')[0].trim();
      await tab.selectFacilities([facility]);
      expect((await tab.confirmAssign())?.status).toBeLessThan(300);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });

    await steps.critical('Unassign the same facility - the unassignment is saved', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.facilities();
      await tab.open();
      expect((await tab.remove(facility))?.status).toBeLessThan(300);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });

    await steps.step('Audit History lists a Facility Assigned and a Facility Unassigned entry naming the facility', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.audit();
      await tab.expectEntry(ACTION.facilityUnassigned);
      const entries = await tab.readEntries();
      for (const action of [ACTION.facilityAssigned, ACTION.facilityUnassigned]) {
        const index = entries.findIndex((entry) => entry.action === action);
        expect(index, `a ${action} entry`).toBeGreaterThanOrEqual(0);
        const detail = await tab.openEntry(index);
        await tab.closeEntry();
        expect(JSON.stringify(detail.changes), `the ${action} entry should identify ${facility}`).toContain(facility);
        expect(detail.meta, 'time and user').not.toBe('');
      }
    });
  });

  test(`TC-${CASE.newNetwork}: should show only the Create event when a brand-new network's Audit History opens`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft');

    await steps.critical('Navigate to the new network and open Audit History - the tab loads', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().open();
    });

    await steps.step('Only the initial Create event is shown, with no broken rows', async () => {
      const entries = await networkDetailPage.audit().readEntries();
      expect(entries.map((entry) => entry.action), 'the history of a just-created network').toEqual([ACTION.create]);
    });
  });

  test(`TC-${CASE.statusChange}: should show a Status Change from Active to Inactive when the network is inactivated`, async ({
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the Active network and inactivate it - its status becomes Inactive', async () => {
      await networkDetailPage.open(network.id);
      const drawer = await networkDetailPage.openInactivate();
      await drawer.inactivateWithFirstReason('Audit status change');
      await networkDetailPage.open(network.id);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(STATUS_CHANGE.after);
    });

    await steps.step('A Status Change entry shows the time, user and Active -> Inactive', async () => {
      const tab = networkDetailPage.audit();
      await tab.expectEntry(ACTION.statusChange);
      const index = (await tab.readEntries()).findIndex((entry) => entry.action === ACTION.statusChange);
      const detail = await tab.openEntry(index);
      await tab.closeEntry();
      expect(detail.action).toBe(ACTION.statusChange);
      expect(detail.meta, 'time and user').not.toBe('');
      const change = detail.changes.find((c) => STATUS_CHANGE.field.test(c.field));
      expect(change, 'a status field change').toBeDefined();
      expect([change!.before, change!.after]).toEqual([STATUS_CHANGE.before, STATUS_CHANGE.after]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
