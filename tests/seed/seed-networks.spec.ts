import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { Logger } from '../../utils/Logger';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { DateUtils } from '../../utils/DateUtils';
import { toArabicToken } from '../../data/payers/payer.data';
import {
  APPROVE_REQUEST_ENDPOINT,
  ASSIGN_FACILITIES_ENDPOINT,
  CREATE_NETWORK_ENDPOINT,
  DEFAULT_POOL_SIZE,
  GET_APPROVALS_ENDPOINT,
  GET_NETWORKS_ENDPOINT,
  HMO_NETWORK_TYPE_ID,
  NETWORK_VERSION_DRAFT,
  NETWORK_VERSION_PENDING,
  SEED_PREFIX,
  SHARED_FACILITY_ID,
  SUBMIT_NETWORK_ENDPOINT,
  isUsableNetwork,
  type NetworkRow,
} from '../../data/networks/seedNetworks.data';

/** How many times the build loop will try to reach the target. */
const MAX_PASSES = 3;

/** Every seeded network row, in whatever state it is in. */
async function readSeededPool(page: Page): Promise<NetworkRow[]> {
  const res = await NetworkUtils.postAsSession(page, GET_NETWORKS_ENDPOINT, {
    pageNumber: 1,
    rowsPerPage: 1000,
  });
  const body = JSON.parse(res.text) as { payload: { networks: { items: NetworkRow[] } } };
  return (body.payload.networks.items ?? []).filter((row) =>
    String(row.networkNameEn ?? '').startsWith(SEED_PREFIX));
}

/**
 * Pending approval requests for seeded networks, as name -> request id.
 *
 * Keyed by NAME because the queue row's `entityId` is the network's version
 * id - see APPROVE_REQUEST_ENDPOINT for the full trap.
 */
async function readPendingRequests(page: Page): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
    const res = await NetworkUtils.postAsSession(page, GET_APPROVALS_ENDPOINT, {
      pageNumber,
      rowsPerPage: 200,
    });
    const body = JSON.parse(res.text) as {
      payload: Record<string, { items?: Record<string, unknown>[] }>;
    };
    const rows = Object.values(body.payload).find((v) => Array.isArray(v?.items))?.items ?? [];
    for (const row of rows) {
      const name = String(row.entityNameEn ?? '');
      if (name.startsWith(SEED_PREFIX) && String(row.status) === 'Pending') {
        found.set(name, String(row.id));
      }
    }
    if (rows.length < 200) break;
  }
  return found;
}

/**
 * Seeds the pool of networks the payer fixtures assign before approval.
 *
 *   npm run seed:networks              tops the pool up to DEFAULT_POOL_SIZE
 *   SEED_NETWORK_COUNT=40 npm run seed:networks
 *
 * Guarded by SEED_NETWORKS=1 like the other seeders, so it can never run as
 * part of an ordinary suite invocation - it CREATES RECORDS, and a stray run
 * would quietly fill the register.
 *
 * FOUR STEPS, IN THIS ORDER: create, attach the facility, send for approval,
 * approve. The facility goes on BEFORE submission - the QA lead's sequence,
 * and the application agrees: AssignFacilitiesToNetwork answers
 * `assignedCount: 1` on a draft, while a network already submitted has to be
 * reverted to draft before it will take one.
 *
 * It TOPS THE POOL UP rather than always creating: a network left part-built
 * by an interrupted run is carried the rest of the way instead of abandoned,
 * so a second invocation costs two calls per network rather than four plus a
 * duplicate record. That is how the 307 networks stranded in draft on
 * 2026-09-28 were recovered rather than re-created.
 *
 * AND IT WORKS AROUND RECORDS THAT CAN NEVER FINISH. Three networks from that
 * first interrupted run answer 409 Conflict on approval every single time -
 * duplicate names, left half-created. Counting them as "part-built" made the
 * seeder wait for records that are never coming and report a false failure on
 * an otherwise healthy pool, so a name that fails to submit or approve is
 * marked dead and REPLACED on the next pass rather than waited on.
 */
test.describe('Seed - the network pool for payer provisioning', () => {
  test('creates networks with a facility attached, approved and ready to claim', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    test.setTimeout(45 * 60_000);

    const wanted = Number(process.env.SEED_NETWORK_COUNT ?? DEFAULT_POOL_SIZE);
    const problems: string[] = [];
    /** Names that failed to submit or approve - replaced, not waited on. */
    const dead = new Set<string>();
    let pool: NetworkRow[] = [];

    await steps.critical('Establish the session the API calls ride on', async () => {
      expect(
        process.env.SEED_NETWORKS,
        'refusing to create records without SEED_NETWORKS=1 - run it through npm run seed:networks',
      ).toBe('1');
      // postAsSession reads the bearer token from the page, so a real session
      // has to exist before any of it works.
      await payerManagementPage.open();
    });

    /** Creates `count` networks and attaches the shared facility to each. */
    const createNetworks = async (count: number): Promise<void> => {
      Logger.step(`[seed] creating ${count} network(s)`);
      for (let i = 0; i < count; i += 1) {
        const stamp = `${Date.now().toString(36).slice(-5)}${i.toString(36)}`;
        const name = `${SEED_PREFIX} ${stamp}`;

        const created = await NetworkUtils.postAsSession(page, CREATE_NETWORK_ENDPOINT, {
          networkNameEn: name,
          networkNameAr: `شبكة ${toArabicToken(stamp)}`,
          networkTypeId: HMO_NETWORK_TYPE_ID,
          descriptionEn: 'Seeded so a payer has a network to assign before approval.',
          descriptionAr: `وصف ${toArabicToken(stamp)}`,
          effectiveDate: DateUtils.toIsoDate(DateUtils.todayFormatted()),
          expiryDate: DateUtils.toIsoDate(DateUtils.futureDate(365)),
        });
        if (created.status >= 300) {
          problems.push(`${name}: create ${created.status} ${created.text.slice(0, 120)}`);
          continue;
        }

        let id = '';
        try {
          const body = JSON.parse(created.text) as { payload?: { id?: string } };
          id = String(body.payload?.id ?? '');
        } catch {
          problems.push(`${name}: created but the response could not be read`);
          continue;
        }
        if (!id) {
          problems.push(`${name}: created but no id came back`);
          continue;
        }

        // Before submission, deliberately - see the file header.
        const attached = await NetworkUtils.postAsSession(page, ASSIGN_FACILITIES_ENDPOINT, {
          networkId: id,
          facilityIds: [SHARED_FACILITY_ID],
          confirmRevertToDraft: false,
        });
        if (attached.status >= 300) {
          problems.push(`${name}: facility ${attached.status} ${attached.text.slice(0, 120)}`);
          continue;
        }
        if ((i + 1) % 25 === 0) Logger.step(`[seed] ${i + 1}/${count} created`);
      }
    };

    /** Sends every draft for approval, marking the ones that refuse as dead. */
    const submitDrafts = async (drafts: NetworkRow[]): Promise<void> => {
      if (drafts.length === 0) return;
      Logger.step(`[seed] submitting ${drafts.length} draft(s)`);
      for (const [index, network] of drafts.entries()) {
        const res = await NetworkUtils.postAsSession(page, SUBMIT_NETWORK_ENDPOINT, {
          networkId: network.id,
        });
        if (res.status >= 300) {
          dead.add(network.networkNameEn);
          problems.push(`${network.networkNameEn}: submit ${res.status} ${res.text.slice(0, 120)}`);
        }
        if ((index + 1) % 50 === 0) Logger.step(`[seed] ${index + 1}/${drafts.length} submitted`);
      }
    };

    /** Approves every pending request, marking the ones that refuse as dead. */
    const approvePending = async (): Promise<void> => {
      const requests = await readPendingRequests(page);
      if (requests.size === 0) return;
      Logger.step(`[seed] approving ${requests.size} request(s)`);
      let done = 0;
      for (const [name, requestId] of requests) {
        const res = await NetworkUtils.postAsSession(page, APPROVE_REQUEST_ENDPOINT, { id: requestId });
        if (res.status >= 300) {
          dead.add(name);
          problems.push(`${name}: approve ${res.status} ${res.text.slice(0, 120)}`);
        }
        done += 1;
        if (done % 50 === 0) Logger.step(`[seed] ${done}/${requests.size} approved`);
      }
    };

    await steps.step('Read what the pool already holds', async () => {
      pool = await readSeededPool(page);
      const usable = pool.filter(isUsableNetwork).length;
      const drafts = pool.filter((n) => n.versionStatusCode === NETWORK_VERSION_DRAFT).length;
      const pending = pool.filter((n) => n.versionStatusCode === NETWORK_VERSION_PENDING).length;
      Logger.info(
        `[seed] pool: ${pool.length} seeded - ${usable} usable, ${drafts} draft, ${pending} awaiting approval`,
      );
    });

    await steps.step('Build the pool up to the target, replacing what cannot finish', async () => {
      for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
        pool = await readSeededPool(page);
        const usable = pool.filter(isUsableNetwork).length;
        if (usable >= wanted) {
          Logger.info(`[seed] pass ${pass}: ${usable} usable, target met`);
          return;
        }

        // Part-built records still worth carrying - the dead ones excluded, so
        // a network that can never be approved is replaced instead of awaited.
        const carryable = pool.filter((n) => n.isPendingCreate && !dead.has(n.networkNameEn));
        const shortfall = wanted - usable - carryable.length;
        Logger.info(
          `[seed] pass ${pass}: ${usable} usable, ${carryable.length} to carry, `
          + `${dead.size} dead, creating ${Math.max(shortfall, 0)}`,
        );

        if (shortfall > 0) await createNetworks(shortfall);

        pool = await readSeededPool(page);
        await submitDrafts(
          pool.filter((n) => n.versionStatusCode === NETWORK_VERSION_DRAFT && !dead.has(n.networkNameEn)),
        );
        await approvePending();
      }
    });

    // A partial pool is worse than an obvious failure: the run would start,
    // provision happily until the pool ran dry, and then report a wall of
    // failures that look like the application refusing approvals again.
    await steps.step('The pool holds enough networks a payer can actually claim', async () => {
      pool = await readSeededPool(page);
      const usable = pool.filter(isUsableNetwork);
      Logger.info(
        `[seed] ${usable.length} usable network(s) of ${wanted} wanted, `
        + `${dead.size} unfinishable record(s), ${problems.length} problem(s)`,
      );
      for (const problem of problems.slice(0, 10)) Logger.warn(`[seed] ${problem}`);

      expect(
        usable.length,
        `only ${usable.length} of ${wanted} networks are approved, carry a facility and are `
          + `unclaimed, after ${MAX_PASSES} passes; the first problems were: `
          + `${problems.slice(0, 3).join(' | ') || '(none recorded)'}`,
      ).toBeGreaterThanOrEqual(wanted);
    });
  });
});
