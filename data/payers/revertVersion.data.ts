import { EXPECTED_ROW_ACTIONS } from './publishAndRevert.data';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Revert a Payer to a Previously Published Version".
 *
 * THE REVERT ACTION NOW EXISTS. The publish-and-revert story (folder 31) found
 * it absent; VERIFIED in this batch, every superseded row of Version History
 * offers `-revert` and the current version does not. Confirming the prompt
 * POSTs RevertPayer, which answers "The revert has been saved as a draft. Send
 * it for approval when you are ready": a NEW draft version is appended ("v3 ·
 * Reverted from v1", change type Revert), the payer shows the draft banner,
 * and the maker still has to Send for Approval before a reviewer can make it
 * live. So every case here reverts, SENDS, then approves.
 *
 * ONE WORDING FINDING: the prompt says "This will submit version vN for
 * approval", while the action saves a draft and submits nothing. The workflow
 * case asserts the prompt describes what actually happens, and reports that.
 * Folder 31's TC-005 should be re-run; its absence finding is superseded.
 *
 * Every case here builds its own history on a disposable published payer by
 * editing the licence number: v1 holds the original, v2 (and v3) the edits, so
 * "reverted to v1" is observable as the licence returning to the original
 * while v1 and v2 stay listed and a NEW version is appended on top.
 *
 * The role case, the 10-version exploratory session and the notification
 * case remain BLOCKED for the reasons each names.
 */

/** The row action a superseded version offers. */
export const REVERT_ACTION = EXPECTED_ROW_ACTIONS.revert;

/** The field edited to grow the history, and the values each version holds. */
export const REVERT_EDIT = {
  label: 'License Number',
  second: 'LIC-REVERT-V2',
  third: 'LIC-REVERT-V3',
} as const;

/** What the revert prompt says, and what it SHOULD say given what the action does. */
export const REVERT_PROMPT = {
  title: /revert to this version/i,
  /** VERIFIED wording - claims a submission. */
  claimsSubmission: /submit.*for approval/i,
  /** What would describe the real outcome: a draft the maker must still send. */
  describesDraft: /draft/i,
  actionLabel: 'Revert',
} as const;

/** How the app confirms a staged revert. */
export const REVERT_SAVED_AS_DRAFT = /saved as draft/i;

/** The version label of a staged revert names its source ("Reverted from v1"). */
export const REVERTED_FROM = /reverted from v\d+/i;

/** The change type a reverted version may be listed under. */
export const REVERT_CHANGE_TYPE = /revert/i;

/** A version that a reviewer has decided reads one of these. */
export const DECIDED = /published|superseded|rejected/i;

/** A request that names no existing version must be refused with one of these. */
export const UNKNOWN_VERSION_REFUSAL = [400, 404, 409, 422] as const;

/** Matches a GUID anywhere in a captured request body. */
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The same request with every version id swapped for one that does not exist. */
export const withUnknownVersionId = (body: unknown): unknown =>
  JSON.parse(JSON.stringify(body).replace(GUID, '00000000-0000-4000-8000-000000000000'));

/** The account the role case needs. */
export const REVERT_ROLE_REQUIREMENT = {
  role: 'a read-only/viewer role on the payer module',
  reason: 'The case proves only the System Administrator can initiate a revert; the shared administrator cannot show the refusal.',
} as const;

/** A version that has been replaced - the only kind that may offer Revert. */
export const SUPERSEDED = /superseded/i;

/** How many superseded versions the role case inspects for a Revert control. */
export const ROLE_CASE_SAMPLE = 3;

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '012',
    title: 'should present a long version history with prior reverts usably',
    reason: 'An exploratory usability session over a payer with 10+ versions and prior reverts is a manual activity; its deterministic parts (append, approve, refuse, reject) are the cases here.',
  },
  {
    id: '014',
    title: 'should notify the approver of a revert request through the standard interface',
    reason: 'This case reads the approver\'s notification for the revert request. No story has yet driven the notification panel, so no reader exists; the request\'s presence in the approval queue is asserted by the workflow case instead.',
  },
];
