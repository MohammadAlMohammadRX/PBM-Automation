import { test, expect } from '../../../fixtures';
import type { InboxNotification } from '../../../utils/notification/notificationApi';
import type { ProvisionedNetwork } from '../../../utils/NetworkProvisioning';
import { networkSnapshot } from '../../../utils/jobDriven/lifecycle';
import { expiredByJob } from '../../../utils/jobDriven/writerN2Helpers';
import {
  awaitReminder,
  bellRowFor,
  blockUnless,
  describeNotification,
  entityVariable,
  fireAndAwait,
  hasPlaceholder,
  inMs,
  inWindowExpiry,
  inactivateNetwork,
  networkGoingLive,
  networkRef,
  notificationsAbout,
  outOfWindowExpiry,
  reminderDays,
  riyadhDayDiff,
  sameDay,
  specNames,
  statusDefinition,
  statusDefinitions,
  valuesOf,
  waitForNotificationAbout,
  waitForStatus,
  type Inactivation,
  type ProbeDefinition,
} from '../../../utils/notification/writerEHelpers';
import type { StatusKind } from '../../../constants/notification/writerEIds';
import {
  BATCH_EFFECTIVE_IN_MS,
  BATCH_SHORT_EXPIRY_IN_MS,
  CASES,
  EFFECTIVE_IN_MS,
  INACTIVATION_DETAILS,
  NO_REMINDER_RUN,
  SPEC_VARIABLES,
  STORY,
} from '../../../data/notification/networkStatusInAppNotifications.data';

/**
 * US 20995 - network status in-app notifications, driven by the suite's own
 * networks and the network job (moved through jobClock, restored after each
 * firing). Each case saves its own ACTIVE suite definition (audience
 * careconnect) BEFORE the transition. See
 * data/notification/networkStatusInAppNotifications.data.ts.
 */
test.describe(STORY, () => {
  test.describe.configure({ timeout: 30 * 60_000 });

  test(`TC-${CASES.activeNotified.azureId}: should notify the audience when the daily status update makes a network Active`, async ({ steps, page, jobClock, suiteDefinitions, ncDefinitions, notificationBell }) => {
    let def!: ProbeDefinition;
    let network!: ProvisionedNetwork;
    let effectiveAt = new Date();

    await steps.critical('Precondition: an approved suite network not yet Active and an active "Active - Network" definition for careconnect', async () => {
      def = await statusDefinition(page, suiteDefinitions, 'network', 'active');
      const live = await networkGoingLive(page, { effectiveAt: inMs(EFFECTIVE_IN_MS) });
      network = live.network;
      effectiveAt = live.effectiveAt;
      expect(await waitForStatus(page, 'network', network.id, 'future', 60_000).then((r) => r.value)).toBe('future');
    });

    await steps.step('Navigate to the Notification Center Management module - the module and the notification feed are shown', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(def.name)).toBe(def.id);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Let the daily status update run - the network becomes Active', async () => {
      const run = await fireAndAwait(page, jobClock, 'network', [network.id], 'active', effectiveAt);
      expect(run.statuses[network.id], `after the network job at ${run.firedAt.toISOString()}`).toBe('active');
    });

    await steps.step('Check the configured audience\'s feed - a new Active network notification appears', async () => {
      const n = await waitForNotificationAbout(page, def, networkRef(network));
      expect(n, `no "${def.name}" notification about "${network.name}" reached careconnect`).not.toBeNull();
      const row = await bellRowFor(notificationBell, def);
      expect(row?.text ?? '', 'the bell lists it').toContain(network.name);
    });
  });

  test(`TC-${CASES.activeValues.azureId}: should name the network and its dates in the Active notification`, async ({ steps, page, jobClock, suiteDefinitions, ncDefinitions, notificationBell }) => {
    let def!: ProbeDefinition;
    let network!: ProvisionedNetwork;
    let n: InboxNotification | null = null;
    let firedAt = new Date();

    await steps.critical('Precondition: an Active network notification has just been generated (own network made Active by the network job)', async () => {
      def = await statusDefinition(page, suiteDefinitions, 'network', 'active');
      const live = await networkGoingLive(page, { effectiveAt: inMs(EFFECTIVE_IN_MS) });
      network = live.network;
      const run = await fireAndAwait(page, jobClock, 'network', [network.id], 'active', live.effectiveAt);
      firedAt = run.firedAt;
      n = await waitForNotificationAbout(page, def, networkRef(network));
      expect(n, `no "${def.name}" notification about "${network.name}" (network reads ${run.statuses[network.id]})`).not.toBeNull();
    });

    await steps.step('Navigate to the Notification Center Management module - the module and the notification feed are shown', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(def.name)).toBe(def.id);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Open the Active network notification - its content is displayed', async () => {
      const row = await bellRowFor(notificationBell, def);
      expect(row, 'the notification is listed in the bell').not.toBeNull();
      expect(row?.text ?? '').toContain(def.marker);
    });

    await steps.step('Review Entity, EffectiveDate, ExpiryDate and TransitionDate - each matches the network', async () => {
      const values = valuesOf(n);
      const record = await networkSnapshot(page, network.id);
      expect(values[entityVariable(def, 'network')], `the entity variable in "${n?.englishMessage}"`).toBe(network.name);
      expect(sameDay(values.EffectiveDate, record.effectiveDate), `EffectiveDate "${values.EffectiveDate}" vs ${record.effectiveDate}`).toBe(true);
      expect(sameDay(values.ExpiryDate, record.expiryDate), `ExpiryDate "${values.ExpiryDate}" vs ${record.expiryDate}`).toBe(true);
      expect(
        sameDay(values.TransitionDate, firedAt),
        `TransitionDate "${values.TransitionDate}" should be the day the network job made the network Active (${firedAt.toISOString()}); the network's ExpiryDate is ${record.expiryDate}`,
      ).toBe(true);
      expect(hasPlaceholder(n?.englishMessage ?? '')).toBe(false);
    });
  });

  test(`TC-${CASES.inactiveNotified.azureId}: should notify the audience with the reason and transition date when an approved network inactivation takes effect`, async ({ steps, page, jobClock, suiteDefinitions, ncDefinitions, notificationBell }) => {
    let def!: ProbeDefinition;
    let network!: ProvisionedNetwork;
    let inactivation!: Inactivation;

    await steps.critical('Precondition: an Active suite network (made Active by the network job) and an active "Inactive - Network" definition', async () => {
      const live = await networkGoingLive(page, { effectiveAt: inMs(EFFECTIVE_IN_MS) });
      network = live.network;
      const run = await fireAndAwait(page, jobClock, 'network', [network.id], 'active', live.effectiveAt);
      expect(run.statuses[network.id]).toBe('active');
      def = await statusDefinition(page, suiteDefinitions, 'network', 'inactive');
    });

    await steps.step('Navigate to the Notification Center Management module - the module and the notification feed are shown', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(def.name)).toBe(def.id);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Let the approved inactivation take effect - the network reads Inactive', async () => {
      inactivation = await inactivateNetwork(page, network, INACTIVATION_DETAILS);
      expect((await waitForStatus(page, 'network', network.id, 'inactive', 60_000)).value).toBe('inactive');
    });

    await steps.step('Check the configured audience\'s feed - a new Inactive network notification appears with the InactivationReason', async () => {
      const n = await waitForNotificationAbout(page, def, networkRef(network), 90_000);
      expect(n, `no "${def.name}" notification about "${network.name}"`).not.toBeNull();
      const values = valuesOf(n);
      expect(values.InactivationReason, `InactivationReason in "${n?.englishMessage}"`).toBe(inactivation.reason);
      const record = await networkSnapshot(page, network.id);
      expect(
        sameDay(values.TransitionDate, inactivation.at),
        `TransitionDate "${values.TransitionDate}" should be the day the approved inactivation took effect (${inactivation.at.toISOString()}); the network's ExpiryDate is ${record.expiryDate}`,
      ).toBe(true);
      expect((await bellRowFor(notificationBell, def))?.text ?? '').toContain(network.name);
    });
  });

  test(`TC-${CASES.noReminderOutsideWindow.azureId}: should not send Expiring Soon for a network one day outside the reminder window`, async ({ steps, page, jobClock, suiteDefinitions, ncDefinitions, notificationBell }) => {
    let def!: ProbeDefinition;
    let outside!: ProvisionedNetwork;
    let control!: ProvisionedNetwork;
    let threshold = 0;
    let effectiveAt = new Date();

    await steps.critical('Precondition: an active "Expiring Soon - Network" definition, a network expiring threshold + 1 day ahead and an in-window control network', async () => {
      threshold = await reminderDays(page);
      def = await statusDefinition(page, suiteDefinitions, 'network', 'expiringSoon');
      effectiveAt = inMs(BATCH_EFFECTIVE_IN_MS);
      outside = (await networkGoingLive(page, { effectiveAt, expiryAt: outOfWindowExpiry(threshold + 1) })).network;
      control = (await networkGoingLive(page, { effectiveAt, expiryAt: inWindowExpiry(threshold) })).network;
      expect(threshold).toBeGreaterThan(0);
    });

    await steps.step('Navigate to the Notification Center Management module - the module and the notification feed are shown', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(def.name)).toBe(def.id);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Let the daily reminder process evaluate the network one day beyond the reminder period - it is outside the window', async () => {
      const run = await fireAndAwait(page, jobClock, 'network', [outside.id, control.id], 'active', effectiveAt);
      expect(run.statuses, 'both networks are Active after the network job').toEqual({ [outside.id]: 'active', [control.id]: 'active' });
      const record = await networkSnapshot(page, outside.id);
      expect(riyadhDayDiff(record.expiryDate, new Date()), `days to the expiry ${record.expiryDate} (reminder before ${threshold})`).toBe(threshold + 1);
      const reminder = await awaitReminder(page, jobClock, 'network', def, networkRef(control));
      blockUnless(steps, reminder.notification !== null, NO_REMINDER_RUN);
    });

    await steps.step('Check the feed - no Expiring Soon notification appears for the network outside the window', async () => {
      const about = await notificationsAbout(page, def, networkRef(outside));
      expect(about.map((n) => n.englishMessage), `Expiring Soon notifications about "${outside.name}"`).toEqual([]);
    });
  });

  test(`TC-${CASES.expiredNotified.azureId}: should notify the audience with ExpiryDate and TransitionDate when the daily status update expires a network`, async ({ steps, page, jobClock, suiteDefinitions, ncDefinitions, notificationBell }) => {
    let def!: ProbeDefinition;
    let expired!: Awaited<ReturnType<typeof expiredByJob>>;

    await steps.critical('Precondition: an active "Expired - Network" definition for careconnect', async () => {
      def = await statusDefinition(page, suiteDefinitions, 'network', 'expired');
      expect(def.variables).toContain('ExpiryDate');
    });

    await steps.step('Navigate to the Notification Center Management module - the module and the notification feed are shown', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(def.name)).toBe(def.id);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Let the daily status update detect the passed expiry - the network becomes Expired', async () => {
      expired = await expiredByJob(page, jobClock);
      expect(expired.reachedActive, `Active after the first firing (reads ${expired.activeAfterF1.status})`).toBe(true);
      expect(expired.reachedExpired, `Expired after the firing past its expiry (reads ${expired.expiredAfterF2.status})`).toBe(true);
    });

    await steps.step('Check the configured audience\'s feed - a new Expired notification appears with ExpiryDate and TransitionDate', async () => {
      const n = await waitForNotificationAbout(page, def, networkRef(expired.network));
      expect(n, `no "${def.name}" notification about "${expired.network.name}"`).not.toBeNull();
      const values = valuesOf(n);
      expect(sameDay(values.ExpiryDate, expired.expiredAfterF2.expiryDate), `ExpiryDate "${values.ExpiryDate}" vs ${expired.expiredAfterF2.expiryDate}`).toBe(true);
      expect(sameDay(values.TransitionDate, expired.f2), `TransitionDate "${values.TransitionDate}"`).toBe(true);
      expect((await bellRowFor(notificationBell, def))?.text ?? '').toContain(expired.network.name);
    });
  });

  test(`TC-${CASES.allFourTypes.azureId}: should deliver all four network status notifications with their specified placeholders`, async ({ steps, page, jobClock, suiteDefinitions, ncDefinitions, notificationBell }) => {
    const kinds: StatusKind[] = ['active', 'inactive', 'expired', 'expiringSoon'];
    let defs!: Record<StatusKind, ProbeDefinition>;
    const got: Partial<Record<StatusKind, InboxNotification | null>> = {};
    const nets: Partial<Record<'expiring' | 'soon' | 'inactive', ProvisionedNetwork>> = {};

    await steps.critical('Precondition: one Active, Inactive, Expired and Expiring Soon notification generated for the suite networks', async () => {
      defs = await statusDefinitions(page, suiteDefinitions, 'network', kinds);
      const threshold = await reminderDays(page);
      const effectiveAt = inMs(BATCH_EFFECTIVE_IN_MS);
      const expiryAt = inMs(BATCH_SHORT_EXPIRY_IN_MS);
      nets.expiring = (await networkGoingLive(page, { effectiveAt, expiryAt })).network;
      nets.soon = (await networkGoingLive(page, { effectiveAt, expiryAt: inWindowExpiry(threshold) })).network;
      nets.inactive = (await networkGoingLive(page, { effectiveAt })).network;
      const ids = [nets.expiring.id, nets.soon.id, nets.inactive.id];
      const f1 = await fireAndAwait(page, jobClock, 'network', ids, 'active', effectiveAt);
      got.active = await waitForNotificationAbout(page, defs.active, networkRef(nets.inactive));
      await inactivateNetwork(page, nets.inactive, INACTIVATION_DETAILS);
      got.inactive = await waitForNotificationAbout(page, defs.inactive, networkRef(nets.inactive), 90_000);
      const f2 = await fireAndAwait(page, jobClock, 'network', [nets.expiring.id], 'expired', expiryAt);
      got.expired = await waitForNotificationAbout(page, defs.expired, networkRef(nets.expiring));
      got.expiringSoon = (await awaitReminder(page, jobClock, 'network', defs.expiringSoon, networkRef(nets.soon), { waitMs: 30_000 })).notification;
      expect(f1.ok, `all three Active after the first firing: ${JSON.stringify(f1.statuses)}`).toBe(true);
      expect(f2.ok, `the short-lived network Expired: ${JSON.stringify(f2.statuses)}`).toBe(true);
    });

    await steps.step('Navigate to the Notification Center Management module - the module and the notification feed are shown', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(defs.active.name)).toBe(defs.active.id);
      await expect(notificationBell.bellButton()).toBeVisible();
    });

    await steps.step('Open each of the four generated notifications - each one is displayed', async () => {
      const missing = kinds.filter((k) => !got[k]);
      expect(missing, 'notification types that never arrived').toEqual([]);
      for (const kind of kinds) expect((await bellRowFor(notificationBell, defs[kind]))?.type, `the bell lists the ${kind} notification`).toBe(defs[kind].name);
    });

    await steps.step('Verify each notification\'s placeholder set against the specification - each matches', async () => {
      for (const kind of kinds) {
        expect(specNames(defs[kind], 'network'), `the ${kind} placeholders`).toEqual([...SPEC_VARIABLES[kind]].sort());
        const message = got[kind]?.englishMessage ?? '';
        expect(hasPlaceholder(message), `${kind}: "${message}" still holds a {{placeholder}}`).toBe(false);
        expect(Object.values(valuesOf(got[kind] ?? null)).filter((v) => v === ''), `${kind}: empty values in "${message}"`).toEqual([]);
      }
      expect(valuesOf(got.active ?? null)[entityVariable(defs.active, 'network')], `the network named by the active notification (${describeNotification(got.active)})`).toBe(nets.inactive?.name);
      expect(valuesOf(got.expired ?? null)[entityVariable(defs.expired, 'network')], `the network named by the expired notification (${describeNotification(got.expired)})`).toBe(nets.expiring?.name);
      expect(valuesOf(got.expiringSoon ?? null)[entityVariable(defs.expiringSoon, 'network')], `the network named by the expiringSoon notification (${describeNotification(got.expiringSoon)})`).toBe(nets.soon?.name);
    });
  });
});
