import { test, expect } from '../../../fixtures';
import { ACTION_LABEL, FIELD_TYPE, MESSAGE, TERMINOLOGY_STATUS, TOAST_TEXT } from '../../../data/terminology/terminology.data';
import { CASES } from '../../../data/terminology/activateDeactivate.data';
import { mappingTo } from '../../../data/terminology/retireValues.data';

/**
 * User story 15146: Activate or Deactivate a Terminology.
 * Status changes take effect at once with no approval, propagate to the screens
 * that consume terminologies (only active ones are offered), are withheld from
 * users without the right, and behave predictably under stale, repeated and
 * concurrent use.
 */
test.describe('US 15146 - Activate or Deactivate a Terminology', () => {
  test(`TC-${CASES.activate.azureId}: should make an inactive terminology Active at once and available to other modules when it is activated`, async ({
    terminologyManagementPage,
    terminologyConfirmDialog,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.activate.name(), active: false });

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The terminology row shows status "Inactive"', async () => {
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.inactive);
    });

    await steps.critical('Clicking "Activate" shows a confirmation prompt', async () => {
      await terminologyManagementPage.requestAction(terminology.name, 'toggleActive');
      expect(await terminologyConfirmDialog.getTitle()).toMatch(/activate/i);
    });

    await steps.step('Confirming changes the status to "Active" immediately', async () => {
      await terminologyConfirmDialog.confirm();
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.active);
    });

    await steps.step('A dependent module offers the newly activated terminology', async () => {
      expect(await terminologyManagementPage.readTerminologiesOfferedElsewhere(FIELD_TYPE.mapping)).toContain(terminology.name);
    });
  });

  test(`TC-${CASES.deactivate.azureId}: should make an active terminology Inactive at once and unavailable to other modules when it is deactivated`, async ({
    terminologyManagementPage,
    terminologyDeactivateDrawer,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.deactivate.name() });

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The row shows status "Active"', async () => {
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.active);
    });

    await steps.critical('Clicking "Deactivate" shows a confirmation prompt', async () => {
      await terminologyManagementPage.openDeactivateDrawer(terminology.name);
      expect(await terminologyDeactivateDrawer.getWarning()).toContain(terminology.name);
    });

    await steps.step('Confirming changes the status to "Inactive" immediately', async () => {
      await terminologyDeactivateDrawer.chooseFirstReason();
      await terminologyDeactivateDrawer.confirm();
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.inactive);
    });

    await steps.step('A dependent module no longer offers the terminology', async () => {
      expect(await terminologyManagementPage.readTerminologiesOfferedElsewhere(FIELD_TYPE.mapping)).not.toContain(terminology.name);
    });
  });

  test(`TC-${CASES.noApproval.azureId}: should apply the deactivation instantly with no pending or approval state when no approval workflow is configured`, async ({
    terminologyManagementPage,
    terminologyDeactivateDrawer,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.noApproval.name() });

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('Selecting the active terminology and clicking "Deactivate" triggers the deactivation', async () => {
      await terminologyManagementPage.openDeactivateDrawer(terminology.name);
      await terminologyDeactivateDrawer.chooseFirstReason();
    });

    await steps.step('Confirming shows no approval request or pending-approval status', async () => {
      await terminologyDeactivateDrawer.confirm();
      const messages = await terminologyManagementPage.waitForVisibleMessages();
      expect(messages.join(' | ')).toMatch(TOAST_TEXT.deactivated);
      expect(messages.join(' | ')).not.toMatch(CASES.noApproval.pending);
    });

    await steps.step('After a refresh the list shows "Inactive" immediately', async () => {
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.inactive);
      expect(await terminologyManagementPage.getRowText(terminology.name)).not.toMatch(CASES.noApproval.pending);
    });
  });

  test(`TC-${CASES.deactivateInUse.azureId}: should make a terminology that is in use unavailable everywhere immediately when it is deactivated`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.deactivateInUse.name() });
    await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(terminology.id, terminology.fieldIds.Code, 'Medication')] });

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The terminology is marked Active with an In Use indicator', async () => {
      const row = await terminologyManagementPage.readRow(terminology.name);
      expect(row.status).toBe(TERMINOLOGY_STATUS.active);
      expect(await terminologyManagementPage.getRowText(terminology.name), 'an In Use indicator').toMatch(CASES.deactivateInUse.inUse);
    });

    await steps.critical('Deactivating it changes the status to Inactive', async () => {
      await terminologyManagementPage.deactivate(terminology.name);
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.inactive);
    });

    await steps.step('The dependent module shows the terminology as unavailable at once', async () => {
      expect(await terminologyManagementPage.readTerminologiesOfferedElsewhere(FIELD_TYPE.mapping)).not.toContain(terminology.name);
    });
  });

  test(`TC-${CASES.activateInUse.azureId}: should make a previously used terminology selectable again immediately when it is activated`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.activateInUse.name(), active: false });
    await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(terminology.id, terminology.fieldIds.Code, 'Medication')] });

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The Inactive terminology previously used by another module shows Inactive', async () => {
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.inactive);
    });

    await steps.critical('Activating it changes the status to Active', async () => {
      await terminologyManagementPage.activate(terminology.name);
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.active);
    });

    await steps.step('The dependent module can select it again at once', async () => {
      expect(await terminologyManagementPage.readTerminologiesOfferedElsewhere(FIELD_TYPE.mapping)).toContain(terminology.name);
    });
  });

  test(`TC-${CASES.onlyActiveOffered.azureId}: should offer only Active terminologies in other modules when the catalogue mixes Active and Inactive ones`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const active = await terminologyIn();
    const inactive = await terminologyIn({ active: false });
    let offered: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list shows a mix of Active and Inactive terminologies', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The statuses are clearly displayed', async () => {
      expect((await terminologyManagementPage.readRow(active.name)).status).toBe(TERMINOLOGY_STATUS.active);
      expect((await terminologyManagementPage.readRow(inactive.name)).status).toBe(TERMINOLOGY_STATUS.inactive);
    });

    await steps.step('A dependent module\'s terminology selection list is displayed', async () => {
      offered = await terminologyManagementPage.readTerminologiesOfferedElsewhere(FIELD_TYPE.mapping);
      expect(offered.length).toBeGreaterThan(0);
    });

    await steps.step('Only Active terminologies are listed there', async () => {
      const register = await terminologyManagementPage.fetchRegister();
      const inactiveNames = register.items.filter((t) => !t.isActive).map((t) => t.name);
      expect(offered.filter((name) => inactiveNames.includes(name)), 'inactive terminologies offered').toEqual([]);
      expect(offered).toContain(active.name);
    });
  });

  test(`TC-${CASES.inactiveExcluded.azureId}: should not let the terminology be found or selected in another module when it is inactive`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.inactiveExcluded.name(), active: false });
    let offered: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The target terminology shows status "Inactive"', async () => {
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.inactive);
    });

    await steps.step('A module that allows selecting terminologies shows its selection control', async () => {
      offered = await terminologyManagementPage.readTerminologiesOfferedElsewhere(FIELD_TYPE.mapping);
      expect(offered.length).toBeGreaterThan(0);
    });

    await steps.step('Searching that control for the inactive terminology finds nothing', async () => {
      expect(offered.filter((name) => name.includes(terminology.name))).toEqual([]);
      expect(await terminologyManagementPage.fetchOfferedTerminologies()).not.toContain(terminology.name);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should block activating or deactivating a terminology when the user lacks Terminology Management rights`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    requireBaseline,
    steps,
  }) => {
    const terminology = await terminologyIn();
    await terminologyManagementPage.open();
    requireBaseline((await terminologyManagementPage.readActionStates(terminology.name)).toggleActive.availability === 'available', 'the Activate / Inactivate action');
    const session = await shapedNonAdmin(CASES.noPermission.granted);
    await requireListAccess(session);

    await steps.step('The list view is displayed or access is restricted', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.getPageText()).not.toBe('');
    });

    await steps.step('The Activate / Deactivate controls on the row are disabled, hidden or unavailable', async () => {
      const state = await session.terminologies.getActionStateIfListed(terminology.name, 'toggleActive');
      expect(state.availability, 'the status toggle for a role without the right').not.toBe('available');
    });

    await steps.step('Triggering the change directly is blocked with an access-denied answer', async () => {
      const answer = await session.terminologies.sendSetActive(terminology.id, false);
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(`${answer.text}`, 'an access-denied answer').toMatch(MESSAGE.denied);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.isActive).toBe(true);
    });
  });

  test(`TC-${CASES.toggleBack.azureId}: should apply each change immediately when a terminology is deactivated and then reactivated`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.toggleBack.name() });

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('Deactivating and confirming changes the status to Inactive', async () => {
      await terminologyManagementPage.deactivate(terminology.name);
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.inactive);
    });

    await steps.critical('Reactivating at once changes the status back to Active', async () => {
      await terminologyManagementPage.activate(terminology.name);
      expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(TERMINOLOGY_STATUS.active);
    });

    await steps.step('The terminology is again available in dependent module selection lists', async () => {
      expect(await terminologyManagementPage.readTerminologiesOfferedElsewhere(FIELD_TYPE.mapping)).toContain(terminology.name);
    });
  });

  test(`TC-${CASES.stale.azureId}: should show a clear error and drop the stale row when a terminology removed by another session is deactivated`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module - the list view shows the terminology', async () => {
      await terminologyManagementPage.open();
      expect(await terminologyManagementPage.isListed(terminology.name)).toBe(true);
    });

    await steps.critical('Another session removes it; the stale row still appears in the cached view', async () => {
      expect((await terminologyManagementPage.removeBehindTheList(terminology.id)).status).toBe(200);
      expect(await terminologyManagementPage.isRowVisible(terminology.name), 'the removed terminology should still show in the unrefreshed list').toBe(true);
    });

    let messages: string[] = [];
    await steps.step('Clicking "Deactivate" on the stale row lets the system attempt the request', async () => {
      expect((await terminologyManagementPage.getActionState(terminology.name, 'toggleActive')).availability).toBe('available');
      messages = await terminologyManagementPage.attemptDeactivate(terminology.name);
    });

    await steps.step('A clear error message is shown and the list refreshes without the stale entry', async () => {
      expect(messages.join(' | '), 'an error about the missing terminology').toMatch(MESSAGE.notFound);
      expect(await terminologyManagementPage.isListed(terminology.name), 'the stale row should be gone').toBe(false);
    });
  });

  test(`TC-${CASES.checklist.azureId}: should label the controls clearly and word the confirmation with the target status when a status change is requested`, async ({
    terminologyManagementPage,
    terminologyDeactivateDrawer,
    terminologyConfirmDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.checklist;
    const active = await terminologyIn();
    const inactive = await terminologyIn({ active: false });

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The Activate and Deactivate controls carry clear labels and tooltips', async () => {
      const onActive = (await terminologyManagementPage.readActionStates(active.name)).toggleActive;
      const onInactive = (await terminologyManagementPage.readActionStates(inactive.name)).toggleActive;
      expect([onActive.label, onInactive.label]).toEqual([ACTION_LABEL.inactivate, ACTION_LABEL.activate]);
      expect(onActive.title, 'the Inactivate tooltip').toMatch(/inactivate|deactivate/i);
      expect(onInactive.title, 'the Activate tooltip').toMatch(/activate/i);
    });

    await steps.step('The deactivation prompt names the terminology and its target status, with confirm and cancel buttons', async () => {
      await terminologyManagementPage.openDeactivateDrawer(active.name);
      expect(await terminologyDeactivateDrawer.getTitle()).toMatch(data.deactivateTitle);
      expect(await terminologyDeactivateDrawer.getWarning()).toContain(active.name);
      const [confirm, cancel] = await terminologyDeactivateDrawer.getButtonLabels();
      expect(confirm).toMatch(data.confirmLabel);
      expect(cancel).toMatch(data.cancelLabel);
      await terminologyDeactivateDrawer.cancel();
    });

    await steps.step('The activation prompt names the terminology, with confirm and cancel buttons', async () => {
      await terminologyManagementPage.requestAction(inactive.name, 'toggleActive');
      expect(await terminologyConfirmDialog.getTitle()).toMatch(data.activateTitle);
      expect(await terminologyConfirmDialog.getMessage()).toContain(inactive.name);
      expect(await terminologyConfirmDialog.getActionKeys()).toEqual(expect.arrayContaining(['cancel', 'confirm']));
      await terminologyConfirmDialog.cancel();
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should end in one consistent status with no errors when a terminology is toggled rapidly and from two sessions`, async ({
    terminologyManagementPage,
    terminologyIn,
    secondWindow,
    steps,
  }) => {
    const data = CASES.exploratory;
    const terminology = await terminologyIn({ name: data.name() });

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Toggling the status several times in succession processes each change without an inconsistent status', async () => {
      for (const expected of data.sequence) {
        await terminologyManagementPage.toggleStatus(terminology.name);
        expect((await terminologyManagementPage.readRow(terminology.name)).status).toBe(expected);
      }
    });

    await steps.step('Toggling the same terminology from a second session leaves both sessions showing the same final status after refresh', async () => {
      const second = await secondWindow();
      await second.terminologies.open();
      await second.terminologies.deactivate(terminology.name);
      await terminologyManagementPage.open();
      const first = (await terminologyManagementPage.readRow(terminology.name)).status;
      const other = (await second.terminologies.readRow(terminology.name)).status;
      expect(first).toBe(other);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.isActive).toBe(first === TERMINOLOGY_STATUS.active);
    });

    await steps.step('No unexpected error or inconsistent state is observed', async () => {
      const messages = await terminologyManagementPage.waitForVisibleMessages();
      expect(messages.filter((m) => /error|failed|went wrong/i.test(m))).toEqual([]);
    });
  });
});
