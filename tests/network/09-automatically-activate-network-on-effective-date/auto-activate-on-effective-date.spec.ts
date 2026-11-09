import { test, expect } from '../../../fixtures';
import { riyadhDate, waitUntilInstant } from '../../../utils/JobClock';
import { findJobSeeds, requireJobSeed, SEED_COMMAND } from '../../../utils/jobDriven/jobSeeds';
import { networkSnapshot, waitForNetworkStatus } from '../../../utils/jobDriven/lifecycle';
import { provisionNetwork, type ProvisionedNetwork } from '../../../utils/NetworkProvisioning';
import {
  addFacilityAndApprove,
  attemptGoLiveWithoutFacility,
  entriesSince,
  notExercised,
  riyadhDisplayDate,
  seedTrail,
  statusEntries,
  type FacilityAddedApproval,
  type NoFacilityAttempt,
} from '../../../utils/jobDriven/writerN1Helpers';
import {
  BUILD_BUDGET,
  PENDING_APPROVAL_CELL,
  PURPOSE,
  READ_SEED_BUDGET,
  SHOWN,
  SYSTEM_ACTOR,
} from '../../../data/networks/jobDrivenNetwork.data';
import {
  BEFORE_ACTIVATION,
  BLOCKED_CASES,
  CASES,
  EFFECTIVE_IN_MINUTES,
  IMMEDIATE_MS,
  SAME_DATE_MINIMUM,
} from '../../../data/networks/autoActivateOnEffective.data';

/**
 * User story 14129: Automatically activate network on effective date.
 *
 * Seed-then-check: the network job is daily, so the cases claim today's job
 * seeds (`npm run seed:network-jobs`) and assert what its firings did; no seed
 * today -> BLOCKED. Only 17837 (activation AT approval, no job) and the
 * eligibility halves of 17840 / 17841 / 17843 build networks of their own.
 */
test.describe('US 14129 - Automatically activate network on effective date', () => {
  test(`TC-${CASES.activatesAtApproval.azureId}: should activate a network at approval when its effective date has already arrived`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    steps,
  }) => {
    test.setTimeout(BUILD_BUDGET);
    let network!: ProvisionedNetwork;

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      await networkManagementPage.openList();
      network = await provisionNetwork(page, { effectiveInMinutes: EFFECTIVE_IN_MINUTES, submitOnly: true });
      expect(await networkManagementPage.isListed(network.name), `"${network.name}" should be listed`).toBe(true);
    });

    await steps.step('The submitted network opens awaiting approval with an effective date of today', async () => {
      await networkManagementPage.expectApprovalCell(network.name, PENDING_APPROVAL_CELL);
      const snapshot = await networkSnapshot(page, network.id);
      expect(riyadhDate(snapshot.effectiveDate), 'the effective date should be today').toBe(riyadhDate());
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getStatus(), 'not live before approval').not.toBe(SHOWN.active);
      expect(await networkDetailPage.readOverviewField('effectiveDate')).toContain(riyadhDisplayDate(snapshot.effectiveDate));
    });

    await steps.step('Approving it once its effective time has passed makes it Active at once, without the daily job', async () => {
      const snapshot = await networkSnapshot(page, network.id);
      await waitUntilInstant(page, new Date(snapshot.effectiveDate), 5_000);
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      const shown = await waitForNetworkStatus(page, network.id, SHOWN.active, { timeoutMs: IMMEDIATE_MS });
      expect(shown.value?.status, `"${network.name}" right after approval (the job did not run in between)`).toBe(SHOWN.active);
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(SHOWN.active);
    });
  });

  test(`TC-${CASES.approvedBeforeEffective.azureId}: should keep an approved network Future until its effective date and let the daily job activate it`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const future = await requireJobSeed(page, testInfo, PURPOSE.future);
    const activated = await requireJobSeed(page, testInfo, PURPOSE.activate);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(future.name), `"${future.name}" should be listed`).toBe(true);
    });

    await steps.step('The approved network with a future effective date opens reading Future with that date', async () => {
      expect(riyadhDate(future.now!.effectiveDate) > future.madeOn, 'the effective date should be after today').toBe(true);
      await networkDetailPage.open(future.id);
      await networkDetailPage.expectStatus(SHOWN.future);
      expect(await networkDetailPage.readOverviewField('effectiveDate')).toContain(riyadhDisplayDate(future.now!.effectiveDate));
    });

    await steps.step('Approved before its effective date, a network stays Future', async () => {
      expect(activated.before?.status, `approved before its effective time - ${seedTrail(activated)}`).toBe(SHOWN.future);
      expect(future.now?.status, `the job ran twice and must leave the future-dated network alone - ${seedTrail(future)}`).toBe(SHOWN.future);
    });

    await steps.step('Once its effective date arrives the daily job makes it Active', async () => {
      expect(activated.afterF1?.status, seedTrail(activated)).toBe(SHOWN.active);
      await networkDetailPage.open(activated.id);
      await networkDetailPage.expectStatus(SHOWN.active);
    });
  });

  test(`TC-${CASES.exactDay.azureId}: should activate a network on the exact day its effective date arrives`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.activate);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The approved network effective today read Future before the job ran', async () => {
      expect(riyadhDate(seed.now!.effectiveDate), 'the effective date is the day of the job run').toBe(seed.madeOn);
      expect(seed.before?.status, seedTrail(seed)).toBe(SHOWN.future);
      await networkDetailPage.open(seed.id);
      expect(await networkDetailPage.readOverviewField('effectiveDate')).toContain(riyadhDisplayDate(seed.now!.effectiveDate));
    });

    await steps.step("Today's job run finds it eligible and makes it Active", async () => {
      expect(seed.afterF1?.status, seedTrail(seed)).toBe(SHOWN.active);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.active);
    });
  });

  test(`TC-${CASES.ineligibleWithheld.azureId}: should withhold activation from a network without a pharmacy and activate it once it is eligible`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(BUILD_BUDGET);
    const activated = await requireJobSeed(page, testInfo, PURPOSE.activate);
    let attempt!: NoFacilityAttempt;
    let fixed!: FacilityAddedApproval;
    notExercised(testInfo, 'The "inactive owning payer" branch: no seed holds an approved network whose payer is inactive when the job runs (see 17845).');

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered(), 'the module should load with its register action').toBe(true);
    });

    await steps.critical('A network whose effective date passes but which holds no pharmacy shows no facilities and is not live', async () => {
      attempt = await attemptGoLiveWithoutFacility(page);
      await networkDetailPage.open(attempt.network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().readRows(), 'no facility is assigned').toEqual([]);
      expect(attempt.after?.status, `"${attempt.network.name}"`).not.toBe(SHOWN.active);
    });

    await steps.step('It is not activated: the go-live rule refuses it before the job can see it as eligible', async () => {
      expect(
        attempt.approve === null || attempt.approve.status >= 400,
        `a network without a pharmacy must not be approved: submit ${attempt.submit.status} ${attempt.submit.text.slice(0, 160)} / approve ${attempt.approve?.status} ${attempt.approve?.text.slice(0, 160)}`,
      ).toBe(true);
      const effective = (await networkSnapshot(page, attempt.network.id)).effectiveDate;
      await waitUntilInstant(page, new Date(effective), 5_000);
      expect((await networkSnapshot(page, attempt.network.id)).status, 'past its effective time it is still not Active').not.toBe(SHOWN.active);
    });

    await steps.step('After a pharmacy is assigned it is approved, and the next daily run makes such a network Active', async () => {
      fixed = await addFacilityAndApprove(page, attempt.network);
      expect(fixed.assign.status, `assign ${fixed.assign.text.slice(0, 200)}`).toBeLessThan(300);
      expect(fixed.approve.status, `approve ${fixed.approve.text.slice(0, 200)}`).toBeLessThan(300);
      expect(fixed.after?.status, 'approved and eligible, it awaits the next run').toBe(SHOWN.future);
      // The run itself is observed on today's eligible seed (approved, pharmacy assigned, effective time passed).
      expect(activated.afterF1?.status, seedTrail(activated)).toBe(SHOWN.active);
    });
  });

  test(`TC-${CASES.oneRunAllEligible.azureId}: should activate every eligible network in one run and leave future-dated and ineligible ones alone`, async ({
    page,
    networkManagementPage,
    steps,
  }, testInfo) => {
    test.setTimeout(BUILD_BUDGET);
    const future = await requireJobSeed(page, testInfo, PURPOSE.future);
    await requireJobSeed(page, testInfo, PURPOSE.activate);
    const eligible = await findJobSeeds(page, PURPOSE.activate);
    let ineligible!: NoFacilityAttempt;

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(future.name), `"${future.name}" should be listed`).toBe(true);
    });

    await steps.step('Before the run every test network reads Future (the ineligible one is refused approval)', async () => {
      for (const seed of [...eligible, future]) expect(seed.before?.status, seedTrail(seed)).toBe(SHOWN.future);
      ineligible = await attemptGoLiveWithoutFacility(page);
      expect(ineligible.after?.status, `"${ineligible.network.name}" (no pharmacy)`).not.toBe(SHOWN.active);
    });

    await steps.step('The daily job ran to completion over every record', async () => {
      expect(future.firings, `the seed run should record its firings (${SEED_COMMAND.network})`).not.toBeNull();
      for (const seed of [...eligible, future]) expect(seed.afterF1, `"${seed.name}" was read after the run`).not.toBeNull();
    });

    await steps.step('Eligible networks due today are Active; the future-dated and the ineligible ones are not', async () => {
      for (const seed of eligible) expect(seed.now?.status, seedTrail(seed)).toBe(SHOWN.active);
      expect(future.now?.status, seedTrail(future)).toBe(SHOWN.future);
      expect(
        ineligible.approve === null || ineligible.approve.status >= 400,
        `the network without a pharmacy must not go live: approve ${ineligible.approve?.status} ${ineligible.approve?.text.slice(0, 160)}`,
      ).toBe(true);
      expect((await networkSnapshot(page, ineligible.network.id)).status).not.toBe(SHOWN.active);
    });
  });

  test(`TC-${CASES.tomorrowNotYet.azureId}: should leave a network effective tomorrow Future when today's job runs`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.future);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The approved network effective tomorrow opens reading Future with that date', async () => {
      expect(riyadhDate(seed.now!.effectiveDate) > seed.madeOn, 'the effective date should not have arrived').toBe(true);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.future);
      expect(await networkDetailPage.readOverviewField('effectiveDate')).toContain(riyadhDisplayDate(seed.now!.effectiveDate));
    });

    await steps.step("Today's job runs and the network is not activated", async () => {
      expect(seed.firings, 'the job ran today').not.toBeNull();
      expect(seed.afterF1?.status, seedTrail(seed)).toBe(SHOWN.future);
      expect(seed.now?.status, seedTrail(seed)).toBe(SHOWN.future);
    });
  });

  test(`TC-${CASES.eligibleLater.azureId}: should activate a past-effective network on the next run once its missing pharmacy is assigned`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(BUILD_BUDGET);
    const activated = await requireJobSeed(page, testInfo, PURPOSE.activate);
    let attempt!: NoFacilityAttempt;
    let fixed!: FacilityAddedApproval;

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered(), 'the module should load with its register action').toBe(true);
    });

    await steps.critical('The network with no pharmacy opens with no facilities assigned', async () => {
      attempt = await attemptGoLiveWithoutFacility(page);
      await networkDetailPage.open(attempt.network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().readRows()).toEqual([]);
    });

    await steps.step('While the pharmacy is missing it is not activated (approval refused, not Active)', async () => {
      expect(
        attempt.approve === null || attempt.approve.status >= 400,
        `approve ${attempt.approve?.status} ${attempt.approve?.text.slice(0, 160)}`,
      ).toBe(true);
      expect((await networkSnapshot(page, attempt.network.id)).status).not.toBe(SHOWN.active);
    });

    await steps.step('A pharmacy is assigned and listed on the Facility Assignment tab', async () => {
      fixed = await addFacilityAndApprove(page, attempt.network);
      expect(fixed.assign.status, fixed.assign.text.slice(0, 200)).toBeLessThan(300);
      await networkDetailPage.open(attempt.network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().findRow(fixed.facilityCode), `${fixed.facilityCode} should be listed`).not.toBeNull();
    });

    await steps.step('The next scheduled run makes the now-eligible network Active', async () => {
      expect(fixed.approve.status, `approve ${fixed.approve.text.slice(0, 200)}`).toBeLessThan(300);
      expect(fixed.after?.status, 'approved and past its effective date, it awaits the next run').toBe(SHOWN.future);
      expect(activated.afterF1?.status, `the run's activation of an eligible past-effective network - ${seedTrail(activated)}`).toBe(SHOWN.active);
    });
  });

  test(`TC-${CASES.sameEffectiveDate.azureId}: should activate every network sharing an effective date exactly once when the job runs`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    await requireJobSeed(page, testInfo, PURPOSE.activate);
    const seeds = await findJobSeeds(page, PURPOSE.activate);
    if (seeds.length < SAME_DATE_MINIMUM) {
      steps.blocked(`needs at least ${SAME_DATE_MINIMUM} ActivateOnEffective seeds made today, found ${seeds.length} - run \`${SEED_COMMAND.network}\` (SEED_COUNT_ActivateOnEffective=3)`);
    }

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seeds[0].name), `"${seeds[0].name}" should be listed`).toBe(true);
    });

    await steps.step('Every test network read Future with the same effective date', async () => {
      const dates = new Set(seeds.map((s) => riyadhDate(s.now!.effectiveDate)));
      expect([...dates], 'one shared effective date').toEqual([seeds[0].madeOn]);
      for (const seed of seeds) expect(seed.before?.status, seedTrail(seed)).toBe(SHOWN.future);
    });

    await steps.step('The job processed every matching network - none skipped', async () => {
      for (const seed of seeds) expect(seed.afterF1?.status, seedTrail(seed)).toBe(SHOWN.active);
    });

    await steps.step('Every network reads Active with no partially applied update', async () => {
      for (const seed of seeds) {
        expect(seed.now, seedTrail(seed)).toMatchObject({ status: SHOWN.active, storedStatus: SHOWN.active, isActive: true });
        await networkDetailPage.open(seed.id);
        await networkDetailPage.expectStatus(SHOWN.active);
      }
    });

    await steps.step('The second run the same day does not reprocess them - one activation entry each', async () => {
      for (const seed of seeds) {
        const activations = entriesSince(await statusEntries(page, seed.id, SHOWN.active), seed.firings?.f1);
        expect(activations.length, `activation entries of "${seed.name}" since F1: ${JSON.stringify(activations).slice(0, 400)}`).toBe(1);
      }
    });
  });

  test(`TC-${CASES.auditAutomatic.azureId}: should record the automatic activation in the audit history as a system action`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.activate);

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The automatic activation took place - the network reads Active', async () => {
      expect(seed.afterF1?.status, seedTrail(seed)).toBe(SHOWN.active);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.active);
    });

    await steps.step('The Audit History shows a new entry for the status change', async () => {
      const activations = entriesSince(await statusEntries(page, seed.id, SHOWN.active), seed.firings?.f1);
      expect(activations.length, 'an audit entry recorded at the job run').toBeGreaterThan(0);
      await networkDetailPage.audit().open();
      expect((await networkDetailPage.audit().readEntries()).length, 'the tab lists the entries').toBeGreaterThan(0);
    });

    await steps.step('The entry shows Pending -> Active, a system actor and the date and time of the change', async () => {
      const entry = await networkDetailPage.audit().openEntry(0);
      const status = entry.changes.find((c) => /status/i.test(c.field));
      expect(status, `the newest entry's changes: ${JSON.stringify(entry.changes)}`).toBeDefined();
      expect(status!.before).toMatch(BEFORE_ACTIVATION);
      expect(status!.after).toMatch(new RegExp(SHOWN.active));
      expect(entry.meta, 'identified as the system, not an approver').toMatch(SYSTEM_ACTOR);
      expect(entry.meta, 'the date and time of the change').toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });
});

test.describe('US 14129 - Activation cases waiting on a seed purpose', () => {
  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
