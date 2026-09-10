import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { NETWORK_STATUS, RESTRICTED_ROLE_REQUIREMENT } from '../../../data/networks/networkActivation.data';

/**
 * User story: Enable Network Activation Regardless of Payer Status.
 * Role-based access to a network's lifecycle actions.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env and opts out of the
 * shared administrator session, like every other access case in this suite.
 *
 * BLOCKED while that account is missing, rather than skipped or passed: the
 * administrator holds every permission, so the withholding this case exists to
 * prove could not be observed, and asserting a refusal that was never seen
 * would be worse than reporting the gap.
 */
test.describe('Network activation - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-007: should withhold the network lifecycle actions when the user is not authorized to change a network status', async ({
    loginPage,
    networkManagementPage,
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

    let network!: string;

    await steps.critical('Open the Networks module as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await networkManagementPage.openList();
      await networkManagementPage.expectRowsRendered();
    });

    await steps.step('A network is listed but offers no lifecycle action', async () => {
      // Read as "whatever this role can see, it cannot change". Both directions
      // are checked on one row: only one of them would be offered to an
      // administrator anyway, so asserting a single direction could pass purely
      // because of the network's status rather than the user's role.
      const found = await networkManagementPage.findNetworkWithStatus(NETWORK_STATUS.inactive);
      if (found === null) {
        steps.blocked(
          'this role can see no network in a live status, so there is no row whose lifecycle '
          + 'actions could be shown to be withheld.',
        );
      }
      network = found!;
      await networkManagementPage.search(network);
      await networkManagementPage.expectRowActionUnavailable(network, 'activate');
      await networkManagementPage.expectRowActionUnavailable(network, 'inactivate');
    });

    await steps.step('The network status is unchanged after the attempt', () =>
      networkManagementPage.expectStatusText(network, NETWORK_STATUS.inactive));
  });
});
