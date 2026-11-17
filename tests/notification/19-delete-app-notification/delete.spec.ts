import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { DefinitionsTab } from '../../../pages/notification/NotificationCenterPage';
import { DEF_ACTION, DEF_MODULE } from '../../../constants/notification/writerCIds';
import { CASES, DELETE_WORDING, STORY, WELCOME_LABEL } from '../../../data/notification/deleteAppNotification.data';
import {
  answerDialog,
  clickDelete,
  countWrites,
  definitionRecord,
  deleteThroughRow,
  describeDeleteClick,
  dialogOpen,
  isListed,
  dialogButtons,
  doubleClick,
  makeSuiteDefinition,
  rowActionState,
  toastTexts,
  WRITE_API,
  type DeleteClick,
  type MadeDefinition,
} from '../../../utils/notification/writerCHelpers';

const NETWORK = { moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive } as const;

/** The message of a later step that needs the dialog when the Delete click showed none. */
const NO_DIALOG = 'there was no confirmation dialog on screen - the Delete click had already deleted the notification without asking';

/** Whether the definition is still listed (searched by its name). */
function listed(tab: DefinitionsTab, def: MadeDefinition): Promise<boolean> {
  return isListed(tab, def.id, def.name);
}

/** Step 1 with the case's rows listed. */
async function openListShowing(steps: TestSteps, tab: DefinitionsTab, title: string, defs: readonly MadeDefinition[]): Promise<void> {
  await steps.critical(title, async () => {
    await tab.open();
    for (const d of defs) expect(await listed(tab, d), `"${d.name}" is listed`).toBe(true);
  });
}

/**
 * User story 21003: Delete App Notification - the confirmation, Confirm and
 * Cancel, and both statuses. Every record deleted is the case's own suite
 * definition (teardown removes what is left). See the data file.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.deleteConfirmed.azureId}: should remove a notification from the list after the delete is confirmed`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: WELCOME_LABEL });
    await openListShowing(steps, ncDefinitions, `Navigate to the Notification Center Management module - the list shows "${def.name}"`, [def]);

    await steps.step(`Click Delete on the "${def.name}" row - a confirmation dialog asks to confirm the deletion`, async () => {
      const click = await clickDelete(page, ncDefinitions, def.id);
      expect(click.dialog, describeDeleteClick(click)).not.toBeNull();
    });

    await steps.step('Click Confirm on the dialog - the dialog closes', async () => {
      const answered = await answerDialog(page, ncDefinitions, true, WRITE_API.delete);
      expect(answered.open, `${NO_DIALOG}, so there was no Confirm to click`).toBe(true);
      expect({ status: answered.status, gone: answered.dialogGone }, answered.answer).toEqual({ status: 200, gone: true });
    });

    await steps.step(`Review the notification list - "${def.name}" no longer appears`, async () => {
      expect(await listed(ncDefinitions, def), 'still listed').toBe(false);
      expect(await definitionRecord(page, def.id), 'GetDefinition finds nothing').toBeNull();
    });
  });

  test(`TC-${CASES.confirmWording.azureId}: should ask for confirmation, with Confirm and Cancel, before deleting a notification`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'delete wording' });
    let shown: DeleteClick['dialog'] = null;
    await openListShowing(steps, ncDefinitions, 'Navigate to the Notification Center Management module - the list of notifications is displayed', [def]);

    await steps.step('Click Delete on an existing notification row - a confirmation dialog appears', async () => {
      const click = await clickDelete(page, ncDefinitions, def.id);
      shown = click.dialog;
      expect(click.dialog, describeDeleteClick(click)).not.toBeNull();
    });

    await steps.step('Read the dialog text and options - it asks for confirmation before deleting and offers Confirm and Cancel', async () => {
      expect(shown, `${NO_DIALOG}, so there is no dialog text or option to read`).not.toBeNull();
      const text = `${shown?.title ?? ''} ${shown?.message ?? ''}`;
      expect(text, 'the dialog speaks of deleting').toMatch(DELETE_WORDING);
      expect(text, 'the dialog names the notification').toContain(def.name);
      const buttons = await dialogButtons(page, ncDefinitions);
      expect({ confirm: buttons.confirm, cancel: buttons.cancel }, `buttons shown: ${buttons.labels.join(' / ')}`).toEqual({ confirm: true, cancel: true });
      await answerDialog(page, ncDefinitions, false, WRITE_API.delete);
    });
  });

  test(`TC-${CASES.cancelKeeps.azureId}: should keep the notification unchanged when the delete confirmation is cancelled`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'delete cancel' });
    await openListShowing(steps, ncDefinitions, 'Navigate to the Notification Center Management module - the list of notifications is displayed', [def]);

    await steps.step('Click Delete on an existing notification row - the confirmation dialog appears', async () => {
      const click = await clickDelete(page, ncDefinitions, def.id);
      expect(click.dialog, describeDeleteClick(click)).not.toBeNull();
    });

    await steps.step('Click Cancel on the dialog - the dialog closes', async () => {
      const answered = await answerDialog(page, ncDefinitions, false, WRITE_API.delete);
      expect(answered.open, `${NO_DIALOG}, so there was no Cancel to click`).toBe(true);
      expect({ gone: answered.dialogGone, sent: answered.status }).toEqual({ gone: true, sent: null });
    });

    await steps.step('Review the notification list - the notification is still present, unchanged', async () => {
      const stored = await definitionRecord(page, def.id);
      expect(await listed(ncDefinitions, def), `"${def.name}" is listed after the Delete / Cancel (GetDefinition: ${stored ? 'still stored' : 'NOT FOUND - it was deleted by the Delete click, with no confirmation asked'})`).toBe(true);
      expect({ name: stored?.name, active: stored?.isActive, english: stored?.englishMessageTemplate }, 'GetDefinition unchanged').toEqual({ name: def.name, active: false, english: def.english });
    });
  });

  test(`TC-${CASES.anyStatus.azureId}: should offer Delete and delete the same way whatever the notification's status`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const active = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'delete any active', isActive: true });
    const inactive = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'delete any inactive', isActive: false });
    await openListShowing(steps, ncDefinitions, 'Navigate to the Notification Center Management module - the list of notifications is displayed', [active, inactive]);

    await steps.step('Review an Active notification row - the Delete action is available', async () => {
      await ncDefinitions.search(active.name);
      expect(await rowActionState(ncDefinitions, active.id, 'delete')).toEqual({ present: true, enabled: true });
    });

    await steps.step('Review an Inactive notification row - the Delete action is available', async () => {
      await ncDefinitions.search(inactive.name);
      expect(await rowActionState(ncDefinitions, inactive.id, 'delete')).toEqual({ present: true, enabled: true });
    });

    await steps.step('Click Delete on each and confirm - each notification is removed after confirmation, regardless of its prior status', async () => {
      const outcomes = [await deleteThroughRow(page, ncDefinitions, active.id, active.name), await deleteThroughRow(page, ncDefinitions, inactive.id, inactive.name)];
      expect(outcomes, 'per notification: whether a confirmation dialog was asked before deleting, the DeleteDefinition answer (after Confirm, or sent at once by the Delete click when no dialog came) and whether it is still listed')
        .toEqual([active, inactive].map((d) => ({ name: d.name, confirmation: true, status: 200, listed: false })));
    });
  });

  test(`TC-${CASES.activeAndInactive.azureId}: should delete both an active and an inactive notification through the same confirmation`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const active = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'delete active', isActive: true });
    const inactive = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'delete inactive', isActive: false });
    await openListShowing(steps, ncDefinitions, 'Navigate to the Notification Center Management module - the list shows one Active and one Inactive notification', [active, inactive]);

    await steps.step('Click Delete on the Active notification and confirm - the Active notification is removed from the list', async () => {
      await ncDefinitions.search(active.name);
      const click = await clickDelete(page, ncDefinitions, active.id);
      expect(click.dialog, describeDeleteClick(click)).not.toBeNull();
      expect((await answerDialog(page, ncDefinitions, true, WRITE_API.delete)).status).toBe(200);
      expect(await listed(ncDefinitions, active), 'the active one is gone').toBe(false);
    });

    await steps.step('Click Delete on the Inactive notification and confirm - the Inactive notification is removed from the list', async () => {
      await ncDefinitions.search(inactive.name);
      const click = await clickDelete(page, ncDefinitions, inactive.id);
      expect(click.dialog, describeDeleteClick(click)).not.toBeNull();
      expect((await answerDialog(page, ncDefinitions, true, WRITE_API.delete)).status).toBe(200);
      expect(await listed(ncDefinitions, inactive), 'the inactive one is gone').toBe(false);
    });
  });

  test(`TC-${CASES.doubleConfirm.azureId}: should process a rapid double Confirm as a single deletion without errors`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { ...NETWORK, label: 'delete double' });
    await openListShowing(steps, ncDefinitions, 'Navigate to the Notification Center Management module - the list of notifications is displayed', [def]);

    await steps.step('Click Delete on the notification row - the confirmation dialog appears', async () => {
      const click = await clickDelete(page, ncDefinitions, def.id);
      expect(click.dialog, describeDeleteClick(click)).not.toBeNull();
    });

    await steps.step('Double-click the Confirm button in rapid succession - the system processes a single delete request', async () => {
      expect(await dialogOpen(ncDefinitions), `${NO_DIALOG}, so there was no Confirm to double-click`).toBe(true);
      const writes = await countWrites(page, WRITE_API.delete, () => doubleClick(ncDefinitions.dialogAction('confirm')));
      expect({ requests: writes.bodies.length, answers: writes.statuses }, 'DeleteDefinition requests for the double-click').toEqual({ requests: 1, answers: [200] });
    });

    await steps.step('Review the list and check for error messages - the notification is removed exactly once with no duplicate errors or broken UI', async () => {
      expect((await toastTexts(page)).filter((t) => /error|failed|not found/i.test(t)), 'error toasts').toEqual([]);
      const answer = await ncDefinitions.search(def.name);
      expect(answer?.status, 'the list still answers').toBe(200);
      expect(await ncDefinitions.rowIds(), 'the notification is gone').not.toContain(def.id);
      expect(await definitionRecord(page, def.id), 'GetDefinition finds nothing').toBeNull();
    });
  });
});
