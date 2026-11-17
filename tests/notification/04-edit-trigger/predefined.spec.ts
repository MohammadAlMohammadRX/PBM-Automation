import { test, expect } from '../../../fixtures';
import { readTrigger, type TriggerRecord } from '../../../utils/notification/notificationApi';
import { WriterATriggers, normalise, placeholdersIn, requireOrBlock, rewordPredefined, storedBody, type GeneralState, type RewordOutcome } from '../../../utils/notification/writerAHelpers';
import { ACTIVE_MARK, ALL_PAIRS, CASES, MESSAGE, PREDEFINED_ACTIONS, PREDEFINED_IDS, PREDEFINED_REWORD, PREDEFINED_SUFFIX } from '../../../data/notification/editTrigger.data';

/**
 * User story 20981: Edit Trigger - the six PREDEFINED triggers: Edit only, the
 * drawer opening on Content, the locked General step, the four templates, the
 * placeholder menu and the Preview. Predefined triggers are only opened and
 * closed (Discard), except 21364, which changes one English SMS wording per
 * trigger through the screen and puts every original template back through the
 * API, read back (`rewordPredefined`).
 */
test.describe('US 20981 - Edit Trigger', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.predefinedOpensContent.azureId}: should open a predefined trigger's Edit drawer directly on the Content step`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let invitation!: TriggerRecord;

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      invitation = (await readTrigger(page, CASES.predefinedOpensContent.predefinedId)) as TriggerRecord;
      expect(invitation?.isPredefined, 'GetTrigger of the predefined Invitation').toBe(true);
      await view.tab.open();
    });

    await steps.step('In Triggers (Email&SMS), locate the predefined trigger "Invitation" - the row shows no Deactivate/Delete actions', async () => {
      await view.tab.search(invitation.name);
      await expect(view.tab.predefinedBadge(invitation.id), 'the Predefined badge').toBeVisible();
      expect(await view.tab.rowActions(invitation.id), 'the row actions').toEqual(PREDEFINED_ACTIONS);
    });

    await steps.step('Click Edit on the predefined trigger - the Edit Trigger drawer opens directly on the Content step', async () => {
      await view.tab.rowAction(invitation.id, 'edit').click();
      await view.drawer.waitForOpen();
      expect({ title: await view.drawer.title(), content: await view.onContent(), general: await view.onGeneral() }, 'the drawer after Edit')
        .toEqual({ title: MESSAGE.editTitle, content: true, general: false });
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.predefinedLocked.azureId}: should keep Name, Module, Action, Recipient and Active fixed on a predefined trigger`, async ({ page, steps }) => {
    const d = CASES.predefinedLocked;
    const view = new WriterATriggers(page);
    let twoFactor!: TriggerRecord;
    let locked!: GeneralState;

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      twoFactor = (await readTrigger(page, d.predefinedId)) as TriggerRecord;
      expect(twoFactor?.isPredefined, 'GetTrigger of the predefined 2FA').toBe(true);
      await view.tab.open();
    });

    await steps.critical('Open a predefined trigger for edit - the drawer opens on the Content step', async () => {
      await view.openRowEdit(twoFactor.id, twoFactor.name);
      expect(await view.onContent(), 'the drawer opens on Content').toBe(true);
    });

    await steps.critical('Switch to the General step - Name, Module, Action, Recipient and Active are shown disabled/locked', async () => {
      await view.toGeneral();
      locked = await view.generalState();
      await expect(view.predefinedNotice(), 'the predefined notice').toContainText(MESSAGE.predefinedNotice);
      expect({ nameEnabled: locked.nameEnabled, moduleDisabled: locked.moduleDisabled, actionDisabled: locked.actionDisabled, activeEnabled: locked.activeEnabled, name: locked.name }, `the General step (${JSON.stringify(locked)})`)
        .toEqual({ nameEnabled: false, moduleDisabled: true, actionDisabled: true, activeEnabled: false, name: twoFactor.name });
      expect(locked.recipient, 'the read-only Recipient').not.toBe('');
    });

    await steps.step('Attempt to type into Name, change Module or Action, or toggle Active - none of the fields accept the change', async () => {
      const after = await view.attemptGeneralChanges(d.attemptName, d.attemptModule);
      expect({ name: after.name, module: after.module, action: after.action, recipient: after.recipient, active: after.active }, 'the General step after the attempts')
        .toEqual({ name: locked.name, module: locked.module, action: locked.action, recipient: locked.recipient, active: locked.active });
      await view.closeDrawer();
      expect((await readTrigger(page, twoFactor.id))?.name, 'the stored name').toBe(twoFactor.name);
    });
  });

  test(`TC-${CASES.predefinedSix.azureId}: should list all six predefined triggers active with four templates whose wording can be changed and saved`, async ({ page, steps }) => {
    test.setTimeout(10 * 60_000);
    const view = new WriterATriggers(page);
    const records: TriggerRecord[] = [];
    const outcomes: RewordOutcome[] = [];

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      for (const id of PREDEFINED_IDS) records.push((await readTrigger(page, id)) as TriggerRecord);
      expect(records.map((r) => r?.isPredefined), 'GetTrigger of the six predefined ids').toEqual(PREDEFINED_IDS.map(() => true));
      await view.tab.open();
    });

    await steps.step('Review the list for Invitation, Forget Password, First Activation, 2FA, API Client Credentials and System Job Failed - all six show Active status', async () => {
      const marks: Record<string, string> = {};
      for (const r of records) {
        await view.tab.search(r.name);
        marks[r.name] = await view.activeMark(r.id);
      }
      expect(marks, 'the Active cell of each predefined row').toEqual(Object.fromEntries(records.map((r) => [r.name, ACTIVE_MARK])));
      expect(records.filter((r) => !r.isActive).map((r) => r.name), 'GetTrigger isActive false').toEqual([]);
    });

    await steps.step('Open each trigger for edit and view the Content step - each shows four templates (Email/English, Email/Arabic, SMS/English, SMS/Arabic)', async () => {
      const pairs: Record<string, string[]> = {};
      for (const r of records) {
        await view.openRowEdit(r.id, r.name);
        pairs[r.name] = (await view.templatePairs()).sort();
        await view.closeDrawer();
      }
      expect(pairs, 'the template cards of each predefined trigger').toEqual(Object.fromEntries(records.map((r) => [r.name, ALL_PAIRS])));
    });

    requireOrBlock(steps, PREDEFINED_REWORD.allowed, PREDEFINED_REWORD.reason);

    await steps.step('Edit the wording of one template per trigger and save - each update is saved and "Saved successfully." is shown (then put back)', async () => {
      for (const r of records) outcomes.push(await rewordPredefined(page, view, r.id, PREDEFINED_SUFFIX));
      const seen = outcomes.map((o) => ({ name: o.name, toast: normalise(o.save?.toast ?? ''), saved: o.storedAfterSave === o.expectedBody && o.expectedBody !== '', problem: o.problem }));
      expect(outcomes.filter((o) => !o.restored).map((o) => o.name), 'predefined triggers NOT put back (see annotations)').toEqual([]);
      expect(seen, `each reworded save (${outcomes.map((o) => `${o.name}: ${o.save?.shown ?? o.problem}`).join(' || ')})`)
        .toEqual(records.map((r) => ({ name: r.name, toast: MESSAGE.saved, saved: true, problem: '' })));
    });
  });

  test(`TC-${CASES.insertAtCursor.azureId}: should insert {{ResetLink}} exactly at the cursor when it is chosen from the right-click menu`, async ({ page, steps }) => {
    const d = CASES.insertAtCursor;
    const view = new WriterATriggers(page);
    let forget!: TriggerRecord;
    let email = -1;
    const caret = { x: 0, y: 0, before: '' };

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      forget = (await readTrigger(page, d.predefinedId)) as TriggerRecord;
      expect(forget?.isPredefined, 'GetTrigger of the predefined Forget Password').toBe(true);
      await view.tab.open();
    });

    await steps.critical('Click Edit on a trigger and open its Content step - the English Email template fields are shown', async () => {
      await view.openRowEdit(forget.id, forget.name);
      email = await view.indexOf('Email', 'English');
      expect(email, `the Email/English card among ${JSON.stringify(await view.templatePairs())}`).toBeGreaterThanOrEqual(0);
      await expect(view.editor(email), 'the English Email body editor').toBeVisible();
    });

    await steps.critical('Click inside the body text at a chosen position (the end of the first paragraph) - the cursor is placed at that position', async () => {
      const at = await view.caretAtEndOfFirstBlock(email);
      Object.assign(caret, { x: at.x, y: at.y, before: at.before });
      expect(at.caretAtEnd, `the caret after clicking the end of "${at.before}"`).toBe(true);
    });

    await steps.critical('Right-click the body and open the placeholder menu - the list of available placeholders is shown', async () => {
      const names = await view.insertMenuAt(caret.x, caret.y);
      expect(names, 'the Insert variable menu').toContain(d.placeholder);
    });

    await steps.step('Select {{ResetLink}} - {{ResetLink}} is inserted into the body exactly at the cursor position', async () => {
      await view.drawer.insertVariable(d.placeholder);
      expect(await view.firstBlockText(email), 'the first paragraph after the insert').toBe(`${caret.before}{{${d.placeholder}}}`);
      await view.closeDrawer();
      expect(storedBody(await readTrigger(page, forget.id), 'Email/English'), 'the stored body (nothing saved)').toBe(storedBody(forget, 'Email/English'));
    });
  });

  test(`TC-${CASES.preview.azureId}: should show the template with every placeholder replaced by its Sample Value in the Preview`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let forget!: TriggerRecord;
    let email = -1;
    let samples: Record<string, string> = {};
    let preview = '';

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      forget = (await readTrigger(page, CASES.preview.predefinedId)) as TriggerRecord;
      expect(forget?.isPredefined, 'GetTrigger of the predefined Forget Password').toBe(true);
      await view.tab.open();
    });

    await steps.critical('Click Edit on a trigger and open its Content step - the template fields with placeholders are shown', async () => {
      await view.openRowEdit(forget.id, forget.name);
      email = await view.indexOf('Email', 'English');
      expect(email, `the Email/English card among ${JSON.stringify(await view.templatePairs())}`).toBeGreaterThanOrEqual(0);
      const used = placeholdersIn(`${await view.subject(email).inputValue()} ${await view.editorText(email)}`);
      expect(used.length, 'placeholders in the English Email subject/body').toBeGreaterThan(0);
      samples = await view.sampleValues(used);
      expect(Object.values(samples).filter((v) => v === ''), `Sample Values in Manage Variables (${JSON.stringify(samples)})`).toEqual([]);
    });

    await steps.critical('Click the Preview (eye) icon on the English Email template - a preview panel opens', async () => {
      preview = await view.drawer.previewTemplate(email);
      expect(preview, 'the Preview text').not.toBe('');
    });

    await steps.step('Review the previewed subject and body - each placeholder is replaced by its configured Sample Value', async () => {
      expect(preview, 'the Preview text').not.toContain('{{');
      expect(Object.values(samples).filter((v) => !preview.includes(v)), `Sample Values missing from the Preview "${preview.slice(0, 300)}"`).toEqual([]);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.predefinedNoToggleDelete.azureId}: should offer neither Deactivate nor Delete on any of the six predefined triggers`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    const records: TriggerRecord[] = [];

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      for (const id of PREDEFINED_IDS) records.push((await readTrigger(page, id)) as TriggerRecord);
      await view.tab.open();
    });

    await steps.step('Locate a predefined trigger row (e.g. 2FA) - the row\'s action menu is available', async () => {
      const two = records.find((r) => r.id === CASES.predefinedLocked.predefinedId) as TriggerRecord;
      await view.tab.search(two.name);
      await expect(view.tab.rowAction(two.id, 'edit'), 'Edit on the 2FA row').toBeVisible();
    });

    await steps.step('Open the row\'s action menu - Deactivate and Delete options are not present (every predefined row)', async () => {
      const actions: Record<string, string[]> = {};
      for (const r of records) {
        await view.tab.search(r.name);
        actions[r.name] = await view.tab.rowActions(r.id);
      }
      expect(actions, 'the row actions of each predefined trigger').toEqual(Object.fromEntries(records.map((r) => [r.name, PREDEFINED_ACTIONS])));
    });
  });
});
