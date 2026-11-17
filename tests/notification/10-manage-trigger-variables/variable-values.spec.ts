import { test, expect } from '../../../fixtures';
import type { DefinitionVariable } from '../../../utils/notification/notificationApi';
import {
  TriggerListView,
  TriggerVariablesView,
  describeSave,
  normalise,
  optionalVariable,
  savedThrough,
  storedVariable,
  textOfLength,
} from '../../../utils/notification/writerBHelpers';
import { CASES, MESSAGE, RESET_LINK, VARIABLES_STORY } from '../../../data/notification/manageTriggerVariables.data';

/**
 * US 20987 - Manage Trigger Variables: Sample Value, Default, Required and
 * Description. "Saves successfully" = the Variables view's Save, then the
 * trigger's Save (UpdateTrigger), read back with GetTrigger. The predefined
 * "Forget Password" (21434) is never saved - its refused save is cancelled.
 */
test.describe(`US ${VARIABLES_STORY.id} - ${VARIABLES_STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.noSampleNoDefault.azureId}: should save a placeholder with an empty Sample Value when Default is unchecked`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Variables panel open, Default unchecked)', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await view.tick(t.variable, 'use-as-default-checkbox', false);
      await expect(view.checkbox(t.variable, 'use-as-default-checkbox'), 'Default').not.toBeChecked();
    });

    await steps.step('Leave the Sample Value field empty - the field remains blank with no validation error shown', async () => {
      await view.setSample(t.variable, '');
      await expect.soft(view.sample(t.variable), 'the Sample Value').toHaveValue('');
      expect(await view.visibleErrors(), 'validation lines shown').toEqual([]);
    });

    await steps.step('Click Save - the configuration saves successfully', async () => {
      const o = await view.saveVariablesAndTrigger();
      expect.soft(savedThrough(o), describeSave(o)).toBe(true);
      expect((await storedVariable(page, t.id, t.variable))?.sampleValue ?? '', 'the stored Sample Value (GetTrigger)').toBe('');
    });
  });

  test(`TC-${CASES.sampleMax.azureId}: should accept and save a Sample Value of exactly 300 characters`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.sampleMax;
    const value = textOfLength(d.length);
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Variables panel open)', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await expect(view.backButton(), 'the Variables view').toBeVisible();
    });

    await steps.step(`Enter exactly ${d.length} characters into the Sample Value field - all ${d.length} characters are accepted and displayed`, async () => {
      await view.setSample(t.variable, value);
      expect((await view.sample(t.variable).inputValue()).length, 'characters in the Sample Value').toBe(d.length);
    });

    await steps.step('Click Save - the configuration saves successfully', async () => {
      const o = await view.saveVariablesAndTrigger();
      expect.soft(savedThrough(o), describeSave(o)).toBe(true);
      expect((await storedVariable(page, t.id, t.variable))?.sampleValue, 'the stored Sample Value (GetTrigger), in full').toBe(value);
    });
  });

  test(`TC-${CASES.sampleOverMax.azureId}: should block or limit a Sample Value of 301 characters`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.sampleOverMax;
    const typed = textOfLength(d.length);
    const t = { id: '', name: '', variable: '', before: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      t.before = (await storedVariable(page, t.id, t.variable))?.sampleValue ?? '';
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Variables panel open)', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await expect(view.backButton(), 'the Variables view').toBeVisible();
    });

    await steps.step(`Enter ${d.length} characters into the Sample Value field - the field blocks input beyond ${d.max} characters or shows a validation error`, async () => {
      await view.setSample(t.variable, typed);
      // Leave the field, as a user does once the text is in: a length check shown on blur counts too.
      await view.sample(t.variable).press('Tab');
      const kept = (await view.sample(t.variable).inputValue()).length;
      const errors = (await view.visibleErrors()).join(' | ');
      expect(kept <= d.max || MESSAGE.tooLong.test(errors), `the field holds ${kept} characters; validation shown: "${errors || 'none'}"`).toBe(true);
    });

    // "Blocked" = the save did not go through and the stored value is still the one before; "limited" = exactly
    // the first 300 characters were stored. A save that silently does nothing else is not either.
    await steps.step(`Click Save - the save is blocked or the value is limited to ${d.max} characters`, async () => {
      const o = await view.saveVariablesAndTrigger();
      const stored = (await storedVariable(page, t.id, t.variable))?.sampleValue ?? '';
      const blocked = !savedThrough(o) && stored === t.before;
      const limited = stored === typed.slice(0, d.max);
      expect(blocked || limited, `stored ${stored.length} characters (before: ${t.before.length}) - ${describeSave(o)}`).toBe(true);
    });
  });

  test(`TC-${CASES.defaultNeedsSample.azureId}: should refuse to save and name ResetLink when it is marked Default without a Sample Value`, async ({ steps, page }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    let before: DefinitionVariable | null = null;

    await steps.critical(`Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Variables panel open for ${RESET_LINK.variable})`, async () => {
      before = await storedVariable(page, RESET_LINK.triggerId, RESET_LINK.variable);
      await list.open();
      await view.openVariablesOf(list, RESET_LINK.triggerId, RESET_LINK.triggerName);
      await expect(view.sample(RESET_LINK.variable), `the ${RESET_LINK.variable} block`).toBeVisible();
    });

    await steps.step(`Check the Default checkbox for ${RESET_LINK.variable} - Default is enabled for the placeholder`, async () => {
      await view.tick(RESET_LINK.variable, 'use-as-default-checkbox', true);
      await expect(view.checkbox(RESET_LINK.variable, 'use-as-default-checkbox'), 'Default').toBeChecked();
    });

    await steps.step(`Leave Sample Value empty and click Save - the save is blocked and "${MESSAGE.defaultNeedsSample(RESET_LINK.variable)}" is displayed`, async () => {
      await view.setSample(RESET_LINK.variable, '');
      const refused = await view.saveVariables();
      expect.soft(refused.panelOpen, 'the Variables view stays open (save blocked)').toBe(true);
      expect.soft(await storedVariable(page, RESET_LINK.triggerId, RESET_LINK.variable), 'nothing stored on the predefined trigger').toEqual(before);
      expect([refused.toast, ...refused.errors].join(' | '), 'the message shown').toContain(MESSAGE.defaultNeedsSample(RESET_LINK.variable));
    });

    // The predefined trigger is never saved: cancel the view, close the drawer.
    await view.closeIfOpen();
  });

  test(`TC-${CASES.requiredNotInBody.azureId}: should warn that a Required placeholder is not used in every message body`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite trigger has a placeholder that is not in its message body', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      const bodies = rec.templates.flatMap((tpl) => tpl.bodies.map((b) => `${b.subject ?? ''} ${b.body}`)).join(' ');
      expect(bodies, 'the message bodies').not.toContain(`{{${t.variable}}}`);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Variables panel open)', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await expect(view.checkbox(t.variable, 'is-required-checkbox'), 'Required').not.toBeChecked();
    });

    await steps.step('Check the Required checkbox for a placeholder not present in the message body - Required is enabled', async () => {
      await view.tick(t.variable, 'is-required-checkbox', true);
      await expect(view.checkbox(t.variable, 'is-required-checkbox'), 'Required').toBeChecked();
    });

    await steps.step(`Navigate away from the field - "${MESSAGE.requiredNotInBody}" is displayed`, async () => {
      await view.checkbox(t.variable, 'is-required-checkbox').press('Tab');
      expect(await view.line(t.variable, 'requiredError'), 'the line under the placeholder').toBe(normalise(MESSAGE.requiredNotInBody));
    });

    // Leave nothing behind on screen (the suite trigger is deleted at teardown anyway).
    await view.closeIfOpen();
  });

  test(`TC-${CASES.descriptionMax.azureId}: should treat Description as optional, keep 500 characters and refuse the 501st`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.descriptionMax;
    const full = textOfLength(d.length);
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Variables panel open)', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await expect(view.descriptionInput(t.variable), 'the Description').toBeVisible();
    });

    await steps.step('Leave Description blank and click Save - the save succeeds since Description is optional', async () => {
      await view.setDescription(t.variable, '');
      const o = await view.saveVariablesAndTrigger();
      expect.soft(savedThrough(o), describeSave(o)).toBe(true);
      expect((await storedVariable(page, t.id, t.variable))?.description ?? '', 'the stored Description').toBe('');
    });

    await steps.step(`Enter exactly ${d.length} characters into Description and click Save - the save succeeds with the full text retained`, async () => {
      await view.openVariablesOf(list, t.id, t.name);
      await view.setDescription(t.variable, full);
      const o = await view.saveVariablesAndTrigger();
      expect.soft(savedThrough(o), describeSave(o)).toBe(true);
      expect((await storedVariable(page, t.id, t.variable))?.description, 'the stored Description, in full').toBe(full);
    });

    await steps.step(`Enter ${d.over} characters into Description - the field rejects the extra character or shows a validation error`, async () => {
      await view.openVariablesOf(list, t.id, t.name);
      await view.setDescription(t.variable, textOfLength(d.over));
      // Leave the field, as a user does once the text is in: a length check shown on blur counts too.
      await view.descriptionInput(t.variable).press('Tab');
      const kept = (await view.descriptionInput(t.variable).inputValue()).length;
      const errors = (await view.visibleErrors()).join(' | ');
      expect(kept <= d.length || MESSAGE.tooLong.test(errors), `the field holds ${kept} characters; validation shown: "${errors || 'none'}"`).toBe(true);
    });

    await view.closeIfOpen();
  });
});
