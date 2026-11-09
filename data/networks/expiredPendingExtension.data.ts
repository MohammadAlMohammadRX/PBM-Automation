/**
 * Test data for US 14309 case 18131 "Network remains Expired while an
 * extending edit is pending approval" (folder 31) - automated 2026-11-08 by
 * seed-then-check (see jobDrivenNetwork.data.ts).
 *
 * The Expired network is today's `ExpiredThenExtend` seed, claimed EXCLUSIVELY
 * (the case stages an edit on it). The edit extends the expiry to the sheet's
 * 2026-12-31 (+70 days from the sheet's site date) and is sent for approval but
 * NOT approved. The last step ("run the daily job while the edit is
 * unapproved") needs a job run AFTER the case's own edit; the case does not move
 * the job, so that run is annotated as not exercised and the record's status
 * after the edit is what is asserted.
 */
export const CASES = {
  expiredWhilePending: { azureId: '18131' },
} as const;

/** "PendingNewExpiryDate = 2026-12-31" - days from today. */
export const EXTENDED_EXPIRY_DAYS = 70;
