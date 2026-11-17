import { test, expect } from '../../../fixtures';
import { DefinitionDrawer } from '../../../pages/notification/Drawers';
import { DEF_ACTION, DEF_MODULE } from '../../../constants/notification/writerCIds';
import { NC_API } from '../../../utils/notification/notificationApi';
import { CASES, RIGHTS_WITHOUT_UPDATE, STORY } from '../../../data/notification/editAppNotification.data';
import { definitionRecord, makeSuiteDefinition, rowActionState, tryEditAs, writeAs } from '../../../utils/notification/writerCHelpers';

/**
 * User story 21001: Edit App Notification - a user without the edit right.
 * The user is maalmohammad holding ONLY a suite role without
 * NotificationDefinition.UpdateDefinition (secondUser.withRights - restored and
 * read back at teardown); careconnect is the baseline that does get Edit.
 */
test.describe(`US ${STORY.id} - ${STORY.title} (permission)`, () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.noPermission.azureId}: should not let a user without the edit right edit an app notification`, async ({ page, steps, suiteDefinitions, ncDefinitions, secondUser }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'no edit right', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await secondUser.withRights(RIGHTS_WITHOUT_UPDATE);
    const drawer = new DefinitionDrawer(secondUser.page);
    let tried = { present: false, enabled: false, opened: false };

    await steps.critical("Navigate to the Notification Center Management module - the list is displayed in restricted form according to the user's role", async () => {
      await ncDefinitions.open();
      await ncDefinitions.search(def.name);
      expect(await rowActionState(ncDefinitions, def.id, 'edit'), 'baseline: careconnect is offered Edit on the row').toEqual({ present: true, enabled: true });
      const answer = await secondUser.definitions.open();
      expect(answer?.status, 'the restricted user still reads the list').toBe(200);
    });

    await steps.step('Locate an existing notification row - the Edit action is disabled, hidden or blocked', async () => {
      await secondUser.definitions.search(def.name);
      expect(await secondUser.definitions.rowIds(), 'the suite notification is listed').toContain(def.id);
      tried = await tryEditAs(secondUser.definitions, drawer, def.id);
      expect(!(tried.present && tried.enabled) || !tried.opened, `Edit offered ${tried.present}, enabled ${tried.enabled}, drawer opened ${tried.opened}`).toBe(true);
    });

    await steps.step('Attempt to click Edit on the notification row - the system does not open the edit drawer and/or refuses the change', async () => {
      expect(tried.opened, 'the edit drawer did not open').toBe(false);
      const record = await definitionRecord(page, def.id);
      const answer = await writeAs(secondUser.page, 'PUT', NC_API.updateDefinition, { ...record, description: 'not allowed' });
      expect(answer.status, `UpdateDefinition as the restricted user answered ${answer.status} ${answer.text}`).toBeGreaterThanOrEqual(400);
      expect((await definitionRecord(page, def.id))?.description ?? null, 'the record is unchanged').toBe(record?.description ?? null);
    });
  });
});
