import { test, expect } from '../../../fixtures';
import { PAYER_PERMISSIONS } from '../../../data/payers/payerPermissions.data';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
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
  test('TC-017: should list every distinct payer permission in User and Access Management', async ({
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

  test('TC-015: should let the administrator assemble a custom role from individual payer permissions', async ({
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

  test('TC-005: should let a user with View Payer Details open a payer', async ({
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

  test('TC-007: should let a user with Export Payer List export the directory', async ({
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

  test('TC-010: should let a user with View Payer Audit History open the audit trail', async ({
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

  test('TC-013: should refuse approve and reject to a user without Approval Management · Payer', async ({
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

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
