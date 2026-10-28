import type { NetworkBlockedCase } from '../networks/network.data';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import { PLAN_LIFECYCLE } from './plan.data';

/**
 * Test data for US 14155 "View plan detail with overview and tabs"
 * (folder 07-view-plan-detail-with-overview-and-tabs).
 *
 * The detail screen (verified 2026-10-27): header with name, version badge and
 * status badge; header actions by state; tabs Overview, Formulary Assignment,
 * Benefit Summary, Version History, Audit History; Overview fields
 * `plan-detail-overview-*`. Every plan is the case's own (fixture `planIn`).
 */

export type PlanBlockedCase = NetworkBlockedCase;

export const CASE = {
  overviewFields: '19070',
  formularyTab: '19071',
  versionHistory: '19072',
  auditTab: '19073',
  translationFallback: '19074',
  dateFormat: '19075',
  actionsPerStatus: '19076',
  activateDraft: '19077',
  notFound: '19078',
  breadcrumb: '19079',
  tabSwitching: '19080',
  noViewPermission: '19081',
  formularySync: '19082',
  emptyPlaceholder: '19083',
} as const;

/** 19070 - the description the case's plan is created with, read back on the Overview. */
export const OVERVIEW_DESCRIPTION = 'Overview field check (US 14155)';

/** The plan type planIn() creates by default, as the Overview labels it. */
export const DEFAULT_PLAN_TYPE = 'Individual';

/**
 * Created At / Last Updated as the Overview renders them: `dd/MM/yyyy`, optionally with a time
 * (live: "27/10/2026 - 01:53 PM", smoke run 2026-10-27 - the date part is what the story fixes).
 */
export const OVERVIEW_DATE = /^\d{2}\/\d{2}\/\d{4}(\s*-?\s*\d{1,2}:\d{2}(\s?(AM|PM))?)?$/i;

/** A plan code - provisional on a draft (PLN-D-nnnn), permanent once published (PLN-nnnn). */
export const PLAN_CODE = /^PLN-(D-)?\d+$/;

/** 19070 - the status a published, effective plan's badge reads. */
export const ACTIVE_STATUS = PLAN_LIFECYCLE.active;

/** 19072 - a version label on the Version History tab ("v1"), and its date cells. */
export const VERSION_LABEL = /^v?\d+$/;
export const VERSION_DATE = /\d{2}\/\d{2}\/\d{4}/;

/** 19072 - an Inactive plan has gone through two published versions (create, inactivation). */
export const MIN_VERSIONS = 2;

/** 19073 - an audit entry's timestamp as the timeline prints it. */
export const AUDIT_ENTRY_TIME = /^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2}\s?(AM|PM)?$/i;

/**
 * 19074 - the sheet's "locale without a translation" (French) is not offered by
 * this application (English / Arabic only), so the case uses ARABIC with the
 * Arabic description left empty: the English description must be shown
 * instead of a blank value. The Arabic NAME is mandatory on the form, so only
 * the description can lack a translation.
 */
export const FALLBACK = {
  locale: 'ar',
  englishDescription: 'English-only description (US 14155 fallback)',
} as const;

/**
 * 19075 - plan dates on the first and on the last (31st) day of a month, at
 * noon so no time-zone offset moves them to another day. The plan's Created At
 * is stamped by the server (it cannot be placed on a chosen day), so the
 * boundaries are carried by the dates the case CAN choose - Effective on the
 * 1st, Expiry on the 31st - and Created At is checked for the same format.
 */
export const dateBoundaries = (now: Date = new Date()): {
  effective: Date;
  expiry: Date;
  effectiveInMinutes: number;
  expiryInMinutes: number;
} => {
  const effective = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12, 0, 0);
  let month = effective.getMonth() + 1;
  let year = effective.getFullYear();
  // The next month after the effective one that HAS a 31st.
  while (new Date(year, month, 31).getDate() !== 31) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  const expiry = new Date(year, month, 31, 12, 0, 0);
  const minutes = (date: Date) => Math.round((date.getTime() - now.getTime()) / 60_000);
  return { effective, expiry, effectiveInMinutes: minutes(effective), expiryInMinutes: minutes(expiry) };
};

/** `dd/MM/yyyy` of a date, the format the story requires. */
export const ddMMyyyy = (date: Date): string =>
  `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

/**
 * 19076 - the header actions per status, as the business team set them on
 * 2026-10-27 ("Deactivate" is the `inactivate` action):
 *  - Draft: Edit; NEITHER Activate NOR Inactivate may appear - a draft goes
 *    live through Send for Approval.
 *  - Active: Inactivate; NO Edit - a published plan is not edited.
 *  - Inactive: Activate; NO Edit and no Inactivate.
 * Edit belongs to a Draft / version-0 plan only (never published): every
 * published version - Active or Inactive - shows no Edit.
 * A hidden action must not be on screen at all - a disabled button counts as
 * shown ("should not appear").
 */
export const ACTIONS_PER_STATUS = [
  { state: 'Draft', shown: ['edit'], hidden: ['activate', 'inactivate'] },
  { state: 'Active', shown: ['inactivate'], hidden: ['edit', 'activate'] },
  { state: 'Inactive', shown: ['activate'], hidden: ['edit', 'inactivate'] },
] as const;

/** An action that "does not appear" - not rendered, or rendered invisible. */
export const NOT_SHOWN = 'absent';

/** 19077 - a draft's approval badge. */
export const DRAFT_BADGE = /Draft/i;

/** 19077 - the actions a draft must not show, and the one it goes live through. */
export const DRAFT_HIDDEN_ACTIONS = ['activate', 'inactivate'] as const;
export const DRAFT_GO_LIVE_ACTION = 'submit';

/** 19078 - a plan id that has never existed, and what the user should be told. */
export const NONEXISTENT_PLAN_ID = '00000000-0000-4000-8000-000000000000';
export const NOT_FOUND_MESSAGE = /not found|does not exist|no longer exists/i;

/** 19079 - the breadcrumb link back to the list ("Plans Mgmt" on 2026-10-27). */
export const BREADCRUMB_PLANS_LINK = /Plans/i;

/** 19080 - how many times the case cycles through the tabs. */
export const TAB_SWITCH_ROUNDS = 3;
export const TAB_CYCLE = ['overview', 'formulary', 'versions', 'audit'] as const;

/** 19081 - the permission a "may not view a plan" role is stripped of. */
export const VIEW_PERMISSION = ['viewPlanDetails'] as const;

/**
 * 19081 - the plan is built for a payer IN the non-administrator's scope
 * ("Al Dawaa 2" / "NUPCO", not the suite payer "Al sharq"), so the refusal can
 * only come from the missing permission, never from the payer scope. A draft
 * needs no formulary, so the scope payer having none does not matter.
 */
export const SCOPED_PAYER = NON_ADMIN_PROFILE.scopedPayers[0];

/** 19081 - what a denied user should be told. */
export const ACCESS_DENIED_MESSAGE = /access denied|not authori[sz]ed|permission|forbidden|not allowed/i;

/** 19083 - what an empty optional attribute should show instead of a blank gap. */
export const EMPTY_PLACEHOLDER = /^(-|—|–|N\/A|Not provided|None)$/i;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: CASE.formularySync,
    title: 'should reflect the linked formulary\'s updated name and status when the formulary record is changed',
    reason:
      'Needs a SUITE-OWNED Active formulary the case may rename or change the status of in the Formulary module. '
      + 'The only Active formulary a plan can be linked to here is FORM-0023 "Al Sharq 2" of payer "Al sharq" '
      + '(data/plans/planSuite.data.ts), a shared team record; the suite\'s own formularies (FORM-0030..0035) stay '
      + 'Pending until the daily lifecycle job runs, and a Pending formulary cannot be assigned to a plan. Unblocked '
      + 'by an Active automation formulary that cases may edit.',
  },
];
