import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { DefinitionDrawer } from '../../../pages/notification/Drawers';
import type { DefinitionsTab } from '../../../pages/notification/NotificationCenterPage';
import { DEF_ACTION, DEF_DRAWER_PART, DEF_MODULE } from '../../../constants/notification/writerCIds';
import { readSecondUser } from '../../../utils/notification/secondUserAccount';
import {
  ADMIN_DISPLAY,
  AUDIENCE_REQUIRED_HINT,
  CASES,
  EVENT_A,
  EVENT_B,
  NEW_WORDING,
  PREFILLED_DESCRIPTION,
  PREFILLED_LABEL,
  PREFILLED_NOTES,
  STORY,
  USERS,
} from '../../../data/notification/editAppNotification.data';
import { ERROR_FIELD, TEXT } from '../../../data/notification/createAppNotification.data';
import { INACTIVE_MARK } from '../../../data/notification/searchAndFilterAppNotifications.data';
import {
  addAudienceWith,
  anyContains,
  audienceCardCount,
  audienceSummary,
  contentShown,
  definitionRecord,
  describeAttempt,
  discardDrawer,
  errorOf,
  forwardTo,
  generalShown,
  makeSuiteDefinition,
  messagesFor,
  moveToStep,
  normText,
  openEdit,
  removeAllAudiences,
  saveFromHere,
  visibleErrors,
  waitForDrawerMessage,
  wordingWithRequired,
  type MadeDefinition,
} from '../../../utils/notification/writerCHelpers';

/** Step 1: the App Notification list. */
async function openList(steps: TestSteps, tab: DefinitionsTab): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the list of notifications is displayed', async () => {
    const answer = await tab.open();
    expect(answer?.status, 'GetDefinitions should answer the App Notification tab').toBe(200);
  });
}

/** Step 2: Edit on the case's suite definition. */
async function openEditStep(steps: TestSteps, page: Page, tab: DefinitionsTab, drawer: DefinitionDrawer, def: MadeDefinition, title = 'Click Edit on an existing notification - the drawer opens pre-filled with saved values'): Promise<void> {
  await steps.critical(title, async () => {
    await tab.search(def.name);
    const shown = await openEdit(page, tab, drawer, def.id, def.name);
    expect(shown.name, 'the drawer is pre-filled with the saved name').toBe(def.name);
  });
}

/**
 * User story 21001: Edit App Notification - pre-filled drawer, changes saved
 * with the creation rules. Every record edited is the case's own suite
 * definition (teardown deletes it). See the data file for the readings.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.updateWording.azureId}: should save new message wording and show it when the notification is reopened`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'wording', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    const wording = await wordingWithRequired(page, DEF_ACTION.networkInactive, NEW_WORDING);
    await openList(steps, ncDefinitions);
    await openEditStep(steps, page, ncDefinitions, drawer, def);

    await steps.step(`Update the message text in the Content step to "${NEW_WORDING}" - the new wording is reflected in the field`, async () => {
      await forwardTo(page, drawer, 'content');
      await drawer.fillContent({ english: wording });
      expect((await contentShown(drawer)).english).toBe(wording);
    });

    await steps.step(`Click Save - the system re-checks all steps and displays "${TEXT.saved.en}"`, async () => {
      await forwardTo(page, drawer, 'audiences');
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
    });

    await steps.step('Reopen the notification by clicking Edit again - the updated wording is shown pre-filled', async () => {
      await openEdit(page, ncDefinitions, drawer, def.id, def.name);
      await forwardTo(page, drawer, 'content');
      expect((await contentShown(drawer)).english, 'the drawer shows the new wording').toBe(wording);
      expect((await definitionRecord(page, def.id))?.englishMessageTemplate, 'GetDefinition holds the new wording').toBe(wording);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.changeEventAudience.azureId}: should save a changed event and audience and show both when reopened`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'event and audience', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    const planMessages = await messagesFor(page, DEF_ACTION.planInactive, 'eventb');
    const audienceY = (await readSecondUser(page)).fullEnglishName;
    await openList(steps, ncDefinitions);

    await steps.critical(`Click Edit on the existing notification - the drawer opens pre-filled with Event A ("${EVENT_A.action}") and Audience X (${ADMIN_DISPLAY})`, async () => {
      await ncDefinitions.search(def.name);
      const shown = await openEdit(page, ncDefinitions, drawer, def.id, def.name);
      expect(shown, 'Event A').toEqual(expect.objectContaining({ module: EVENT_A.module, action: EVENT_A.action }));
      await forwardTo(page, drawer, 'audiences');
      expect((await audienceSummary(page, drawer)).join(' | '), 'Audience X').toContain(ADMIN_DISPLAY);
      await moveToStep(page, drawer, 'general');
    });

    await steps.step(`In the General step, change the event to Event B ("${EVENT_B.action}") - Event B is selected and reflected in the step`, async () => {
      await drawer.fillGeneral({ module: EVENT_B.module, action: EVENT_B.action });
      expect(await generalShown(drawer)).toEqual(expect.objectContaining({ module: EVENT_B.module, action: EVENT_B.action }));
      await forwardTo(page, drawer, 'content');
      await drawer.fillContent({ english: planMessages.english, arabic: planMessages.arabic });
    });

    await steps.step(`In the Audiences step, change the audience to Audience Y (${audienceY}) - Audience Y is selected and reflected in the step`, async () => {
      await forwardTo(page, drawer, 'audiences');
      await removeAllAudiences(page, drawer);
      await addAudienceWith(drawer, USERS, [audienceY]);
      const cards = await audienceSummary(page, drawer);
      expect(cards.join(' | '), 'Audience Y is shown (spaces collapsed as the screen shows them)').toContain(normText(audienceY));
      expect(cards.join(' | '), 'Audience X is gone').not.toContain(ADMIN_DISPLAY);
    });

    await steps.step(`Click Save - the system validates all steps and displays "${TEXT.saved.en}"`, async () => {
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
    });

    await steps.step('Reopen the notification - Event B and Audience Y are shown pre-filled', async () => {
      const shown = await openEdit(page, ncDefinitions, drawer, def.id, def.name);
      expect(shown, 'Event B').toEqual(expect.objectContaining({ module: EVENT_B.module, action: EVENT_B.action }));
      await forwardTo(page, drawer, 'audiences');
      expect((await audienceSummary(page, drawer)).join(' | '), 'Audience Y after reopening (spaces collapsed as the screen shows them)').toContain(normText(audienceY));
      const stored = await definitionRecord(page, def.id);
      expect({ action: stored?.moduleActionId, audiences: stored?.audiences.map((a) => a.referenceName) }, 'GetDefinition').toEqual({ action: DEF_ACTION.planInactive, audiences: [audienceY] });
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.prefilled.azureId}: should open the edit drawer pre-filled with the saved General, Content and Audiences values`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, {
      label: PREFILLED_LABEL,
      moduleId: DEF_MODULE.networkManagement,
      actionId: DEF_ACTION.networkInactive,
      description: PREFILLED_DESCRIPTION,
      notesTemplate: PREFILLED_NOTES,
    });
    await openList(steps, ncDefinitions);

    await steps.step(`Locate the notification "${def.name}" in the list - the row shows its name, event and current Active status`, async () => {
      await ncDefinitions.search(def.name);
      await expect(ncDefinitions.cell(def.id, 'name')).toHaveText(def.name);
      await expect(ncDefinitions.cell(def.id, 'action')).toHaveText(EVENT_A.action);
      await expect(ncDefinitions.cell(def.id, 'active')).toHaveText(INACTIVE_MARK);
    });

    await steps.critical('Click Edit on the notification row - the edit drawer opens', async () => {
      await openEdit(page, ncDefinitions, drawer, def.id, def.name);
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step('Review the General step - the fields show the saved name and event exactly as configured', async () => {
      expect(await generalShown(drawer)).toEqual({ name: def.name, module: EVENT_A.module, action: EVENT_A.action, description: PREFILLED_DESCRIPTION, active: false });
    });

    await steps.step('Review the Content step - the fields show the saved message wording exactly as configured', async () => {
      await forwardTo(page, drawer, 'content');
      expect(await contentShown(drawer)).toEqual({ english: def.english, arabic: def.arabic, notes: PREFILLED_NOTES });
    });

    await steps.step('Review the Audiences step - the step shows the saved audience selections exactly as configured', async () => {
      await forwardTo(page, drawer, 'audiences');
      const cards = await audienceSummary(page, drawer);
      expect(cards.length, `cards: ${JSON.stringify(cards)}`).toBe(1);
      expect(cards[0]).toContain(ADMIN_DISPLAY);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.blankName.azureId}: should block saving and flag the Name when it is cleared`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'blank name', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await openList(steps, ncDefinitions);
    await openEditStep(steps, page, ncDefinitions, drawer, def);

    await steps.step('Clear the required Name field in the General step - the field is shown empty and a required-field validation message appears', async () => {
      await drawer.fillGeneral({ name: '' });
      await drawer.byPart(DEF_DRAWER_PART.name).blur();
      expect((await generalShown(drawer)).name).toBe('');
      expect(errorOf(await visibleErrors(page), ERROR_FIELD.name), 'the Name required message').toBe(TEXT.fieldRequired.en);
    });

    await steps.step('Click Save - the save is blocked and the Name field is highlighted with a validation error', async () => {
      const attempt = await saveFromHere(page, drawer);
      expect({ sent: attempt.status, open: attempt.drawerOpen, name: errorOf(attempt.errors, ERROR_FIELD.name), toast: anyContains(attempt.toasts, TEXT.fillNameModuleAction.en) }, describeAttempt(attempt))
        .toEqual({ sent: null, open: true, name: TEXT.fieldRequired.en, toast: true });
      await discardDrawer(drawer);
      expect((await definitionRecord(page, def.id))?.name, 'the stored name is unchanged').toBe(def.name);
    });
  });

  test(`TC-${CASES.allStepsValid.azureId}: should save only once General, Content and Audiences are all valid, flagging the invalid step each time`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'all steps', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await openList(steps, ncDefinitions);
    await openEditStep(steps, page, ncDefinitions, drawer, def);

    await steps.step('Set General valid, Content invalid (empty) and Audiences valid, then click Save - Save is blocked and only the Content step is flagged', async () => {
      await forwardTo(page, drawer, 'content');
      await drawer.fillContent({ english: '', arabic: '' });
      const attempt = await saveFromHere(page, drawer);
      const generalErrors = [ERROR_FIELD.name, ERROR_FIELD.module, ERROR_FIELD.action].map((f) => errorOf(attempt.errors, f)).filter(Boolean);
      expect({ sent: attempt.status, content: anyContains(attempt.toasts, TEXT.messagesRequired.en) || errorOf(attempt.errors, ERROR_FIELD.english) !== '', general: generalErrors, audience: anyContains(attempt.toasts, TEXT.addAudience.en) }, describeAttempt(attempt))
        .toEqual({ sent: null, content: true, general: [], audience: false });
    });

    await steps.step('Correct the Content step, leave Audiences invalid (no audience selected), then click Save - Save is blocked and only the Audiences step is flagged', async () => {
      await moveToStep(page, drawer, 'content');
      await drawer.fillContent({ english: def.english, arabic: def.arabic });
      await forwardTo(page, drawer, 'audiences');
      await removeAllAudiences(page, drawer);
      const attempt = await saveFromHere(page, drawer);
      expect({ sent: attempt.status, audience: anyContains(attempt.toasts, TEXT.addAudience.en), content: errorOf(attempt.errors, ERROR_FIELD.english) + errorOf(attempt.errors, ERROR_FIELD.arabic) }, describeAttempt(attempt))
        .toEqual({ sent: null, audience: true, content: '' });
    });

    await steps.step(`Correct all three steps, then click Save - the system displays "${TEXT.saved.en}"`, async () => {
      await addAudienceWith(drawer, USERS, [ADMIN_DISPLAY]);
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
    });
  });

  test(`TC-${CASES.noAudience.azureId}: should block saving with "${TEXT.addAudience.en}" when every audience is removed`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'no audience', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await openList(steps, ncDefinitions);
    await openEditStep(steps, page, ncDefinitions, drawer, def);

    await steps.step('In the Audiences step, remove all selected audiences - the step shows zero audiences selected and a validation message appears', async () => {
      await forwardTo(page, drawer, 'audiences');
      expect(await removeAllAudiences(page, drawer), 'the saved audience was removed').toBeGreaterThan(0);
      expect(await audienceCardCount(page), 'zero audiences').toBe(0);
      const message = await waitForDrawerMessage(page, drawer, AUDIENCE_REQUIRED_HINT);
      expect(message.found, `a validation message about the missing audience once every audience is removed (before any Save); toasts, field errors and drawer text seen: ${JSON.stringify(message.texts)}`).toBe(true);
    });

    await steps.step(`Click Save - the save is blocked and the Audiences step is flagged ("${TEXT.addAudience.en}")`, async () => {
      const attempt = await saveFromHere(page, drawer);
      expect({ sent: attempt.status, open: attempt.drawerOpen, flagged: anyContains(attempt.toasts, TEXT.addAudience.en) }, describeAttempt(attempt)).toEqual({ sent: null, open: true, flagged: true });
      await discardDrawer(drawer);
      expect((await definitionRecord(page, def.id))?.audiences.length, 'the stored audience is unchanged').toBe(1);
    });
  });
});
