import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { toArabicToken } from '../data/payers/payer.data';
import { approvePending, networkStamp, payerIdByName } from './NetworkProvisioning';
import { suiteFormulary, waitUntil } from './FormularyProvisioning';
import { PLAN_SUITE } from '../data/plans/planSuite.data';

/**
 * Plans built for a case through the application's own API (2026-10-27) - the
 * same calls the Add Plan wizard, the Formulary Assignment tab and the approval
 * queue make. Mirrors utils/NetworkProvisioning.ts.
 *
 * A plan is created as a draft ("Not Live", `PLN-D-nnnn`), must carry an
 * APPROVED formulary of its own payer before it can be approved (409 otherwise),
 * and then follows the lifecycle job (every minute here): an approved plan whose
 * effective time has arrived turns Active. Read `effectiveStatusId`, as for
 * networks - `statusId` lags the displayed status.
 */

export const DISPOSABLE_PLAN_PREFIX = 'Automation Plan';

/** Plan type lookup codes ("individual", "family", "group"). */
export type PlanTypeCode = 'individual' | 'family' | 'group';

export interface PlanSpec {
  nameEn?: string;
  nameAr?: string;
  type?: PlanTypeCode;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  effectiveInMinutes?: number;
  /** Minutes from now; default a year. */
  expiryInMinutes?: number;
  /** The owning payer by name; defaults to the Plans suite payer (data/plans/planSuite.data.ts). */
  payerName?: string;
  /** A formulary to assign instead of the suite's own (its id). */
  formularyId?: string;
  /** Leave the plan without a formulary (only meaningful with draftOnly / submitOnly). */
  noFormulary?: boolean;
  /** Create only - "Not Live", v0 Draft. */
  draftOnly?: boolean;
  /** Create, assign and submit - v0 Pending Approval. */
  submitOnly?: boolean;
}

export interface ProvisionedPlan {
  id: string;
  name: string;
  nameAr: string;
  payerName: string;
  formularyId: string | null;
  stage: 'draft' | 'submitted' | 'approved';
}

export interface PlanRecord {
  id: string;
  planCode: string | null;
  planNameEn: string;
  planNameAr: string;
  payerId: string;
  payerNameEn: string;
  planTypeId: string;
  effectiveDate: string;
  expiryDate: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  statusId: string;
  effectiveStatusId?: string;
  isActive: boolean;
  formularyId: string | null;
  concurrencyStamp?: string;
  currentVersion?: number;
  hasPendingVersion?: boolean;
  hasDraft?: boolean;
  isPendingCreate?: boolean;
  versionStatusCode?: string | null;
  [key: string]: unknown;
}

type Answer = { status: number; text: string };

const fail = (name: string, what: string, res: Answer): never => {
  throw new Error(`could not provision plan "${name}": ${what} answered ${res.status} ${res.text.slice(0, 400)}`);
};

const payloadOf = <T>(res: Answer): T => (JSON.parse(res.text) as { payload: T }).payload;

const lookup = async (page: Page, url: string): Promise<{ id: string; code: string; englishName: string; arabicName: string }[]> => {
  const res = await NetworkUtils.requestAsSession(page, 'GET', url);
  return res.status < 300 ? payloadOf(res) : [];
};

/** Plan status code -> id ("active", "inactive", "pending", "expired", "notLive"...). */
export async function planStatusIds(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries((await lookup(page, ApiEndpoints.planStatusLookup)).map((i) => [i.code, i.id]));
}

/** Plan status id -> English label, for messages. */
export async function planStatusLabels(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries((await lookup(page, ApiEndpoints.planStatusLookup)).map((i) => [i.id, i.englishName]));
}

export async function planTypeId(page: Page, code: PlanTypeCode = 'individual'): Promise<string> {
  const match = (await lookup(page, ApiEndpoints.planTypeLookup)).find((i) => i.code === code);
  if (!match) throw new Error(`the plan type lookup has no "${code}"`);
  return match.id;
}

export async function planInactivationReasons(page: Page): Promise<{ id: string; code: string; englishName: string; arabicName: string }[]> {
  return lookup(page, ApiEndpoints.planInactivationReasonLookup);
}

export async function readPlan(page: Page, id: string): Promise<PlanRecord> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.planGet, { id });
  if (res.status >= 300) throw new Error(`GetPlan ${id} answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOf<PlanRecord>(res);
}

export async function listPlans(page: Page, body: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.planList, { pageNumber: 1, rowsPerPage: 200, sortBy: 'CreatedOn desc', ...body });
  return res.status < 300 ? (payloadOf<{ plans: { items: Record<string, unknown>[] } }>(res).plans?.items ?? []) : [];
}

export async function planIdByName(page: Page, name: string): Promise<string | null> {
  const row = (await listPlans(page, { searchText: name })).find((r) => String(r.planNameEn) === name);
  return row ? String(row.id) : null;
}

export async function assignFormulary(page: Page, planId: string, formularyId: string, name = planId): Promise<void> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.planAssignFormulary, { planId, formularyId });
  if (res.status >= 300) fail(name, 'assign formulary', res);
}

export async function submitPlan(page: Page, planId: string, name = planId): Promise<void> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.planSubmit, { planId });
  if (res.status >= 300) fail(name, 'submit', res);
}

/** Deletes (or stages the deletion of) a plan through the API. Best effort. */
export async function deletePlanById(page: Page, id: string): Promise<Answer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.planDelete}/${id}`);
}

/**
 * Builds a plan for one case: create -> assign the suite formulary -> submit ->
 * approve. Stops early for `draftOnly` / `submitOnly`. Effective a minute ahead
 * by default ("now" is refused as being in the past), so the lifecycle job makes
 * an approved plan Active within a minute or two.
 */
export async function provisionPlan(page: Page, spec: PlanSpec = {}): Promise<ProvisionedPlan> {
  const stamp = networkStamp();
  const name = spec.nameEn ?? `${DISPOSABLE_PLAN_PREFIX} ${stamp}`;
  const nameAr = spec.nameAr ?? `خطة ${toArabicToken(stamp)}`;
  const payerName = spec.payerName ?? PLAN_SUITE.payerName;
  const effective = new Date(Date.now() + (spec.effectiveInMinutes ?? 1) * 60_000).toISOString();
  const expiry = new Date(Date.now() + (spec.expiryInMinutes ?? 365 * 24 * 60) * 60_000).toISOString();
  Logger.step(`[plan] Creating "${name}" for "${payerName}"`);

  const created = await NetworkUtils.postAsSession(page, ApiEndpoints.planCreate, {
    planNameEn: name,
    planNameAr: nameAr,
    payerId: await payerIdByName(page, payerName),
    planTypeId: await planTypeId(page, spec.type),
    descriptionEn: spec.descriptionEn === undefined ? 'Created by an automated case for its own use.' : spec.descriptionEn,
    descriptionAr: spec.descriptionAr === undefined ? `وصف ${toArabicToken(stamp)}` : spec.descriptionAr,
    effectiveDate: effective,
    expiryDate: expiry,
  });
  if (created.status >= 300) fail(name, 'create', created);
  const id = payloadOf<{ id: string }>(created).id;
  const plan: ProvisionedPlan = { id, name, nameAr, payerName, formularyId: null, stage: 'draft' };

  if (!spec.noFormulary) {
    plan.formularyId = spec.formularyId ?? (await suiteFormulary(page, payerName)).id;
    await assignFormulary(page, id, plan.formularyId, name);
  }
  if (spec.draftOnly) return plan;

  await submitPlan(page, id, name);
  plan.stage = 'submitted';
  if (spec.submitOnly) return plan;

  // Approved once the effective time has passed, so the plan is Active at once
  // rather than Pending until the lifecycle job (the formulary rule, 2026-10-27).
  // A plan meant to start later (effectiveInMinutes set far ahead) is approved
  // at once and reads Pending, as intended.
  if ((spec.effectiveInMinutes ?? 1) <= 5) await waitUntil(page, effective);
  await approvePending(page, name);
  plan.stage = 'approved';
  return plan;
}

/** Waits for the plan's displayed status (effectiveStatusId) to reach `code`. */
export async function waitForPlanStatusCode(page: Page, id: string, code: string, timeoutMs = 6 * 60_000): Promise<void> {
  const ids = await planStatusIds(page);
  const wanted = ids[code];
  if (!wanted) throw new Error(`the plan status lookup has no "${code}" (it offers ${Object.keys(ids).join(', ')})`);
  const deadline = Date.now() + timeoutMs;
  let seen = '';
  while (Date.now() < deadline) {
    const record = await readPlan(page, id).catch(() => null);
    seen = record?.effectiveStatusId ?? record?.statusId ?? '';
    if (seen === wanted) return;
    await page.waitForTimeout(10_000);
  }
  const labels = await planStatusLabels(page);
  throw new Error(`plan ${id} still reads "${labels[seen] ?? seen}" after ${Math.round(timeoutMs / 60_000)} minutes, not "${code}"`);
}
