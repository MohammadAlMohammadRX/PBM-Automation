import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import { CASES } from '../../../data/member/memberList.data';
import type { MemberActionState } from '../../../pages/member/MemberManagementPage';
import type { MemberRowAction } from '../../../constants/member/memberIds';

/**
 * User story 14377: Member List - the read-only role. The "read-only" user is
 * the Payer Admin shaped by the shared `memberRole` fixture
 * (utils/member/memberRole.ts) without UpdateMember, GetMemberForEdit,
 * SetMemberActive and DeleteMember; the administrator's own row is the
 * baseline (Edit, Inactivate and Delete offered).
 */
test.describe('US 14377 - Member List - read-only role', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.readOnly.azureId}: should offer a read-only user only View on a member row - no Edit, Inactivate, Activate or Delete`, async ({
    memberManagementPage: list,
    memberIn,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const member = await memberIn('Active');
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      const baseline = await list.readActionStates(member.displayNameEn);
      requireBaseline(['edit', 'toggleActive', 'delete'].every((a) => baseline[a as MemberRowAction].availability === 'available'), 'Edit, Inactivate and Delete on a member row for a user holding the member rights');
      expect(baseline.view.availability).toBe('available');
    });

    await steps.critical('Log in as a user with a read-only role - the member list loads', async () => {
      session = await memberRole.signIn(CASES.readOnly.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      await session.members.openTable();
      if (!(await session.members.isListed(member.displayNameEn))) {
        steps.blocked(`the shaped Payer Admin is not shown the suite member "${member.displayNameEn}" in its list (payer scope)`);
      }
      expect(await session.members.countRows(), 'the read-only user\'s list').toBeGreaterThan(0);
    });

    await steps.step('Inspect the Actions column for the member - only View is visible or enabled; Edit, Inactivate, Activate and Delete are hidden or disabled', async () => {
      const states: Record<MemberRowAction, MemberActionState> = await session.members.readActionStates(member.displayNameEn);
      expect({
        view: states.view.availability,
        edit: states.edit.availability !== 'available',
        inactivateActivate: states.toggleActive.availability !== 'available',
        delete: states.delete.availability !== 'available',
      }, `offered to the role without ${session.removed.join(', ')}: ${JSON.stringify(states)}`)
        .toEqual({ view: 'available', edit: true, inactivateActivate: true, delete: true });
    });
  });
});
