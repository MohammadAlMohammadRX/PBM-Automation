import { test } from '../../../fixtures';
import { BLOCKED_CASES } from '../../../data/networks/activateNetwork.data';

/**
 * User story 14128: Activate network manually from Inactive status.
 * The cases this environment cannot run yet - each names what it waits for.
 */
test.describe('US 14128 - Activation cases waiting on the environment', () => {
  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
