import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { DefinitionsTab } from '../../../pages/notification/NotificationCenterPage';
import { DEF_ACTION, DEF_MODULE } from '../../../constants/notification/writerCIds';
import {
  ACTIVE_MARK,
  CASES,
  DIALOG_MESSAGE,
  INACTIVE_MARK,
  LONG_LIST_COUNT,
  ORDER_SHIPPED_LABEL,
  STORY,
  TOGGLE_LABEL,
} from '../../../data/notification/activateAndDeactivateAppNotification.data';
import {
  answerDialog,
  clickRowAction,
  countWrites,
  definitionRecord,
  definitionsBy,
  dialogButtons,
  doubleClick,
  hasPagerPage,
  makeSuiteDefinition,
  makeSuiteDefinitions,
  readAllPages,
  toastTexts,
  WRITE_API,
} from '../../../utils/notification/writerCHelpers';

const NETWORK = { moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive } as const;

/** Step 1 with the row's current state shown. */
async function openListShowing(steps: TestSteps, tab: DefinitionsTab, title: string, rows: readonly { id: string; name: string; mark: string }[]): Promise<void> {
  await steps.critical(title, async () => {
    await tab.open();
    for (const r of rows) {
      await tab.search(r.name);
      await expect(tab.cell(r.id, 'active'), `"${r.name}" shows ${r.mark}`).toHaveText(r.mark);
    }
  });
}

/**
 * User story 21002: Activate and Deactivate App Notification - the toggle's
 * confirmation, Yes / No, and the Active cell. Every record toggled is the
 * case's own suite definition (audience careconnect only; teardown deletes it).
 * See the data file for the readings.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.activate.azureId}: should activate an inactive notification after the confirmation`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: ORDER_SHIPPED_LABEL, isActive: false });
    await openListShowing(steps, ncDefinitions, `Navigate to the Notification Center Management module - the list shows "${def.name}" as Inactive`, [{ ...def, mark: INACTIVE_MARK }]);

    await steps.step(`Click Activate on the "${def.name}" row - a confirmation asks "${DIALOG_MESSAGE.activate(def.name)}"`, async () => {
      await expect(ncDefinitions.rowAction(def.id, 'toggle-active')).toHaveText(TOGGLE_LABEL.activate);
      const dialog = await clickRowAction(ncDefinitions, def.id, 'toggle-active');
      expect(dialog?.message, `dialog shown: ${JSON.stringify(dialog)}`).toBe(DIALOG_MESSAGE.activate(def.name));
    });

    await steps.step('Click Confirm on the dialog - the dialog closes and the row updates', async () => {
      const answered = await answerDialog(page, ncDefinitions, true, WRITE_API.toggle);
      expect({ status: answered.status, gone: answered.dialogGone }, answered.answer).toEqual({ status: 200, gone: true });
    });

    await steps.step('Review the row\'s Active status - the status now shows Active', async () => {
      await expect(ncDefinitions.cell(def.id, 'active')).toHaveText(ACTIVE_MARK);
      expect((await definitionRecord(page, def.id))?.isActive, 'GetDefinition isActive').toBe(true);
    });
  });

  test(`TC-${CASES.deactivate.azureId}: should deactivate an active notification after the confirmation`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: ORDER_SHIPPED_LABEL, isActive: true });
    await openListShowing(steps, ncDefinitions, `Navigate to the Notification Center Management module - the list shows "${def.name}" as Active`, [{ ...def, mark: ACTIVE_MARK }]);

    await steps.step(`Click Deactivate on the "${def.name}" row - a confirmation asks "${DIALOG_MESSAGE.deactivate(def.name)}"`, async () => {
      await expect(ncDefinitions.rowAction(def.id, 'toggle-active')).toHaveText(TOGGLE_LABEL.deactivate);
      const dialog = await clickRowAction(ncDefinitions, def.id, 'toggle-active');
      expect(dialog?.message, `dialog shown: ${JSON.stringify(dialog)}`).toBe(DIALOG_MESSAGE.deactivate(def.name));
    });

    await steps.step('Click Confirm on the dialog - the dialog closes and the row updates', async () => {
      const answered = await answerDialog(page, ncDefinitions, true, WRITE_API.toggle);
      expect({ status: answered.status, gone: answered.dialogGone }, answered.answer).toEqual({ status: 200, gone: true });
    });

    await steps.step('Review the row\'s Active status - the status now shows Inactive', async () => {
      await expect(ncDefinitions.cell(def.id, 'active')).toHaveText(INACTIVE_MARK);
      expect((await definitionRecord(page, def.id))?.isActive, 'GetDefinition isActive').toBe(false);
    });
  });

  test(`TC-${CASES.activateWording.azureId}: should word the activation confirmation exactly and offer Confirm and Cancel`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'activate wording', isActive: false });
    let message = '';
    await openListShowing(steps, ncDefinitions, 'Navigate to the Notification Center Management module - the list of notifications is displayed', [{ ...def, mark: INACTIVE_MARK }]);

    await steps.step('Click Activate on an inactive notification row - a confirmation dialog appears', async () => {
      const dialog = await clickRowAction(ncDefinitions, def.id, 'toggle-active');
      expect(dialog, 'a confirmation dialog').not.toBeNull();
      message = dialog?.message ?? '';
    });

    await steps.step(`Read the dialog text - it reads "${DIALOG_MESSAGE.activate('[Notification Name]')}" exactly, with Confirm and Cancel options`, async () => {
      expect(message).toBe(DIALOG_MESSAGE.activate(def.name));
      const buttons = await dialogButtons(page, ncDefinitions);
      expect({ confirm: buttons.confirm, cancel: buttons.cancel }, `buttons shown: ${buttons.labels.join(' / ')}`).toEqual({ confirm: true, cancel: true });
      await answerDialog(page, ncDefinitions, false, WRITE_API.toggle);
    });
  });

  test(`TC-${CASES.deactivateWording.azureId}: should word the deactivation confirmation exactly and offer Confirm and Cancel`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'deactivate wording', isActive: true });
    let message = '';
    await openListShowing(steps, ncDefinitions, 'Navigate to the Notification Center Management module - the list of notifications is displayed', [{ ...def, mark: ACTIVE_MARK }]);

    await steps.step('Click Deactivate on an active notification row - a confirmation dialog appears', async () => {
      const dialog = await clickRowAction(ncDefinitions, def.id, 'toggle-active');
      expect(dialog, 'a confirmation dialog').not.toBeNull();
      message = dialog?.message ?? '';
    });

    await steps.step(`Read the dialog text - it reads "${DIALOG_MESSAGE.deactivate('[Notification Name]')}" exactly, with Confirm and Cancel options`, async () => {
      expect(message).toBe(DIALOG_MESSAGE.deactivate(def.name));
      const buttons = await dialogButtons(page, ncDefinitions);
      expect({ confirm: buttons.confirm, cancel: buttons.cancel }, `buttons shown: ${buttons.labels.join(' / ')}`).toEqual({ confirm: true, cancel: true });
      await answerDialog(page, ncDefinitions, false, WRITE_API.toggle);
    });
  });

  test(`TC-${CASES.cancelKeeps.azureId}: should leave the Active status unchanged when the confirmation is cancelled`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const inactive = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'cancel inactive', isActive: false });
    const active = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'cancel active', isActive: true });
    await openListShowing(steps, ncDefinitions, "Navigate to the Notification Center Management module - the list is displayed with the notifications' current status visible", [{ ...inactive, mark: INACTIVE_MARK }, { ...active, mark: ACTIVE_MARK }]);

    await steps.step('Click Activate (and, on the active one, Deactivate) on the notification row - the confirmation dialog appears', async () => {
      await ncDefinitions.search(inactive.name);
      expect(await clickRowAction(ncDefinitions, inactive.id, 'toggle-active'), 'the Activate confirmation').not.toBeNull();
    });

    await steps.step('Click Cancel on the dialog - the dialog closes', async () => {
      expect((await answerDialog(page, ncDefinitions, false, WRITE_API.toggle)).dialogGone, 'Activate dialog closed').toBe(true);
      await ncDefinitions.search(active.name);
      expect(await clickRowAction(ncDefinitions, active.id, 'toggle-active'), 'the Deactivate confirmation').not.toBeNull();
      expect((await answerDialog(page, ncDefinitions, false, WRITE_API.toggle)).dialogGone, 'Deactivate dialog closed').toBe(true);
    });

    await steps.step("Review the row's Active status - it is unchanged from before the action was initiated", async () => {
      await expect(ncDefinitions.cell(active.id, 'active')).toHaveText(ACTIVE_MARK);
      await ncDefinitions.search(inactive.name);
      await expect(ncDefinitions.cell(inactive.id, 'active')).toHaveText(INACTIVE_MARK);
      expect({ inactive: (await definitionRecord(page, inactive.id))?.isActive, active: (await definitionRecord(page, active.id))?.isActive }, 'GetDefinition').toEqual({ inactive: false, active: true });
    });
  });

  test(`TC-${CASES.lastActionWins.azureId}: should show the status of the most recent confirmed activate or deactivate`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'toggle sequence', isActive: false });
    const toggle = async (): Promise<number | null> => {
      expect(await clickRowAction(ncDefinitions, def.id, 'toggle-active'), 'the confirmation').not.toBeNull();
      return (await answerDialog(page, ncDefinitions, true, WRITE_API.toggle)).status;
    };
    await openListShowing(steps, ncDefinitions, 'Navigate to the Notification Center Management module - the list shows the notification as Inactive', [{ ...def, mark: INACTIVE_MARK }]);

    await steps.step('Click Activate and confirm - the status updates to Active', async () => {
      expect(await toggle()).toBe(200);
      await expect(ncDefinitions.cell(def.id, 'active')).toHaveText(ACTIVE_MARK);
      expect((await definitionRecord(page, def.id))?.isActive).toBe(true);
    });

    await steps.step('Click Deactivate and confirm - the status updates to Inactive', async () => {
      expect(await toggle()).toBe(200);
      await expect(ncDefinitions.cell(def.id, 'active')).toHaveText(INACTIVE_MARK);
      expect((await definitionRecord(page, def.id))?.isActive).toBe(false);
    });

    await steps.step('Click Activate and confirm again - the status updates to Active', async () => {
      expect(await toggle()).toBe(200);
      await expect(ncDefinitions.cell(def.id, 'active')).toHaveText(ACTIVE_MARK);
      expect((await definitionRecord(page, def.id))?.isActive).toBe(true);
    });
  });

  test(`TC-${CASES.relevantActionOnly.azureId}: should offer only Activate on an inactive row and only Deactivate on an active row`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const base = suiteDefinitions.newName('relevant action');
    const [inactive, active] = await makeSuiteDefinitions(page, suiteDefinitions, base, [{ ...NETWORK, isActive: false }, { ...NETWORK, isActive: true }]);
    await steps.critical('Navigate to the Notification Center Management module - the list is displayed with mixed statuses', async () => {
      await ncDefinitions.open();
      await ncDefinitions.search(base);
      expect([await ncDefinitions.cell(inactive.id, 'active').innerText(), await ncDefinitions.cell(active.id, 'active').innerText()].map((t) => t.trim())).toEqual([INACTIVE_MARK, ACTIVE_MARK]);
    });

    await steps.step('Locate a notification with Active = Inactive - the row offers Activate (Deactivate not shown)', async () => {
      await expect(ncDefinitions.rowAction(inactive.id, 'toggle-active')).toHaveText(TOGGLE_LABEL.activate);
    });

    await steps.step('Locate a notification with Active = Active - the row offers Deactivate (Activate not shown)', async () => {
      await expect(ncDefinitions.rowAction(active.id, 'toggle-active')).toHaveText(TOGGLE_LABEL.deactivate);
    });
  });

  test(`TC-${CASES.doubleConfirm.azureId}: should apply the status change once when Confirm is double-clicked`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'double confirm', isActive: false });
    await openListShowing(steps, ncDefinitions, 'Navigate to the Notification Center Management module - the list of notifications is displayed', [{ ...def, mark: INACTIVE_MARK }]);

    await steps.step('Click Activate on the notification - the confirmation dialog appears', async () => {
      expect(await clickRowAction(ncDefinitions, def.id, 'toggle-active'), 'the confirmation').not.toBeNull();
    });

    await steps.step('Double-click the Confirm button in rapid succession - the system processes a single status change', async () => {
      const writes = await countWrites(page, WRITE_API.toggle, () => doubleClick(ncDefinitions.dialogAction('confirm')));
      expect({ requests: writes.bodies.length, allActivate: writes.bodies.every((b) => /"isActive"\s*:\s*true/.test(b)) }, `ToggleDefinitionActivation bodies ${JSON.stringify(writes.bodies)} answered ${writes.statuses.join(', ')}`)
        .toEqual({ requests: 1, allActivate: true });
    });

    await steps.step("Review the row's Active status - it shows Active with no error or duplicate toggle back to Inactive", async () => {
      await expect(ncDefinitions.cell(def.id, 'active')).toHaveText(ACTIVE_MARK);
      expect((await definitionRecord(page, def.id))?.isActive).toBe(true);
      expect((await toastTexts(page)).filter((t) => /error|failed/i.test(t)), 'error toasts').toEqual([]);
    });
  });

  test(`TC-${CASES.consistentStates.azureId}: should show every notification as either Active or Inactive in agreement with the stored state`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'state active', isActive: true });
    await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'state inactive', isActive: false });
    let shown: { id: string; name: string; active: string }[] = [];
    let stored = new Map<string, boolean>();
    await steps.critical('Navigate to the Notification Center Management module - the list of notifications is displayed', async () => {
      await ncDefinitions.open();
      shown = await readAllPages(ncDefinitions, page);
      stored = new Map((await definitionsBy(page)).items.map((d) => [d.id, d.isActive]));
      expect(shown.length, 'rows read across every page').toBe(stored.size);
    });

    await steps.step('Review notifications with Active = Active - all of them display the Active state consistently', async () => {
      const wrong = shown.filter((r) => stored.get(r.id) === true && r.active !== ACTIVE_MARK).map((r) => `${r.name}: "${r.active}"`);
      expect(wrong, `active records not shown as ${ACTIVE_MARK}`).toEqual([]);
    });

    await steps.step('Review notifications with Active = Inactive - all of them display the Inactive state consistently', async () => {
      const wrong = shown.filter((r) => stored.get(r.id) === false && r.active !== INACTIVE_MARK).map((r) => `${r.name}: "${r.active}"`);
      expect(wrong, `inactive records not shown as ${INACTIVE_MARK}`).toEqual([]);
      expect(shown.filter((r) => ![ACTIVE_MARK, INACTIVE_MARK].includes(r.active)).map((r) => `${r.name}: "${r.active}"`), 'rows in neither state').toEqual([]);
    });
  });

  test(`TC-${CASES.lastPage.azureId}: should activate the last notification on the final page without affecting the other rows`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    test.setTimeout(8 * 60_000);
    const base = suiteDefinitions.newName('last page');
    const made = await makeSuiteDefinitions(page, suiteDefinitions, base, Array.from({ length: LONG_LIST_COUNT }, () => ({ ...NETWORK, isActive: false })));
    const [target, ...others] = made;
    await steps.critical('Navigate to the Notification Center Management module - the list is displayed with pagination controls', async () => {
      await ncDefinitions.open();
      const answer = await ncDefinitions.search(base);
      expect(answer?.totalRows, `"${base}" records`).toBe(LONG_LIST_COUNT);
      expect(await hasPagerPage(page, 2), 'a page 2 is offered').toBe(true);
    });

    await steps.step('Navigate to the last page of the list - the final page is displayed, including the target inactive notification', async () => {
      await ncDefinitions.goToPage(2);
      expect(await ncDefinitions.rowIds(), `page 2 holds "${target.name}"`).toEqual([target.id]);
      await expect(ncDefinitions.cell(target.id, 'active')).toHaveText(INACTIVE_MARK);
    });

    await steps.step('Click Activate on the last notification row on that page and confirm - the confirmation appears and the action is confirmed', async () => {
      expect((await clickRowAction(ncDefinitions, target.id, 'toggle-active'))?.message).toBe(DIALOG_MESSAGE.activate(target.name));
      expect((await answerDialog(page, ncDefinitions, true, WRITE_API.toggle)).status).toBe(200);
    });

    await steps.step("Review the row's status - it updates to Active and no other notification is affected", async () => {
      expect((await definitionRecord(page, target.id))?.isActive, 'the target is active').toBe(true);
      const states = await Promise.all(others.map(async (o) => (await definitionRecord(page, o.id))?.isActive));
      expect(states.filter((s) => s !== false).length, 'other records changed').toBe(0);
      await ncDefinitions.search(base);
      await ncDefinitions.goToPage(2);
      await expect(ncDefinitions.cell(target.id, 'active')).toHaveText(ACTIVE_MARK);
    });
  });
});
