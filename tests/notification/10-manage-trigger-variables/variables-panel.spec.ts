import { test, expect } from '../../../fixtures';
import { actionVariablesNc, readTrigger, type DefinitionVariable } from '../../../utils/notification/notificationApi';
import {
  TriggerListView,
  TriggerVariablesView,
  describeSave,
  optionalVariable,
  savedThrough,
  storeSampleValue,
  storedVariable,
} from '../../../utils/notification/writerBHelpers';
import { CASES, MASKING_MODE, MESSAGE, RESET_LINK, STORED_MODE, TOGGLE_SEQUENCE, VARIABLES_STORY } from '../../../data/notification/manageTriggerVariables.data';

/**
 * US 20987 - Manage Trigger Variables: the Variables view itself - which
 * placeholders it lists, the read-only name, Back discarding, and toggling
 * Default / Sensitive. Custom cases edit the suite's OWN trigger (deleted at
 * teardown); the predefined "Forget Password" is only READ (nothing is saved).
 */
test.describe(`US ${VARIABLES_STORY.id} - ${VARIABLES_STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.listPlaceholders.azureId}: should list exactly the action's own placeholders with no way to add or remove one when Manage Variables opens`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const t = { id: '', name: '', actionId: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, actionId: rec.actionId });
      expect(rec.variableDefinitions.length, 'the action has placeholders').toBeGreaterThan(0);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step("Open the trigger action's Manage Variables option - the Variables panel opens", async () => {
      await view.openVariablesOf(list, t.id, t.name);
      await expect(view.backButton(), 'the Variables view').toBeVisible();
    });

    await steps.step("Review the list of placeholders - all of the action's own placeholders are listed, each with its name and configuration fields", async () => {
      const expected = (await actionVariablesNc(page, t.actionId)).map((v: DefinitionVariable) => v.name);
      const listed = await view.listedNames();
      expect.soft([...listed].sort(), 'the placeholders listed vs the action\'s own (GetActionVariables)').toEqual([...expected].sort());
      for (const name of listed) {
        await expect.soft(view.sample(name), `${name}: Sample Value`).toBeVisible();
        await expect.soft(view.descriptionInput(name), `${name}: Description`).toBeVisible();
        await expect.soft(view.checkbox(name, 'use-as-default-checkbox'), `${name}: Default`).toBeAttached();
        await expect.soft(view.checkbox(name, 'is-required-checkbox'), `${name}: Required`).toBeAttached();
      }
      expect(listed.length, 'placeholders listed').toBe(expected.length);
    });

    await steps.step('Look for an option to add a new placeholder or remove an existing one - none is available', async () => {
      expect(await view.addRemoveControls(), 'add / remove controls in the Variables view').toEqual([]);
    });
  });

  test(`TC-${CASES.nameReadOnly.azureId}: should keep the ResetLink variable name read-only and unchanged when the administrator tries to type in it`, async ({ steps, page }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    let before: DefinitionVariable | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions', async () => {
      before = await storedVariable(page, RESET_LINK.triggerId, RESET_LINK.variable);
      await list.open();
      expect(before?.name, `the "${RESET_LINK.triggerName}" trigger owns ${RESET_LINK.variable}`).toBe(RESET_LINK.variable);
    });

    await steps.step(`Locate the Variable Name field for placeholder ${RESET_LINK.variable} - it displays "${RESET_LINK.variable}" and is read-only`, async () => {
      await view.openVariablesOf(list, RESET_LINK.triggerId, RESET_LINK.triggerName);
      await expect.soft(view.nameElement(RESET_LINK.variable), 'the variable name').toHaveText(RESET_LINK.variable);
      const kind = await view.nameElementKind(RESET_LINK.variable);
      expect(kind, `the name element (<${kind.tag}>, editable ${kind.editable}, inputs ${kind.inputs})`).toMatchObject({ editable: false, inputs: 0 });
    });

    await steps.step(`Attempt to click into or type inside the Variable Name field - no edit is possible and the value remains "${RESET_LINK.variable}"`, async () => {
      await view.typeOnName(RESET_LINK.variable, 'X');
      await expect.soft(view.nameElement(RESET_LINK.variable), 'the variable name after typing').toHaveText(RESET_LINK.variable);
      expect(await storedVariable(page, RESET_LINK.triggerId, RESET_LINK.variable), 'the stored variable is unchanged').toEqual(before);
    });

    // Nothing is saved on the predefined trigger: cancel the view and close the drawer.
    await view.closeIfOpen();
  });

  test(`TC-${CASES.backDiscards.azureId}: should show the previously saved Sample Value when the panel is reopened after Back without saving`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.backDiscards;
    const t = { id: '', name: '', variable: '' };

    await steps.critical(`Precondition: the suite trigger's placeholder holds the saved Sample Value "${d.oldValue}"`, async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(await storeSampleValue(page, t.id, t.variable, d.oldValue), 'UpdateTrigger with the old value').toBeLessThan(300);
      expect((await storedVariable(page, t.id, t.variable))?.sampleValue, 'stored').toBe(d.oldValue);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await expect(view.sample(t.variable), 'the Variables view shows the saved value').toHaveValue(d.oldValue);
    });

    await steps.step('Modify the Sample Value field without clicking Save - the field shows the new unsaved value', async () => {
      await view.setSample(t.variable, d.newValue);
      await expect(view.sample(t.variable), 'the Sample Value').toHaveValue(d.newValue);
    });

    await steps.step('Click Back - the panel closes and returns to the previous view', async () => {
      await view.variablesBack();
      await expect.soft(view.backButton(), 'the Variables view').toBeHidden();
      await expect(view.el('manageVariables'), 'the Content step (Manage Variables button) is shown again').toBeVisible();
    });

    await steps.step('Reopen Manage Variables for the same action - the original Sample Value is displayed, not the unsaved change', async () => {
      await view.openVariables();
      await expect.soft(view.sample(t.variable), 'the Sample Value after reopening').toHaveValue(d.oldValue);
      expect((await storedVariable(page, t.id, t.variable))?.sampleValue, 'the stored value').toBe(d.oldValue);
    });
  });

  test(`TC-${CASES.toggleConsistency.azureId}: should keep the dependent fields and messages consistent when Default and Sensitive are toggled repeatedly and save the final valid state`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.toggleConsistency;
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect((await readTrigger(page, t.id))?.name, 'the suite trigger').toBe(t.name);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (the Variables panel is opened for a placeholder)', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await expect(view.backButton(), 'the Variables view').toBeVisible();
    });

    await steps.step('Check and uncheck Default and Sensitive repeatedly in different orders - the dependent fields show, hide and validate correctly at each state', async () => {
      expect.soft(await view.walkToggles(t.variable, TOGGLE_SEQUENCE), 'states whose dependent fields did not follow').toEqual([]);
      const refused = await view.defaultWithoutSample(t.variable);
      expect.soft(refused.panelOpen, 'Default without a Sample Value keeps the view open').toBe(true);
      expect([refused.toast, ...refused.errors].join(' | '), 'Default without a Sample Value').toContain(MESSAGE.defaultNeedsSample(t.variable));
    });

    await steps.step('Save the configuration in a final valid state - it saves with no leftover inconsistent values or stale validation messages', async () => {
      await view.tick(t.variable, 'use-as-default-checkbox', true);
      await view.setSample(t.variable, d.finalSample);
      await view.tick(t.variable, 'is-sensitive-checkbox', true);
      await view.setMaskingMode(t.variable, MASKING_MODE.full);
      await view.setMaskChar(t.variable, d.finalChar);
      // setMaskChar clears the box before typing, so "needs a Mask Character" flashes up for a moment (run
      // 2026-11-12 read it straight after the keystroke). The field is left and the lines get a few seconds to
      // settle; a line still there after that is a stale message.
      await view.fieldOf(t.variable, 'maskChar').press('Tab');
      expect.soft(await view.errorsAfterSettling(), 'messages left before saving (after leaving the field)').toEqual([]);
      const o = await view.saveVariablesAndTrigger();
      expect.soft(savedThrough(o), describeSave(o)).toBe(true);
      const stored = await storedVariable(page, t.id, t.variable);
      expect(stored, 'the stored variable (GetTrigger)').toMatchObject({
        useAsDefault: true,
        sampleValue: d.finalSample,
        isSensitive: true,
        maskingMode: STORED_MODE[d.finalMode],
        maskChar: d.finalChar,
        maskKeepFirst: 0,
        maskKeepLast: 0,
      });
    });
  });
});
