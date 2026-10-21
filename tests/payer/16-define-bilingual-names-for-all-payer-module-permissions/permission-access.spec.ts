import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { ROLE_SHAPES } from '../../../data/payers/payerPermissions.data';
import { ALL_PAYER_PERMISSIONS } from '../../../data/accounts/payerAdminRole.data';
import { GRANTED_CASE_PAYER } from '../../../data/payers/permissionEnforcement.data';
import { controlAvailability, type ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';

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
 *
 * SUPERSEDED IN PART, 2026-10-06. Comparing ROLES never needed several
 * logins: 15386 and 15392 now reshape the one "Payer Admin" role into each
 * role in turn (shapedNonAdmin) and are real tests. What remains blocked needs
 * two DIFFERENT PEOPLE at once - a submitter and a separate reviewer (15389) -
 * or approval rights, which sit in a section of the permission tree the
 * shaping does not edit (15391).
 */
test.describe('Define Bilingual Names for All Payer Module Permissions - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15386
  //
  // Converted from BLOCKED on 2026-10-06. Three roles need one login, not
  // three: the same "Payer Admin" role is reshaped into each in turn and signed
  // into - see ROLE_SHAPES.
  test('15386: should expose only the permitted payer actions when each of three roles opens the module', async ({
    shapedNonAdmin,
    steps,
  }) => {
    for (const role of [ROLE_SHAPES.partial, ROLE_SHAPES.exporter, ROLE_SHAPES.full]) {
      let session!: ShapedSession;

      await steps.critical(`Sign in as ${role.label}`, async () => {
        session = await shapedNonAdmin({ with: [...role.with], without: [...role.without] });
        await session.payers.navigate();
        await session.payers.expectRowsRendered();
      });

      await steps.step(`${role.label} is offered exactly its actions`, async () => {
        const missing: string[] = [];
        for (const control of role.offered) {
          if ((await controlAvailability(session, GRANTED_CASE_PAYER.name, control)) !== 'available') {
            missing.push(control);
          }
        }
        const leaked: string[] = [];
        for (const control of role.withheld) {
          if ((await controlAvailability(session, GRANTED_CASE_PAYER.name, control)) === 'available') {
            leaked.push(control);
          }
        }
        expect(
          { missing, leaked },
          `${role.label}: every permitted action should be offered and every other one withheld`,
        ).toEqual({ missing: [], leaked: [] });
      });
    }
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

  // Azure test case 15392
  //
  // Converted from BLOCKED on 2026-10-06 - the two roles are the same login,
  // reshaped in turn. See ROLE_SHAPES.
  test('15392: should deny every payer action to a role with no permissions and allow every one to a full role', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a role holding no payer permission', async () => {
      session = await shapedNonAdmin({ without: ALL_PAYER_PERMISSIONS });
      expect(
        session.removed.length,
        'every payer permission should have been taken off the role',
      ).toBe(ALL_PAYER_PERMISSIONS.length);
    });

    // "Denied" may be a redirect, an Access Restricted screen or a module with
    // nothing usable in it - the Page Object treats all three as the same answer.
    await steps.step('The payer module is closed to the no-permission role', async () => {
      await session.payers.navigate();
      await session.payers.expectSearchAccessRestricted();
    });

    await steps.critical(`Sign in as ${ROLE_SHAPES.full.label}`, async () => {
      session = await shapedNonAdmin({ with: [...ROLE_SHAPES.full.with] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The full role is offered every payer action, including creation', async () => {
      const missing: string[] = [];
      for (const control of ROLE_SHAPES.full.offered) {
        if ((await controlAvailability(session, GRANTED_CASE_PAYER.name, control)) !== 'available') {
          missing.push(control);
        }
      }
      if (!(await session.payers.isCreateActionAvailable())) missing.push('create');
      expect(missing, 'a role holding every payer permission should be offered every payer action')
        .toEqual([]);
    });
  });
});
