import { test, expect, type FacilityRoleControl, type FacilitySession } from '../../../utils/facility/writerCHelpers';
import { blockedByPrecondition } from '../../../fixtures/testStatus.fixture';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import { MemberDetailPage } from '../../../pages/member/MemberDetailPage';
import { AuditLogsPage } from '../../../pages/system/AuditLogsPage';
import { ACCESS_RESTRICTED, AUDIT_CODES, AUDIT_RIGHTS, CASES } from '../../../data/member/viewMemberAuditHistory.data';
import { readMemberAuditTrail, updateMemberFields } from '../../../utils/MemberProvisioning';
import { asSession, auditTabLabels, refused } from '../../../utils/member/writerDHelpers';

/** The restricted user's pages on its own window. */
interface RestrictedViews {
  session: FacilitySession;
  members: MemberManagementPage;
  detail: MemberDetailPage;
  auditLogs: AuditLogsPage;
}

/**
 * Signs the Payer Admin in WITHOUT the audit trail rights (AuditLogs.GetAuditLogs /
 * GetAuditLogById, shaped by the Facility suite's `facilityRole` and restored at
 * teardown; the role keeps every Members.* right) and BLOCKS when the account is
 * still told it holds them - the role edit did not reach it (Policy / Facility
 * 2026-11-04), so nothing could be learnt about the member's audit gate.
 */
async function signInWithoutAuditRights(facilityRole: FacilityRoleControl): Promise<RestrictedViews> {
  const session = await facilityRole.signIn({ without: AUDIT_RIGHTS });
  const stillHeld = session.stillHeld.filter((code) => (AUDIT_CODES as readonly string[]).includes(code));
  if (stillHeld.length > 0) {
    blockedByPrecondition(test.info(), 'a Payer Admin without the audit trail rights', new Error(`permission-not-propagated: ${stillHeld.join(', ')} withheld from the role but still held by the signed-in account`));
  }
  return { session, members: new MemberManagementPage(session.page), detail: new MemberDetailPage(session.page), auditLogs: new AuditLogsPage(session.page) };
}

/**
 * User story 14387: View Member - Audit History - who may see a member's trail.
 * The administrator is the Compliance Officer AND the System Administrator (no
 * such accounts exist); the "Member Administrator without audit rights" is the
 * Payer Admin role without the audit trail rights (data/member/viewMemberAuditHistory.data.ts).
 * The member's view page has no Audit History tab (known finding); the trail is
 * System Settings > Audit Logs.
 */
test.describe('US 14387 - View Member - Audit History - access', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.roleAccess.azureId}: should give the audit history only to the roles authorised for compliance review`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    auditLogsPage,
    facilityRole,
    steps,
  }) => {
    const member = await memberIn('Active');
    let restricted!: RestrictedViews;

    await steps.critical("Navigate to the Member Management module - the member list loads, respecting the user's permission level", async () => {
      expect((await updateMemberFields(page, member.id, { occupation: CASES.roleAccess.occupation })).status).toBeLessThan(300);
      restricted = await signInWithoutAuditRights(facilityRole);
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
      await restricted.members.openTable();
      expect(await restricted.members.canListMembers(), 'the Member Administrator still lists members').toBe(true);
    });

    await steps.step("As Compliance Officer (the administrator), open the member's Audit History view - the audit history is accessible and fully displayed", async () => {
      await memberDetailPage.open(member.id);
      const tabs = await memberDetailPage.readTabLabels();
      const audit = await auditTabLabels(memberDetailPage);
      const rows = await auditLogsPage.findRowsMentioning(member.id);
      expect({ auditHistoryView: audit.length > 0, trailDisplayed: rows.length > 0 }, `the view page offers the tabs: ${tabs.join(', ')}; Audit Logs rows for the member: ${rows.length}`)
        .toEqual({ auditHistoryView: true, trailDisplayed: true });
    });

    await steps.step("As System Administrator (the administrator), open the member's Audit History view - access is granted according to the permission matrix (the role holds the audit rights)", async () => {
      const access = await auditLogsPage.openAndReportAccess();
      const trail = await readMemberAuditTrail(page, member.id);
      expect({ reachable: access.reachable, entries: trail.totalRows > 0 }, `Audit Logs at ${access.url}`).toEqual({ reachable: true, entries: true });
    });

    await steps.step("As standard Member Administrator without audit rights, attempt to open the member's Audit History view - access is denied with an authorization message", async () => {
      const access = await restricted.auditLogs.openAndReportAccess();
      const api = await asSession(restricted.session.page, 'POST', ApiEndpoints.auditLogList, { entityType: 'Member', entityId: member.id, actionType: null, pageNumber: 1, rowsPerPage: 10 });
      expect({ reachable: access.reachable, apiRefused: refused(api) }, `Audit Logs at ${access.url}; GetAuditLogs answered ${api.status} ${api.text.slice(0, 160)}`)
        .toEqual({ reachable: false, apiRefused: true });
      expect(access.text, 'an authorization message').toMatch(ACCESS_RESTRICTED);
    });
  });

  test(`TC-${CASES.unauthorised.azureId}: should hide the audit history from a user without audit permissions and refuse it by address`, async ({
    page,
    memberIn,
    auditLogsPage,
    facilityRole,
    requireBaseline,
    steps,
  }) => {
    const member = await memberIn('Active');
    let restricted!: RestrictedViews;

    await steps.critical("Navigate to the Member Management module - the member list loads, respecting the user's permission level", async () => {
      expect((await updateMemberFields(page, member.id, { occupation: CASES.unauthorised.occupation })).status).toBeLessThan(300);
      // Baseline: a user holding the audit rights (the administrator) reaches the member's trail.
      requireBaseline((await auditLogsPage.findRowsMentioning(member.id)).length > 0, "the member's trail in Audit Logs for a user holding the audit rights");
      restricted = await signInWithoutAuditRights(facilityRole);
      await restricted.members.openTable();
      expect(await restricted.members.canListMembers(), 'the restricted user lists members').toBe(true);
    });

    await steps.step("Open the member's detail page - the member details are shown, but the Audit History option is hidden or disabled", async () => {
      await restricted.detail.openExpectingFailure(member.id);
      const shown = await restricted.detail.isLoaded();
      const name = shown ? await restricted.detail.getName() : '';
      expect({ detailsShown: name === member.displayNameEn, auditOption: shown ? await auditTabLabels(restricted.detail) : [] }, `the view page ${shown ? `opened ("${name}")` : `did not open: ${await restricted.detail.getScreenText()}`}`)
        .toEqual({ detailsShown: true, auditOption: [] });
    });

    await steps.step('Attempt to access the Audit History view directly via URL - the system denies access with an authorization error', async () => {
      const access = await restricted.auditLogs.openAndReportAccess();
      const api = await asSession(restricted.session.page, 'POST', ApiEndpoints.auditLogList, { entityType: 'Member', entityId: member.id, actionType: null, pageNumber: 1, rowsPerPage: 10 });
      expect({ reachable: access.reachable, apiRefused: refused(api) }, `Audit Logs at ${access.url}; GetAuditLogs answered ${api.status} ${api.text.slice(0, 160)}`)
        .toEqual({ reachable: false, apiRefused: true });
      expect(access.text, 'an authorization error').toMatch(ACCESS_RESTRICTED);
    });
  });
});
