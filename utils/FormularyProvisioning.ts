import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { approvePending, networkStamp, payerIdByName } from './NetworkProvisioning';
import { PLAN_SUITE } from '../data/plans/planSuite.data';

/**
 * Formularies for the Plans suite (2026-10-27).
 *
 * A plan cannot be approved without an APPROVED formulary of its own payer, and
 * a formulary cannot be approved without at least one trade (both 409, probed
 * 2026-10-27). So, like the network suite's pharmacies, formularies are the
 * Plans suite's one hard data dependency. The suite owns its formularies -
 * "QA Automation Formulary ..." under the suite's scope payer - and never
 * touches a team formulary.
 *
 * Built through the application's own API, the same calls the Formulary
 * screens make: CreateFormulary -> CreateTier -> AddFormularyTrade -> submit ->
 * approve.
 */

export const SUITE_FORMULARY_PREFIX = 'QA Automation Formulary';

/** The catalogue trade a suite formulary carries (MED-001 Paracetamol 500mg). */
export const SUITE_TRADE_ID = 'f1000000-0000-4000-8000-000000000001';

export interface FormularyOption {
  id: string;
  formularyCode: string | null;
  formularyNameEn: string;
  formularyNameAr: string;
  payerId: string;
  statusId: string;
  effectiveDate: string;
  expiryDate: string;
}

type Answer = { status: number; text: string };

const fail = (name: string, what: string, res: Answer): never => {
  throw new Error(`could not provision formulary "${name}": ${what} answered ${res.status} ${res.text.slice(0, 400)}`);
};

const payloadOf = <T>(res: Answer): T => (JSON.parse(res.text) as { payload: T }).payload;

/** Waits (in the page, so the run stays responsive) until `isoTime` plus a few seconds has passed. */
export async function waitUntil(page: Page, isoTime: string): Promise<void> {
  const remaining = new Date(isoTime).getTime() + 5_000 - Date.now();
  if (remaining > 0) {
    Logger.step(`Waiting ${Math.ceil(remaining / 1000)} s for the effective time to pass`);
    await page.waitForTimeout(remaining);
  }
}

/** Every formulary the dropdown offers - with payer and status - for finding the suite's own. */
export async function listFormularies(page: Page): Promise<FormularyOption[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.formularyDropdown);
  return res.status < 300 ? payloadOf<FormularyOption[]>(res) : [];
}

/** The formulary status lookup, code -> id ("active", "inactive", "pending", ...). */
export async function formularyStatusIds(page: Page): Promise<Record<string, string>> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.formularyStatusLookup);
  const items = res.status < 300 ? payloadOf<{ id: string; code: string }[]>(res) : [];
  return Object.fromEntries(items.map((i) => [i.code, i.id]));
}

export interface FormularySpec {
  nameEn?: string;
  /** The owning payer, by name. Defaults to the suite's scope payer. */
  payerName: string;
  /** Effective this many minutes from now (default 1 - the lifecycle job then makes it Active). */
  effectiveInMinutes?: number;
  /** Expiry this many days from now (default ~3 years). */
  expiryInDays?: number;
}

/**
 * Creates and approves one formulary with a single tier and trade, and returns
 * it. Needs a signed-in page on the application (postAsSession reads its token).
 */
export async function provisionFormulary(page: Page, spec: FormularySpec): Promise<FormularyOption> {
  const name = spec.nameEn ?? `${SUITE_FORMULARY_PREFIX} ${networkStamp()}`;
  const payerId = await payerIdByName(page, spec.payerName);
  const effective = new Date(Date.now() + (spec.effectiveInMinutes ?? 1) * 60_000).toISOString();
  const expiry = new Date(Date.now() + (spec.expiryInDays ?? 3 * 365) * 86_400_000).toISOString();
  Logger.step(`[formulary] Creating "${name}" for "${spec.payerName}"`);

  const created = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyCreate, {
    formularyNameEn: name,
    formularyNameAr: 'قائمة الأتمتة',
    payerId,
    descriptionEn: 'Owned by the automation suite.',
    descriptionAr: 'تملكها حزمة الأتمتة',
    effectiveDate: effective,
    expiryDate: expiry,
  });
  if (created.status >= 300) fail(name, 'create', created);
  const id = payloadOf<{ id: string }>(created).id;

  const tier = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyCreateTier, {
    formularyId: id,
    tierNameEn: 'Automation Tier',
    tierNameAr: 'مستوى الأتمتة',
    tierOrder: 1,
    descriptionEn: null,
    descriptionAr: null,
    defaultCoveragePercentage: 80,
  });
  if (tier.status >= 300) fail(name, 'create tier', tier);
  const tierId = payloadOf<string>(tier);

  const trade = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyAddTrade, {
    formularyId: id,
    tradeId: SUITE_TRADE_ID,
    tierId,
    coveragePercentage: 80,
    baseCost: 10,
    publicPrice: 12,
    supplierPrice: 9,
    discountPercentage: 0,
    vatPercentage: 0,
    rebateTypeId: null,
    rebateValue: null,
    // From the formulary's own effective time, so a priced trade is CURRENT when
    // the formulary is approved (a trade priced from later left it Pending).
    effectiveFrom: effective,
    effectiveTo: expiry,
  });
  if (trade.status >= 300) fail(name, 'add trade', trade);

  const submitted = await NetworkUtils.postAsSession(page, ApiEndpoints.formularySubmit, { formularyId: id });
  if (submitted.status >= 300) fail(name, 'submit', submitted);
  // APPROVED AFTER THE EFFECTIVE TIME (2026-10-27). The status is decided at
  // approval: approved before its effective time a formulary reads Pending and
  // waits for the DAILY lifecycle job (FORM-0030 sat Pending 20 minutes past its
  // effective time), and only an Active formulary can be assigned to a plan.
  await waitUntil(page, effective);
  await approvePending(page, name);

  const read = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyGet, { id });
  return payloadOf<FormularyOption>(read);
}

/**
 * The suite's approved formulary for `payerName` - an existing
 * "QA Automation Formulary ..." when there is one, else a new one. Reused across
 * cases so the suite does not mint a formulary per plan.
 */
export async function suiteFormulary(page: Page, payerName: string): Promise<FormularyOption> {
  const payerId = await payerIdByName(page, payerName);
  // A configured formulary wins while the suite's own are not Active yet
  // (data/plans/planSuite.data.ts) - when it belongs to this payer.
  if (PLAN_SUITE.formularyCode) {
    const configured = (await listFormularies(page)).find((f) => f.formularyCode === PLAN_SUITE.formularyCode);
    if (!configured) throw new Error(`the configured formulary ${PLAN_SUITE.formularyCode} is not in the register`);
    if (configured.payerId === payerId) return configured;
  }
  const status = await formularyStatusIds(page);
  // ACTIVE only: a Pending formulary cannot be assigned to a plan (409).
  const usable = new Set([status.active].filter(Boolean));
  const existing = (await listFormularies(page)).find((f) =>
    f.payerId === payerId
    && f.formularyNameEn.startsWith(SUITE_FORMULARY_PREFIX)
    && Boolean(f.formularyCode)
    && !/-D-/.test(f.formularyCode ?? '')
    && usable.has(f.statusId)
    && new Date(f.expiryDate).getTime() > Date.now() + 30 * 86_400_000);
  if (existing) return existing;
  return provisionFormulary(page, { payerName });
}

// ---- plan folder 20 / 27 additions (2026-10-27) ----
// The formulary-side calls the plan stories make: reading what depends on a
// formulary, changing its payer, deleting and deactivating it. Shapes read off
// the application's own formulary service (main bundle, 2026-10-27); not yet
// observed in live traffic - the lead verifies them on the first run.

/** One formulary as GetFormulary answers it, with what depends on it. */
export interface FormularyRecord extends FormularyOption {
  payerNameEn?: string;
  concurrencyStamp?: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  /** Plans whose version carries it (the detail screen blocks Delete when > 0). */
  assignedPlanCount?: number;
  /** Plan changes awaiting approval that assign it (MSG-PLN-019 when > 0). */
  pendingPlanVersionCount?: number;
  linkedPolicyCount?: number;
  isPendingCreate?: boolean;
  [key: string]: unknown;
}

/** One formulary through GetFormulary; throws when it cannot be read. */
export async function readFormulary(page: Page, id: string): Promise<FormularyRecord> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyGet, { id });
  if (res.status >= 300) throw new Error(`GetFormulary ${id} answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOf<FormularyRecord>(res);
}

/** One formulary, or null when the server no longer returns it (deleted). */
export async function readFormularyOrNull(page: Page, id: string): Promise<FormularyRecord | null> {
  return readFormulary(page, id).catch(() => null);
}

/** The formulary's status code ("active", "inactive", "pending", ...), '' when unknown. */
export async function formularyStatusCode(page: Page, id: string): Promise<string> {
  const record = await readFormularyOrNull(page, id);
  if (!record) return '';
  const codes = Object.fromEntries(Object.entries(await formularyStatusIds(page)).map(([code, statusId]) => [statusId, code]));
  return codes[record.statusId] ?? '';
}

/**
 * Saves the formulary's metadata unchanged except for its payer - the edit
 * drawer's own UpdateFormulary call. Returns the server's answer as is, so a
 * case can assert a refusal (MSG-PLN-018) as well as an acceptance.
 */
export async function updateFormularyPayer(page: Page, id: string, payerId: string): Promise<Answer> {
  const current = await readFormulary(page, id);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.formularyUpdate, {
    id,
    concurrencyStamp: current.concurrencyStamp ?? '',
    formularyNameEn: current.formularyNameEn,
    formularyNameAr: current.formularyNameAr,
    payerId,
    descriptionEn: current.descriptionEn ?? null,
    descriptionAr: current.descriptionAr ?? null,
    effectiveDate: current.effectiveDate,
    expiryDate: current.expiryDate,
    confirmRevertToDraft: true,
  });
}

/** Deletes (or stages the deletion of) a formulary - DELETE DeleteFormulary/{id}. */
export async function deleteFormulary(page: Page, id: string, confirmRevertToDraft = true): Promise<Answer> {
  const query = confirmRevertToDraft ? '?confirmRevertToDraft=true' : '';
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.formularyDelete}/${id}${query}`);
}

/** Sends a formulary's staged change for approval and approves it (throws on failure). */
export async function publishFormularyChange(page: Page, id: string, name: string): Promise<void> {
  const submitted = await NetworkUtils.postAsSession(page, ApiEndpoints.formularySubmit, { formularyId: id });
  if (submitted.status >= 300) fail(name, 'submit', submitted);
  await approvePending(page, name);
}

/**
 * Deletes a formulary and, when the deletion was only staged (a published
 * formulary), sends it for approval and approves it. Throws unless the
 * formulary is gone from the register afterwards.
 */
export async function deleteFormularyAndApply(page: Page, formulary: FormularyOption): Promise<void> {
  const res = await deleteFormulary(page, formulary.id);
  if (res.status >= 300) fail(formulary.formularyNameEn, 'delete', res);
  const stillListed = (await listFormularies(page)).some((f) => f.id === formulary.id);
  if (stillListed) await publishFormularyChange(page, formulary.id, formulary.formularyNameEn);
  const listed = (await listFormularies(page)).some((f) => f.id === formulary.id);
  if (listed) throw new Error(`formulary "${formulary.formularyNameEn}" is still in the register after its deletion was approved`);
}

/** Stages a formulary's deactivation (SetFormularyActive isActive=false) and returns the answer. */
export async function stageFormularyDeactivation(page: Page, id: string): Promise<Answer> {
  const reasons = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.formularyInactivationReasonLookup);
  const reasonId = reasons.status < 300 ? (payloadOf<{ id: string }[]>(reasons)[0]?.id ?? null) : null;
  return NetworkUtils.postAsSession(page, ApiEndpoints.formularySetActive, {
    id,
    isActive: false,
    inactivationReasonId: reasonId,
    inactivationDetails: 'Deactivated to provision a plan case precondition.',
    confirmRevertToDraft: true,
  });
}

/** Deactivates a formulary end to end (stage, submit, approve); throws unless it reads Inactive. */
export async function deactivateFormulary(page: Page, formulary: FormularyOption): Promise<void> {
  const staged = await stageFormularyDeactivation(page, formulary.id);
  if (staged.status >= 300) fail(formulary.formularyNameEn, 'deactivate', staged);
  await publishFormularyChange(page, formulary.id, formulary.formularyNameEn);
  const code = await formularyStatusCode(page, formulary.id);
  if (code !== 'inactive') throw new Error(`formulary "${formulary.formularyNameEn}" reads "${code}" after its deactivation was approved, not "inactive"`);
}
