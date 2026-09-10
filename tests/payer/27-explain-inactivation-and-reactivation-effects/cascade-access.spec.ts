import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { RESTRICTED_ROLE_REQUIREMENT } from '../../../data/payers/cascadeMessaging.data';

/**
 * User story: Explain Inactivation and Reactivation Effects Before They Are
 * Applied.
 * Role-based access to the two actions.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env and opts out of the
 * shared administrator session, like every other access case in this suite.
 *
 * Reported BLOCKED while that account is missing: the administrator holds every
 * permission, so the refusal this case exists to observe cannot happen, and
 * asserting one that was never seen would be worse than reporting the gap.
 */
test.describe('Inactivation and reactivation effects - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-011: should withhold the inactivation and reactivation actions from a user without status rights', async ({
    loginPage,
    payerManagementPage,
    payerSample,
    steps,
  }) => {
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. ${
          RESTRICTED_ROLE_REQUIREMENT.reason
        } Set them to an account holding ${RESTRICTED_ROLE_REQUIREMENT.role}, then re-run this `
          + 'case.',
      );
    }

    let activeName!: string;

    await steps.critical('Open the payer list as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('A payer record is opened', async () => {
      [activeName] = await payerSample('Active', LIFECYCLE_STATUS.active.en, 1);
      await payerManagementPage.search(activeName);
      await payerManagementPage.expectLifecycleStatus(activeName, LIFECYCLE_STATUS.active.en);
    });

    await steps.step('Neither lifecycle control is offered to this role', async () => {
      // Both directions on one row. Only one of them would be offered to an
      // administrator anyway, so checking a single direction could pass because
      // of the payer's status rather than the user's permissions.
      await payerManagementPage.expectRowActionUnavailable(activeName, 'inactivate');
      await payerManagementPage.expectRowActionUnavailable(activeName, 'activate');
    });

    await steps.step('The payer status is unchanged after the attempt', () =>
      payerManagementPage.expectLifecycleStatus(activeName, LIFECYCLE_STATUS.active.en));
  });
});
