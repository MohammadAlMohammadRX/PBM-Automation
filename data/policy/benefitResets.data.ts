import type { PolicyBlockedCase } from '../../utils/policy/writerCHelpers';

/**
 * US 18366 "Policy Benefit Resets" (policy folder 19) - System Settings >
 * Policy Benefit Resets (`/financial-benefits/reset-history`).
 *
 * Which policy each case resets (Foundation notes, "Benefit Resets"):
 * - A reset that must SUCCEED needs a policy whose current benefit period
 *   started BEFORE today (one started today answers 409 "cannot be reset again
 *   today") - only the Active seeds (`npm run seed:policy`, made the day before)
 *   qualify, so those cases claim one (`policyIn('Active')`): 19674, 19684,
 *   19686, 19689, 19690. BLOCKED when no seed is left.
 * - The cases that only need "Reset now" on screen (search, columns, form
 *   validation) use the case's own policy made Future effective in 2 minutes
 *   and wait until it is listed in force (a Future policy whose effective time
 *   passed is in force). A validation slip-through answers 409 on it, never
 *   resets anyone else's policy.
 *
 * Literal readings:
 * - 19675 "a non-System-Administrator role (e.g. Claims Officer)" = the Payer
 *   Admin account as it is (the AC: "System Administrators only").
 * - 19676 / 19677 "the list filters as text is typed": typed without Enter; a
 *   search answered only on Enter is a finding of that step.
 * - 19678 "a 'no matching policies found' message": the screen's "No policy is
 *   in force." does not say no policy MATCHED - asserted as the case words it.
 * - 19679 / 19680: the column lists are the story's; the Reset now action
 *   belongs to an "Action" column.
 * - 19690 "the Sublimit term shows as not applicable": the in-force row's
 *   Benefit used shows no sublimit term ("—") AND the policy reads overridden.
 * - 19693: a negative amount must never be SENT, and a validation message must
 *   say amounts are whole and non-negative.
 */
export const CASES = {
  resetSucceeds: { azureId: '19674', reason: 'Annual contract renegotiation' },
  sysAdminOnly: { azureId: '19675' },
  searchByNumber: { azureId: '19676' },
  searchByName: { azureId: '19677' },
  searchNoMatch: { azureId: '19678', term: 'ZZZ-9999', message: /no (matching )?polic(y|ies)( were)? (found|match)|no results|no matching/i },
  columns: { azureId: '19679', headers: ['Policy', 'Benefit period', 'Next reset', 'Members', 'Benefit used', 'Override', 'Action'] },
  noResetsYet: { azureId: '19681', message: 'No resets have been recorded yet.' },
  reasonRequired: { azureId: '19683' },
  reasonMaxLength: { azureId: '19684', length: 1000 },
  reasonTooLong: { azureId: '19685', length: 1001, max: 1000 },
  pdf10Mb: { azureId: '19686', bytes: 10 * 1024 * 1024, name: 'contract.pdf', reason: 'New contract attached for the rest of the year.' },
  pdfTooLarge: { azureId: '19687', bytes: Math.round(10.1 * 1024 * 1024), name: 'large_contract.pdf', message: /10\s*MB/i },
  wrongFormat: { azureId: '19688', message: /only (a )?PDF|PDF (files|documents?) (are|is) (accepted|allowed)/i },
  blankTerms: { azureId: '19689', reason: 'Benefits reset with the policy\'s own terms.' },
  zeroSublimit: { azureId: '19690', reason: 'Sublimit removed for the rest of the year.', sublimit: '0' },
  negativeAmount: { azureId: '19693', deductible: '-500', reason: 'Negative amount check.', message: /negative|zero or (greater|more)|whole|0 or (greater|more)/i },
} as const;

/** The Reset form's parts (19674 S3). */
export const FORM_PARTS = /Reason[\s\S]*Terms for the rest of the benefit year/;

/** "Every member of this policy (n) starts a fresh benefit period today ... until the benefit year ends on <date>". */
export const NOTICE_PATTERN = /Every member of this policy \((\d+)\) starts a fresh benefit period today[\s\S]*ends on (\d{2}\/\d{2}\/\d{4})/;

/** An access refusal on screen. */
export const DENIED = /access denied|not authori[sz]ed|unauthori[sz]ed|no permission|do not have (the )?permission|forbidden/i;

export const BLOCKED_CASES: PolicyBlockedCase[] = [
  {
    azureId: '19680',
    title: 'should show every required column of the reset audit trail for past resets',
    reason:
      'Needs resets performed BEFORE the run with member usage behind them, so each Reset history column (Reset Date, Type, Policy, '
      + 'New period, Members, Benefit used, Reason, Status) can be checked against what was reset. A reset is possible only on a '
      + 'policy whose period started on an earlier day, and benefit usage comes only from processed claims, which the suite '
      + 'cannot produce. Runnable once seeded member utilisation (claims simulator) and an earlier reset exist.',
  },
  {
    azureId: '19682',
    title: 'should show the policy number, name, member count and benefit year end in the reset form\'s message',
    reason:
      'Needs a policy with 42 members and ACTIVE USAGE (case data POL-1001). The member picker offers about 22 members in this '
      + 'environment and usage comes only from processed claims, which the suite cannot drive. Runnable once a policy with that '
      + 'membership and recorded utilisation is available.',
  },
  {
    azureId: '19691',
    title: 'should flag the overridden policy in the Override column',
    reason:
      'Needs a policy that already had an override applied by an EARLIER reset (case data POL-1003, an active override). A reset '
      + 'can only be made on a policy whose benefit period started on an earlier day, and the override has to exist before the '
      + 'run - the suite\'s own resets happen in the same run and day. Runnable once an overridden policy exists from a previous day.',
  },
  {
    azureId: '19692',
    title: 'should record a failed reset with Status Fail in Reset history',
    reason:
      'Needs the backend reset processing to FAIL (a simulated backend error). Failing the request in the browser only stops '
      + 'it reaching the server, so nothing is recorded in Reset history; a server-side failure cannot be forced by the suite. '
      + 'Runnable once the environment offers a fault-injection switch for the reset job.',
  },
];
