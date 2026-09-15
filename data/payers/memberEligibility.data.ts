import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Maintain Member Eligibility Until Policy Expiry".
 *
 * Every case submits a CLAIM for a MEMBER and reads the eligibility verdict -
 * claims adjudication and Member Management, two modules this framework does
 * not cover and this environment exposes no interface for. The payer module's
 * only part in the story is the premise (payer status must NOT decide member
 * eligibility), which cannot be observed without a claim. All fourteen cases
 * are BLOCKED on a claims/member test surface, each naming what it needs.
 */

const NEEDS_CLAIMS =
  'This case submits a claim for a member and reads the eligibility outcome. Claims adjudication '
  + 'and Member Management are outside this framework and this environment exposes no interface '
  + 'for either. Provide a claims test endpoint (or UI) with a member whose policy has a known '
  + 'ExpiryDate, and re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  { id: '001', title: 'should process a claim normally when its service date is before the policy ExpiryDate', reason: NEEDS_CLAIMS },
  { id: '002', title: 'should process a claim normally when its service date is exactly the policy ExpiryDate', reason: NEEDS_CLAIMS },
  { id: '003', title: 'should reject a claim dated one day after the policy ExpiryDate', reason: NEEDS_CLAIMS },
  { id: '004', title: 'should reject a claim dated well beyond the policy ExpiryDate', reason: NEEDS_CLAIMS },
  { id: '005', title: 'should decide eligibility from service date versus ExpiryDate alone across payer statuses', reason: `${NEEDS_CLAIMS} The matrix also needs the payer set to Active, Inactive and Terminated.` },
  { id: '006', title: 'should move the member policy to Expired precisely at its ExpiryDate', reason: NEEDS_CLAIMS },
  { id: '007', title: 'should honour a member\'s claim before their own policy expiry when the payer is terminated mid-term', reason: NEEDS_CLAIMS },
  { id: '008', title: 'should refuse indefinite eligibility when a member policy has no ExpiryDate', reason: `${NEEDS_CLAIMS} It also needs a member record with a null ExpiryDate.` },
  { id: '009', title: 'should keep eligibility consistent when the payer is reinstated before the member\'s policy expiry', reason: NEEDS_CLAIMS },
  { id: '010', title: 'should log every eligibility factor per claim, including the payer status that did not decide it', reason: NEEDS_CLAIMS },
  { id: '011', title: 'should reject a claim with a malformed service date at data validation', reason: NEEDS_CLAIMS },
  { id: '012', title: 'should refuse an eligibility override from a user without the claims-override permission', reason: `${NEEDS_CLAIMS} Plus an account without the claims-override permission.` },
  { id: '013', title: 'should pass the eligibility flag correctly to the claims adjudication interface', reason: NEEDS_CLAIMS },
  { id: '014', title: 'should not silently reject a claim when the eligibility service is unavailable', reason: NEEDS_CLAIMS },
];
