import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import type { NetworkFormDialog } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_LIFECYCLE, NETWORK_WIZARD_TITLE } from '../../../data/networks/network.data';
import { AUTHORISATION_REFUSALS, every, offeredIn, pick } from '../../../data/networks/networkPermissions.data';
import {
  API_BYPASS,
  CREATE_ONLY,
  DECISION_TABLE,
  EDIT_WITHOUT_STATUS,
  FACILITY_MEMBERSHIP_ONLY,
  NO_ACCESS,
  WITHOUT_DELETE,
} from '../../../data/networks/rolePermissions.data';

/**
 * User story 14140: Control access with role-based permissions.
 * Each network action is enforced on its own permission - in the UI and on
 * the server.
 *
 * HOW THE TEST ROLES ARE MADE. The environment has one non-administrator
 * account; its shared "Payer Admin" role is shaped for the case by the
 * administrator (fixture `shapedNonAdmin`) and restored in teardown. Every
 * "the control is withheld" assertion is preceded by a BASELINE: the same
 * control must be on offer to the administrator for the same network
 * (`requireBaseline`) - an absent control proves nothing otherwise.
 *
 * KNOWN at writing: role edits do not propagate to the signed-in user in this
 * build (2026-09-21). The fixture annotates that; the cases still assert what
 * the story requires, so a withheld permission still offered is a failure.
 */
test.describe('US 14140 - Each network action on its own permission', () => {
  test(`TC-${CREATE_ONLY.azureId}: should let the user create a network but not edit it when only Create Network is granted`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    cleanup,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CREATE_ONLY.network();
    const reference = await networkIn('Draft');
    let shaped!: ShapedSession;
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the Network Management module as the create-only role - the list is displayed', async () => {
      const baseline = await networkManagementPage.readActionAccess(reference);
      requireBaseline(baseline.create && baseline.edit, 'Create Network and Edit');
      shaped = await shapedNonAdmin(CREATE_ONLY.role);
      await shaped.networks.openList();
    });

    await steps.critical('The Create Network action opens the creation form', async () => {
      cleanup.register(() => networkManagementPage.discardDraftNetwork(data.nameEn));
      form = await shaped.networks.openAddForm();
      expect(await form.getTitleText()).toBe(NETWORK_WIZARD_TITLE.add);
    });

    await steps.critical('Completing and submitting the form creates the network', async () => {
      const outcome = await form.create(data);
      expect(outcome?.status ?? 0, 'CreateNetwork should accept the create-only role').toBeLessThan(300);
    });

    await steps.step('The newly created network offers no usable Edit action', async () => {
      await shaped.networks.openList();
      await shaped.networks.search(data.nameEn);
      expect(
        await shaped.networks.getRowActionAvailability(data.nameEn, 'edit'),
        'a role without Edit Network must not be offered Edit on its own new network',
      ).not.toBe('available');
    });
  });

  test(`TC-${DECISION_TABLE.azureId}: should allow each action only to the role holding its own permission when roles hold exactly one permission`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(40 * 60_000);
    const editTarget = await networkIn('Active');
    const activateTarget = await networkIn('Inactive');
    const inactivateTarget = await networkIn('Active');
    const deleteTarget = await networkIn('Active');
    let editOnly!: ShapedSession;

    await steps.critical('Navigate to the module - every action is on offer to a session holding all rights', async () => {
      const edit = await networkManagementPage.readActionAccess(editTarget);
      const activate = await networkManagementPage.readActionAccess(activateTarget);
      const inactivate = await networkManagementPage.readActionAccess(inactivateTarget);
      requireBaseline(edit.edit && edit.delete && activate.activate && inactivate.inactivate, 'Edit, Delete, Activate and Inactivate');
      editOnly = await shapedNonAdmin(DECISION_TABLE.editOnly);
      await editOnly.networks.openList();
    });

    await steps.step('The Edit-only role edits the Active network successfully', async () => {
      const form = await editOnly.networks.openEditForm(editTarget.name);
      await form.editField('descriptionEn', DECISION_TABLE.editedDescription);
      const outcome = await form.saveEditAndCapture();
      expect(outcome?.status ?? 0, 'UpdateNetwork should accept the Edit-only role').toBeLessThan(300);
    });

    await steps.step('The same Edit-only role is refused Delete on that network', async () => {
      await editOnly.networks.openList();
      await editOnly.networks.search(editTarget.name);
      expect(await editOnly.networks.getRowActionAvailability(editTarget.name, 'delete')).not.toBe('available');
    });

    await steps.step('The Activate-only role activates the Inactive network successfully', async () => {
      const activateOnly = await shapedNonAdmin(DECISION_TABLE.activateOnly);
      await activateOnly.networks.openList();
      const outcome = await activateOnly.networks.attemptActivation(activateTarget.name);
      expect(outcome.status, `the activation should be accepted: ${outcome.toast}`).toBeGreaterThanOrEqual(200);
      expect(outcome.status).toBeLessThan(300);

      await activateOnly.networks.openList();
      await activateOnly.networks.search(inactivateTarget.name);
      expect(
        await activateOnly.networks.getRowActionAvailability(inactivateTarget.name, 'inactivate'),
        'the Activate-only role must not be offered Inactivate',
      ).not.toBe('available');
    });

    await steps.step('The Delete-only role deletes a network but is refused Edit', async () => {
      const deleteOnly = await shapedNonAdmin(DECISION_TABLE.deleteOnly);
      await deleteOnly.networks.openList();
      const outcome = await deleteOnly.networks.deleteNetwork(deleteTarget.name);
      expect(outcome?.status ?? 0, 'DeleteNetwork should accept the Delete-only role').toBeGreaterThanOrEqual(200);
      expect(outcome?.status ?? 0).toBeLessThan(300);

      await deleteOnly.networks.openList();
      await deleteOnly.networks.search(editTarget.name);
      expect(await deleteOnly.networks.getRowActionAvailability(editTarget.name, 'edit')).not.toBe('available');
    });
  });

  test(`TC-${WITHOUT_DELETE.azureId}: should withhold Delete when the user holds every network permission except Delete`, async ({
    networkDetailPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active');
    let shaped!: ShapedSession;

    await steps.critical('Navigate to the module - the network list is displayed', async () => {
      await networkDetailPage.open(network.id);
      requireBaseline((await networkDetailPage.getActionAvailability('delete')) === 'available', 'Delete on the detail screen');
      shaped = await shapedNonAdmin(WITHOUT_DELETE.role);
      await shaped.networks.openList();
    });

    await steps.critical('The network\'s detail view loads with its available actions', async () => {
      await shaped.networkDetail.open(network.id);
      expect(await shaped.networkDetail.getName()).toBe(network.name);
    });

    await steps.step('Delete is hidden, disabled or refused', async () => {
      expect(await shaped.networkDetail.getActionAvailability('delete'), 'the detail header must not offer a usable Delete').not.toBe(
        'available',
      );
      await shaped.networks.openList();
      await shaped.networks.search(network.name);
      expect(await shaped.networks.getRowActionAvailability(network.name, 'delete'), 'nor may the list row').not.toBe('available');
    });
  });

  test(`TC-${NO_ACCESS.azureId}: should offer no network action anywhere when the role holds no network permission`, async ({
    networkManagementPage,
    shapedNonAdmin,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Active');
    let baselineOffered: typeof NO_ACCESS.actions = [];
    let shaped!: ShapedSession;

    await steps.critical('Navigate to the module as the no-access role', async () => {
      const baseline = await networkManagementPage.readActionAccess(network);
      baselineOffered = offeredIn(baseline, NO_ACCESS.actions);
      expect(baselineOffered.length, 'the administrator should be offered the actions being withheld').toBeGreaterThan(0);
      shaped = await shapedNonAdmin(NO_ACCESS.role);
    });

    await steps.step('No action is available - list, detail URL, tabs, toolbar and rows all withheld', async () => {
      const access = await shaped.networks.readActionAccess(network);
      expect(pick(access, baselineOffered), 'every action the administrator is offered must be withheld').toEqual(
        every(baselineOffered, false),
      );
    });

    await steps.step('Direct navigation to the network detail URL is denied', async () => {
      await shaped.networkDetail.openExpectingFailure(network.id);
      expect(await shaped.networkDetail.isLoaded(), 'the detail screen must not render the network').toBe(false);
    });
  });

  test(`TC-${EDIT_WITHOUT_STATUS.azureId}: should block activation and inactivation but allow editing when only Edit is held`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active');
    let shaped!: ShapedSession;

    await steps.critical('Navigate to the module - the network list is displayed', async () => {
      const baseline = await networkManagementPage.readActionAccess(network);
      requireBaseline(baseline.inactivate && baseline.edit, 'Inactivate and Edit on an Active network');
      shaped = await shapedNonAdmin(EDIT_WITHOUT_STATUS.role);
      await shaped.networks.openList();
    });

    await steps.step('Inactivate is blocked on the Active network and it stays Active', async () => {
      await shaped.networks.search(network.name);
      expect(await shaped.networks.getRowActionAvailability(network.name, 'inactivate')).not.toBe('available');
      expect(await shaped.networks.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('Editing an unrelated field is saved and the network stays Active', async () => {
      const form = await shaped.networks.openEditForm(network.name);
      await form.editField('descriptionEn', EDIT_WITHOUT_STATUS.editedDescription);
      const outcome = await form.saveEditAndCapture();
      expect(outcome?.status ?? 0, 'the edit should be accepted').toBeLessThan(300);
      expect(await shaped.networks.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('Activate is unavailable on an already Active network', async () => {
      await shaped.networks.search(network.name);
      expect(await shaped.networks.getRowActionAvailability(network.name, 'activate')).not.toBe('available');
    });
  });

  test(`TC-${API_BYPASS.azureId}: should refuse a direct update with 403 and change nothing when the user lacks Edit Network`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active');
    let shaped!: ShapedSession;

    await steps.critical('Navigate to the module - the network list is displayed', async () => {
      requireBaseline((await networkManagementPage.readActionAccess(network)).edit, 'Edit');
      shaped = await shapedNonAdmin(API_BYPASS.role);
      await shaped.networks.openList();
    });

    await steps.step('The Edit control is not offered in the UI', async () => {
      await shaped.networks.search(network.name);
      expect(await shaped.networks.getRowActionAvailability(network.name, 'edit')).not.toBe('available');
    });

    await steps.step('A direct PUT to UpdateNetwork is refused for authorisation and applies nothing', async () => {
      const answer = await shaped.networks.attemptUpdateViaApi(network.id, { networkNameEn: API_BYPASS.attemptedName });
      expect(AUTHORISATION_REFUSALS, `the server answered ${answer.status}: ${answer.text.slice(0, 200)}`).toContain(answer.status);
      expect((await networkManagementPage.readNetworkRecord(network.id)).networkNameEn, 'the name must be unchanged').toBe(network.name);
    });
  });

  test(`TC-${FACILITY_MEMBERSHIP_ONLY.azureId}: should let the user assign and unassign facilities but not edit when only facility membership is granted`, async ({
    networkDetailPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active');
    let shaped!: ShapedSession;
    let facility = '';

    await steps.critical('Navigate to the module - the network list is displayed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      requireBaseline(await networkDetailPage.facilities().isAssignOffered(), 'Assign Facilities');
      shaped = await shapedNonAdmin(FACILITY_MEMBERSHIP_ONLY.role);
      await shaped.networks.openList();
    });

    await steps.critical('The network\'s detail view loads with its facility tab', async () => {
      await shaped.networkDetail.open(network.id);
      await shaped.networkDetail.facilities().open();
      expect(await shaped.networkDetail.hasTab('facilities')).toBe(true);
    });

    await steps.step('Assigning a facility succeeds on the membership permission', async () => {
      const tab = shaped.networkDetail.facilities();
      await tab.openAssignDrawer();
      const pool = await tab.getAssignableOptions();
      expect(pool.length, 'the drawer should offer a facility to assign').toBeGreaterThan(0);
      facility = FACILITY_MEMBERSHIP_ONLY.codeOf(pool[0]);
      await tab.selectFacilities([facility]);
      const outcome = await tab.confirmAssign();
      expect(outcome?.status ?? 0, 'AssignFacilitiesToNetwork should accept the membership role').toBeLessThan(300);
    });

    await steps.step('Editing a core field such as the name is blocked', async () => {
      await shaped.networks.openList();
      await shaped.networks.search(network.name);
      expect(await shaped.networks.getRowActionAvailability(network.name, 'edit')).not.toBe('available');
      expect(await shaped.networkDetail.getActionAvailability('edit')).not.toBe('available');
    });

    await steps.step('Unassigning the facility succeeds on the same permission', async () => {
      await shaped.networkDetail.open(network.id);
      await shaped.networkDetail.facilities().open();
      const outcome = await shaped.networkDetail.facilities().remove(facility);
      expect(outcome?.status ?? 0, 'UnassignFacilityFromNetwork should accept the membership role').toBeLessThan(300);
    });
  });
});
