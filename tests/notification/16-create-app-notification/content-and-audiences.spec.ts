import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { DefinitionsTab } from '../../../pages/notification/NotificationCenterPage';
import { DEF_ACTION, DEF_DRAWER_PART, DEF_MODULE } from '../../../constants/notification/writerCIds';
import { actionVariablesNc, audienceCandidates } from '../../../utils/notification/notificationApi';
import { SECOND_USER_HOME_ROLE, readSecondUser } from '../../../utils/notification/secondUserAccount';
import {
  ADMIN_DISPLAY,
  CASES,
  DESCRIPTION_MAX,
  ERROR_FIELD,
  LONG_PASTE_LENGTH,
  LONG_TEXT,
  NETWORK_INACTIVE,
  NETWORK_MODULE,
  PLAN_INACTIVE,
  PLAN_MODULE,
  POLICY_EXPIRING,
  POLICY_MODULE,
  ROLES,
  STEPS_CASE,
  STORY,
  TEXT,
  USERS,
} from '../../../data/notification/createAppNotification.data';
import { INACTIVE_MARK } from '../../../data/notification/searchAndFilterAppNotifications.data';
import {
  actionAfterModuleChange,
  addAudienceCard,
  addAudienceWith,
  assignByIds,
  audienceTypeLabel,
  candidatesNamed,
  answerUnsaved,
  anyContains,
  attemptInArabic,
  audienceCardCount,
  audienceSummary,
  backToGeneral,
  contentShown,
  currentStep,
  definitionsBy,
  describeAttempt,
  discardDrawer,
  errorOf,
  fillToAudiences,
  forwardTo,
  generalShown,
  insertMenuVariables,
  labelOf,
  messagesFor,
  moveToSelected,
  openAssign,
  pickState,
  pressClose,
  removeAllAudiences,
  saveAssign,
  saveFromHere,
  trySwitchLanguage,
  watchFailures,
  withSamples,
} from '../../../utils/notification/writerCHelpers';

/** Step 1: the Notification Center, App Notification tab. */
async function openModule(steps: TestSteps, tab: DefinitionsTab): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
    const answer = await tab.open();
    expect(answer?.status, 'GetDefinitions should answer the App Notification tab').toBe(200);
  });
}

/**
 * User story 21000: Create App Notification - the Content and Audiences steps,
 * Save validation across the steps, Unsaved Changes, and a scripted
 * exploration. Records saved through the drawer are suite definitions
 * (`suiteDefinitions.watch()` first - teardown deletes them). See the data
 * file for the readings.
 */
test.describe(`US ${STORY.id} - ${STORY.title} (Content, Audiences, Save)`, () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.createInactive.azureId}: should save a notification as inactive when the Active option is unchecked`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    await suiteDefinitions.watch();
    const name = suiteDefinitions.newName('created inactive');
    const messages = await messagesFor(page, DEF_ACTION.networkInactive, 'inactive');
    await openModule(steps, ncDefinitions);

    await steps.step('Open the Create drawer, fill the required fields and uncheck Active - the checkbox becomes unchecked', async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ name, module: NETWORK_MODULE, action: NETWORK_INACTIVE, active: false });
      expect(await generalShown(drawer), 'General filled, Active cleared').toEqual(expect.objectContaining({ name, active: false }));
    });

    await steps.step('Complete the remaining steps and click Save - the notification saves successfully with Active = No', async () => {
      await forwardTo(page, drawer, 'content');
      await drawer.fillContent({ english: messages.english, arabic: messages.arabic });
      await forwardTo(page, drawer, 'audiences');
      await addAudienceWith(drawer, USERS, [ADMIN_DISPLAY]);
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
      const stored = (await definitionsBy(page, { searchText: name })).items.find((d) => d.name === name);
      expect(stored?.isActive, `GetDefinitions holds "${name}" as inactive`).toBe(false);
      await ncDefinitions.search(name);
      await expect(ncDefinitions.cell(String(stored?.id), 'active'), 'the row shows the inactive mark').toHaveText(INACTIVE_MARK);
    });
  });

  test(`TC-${CASES.stepsKeepData.azureId}: should keep entered values when moving between General, Content and Audiences`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const name = suiteDefinitions.newName(STEPS_CASE.nameLabel);
    const messages = await messagesFor(page, DEF_ACTION.policyExpiringSoon, 'steps');
    await openModule(steps, ncDefinitions);

    await steps.step('Click Create to open the notification drawer - the drawer opens showing the General step as the active step', async () => {
      await drawer.openCreate();
      expect(await currentStep(drawer)).toBe('general');
    });

    await steps.step('Enter Name, select Module and Action on the General step - the entered values are retained on screen', async () => {
      await drawer.fillGeneral({ name, module: STEPS_CASE.module, action: STEPS_CASE.action });
      expect(await generalShown(drawer)).toEqual(expect.objectContaining({ name, module: STEPS_CASE.module, action: STEPS_CASE.action }));
    });

    await steps.step('Click Next to move to the Content step - the Content step shows the English, Arabic message and Notes fields', async () => {
      const moved = await forwardTo(page, drawer, 'content');
      expect(moved.reached, `toasts [${moved.toasts.join(' | ')}]`).toBe('content');
      await expect(drawer.byPart(DEF_DRAWER_PART.arabic)).toBeVisible();
      await expect(drawer.byPart(DEF_DRAWER_PART.notes)).toBeVisible();
    });

    await steps.step('Enter English and Arabic messages, then click Next to move to Audiences - the Audiences step is displayed', async () => {
      await drawer.fillContent({ english: messages.english, arabic: messages.arabic });
      const moved = await forwardTo(page, drawer, 'audiences');
      expect(moved.reached, `toasts [${moved.toasts.join(' | ')}]`).toBe('audiences');
    });

    await steps.step('Click Back twice to return to the General step - the previously entered Name, Module and Action are still shown (and the messages on the way forward again)', async () => {
      expect(await backToGeneral(page, drawer)).toBe('general');
      expect(await generalShown(drawer), 'General kept').toEqual(expect.objectContaining({ name, module: STEPS_CASE.module, action: STEPS_CASE.action }));
      await forwardTo(page, drawer, 'content');
      expect(await contentShown(drawer), 'Content kept').toEqual(expect.objectContaining({ english: messages.english, arabic: messages.arabic }));
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.preview.azureId}: should preview both messages with sample values in place of the placeholders`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const messages = await messagesFor(page, DEF_ACTION.networkInactive, 'preview', true);
    let preview = '';
    await openModule(steps, ncDefinitions);

    await steps.step('On the Content step enter English and Arabic messages containing placeholders - the messages are shown in their fields', async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ name: suiteDefinitions.newName('preview'), module: NETWORK_MODULE, action: NETWORK_INACTIVE });
      await forwardTo(page, drawer, 'content');
      await drawer.fillContent({ english: messages.english, arabic: messages.arabic });
      expect(await contentShown(drawer)).toEqual(expect.objectContaining({ english: messages.english, arabic: messages.arabic }));
    });

    await steps.step('Click the Preview (eye) icon - a preview opens showing both the English and Arabic messages', async () => {
      preview = await drawer.preview();
      expect(preview, 'the preview shows the English message').toContain(withSamples(messages.english, messages.variables));
      expect(preview, 'the preview shows the Arabic message').toContain(withSamples(messages.arabic, messages.variables));
    });

    await steps.step('Inspect the preview content - placeholders are replaced with representative sample values in both languages', async () => {
      expect(preview, 'no placeholder is left unresolved').not.toContain('{{');
      const used = messages.variables.filter((v) => messages.english.includes(`{{${v.name}}}`));
      expect(used.filter((v) => preview.split(v.sampleValue).length - 1 < 2).map((v) => `${v.name}=${v.sampleValue}`), 'variables whose sample value is not in both messages').toEqual([]);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.audienceRequired.azureId}: should block saving with "${TEXT.addAudience.en}" until an audience is assigned`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer, languageSwitcher }) => {
    await suiteDefinitions.watch();
    const name = suiteDefinitions.newName('audience required');
    const messages = await messagesFor(page, DEF_ACTION.policyExpiringSoon, 'audience');
    await openModule(steps, ncDefinitions);

    await steps.critical('Complete General and Content, then go to the Audiences step without assigning any Users or Roles - no audience item is selected', async () => {
      await drawer.openCreate();
      const reached = await fillToAudiences(page, drawer, { name, module: POLICY_MODULE, action: POLICY_EXPIRING }, { english: messages.english, arabic: messages.arabic });
      expect(reached).toBe('audiences');
      expect(await audienceCardCount(page), 'no audience card / item').toBe(0);
    });

    await steps.step(`Click Save - "${TEXT.addAudience.en}" / "${TEXT.addAudience.ar}" is displayed and the drawer remains open`, async () => {
      const english = await saveFromHere(page, drawer);
      expect(english.status === null && english.drawerOpen && anyContains(english.toasts, TEXT.addAudience.en), `English UI: ${describeAttempt(english)}`).toBe(true);
      const moduleAr = await labelOf(page, DEF_MODULE.policyManagement, 'ar');
      const actionAr = await labelOf(page, DEF_ACTION.policyExpiringSoon, 'ar');
      const arabic = await attemptInArabic(page, languageSwitcher, ncDefinitions, drawer, async () => {
        await fillToAudiences(page, drawer, { name, module: moduleAr, action: actionAr }, { english: messages.english, arabic: messages.arabic });
      });
      expect(arabic.status === null && anyContains(arabic.toasts, TEXT.addAudience.ar), `Arabic UI: ${describeAttempt(arabic)}`).toBe(true);
      // Back to the case's drawer, on Audiences with nothing assigned, for the next step.
      await ncDefinitions.open();
      await drawer.openCreate();
      expect(await fillToAudiences(page, drawer, { name, module: POLICY_MODULE, action: POLICY_EXPIRING }, { english: messages.english, arabic: messages.arabic })).toBe('audiences');
    });

    await steps.step(`Assign at least one User to an audience section, then click Save - "${TEXT.saved.en}" is displayed`, async () => {
      await addAudienceWith(drawer, USERS, [ADMIN_DISPLAY]);
      const saved = await saveFromHere(page, drawer);
      expect(saved.status !== null && saved.status < 300 && anyContains(saved.toasts, TEXT.saved.en), describeAttempt(saved)).toBe(true);
    });
  });

  test(`TC-${CASES.assignAudiences.azureId}: should build audience sections through the Available / Selected window with removable chips`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const users = await audienceCandidates(page, 'users');
    const second = await readSecondUser(page);
    const who = [ADMIN_DISPLAY, second.fullEnglishName].map((name) => ({ name, id: users.find((u) => u.nameEn === name)?.id ?? '' }));
    const messages = await messagesFor(page, DEF_ACTION.networkInactive, 'assign');
    await openModule(steps, ncDefinitions);

    await steps.step('Click Assign on the Users audience type - a selection window opens showing Available and Selected lists', async () => {
      await drawer.openCreate();
      await fillToAudiences(page, drawer, { name: suiteDefinitions.newName('assign'), module: NETWORK_MODULE, action: NETWORK_INACTIVE }, { english: messages.english, arabic: messages.arabic });
      await drawer.addAudience(USERS);
      await openAssign(drawer, 0);
      await expect(drawer.picklist('source-list')).toBeVisible();
      await expect(drawer.picklist('target-list')).toBeVisible();
    });

    await steps.step('Move two users from Available to Selected - they appear in the Selected list and are removed from Available', async () => {
      expect(who.filter((w) => !w.id).map((w) => w.name), 'both users are audience candidates').toEqual([]);
      for (const w of who) await moveToSelected(drawer, w);
      expect(await pickState(drawer, who)).toEqual(who.map((w) => ({ name: w.name, available: false, selected: true })));
    });

    await steps.step('Confirm the selection - the chosen users are shown as chips on the Audiences step', async () => {
      await saveAssign(page, drawer);
      const [card] = await audienceSummary(page, drawer);
      // Spaces collapsed on both sides: maalmohammad's stored name has a double space the card shows as one.
      expect(who.filter((w) => !anyContains([card], w.name)).map((w) => w.name), `users missing from the card "${card}"`).toEqual([]);
    });

    await steps.step('Click Add Audience - a new audience section is added allowing selection of another audience type', async () => {
      await drawer.addAudience(ROLES);
      expect(await audienceCardCount(page), 'two audience sections').toBe(2);
      expect(await drawer.audienceCardText(1), 'the new section is of type Roles').toContain(ROLES);
    });

    await steps.step('Click Assign on the Roles audience type in the new section and select a role - the role is added as a chip for that section', async () => {
      await drawer.assign(1, [SECOND_USER_HOME_ROLE]);
      expect(await drawer.audienceCardText(1), 'the role chip').toContain(SECOND_USER_HOME_ROLE);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should handle free switching, long input, audience and variable edits in the Create drawer without stale data or errors`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer, languageSwitcher }) => {
    const name = suiteDefinitions.newName('explore');
    const planMessages = await messagesFor(page, DEF_ACTION.planInactive, 'explore');
    const planVariables = (await actionVariablesNc(page, DEF_ACTION.planInactive)).map((v) => v.name);
    const failures = watchFailures(page);
    await openModule(steps, ncDefinitions);

    await steps.step('Freely switch between modules, actions, message content, Notes and audiences, toggling Active and moving back and forth - the drawer responds consistently without data loss or stuck states', async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ name, module: NETWORK_MODULE, action: NETWORK_INACTIVE });
      await drawer.fillGeneral({ module: POLICY_MODULE });
      expect((await generalShown(drawer)).action, 'switching module empties Action').toBe('');
      await drawer.fillGeneral({ action: POLICY_EXPIRING, active: false });
      await drawer.fillGeneral({ active: true });
      await drawer.fillGeneral({ active: false });
      await drawer.fillGeneral({ module: PLAN_MODULE });
      expect((await generalShown(drawer)).action, 'switching module again empties Action').toBe('');
      await drawer.fillGeneral({ action: PLAN_INACTIVE });
      await forwardTo(page, drawer, 'content');
      await drawer.fillContent({ english: planMessages.english, arabic: planMessages.arabic, notes: 'exploration notes' });
      await forwardTo(page, drawer, 'audiences');
      await backToGeneral(page, drawer);
      expect(await generalShown(drawer), 'General kept through the round trip').toEqual(expect.objectContaining({ name, module: PLAN_MODULE, action: PLAN_INACTIVE, active: false }));
      await forwardTo(page, drawer, 'content');
      expect(await contentShown(drawer), 'Content kept').toEqual({ english: planMessages.english, arabic: planMessages.arabic, notes: 'exploration notes' });
    });

    await steps.step('Attempt unusual input: paste very long text, switch language mid-entry, assign then remove all audiences, open Manage Variables mid-edit - each is handled without errors or inconsistent state', async () => {
      await backToGeneral(page, drawer);
      await drawer.fillGeneral({ description: LONG_TEXT('QA automation long paste', LONG_PASTE_LENGTH) });
      expect((await generalShown(drawer)).description.length, 'the long paste is held to the Description limit').toBeLessThanOrEqual(DESCRIPTION_MAX);
      const switched = await trySwitchLanguage(languageSwitcher, 'ar');
      test.info().annotations.push({ type: 'note', description: `header language toggle with the drawer open: ${switched ? 'switched' : 'not reachable (modal drawer)'}` });
      await trySwitchLanguage(languageSwitcher, 'en');
      expect((await generalShown(drawer)).name, 'Name kept across the language toggle').toBe(name);
      await forwardTo(page, drawer, 'audiences');
      await addAudienceWith(drawer, USERS, [ADMIN_DISPLAY]);
      expect(await removeAllAudiences(page, drawer), 'the assigned audience could be removed').toBe(1);
      expect(await audienceCardCount(page), 'no audience left').toBe(0);
      await backToGeneral(page, drawer);
      await forwardTo(page, drawer, 'content');
      await drawer.openVariables();
      await drawer.variablesBack();
      expect(await contentShown(drawer), 'Content kept after Manage Variables').toEqual(expect.objectContaining({ english: planMessages.english, arabic: planMessages.arabic }));
      expect(failures.stop(), 'server errors / page errors during the exploration').toEqual([]);
    });

    await steps.step('Note any inconsistent labels, broken placeholder lists or stale data left over from a previous module/action - none is found', async () => {
      expect([...(await insertMenuVariables(drawer))].sort(), `the placeholders offered are "${PLAN_INACTIVE}"'s only`).toEqual([...planVariables].sort());
      await drawer.openVariables();
      expect([...(await drawer.variableNames())].sort(), 'Manage Variables lists the same action variables').toEqual([...planVariables].sort());
      await drawer.variablesBack();
      await discardDrawer(drawer);
      expect((await definitionsBy(page, { searchText: name })).totalRows, 'nothing was saved by the exploration').toBe(0);
    });
  });

  test(`TC-${CASES.saveChecksAllSteps.azureId}: should surface Action-required and Audience-required together when Save is clicked, and save once both are corrected`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer, languageSwitcher }) => {
    await suiteDefinitions.watch();
    const name = suiteDefinitions.newName('all steps');
    const nameAr = suiteDefinitions.newName('all steps ar');
    const networkContent = await messagesFor(page, DEF_ACTION.networkInactive, 'allsteps');
    const planContent = await messagesFor(page, DEF_ACTION.planInactive, 'allsteps');
    const ar = {
      network: await labelOf(page, DEF_MODULE.networkManagement, 'ar'),
      networkInactive: await labelOf(page, DEF_ACTION.networkInactive, 'ar'),
      plan: await labelOf(page, DEF_MODULE.planManagement, 'ar'),
      planInactive: await labelOf(page, DEF_ACTION.planInactive, 'ar'),
      users: await audienceTypeLabel(page, 'users', 'ar'),
    };
    const admin = await candidatesNamed(page, 'users', [ADMIN_DISPLAY]);
    await openModule(steps, ncDefinitions);

    await steps.step('Leave Action unselected on General, enter valid Content and leave Audiences unassigned, then click Save - every outstanding error across the steps is surfaced (Action required and Audience required)', async () => {
      await drawer.openCreate();
      await fillToAudiences(page, drawer, { name, module: NETWORK_MODULE, action: NETWORK_INACTIVE }, { english: networkContent.english, arabic: networkContent.arabic });
      await backToGeneral(page, drawer);
      // The UI offers no "clear" on Action and Next refuses to leave General without one, so the only
      // way to valid Content + no Action is: fill all, go back, change the Module (which empties Action).
      await drawer.fillGeneral({ module: PLAN_MODULE });
      expect(await actionAfterModuleChange(page, drawer), 'Action is now unselected (Content stays valid, no audience)').toBe('');
      const english = await saveFromHere(page, drawer, { jump: true, revisit: true });
      expect(
        { sent: english.status, action: errorOf(english.errors, ERROR_FIELD.action), audience: anyContains(english.toasts, TEXT.addAudience.en) },
        `English UI - Save is rendered only on step 3 and the attempt (stepper jump to step 3, then Next) ${english.clickedSave ? 'reached Save' : `was stopped on ${english.to}`}; Action-required shown: "${errorOf(english.errors, ERROR_FIELD.action)}"; Audience-required ("${TEXT.addAudience.en}") shown: ${anyContains(english.toasts, TEXT.addAudience.en) ? 'yes' : 'NO - only the General step was validated'}. Detail: ${describeAttempt(english)}`,
      ).toEqual({ sent: null, action: TEXT.fieldRequired.en, audience: true });
      const arabic = await attemptInArabic(page, languageSwitcher, ncDefinitions, drawer, async () => {
        await fillToAudiences(page, drawer, { name: nameAr, module: ar.network, action: ar.networkInactive }, { english: networkContent.english, arabic: networkContent.arabic });
        await backToGeneral(page, drawer);
        await drawer.fillGeneral({ module: ar.plan });
        await actionAfterModuleChange(page, drawer);
      }, { jump: true, revisit: true });
      expect({ sent: arabic.status, action: errorOf(arabic.errors, ERROR_FIELD.action), audience: anyContains(arabic.toasts, TEXT.addAudience.ar) }, `Arabic UI: ${describeAttempt(arabic)}`)
        .toEqual({ sent: null, action: TEXT.fieldRequired.ar, audience: true });
    });

    await steps.step(`Correct every flagged issue across the steps, then click Save - "${TEXT.saved.en}" / "${TEXT.saved.ar}" is displayed and the drawer closes`, async () => {
      await ncDefinitions.open();
      await drawer.openCreate();
      await fillToAudiences(page, drawer, { name, module: PLAN_MODULE, action: PLAN_INACTIVE }, { english: planContent.english, arabic: planContent.arabic });
      await addAudienceWith(drawer, USERS, [ADMIN_DISPLAY]);
      const english = await saveFromHere(page, drawer);
      expect(english.status !== null && english.status < 300 && anyContains(english.toasts, TEXT.saved.en) && !english.drawerOpen, `English UI: ${describeAttempt(english)}`).toBe(true);
      const arabic = await attemptInArabic(page, languageSwitcher, ncDefinitions, drawer, async () => {
        await fillToAudiences(page, drawer, { name: nameAr, module: ar.plan, action: ar.planInactive }, { english: planContent.english, arabic: planContent.arabic });
        const idx = await addAudienceCard(page, drawer, ar.users);
        await assignByIds(page, drawer, idx, admin);
      });
      expect(arabic.status !== null && arabic.status < 300 && anyContains(arabic.toasts, TEXT.saved.ar), `Arabic UI: ${describeAttempt(arabic)}`).toBe(true);
    });
  });

  test(`TC-${CASES.discardConfirm.azureId}: should ask to confirm before discarding unsaved changes when the drawer is closed`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const name = suiteDefinitions.newName('discard');
    await openModule(steps, ncDefinitions);

    await steps.step('Enter a Name and partially complete other fields without clicking Save - the entered values remain in the drawer', async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ name, module: NETWORK_MODULE });
      expect(await generalShown(drawer)).toEqual(expect.objectContaining({ name, module: NETWORK_MODULE }));
    });

    await steps.step('Click the close (X) button on the drawer - a confirmation asks to confirm discarding unsaved changes', async () => {
      expect(await pressClose(page, drawer), 'the Unsaved Changes dialog').toEqual(TEXT.unsaved);
    });

    await steps.step('Choose to cancel the close action - the drawer remains open with all entered data intact', async () => {
      await answerUnsaved(page, 'stay');
      expect(await drawer.isOpen(), 'the drawer is still open').toBe(true);
      expect(await generalShown(drawer)).toEqual(expect.objectContaining({ name, module: NETWORK_MODULE }));
    });

    await steps.step('Click close again and confirm discard - the drawer closes and the unsaved changes are discarded', async () => {
      expect(await pressClose(page, drawer), 'the dialog asks again').toEqual(TEXT.unsaved);
      await answerUnsaved(page, 'discard');
      await expect(drawer.el('close'), 'the drawer is closed').toBeHidden();
      expect((await definitionsBy(page, { searchText: name })).totalRows, 'nothing was saved').toBe(0);
    });
  });
});

