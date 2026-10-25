import { test, expect } from '../../../fixtures';
import { BLOCKED_CASES, NON_ADMIN_DENIED, RAPID_TOGGLE } from '../../../data/networks/rolePayerScope.data';

/**
 * User story 14322: Restrict role payer assignments to a defined scope.
 *
 * Two cases run for real; the other nine are BLOCKED, each naming what is
 * missing - see rolePayerScope.data.ts for why (the sole administrator has an
 * unlimited payer scope, and payers are assigned per user, not per role).
 */
test.describe('US 14322 - Role payer scope', () => {
  test(`TC-${NON_ADMIN_DENIED.azureId}: should deny role payer-scope configuration in the UI and on the server when the user is not a System Administrator`, async ({
    networkManagementPage,
    nonAdminSession,
    roleAdministrationPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Network Management module - the landing page loads', async () => {
      await networkManagementPage.openList();
      const baseline = await roleAdministrationPage.openAndReportAccess();
      expect(baseline.reachable, 'the System Administrator should reach Role Administration').toBe(true);
    });

    await steps.step('Opening Role Management is denied for the non-administrator', async () => {
      const outcome = await nonAdminSession.roles.openAndReportAccess();
      expect(outcome.reachable, `the non-administrator reached Role Administration (${outcome.url})`).toBe(false);
      expect(`${outcome.url} ${outcome.text}`).toMatch(NON_ADMIN_DENIED.refusal);
    });

    await steps.step('Modifying a role\'s payer assignment directly is blocked by the server', async () => {
      const answer = await nonAdminSession.roles.attemptRoleUpdateViaApi(NON_ADMIN_DENIED.attemptedBody);
      expect(
        NON_ADMIN_DENIED.authorisationRefusals,
        `UpdateRole answered ${answer.status}: ${answer.text.slice(0, 200)}`,
      ).toContain(answer.status);
    });
  });

  test(`TC-${RAPID_TOGGLE.azureId}: should save exactly the last confirmed state when the payer-acceptance setting is toggled rapidly`, async ({
    roleAdministrationPage,
    cleanup,
    steps,
  }) => {
    const role = RAPID_TOGGLE.role();
    const finalState = RAPID_TOGGLE.finalState;

    await steps.critical('Navigate to Role Management - a role the case owns is listed', async () => {
      cleanup.register(() => roleAdministrationPage.deleteRole(role.nameEn));
      await roleAdministrationPage.createDisposableRole(role.nameEn, role.nameAr, RAPID_TOGGLE.startsWith, RAPID_TOGGLE.permission);
      expect(await roleAdministrationPage.getRoleNames()).toContain(role.nameEn);
    });

    await steps.step('Rapid toggling leaves the switch stable on its last state', async () => {
      await roleAdministrationPage.openEditDrawer(role.nameEn);
      await roleAdministrationPage.toggleHasAssignedPayers(RAPID_TOGGLE.toggles);
      expect(await roleAdministrationPage.readHasAssignedPayers()).toBe(finalState);
    });

    await steps.step('Saving succeeds and the saved role reopens with that same final state', async () => {
      await roleAdministrationPage.saveRole();
      await roleAdministrationPage.open();
      await roleAdministrationPage.openEditDrawer(role.nameEn);
      expect(await roleAdministrationPage.readHasAssignedPayers(), 'the saved state should match the last state on screen').toBe(finalState);
      await roleAdministrationPage.closeDrawerDiscarding();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
