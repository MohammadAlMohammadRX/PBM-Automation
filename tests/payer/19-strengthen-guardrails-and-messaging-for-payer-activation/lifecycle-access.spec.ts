import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { RESTRICTED_ROLE_REQUIREMENT } from '../../../data/payers/lifecycleGuardrails.data';

/**
 * User story: Strengthen Guardrails and Messaging for Payer Activation,
 * Inactivation and Reactivation.
 * Role-based access to the lifecycle actions.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env, and opts out of the
 * shared administrator session so it can sign in as that role - the same shape
 * as the other access specs in this suite.
 *
 * Reported BLOCKED rather than skipped or forced to pass while the account is
 * missing: the administrator holds every permission, so running this case as
 * the administrator would prove nothing about a restricted role, and calling it
 * a failure would assert a refusal that was never observed.
 */
test.describe('Payer lifecycle guardrails - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15435
  test('15435: should withhold the activation and inactivation actions when the user is not authorized to change a payer status', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    payerSample,
    steps,
  }) => {
    // The account is BUILT rather than waited for: the administrator takes
    // the permission off the Payer Admin role, this case signs in as that
    // account, and the permission goes back when the case ends. It used to
    // report BLOCKED because the only non-administrator here HELD the right.
    await shapeRole({ without: ['inactivatePayer', 'activatePayer'] });

    let activePayer!: string;

    await steps.critical('Navigate to the Payer Management module as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      [activePayer] = await payerSample('Active', LIFECYCLE_STATUS.active.en, 1);
      await payerManagementPage.search(activePayer);
    });

    await steps.step('Neither lifecycle control is offered to this role', async () => {
      // Both are asserted, on a payer whose status makes ONE of them valid.
      // Checking only the invalid one would pass for every user in the system -
      // the action is withheld from the administrator too - and would say
      // nothing about permissions.
      await payerManagementPage.expectRowActionUnavailable(activePayer, 'inactivate');
      await payerManagementPage.expectRowActionUnavailable(activePayer, 'activate');
    });

    await steps.step('The payer status is unchanged after the attempt', () =>
      payerManagementPage.expectLifecycleStatus(activePayer, LIFECYCLE_STATUS.active.en));
  });
});
