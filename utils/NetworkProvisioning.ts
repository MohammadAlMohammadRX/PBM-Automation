import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { DateUtils } from './DateUtils';
import { Logger } from './Logger';
import { toArabicToken } from '../data/payers/payer.data';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import {
  APPROVE_REQUEST_ENDPOINT,
  ASSIGN_FACILITIES_ENDPOINT,
  CREATE_NETWORK_ENDPOINT,
  GET_APPROVALS_ENDPOINT,
  GET_NETWORKS_ENDPOINT,
  HMO_NETWORK_TYPE_ID,
  SUBMIT_NETWORK_ENDPOINT,
} from '../data/networks/seedNetworks.data';

/** Name prefix of the networks a case creates for itself - NOT a protected seed prefix. */
export const DISPOSABLE_NETWORK_PREFIX = 'Automation Network';

/** What a case asks of the network it provisions. Everything is optional. */
export interface NetworkSpec {
  nameEn?: string;
  nameAr?: string;
  /** A network type label (HMO / PPO / EPO / POS); resolved through the lookup. */
  type?: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  /** Minutes from now for the effective date-time (default +1: starts Pending, the job activates it). */
  effectiveInMinutes?: number;
  /** Minutes from now for the expiry date-time (default one year). */
  expiryInMinutes?: number;
  /** How many of the environment's facilities to attach before submitting (default 1). */
  facilities?: number;
  /**
   * WHICH facilities to attach, by code (e.g. ['FCL-000007']) - overrides
   * `facilities`. Added for the facility-search scoping case, which needs two
   * networks holding DISTINCT facilities; the count alone always takes the
   * pool's first entries.
   */
  facilityCodes?: readonly string[];
  /** The owning payer's id; omitted = no owner (the list shows "—"). */
  payerId?: string;
  /** The owning payer by English name (resolved through GetPayers) - e.g. a publishedPayer's nameEn. */
  payerName?: string;
  /** Stop after creating the draft (default false). */
  draftOnly?: boolean;
  /** Submit but do not approve (default false). */
  submitOnly?: boolean;
}

/** What provisioning built. */
export interface ProvisionedNetwork {
  id: string;
  name: string;
  nameAr: string;
  facilityIds: string[];
  /** The stage it was left at. */
  stage: 'draft' | 'submitted' | 'approved';
}

/** The fields of a GetNetwork payload the cases read. */
export interface NetworkRecord {
  id: string;
  networkCode: string | null;
  networkNameEn: string;
  networkNameAr: string;
  networkTypeId: string;
  payerId: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  effectiveDate: string;
  expiryDate: string;
  /** The STORED status. It does not move on a manual inactivation - read effectiveStatusId. */
  statusId: string;
  isActive: boolean;
  /** The status the application displays (Pending / Active / Inactive / Expired). */
  effectiveStatusId?: string;
  currentVersion: number;
  hasPendingVersion: boolean;
  hasDraft: boolean;
  isPendingCreate: boolean;
  versionStatusCode: string | null;
  concurrencyStamp?: string;
  inactivationReasonId: string | null;
  inactivationDetails: string | null;
  inactivatedBy: string | null;
  inactivatedOn: string | null;
  [key: string]: unknown;
}

type Answer = { status: number; text: string };

const fail = (name: string, what: string, res: Answer): never => {
  throw new Error(`could not provision "${name}": ${what} answered ${res.status} ${res.text.slice(0, 400)}`);
};

const payloadOf = <T>(res: Answer): T => (JSON.parse(res.text) as { payload: T }).payload;

/** A unique stamp for names. */
export const networkStamp = (): string =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;

/** Lookup items `{ id, code, englishName }` for a lookup endpoint. */
async function lookup(page: Page, path: string): Promise<{ id: string; code: string; englishName: string }[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', path);
  return res.status === 200 ? payloadOf<{ id: string; code: string; englishName: string }[]>(res) : [];
}

/** The status lookup as code -> id (pending, active, inactive, expired). */
export async function networkStatusIds(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries((await lookup(page, ApiEndpoints.networkStatusLookup)).map((i) => [i.code, i.id]));
}

/** The status lookup as id -> English label. */
export async function networkStatusLabels(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries((await lookup(page, ApiEndpoints.networkStatusLookup)).map((i) => [i.id, i.englishName]));
}

/** A network type's id by its label (HMO falls back to the known id). */
export async function networkTypeId(page: Page, label = 'HMO'): Promise<string> {
  const match = (await lookup(page, ApiEndpoints.networkTypeLookup)).find((i) => i.englishName === label);
  return match?.id ?? HMO_NETWORK_TYPE_ID;
}

/** Facility ids the network may still be given (its Assign Facilities pool). */
export async function assignableFacilityIds(page: Page, networkId: string): Promise<{ id: string; facilityCode: string; facilityNameEn: string }[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.networkAssignableFacilities, { networkId });
  return res.status === 200 ? payloadOf<{ id: string; facilityCode: string; facilityNameEn: string }[]>(res) : [];
}

/** One network, as GetNetwork answers it. */
export async function readNetwork(page: Page, id: string): Promise<NetworkRecord> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.networkGet, { id });
  if (res.status !== 200) throw new Error(`GetNetwork ${id} answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOf<NetworkRecord>(res);
}

/** The network register rows (first `rows`), with any extra list criteria. */
export async function listNetworks(
  page: Page,
  criteria: Record<string, unknown> = {},
  rows = 1000,
): Promise<Record<string, unknown>[]> {
  const res = await NetworkUtils.postAsSession(page, GET_NETWORKS_ENDPOINT, { pageNumber: 1, rowsPerPage: rows, ...criteria });
  if (res.status !== 200) return [];
  return (JSON.parse(res.text) as { payload?: { networks?: { items?: Record<string, unknown>[] } } }).payload?.networks?.items ?? [];
}

/** The id of a network by its exact English name, or null. */
export async function networkIdByName(page: Page, name: string): Promise<string | null> {
  const rows = await listNetworks(page, { searchText: name }, 50);
  const row = rows.find((r) => r.networkNameEn === name);
  return row ? String(row.id) : null;
}

/** A payer's id by its exact English name (GetPayers search), or throws. */
export async function payerIdByName(page: Page, name: string): Promise<string> {
  const res = await NetworkUtils.postAsSession(page, '/api/Payers/GetPayers', { pageNumber: 1, rowsPerPage: 50, searchText: name });
  const items = res.status === 200
    ? ((JSON.parse(res.text) as { payload?: { payers?: { items?: { id: string; payerNameEn: string }[] } } }).payload?.payers?.items ?? [])
    : [];
  const match = items.find((p) => p.payerNameEn === name);
  if (!match) throw new Error(`no payer named "${name}" was found to own the network`);
  return match.id;
}

/** The pending approval request id for an entity name, or ''. */
export async function pendingRequestId(page: Page, entityName: string): Promise<string> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
      const res = await NetworkUtils.postAsSession(page, GET_APPROVALS_ENDPOINT, { pageNumber, rowsPerPage: 200 });
      const body = JSON.parse(res.text) as { payload: Record<string, { items?: Record<string, unknown>[] }> };
      const rows = Object.values(body.payload).find((v) => Array.isArray(v?.items))?.items ?? [];
      const row = rows.find((r) => String(r.entityNameEn ?? '') === entityName && String(r.status) === 'Pending');
      if (row) return String(row.id);
      if (rows.length < 200) break;
    }
    await page.waitForTimeout(1_000);
  }
  return '';
}

/** Approves an entity's pending request through the API. */
export async function approvePending(page: Page, entityName: string): Promise<void> {
  const requestId = await pendingRequestId(page, entityName);
  if (!requestId) throw new Error(`no pending approval request for "${entityName}"`);
  const res = await NetworkUtils.postAsSession(page, APPROVE_REQUEST_ENDPOINT, { id: requestId });
  if (res.status >= 300) fail(entityName, 'approve', res);
}

/** Submits a network's draft for approval through the API. */
export async function submitNetwork(page: Page, id: string, name: string): Promise<void> {
  const res = await NetworkUtils.postAsSession(page, SUBMIT_NETWORK_ENDPOINT, { networkId: id });
  if (res.status >= 300) fail(name, 'submit', res);
}

/** Deletes (or stages the deletion of) a network through the API. Best effort. */
export async function deleteNetworkById(page: Page, id: string): Promise<Answer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.networkDelete}/${id}`);
}

/**
 * Builds a network for one case through the application's own API - the same
 * calls the wizard and the network seeder make: create, attach facilities
 * BEFORE submission, submit, approve. The approval is looked up by NAME because
 * the queue row's entityId is the network's VERSION id.
 *
 * Effective date-times carry a time: "today 00:00" is refused as "in the
 * past", so the default is a minute ahead, and the lifecycle job (every minute
 * here) then makes an approved network Active. A short-lived network
 * (`expiryInMinutes` a few minutes out) is how the expiry stories get an
 * Expired network on demand - verified 2026-10-21 that the form accepts an
 * expiry on the same day as the effective date.
 *
 * Needs a signed-in page on the application (postAsSession reads its token).
 */
/** The facility a network gets when its case names none - Nathealth, see provisionNetwork. */
const DEFAULT_FACILITY_CODE = 'FCL-000009';

export async function provisionNetwork(page: Page, spec: NetworkSpec = {}): Promise<ProvisionedNetwork> {
  const stamp = networkStamp();
  const name = spec.nameEn ?? `${DISPOSABLE_NETWORK_PREFIX} ${stamp}`;
  const nameAr = spec.nameAr ?? `شبكة ${toArabicToken(stamp)}`;
  const effective = new Date(Date.now() + (spec.effectiveInMinutes ?? 1) * 60_000);
  const expiry = spec.expiryInMinutes === undefined
    ? DateUtils.toIsoDate(DateUtils.futureDate(365))
    : new Date(Date.now() + spec.expiryInMinutes * 60_000).toISOString();

  const created = await NetworkUtils.postAsSession(page, CREATE_NETWORK_ENDPOINT, {
    networkNameEn: name,
    networkNameAr: nameAr,
    networkTypeId: spec.type ? await networkTypeId(page, spec.type) : HMO_NETWORK_TYPE_ID,
    ...(spec.payerId || spec.payerName
      ? { payerId: spec.payerId ?? (await payerIdByName(page, spec.payerName!)) }
      : {}),
    descriptionEn: spec.descriptionEn === undefined ? 'Created by an automated case for its own use.' : spec.descriptionEn,
    descriptionAr: spec.descriptionAr === undefined ? `وصف ${toArabicToken(stamp)}` : spec.descriptionAr,
    effectiveDate: effective.toISOString(),
    expiryDate: expiry,
  });
  if (created.status >= 300) fail(name, 'create', created);
  const id = String((JSON.parse(created.text) as { payload?: { id?: string } }).payload?.id ?? '');
  if (!id) throw new Error(`could not provision "${name}": created but no id came back`);

  const wanted = spec.facilityCodes?.length ?? spec.facilities ?? 1;
  let facilityIds: string[] = [];
  if (wanted > 0) {
    const offered = await assignableFacilityIds(page, id);
    const pool = spec.facilityCodes
      ? offered.filter((f) => spec.facilityCodes!.includes(f.facilityCode)).map((f) => f.id)
      : offered.map((f) => f.id);
    // No fixed fallback facility any more (2026-10-24): the old one, FCL-000007,
    // lapsed mid-run, and every network built on it was refused approval (409)
    // or never went Active - which read as 87 unrelated failures. An empty pool
    // now says so plainly.
    // Nathealth FIRST when the case names no facility (2026-10-25). It was the
    // pool's first entry when the cases were written, and they add FCL-000025 /
    // FCL-000026 to a network as the "other" facility - which the picker no
    // longer offers once the default network already holds it (17755, 17880,
    // 18270).
    if (!spec.facilityCodes) {
      const preferred = offered.find((f) => f.facilityCode === DEFAULT_FACILITY_CODE)?.id;
      if (preferred) facilityIds = [preferred, ...pool.filter((p) => p !== preferred)];
      else facilityIds = pool;
    } else facilityIds = pool;
    facilityIds = facilityIds.slice(0, wanted);
    if (facilityIds.length < wanted) {
      throw new Error(
        `could not provision "${name}": ${wanted} facilities wanted, the environment offers ${facilityIds.length}. `
        + 'The pool holds only ACTIVE pharmacies - check the licence expiry dates in Facility Management.',
      );
    }
    const attached = await NetworkUtils.postAsSession(page, ASSIGN_FACILITIES_ENDPOINT, {
      networkId: id,
      facilityIds,
      confirmRevertToDraft: false,
    });
    if (attached.status >= 300) fail(name, 'attach facilities', attached);
  }
  if (spec.draftOnly) {
    Logger.step(`[fixture] Provisioned draft network "${name}" (${facilityIds.length} facilities, not submitted)`);
    return { id, name, nameAr, facilityIds, stage: 'draft' };
  }

  await submitNetwork(page, id, name);
  if (spec.submitOnly) {
    Logger.step(`[fixture] Provisioned network "${name}" submitted for approval`);
    return { id, name, nameAr, facilityIds, stage: 'submitted' };
  }

  await approvePending(page, name);
  Logger.step(`[fixture] Provisioned network "${name}" (approved; ${facilityIds.length} facilities)`);
  return { id, name, nameAr, facilityIds, stage: 'approved' };
}

/**
 * Polls GetNetwork until the network's status is `code` (pending, active,
 * inactive, expired). The lifecycle job runs every minute in this
 * environment, so a few minutes is normally enough. Throws on timeout.
 */
export async function waitForNetworkStatusCode(page: Page, id: string, code: string, timeoutMs = 6 * 60_000): Promise<void> {
  const ids = await networkStatusIds(page);
  const wanted = ids[code];
  if (!wanted) throw new Error(`the network status lookup has no "${code}"`);
  const deadline = Date.now() + timeoutMs;
  let seen = '';
  while (Date.now() < deadline) {
    const record = await readNetwork(page, id).catch(() => null);
    // effectiveStatusId, not statusId (2026-10-24). An approved inactivation sets
    // isActive false and moves effectiveStatusId to Inactive, but leaves
    // statusId at Active - so waiting on statusId reported every Inactive
    // network as "still Active" and blocked 25 cases in the 2026-10-24 run.
    seen = record?.effectiveStatusId ?? record?.statusId ?? '';
    if (seen === wanted) return;
    await page.waitForTimeout(10_000);
  }
  const labels = await networkStatusLabels(page);
  throw new Error(`network ${id} still reads "${labels[seen] ?? seen}" after ${Math.round(timeoutMs / 60_000)} minutes, not "${code}"`);
}

/**
 * Creates one network for a single case, approved and Active-to-be, and
 * returns its name. Kept for the payer-module callers (networkInStatus).
 *
 * WHY (2026-10-19). The network-status cases used to pick the first network in
 * the wanted status from the list. That is almost always a NETWORK-SEED pool
 * network, which ProtectedData refuses to inactivate, so the cases reported
 * BLOCKED or FAILED on the suite's own guard. Real team networks must not be
 * flipped either. A network the case creates for itself has neither problem.
 */
export async function provisionDisposableNetwork(page: Page): Promise<string> {
  return (await provisionNetwork(page)).name;
}
