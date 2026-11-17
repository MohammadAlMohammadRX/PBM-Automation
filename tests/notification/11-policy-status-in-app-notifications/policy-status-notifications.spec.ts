import { test, expect } from '../../../fixtures';
import type { InboxNotification } from '../../../utils/notification/notificationApi';
import type { ProvisionedPolicy } from '../../../utils/PolicyProvisioning';
import { readPolicy } from '../../../utils/PolicyProvisioning';
import type { StatusKind } from '../../../constants/notification/writerEIds';
import {
  awaitReminder,
  bellRowFor,
  describeNotification,
  draftPolicyGoingLive,
  entityVariable,
  fireAndAwait,
  hasPlaceholder,
  inMs,
  inWindowExpiry,
  inactivatePolicyWith,
  notificationsAbout,
  anyNotificationsAbout,
  outOfWindowExpiry,
  policyGoingLive,
  policyRef,
  reminderDays,
  riyadhDayDiff,
  sameDay,
  statusDefinition,
  statusDefinitions,
  statusOf,
  valuesOf,
  waitForNotificationAbout,
  waitForStatus,
  type Inactivation,
  type ProbeDefinition,
} from '../../../utils/notification/writerEHelpers';
import {
  BATCH_EFFECTIVE_IN_MS,
  CASES,
  EFFECTIVE_IN_MS,
  INACTIVATION_DETAILS,
  LIFECYCLE_EXPIRY_IN_MS,
  LONG_EXPIRY_DAYS,
  REASON_LIKE,
  SHORT_EXPIRY_IN_MS,
  STORY,
  WATCH_MS,
} from '../../../data/notification/policyStatusInAppNotifications.data';

const longExpiry = (): Date => inMs(LONG_EXPIRY_DAYS * 86_400_000);

/**
 * US 20994 - policy status in-app notifications, driven by the suite's own
 * policies (`policyIn`, grace 0) and the policy job (jobClock, restored after
 * each firing). Each case saves its own ACTIVE suite definitions (audience
 * careconnect) before the transitions. See
 * data/notification/policyStatusInAppNotifications.data.ts.
 */
test.describe(STORY, () => {
  test.describe.configure({ timeout: 30 * 60_000 });

  test(`TC-${CASES.policyNumberInAll.azureId}: should show the policy's number in every policy status notification`, async ({ steps, page, jobClock, suiteDefinitions, policyIn, ncDefinitions, notificationBell }) => {
    const kinds: StatusKind[] = ['active', 'inactive', 'expired', 'expiringSoon'];
    let defs!: Record<StatusKind, ProbeDefinition>;
    let expiring!: ProvisionedPolicy;
    let soon!: ProvisionedPolicy;
    let toInactivate!: ProvisionedPolicy;
    const got: Partial<Record<StatusKind, InboxNotification | null>> = {};
    let effectiveAt = new Date();
    let expiryAt = new Date();

    await steps.critical('Precondition: active definitions for the four policy actions (with the policy-number placeholder) and three approved suite policies', async () => {
      defs = await statusDefinitions(page, suiteDefinitions, 'policy', kinds);
      const threshold = await reminderDays(page);
      effectiveAt = inMs(BATCH_EFFECTIVE_IN_MS);
      expiryAt = inMs(SHORT_EXPIRY_IN_MS);
      expiring = (await policyGoingLive(policyIn, { effectiveAt, expiryAt })).policy;
      soon = (await policyGoingLive(policyIn, { effectiveAt, expiryAt: inWindowExpiry(threshold) })).policy;
      toInactivate = (await policyGoingLive(policyIn, { effectiveAt, expiryAt: longExpiry() })).policy;
      expect(kinds.map((k) => entityVariable(defs[k], 'policy')).filter((v) => !v), 'every action has an entity placeholder').toEqual([]);
    });

    await steps.step('Navigate to the Notification Center Management module - the notification definitions load', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(defs.active.name)).toBe(defs.active.id);
    });

    await steps.step('Trigger the Active, Inactive, Expired and Expiring Soon policy notifications in turn - one is generated each time', async () => {
      const f1 = await fireAndAwait(page, jobClock, 'policy', [expiring.id, soon.id, toInactivate.id], 'active', effectiveAt);
      got.active = await waitForNotificationAbout(page, defs.active, policyRef(toInactivate));
      await inactivatePolicyWith(page, toInactivate, REASON_LIKE, INACTIVATION_DETAILS);
      got.inactive = await waitForNotificationAbout(page, defs.inactive, policyRef(toInactivate), 90_000);
      const f2 = await fireAndAwait(page, jobClock, 'policy', [expiring.id], 'expired', expiryAt);
      got.expired = await waitForNotificationAbout(page, defs.expired, policyRef(expiring));
      got.expiringSoon = (await awaitReminder(page, jobClock, 'policy', defs.expiringSoon, policyRef(soon), { waitMs: 30_000 })).notification;
      expect(f1.ok, `Active after the first firing: ${JSON.stringify(f1.statuses)}`).toBe(true);
      expect(f2.ok, `Expired after the firing past the expiry: ${JSON.stringify(f2.statuses)}`).toBe(true);
      expect(kinds.filter((k) => !got[k]), 'policy notification types that never arrived').toEqual([]);
    });

    await steps.step('Open each generated notification - the policy-number placeholder shows the right policy number', async () => {
      const expected: Record<StatusKind, string> = {
        active: toInactivate.policyNumber,
        inactive: toInactivate.policyNumber,
        expired: expiring.policyNumber,
        expiringSoon: soon.policyNumber,
      };
      for (const kind of kinds) {
        expect(valuesOf(got[kind] ?? null)[entityVariable(defs[kind], 'policy')], `${kind}: ${describeNotification(got[kind])}`).toBe(expected[kind]);
        expect((await bellRowFor(notificationBell, defs[kind]))?.text ?? '', `${kind} in the bell`).toContain(expected[kind]);
      }
    });
  });

  test(`TC-${CASES.reminderBoundary.azureId}: should send Expiring Soon on the first day inside the reminder window and not one day earlier`, async ({ steps, page, jobClock, suiteDefinitions, policyIn, ncDefinitions }) => {
    let def!: ProbeDefinition;
    let outside!: ProvisionedPolicy;
    let inside!: ProvisionedPolicy;
    let threshold = 0;
    let effectiveAt = new Date();
    let reminder: InboxNotification | null = null;

    await steps.critical('Precondition: an active "Expiring Soon - Policy" definition and two approved suite policies around the reminder boundary', async () => {
      threshold = await reminderDays(page);
      def = await statusDefinition(page, suiteDefinitions, 'policy', 'expiringSoon');
      effectiveAt = inMs(BATCH_EFFECTIVE_IN_MS);
      outside = (await policyGoingLive(policyIn, { effectiveAt, expiryAt: outOfWindowExpiry(threshold + 1) })).policy;
      inside = (await policyGoingLive(policyIn, { effectiveAt, expiryAt: inWindowExpiry(threshold) })).policy;
      expect(riyadhDayDiff(outside.expiryDate, new Date()), 'the outside policy is one day beyond the window').toBe(threshold + 1);
    });

    await steps.step('Navigate to the Notification Center Management module - the notification definitions load', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(def.name)).toBe(def.id);
    });

    await steps.step('Run the daily reminder process with the expiry one day outside the reminder period - no Expiring Soon notification is sent', async () => {
      const f1 = await fireAndAwait(page, jobClock, 'policy', [outside.id, inside.id], 'active', effectiveAt);
      expect(f1.ok, `both policies Active: ${JSON.stringify(f1.statuses)}`).toBe(true);
      reminder = (await awaitReminder(page, jobClock, 'policy', def, policyRef(inside))).notification;
      const about = await notificationsAbout(page, def, policyRef(outside));
      expect(about.map((n) => n.englishMessage), `Expiring Soon about ${outside.policyNumber} (${threshold + 1} days left)`).toEqual([]);
    });

    await steps.step('Run the reminder process for the policy on the first day inside the period - the Expiring Soon notification is sent', async () => {
      expect(reminder, `no "${def.name}" notification about ${inside.policyNumber} (${threshold} days left)`).not.toBeNull();
      expect(valuesOf(reminder)[entityVariable(def, 'policy')]).toBe(inside.policyNumber);
    });
  });

  test(`TC-${CASES.fullLifecycle.azureId}: should send the right notification at each step of a policy's lifecycle`, async ({ steps, page, jobClock, suiteDefinitions, policyIn, ncDefinitions }) => {
    const kinds: StatusKind[] = ['active', 'inactive', 'expired', 'expiringSoon'];
    let defs!: Record<StatusKind, ProbeDefinition>;
    let lifecycle!: ProvisionedPolicy;
    let other!: ProvisionedPolicy;
    let effectiveAt = new Date();
    let expiryAt = new Date();

    await steps.critical('Precondition: active definitions for the four policy actions and two approved suite policies', async () => {
      defs = await statusDefinitions(page, suiteDefinitions, 'policy', kinds);
      effectiveAt = inMs(BATCH_EFFECTIVE_IN_MS);
      expiryAt = inMs(LIFECYCLE_EXPIRY_IN_MS);
      lifecycle = (await policyGoingLive(policyIn, { effectiveAt, expiryAt })).policy;
      other = (await policyGoingLive(policyIn, { effectiveAt, expiryAt: longExpiry() })).policy;
      expect(await statusOf(page, 'policy', lifecycle.id)).toBe('future');
    });

    await steps.step('Navigate to the Notification Center Management module - the notification definitions load', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(defs.active.name)).toBe(defs.active.id);
    });

    await steps.step('Let the policy become Active through the daily status update - an Active notification is sent', async () => {
      const f1 = await fireAndAwait(page, jobClock, 'policy', [lifecycle.id, other.id], 'active', effectiveAt);
      expect(f1.ok, `Active after the firing: ${JSON.stringify(f1.statuses)}`).toBe(true);
      expect(await waitForNotificationAbout(page, defs.active, policyRef(lifecycle)), `"${defs.active.name}" about ${lifecycle.policyNumber}`).not.toBeNull();
    });

    await steps.step('Advance the policy into its reminder window and run the reminder process - an Expiring Soon notification is sent', async () => {
      const reminder = await awaitReminder(page, jobClock, 'policy', defs.expiringSoon, policyRef(lifecycle), { waitMs: 45_000 });
      expect(
        reminder.notification,
        `No "${defs.expiringSoon.name}" notification about ${lifecycle.policyNumber} (Active, expiring ${expiryAt.toISOString()}) after the activation run and the policy-job firing(s) at ${reminder.extraFirings.map((d) => d.toISOString()).join(', ')}`,
      ).not.toBeNull();
      expect(await statusOf(page, 'policy', lifecycle.id), 'still Active before its expiry').toBe('active');
    });

    await steps.step('Let the policy pass its expiry and grace period and run the status update - an Expired notification is sent', async () => {
      const f2 = await fireAndAwait(page, jobClock, 'policy', [lifecycle.id], 'expired', expiryAt);
      expect(f2.ok, `Expired after the firing: ${JSON.stringify(f2.statuses)}`).toBe(true);
      expect(await waitForNotificationAbout(page, defs.expired, policyRef(lifecycle)), `"${defs.expired.name}" about ${lifecycle.policyNumber}`).not.toBeNull();
    });

    await steps.step('On a separate policy, approve an inactivation and let it take effect - an Inactive notification is sent', async () => {
      await inactivatePolicyWith(page, other, REASON_LIKE, INACTIVATION_DETAILS);
      expect((await waitForStatus(page, 'policy', other.id, 'inactive', 60_000)).value).toBe('inactive');
      expect(await waitForNotificationAbout(page, defs.inactive, policyRef(other), 90_000), `"${defs.inactive.name}" about ${other.policyNumber}`).not.toBeNull();
    });
  });

  test(`TC-${CASES.draftNotNotified.azureId}: should send no status notification for a policy outside the four monitored statuses`, async ({ steps, page, jobClock, suiteDefinitions, policyIn, ncDefinitions }) => {
    const kinds: StatusKind[] = ['active', 'inactive', 'expired', 'expiringSoon'];
    let defs!: Record<StatusKind, ProbeDefinition>;
    let draft!: ProvisionedPolicy;
    let effectiveAt = new Date();

    await steps.critical('Precondition: active definitions for the four policy actions', async () => {
      defs = await statusDefinitions(page, suiteDefinitions, 'policy', kinds);
      expect(Object.keys(defs)).toHaveLength(4);
    });

    await steps.step('Navigate to the Notification Center Management module - the notification definitions load', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(defs.active.name)).toBe(defs.active.id);
    });

    await steps.step('Set the policy to a status outside the four (Draft) - the status is saved', async () => {
      const threshold = await reminderDays(page);
      effectiveAt = inMs(EFFECTIVE_IN_MS);
      draft = await draftPolicyGoingLive(policyIn, { effectiveAt, expiryAt: inWindowExpiry(threshold) });
      expect(await statusOf(page, 'policy', draft.id)).toBe('draft');
    });

    await steps.step('Run the daily status update and reminder processes - they complete', async () => {
      const run = await fireAndAwait(page, jobClock, 'policy', [draft.id], 'draft', effectiveAt);
      expect(run.statuses[draft.id], `the Draft policy after the job at ${run.firedAt.toISOString()}`).toBe('draft');
    });

    await steps.step('Check for a delivered notification - none is generated for the Draft policy', async () => {
      const seen = await anyNotificationsAbout(page, kinds.map((k) => defs[k]), policyRef(draft), WATCH_MS);
      expect(seen, `notifications about the Draft policy ${draft.policyNumber}`).toEqual([]);
    });
  });

  test(`TC-${CASES.expiringSoonDetails.azureId}: should show the policy number, days remaining, expiry date and effective date in Expiring Soon`, async ({ steps, page, jobClock, suiteDefinitions, policyIn, ncDefinitions, notificationBell }) => {
    let def!: ProbeDefinition;
    let policy!: ProvisionedPolicy;
    let effectiveAt = new Date();
    let n: InboxNotification | null = null;
    let threshold = 0;

    await steps.critical('Precondition: an active "Expiring Soon - Policy" definition with all four placeholders and an approved suite policy inside the reminder period', async () => {
      def = await statusDefinition(page, suiteDefinitions, 'policy', 'expiringSoon');
      threshold = await reminderDays(page);
      const live = await policyGoingLive(policyIn, { effectiveAt: inMs(EFFECTIVE_IN_MS), expiryAt: inWindowExpiry(threshold) });
      policy = live.policy;
      effectiveAt = live.effectiveAt;
      expect(def.variables).toEqual(expect.arrayContaining(['DaysRemaining', 'ExpiryDate', 'EffectiveDate']));
    });

    await steps.step('Navigate to the Notification Center Management module - the notification definitions load', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(def.name)).toBe(def.id);
    });

    await steps.step('Trigger the expiring-soon reminder process - a notification is generated for the audience', async () => {
      const f1 = await fireAndAwait(page, jobClock, 'policy', [policy.id], 'active', effectiveAt);
      expect(f1.ok, `Active after the firing: ${JSON.stringify(f1.statuses)}`).toBe(true);
      const reminder = await awaitReminder(page, jobClock, 'policy', def, policyRef(policy));
      n = reminder.notification;
      expect(
        n,
        `No "${def.name}" notification about ${policy.policyNumber} (Active, expiring ${policy.expiryDate}, reminder before ${threshold} days) after the activation run and the policy-job firing(s) at ${reminder.extraFirings.map((d) => d.toISOString()).join(', ')}`,
      ).not.toBeNull();
    });

    await steps.step('Open the notification - policy number, days remaining and expiry date are populated, and the effective date', async () => {
      expect((await bellRowFor(notificationBell, def))?.text ?? '').toContain(policy.policyNumber);
      const values = valuesOf(n);
      const record = await readPolicy(page, policy.id);
      expect(values[entityVariable(def, 'policy')]).toBe(policy.policyNumber);
      expect(values.DaysRemaining, `DaysRemaining in "${n?.englishMessage}"`).toBe(String(riyadhDayDiff(record.expiryDate, new Date())));
      expect(sameDay(values.ExpiryDate, record.expiryDate), `ExpiryDate "${values.ExpiryDate}" vs ${record.expiryDate}`).toBe(true);
      expect(sameDay(values.EffectiveDate, record.effectiveDate), `EffectiveDate "${values.EffectiveDate}" vs ${record.effectiveDate}`).toBe(true);
    });
  });

  test(`TC-${CASES.inactiveReason.azureId}: should show the approved inactivation reason and transition date in the Inactive policy notification`, async ({ steps, page, jobClock, suiteDefinitions, policyIn, ncDefinitions, notificationBell }) => {
    let def!: ProbeDefinition;
    let policy!: ProvisionedPolicy;
    let inactivation!: Inactivation;

    await steps.critical('Precondition: an Active suite policy (made Active by the policy job) and an active "Inactive - Policy" definition', async () => {
      const live = await policyGoingLive(policyIn, { effectiveAt: inMs(EFFECTIVE_IN_MS), expiryAt: longExpiry() });
      policy = live.policy;
      const f1 = await fireAndAwait(page, jobClock, 'policy', [policy.id], 'active', live.effectiveAt);
      expect(f1.ok, `Active after the firing: ${JSON.stringify(f1.statuses)}`).toBe(true);
      def = await statusDefinition(page, suiteDefinitions, 'policy', 'inactive');
    });

    await steps.step('Navigate to the Notification Center Management module - the notification definitions load', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(def.name)).toBe(def.id);
    });

    await steps.step('Approve an inactivation with a specific reason - the inactivation takes effect', async () => {
      inactivation = await inactivatePolicyWith(page, policy, REASON_LIKE, INACTIVATION_DETAILS);
      expect((await waitForStatus(page, 'policy', policy.id, 'inactive', 60_000)).value).toBe('inactive');
      expect(inactivation.reason, 'a policy inactivation reason was used').not.toBe('');
    });

    await steps.step('Explore the notification and related screens - the reason and transition date match the approved inactivation, nothing stale', async () => {
      const n = await waitForNotificationAbout(page, def, policyRef(policy), 90_000);
      expect(n, `"${def.name}" about ${policy.policyNumber}`).not.toBeNull();
      const values = valuesOf(n);
      expect(values.InactivationReason, `InactivationReason in "${n?.englishMessage}"`).toBe(inactivation.reason);
      expect(
        sameDay(values.TransitionDate, inactivation.at),
        `TransitionDate "${values.TransitionDate}" should be the day the approved inactivation took effect (${inactivation.at.toISOString()}); the policy's ExpiryDate is ${policy.expiryDate}`,
      ).toBe(true);
      expect(values[entityVariable(def, 'policy')]).toBe(policy.policyNumber);
      expect(hasPlaceholder(n?.englishMessage ?? '') || hasPlaceholder(n?.arabicMessage ?? ''), 'no unresolved placeholder in either language').toBe(false);
      expect((await bellRowFor(notificationBell, def))?.text ?? '').toContain(inactivation.reason);
    });
  });
});
