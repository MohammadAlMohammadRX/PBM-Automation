import { test } from '../../../fixtures';
import { BLOCKED_CASES } from '../../../data/networks/jobSchedule.data';

/**
 * User story 14310: Make the daily network status job configurable and
 * date-aware. The cases this environment cannot run - each names the missing
 * resource (a site time zone other than the shared Asia/Riyadh, an empty
 * register) and what would unblock it.
 */
test.describe('US 14310 - Daily network job cases waiting on the environment', () => {
  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
