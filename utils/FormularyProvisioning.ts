import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { approvePending, networkStamp, payerIdByName, pendingRequestId } from './NetworkProvisioning';
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
  // The EFFECTIVE status, which is what the screens show (2026-11-02): a
  // deactivated formulary keeps `statusId` active with `isActive` false and
  // `effectiveStatusId` inactive.
  const effective = typeof record.effectiveStatusId === 'string' ? record.effectiveStatusId : '';
  return codes[effective] ?? codes[record.statusId] ?? '';
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
  // The Deactivate drawer's lookup is `formularyDeactivationReason`; the
  // `formularyInactivationReason` first guessed here answers an empty list
  // (verified 2026-11-02), so it is only the fallback now.
  let reasonId: string | null = null;
  for (const path of [ApiEndpoints.formularyDeactivationReasonLookup, ApiEndpoints.formularyInactivationReasonLookup]) {
    const reasons = await NetworkUtils.requestAsSession(page, 'GET', path);
    reasonId = reasons.status < 300 ? (payloadOf<{ id: string }[]>(reasons)[0]?.id ?? null) : null;
    if (reasonId) break;
  }
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

// ===========================================================================
// ---- Formulary module suite (Feature 15190, 2026-11-02) ----
// ===========================================================================
//
// The Formulary suite builds its own formularies under payer "Al sharq", every
// one named `QA Automation Formulary ...`, through the same calls the screens
// make. Request shapes were read off the application's formulary service and
// CAPTURED from the screens' own calls on 2026-11-02 (see
// reports/formulary/Formulary-Foundation-Notes.md). Nothing here changes a
// formulary without the suite prefix: the formulary-level writers check the
// name first (assertSuiteOwned).

/** The suite's owning payer (the Plans suite's too). */
export const FORMULARY_SUITE_PAYER = 'Al sharq';

/** The catalogue trades a suite formulary may carry, in order (MED-001..003). */
export const SUITE_TRADES = [
  { id: 'f1000000-0000-4000-8000-000000000001', code: 'MED-001', nameEn: 'Paracetamol 500mg' },
  { id: 'f1000000-0000-4000-8000-000000000002', code: 'MED-002', nameEn: 'Amoxicillin 250mg' },
  { id: 'f1000000-0000-4000-8000-000000000003', code: 'MED-003', nameEn: 'Metformin 850mg' },
] as const;

/** A server answer, as NetworkUtils returns it. */
export type FormularyAnswer = { status: number; text: string; validationErrors?: string[] };

/** Every message an answer carries (title, detail, validation reasons) as one string - for assertions. */
export function answerText(res: FormularyAnswer): string {
  try {
    const body = JSON.parse(res.text) as Record<string, unknown>;
    // Success bodies carry `successMessage`; error bodies `Title` / `ErrorMessage` / `ValidationErrors` (2026-11-02).
    const parts = [body.successMessage, body.Title, body.title, body.ErrorMessage, body.errorMessage, body.detail, body.message]
      .filter((v) => typeof v === 'string' && v !== '') as string[];
    const errors = (body.ValidationErrors ?? body.validationErrors ?? []) as { Reason?: string; reason?: string }[];
    for (const e of errors) parts.push(String(e.Reason ?? e.reason ?? ''));
    return parts.join(' | ') || res.text.slice(0, 400);
  } catch {
    return res.text.slice(0, 400);
  }
}

const payloadOrNull = <T>(res: Answer): T | null => {
  try {
    return (JSON.parse(res.text) as { payload: T }).payload ?? null;
  } catch {
    return null;
  }
};

/** A unique stamp for suite names. */
export const formularyStamp = (): string => `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;

/** A fresh suite name: `QA Automation Formulary <label> <stamp>`. */
export const suiteFormularyName = (label = ''): string =>
  `${SUITE_FORMULARY_PREFIX}${label ? ` ${label}` : ''} ${formularyStamp()}`;

/** ISO time `minutes` from now. */
export const minutesFromNow = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString();

/** `DD/MM/YYYY HH:mm` (local time) - how every formulary date picker takes and shows a date. */
export function formularyDateText(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

// ---- lookups ----------------------------------------------------------------

type LookupItem = { id: string; code: string; englishName: string };

async function lookupItems(page: Page, path: string): Promise<LookupItem[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', path);
  return res.status < 300 ? (payloadOrNull<LookupItem[]>(res) ?? []) : [];
}

/** A lookup as code -> item. */
export async function formularyLookup(page: Page, path: string): Promise<Record<string, LookupItem>> {
  return Object.fromEntries((await lookupItems(page, path)).map((i) => [i.code, i]));
}

/** Rebate types: `percentOfNetPrice` "Percent of Net Price", `flatValue` "Flat Value", `perDispenseUnit` "Per Dispense Unit". */
export type RebateTypeCode = 'percentOfNetPrice' | 'flatValue' | 'perDispenseUnit';

export async function rebateTypeId(page: Page, code: RebateTypeCode): Promise<string> {
  const item = (await formularyLookup(page, ApiEndpoints.rebateTypeLookup))[code];
  if (!item) throw new Error(`the rebateType lookup has no "${code}"`);
  return item.id;
}

/** The Deactivate drawer's reasons (`formularyDeactivationReason`). */
export async function deactivationReasons(page: Page): Promise<LookupItem[]> {
  return lookupItems(page, ApiEndpoints.formularyDeactivationReasonLookup);
}

/** Trade status lookup code -> id (`active`, `suspended`). */
export async function formularyTradeStatusIds(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries((await lookupItems(page, ApiEndpoints.formularyTradeStatusLookup)).map((i) => [i.code, i.id]));
}

// ---- reading ------------------------------------------------------------------

/** One list row as GetFormularies answers it. */
export interface FormularyListItem {
  id: string;
  formularyCode: string | null;
  formularyNameEn: string;
  formularyNameAr: string;
  payerId: string;
  payerNameEn: string;
  descriptionEn: string | null;
  statusId: string;
  effectiveStatusId: string;
  isActive: boolean;
  effectiveDate: string;
  expiryDate: string;
  tierCount: number;
  tradeCount: number;
  assignedPlanCount: number;
  currentVersion: number;
  hasPendingVersion: boolean;
  hasDraft: boolean;
  isPendingCreate: boolean;
  /** `draft` | `pendingApproval` | `rejected` | null (approved, nothing staged). */
  versionStatusCode: string | null;
  createdOn: string;
}

/** The formulary list (GetFormularies) with any criteria - `{ items, totalRows }`. */
export async function listFormularyRegister(
  page: Page,
  criteria: Record<string, unknown> = {},
  rows = 100,
): Promise<{ items: FormularyListItem[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyList, { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', ...criteria });
  if (res.status >= 300) throw new Error(`GetFormularies answered ${res.status} ${res.text.slice(0, 200)}`);
  const list = payloadOrNull<{ formularies: { items: FormularyListItem[]; totalRows: number } }>(res)?.formularies;
  return { items: list?.items ?? [], totalRows: list?.totalRows ?? 0 };
}

/** The KPI tiles' numbers (GetFormulariesDashboard). */
export interface FormularyDashboard {
  total: number;
  active: number;
  pending: number;
  inactive: number;
  expired: number;
  pendingApproval: number;
}

export async function readFormularyDashboard(page: Page): Promise<FormularyDashboard> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyDashboard, {});
  const body = payloadOrNull<FormularyDashboard>(res);
  if (res.status >= 300 || !body) throw new Error(`GetFormulariesDashboard answered ${res.status} ${res.text.slice(0, 200)}`);
  return body;
}

/** A formulary by its exact English name (a GetFormularies search), or null. */
export async function findFormularyByName(page: Page, nameEn: string): Promise<FormularyListItem | null> {
  const { items } = await listFormularyRegister(page, { searchText: nameEn }, 50);
  return items.find((f) => f.formularyNameEn === nameEn) ?? null;
}

/** Throws unless the formulary is one the suite created (its name carries the suite prefix). */
export async function assertSuiteOwned(page: Page, formularyId: string): Promise<FormularyRecord> {
  const record = await readFormulary(page, formularyId);
  if (!record.formularyNameEn.startsWith(SUITE_FORMULARY_PREFIX)) {
    throw new Error(`refusing to change formulary "${record.formularyNameEn}" (${record.formularyCode ?? formularyId}): it is not a suite formulary`);
  }
  return record;
}

export interface FormularyTier {
  id: string;
  formularyId: string;
  tierNameEn: string;
  tierNameAr: string;
  tierOrder: number;
  descriptionEn: string | null;
  descriptionAr: string | null;
  defaultCoveragePercentage: number;
  concurrencyStamp: string;
  tradeCount: number;
}

export async function readTiers(page: Page, formularyId: string): Promise<FormularyTier[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyTiers, { formularyId });
  if (res.status >= 300) throw new Error(`GetTiers answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOrNull<FormularyTier[]>(res) ?? [];
}

export interface FormularyTrade {
  /** The formulary-trade id (cards are `formulary-trades-card-{id}`). */
  id: string;
  /** The catalogue trade id. */
  tradeId: string;
  tradeCode: string;
  tradeNameEn: string;
  tierId: string;
  tierNameEn: string;
  coveragePercentage: number;
  statusId: string;
  currentNetPrice: number | null;
  rebateTypeId: string | null;
  rebateValue: number | null;
  hasNoCurrentOrFuturePrice: boolean;
}

export async function readTrades(page: Page, formularyId: string, criteria: Record<string, unknown> = {}): Promise<FormularyTrade[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyTrades, { formularyId, pageNumber: 1, rowsPerPage: 1000, ...criteria });
  if (res.status >= 300) throw new Error(`GetFormularyTrades answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOrNull<{ trades: { items: FormularyTrade[] } }>(res)?.trades.items ?? [];
}

export interface PricePeriod {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  baseCost: number;
  publicPrice: number;
  supplierPrice: number;
  discountPercentage: number;
  vatPercentage: number;
  netPrice: number;
  concurrencyStamp: string;
  /** `future` | `current` | `expired`. */
  periodStatus: string;
  rebateTypeId: string | null;
  rebateValue: number | null;
  isDraft: boolean;
  draftChangeType: string | null;
}

export async function readPriceHistory(page: Page, formularyTradeId: string): Promise<PricePeriod[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyPriceHistory, { formularyTradeId });
  if (res.status >= 300) throw new Error(`GetPriceHistory answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOrNull<PricePeriod[]>(res) ?? [];
}

export interface BenefitConfig {
  id: string;
  benefitConfigNameEn: string;
  benefitConfigNameAr: string;
  copaymentAmount: number | null;
  coinsurancePercentage: number | null;
  deductible: number | null;
  outOfPocketMaximum: number | null;
  maximumCopayAmount: number | null;
  minimumMemberContribution: number | null;
  sublimitAmount: number | null;
  benefitEffectiveDate: string;
  benefitEndDate: string | null;
  concurrencyStamp?: string;
  [key: string]: unknown;
}

export async function readBenefitConfigs(page: Page, formularyTradeId: string): Promise<BenefitConfig[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.benefitConfigList, { formularyTradeId, pageNumber: 1, rowsPerPage: 1000 });
  if (res.status >= 300) throw new Error(`GetBenefitConfigs answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOrNull<{ benefitConfigs: { items: BenefitConfig[] } }>(res)?.benefitConfigs.items ?? [];
}

export interface FormularyVersion {
  id: string;
  version: number;
  isStatusChange: boolean;
  /** `draft` | `pendingApproval` | `published` | `rejected` | `superseded` - an approved version reads `published`, never `approved` (live tally, 2026-11-02). */
  versionStatusCode: string;
  versionStatusEn: string;
  /** "Create", "Update", ... */
  changeType: string;
  formularyNameEn: string;
  statusId: string;
  effectiveDate: string;
  expiryDate: string;
  requestedByNameEn: string | null;
  requestedOn: string | null;
  reviewedByNameEn: string | null;
  reviewedOn: string | null;
  reviewNote: string | null;
  [key: string]: unknown;
}

export async function readVersions(page: Page, formularyId: string): Promise<FormularyVersion[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.formularyVersions}/${formularyId}`);
  if (res.status >= 300) throw new Error(`GetFormularyVersions answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOrNull<FormularyVersion[]>(res) ?? [];
}

export interface FormularyAuditEntry {
  id: string;
  [key: string]: unknown;
}

/** The formulary's audit trail (first 500 entries), newest first. */
export async function readAuditTrail(page: Page, formularyId: string, actionType: string | null = null): Promise<{ items: FormularyAuditEntry[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyAuditTrail, { formularyId, actionType, pageNumber: 1, rowsPerPage: 500 });
  if (res.status >= 300) throw new Error(`GetFormularyAuditTrail answered ${res.status} ${res.text.slice(0, 200)}`);
  const body = payloadOrNull<{ items: FormularyAuditEntry[]; totalRows: number }>(res);
  return { items: body?.items ?? [], totalRows: body?.totalRows ?? 0 };
}

// ---- writing: the formulary ------------------------------------------------------

export interface FormularyBasics {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  /** The owning payer by name (default "Al sharq"). */
  payerName?: string;
  /** Effective this many minutes from now (default 2 days: a draft never goes live by itself). */
  effectiveInMinutes?: number;
  /** Expiry this many days after now (default 400). */
  expiryInDays?: number;
  /** Exact ISO dates, overriding the relative ones. */
  effectiveDate?: string;
  expiryDate?: string;
}

/** Sends CreateFormulary and returns the answer as is (for the refusal cases too), with the new id. */
export async function requestCreateFormulary(page: Page, basics: FormularyBasics & { payerId?: string } = {}): Promise<FormularyAnswer & { id: string | null }> {
  const payerId = basics.payerId ?? (await payerIdByName(page, basics.payerName ?? FORMULARY_SUITE_PAYER));
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyCreate, {
    formularyNameEn: basics.nameEn ?? suiteFormularyName(),
    formularyNameAr: basics.nameAr ?? 'قائمة الأتمتة',
    payerId,
    descriptionEn: basics.descriptionEn === undefined ? 'Owned by the automation suite.' : basics.descriptionEn,
    descriptionAr: basics.descriptionAr === undefined ? 'تملكها حزمة الأتمتة' : basics.descriptionAr,
    effectiveDate: basics.effectiveDate ?? minutesFromNow(basics.effectiveInMinutes ?? 2 * 24 * 60),
    expiryDate: basics.expiryDate ?? new Date(Date.now() + (basics.expiryInDays ?? 400) * 86_400_000).toISOString(),
  });
  return { ...res, id: res.status < 300 ? (payloadOrNull<{ id: string }>(res)?.id ?? null) : null };
}

/**
 * UpdateFormulary with the current values plus `changes` (the Edit drawer's
 * body). A published formulary's edit is staged as a draft version;
 * `confirmRevertToDraft` lets a pending request go back to draft (the screen's
 * "Return to draft?" prompt).
 */
export async function updateFormularyFields(
  page: Page,
  id: string,
  changes: Partial<Pick<FormularyRecord, 'formularyNameEn' | 'formularyNameAr' | 'descriptionEn' | 'descriptionAr' | 'effectiveDate' | 'expiryDate' | 'payerId'>>,
  confirmRevertToDraft = true,
): Promise<FormularyAnswer> {
  const current = await assertSuiteOwned(page, id);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.formularyUpdate, {
    id,
    concurrencyStamp: current.concurrencyStamp ?? '',
    formularyNameEn: current.formularyNameEn,
    formularyNameAr: current.formularyNameAr,
    payerId: current.payerId,
    descriptionEn: current.descriptionEn ?? null,
    descriptionAr: current.descriptionAr ?? null,
    effectiveDate: current.effectiveDate,
    expiryDate: current.expiryDate,
    ...changes,
    confirmRevertToDraft,
  });
}

/** SubmitFormularyForApproval `{ formularyId }` - the answer as is. */
export async function submitFormulary(page: Page, formularyId: string): Promise<FormularyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.formularySubmit, { formularyId });
}

/** Approves the formulary's pending request (the shared approvals module), by its name. */
export async function approveFormulary(page: Page, nameEn: string): Promise<void> {
  await approvePending(page, nameEn);
}

/** The approval request id waiting for this formulary, '' when none. */
export async function pendingFormularyRequestId(page: Page, nameEn: string): Promise<string> {
  return pendingRequestId(page, nameEn);
}

/** The approval module's rejection reasons (lookup). */
export async function rejectionReasons(page: Page): Promise<LookupItem[]> {
  return lookupItems(page, ApiEndpoints.approvalRejectionReasonLookup);
}

/**
 * Rejects the formulary's pending request through RejectRequest - the body the
 * hub's Reject dialog sends (`{ id, rejectionReasonId, reason }`). Returns the
 * answer as is.
 */
export async function rejectFormulary(page: Page, nameEn: string, reason = 'Rejected by the automation suite.'): Promise<FormularyAnswer> {
  const requestId = await pendingRequestId(page, nameEn);
  if (!requestId) throw new Error(`no pending approval request for "${nameEn}"`);
  const reasons = await rejectionReasons(page);
  const other = reasons.find((r) => /other/i.test(`${r.code} ${r.englishName}`)) ?? reasons[0];
  return NetworkUtils.postAsSession(page, ApiEndpoints.approvalReject, { id: requestId, rejectionReasonId: other?.id ?? null, reason });
}

/** RevertFormularyVersion `{ formularyId, targetVersion }` - stages that version as a draft. */
export async function revertFormulary(page: Page, formularyId: string, targetVersion: number): Promise<FormularyAnswer> {
  await assertSuiteOwned(page, formularyId);
  return NetworkUtils.postAsSession(page, ApiEndpoints.formularyRevert, { formularyId, targetVersion });
}

/**
 * SetFormularyActive - stages a deactivation (first reason offered unless one
 * is given) or an activation. `confirmRevertToDraft` answers the screen's
 * "Return to draft?" prompt when a request is pending.
 */
export async function setFormularyActive(
  page: Page,
  formularyId: string,
  isActive: boolean,
  options: { reasonId?: string | null; details?: string; confirmRevertToDraft?: boolean } = {},
): Promise<FormularyAnswer> {
  await assertSuiteOwned(page, formularyId);
  let reasonId = options.reasonId;
  if (!isActive && reasonId === undefined) reasonId = (await deactivationReasons(page))[0]?.id ?? null;
  return NetworkUtils.postAsSession(page, ApiEndpoints.formularySetActive, {
    id: formularyId,
    isActive,
    ...(isActive ? {} : { inactivationReasonId: reasonId ?? null, inactivationDetails: options.details ?? 'Deactivated by the automation suite.' }),
    confirmRevertToDraft: options.confirmRevertToDraft ?? true,
  });
}

export interface CloneSpec {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  effectiveInMinutes?: number;
  expiryInDays?: number;
  includeTiers?: boolean;
  includeTrades?: boolean;
  includePricing?: boolean;
}

/** CloneFormulary (the Clone drawer's body); returns the answer and the clone's id. */
export async function cloneFormulary(page: Page, sourceFormularyId: string, spec: CloneSpec = {}): Promise<FormularyAnswer & { id: string | null; nameEn: string }> {
  const nameEn = spec.nameEn ?? suiteFormularyName('clone');
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyClone, {
    sourceFormularyId,
    formularyNameEn: nameEn,
    formularyNameAr: spec.nameAr ?? 'نسخة الأتمتة',
    descriptionEn: spec.descriptionEn === undefined ? 'Cloned by the automation suite.' : spec.descriptionEn,
    descriptionAr: spec.descriptionAr === undefined ? null : spec.descriptionAr,
    effectiveDate: minutesFromNow(spec.effectiveInMinutes ?? 2 * 24 * 60),
    expiryDate: new Date(Date.now() + (spec.expiryInDays ?? 400) * 86_400_000).toISOString(),
    includeTiers: spec.includeTiers ?? true,
    includeTrades: spec.includeTrades ?? true,
    includePricing: spec.includePricing ?? true,
  });
  const created = res.status < 300 ? payloadOrNull<{ id?: string } | string>(res) : null;
  let id = typeof created === 'string' ? created : (created?.id ?? null);
  if (res.status < 300 && id === null) id = (await findFormularyByName(page, nameEn))?.id ?? null;
  return { ...res, id, nameEn };
}

// ---- writing: tiers, trades, pricing, rebates, benefit configs ------------------

export interface TierSpec {
  nameEn?: string;
  nameAr?: string;
  order?: number;
  coverage?: number;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
}

/** CreateTier - returns the answer and the new tier's id. */
export async function addTier(page: Page, formularyId: string, tier: TierSpec = {}): Promise<FormularyAnswer & { id: string | null }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyCreateTier, {
    formularyId,
    tierNameEn: tier.nameEn ?? `Tier ${tier.order ?? 1}`,
    tierNameAr: tier.nameAr ?? `مستوى ${tier.order ?? 1}`,
    tierOrder: tier.order ?? 1,
    descriptionEn: tier.descriptionEn ?? null,
    descriptionAr: tier.descriptionAr ?? null,
    defaultCoveragePercentage: tier.coverage ?? 80,
  });
  return { ...res, id: res.status < 300 ? payloadOrNull<string>(res) : null };
}

/** UpdateTier with the tier's current values plus `changes` (the tier drawer's body). */
export async function updateTier(page: Page, formularyId: string, tierId: string, changes: TierSpec): Promise<FormularyAnswer> {
  const tier = (await readTiers(page, formularyId)).find((t) => t.id === tierId);
  if (!tier) throw new Error(`tier ${tierId} is not on formulary ${formularyId}`);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.formularyUpdateTier, {
    id: tierId,
    tierNameEn: changes.nameEn ?? tier.tierNameEn,
    tierNameAr: changes.nameAr ?? tier.tierNameAr,
    tierOrder: changes.order ?? tier.tierOrder,
    descriptionEn: changes.descriptionEn === undefined ? tier.descriptionEn : changes.descriptionEn,
    descriptionAr: changes.descriptionAr === undefined ? tier.descriptionAr : changes.descriptionAr,
    defaultCoveragePercentage: changes.coverage ?? tier.defaultCoveragePercentage,
    concurrencyStamp: tier.concurrencyStamp,
  });
}

/** DeleteTier/{id}. */
export async function deleteTier(page: Page, tierId: string): Promise<FormularyAnswer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.formularyDeleteTier}/${tierId}`);
}

export interface PricingSpec {
  baseCost?: number;
  publicPrice?: number;
  supplierPrice?: number;
  discountPercentage?: number;
  vatPercentage?: number;
  /** ISO; default the formulary's effective date (so the price is current once it goes live). */
  effectiveFrom?: string;
  /** ISO or null (open ended); default the formulary's expiry. */
  effectiveTo?: string | null;
}

export interface TradeSpec extends PricingSpec {
  /** Catalogue trade id (default MED-00n by position). */
  tradeId?: string;
  /** The tier, by id; default the formulary's first tier. */
  tierId?: string;
  coverage?: number;
  rebate?: { type: RebateTypeCode; value: number } | null;
}

/** AddFormularyTrade - returns the answer and the new formulary-trade id (read back by catalogue id). */
export async function addTrade(page: Page, formularyId: string, trade: TradeSpec = {}): Promise<FormularyAnswer & { id: string | null }> {
  const record = await readFormulary(page, formularyId);
  const tierId = trade.tierId ?? (await readTiers(page, formularyId))[0]?.id;
  if (!tierId) throw new Error(`formulary ${formularyId} has no tier to put a trade in`);
  const tradeId = trade.tradeId ?? SUITE_TRADES[0].id;
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyAddTrade, {
    formularyId,
    tradeId,
    tierId,
    coveragePercentage: trade.coverage ?? 80,
    effectiveFrom: trade.effectiveFrom ?? record.effectiveDate,
    effectiveTo: trade.effectiveTo === undefined ? record.expiryDate : trade.effectiveTo,
    baseCost: trade.baseCost ?? 10,
    publicPrice: trade.publicPrice ?? 12,
    supplierPrice: trade.supplierPrice ?? 9,
    discountPercentage: trade.discountPercentage ?? 0,
    vatPercentage: trade.vatPercentage ?? 0,
    rebateTypeId: trade.rebate ? await rebateTypeId(page, trade.rebate.type) : null,
    rebateValue: trade.rebate ? trade.rebate.value : null,
  });
  if (res.status >= 300) return { ...res, id: null };
  // The payload is the new formulary-trade id (2026-11-02); read back when it is not.
  const direct = payloadOrNull<string>(res);
  if (typeof direct === 'string' && !/^0{8}-/.test(direct)) return { ...res, id: direct };
  const added = (await readTrades(page, formularyId)).find((t) => t.tradeId === tradeId);
  return { ...res, id: added?.id ?? null };
}

/** SetFormularyTradeStatus `{ id, suspend }` - Suspend (true) or Activate (false). */
export async function setTradeStatus(page: Page, formularyTradeId: string, suspend: boolean): Promise<FormularyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.formularySetTradeStatus, { id: formularyTradeId, suspend });
}

/** DeleteFormularyTrade/{id} - the card's Remove. */
export async function deleteTrade(page: Page, formularyTradeId: string): Promise<FormularyAnswer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.formularyDeleteTrade}/${formularyTradeId}`);
}

/** AddPricingPeriod - a new price period for a formulary trade; returns the answer and the new period's id. */
export async function addPricingPeriod(page: Page, formularyTradeId: string, period: PricingSpec & { effectiveFrom: string }): Promise<FormularyAnswer & { id: string | null }> {
  const before = new Set((await readPriceHistory(page, formularyTradeId)).map((p) => p.id));
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyAddPricingPeriod, {
    formularyTradeId,
    effectiveFrom: period.effectiveFrom,
    effectiveTo: period.effectiveTo ?? null,
    baseCost: period.baseCost ?? 0,
    publicPrice: period.publicPrice ?? 0,
    supplierPrice: period.supplierPrice ?? 9,
    discountPercentage: period.discountPercentage ?? 0,
    vatPercentage: period.vatPercentage ?? 0,
  });
  if (res.status >= 300) return { ...res, id: null };
  const added = (await readPriceHistory(page, formularyTradeId)).find((p) => !before.has(p.id));
  return { ...res, id: added?.id ?? null };
}

/** UpdatePricingPeriod with the period's current values plus `changes`. */
export async function updatePricingPeriod(page: Page, formularyTradeId: string, periodId: string, changes: PricingSpec): Promise<FormularyAnswer> {
  const period = (await readPriceHistory(page, formularyTradeId)).find((p) => p.id === periodId);
  if (!period) throw new Error(`price period ${periodId} is not on trade ${formularyTradeId}`);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.formularyUpdatePricingPeriod, {
    id: periodId,
    effectiveFrom: changes.effectiveFrom ?? period.effectiveFrom,
    effectiveTo: changes.effectiveTo === undefined ? period.effectiveTo : changes.effectiveTo,
    baseCost: changes.baseCost ?? period.baseCost,
    publicPrice: changes.publicPrice ?? period.publicPrice,
    supplierPrice: changes.supplierPrice ?? period.supplierPrice,
    discountPercentage: changes.discountPercentage ?? period.discountPercentage,
    vatPercentage: changes.vatPercentage ?? period.vatPercentage,
    concurrencyStamp: period.concurrencyStamp,
  });
}

/** DeletePricingPeriod/{id}. */
export async function deletePricingPeriod(page: Page, periodId: string): Promise<FormularyAnswer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.formularyDeletePricingPeriod}/${periodId}`);
}

/** UpsertRebate `{ pricingPeriodId, rebateTypeId, rebateValue }`. */
export async function upsertRebate(page: Page, pricingPeriodId: string, type: RebateTypeCode, value: number): Promise<FormularyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.formularyUpsertRebate, { pricingPeriodId, rebateTypeId: await rebateTypeId(page, type), rebateValue: value });
}

/** DeleteRebate `{ pricingPeriodId }` (the rebate form saved with "No rebate"). */
export async function deleteRebate(page: Page, pricingPeriodId: string): Promise<FormularyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.formularyDeleteRebate, { pricingPeriodId });
}

export interface BenefitConfigSpec {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  copaymentAmount?: number | null;
  coinsurancePercentage?: number | null;
  deductible?: number | null;
  outOfPocketMaximum?: number | null;
  maximumCopayAmount?: number | null;
  minimumMemberContribution?: number | null;
  sublimitAmount?: number | null;
  /** ISO; default two days from now. */
  benefitEffectiveDate?: string;
  benefitEndDate?: string | null;
}

const benefitBody = (spec: BenefitConfigSpec): Record<string, unknown> => ({
  benefitConfigNameEn: spec.nameEn ?? `Automation Benefit ${formularyStamp()}`,
  benefitConfigNameAr: spec.nameAr ?? `منفعة الأتمتة ${Math.floor(Math.random() * 1e6)}`,
  benefitConfigDescriptionEn: spec.descriptionEn ?? null,
  benefitConfigDescriptionAr: spec.descriptionAr ?? null,
  copaymentAmount: spec.copaymentAmount === undefined ? 15 : spec.copaymentAmount,
  coinsurancePercentage: spec.coinsurancePercentage ?? null,
  deductible: spec.deductible ?? null,
  outOfPocketMaximum: spec.outOfPocketMaximum ?? null,
  maximumCopayAmount: spec.maximumCopayAmount ?? null,
  minimumMemberContribution: spec.minimumMemberContribution ?? null,
  sublimitAmount: spec.sublimitAmount ?? null,
  benefitEffectiveDate: spec.benefitEffectiveDate ?? minutesFromNow(2 * 24 * 60),
  benefitEndDate: spec.benefitEndDate ?? null,
});

/** AddBenefitConfig - returns the answer, the new configuration's id and its English name. */
export async function addBenefitConfig(page: Page, formularyTradeId: string, spec: BenefitConfigSpec = {}): Promise<FormularyAnswer & { id: string | null; nameEn: string }> {
  const body = benefitBody(spec);
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.benefitConfigAdd, { ...body, formularyTradeId });
  const nameEn = String(body.benefitConfigNameEn);
  if (res.status >= 300) return { ...res, id: null, nameEn };
  // The answer's payload is an EMPTY guid (00000000-...) - the configuration is
  // saved into the formulary's draft (2026-11-02) - so it is read back by name.
  const id = (await readBenefitConfigs(page, formularyTradeId)).find((b) => b.benefitConfigNameEn === nameEn)?.id ?? null;
  return { ...res, id, nameEn };
}

/** UpdateBenefitConfig with the configuration's current values plus `changes`. */
export async function updateBenefitConfig(page: Page, id: string, changes: BenefitConfigSpec): Promise<FormularyAnswer> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.benefitConfigGet, { id });
  const current = payloadOrNull<BenefitConfig>(res);
  if (!current) throw new Error(`GetBenefitConfig ${id} answered ${res.status} ${res.text.slice(0, 200)}`);
  const merged: BenefitConfigSpec = {
    nameEn: current.benefitConfigNameEn,
    nameAr: current.benefitConfigNameAr,
    descriptionEn: (current.benefitConfigDescriptionEn as string | null | undefined) ?? null,
    descriptionAr: (current.benefitConfigDescriptionAr as string | null | undefined) ?? null,
    copaymentAmount: current.copaymentAmount,
    coinsurancePercentage: current.coinsurancePercentage,
    deductible: current.deductible,
    outOfPocketMaximum: current.outOfPocketMaximum,
    maximumCopayAmount: current.maximumCopayAmount,
    minimumMemberContribution: current.minimumMemberContribution,
    sublimitAmount: current.sublimitAmount,
    benefitEffectiveDate: current.benefitEffectiveDate,
    benefitEndDate: current.benefitEndDate,
    ...changes,
  };
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.benefitConfigUpdate, { ...benefitBody(merged), id, concurrencyStamp: current.concurrencyStamp ?? '' });
}

/** DeleteBenefitConfig/{id}. */
export async function deleteBenefitConfig(page: Page, id: string): Promise<FormularyAnswer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.benefitConfigDelete}/${id}`);
}

// ---- states -----------------------------------------------------------------------

/**
 * The states a formulary case can start from:
 * - Draft            created, never submitted: "Not Live", `v0 · Draft`, temporary code FORM-D-nnnn.
 * - PendingApproval  submitted, undecided: `v0 · Pending Approval`.
 * - Rejected         submitted, then rejected in the approvals module: `v0 · Rejected`
 *                    (resubmitting needs a change first - 409 "no draft changes").
 * - Future           approved: status code `pending`, labelled "Future", `v1 · Approved`.
 * - Active           approved, then (after the effective time) a tier edit approved as v2 - see promoteToActive.
 * - Inactive         Active, then a deactivation submitted and approved (`effectiveStatusId` inactive).
 * - PendingChange    Active, with a tier edit staged AND sent for approval.
 * - DraftChange      Active, with a tier edit staged as a draft version, not sent.
 * Expired is not reachable on demand (the formulary lifecycle job is daily).
 */
export type FormularyState = 'Draft' | 'PendingApproval' | 'Rejected' | 'Future' | 'Active' | 'Inactive' | 'PendingChange' | 'DraftChange';

export interface SuiteFormularySpec extends FormularyBasics {
  /** Tiers: a count (Automation Tier 1..n, orders 1..n) or explicit specs. Default 1. */
  tiers?: number | TierSpec[];
  /** Trades: a count (MED-001..003 in order, all in the first tier) or explicit specs. Default 1 when there is a tier. */
  trades?: number | TradeSpec[];
  /** Benefit configurations on the FIRST trade (count or specs). Default 0. */
  benefitConfigs?: number | BenefitConfigSpec[];
  /** A rebate on the first trade (Add Trade's rebate). */
  rebate?: { type: RebateTypeCode; value: number };
  /** Extra future price periods on the first trade, after the formulary's expiry. */
  extraPricePeriods?: number;
}

export interface ProvisionedFormulary {
  id: string;
  nameEn: string;
  nameAr: string;
  payerId: string;
  payerName: string;
  effectiveDate: string;
  expiryDate: string;
  state: FormularyState;
  tiers: FormularyTier[];
  trades: FormularyTrade[];
  /** The code after provisioning (FORM-D-nnnn while never approved). */
  code: string | null;
}

const LIVE_STATES: readonly FormularyState[] = ['Active', 'Inactive', 'PendingChange', 'DraftChange'];

/**
 * Builds one suite formulary in `state` through the API and returns it. Throws
 * (with the server's answer) when a step is refused - the fixture turns that
 * into BLOCKED. Live states wait about a minute for the effective time to pass
 * before approving: the status is decided AT APPROVAL, and one approved earlier
 * reads Future until the daily lifecycle job runs.
 */
export async function provisionSuiteFormulary(page: Page, state: FormularyState, spec: SuiteFormularySpec = {}): Promise<ProvisionedFormulary> {
  const goesLive = LIVE_STATES.includes(state);
  const nameEn = spec.nameEn ?? suiteFormularyName();
  const nameAr = spec.nameAr ?? 'قائمة الأتمتة';
  const payerName = spec.payerName ?? FORMULARY_SUITE_PAYER;
  const payerId = await payerIdByName(page, payerName);
  // Live states: effective in 2 minutes - long enough to approve v1 and stage
  // the activating change while the price is still future (promoteToActive).
  const effectiveInMinutes = spec.effectiveInMinutes ?? (goesLive ? 2 : 2 * 24 * 60);
  Logger.step(`[formulary] Provisioning "${nameEn}" (${state}) for "${payerName}"`);

  const created = await requestCreateFormulary(page, { ...spec, nameEn, nameAr, payerId, effectiveInMinutes });
  if (created.id === null) fail(nameEn, 'create', created);
  const id = created.id as string;
  const record = await readFormulary(page, id);

  // A formulary cannot be approved without a tier and a trade (409).
  const needsContent = state !== 'Draft';
  const tierSpecs: TierSpec[] = Array.isArray(spec.tiers)
    ? spec.tiers
    : Array.from({ length: spec.tiers ?? 1 }, (_, i) => ({ nameEn: `Automation Tier ${i + 1}`, nameAr: `مستوى الأتمتة ${i + 1}`, order: i + 1, coverage: Math.max(80 - i * 10, 10) }));
  if (needsContent && tierSpecs.length === 0) throw new Error(`a ${state} formulary needs at least one tier`);
  for (const tier of tierSpecs) {
    const added = await addTier(page, id, tier);
    if (added.id === null) fail(nameEn, 'create tier', added);
  }
  const tiers = tierSpecs.length ? await readTiers(page, id) : [];
  const firstTier = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder)[0];

  const tradeSpecs: TradeSpec[] = Array.isArray(spec.trades)
    ? spec.trades
    : Array.from({ length: spec.trades ?? (tiers.length ? 1 : 0) }, () => ({}));
  if (needsContent && tradeSpecs.length === 0) throw new Error(`a ${state} formulary needs at least one trade`);
  if (!Array.isArray(spec.trades) && tradeSpecs.length > SUITE_TRADES.length) throw new Error(`the catalogue offers ${SUITE_TRADES.length} suite trades, not ${tradeSpecs.length}`);
  for (const [i, trade] of tradeSpecs.entries()) {
    const added = await addTrade(page, id, {
      tradeId: SUITE_TRADES[i]?.id,
      tierId: firstTier?.id,
      ...(i === 0 && spec.rebate ? { rebate: spec.rebate } : {}),
      ...trade,
    });
    if (added.id === null) fail(nameEn, `add trade ${i + 1}`, added);
  }
  let trades = tradeSpecs.length ? await readTrades(page, id) : [];
  const firstTrade = trades.find((t) => t.tradeId === (tradeSpecs[0]?.tradeId ?? SUITE_TRADES[0].id)) ?? trades[0];

  if (firstTrade && (spec.extraPricePeriods ?? 0) > 0) {
    let from = new Date(record.expiryDate).getTime() + 60 * 60_000;
    for (let n = 0; n < (spec.extraPricePeriods ?? 0); n += 1) {
      const to = from + 30 * 86_400_000;
      const added = await addPricingPeriod(page, firstTrade.id, { effectiveFrom: new Date(from).toISOString(), effectiveTo: new Date(to).toISOString(), supplierPrice: 10 + n });
      if (added.status >= 300) fail(nameEn, `add price period ${n + 1}`, added);
      from = to + 60 * 60_000;
    }
  }
  const benefitSpecs: BenefitConfigSpec[] = Array.isArray(spec.benefitConfigs)
    ? spec.benefitConfigs
    : Array.from({ length: spec.benefitConfigs ?? 0 }, () => ({}));
  // One trade's configurations may not overlap, and one without an end date
  // runs forever (409 "This date range overlaps with ...", 18738 / 18739 /
  // 18741 on 2026-11-02): a configuration given no end runs 12 hours - or ends
  // an hour before the next one's own date - so the next one, and any a case
  // adds later on, fits after it. An explicit `benefitEndDate: null` stays open.
  const HOUR = 3_600_000;
  let previousEnd: number | null = null;
  for (const [n, benefit] of benefitSpecs.entries()) {
    if (!firstTrade) throw new Error('a benefit configuration needs a trade');
    const start: string = benefit.benefitEffectiveDate ?? (previousEnd === null ? record.effectiveDate : new Date(previousEnd + HOUR).toISOString());
    let end = benefit.benefitEndDate;
    if (end === undefined) {
      const nextStart = benefitSpecs[n + 1]?.benefitEffectiveDate;
      end = new Date(Math.min(Date.parse(start) + 12 * HOUR, nextStart ? Date.parse(nextStart) - HOUR : Infinity)).toISOString();
    }
    const added = await addBenefitConfig(page, firstTrade.id, { ...benefit, benefitEffectiveDate: start, ...(end === undefined ? {} : { benefitEndDate: end }) });
    if (added.id === null) fail(nameEn, `add benefit configuration ${n + 1}`, added);
    previousEnd = end ? Date.parse(end) : null;
  }

  if (state !== 'Draft') {
    const submitted = await submitFormulary(page, id);
    if (submitted.status >= 300) fail(nameEn, 'submit', submitted);
  }
  if (state === 'Rejected') {
    const rejected = await rejectFormulary(page, nameEn);
    if (rejected.status >= 300) fail(nameEn, 'reject', rejected);
  }
  if (state === 'Future' || goesLive) {
    await approveFormulary(page, nameEn);
    await waitForFormularyStatus(page, id, 'pending', 60_000);
  }
  if (goesLive) await promoteToActive(page, id, nameEn);
  if (state === 'Inactive') {
    const staged = await setFormularyActive(page, id, false);
    if (staged.status >= 300) fail(nameEn, 'deactivate', staged);
    const submitted = await submitFormulary(page, id);
    if (submitted.status >= 300) fail(nameEn, 'submit the deactivation', submitted);
    await approveFormulary(page, nameEn);
    await waitForFormularyStatus(page, id, 'inactive', 60_000);
  }
  if (state === 'PendingChange' || state === 'DraftChange') {
    await stageTrivialChange(page, id, nameEn);
    if (state === 'PendingChange') {
      const submitted = await submitFormulary(page, id);
      if (submitted.status >= 300) fail(nameEn, 'submit the edit', submitted);
    }
  }

  // GetFormularyTrades lists newest first; hand them back in the order they were added.
  const order = (t: FormularyTrade): number => {
    const i = tradeSpecs.findIndex((s, n) => (s.tradeId ?? SUITE_TRADES[n]?.id) === t.tradeId);
    return i < 0 ? 99 : i;
  };
  trades = trades.length ? (await readTrades(page, id)).sort((a, b) => order(a) - order(b)) : trades;
  const final = await readFormulary(page, id);
  return {
    id,
    nameEn,
    nameAr,
    payerId,
    payerName,
    effectiveDate: final.effectiveDate,
    expiryDate: final.expiryDate,
    state,
    tiers: tiers.length ? await readTiers(page, id) : [],
    trades,
    code: final.formularyCode,
  };
}

/**
 * Takes an approved (Future) formulary whose effective time has passed to
 * Active.
 *
 * THE FIRST APPROVAL ALWAYS READS FUTURE (verified 2026-11-02, twice): a v1
 * approved a minute AFTER its effective time - submitted before it or after it
 * - still read status `pending` ("Future"), and stays so until the daily
 * lifecycle job. A LATER approval re-derives the status from the dates: the
 * deactivation approved straight after came back `statusId` active /
 * `isActive` false. So the formulary is given a trivial staged change (see
 * stageTrivialChange - a published formulary's own details cannot be edited,
 * and tier edits apply at once without a draft), which is sent and approved
 * once the effective time has passed (see the foundation notes).
 */
export async function promoteToActive(page: Page, id: string, nameEn: string): Promise<void> {
  const record = await readFormulary(page, id);
  if ((await formularyStatusCode(page, id)) === 'active') return;
  // Staged while the price period is still FUTURE (a current one cannot be
  // edited), sent and approved once the effective time has passed.
  const how = await stageTrivialChange(page, id, nameEn);
  Logger.step(`[formulary] Staged ${how} on "${nameEn}" to take it Active`);
  await waitUntil(page, record.effectiveDate);
  const submitted = await submitFormulary(page, id);
  if (submitted.status >= 300) fail(nameEn, 'submit the activating edit', submitted);
  await approveFormulary(page, nameEn);
  await waitForFormularyStatus(page, id, 'active', 60_000);
}

/** The name prefix of the benefit configuration stageTrivialChange adds (a live formulary's first trade carries one). */
export const STAGED_BENEFIT_PREFIX = 'Automation Staged Benefit';

/**
 * Stages a harmless change on a PUBLISHED formulary as a draft version and
 * says which one it used. Its own details cannot be edited (409 "Formulary
 * details cannot be edited once the first version has been published") and a
 * tier edit applies at once with no draft ("no draft changes to send", both
 * 2026-11-02), so it adds a benefit configuration (`STAGED_BENEFIT_PREFIX ...`)
 * to the first trade. Every live-state formulary therefore carries one Future
 * benefit configuration on its first trade and versions v1 Created, v2 Updated.
 */
export async function stageTrivialChange(page: Page, id: string, nameEn: string): Promise<string> {
  const hasDraft = async (): Promise<boolean> => (await readFormulary(page, id)).hasDraft === true;
  const trade = (await readTrades(page, id))[0];
  if (!trade) throw new Error(`formulary "${nameEn}" has no trade to stage a change on`);
  // A benefit configuration on the first trade ("Saved to the formulary's
  // draft", verified 2026-11-02). An edited or added price period on a
  // published formulary left `hasDraft` false in the same probe, so it is not used.
  // A bounded one-day window, placed after the trade's existing configurations:
  // a second staging (DraftChange = Active, then staged again) collided with the
  // first one's open-ended window (409 "This date range overlaps", 2026-11-02 smoke).
  const existing = (await readBenefitConfigs(page, trade.id)).length;
  const start = minutesFromNow((2 + existing * 2) * 24 * 60);
  const benefit = await addBenefitConfig(page, trade.id, {
    nameEn: `${STAGED_BENEFIT_PREFIX} ${formularyStamp()}`,
    benefitEffectiveDate: start,
    benefitEndDate: new Date(new Date(start).getTime() + 24 * 3_600_000).toISOString(),
  });
  if (benefit.status < 300 && (await hasDraft())) return 'a benefit configuration';
  throw new Error(`could not stage a draft change on "${nameEn}": AddBenefitConfig ${benefit.status} ${answerText(benefit).slice(0, 200)}`);
}

/** Polls GetFormulary until its status code is `code` (pending / active / inactive / expired). */
export async function waitForFormularyStatus(page: Page, id: string, code: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = await formularyStatusCode(page, id);
    if (last === code) return;
    await page.waitForTimeout(2_000);
  }
  throw new Error(`formulary ${id} reads "${last}" after ${Math.round(timeoutMs / 1000)} s, not "${code}"`);
}

/**
 * Removes a suite formulary whatever its state: a never-approved one is
 * discarded at once (a pending request withdrawn with it); a published one has
 * its deletion staged, sent and approved. Quiet on a formulary already gone;
 * refuses one without the suite prefix. Never throws (teardown).
 */
export async function discardSuiteFormulary(page: Page, id: string): Promise<void> {
  try {
    const record = await readFormularyOrNull(page, id);
    if (!record) return;
    if (!record.formularyNameEn.startsWith(SUITE_FORMULARY_PREFIX)) {
      Logger.warn(`[formulary] not discarding "${record.formularyNameEn}": not a suite formulary`);
      return;
    }
    const res = await deleteFormulary(page, id, true);
    if (res.status >= 300) {
      Logger.warn(`[formulary] DeleteFormulary "${record.formularyNameEn}" answered ${res.status} ${answerText(res)}`);
      return;
    }
    if (!(await readFormularyOrNull(page, id))) return;
    // Published: the deletion was staged as a draft version and needs approval.
    const submitted = await submitFormulary(page, id);
    if (submitted.status < 300) await approvePending(page, record.formularyNameEn).catch(() => undefined);
    if (await readFormularyOrNull(page, id)) Logger.warn(`[formulary] "${record.formularyNameEn}" is still readable after its deletion`);
  } catch (error) {
    Logger.warn(`[formulary] discarding ${id} failed: ${String(error).slice(0, 300)}`);
  }
}

/** Every suite formulary in the register (GetFormularies searched on the prefix). */
export async function listSuiteFormularies(page: Page): Promise<FormularyListItem[]> {
  const { items } = await listFormularyRegister(page, { searchText: SUITE_FORMULARY_PREFIX }, 500);
  return items.filter((f) => f.formularyNameEn.startsWith(SUITE_FORMULARY_PREFIX));
}
