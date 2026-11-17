import { test, expect } from '../../../fixtures';
import {
  describeSave,
  jobControls,
  messagesAfterSave,
  saveBlocked,
  tryToEmptyJobControl,
  typeIntoCronBox,
} from '../../../utils/settings/writerDHelpers';
import { CASES, JOB_LABEL, MESSAGES, SCREEN_BUDGET } from '../../../data/settings/editScheduledJobs.data';

/**
 * User story 20869: Edit Scheduled Jobs - the schedule expression fields: an
 * invalid CRON refused with "Invalid CRON expression." (accumulator reset and a
 * daily job shown as a raw text box), the raw text box itself, and the two
 * mandatory fields left empty (lead decision 10).
 *
 * The accumulator reset shows a time PICKER today (its CRON is daily), not the
 * AC's text box: a user cannot type an expression into it, and 21050 fails
 * stating that. Preconditions are set through `settingsGuard.set`; the guard
 * restores every job CRON at teardown.
 */
test.describe('US 20869 - Edit Scheduled Jobs', () => {
  test.describe.configure({ timeout: SCREEN_BUDGET });

  test(`TC-${CASES.accumulatorInvalid.azureId}: should block the save with "${MESSAGES.invalidCron}" when "${CASES.accumulatorInvalid.typed}" is entered for the annual accumulator reset`, async ({ page, steps, settingsGuard, settingsHub }) => {
    const d = CASES.accumulatorInvalid;
    const before = settingsGuard.original[d.job];

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with the annual accumulator reset schedule field is shown', async () => {
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[d.job]), 'the accumulator reset line').not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel - the panel loads', async () => {
      await settingsHub.openEdit();
      await expect(jobControls(page, d.job).box.or(jobControls(page, d.job).picker), 'the accumulator reset control').toBeVisible();
    });

    await steps.step(`Enter "${d.typed}" in the Annual accumulator reset field and select Save - the save is blocked, "${MESSAGES.invalidCron}" is shown and nothing is saved`, async () => {
      const typing = await typeIntoCronBox(page, d.job, d.typed);
      const outcome = await settingsHub.saveAndCapture();
      const shown = await messagesAfterSave(page, outcome);
      const stored = (await settingsGuard.current())[d.job];
      expect(
        { typedIntoTextBox: typing.typed, saveBlocked: saveBlocked(outcome), messageShown: shown.includes(MESSAGES.invalidCron), stored },
        `${typing.typed ? 'typed into the text box' : `there is NO text box to type "${d.typed}" into: the accumulator reset shows ${typing.shownInstead}`}; `
          + `${describeSave(outcome)}; the screen showed "${shown.slice(0, 300)}"`,
      ).toEqual({ typedIntoTextBox: true, saveBlocked: true, messageShown: true, stored: before });
    });
  });

  test(`TC-${CASES.dailyRawInvalid.azureId}: should block the save with "${MESSAGES.invalidCron}" when "${CASES.dailyRawInvalid.typed}" is entered in a daily job's raw text box`, async ({ page, steps, settingsGuard, settingsHub }) => {
    const d = CASES.dailyRawInvalid;

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with the daily job schedule expression fields is shown', async () => {
      const saved = await settingsGuard.set({ [d.job]: d.precondition });
      expect(saved.status, `precondition: the plan job saved as "${d.precondition}" - ${saved.text.slice(0, 200)}`).toBeLessThan(300);
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[d.job]), 'the plan line').not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel - the daily job is shown as a raw expression text box', async () => {
      await settingsHub.openEdit();
      await expect(jobControls(page, d.job).box, `the plan job holding "${d.precondition}"`).toHaveValue(d.precondition);
    });

    await steps.step(`Enter "${d.typed}" into the daily job text box and select Save - the save is blocked, "${MESSAGES.invalidCron}" is shown and nothing is saved`, async () => {
      const typing = await typeIntoCronBox(page, d.job, d.typed);
      const outcome = await settingsHub.saveAndCapture();
      const shown = await messagesAfterSave(page, outcome);
      const stored = (await settingsGuard.current())[d.job];
      expect(
        { typedIntoTextBox: typing.typed, saveBlocked: saveBlocked(outcome), messageShown: shown.includes(MESSAGES.invalidCron), stored },
        `${describeSave(outcome)}; the screen showed "${shown.slice(0, 300)}"${typing.shownInstead ? `; no text box: ${typing.shownInstead}` : ''}`,
      ).toEqual({ typedIntoTextBox: true, saveBlocked: true, messageShown: true, stored: d.precondition });
    });
  });

  test(`TC-${CASES.rawTextBox.azureId}: should replace the clock with a text box showing the raw expression when a daily job holds "${CASES.rawTextBox.cron}"`, async ({ page, steps, settingsGuard, settingsHub }) => {
    const d = CASES.rawTextBox;

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with the daily schedule control is shown', async () => {
      const saved = await settingsGuard.set({ [d.job]: d.cron });
      expect(saved.status, `precondition: the formulary job saved as "${d.cron}" - ${saved.text.slice(0, 200)}`).toBeLessThan(300);
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[d.job]), 'the formulary line').not.toBe('');
    });

    await steps.step(`Open the Scheduled Jobs panel for the job running more than once a day ("${d.cron}") - the clock control is replaced by a text box`, async () => {
      await settingsHub.openEdit();
      await expect(jobControls(page, d.job).box, 'the raw expression text box').toBeVisible();
      await expect(jobControls(page, d.job).picker, 'the single-time clock').toBeHidden();
    });

    await steps.step('Observe the field - the text box shows the raw schedule expression instead of a single time picker', async () => {
      await expect(jobControls(page, d.job).box, 'the text box').toHaveValue(d.cron);
    });

    // The job fires every 30 minutes while this value stands - put it back at once.
    await settingsGuard.restoreNow();
  });

  for (const d of [CASES.accumulatorEmpty, CASES.networkEmpty]) {
    test(`TC-${d.azureId}: should block the save and flag the field as required when the ${JOB_LABEL[d.job]} field is cleared`, async ({ page, steps, settingsGuard, settingsHub }) => {
      const before = settingsGuard.original[d.job];

      await steps.critical(`Navigate to the System Setting Management module - the Scheduled Jobs section with the ${JOB_LABEL[d.job]} field is shown`, async () => {
        await settingsHub.open();
        expect(await settingsHub.readViewValue(JOB_LABEL[d.job]), JOB_LABEL[d.job]).not.toBe('');
      });

      await steps.critical('Open the Scheduled Jobs panel - the panel loads', async () => {
        await settingsHub.openEdit();
        await expect(jobControls(page, d.job).box.or(jobControls(page, d.job).picker), `the ${JOB_LABEL[d.job]} control`).toBeVisible();
      });

      await steps.step(`Clear the ${JOB_LABEL[d.job]} field and select Save - the save is blocked and the field is flagged as required`, async () => {
        const cleared = await tryToEmptyJobControl(page, d.job);
        const outcome = await settingsHub.saveAndCapture();
        const shown = await messagesAfterSave(page, outcome);
        const stored = (await settingsGuard.current())[d.job];
        expect(
          { emptied: cleared.emptied, saveBlocked: saveBlocked(outcome), requiredShown: MESSAGES.required.test(shown), stored },
          `the ${cleared.kind} ${cleared.emptied ? 'was emptied' : `REFUSED to be emptied (select all + Delete, clear icon): it still shows "${cleared.valueAfter}"`}; `
            + `${describeSave(outcome)}; the screen showed "${shown.slice(0, 300)}"`,
        ).toEqual({ emptied: true, saveBlocked: true, requiredShown: true, stored: before });
      });
    });
  }
});
