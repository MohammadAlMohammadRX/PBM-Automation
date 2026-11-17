import { test, expect } from '../../../fixtures';
import { cronToRiyadhPicker, cronToUtcHint } from '../../../utils/JobClock';
import {
  blockUnlessNewInstallDefaults,
  fieldValue,
  jobControls,
  literal,
  readJobShown,
  riyadhPickerToUtcHint,
} from '../../../utils/settings/writerDHelpers';
import {
  ACCUMULATOR_JOB,
  CASES,
  DAILY_JOBS,
  JOB_LABEL,
  NEW_INSTALL_DEFAULTS,
  RIYADH_ZONE,
  SCHEDULED_JOBS_HEADING,
  SCREEN_BUDGET,
} from '../../../data/settings/editScheduledJobs.data';

/**
 * User story 20869: Edit Scheduled Jobs - what the screen shows: the
 * new-installation defaults (lead decision 1: BLOCKED while this environment
 * runs its own schedule), the UTC line under a clock, the overview sentence,
 * and the exploratory UTC conversion of all five daily jobs. Nothing here is
 * saved through the drawer; 21048's precondition is set through the guard,
 * which restores every job CRON at teardown.
 */
test.describe('US 20869 - Edit Scheduled Jobs', () => {
  test.describe.configure({ timeout: SCREEN_BUDGET });

  test(`TC-${CASES.dailyDefaults.azureId}: should show the default daily status update times when the platform is a new installation`, async ({ page, steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with the daily status update times is shown', async () => {
      await settingsHub.open();
      expect(await settingsHub.outletText(), 'the read view').toContain(SCHEDULED_JOBS_HEADING);
      for (const job of DAILY_JOBS) expect(await settingsHub.readViewValue(JOB_LABEL[job]), `${JOB_LABEL[job]} (stored "${settingsGuard.original[job]}")`).not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel - it loads showing all daily status update fields', async () => {
      await settingsHub.openEdit();
      for (const job of DAILY_JOBS) await expect(jobControls(page, job).hint, `${JOB_LABEL[job]} UTC line`).toBeVisible();
    });

    await steps.step('Observe each default UTC time - Payer 00:15, Medical network 00:20, Plan 00:25, Formulary 00:30 and Policy 00:35', async () => {
      const shown: Record<string, string> = {};
      for (const job of DAILY_JOBS) shown[job] = (await readJobShown(page, job)).hint;
      blockUnlessNewInstallDefaults(steps, DAILY_JOBS.map((job) => ({ job: JOB_LABEL[job], shown: shown[job], expected: NEW_INSTALL_DEFAULTS.daily[job] })));
      expect(shown, 'the UTC line of each daily job').toEqual({ ...NEW_INSTALL_DEFAULTS.daily });
    });
  });

  test(`TC-${CASES.accumulatorDefault.azureId}: should show the default annual accumulator reset schedule when the platform is a new installation`, async ({ page, steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with the annual accumulator reset schedule is shown', async () => {
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[ACCUMULATOR_JOB]), 'the accumulator reset line').not.toBe('');
      expect(settingsGuard.original[ACCUMULATOR_JOB], 'the stored accumulator schedule').not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel - the panel loads', async () => {
      await settingsHub.openEdit();
      await expect(jobControls(page, ACCUMULATOR_JOB).box.or(jobControls(page, ACCUMULATOR_JOB).picker), 'the accumulator reset control').toBeVisible();
    });

    await steps.step(`Observe the Annual accumulator reset schedule field - it shows "${NEW_INSTALL_DEFAULTS.accumulatorCron}"`, async () => {
      const shown = await readJobShown(page, ACCUMULATOR_JOB);
      const value = fieldValue(shown, settingsGuard.original[ACCUMULATOR_JOB]);
      blockUnlessNewInstallDefaults(steps, [{ job: JOB_LABEL[ACCUMULATOR_JOB], shown: value, expected: NEW_INSTALL_DEFAULTS.accumulatorCron }]);
      expect(value, 'the accumulator reset field').toBe(NEW_INSTALL_DEFAULTS.accumulatorCron);
    });
  });

  test(`TC-${CASES.utcHint.azureId}: should show the equivalent UTC time beneath the clock when the payer job is set to ${CASES.utcHint.picker} Riyadh`, async ({ page, steps, settingsGuard, settingsHub, settingsPage }) => {
    const d = CASES.utcHint;

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with the daily clock control is shown', async () => {
      expect(settingsGuard.original['Site.TimeZone'], 'precondition: the platform time zone').toBe(RIYADH_ZONE);
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[d.job]), 'the payer line').not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel - the daily job clocks are shown in Riyadh time', async () => {
      await settingsHub.openEdit();
      const stored = settingsGuard.original[d.job];
      await expect(jobControls(page, d.job).picker, `the payer clock in Riyadh time for "${stored}"`).toHaveValue(cronToRiyadhPicker(stored));
      await expect(jobControls(page, d.job).hint).toHaveText(cronToUtcHint(stored));
    });

    await steps.critical(`Set the Payer status update time to ${d.picker} (Riyadh) - the clock control updates to the new value`, async () => {
      expect(await settingsPage.setJobTime(d.job, d.picker), 'the payer clock').toBe(d.picker);
    });

    await steps.step(`Observe the line underneath the clock - it reads "${d.hint}"`, async () => {
      await expect(jobControls(page, d.job).hint, 'the UTC line under the payer clock').toHaveText(d.hint);
    });
  });

  test(`TC-${CASES.overviewSentence.azureId}: should read the payer schedule as "${CASES.overviewSentence.sentence}" when ${CASES.overviewSentence.precondition} is saved`, async ({ steps, settingsGuard, settingsHub }) => {
    const d = CASES.overviewSentence;
    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with its overview summary is shown', async () => {
      const saved = await settingsGuard.set({ [d.job]: d.precondition });
      expect(saved.status, `precondition: the payer job saved as "${d.precondition}" - ${saved.text.slice(0, 200)}`).toBeLessThan(300);
      expect(settingsGuard.original['Site.TimeZone'], 'precondition: the platform time zone').toBe(RIYADH_ZONE);
      await settingsHub.open();
      expect(await settingsHub.outletText(), 'the read view').toContain(SCHEDULED_JOBS_HEADING);
    });

    await steps.step('Open the Scheduled Jobs overview - the overview is displayed', async () => {
      await expect.poll(async () => settingsHub.readViewValue(JOB_LABEL[d.job]), { message: 'the payer overview line', timeout: 10_000 }).not.toBe('');
    });

    await steps.step(`Observe the payer status update line - the overview reads "${d.sentence}"`, async () => {
      await expect.poll(async () => literal(await settingsHub.readViewValue(JOB_LABEL[d.job])), { message: 'the payer overview sentence (case-sensitive)', timeout: 10_000 }).toBe(d.sentence);
    });
  });

  test(`TC-${CASES.exploratoryUtc.azureId}: should show a UTC line matching Riyadh = UTC+3 under every daily job when each is set to a different time`, async ({ page, steps, settingsGuard, settingsHub, settingsPage }) => {
    const d = CASES.exploratoryUtc;

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with all daily jobs and their UTC lines is shown', async () => {
      expect(settingsGuard.original['Site.TimeZone'], 'precondition: a non-UTC platform time zone').toBe(RIYADH_ZONE);
      await settingsHub.open();
      for (const job of DAILY_JOBS) expect(await settingsHub.readViewValue(JOB_LABEL[job]), JOB_LABEL[job]).not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel and adjust each of the five daily job times - each clock updates with a new UTC line beneath it', async () => {
      await settingsHub.openEdit();
      const shown: Record<string, string> = {};
      for (const job of DAILY_JOBS) shown[job] = await settingsPage.setJobTime(job, d.times[job]);
      expect(shown, 'the five clocks').toEqual({ ...d.times });
      for (const job of DAILY_JOBS) await expect(jobControls(page, job).hint, `${JOB_LABEL[job]} UTC line`).toBeVisible();
    });

    await steps.step('Compare the UTC line beneath each clock against a manual time zone conversion - every line matches', async () => {
      const lines: Record<string, string> = {};
      const conversions: Record<string, string> = {};
      for (const job of DAILY_JOBS) {
        lines[job] = (await readJobShown(page, job)).hint;
        conversions[job] = riyadhPickerToUtcHint(d.times[job]);
      }
      expect(lines, 'each UTC line vs Riyadh time minus 3 hours').toEqual(conversions);
    });
  });
});
