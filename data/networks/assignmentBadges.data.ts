import { IN_PROGRESS, PROPOSED, START } from './facilityApprovalStates.data';
import { BUDGET, FACILITY_ACTIVE } from './facilities.data';

/**
 * Test data for US 14307 case 18107 "Verify all status badges/labels render
 * completely and distinctly" (folder 29) - automated again on 2026-11-08.
 *
 * History: on 2026-10-29 the badge-tone bug it raised (20027) was removed at the
 * user's request and the case moved to Manual. The sheet is asserted as
 * written - every checklist status with its own label AND its own visual
 * treatment - so a shared tone fails again, for QA to judge.
 *
 * Two networks of the case's own, approved with pharmacies B and C and
 * effective in two days (they read Future): the old version waited for them to
 * be Active, which now needs the daily job; assignment states do not depend on
 * the network being Active. On each, pharmacy A is proposed and C removed; the
 * second is sent for approval - giving Draft Assignment / Draft Removal and
 * Pending Assignment / Pending Removal, with B as the settled (Active) row.
 */
export const CASES = {
  badgesDistinct: { azureId: '18107' },
} as const;

export { BUDGET, FACILITY_ACTIVE, IN_PROGRESS, PROPOSED, START };
