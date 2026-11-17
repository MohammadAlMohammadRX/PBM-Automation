import { test, expect } from '../../../fixtures';
import { DEF_ACTION, DEF_MODULE } from '../../../constants/notification/writerCIds';
import { NC_API } from '../../../utils/notification/notificationApi';
import { CASES, RIGHTS_WITHOUT_DELETE, STORY } from '../../../data/notification/deleteAppNotification.data';
import { definitionRecord, makeSuiteDefinition, rowActionState, tryWriteAs, writeAs, WRITE_API } from '../../../utils/notification/writerCHelpers';

/**
 * User story 21003: Delete App Notification - a user without the delete right:
 * maalmohammad holding ONLY a suite role without
 * NotificationDefinition.DeleteDefinition (restored and read back at
 * teardown); careconnect is the baseline that does get Delete.
 */
test.describe(`US ${STORY.id} - ${STORY.title} (permission)`, () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.noPermission.azureId}: should not let a user without the delete right delete a notification`, async ({ page, steps, suiteDefinitions, ncDefinitions, secondUser }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'no delete right', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await secondUser.withRights(RIGHTS_WITHOUT_DELETE);
    let tried = { present: false, enabled: false, dialog: '', status: null as number | null };

    await steps.critical("Navigate to the Notification Center Management module - the list is displayed in restricted form according to the user's role", async () => {
      await ncDefinitions.open();
      await ncDefinitions.search(def.name);
      expect(await rowActionState(ncDefinitions, def.id, 'delete'), 'baseline: careconnect is offered Delete').toEqual({ present: true, enabled: true });
      const answer = await secondUser.definitions.open();
      expect(answer?.status, 'the restricted user still reads the list').toBe(200);
    });

    await steps.step('Locate an existing notification row - the Delete action is disabled, hidden or blocked', async () => {
      await secondUser.definitions.search(def.name);
      expect(await secondUser.definitions.rowIds(), 'the suite notification is listed').toContain(def.id);
      tried = await tryWriteAs(secondUser.page, secondUser.definitions, def.id, 'delete', WRITE_API.delete);
      expect(!(tried.present && tried.enabled) || (tried.status !== null && tried.status >= 400), `Delete offered ${tried.present}, enabled ${tried.enabled}, dialog "${tried.dialog}", DeleteDefinition ${tried.status ?? 'not sent'}`).toBe(true);
    });

    await steps.step('Attempt to trigger the Delete action - the notification is not removed and / or access is refused', async () => {
      const answer = await writeAs(secondUser.page, 'DELETE', `${NC_API.deleteDefinition}/${def.id}`);
      expect(answer.status, `DeleteDefinition as the restricted user answered ${answer.status} ${answer.text}`).toBeGreaterThanOrEqual(400);
      expect((await definitionRecord(page, def.id))?.name, 'the notification still exists').toBe(def.name);
    });
  });
});
