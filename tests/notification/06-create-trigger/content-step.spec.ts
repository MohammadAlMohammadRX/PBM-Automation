import { test, expect } from '../../../fixtures';
import type { TriggerRecord } from '../../../utils/notification/notificationApi';
import {
  WriterATriggers,
  bodyOfLength,
  freeActionLabels,
  makeSuiteTrigger,
  normalise,
  placeholderNames,
  placeholdersIn,
  requireOrBlock,
  requiredPlaceholders,
  suiteTriggerName,
  triggerCatalogue,
  triggersNamed,
} from '../../../utils/notification/writerAHelpers';
import { BODY, CASES, FORM_ONLY, MESSAGE, SMS_LIMIT, SMS_LIMIT_REASON, SUBJECT_MAX } from '../../../data/notification/createTrigger.data';

/**
 * User story 20983: Create Trigger - the Content step: channel / language,
 * the English template rule, four templates at most, the Subject limit, the
 * branded layout, the SMS limit, the language-letter rules, Preview and the
 * Insert variable menu. Cases that save (or would, if the app let a wrong
 * template through) call `watch()` first and save only suite names on a FREE
 * action; the rest are closed with Discard.
 */
test.describe('US 20983 - Create Trigger', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.channelRequired.azureId}: should not save a template whose channel is not chosen and flag the channel as required`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    const name = suiteTriggerName();

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed', async () => {
      await suiteTriggers.watch();
      await view.tab.open();
      await view.drawer.openAdd();
      const free = await freeActionLabels(page);
      await view.drawer.fillGeneral({ name, module: free.module, action: free.action });
      await view.toContent();
      expect(await view.onContent(), 'the Content step').toBe(true);
    });

    await steps.step('On the Content step, leave Channel unselected - the Channel field shows no selection', async () => {
      expect(await view.templatePair(0), 'channel / language of the card').toBe('/English');
    });

    await steps.step('Click Save - the trigger is not saved and the Channel field is flagged as required', async () => {
      const save = await view.saveAndReport();
      await expect.soft(view.templateError(0), `the card's error (${save.shown})`).toHaveText(MESSAGE.channelLanguage);
      expect((await triggersNamed(page, name)).count, `triggers named "${name}" (${save.shown})`).toBe(0);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.freePairsOnly.azureId}: should offer only the channel and language pairs the trigger does not use yet`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;
    let card = -1;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (a trigger with Email/English and SMS/English)', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, { templates: [{ channel: 'Email', language: 'English' }, { channel: 'SMS', language: 'English' }] });
      await view.tab.open();
      await view.openRowEdit(trigger.id, trigger.name);
      await view.toContent();
      expect((await view.templatePairs()).sort(), 'the template cards').toEqual(['Email/English', 'SMS/English']);
    });

    await steps.critical('Open the trigger and click Add message template - the channel/language options open', async () => {
      card = await view.addTemplate();
      await expect(view.drawer.byPart(`template-idx-${card}-channel-select`), 'the new card\'s Channel').toBeVisible();
    });

    await steps.step('Review the available options - only Email/Arabic and SMS/Arabic remain selectable', async () => {
      const offered = await view.offeredPairs(card);
      expect(offered.sort(), 'the pairs the new card offers').toEqual([...CASES.freePairsOnly.expected].sort());
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.englishRequired.azureId}: should refuse the save with "At least one English message template is required." when no English template is left`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    const name = suiteTriggerName();

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (only an Email/English template)', async () => {
      await suiteTriggers.watch();
      await view.tab.open();
      await view.drawer.openAdd();
      const free = await freeActionLabels(page);
      await view.drawer.fillGeneral({ name, module: free.module, action: free.action });
      await view.toContent();
      await view.drawer.setTemplate(0, 'Email', 'English');
      expect(await view.templatePairs(), 'the template cards').toEqual(['Email/English']);
    });

    await steps.step('Delete the only Email/English template, leaving no English template - the template list shows no English entry', async () => {
      await view.removeTemplate(0);
      expect(await view.templatePairs(), 'the template cards').toEqual([]);
    });

    await steps.step('Click Save - the trigger is not saved and "At least one English message template is required." is displayed', async () => {
      const save = await view.saveAndReport();
      expect.soft(normalise(`${save.toast} | ${save.errors.join(' | ')}`), `the message (${save.shown})`).toContain(MESSAGE.englishRequired);
      expect((await triggersNamed(page, name)).count, `triggers named "${name}" (${save.shown})`).toBe(0);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.maxFour.azureId}: should keep Add message template disabled with its hint once all four templates exist`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (a trigger with all four templates)', async () => {
      trigger = await makeSuiteTrigger(page, suiteTriggers, {
        templates: [{ channel: 'Email', language: 'English' }, { channel: 'Email', language: 'Arabic' }, { channel: 'SMS', language: 'English' }, { channel: 'SMS', language: 'Arabic' }],
      });
      await view.tab.open();
      await view.openRowEdit(trigger.id, trigger.name);
      await view.toContent();
      expect((await view.templateIndexes()).length, 'the template cards').toBe(4);
    });

    await steps.step('Open the trigger and locate the Add message template button - the button is visible but disabled', async () => {
      await expect(view.addTemplateButton(), 'Add message template').toBeVisible();
      await expect(view.addTemplateButton(), 'Add message template').toBeDisabled();
    });

    await steps.step('Attempt to click the disabled button - it opens no add-template options and "Every channel and language already has a message template." is shown', async () => {
      await view.addTemplateButton().click({ force: true });
      expect((await view.templateIndexes()).length, 'cards after clicking the disabled button').toBe(4);
      await expect(view.allChannelsHint(), 'the hint').toHaveText(MESSAGE.allChannelsUsed);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.subjectMax.azureId}: should accept a 300-character subject and refuse a 301st character`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    const subject = bodyOfLength(BODY.subject, SUBJECT_MAX);

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (an Email template)', async () => {
      await view.tab.open();
      await view.drawer.openAdd();
      await view.drawer.fillGeneral({ name: FORM_ONLY.name, module: FORM_ONLY.module, action: FORM_ONLY.action });
      await view.toContent();
      await view.drawer.setTemplate(0, 'Email', 'English');
      await expect(view.subject(0), 'the Subject box').toBeVisible();
    });

    await steps.step('Enter a Subject of exactly 300 characters - the field accepts the full text', async () => {
      await view.subject(0).fill(subject);
      await expect(view.subject(0), 'the Subject box').toHaveValue(subject);
    });

    await steps.step('Attempt to enter a 301st character - no further characters can be entered', async () => {
      await view.subject(0).press('End');
      await view.subject(0).pressSequentially('Z');
      const held = (await view.subject(0).inputValue()).length;
      await expect(view.subject(0), `the Subject box after typing a 301st character (it holds ${held} characters; ${subject.length} allowed)`).toHaveValue(subject);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.brandedTemplate.azureId}: should insert a layout listing every placeholder of the action when the Template button is clicked`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let expected: string[] = [];

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (Email/English with the action\'s placeholders)', async () => {
      const catalogue = await triggerCatalogue(page);
      expected = await placeholderNames(page, catalogue.actionByName(FORM_ONLY.action)?.id ?? '');
      expect(expected.length, `placeholders of "${FORM_ONLY.action}"`).toBeGreaterThan(0);
      await view.tab.open();
      await view.drawer.openAdd();
      await view.drawer.fillGeneral({ name: FORM_ONLY.name, module: FORM_ONLY.module, action: FORM_ONLY.action });
      await view.toContent();
      await view.drawer.setTemplate(0, 'Email', 'English');
      await expect(view.editor(0), 'the Body editor').toBeVisible();
    });

    await steps.step('Place the cursor in the Body editor and click the Template button - a layout is inserted into the body', async () => {
      await view.editor(0).click();
      await view.insertBrandedTemplate(0);
      expect((await view.editorText(0)).length, 'the body after Template').toBeGreaterThan(0);
    });

    await steps.step('Review the inserted layout - it lists each of the action\'s available placeholders', async () => {
      const shown = placeholdersIn(await view.editorText(0));
      expect(expected.filter((n) => !shown.includes(n)), `placeholders missing from the layout (it lists ${JSON.stringify(shown)})`).toEqual([]);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.smsLimit.azureId}: should accept a 500-character SMS body and refuse a 501-character one with the length message`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    const name = suiteTriggerName();
    const body = { atLimit: '', overLimit: '' };

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (SMS limit 500, SMS/English open)', async () => {
      const catalogue = await triggerCatalogue(page);
      requireOrBlock(steps, catalogue.smsMax === SMS_LIMIT, `${SMS_LIMIT_REASON} (it is ${catalogue.smsMax})`);
      await suiteTriggers.watch();
      const free = await freeActionLabels(page);
      const lead = `${BODY.smsLead} ${await requiredPlaceholders(page, free.option.id)}`;
      body.atLimit = bodyOfLength(lead, SMS_LIMIT);
      body.overLimit = bodyOfLength(lead, SMS_LIMIT + 1);
      await view.tab.open();
      await view.drawer.openAdd();
      await view.drawer.fillGeneral({ name, module: free.module, action: free.action });
      await view.toContent();
      await view.drawer.setTemplate(0, 'SMS', 'English');
      await expect(view.smsBody(0), 'the SMS body').toBeVisible();
    });

    await steps.step('Enter an SMS body of exactly 500 characters - the body is accepted', async () => {
      await view.smsBody(0).fill(body.atLimit);
      await expect(view.smsBody(0), 'the SMS body').toHaveValue(body.atLimit);
      expect(await view.errorsText(), 'inline errors with 500 characters').not.toContain(MESSAGE.smsTooLong(SMS_LIMIT, SMS_LIMIT));
    });

    await steps.step('Enter an SMS body of 501 characters and click Save - the trigger is not saved and "SMS message must not exceed 500 characters (currently 501)." is displayed', async () => {
      await view.smsBody(0).fill(body.overLimit);
      const save = await view.saveAndReport();
      expect.soft(normalise(`${save.toast} | ${save.errors.join(' | ')}`), `the message (${save.shown})`).toContain(MESSAGE.smsTooLong(SMS_LIMIT, SMS_LIMIT + 1));
      expect((await triggersNamed(page, name)).count, `triggers named "${name}" (${save.shown})`).toBe(0);
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.englishOnly.azureId}: should refuse Arabic letters in an English template body and allow digits, punctuation and placeholders`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    const name = suiteTriggerName();
    let required = '';

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (SMS/English open)', async () => {
      await suiteTriggers.watch();
      const free = await freeActionLabels(page);
      required = await requiredPlaceholders(page, free.option.id);
      await view.tab.open();
      await view.drawer.openAdd();
      await view.drawer.fillGeneral({ name, module: free.module, action: free.action });
      await view.toContent();
      await view.drawer.setTemplate(0, 'SMS', 'English');
      await expect(view.smsBody(0), 'the SMS body').toBeVisible();
    });

    await steps.step('Type Arabic letters mixed with digits, punctuation and placeholders into the English template body - the body shows the mixed content', async () => {
      const mixed = `${BODY.englishWithArabic} ${required}`.trim();
      await view.smsBody(0).fill(mixed);
      await expect(view.smsBody(0), 'the English body').toHaveValue(mixed);
    });

    await steps.step('Click Save - the trigger is not saved and "English letters only." is displayed; without the Arabic letters it saves', async () => {
      const save = await view.saveAndReport();
      expect.soft(save.errors.map(normalise), `the inline errors (${save.shown})`).toContain(MESSAGE.englishOnly);
      expect.soft((await triggersNamed(page, name)).count, `triggers named "${name}" after the mixed body (${save.shown})`).toBe(0);
      await view.smsBody(0).fill(`${BODY.englishClean} ${required}`.trim());
      const clean = await view.saveAndReport();
      expect((await triggersNamed(page, name)).count, `the body with digits, punctuation and placeholders only (${clean.shown})`).toBe(1);
    });
  });

  test(`TC-${CASES.arabicOnly.azureId}: should refuse English letters in an Arabic template body and allow digits, punctuation and placeholders`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    const name = suiteTriggerName();
    let required = '';
    let arabic = -1;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (SMS/Arabic open next to a valid SMS/English)', async () => {
      await suiteTriggers.watch();
      const free = await freeActionLabels(page);
      required = await requiredPlaceholders(page, free.option.id);
      await view.tab.open();
      await view.drawer.openAdd();
      await view.fillNewTrigger({ name, module: free.module, action: free.action, channel: 'SMS', body: `${BODY.english} ${required}`.trim() });
      arabic = await view.addTemplate();
      await view.drawer.setTemplate(arabic, 'SMS', 'Arabic');
      await expect(view.smsBody(arabic), 'the Arabic SMS body').toBeVisible();
    });

    await steps.step('Type English letters mixed with digits, punctuation and placeholders into the Arabic template body - the body shows the mixed content', async () => {
      const mixed = `${BODY.arabicWithEnglish} ${required}`.trim();
      await view.smsBody(arabic).fill(mixed);
      await expect(view.smsBody(arabic), 'the Arabic body').toHaveValue(mixed);
    });

    await steps.step('Click Save - the trigger is not saved and "Arabic letters only." is displayed; without the English letters it saves', async () => {
      const save = await view.saveAndReport();
      expect.soft(save.errors.map(normalise), `the inline errors (${save.shown})`).toContain(MESSAGE.arabicOnly);
      expect.soft((await triggersNamed(page, name)).count, `triggers named "${name}" after the mixed body (${save.shown})`).toBe(0);
      await view.smsBody(arabic).fill(`${BODY.arabicClean} ${required}`.trim());
      const clean = await view.saveAndReport();
      expect((await triggersNamed(page, name)).count, `the body with digits, punctuation and placeholders only (${clean.shown})`).toBe(1);
    });
  });

  test(`TC-${CASES.preview.azureId}: should preview the template with every placeholder replaced by its Sample Value`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let samples: Record<string, string> = {};
    let preview = '';
    const used = placeholdersIn(FORM_ONLY.smsBody);

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (a template with placeholders)', async () => {
      await view.tab.open();
      await view.drawer.openAdd();
      await view.fillNewTrigger({ name: FORM_ONLY.name, module: FORM_ONLY.module, action: FORM_ONLY.action, channel: 'SMS', body: FORM_ONLY.smsBody });
      samples = await view.sampleValues(used);
      expect(Object.values(samples).filter((v) => v === ''), `Sample Values in Manage Variables (${JSON.stringify(samples)})`).toEqual([]);
    });

    await steps.critical('Click Preview on the template - a preview panel opens', async () => {
      preview = await view.drawer.previewTemplate(0);
      expect(preview, 'the Preview text').not.toBe('');
    });

    await steps.step('Review the preview content - each placeholder is replaced by its configured Sample Value', async () => {
      const expected = used.reduce((text, n) => text.split(`{{${n}}}`).join(samples[n]), FORM_ONLY.smsBody);
      expect(normalise(preview), 'the Preview text').toBe(normalise(expected));
      await view.closeDrawer();
    });
  });

  test(`TC-${CASES.insertMenu.azureId}: should list the action's placeholders in the Insert variable menu of the subject and the body`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let expected: string[] = [];

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the triggers list is displayed (Email subject / body open)', async () => {
      const catalogue = await triggerCatalogue(page);
      expected = (await placeholderNames(page, catalogue.actionByName(FORM_ONLY.action)?.id ?? '')).sort();
      await view.tab.open();
      await view.drawer.openAdd();
      await view.drawer.fillGeneral({ name: FORM_ONLY.name, module: FORM_ONLY.module, action: FORM_ONLY.action });
      await view.toContent();
      await view.drawer.setTemplate(0, 'Email', 'English');
      await expect(view.subject(0), 'the Subject box').toBeVisible();
    });

    await steps.step('Right-click inside the Subject or Body field - the Insert variable menu opens', async () => {
      const menu = await view.insertMenuOn(view.editor(0));
      expect(menu.length, 'the menu on the Body (right-click)').toBeGreaterThan(0);
    });

    await steps.step('Review the menu options - the action\'s available placeholders are listed (Subject and Body)', async () => {
      const onSubject = (await view.insertMenuOn(view.subject(0))).sort();
      const onBody = (await view.insertMenuOn(view.editor(0))).sort();
      expect({ subject: onSubject, body: onBody }, `the Insert variable menus for "${FORM_ONLY.action}" ([] = right-click opened no menu)`).toEqual({ subject: expected, body: expected });
      await view.closeDrawer();
    });
  });
});
