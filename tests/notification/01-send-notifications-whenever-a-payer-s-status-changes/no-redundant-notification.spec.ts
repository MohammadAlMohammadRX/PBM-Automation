import { test, expect } from '../../../fixtures';
import {
  anyNotificationsAbout,
  blockUnless,
  fireJob,
  payerState,
  payerStatusEntriesSince,
  restoreJob,
  statusDefinition,
  type PayerState,
  type ProbeDefinition,
} from '../../../utils/notification/writerEHelpers';
import { ACTIVE_LABEL, CASES, JOB_SETTLE_MS, NOT_ACTIVE, STEADY_PAYER, STORY, WATCH_MS } from '../../../data/notification/payerStatusNotifications.data';

/**
 * US 12939 - no notification when a payer's status does not change: an Active
 * payer (read only) goes through one more payer-job run while an ACTIVE suite
 * "Active - Payer" definition exists. See
 * data/notification/payerStatusNotifications.data.ts.
 */
test.describe(STORY, () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noRedundantNotification.azureId}: should raise no notification when the daily status update leaves an Active payer Active`, async ({ steps, page, jobClock, suiteDefinitions, ncDefinitions, notificationBell }) => {
    let payer!: PayerState;
    let def!: ProbeDefinition;
    let since = new Date();

    await steps.critical('Precondition: an Active payer and an active "Active - Payer" definition for careconnect', async () => {
      payer = await payerState(page, STEADY_PAYER);
      blockUnless(steps, payer.status === ACTIVE_LABEL, NOT_ACTIVE(payer.status));
      def = await statusDefinition(page, suiteDefinitions, 'payer', 'active');
      expect(payer.status).toBe(ACTIVE_LABEL);
    });

    await steps.step('Navigate to the Notification Center Management module - the module loads', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(def.name)).toBe(def.id);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Run the daily status update on the payer that stays Active - no new status transition is recorded', async () => {
      since = new Date();
      const move = await fireJob(page, jobClock, 'payer', new Date(), JOB_SETTLE_MS);
      await restoreJob(jobClock, 'payer');
      const after = await payerState(page, STEADY_PAYER);
      expect(after.status, `"${STEADY_PAYER}" after the payer job at ${move.firesAt.toISOString()}`).toBe(ACTIVE_LABEL);
      const entries = await payerStatusEntriesSince(page, payer.id, since);
      expect(entries.map((e) => JSON.stringify(e).slice(0, 200)), 'status entries written by the run').toEqual([]);
    });

    await steps.step('Check the notifications of a user who gets the payer\'s notifications - no duplicate Active - Payer notification', async () => {
      const seen = await anyNotificationsAbout(page, [def], { id: payer.id, names: [payer.name] }, WATCH_MS);
      expect(seen, `"${def.name}" notifications about "${payer.name}"`).toEqual([]);
    });
  });
});
