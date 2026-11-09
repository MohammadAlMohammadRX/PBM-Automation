import { test, expect, type UserRoleSession } from '../../../utils/user/userRole';
import { CASES } from '../../../data/user/activateAndDeactivateUser.data';

/**
 * User story 20416: Activate and Deactivate User - who may activate or
 * deactivate. Activate and Deactivate share ONE right
 * (Users.ToggleUserActivation) and ONE row control (`-toggle-activation`,
 * labelled Inactivate on an active user and Activate on an inactive one). The
 * restricted account is a suite user holding a suite role with every user
 * right except that one (`userRole.signIn`), after the administrator is shown
 * both controls on the same users. See the data file for the readings.
 */
test.describe('US 20416 - Activate and Deactivate User - access', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.toggleHiddenWithoutPermission.azureId}: should show Activate / Deactivate only to users who hold the permission`, async ({
    userIn,
    userListPage,
    userRole,
    requireShapeApplied,
    steps,
  }) => {
    const active = await userIn('Active');
    const inactive = await userIn('Deactivated');
    let session!: UserRoleSession;

    await steps.critical('Navigate to the User Management module - the user list loads (baseline: the administrator is offered Inactivate and Activate)', async () => {
      await userListPage.openTable();
      const baseline: Record<string, string> = {};
      for (const u of [active, inactive]) {
        expect(await userListPage.isListed(u.displayNameEn), `"${u.displayNameEn}" in the administrator's list`).toBe(true);
        baseline[u.isActive ? 'active' : 'inactive'] = (await userListPage.getActionState(u.id, 'toggleActivation')).availability;
      }
      if (baseline.active !== 'available' || baseline.inactive !== 'available') steps.blocked(`baseline: the administrator is not offered the Activate / Deactivate control (${JSON.stringify(baseline)})`);
      expect(baseline).toEqual({ active: 'available', inactive: 'available' });
      session = await userRole.signIn(CASES.toggleHiddenWithoutPermission.shape);
      requireShapeApplied(session);
      await session.users.openTable();
      expect(await session.users.countRows(), 'rows in the restricted list').toBeGreaterThan(0);
    });

    await steps.step('Open the actions available for a user record - no Activate or Deactivate option is shown', async () => {
      const shown: Record<string, string> = {};
      for (const u of [active, inactive]) {
        expect(await session.users.isListed(u.displayNameEn), `"${u.displayNameEn}" in the restricted list`).toBe(true);
        shown[u.isActive ? 'deactivateOnActiveUser' : 'activateOnInactiveUser'] = (await session.users.getActionState(u.id, 'toggleActivation')).availability;
      }
      expect(shown, 'the Activate / Deactivate control without Users.ToggleUserActivation').toEqual({ deactivateOnActiveUser: 'absent', activateOnInactiveUser: 'absent' });
    });

    await steps.step('Log out and log in as a user holding the permission, then repeat the check - the Activate / Deactivate option is visible', async () => {
      const out = await session.menu.logout();
      expect(out.path, 'the restricted account after Logout').toMatch(/\/login/);
      await userListPage.openTable();
      const shown: Record<string, string> = {};
      for (const u of [active, inactive]) {
        expect(await userListPage.isListed(u.displayNameEn), `"${u.displayNameEn}" in the administrator's list`).toBe(true);
        const state = await userListPage.getActionState(u.id, 'toggleActivation');
        shown[u.isActive ? 'deactivateOnActiveUser' : 'activateOnInactiveUser'] = `${state.availability}`;
      }
      expect(shown, 'the Activate / Deactivate control for the administrator').toEqual({ deactivateOnActiveUser: 'available', activateOnInactiveUser: 'available' });
    });
  });
});
