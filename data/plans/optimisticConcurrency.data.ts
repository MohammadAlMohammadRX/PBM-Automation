import { networkStamp } from '../../utils/NetworkProvisioning';
import { toArabicToken } from '../payers/payer.data';
import type { PlanSpec } from '../../utils/PlanProvisioning';

/**
 * Test data for US 14166 "Guard against concurrent edits with optimistic
 * concurrency" (plan folder 15), written 2026-10-27.
 *
 * THE STAMP: GetPlan returns a `concurrencyStamp` and the edit drawer sends it
 * back on UpdatePlan - the network module's mechanism (US 14138 / 14312, the
 * twins in tests/network/19 and 33). The sheet's "PLN-1001 ... PLN-1013" are
 * each case's OWN draft plan (fixture `planIn`), never a shared record.
 *
 * "USER A / USER B" are two windows signed in as the same administrator:
 * User A is the second window (`staleSession`), whose open form goes stale;
 * User B is the main window. Where the sheet only needs B to HAVE saved (a
 * precondition), B saves through UpdatePlan directly with the current stamp
 * (PlanManagementPage.updateWithStamp); where B's save is a step of its own,
 * it is made through the edit drawer.
 */

/** A case's own draft: effective a day ahead, so a re-sent body is never refused for a past effective date. */
export const CONCURRENCY_PLAN: PlanSpec = { effectiveInMinutes: 24 * 60, expiryInMinutes: 400 * 24 * 60 };

/** A unique new English text value. */
export const edited = (label: string): string => `${label} ${networkStamp()}`;

/** A unique new Arabic text value (Arabic letters only). */
export const editedAr = (prefix = 'وصف محدث'): string => `${prefix} ${toArabicToken(networkStamp())}`;

/** How the server answers a stale save. */
export const CONFLICT = {
  status: 409,
  message: /modified|changed|updated by another|concurrency|no longer current|stale/i,
} as const;

/** What the conflict message must say: the plan changed since it was opened. */
export const CHANGED_SINCE_OPENED = /changed|modified|updated/i;

/** The reload / refresh action the conflict must offer. */
export const RELOAD_ACTION = /reload|refresh|retry/i;

/** A save refused for its stamp (missing / blank / tampered): an error, never a silent accept. */
export const STAMP_REFUSAL_STATUSES = [400, 409, 422] as const;

/** An audit entry recording a REFUSED (conflicting) save attempt. */
export const CONFLICT_AUDIT_ENTRY = /conflict|rejected|refused|failed|concurrency|stale/i;

/** An audit entry recording a successful save. */
export const UPDATE_AUDIT_ENTRY = /update|edit|modif/i;

/** The plan type User A moves the plan to while User B edits the description. */
export const OTHER_TYPE = 'Family';

export const CASE = {
  matchingStamp: '19156',
  staleBlocked: '19157',
  firstConflict: '19158',
  decisionTable: '19159',
  stampPerSave: '19160',
  reloadRetry: '19161',
  missingStamp: '19162',
  doubleSave: '19163',
  repeatedConflicts: '19164',
  conflictMessage: '19165',
  conflictAudited: '19166',
  reloadLatest: '19167',
  successAudited: '19168',
} as const;

export const CHANGES = {
  renamedSuffix: 'v2',
  userA: 'Changed by User A',
  userB: 'Changed by User B',
  userBSecond: 'Second change by User B',
  first: 'First sequential change',
  second: 'Second sequential change',
  tampered: 'Saved with a tampered stamp',
  doubleSave: 'Saved by a double click',
  retried: 'Retried after reloading',
} as const;

/** How many times 19163 clicks Save. */
export const DOUBLE_SAVE_CLICKS = 2;
