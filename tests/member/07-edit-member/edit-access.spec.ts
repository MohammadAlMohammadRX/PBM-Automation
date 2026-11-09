import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import { CASES } from '../../../data/member/editMember.data';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { readMember, readMemberForEdit } from '../../../utils/MemberProvisioning';

/**
 * User story 14382: Edit Member - a user without the Member Administrator
 * rights (19872). The Payer Admin role is shaped WITHOUT UpdateMember and
 * GetMemberForEdit (utils/member/memberRole.ts); the administrator is first
 * shown Edit on the same member, so only the permission explains its absence.
 * The edit form has no route of its own (a drawer) - the "direct" attempt is
 * the form's own calls made as that account.
 */
test.describe('US 14382 - Edit Member - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.editDenied.azureId}: should keep a user without Member Administrator rights from editing a member record`, async ({
    page,
    memberIn,
    memberManagementPage: list,
    memberRole,
    requireBaseline,
    requireShapeApplied,
    requireMemberListAccess,
    steps,
  }) => {
    const c = CASES.editDenied;
    const member = await memberIn('Active');
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the list view loads or access is restricted depending on the logged-in role', async () => {
      await list.openTable();
      requireBaseline((await list.getActionState(member.displayNameEn, 'edit')).availability === 'available', 'Edit on a suite member\'s row for the administrator');
      session = await memberRole.signIn(c.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      await session.members.openTable();
      expect(await session.members.isListed(member.displayNameEn), 'the member in the restricted account\'s list').toBe(true);
    });

    await steps.step('Log in as a user without the Member Administrator role and look for the Edit action on a member record - the Edit button/action is not available or is disabled', async () => {
      const row = (await session.members.getActionState(member.displayNameEn, 'edit')).availability;
      await session.detail.open(member.id);
      const header = await session.detail.getActionAvailability('edit');
      expect({ editOnRow: row === 'available', editOnRecord: header === 'available' }, `role without ${session.removed.join(', ')}: row ${row}, record ${header}`)
        .toEqual({ editOnRow: false, editOnRecord: false });
    });

    await steps.step('Attempt to directly open the edit form (GetMemberForEdit, then UpdateMember, as that account) - the system denies access and displays an authorization error', async () => {
      const open = await NetworkUtils.postAsSession(session.page, ApiEndpoints.memberGetForEdit, { id: member.id });
      const { memberCode: _code, policyHolderIds: _holders, ...fields } = await readMemberForEdit(page, member.id);
      const update = await NetworkUtils.requestAsSession(session.page, 'PUT', ApiEndpoints.memberUpdate, { ...fields, occupation: c.occupation });
      expect({ openDenied: [401, 403].includes(open.status), updateDenied: [401, 403].includes(update.status) },
        `GetMemberForEdit answered ${open.status} ${open.text.slice(0, 120)}; UpdateMember answered ${update.status} ${update.text.slice(0, 160)}`)
        .toEqual({ openDenied: true, updateDenied: true });
      expect((await readMember(page, member.id)).occupation, 'the stored occupation').not.toBe(c.occupation);
    });
  });
});
