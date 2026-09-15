import { test } from '../../../fixtures';
import { BLOCKED_CASES } from '../../../data/payers/memberEligibility.data';

/**
 * User story: Maintain Member Eligibility Until Policy Expiry.
 *
 * Every case submits a claim for a member and reads the eligibility verdict.
 * Claims adjudication and Member Management are outside this framework and
 * this environment exposes no interface for either, so each case is reported
 * BLOCKED naming the claims/member surface it needs - see
 * memberEligibility.data.ts.
 */
test.describe('Member eligibility until policy expiry', () => {
  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
