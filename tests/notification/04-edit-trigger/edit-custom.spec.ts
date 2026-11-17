import { test, expect } from '../../../fixtures';
import { readTrigger, type TriggerRecord } from '../../../utils/notification/notificationApi';
import {
  WriterATriggers,
  bodyOfLength,
  makeSuiteTrigger,
  normalise,
  requireOrBlock,
  requiredPlaceholders,
  storedBody,
  storedSubject,
  textOfHtml,
  triggerCatalogue,
  type SaveReport,
} from '../../../utils/notification/writerAHelpers';
import { ARABIC_EDIT, CASES, MESSAGE, RENAMED_SUFFIX, SMS_LEAD, SMS_LIMIT, SMS_LIMIT_REASON, TEMPLATES, WORD_EDIT } from '../../../data/notification/editTrigger.data';

/**
 * User story 20981: Edit Trigger - a custom (non-predefined) trigger: the
 * General + Content edit, and the Content rules that apply on edit (unique
 * channel/language, four templates at most, an English template, Arabic
 * letters, the SMS limit). Every trigger edited is a suite trigger made in the
 * test on a free action (deleted at teardown).
 */
test.describe('US 20981 - Edit Trigger', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.editCustom.azureId}: should save the new name and template wording when a non-predefined trigger is edited on both steps`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    const renamed = { name: '', body: '' };
    let save: SaveReport | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { templates: TEMPLATES.smsEnglish });
      renamed.name = `${trigger.name}${RENAMED_SUFFIX}`;
      renamed.body = `${storedBody(trigger, 'SMS/English')}${WORD_EDIT}`;
      await view.tab.open();
    });

    await steps.step('Open System Settings > Notification Center > Triggers (Email&SMS) - the list of triggers is shown', async () => {
      expect(await view.tab.rowIdByName(trigger.name), `the suite trigger "${trigger.name}" in the list`).toBe(trigger.id);
    });

    await steps.critical('Locate a non-predefined trigger and click Edit - the Edit Trigger drawer opens on the General step with all fields editable', async () => {
      await view.openRowEdit(trigger.id, trigger.name);
      expect(await view.drawer.title(), 'the drawer title').toBe(MESSAGE.editTitle);
      expect(await view.onGeneral(), 'the drawer opens on General').toBe(true);
      const state = await view.generalState();
      expect({ nameEnabled: state.nameEnabled, moduleDisabled: state.moduleDisabled, actionDisabled: state.actionDisabled, activeEnabled: state.activeEnabled }, `the General controls (${JSON.stringify(state)})`)
        .toEqual({ nameEnabled: true, moduleDisabled: false, actionDisabled: false, activeEnabled: true });
    });

    await steps.step('Modify a field in the General step (Name) - the updated value is reflected in the field', async () => {
      await view.nameInput().fill(renamed.name);
      await expect(view.nameInput(), 'the Name box').toHaveValue(renamed.name);
    });

    await steps.critical('Click Next - the Content step opens showing the existing templates', async () => {
      await view.toContent();
      expect(await view.onContent(), 'the Content step').toBe(true);
      expect(await view.templatePairs(), 'the template cards').toEqual(['SMS/English']);
      await expect(view.smsBody(0), 'the stored English SMS body').toHaveValue(storedBody(trigger, 'SMS/English'));
    });

    await steps.step('Modify a template field and click Save - the drawer closes, "Saved successfully." is shown and both steps\' changes are saved', async () => {
      await view.smsBody(0).fill(renamed.body);
      save = await view.saveAndReport();
      const stored = await readTrigger(page, trigger.id);
      expect({ drawerOpen: save.drawerOpen, toast: normalise(save.toast), name: stored?.name, body: storedBody(stored, 'SMS/English') }, `after Save: the drawer, the toast and GetTrigger (${save.shown})`)
        .toEqual({ drawerOpen: false, toast: MESSAGE.saved, ...renamed });
    });
  });

  test(`TC-${CASES.pairUnique.azureId}: should not offer Email/English again when the edited trigger already has an Email/English template`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    let card = -1;

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { templates: TEMPLATES.emailEnglish });
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the Triggers search box').toBeVisible();
    });

    await steps.critical('Open a trigger for edit and go to the Content step - existing templates are listed', async () => {
      await view.openRowEdit(trigger.id, trigger.name);
      await view.toContent();
      expect(await view.templatePairs(), 'the template cards').toEqual(['Email/English']);
    });

    await steps.critical('Click Add message template - Channel/Language selection is shown', async () => {
      card = await view.addTemplate();
      await expect(view.drawer.byPart(`template-idx-${card}-channel-select`), 'the new card\'s Channel').toBeVisible();
      await expect(view.drawer.byPart(`template-idx-${card}-language-select`), 'the new card\'s Language').toBeVisible();
    });

    await steps.step('Review the Channel/Language options - Email/English is not offered since it already exists', async () => {
      const offered = await view.offeredPairs(card);
      expect(offered.length, 'the new card offers at least one pair').toBeGreaterThan(0);
      expect(offered, `the pairs the new card offers (${JSON.stringify(offered)})`).not.toContain('Email/English');
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.maxFour.azureId}: should disable Add message template with its hint when the edited trigger already has all four templates`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { templates: TEMPLATES.all4 });
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the Triggers search box').toBeVisible();
    });

    await steps.critical('Open a trigger with all four templates for edit - the Content step lists four templates', async () => {
      await view.openRowEdit(trigger.id, trigger.name);
      await view.toContent();
      expect((await view.templatePairs()).sort(), 'the template cards').toEqual(TEMPLATES.all4.map((t) => `${t.channel}/${t.language}`).sort());
    });

    await steps.step('Check the Add message template control - the control is disabled', async () => {
      await expect(view.addTemplateButton(), 'Add message template').toBeDisabled();
    });

    await steps.step('Hover the disabled control - "Every channel and language already has a message template." is shown', async () => {
      await view.addTemplateButton().hover({ force: true });
      await expect(view.allChannelsHint(), 'the hint under Add message template').toHaveText(MESSAGE.allChannelsUsed);
      expect((await view.templateIndexes()).length, 'still four cards').toBe(4);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.englishRequired.azureId}: should refuse the save with "At least one English message template is required." when the only English template is removed`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { templates: TEMPLATES.smsEnglishEmailArabic });
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the Triggers search box').toBeVisible();
    });

    await steps.critical('Open a trigger for edit and go to the Content step - the only English template is listed', async () => {
      await view.openRowEdit(trigger.id, trigger.name);
      await view.toContent();
      expect((await view.templatePairs()).sort(), 'the template cards').toEqual(['Email/Arabic', 'SMS/English']);
    });

    await steps.step('Remove the English template - it disappears, leaving only non-English templates', async () => {
      await view.removeTemplate(await view.indexOf('SMS', 'English'));
      expect(await view.templatePairs(), 'the cards left').toEqual(['Email/Arabic']);
    });

    await steps.step('Click Save - Save is blocked and "At least one English message template is required." is shown', async () => {
      const save = await view.saveAndReport();
      expect.soft(normalise(`${save.toast} | ${save.errors.join(' | ')}`), `the message (${save.shown})`).toContain(MESSAGE.englishRequired);
      expect.soft(save.status === null || save.status >= 400, `the save is refused (${save.shown})`).toBe(true);
      const stored = await readTrigger(page, trigger.id);
      expect((stored?.templates ?? []).length, `GetTrigger templates after the refused save (${save.shown})`).toBe(2);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.arabicLetters.azureId}: should refuse the save with "Arabic letters only." when an English word is put into the Arabic body`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    let arabic = -1;

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { templates: TEMPLATES.smsEnglishArabic });
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the Triggers search box').toBeVisible();
    });

    await steps.critical('Open a trigger for edit and go to the Content step - the Arabic template is shown', async () => {
      await view.openRowEdit(trigger.id, trigger.name);
      await view.toContent();
      arabic = await view.indexOf('SMS', 'Arabic');
      expect(arabic, `the SMS/Arabic card among ${JSON.stringify(await view.templatePairs())}`).toBeGreaterThanOrEqual(0);
    });

    await steps.step('Edit the Arabic body and insert an English word among the Arabic text - the text is entered in the field', async () => {
      const mixed = `${storedBody(trigger, 'SMS/Arabic')}${CASES.arabicLetters.englishWord}`;
      await view.smsBody(arabic).fill(mixed);
      await expect(view.smsBody(arabic), 'the Arabic body').toHaveValue(mixed);
    });

    await steps.step('Click Save - Save is blocked and "Arabic letters only." is shown under the body', async () => {
      const save = await view.saveAndReport();
      expect.soft(save.errors.map(normalise), `the inline errors (${save.shown})`).toContain(MESSAGE.arabicOnly);
      const stored = await readTrigger(page, trigger.id);
      expect(storedBody(stored, 'SMS/Arabic'), `the stored Arabic body after the refused save (${save.shown})`).toBe(storedBody(trigger, 'SMS/Arabic'));
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.smsLimit.azureId}: should save a 500-character English SMS and refuse a 501-character one with the length message`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    const body = { atLimit: '', overLimit: '' };

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed (the SMS limit is 500)', async () => {
      const catalogue = await triggerCatalogue(page);
      requireOrBlock(steps, catalogue.smsMax === SMS_LIMIT, `${SMS_LIMIT_REASON} (it is ${catalogue.smsMax})`);
      trigger = await makeSuiteTrigger(page, suiteTriggers, { templates: TEMPLATES.smsEnglish });
      const lead = `${SMS_LEAD} ${await requiredPlaceholders(page, trigger.actionId)}`;
      body.atLimit = bodyOfLength(lead, SMS_LIMIT);
      body.overLimit = bodyOfLength(lead, SMS_LIMIT + 1);
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the Triggers search box').toBeVisible();
    });

    await steps.critical('Open a trigger for edit and go to the Content step - the English SMS template is shown', async () => {
      await view.openRowEdit(trigger.id, trigger.name);
      await view.toContent();
      expect(await view.templatePairs(), 'the template cards').toEqual(['SMS/English']);
    });

    await steps.step('Set the SMS body to exactly 500 characters and click Save - the trigger saves with "Saved successfully."', async () => {
      await view.smsBody(0).fill(body.atLimit);
      const save = await view.saveAndReport();
      const length = storedBody(await readTrigger(page, trigger.id), 'SMS/English').length;
      expect({ toast: normalise(save.toast), storedLength: length }, `after Save: the toast and the stored body length (${save.shown})`).toEqual({ toast: MESSAGE.saved, storedLength: SMS_LIMIT });
      await view.closeDrawer();
    });

    await steps.step('Re-open the trigger, set the SMS body to 501 characters and click Save - Save is blocked with "SMS message must not exceed 500 characters (currently 501)."', async () => {
      await view.openRowEdit(trigger.id, trigger.name);
      await view.toContent();
      await view.smsBody(0).fill(body.overLimit);
      const save = await view.saveAndReport();
      expect.soft(normalise(`${save.toast} | ${save.errors.join(' | ')}`), `the message (${save.shown})`).toContain(MESSAGE.smsTooLong(SMS_LIMIT, SMS_LIMIT + 1));
      expect(storedBody(await readTrigger(page, trigger.id), 'SMS/English').length, `the stored body length after the refused save (${save.shown})`).toBe(SMS_LIMIT);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.arabicAndSms.azureId}: should save new Arabic Email and both SMS wordings when they are edited within the limits`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    const wording = { emailSubject: '', emailBody: '', smsArabic: '', smsEnglish: '' };

    await steps.critical('Navigate to the Notification Center Management module - the Triggers list is displayed', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { templates: TEMPLATES.all4 });
      const required = await requiredPlaceholders(page, trigger.actionId);
      wording.emailSubject = ARABIC_EDIT.emailSubject;
      wording.emailBody = `${ARABIC_EDIT.emailBody} ${required}`.trim();
      wording.smsArabic = `${ARABIC_EDIT.smsArabic} ${required}`.trim();
      wording.smsEnglish = `${ARABIC_EDIT.smsEnglish} ${required}`.trim();
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the Triggers search box').toBeVisible();
    });

    await steps.critical('Click Edit on a trigger and open its Content step - all four templates are listed', async () => {
      await view.openRowEdit(trigger.id, trigger.name);
      await view.toContent();
      expect((await view.templatePairs()).sort(), 'the template cards').toEqual(TEMPLATES.all4.map((t) => `${t.channel}/${t.language}`).sort());
    });

    await steps.step('Edit the Arabic Email subject and body with valid Arabic wording - the changes are accepted without error', async () => {
      const t = await view.indexOf('Email', 'Arabic');
      await view.drawer.setBody(t, wording.emailBody, wording.emailSubject);
      await expect(view.subject(t), 'the Arabic subject').toHaveValue(wording.emailSubject);
      expect(await view.editorText(t), 'the Arabic body').toBe(wording.emailBody);
      expect(await view.errorsText(), 'inline errors after the Arabic Email edit').toBe('');
    });

    await steps.step('Edit both SMS templates\' bodies within the character limit - the changes are accepted without error', async () => {
      await view.smsBody(await view.indexOf('SMS', 'Arabic')).fill(wording.smsArabic);
      await view.smsBody(await view.indexOf('SMS', 'English')).fill(wording.smsEnglish);
      expect(await view.errorsText(), 'inline errors after the SMS edits').toBe('');
    });

    await steps.step('Click Save - Save succeeds, "Saved successfully." is shown and every edited template is persisted', async () => {
      const save = await view.saveAndReport();
      expect.soft(normalise(save.toast), `the toast (${save.shown})`).toBe(MESSAGE.saved);
      const stored = await readTrigger(page, trigger.id);
      expect({
        emailSubject: storedSubject(stored, 'Email/Arabic'),
        emailBody: textOfHtml(storedBody(stored, 'Email/Arabic')),
        smsArabic: storedBody(stored, 'SMS/Arabic'),
        smsEnglish: storedBody(stored, 'SMS/English'),
      }, `GetTrigger after Save (${save.shown})`).toEqual(wording);
    });
  });
});
