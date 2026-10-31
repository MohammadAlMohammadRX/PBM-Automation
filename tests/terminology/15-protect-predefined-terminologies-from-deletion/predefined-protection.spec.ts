import { test, expect } from '../../../fixtures';
import { FIELD_TYPE, MESSAGE } from '../../../data/terminology/terminology.data';
import { BLOCKED_CASES, CASES, PREDEFINED_MARKER } from '../../../data/terminology/predefinedProtection.data';

/**
 * User story 15161: Protect Predefined Terminologies from Deletion.
 * A predefined terminology can never be deleted - whatever its usage, data
 * volume or the user's privileges, on every screen and through every path -
 * and the catalogue makes the protection and its reason visible.
 */
test.describe('US 15161 - Protect Predefined Terminologies from Deletion', () => {
  test(`TC-${CASES.deleteWithheld.azureId}: should hide or disable Delete when the terminology is predefined`, async ({
    terminologyManagementPage,
    predefinedTerminology,
    steps,
  }) => {
    const predefined = await predefinedTerminology();

    await steps.critical('Navigate to the Terminology Management module - the list shows all terminologies', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The predefined terminology is clearly marked as predefined', async () => {
      expect(await terminologyManagementPage.getRowText(predefined.name)).toMatch(PREDEFINED_MARKER);
    });

    await steps.step('Its Delete action is hidden or visibly disabled', async () => {
      expect((await terminologyManagementPage.getActionState(predefined.name, 'delete')).availability).not.toBe('available');
    });
  });

  test(`TC-${CASES.noCondition.azureId}: should refuse the deletion even for a full administrator when a predefined terminology holds no data`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    steps,
  }) => {
    const predefined = await predefinedTerminology({ recordCount: CASES.noCondition.recordCount });

    await steps.critical('Selecting the predefined terminology with no data opens its detail', async () => {
      await terminologyDetailPage.open(predefined.id);
      expect(await terminologyDetailPage.getName()).toBe(predefined.name);
    });

    await steps.step('No available action deletes it, and a message says it is predefined and protected', async () => {
      expect((await terminologyDetailPage.getActionState('delete')).availability).not.toBe('available');
      const server = await terminologyManagementPage.sendDelete(predefined.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.predefined);
    });

    await steps.step('The predefined terminology remains intact in the catalogue', async () => {
      expect(await terminologyManagementPage.fetchTerminology(predefined.id)).not.toBeNull();
    });
  });

  test(`TC-${CASES.overridesAll.azureId}: should block every predefined terminology and delete a plain unused one when each usage combination is tried`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const plain = await terminologyIn();
    let predefined: { id: string; name: string; recordCount: number }[] = [];

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
      predefined = (await terminologyManagementPage.fetchRegister()).items.filter((t) => t.isPredefined);
      expect(predefined.length).toBeGreaterThan(0);
    });

    await steps.step('A predefined terminology that is unused and unmapped is blocked with a predefined-protection message', async () => {
      const fewest = [...predefined].sort((a, b) => a.recordCount - b.recordCount)[0];
      const server = await terminologyManagementPage.sendDelete(fewest.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.predefined);
    });

    await steps.step('A predefined terminology in use is blocked with a predefined-protection message', async () => {
      const most = [...predefined].sort((a, b) => b.recordCount - a.recordCount)[0];
      const server = await terminologyManagementPage.sendDelete(most.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.predefined);
    });

    await steps.step('A predefined terminology mapped by another field is blocked with a predefined-protection message', async () => {
      const country = predefined.find((t) => t.name === 'Country') ?? predefined[0];
      const server = await terminologyManagementPage.sendDelete(country.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.predefined);
    });

    await steps.step('A non-predefined, unused and unmapped terminology is deleted normally', async () => {
      expect((await terminologyManagementPage.attemptDelete(plain.name)).status).toBe(200);
    });
  });

  test(`TC-${CASES.catalogue.azureId}: should mark protected terminologies apart from regular ones when the catalogue mixes both`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const regular = [await terminologyIn(), await terminologyIn(), await terminologyIn()];
    let predefined: string[] = [];

    await steps.critical('The catalogue view lists every terminology with its attributes', async () => {
      await terminologyManagementPage.open();
      predefined = (await terminologyManagementPage.fetchRegister()).items.filter((t) => t.isPredefined).map((t) => t.name).slice(0, CASES.catalogue.count);
      expect(predefined).toHaveLength(CASES.catalogue.count);
    });

    await steps.step('Each predefined terminology shows a clear predefined indicator', async () => {
      for (const name of predefined) expect(await terminologyManagementPage.getRowText(name), `"${name}" should be marked predefined`).toMatch(PREDEFINED_MARKER);
    });

    await steps.step('Predefined terminologies show no active Delete while regular ones do', async () => {
      for (const name of predefined) expect((await terminologyManagementPage.getActionState(name, 'delete')).availability, name).not.toBe('available');
      for (const t of regular) expect((await terminologyManagementPage.readActionStates(t.name)).delete.availability, t.name).toBe('available');
    });
  });

  test(`TC-${CASES.noOverride.azureId}: should offer no force-delete override when an administrator handles a predefined terminology`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    steps,
  }) => {
    const predefined = await predefinedTerminology();

    await steps.step('No override or "force delete" option exists among the predefined terminology\'s actions and settings', async () => {
      await terminologyManagementPage.open();
      const states = await terminologyManagementPage.readActionStates(predefined.name);
      expect(Object.values(states).map((s) => s.label).join(' ')).not.toMatch(CASES.noOverride.override);
      await terminologyDetailPage.open(predefined.id);
      expect(await terminologyDetailPage.getScreenText()).not.toMatch(CASES.noOverride.override);
    });

    await steps.step('The standard delete path is blocked with a protection message', async () => {
      const server = await terminologyManagementPage.sendDelete(predefined.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.predefined);
    });
  });

  test(`TC-${CASES.directRequest.azureId}: should reject the request on the server when a predefined terminology's deletion bypasses the screen`, async ({
    terminologyManagementPage,
    predefinedTerminology,
    steps,
  }) => {
    const predefined = await predefinedTerminology();
    let server = { status: -1, text: '', validationErrors: [] as string[] };

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('A deletion request for the predefined identifier, bypassing the screen, is evaluated by the server', async () => {
      server = await terminologyManagementPage.sendDelete(predefined.id);
      expect(server.status).toBeGreaterThan(0);
    });

    await steps.step('It is rejected with an error / forbidden answer and the terminology is not deleted', async () => {
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.fetchTerminology(predefined.id)).not.toBeNull();
    });
  });

  test(`TC-${CASES.everyScreen.azureId}: should keep Delete unavailable on the list, the detail page and in bulk when the terminology is predefined`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    steps,
  }) => {
    const predefined = await predefinedTerminology();

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('In the list the Delete control is disabled or hidden', async () => {
      expect((await terminologyManagementPage.getActionState(predefined.name, 'delete')).availability).not.toBe('available');
    });

    await steps.step('On the detail page the Delete action is likewise disabled or hidden', async () => {
      await terminologyDetailPage.open(predefined.id);
      expect((await terminologyDetailPage.getActionState('delete')).availability).not.toBe('available');
    });

    await steps.step('No bulk delete can include it - a bulk selection is not offered or it is excluded', async () => {
      await terminologyManagementPage.open();
      expect(await terminologyManagementPage.isBulkSelectionOffered(), 'a bulk selection that could include the predefined terminology').toBe(false);
      expect(await terminologyManagementPage.fetchTerminology(predefined.id)).not.toBeNull();
    });
  });

  test(`TC-${CASES.explained.azureId}: should explain why deletion is unavailable when a predefined terminology's disabled Delete is hovered`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    steps,
  }) => {
    const predefined = await predefinedTerminology();

    await steps.step('Hovering the disabled Delete shows a tooltip that the terminology is predefined and cannot be deleted', async () => {
      await terminologyManagementPage.open();
      const state = await terminologyManagementPage.getActionState(predefined.name, 'delete');
      expect(state.title).toMatch(MESSAGE.predefined);
    });

    await steps.step('The detail page shows its predefined, protected status in a visible place', async () => {
      await terminologyDetailPage.open(predefined.id);
      expect(await terminologyDetailPage.getScreenText()).toMatch(PREDEFINED_MARKER);
    });
  });

  test(`TC-${CASES.volumeExtremes.azureId}: should block the deletion with the same message when predefined terminologies hold the fewest and the most records`, async ({
    terminologyManagementPage,
    predefinedTerminology,
    steps,
  }) => {
    const fewest = await predefinedTerminology({ records: 'fewest' });
    const most = await predefinedTerminology({ records: 'most' });
    const reasons: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`The predefined terminology with the fewest records (${fewest.recordCount}) is blocked with a predefined-protection message`, async () => {
      const server = await terminologyManagementPage.sendDelete(fewest.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      reasons.push(server.validationErrors.join(' '));
      expect(reasons[0]).toMatch(MESSAGE.predefined);
    });

    await steps.step(`The predefined terminology with the most records (${most.recordCount}) is blocked with the same message`, async () => {
      const server = await terminologyManagementPage.sendDelete(most.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toBe(reasons[0]);
    });
  });

  test(`TC-${CASES.groups.azureId}: should block every predefined terminology and delete every unused regular one when both groups are deleted`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const regular = [await terminologyIn(), await terminologyIn(), await terminologyIn()];

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Deleting each predefined terminology is blocked with a protection message', async () => {
      const predefined = (await terminologyManagementPage.fetchRegister()).items.filter((t) => t.isPredefined).slice(0, CASES.groups.count);
      const answers: string[] = [];
      for (const t of predefined) answers.push(`${t.name}: ${(await terminologyManagementPage.sendDelete(t.id)).status}`);
      expect(answers.filter((a) => !/: 4\d\d$/.test(a)), 'predefined terminologies not refused').toEqual([]);
    });

    await steps.step('Deleting each unused regular terminology succeeds', async () => {
      const statuses: number[] = [];
      for (const t of regular) statuses.push((await terminologyManagementPage.attemptDelete(t.name)).status);
      expect(statuses).toEqual([200, 200, 200]);
    });
  });

  test(`TC-${CASES.acrossModules.azureId}: should keep the terminology protected and available when modules depend on a predefined terminology`, async ({
    terminologyManagementPage,
    predefinedTerminology,
    steps,
  }) => {
    const predefined = await predefinedTerminology({ name: CASES.acrossModules.name });

    await steps.critical('The terminology list shows the predefined flag from the system configuration', async () => {
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.getActionState(predefined.name, 'delete')).availability).not.toBe('available');
    });

    await steps.step('A dependent module shows the same terminology, consistent with its predefined status', async () => {
      expect(await terminologyManagementPage.readTerminologiesOfferedElsewhere(FIELD_TYPE.mapping)).toContain(predefined.name);
    });

    await steps.step('Deleting it from Terminology Management is blocked because it is predefined', async () => {
      const server = await terminologyManagementPage.sendDelete(predefined.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.predefined);
    });

    await steps.step('The dependent module keeps working with the protected terminology still available', async () => {
      expect(await terminologyManagementPage.fetchOfferedTerminologies()).toContain(predefined.name);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
