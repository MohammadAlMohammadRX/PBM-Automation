import type { TestInfo } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { riyadhDate } from '../../../utils/JobClock';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { findJobSeeds, requireJobSeed, SEED_COMMAND, type ClaimedJobSeed } from '../../../utils/jobDriven/jobSeeds';
import { inboxSince, listDefinitions } from '../../../utils/jobDriven/notifications';
import {
  entriesSince,
  entryTime,
  entryText,
  laterRunOver,
  notExercised,
  riyadhDisplayDate,
  seedTrail,
  statusEntries,
} from '../../../utils/jobDriven/writerN1Helpers';
import {
  EXPIRED_CANNOT_REACTIVATE,
  PURPOSE,
  READ_SEED_BUDGET,
  SHOWN,
  SYSTEM_ACTOR,
} from '../../../data/networks/jobDrivenNetwork.data';
import {
  BEFORE_EXPIRY,
  BLOCKED_CASES,
  CASES,
  EXPIRED_NETWORK_ACTION,
  EXPIRE_ACTION,
  LARGE_BATCH,
  NETWORK_MODULE_ACTION,
} from '../../../data/networks/autoExpireAfterExpiry.data';

/**
 * User story 14130: Automatically expire network after expiry date.
 *
 * Seed-then-check: the cases claim today's network job seeds
 * (`npm run seed:network-jobs`) and assert what the job's firings did; no seed
 * today -> BLOCKED. Rows the application cannot hold are annotated
 * `not-exercised` (see autoExpireAfterExpiry.data.ts).
 */

/** The "already Expired before the run" row: only when a second seed run re-ran the job over the seed. */
async function expectAlreadyExpiredUntouched(
  page: import('@playwright/test').Page,
  seed: ClaimedJobSeed,
  testInfo: TestInfo,
): Promise<void> {
  if (!laterRunOver(seed)) {
    notExercised(testInfo, `"already Expired" row: no second seed run re-ran the job over "${seed.name}" today (run \`${SEED_COMMAND.network}\` twice).`);
    expect(seed.now?.status, seedTrail(seed)).toBe(SHOWN.expired);
    return;
  }
  expect(seed.now?.status, `re-run over an Expired network - ${seedTrail(seed)}`).toBe(SHOWN.expired);
  const expiries = await statusEntries(page, seed.id, SHOWN.expired);
  expect(expiries.length, `one expiry transition for "${seed.name}": ${JSON.stringify(expiries).slice(0, 400)}`).toBe(1);
}

test.describe('US 14130 - Automatic expiry by the daily job', () => {
  test(`TC-${CASES.activeExpires.azureId}: should move an Active network to Expired when the job runs after its expiry date`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.expire);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('Before the run the network read Active with an expiry date that had passed', async () => {
      expect(seed.afterF1?.status, seedTrail(seed)).toBe(SHOWN.active);
      expect(Date.parse(seed.now!.expiryDate) < Date.parse(seed.firings!.f2), 'the expiry passed before the run').toBe(true);
      await networkDetailPage.open(seed.id);
      expect(await networkDetailPage.readOverviewField('expiryDate')).toContain(riyadhDisplayDate(seed.now!.expiryDate));
    });

    await steps.step('The job run evaluated the network - its expiry is recorded', async () => {
      const expiries = entriesSince(await statusEntries(page, seed.id, SHOWN.expired), seed.firings?.f2);
      expect(expiries.length, 'the run left an expiry entry for the network').toBeGreaterThan(0);
    });

    await steps.step('The reloaded detail page reads Expired', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });
  });

  test(`TC-${CASES.tomorrowStaysActive.azureId}: should keep a network Active when the job runs the day before its expiry date`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.expiryTomorrow);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The Active network shows an expiry date in the future', async () => {
      expect(riyadhDate(seed.now!.expiryDate) > seed.madeOn, 'the expiry is after the day of the run').toBe(true);
      await networkDetailPage.open(seed.id);
      expect(await networkDetailPage.readOverviewField('expiryDate')).toContain(riyadhDisplayDate(seed.now!.expiryDate));
    });

    await steps.step('The job ran and did not expire it', async () => {
      expect(seed.firings, 'the job ran today').not.toBeNull();
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.active);
    });

    await steps.step('The reloaded detail page still reads Active', async () => {
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.active);
    });
  });

  test(`TC-${CASES.partitions.azureId}: should expire only Active networks past their expiry and leave every other status partition unchanged`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const activePast = await requireJobSeed(page, testInfo, PURPOSE.expire);
    const activeFuture = await requireJobSeed(page, testInfo, PURPOSE.expiryTomorrow);
    notExercised(testInfo, 'NET-D1 (Draft, expiry passed): no network seed is a draft whose dates passed.');
    notExercised(testInfo, 'NET-S1 (Suspended): the application has no Suspended network status (Inactive is US 14308).');

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(activePast.name), `"${activePast.name}" should be listed`).toBe(true);
    });

    await steps.step('Each network showed its starting status before the run', async () => {
      expect(activePast.afterF1?.status, seedTrail(activePast)).toBe(SHOWN.active);
      expect(activeFuture.afterF1?.status, seedTrail(activeFuture)).toBe(SHOWN.active);
    });

    await steps.step('The job processed every network', async () => {
      for (const seed of [activePast, activeFuture]) expect(seed.after, `"${seed.name}" was read after the run`).not.toBeNull();
    });

    await steps.step('NET-A1 reads Expired; NET-A2 and the already Expired network are unchanged', async () => {
      expect(activePast.after?.status, seedTrail(activePast)).toBe(SHOWN.expired);
      expect(activeFuture.after?.status, seedTrail(activeFuture)).toBe(SHOWN.active);
      await networkDetailPage.open(activePast.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
      await networkDetailPage.open(activeFuture.id);
      await networkDetailPage.expectStatus(SHOWN.active);
      await expectAlreadyExpiredUntouched(page, activePast, testInfo);
    });
  });

  test(`TC-${CASES.expiryToday.azureId}: should expire an Active network on the day its expiry date equals the processing date`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.expire);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The Active network\'s expiry date equals the day of the run', async () => {
      expect(riyadhDate(seed.now!.expiryDate)).toBe(seed.madeOn);
      expect(seed.afterF1?.status, seedTrail(seed)).toBe(SHOWN.active);
    });

    await steps.step('The job evaluated it against today\'s date', async () => {
      expect(seed.after, 'the network was read after the run').not.toBeNull();
      expect(entriesSince(await statusEntries(page, seed.id, SHOWN.expired), seed.firings?.f2).length).toBeGreaterThan(0);
    });

    await steps.step('The reloaded detail page reads Expired', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });
  });

  test(`TC-${CASES.noManualReactivation.azureId}: should refuse a manual reactivation of an Expired network with a clear message`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.expiredExtend, { exclusive: true });

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The Expired network opens read-only for status changes', async () => {
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
      expect(await networkDetailPage.getActionAvailability('activate'), 'Activate on an Expired network').not.toBe('available');
    });

    await steps.step('Setting it back to Active is refused with a message that expired networks cannot be reactivated', async () => {
      const answer = await NetworkUtils.postAsSession(page, ApiEndpoints.networkSetActive, { id: seed.id });
      expect(answer.status, `SetNetworkActive on an Expired network: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'the refusal should say why').toMatch(EXPIRED_CANNOT_REACTIVATE);
    });

    await steps.step('The reloaded detail page still reads Expired', async () => {
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });
  });

  test(`TC-${CASES.decisionTable.azureId}: should apply the expiry rule table to every status and expiry-date combination`, async ({
    page,
    networkManagementPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const rule1 = await requireJobSeed(page, testInfo, PURPOSE.expire);
    const rule2 = await requireJobSeed(page, testInfo, PURPOSE.expiryTomorrow);
    notExercised(testInfo, 'Rule 4 (Draft + past): no network seed is a draft whose dates passed.');
    notExercised(testInfo, 'Rule 5 (Suspended + past): the application has no Suspended network status.');

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(rule1.name), `"${rule1.name}" should be listed`).toBe(true);
    });

    await steps.step('Each rule row\'s starting status and expiry date are as set up', async () => {
      expect(rule1.afterF1?.status, seedTrail(rule1)).toBe(SHOWN.active);
      expect(Date.parse(rule1.now!.expiryDate) < Date.parse(rule1.firings!.f2), 'rule 1: expiry passed before the run').toBe(true);
      expect(rule2.afterF1?.status, seedTrail(rule2)).toBe(SHOWN.active);
      expect(riyadhDate(rule2.now!.expiryDate) > rule2.madeOn, 'rule 2: expiry in the future').toBe(true);
    });

    await steps.step('The job applied the rule to every network', async () => {
      for (const seed of [rule1, rule2]) expect(seed.after, `"${seed.name}" was read after the run`).not.toBeNull();
    });

    await steps.step('Only Active + past became Expired; the other combinations did not change', async () => {
      expect(rule1.after?.status, `rule 1 - ${seedTrail(rule1)}`).toBe(SHOWN.expired);
      expect(rule2.after?.status, `rule 2 - ${seedTrail(rule2)}`).toBe(SHOWN.active);
      await expectAlreadyExpiredUntouched(page, rule1, testInfo);
    });
  });

  test(`TC-${CASES.auditEntry.azureId}: should add an audit entry with system actor, time and Active to Expired for each automatic expiry`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.expire);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('Before the run the audit history held no expiry entry', async () => {
      const f2 = Date.parse(seed.firings!.f2);
      const early = (await statusEntries(page, seed.id, SHOWN.expired)).filter((e) => (entryTime(e) ?? Infinity) < f2 - 60_000);
      expect(early, 'no expiry entry before the run').toEqual([]);
    });

    await steps.step('The run moves the network to Expired', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
    });

    await steps.step('The reopened audit history has a new entry: system actor, timestamp, Active -> Expired', async () => {
      const expiries = entriesSince(await statusEntries(page, seed.id, SHOWN.expired), seed.firings?.f2);
      expect(expiries.length, 'an expiry entry after the run').toBeGreaterThan(0);
      expect(entryText(expiries[0])).toMatch(BEFORE_EXPIRY);
      expect(String(expiries[0].actorLabel ?? ''), `the actor: ${entryText(expiries[0]).slice(0, 300)}`).toMatch(SYSTEM_ACTOR);
      expect(entryTime(expiries[0]), 'a timestamp').not.toBeNull();
      await networkDetailPage.open(seed.id);
      await networkDetailPage.audit().open();
      const entry = await networkDetailPage.audit().openEntry(0);
      const status = entry.changes.find((c) => /status/i.test(c.field));
      expect(status, `the newest entry's changes: ${JSON.stringify(entry.changes)}`).toBeDefined();
      expect(status!.before).toMatch(BEFORE_EXPIRY);
      expect(status!.after).toMatch(new RegExp(SHOWN.expired));
      expect(entry.meta).toMatch(SYSTEM_ACTOR);
    });
  });

  test(`TC-${CASES.adminsNotified.azureId}: should notify administrators with the network's name, id and expiry date when it expires`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.expire);
    const definitions = (await listDefinitions(page)).filter(
      (d) => d.isActive && EXPIRED_NETWORK_ACTION.test(d.moduleActionEn) && NETWORK_MODULE_ACTION.test(d.moduleActionEn),
    );
    if (definitions.length === 0) {
      steps.blocked(
        'No active "Expired - Network" notification definition exists (System Settings > Notification Center > Definitions), '
          + 'so the job\'s expiry notifies nobody (verified 2026-11-08: none existed). Unblocked by an active definition addressed to '
          + `the administrator in place BEFORE \`${SEED_COMMAND.network}\` runs.`,
      );
    }

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The network was Active with an expiry date that had passed', async () => {
      expect(seed.afterF1?.status, seedTrail(seed)).toBe(SHOWN.active);
      expect(Date.parse(seed.now!.expiryDate) < Date.parse(seed.firings!.f2)).toBe(true);
    });

    await steps.step('The job moved it to Expired', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });

    const notices = async () => (await inboxSince(page, new Date(Date.parse(seed.firings!.f2) - 60_000))).filter((n) => n.relatedEntityId === seed.id);

    await steps.step("The administrator's notifications hold a new one about this network's expiry", async () => {
      expect((await notices()).length, `notifications for "${seed.name}" since the run`).toBeGreaterThan(0);
    });

    await steps.step('It shows the network name, its id and its expiry date', async () => {
      const text = (await notices()).map((n) => `${n.englishMessage} ${n.notes ?? ''}`).join(' | ');
      expect(text).toContain(seed.name);
      expect(text, 'the network id (code)').toContain(seed.now?.code ?? seed.id);
      expect(text, 'the expiry date').toContain(riyadhDisplayDate(seed.now!.expiryDate));
    });
  });

  test(`TC-${CASES.missedRunCaughtUp.azureId}: should still expire an overdue network on the first successful run after missed runs`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.expire);
    notExercised(testInfo, 'Overdue by minutes, not three days: the daily job cannot be held off for days in a shared environment.');

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The network read Active with an expiry date already in the past', async () => {
      expect(seed.afterF1?.status, seedTrail(seed)).toBe(SHOWN.active);
      expect(Date.parse(seed.now!.expiryDate) < Date.parse(seed.firings!.f2)).toBe(true);
    });

    await steps.step('The first run after the expiry evaluates every overdue network', async () => {
      expect(seed.after, 'read after the run').not.toBeNull();
      expect(entriesSince(await statusEntries(page, seed.id, SHOWN.expired), seed.firings?.f2).length).toBeGreaterThan(0);
    });

    await steps.step('The reloaded detail page reads Expired', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });
  });

  test(`TC-${CASES.midnightBoundary.azureId}: should expire a network only after its expiry timestamp has fully elapsed`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.expire);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The network displays its configured expiry timestamp', async () => {
      await networkDetailPage.open(seed.id);
      expect(await networkDetailPage.readOverviewField('expiryDate')).toContain(riyadhDisplayDate(seed.now!.expiryDate));
    });

    await steps.step('A run just before the expiry leaves it Active; a run just after makes it Expired', async () => {
      const expiry = Date.parse(seed.now!.expiryDate);
      expect(Date.parse(seed.firings!.f1) < expiry && Date.parse(seed.firings!.f2) > expiry, 'F1 before, F2 after the expiry').toBe(true);
      expect(seed.afterF1?.status, `the run before the expiry - ${seedTrail(seed)}`).toBe(SHOWN.active);
      expect(seed.after?.status, `the run after the expiry - ${seedTrail(seed)}`).toBe(SHOWN.expired);
    });

    await steps.step('Networks in differing time zones expire by their own date', async () => {
      notExercised(testInfo, 'Time-zone partitions: the site has a single time zone (Asia/Riyadh); networks carry no time zone of their own.');
      expect(seed.now?.status, seedTrail(seed)).toBe(SHOWN.expired);
    });
  });

  test(`TC-${CASES.largeBatch.azureId}: should expire every eligible network of a large batch in one run`, async ({
    page,
    networkManagementPage,
    steps,
  }, testInfo) => {
    test.setTimeout(30 * 60_000);
    await requireJobSeed(page, testInfo, PURPOSE.expire);
    const seeds = await findJobSeeds(page, PURPOSE.expire);
    if (seeds.length < LARGE_BATCH) {
      steps.blocked(
        `needs ${LARGE_BATCH} ExpireAfterExpiry seeds made today, found ${seeds.length} - run `
          + `\`cross-env SEED_NETWORK_JOBS=1 SEED_COUNT_ExpireAfterExpiry=${LARGE_BATCH} npx playwright test tests/seed/seed-network-jobs.spec.ts --project=chromium --workers=1\``,
      );
    }

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seeds[0].name)).toBe(true);
    });

    await steps.step(`${LARGE_BATCH} Active networks with a passed expiry existed before the run`, async () => {
      expect(seeds.filter((s) => s.afterF1?.status === SHOWN.active).length).toBeGreaterThanOrEqual(LARGE_BATCH);
    });

    await steps.step('The run completed over the whole batch', async () => {
      expect(seeds.filter((s) => s.after !== null).length).toBe(seeds.length);
    });

    await steps.step('Every one of them reads Expired', async () => {
      const left = seeds.filter((s) => s.now?.status !== SHOWN.expired);
      expect(left.map(seedTrail).slice(0, 10), `${left.length} not Expired`).toEqual([]);
    });
  });

  test(`TC-${CASES.onlySystemExpires.azureId}: should offer a non-administrator no way to set a network to Expired`, async ({
    page,
    shapedNonAdmin,
    steps,
  }, testInfo) => {
    test.setTimeout(15 * 60_000);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.activate);
    const coordinator = await shapedNonAdmin({ with: ['viewNetworkDetails'] });

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await coordinator.networks.isListed(seed.name), `"${seed.name}" should be listed for the coordinator`).toBe(true);
    });

    await steps.step('The network opens; its status is shown but no control offers Expired', async () => {
      await coordinator.networkDetail.open(seed.id);
      expect(await coordinator.networkDetail.getStatus()).toBe(SHOWN.active);
      const offered = await coordinator.networkDetail.getOfferedActions();
      expect(offered.filter((a) => EXPIRE_ACTION.test(a)), `offered: ${offered.join(', ')}`).toEqual([]);
    });

    await steps.step('Setting the status to Expired by hand is not possible', async () => {
      expect(await coordinator.networkDetail.getActionAvailability('activate'), 'no status change on an Active network').not.toBe('available');
      expect(await coordinator.networkDetail.getStatus()).not.toBe(SHOWN.expired);
    });

    await steps.step('The reloaded detail page still reads its prior status', async () => {
      await coordinator.networkDetail.open(seed.id);
      expect(await coordinator.networkDetail.getStatus()).toBe(SHOWN.active);
    });
  });
});

test.describe('US 14130 - Expiry cases waiting on the environment', () => {
  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
