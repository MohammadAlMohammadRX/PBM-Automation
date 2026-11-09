import { test } from '../../../fixtures';
import { BLOCKED_CASES } from '../../../data/user/changePassword.data';

/**
 * User story 20425: Change Password - the FORCED change ("Set a New Password")
 * and password expiry. Data-driven BLOCKED tests: the environment cannot
 * produce a session signed in with a system-issued password, nor an expired
 * password (foundation notes table (e)); each names the missing resource. The
 * reasons live in the data file so they can be switched to real cases later.
 */
test.describe('US 20425 - Change Password', () => {
  for (const c of BLOCKED_CASES) {
    test(`TC-${c.azureId}: ${c.title}`, async ({ steps }) => {
      steps.blocked(c.reason);
    });
  }
});
