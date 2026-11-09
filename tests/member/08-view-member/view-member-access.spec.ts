import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { ACCESS_DENIED, CASES } from '../../../data/member/viewMember.data';
import { asSession, refused, requireMemberShown } from '../../../utils/member/writerCHelpers';

/**
 * User story 14383: View Member - a user without the permission to view member
 * details. The Payer Admin role is shaped without GetMember ("View member
 * details") through `memberRole`; the administrator is first shown View on the
 * same member, so only the permission explains its absence. When the role edit
 * does not reach the signed-in account the case is BLOCKED with the evidence.
 */
test.describe('US 14383 - View Member - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noViewPermission.azureId}: should refuse a member's details to a user without the view permission`, async ({
    memberIn,
    memberManagementPage,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const member = await memberIn('Active');
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the list view loads or access is restricted depending on role', async () => {
      await memberManagementPage.openTable();
      requireBaseline((await memberManagementPage.getActionState(member.displayNameEn, 'view')).availability === 'available', 'View on a member row');
      session = await memberRole.signIn(CASES.noViewPermission.shape);
      await requireMemberListAccess(session);
      requireShapeApplied(session);
      await requireMemberShown(session, member, test.info());
      await session.members.openTable();
      expect(await session.members.isListed(member.displayNameEn), 'the member in the restricted user\'s list').toBe(true);
    });

    await steps.step('Log in as a user lacking permission to view member details and attempt to open a member record - the view action is unavailable or access is denied', async () => {
      const offered = (await session.members.getActionState(member.displayNameEn, 'view')).availability;
      let denied = offered !== 'available';
      let said = `View ${offered} (not attempted)`;
      if (!denied) {
        await session.members.clickAction(member.displayNameEn, 'view');
        const loaded = await session.detail.isLoaded();
        const text = await session.detail.getScreenText();
        denied = !loaded || ACCESS_DENIED.test(text);
        said = `View offered; the details ${loaded ? 'opened' : 'did not open'}: ${text.slice(0, 200)}`;
      }
      expect(denied, `${said} - role without ${session.removed.join(', ')}`).toBe(true);
    });

    await steps.step('Attempt to directly navigate to a member\'s detail view - an authorization error is displayed and no member data is revealed', async () => {
      await session.detail.openExpectingFailure(member.id);
      const text = await session.detail.getScreenText();
      const api = await asSession(session.page, 'POST', ApiEndpoints.memberGet, { id: member.id });
      expect({
        authorizationError: ACCESS_DENIED.test(text) ? true : text.slice(0, 200),
        revealsDocumentId: text.includes(member.documentId),
        getMemberRefused: refused(api) ? true : `${api.status} ${api.text.slice(0, 160)}`,
      }, 'the direct navigation as the restricted user').toEqual({ authorizationError: true, revealsDocumentId: false, getMemberRefused: true });
    });
  });
});
