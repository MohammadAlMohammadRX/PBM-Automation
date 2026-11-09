/**
 * Test data for US 14122 case 17789 "Approved registration is set to Pending
 * when the assigned payer is inactive" (folder 05) - automated again on
 * 2026-11-08 (it was moved to Manual on 2026-10-29).
 *
 * The form only offers the top-bar scope payer, and the scope selector lists
 * ACTIVE payers only, so the registration for an INACTIVE payer (fixture
 * `inactivePayer`, the suite's own) is made through the same calls the form
 * makes - create, assign a pharmacy, submit, approve - effective today, a
 * couple of minutes ahead (the create refuses a past time).
 *
 * The sheet's "Pending" is the application's "Future" (no Pending label exists,
 * Foundation-Notes 2026-11-08). The check is the sheet's: once approved, with
 * the effective time reached and a pharmacy assigned, the network does NOT
 * read Active. Approval never activates a network by itself here (the daily
 * job does); whether the job, on its next run, withholds activation because of
 * the inactive payer is US 14129's 17845 (BLOCKED - no seed holds an inactive
 * owner) and is annotated as not exercised.
 *
 * TC vs story 24 ("require an active payer before going live"): if the
 * approval itself is refused for the inactive payer, step 4 ("the system
 * processes the approval and generates a network code") fails - the sheet is
 * asserted.
 */
export const CASES = {
  inactivePayerPending: { azureId: '17789' },
} as const;

/** Effective "today": a couple of minutes ahead. */
export const EFFECTIVE_IN_MINUTES = 2;

/** The permanent code issued at approval (a draft carries NET-D-nnnn). */
export { PERMANENT_CODE } from './networkForm.data';

/** What the version reads while the registration awaits approval. */
export const AWAITING_APPROVAL = /pending/i;
