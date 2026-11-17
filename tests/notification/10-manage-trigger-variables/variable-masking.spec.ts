import { test, expect } from '../../../fixtures';
import {
  TriggerListView,
  TriggerVariablesView,
  describeSave,
  optionalVariable,
  savedThrough,
  storedVariable,
} from '../../../utils/notification/writerBHelpers';
import { CASES, MASKING_MODE, MESSAGE, STORED_MODE, VARIABLES_STORY } from '../../../data/notification/manageTriggerVariables.data';

/**
 * US 20987 - Manage Trigger Variables: Sensitive and its masking fields
 * (Masking Mode, Mask Character, Mask Keep First / Last, "Recipient reads").
 * Each case edits a placeholder of the suite's OWN trigger (deleted at teardown).
 * The masking field ids come from the application bundle (constants/notification/writerBIds.ts).
 */
test.describe(`US ${VARIABLES_STORY.id} - ${VARIABLES_STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.maskingShownWhenSensitive.azureId}: should show Masking Mode and Mask Character only while Sensitive is checked`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Variables panel open, Sensitive unchecked)', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await view.tick(t.variable, 'is-sensitive-checkbox', false);
      await expect(view.checkbox(t.variable, 'is-sensitive-checkbox'), 'Sensitive').not.toBeChecked();
    });

    await steps.step('Verify the Masking Mode and Mask Character fields are hidden - they are not visible on the panel', async () => {
      const shown = await view.maskingFieldsShown(t.variable);
      expect({ maskingMode: shown.maskingMode, maskChar: shown.maskChar }, 'masking fields with Sensitive unchecked').toEqual({ maskingMode: false, maskChar: false });
    });

    await steps.step('Check the Sensitive checkbox - the Masking Mode and Mask Character fields appear', async () => {
      await view.tick(t.variable, 'is-sensitive-checkbox', true);
      await expect.soft(view.fieldOf(t.variable, 'maskingMode'), 'Masking Mode').toBeVisible();
      await expect(view.fieldOf(t.variable, 'maskChar'), 'Mask Character').toBeVisible();
    });

    await steps.step('Uncheck the Sensitive checkbox - the Masking Mode and Mask Character fields disappear again', async () => {
      await view.tick(t.variable, 'is-sensitive-checkbox', false);
      await expect.soft(view.fieldOf(t.variable, 'maskingMode'), 'Masking Mode').toBeHidden();
      await expect(view.fieldOf(t.variable, 'maskChar'), 'Mask Character').toBeHidden();
    });

    await view.closeIfOpen();
  });

  test(`TC-${CASES.maskCharOne.azureId}: should keep the Mask Character to one character when two are entered`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.maskCharOne;
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Sensitive checked, Mask Character visible)', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await view.tick(t.variable, 'is-sensitive-checkbox', true);
      await expect(view.fieldOf(t.variable, 'maskChar'), 'Mask Character').toBeVisible();
    });

    await steps.step(`Enter 2 characters ("${d.typed}") into the Mask Character field - the second character is rejected or a validation error limits it to 1 character`, async () => {
      await view.setMaskChar(t.variable, d.typed);
      const kept = await view.fieldOf(t.variable, 'maskChar').inputValue();
      const errors = (await view.visibleErrors()).join(' | ');
      expect(kept.length <= d.max || errors !== '', `the Mask Character holds "${kept}"; validation shown: "${errors || 'none'}"`).toBe(true);
    });

    await view.closeIfOpen();
  });

  test(`TC-${CASES.sensitiveNeedsChar.azureId}: should refuse to save and ask for a Mask Character when a Sensitive placeholder has none`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.sensitiveNeedsChar;
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical(`Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Sensitive checked, Masking Mode "${d.mode}")`, async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await view.tick(t.variable, 'is-sensitive-checkbox', true);
      await view.setMaskingMode(t.variable, d.mode);
      await expect(view.fieldOf(t.variable, 'maskingMode'), 'Masking Mode').toContainText(d.mode);
    });

    await steps.step('Clear the Mask Character field so it is blank - the field shows an empty value', async () => {
      await view.setMaskChar(t.variable, '');
      await expect(view.fieldOf(t.variable, 'maskChar'), 'Mask Character').toHaveValue('');
    });

    await steps.step(`Click Save - the save is blocked and "${MESSAGE.sensitiveNeedsChar('{{name}}')}" is displayed`, async () => {
      const refused = await view.saveVariables();
      expect.soft(refused.panelOpen, 'the Variables view stays open (save blocked)').toBe(true);
      expect([refused.toast, ...refused.errors].join(' | '), 'the message shown').toContain(MESSAGE.sensitiveNeedsChar(t.variable));
    });

    await view.closeIfOpen();
  });

  test(`TC-${CASES.keepFirstMin.azureId}: should refuse Mask Keep First 0 and save 1`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.keepFirstMin;
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical(`Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Masking Mode "${d.mode}")`, async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await view.tick(t.variable, 'is-sensitive-checkbox', true);
      await view.setMaskingMode(t.variable, d.mode);
      await expect(view.fieldOf(t.variable, 'keepFirst'), 'Mask Keep First').toBeVisible();
    });

    await steps.step(`Enter ${d.invalid} into the Mask Keep First field and click Save - the field rejects ${d.invalid} or a validation error shows`, async () => {
      await view.setNumber(t.variable, 'keepFirst', d.invalid);
      const kept = await view.fieldOf(t.variable, 'keepFirst').inputValue();
      const outcome = await view.saveVariables();
      const shown = [outcome.toast, ...outcome.errors].join(' | ');
      const refused = kept.trim() !== d.invalid || (outcome.panelOpen && MESSAGE.keepFirst.test(shown));
      expect(refused, `the box kept "${kept}"; Save -> view ${outcome.panelOpen ? 'open' : 'closed'}, shown "${shown || 'nothing'}"`).toBe(true);
    });

    await steps.step(`Enter ${d.valid} into the Mask Keep First field and click Save - ${d.valid} is accepted and the configuration saves`, async () => {
      await view.ensureVariablesOpen();
      await view.setNumber(t.variable, 'keepFirst', d.valid);
      const o = await view.saveVariablesAndTrigger();
      expect.soft(savedThrough(o), describeSave(o)).toBe(true);
      expect(await storedVariable(page, t.id, t.variable), 'the stored variable (GetTrigger)').toMatchObject({ isSensitive: true, maskingMode: STORED_MODE[d.mode], maskKeepFirst: Number(d.valid) });
    });
  });

  test(`TC-${CASES.keepLastMin.azureId}: should refuse Mask Keep Last 0 and save 1`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.keepLastMin;
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical(`Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Masking Mode "${d.mode}")`, async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await view.tick(t.variable, 'is-sensitive-checkbox', true);
      await view.setMaskingMode(t.variable, d.mode);
      await expect(view.fieldOf(t.variable, 'keepLast'), 'Mask Keep Last').toBeVisible();
    });

    await steps.step(`Enter ${d.invalid} into the Mask Keep Last field and click Save - the field rejects ${d.invalid} or a validation error shows`, async () => {
      await view.setNumber(t.variable, 'keepLast', d.invalid);
      const kept = await view.fieldOf(t.variable, 'keepLast').inputValue();
      const outcome = await view.saveVariables();
      const shown = [outcome.toast, ...outcome.errors].join(' | ');
      const refused = kept.trim() !== d.invalid || (outcome.panelOpen && MESSAGE.keepLast.test(shown));
      expect(refused, `the box kept "${kept}"; Save -> view ${outcome.panelOpen ? 'open' : 'closed'}, shown "${shown || 'nothing'}"`).toBe(true);
    });

    await steps.step(`Enter ${d.valid} into the Mask Keep Last field and click Save - ${d.valid} is accepted and the configuration saves`, async () => {
      await view.ensureVariablesOpen();
      await view.setNumber(t.variable, 'keepLast', d.valid);
      const o = await view.saveVariablesAndTrigger();
      expect.soft(savedThrough(o), describeSave(o)).toBe(true);
      expect(await storedVariable(page, t.id, t.variable), 'the stored variable (GetTrigger)').toMatchObject({ isSensitive: true, maskingMode: STORED_MODE[d.mode], maskKeepLast: Number(d.valid) });
    });
  });

  test(`TC-${CASES.fieldsPerMode.azureId}: should show only the keep fields the selected Masking Mode uses`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical('Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Sensitive checked)', async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await view.tick(t.variable, 'is-sensitive-checkbox', true);
      await expect(view.fieldOf(t.variable, 'maskingMode'), 'Masking Mode').toBeVisible();
    });

    // Web-first: the fields render a moment after the pick (run 2026-11-12 read "Keep First" too early while the
    // menu was still closing - the screenshot shows the field). The field that must APPEAR is awaited first, so
    // the one that must stay hidden is checked once the view has settled.
    await steps.step(`Select Masking Mode "${MASKING_MODE.keepFirstLast}" - both Mask Keep First and Mask Keep Last appear`, async () => {
      await view.setMaskingMode(t.variable, MASKING_MODE.keepFirstLast);
      await expect.soft(view.fieldOf(t.variable, 'keepFirst'), 'Mask Keep First').toBeVisible();
      await expect(view.fieldOf(t.variable, 'keepLast'), 'Mask Keep Last').toBeVisible();
    });

    await steps.step(`Select Masking Mode "${MASKING_MODE.none}" - both fields disappear`, async () => {
      await view.setMaskingMode(t.variable, MASKING_MODE.none);
      await expect.soft(view.fieldOf(t.variable, 'keepFirst'), 'Mask Keep First').toBeHidden();
      await expect(view.fieldOf(t.variable, 'keepLast'), 'Mask Keep Last').toBeHidden();
    });

    await steps.step(`Select Masking Mode "${MASKING_MODE.keepFirst}" - only the Mask Keep First field appears`, async () => {
      await view.setMaskingMode(t.variable, MASKING_MODE.keepFirst);
      await expect.soft(view.fieldOf(t.variable, 'keepFirst'), 'Mask Keep First').toBeVisible();
      await expect(view.fieldOf(t.variable, 'keepLast'), 'Mask Keep Last').toBeHidden();
    });

    await steps.step(`Select Masking Mode "${MASKING_MODE.keepLast}" - only the Mask Keep Last field appears`, async () => {
      await view.setMaskingMode(t.variable, MASKING_MODE.keepLast);
      await expect.soft(view.fieldOf(t.variable, 'keepLast'), 'Mask Keep Last').toBeVisible();
      await expect(view.fieldOf(t.variable, 'keepFirst'), 'Mask Keep First').toBeHidden();
    });

    await view.closeIfOpen();
  });

  test(`TC-${CASES.recipientReads.azureId}: should show the Sample Value masked by the rule in "Recipient reads"`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const view = new TriggerVariablesView(page);
    const d = CASES.recipientReads;
    const t = { id: '', name: '', variable: '' };

    await steps.critical('Precondition: the suite has its own trigger on a free action', async () => {
      const rec = await suiteTriggers.create();
      Object.assign(t, { id: rec.id, name: rec.name, variable: optionalVariable(rec).name });
      expect(t.variable, 'a placeholder to edit').not.toBe('');
    });

    await steps.critical(`Navigate to the Notification Center Management module - the module opens and displays the list of trigger actions (Sensitive, "${d.mode}", Keep First ${d.keepFirst}, Keep Last ${d.keepLast}, "${d.maskChar}")`, async () => {
      await list.open();
      await view.openVariablesOf(list, t.id, t.name);
      await view.tick(t.variable, 'is-sensitive-checkbox', true);
      await view.setMaskingMode(t.variable, d.mode);
      await view.setNumber(t.variable, 'keepFirst', d.keepFirst);
      await view.setNumber(t.variable, 'keepLast', d.keepLast);
      await view.setMaskChar(t.variable, d.maskChar);
      await expect(view.fieldOf(t.variable, 'keepLast'), 'Mask Keep Last').toHaveValue(d.keepLast);
    });

    await steps.step(`Enter Sample Value "${d.sample}" - the value is in the Sample Value field`, async () => {
      await view.setSample(t.variable, d.sample);
      await expect(view.sample(t.variable), 'the Sample Value').toHaveValue(d.sample);
    });

    // Web-first: the preview follows the typing a moment later (run 2026-11-12 read "1234" mid-update).
    await steps.step(`View the read-only "Recipient reads" preview - it shows the masked value "${d.shows}"`, async () => {
      await expect(view.fieldOf(t.variable, 'maskPreview'), 'the Recipient reads line').toHaveText(MESSAGE.recipientReads(d.shows));
    });

    await view.closeIfOpen();
  });
});
