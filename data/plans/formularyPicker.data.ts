import { PLAN_MESSAGE, planFormData } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';
import type { PlanBlockedCase } from './rejectPendingPlanVersion.data';

/**
 * Test data for US 14326 "Formulary selection to active/inactive formularies
 * of the plan's payer" (plan folder 20).
 *
 * The sheet's Payer X is the Plans suite payer ("Al sharq"); F1 / F2 its Active
 * formularies (`suitePayerFormularies`), F3 / F6 an Active formulary of another
 * payer (`foreignFormulary`), F4 an Inactive and F5 a deleted formulary of the
 * suite payer (`inactiveSuiteFormulary` / `deletedSuiteFormulary`), Payer Z a
 * freshly published payer that owns no formulary (`publishedPayer`).
 *
 * KNOWN (2026-10-27): the picker also offers PENDING formularies, which the
 * server then refuses ("Only an active formulary can be assigned to a plan.") -
 * the story allows only Active / Inactive ones, so 19198 asserts every offered
 * formulary's status.
 */
export const CASE = {
  inactiveListedDeletedNot: '19198',
  ownPayerOnly: '19199',
  assignOnCreate: '19200',
  crossPayerRefused: '19201',
  samePayerChange: '19202',
  inactiveBlocksApproval: '19203',
  revalidatedAtApproval: '19204',
  emptyPayer: '19205',
  serviceDown: '19207',
  clearRefusal: '19209',
} as const;

export const SUITE_PAYER = PLAN_SUITE.payerName;

/** The statuses the picker may offer (AC: "Inactive/Active"). */
export const PICKABLE_STATUSES = ['active', 'inactive'] as const;

/** The wizard field 19200 needs: a formulary chosen while creating the plan. */
export const FORMULARY_FIELD = /Formulary/i;

/** The wizard data of the plan 19200 creates (the suite payer). */
export const newPlanData = () => planFormData({ payer: SUITE_PAYER });

/** A cross-payer refusal names the payer rule (19201, 19208). */
export const CROSS_PAYER_ERROR = /payer/i;

/** The refusal of an approval whose formulary is no longer Active (19203, 19204). */
export const FORMULARY_NOT_ACTIVE = new RegExp(`${PLAN_MESSAGE.onlyActiveFormulary.replace(/\./g, '\\.')}|formulary.*(active|inactive)|(active|inactive).*formulary`, 'i');

/** The picker's empty state for a payer with no formulary (19205) - "No active formulary exists for the selected payer...". */
// "No results found" is the accepted empty state (QA lead, 2026-11-01).
export const NO_FORMULARY_FOR_PAYER = /no results found|no .*formular(y|ies)/i;

/** The formulary list the picker loads (plan service formulariesDropdown) - failed on purpose in 19207. */
export const FORMULARY_FEED = 'FormulariesDropdown';

/** What the screen must say when that feed fails (19207). */
export const FEED_ERROR = /error|unavailable|could not|couldn't|unable|try again|failed/i;

/** The HTTP status the outage is simulated with (19207). */
export const OUTAGE_STATUS = 503;

/** The checklist the cross-payer message is held to (19209). */
export const MESSAGE_CHECKLIST = {
  namesPayer: /payer/i,
  namesFormulary: /formulary/i,
  explainsRestriction: /(different|another|same|its own|other) payer|belongs? to|does not belong|must belong|must match/i,
  suggestsFix: /select|choose|pick|assign one/i,
  jargon: /exception|stack|null|undefined|guid|sql|\b[45]\d\d\b|object reference/i,
} as const;

/**
 * The human-readable message of a server answer - its `message` / `title` /
 * `detail` and every ValidationErrors reason - so a wording checklist reads
 * what the user is shown, not the JSON envelope around it. Falls back to the text.
 */
export const serverMessage = (text: string): string => {
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const pick = (key: string): string => (typeof body[key] === 'string' ? (body[key] as string) : '');
    const reasons = Array.isArray(body.ValidationErrors)
      ? (body.ValidationErrors as { Reason?: string }[]).map((entry) => entry.Reason ?? '')
      : [];
    const parts = [pick('message'), pick('Message'), pick('title'), pick('detail'), ...reasons].filter((part) => part !== '');
    return parts.length > 0 ? parts.join(' ') : text;
  } catch {
    return text;
  }
};

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '19206',
    title: 'should let only Plan Administrators assign or change a plan\'s formulary when a Viewer tries',
    reason: 'Needs a signed-in "Viewer" (non-Plan Administrator) account in the suite payer\'s scope: the only '
      + 'non-administrator (Payer Admin) is scoped to "Al Dawaa 2" / "NUPCO", and the role-shaping catalogue '
      + '(data/accounts/payerAdminRole.data.ts) has no Plans permission keys, so shapedNonAdmin cannot withhold the '
      + 'formulary right. Needs that account, or the Plans permissions added to the role catalogue.',
  },
];
