import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import { CASES } from '../../../data/member/memberBulkImport.data';
import {
  buildMemberImportCsv,
  findMemberByDocumentId,
  listMemberRegister,
  memberStamp,
  readImportHistory,
  startMemberImport,
  suiteImportRow,
} from '../../../utils/MemberProvisioning';

/**
 * User story 17727: Member Bulk import - who may import. The "read-only viewer"
 * is the Payer Admin shaped by the shared `memberRole` fixture
 * (utils/member/memberRole.ts) without "Import members" (Members.BulkImport)
 * and "View member upload history and results"; the administrator's Import
 * button is the baseline. There is no import route - "direct access" is the
 * ImportMembers request itself.
 */
test.describe('US 17727 - Member Bulk import - import permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.notAuthorised.azureId}: should keep a user without the import permission from seeing, reaching or running the bulk import`, async ({
    memberManagementPage: list,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    discardMemberNamed,
    page,
    steps,
  }) => {
    const row = await suiteImportRow(page);
    const fileName = `qa-member-denied-${memberStamp()}.csv`;
    discardMemberNamed(`QA Automation ${row['Last Name (English) *']}`);
    let session!: MemberSession;
    let before = -1;

    await steps.critical('Navigate to the Member Management module as the restricted user - the module loads with the permissions of that role', async () => {
      await list.openTable();
      requireBaseline(await list.isImportOffered(), 'the Import button on the member list for a user holding Members.BulkImport');
      before = (await listMemberRegister(page, {}, 1)).totalRows;
      session = await memberRole.signIn(CASES.notAuthorised.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      await session.members.openTable();
      expect(await session.members.countRows(), 'the restricted user\'s list').toBeGreaterThanOrEqual(0);
    });

    await steps.step('Look for the "Bulk Import Members" option - it is not visible, or disabled, for this role', async () => {
      expect(await session.members.isImportOffered(), `Import offered to the role without ${session.removed.join(', ')}`).toBe(false);
    });

    await steps.step('Attempt to reach the bulk import directly (the import request itself) - access is denied with an authorization error', async () => {
      const res = await startMemberImport(session.page, { name: fileName, mimeType: 'text/csv', buffer: buildMemberImportCsv([row]) });
      expect({ denied: res.status === 401 || res.status === 403 }, `ImportMembers answered ${res.status} ${res.text.slice(0, 200)}`).toEqual({ denied: true });
    });

    await steps.step('Confirm no file was processed - the member list is unchanged and no import activity is logged for this user', async () => {
      const runs = (await readImportHistory(page, 50)).items.filter((r) => r.fileName === fileName);
      expect({ created: (await findMemberByDocumentId(page, row['Document ID *'])) !== null, total: (await listMemberRegister(page, {}, 1)).totalRows, runs: runs.length })
        .toEqual({ created: false, total: before, runs: 0 });
    });
  });
});
