import { test, expect } from '../../../fixtures';
import { riyadhDate, utcDate } from '../../../utils/JobClock';
import { readNetwork } from '../../../utils/NetworkProvisioning';
import { requireJobSeed } from '../../../utils/jobDriven/jobSeeds';
import { systemAuditLog } from '../../../utils/jobDriven/lifecycle';
import {
  entriesSince,
  entryText,
  entryTime,
  laterRunOver,
  notExercised,
  riyadhDisplayDate,
  seedTrail,
  statusEntries,
} from '../../../utils/jobDriven/writerN1Helpers';
import { PURPOSE, READ_SEED_BUDGET, SHOWN } from '../../../data/networks/jobDrivenNetwork.data';
import {
  BLOCKED_CASES,
  CASES,
  NETWORK_AUDIT_ENTITY,
  SECOND_RUN,
  STATUS_ACTIONS,
  VIEWER_WITHHELD,
} from '../../../data/networks/inactiveAutoExpire.data';

/**
 * User story 14308: Automatically expire an inactive network once its expiry
 * date passes.
 *
 * Seed-then-check: the cases claim today's InactiveThenExpire /
 * InactiveFutureExpiry seeds (`npm run seed:network-jobs`) and assert what the
 * job's F2 firing did to them; no seed today -> BLOCKED. 18113 asserts the
 * sheet's date-only reading and is expected to fail (inactiveAutoExpire.data.ts).
 */
test.describe('US 14308 - Expiry of Inactive networks by the daily job', () => {
  test(`TC-${CASES.inactiveExpires.azureId}: should move an Inactive network to Expired when the job runs after its expiry date`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveExpire);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('Before the run the network read Inactive with an expiry date that had passed', async () => {
      expect(seed.afterInactivation?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      expect(Date.parse(seed.now!.expiryDate) < Date.parse(seed.firings!.f2), 'the expiry passed before the run').toBe(true);
      await networkDetailPage.open(seed.id);
      expect(await networkDetailPage.readOverviewField('expiryDate')).toContain(riyadhDisplayDate(seed.now!.expiryDate));
    });

    await steps.step('The daily job ran and processed the eligible network', async () => {
      expect(seed.after, 'read after the run').not.toBeNull();
      expect(entriesSince(await statusEntries(page, seed.id, SHOWN.expired), seed.firings?.f2).length).toBeGreaterThan(0);
    });

    await steps.step('The reopened record reads Expired', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });
  });

  test(`TC-${CASES.expiryTodayStaysInactive.azureId}: should keep an Inactive network Inactive when its expiry date is today`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveLaterToday);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The network read Inactive with an expiry date of today', async () => {
      expect(seed.afterInactivation?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      expect(riyadhDate(seed.now!.expiryDate), 'the expiry date is the day of the run').toBe(seed.madeOn);
    });

    await steps.step("The job ran for today's site date and evaluated the network", async () => {
      expect(seed.firings, 'the job ran today').not.toBeNull();
      expect(riyadhDate(seed.firings!.f2)).toBe(seed.madeOn);
      expect(seed.after, 'read after the run').not.toBeNull();
    });

    await steps.step('The reopened record still reads Inactive - the expiry date has not yet passed', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.inactive);
    });
  });

  test(`TC-${CASES.oneDayPastExpires.azureId}: should expire an Inactive network once its expiry date is in the past`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveExpire, { index: 1 });
    notExercised(testInfo, 'One day past is played by an expiry minutes in the past (the job compares the date-time).');

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The network read Inactive with its expiry date before the run', async () => {
      expect(seed.afterInactivation?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      expect(Date.parse(seed.now!.expiryDate) < Date.parse(seed.firings!.f2)).toBe(true);
    });

    await steps.step('The job processed it', async () => {
      expect(seed.after, 'read after the run').not.toBeNull();
    });

    await steps.step('The reopened record reads Expired', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });
  });

  test(`TC-${CASES.futureStaysInactive.azureId}: should leave an Inactive network with a future expiry date Inactive`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveFuture);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The network reads Inactive with an expiry date in the future', async () => {
      expect(seed.afterInactivation?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      expect(riyadhDate(seed.now!.expiryDate) > seed.madeOn).toBe(true);
      await networkDetailPage.open(seed.id);
      expect(await networkDetailPage.readOverviewField('expiryDate')).toContain(riyadhDisplayDate(seed.now!.expiryDate));
    });

    await steps.step('The job processed all networks', async () => {
      expect(seed.firings, 'the job ran today').not.toBeNull();
      expect(seed.after, 'read after the run').not.toBeNull();
    });

    await steps.step('The reopened record is unchanged - Inactive', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.inactive);
    });
  });

  test(`TC-${CASES.otherStatesUntouched.azureId}: should leave Pending and already Expired networks unchanged when the job runs`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const pending = await requireJobSeed(page, testInfo, PURPOSE.future);
    const expired = await requireJobSeed(page, testInfo, PURPOSE.inactiveExpire);
    if (!laterRunOver(expired)) steps.blocked(`needs an already Expired network that a later job run passes over: ${SECOND_RUN}.`);
    notExercised(testInfo, 'A Pending (Future) network with a PAST expiry cannot exist - its expiry would precede its future effective date.');

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(pending.name), `"${pending.name}" should be listed`).toBe(true);
    });

    await steps.step('The Pending network opens reading Future', async () => {
      await networkDetailPage.open(pending.id);
      await networkDetailPage.expectStatus(SHOWN.future);
    });

    await steps.step('The already Expired network opens reading Expired with a past expiry date', async () => {
      await networkDetailPage.open(expired.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
      expect(Date.parse(expired.now!.expiryDate) < Date.now()).toBe(true);
    });

    await steps.step('The job processed both networks', async () => {
      expect(pending.after, 'read after the run').not.toBeNull();
      expect(laterRunOver(expired), 'a later run passed over the Expired network').toBe(true);
    });

    await steps.step('Both are unchanged: Future, and Expired with no second transition', async () => {
      expect(pending.now?.status, seedTrail(pending)).toBe(SHOWN.future);
      expect(expired.now?.status, seedTrail(expired)).toBe(SHOWN.expired);
      expect((await statusEntries(page, expired.id, SHOWN.expired)).length, 'one expiry transition').toBe(1);
    });
  });

  test(`TC-${CASES.siteLocalDate.azureId}: should evaluate the expiry against the site's local date rather than the UTC date`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveExpire);
    const f2 = seed.firings?.f2 ?? '';
    if (!f2 || riyadhDate(f2) === utcDate(f2)) {
      steps.blocked(
        `needs the seed run's expiry firing to fall while the site's local date (Asia/Riyadh) is ahead of the UTC date - `
          + `between 00:00 and 03:00 Riyadh. Today's F2 was ${f2 || 'not recorded'}. Run \`npm run seed:network-jobs\` in that window.`,
      );
    }
    notExercised(testInfo, 'The sheet\'s UTC+10 site is played by the only site time zone, Asia/Riyadh (UTC+3).');

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The record read Inactive with its expiry date', async () => {
      expect(seed.afterInactivation?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      await networkDetailPage.open(seed.id);
      expect(await networkDetailPage.readOverviewField('expiryDate')).toContain(riyadhDisplayDate(seed.now!.expiryDate));
    });

    await steps.step('At the run the site\'s local date was ahead of the server UTC date', async () => {
      expect(riyadhDate(f2) > utcDate(f2), `F2 ${f2}`).toBe(true);
    });

    await steps.step('The job evaluated the network by the site\'s local date', async () => {
      expect(seed.after, 'read after the run').not.toBeNull();
    });

    await steps.step('The reopened record reads Expired', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });
  });

  test(`TC-${CASES.expiryOverSuspension.azureId}: should expire a manually inactivated network once its expiry date passes`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveExpire);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The record was inactivated by an administrator (manual suspension) with a past expiry', async () => {
      expect(seed.afterInactivation?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      const f2 = Date.parse(seed.firings!.f2);
      const inactivations = (await statusEntries(page, seed.id, SHOWN.inactive)).filter((e) => (entryTime(e) ?? Infinity) < f2);
      expect(inactivations.length, 'the manual inactivation is on record before the run').toBeGreaterThan(0);
    });

    await steps.step('The manual inactivation stands with no pending edit', async () => {
      expect(seed.afterInactivation?.hasPendingVersion, seedTrail(seed)).toBe(false);
    });

    await steps.step('The job processed the network', async () => {
      expect(seed.after, 'read after the run').not.toBeNull();
    });

    await steps.step('The reopened record reads Expired - expiry takes precedence over the suspension', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });
  });

  test(`TC-${CASES.notReprocessed.azureId}: should not reprocess an already Expired network on later job runs`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveExpire);
    if (!laterRunOver(seed)) steps.blocked(`needs a job run after the network was already Expired: ${SECOND_RUN}.`);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The already Expired network opens with its expiry date', async () => {
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
      expect(await networkDetailPage.readOverviewField('expiryDate')).toContain(riyadhDisplayDate(seed.now!.expiryDate));
    });

    await steps.step('The audit log holds a single prior Expired transition', async () => {
      const first = (await statusEntries(page, seed.id, SHOWN.expired)).filter((e) => (entryTime(e) ?? Infinity) <= Date.parse(seed.after!.readAt));
      expect(first.length).toBe(1);
    });

    await steps.step('The job ran again over the network', async () => {
      expect(laterRunOver(seed), `later firing ${seed.firings?.f1} after ${seed.after?.readAt}`).toBe(true);
    });

    await steps.step('It still reads Expired with no duplicate transition in the audit log', async () => {
      expect(seed.now?.status, seedTrail(seed)).toBe(SHOWN.expired);
      expect((await statusEntries(page, seed.id, SHOWN.expired)).length, 'no duplicate expiry entry').toBe(1);
    });
  });

  test(`TC-${CASES.onlyStatusChanges.azureId}: should change only the status and the audit trail when a network auto-expires`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveExpire);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('Before the run the record held its full set of values', async () => {
      expect(seed.afterInactivation, seedTrail(seed)).toMatchObject({ status: SHOWN.inactive });
      expect(seed.afterInactivation?.code, 'a network code').toBeTruthy();
    });

    await steps.step('The job processed the network', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
    });

    await steps.step('Only the status changed - name, pharmacies, dates, code and version are as before', async () => {
      const before = seed.afterInactivation!;
      const after = seed.after!;
      expect({ code: after.code, effectiveDate: after.effectiveDate, expiryDate: after.expiryDate, currentVersion: after.currentVersion })
        .toEqual({ code: before.code, effectiveDate: before.effectiveDate, expiryDate: before.expiryDate, currentVersion: before.currentVersion });
      expect((await readNetwork(page, seed.id)).networkNameEn).toBe(seed.name);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().readRows()).length, 'the pharmacy is still assigned').toBeGreaterThan(0);
      expect(entriesSince(await statusEntries(page, seed.id, SHOWN.expired), seed.firings?.f2).length, 'an audit entry was added').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.viewerCannotReverse.azureId}: should expire the network regardless of a read-only viewer, who can see but not change the status`, async ({
    page,
    shapedNonAdmin,
    steps,
  }, testInfo) => {
    test.setTimeout(15 * 60_000);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveExpire);
    const viewer = await shapedNonAdmin({ without: VIEWER_WITHHELD });

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await viewer.networks.isListed(seed.name), `"${seed.name}" should be listed for the viewer`).toBe(true);
    });

    await steps.step('The viewer opens the record read-only; it was Inactive before the run', async () => {
      expect(seed.afterInactivation?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      await viewer.networkDetail.open(seed.id);
      for (const action of STATUS_ACTIONS) {
        expect(await viewer.networkDetail.getActionAvailability(action), `${action} for the viewer`).not.toBe('available');
      }
    });

    await steps.step('The viewer has no control to change the status', async () => {
      const offered = await viewer.networkDetail.getOfferedActions();
      expect(offered.filter((a) => (STATUS_ACTIONS as readonly string[]).includes(a)), `offered: ${offered.join(', ')}`).toEqual([]);
    });

    await steps.step('The job processed the network', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
    });

    await steps.step('The viewer reopens the record and sees Expired, read-only', async () => {
      await viewer.networkDetail.open(seed.id);
      expect(await viewer.networkDetail.getStatus()).toBe(SHOWN.expired);
      expect(await viewer.networkDetail.getActionAvailability('activate')).not.toBe('available');
    });
  });

  test(`TC-${CASES.auditReporting.azureId}: should show the automatic Inactive to Expired transition in the audit and reporting view`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.inactiveExpire);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The record read Inactive with its past expiry date', async () => {
      expect(seed.afterInactivation?.status, seedTrail(seed)).toBe(SHOWN.inactive);
      expect(Date.parse(seed.now!.expiryDate) < Date.parse(seed.firings!.f2)).toBe(true);
    });

    await steps.step('The job ran and reported the transition', async () => {
      expect(seed.after?.status, seedTrail(seed)).toBe(SHOWN.expired);
    });

    await steps.step('The audit view shows a timestamped Inactive -> Expired change event', async () => {
      const system = entriesSince(
        await statusEntries(page, seed.id, SHOWN.expired),
        seed.firings?.f2,
      );
      expect(system.length, 'the audit records the change').toBeGreaterThan(0);
      expect((await systemAuditLog(page, NETWORK_AUDIT_ENTITY, seed.id)).some((e) => e.id === system[0].id), 'the system Audit Logs carry the same entry').toBe(true);
      expect(entryTime(system[0]), 'with a timestamp').not.toBeNull();
      await networkDetailPage.open(seed.id);
      await networkDetailPage.audit().open();
      const entry = await networkDetailPage.audit().openEntry(0);
      const status = entry.changes.find((c) => /status/i.test(c.field));
      expect(status, `the newest entry's changes: ${JSON.stringify(entry.changes)}`).toBeDefined();
      expect(status!.before).toMatch(new RegExp(SHOWN.inactive));
      expect(status!.after).toMatch(new RegExp(SHOWN.expired));
    });
  });
});

test.describe('US 14308 - Inactive-expiry cases waiting on the environment', () => {
  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
