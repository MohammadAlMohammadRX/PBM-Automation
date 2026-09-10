import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import {
  DELETION_CONFLICT_BLOCKER,
  RESTRICTED_ROLE_REQUIREMENT,
} from '../../../data/networks/networkAssignment.data';

/**
 * User story: Re-validate Network Selection at Approval Time.
 * Access control, and the one scenario this suite declines to automate.
 *
 * TC-012 needs a restricted account and reports BLOCKED without one, like every
 * other access case here. Its self-approval half is worth reading closely: the
 * sheet expects a maker to be unable to approve their own request, and this
 * application allows it - the same administrator both submits and approves
 * throughout this suite. That is asserted, and fails, which is the report.
 *
 * TC-006 is BLOCKED BY CHOICE, not by a missing account. It asks for a network
 * to be DELETED while an assignment request for it is pending. Deletion is
 * irreversible and this environment holds a single assignable network, so
 * running it would destroy the precondition every other case in this story
 * depends on with no way to restore it. The case states that, names what to
 * provision, and leaves the data alone.
 */
test.describe('Network selection re-validation - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-006: should refuse to apply a pending request whose network no longer exists', async ({
    steps,
  }) => {
    // Reported before anything is touched: the case cannot be run safely here,
    // and pretending otherwise would either damage the environment or produce a
    // result that was never observed.
    steps.blocked(DELETION_CONFLICT_BLOCKER.reason);
  });

  test('TC-012: should withhold assignment from an unauthorized user and block self-approval', async ({
    loginPage,
    payerManagementPage,
    approvalManagementPage,
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

    let payerName!: string;

    await steps.critical('Open the payer list as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
      payerName = (await payerManagementPage.getVisiblePayerNames())[0];
      expect(payerName, 'the restricted user should see at least one payer').not.toBe(undefined);
    });

    await steps.step('The assignment control is withheld from this role', async () => {
      const detail = await payerManagementPage.openDetails(payerName);
      const availability = await detail.getAssignNetworkAvailability();
      expect(
        availability,
        'a role without assignment rights must not be offered the Assign Network control',
      ).not.toBe('available');
    });

    await steps.step('The role cannot approve its own submitted request', () =>
      approvalManagementPage.expectApprovalActionsDenied());
  });
});
