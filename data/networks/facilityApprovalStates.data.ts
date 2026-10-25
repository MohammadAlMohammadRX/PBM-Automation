import { ASSIGNMENT_STATE, FACILITY, SETTLED } from './facilities.data';

/**
 * Test data for US 14307 "Track the approval state of pending pharmacy
 * assignment changes".
 *
 * Verified 2026-10-21 on the Facility Assignment tab: an unsubmitted addition
 * reads "Draft Assignment" with Assigned On "—"; the settled row reads "—" in
 * Assignment and its approval date in Assigned On. Submitting moves the draft
 * to Pending (Assignment / Removal); approval settles it. The sheet's FAC-3xx
 * facilities are played by the environment's three; its fixed dates by TODAY,
 * the day the case's own network and changes are approved.
 */
export const CASE = {
  draftAssignment: '18099',
  assignmentLifecycle: '18100',
  removalLifecycle: '18101',
  decisionTable: '18102',
  distinctLabels: '18103',
  dateAtApproval: '18104',
  duplicateSubmission: '18105',
  rejectPending: '18106',
  badgesDistinct: '18107',
  dateAfterRefresh: '18109',
  approversOnly: '18108',
  workflowSync: '18110',
  dateMatchesApproval: '18111',
} as const;

/** The membership every case's network starts with: kept (stays settled) and removed. */
export const START = { kept: FACILITY.pharmacyB, removed: FACILITY.nathealth } as const;

/** The facility a case proposes. */
export const PROPOSED = FACILITY.pharmacyA;

export const STATE = ASSIGNMENT_STATE;
export const NO_DATE = SETTLED;

/** The four in-progress labels, for the distinctness checks. */
export const IN_PROGRESS = [
  ASSIGNMENT_STATE.draftAssignment,
  ASSIGNMENT_STATE.draftRemoval,
  ASSIGNMENT_STATE.pendingAssignment,
  ASSIGNMENT_STATE.pendingRemoval,
] as const;

/** What a rejected change may read instead of Pending. */
export const AFTER_REJECTION = /Draft Assignment|Rejected/;

/** What a duplicate submission's refusal should say. */
export const ALREADY_PENDING = /already|pending/i;
