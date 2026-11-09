import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES } from '../../../data/member/activateDeactivateMember.data';
import { readMember } from '../../../utils/MemberProvisioning';
import { anyDeactivationReasonId, asSession, deactivateBody, refused, requireMemberShown } from '../../../utils/member/writerCHelpers';

/**
 * User story 14386: Activate / Deactivate Member - a user without the
 * permission. Activate and Deactivate share ONE right (SetMemberActive); the
 * Payer Admin role is shaped without it through `memberRole`, after the
 * administrator is shown the switch on the same member. When the role edit
 * does not reach the signed-in account (or the account cannot see the member)
 * the case is BLOCKED with the evidence.
 */
test.describe('US 14386 - Activate/Deactivate Member - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noSetActivePermission.azureId}: should keep a user without the permission from activating or deactivating a member`, async ({
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
    const reasonId = await anyDeactivationReasonId(page);
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the member list is displayed, respecting the user\'s permission level', async () => {
      await memberDetailPage.open(member.id);
      requireBaseline((await memberDetailPage.getActionAvailability('toggleActive')) === 'available', 'the Active switch on the member\'s view page');
      session = await memberRole.signIn(CASES.noSetActivePermission.shape);
      await requireMemberListAccess(session);
      requireShapeApplied(session);
      await requireMemberShown(session, member, test.info());
      await session.members.openTable();
      expect(await session.members.isListed(member.displayNameEn), 'the member in the restricted user\'s list').toBe(true);
      expect((await session.members.getActionState(member.displayNameEn, 'toggleActive')).availability, 'the row\'s Inactivate / Activate').not.toBe('available');
    });

    await steps.step('Open the member\'s detail page - the details are shown but Activate / Deactivate are hidden or disabled for this role', async () => {
      await session.detail.open(member.id);
      expect(await session.detail.getName()).toBe(member.displayNameEn);
      expect(await session.detail.getActionAvailability('toggleActive'), `the Active switch for a role without ${session.removed.join(', ')}`).not.toBe('available');
    });

    await steps.step('Attempt to trigger the activate or deactivate operation directly - the system denies it with an authorization error', async () => {
      const direct = await asSession(session.page, 'POST', ApiEndpoints.memberSetActive, deactivateBody(member.id, reasonId));
      expect(refused(direct), `the direct SetMemberActive answered ${direct.status} ${direct.text.slice(0, 200)}`).toBe(true);
      expect((await readMember(page, member.id)).isActive, 'the member must still be Active').toBe(true);
    });
  });
});
