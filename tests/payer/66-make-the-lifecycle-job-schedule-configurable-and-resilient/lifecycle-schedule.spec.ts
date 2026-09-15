import { test, expect } from '../../../fixtures';
import type { SettingsPage } from '../../../pages/system/SettingsPage';
import { ACCESS_RESTRICTED, NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import {
  alternativeCron,
  BLOCKED_CASES,
  INVALID_CRONS,
  SCHEDULE_REFUSAL,
  SETTINGS_AUDIT_ENTITY,
  TIME_ZONE_PATTERN,
  UTC_BASIS,
  VALID_BOUNDARY_CRON,
  VALID_CRON_FORMS,
} from '../../../data/payers/lifecycleSchedule.data';

/**
 * User story: Make the Lifecycle Job Schedule Configurable and Resilient.
 *
 * System Settings > Settings > General owns the payer lifecycle job's CRON
 * (UTC). Every case that saves a changed value restores the original in its
 * last step, and the describe's afterEach restores again if a failure left it
 * changed - the schedule drives a real job on a shared environment. Validation
 * is server-side: a refused save answers 422 with a toast and leaves the
 * drawer open. The startup-fallback, running-job and job-execution cases are
 * BLOCKED - see lifecycleSchedule.data.ts.
 */
let originalPayerCron = '';

/** Puts the original schedule back and proves it took. */
async function restorePayerCron(settingsPage: SettingsPage, original: string): Promise<void> {
  await settingsPage.setJobCron('payer', original);
  await settingsPage.saveAndCaptureOutcome();
  expect(await settingsPage.getJobCron('payer'), 'the original schedule should be back').toBe(original);
  await settingsPage.closeDrawerIfOpen();
  originalPayerCron = '';
}

test.describe('Lifecycle job schedule', () => {
  test.afterEach(async ({ settingsPage }) => {
    if (originalPayerCron === '') return;
    const current = await settingsPage.getJobCron('payer');
    if (current !== originalPayerCron) {
      await settingsPage.setJobCron('payer', originalPayerCron);
      await settingsPage.saveAndCaptureOutcome();
    }
    await settingsPage.closeDrawerIfOpen();
    originalPayerCron = '';
  });

  test('TC-001: should persist and display a valid payer lifecycle schedule when the administrator saves it', async ({
    settingsPage,
    steps,
  }) => {
    let original = '';
    let alternative = '';

    await steps.critical('Navigate to System Settings and read the current payer schedule', async () => {
      original = await settingsPage.getJobCron('payer');
      originalPayerCron = original;
      alternative = alternativeCron(original);
      expect(alternative, 'the alternative must differ from the original').not.toBe(original);
    });

    await steps.step('A valid new schedule is accepted', async () => {
      await settingsPage.setJobCron('payer', alternative);
      await settingsPage.save();
    });

    await steps.step('The saved value is displayed and persisted', async () => {
      expect(await settingsPage.getDisplayedJobCron('payer'), 'the read view should show the new schedule').toBe(alternative);
      expect(await settingsPage.getJobCron('payer'), 'the drawer should hold the new schedule').toBe(alternative);
    });

    await steps.step('The original schedule is restored', async () => {
      await restorePayerCron(settingsPage, original);
    });
  });

  test('TC-002: should reject the save and keep the prior schedule when an invalid value is submitted', async ({
    settingsPage,
    steps,
  }) => {
    let original = '';

    await steps.critical('Navigate to System Settings and read the current payer schedule', async () => {
      original = await settingsPage.getJobCron('payer');
      originalPayerCron = original;
      expect(original, 'a schedule should be configured').not.toBe('');
    });

    await steps.step('An invalid schedule is refused with a clear message', async () => {
      await settingsPage.setJobCron('payer', INVALID_CRONS.outOfRange);
      const outcome = await settingsPage.saveAndCaptureOutcome();
      expect(outcome.status, 'the server should refuse the value').toBe(SCHEDULE_REFUSAL.status);
      expect(outcome.toast, `the user should be told why; the toast read "${outcome.toast}"`).toMatch(SCHEDULE_REFUSAL.toast);
      expect(outcome.drawerOpen, 'the drawer should stay open for correction').toBe(true);
    });

    await steps.step('The prior schedule is unchanged', async () => {
      await settingsPage.cancel();
      expect(await settingsPage.getJobCron('payer')).toBe(original);
      await settingsPage.closeDrawerIfOpen();
      originalPayerCron = '';
    });
  });

  test('TC-003: should enforce the hour and minute boundaries of the schedule', async ({ settingsPage, steps }) => {
    let original = '';

    await steps.critical('Navigate to System Settings and read the current payer schedule', async () => {
      original = await settingsPage.getJobCron('payer');
      originalPayerCron = original;
      expect(original).not.toBe('');
    });

    await steps.step('An hour of 24 and a minute of 60 are both refused', async () => {
      for (const value of [INVALID_CRONS.hourOverBoundary, INVALID_CRONS.minuteOverBoundary]) {
        await settingsPage.setJobCron('payer', value);
        const outcome = await settingsPage.saveAndCaptureOutcome();
        expect(outcome.status, `"${value}" should be refused`).toBe(SCHEDULE_REFUSAL.status);
      }
    });

    await steps.step('The last valid minute of the day is accepted', async () => {
      await settingsPage.setJobCron('payer', VALID_BOUNDARY_CRON);
      await settingsPage.save();
      expect(await settingsPage.getJobCron('payer')).toBe(VALID_BOUNDARY_CRON);
    });

    await steps.step('The original schedule is restored', async () => {
      await restorePayerCron(settingsPage, original);
    });
  });

  test('TC-004: should accept every valid schedule form and refuse the invalid ones', async ({ settingsPage, steps }) => {
    test.slow();
    let original = '';

    await steps.critical('Navigate to System Settings and read the current payer schedule', async () => {
      original = await settingsPage.getJobCron('payer');
      originalPayerCron = original;
      expect(original).not.toBe('');
    });

    await steps.step('Daily, interval and weekly schedules are all accepted', async () => {
      // The sheet's frequency/time/time-zone table, on the field the app
      // actually has: one CRON expression, time basis fixed to UTC.
      for (const form of VALID_CRON_FORMS) {
        await settingsPage.setJobCron('payer', form.cron);
        await settingsPage.save();
        expect(await settingsPage.getJobCron('payer'), `${form.label} should persist`).toBe(form.cron);
      }
    });

    await steps.step('Too few fields and a malformed expression are refused', async () => {
      for (const value of [INVALID_CRONS.tooFewFields, INVALID_CRONS.malformed]) {
        await settingsPage.setJobCron('payer', value);
        const outcome = await settingsPage.saveAndCaptureOutcome();
        expect(outcome.status, `"${value}" should be refused`).toBe(SCHEDULE_REFUSAL.status);
      }
    });

    await steps.step('The original schedule is restored', async () => {
      await settingsPage.cancel();
      await restorePayerCron(settingsPage, original);
    });
  });

  test('TC-008: should state the schedule\'s time basis alongside the site\'s configured time zone', async ({
    settingsPage,
    steps,
  }) => {
    await steps.critical('Navigate to System Settings and read the General card', async () => {
      const text = await settingsPage.getGeneralSectionText();
      expect(text, 'the payer schedule should be labelled with its time basis').toMatch(UTC_BASIS);
    });

    await steps.step('The site time zone is configured and shown next to it', async () => {
      // The sheet asks that "today" be consistent between the job and a user;
      // what the settings can show is that the job runs on a stated basis (UTC)
      // while the site declares its own zone - the two inputs to that rule.
      const zone = await settingsPage.getSiteTimeZone();
      expect(zone, `a site time zone should be configured; it read "${zone}"`).toMatch(TIME_ZONE_PATTERN);
      await settingsPage.cancel();
    });
  });

  test('TC-010: should refuse to save when the schedule is left empty', async ({ settingsPage, steps }) => {
    let original = '';

    await steps.critical('Navigate to System Settings and read the current payer schedule', async () => {
      original = await settingsPage.getJobCron('payer');
      originalPayerCron = original;
      expect(original).not.toBe('');
    });

    await steps.step('An empty schedule is refused and the drawer stays open', async () => {
      await settingsPage.setJobCron('payer', INVALID_CRONS.empty);
      const outcome = await settingsPage.saveAndCaptureOutcome();
      expect(outcome.status, 'an empty required schedule must be refused').toBe(SCHEDULE_REFUSAL.status);
      expect(outcome.drawerOpen).toBe(true);
    });

    await steps.step('The stored schedule is unchanged', async () => {
      await settingsPage.cancel();
      expect(await settingsPage.getJobCron('payer')).toBe(original);
      await settingsPage.closeDrawerIfOpen();
      originalPayerCron = '';
    });
  });

  test('TC-011: should refuse malformed and oversized schedule input', async ({ settingsPage, steps }) => {
    let original = '';

    await steps.critical('Navigate to System Settings and read the current payer schedule', async () => {
      original = await settingsPage.getJobCron('payer');
      originalPayerCron = original;
      expect(original).not.toBe('');
    });

    await steps.step('Malformed and oversized values are both refused', async () => {
      for (const value of [INVALID_CRONS.malformed, INVALID_CRONS.oversized]) {
        await settingsPage.setJobCron('payer', value);
        const outcome = await settingsPage.saveAndCaptureOutcome();
        expect(outcome.status, `"${value.slice(0, 30)}…" should be refused`).toBe(SCHEDULE_REFUSAL.status);
      }
    });

    await steps.step('The stored schedule is unchanged', async () => {
      await settingsPage.cancel();
      expect(await settingsPage.getJobCron('payer')).toBe(original);
      await settingsPage.closeDrawerIfOpen();
      originalPayerCron = '';
    });
  });

  test('TC-012: should keep the payer schedule scoped to the payer module and leave the other schedules untouched', async ({
    settingsPage,
    steps,
  }) => {
    let before!: Record<'network' | 'payer' | 'policy', string>;

    await steps.critical('Navigate to System Settings and read all three lifecycle schedules', async () => {
      before = await settingsPage.getAllJobCrons();
      originalPayerCron = before.payer;
      expect(before.network, 'the network schedule should exist').not.toBe('');
      expect(before.policy, 'the policy schedule should exist').not.toBe('');
    });

    await steps.step('Changing the payer schedule leaves network and policy schedules as they were', async () => {
      await settingsPage.setJobCron('payer', alternativeCron(before.payer));
      await settingsPage.save();
      const after = await settingsPage.getAllJobCrons();
      expect(after.network, 'the network schedule must not change').toBe(before.network);
      expect(after.policy, 'the policy schedule must not change').toBe(before.policy);
      expect(after.payer, 'the payer schedule should have changed').not.toBe(before.payer);
    });

    await steps.step('The original payer schedule is restored', async () => {
      await restorePayerCron(settingsPage, before.payer);
    });
  });

  test('TC-013: should sanitise or refuse script input in the schedule field', async ({ settingsPage, steps }) => {
    let original = '';

    await steps.critical('Navigate to System Settings and read the current payer schedule', async () => {
      original = await settingsPage.getJobCron('payer');
      originalPayerCron = original;
      expect(original).not.toBe('');
    });

    await steps.step('Script input is refused and nothing is stored', async () => {
      await settingsPage.setJobCron('payer', INVALID_CRONS.script);
      const outcome = await settingsPage.saveAndCaptureOutcome();
      expect(outcome.status, 'script input must be refused').toBe(SCHEDULE_REFUSAL.status);
      await settingsPage.cancel();
      expect(await settingsPage.getJobCron('payer')).toBe(original);
      await settingsPage.closeDrawerIfOpen();
      originalPayerCron = '';
    });
  });

  test('TC-015: should record a successful schedule save in the audit log', async ({
    settingsPage,
    auditLogsPage,
    steps,
  }) => {
    test.slow();
    let original = '';

    await steps.critical('Navigate to System Settings and save a changed payer schedule', async () => {
      original = await settingsPage.getJobCron('payer');
      originalPayerCron = original;
      await settingsPage.setJobCron('payer', alternativeCron(original));
      await settingsPage.save();
    });

    await steps.step('The audit log holds a settings entry for it', async () => {
      const entries = await auditLogsPage.findRowsByEntity(SETTINGS_AUDIT_ENTITY);
      expect(
        entries.length,
        'a successful schedule save should leave an audit entry naming the settings entity',
      ).toBeGreaterThan(0);
    });

    await steps.step('The original schedule is restored', async () => {
      await restorePayerCron(settingsPage, original);
    });
  });

  test('TC-009: should let only the System Administrator view and change the lifecycle schedule', async ({
    settingsPage,
    nonAdminSession,
    steps,
  }) => {
    await steps.critical('Navigate to System Settings as the administrator', async () => {
      await settingsPage.open();
      expect(await settingsPage.getJobCron('payer'), 'the administrator should read the payer schedule').not.toBe('');
      await settingsPage.closeDrawerIfOpen();
    });

    await steps.step('The non-administrator is turned away from System Settings', async () => {
      const access = await nonAdminSession.settings.openAndReportAccess();
      expect(access.reachable, `the ${NON_ADMIN_PROFILE.role} must not reach the schedule; it landed on ${access.url}`).toBe(false);
      expect(access.text, 'the refusal should be stated on screen').toMatch(ACCESS_RESTRICTED);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
