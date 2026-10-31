import { test, expect } from '../../../fixtures';
import { ADMIN_MATRIX, BLOCKED_CASES, CASES, VIEW, VIEW_EDIT } from '../../../data/terminology/terminologyPermissions.data';
import { MESSAGE } from '../../../data/terminology/terminology.data';

/**
 * User story 15163: Control Access to Terminology Functions by Permission.
 * View, Edit, Delete and Audit History are granted independently; each is
 * enforced on screen and on the server, takes effect as soon as it changes,
 * cannot be bypassed, and is not scoped by payer.
 */
test.describe('US 15163 - Control Access to Terminology Functions by Permission', () => {
  test(`TC-${CASES.viewOnly.azureId}: should show data with no edit or delete control when the user holds view permission only`, async ({
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn({ records: [{ Code: 'VIEW-ONLY-1' }] });
    const session = await shapedNonAdmin(CASES.viewOnly.granted);
    await requireListAccess(session);

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.isListed(terminology.name), 'the view-only user should see the terminology').toBe(true);
    });

    await steps.step('Opening a terminology shows its details page with all tabs', async () => {
      await session.terminologyDetail.open(terminology.id);
      expect(await session.terminologyDetail.getTabLabels()).toEqual(expect.arrayContaining([expect.stringMatching(/data|overview/i), expect.stringMatching(/fields/i)]));
    });

    await steps.step('No edit or delete action is available to this user', async () => {
      const actions = await session.terminologyDetail.readActionStates();
      expect({ edit: actions.edit.availability, delete: actions.delete.availability }).toEqual({ edit: expect.not.stringMatching(/^available$/), delete: expect.not.stringMatching(/^available$/) });
    });
  });

  test(`TC-${CASES.viewOnlyEdit.azureId}: should refuse with a permission error when a view-only user attempts an edit directly`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(CASES.viewOnlyEdit.granted);
    await requireListAccess(session);

    await steps.critical('Opening a terminology record shows its details page', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('Triggering the edit directly is refused with a permission error', async () => {
      const answer = await session.terminologies.sendUpdate(terminology.id, { description: CASES.viewOnlyEdit.change });
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(MESSAGE.denied);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.description).not.toBe(CASES.viewOnlyEdit.change);
    });
  });

  test(`TC-${CASES.editAllowed.azureId}: should save the update when a user holding the edit permission changes a terminology`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const data = CASES.editAllowed;
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(data.granted);
    await requireListAccess(session);

    await steps.critical('Opening a terminology record shows its details page', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('The edit action makes the fields editable', async () => {
      expect((await session.terminologyDetail.getActionState('edit')).availability).toBe('available');
    });

    await steps.step('Saving updates the terminology and shows the new value', async () => {
      await session.terminologies.openExpectingDenial();
      const drawer = await session.terminologies.openEditForm(terminology.name);
      await drawer.fillDescription(data.change);
      expect((await drawer.attemptSave()).status).toBe(200);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.description).toBe(data.change);
    });
  });

  test(`TC-${CASES.noAccess.azureId}: should block the module entirely when the user holds no terminology permission`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    const terminology = await terminologyIn();
    await terminologyManagementPage.open();
    requireBaseline(await terminologyManagementPage.isModuleOffered(), 'the Terminology Mgmt menu entry');
    const session = await shapedNonAdmin({ without: CASES.noAccess.withdrawn });

    await steps.step('The module is not visible, or access is denied with a permission message', async () => {
      expect(await session.terminologies.isModuleOffered()).toBe(false);
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.isListRendered()).toBe(false);
    });

    await steps.step('Reaching a terminology record directly is refused', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded(), 'the record should not open').toBe(false);
      expect(await session.terminologies.fetchTerminology(terminology.id), 'the record\'s data').toBeNull();
    });
  });

  test(`TC-${CASES.deleteAllowed.azureId}: should remove the terminology when a user holding the delete permission deletes it`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(CASES.deleteAllowed.granted);
    await requireListAccess(session);

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.isListed(terminology.name)).toBe(true);
    });

    await steps.step('The terminology eligible for deletion shows its details and actions', async () => {
      expect((await session.terminologies.getActionState(terminology.name, 'delete')).availability).toBe('available');
    });

    await steps.step('Delete and confirm remove it from the list', async () => {
      expect((await session.terminologies.attemptDelete(terminology.name)).status).toBe(200);
      expect(await terminologyManagementPage.fetchTerminology(terminology.id)).toBeNull();
    });
  });

  test(`TC-${CASES.editNotDelete.azureId}: should block the deletion when the user may edit but not delete`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(CASES.editNotDelete.granted);
    await requireListAccess(session);

    await steps.critical('Opening a terminology record shows its details page', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('The delete option is unavailable or refused with a permission error', async () => {
      expect((await session.terminologyDetail.getActionState('delete')).availability).not.toBe('available');
      const answer = await session.terminologies.sendDelete(terminology.id);
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.fetchTerminology(terminology.id)).not.toBeNull();
    });
  });

  test(`TC-${CASES.adminMatrix.azureId}: should offer exactly View, Edit, Delete and Audit History when the user holds the default Administrator role`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Every action of the Administrator\'s matrix entry - view, edit, delete, audit history - is available', async () => {
      const list = await terminologyManagementPage.readActionStates(terminology.name);
      for (const action of ADMIN_MATRIX.list) expect(list[action].availability, action).toBe('available');
      await terminologyDetailPage.open(terminology.id);
      expect(await terminologyDetailPage.hasTab('audit')).toBe(true);
    });

    await steps.step('No action outside the matrix is enabled', async () => {
      const detail = await terminologyDetailPage.readActionStates();
      const extra = Object.entries(detail).filter(([key, state]) => state.availability === 'available' && !(ADMIN_MATRIX.detail as readonly string[]).includes(key)).map(([key]) => key);
      expect(extra, 'actions enabled beyond View / Edit / Delete / Audit History').toEqual([]);
    });
  });

  test(`TC-${CASES.payerIndependent.azureId}: should show every terminology when an authorized user is assigned to a specific payer`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const unrelated = await terminologyIn();
    const session = await shapedNonAdmin(CASES.payerIndependent.granted);
    await requireListAccess(session);
    let total = -1;

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      total = (await terminologyManagementPage.fetchRegister()).totalRows;
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.getPageText(), 'the module should render for the user').not.toBe('');
    });

    await steps.step('The full list is shown with no payer filter - not limited to the user\'s payer', async () => {
      expect((await session.terminologies.fetchRegister()).totalRows).toBe(total);
    });

    await steps.step('A terminology unrelated to the user\'s payer opens normally', async () => {
      await session.terminologyDetail.openExpectingFailure(unrelated.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
      expect(await session.terminologyDetail.getName()).toBe(unrelated.name);
    });
  });

  test(`TC-${CASES.minimal.azureId}: should show only read-only information when the user holds the minimum view-only permission`, async ({
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn({ records: [{ Code: 'MINIMAL-1' }] });
    const session = await shapedNonAdmin(CASES.minimal.granted);
    await requireListAccess(session);

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.getPageText(), 'the module should render for the user').not.toBe('');
    });

    await steps.step('Opening a terminology record shows its details page', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('The actions area shows no edit, delete or other restricted action - only read-only information', async () => {
      const header = await session.terminologyDetail.readActionStates();
      const add = await session.terminologyDetail.getToolbarState('addRecord');
      const upload = await session.terminologyDetail.getToolbarState('upload');
      const offered = [...Object.entries(header), ['addRecord', add], ['upload', upload]].filter(([, s]) => (s as { availability: string }).availability === 'available').map(([k]) => k);
      expect(offered, 'modifying actions offered to the minimum role').toEqual([]);
    });
  });

  test(`TC-${CASES.revoked.azureId}: should remove edit access when the user's edit permission is revoked`, async ({
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const data = CASES.revoked;
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(data.granted);
    await requireListAccess(session);

    await steps.critical('With the edit permission the list shows usable edit controls', async () => {
      await session.terminologies.openExpectingDenial();
      expect((await session.terminologies.getActionStateIfListed(terminology.name, 'edit')).availability).toBe('available');
    });

    await steps.critical('An administrator revokes the edit permission and the change is saved', async () => {
      const reshaped = await shapedNonAdmin(VIEW);
      await requireListAccess(reshaped);
      expect(reshaped.removed, 'the edit permission taken off the role').toContain('UpdateTerminology');
    });

    await steps.step('After refreshing, the user no longer has edit controls', async () => {
      await session.terminologies.openExpectingDenial();
      expect((await session.terminologies.getActionStateIfListed(terminology.name, 'edit')).availability).not.toBe('available');
    });
  });

  test(`TC-${CASES.bypass.azureId}: should reject the request and change nothing when a view-only user replays an edit or delete`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(CASES.bypass.granted);
    await requireListAccess(session);

    await steps.critical('Opening a terminology record shows its details page', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('Replaying an edit and a delete request outside the hidden controls is rejected and changes nothing', async () => {
      const edit = await session.terminologies.sendUpdate(terminology.id, { description: CASES.bypass.change });
      const del = await session.terminologies.sendDelete(terminology.id);
      expect([edit.status, del.status].filter((s) => s < 400), 'requests accepted').toEqual([]);
      const stored = await terminologyManagementPage.fetchTerminology(terminology.id);
      expect(stored?.description).not.toBe(CASES.bypass.change);
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should enforce each user's permissions consistently when several users try every terminology action`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Each user is allowed or blocked strictly by the permissions assigned', async () => {
      const viewer = await shapedNonAdmin(VIEW);
      await requireListAccess(viewer);
      const viewerEdit = (await viewer.terminologies.sendUpdate(terminology.id, { description: CASES.exploratory.change })).status;
      const editor = await shapedNonAdmin(VIEW_EDIT);
      await requireListAccess(editor);
      const editorEdit = (await editor.terminologies.sendUpdate(terminology.id, { description: CASES.exploratory.change })).status;
      const editorDelete = (await editor.terminologies.sendDelete(terminology.id)).status;
      expect({ viewerEdit: viewerEdit >= 400, editorEdit, editorDelete: editorDelete >= 400 }).toEqual({ viewerEdit: true, editorEdit: 200, editorDelete: true });
    });

    await steps.step('Switching users in quick succession re-checks permissions and never lets an unauthorized action through', async () => {
      const viewer = await shapedNonAdmin(VIEW);
      await requireListAccess(viewer);
      expect((await viewer.terminologies.sendUpdate(terminology.id, { description: 'Should not apply' })).status).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.fetchTerminology(terminology.id)).not.toBeNull();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
