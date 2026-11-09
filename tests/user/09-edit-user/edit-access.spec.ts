import { test, expect, type UserRoleSession } from '../../../utils/user/userRole';
import { CASES } from '../../../data/user/editUser.data';

/**
 * User story 20415: Edit User - 20588, the Edit action withheld from an
 * account without Users.UpdateUser. The restricted account is a suite user
 * holding a suite role with View Users + View User only (utils/user/userRole);
 * the shared Payer Admin is never touched. Baseline first: the administrator
 * (who holds Update User) is offered Edit on the same row.
 */
test.describe('US 20415 - Edit User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.editDenied.azureId}: should not offer Edit on another user's row when the account lacks the Edit User permission`, async ({
    steps,
    userRole,
    requireShapeApplied,
    userIn,
    userListPage: list,
  }) => {
    const c = CASES.editDenied;
    const target = await userIn('Active');
    let session!: UserRoleSession;

    await steps.critical(`Baseline - as the administrator (Update User held), Edit is offered on the row of "${target.displayNameEn}"`, async () => {
      await list.openTable();
      await list.revealRow(target.displayNameEn);
      expect((await list.getActionState(target.id, 'edit')).availability, 'Edit for the administrator').toBe('available');
    });

    await steps.critical(`Sign in as a user who does not hold the "Edit User" permission (a suite role with ${c.rights.join(' + ')} only) - the account holds exactly that`, async () => {
      session = await userRole.signIn({ with: c.rights });
      requireShapeApplied(session);
      expect(session.rights, 'the rights of the suite role').not.toContain('Users.UpdateUser');
    });

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      await session.users.openTable();
      expect(await session.users.countRows(), 'user rows listed').toBeGreaterThan(0);
    });

    await steps.step(`Locate an existing user record ("${target.displayNameEn}") - the row is visible`, async () => {
      await session.users.revealRow(target.displayNameEn);
      expect(await session.users.isRowShownById(target.id)).toBe(true);
    });

    await steps.step('Look for an Edit action against the row - the Edit action is not shown, or is disabled', async () => {
      const state = await session.users.getActionState(target.id, 'edit');
      expect(['absent', 'disabled'], `Edit on the row: ${JSON.stringify(state)}`).toContain(state.availability);
    });
  });
});
