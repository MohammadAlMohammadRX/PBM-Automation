import type { Page, TestInfo } from '@playwright/test';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { ANNOTATION, StepStatus } from '../../constants/TestStatus';
import { blockedByPrecondition, type TestSteps } from '../../fixtures/testStatus.fixture';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import type { FormularyRoleControl, FormularySession as RoleSession } from './writerCHelpers';
import type { FormularyRight as RoleRight } from '../../data/formulary/formularyPermissions.data';
import {
  SUITE_TRADES,
  addPricingPeriod,
  addTrade,
  approveFormulary,
  formularyStamp,
  readFormulary,
  readPriceHistory,
  readTrades,
  setTradeStatus,
  submitFormulary,
  waitForFormularyStatus,
  type BenefitConfigSpec,
  type FormularyAnswer,
  type FormularyState,
  type FormularyTrade,
  type ProvisionedFormulary,
  type SuiteFormularySpec,
} from '../FormularyProvisioning';

/**
 * Writer B's helpers for the Formulary folders 03, 05, 07, 09, 10, 11, 12 and
 * 21 (tiers, tier deletion, trade status, Trades & Pricing, Add Trade, benefit
 * configurations and price history). Everything here builds on the shared
 * provisioning helpers (utils/FormularyProvisioning.ts) and calls only the
 * application's own endpoints.
 */

/** The fixture's builder, as a parameter type. */
export type FormularyBuilder = (state: FormularyState, spec?: SuiteFormularySpec) => Promise<ProvisionedFormulary>;

/** ISO time `minutes` from now. */
export const isoIn = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString();

/** ISO time `days` after `iso`. */
export const isoDaysAfter = (iso: string, days: number): string => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

/** A short unique suffix for names a case types. */
export const stamp = (): string => formularyStamp();

/** The version number a `v<n> · <status>` badge carries (NaN when none). */
export const versionNumber = (badge: string): number => {
  const match = badge.match(/v\s*(\d+)/i);
  return match ? Number(match[1]) : NaN;
};

/** Whether the formulary holds staged (draft) changes. */
export async function hasDraft(page: Page, formularyId: string): Promise<boolean> {
  return (await readFormulary(page, formularyId)).hasDraft === true;
}

/** Submits the formulary and approves it (the shared approvals module); throws with the server's answer when refused. */
export async function submitAndApprove(page: Page, formulary: { id: string; nameEn: string }): Promise<void> {
  const submitted = await submitFormulary(page, formulary.id);
  if (submitted.status >= 300) throw new Error(`SubmitFormularyForApproval answered ${submitted.status} ${submitted.text.slice(0, 300)}`);
  await approveFormulary(page, formulary.nameEn);
}

/** Takes a Draft (v0) formulary through its FIRST approval - it then reads Future (status code `pending`). */
export async function publishDraft(page: Page, formulary: { id: string; nameEn: string }): Promise<void> {
  await submitAndApprove(page, formulary);
  await waitForFormularyStatus(page, formulary.id, 'pending', 60_000);
}

/** The catalogue trade a suite formulary uses by position (0 = MED-001 Paracetamol, 1 = MED-002 Amoxicillin, 2 = MED-003 Metformin). */
export const catalogueTrade = (index: 0 | 1 | 2): (typeof SUITE_TRADES)[number] => SUITE_TRADES[index];

/** What a case asks of one extra trade: which catalogue trade, in which tier, suspended or not, priced from when. */
export interface ExtraTrade {
  trade: 0 | 1 | 2;
  tierId: string;
  suspend?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

/** Adds trades to tiers of a (draft) formulary through AddFormularyTrade, suspending where asked; returns them by catalogue code. */
export async function addTradesToTiers(page: Page, formularyId: string, wanted: ExtraTrade[]): Promise<Record<string, FormularyTrade>> {
  for (const want of wanted) {
    const trade = catalogueTrade(want.trade);
    const added = await addTrade(page, formularyId, {
      tradeId: trade.id,
      tierId: want.tierId,
      ...(want.effectiveFrom ? { effectiveFrom: want.effectiveFrom } : {}),
      ...(want.effectiveTo !== undefined ? { effectiveTo: want.effectiveTo } : {}),
    });
    if (added.id === null) throw new Error(`AddFormularyTrade ${trade.code} answered ${added.status} ${added.text.slice(0, 300)}`);
    if (want.suspend) {
      const suspended = await setTradeStatus(page, added.id, true);
      if (suspended.status >= 300) throw new Error(`SetFormularyTradeStatus ${trade.code} answered ${suspended.status} ${suspended.text.slice(0, 300)}`);
    }
  }
  return Object.fromEntries((await readTrades(page, formularyId)).map((t) => [t.tradeCode, t]));
}

/**
 * UpdateFormularyTrade (PUT) - a trade's tier / coverage. The screens never
 * call it (no Edit Trade on the cards: their `edit-button` is Benefit
 * Configuration), so the body is the endpoint's documented intent - the trade
 * id, its tier and coverage - NOT one captured from a screen. A 400 naming a
 * missing field is a shape question to triage before calling it a finding.
 */
export async function updateTradeTier(page: Page, trade: FormularyTrade, formularyId: string, tierId: string): Promise<FormularyAnswer> {
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.formularyUpdateTrade, {
    id: trade.id,
    formularyId,
    tradeId: trade.tradeId,
    tierId,
    coveragePercentage: trade.coveragePercentage,
  });
}

/**
 * AddFormularyTrade sent as-is from `page` (the body the Add Trade drawer
 * sends - foundation notes), without the provisioning helper's own reads, so a
 * restricted session's refusal is the answer to the add itself.
 */
export async function requestAddTrade(
  page: Page,
  formulary: { id: string; effectiveDate: string; expiryDate: string },
  tierId: string,
  trade: 0 | 1 | 2,
): Promise<FormularyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.formularyAddTrade, {
    formularyId: formulary.id,
    tradeId: catalogueTrade(trade).id,
    tierId,
    coveragePercentage: 80,
    effectiveFrom: formulary.effectiveDate,
    effectiveTo: formulary.expiryDate,
    baseCost: 10,
    publicPrice: 12,
    supplierPrice: 9,
    discountPercentage: 0,
    vatPercentage: 0,
    rebateTypeId: null,
    rebateValue: null,
  });
}

/** The first array found in an answer's payload (the payload itself, or its first array-valued property). */
export function payloadArray(body: unknown): unknown[] {
  const payload = (body as { payload?: unknown } | null)?.payload;
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const value of Object.values(payload as Record<string, unknown>)) {
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        const nested = Object.values(value as Record<string, unknown>).find(Array.isArray);
        if (nested) return nested as unknown[];
      }
    }
  }
  return [];
}

// ---- dated timelines (statuses that only time produces) ------------------------------

/** One benefit configuration per lifecycle stage on a published (Future) formulary. */
export interface BenefitTimeline {
  formulary: ProvisionedFormulary;
  tradeId: string;
  /** English names by stage (only the stages asked for). */
  names: Partial<Record<'future' | 'active' | 'expired', string>>;
  /** When the "active" (and "expired") configurations take effect. */
  activeFrom: string;
  /** When the "expired" configuration ends. */
  expiredAfter: string;
}

/**
 * Builds a Draft formulary (effective in 2 minutes) whose first trade carries
 * a configuration for each stage asked - Future (effective in two days),
 * soon-Active (effective in 3 minutes, open ended) and soon-Expired (effective
 * in 3 minutes, ending in 5) - then publishes it (first approval: Future). The
 * caller waits for `activeFrom` / `expiredAfter` (FormularyProvisioning
 * waitUntil) before reading the statuses: about six minutes in all.
 */
export async function benefitTimeline(
  page: Page,
  build: FormularyBuilder,
  stages: ReadonlyArray<'future' | 'active' | 'expired'>,
  extra: Partial<Record<'future' | 'active' | 'expired', BenefitConfigSpec>> = {},
): Promise<BenefitTimeline> {
  const suffix = stamp();
  // ONE TRADE'S CONFIGURATIONS MAY NOT OVERLAP (409 "This date range overlaps
  // with ...", 2026-11-02 - 18738 / 18743 blocked): expired +3..+5 min, active
  // from +6 min for a day, future from +2 days. `activeFrom` is when the first
  // configuration asked for comes into force, `expiredAfter` when every stage
  // asked for has reached its status.
  const expiredFrom = isoIn(3);
  const expiredTo = isoIn(5);
  const activeStart = stages.includes('expired') ? isoIn(6) : isoIn(3);
  const activeFrom = stages.includes('expired') ? expiredFrom : activeStart;
  const expiredAfter = stages.includes('active') && stages.includes('expired') ? activeStart : expiredTo;
  const window: Record<'future' | 'active' | 'expired', { from: string; to: string | null }> = {
    future: { from: isoIn(2 * 24 * 60), to: null },
    active: { from: activeStart, to: isoIn(24 * 60) },
    expired: { from: expiredFrom, to: expiredTo },
  };
  const names: BenefitTimeline['names'] = {};
  const specs: BenefitConfigSpec[] = [];
  for (const stage of stages) {
    const nameEn = `Automation ${stage[0].toUpperCase()}${stage.slice(1)} Benefit ${suffix}`;
    names[stage] = nameEn;
    specs.push({
      nameEn,
      nameAr: `منفعة ${stage} ${suffix}`,
      copaymentAmount: 15,
      benefitEffectiveDate: window[stage].from,
      benefitEndDate: window[stage].to,
      ...(extra[stage] ?? {}),
    });
  }
  const formulary = await build('Draft', { effectiveInMinutes: 2, benefitConfigs: specs });
  await publishDraft(page, formulary);
  Logger.step(`[writer B] Benefit timeline on "${formulary.nameEn}": ${JSON.stringify(names)}`);
  return { formulary, tradeId: formulary.trades[0].id, names, activeFrom, expiredAfter };
}

/** Three price periods on one trade that time turns into expired / current / future. */
export interface PriceTimeline {
  formulary: ProvisionedFormulary;
  tradeId: string;
  /** Period ids by what they will be once `settledAt` has passed. */
  periods: { expired: string; current: string; future: string };
  settledAt: string;
}

/**
 * Builds a Draft formulary effective in 2 minutes whose first trade is priced
 * +3..+5 min (to expire), +6 min..+60 days (to become current) and
 * +90..+120 days (future), publishes it, and returns the period ids. The caller
 * waits for `settledAt` before reading statuses (about seven minutes in all).
 */
export async function priceTimeline(page: Page, build: FormularyBuilder): Promise<PriceTimeline> {
  const first = { from: isoIn(3), to: isoIn(5) };
  const formulary = await build('Draft', { effectiveInMinutes: 2, trades: [{ effectiveFrom: first.from, effectiveTo: first.to, supplierPrice: 8 }] });
  const tradeId = formulary.trades[0].id;
  const current = await addPricingPeriod(page, tradeId, { effectiveFrom: isoIn(6), effectiveTo: isoIn(60 * 24 * 60), supplierPrice: 9 });
  if (current.id === null) throw new Error(`AddPricingPeriod (current) answered ${current.status} ${current.text.slice(0, 300)}`);
  const future = await addPricingPeriod(page, tradeId, { effectiveFrom: isoIn(90 * 24 * 60), effectiveTo: isoIn(120 * 24 * 60), supplierPrice: 11 });
  if (future.id === null) throw new Error(`AddPricingPeriod (future) answered ${future.status} ${future.text.slice(0, 300)}`);
  const expired = (await readPriceHistory(page, tradeId)).find((p) => p.id !== current.id && p.id !== future.id);
  if (!expired) throw new Error('the first price period could not be read back');
  await publishDraft(page, formulary);
  return { formulary, tradeId, periods: { expired: expired.id, current: current.id as string, future: future.id as string }, settledAt: isoIn(6.5) };
}

/**
 * A Draft formulary (effective in 2 days, expiring in 400) whose single trade
 * is priced for its first 30 days only - so a case can add later periods
 * without overlapping it. `futurePeriod` adds one more, +60..+240 days.
 */
export async function shortPricedDraft(
  page: Page,
  build: FormularyBuilder,
  options: { futurePeriod?: boolean; rebate?: SuiteFormularySpec['rebate']; payerName?: string } = {},
): Promise<{ formulary: ProvisionedFormulary; tradeId: string; futurePeriodId: string | null; futureFrom: string; futureTo: string }> {
  const effectiveDate = isoIn(2 * 24 * 60);
  const formulary = await build('Draft', {
    effectiveDate,
    expiryDate: isoDaysAfter(effectiveDate, 400),
    trades: [{ effectiveFrom: effectiveDate, effectiveTo: isoDaysAfter(effectiveDate, 30) }],
    ...(options.rebate ? { rebate: options.rebate } : {}),
    ...(options.payerName ? { payerName: options.payerName } : {}),
  });
  const tradeId = formulary.trades[0].id;
  const futureFrom = isoDaysAfter(effectiveDate, 60);
  const futureTo = isoDaysAfter(effectiveDate, 240);
  let futurePeriodId: string | null = null;
  if (options.futurePeriod) {
    const added = await addPricingPeriod(page, tradeId, { effectiveFrom: futureFrom, effectiveTo: futureTo, supplierPrice: 20 });
    if (added.id === null) throw new Error(`AddPricingPeriod answered ${added.status} ${added.text.slice(0, 300)}`);
    futurePeriodId = added.id;
  }
  return { formulary, tradeId, futurePeriodId, futureFrom, futureTo };
}

// ---- restricted sessions --------------------------------------------------------------

/** The application's permission codes for the rights these folders gate (read off the bundle, 2026-11-02). */
export const FORMULARY_RIGHT = {
  viewFormulary: 'Formularies.GetFormulary',
  createFormulary: 'Formularies.CreateFormulary',
  viewTiers: 'Formularies.GetTiers',
  deleteTier: 'Formularies.DeleteTier',
  viewTrades: 'Formularies.GetFormularyTrades',
  addTrade: 'Formularies.AddFormularyTrade',
  updateTrade: 'Formularies.UpdateFormularyTrade',
  setTradeStatus: 'Formularies.SetFormularyTradeStatus',
  deleteTrade: 'Formularies.DeleteFormularyTrade',
  viewPriceHistory: 'Formularies.GetPriceHistory',
  addPricingPeriod: 'Formularies.AddPricingPeriod',
  updatePricingPeriod: 'Formularies.UpdatePricingPeriod',
  deletePricingPeriod: 'Formularies.DeletePricingPeriod',
  viewBenefitConfigs: 'BenefitConfigs.GetBenefitConfigs',
  addBenefitConfig: 'BenefitConfigs.AddBenefitConfig',
  updateBenefitConfig: 'BenefitConfigs.UpdateBenefitConfig',
  deleteBenefitConfig: 'BenefitConfigs.DeleteBenefitConfig',
} as const;

export type FormularyRight = keyof typeof FORMULARY_RIGHT;

/** Writer B's right names in the `formularyRole` fixture's catalogue keys (data/formulary/formularyPermissions.data.ts). */
const ROLE_RIGHT_OF: Record<FormularyRight, RoleRight> = {
  viewFormulary: 'view',
  createFormulary: 'create',
  viewTiers: 'tiers',
  deleteTier: 'deleteTier',
  viewTrades: 'trades',
  addTrade: 'addTrade',
  updateTrade: 'updateTrade',
  setTradeStatus: 'tradeStatus',
  deleteTrade: 'deleteTrade',
  viewPriceHistory: 'priceHistory',
  addPricingPeriod: 'addPrice',
  updatePricingPeriod: 'updatePrice',
  deletePricingPeriod: 'deletePrice',
  viewBenefitConfigs: 'benefitList',
  addBenefitConfig: 'benefitAdd',
  updateBenefitConfig: 'benefitUpdate',
  deleteBenefitConfig: 'benefitDelete',
};

/**
 * Signs in the Payer Admin account with its role SHAPED for the case: the list
 * and every `held` right granted, every `lacking` right withheld (the user's
 * 2026-11-02 decision, through writer C's `formularyRole` fixture, which puts
 * the role back at teardown). Replaces requireFormularyRights, which only READ
 * the role as found - it holds every formulary right, so all eight cases that
 * used it came out BLOCKED (18640 in the 2026-11-02 full run).
 * A withheld right the account is still told it holds is attached as evidence
 * by the fixture and the case runs on (fixtures/shapedNonAdmin.fixture.ts).
 */
export async function signInWithFormularyRights(
  role: FormularyRoleControl,
  rights: { held?: readonly FormularyRight[]; lacking: readonly FormularyRight[] },
): Promise<RoleSession> {
  return role.signIn({
    with: ['list', ...(rights.held ?? []).map((r) => ROLE_RIGHT_OF[r])],
    without: rights.lacking.map((r) => ROLE_RIGHT_OF[r]),
  });
}

/** BLOCKS the case when a precondition request (made before its steps) was refused. */
export function requireAccepted(testInfo: TestInfo, answer: { status: number; text: string }, what: string): void {
  if (answer.status >= 300) blockedByPrecondition(testInfo, what, new Error(`answered ${answer.status} ${answer.text.slice(0, 300)}`));
}

/** BLOCKS the case when a precondition step (made before its steps) throws. */
export async function requireDone(testInfo: TestInfo, what: string, action: () => Promise<unknown>): Promise<void> {
  await provide(testInfo, what, action);
}

/**
 * Runs a precondition builder and returns what it built; BLOCKS the case when
 * it throws. A builder that already reported BLOCKED (the `formularyIn`
 * fixture inside it) is passed through as it is.
 */
export async function provide<T>(testInfo: TestInfo, what: string, build: () => Promise<T>): Promise<T> {
  try {
    return await build();
  } catch (error) {
    if (testInfo.annotations.some((a) => a.type === ANNOTATION.blocked)) throw error;
    return blockedByPrecondition(testInfo, what, error);
  }
}

/**
 * Ends a case BLOCKED for its last, un-provisionable step - unless an earlier
 * step already failed, in which case the failure stands and this step says why
 * it was not exercised. Call INSIDE that last step.
 */
export function blockRemainingSteps(steps: TestSteps, reason: string): never {
  if (steps.records().some((r) => r.status === StepStatus.FAIL)) {
    throw new Error(`NOT EXERCISED - ${reason}`);
  }
  return steps.blocked(reason);
}
