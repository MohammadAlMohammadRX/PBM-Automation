import { test, expect } from '../../../utils/user/userRole';
import type { InvitationFormDrawer } from '../../../pages/user/InvitationFormDrawer';
import { CASES, PAYER } from '../../../data/user/createInvitation.data';
import { blockUnlessRoleOffered, blockWhenNoRoleOffered, payerSearch } from '../../../utils/user/writerDHelpers';

/**
 * User story 20418: Create Invitation - the inviter's limits.
 * Only the roles the inviter may assign (20650) and only the inviter's own
 * payers (20651), each on a SUITE account (decisions 7 and 8) - the shared
 * Payer Admin is never used. See the data file for the mapping.
 */
test.describe('US 20418 - Create Invitation', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.permittedRolesOnly.azureId}: should offer only the roles the inviter may assign when the Role Name dropdown is opened`, async ({
    userRole,
    requireShapeApplied,
    suiteRole,
    steps,
  }) => {
    const data = CASES.permittedRolesOnly;
    const permitted = await suiteRole();
    const notPermitted = await suiteRole();
    const s = await userRole.signIn({ with: data.rights, assignableRoleIds: [permitted.id] });
    requireShapeApplied(s);
    let drawer: InvitationFormDrawer | null = null;

    await steps.critical('Navigate to the User Management module (suite account allowed to assign one suite role) - the Invitations list loads', async () => {
      await s.invitations.openTable();
      expect(await s.invitations.isAddOffered(), 'Add Invitation offered to the account holding CreateInvitation').toBe(true);
    });

    await steps.critical('Select Add Invitation - the drawer opens', async () => {
      drawer = await s.invitations.openAddForm();
      expect(await drawer.getTitle()).toBe('Add New Invitation');
    });

    await steps.step(`Open Role Name and compare it with the checklist (permitted "${permitted.name}", not permitted "${notPermitted.name}") - only the permitted roles appear`, async () => {
      const offered = await (drawer as unknown as InvitationFormDrawer).getRoleOptions();
      await blockWhenNoRoleOffered(steps, s.page, offered);
      expect({ permittedOffered: offered.includes(permitted.name), notPermittedOffered: offered.includes(notPermitted.name), outsideChecklist: offered.filter((o) => o !== permitted.name) }, offered.join(' | '))
        .toEqual({ permittedOffered: true, notPermittedOffered: false, outsideChecklist: [] });
    });
  });

  test(`TC-${CASES.ownPayersOnly.azureId}: should list only the inviter's own payers when a payer-scoped role is selected`, async ({
    userRole,
    requireShapeApplied,
    suiteRole,
    steps,
  }) => {
    const data = CASES.ownPayersOnly;
    const scopedRole = await suiteRole({ hasAssignedPayers: true });
    const s = await userRole.signIn({ with: data.rights, payers: [PAYER], assignableRoleIds: [scopedRole.id] });
    requireShapeApplied(s);
    let drawer: InvitationFormDrawer | null = null;

    await steps.critical(`Navigate to the User Management module (suite account scoped to "${PAYER}") - the Invitations list loads`, async () => {
      await s.invitations.openTable();
      expect(await s.invitations.isAddOffered(), 'Add Invitation offered to the account holding CreateInvitation').toBe(true);
    });

    await steps.critical(`Select Add Invitation and the payer-scoped Role Name ("${scopedRole.name}") - the Payer Name dropdown becomes enabled`, async () => {
      drawer = await s.invitations.openAddForm();
      const offered = await drawer.getRoleOptions();
      await blockUnlessRoleOffered(steps, s.page, offered, scopedRole.name);
      await drawer.chooseRole(scopedRole.name);
      expect(await drawer.isPayerDisabled()).toBe(false);
    });

    await steps.step(`Open Payer Name and use its search - only the inviter's own payers ("${PAYER}"), searchable by name`, async () => {
      const all = await payerSearch(s.page);
      const searched = await payerSearch(s.page, PAYER);
      expect({ search: searched.searchOffered, all: all.options, searched: searched.options }).toEqual({ search: true, all: [PAYER], searched: [PAYER] });
    });

    await steps.step(`Look for a payer outside the inviter's payers ("${data.otherPayer}") - it is not listed`, async () => {
      const outside = await payerSearch(s.page, data.otherPayer);
      expect(outside.options).toEqual([]);
    });
  });
});
