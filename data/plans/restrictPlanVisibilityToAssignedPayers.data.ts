import type { NetworkBlockedCase } from '../networks/network.data';
import { FORBIDDEN_WORDING, NON_ADMIN_PROFILE, OUT_OF_SCOPE_STATUS } from '../accounts/nonAdminAccount.data';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { PLAN_SUITE } from './planSuite.data';

/**
 * Test data for US 14335 "Restrict plan visibility to a user's assigned payer
 * organizations" (folder 24-restrict-plan-visibility-to-a-users-assigned-payer-organizations).
 *
 * WHO IS WHO (2026-10-27). The payer-scoped user of the sheet is the configured
 * non-admin account (`nonAdminSession`): role "Payer Admin", assigned to
 * "Al Dawaa 2" and "NUPCO". The sheet's single-payer user ('payer.user1',
 * "Al Noor Insurance") is mapped onto it for the cases whose rule does not
 * depend on HOW MANY payers are assigned (only assigned payers' plans, search,
 * export, not-found, tampering); the cases whose rule IS about a single payer
 * or about changing a user's assignment are BLOCKED below.
 *
 * Out-of-scope plans are the administrator's, built for the Plans suite payer
 * "Al sharq" (planIn's default); in-scope plans are built for "Al Dawaa 2" with
 * that payer's own Active formulary (fixture `payerFormulary`, BLOCKED when it
 * owns none). Both are ACTIVE, so an absence can only be the scope - a draft
 * might be hidden for being a draft.
 *
 * THE PAYER FILTER is the top-bar payer selector (`app-breadcrumb-payer-select`),
 * as on the network directory (US 14302): a scoped user meets it, set to one of
 * its payers, and it is the only payer control the list has.
 */

export type PlanBlockedCase = NetworkBlockedCase;

export const CASE = {
  listOnlyAssigned: '19275',
  searchOnlyAssigned: '19276',
  exportOnlyAssigned: '19277',
  outOfScopeNotFound: '19278',
  payerFilterShown: '19281',
  payerFilterOptions: '19282',
  globalAdminSeesAll: '19283',
  tamperedFilter: '19286',
  exportFiltered: '19287',
} as const;

/** The payer-scoped account (the sheet's payer.user1 / payer.multi). */
export const SCOPED_ACCOUNT = {
  role: NON_ADMIN_PROFILE.role,
  payers: [...NON_ADMIN_PROFILE.scopedPayers] as string[],
  /** The assigned payer the in-scope plans are built for (the sheet's "Al Noor Insurance"). */
  inScopePayer: NON_ADMIN_PROFILE.scopedPayers[0],
  /**
   * Every scope the account's own session may show: one of its payers, or the
   * aggregate "All My Payers" - which is where a multi-payer session starts
   * (live, 2026-10-27; 19278 / 19286 read it as outside the account's payers).
   */
  ownScopes: [...NON_ADMIN_PROFILE.scopedPayers, 'All My Payers'] as string[],
} as const;

/** The payer outside the account's scope (the sheet's "Bupa Arabia" / "Al Rajhi Takaful"). */
export const OUT_OF_SCOPE_PAYER = PLAN_SUITE.payerName;

/** The administrator's "show every payer" scope entry. */
export const ALL_PAYERS = 'All Payers';

/** 19276 / 19283 - a term both plans' names carry (the sheet's 'Family Care Plan'). */
export const sharedPlanTerm = (): string => `Family Care Plan ${networkStamp()}`;

/** The two plans built around a shared term: one under each side of the scope. */
export const scopedPlanNames = (term: string): { inScope: string; outOfScope: string } => ({
  inScope: `${term} A`,
  outOfScope: `${term} B`,
});

/** What an out-of-scope plan should be reported as, on screen and by the API. */
export const NOT_FOUND = {
  status: OUT_OF_SCOPE_STATUS,
  wording: /not found|unable to load the requested plan|does not exist|no longer available/i,
  forbidden: FORBIDDEN_WORDING,
} as const;

/** How long to watch for the not-found message after a direct link (toasts are transient). */
export const MESSAGE_WAIT_MS = 15_000;

/** The export column that names a plan's payer. */
export const EXPORT_PAYER_HEADER = /^payer( name)?( \(en(glish)?\))?$/i;

/**
 * 19286 - the list request a tampered Payer filter sends: the out-of-scope
 * payer's id under the field names a payer filter could use.
 */
export const tamperedListBody = (payerId: string): Record<string, unknown> => ({
  pageNumber: 1,
  rowsPerPage: 200,
  sortBy: 'CreatedOn desc',
  payerId,
  payerIds: [payerId],
});

/** The plan rows a GetPlans answer carries ([] when it was refused or unreadable). */
export const itemsOfListAnswer = (answer: { status: number; text: string }): Record<string, unknown>[] => {
  try {
    const body = JSON.parse(answer.text) as { payload?: { plans?: { items?: Record<string, unknown>[] } } };
    return answer.status < 300 ? (body.payload?.plans?.items ?? []) : [];
  } catch {
    return [];
  }
};

/** A case builds two Active plans (about three minutes each) on top of a second sign-in. */
export const SCOPE_CASE_TIMEOUT_MS = 20 * 60_000;

const PER_USER =
  'a disposable test USER whose role and payer assignment the case may set, plus a Users page object. Payers '
  + 'are assigned per user in this build (user drawer step 3: Role + assigned Payers) and the framework has no '
  + 'page object for that drawer; the only payer-scoped account is the shared "Payer Admin" (Al Dawaa 2, NUPCO), '
  + 'whose assignments must not be changed.';

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '19279',
    title: 'should block saving a payer-scoped role with MSG-PLN-054 when no payer is assigned to it',
    reason: `Needs ${PER_USER} The MSG-PLN-054 wording is not known yet either - capture it on the first run.`,
  },
  {
    azureId: '19280',
    title: 'should show no Payer filter when a payer-scoped user is assigned exactly one payer',
    reason:
      'Needs a payer-scoped account assigned to exactly ONE payer. The only one configured (NON_ADMIN_USERNAME, '
      + '"Payer Admin") is assigned to two (Al Dawaa 2, NUPCO), so the single-payer layout cannot be observed. '
      + 'Runnable once a single-payer account is configured.',
  },
  {
    azureId: '19284',
    title: 'should grant visibility of a newly assigned payer\'s plans and show the Payer filter when a second payer is added',
    reason: `Needs ${PER_USER} (starting with one payer, then given a second).`,
  },
  {
    azureId: '19285',
    title: 'should hide a removed payer\'s plans and the Payer filter when a payer assignment is removed',
    reason: `Needs ${PER_USER} (starting with two payers, then one removed).`,
  },
  {
    azureId: '19288',
    title: 'should block saving a new user with a payer-scoped role and no payer with MSG-PLN-054 even when every other field is valid',
    reason: `Needs ${PER_USER} The case creates a user, which the shared accounts cannot stand in for.`,
  },
];
