import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { DefinitionDrawer } from '../../../pages/notification/Drawers';
import type { DefinitionsTab } from '../../../pages/notification/NotificationCenterPage';
import { DEF_ACTION, DEF_MODULE } from '../../../constants/notification/writerCIds';
import { CASES, CHANGED_ENGLISH, STORY } from '../../../data/notification/editAppNotification.data';
import { TEXT } from '../../../data/notification/createAppNotification.data';
import {
  answerUnsaved,
  contentShown,
  countWrites,
  definitionRecord,
  definitionsBy,
  discardDrawer,
  doubleClick,
  forwardTo,
  leaveWithBack,
  makeSuiteDefinition,
  openEdit,
  pressClose,
  saveButton,
  toastTexts,
  wordingWithRequired,
  WRITE_API,
  type MadeDefinition,
} from '../../../utils/notification/writerCHelpers';

/** Step 1: the App Notification list. */
async function openList(steps: TestSteps, tab: DefinitionsTab): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the list of notifications is displayed', async () => {
    const answer = await tab.open();
    expect(answer?.status, 'GetDefinitions should answer the App Notification tab').toBe(200);
  });
}

/** Opens Edit on the suite definition and moves to Content (shared by the change-a-field steps). */
async function editContent(page: Page, tab: DefinitionsTab, drawer: DefinitionDrawer, def: MadeDefinition): Promise<void> {
  await tab.search(def.name);
  await openEdit(page, tab, drawer, def.id, def.name);
  await forwardTo(page, drawer, 'content');
}

/**
 * User story 21001: Edit App Notification - closing / leaving the edit drawer
 * with and without unsaved changes, and a double Save. Every record is the
 * case's own suite definition (teardown deletes it). See the data file.
 */
test.describe(`US ${STORY.id} - ${STORY.title} (unsaved changes)`, () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.closeUntouched.azureId}: should close the edit drawer at once when nothing was changed`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'untouched', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await openList(steps, ncDefinitions);

    await steps.critical('Click Edit on an existing notification - the drawer opens pre-filled with saved values', async () => {
      await ncDefinitions.search(def.name);
      expect((await openEdit(page, ncDefinitions, drawer, def.id, def.name)).name).toBe(def.name);
    });

    await steps.step('Without changing any field, click the close (X) button - the drawer closes immediately with no confirmation dialog', async () => {
      expect(await pressClose(page, drawer), 'no Unsaved Changes dialog').toBeNull();
      await expect(drawer.el('close'), 'the drawer is closed').toBeHidden();
    });
  });

  test(`TC-${CASES.confirmDiscard.azureId}: should ask to confirm discarding when the drawer is closed with an unsaved change`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'confirm discard', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await openList(steps, ncDefinitions);

    await steps.critical('Click Edit on an existing notification - the drawer opens pre-filled with saved values', async () => {
      await editContent(page, ncDefinitions, drawer, def);
      expect((await contentShown(drawer)).english).toBe(def.english);
    });

    await steps.step('Change the message text in the Content step - the field reflects the new unsaved value', async () => {
      await drawer.fillContent({ english: CHANGED_ENGLISH });
      expect((await contentShown(drawer)).english).toBe(CHANGED_ENGLISH);
    });

    await steps.step('Click the close (X) button on the drawer - a confirmation dialog asks to discard unsaved changes', async () => {
      expect(await pressClose(page, drawer), 'the Unsaved Changes dialog').toEqual(TEXT.unsaved);
      await answerUnsaved(page, 'discard');
    });
  });

  test(`TC-${CASES.discardKeepsSaved.azureId}: should discard unsaved edits and keep the last saved values when the discard is confirmed`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'discard', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await openList(steps, ncDefinitions);

    await steps.critical('Click Edit on an existing notification and change a field, then click close - the discard confirmation dialog appears', async () => {
      await editContent(page, ncDefinitions, drawer, def);
      await drawer.fillContent({ english: CHANGED_ENGLISH });
      expect(await pressClose(page, drawer)).toEqual(TEXT.unsaved);
    });

    await steps.step('Click the confirm / discard option on the dialog - the drawer closes and the dialog disappears', async () => {
      await answerUnsaved(page, 'discard');
      await expect(drawer.el('close'), 'the drawer is closed').toBeHidden();
    });

    await steps.step('Click Edit on the same notification again - the original saved values are shown, with none of the discarded edits', async () => {
      await editContent(page, ncDefinitions, drawer, def);
      expect((await contentShown(drawer)).english, 'the saved wording').toBe(def.english);
      expect((await definitionRecord(page, def.id))?.englishMessageTemplate, 'GetDefinition unchanged').toBe(def.english);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.cancelKeepsEdits.azureId}: should keep the drawer open with the unsaved edit when the discard prompt is cancelled`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'keep editing', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await openList(steps, ncDefinitions);

    await steps.critical('Click Edit on an existing notification and change a field, then click close - the discard confirmation dialog appears', async () => {
      await editContent(page, ncDefinitions, drawer, def);
      await drawer.fillContent({ english: CHANGED_ENGLISH });
      expect(await pressClose(page, drawer)).toEqual(TEXT.unsaved);
    });

    await steps.step('Click Cancel on the confirmation dialog - the dialog closes and the drawer remains open', async () => {
      await answerUnsaved(page, 'stay');
      expect(await drawer.isOpen(), 'the drawer stays open').toBe(true);
    });

    await steps.step('Review the field that was changed - the unsaved edit is still present', async () => {
      expect((await contentShown(drawer)).english).toBe(CHANGED_ENGLISH);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.doubleSave.azureId}: should process a rapid double Save as a single update`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'double save', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    const changed = await wordingWithRequired(page, DEF_ACTION.networkInactive, CHANGED_ENGLISH);
    await openList(steps, ncDefinitions);

    await steps.critical('Click Edit on an existing notification and make a valid change - the field reflects the new value', async () => {
      await editContent(page, ncDefinitions, drawer, def);
      await drawer.fillContent({ english: changed });
      expect((await contentShown(drawer)).english).toBe(changed);
      await forwardTo(page, drawer, 'audiences');
    });

    await steps.step(`Double-click the Save button in rapid succession - a single save request is processed and "${TEXT.saved.en}" is shown only once`, async () => {
      const writes = await countWrites(page, WRITE_API.update, () => doubleClick(saveButton(drawer)));
      const toasts = await toastTexts(page);
      expect({ requests: writes.bodies.length, answers: writes.statuses }, 'UpdateDefinition requests for the double-click').toEqual({ requests: 1, answers: [200] });
      expect(toasts.filter((t) => t.includes(TEXT.saved.en)).length, `toasts [${toasts.join(' | ')}]`).toBe(1);
      expect(toasts.filter((t) => /error|failed|concurrency|modified/i.test(t)), 'error toasts').toEqual([]);
    });

    await steps.step('Reopen the notification - the change is applied exactly once with no duplicate entries or errors', async () => {
      expect((await definitionsBy(page, { searchText: def.name })).items.filter((d) => d.name === def.name).length, 'one record of that name').toBe(1);
      await editContent(page, ncDefinitions, drawer, def);
      expect((await contentShown(drawer)).english).toBe(changed);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.navigateAway.azureId}: should keep the last saved values when the administrator navigates away from an unsaved edit`, async ({ page, steps, suiteDefinitions, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: 'navigate away', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    await openList(steps, ncDefinitions);

    await steps.critical('Click Edit on an existing notification and change a field without saving - the field shows the unsaved value', async () => {
      await editContent(page, ncDefinitions, drawer, def);
      await drawer.fillContent({ english: CHANGED_ENGLISH });
      expect((await contentShown(drawer)).english).toBe(CHANGED_ENGLISH);
    });

    await steps.step('Navigate away from the module with the browser back button without saving - the browser leaves the page or warns about unsaved changes', async () => {
      const left = await leaveWithBack(page);
      expect(left.left || left.warned, `after Back: ${JSON.stringify(left)}`).toBe(true);
    });

    await steps.step('Return to the Notification Center Management module and open the same notification - it still shows its last saved values, with no partial edits applied', async () => {
      await ncDefinitions.open();
      await editContent(page, ncDefinitions, drawer, def);
      expect((await contentShown(drawer)).english, 'the saved wording').toBe(def.english);
      expect((await definitionRecord(page, def.id))?.englishMessageTemplate, 'GetDefinition unchanged').toBe(def.english);
      await discardDrawer(drawer);
    });
  });
});
