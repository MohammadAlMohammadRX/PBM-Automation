import { planFormData } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';
import { APPROVER_NAME, type PlanBlockedCase } from './rejectPendingPlanVersion.data';

/**
 * Test data for US 14154 "View version history for a plan" (plan folder 06).
 *
 * A plan gains a version each time a change to it is approved. Its details
 * cannot be edited once published (live fact), so the versions are built from
 * approved FORMULARY changes (fixture `planWithFormularyHistory`: v1 carries the
 * first formulary, every later version the next), alternating between two
 * Active formularies of the suite payer. The sheet's "jdoe" is the
 * administrator - the only account that can create and approve a version.
 */
export const CASE = {
  newestFirst: '19015',
  rowFields: '19016',
  latestHighlighted: '19017',
  singleVersion: '19019',
  lifecycleRow: '19022',
  stableOnReturn: '19023',
  firstVersion: '19024',
  authorship: '19025',
} as const;

export { APPROVER_NAME };

export const SUITE_PAYER = PLAN_SUITE.payerName;

/** How many versions the multi-version cases build (the sheet's P-800 has five; three show the ordering). */
export const VERSION_COUNT = 3;

/** The fields every version row must show (AC "Version, Status, Effective Date, Expiry Date, Created By/On"). */
export const REQUIRED_COLUMNS = ['Version', 'Status', 'Effective Date', 'Expiry Date', 'Created By', 'Created On'] as const;

/** Version statuses as the tab renders them. */
export const VERSION_STATE = {
  draft: /Draft/i,
  pendingApproval: /Pending Approval/i,
  published: /Published|Approved/i,
} as const;

/** "v3" -> 3. */
export const versionNumber = (label: string): number => Number(label.replace(/^v/i, ''));

/** "v3". */
export const v = (n: number): string => `v${n}`;

/** The form data of the brand-new plan 19024 creates through the wizard. */
export const newPlanData = () => planFormData();

/** "DD/MM/YYYY HH:mm" (optionally with AM/PM) -> epoch ms; NaN when it does not parse. */
export const parseScreenDateTime = (text: string): number => {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return Number.NaN;
  let hours = Number(m[4]);
  if (m[6]) hours = (hours % 12) + (/pm/i.test(m[6]) ? 12 : 0);
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hours, Number(m[5])).getTime();
};

/** How far a recorded time may sit from the moment the action was taken (minute-level display, clock skew). */
export const TIME_TOLERANCE_MS = 5 * 60_000;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '19018',
    title: 'should show a distinct, correct status indicator per version when versions are Draft, Pending Approval, Active and Expired',
    reason: 'Needs one plan whose versions are Draft, Pending Approval, Active AND Expired at once (P-950). A plan version\'s '
      + 'status here is its approval state (Draft / Pending Approval / Approved / Rejected / Superseded) and Active / Expired '
      + 'are the PLAN\'s lifecycle statuses, so no such plan can be built. Needs that plan seeded, or the case re-stated '
      + 'against the version states the application has.',
  },
  {
    azureId: '19020',
    title: 'should list a very large version history in order and keep the oldest reachable when the plan has 50 versions',
    reason: 'Needs a plan with 50 or more versions (P-970). Each version is an approved change - about two minutes of '
      + 'stage / submit / approve / lifecycle wait - so building 50 is roughly 100 approval round trips per run. Needs a '
      + 'seeded plan with 50 versions in the suite payer\'s scope.',
  },
  {
    azureId: '19021',
    title: 'should restrict the Version History tab to authorized roles when a role without history rights opens it',
    reason: 'Needs a signed-in account WITHOUT history-viewing rights: the only non-administrator (Payer Admin) is scoped to '
      + '"Al Dawaa 2" / "NUPCO", and the role-shaping catalogue (data/accounts/payerAdminRole.data.ts) has no Plans permission '
      + 'keys, so shapedNonAdmin cannot withhold the right. Needs a "Restricted User" account in the suite payer\'s scope, or '
      + 'the Plans permissions added to the role catalogue.',
  },
];
