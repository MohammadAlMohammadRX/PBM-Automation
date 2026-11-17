import { test, expect } from '../../../fixtures';
import { DEF_ACTION, DEF_MODULE } from '../../../constants/notification/writerCIds';
import { NC_API } from '../../../utils/notification/notificationApi';
import { CASES, RIGHTS_WITHOUT_TOGGLE, STORY } from '../../../data/notification/activateAndDeactivateAppNotification.data';
import { definitionRecord, makeSuiteDefinition, rowActionState, tryWriteAs, writeAs, WRITE_API } from '../../../utils/notification/writerCHelpers';

/**
 * User story 21002: Activate and Deactivate App Notification - a user without
 * the toggle right: maalmohammad holding ONLY a suite role without
 * NotificationDefinition.ToggleDefinitionActivation (restored and read back at
 * teardown); careconnect is the baseline that does get the toggle.
 */
test.describe(`US ${STORY.id} - ${STORY.title} (permission)`, () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.noPermission.azureId}: should not let a user without the toggle right activate or deactivate a notification`, async ({ page, steps, suiteDefinitions, ncDefinitions, secondUser }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'no toggle right', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive, isActive: false });
    await secondUser.withRights(RIGHTS_WITHOUT_TOGGLE);
    let tried = { present: false, enabled: false, dialog: '', status: null as number | null };

    await steps.critical("Navigate to the Notification Center Management module - the list is displayed in restricted form according to the user's role", async () => {
      await ncDefinitions.open();
      await ncDefinitions.search(def.name);
      expect(await rowActionState(ncDefinitions, def.id, 'toggle-active'), 'baseline: careconnect is offered the toggle').toEqual({ present: true, enabled: true });
      const answer = await secondUser.definitions.open();
      expect(answer?.status, 'the restricted user still reads the list').toBe(200);
    });

    await steps.step('Locate an existing notification row - the Activate / Deactivate action is disabled, hidden or blocked', async () => {
      await secondUser.definitions.search(def.name);
      expect(await secondUser.definitions.rowIds(), 'the suite notification is listed').toContain(def.id);
      tried = await tryWriteAs(secondUser.page, secondUser.definitions, def.id, 'toggle-active', WRITE_API.toggle);
      expect(!(tried.present && tried.enabled) || tried.status === null || tried.status >= 400, `toggle offered ${tried.present}, enabled ${tried.enabled}, dialog "${tried.dialog}", ToggleDefinitionActivation ${tried.status ?? 'not sent'}`).toBe(true);
    });

    await steps.step('Attempt to trigger the Activate action - the status does not change and / or access is refused', async () => {
      const answer = await writeAs(secondUser.page, 'POST', NC_API.toggleDefinition, { id: def.id, isActive: true });
      expect(answer.status, `ToggleDefinitionActivation as the restricted user answered ${answer.status} ${answer.text}`).toBeGreaterThanOrEqual(400);
      expect((await definitionRecord(page, def.id))?.isActive, 'the notification is still inactive').toBe(false);
    });
  });
});
