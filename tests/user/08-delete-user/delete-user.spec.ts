import { test, expect } from '../../../fixtures';
import type { UserListPage } from '../../../pages/user/UserListPage';
import { clickDialogAction, readDialog, toastMessages } from '../../../pages/user/userCommon';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, DELETED, DELETE_ERROR, DELETE_PROMPT, IRREVERSIBLE, LAST_USER_BLOCK, LOCKED_BLOCK } from '../../../data/user/deleteUser.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { isSuiteUser, listUsers, readUserOrNull, userSearchKey } from '../../../utils/UserProvisioning';
import { CONFIRM_IDS, burstClick, countWrites, makeUnreachable, rawUser } from '../../../utils/user/writerCHelpers';

/** "Navigate to the User Management module": opens Users Administration and answers whether it lists the case's user. */
async function openList(list: UserListPage, displayName: string): Promise<boolean> {
  await list.openTable();
  return list.isListed(displayName);
}

/**
 * User story 20414: Delete User - the administrator's cases. Every user
 * deleted is the case's own suite user; no other account is ever touched. The
 * restricted account and the own-account case live in delete-access.spec.ts.
 * See the data file for the readings.
 */
test.describe('US 20414 - Delete User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.deleteInactive.azureId}: should delete an inactive user after confirmation and drop it from the list`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Deactivated');

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the inactive target user in the list').toBe(true);
    });

    await steps.critical('Select the user to be removed - the user row is shown', async () => {
      expect(await userListPage.isRowShownById(user.id), 'the user\'s row').toBe(true);
      expect((await userListPage.readRowById(user.id)).status, 'the row\'s status').toMatch(/Inactive/i);
    });

    await steps.critical('Click the Delete action - a confirmation prompt is displayed', async () => {
      const prompt = await userListPage.requestDelete(user.id);
      expect(prompt.title, 'the confirmation title').toMatch(DELETE_PROMPT.title);
      expect(prompt.message, 'the confirmation message').toMatch(DELETE_PROMPT.message);
    });

    await steps.step('Confirm the deletion - the user is removed from the list and a success message is shown', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.userDelete, () => clickDialogAction(page, 'confirm'));
      const messages = await toastMessages(page);
      expect(answer?.status ?? -1, `DeleteUser answered ${answer?.text.slice(0, 200) ?? 'nothing'}`).toBe(200);
      expect(messages.join(' | '), 'the success message').toMatch(DELETED);
      expect(await userListPage.isListed(user.displayNameEn), 'the deleted user in the list').toBe(false);
      expect(await readUserOrNull(page, user.id), 'the deleted user can no longer be loaded').toBeNull();
    });
  });

  test(`TC-${CASES.confirmationWording.azureId}: should ask for a clearly worded confirmation with Confirm and Cancel before deleting`, async ({
    page,
    userIn,
    userListPage,
    userConfirmDialog,
    steps,
  }) => {
    const user = await userIn('Active');

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.critical('Select a user and click Delete - a confirmation dialog appears', async () => {
      const prompt = await userListPage.requestDelete(user.id);
      expect(prompt.title, 'the confirmation title').toMatch(DELETE_PROMPT.title);
    });

    await steps.step('Inspect the confirmation dialog - it states the action is irreversible and presents Confirm and Cancel options', async () => {
      const keys = await userConfirmDialog.getActionKeys();
      const shown = await readDialog(page);
      expect(keys, `the dialog's actions (${shown.actions.join(' / ')})`).toEqual(expect.arrayContaining(['confirm', 'cancel']));
      expect(`${shown.title} ${shown.message}`, 'the confirmation wording').toMatch(IRREVERSIBLE);
      expect(await readUserOrNull(page, user.id), 'nothing is deleted while the dialog is open').not.toBeNull();
    });
  });

  test(`TC-${CASES.cancelKeepsUser.azureId}: should leave the user unchanged when the deletion is cancelled`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    const before = await rawUser(page, user.id);

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.critical('Select a user and click Delete - the confirmation dialog appears', async () => {
      const prompt = await userListPage.requestDelete(user.id);
      expect(prompt.message, 'the confirmation message').toMatch(DELETE_PROMPT.message);
    });

    await steps.step('Click Cancel on the confirmation dialog - the dialog closes', async () => {
      const sent = await countWrites(page, ApiEndpoints.userDelete, () => clickDialogAction(page, 'cancel'), 1_500);
      expect((await readDialog(page)).visible, 'the dialog after Cancel').toBe(false);
      expect(sent, 'DeleteUser requests sent').toBe(0);
    });

    await steps.step('Refresh the user list - the user is still present and unchanged', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the user after the refresh').toBe(true);
      const after = await rawUser(page, user.id);
      expect({ isActive: after?.isActive, stamp: after?.concurrencyStamp, email: after?.email }, 'the user record').toEqual({ isActive: before?.isActive, stamp: before?.concurrencyStamp, email: before?.email });
    });
  });

  test(`TC-${CASES.deletedNotFound.azureId}: should not find a deleted user by name or document ID anywhere in the module`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.critical('Delete a user and confirm - the user is removed from the list', async () => {
      const answer = await userListPage.deleteUser(user.id);
      expect(answer.status, `DeleteUser answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(await userListPage.isRowShownById(user.id), 'the deleted user\'s row').toBe(false);
    });

    await steps.step('Search for the deleted user by name or Document ID - no matching record is found', async () => {
      const byName = await userListPage.searchFor(userSearchKey(user.displayNameEn));
      const byNameRow = await userListPage.isRowShownById(user.id);
      const byDocument = await userListPage.searchFor(user.documentId);
      const byDocumentRow = await userListPage.isRowShownById(user.id);
      expect({
        byName: byName.items.some((u) => u.id === user.id) || byNameRow,
        byDocumentId: byDocument.items.some((u) => u.id === user.id) || byDocumentRow,
        loadable: (await readUserOrNull(page, user.id)) !== null,
      }, 'the deleted user anywhere in the module').toEqual({ byName: false, byDocumentId: false, loadable: false });
    });
  });

  test(`TC-${CASES.anyStatus.azureId}: should delete users whatever their status`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const active = await userIn('Active');
    const inactive = await userIn('Deactivated');

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      await userListPage.openTable();
      expect(await userListPage.countRows(), 'rows in the list').toBeGreaterThan(0);
    });

    await steps.step('Delete an Active user and confirm - the user is removed from the register', async () => {
      await userListPage.revealRow(active.displayNameEn);
      expect((await userListPage.readRowById(active.id)).status, 'the row\'s status').toMatch(/^Active/i);
      const answer = await userListPage.deleteUser(active.id);
      expect(answer.status, `DeleteUser answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(await readUserOrNull(page, active.id), 'the Active user after the delete').toBeNull();
    });

    await steps.step('Delete an Inactive user and confirm - the user is removed from the register', async () => {
      await userListPage.revealRow(inactive.displayNameEn);
      expect((await userListPage.readRowById(inactive.id)).status, 'the row\'s status').toMatch(/Inactive/i);
      const answer = await userListPage.deleteUser(inactive.id);
      expect(answer.status, `DeleteUser answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(await readUserOrNull(page, inactive.id), 'the Inactive user after the delete').toBeNull();
    });

    await steps.step('Delete a Locked user and confirm - the user is removed from the register', async () => {
      steps.blocked(LOCKED_BLOCK);
    });
  });

  test(`TC-${CASES.lastRemainingUser.azureId}: should delete the only remaining user account`, async ({
    page,
    userListPage,
    steps,
  }) => {
    let onlyUserId = '';

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      await userListPage.openTable();
      expect(await userListPage.countRows(), 'rows in the list').toBeGreaterThan(0);
    });

    await steps.critical('Select the only remaining user account and click Delete - the confirmation dialog appears', async () => {
      const listed = await listUsers(page, {}, 5);
      const only = listed.totalRows === 1 ? listed.items[0] : null;
      if (!only || !isSuiteUser(only)) return steps.blocked(`${LAST_USER_BLOCK} (Users Administration lists ${listed.totalRows} accounts)`);
      onlyUserId = only.id;
      const prompt = await userListPage.requestDelete(onlyUserId);
      expect(prompt.title, 'the confirmation title').toMatch(DELETE_PROMPT.title);
    });

    await steps.step('Confirm the deletion - the user is removed and the list shows no remaining non-administrator users', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.userDelete, () => clickDialogAction(page, 'confirm'));
      expect(answer?.status ?? -1, `DeleteUser answered ${answer?.text.slice(0, 200) ?? 'nothing'}`).toBe(200);
      expect((await listUsers(page, {}, 5)).totalRows, 'accounts left in Users Administration').toBe(0);
    });
  });

  test(`TC-${CASES.rapidConfirm.azureId}: should process a rapidly repeated delete confirmation only once`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let messages: string[] = [];

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.step('Select a user, click Delete and confirm several times rapidly - only a single deletion is processed', async () => {
      const prompt = await userListPage.requestDelete(user.id);
      expect(prompt.title, 'the confirmation title').toMatch(DELETE_PROMPT.title);
      const sent = await countWrites(page, ApiEndpoints.userDelete, () => burstClick(page, CONFIRM_IDS.dialog, CASES.rapidConfirm.clicks));
      messages = await toastMessages(page);
      expect(sent, `DeleteUser requests after ${CASES.rapidConfirm.clicks} rapid confirmations`).toBe(1);
    });

    await steps.step('Refresh the list - the user is removed exactly once, with no errors or duplicate actions', async () => {
      expect(messages.filter((m) => DELETE_ERROR.test(m)), 'error messages after the rapid confirmations').toEqual([]);
      expect(messages.filter((m) => /User deleted/i.test(m)).length, 'success messages').toBeLessThanOrEqual(1);
      expect(await openList(userListPage, user.displayNameEn), 'the user after the refresh').toBe(false);
      expect(await readUserOrNull(page, user.id), 'the deleted user').toBeNull();
    });
  });

  test(`TC-${CASES.backendFailure.azureId}: should tell the administrator when a deletion fails and keep the user`, async ({
    page,
    userIn,
    userListPage,
    steps,
  }) => {
    const user = await userIn('Active');
    let messages: string[] = [];

    await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
      expect(await openList(userListPage, user.displayNameEn), 'the target user in the list').toBe(true);
    });

    await steps.step('Select a user, click Delete and confirm while the back end is unreachable - the deletion request fails', async () => {
      const restore = await makeUnreachable(page, ApiEndpoints.userDelete);
      try {
        const prompt = await userListPage.requestDelete(user.id);
        expect(prompt.title, 'the confirmation title').toMatch(DELETE_PROMPT.title);
        await clickDialogAction(page, 'confirm');
        messages = await toastMessages(page, 8_000);
      } finally {
        await restore();
      }
      expect(await readUserOrNull(page, user.id), 'the user after the failed request').not.toBeNull();
    });

    await steps.step('Observe the response - a clear error message is shown and the user remains in the register', async () => {
      expect(messages.join(' | ') || '(no message)', 'the message shown when the deletion failed').toMatch(DELETE_ERROR);
      expect(await openList(userListPage, user.displayNameEn), 'the user after a refresh').toBe(true);
    });
  });
});
