import { test, expect } from '../../../fixtures';
import { readTrigger, type TriggerRecord } from '../../../utils/notification/notificationApi';
import { WriterATriggers, answerMessage, makeSuiteTrigger, normalise, type RowWrite } from '../../../utils/notification/writerAHelpers';
import { ACTIVE_MARK, CASES, INACTIVE_MARK, MESSAGE } from '../../../data/notification/activateAndDeactivateTrigger.data';

/**
 * User story 20984: Activate and Deactivate Trigger - the confirmation, Yes and
 * No. Every trigger toggled is a suite trigger made in the test on a free
 * action (deleted at teardown).
 */
test.describe('US 20984 - Activate and Deactivate Trigger', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.deactivateConfirm.azureId}: should deactivate an active trigger and show "Deactivated successfully." when the confirmation is accepted`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    let write!: RowWrite;
    let done = { status: null as number | null, toast: '', answer: '' };

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { label: CASES.deactivateConfirm.label, isActive: true });
      await view.tab.open();
      expect(await view.tab.rowIdByName(trigger.name), 'the suite trigger row').toBe(trigger.id);
    });

    await steps.critical('Locate the trigger and select Deactivate - a confirmation dialog asks "Are you sure you want to deactivate <name>?"', async () => {
      write = await view.startRowWrite(trigger.id, 'toggle-active');
      expect(write.dialog, 'the confirmation').toEqual({ title: MESSAGE.deactivateTitle, message: MESSAGE.deactivateQuestion(trigger.name) });
    });

    await steps.step('Click Yes to confirm - the dialog closes and the system processes the request', async () => {
      done = await write.finish(true);
      expect(done.status, `ToggleTriggerActivation ${done.answer.slice(0, 160)}`).toBe(200);
    });

    await steps.step('Observe the trigger list and status message - the trigger is Inactive and "Deactivated successfully." is displayed', async () => {
      await view.expectRowState(trigger.id, { mark: INACTIVE_MARK, label: MESSAGE.activateLabel, stored: false }, 'after Yes: the row\'s Active cell and toggle label, and GetTrigger isActive');
      expect(normalise(done.toast), `the message shown after Yes (ToggleTriggerActivation answered ${done.status} "${answerMessage(done.answer)}")`).toBe(MESSAGE.deactivated);
    });
  });

  test(`TC-${CASES.deactivateDecline.azureId}: should keep the trigger active when the deactivation confirmation is declined`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    let write!: RowWrite;
    let done = { status: null as number | null, toast: '', answer: '' };

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { label: CASES.deactivateDecline.label, isActive: true });
      await view.tab.open();
      expect(await view.tab.rowIdByName(trigger.name), 'the suite trigger row').toBe(trigger.id);
    });

    await steps.critical('Select Deactivate on the active trigger - "Are you sure you want to deactivate <name>?" is displayed', async () => {
      write = await view.startRowWrite(trigger.id, 'toggle-active');
      expect(write.dialog, 'the confirmation').toEqual({ title: MESSAGE.deactivateTitle, message: MESSAGE.deactivateQuestion(trigger.name) });
    });

    await steps.step('Click No - the dialog closes', async () => {
      done = await write.finish(false);
      expect(done.status, 'ToggleTriggerActivation sent after No').toBeNull();
    });

    await steps.step('Review the trigger\'s status in the list - it remains Active and no success message is shown', async () => {
      expect({ toast: done.toast, mark: await view.activeMark(trigger.id), label: await view.tab.toggleLabel(trigger.id), stored: (await readTrigger(page, trigger.id))?.isActive }, 'after No')
        .toEqual({ toast: '', mark: ACTIVE_MARK, label: MESSAGE.deactivateLabel, stored: true });
    });
  });

  test(`TC-${CASES.activateDecline.azureId}: should leave the trigger inactive when the activation confirmation is declined`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    let write!: RowWrite;
    let done = { status: null as number | null, toast: '', answer: '' };

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { isActive: false });
      await view.tab.open();
      expect(await view.tab.rowIdByName(trigger.name), 'the suite trigger row').toBe(trigger.id);
    });

    await steps.critical('Select Activate on the inactive trigger - a confirmation dialog is displayed', async () => {
      write = await view.startRowWrite(trigger.id, 'toggle-active');
      expect(write.dialog, 'the confirmation').toEqual({ title: MESSAGE.activateTitle, message: MESSAGE.activateQuestion(trigger.name) });
    });

    await steps.step('Click No - the dialog closes', async () => {
      done = await write.finish(false);
      expect(done.status, 'ToggleTriggerActivation sent after No').toBeNull();
    });

    await steps.step('Review the trigger status - it remains Inactive and no success message is shown', async () => {
      expect({ toast: done.toast, mark: await view.activeMark(trigger.id), label: await view.tab.toggleLabel(trigger.id), stored: (await readTrigger(page, trigger.id))?.isActive }, 'after No')
        .toEqual({ toast: '', mark: INACTIVE_MARK, label: MESSAGE.activateLabel, stored: false });
    });
  });

  test(`TC-${CASES.dialogNamesTrigger.azureId}: should name exactly the trigger being deactivated in the confirmation message`, async ({ page, steps, suiteTriggers }) => {
    const d = CASES.dialogNamesTrigger;
    const view = new WriterATriggers(page);
    let target!: TriggerRecord;
    let write!: RowWrite;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed (two active custom triggers)', async () => {
      await makeSuiteTrigger(page, suiteTriggers, { label: d.otherLabel, isActive: true });
      target = await makeSuiteTrigger(page, suiteTriggers, { label: d.label, isActive: true });
      await view.tab.open();
      expect(await view.tab.rowIdByName(target.name), 'the target trigger row').toBe(target.id);
    });

    await steps.critical('Select Deactivate on the trigger - a confirmation dialog appears', async () => {
      write = await view.startRowWrite(target.id, 'toggle-active');
      expect(write.dialog?.title, 'the confirmation title').toBe(MESSAGE.deactivateTitle);
    });

    await steps.step('Read the confirmation message text - it reads exactly "Are you sure you want to deactivate <that trigger\'s name>?"', async () => {
      expect(write.dialog?.message, 'the confirmation message').toBe(MESSAGE.deactivateQuestion(target.name));
      const done = await write.finish(false);
      expect((await readTrigger(page, target.id))?.isActive, `the trigger after No (toggle sent: ${done.status ?? 'no'})`).toBe(true);
    });
  });
});
