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

  // Azure test case 15589
  test('15589: should refuse to apply a pending request whose network no longer exists', async ({
    steps,
  }) => {
    // Reported before anything is touched: the case cannot be run safely here,
    // and pretending otherwise would either damage the environment or produce a
    // result that was never observed.
    steps.blocked(DELETION_CONFLICT_BLOCKER.reason);
  });

  // Azure test case 15594
  test('15594: should withhold assignment from an unauthorized user and block self-approval', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    // The account is BUILT rather than waited for: the administrator takes
    // the permission off the Payer Admin role, this case signs in as that
    // account, and the permission goes back when the case ends. It used to
    // report BLOCKED because the only non-administrator here HELD the right.
    await shapeRole({ without: ['assignNetworks', 'unassignNetwork'] });

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
      // MEASURED 21 September 2026: this control is ABSENT on the scoped payers
      // even for a role that HOLDS the assignment rights (see folder 59 TC-006,
      // whose baseline reports BLOCKED for exactly that). A pass here therefore
      // proves nothing about the permission, so the case says so instead of
      // claiming a refusal it did not observe.
      if (availability === 'absent') {
        steps.blocked(
          `"${payerName}" does not offer the Assign Network control even to a role that HOLDS `
            + 'the assignment rights, so withdrawing them proves nothing. The case needs a payer '
            + 'whose detail page offers the control - one with assignable networks in scope.',
        );
      }
      expect(
        availability,
        'a role without assignment rights must not be offered the Assign Network control',
      ).not.toBe('available');
    });

    await steps.step('The role cannot approve its own submitted request', () =>
      approvalManagementPage.expectApprovalActionsDenied());
  });
});
