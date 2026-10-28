import { PLAN_SUITE } from './planSuite.data';
import { APPROVER_NAME, type PlanBlockedCase } from './rejectPendingPlanVersion.data';

/**
 * Test data for US 14327 "View formulary assignment history for a plan"
 * (plan folder 21).
 *
 * The plan detail's Formulary Assignment tab IS the history: one card per
 * formulary the plan has had, per version - "<name> <code> · v<n> · <t> Tiers ·
 * <r> Trades", Effective, Expires, Assigned by - with a state badge ("Active
 * Assignment" for the live one, "Previous Assignment" for the rest). A history
 * of F1 -> F2 -> F3 is built by approved formulary changes (fixture
 * `planWithFormularyHistory`). The sheet's "A. Shehadeh" / Compliance Officer is
 * the administrator - the only account that assigns and views here.
 */
export const CASE = {
  completeHistory: '19210',
  entryDetails: '19211',
  activeMarked: '19212',
  singleEntry: '19213',
  perVersion: '19214',
  emptyState: '19216',
  bilingual: '19217',
  updatesAfterApproval: '19218',
} as const;

export { APPROVER_NAME };

export const SUITE_PAYER = PLAN_SUITE.payerName;

/** The card badges. */
export const BADGE = {
  active: /Active Assignment/i,
  previous: /Previous Assignment/i,
} as const;

/** The tab's label as the story names it, per language (19217). */
export const TAB_LABEL = {
  en: 'View plan formulary history',
  ar: 'عرض سجل القوائم الدوائية للخطة',
} as const;

/** "<code> · v<n>" - how a card attributes an assignment to a version (19214). */
export const versionAttribution = (code: string, version: number): string => `${code} · v${version}`;

/** "3 Tiers", "5 Trades" - the counts a card shows (19211). */
export const tierText = (count: number): RegExp => new RegExp(`\\b${count}\\s+Tiers?\\b`, 'i');
export const tradeText = (count: number): RegExp => new RegExp(`\\b${count}\\s+Trades?\\b`, 'i');

/** A date-time as the cards render it ("27/10/2026 14:05"). */
export const DATE_TIME = /\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}/;

/** The empty state of a plan that never had a formulary (19216). */
export const NO_FORMULARY_YET = /no formulary (has been |is )?(currently )?assigned|no formulary (history|yet)|not been assigned/i;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '19215',
    title: 'should let only authorized roles view the formulary assignment history when a user without the role opens it',
    reason: 'Needs a signed-in account WITHOUT history-viewing rights in the suite payer\'s scope: the only non-administrator '
      + '(Payer Admin) is scoped to "Al Dawaa 2" / "NUPCO", and the role-shaping catalogue (data/accounts/payerAdminRole.data.ts) '
      + 'has no Plans permission keys, so shapedNonAdmin cannot withhold the right. Needs that account, or the Plans permissions '
      + 'added to the role catalogue.',
  },
];
