import { MEMBERSHIP } from './proposeFacilities.data';

/**
 * Test data for US 14131 case 17912 "Use case - reviewer sees the proposed
 * facility membership when approving the change" (folder 14) - automated again
 * on 2026-11-08.
 *
 * The network is the case's OWN, approved with one pharmacy (the sheet's
 * current membership) and effective in two days, so it reads Future: the old
 * version asked for an ACTIVE network, which now waits for the daily lifecycle
 * job (Foundation-Notes 2026-11-08) - and the proposal flow does not depend on
 * the network being Active. The sheet's PHM-04 / PHM-05 are the suite's
 * pharmacies A and B; the existing member is pharmacy C.
 */
export const CASES = {
  reviewerSeesMembership: { azureId: '17912' },
} as const;

export { MEMBERSHIP };

/** What a review marks a proposed facility with. */
export const ADDITION_MARK = /add|new|propos|assign/i;
