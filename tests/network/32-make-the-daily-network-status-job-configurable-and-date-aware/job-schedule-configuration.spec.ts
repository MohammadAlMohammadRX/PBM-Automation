import { test, expect } from '../../../fixtures';
import type { SettingsPage } from '../../../pages/system/SettingsPage';
import {
  FIRING_SETTLE_MS,
  FIRING_TIMEOUT_MS,
  JOB_SCHEDULE_CASES as CASES,
  REFUSED,
  SCHEDULE_TIMEOUT_MS,
  UNAUTHORISED,
} from '../../../data/networks/jobSchedule.data';
import { cronAt, nextFiring, riyadhTime, waitUntilInstant, writeJobCron, type JobClock } from '../../../utils/JobClock';
import { approvedNetworkAt, networkAuditTrail, networkSnapshot, waitForNetworkStatus } from '../../../utils/jobDriven/lifecycle';
import {
  JobTimeField,
  NETWORK_JOB,
  NETWORK_JOB_LABEL,
  fireNetworkJobAfter,
  pickerText,
  readViewPattern,
  rememberJob,
  shownFor,
} from '../../../utils/jobDriven/writerN2Helpers';

/**
 * User story 14310: Make the daily network status job configurable and
 * date-aware - the schedule screen and the job firing at what it holds.
 *
 * The schedule is System Settings > Settings > General > Scheduled Jobs
 * (`Jobs.NetworkLifecycleCron`, UTC CRON, shown in Riyadh time) - driven with
 * SettingsPage's job methods. Every case first makes the jobClock remember the
 * job's value (`rememberJob`), so whatever the screen or a move changes is put
 * back in teardown and read back (fixtures/jobClock.fixture.ts).
 * ADMINISTRATOR ONLY - the default session.
 */

/** Picks a Riyadh time on the screen and saves it - the picker and the save must both accept it. */
async function expectTimeSaved(settingsPage: SettingsPage, time: string): Promise<void> {
  expect(await settingsPage.setJobTime(NETWORK_JOB, pickerText(time)), `the picker shows ${time}`).toBe(pickerText(time));
  const outcome = await settingsPage.saveAndCaptureOutcome();
  expect(outcome.status, `the save answered ${outcome.status} "${outcome.toast}" ${outcome.detail}`).toBe(200);
}

/** Reopened: the drawer, its UTC hint, the read view and the stored value all hold `time`. */
async function expectScheduleShows(settingsPage: SettingsPage, jobClock: JobClock, time: string, cron: string, utcHint: string): Promise<void> {
  await settingsPage.open();
  const schedule = await settingsPage.readJobSchedule(NETWORK_JOB);
  expect(schedule.time, 'the picker').toBe(pickerText(time));
  expect(schedule.utcHint, 'the UTC hint').toContain(utcHint);
  expect(await settingsPage.readJobDisplay(NETWORK_JOB_LABEL), 'the read view').toMatch(readViewPattern(time));
  expect(await jobClock.read(NETWORK_JOB), 'the stored schedule').toBe(cron);
}

/** The two screen checks, as assertion helpers. */
const screen = { expectTimeSaved, expectScheduleShows };

test.describe('US 14310 - Configure the daily network status job', () => {
  test(`TC-${CASES.configureAndRun.azureId}: should save the configured run time and run the job at it when an administrator sets it`, async ({
    page,
    networkManagementPage,
    settingsPage,
    jobClock,
    steps,
  }) => {
    test.setTimeout(FIRING_TIMEOUT_MS);
    let original = '';

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      original = await rememberJob(jobClock);
      expect(original, 'the network job has a stored schedule').not.toBe('');
    });

    await steps.critical('Open the job schedule configuration - the current run time is displayed', async () => {
      expect((await settingsPage.readJobSchedule(NETWORK_JOB)).time, 'the stored schedule in Riyadh time').toBe(shownFor(original));
    });

    await steps.critical(`Set the run time to ${CASES.configureAndRun.time} and save - saved and displayed as the active run time`, async () => {
      await screen.expectTimeSaved(settingsPage, CASES.configureAndRun.time);
      await screen.expectScheduleShows(settingsPage, jobClock, CASES.configureAndRun.time, CASES.configureAndRun.storedCron, CASES.configureAndRun.utcHint);
    });

    await steps.step('When the configured time arrives the job triggers at it', async () => {
      const effectiveAt = new Date(Date.now() + 120_000);
      const network = await approvedNetworkAt(page, { effectiveAt });
      const move = await fireNetworkJobAfter(jobClock, effectiveAt);
      await waitUntilInstant(page, move.firesAt, -15_000);
      expect((await networkSnapshot(page, network.id)).status, `nothing runs before the configured minute (Riyadh ${riyadhTime(move.firesAt)})`).toBe('Future');
      const active = await waitForNetworkStatus(page, network.id, 'Active', { timeoutMs: FIRING_SETTLE_MS });
      expect(active.ok, `the job ran at ${move.firesAt.toISOString()} and made the network Active (it reads ${active.value?.status})`).toBe(true);
      const change = (await networkAuditTrail(page, network.id)).find((e) => /status/i.test(String(e.actionType ?? '')));
      expect(change, 'the job\'s STATUS_CHANGE is in the network\'s Audit History').toBeTruthy();
      const at = Date.parse(String(change?.occurredAtUtc ?? ''));
      expect(at, `the change happened at the configured minute (${move.firesAt.toISOString()}), not before`).toBeGreaterThanOrEqual(move.firesAt.getTime() - 1_000);
      expect(at).toBeLessThan(move.firesAt.getTime() + FIRING_SETTLE_MS);
    });
  });

  for (const boundary of [CASES.earliest, CASES.latest]) {
    test(`TC-${boundary.azureId}: should accept ${boundary.time} as the run time and schedule the job for it when the boundary is saved`, async ({
      networkManagementPage,
      settingsPage,
      jobClock,
      steps,
    }) => {
      test.setTimeout(SCHEDULE_TIMEOUT_MS);
      let original = '';

      await steps.critical('Navigate to the Network Management module - the module loads', async () => {
        await networkManagementPage.openList();
        original = await rememberJob(jobClock);
        expect(original).not.toBe('');
      });

      await steps.critical('Open the job schedule configuration - the current run time is displayed', async () => {
        expect((await settingsPage.readJobSchedule(NETWORK_JOB)).time).toBe(shownFor(original));
      });

      await steps.critical(`Set the run time to ${boundary.time} and save - accepted and saved as the active run time`, async () => {
        await screen.expectTimeSaved(settingsPage, boundary.time);
        await screen.expectScheduleShows(settingsPage, jobClock, boundary.time, boundary.storedCron, boundary.utcHint);
      });

      await steps.step(`The job is scheduled to execute at ${boundary.time} (Riyadh) on its next cycle`, async () => {
        const stored = await jobClock.read(NETWORK_JOB);
        const next = nextFiring(stored);
        expect(next, `"${stored}" is a daily schedule`).not.toBeNull();
        expect(riyadhTime(next as Date), 'the next firing, in Riyadh time').toBe(boundary.time);
        expect((next as Date).getTime() - Date.now(), 'the next firing is within the coming day').toBeLessThanOrEqual(24 * 60 * 60_000);
      });
    });
  }

  test(`TC-${CASES.invalid.azureId}: should reject the run time and keep the previous one when ${CASES.invalid.typed} is entered`, async ({
    page,
    networkManagementPage,
    settingsPage,
    jobClock,
    steps,
  }) => {
    test.setTimeout(SCHEDULE_TIMEOUT_MS);
    const field = new JobTimeField(page);
    let original = '';

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      original = await rememberJob(jobClock);
      expect(original).not.toBe('');
    });

    await steps.critical('Open the job schedule configuration - the current run time is displayed', async () => {
      expect((await settingsPage.readJobSchedule(NETWORK_JOB)).time).toBe(shownFor(original));
    });

    await steps.step(`Entering ${CASES.invalid.typed} is refused with a validation error and not saved`, async () => {
      const shown = await field.typeTime(CASES.invalid.typed);
      expect(shown, 'the picker never holds the invalid time').not.toContain(CASES.invalid.typed);
      await settingsPage.cancel();
      // The value the screen would send for 25:99 - the server must refuse it with a validation error.
      const answer = await jobClock.set(NETWORK_JOB, CASES.invalid.invalidCron);
      expect(answer.status, `UpsertSystemSettings "${CASES.invalid.invalidCron}" answered ${answer.status} ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(REFUSED.min);
      expect(answer.status).toBeLessThanOrEqual(REFUSED.max);
      expect(`${answer.validationErrors.join(' ')} ${answer.text}`, 'the refusal explains the value is invalid').toMatch(/cron|invalid|schedule|time|format/i);
    });

    await steps.step('Reopened, the configuration shows the previous valid run time unchanged', async () => {
      await settingsPage.open();
      expect(await jobClock.read(NETWORK_JOB), 'the stored schedule').toBe(original);
      expect((await settingsPage.readJobSchedule(NETWORK_JOB)).time).toBe(shownFor(original));
    });
  });

  test(`TC-${CASES.midRange.azureId}: should accept a mid-range run time when ${CASES.midRange.time} is saved`, async ({
    networkManagementPage,
    settingsPage,
    jobClock,
    steps,
  }) => {
    test.setTimeout(SCHEDULE_TIMEOUT_MS);
    let original = '';

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      original = await rememberJob(jobClock);
      expect(original).not.toBe('');
    });

    await steps.critical('Open the job schedule configuration - the current run time is displayed', async () => {
      expect((await settingsPage.readJobSchedule(NETWORK_JOB)).time).toBe(shownFor(original));
    });

    await steps.critical(`Set the run time to ${CASES.midRange.time} and save - accepted as the active run time`, async () => {
      await screen.expectTimeSaved(settingsPage, CASES.midRange.time);
    });

    await steps.step(`Reopened, the configuration confirms ${CASES.midRange.time} is the active schedule`, async () => {
      await screen.expectScheduleShows(settingsPage, jobClock, CASES.midRange.time, CASES.midRange.storedCron, CASES.midRange.utcHint);
    });
  });

  test(`TC-${CASES.adminOnly.azureId}: should let only the administrator change the job schedule when a non-administrator tries`, async ({
    page,
    networkManagementPage,
    settingsPage,
    nonAdminSession,
    jobClock,
    steps,
  }) => {
    test.setTimeout(SCHEDULE_TIMEOUT_MS);
    const field = new JobTimeField(page);
    let original = '';

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      original = await rememberJob(jobClock);
      expect(original).not.toBe('');
    });

    await steps.step('As the administrator the job schedule configuration is accessible and editable', async () => {
      expect((await settingsPage.readJobSchedule(NETWORK_JOB)).time).toBe(shownFor(original));
      expect(await field.isEditable(), 'the administrator can change the run time').toBe(true);
      await settingsPage.cancel();
    });

    await steps.step('As the non-administrator the configuration is denied or hidden', async () => {
      const access = await nonAdminSession.settings.openAndReportAccess();
      expect(access.reachable, `the non-administrator reached ${access.url}: "${access.text.slice(0, 160)}"`).toBe(false);
    });

    await steps.step('A direct change by the non-administrator is blocked with an authorization error', async () => {
      const answer = await writeJobCron(nonAdminSession.page, NETWORK_JOB, CASES.adminOnly.attemptedCron);
      expect(UNAUTHORISED, `the non-administrator's UpsertSystemSettings answered ${answer.status} ${answer.text.slice(0, 200)}`).toContain(answer.status);
      expect(await jobClock.read(NETWORK_JOB), 'the schedule is unchanged').toBe(original);
    });
  });

  test(`TC-${CASES.reschedule.azureId}: should run the job only at the new time when the schedule is changed`, async ({
    page,
    networkManagementPage,
    settingsPage,
    jobClock,
    steps,
  }) => {
    test.setTimeout(FIRING_TIMEOUT_MS);
    let original = '';

    await steps.critical('Navigate to the Network Management module - the module loads', async () => {
      await networkManagementPage.openList();
      original = await rememberJob(jobClock);
      expect(original).not.toBe('');
    });

    await steps.critical(`Open the configuration with the job at ${CASES.reschedule.oldTime} - displayed as the active schedule`, async () => {
      await screen.expectTimeSaved(settingsPage, CASES.reschedule.oldTime);
      await settingsPage.open();
      expect((await settingsPage.readJobSchedule(NETWORK_JOB)).time).toBe(pickerText(CASES.reschedule.oldTime));
    });

    await steps.critical(`Change the run time to ${CASES.reschedule.newTime} and save - ${CASES.reschedule.newTime} is the active run time`, async () => {
      await screen.expectTimeSaved(settingsPage, CASES.reschedule.newTime);
      await screen.expectScheduleShows(settingsPage, jobClock, CASES.reschedule.newTime, CASES.reschedule.newCron, CASES.reschedule.newUtcHint);
    });

    await steps.step('The job does not trigger at the old time and triggers at the new one', async () => {
      // The old / new times brought a few minutes ahead: A is scheduled, then replaced by B before it arrives.
      const effectiveAt = new Date(Date.now() + 120_000);
      const network = await approvedNetworkAt(page, { effectiveAt });
      const oldMove = await fireNetworkJobAfter(jobClock, effectiveAt);
      const newAt = new Date(oldMove.firesAt.getTime() + 3 * 60_000);
      const replaced = await jobClock.set(NETWORK_JOB, cronAt(newAt));
      expect(replaced.status, 'the new schedule is saved').toBeLessThan(300);
      await waitUntilInstant(page, oldMove.firesAt, 75_000);
      expect((await networkSnapshot(page, network.id)).status, `no run at the replaced time (Riyadh ${riyadhTime(oldMove.firesAt)})`).toBe('Future');
      await waitUntilInstant(page, newAt, 0);
      const active = await waitForNetworkStatus(page, network.id, 'Active', { timeoutMs: FIRING_SETTLE_MS });
      expect(active.ok, `the job ran at the new time (Riyadh ${riyadhTime(newAt)}); the network reads ${active.value?.status}`).toBe(true);
    });
  });
});
