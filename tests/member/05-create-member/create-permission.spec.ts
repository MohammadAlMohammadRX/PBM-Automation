import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import { CASES } from '../../../data/member/createMember.data';
import { memberBody, requestCreateMember } from '../../../utils/MemberProvisioning';

/**
 * User story 14380: Create Member - who may create (19854). The authorised
 * Member Administrator is the administrator (its Add New Member is the
 * baseline); the non-authorised user is the Payer Admin shaped WITHOUT
 * CreateMember (utils/member/memberRole.ts). Both the screen's option and a
 * direct CreateMember as that account must be refused.
 */
test.describe('US 14380 - Create Member - create permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.createDenied.azureId}: should keep the Create Member option and a direct create away from a user without the Member Administrator role`, async ({
    page,
    memberManagementPage: list,
    memberRole,
    requireBaseline,
    requireShapeApplied,
    requireMemberListAccess,
    discardMemberId,
    steps,
  }) => {
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module is displayed according to the user\'s role', async () => {
      await list.openTable();
      requireBaseline(await list.isAddOffered(), 'Add New Member for a user holding CreateMember (the administrator)');
      session = await memberRole.signIn(CASES.createDenied.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      await session.members.openTable();
      expect(await session.members.countRows(), 'the restricted account\'s member list').toBeGreaterThan(0);
    });

    let offered = true;
    let direct = { status: 0, text: '', id: null as string | null };

    await steps.step('Attempt to access "Create Member" as a non-authorised user - access is evaluated', async () => {
      offered = await session.members.isAddOffered();
      const body = await memberBody(page);
      const answer = await requestCreateMember(session.page, body);
      direct = { status: answer.status, text: answer.text, id: answer.id };
      if (answer.id) discardMemberId(answer.id);
      expect(direct.status, 'CreateMember as the restricted account answered').toBeGreaterThan(0);
    });

    await steps.step('Observe the system response - the user is denied access or the Create Member option is not shown', async () => {
      expect({ createOffered: offered, directCreateRefused: direct.status >= 400 }, `role without ${session.removed.join(', ')}; CreateMember as that account answered ${direct.status} ${direct.text.slice(0, 200)}`)
        .toEqual({ createOffered: false, directCreateRefused: true });
    });
  });
});
