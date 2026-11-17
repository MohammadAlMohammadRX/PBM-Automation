import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import type { SuiteRole } from '../../../fixtures/roleModule.fixture';
import { ROLE_MESSAGES } from '../../../data/role/common.data';
import {
  BETWEEN_DELETIONS,
  CASES,
  DELETED_TOAST,
  DELETE_DIALOG,
  DELETE_DIALOG_TITLE,
  HOLDERS_FOR_BLOCKED_DELETE,
  LONG_NAME_LENGTH,
  MULTI_DELETE_COUNT,
  VIEW_ONLY_RIGHTS,
} from '../../../data/role/deleteRole.data';
import { readRole } from '../../../utils/role/roleApi';
import {
  actionOf,
  allTableRows,
  cardsForSearch,
  confirmDeleteTolerant,
  controlStates,
  deleteControlProblems,
  deletionProblems,
  dialogMessageFits,
  listActionThenDelete,
  normText,
  padName,
  pokePredefined,
  predefinedCards,
  predefinedRows,
  replaceRoleThroughDrawer,
  roleOptionsInAssign,
  roleOptionsInInvitation,
  rolesOnUser,
  rowsShowing,
  saidSave,
  sepless,
  statesOutside,
  uniqueToken,
  usersHoldingRole,
  type DeletionObservation,
} from '../../../utils/role/writerCHelpers';

/** Step 1: Role Administration (careconnect) showing the case's own suite role. */
async function openRegister(steps: TestSteps, roleAdmin: RoleAdministrationPage, roleName: string, expected = 'the Role Register list is displayed'): Promise<void> {
  await steps.critical(`Navigate to the Role Management module - ${expected}`, async () => {
    await roleAdmin.open();
    const found = await roleAdmin.search(roleName);
    expect(found.items.map((r) => r.name), 'the case\'s suite role in the list').toEqual([roleName]);
  });
}

/** The open delete dialog as "<title> — <message>", normalised. */
async function dialogText(roleAdmin: RoleAdministrationPage): Promise<string> {
  const shown = await roleAdmin.dialog.read();
  return normText(`${shown.title} — ${shown.message}`);
}

/**
 * User story 21294: Delete Role. Every role deleted (or refused) is the case's own suite role; suite users holding
 * one are the case's own. Predefined rows are only read and given real (force) clicks on their disabled control.
 * See the data file for the readings.
 */
test.describe('US 21294 - Delete Role', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.deleteUnassigned.azureId}: should delete a custom role that no user holds after confirming`, async ({ page, steps, roleAdmin, suiteRoles }) => {
    const role = await suiteRoles.create({ label: 'delete' });
    await openRegister(steps, roleAdmin, role.name);

    await steps.critical('Select Delete on the unassigned custom role - a confirmation dialog "Delete Role — Do you want to delete {{name}}?" is displayed', async () => {
      await roleAdmin.openDelete(role.id);
      expect(await dialogText(roleAdmin)).toBe(normText(DELETE_DIALOG(role.name)));
    });

    await steps.step(`Confirm the deletion - the role is removed and "${DELETED_TOAST}" is displayed`, async () => {
      const out = await roleAdmin.dialog.confirmDelete();
      expect({ status: out.status, toast: sepless(out.toast) }, `DeleteRole answered ${out.status} "${out.apiMessage}"`).toEqual({ status: 200, toast: sepless(DELETED_TOAST) });
      await expect(roleAdmin.row(role.id)).toHaveCount(0);
      expect(await readRole(page, role.id), 'GetRole of the deleted role').toBeNull();
    });
  });

  test(`TC-${CASES.deletedGone.azureId}: should drop a deleted role from the Role Register and from every assignment list`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers }) => {
    const role = await suiteRoles.create({ label: 'deleted gone' });
    const host = await suiteUsers.create({ role: await suiteRoles.create({ label: 'assign host' }) });
    const removed = await suiteRoles.remove(role.id);

    await steps.critical('Navigate to the Role Management module - the Role Register list is displayed (the role has just been deleted)', async () => {
      expect(removed.status, 'DeleteRole of the precondition').toBeLessThan(300);
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles').toBe(200);
    });

    await steps.step('Search for the deleted role name in the Role Register - the role is not found in the list', async () => {
      const result = await roleAdmin.search(role.name);
      expect(result.items.map((r) => r.name), `GetRoles for "${role.name}"`).toEqual([]);
      await expect(roleAdmin.emptyText()).toHaveText(ROLE_MESSAGES.noRolesFound);
    });

    await steps.step('Open the Users module and attempt to assign a role to a user - the deleted role does not appear in the selectable list (nor in an invitation)', async () => {
      expect({ users: (await roleOptionsInAssign(page, host)).includes(role.name), invitations: (await roleOptionsInInvitation(page)).includes(role.name) }, 'the deleted role offered in the Role lists')
        .toEqual({ users: false, invitations: false });
    });
  });

  test(`TC-${CASES.assignedBlocked.azureId}: should block deleting a role that users still hold`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers }) => {
    const role = await suiteRoles.create({ label: 'held' });
    const holders: { id: string; name: string }[] = [];
    for (let i = 0; i < HOLDERS_FOR_BLOCKED_DELETE; i += 1) {
      const user = await suiteUsers.create({ role });
      holders.push({ id: user.id, name: user.displayNameEn });
    }
    const holdersNow = (): Promise<string[]> => usersHoldingRole(page, holders, role.name);
    await openRegister(steps, roleAdmin, role.name);

    await steps.critical('Select Delete on the role that has assigned users - the confirmation dialog is displayed', async () => {
      // Evidence for the finding: the users hold the role (GetUser) at the moment of the attempt.
      expect(await holdersNow(), `suite users holding "${role.name}" right before the delete (GetUser)`).toEqual(holders.map((h) => h.name));
      await roleAdmin.openDelete(role.id);
      expect((await roleAdmin.dialog.read()).title).toBe(DELETE_DIALOG_TITLE);
    });

    await steps.step(`Confirm the deletion attempt - deletion is blocked, the role remains in the Role Register, and the user is informed that the role is still in use (held by ${HOLDERS_FOR_BLOCKED_DELETE} suite users)`, async () => {
      const out = await confirmDeleteTolerant(roleAdmin, page);
      const after = await roleAdmin.search(role.name);
      const stillHeldBy = await holdersNow();
      expect({ refused: out.status === null || out.status >= 400, stillListed: after.items.some((r) => r.id === role.id), stillReadable: (await readRole(page, role.id)) !== null, informed: out.toast !== '' },
        `DeleteRole of a role held by ${holders.length} users (checked by GetUser just before) answered ${out.status} "${out.apiMessage}"; toast "${out.toast}"; afterwards the users still hold it: ${stillHeldBy.length}`).toEqual({ refused: true, stillListed: true, stillReadable: true, informed: true });
    });
  });

  test(`TC-${CASES.predefinedDisabled.azureId}: should disable Delete for every predefined role`, async ({ page, steps, roleAdmin }) => {
    await steps.critical('Navigate to the Role Management module - the Role Register list is displayed', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles').toBe(200);
    });

    await steps.step('Inspect the Delete control for each predefined role - the Delete action is disabled and unavailable for every predefined role', async () => {
      const rows = await predefinedRows(roleAdmin, page);
      const poked = await pokePredefined(roleAdmin, page, 'delete');
      const cards = await predefinedCards(roleAdmin, page);
      expect({
        table: statesOutside(controlStates(rows, 'delete'), ['disabled']),
        triggered: Object.entries(poked).filter(([, p]) => p.opened).map(([n]) => n),
        cards: Object.entries(cards).filter(([, c]) => c.actions.some((a) => a.action === 'delete' && a.enabled)).map(([n]) => n),
      }, 'predefined roles whose Delete is not a disabled, inert control').toEqual({ table: [], triggered: [], cards: [] });
    });
  });

  test(`TC-${CASES.hiddenWithoutPermission.azureId}: should hide Delete from a user without the Delete permission`, async ({ steps, roleAdmin, roleHolder, suiteRoles }) => {
    const target = await suiteRoles.create({ label: 'delete target' });
    await roleHolder.becomeSuiteRole({ label: 'no delete', rights: [...VIEW_ONLY_RIGHTS] });

    await steps.critical('Navigate to the Role Management module (as the user without the Delete permission) - the Role Register list is displayed', async () => {
      const answer = await roleHolder.roles.open();
      expect(answer.status, 'GetRoles as the holder').toBe(200);
    });

    await steps.step('Inspect non-predefined role rows for a Delete control - the Delete action/button is not shown to the user on any role', async () => {
      await roleAdmin.open();
      await roleAdmin.search(target.name);
      const baseline = actionOf({ actions: await roleAdmin.rowActions(target.id) }, 'delete');
      const holderRows = await allTableRows(roleHolder.roles);
      const holderCards = await cardsForSearch(roleHolder.roles, target.name);
      expect({
        baselineOffered: baseline.present && baseline.enabled,
        rows: rowsShowing(holderRows.rows, 'delete'),
        cards: holderCards.filter((c) => c.actions.some((a) => a.action === 'delete')).map((c) => c.name),
      }, `the holder saw ${holderRows.rows.length} rows`).toEqual({ baselineOffered: true, rows: [], cards: [] });
    });
  });

  test(`TC-${CASES.cancelKeeps.azureId}: should keep the role unchanged when the deletion is cancelled`, async ({ page, steps, roleAdmin, suiteRoles }) => {
    const role = await suiteRoles.create({ label: 'cancel delete' });
    const stamp = role.record.concurrencyStamp;
    await openRegister(steps, roleAdmin, role.name);

    await steps.critical('Select Delete on the custom role - a confirmation dialog "Delete Role — Do you want to delete {{name}}?" is displayed', async () => {
      await roleAdmin.openDelete(role.id);
      expect(await dialogText(roleAdmin)).toBe(normText(DELETE_DIALOG(role.name)));
    });

    await steps.step('Select Cancel instead of confirming - the dialog closes and the role is not deleted, remaining visible and unchanged in the Role Register', async () => {
      await roleAdmin.dialog.cancel();
      expect(await roleAdmin.dialog.isOpen(), 'the dialog').toBe(false);
      await expect(roleAdmin.row(role.id)).toBeVisible();
      expect((await readRole(page, role.id))?.concurrencyStamp, 'the role\'s concurrency stamp').toBe(stamp);
    });
  });

  test(`TC-${CASES.onlyNonPredefined.azureId}: should offer Delete on every non-predefined role and disable it on the predefined ones`, async ({ steps, roleAdmin, suiteRoles }) => {
    await suiteRoles.create({ label: 'delete matrix' });
    await steps.critical('Navigate to the Role Management module - the Role Register list is displayed', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles').toBe(200);
    });

    await steps.step('Review the Delete control across all roles in the list - Delete is enabled only for non-predefined roles and disabled for predefined roles', async () => {
      const table = await allTableRows(roleAdmin);
      expect(deleteControlProblems(table.rows),`${table.rows.length} rows on ${table.totalPages} page(s)`).toEqual([]);
    });
  });

  test(`TC-${CASES.afterLastUserRemoved.azureId}: should delete a role right after its last user was moved off it`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers }) => {
    const roleA = await suiteRoles.create({ label: 'interim' });
    const roleB = await suiteRoles.create({ label: 'replacement' });
    const user = await suiteUsers.create({ role: roleA });
    await steps.critical('Navigate to the Role Management module - the Role Register list is displayed', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles').toBe(200);
    });

    await steps.critical('Remove the role assignment from its last remaining user via the Users module - the role shows zero assigned users', async () => {
      const saved = await replaceRoleThroughDrawer(page, user, roleA.id, roleB.name);
      const roles = await rolesOnUser(page, user.id);
      expect({ saved: saved.status >= 200 && saved.status < 300, stillHolds: roleA.name in roles }, `${saidSave(saved)}; the user holds [${Object.keys(roles).join(', ')}]`).toEqual({ saved: true, stillHolds: false });
    });

    await steps.critical('Return to Role Management and select Delete on the now-unassigned role - the confirmation dialog is displayed', async () => {
      await roleAdmin.open();
      await roleAdmin.search(roleA.name);
      await roleAdmin.openDelete(roleA.id);
      expect(await dialogText(roleAdmin)).toBe(normText(DELETE_DIALOG(roleA.name)));
    });

    await steps.step(`Confirm the deletion - the role is deleted and "${DELETED_TOAST}" is displayed`, async () => {
      const out = await roleAdmin.dialog.confirmDelete();
      expect({ status: out.status, toast: sepless(out.toast) }, `DeleteRole answered ${out.status} "${out.apiMessage}"`).toEqual({ status: 200, toast: sepless(DELETED_TOAST) });
    });
  });

  test(`TC-${CASES.longName.azureId}: should show the whole 100-character role name in the delete confirmation and delete it`, async ({ page, steps, roleAdmin, suiteRoles }) => {
    const role = await suiteRoles.create({ nameEn: padName(suiteRoles.newName('long'), LONG_NAME_LENGTH) });
    await steps.critical('Navigate to the Role Management module - the Role Register list is displayed showing the long role name', async () => {
      await roleAdmin.open();
      await roleAdmin.search(role.name);
      expect({ length: role.name.length, shown: await roleAdmin.rowName(role.id) }).toEqual({ length: LONG_NAME_LENGTH, shown: role.name });
    });

    await steps.step('Select Delete on the role - the confirmation dialog "Delete Role — Do you want to delete {{name}}?" is displayed with the full role name rendered correctly', async () => {
      await roleAdmin.openDelete(role.id);
      const fit = await dialogMessageFits(page);
      expect({ text: await dialogText(roleAdmin), fits: fit.fits }, `the message box (${fit.overflow})`).toEqual({ text: normText(DELETE_DIALOG(role.name)), fits: true });
    });

    await steps.step(`Confirm the deletion - the role deletes successfully with "${DELETED_TOAST}"`, async () => {
      const out = await roleAdmin.dialog.confirmDelete();
      expect({ status: out.status, toast: sepless(out.toast) }, `DeleteRole answered ${out.status} "${out.apiMessage}"`).toEqual({ status: 200, toast: sepless(DELETED_TOAST) });
    });
  });

  test(`TC-${CASES.multipleDeletions.azureId}: should keep the Role Register consistent while several roles are deleted between sorts and filters`, async ({ page, steps, roleAdmin, suiteRoles }) => {
    const token = uniqueToken();
    const roles: SuiteRole[] = [];
    for (let i = 0; i < MULTI_DELETE_COUNT; i += 1) roles.push(await suiteRoles.create({ label: `multi ${token}` }));
    const ids = roles.map((r) => r.id);

    await steps.critical('Navigate to the Role Management module - the Role Register list is displayed with multiple deletable roles', async () => {
      await roleAdmin.open();
      const found = await roleAdmin.search(token);
      expect(found.items.map((r) => r.id).sort(), `the ${MULTI_DELETE_COUNT} suite roles sharing "${token}"`).toEqual([...ids].sort());
    });

    await steps.step(`Delete several custom roles one after another, sorting and filtering the list between deletions (${BETWEEN_DELETIONS.join(', ')}) - the list, counts, and pagination stay accurate after each deletion`, async () => {
      const observations: DeletionObservation[] = [];
      for (let i = 0; i < roles.length; i += 1) {
        observations.push(await listActionThenDelete(roleAdmin, page, BETWEEN_DELETIONS[i % BETWEEN_DELETIONS.length], token, roles[i], ids));
      }
      expect(deletionProblems(observations, ids, DELETED_TOAST), `${observations.length} deletions`).toEqual([]);
    });
  });
});
