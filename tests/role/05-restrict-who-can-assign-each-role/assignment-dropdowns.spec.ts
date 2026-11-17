import { test, expect } from '../../../fixtures';
import { CASES, ROLE_NAMES } from '../../../data/role/restrictWhoCanAssignEachRole.data';
import {
  activeRoleNames,
  addUserPayerChoice,
  addUserRoleChoice,
  addUserRoleOptions,
  compareSets,
  directLink,
  invitationRoleOptions,
  roleIdByName,
  rolesAssignableBy,
  sortedUnique,
  usersMenuState,
} from '../../../utils/role/writerEHelpers';

/**
 * US 21284 - Restrict Who Can Assign Each Role: which roles each account is OFFERED in the Add User and Add
 * Invitation role drop-downs. careconnect = the System Administrator; every other account is the role holder
 * (maalmohammad) given exactly the role the step names, one after another. Expected sets are computed live from
 * GetRoles / GetRole ("Allowed To Assign By"). See data/role/restrictWhoCanAssignEachRole.data.ts.
 */
test.describe('US 21284 - Restrict Who Can Assign Each Role', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.organizationAdministratorRole.azureId}: should offer Organization Administrator only to the System Administrator and an Organization Administrator when the Add User role dropdown is opened`, async ({ steps, page, roleAdmin, roleHolder, suitePayers }) => {
    const role = CASES.organizationAdministratorRole.roleUnderTest;
    const [payer] = await suitePayers.existing(1);

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.step(`Sign in as System Administrator and open the role dropdown on the Add User form - "${role}" is listed and selectable`, async () => {
      const read = await addUserRoleChoice(page, page, role);
      expect(read.options, `the System Administrator's Add User roles: ${read.options.join(' | ')}`).toContain(role);
      expect(read.chosen, `the role card after choosing "${role}"`).toEqual([role]);
    });

    await steps.step(`Sign in as Organization Administrator and open the role dropdown on the Add User form - "${role}" is listed and selectable`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.organizationAdministrator });
      const read = await addUserRoleChoice(roleHolder.page, page, role);
      expect(read.options, `the Organization Administrator's Add User roles: ${read.options.join(' | ')}`).toContain(role);
      expect(read.chosen, `the role card after choosing "${role}"`).toEqual([role]);
    });

    await steps.step(`Sign in as Payer Administrator and open the role dropdown on the Add User form - "${role}" is NOT listed`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.payerAdministrator, payerIds: [payer.id] });
      const invitation = await invitationRoleOptions(roleHolder.page);
      expect(invitation, `the Payer Administrator's Invitation roles: ${invitation.join(' | ')}`).not.toContain(role);
      const options = await addUserRoleOptions(roleHolder.page, page);
      expect(options, `the Payer Administrator's Add User roles: ${options.join(' | ')}`).not.toContain(role);
    });

    await steps.step('Sign in as Payer Officer - the user has no access to the Add User form at all', async () => {
      await roleHolder.become({ role: ROLE_NAMES.payerOfficer, payerIds: [payer.id] });
      const menu = await usersMenuState(roleHolder.page);
      const link = await directLink(roleHolder.page, 'users');
      expect(menu.menuRendered, 'the Payer Officer\'s menu rendered').toBe(true);
      expect(menu.usersGroupIds, 'Users Mgmt entries in the Payer Officer\'s menu').toEqual([]);
      expect({ listShown: link.listShown, addOffered: link.addOffered }, `direct link to Users Administration: ${link.path} "${link.text}"`).toEqual({ listShown: false, addOffered: false });
    });
  });

  test(`TC-${CASES.payerOfficerRole.azureId}: should offer Payer Officer to the System Administrator, Organization Administrator and Payer Administrator only when the Add User role dropdown is opened`, async ({ steps, page, roleAdmin, roleHolder, suitePayers }) => {
    const role = CASES.payerOfficerRole.roleUnderTest;
    const [payer] = await suitePayers.existing(1);
    const ids = { po: '' };

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      ids.po = await roleIdByName(page, role);
      expect(ids.po).not.toBe('');
    });

    await steps.step(`Sign in as System Administrator and check the Add User role dropdown - "${role}" is listed`, async () => {
      const options = await addUserRoleOptions(page, page);
      expect(options, `the System Administrator's Add User roles: ${options.join(' | ')}`).toContain(role);
    });

    await steps.step(`Sign in as Organization Administrator and check the Add User role dropdown - "${role}" is listed`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.organizationAdministrator });
      const options = await addUserRoleOptions(roleHolder.page, page);
      expect(options, `the Organization Administrator's Add User roles: ${options.join(' | ')}`).toContain(role);
    });

    await steps.step(`Sign in as Payer Administrator and check the Add User role dropdown - "${role}" is listed, limited to their own payers ("${payer.name}")`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.payerAdministrator, payerIds: [payer.id] });
      const invitation = await invitationRoleOptions(roleHolder.page);
      expect(invitation, `the Payer Administrator's Invitation roles: ${invitation.join(' | ')}`).toContain(role);
      const read = await addUserPayerChoice(roleHolder.page, page, role, ids.po);
      expect(read.options, `the Payer Administrator's Add User roles: ${read.options.join(' | ')}`).toContain(role);
      expect(read.payers, `payers offered for "${role}" by Assign Payers`).toEqual([payer.name]);
    });

    await steps.step('Sign in as Payer Officer - the user has no access to the Add User form', async () => {
      await roleHolder.become({ role: ROLE_NAMES.payerOfficer, payerIds: [payer.id] });
      const menu = await usersMenuState(roleHolder.page);
      const link = await directLink(roleHolder.page, 'users');
      expect(menu.menuRendered, 'the Payer Officer\'s menu rendered').toBe(true);
      expect(menu.usersGroupIds, 'Users Mgmt entries in the Payer Officer\'s menu').toEqual([]);
      expect({ listShown: link.listShown, addOffered: link.addOffered }, `direct link to Users Administration: ${link.path} "${link.text}"`).toEqual({ listShown: false, addOffered: false });
    });
  });

  test(`TC-${CASES.payerAdministratorRole.azureId}: should offer Payer Administrator only to the System Administrator and an Organization Administrator when the Add User role dropdown is opened`, async ({ steps, page, roleAdmin, roleHolder, suitePayers }) => {
    const role = CASES.payerAdministratorRole.roleUnderTest;
    const [payer] = await suitePayers.existing(1);

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.step(`Sign in as System Administrator and open the Add User role dropdown - "${role}" is listed`, async () => {
      const options = await addUserRoleOptions(page, page);
      expect(options, `the System Administrator's Add User roles: ${options.join(' | ')}`).toContain(role);
    });

    await steps.step(`Sign in as Organization Administrator and open the Add User role dropdown - "${role}" is listed`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.organizationAdministrator });
      const options = await addUserRoleOptions(roleHolder.page, page);
      expect(options, `the Organization Administrator's Add User roles: ${options.join(' | ')}`).toContain(role);
    });

    await steps.step(`Sign in as Payer Administrator and open the Add User role dropdown - "${role}" is NOT listed`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.payerAdministrator, payerIds: [payer.id] });
      const invitation = await invitationRoleOptions(roleHolder.page);
      expect(invitation, `the Payer Administrator's Invitation roles: ${invitation.join(' | ')}`).not.toContain(role);
      const options = await addUserRoleOptions(roleHolder.page, page);
      expect(options, `the Payer Administrator's Add User roles: ${options.join(' | ')}`).not.toContain(role);
    });
  });

  test(`TC-${CASES.systemAdministratorSeesAll.azureId}: should list every active role, custom roles included, when the System Administrator opens the Invitation role dropdown`, async ({ steps, page, roleAdmin, suiteRoles }) => {
    const [one, two] = CASES.systemAdministratorSeesAll.labels;
    const custom = [await suiteRoles.create({ label: one }), await suiteRoles.create({ label: two })];

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.step('Sign in as System Administrator and open the role dropdown on the Invitation form - every active role in the system, including custom roles, is listed', async () => {
      const options = await invitationRoleOptions(page);
      const expected = await activeRoleNames(page);
      const cmp = compareSets(options, expected);
      expect(options, `the custom roles in the Invitation roles: ${options.join(' | ')}`).toEqual(expect.arrayContaining(custom.map((r) => r.name)));
      expect(cmp.missing, `active roles (GetRoles) missing from the Invitation roles; offered: ${options.join(' | ')}`).toEqual([]);
    });
  });

  test(`TC-${CASES.organizationAdministratorExactSet.azureId}: should offer an Organization Administrator exactly the roles naming Organization Administrator when the User form role dropdown is opened`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles }) => {
    const data = CASES.organizationAdministratorExactSet;
    const naming = await suiteRoles.create({ label: data.namingLabel, allowedToAssignBy: data.namingAllowedBy });
    const notNaming = await suiteRoles.create({ label: data.notNamingLabel, allowedToAssignBy: data.notNamingAllowedBy });
    let options: string[] = [];

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Sign in as Organization Administrator and open the role dropdown on the User form - the list contains Organization Administrator, Payer Administrator, Payer Officer and the custom role "${naming.name}"`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.organizationAdministrator });
      options = await addUserRoleOptions(roleHolder.page, page);
      expect(options, `the Organization Administrator's Add User roles: ${options.join(' | ')}`)
        .toEqual(expect.arrayContaining([ROLE_NAMES.organizationAdministrator, ROLE_NAMES.payerAdministrator, ROLE_NAMES.payerOfficer, naming.name]));
    });

    await steps.step(`Check for any role not naming Organization Administrator in its Allowed To Assign By (e.g. "${notNaming.name}") - such roles do not appear in the dropdown`, async () => {
      const expected = await rolesAssignableBy(page, [await roleIdByName(page, ROLE_NAMES.organizationAdministrator)]);
      const cmp = compareSets(options, expected);
      expect(options, `the Organization Administrator's Add User roles: ${options.join(' | ')}`).not.toContain(notNaming.name);
      expect({ notNamingOrganizationAdministrator: cmp.extra, missing: cmp.missing }, `expected (active roles naming Organization Administrator): ${expected.join(' | ')}`)
        .toEqual({ notNamingOrganizationAdministrator: [], missing: [] });
    });
  });

  test(`TC-${CASES.payerAdministratorOwnPayers.azureId}: should limit a Payer Administrator's assignable roles and user payers to its own payer when it adds a user`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles, suitePayers }) => {
    const data = CASES.payerAdministratorOwnPayers;
    const [payerX, payerY] = await suitePayers.existing(2);
    const custom = await suiteRoles.create({ label: data.label, allowedToAssignBy: data.allowedToAssignBy, hasAssignedPayers: true });
    const read = { options: [] as string[], payers: [] as string[], searched: [] as string[] };

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Sign in as the Payer Administrator for Payer X ("${payerX.name}") and open the role dropdown on the User form while scoped to Payer X - Payer Officer and the custom role appear`, async () => {
      await roleHolder.become({ role: ROLE_NAMES.payerAdministrator, payerIds: [payerX.id] }, { payerToChoose: payerX.name });
      const invitation = await invitationRoleOptions(roleHolder.page);
      expect(invitation, `the Payer Administrator's Invitation roles: ${invitation.join(' | ')}`).toEqual(expect.arrayContaining([ROLE_NAMES.payerOfficer, custom.name]));
      const po = await roleIdByName(page, ROLE_NAMES.payerOfficer);
      Object.assign(read, await addUserPayerChoice(roleHolder.page, page, ROLE_NAMES.payerOfficer, po, payerY.name));
      expect(read.options, `the Payer Administrator's Add User roles: ${read.options.join(' | ')}`).toEqual(expect.arrayContaining([ROLE_NAMES.payerOfficer, custom.name]));
    });

    await steps.step(`Attempt to create a user under a different payer (Payer Y "${payerY.name}") not managed by this administrator - Payer Y is not available or selectable`, async () => {
      expect(read.searched, `the Assign Payers picker searched for "${payerY.name}"`).toEqual([]);
      expect(read.payers, 'every payer the Assign Payers picker offers the Payer Administrator').toEqual([payerX.name]);
    });
  });

  test(`TC-${CASES.payerOfficerNoAccess.azureId}: should hide user management and invitations from a Payer Officer and block their direct links`, async ({ steps, page, roleAdmin, roleHolder, suitePayers }) => {
    const [payer] = await suitePayers.existing(1);

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical('Sign in as Payer Officer and look for Users and Invitations menus - both menus are hidden or inaccessible (baseline: the System Administrator has them)', async () => {
      const admin = await usersMenuState(page);
      expect(admin.usersGroupIds.length, 'Users Mgmt entries in the System Administrator\'s menu (baseline)').toBeGreaterThan(0);
      await roleHolder.become({ role: ROLE_NAMES.payerOfficer, payerIds: [payer.id] });
      const menu = await usersMenuState(roleHolder.page);
      expect(menu.menuRendered, 'the Payer Officer\'s menu rendered').toBe(true);
      expect(menu.usersGroupIds, 'Users Mgmt (Users Administration / Invitations) entries in the Payer Officer\'s menu').toEqual([]);
    });

    await steps.step('Attempt to navigate directly to the user or invitation form via a known link - access is blocked', async () => {
      const users = await directLink(roleHolder.page, 'users');
      const invitations = await directLink(roleHolder.page, 'invitations');
      expect({ listShown: users.listShown, addOffered: users.addOffered }, `Users Administration link: ${users.path} "${users.text}"`).toEqual({ listShown: false, addOffered: false });
      expect({ listShown: invitations.listShown, addOffered: invitations.addOffered }, `Invitations link: ${invitations.path} "${invitations.text}"`).toEqual({ listShown: false, addOffered: false });
    });
  });

  test(`TC-${CASES.invitationMatchesUserForm.azureId}: should offer the same assignable roles on the Invitation form as on the User form`, async ({ steps, page, roleAdmin, roleHolder }) => {
    let userOptions: string[] = [];

    await steps.critical('Precondition: the user is signed in as Organization Administrator', async () => {
      const signIn = await roleHolder.become({ role: ROLE_NAMES.organizationAdministrator });
      expect(signIn.heldAtVerify).toBe(false);
    });

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical('Open the role dropdown on the User form and note the listed roles - a specific set of roles is shown', async () => {
      userOptions = await addUserRoleOptions(roleHolder.page, page);
      expect(userOptions.length, 'roles offered on the User form').toBeGreaterThan(0);
    });

    await steps.step('Open the role dropdown on the Invitation form and compare - the identical set of assignable roles is shown', async () => {
      const invitationOptions = await invitationRoleOptions(roleHolder.page);
      expect(sortedUnique(invitationOptions), `User form: ${userOptions.join(' | ')}`).toEqual(sortedUnique(userOptions));
    });
  });

  test(`TC-${CASES.multiRoleUnion.azureId}: should offer a user holding several roles the union of the roles each may assign, without duplicates or omissions`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles }) => {
    const data = CASES.multiRoleUnion;
    const held = await suiteRoles.create({ label: data.heldLabel });
    const target = await suiteRoles.create({ label: data.targetLabel, allowedToAssignBy: [held.id] });

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.step(`Sign in as the multi-role test user (Organization Administrator + "${held.name}") and explore the role dropdown on the User and Invitation forms against each held role's own list - the union, no duplicates or omissions`, async () => {
      await roleHolder.become([{ role: ROLE_NAMES.organizationAdministrator }, { role: held }]);
      const oaList = await rolesAssignableBy(page, [await roleIdByName(page, ROLE_NAMES.organizationAdministrator)]);
      const heldList = await rolesAssignableBy(page, [held.id]);
      const union = sortedUnique([...oaList, ...heldList]);
      const userForm = await addUserRoleOptions(roleHolder.page, page);
      const invitationForm = await invitationRoleOptions(roleHolder.page);
      const why = `Organization Administrator may assign: ${oaList.join(' | ')}; "${held.name}" may assign: ${heldList.join(' | ')}`;
      expect(heldList, `"${target.name}" names only "${held.name}"`).toContain(target.name);
      expect({ userForm: compareSets(userForm, union), invitationForm: compareSets(invitationForm, union) }, `${why}; User form: ${userForm.join(' | ')}; Invitation form: ${invitationForm.join(' | ')}`)
        .toEqual({ userForm: { missing: [], extra: [], duplicates: [] }, invitationForm: { missing: [], extra: [], duplicates: [] } });
    });
  });
});
