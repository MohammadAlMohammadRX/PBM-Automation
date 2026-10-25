import { test } from '../../../fixtures';
import { BLOCKED_CASES } from '../../../data/networks/deactivateNetwork.data';

/**
 * User story 14127: Deactivate network with a documented reason.
 * The cases this environment cannot run yet - each names what it waits for.
 */
test.describe('US 14127 - Deactivation cases waiting on the environment', () => {
  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
