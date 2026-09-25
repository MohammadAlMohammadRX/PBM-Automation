import { test } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import { BLOCKED_CASES } from '../../../data/payers/memberEligibility.data';

/**
 * MOVED TO MANUAL TESTING.
 *
 * This story is verified by hand, so every case below is skipped and carries
 * [MANUAL] at its name. Nothing is deleted: the cases still record what each
 * check is, and the story returns to automation by removing the `.skip` on
 * the describes.
 *
 * WHY IT SUITS A MANUAL PASS.
 * Eligibility is a Member Management and Policies concern, and no payer in this
 * environment owns a policy - so the precondition cannot be built from the
 * payer screens at all. Every one of this story's cases was blocked for that
 * reason in the run of 12-13 September.
 *
 * A manual pass needs a payer with a live policy and members attached, checked
 * either side of the policy expiry date.
 */

/**
 * User story: Maintain Member Eligibility Until Policy Expiry.
 *
 * Every case submits a claim for a member and reads the eligibility verdict.
 * Claims adjudication and Member Management are outside this framework and
 * this environment exposes no interface for either, so each case is reported
 * BLOCKED naming the claims/member surface it needs - see
 * memberEligibility.data.ts.
 */
test.describe.skip('Member eligibility until policy expiry [MANUAL]', () => {
  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-001 = 14981,  TC-002 = 14982,  TC-003 = 14983
    //   TC-004 = 14989,  TC-005 = 14990,  TC-006 = 14991
    //   TC-007 = 14985,  TC-008 = 14997,  TC-009 = 14998
    //   TC-010 = 14999,  TC-011 = 14995
    test(`${azureOrCase('62', 'TC-' + blocked.id)}: [MANUAL] ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
