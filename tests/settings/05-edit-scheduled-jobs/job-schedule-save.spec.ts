import { test, expect } from '../../../fixtures';
import { JOB_KEYS, nextFiring } from '../../../utils/JobClock';
import {
  aDifferentTime,
  describeSave,
  fireNetworkJobFromScreen,
  jobControls,
  literal,
  nudgeJobMinute,
  onDemandControls,
  screenControls,
  toastTitle,
  utcClock,
  waitForToastGone,
} from '../../../utils/settings/writerDHelpers';
import {
  CASES,
  FIRING_BUDGET,
  JOB_LABEL,
  MESSAGES,
  SCAN_BASELINE_IDS,
  SCHEDULED_JOBS_HEADING,
  SCREEN_BUDGET,
} from '../../../data/settings/editScheduledJobs.data';

/**
 * User story 20869: Edit Scheduled Jobs - saving: a new daily time applied
 * without a restart (21053, lead decision 9), no on-demand run control
 * (21054), and the "Setting updated" confirmation in English and Arabic
 * (21055, lead decision 3). Saves go through the drawer; `settingsGuard`
 * restores every job CRON at teardown.
 */
test.describe('US 20869 - Edit Scheduled Jobs', () => {
  test(`TC-${CASES.saveNetworkTime.azureId}: should save ${CASES.saveNetworkTime.hint.replace('Runs at ', '')} for the network job and apply it from the next run when saved without a restart`, async ({ page, steps, settingsGuard, settingsHub, settingsPage }) => {
    test.setTimeout(FIRING_BUDGET);
    const d = CASES.saveNetworkTime;

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with the daily job time fields is shown', async () => {
      const saved = await settingsGuard.set({ [d.job]: d.precondition });
      expect(saved.status, `precondition: the network job at 00:20 UTC ("${d.precondition}") - ${saved.text.slice(0, 200)}`).toBeLessThan(300);
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[d.job]), 'the network line').not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel - the panel loads', async () => {
      await settingsHub.openEdit();
      await expect(jobControls(page, d.job).picker, 'the network clock').toHaveValue(d.preconditionPicker);
      await expect(jobControls(page, d.job).hint).toHaveText(d.preconditionHint);
    });

    await steps.critical(`Change the Daily medical network status update time to 01:00 UTC and select Save - "${MESSAGES.savedEn}" is shown`, async () => {
      expect(await settingsPage.setJobTime(d.job, d.picker), 'the network clock (Riyadh)').toBe(d.picker);
      await expect(jobControls(page, d.job).hint, 'the UTC line before saving').toHaveText(d.hint);
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, confirmation: toastTitle(outcome, MESSAGES.savedEn) }, describeSave(outcome)).toEqual({ status: 200, confirmation: MESSAGES.savedEn });
      expect((await settingsGuard.current())[d.job], 'the stored schedule').toBe(d.savedCron);
    });

    await steps.step('Check the next scheduled run without restarting the platform - it reflects the newly saved time immediately', async () => {
      await settingsHub.open();
      await expect.poll(async () => literal(await settingsHub.readViewValue(JOB_LABEL[d.job])).toLowerCase(), { message: 'the overview (casing is 21048\'s finding)', timeout: 10_000 })
        .toBe(d.overview.toLowerCase());
      const stored = (await settingsGuard.current())[d.job];
      expect(utcClock(nextFiring(stored)), `the next run of "${stored}" (UTC)`).toBe(d.nextRunUtc);
      // The saved time applies without a restart: the same screen sets the job a minute ahead and the job runs then.
      const run = await fireNetworkJobFromScreen(page, settingsHub, settingsPage, d.job, (reason) => steps.blocked(reason));
      expect(
        { saved: run.save.status, stored: run.stored, beforeTheMinute: run.before.status, activeAfter: run.after.ok },
        `"${run.network.name}" with the job set on the screen to "${run.picker}" (${run.wantedCron}, ${run.firesAt.toISOString()}): `
          + `${describeSave(run.save)}; it read ${run.before.status} before the minute and ${run.after.value?.status ?? 'nothing'} ${Math.round(run.after.elapsedMs / 1000)} s after`,
      ).toEqual({ saved: 200, stored: run.wantedCron, beforeTheMinute: 'Future', activeAfter: true });
    });
  });

  test(`TC-${CASES.noRunNow.azureId}: should offer no Run now control for any scheduled job when the Scheduled Jobs panel is open`, async ({ page, steps, settingsGuard, settingsHub }) => {
    test.setTimeout(SCREEN_BUDGET);

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with the list of configured jobs is shown', async () => {
      await settingsHub.open();
      expect(await settingsHub.outletText(), 'the read view').toContain(SCHEDULED_JOBS_HEADING);
      expect(Object.keys(settingsGuard.original), 'the six job schedules').toEqual(expect.arrayContaining([...JOB_KEYS]));
    });

    await steps.critical('Open the Scheduled Jobs panel - the panel loads', async () => {
      await settingsHub.openEdit();
      for (const job of JOB_KEYS) await expect(jobControls(page, job).hint, `${JOB_LABEL[job]} UTC line`).toBeVisible();
    });

    await steps.step('Look for a "Run now" or on-demand trigger control for any scheduled job - no such control is present anywhere on the screen', async () => {
      const controls = await screenControls(page);
      expect(controls.map((c) => c.id), 'the scan read the screen\'s controls (baseline)').toEqual(expect.arrayContaining([...SCAN_BASELINE_IDS]));
      expect(onDemandControls(controls), `on-demand controls among ${controls.length} scanned`).toEqual([]);
    });
  });

  test(`TC-${CASES.savedConfirmation.azureId}: should show "${MESSAGES.savedEn}" / "${MESSAGES.savedAr}" when a valid formulary job time is saved`, async ({ page, steps, settingsGuard, settingsHub, settingsPage, languageSwitcher }) => {
    test.setTimeout(SCREEN_BUDGET);
    const d = CASES.savedConfirmation;
    let target = '';

    await steps.critical('Navigate to the System Setting Management module - the Scheduled Jobs section with its editable fields is shown', async () => {
      await settingsHub.open();
      expect(await settingsHub.readViewValue(JOB_LABEL[d.job]), `the formulary line (stored "${settingsGuard.original[d.job]}")`).not.toBe('');
    });

    await steps.critical('Open the Scheduled Jobs panel and change the Formulary status update time to a valid value - the field accepts it', async () => {
      await settingsHub.openEdit();
      target = aDifferentTime(await jobControls(page, d.job).picker.inputValue(), d.times);
      expect(await settingsPage.setJobTime(d.job, target), 'the formulary clock').toBe(target);
    });

    await steps.step(`Select Save - the confirmation "${MESSAGES.savedEn}" is shown`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, confirmation: toastTitle(outcome, MESSAGES.savedEn) }, describeSave(outcome)).toEqual({ status: 200, confirmation: MESSAGES.savedEn });
    });

    await steps.step(`Select Save with the interface in Arabic - the confirmation "${MESSAGES.savedAr}" is shown`, async () => {
      await waitForToastGone(page);
      await languageSwitcher.switchTo('ar');
      await settingsHub.openEdit();
      const nudged = await nudgeJobMinute(page, d.job);
      const outcome = await settingsHub.saveAndCapture();
      await languageSwitcher.switchTo('en');
      expect(
        { changed: nudged.after !== nudged.before, status: outcome.status, confirmation: toastTitle(outcome, MESSAGES.savedAr) },
        `the formulary clock "${nudged.before}" -> "${nudged.after}"; ${describeSave(outcome)}`,
      ).toEqual({ changed: true, status: 200, confirmation: MESSAGES.savedAr });
    });
  });
});
