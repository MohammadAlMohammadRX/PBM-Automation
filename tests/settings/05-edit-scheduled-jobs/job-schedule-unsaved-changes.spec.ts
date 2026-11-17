import { test, expect } from '../../../fixtures';
import { cronToRiyadhPicker } from '../../../utils/JobClock';
import {
  aDifferentTime,
  answerLeaveGuard,
  attemptToLeave,
  describeLeave,
  isGuardVisible,
  jobControls,
  onSettingsScreen,
} from '../../../utils/settings/writerDHelpers';
import { CASES, JOB_LABEL, MESSAGES, SCREEN_BUDGET, UNSAVED_JOB, UNSAVED_TIMES } from '../../../data/settings/editScheduledJobs.data';

/**
 * User story 20869: Edit Scheduled Jobs - leaving the screen with an unsaved
 * job time: the "Unsaved Changes" dialog (21056), Keep Editing (21057) and
 * Discard Changes (21058). The time is changed in the drawer and NEVER saved;
 * leaving is the side-menu link, or the browser Back button when the drawer's
 * mask keeps the menu from being clicked. The foundation saw the drawer close
 * with no dialog (2026-11-09): each failure states what happened instead.
 */
test.describe('US 20869 - Edit Scheduled Jobs', () => {
  test.describe.configure({ timeout: SCREEN_BUDGET });

  test(`TC-${CASES.unsavedWarning.azureId}: should warn with the Unsaved Changes dialog when the administrator leaves with an unsaved job time`, async ({ page, steps, settingsGuard, settingsHub, settingsPage }) => {
    let target = '';

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with its editable fields is shown', async () => {
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[UNSAVED_JOB]), `the plan line (stored "${settingsGuard.original[UNSAVED_JOB]}")`).not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel and change a daily job time without saving - the field shows the unsaved new value', async () => {
      await settingsHub.openEdit();
      target = aDifferentTime(await jobControls(page, UNSAVED_JOB).picker.inputValue(), UNSAVED_TIMES);
      expect(await settingsPage.setJobTime(UNSAVED_JOB, target), 'the plan clock (unsaved)').toBe(target);
    });

    await steps.step(`Attempt to navigate away from the screen - the "${MESSAGES.unsaved.title}" dialog opens with its message and the options "${MESSAGES.unsaved.options.join('" and "')}"`, async () => {
      const attempt = await attemptToLeave(page);
      expect(
        { title: attempt.guard.title, message: attempt.guard.message, options: [...attempt.guard.options].sort() },
        describeLeave(attempt),
      ).toEqual({ title: MESSAGES.unsaved.title, message: MESSAGES.unsaved.message, options: [...MESSAGES.unsaved.options].sort() });
    });
  });

  test(`TC-${CASES.keepEditing.azureId}: should keep the panel open with the unsaved change when Keep Editing is selected`, async ({ page, steps, settingsGuard, settingsHub, settingsPage }) => {
    let target = '';

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with its editable fields is shown', async () => {
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[UNSAVED_JOB]), `the plan line (stored "${settingsGuard.original[UNSAVED_JOB]}")`).not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel, change a time, and attempt to navigate away - the Unsaved Changes dialog opens', async () => {
      await settingsHub.openEdit();
      target = aDifferentTime(await jobControls(page, UNSAVED_JOB).picker.inputValue(), UNSAVED_TIMES);
      expect(await settingsPage.setJobTime(UNSAVED_JOB, target), 'the plan clock (unsaved)').toBe(target);
      const attempt = await attemptToLeave(page);
      expect(attempt.guard.shown, describeLeave(attempt)).toBe(true);
    });

    await steps.step('Select "Keep Editing" - the dialog closes and the panel stays open with the unsaved change', async () => {
      await answerLeaveGuard(page, 'stay');
      expect({ dialogOpen: await isGuardVisible(page), onSettingsScreen: onSettingsScreen(page) }, `after Keep Editing the URL is ${page.url()}`).toEqual({ dialogOpen: false, onSettingsScreen: true });
      await expect(settingsHub.drawerTitle(), 'the Edit Setting panel').toBeVisible();
      await expect(jobControls(page, UNSAVED_JOB).picker, 'the unsaved plan time').toHaveValue(target);
    });
  });

  test(`TC-${CASES.discardChanges.azureId}: should leave the screen and keep the original job time when Discard Changes is selected`, async ({ page, steps, settingsGuard, settingsHub, settingsPage }) => {
    const original = settingsGuard.original[UNSAVED_JOB];

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with its editable fields is shown', async () => {
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[UNSAVED_JOB]), `the plan line (stored "${original}")`).not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel, change a time, and attempt to navigate away - the Unsaved Changes dialog opens', async () => {
      await settingsHub.openEdit();
      const target = aDifferentTime(await jobControls(page, UNSAVED_JOB).picker.inputValue(), UNSAVED_TIMES);
      expect(await settingsPage.setJobTime(UNSAVED_JOB, target), 'the plan clock (unsaved)').toBe(target);
      const attempt = await attemptToLeave(page);
      expect(attempt.guard.shown, describeLeave(attempt)).toBe(true);
    });

    await steps.critical('Select "Discard Changes" - navigation proceeds away from the panel', async () => {
      await answerLeaveGuard(page, 'discard');
      await expect.poll(() => onSettingsScreen(page), { message: `still on the Settings screen (${page.url()})`, timeout: 10_000 }).toBe(false);
    });

    await steps.step('Reopen the Scheduled Jobs panel - the unsaved change is not present and the original value remains', async () => {
      await settingsHub.open();
      await settingsHub.openEdit();
      await expect(jobControls(page, UNSAVED_JOB).picker, `the plan clock for the stored "${original}"`).toHaveValue(cronToRiyadhPicker(original));
      expect((await settingsGuard.current())[UNSAVED_JOB], 'the stored plan schedule').toBe(original);
    });
  });
});
