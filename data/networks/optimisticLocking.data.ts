import type { NetworkSpec } from '../../utils/NetworkProvisioning';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { repeatTo } from './network.data';

/**
 * Test data for US 14138 "Prevent concurrent edits with optimistic locking".
 *
 * WHAT THE STAMP IS (verified in the edit drawer's own traffic, 2026-10-21):
 * GetNetwork returns a `concurrencyStamp` (a GUID) and the drawer sends it back
 * in the body of `PUT /api/Networks/UpdateNetwork`, beside
 * `confirmRevertToDraft`. The sheet's "v1 / v2" are stand-ins for successive
 * stamp values; the cases compare the stamp before and after a save.
 *
 * "TWO ADMINISTRATORS" are two windows signed in as the same administrator
 * (fixture `staleSession`) - this environment has one administrator account,
 * and optimistic locking is per record, not per user.
 *
 * Each case edits its OWN network (fixture `networkIn`), never a shared one. A
 * draft is enough for the stamp: it is the same record and the same endpoint.
 * Its effective date is set a day ahead so a re-sent body is never refused
 * for a past effective date. The permission rows need an Active network
 * instead, because another user's draft is private to its author.
 */

/** Spec for a case's own draft network (effective tomorrow). */
// Effective a day out, so it is approved but PENDING - never Active. Asked for as
// 'Active' until 2026-10-24, which waited 6 min for a status it could not reach
// and blocked 17973 / 17981.
export const LOCKING_DRAFT: NetworkSpec = { effectiveInMinutes: 24 * 60, expiryInMinutes: 400 * 24 * 60 };

/** A unique new value for a text field. */
export const edited = (label: string): string => `${label} ${networkStamp()}`;

/** How the server answers a stale save. */
export const CONFLICT = {
  status: 409,
  /** What a conflict body / message must say: the record changed since it was read. */
  message: /modified|changed|updated by another|concurrency|no longer current|stale/i,
} as const;

/** What a user must be offered after a conflict: a way to reload and retry. */
export const RELOAD_ACTION = /reload|refresh|retry/i;

/** The statuses a refused-as-invalid request may carry (validation, not conflict). */
export const VALIDATION_STATUSES = [400, 422] as const;

/** A request without the right to edit. */
export const FORBIDDEN_STATUS = 403;

/** What a validation error about the stamp must mention. */
export const STAMP_REQUIRED = /concurrency|stamp|version/i;

/** The sheet's malformed stamp (17980). */
export const MALFORMED_STAMP = '###invalid_token###';

/** The sheet's 256-character "max-length" stamp: the stored stamp is a 36-character GUID, its full length. */
export const EMPTY_STAMP = '';

/** A 256-character token that does NOT match - used to show a long stamp is judged by value, not length. */
export const LONG_WRONG_STAMP = repeatTo('a', 256);

/** Fields in a structured error body (17982). */
export const ERROR_BODY_FIELDS = ['Status', 'Title'] as const;

export const CASE = {
  matchingStamp: '17970',
  staleStamp: '17971',
  stampBoundaries: '17972',
  decisionTable: '17973',
  stateTransition: '17974',
  twoAdministrators: '17975',
  missingStamp: '17977',
  simultaneous: '17976',
  exploratory: '17978',
  checklist: '17979',
  malformedStamp: '17980',
  noEditPermission: '17981',
  apiContract: '17982',
} as const;

/** The sheet's field changes, by case. */
export const CHANGES = {
  renamedSuffix: 'Updated',
  firstAdmin: 'Description changed by the first administrator',
  secondAdminType: 'PPO',
  staleEdit: 'Description changed in the stale window',
  reapplied: 'Description reapplied after refreshing',
  extraAfterRefresh: 'Typed after refreshing, before retrying',
} as const;

/** How many times the exploratory case refreshes in a row. */
export const RAPID_REFRESHES = 3;
