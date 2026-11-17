import { test, expect } from '../../../fixtures';
import { deleteSuiteTrigger, type TriggerRecord } from '../../../utils/notification/notificationApi';
import {
  WriterATriggers,
  freeActionLabels,
  makeSuiteTrigger,
  normalise,
  requiredPlaceholders,
  suiteTriggerName,
  triggerCatalogue,
  triggerOnAction,
  triggersNamed,
  type SaveReport,
} from '../../../utils/notification/writerAHelpers';
import { BODY, CASES, MESSAGE } from '../../../data/notification/createTrigger.data';

/**
 * User story 20983: Create Trigger - the two uniqueness rules: a name already
 * used, and a second trigger for an action + recipient that already has one.
 * The first trigger of each pair is a suite trigger (21910: unless a foreign
 * trigger already holds "Need to Approve - Payer" - then that one is the
 * duplicate and nothing of it is touched); the suite deletes its own active
 * 21910 trigger straight after the attempt.
 */
test.describe('US 20983 - Create Trigger', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.duplicateName.azureId}: should refuse a new trigger whose name is already used with "A trigger with this name already exists."`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let existing!: TriggerRecord;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (a trigger with the name exists)', async () => {
      existing = await makeSuiteTrigger(page, suiteTriggers, { name: suiteTriggerName(CASES.duplicateName.label) });
      await view.tab.open();
      expect(await view.tab.rowIdByName(existing.name), 'the existing suite trigger').toBe(existing.id);
    });

    await steps.step('Click Add Trigger and enter the existing name - the Name field shows the duplicate value', async () => {
      await view.drawer.openAdd();
      await view.nameInput().fill(existing.name);
      await expect(view.nameInput(), 'the Name box').toHaveValue(existing.name);
    });

    await steps.step('Complete the remaining mandatory General and Content fields (another action) and click Save - the trigger is not created and "A trigger with this name already exists." is displayed', async () => {
      const other = await freeActionLabels(page, [existing.actionId]);
      await view.fillNewTrigger({ name: existing.name, module: other.module, action: other.action, channel: 'SMS', body: `${BODY.english} ${await requiredPlaceholders(page, other.option.id)}`.trim() });
      const save = await view.saveAndReport();
      // "is displayed": the toast / inline errors on screen only - the raw API answer is evidence, not display.
      const displayed = normalise(`${save.toast} | ${save.errors.join(' | ')}`);
      const count = (await triggersNamed(page, existing.name)).count;
      expect({ messageShown: displayed.includes(MESSAGE.nameTaken), triggersWithTheName: count }, `after Save: shown "${displayed}" (${save.shown})`)
        .toEqual({ messageShown: true, triggersWithTheName: 1 });
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.duplicateAction.azureId}: should refuse a second trigger for the same action and recipient with "A trigger for this action and recipient already exists."`, async ({ page, steps, suiteTriggers }) => {
    const d = CASES.duplicateAction;
    const view = new WriterATriggers(page);
    const name = suiteTriggerName();
    let holder!: TriggerRecord;
    let ownHolder = false;
    let save: SaveReport | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (a trigger exists for "Need to Approve - Payer")', async () => {
      await suiteTriggers.watch();
      const action = (await triggerCatalogue(page)).actionByName(d.action);
      expect(action, `GetOptions offers "${d.action}"`).not.toBeNull();
      const foreign = await triggerOnAction(page, action?.id ?? '');
      ownHolder = foreign === null;
      holder = foreign ?? (await makeSuiteTrigger(page, suiteTriggers, { action: action ?? undefined, isActive: true }));
      await view.tab.open();
      await expect(view.tab.addButton(), 'Add Trigger').toBeVisible();
    });

    await steps.step('Open Add Trigger, select Module "Approval Management" and Action "Need to Approve - Payer" - Recipient auto-populates with "User"', async () => {
      await view.drawer.openAdd();
      await view.drawer.fillGeneral({ name, module: d.module, action: d.action });
      expect((await view.generalState()).recipient, 'the Recipient').toBe(d.recipient);
    });

    await steps.step('Complete the Content step with a valid English template and click Save - the trigger is not created and "A trigger for this action and recipient already exists." is displayed', async () => {
      await view.toContent();
      await view.drawer.setTemplate(0, 'SMS', 'English');
      await view.drawer.setBody(0, `${BODY.english} ${await requiredPlaceholders(page, holder.actionId)}`.trim());
      save = await view.saveAndReport();
      const own = ownHolder ? await deleteSuiteTrigger(page, holder.id).catch(() => null) : null;
      // "is displayed": the toast / inline errors on screen only - the raw API answer is evidence, not display.
      const displayed = normalise(`${save.toast} | ${save.errors.join(' | ')}`);
      const count = (await triggersNamed(page, name)).count;
      expect({ messageShown: displayed.includes(MESSAGE.actionTaken), triggersWithTheName: count }, `after Save: shown "${displayed}" (${save.shown}; the suite's own holder deleted: ${own?.status ?? 'not ours'})`)
        .toEqual({ messageShown: true, triggersWithTheName: 0 });
      await view.closeDrawer();
    });
  });
});
