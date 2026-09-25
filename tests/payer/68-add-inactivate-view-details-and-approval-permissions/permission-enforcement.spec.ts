import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import { PAYER_PERMISSIONS } from '../../../data/payers/payerPermissions.data';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { ALL_PAYER_PERMISSIONS } from '../../../data/accounts/payerAdminRole.data';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import {
  BLOCKED_CASES,
  GRANTED_CASE_PAYER,
  PAYER_APPROVALS_TAB,
} from '../../../data/payers/permissionEnforcement.data';

/**
 * User story: Add Inactivate, View Details and Approval Permissions.
 *
 * The permission catalogue is reachable and checked here. Enforcement is
 * checked as far as the configured non-admin account reaches - a Payer Admin
 * holding view, export and audit rights and lacking payer approval (see
 * nonAdminAccount.data). The remaining enforcement cases need accounts
 * holding exactly one permission set - see permissionEnforcement.data.ts.
 */
test.describe('Payer permissions - catalogue and role assembly', () => {
  // Azure test case 15793
  test('15793: should list every distinct payer permission in User and Access Management', async ({
    roleAdministrationPage,
    steps,
  }) => {
    await steps.critical('Navigate to Role Administration and open a role\'s permission catalogue', async () => {
      await roleAdministrationPage.open();
      await roleAdministrationPage.expectRolesListed();
    });

    await steps.step('Each payer permission is present as a selectable item', async () => {
      // Existence, not naming: most payer permissions still show under their
      // raw code (the bilingual-names story's finding), so each is accepted
      // under its intended name OR its code.
      const privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
      for (const permission of PAYER_PERMISSIONS) {
        const shown = await privileges.resolveLabel([permission.expectedEn, permission.currentCode]);
        expect(
          shown,
          `the catalogue should offer "${permission.expectedEn}" (code ${permission.currentCode})`,
        ).not.toBe('');
      }
      await roleAdministrationPage.closeDrawer();
    });
  });

  // Azure test case 15790
  test('15790: should let the administrator assemble a custom role from individual payer permissions', async ({
    roleAdministrationPage,
    steps,
  }) => {
    let sample = '';

    await steps.critical('Navigate to Role Administration and confirm roles can be created', async () => {
      await roleAdministrationPage.open();
      await roleAdministrationPage.expectRolesListed();
      expect(await roleAdministrationPage.isCreateActionAvailable(), 'the administrator should be able to add a role').toBe(true);
    });

    await steps.step('An individual payer permission can be toggled on a role', async () => {
      // Toggled and toggled back without saving: the case is about the
      // permissions being individually selectable, not about changing a role.
      const privileges = await roleAdministrationPage.openFirstRolePermissionCatalogue();
      sample = await privileges.resolveLabel([PAYER_PERMISSIONS[0].expectedEn, PAYER_PERMISSIONS[0].currentCode]);
      expect(sample, 'the first payer permission should be in the catalogue').not.toBe('');
      const before = await privileges.isPermissionChecked(sample);
      const after = await privileges.togglePermission(sample);
      expect(after, `"${sample}" should flip when toggled`).toBe(!before);
      await privileges.togglePermission(sample);
      await roleAdministrationPage.closeDrawer();
    });
  });

  // Azure test case 15782
  test('15782: should let a user with View Payer Details open a payer', async ({
    nonAdminSession,
    steps,
  }) => {
    await steps.critical('Navigate to the payer module as the user holding View Payer Details', async () => {
      await nonAdminSession.payers.open();
      await nonAdminSession.payers.expectRowsRendered();
    });

    await steps.step('The payer\'s details open with its record', async () => {
      const detail = await nonAdminSession.payers.openDetails(GRANTED_CASE_PAYER.name);
      await detail.waitForLoaded();
      expect(await detail.getFieldValue('Payer Code'), 'the details should be the payer\'s own').toBe(GRANTED_CASE_PAYER.code);
    });
  });

  // Azure test case 15783
  test('15783: should let a user with Export Payer List export the directory', async ({
    nonAdminSession,
    steps,
  }) => {
    await steps.critical('Navigate to the payer module as the user holding Export Payer List', async () => {
      await nonAdminSession.payers.open();
      await nonAdminSession.exportMenu.expectAvailable();
    });

    await steps.step('The export downloads the payers this user may see', async () => {
      const parsed = await nonAdminSession.exportMenu.exportCsv('all');
      expect(parsed.headers.length, 'the file should carry headers').toBeGreaterThan(0);
      expect(parsed.rows.length, `the file should hold the ${NON_ADMIN_PROFILE.role}'s payers`).toBe(NON_ADMIN_PROFILE.scopedPayers.length);
    });
  });

  // Azure test case 15786
  test('15786: should let a user with View Payer Audit History open the audit trail', async ({
    nonAdminSession,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open a payer as the user holding View Payer Audit History', async () => {
      await nonAdminSession.payers.open();
      const detail = await nonAdminSession.payers.openDetails(GRANTED_CASE_PAYER.name);
      await detail.waitForLoaded();
    });

    await steps.step('The Audit History tab opens with the payer\'s entries', async () => {
      const audit = nonAdminSession.payers.detail().auditHistory();
      await audit.open();
      expect(await audit.getEntryCount(), 'the trail should be readable').toBeGreaterThan(0);
    });
  });

  // Azure test case 15789
  test('15789: should refuse approve and reject to a user without Approval Management · Payer', async ({
    nonAdminSession,
    steps,
  }) => {
    await steps.critical('Navigate to the approvals hub as the user without the payer approval permission', async () => {
      await nonAdminSession.approvals.openHub();
    });

    await steps.step('The hub offers no Payer queue and no approve or reject control', async () => {
      const tabs = await nonAdminSession.approvals.getOfferedTabs();
      expect(tabs, `the payer queue should be withheld; offered: ${tabs.join(', ')}`).not.toContain(PAYER_APPROVALS_TAB);
      await nonAdminSession.approvals.expectApprovalActionsDenied();
    });
  });

  // ---- the WITHHELD halves, on a role shaped for each case ------------------
  // Each of these used to report BLOCKED: the one non-administrator credential
  // in this environment HOLDS the permission whose absence the case is about.
  // The account is now built instead of waited for - the administrator takes the
  // permission off the shared "Payer Admin" role, the case signs in as it, and
  // the permission goes back when the case ends.

  // Azure test case 15778
  test('15778: should refuse inactivation to a user without Inactivate Payer', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without Inactivate Payer', async () => {
      session = await shapedNonAdmin({ without: ['inactivatePayer'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The inactivation action is withheld from this role', async () => {
      await session.payers.expectRowActionUnavailable(GRANTED_CASE_PAYER.name, 'inactivate');
    });
  });

  // Azure test case 15780
  test('15780: should refuse reactivation to a user without Activate Payer', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    // THE BASELINE COMES FIRST, and it is not ceremony. Reactivation is offered
    // only to a payer that is INACTIVE, so on an active record the control is
    // absent whatever the role holds - and the case would pass while proving
    // nothing at all. Asked for WITH the right first, the case can tell the two
    // apart and report BLOCKED rather than a false pass.
    await steps.critical('The reactivation action IS offered while the role holds the right', async () => {
      const held = await shapedNonAdmin({ with: ['activatePayer'] });
      await held.payers.navigate();
      await held.payers.expectRowsRendered();
      const offered = await held.payers.getRowActionAvailability(GRANTED_CASE_PAYER.name, 'activate');
      if (offered !== 'available') {
        steps.blocked(
          `"${GRANTED_CASE_PAYER.name}" does not offer reactivation even to a role that HOLDS `
            + `Activate Payer (the control is ${offered}), because the payer is not inactive. `
            + 'The state withholds the action, not the permission, so withdrawing the permission '
            + 'would prove nothing. The case needs an INACTIVE payer inside the account\'s scope.',
        );
      }
    });

    await steps.critical('Sign in as a user without Activate Payer', async () => {
      session = await shapedNonAdmin({ without: ['activatePayer'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The reactivation action is withheld from this role', async () => {
      await session.payers.expectRowActionUnavailable(GRANTED_CASE_PAYER.name, 'activate');
    });
  });

  // Azure test case 15781
  test('15781: should deny payer details to a user without View Payer Details', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without View Payer Details', async () => {
      session = await shapedNonAdmin({ without: ['viewPayerDetails'] });
      await session.payers.navigate();
    });

    // Two refusals are acceptable and they are not the same: the row may
    // withhold the route, or the page may refuse the record. Only a rendered
    // record is a failure, so the route is checked first and the page only if
    // the route was offered.
    await steps.step('The payer record is not reachable by this role', async () => {
      const route = await session.payers.getRowActionAvailability(GRANTED_CASE_PAYER.name, 'view');
      if (route !== 'available') return;

      const detail = await session.payers.openDetails(GRANTED_CASE_PAYER.name);
      expect(
        await detail.getFieldValue('Payer Code'),
        'a role without View Payer Details should not be shown the record',
      ).not.toBe(GRANTED_CASE_PAYER.code);
    });
  });

  // Azure test case 15784
  test('15784: should refuse the export to a user without Export Payer List', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without Export Payers', async () => {
      session = await shapedNonAdmin({ without: ['exportPayers'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The export control is withheld from this role', () =>
      session.exportMenu.expectExportRefused());
  });

  // Azure test case 15792
  test('15792: should give no payer module access to a role with zero payer permissions', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a role stripped of every payer permission', async () => {
      session = await shapedNonAdmin({ without: ALL_PAYER_PERMISSIONS });
      expect(
        session.removed.length,
        'every payer permission should have been taken off the role',
      ).toBe(ALL_PAYER_PERMISSIONS.length);
    });

    // "No access" may be a redirect, an Access Restricted screen, or a module
    // that renders with nothing usable in it. The Page Object owns that branch
    // because all three are the same answer to the case's question.
    await steps.step('The payer module is closed to a role with no payer permissions', async () => {
      await session.payers.navigate();
      await session.payers.expectSearchAccessRestricted();
    });
  });


  // Azure test case 15795
  test('15795: should block a direct API inactivation from a user without Inactivate Payer', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;
    let payerId = '';

    await steps.critical('Sign in as a user without Inactivate Payer', async () => {
      session = await shapedNonAdmin({ without: ['inactivatePayer'] });
      await session.payers.navigate();
      payerId = await session.payers.getPayerId(GRANTED_CASE_PAYER.name);
      expect(payerId, 'the case needs the payer\'s id to address the endpoint').not.toBe('');
    });

    // THE POINT OF THIS CASE is that the interface is not the gate. It calls the
    // endpoint directly, with this session's own token, so a permission enforced
    // only by hiding a button is caught here rather than passing unnoticed.
    await steps.step('The endpoint refuses the request from this role', async () => {
      const response = await NetworkUtils.postAsSession(session.page, ApiEndpoints.payerInactivate, {
        payerId,
        reason: 'Automated permission probe - expected to be refused',
      });
      expect(
        response.status,
        'a role without Inactivate Payer must be refused by the API, not merely by the screen; '
          + `the server answered ${response.status}`,
      ).toBe(403);
    });
  });
  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-001 = 15777,  TC-003 = 15779,  TC-009 = 15785
    //   TC-011 = 15787,  TC-012 = 15788,  TC-014 = 15791
    //   TC-018 = 15794,  TC-020 = 15796
    test(`${azureOrCase('68', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
