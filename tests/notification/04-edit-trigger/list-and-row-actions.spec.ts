import { test, expect } from '../../../fixtures';
import { listTriggers, readTrigger, type TriggerRecord } from '../../../utils/notification/notificationApi';
import { WriterATriggers, makeSuiteTrigger, normalise } from '../../../utils/notification/writerAHelpers';
import { ACTIVE_MARK, CASES, INACTIVE_MARK, MESSAGE, MIN_SUITE, MIN_TRIGGERS, PAGE_SIZE } from '../../../data/notification/editTrigger.data';

/**
 * User story 20981: Edit Trigger - the Triggers list itself (newest first, ten a
 * page) and the row actions of a custom trigger (Deactivate / Activate /
 * Delete). Every trigger made here is a suite trigger on a free action
 * (deleted at teardown; 21378 deletes its own through the screen).
 */
test.describe('US 20981 - Edit Trigger', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.newestFirst.azureId}: should list the triggers newest first with ten rows a page when more than ten exist`, async ({ page, steps, suiteTriggers }) => {
    const made: TriggerRecord[] = [];
    const view = new WriterATriggers(page);
    let expected: string[] = [];

    await steps.critical('Navigate to the Notification Center Management module - System Settings is accessible (more than ten triggers exist)', async () => {
      const total = (await listTriggers(page)).totalRows;
      const toMake = Math.max(MIN_SUITE, MIN_TRIGGERS - total);
      for (let i = 0; i < toMake; i += 1) made.push(await makeSuiteTrigger(page, suiteTriggers));
      const now = await listTriggers(page, { sortBy: 'CreatedOn desc' }, 2 * PAGE_SIZE);
      expected = now.items.map((t) => t.id);
      expect(now.totalRows, 'triggers in GetTriggers').toBeGreaterThan(PAGE_SIZE);
    });

    await steps.critical('Open System Settings > Notification Center > Triggers (Email&SMS) - the Triggers list is displayed', async () => {
      const answer = await view.tab.open();
      expect(answer?.request.sortBy, 'the list\'s own sort').toBe('CreatedOn desc');
    });

    await steps.step('Review the order of the listed triggers - the most recently created trigger appears first', async () => {
      const ids = await view.tab.rowIds();
      expect(ids[0], `the first row (the last suite trigger made is "${made[made.length - 1].name}")`).toBe(made[made.length - 1].id);
    });

    await steps.step('Count the rows displayed on the first page - exactly ten trigger rows are shown, newest first', async () => {
      expect(await view.tab.rowIds(), 'page 1 rows against GetTriggers "CreatedOn desc"').toEqual(expected.slice(0, PAGE_SIZE));
    });

    await steps.step('Navigate to the next page - the next triggers, still in newest-first order, are shown', async () => {
      const answer = await view.tab.goToPage(2);
      expect(answer?.status, 'GetTriggers for page 2').toBe(200);
      expect(await view.tab.rowIds(), 'page 2 rows against GetTriggers "CreatedOn desc"').toEqual(expected.slice(PAGE_SIZE, 2 * PAGE_SIZE));
    });
  });

  test(`TC-${CASES.customLifecycle.azureId}: should deactivate, activate and delete a non-predefined trigger from its row`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { isActive: true });
      expect(trigger.isActive, 'the suite trigger is created active').toBe(true);
      await view.tab.open();
    });

    await steps.critical('Locate the non-predefined active trigger and open its action menu - Deactivate and Delete options are shown', async () => {
      expect(await view.tab.rowIdByName(trigger.name), 'the suite trigger row').toBe(trigger.id);
      expect(await view.tab.rowActions(trigger.id), 'the row actions').toEqual(['edit', 'toggle-active', 'delete']);
      expect(await view.tab.toggleLabel(trigger.id), 'the toggle label').toBe(MESSAGE.deactivateLabel);
    });

    await steps.step('Click Deactivate - the trigger\'s state changes to Inactive and the menu now offers Activate', async () => {
      const write = await view.startRowWrite(trigger.id, 'toggle-active');
      const done = await write.finish(true);
      expect.soft(done.status, `ToggleTriggerActivation (dialog ${JSON.stringify(write.dialog)}, toast "${done.toast}")`).toBe(200);
      await view.expectRowState(trigger.id, { mark: INACTIVE_MARK, label: MESSAGE.activateLabel, stored: false }, `the row and GetTrigger after Deactivate (toast "${done.toast}")`);
    });

    await steps.step('Click Activate - the trigger\'s state changes back to Active', async () => {
      const write = await view.startRowWrite(trigger.id, 'toggle-active');
      const done = await write.finish(true);
      expect.soft(done.status, `ToggleTriggerActivation (dialog ${JSON.stringify(write.dialog)}, toast "${done.toast}")`).toBe(200);
      await view.expectRowState(trigger.id, { mark: ACTIVE_MARK, label: MESSAGE.deactivateLabel, stored: true }, `the row and GetTrigger after Activate (toast "${done.toast}")`);
    });

    await steps.step('Open the action menu again and click Delete, then confirm - the trigger is removed from the Triggers list', async () => {
      const write = await view.startRowWrite(trigger.id, 'delete');
      const done = await write.finish(true);
      const shown = `DeleteTrigger ${done.status ?? 'not sent'} ${done.answer.slice(0, 160)}; dialog ${JSON.stringify(write.dialog)}; toast "${normalise(done.toast)}"`;
      await expect(view.tab.row(trigger.id), `the deleted row (${shown})`).toBeHidden();
      expect(await readTrigger(page, trigger.id), `GetTrigger after Delete (${shown})`).toBeNull();
    });
  });
});
