import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import { CASES } from '../../../data/member/exportMember.data';
import { exportMembers } from '../../../utils/MemberProvisioning';

/**
 * User story 14381: Export Member - who may export. The "non-administrator
 * user" is the Payer Admin shaped by the shared `memberRole` fixture
 * (utils/member/memberRole.ts) without ExportMembers; the administrator's
 * Export control is the baseline.
 */
test.describe('US 14381 - Export Member - export permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.notAuthorised.azureId}: should hide the Export control from a user without the export permission and refuse a direct export`, async ({
    memberManagementPage: list,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module as the user without the export role - the module is displayed according to the role', async () => {
      await list.openTable();
      requireBaseline(await list.isExportOffered(), 'the Export control on the member list for a user holding ExportMembers');
      session = await memberRole.signIn(CASES.notAuthorised.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      await session.members.openTable();
      expect(await session.members.countRows(), 'the shaped account\'s list').toBeGreaterThanOrEqual(0);
    });

    await steps.step('Attempt to use the "Export" button as the non-authorised user - access is evaluated', async () => {
      expect(await session.members.isExportOffered(), `Export offered to the role without ${session.removed.join(', ')}`).toBe(false);
    });

    await steps.step('Observe the system response - the Export control is hidden / disabled or the action is denied', async () => {
      const res = await exportMembers(session.page, {}, { scope: 'All', format: 'Csv' });
      expect({ refused: res.status === 401 || res.status === 403 }, `ExportMembers answered ${res.status} ${res.text.slice(0, 200)}`).toEqual({ refused: true });
    });
  });
});
