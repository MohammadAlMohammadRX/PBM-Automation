import { test } from '../../../fixtures';
import { BLOCKED_CASES } from '../../../data/networks/goLivePrerequisites.data';

/**
 * User story 14301: Require pharmacy coverage and an active payer before a
 * network can go live.
 * The cases this environment cannot run yet - each names what it waits for.
 */
test.describe('US 14301 - Go-live cases waiting on the environment', () => {
  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
