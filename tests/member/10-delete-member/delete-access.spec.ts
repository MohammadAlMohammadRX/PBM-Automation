import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES } from '../../../data/member/deleteMember.data';
import { readMemberOrNull } from '../../../utils/MemberProvisioning';
import { asSession, refused, requireMemberShown } from '../../../utils/member/writerCHelpers';

/**
 * User story 14385: Delete Member - a user without the delete permission. The
 * Payer Admin role is shaped without DeleteMember through `memberRole`; the
 * administrator is first shown Delete on the same member, so only the
 * permission explains its absence. When the role edit does not reach the
 * signed-in account (or the account cannot see the member) the case is BLOCKED
 * with the evidence.
 */
test.describe('US 14385 - Delete Member - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noDeletePermission.azureId}: should keep a user without the delete permission from deleting a member`, async ({
    page,
    memberIn,
    memberDetailPage,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const member = await memberIn('Active');
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the member list is displayed, respecting the user\'s permission level', async () => {
      await memberDetailPage.open(member.id);
      requireBaseline((await memberDetailPage.getActionAvailability('delete')) === 'available', 'Delete on the member\'s view page');
      session = await memberRole.signIn(CASES.noDeletePermission.shape);
      await requireMemberListAccess(session);
      requireShapeApplied(session);
      await requireMemberShown(session, member, test.info());
      await session.members.openTable();
      expect(await session.members.isListed(member.displayNameEn), 'the member in the restricted user\'s list').toBe(true);
    });

    await steps.step('Open the eligible member\'s detail page - the details are shown but Delete is hidden or disabled for this role', async () => {
      await session.detail.open(member.id);
      expect(await session.detail.getName()).toBe(member.displayNameEn);
      expect(await session.detail.getActionAvailability('delete'), `Delete for a role without ${session.removed.join(', ')}`).not.toBe('available');
    });

    await steps.step('Attempt to trigger the delete operation directly - the system denies it with an authorization error', async () => {
      const direct = await asSession(session.page, 'DELETE', `${ApiEndpoints.memberDelete}/${member.id}`);
      expect(refused(direct), `the direct DeleteMember answered ${direct.status} ${direct.text.slice(0, 200)}`).toBe(true);
      expect(await readMemberOrNull(page, member.id), 'the member must still exist').not.toBeNull();
    });
  });
});
