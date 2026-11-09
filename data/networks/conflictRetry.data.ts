import { CHANGES as LOCKING_CHANGES, CONFLICT, LOCKING_DRAFT, RELOAD_ACTION, edited } from './optimisticLocking.data';

/**
 * Test data for the three US 14138 cases automated again on 2026-11-08
 * (folder 19): 17974 (editing -> conflict -> refreshed -> updated), 17975 (two
 * administrators editing at once) and 17979 (the conflict checklist). They were
 * moved to Manual on 2026-10-29 after the bug-sheet review; the user asked on
 * 2026-11-08 for every Sprint 1 Manual case to be automated, and the sheet is
 * asserted as written.
 *
 * "Two administrators" are two windows signed in as the same administrator
 * (fixture `staleSession`) - one administrator account exists, and the lock is
 * per record. Each case edits its OWN draft network (`LOCKING_DRAFT`), so no
 * job is involved.
 */
export const CASES = {
  stateTransition: { azureId: '17974' },
  twoAdministrators: { azureId: '17975' },
  checklist: { azureId: '17979' },
} as const;

export const CHANGES = {
  ...LOCKING_CHANGES,
  /** Administrator 2's "different field" (the sheet's Status - the form's equivalent is the type). */
  secondAdminType: 'PPO',
  reapplied: 'Description reapplied after refreshing',
} as const;

export { CONFLICT, LOCKING_DRAFT, RELOAD_ACTION, edited };
