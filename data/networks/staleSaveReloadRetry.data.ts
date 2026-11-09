import { CHANGES as STALE_CHANGES, CONFLICT, LOCKING_DRAFT, RELOAD_ACTION, SAVED_TOAST, edited } from './staleSaveWarning.data';

/**
 * Test data for US 14312 case 18155 "User successfully reloads and retries the
 * save after being warned of a conflicting update" (folder 33) - automated
 * again on 2026-11-08 (moved to Manual on 2026-10-29 after the bug-sheet review;
 * the sheet is asserted as written).
 *
 * NA_UserA and NA_UserB are two windows of the same administrator
 * (`staleSession`); NA_UserB's change is the network type (the form has no
 * status field), NA_UserA's is the description. The case's own draft network,
 * so no job is involved.
 */
export const CASES = {
  reloadRetry: { azureId: '18155' },
} as const;

export const CHANGES = STALE_CHANGES;

export { CONFLICT, LOCKING_DRAFT, RELOAD_ACTION, SAVED_TOAST, edited };
