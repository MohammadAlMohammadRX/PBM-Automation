import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { env } from '../constants/EnvironmentConfig';
import { REFERENCE_PAYER_NAMES } from '../data/payers/referencePayers.data';

/** The fields of a GetPayers row a finder can select on. */
export interface PayerShape {
  payerNameEn: string;
  payerCode: string | null;
  linkedNetworksCount: number;
  linkedPoliciesCount: number;
  linkedMembersCount: number;
  currentVersion: number;
  versionStatusCode: string | null;
  effectiveDate: string;
  expiryDate: string;
  isActive: boolean;
}

const LIST_ENDPOINT = '/api/Payers/GetPayers';
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

/**
 * Finds a payer of a given SHAPE - with members, without networks, with N
 * versions - across the whole register, preferring the QA lead's reference
 * payers when they still fit.
 *
 * WHY THE API. The list on screen opens on the newest payers, which in this
 * environment are always the suite's own fresh drafts: no members, no policies,
 * always one network. A case that sampled the first page concluded "no payer
 * has a member" while payer number 2 had two. The API sees all ~1300 payers at
 * once.
 *
 * THE API ONLY LOCATES. The case still opens the payer and reads what the
 * screen shows - the finder decides WHICH payer to look at, never what the
 * case concludes about it.
 *
 * Returns null rather than throwing: "no payer of this shape exists" is a
 * missing precondition for the caller to report as BLOCKED.
 */
export async function findPayer(
  page: Page,
  matches: (p: PayerShape) => boolean,
  description: string,
  prefer: readonly string[] = REFERENCE_PAYER_NAMES,
): Promise<PayerShape | null> {
  return (await findPayers(page, matches, description, prefer))[0] ?? null;
}

/**
 * Every payer that fits, preferred names first - for a caller that has to TRY
 * candidates (a scope selector that refuses some of them, say) rather than
 * trust the first.
 */
export async function findPayers(
  page: Page,
  matches: (p: PayerShape) => boolean,
  description: string,
  prefer: readonly string[] = REFERENCE_PAYER_NAMES,
): Promise<PayerShape[]> {
  // ON THE APP FIRST (2026-10-11). The session token lives in the app's
  // localStorage, and a page still on about:blank - a case that looks for its
  // payer before navigating - cannot read it: 14577, 15516 and 15848 failed
  // on "SecurityError: Failed to read the 'localStorage' property".
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const rows: PayerShape[] = [];
  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const res = await NetworkUtils.postAsSession(page, LIST_ENDPOINT, { pageNumber, rowsPerPage: PAGE_SIZE });
    if (res.status !== 200) {
      Logger.warn(`[PayerFinder] ${LIST_ENDPOINT} answered ${res.status}; cannot look for ${description}`);
      break;
    }
    const body = JSON.parse(res.text) as { payload?: { payers?: { items?: PayerShape[] } } };
    const items = body.payload?.payers?.items ?? [];
    rows.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  const fitting = rows.filter(matches);
  const named = prefer.map((n) => fitting.find((p) => p.payerNameEn === n)).filter((p): p is PayerShape => Boolean(p));
  const ordered = [...named, ...fitting.filter((p) => !named.includes(p))];
  Logger.step(
    `[PayerFinder] ${description}: ${fitting.length} of ${rows.length} payer(s) fit`
    + `${ordered[0] ? `; first choice "${ordered[0].payerNameEn}"${named.length ? ' (reference payer)' : ''}` : ''}`,
  );
  return ordered;
}

/** True when a payer's effective date has arrived - only those are LIVE, and only live payers can be scoped to. */
export const isEffectiveNow = (p: PayerShape): boolean =>
  String(p.effectiveDate || '').slice(0, 10) <= new Date().toISOString().slice(0, 10);
