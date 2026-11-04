import type { PolicyShape } from './policyPermissions.data';
import { POLICY_SCOPED_PAYER } from '../../utils/policy/writerBHelpers';

/**
 * US 15170 "Maximum members allowed on policy" (policy folder 04).
 *
 * Members are added to INDIVIDUAL policies here: a Group policy takes no member
 * until it is Active (409 "Members can only be added to a group policy after it
 * becomes active."), and Active is not reachable on demand. An Individual
 * Draft takes members in any state, and its draft enrolments count against the
 * limit (an add beyond `maxMembers` -> 409 "This policy has reached its member
 * limit."). The Members tab's chip reads "n / limit" or "n · Unlimited".
 *
 * Literal readings and TC-vs-AC notes:
 * - 19409 / 19410 / 19413 / 19419 / 19420 "enrolled members": the policy's
 *   members (Draft Enrollment on a Draft policy - they count against the limit
 *   exactly as enrolled ones do).
 * - 19411 "enrol a large number (e.g., 1000)": the system holds about twenty
 *   members in all (the picker's pool), so EVERY member the picker offers is
 *   enrolled - more than any limit the other cases use - and all must be accepted.
 * - 19413: the case expects the member list at 10 of 10 and the confirm to be
 *   refused with a limit message. Live the screen disables Add Member at the
 *   limit with "Member limit of 10 reached. Raise the limit to enroll more.";
 *   that notice is read and the refusal comes from the request the drawer would
 *   send (2026-11-04 triage: Add Member being enabled is not what step 2 expects).
 * - 19414 "The system prevent to add -5": the field must not hold -5 after it is
 *   typed; then 0 must be refused with "The member limit must be at least 1." -
 *   or never be held at all: the number field (min 1) turns a typed 0 into 1, which
 *   prevents it at input (2026-11-04 triage; nothing is saved then).
 * - 19415: the members import file is built from the Members tab's own Export
 *   Template (its headers), one row per member - 5 rows against a remaining
 *   capacity of 2. The import runs in the background: the result file's per-row
 *   reasons ("This policy has reached its member limit") are read once it finishes.
 * - 19420 "10 of 10 - Limit Reached": the screen's "10 / 10 ... Member limit of
 *   10 reached." is that state; "9 of 10 - Open for enrolment" has no counterpart
 *   on the screen (only "9 / 10") and stays a finding.
 * - 19417 "a manual member entry form": the Add Member drawer (search the member,
 *   pick, relationship) - members are picked from the register, not typed in.
 * - 19418 "a member belonging to a different payer": a member enrolled on a
 *   policy of another payer (read-only lookup); BLOCKED when none exists.
 * - 19419 "two Policy Administrator sessions": the administrator in this window
 *   and in a second browser context (own storage), both sending Add Member at once.
 * - 19424: the non-authorised role is the Payer Admin shaped without UpdatePolicy,
 *   on a Draft of that account's payer.
 */
export const CASES = {
  belowCapacity: { azureId: '19409', limit: 10, enrolled: 5 },
  lastSlot: { azureId: '19410', limit: 10, enrolled: 9 },
  unlimited: { azureId: '19411', atLeast: 11 },
  setLimit: { azureId: '19412', limit: '100' },
  limitReached: { azureId: '19413', limit: 10, enrolled: 10 },
  negative: { azureId: '19414', negative: '-5', zero: '0' },
  bulkImport: { azureId: '19415', limit: 10, enrolled: 8, rows: 5, capacity: 2 },
  nonNumeric: { azureId: '19416', text: 'abc' },
  manualAdd: { azureId: '19417', relationship: 'Child' },
  anyPayer: { azureId: '19418', relationship: 'Other' },
  concurrent: { azureId: '19419', limit: 10, enrolled: 9 },
  limitState: { azureId: '19420', limit: 10, enrolled: 9, open: /9\s*(of|\/)\s*10[^]*open for enrol/i, reached: /10\s*(of|\/)\s*10[^]*limit (of \d+ )?reached/i },
  limitPermission: { azureId: '19424', payerName: POLICY_SCOPED_PAYER, shape: { without: ['edit'] } satisfies PolicyShape, attempted: 50 },
} as const;

/** The member-limit refusal, in the server's words or the screen's notice. */
export const LIMIT_MESSAGE = /reached its member limit|member limit of \d+ reached|member limit|capacity|exceed/i;

/** A permissions refusal. */
export const DENIED = /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied|unauthori[sz]ed/i;
