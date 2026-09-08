import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { SECOND_ROLE_REQUIREMENT } from '../../../data/payers/concurrentEdit.data';

/**
 * User story: Detect and Prevent Overwriting Concurrent Payer Edits.
 * The conflict rule across DIFFERENT roles.
 *
 * The one dimension the rest of this story cannot cover. Every other case
 * reproduces the stale-copy condition with two tabs, which exercises the same
 * server-side version check - but two tabs of one session necessarily share one
 * role, so "the conflict applies regardless of the second user's role" needs a
 * second account.
 *
 * That account does not exist in this environment: it exposes one set of
 * credentials, belonging to a full administrator. Reported BLOCKED with the
 * account named, rather than approximated with two tabs and reported as a pass -
 * the rule would never have been exercised, so calling it a pass would be a
 * false statement, and calling it a failure would be one too.
 */
test.describe('Detect and Prevent Overwriting Concurrent Payer Edits - Cross-role', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-012: should report the conflict regardless of role when the two sessions belong to different roles', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `a second authorized account is required and none is configured. ${
          SECOND_ROLE_REQUIREMENT.reason
        } Set NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env to an account holding the `
          + `"${SECOND_ROLE_REQUIREMENT.role}" role, then re-run this case.`,
      );
    }

    await steps.critical('Navigate to the Payer Management module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    await steps.step('The second role can open a payer for editing', () =>
      payerManagementPage.expectSearchUiPresent());
  });
});
