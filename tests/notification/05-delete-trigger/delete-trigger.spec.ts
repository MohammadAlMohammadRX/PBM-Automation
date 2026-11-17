import { test, expect } from '../../../fixtures';
import { deleteSuiteTrigger, readTrigger, type TriggerRecord } from '../../../utils/notification/notificationApi';
import { WriterATriggers, makeSuiteTrigger, requireOrBlock, type RowWrite } from '../../../utils/notification/writerAHelpers';
import { CASES, DENIED_STATUSES, NO_DELETE_RIGHTS, NO_LIST_REASON } from '../../../data/notification/deleteTrigger.data';

/**
 * User story 20982: Delete Trigger - confirm, cancel, and a user without the
 * delete right. Every trigger deleted is a suite trigger made in the test on a
 * free action (whatever is left is deleted at teardown).
 */
test.describe('US 20982 - Delete Trigger', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.confirmDelete.azureId}: should remove a non-predefined trigger at once when its deletion is confirmed`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    let write!: RowWrite;

    await steps.critical('Navigate to the Notification Center Management module - the trigger list loads showing existing triggers', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { label: CASES.confirmDelete.label });
      await view.tab.open();
      expect(await view.tab.rowIdByName(trigger.name), 'the suite trigger row').toBe(trigger.id);
    });

    await steps.step('Locate a non-predefined trigger and select the Delete option - a confirmation dialog appears asking to confirm the deletion', async () => {
      write = await view.startRowWrite(trigger.id, 'delete');
      expect(write.dialog, `the confirmation after Delete (the trigger is ${(await readTrigger(page, trigger.id)) ? 'still stored' : 'ALREADY deleted - no confirmation was asked'})`).not.toBeNull();
    });

    await steps.step('Confirm the deletion - the dialog closes and the trigger is removed immediately', async () => {
      const done = await write.finish(true);
      await expect(view.tab.row(trigger.id), `the row after confirming (DeleteTrigger ${done.status ?? 'answered before the confirmation / not seen'}; toast "${done.toast}")`).toBeHidden();
      expect(await readTrigger(page, trigger.id), 'GetTrigger after the deletion').toBeNull();
    });

    await steps.step('Reopen the trigger list - the deleted trigger no longer appears', async () => {
      await view.tab.open();
      expect(await view.tab.rowIdByName(trigger.name), `"${trigger.name}" after reopening the list`).toBe('');
    });
  });

  test(`TC-${CASES.cancelDelete.azureId}: should keep the trigger unchanged when the deletion confirmation is cancelled`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    let write!: RowWrite;

    await steps.critical('Navigate to the Notification Center Management module - the trigger list loads', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { label: CASES.cancelDelete.label });
      await view.tab.open();
      expect(await view.tab.rowIdByName(trigger.name), 'the suite trigger row').toBe(trigger.id);
    });

    await steps.step('Select a non-predefined trigger and click Delete - a confirmation dialog appears with Confirm and Cancel options', async () => {
      write = await view.startRowWrite(trigger.id, 'delete');
      expect(write.dialog, `the confirmation after Delete (the trigger is ${(await readTrigger(page, trigger.id)) ? 'still stored' : 'ALREADY deleted - no confirmation was asked'})`).not.toBeNull();
    });

    await steps.step('Click Cancel on the confirmation dialog - the dialog closes with no changes made', async () => {
      const done = await write.finish(false);
      expect({ status: done.status, stored: (await readTrigger(page, trigger.id))?.name ?? null }, `after Cancel (toast "${done.toast}")`).toEqual({ status: null, stored: trigger.name });
    });

    await steps.step('Review the trigger list - the trigger is still present, unchanged', async () => {
      await view.tab.open();
      expect(await view.tab.rowIdByName(trigger.name), `"${trigger.name}" in the list`).toBe(trigger.id);
      const stored = await readTrigger(page, trigger.id);
      expect({ name: stored?.name, isActive: stored?.isActive, templates: stored?.templates.length }, 'GetTrigger').toEqual({ name: trigger.name, isActive: trigger.isActive, templates: trigger.templates.length });
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should hide or disable Delete for a user without the trigger delete right`, async ({ page, steps, suiteTriggers, secondUser }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;

    await steps.critical('Baseline: careconnect (Admin) sees Delete on the suite trigger', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { label: CASES.noPermission.label });
      await view.tab.open();
      expect(await view.tab.rowIdByName(trigger.name), 'the suite trigger row').toBe(trigger.id);
      expect(await view.deleteUsable(trigger.id), 'Delete for the administrator').toBe(true);
    });

    await steps.critical('Navigate to the Notification Center Management module as a user without the delete right - the trigger list loads with restricted actions', async () => {
      await secondUser.withRights(NO_DELETE_RIGHTS);
      const restricted = new WriterATriggers(secondUser.page);
      const access = await restricted.probeTriggersTab();
      requireOrBlock(steps, access.listStatus === 200, `${NO_LIST_REASON} (GetTriggers ${access.listStatus}, ${access.url})`);
      expect(access.tableVisible, `the Triggers table for the restricted user (${JSON.stringify(access)})`).toBe(true);
    });

    await steps.step('Locate a non-predefined trigger and look for a Delete option - the Delete option is hidden or disabled for this user', async () => {
      const restricted = new WriterATriggers(secondUser.page);
      expect(await restricted.tab.rowIdByName(trigger.name), 'the suite trigger row for the restricted user').toBe(trigger.id);
      expect(await restricted.deleteUsable(trigger.id), 'Delete for the user without TriggersConfiguration.DeleteTrigger').toBe(false);
      const api = await deleteSuiteTrigger(secondUser.page, trigger.id);
      expect(DENIED_STATUSES, `DeleteTrigger called in the restricted session answered ${api?.status ?? 'nothing'} ${api?.text.slice(0, 160) ?? ''}`).toContain(api?.status ?? 0);
      expect((await readTrigger(page, trigger.id))?.name, 'the trigger after the restricted attempts').toBe(trigger.name);
    });
  });
});
