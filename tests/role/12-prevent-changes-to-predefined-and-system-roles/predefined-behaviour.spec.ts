import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import {
  AUDIT_PERMISSION_PATTERN,
  CASES,
  DASHBOARD_MODULE,
  NO_AUDIT_RECORD_BLOCK,
  PA_TARGET_ASSIGNABLE_BY,
  SAMPLED_PAYERS,
} from '../../../data/role/preventChangesToPredefinedAndSystemRoles.data';
import {
  approvalStatusOf,
  approveOfferedTo,
  approveRequestAs,
  assignThroughDrawer,
  assignmentOutcome,
  attemptAssignAsSession,
  auditTabObservations,
  auditTabProblems,
  blockWhen,
  discardSuiteNetwork,
  homePageView,
  offeredPayerIds,
  payerVisibility,
  rolesOnUser,
  saidSave,
  submitSuiteNetworkOrBlock,
  usersMenuOffered,
} from '../../../utils/role/writerCHelpers';
import { answerMessage } from '../../../utils/role/roleApi';
import { pendingRequestId } from '../../../utils/NetworkProvisioning';

/** Step 1 of every case: Role Administration opens as careconnect. */
async function openRoleManagement(steps: TestSteps, roleAdmin: RoleAdministrationPage, expected = 'the Role Administration screen is displayed'): Promise<void> {
  await steps.critical(`Navigate to the Role Management module - ${expected}`, async () => {
    const answer = await roleAdmin.open();
    expect(answer.status, 'GetRoles').toBe(200);
  });
}

const PO = PREDEFINED_ROLES.payerOfficer;

/**
 * User story 21291: Prevent Changes to Predefined and System Roles - how the predefined roles behave: who may
 * assign Payer Officer, self-approval, payer scope, Audit History, the Payer Officer home page. Targets are suite
 * users / suite payers / a suite network; the predefined-role holder is the role holder (maalmohammad), restored
 * at teardown. See the data file for every reading.
 */
test.describe('US 21291 - Prevent Changes to Predefined and System Roles (behaviour)', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.poAssignedBySystemAdmin.azureId}: should let the System Administrator assign Payer Officer to a user`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers, suitePayers, suiteApprovals }) => {
    const [payer] = await suitePayers.existing(1);
    const target = await suiteUsers.create({ role: await suiteRoles.create({ label: 'po target' }) });
    suiteApprovals.track(target.displayNameEn);
    await openRoleManagement(steps, roleAdmin);

    await steps.step('As the System Administrator (careconnect), assign the Payer Officer role to the target user - the assignment is accepted and saved', async () => {
      const saved = await assignThroughDrawer(page, target, PO.en, PO.id, [payer.name]);
      const landed = await assignmentOutcome(page, target, PO.en, payer.id);
      expect({ offered: saved.offered, saved: saved.status >= 200 && saved.status < 300, landed: landed.onRecord || landed.pendingId !== '' },
        `${saidSave(saved)}; the user holds [${Object.keys(landed.roles).join(', ')}], pending request "${landed.pendingId}"`).toEqual({ offered: true, saved: true, landed: true });
    });
  });

  test(`TC-${CASES.poAssignedByOrgAdmin.azureId}: should let an Organization Administrator assign Payer Officer to a user`, async ({ page, steps, roleAdmin, roleHolder, suiteRoles, suiteUsers, suitePayers, suiteApprovals }) => {
    const [payer] = await suitePayers.existing(1);
    const target = await suiteUsers.create({ role: await suiteRoles.create({ label: 'po target' }) });
    suiteApprovals.track(target.displayNameEn);
    await roleHolder.become({ role: 'Organization Administrator' });
    await openRoleManagement(steps, roleAdmin);

    await steps.step('As the Organization Administrator (the role holder), assign the Payer Officer role to a target user - the assignment is accepted and saved', async () => {
      const saved = await assignThroughDrawer(roleHolder.page, target, PO.en, PO.id, [payer.name]);
      const landed = await assignmentOutcome(page, target, PO.en, payer.id);
      expect({ offered: saved.offered, saved: saved.status >= 200 && saved.status < 300, landed: landed.onRecord || landed.pendingId !== '' },
        `${saidSave(saved)}; the user holds [${Object.keys(landed.roles).join(', ')}], pending request "${landed.pendingId}"`).toEqual({ offered: true, saved: true, landed: true });
    });
  });

  test(`TC-${CASES.poAssignedByPayerAdmin.azureId}: should let a Payer Administrator assign Payer Officer to a user of its payer`, async ({ page, steps, roleAdmin, roleHolder, suiteRoles, suiteUsers, suitePayers, suiteApprovals }) => {
    const [payer] = await suitePayers.existing(1);
    const scoped = await suiteRoles.create({ label: 'po target scoped', hasAssignedPayers: true, allowedToAssignBy: [...PA_TARGET_ASSIGNABLE_BY] });
    const target = await suiteUsers.create({ role: scoped, payerIds: [payer.id] });
    suiteApprovals.track(target.displayNameEn);
    await roleHolder.become({ role: 'Payer Administrator', payerIds: [payer.id] });
    await openRoleManagement(steps, roleAdmin);

    await steps.step('As the Payer Administrator (the role holder, scoped to the suite payer), assign the Payer Officer role to a target user within their assigned payer - the assignment is accepted and saved', async () => {
      const saved = await assignThroughDrawer(roleHolder.page, target, PO.en, PO.id, [payer.name]);
      const landed = await assignmentOutcome(page, target, PO.en, payer.id);
      expect({ offered: saved.offered, saved: saved.status >= 200 && saved.status < 300, landed: landed.onRecord || landed.pendingId !== '' },
        `${saidSave(saved)}; offered roles [${saved.options.join(', ')}]; the user holds [${Object.keys(landed.roles).join(', ')}], pending request "${landed.pendingId}"`).toEqual({ offered: true, saved: true, landed: true });
    });
  });

  test(`TC-${CASES.poNotAssignedByOthers.azureId}: should stop a user holding only Payer Officer from assigning Payer Officer`, async ({ page, steps, roleAdmin, roleHolder, suiteRoles, suiteUsers, suitePayers }) => {
    const [payer] = await suitePayers.existing(1);
    const target = await suiteUsers.create({ role: await suiteRoles.create({ label: 'po target' }) });
    await roleHolder.become({ role: 'Payer Officer', payerIds: [payer.id] });
    await openRoleManagement(steps, roleAdmin);

    await steps.step('As a user holding only the Payer Officer role, attempt to assign the Payer Officer role to another user - the assignment option is unavailable or the action is rejected', async () => {
      const adminSees = await usersMenuOffered(page);
      const holderSees = await usersMenuOffered(roleHolder.page);
      const attempt = await attemptAssignAsSession(page, roleHolder.page, target.id, PO.id, [payer.id]);
      const roles = await rolesOnUser(page, target.id);
      expect({ adminSeesUsers: adminSees, holderSeesUsers: holderSees, apiRefused: attempt.status >= 400, onRecord: PO.en in roles },
        `UpdateUser as the Payer Officer answered ${attempt.status} "${answerMessage(attempt)}"; the target holds [${Object.keys(roles).join(', ')}]`)
        .toEqual({ adminSeesUsers: true, holderSeesUsers: false, apiRefused: true, onRecord: false });
    });
  });

  test(`TC-${CASES.requestNeedsAnotherApprover.azureId}: should keep a predefined-role holder from approving its own request and let another approver approve it`, async ({ page, steps, roleAdmin, roleHolder, suitePayers, suiteApprovals, cleanup }) => {
    const [payer] = await suitePayers.existing(1);
    const request = { id: '', network: { id: '', name: '' } };
    await roleHolder.become({ role: 'Organization Administrator' });
    await openRoleManagement(steps, roleAdmin);

    await steps.critical('As the predefined-role holder (Organization Administrator), submit a request (a new suite network for approval) - the request moves to a pending-approval state', async () => {
      request.network = await submitSuiteNetworkOrBlock(steps, roleHolder.page, payer.id);
      cleanup.register(() => discardSuiteNetwork(page, request.network));
      suiteApprovals.track(request.network.name);
      request.id = await pendingRequestId(page, request.network.name);
      expect(request.id, `a Pending approval request for "${request.network.name}"`).not.toBe('');
    });

    await steps.step('Attempt to approve the same request while signed in as the submitter - the approval action is unavailable to the submitter', async () => {
      const offered = await approveOfferedTo(roleHolder.page, request.network.name);
      const attempt = await approveRequestAs(roleHolder.page, request.id);
      const status = await approvalStatusOf(page, request.id);
      expect({ approveOffered: offered === 'available', apiRefused: attempt.status >= 400, stillPending: /pending/i.test(status) },
        `Approve on the submitter's queue row: ${offered}; ApproveRequest as the submitter answered ${attempt.status} "${answerMessage(attempt)}"; request status "${status}"`)
        .toEqual({ approveOffered: false, apiRefused: true, stillPending: true });
    });

    await steps.step('Sign in as a different authorized approver (careconnect) and approve the request - the request transitions to the approved state successfully', async () => {
      const answer = await approveRequestAs(page, request.id);
      const status = await approvalStatusOf(page, request.id);
      expect({ accepted: answer.status < 300, approved: /approv/i.test(status) }, `ApproveRequest as careconnect answered ${answer.status} "${answerMessage(answer)}"; request status "${status}"`)
        .toEqual({ accepted: true, approved: true });
    });
  });

  test(`TC-${CASES.orgAdminEveryPayer.azureId}: should let an Organization Administrator work with every payer`, async ({ page, steps, roleAdmin, roleHolder, suitePayers }) => {
    const sampled = await suitePayers.existing(SAMPLED_PAYERS);
    await roleHolder.become({ role: 'Organization Administrator' });
    await openRoleManagement(steps, roleAdmin);

    await steps.step('As the Organization Administrator, access records belonging to several different payers - records for every payer are visible and accessible without scope restriction', async () => {
      const adminIds = await offeredPayerIds(page);
      const holderIds = await offeredPayerIds(roleHolder.page);
      const visibility: ({ name: string } & Awaited<ReturnType<typeof payerVisibility>>)[] = [];
      for (const p of sampled) visibility.push({ name: p.name, ...(await payerVisibility(roleHolder.page, p)) });
      expect({
        notOffered: adminIds.filter((id) => !holderIds.includes(id)).length,
        sampled: visibility.filter((v) => !v.inDropdown || v.inPayerList !== true).map((v) => `${v.name}: offered ${v.inDropdown}, payer list ${v.inPayerList} (${v.listStatus})`),
      }, `careconnect is offered ${adminIds.length} payers, the Organization Administrator ${holderIds.length}`).toEqual({ notOffered: 0, sampled: [] });
    });
  });

  test(`TC-${CASES.payerAdminScoped.azureId}: should limit a Payer Administrator to its assigned payers`, async ({ steps, roleAdmin, roleHolder, suitePayers }) => {
    const [assigned, other] = await suitePayers.existing(2);
    await roleHolder.become({ role: 'Payer Administrator', payerIds: [assigned.id] });
    await openRoleManagement(steps, roleAdmin);

    await steps.step(`As the Payer Administrator, attempt to access records for an assigned payer (${assigned.name}) - the records are visible and accessible`, async () => {
      const v = await payerVisibility(roleHolder.page, assigned);
      expect({ offered: v.inDropdown, hiddenByList: v.inPayerList === false }, `payer list answered ${v.listStatus}`).toEqual({ offered: true, hiddenByList: false });
    });

    await steps.step(`Attempt to access records for a payer not assigned to this administrator (${other.name}) - access is denied or the records are not shown`, async () => {
      const v = await payerVisibility(roleHolder.page, other);
      expect({ offered: v.inDropdown, foundByList: v.inPayerList === true }, `payer list answered ${v.listStatus}`).toEqual({ offered: false, foundByList: false });
    });
  });

  test(`TC-${CASES.payerOfficerScoped.azureId}: should limit a Payer Officer to its assigned payers`, async ({ steps, roleAdmin, roleHolder, suitePayers }) => {
    const [assigned, other] = await suitePayers.existing(2);
    await roleHolder.become({ role: 'Payer Officer', payerIds: [assigned.id] });
    await openRoleManagement(steps, roleAdmin);

    await steps.step(`As the Payer Officer, attempt to access records for an assigned payer (${assigned.name}) - the records are visible and accessible`, async () => {
      const v = await payerVisibility(roleHolder.page, assigned);
      expect({ offered: v.inDropdown, hiddenByList: v.inPayerList === false }, `payer list answered ${v.listStatus}`).toEqual({ offered: true, hiddenByList: false });
    });

    await steps.step(`Attempt to access records for a payer not assigned to this officer (${other.name}) - access is denied or the records are not shown`, async () => {
      const v = await payerVisibility(roleHolder.page, other);
      expect({ offered: v.inDropdown, foundByList: v.inPayerList === true }, `payer list answered ${v.listStatus}`).toEqual({ offered: false, foundByList: false });
    });
  });

  test(`TC-${CASES.payerOfficerNoAuditTab.azureId}: should show a Payer Officer no Audit History tab in any module`, async ({ page, steps, roleAdmin, roleHolder, suitePayers }) => {
    const [payer] = await suitePayers.existing(1);
    await roleHolder.become({ role: 'Payer Officer', payerIds: [payer.id] });
    await openRoleManagement(steps, roleAdmin);

    await steps.step('As the Payer Officer, visit each module that normally exposes an Audit History tab - the Audit History tab is absent from every module for this role', async () => {
      const me = await roleHolder.permissions();
      const auditKeys = me.permissions.filter((k) => AUDIT_PERMISSION_PATTERN.test(k));
      const observed = await auditTabObservations(page, roleHolder.page, payer.name);
      expect({ auditKeys, problems: auditTabProblems(observed) }, `modules checked on screen: ${observed.map((o) => o.module).join(', ') || 'none'}`)
        .toEqual({ auditKeys: [], problems: [] });
      blockWhen(steps, observed.length === 0, NO_AUDIT_RECORD_BLOCK);
    });
  });

  test(`TC-${CASES.payerOfficerWelcomeOnly.azureId}: should show a Payer Officer only the welcome card on the home page`, async ({ page, steps, roleAdmin, roleHolder, suitePayers }) => {
    const [payer] = await suitePayers.existing(1);
    await steps.critical('Navigate to the Role Management module - the Role Administration screen is displayed, confirming the Payer Officer\'s assigned role and lack of dashboard permission', async () => {
      await roleAdmin.open();
      await roleAdmin.search(PO.en);
      const view = await roleAdmin.openView(PO.id);
      const dashboard = await view.tree.countOf(DASHBOARD_MODULE);
      await view.close();
      expect(dashboard.selected, `Payer Officer's ${DASHBOARD_MODULE} privileges (${dashboard.selected}/${dashboard.total})`).toBe(0);
    });

    await steps.critical('Sign in as the Payer Officer user (the role holder with only Payer Officer + a suite payer) - the user lands on the home page', async () => {
      const signedIn = await roleHolder.become({ role: 'Payer Officer', payerIds: [payer.id] });
      expect(new URL(signedIn.url).pathname, `landed on ${signedIn.url}`).toBe('/dashboard');
    });

    await steps.step('Observe the home page content - only the welcome card is displayed and no dashboard widgets appear', async () => {
      const admin = await homePageView(page);
      const holder = await homePageView(roleHolder.page);
      expect({
        baselineWidgets: admin.otherIds.length > 0 || admin.dashboardCalls.some((c) => c.status < 300),
        welcome: holder.welcome,
        widgets: holder.otherIds,
        dashboardAnswered: holder.dashboardCalls.filter((c) => c.status < 300).map((c) => c.path),
      }, `careconnect's home shows ${admin.otherIds.length} other element(s) and ${admin.dashboardCalls.length} Dashboard call(s); the Payer Officer is on ${holder.path}`)
        .toEqual({ baselineWidgets: true, welcome: true, widgets: [], dashboardAnswered: [] });
    });
  });
});
