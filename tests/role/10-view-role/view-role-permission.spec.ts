import { test, expect } from '../../../fixtures';
import { attemptOnSuiteRole } from '../../../utils/role/roleApi';
import {
  attemptOnListedRole,
  changeableControls,
  describeAttempt,
  openViewOf,
} from '../../../utils/role/writerBHelpers';
import { WRITER_B_IDS } from '../../../constants/role/writerBIds';
import { CASES, EDIT_RIGHT, STORY, TITLES, VIEW_LABELS, VIEW_RIGHT } from '../../../data/role/viewRole.data';

/**
 * User story 21289: View Role - who may open it. The holder (maalmohammad) is given a suite role WITHOUT the view
 * right (22096) and then one with it, without and with the edit right (22097). careconnect shows the View action
 * first (baseline). Every role read is a suite role; the holder is restored by its fixture.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test(`TC-${CASES.noViewPermission.azureId}: should not let a user without the view-roles permission open View Role`, async ({ page, steps, suiteRoles, roleHolder, roleAdmin }) => {
    test.setTimeout(8 * 60_000);
    const d = CASES.noViewPermission;
    const target = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed or restricted by permission (careconnect is offered View first)', async () => {
      const made = await suiteRoles.create({ label: d.targetLabel });
      target.id = made.id;
      target.name = made.name;
      await roleAdmin.open();
      await roleAdmin.search(target.name);
      await expect(roleAdmin.action(target.id, 'view'), 'View for careconnect - baseline').toBeEnabled();
      await roleHolder.becomeSuiteRole({ label: d.holderLabel, rights: d.holderRights });
      const me = await roleHolder.permissions();
      expect(me.permissions, `the holder's session must lack ${VIEW_RIGHT}`).not.toContain(VIEW_RIGHT);
    });

    await steps.step('Try the View action on a role as the unprivileged user - View is unavailable or access is denied', async () => {
      const attempt = await attemptOnListedRole(roleHolder.roles, target, 'view');
      expect(attempt.opened, `the holder's View on "${target.name}" (list ${attempt.listShown ? 'shown' : 'refused'}; ${describeAttempt(attempt)})`).toBe(false);
      const read = await attemptOnSuiteRole(page, roleHolder.page, target.id, 'read', suiteRoles.owned);
      expect(read.status, `GetRole as the holder answered ${read.status}: ${read.text.slice(0, 160)}`).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.viewRegardlessOfEdit.azureId}: should open the same read-only View Role for a holder with only the view permission and one with view and edit`, async ({ steps, suiteRoles, roleHolder, roleAdmin }) => {
    test.setTimeout(10 * 60_000);
    const d = CASES.viewRegardlessOfEdit;
    const target = { id: '', name: '' };
    const seen = { viewOnly: {} as Record<string, string> };

    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed', async () => {
      const made = await suiteRoles.create({ label: d.targetLabel });
      target.id = made.id;
      target.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Sign in as the user holding only the view-roles permission and open the role\'s View - the View Role panel opens with the role\'s details', async () => {
      await roleHolder.becomeSuiteRole({ label: d.viewOnlyLabel, rights: d.viewOnlyRights });
      const me = await roleHolder.permissions();
      expect(me.permissions, 'the holder holds the view right').toContain(VIEW_RIGHT);
      expect(me.permissions, 'the holder holds no edit right').not.toContain(EDIT_RIGHT);
      await roleHolder.roles.open();
      const view = await openViewOf(roleHolder.roles, target);
      expect(await view.title()).toBe(TITLES.view);
      seen.viewOnly = await view.values();
      expect(seen.viewOnly[VIEW_LABELS.nameEn], 'the Role Name shown').toBe(target.name);
    });

    await steps.step('Sign in as the user holding both view-roles and edit-roles permissions and open the same role\'s View - the View Role panel opens with the same read-only details', async () => {
      const viewEdit = await suiteRoles.create({ label: d.viewEditLabel, rights: d.viewEditRights });
      await roleHolder.reshape({ role: viewEdit });
      await roleHolder.signInAgain();
      const me = await roleHolder.permissions();
      expect(me.permissions, 'the holder now holds the edit right too').toContain(EDIT_RIGHT);
      await roleHolder.roles.open();
      const view = await openViewOf(roleHolder.roles, target);
      expect(await view.title()).toBe(TITLES.view);
      expect(await view.values(), 'the details View Role shows with view + edit vs view only').toEqual(seen.viewOnly);
      const changeable = await changeableControls(roleHolder.page, [...WRITER_B_IDS.textInputs, ...WRITER_B_IDS.choiceInputs]);
      expect(changeable, `controls the holder could change in View Role: ${changeable.join(', ') || 'none'}`).toEqual([]);
    });
  });
});
