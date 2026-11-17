import { test, expect } from '../../../fixtures';
import { readTrigger } from '../../../utils/notification/notificationApi';
import {
  WriterATriggers,
  freeActionLabels,
  normalise,
  placeholderNames,
  requiredPlaceholders,
  suiteTriggerName,
  suiteTriggerNameOfLength,
  triggerCatalogue,
  triggersNamed,
  type TriggerCatalogue,
} from '../../../utils/notification/writerAHelpers';
import { BODY, CASES, FORM_ONLY, MESSAGE, NAME_MAX } from '../../../data/notification/createTrigger.data';

/**
 * User story 20983: Create Trigger - the drawer and its General step (Name,
 * Module, Action, Active) and leaving it (Next, close with unsaved changes).
 * Cases that save do so on a FREE action with a suite name (`watch()` first,
 * deleted at teardown); the others are closed with Discard.
 */
test.describe('US 20983 - Create Trigger', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.nameRequired.azureId}: should show "This field is required." under Name and stay on General when Next is clicked without a name`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed', async () => {
      await view.tab.open();
      await expect(view.tab.addButton(), 'Add Trigger').toBeVisible();
    });

    await steps.critical('Click Add Trigger and leave Name empty while selecting Module "User Management" and an Action - Module and Action are populated but Name remains blank', async () => {
      await view.drawer.openAdd();
      await view.drawer.fillGeneral({ module: FORM_ONLY.userModule });
      const action = (await view.drawer.options('action-select'))[0];
      await view.drawer.fillGeneral({ action });
      const state = await view.generalState();
      expect({ name: state.name, module: state.module, action: state.action }, 'the General step').toEqual({ name: '', module: FORM_ONLY.userModule, action });
    });

    await steps.step('Click Next - the drawer does not advance; "This field is required." is shown under Name', async () => {
      const toast = await view.drawer.next();
      expect.soft(await view.generalError('name'), `the Name error (toast "${toast}")`).toBe(MESSAGE.required);
      expect({ general: await view.onGeneral(), content: await view.onContent() }, `the step after Next (toast "${toast}")`).toEqual({ general: true, content: false });
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.opensOnGeneral.azureId}: should open the Add New Trigger drawer on the General step`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the list of existing triggers is displayed', async () => {
      const answer = await view.tab.open();
      expect(answer?.status, 'GetTriggers').toBe(200);
    });

    await steps.step('Click the Add Trigger button - the Add New Trigger drawer opens', async () => {
      await view.drawer.openAdd();
      expect(await view.drawer.title(), 'the drawer title').toBe(MESSAGE.addTitle);
    });

    await steps.step('Observe the step indicator - the drawer is on the General step and Content is not yet reached', async () => {
      expect({ general: await view.onGeneral(), content: await view.onContent() }, 'the drawer\'s step').toEqual({ general: true, content: false });
      await expect(view.drawer.stepBullet(2), 'the Content bullet still shows its number').toHaveText('2');
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.nameMax.azureId}: should accept a 50-character name and refuse a 51st character`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    const name = suiteTriggerNameOfLength(NAME_MAX);

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed', async () => {
      await suiteTriggers.watch();
      await view.tab.open();
      await expect(view.tab.addButton(), 'Add Trigger').toBeVisible();
    });

    await steps.step('Click Add Trigger and enter a trigger name of exactly 50 characters - the Name field accepts the full value', async () => {
      await view.drawer.openAdd();
      await view.nameInput().fill(name);
      await expect(view.nameInput(), 'the Name box').toHaveValue(name);
    });

    await steps.step('Attempt to enter a 51st character in the Name field - no further characters can be entered (and the 50-character name saves)', async () => {
      await view.nameInput().press('End');
      await view.nameInput().pressSequentially('Z');
      await expect(view.nameInput(), 'the Name box after typing a 51st character').toHaveValue(name);
      const free = await freeActionLabels(page);
      await view.fillNewTrigger({ name, module: free.module, action: free.action, channel: 'SMS', body: `${BODY.english} ${await requiredPlaceholders(page, free.option.id)}`.trim() });
      const save = await view.saveAndReport();
      expect((await triggersNamed(page, name)).count, `the 50-character name saved (${save.shown})`).toBe(1);
    });
  });

  test(`TC-${CASES.pbmEngineActions.azureId}: should list only the PBM Engine actions and load the chosen action's placeholders`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let catalogue!: TriggerCatalogue;
    let chosen = '';

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed', async () => {
      catalogue = await triggerCatalogue(page);
      await view.tab.open();
      await view.drawer.openAdd();
      await expect(view.nameInput(), 'the Add drawer\'s Name').toBeVisible();
    });

    await steps.step('Select Module "PBM Engine" - the Action dropdown lists only PBM Engine actions', async () => {
      await view.drawer.fillGeneral({ module: CASES.pbmEngineActions.module });
      const offered = await view.drawer.options('action-select');
      const pbm = catalogue.modules.find((m) => m.englishName === CASES.pbmEngineActions.module)?.id ?? '';
      expect(offered.sort(), 'the Action options').toEqual(catalogue.actionsOf(pbm).sort());
      chosen = offered[0];
    });

    await steps.step('Select an action from the list - the action\'s placeholders load for use in the Content step', async () => {
      await view.drawer.fillGeneral({ name: FORM_ONLY.name, action: chosen });
      await view.toContent();
      await view.drawer.setTemplate(0, 'SMS', 'English');
      const menu = await view.drawer.insertVariableMenu(view.smsBody(0));
      const expected = await placeholderNames(page, catalogue.actionByName(chosen)?.id ?? '');
      expect(menu.sort(), `the Insert variable menu for "${chosen}"`).toEqual(expected.sort());
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.moduleClearsAction.azureId}: should clear the action and offer only Approval Management actions when the module is changed`, async ({ page, steps }) => {
    const d = CASES.moduleClearsAction;
    const view = new WriterATriggers(page);
    let catalogue!: TriggerCatalogue;
    let chosen = '';

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed', async () => {
      catalogue = await triggerCatalogue(page);
      await view.tab.open();
      await expect(view.tab.addButton(), 'Add Trigger').toBeVisible();
    });

    await steps.critical('Open Add Trigger, select Module "User Management" and an Action - the Action field shows the chosen action', async () => {
      await view.drawer.openAdd();
      await view.drawer.fillGeneral({ module: d.from });
      chosen = (await view.drawer.options('action-select'))[0];
      await view.drawer.fillGeneral({ action: chosen });
      expect((await view.generalState()).action, 'the Action select').toBe(chosen);
    });

    await steps.step('Change the Module field to "Approval Management" - the Action field is cleared back to empty', async () => {
      await view.drawer.fillGeneral({ module: d.to });
      const shown = await view.actionAfterModuleChange(chosen);
      expect(catalogue.actions.map((a) => a.englishName), `the Action select after the module change shows "${shown}"`).not.toContain(shown);
    });

    await steps.step('Open the Action dropdown - only actions belonging to Approval Management are listed', async () => {
      const approval = catalogue.modules.find((m) => m.englishName === d.to)?.id ?? '';
      expect((await view.drawer.options('action-select')).sort(), 'the Action options').toEqual(catalogue.actionsOf(approval).sort());
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.nextToContent.azureId}: should advance to the Content step with one English template once Name, Module and Action are filled`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed', async () => {
      await view.tab.open();
      await view.drawer.openAdd();
      await expect(view.nameInput(), 'the Add drawer\'s Name').toBeVisible();
    });

    await steps.critical('Complete Name, Module and Action and click Next - the drawer transitions to the Content step', async () => {
      await view.drawer.fillGeneral({ name: FORM_ONLY.name, module: FORM_ONLY.module, action: FORM_ONLY.action });
      const toast = await view.toContent();
      expect({ content: await view.onContent(), general: await view.onGeneral() }, `the step after Next (toast "${toast}")`).toEqual({ content: true, general: false });
    });

    await steps.step('Observe the Content step - one default English template section is presented ready for channel selection', async () => {
      expect(await view.templateIndexes(), 'the template cards').toEqual([0]);
      expect(await view.templatePair(0), 'channel / language of the default card').toBe('/English');
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.activeByDefault.azureId}: should save a new trigger as active when the Active box is left as it opens`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    const name = suiteTriggerName();

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed', async () => {
      await suiteTriggers.watch();
      await view.tab.open();
      await expect(view.tab.addButton(), 'Add Trigger').toBeVisible();
    });

    await steps.step('Open Add Trigger and observe the Active checkbox - the checkbox is already checked by default', async () => {
      await view.drawer.openAdd();
      await expect(view.activeCheckbox(), 'Active').toBeChecked();
    });

    await steps.step('Complete the trigger without changing the checkbox and click Save - the trigger is saved as active', async () => {
      const free = await freeActionLabels(page);
      await view.fillNewTrigger({ name, module: free.module, action: free.action, channel: 'SMS', body: `${BODY.english} ${await requiredPlaceholders(page, free.option.id)}`.trim() });
      const save = await view.saveAndReport();
      expect.soft(normalise(save.toast), `the toast (${save.shown})`).toBe(MESSAGE.saved);
      const made = await triggersNamed(page, name);
      expect({ count: made.count, active: made.first?.isActive, stored: made.first ? (await readTrigger(page, made.first.id))?.isActive : null }, `the new trigger (${save.shown})`)
        .toEqual({ count: 1, active: true, stored: true });
    });
  });

  test(`TC-${CASES.unsavedChanges.azureId}: should ask for confirmation before discarding unsaved trigger changes`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    const name = suiteTriggerName();
    let dialog: { title: string; message: string } | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed', async () => {
      await suiteTriggers.watch();
      await view.tab.open();
      await expect(view.tab.addButton(), 'Add Trigger').toBeVisible();
    });

    await steps.step('Enter data in the drawer and click the close icon without saving - a confirmation prompt appears', async () => {
      await view.drawer.openAdd();
      await view.drawer.fillGeneral({ name });
      dialog = await view.drawer.close('discard');
      expect(dialog, 'the prompt raised by X').toEqual({ title: MESSAGE.unsavedTitle, message: MESSAGE.unsavedMessage });
    });

    await steps.step('Confirm discarding the changes - the drawer closes without saving', async () => {
      await expect(view.drawer.el('close'), 'the drawer after Discard').toBeHidden();
      expect((await triggersNamed(page, name)).count, `triggers named "${name}"`).toBe(0);
    });
  });
});
