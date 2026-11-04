import { test, expect, type FacilitySession } from '../../../utils/facility/writerCHelpers';
import type { FacilityDetailPage } from '../../../pages/facility/FacilityDetailPage';
import { AppRoutes } from '../../../constants/AppRoutes';
import { ACCESS_RESTRICTED, BLOCKED_CASES, CASES, FACILITY_RIGHT } from '../../../data/facility/facilityPermissions.data';
import { deleteFacility, readFacilityOrNull, type ProvisionedFacility } from '../../../utils/FacilityProvisioning';

/** The header actions a detail renders (enabled or not), sorted: "activate", "delete", "edit", "inactivate". */
const shown = (states: Record<string, { availability: string }>): string[] =>
  Object.entries(states).filter(([, s]) => s.availability !== 'absent').map(([key]) => key).sort();

/** Opens a facility on a detail and records a mismatch between the actions shown and those expected. */
async function checkActions(detail: FacilityDetailPage, who: string, facility: ProvisionedFacility, label: string, expected: string[], findings: string[], reload = false): Promise<void> {
  await detail.open(facility.id);
  if (reload) {
    await detail.reload();
    await detail.waitForLoaded();
  }
  const actual = shown(await detail.readActionStates());
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    findings.push(`${who} on the ${label} facility${reload ? ' (after a refresh)' : ''}: shown [${actual.join(', ')}], expected [${[...expected].sort().join(', ')}]`);
  }
}

/**
 * User story 15144: Facility Permissions.
 * The administrator account (it holds every right) is the "Facility
 * Administrator"; the other roles are the Payer Admin role shaped per case
 * (fixture `facilityRole`, data/facility/facilityPermissions.data.ts) and
 * restored afterwards. On the detail the actions are Edit, Inactivate (the
 * story's "Deactivate") | Activate, Delete; View is the list row's.
 */
test.describe('US 15144 - Facility Permissions', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.adminAllActions.azureId}: should show the administrator every authorised action on an Active facility`, async ({
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the facility list loads showing existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the record for an Active facility - the facility details page opens with action controls visible', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.getStatus()).toBe('Active');
      expect((await facilityDetailPage.readOfferedActions()).length, 'action controls on the record').toBeGreaterThan(0);
    });

    await steps.step('Review the action buttons shown on the facility - View, Edit, Deactivate and Delete are all visible and enabled', async () => {
      const header = await facilityDetailPage.readActionStates();
      await facilityManagementPage.openTable();
      const view = (await facilityManagementPage.getActionState(facility.nameEn, 'view')).availability;
      expect({ view, edit: header.edit.availability, deactivate: header.inactivate.availability, delete: header.delete.availability })
        .toEqual({ view: 'available', edit: 'available', deactivate: 'available', delete: 'available' });
    });
  });

  test(`TC-${CASES.viewOnly.azureId}: should show a view-only user no Edit, Activate, Deactivate or Delete control on a facility`, async ({
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityRole,
    requireFacilityListAccess,
    requireBaseline,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityDetailPage.open(facility.id);
      requireBaseline(shown(await facilityDetailPage.readActionStates()).length > 0, 'the Edit / Inactivate / Delete controls on an Active facility');
      session = await facilityRole.signIn(CASES.viewOnly.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open any facility record - the facility details page opens', async () => {
      await session.facilities.openDetails(facility.nameEn);
      expect(await session.detail.getName()).toBe(facility.nameEn);
    });

    await steps.step('Review the action buttons available on the page - only View is shown; Edit, Activate, Deactivate and Delete are not rendered', async () => {
      const header = shown(await session.detail.readActionStates());
      await session.facilities.openTable();
      const row = shown(await session.facilities.readActionStates(facility.nameEn));
      expect({ record: header, row }, `actions rendered without ${session.removed.join(', ')}`).toEqual({ record: [], row: ['view'] });
    });
  });

  test(`TC-${CASES.roleAndStatus.azureId}: should show exactly the actions both the role and the facility status allow`, async ({
    facilityIn,
    facilityManagementPage,
    facilityRole,
    requireFacilityListAccess,
    steps,
  }) => {
    const data = CASES.roleAndStatus;
    const active = await facilityIn('Active');
    const inactive = await facilityIn('Inactive');
    let full!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(active.nameEn), 'the Active facility').toBe(true);
      expect(await facilityManagementPage.isListed(inactive.nameEn), 'the Inactive facility').toBe(true);
    });

    await steps.step('Open an Active facility as the Edit-Only role - Edit is visible but Activate, Deactivate and Delete are not', async () => {
      const editOnly = await facilityRole.signIn(data.editOnly);
      await requireFacilityListAccess(editOnly);
      await editOnly.detail.open(active.id);
      expect(shown(await editOnly.detail.readActionStates()), `actions for ${editOnly.granted.join(', ')}`).toEqual(['edit']);
    });

    await steps.step('Open an Inactive facility as the Full Access role - View, Edit, Activate and Delete are visible but Deactivate is not', async () => {
      full = await facilityRole.signIn(data.fullAccess);
      await requireFacilityListAccess(full);
      await full.facilities.openTable();
      const view = (await full.facilities.getActionState(inactive.nameEn, 'view')).availability;
      await full.detail.open(inactive.id);
      expect({ view: view !== 'absent', record: shown(await full.detail.readActionStates()) }).toEqual({ view: true, record: ['activate', 'delete', 'edit'] });
    });

    await steps.step('Open an Active facility as the Full Access role - View, Edit, Deactivate and Delete are visible but Activate is not', async () => {
      await full.facilities.openTable();
      const view = (await full.facilities.getActionState(active.nameEn, 'view')).availability;
      await full.detail.open(active.id);
      expect({ view: view !== 'absent', record: shown(await full.detail.readActionStates()) }).toEqual({ view: true, record: ['delete', 'edit', 'inactivate'] });
    });
  });

  test(`TC-${CASES.deactivateEndToEnd.azureId}: should deactivate an Active facility end to end and show it Inactive everywhere`, async ({
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    steps,
  }) => {
    const data = CASES.deactivateEndToEnd;
    const facility = await facilityIn('Active');
    let drawer!: Awaited<ReturnType<typeof facilityDetailPage.openInactivate>>;

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Search for and open facility ${facility.code} - the facility details page opens showing Status = Active`, async () => {
      await facilityManagementPage.search(facility.code);
      await facilityManagementPage.openDetails(facility.nameEn);
      expect(await facilityDetailPage.getStatus()).toBe('Active');
    });

    await steps.critical('Select the Deactivate action - a confirmation dialog asks the user to confirm', async () => {
      drawer = await facilityDetailPage.openInactivate();
      expect(await drawer.getTitleText()).toMatch(/inactivate|deactivate/i);
    });

    await steps.step('Confirm the deactivation - a success message is displayed and the facility Status updates to Inactive', async () => {
      const answer = await drawer.inactivate(data.details, data.reason);
      expect(answer.status, `SetFacilityActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(answer.messages.join(' | '), 'the success message').toMatch(/inactivated|deactivated/i);
      await facilityDetailPage.expectStatus('Inactive');
    });

    await steps.step('Return to the facility list - the facility is shown with Status = Inactive', async () => {
      await facilityManagementPage.openTable();
      expect((await facilityManagementPage.readRow(facility.nameEn)).status).toBe('Inactive');
    });
  });

  test(`TC-${CASES.activateAfterDeactivate.azureId}: should offer Activate only once a facility is deactivated and never both controls at once`, async ({
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Open the Active facility - the Deactivate action is visible and the Activate action is not', async () => {
      await facilityDetailPage.open(facility.id);
      expect({ deactivate: await facilityDetailPage.getActionAvailability('inactivate'), activate: await facilityDetailPage.getActionAvailability('activate') })
        .toEqual({ deactivate: 'available', activate: 'absent' });
    });

    await steps.critical('Select Deactivate and confirm the action - the facility status changes to Inactive and a confirmation message is shown', async () => {
      const drawer = await facilityDetailPage.openInactivate();
      const answer = await drawer.inactivate(CASES.activateAfterDeactivate.details);
      expect(answer.status, `SetFacilityActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(answer.messages.join(' | '), 'the confirmation message').toMatch(/inactivated|deactivated/i);
      await facilityDetailPage.expectStatus('Inactive');
    });

    await steps.step('Reopen the same facility record - the Activate action is now visible and the Deactivate action is no longer shown', async () => {
      await facilityDetailPage.open(facility.id);
      expect({ deactivate: await facilityDetailPage.getActionAvailability('inactivate'), activate: await facilityDetailPage.getActionAvailability('activate') })
        .toEqual({ deactivate: 'absent', activate: 'available' });
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should keep facility action controls consistent across roles, statuses and refreshes`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityRole,
    requireFacilityListAccess,
    steps,
  }) => {
    const data = CASES.exploratory;
    const active = await facilityIn('Active');
    const inactive = await facilityIn('Inactive');
    const deleted = await facilityIn('Active');
    let editOnly!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      const gone = await deleteFacility(page, deleted.id);
      expect(gone.status, `the "Deleted" facility: ${gone.text.slice(0, 160)}`).toBeLessThan(300);
      expect(await readFacilityOrNull(page, deleted.id), 'the deleted facility').toBeNull();
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(active.nameEn)).toBe(true);
    });

    await steps.step('Freely open facilities in different statuses while switching between accounts - each facility shows only the actions valid for the role and status', async () => {
      const findings: string[] = [];
      await checkActions(facilityDetailPage, 'the administrator', active, 'Active', ['edit', 'inactivate', 'delete'], findings);
      await checkActions(facilityDetailPage, 'the administrator', inactive, 'Inactive', ['edit', 'activate', 'delete'], findings);
      await facilityDetailPage.openExpectingFailure(deleted.id);
      if (await facilityDetailPage.isLoaded()) findings.push(`the administrator opened the Deleted facility and was shown [${shown(await facilityDetailPage.readActionStates()).join(', ')}]`);

      const viewer = await facilityRole.signIn(data.viewer);
      await requireFacilityListAccess(viewer);
      await checkActions(viewer.detail, 'the viewer', active, 'Active', [], findings);
      await checkActions(viewer.detail, 'the viewer', inactive, 'Inactive', [], findings);

      editOnly = await facilityRole.signIn(data.editOnly);
      await requireFacilityListAccess(editOnly);
      await checkActions(editOnly.detail, 'the edit-only user', active, 'Active', ['edit'], findings);
      await checkActions(editOnly.detail, 'the edit-only user', inactive, 'Inactive', ['edit'], findings);
      await editOnly.detail.openExpectingFailure(deleted.id);
      if (await editOnly.detail.isLoaded()) findings.push(`the edit-only user opened the Deleted facility and was shown [${shown(await editOnly.detail.readActionStates()).join(', ')}]`);
      expect(findings, 'inconsistent or wrongly exposed actions').toEqual([]);
    });

    await steps.step('Rapidly switch back and forth between two facilities and refresh the page - the action controls stay accurate after each refresh', async () => {
      const findings: string[] = [];
      for (let round = 0; round < 2; round += 1) {
        await checkActions(facilityDetailPage, 'the administrator', active, 'Active', ['edit', 'inactivate', 'delete'], findings, true);
        await checkActions(facilityDetailPage, 'the administrator', inactive, 'Inactive', ['edit', 'activate', 'delete'], findings, true);
        await checkActions(editOnly.detail, 'the edit-only user', active, 'Active', ['edit'], findings, true);
        await checkActions(editOnly.detail, 'the edit-only user', inactive, 'Inactive', ['edit'], findings, true);
      }
      expect(findings, 'stale or incorrect controls after switching and refreshing').toEqual([]);
    });
  });

  test(`TC-${CASES.revokedMidSession.azureId}: should stop showing Edit as soon as the facility is reopened after the permission is revoked`, async ({
    facilityIn,
    facilityManagementPage,
    facilityRole,
    requireFacilityListAccess,
    steps,
  }) => {
    const data = CASES.revokedMidSession;
    const facility = await facilityIn('Active');
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      session = await facilityRole.signIn(data.granted);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility record while Edit permission is still active - the Edit action is visible', async () => {
      await session.detail.open(facility.id);
      expect(await session.detail.getActionAvailability('edit')).toBe('available');
    });

    await steps.critical('Have an administrator revoke the user\'s Edit permission - the permission change is saved', async () => {
      // reshape saves the role ("Role updated") or BLOCKS the case with the catalogue's answer.
      const { removed } = await facilityRole.reshape(data.revoke);
      expect(removed).toContain(FACILITY_RIGHT.edit.label);
    });

    await steps.step('Refresh or reopen the facility record - the Edit action is no longer shown', async () => {
      await session.detail.open(facility.id);
      await session.detail.reload();
      await session.detail.waitForLoaded();
      expect(await session.detail.getActionAvailability('edit'), 'Edit after the revocation').toBe('absent');
    });
  });

  test(`TC-${CASES.unrecognisedRole.azureId}: should deny every facility action by default to a user whose role grants nothing`, async ({
    facilityIn,
    facilityManagementPage,
    facilityRole,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Log in as the user with the unrecognised role and open a facility record - the facility\'s page is reached', async () => {
      session = await facilityRole.signIn(CASES.unrecognisedRole.shape);
      await session.detail.openExpectingFailure(facility.id);
      expect(session.page.url(), 'the address reached').toContain(AppRoutes.facilityManagement);
    });

    await steps.step('Review the available actions - no action button, View included, is shown and an access-restricted message is displayed', async () => {
      const record = (await session.detail.isLoaded()) ? shown(await session.detail.readActionStates()) : [];
      const text = await session.detail.getScreenText();
      const listed = (await session.facilities.canListFacilities()) && (await session.facilities.isListed(facility.nameEn).catch(() => false));
      const view = listed ? (await session.facilities.getActionState(facility.nameEn, 'view')).availability : 'absent';
      expect({ record, view }, `actions offered to a role holding no facility right`).toEqual({ record: [], view: 'absent' });
      expect(text, 'an access-restricted message').toMatch(ACCESS_RESTRICTED);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
