import { test, expect } from '../../../utils/user/userRole';
import type { UserFormDrawer } from '../../../pages/user/UserFormDrawer';
import {
  CASES,
  DELETED_PAYER_BLOCKED,
  PARTIAL_PAYER_TERM,
  SCOPED_ADMIN_RIGHTS,
  SCOPE_PAYER,
} from '../../../data/user/validatePayerAssignmentsWhenConfiguringRoleScope.data';
import { listAssignableRoles, payerIdByName, readUser } from '../../../utils/UserProvisioning';
import { earlierFailures, otherPayer, payerNamesOf, pickerAll } from '../../../utils/user/writerAHelpers';

/**
 * User story 14293: Validate Payer Assignments When Configuring Role Scope -
 * which payers the Payer field offers: a deleted payer (20472, BLOCKED part)
 * and payers outside a payer-scoped administrator's scope (20473, 20480). The
 * payer-scoped administrator is a suite session whose suite role is scoped to
 * "Al sharq" and may edit users; the user it configures is a suite user holding
 * a payer-scoped suite role on "Al sharq" (so the scoped administrator sees it).
 * See the data file.
 */
test.describe('US 14293 - Validate Payer Assignments When Configuring Role Scope (payer eligibility)', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.deletedPayerHidden.azureId}: should not offer a payer that no longer exists in the Payer selection list`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userListPage: list,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const target = await userIn('Active');
    let drawer!: UserFormDrawer;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical(`Open Role Scope configuration and select the payer-scoped role ("${scoped.name}") - the Payer field is shown`, async () => {
      await list.revealRow(target.displayNameEn);
      drawer = await list.openAssign(target.id);
      await drawer.addRole(scoped.name);
      expect(await drawer.isAssignPayersOffered(scoped.id)).toBe(true);
    });

    await steps.step('Open the Payer selection list - the list loads displaying only existing, valid payers', async () => {
      await drawer.openAssignPayers(scoped.id);
      const { available, selected } = await pickerAll(drawer);
      const existing = await payerNamesOf(page);
      expect({ loaded: available.length > 0, notExisting: [...available, ...selected].filter((n) => !existing.includes(n)) })
        .toEqual({ loaded: true, notExisting: [] });
    });

    await steps.step('Search for the deleted payer "Payer C" - no result is found', async () => {
      expect(earlierFailures(steps), `NOT EXERCISED - ${DELETED_PAYER_BLOCKED}`).toEqual([]);
      steps.blocked(DELETED_PAYER_BLOCKED);
    });
  });

  test(`TC-${CASES.outOfScopeHidden.azureId}: should not offer a payer outside the payer-scoped administrator's scope`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userRole,
    requireShapeApplied,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const payerA = await payerIdByName(page, SCOPE_PAYER);
    const payerB = await otherPayer(page, SCOPE_PAYER);
    const target = await userIn('Active', { roles: [{ roleId: scoped.id, payerIds: [payerA] }] });
    const s = await userRole.signIn({ with: SCOPED_ADMIN_RIGHTS, payers: [SCOPE_PAYER], assignableRoleIds: [scoped.id] });
    requireShapeApplied(s);
    let drawer!: UserFormDrawer;

    await steps.critical(`Navigate to the User Management module as the administrator scoped to "${SCOPE_PAYER}" - the module landing page is displayed`, async () => {
      await s.users.openTable();
      await s.users.expectToolbar();
    });

    await steps.critical(`Open Role Scope configuration and select a payer-scoped role ("${scoped.name}") - the Payer field is shown`, async () => {
      await s.users.revealRow(target.displayNameEn);
      drawer = await s.users.openAssign(target.id);
      expect(await drawer.isAssignPayersOffered(scoped.id), `Assign Payers on the "${scoped.name}" card`).toBe(true);
    });

    await steps.step(`Open the Payer selection list - only payers within the administrator's scope ("${SCOPE_PAYER}") are listed`, async () => {
      await drawer.openAssignPayers(scoped.id);
      const { available, selected } = await pickerAll(drawer);
      const scope = await payerNamesOf(s.page);
      const listed = [...available, ...selected];
      expect({ outsideScope: listed.filter((n) => n !== SCOPE_PAYER), payerB: listed.includes(payerB.name) }, `listed: ${listed.slice(0, 20).join(' | ')}; session scope: ${scope.slice(0, 20).join(' | ')}`)
        .toEqual({ outsideScope: [], payerB: false });
    });

    await steps.step(`Search for the out-of-scope payer ("${payerB.name}") by name - no matching result is returned`, async () => {
      await drawer.searchPicker('source', payerB.name);
      const { available } = await pickerAll(drawer);
      expect(available).toEqual([]);
    });
  });

  test(`TC-${CASES.rapidSwitching.azureId}: should keep the Payer field and payer list accurate when the role selection changes rapidly and payers are searched`, async ({
    page,
    steps,
    suiteRole,
    userIn,
    userRole,
    requireShapeApplied,
  }) => {
    const heldScoped = await suiteRole({ hasAssignedPayers: true });
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const plain = await suiteRole({});
    const payerA = await payerIdByName(page, SCOPE_PAYER);
    const payerB = await otherPayer(page, SCOPE_PAYER);
    const target = await userIn('Active', { roles: [{ roleId: heldScoped.id, payerIds: [payerA] }] });
    // The target's own role (heldScoped) must be assignable too: UpdateUser sends ALL the user's roles and
    // answers 403 "You are not allowed to assign one or more of the selected roles." otherwise (fix1 run).
    const s = await userRole.signIn({ with: SCOPED_ADMIN_RIGHTS, payers: [SCOPE_PAYER], assignableRoleIds: [heldScoped.id, scoped.id, plain.id] });
    requireShapeApplied(s);
    let drawer!: UserFormDrawer;

    await steps.critical(`Navigate to the User Management module as the administrator scoped to "${SCOPE_PAYER}" - the module landing page is displayed`, async () => {
      await s.users.openTable();
      await s.users.expectToolbar();
    });

    await steps.critical('Open Role Scope configuration and rapidly switch between payer-scoped and non-payer-scoped roles - the Payer field toggles each time with no residual data', async () => {
      await s.users.revealRow(target.displayNameEn);
      drawer = await s.users.openAssign(target.id);
      await drawer.addRoleCard();
      const options = await drawer.getRoleOptions();
      if (!options.includes(scoped.name) || !options.includes(plain.name)) {
        const assignable = (await listAssignableRoles(s.page).catch(() => [])).map((r) => r.name);
        steps.blocked(`permission-not-granted: the payer-scoped administrator is offered no role to switch between (Role options: [${options.join(', ')}]; `
          + `GetAssignableRoles of the scoped session: [${assignable.join(', ')}]; the suite role may assign "${scoped.name}" and "${plain.name}")`);
      }
      const seen: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        await drawer.chooseRole(plain.name);
        seen.push(`plain:${await drawer.isAssignPayersOffered(plain.id)}`);
        await drawer.chooseRole(scoped.name);
        const shown = await drawer.isAssignPayersOffered(scoped.id);
        let residual: string[] = [];
        if (shown) {
          await drawer.openAssignPayers(scoped.id);
          residual = (await pickerAll(drawer)).selected;
          await drawer.closePicker(false);
        }
        seen.push(`scoped:${shown}:${residual.join('+') || 'empty'}`);
      }
      expect(seen).toEqual(['plain:false', 'scoped:true:empty', 'plain:false', 'scoped:true:empty', 'plain:false', 'scoped:true:empty']);
    });

    await steps.step(`On the payer-scoped role, type partial ("${PARTIAL_PAYER_TERM.trim()}") and full payer names, including the out-of-scope "${payerB.name}" - only valid in-scope, existing payers matching the search are returned`, async () => {
      await drawer.openAssignPayers(scoped.id);
      const results: Record<string, string[]> = {};
      for (const term of [PARTIAL_PAYER_TERM, SCOPE_PAYER, payerB.name]) {
        await drawer.searchPicker('source', term);
        results[term] = (await pickerAll(drawer)).available;
      }
      await drawer.searchPicker('source', '');
      expect({
        partial: results[PARTIAL_PAYER_TERM].filter((n) => n !== SCOPE_PAYER),
        partialHasPayerA: results[PARTIAL_PAYER_TERM].includes(SCOPE_PAYER),
        full: results[SCOPE_PAYER],
        outOfScope: results[payerB.name],
      }).toEqual({ partial: [], partialHasPayerA: true, full: [SCOPE_PAYER], outOfScope: [] });
    });

    await steps.step(`Save the role after assigning "${SCOPE_PAYER}" - the configuration saves with no leftover invalid selections`, async () => {
      await drawer.movePayers([SCOPE_PAYER]);
      await drawer.closePicker(true);
      const saved = await drawer.attemptSave();
      expect(saved.status, `${saved.text.slice(0, 200)} ${saved.messages.join(' | ')} ${saved.errors.join(' | ')}`).toBe(200);
      const roles = (await readUser(page, target.id)).assignedRoles.map((r) => ({ id: r.id, payers: (r.assignedPayers ?? []).map((p) => p.id).sort() }));
      expect(roles.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
        { id: heldScoped.id, payers: [payerA] },
        { id: scoped.id, payers: [payerA] },
      ].sort((a, b) => a.id.localeCompare(b.id)));
    });
  });
});
