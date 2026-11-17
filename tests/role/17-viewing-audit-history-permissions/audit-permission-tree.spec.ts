import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { misplacedAuditEntries, missingAuditEntries, openAddPrivileges, sharedOrMissingAuditPermissions } from '../../../utils/role/writerDHelpers';
import { AUDIT_RECORD_TYPES, CASES, ROLE_LABEL, VIEW_AUDIT_LOGS } from '../../../data/role/viewingAuditHistoryPermissions.data';

/** Azure step 1: Role Administration as careconnect. */
async function openModule(steps: TestSteps, roleAdmin: RoleAdministrationPage): Promise<void> {
  await steps.critical('Navigate to the Role Management module - Role Management screen loads', async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles answered').toBe(200);
  });
}

const typesList = AUDIT_RECORD_TYPES.map((t) => t.type).join(', ');

/**
 * User story 21302: Viewing Audit History Permissions - the "View Audit Logs" entries of the permission tree
 * (careconnect, Add Role > Privileges, nothing saved). See data/role/viewingAuditHistoryPermissions.data.ts.
 */
test.describe('US 21302 - Viewing Audit History Permissions (permission tree)', () => {
  test(`TC-${CASES.ownPermissionPerType.azureId}: should list a separate View Audit Logs permission under each of the sixteen record types' headings`, async ({ steps, roleAdmin, suiteRoles }) => {
    await openModule(steps, roleAdmin);

    await steps.step(`Open the role permission configuration list and locate each module heading in turn (${typesList}) - each heading shows its own distinct "${VIEW_AUDIT_LOGS}" entry`, async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.tree);
      await roleAdmin.form.tree.expandAll();
      const missing = await missingAuditEntries(roleAdmin.form.tree, AUDIT_RECORD_TYPES, VIEW_AUDIT_LOGS);
      expect(missing, `record types without a "${VIEW_AUDIT_LOGS}" entry under their heading`).toEqual([]);
    });

    await steps.step('Verify no record type shares its View Audit Logs permission with another module - each entry controls only its own module', async () => {
      const problems = sharedOrMissingAuditPermissions(await suiteRoles.catalogue(), AUDIT_RECORD_TYPES, VIEW_AUDIT_LOGS);
      expect(problems).toEqual([]);
      await roleAdmin.form.close('x');
    });
  });

  test(`TC-${CASES.labelledAndGrouped.azureId}: should label each View Audit Logs entry exactly and place it directly under its own module heading`, async ({ steps, roleAdmin, suiteRoles }) => {
    await openModule(steps, roleAdmin);

    await steps.step(`Open the permission configuration list and review the label and grouping of the View Audit Logs entry of each of the sixteen record types (${typesList}) - each reads "${VIEW_AUDIT_LOGS}" and appears directly under its own correctly named heading`, async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, ROLE_LABEL.tree);
      await roleAdmin.form.tree.expandAll();
      const wrong = await misplacedAuditEntries(roleAdmin.form.tree, AUDIT_RECORD_TYPES, VIEW_AUDIT_LOGS);
      expect(wrong).toEqual([]);
      await roleAdmin.form.close('x');
    });
  });
});
