import { test } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { ROLE_REQUIREMENTS } from '../../../data/payers/payerPermissions.data';

/**
 * User story: Define Bilingual Names for All Payer Module Permissions.
 * Role-based enforcement of the nine payer permissions.
 *
 * EVERY CASE HERE NEEDS AN ACCOUNT THAT DOES NOT EXIST. This environment
 * exposes one set of credentials, belonging to a full administrator, so a case
 * asking "does Role A see export but not inactivate?" cannot be distinguished
 * from "the administrator sees everything". Reporting a pass would be a false
 * statement about the application, and reporting a failure would be one too -
 * the rule was never exercised.
 *
 * So each case reports BLOCKED and NAMES the account to provision. That is the
 * useful output: whoever reads the report learns exactly what to create to turn
 * six BLOCKED results into six real ones, rather than a vague "insufficient
 * permissions".
 *
 * `NON_ADMIN_USERNAME` / `NON_ADMIN_PASSWORD` are honoured where a single
 * restricted account is enough, so these cases start working the moment one is
 * configured. The cases needing two DISTINCT non-admin roles stay blocked until
 * the framework carries more than one such credential.
 */
test.describe('Define Bilingual Names for All Payer Module Permissions - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15386
  test('15386: should expose only the permitted payer actions when each of three roles opens the module', async ({
    steps,
  }) => {
    steps.blocked(
      'this case compares THREE distinct roles - a partial role, an exporter role and a full '
        + `role - and the framework carries one non-admin credential at most. `
        + `${ROLE_REQUIREMENTS.partial.reason} ${ROLE_REQUIREMENTS.exporter.reason} `
        + `${ROLE_REQUIREMENTS.full.reason}`,
    );
  });

  // Azure test case 15388
  test('15388: should hide the approve and reject controls when a reviewer lacking the approval permission opens a pending request', async ({
    requireNonAdmin,
    loginPage,
    payerManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    // BLOCKED (not FAIL) when the configured non-admin account cannot serve this
    // case - see data/accounts/nonAdminAccount.data.ts for what it holds.
    requireNonAdmin({ lacking: ['approvePayer'] });

    await steps.critical('Navigate to the Payer Management module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    // openHub, not open: a reviewer without the payer approval permission is
    // not offered the Payer queue at all (VERIFIED as the Payer Admin), and
    // open() asserts that queue's table.
    await steps.step('The approvals hub is opened as the reviewer', () =>
      approvalManagementPage.openHub());

    await steps.step('The Approve and Reject controls are hidden or disabled', () =>
      approvalManagementPage.expectApprovalActionsDenied());
  });

  // Azure test case 15389
  test('15389: should apply the change when a reviewer other than the submitter approves the request', async ({
    steps,
  }) => {
    steps.blocked(
      'this case needs TWO accounts - a submitter and a different reviewer - and this '
        + `environment exposes one. ${ROLE_REQUIREMENTS.secondReviewer.reason} Approving as `
        + 'the submitter would exercise the opposite rule, which TC-014 already covers.',
    );
  });

  // Azure test case 15391
  test('15391: should block or flag the decision when a reviewer cannot view the change they are approving', async ({
    steps,
  }) => {
    steps.blocked(
      'this case needs an account holding the approve/reject permission but NOT view-details, '
        + 'so that the two can be shown to be governed separately. No such account exists '
        + `here. ${ROLE_REQUIREMENTS.reviewerWithoutApproval.reason}`,
    );
  });

  // Azure test case 15392
  test('15392: should deny every payer action to a role with no permissions and allow every one to a full role', async ({
    steps,
  }) => {
    steps.blocked(
      'this case compares a no-permission role against a full role in the same run, which '
        + `needs two credentials. ${ROLE_REQUIREMENTS.none.reason} ${ROLE_REQUIREMENTS.full.reason}`,
    );
  });
});
