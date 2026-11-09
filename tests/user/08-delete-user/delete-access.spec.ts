import { test, expect, type UserRoleSession } from '../../../utils/user/userRole';
import { clickDialogAction, toastMessages } from '../../../pages/user/userCommon';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, OWN_ACCOUNT_WARNING } from '../../../data/user/deleteUser.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { readUserDashboard, readUserOrNull } from '../../../utils/UserProvisioning';

/**
 * User story 20414: Delete User - who may delete. Restricted accounts are
 * suite users holding a suite role (`userRole.signIn`), never the shared Payer
 * Admin; the own-account case runs as a suite account deleting ITSELF, never
 * as the admin (decision 4). See the data file for the readings.
 */
test.describe('US 20414 - Delete User - access', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.noDeletePermission.azureId}: should not offer Delete to a user without the delete permission`, async ({
    page,
    userIn,
    userListPage,
    userRole,
    requireShapeApplied,
    steps,
  }) => {
    const target = await userIn('Active');
    let session!: UserRoleSession;

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed (baseline: the administrator is offered Delete)', async () => {
      await userListPage.openTable();
      expect(await userListPage.isListed(target.displayNameEn), 'the target user in the administrator\'s list').toBe(true);
      const baseline = await userListPage.getActionState(target.id, 'delete');
      if (baseline.availability !== 'available') steps.blocked(`baseline: the administrator is not offered Delete (${baseline.availability})`);
      expect(baseline.availability).toBe('available');
      session = await userRole.signIn(CASES.noDeletePermission.shape);
      requireShapeApplied(session);
      await session.users.openTable();
      expect(await session.users.countRows(), 'rows in the restricted list').toBeGreaterThan(0);
    });

    await steps.step('Locate an existing user record - the row is visible', async () => {
      expect(await session.users.isListed(target.displayNameEn), 'the target user in the restricted list').toBe(true);
    });

    await steps.step('Look for a Delete action against the row - it is not shown, or is disabled', async () => {
      expect((await session.users.getActionState(target.id, 'delete')).availability, 'Delete without Users.DeleteUser').not.toBe('available');
      expect(await readUserOrNull(page, target.id), 'the target user').not.toBeNull();
    });
  });

  test(`TC-${CASES.ownAccount.azureId}: should handle an attempt to delete the signed-in account safely`, async ({
    page,
    userRole,
    requireShapeApplied,
    steps,
  }) => {
    let session!: UserRoleSession;
    let dialogShown = false;

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      session = await userRole.signIn(CASES.ownAccount.shape);
      requireShapeApplied(session);
      await session.users.openTable();
      await session.users.expectToolbar();
      expect(await session.users.countRows(), 'rows in the list').toBeGreaterThan(0);
    });

    await steps.critical('Locate the currently signed-in account in the list - the row is visible', async () => {
      expect(await session.users.isListed(session.user.displayNameEn), 'the signed-in account\'s own row').toBe(true);
    });

    await steps.step('Attempt to select Delete against the own account - the system prevents the action or clearly warns before allowing it', async () => {
      const state = await session.users.getActionState(session.user.id, 'delete');
      let wording = '';
      if (state.availability === 'available') {
        const prompt = await session.users.requestDelete(session.user.id);
        dialogShown = true;
        wording = `${prompt.title} ${prompt.message}`;
      }
      expect(state.availability !== 'available' || OWN_ACCOUNT_WARNING.test(wording), `Delete on the own row is ${state.availability}; the confirmation reads "${wording}"`).toBe(true);
    });

    await steps.step('Complete the attempt - the own account is handled safely, without leaving the system in a broken state', async () => {
      if (!dialogShown) {
        expect(await readUserOrNull(page, session.user.id), 'the signed-in account (Delete was withheld)').not.toBeNull();
        return;
      }
      const answer = await NetworkUtils.captureResponse(session.page, ApiEndpoints.userDelete, () => clickDialogAction(session.page, 'confirm'));
      const messages = await toastMessages(session.page);
      const status = answer?.status ?? -1;
      test.info().annotations.push({ type: 'observation', description: `20584: self-delete answered ${status} ${answer?.text.slice(0, 160) ?? ''}` });
      if (status >= 400 || status === -1) {
        expect(messages.length, `the refusal is explained (DeleteUser answered ${status})`).toBeGreaterThan(0);
        expect(await readUserOrNull(page, session.user.id), 'the refused account').not.toBeNull();
      } else {
        const endedCleanly = await expect.poll(async () => /\/login/.test(session.page.url()) || (await session.menu.readSessionExpired()).visible, { timeout: 30_000 })
          .toBe(true).then(() => true).catch(() => false);
        expect(endedCleanly, `the deleted account's session after the self-delete (at ${session.page.url()})`).toBe(true);
      }
      expect((await readUserDashboard(page)).total, 'the platform still answers the administrator').toBeGreaterThan(0);
    });
  });
});
