import { test, expect } from '../../../fixtures';
import { FIRING_TIMEOUT_MS, JOB_LOG_FIELDS, SKIP_RUN_CASES as CASES } from '../../../data/networks/jobSchedule.data';
import { networkAuditTrail, networkSnapshot } from '../../../utils/jobDriven/lifecycle';
import { readNetwork } from '../../../utils/NetworkProvisioning';
import { findJobRunLog, sharedSkipRun, type SkipRun } from '../../../utils/jobDriven/writerN2Helpers';

/**
 * User story 14310: Make the daily network status job configurable and
 * date-aware - what one run does with networks it must SKIP.
 *
 * The three cases share ONE firing of the network job (utils/jobDriven/
 * writerN2Helpers.ts sharedSkipRun): the first case to run builds the case's
 * own networks - two approved and due (eligible), one submitted but never
 * approved (activation precondition unmet), one draft, one without an
 * effective date when the application accepts that - moves the job a couple of
 * minutes ahead, waits for the eligible ones, and restores the job; the others
 * reuse its before / after snapshots. "The job ran to completion" is proved by
 * the eligible networks of the SAME run going Active.
 *
 * The job-execution log the sheets read does not exist for the lifecycle jobs
 * (Foundation-Notes) - those steps fail as findings.
 */
const jobRunWasClean = (run: SkipRun): boolean => run.eligible.every((n) => run.after[n.id]?.status === 'Active');

test.describe('US 14310 - The daily network job skips networks it cannot transition', () => {
  test(`TC-${CASES.unmetPrecondition.azureId}: should leave a due network unchanged and log it as skipped when its activation precondition is unmet`, async ({
    page,
    networkManagementPage,
    jobClock,
    steps,
  }) => {
    test.setTimeout(FIRING_TIMEOUT_MS);
    let run!: SkipRun;

    await steps.critical('Navigate to the Network Management module - the network list loads', async () => {
      await networkManagementPage.openList();
      run = await sharedSkipRun(page, jobClock);
      expect(run.unapproved.id).toBeTruthy();
    });

    await steps.step('The due network shows Pending (Future) with its approval precondition incomplete', async () => {
      const before = run.before[run.unapproved.id];
      expect(before?.status, 'displayed status before the run').toBe('Future');
      expect(Date.parse(String(before?.effectiveDate)), 'its effective date has arrived by the run').toBeLessThan(run.move.firesAt.getTime());
      expect(`${before?.versionStatusCode} ${before?.hasPendingVersion}`, 'it is still awaiting approval').toMatch(/pending|true/i);
    });

    await steps.step('The daily job runs to completion with no error raised', async () => {
      expect(jobRunWasClean(run), `the same run made the eligible networks Active: ${run.eligible.map((n) => run.after[n.id]?.status).join(', ')}`).toBe(true);
      expect(run.restored, 'the job is back at its original schedule').toBe(true);
    });

    await steps.step('Reopened, the network is unchanged and the job log records it as skipped', async () => {
      const now = await networkSnapshot(page, run.unapproved.id);
      expect(now.status, 'status unchanged (Pending / Future)').toBe('Future');
      expect(now.isActive, 'the run neither activated nor inactivated it').toBe(run.before[run.unapproved.id]?.isActive);
      const trail = await networkAuditTrail(page, run.unapproved.id);
      const skipped = trail.find((e) => /skip/i.test(JSON.stringify(e)));
      expect(skipped, 'a job log entry recording the network as skipped for its unmet precondition').toBeTruthy();
    });
  });

  test(`TC-${CASES.missingEffective.azureId}: should skip a network with no effective date and log the reason when the job runs`, async ({
    page,
    networkManagementPage,
    jobClock,
    steps,
  }) => {
    test.setTimeout(FIRING_TIMEOUT_MS);
    let run!: SkipRun;

    await steps.critical('Navigate to the Network Management module - the network list loads', async () => {
      await networkManagementPage.openList();
      run = await sharedSkipRun(page, jobClock);
      expect(run.missingEffective.answer.status).toBeGreaterThan(0);
    });

    if (run && !run.missingEffective.id) {
      steps.blocked(
        'Needs a Pending network with NO effective date. The application refuses one: CreateNetwork with effectiveDate null '
          + `answered ${run.missingEffective.answer.status} ${run.missingEffective.answer.text.slice(0, 200)} - `
          + 'the precondition cannot exist in this build (like the required expiry date, Foundation-Notes).',
      );
    }
    const id = run?.missingEffective.id ?? '';

    await steps.step('The network shows Pending with a blank effective date', async () => {
      expect(run.before[id]?.status).toBe('Future');
      expect(String(run.before[id]?.effectiveDate ?? '')).toBe('');
    });

    await steps.step('The job runs to completion without throwing an error', async () => {
      expect(jobRunWasClean(run), 'the same run completed the eligible networks').toBe(true);
    });

    await steps.step('The job log shows the network skipped with its reason and its status unchanged', async () => {
      expect(run.after[id]?.status, 'status unchanged').toBe('Future');
      const trail = await networkAuditTrail(page, id).catch(() => []);
      expect(trail.find((e) => /skip|missing|effective/i.test(JSON.stringify(e))), 'a job log entry naming the missing effective date').toBeTruthy();
    });
  });

  test(`TC-${CASES.runLog.azureId}: should record start, end, processed, skipped and error counts when the job runs over a mix of networks`, async ({
    page,
    networkManagementPage,
    jobClock,
    steps,
  }) => {
    test.setTimeout(FIRING_TIMEOUT_MS);
    let run!: SkipRun;

    await steps.critical('Navigate to the Network Management module - the network list loads', async () => {
      await networkManagementPage.openList();
      run = await sharedSkipRun(page, jobClock);
      expect(run.eligible.length).toBeGreaterThan(0);
    });

    await steps.step('Before the run the mix shows eligible and precondition-unmet networks as Pending', async () => {
      for (const n of [...run.eligible, run.unapproved]) expect(run.before[n.id]?.status, `${n.name} before the run`).toBe('Future');
      const draft = run.before[run.draft.id];
      expect(draft === null || draft.status === 'Future', 'the draft is not live').toBe(true);
    });

    await steps.step('The daily status job executes and completes', async () => {
      expect(jobRunWasClean(run), `eligible after the run: ${run.eligible.map((n) => run.after[n.id]?.status).join(', ')}`).toBe(true);
      expect(run.after[run.unapproved.id]?.status, 'the unapproved network is skipped').toBe('Future');
      expect((await readNetwork(page, run.unapproved.id)).isActive, 'the run neither activated nor inactivated it').toBe(run.before[run.unapproved.id]?.isActive);
    });

    await steps.step('The job execution log shows start, end, processed, skipped with reasons and error count', async () => {
      const log = await findJobRunLog(page, run.move.firesAt);
      expect(log, `a job-execution log entry for the run at ${run.move.firesAt.toISOString()}`).not.toBeNull();
      const text = JSON.stringify(log ?? {}).toLowerCase();
      for (const field of JOB_LOG_FIELDS) expect(text, `the log carries "${field}"`).toContain(field);
    });
  });
});
