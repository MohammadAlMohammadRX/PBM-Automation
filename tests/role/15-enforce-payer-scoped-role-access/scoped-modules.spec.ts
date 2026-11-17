import {
  test,
  expect,
  ApprovalTabView,
  LIST_API,
  WriterFScreen,
  approvalPayerId,
  asSession,
  captureResponses,
  foreignRecords,
  idOf,
  listAll,
  listApprovals,
  makeRequest,
  openScreen,
  payersByName,
  payersSpanned,
  readRoleOnScreen,
  replayAsScoped,
  requireData,
  said,
  scopedHolder,
  usersOutsideScope,
  valueOf,
  type MadeRequest,
} from '../../../utils/role/writerFHelpers';
import type { SuitePayer, SuiteRole } from '../../../fixtures/roleModule.fixture';
import type { ProvisionedInvitation, ProvisionedUser } from '../../../utils/UserProvisioning';
import { InvitationListPage } from '../../../pages/user/InvitationListPage';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { PAYER_SCREENS, WRITER_F_IDS } from '../../../constants/role/writerFIds';
import {
  APPROVAL_VIEW_RIGHTS,
  CASES,
  DASHBOARD_MODULES,
  DASHBOARD_SESSION_FIELDS,
  DATA_PAYERS,
  ENGINE_API,
  PORTAL_MODULES,
  PORTAL_TEXT,
  SCOPED_USER_ROLE,
  USER_MODULES,
  VIEW_LABEL,
  YES_NO,
  isDenied,
} from '../../../data/role/enforcePayerScopedRoleAccess.data';

/**
 * US 21299 - Enforce Payer-Scoped Role Access: Approval Management, Users / Invitations, the Dashboard and
 * the Integration Portal for a holder scoped to Payer A. Requests, users and invitations of Payer A and B
 * are made by careconnect (suite names, rejected / deleted at teardown). Decisions:
 * data/role/enforcePayerScopedRoleAccess.data.ts.
 */
test.describe('US 21299 - Enforce Payer-Scoped Role Access (other modules)', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.approvalsScoped.azureId}: should show only the requests of the user's assigned payer in Approval Management`, async ({ steps, suiteRoles, suitePayers, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let payerA!: SuitePayer;
    let payerB!: SuitePayer;
    let role!: SuiteRole;
    let reqA!: MadeRequest;
    let reqB!: MadeRequest;
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'network');

    await steps.critical('Precondition: pending requests for Payer A and Payer B (networks they own, submitted by the administrator); a payer-scoped reviewer role given to the holder with Payer A only', async () => {
      [payerA, payerB] = await suitePayers.existing(2);
      reqA = await makeRequest('network', page, page, suiteApprovals, { payerId: payerA.id });
      reqB = await makeRequest('network', page, page, suiteApprovals, { payerId: payerB.id });
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'scope approvals', modules: [], extra: APPROVAL_VIEW_RIGHTS, scoped: true, payers: [payerA] });
      expect([reqA.requestId, reqB.requestId].every(Boolean)).toBe(true);
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    await steps.step('Navigate to the Approval Management module - the approval requests list is displayed', async () => {
      await view().openTab();
      await expect(view().section()).toBeVisible();
    });

    await steps.step('Review the requests shown - only the requests tied to Payer A appear; Payer B\'s do not', async () => {
      const rowA = await view().findRow(reqA.name);
      const rowB = await view().findRow(reqB.name);
      const queue = await listApprovals(roleHolder.page, 'Network');
      const otherPayers = queue.items.filter((i) => approvalPayerId(i) !== null && approvalPayerId(i) !== payerA.id).map((i) => i.entityNameEn);
      expect({
        payerAShown: rowA !== '',
        payerBShown: rowB !== '',
        payerAInQueue: queue.items.some((i) => i.entityNameEn === reqA.name),
        payerBInQueue: queue.items.some((i) => i.entityNameEn === reqB.name),
        otherPayers: otherPayers.slice(0, 10),
      }, `the Network queue of a holder scoped to "${payerA.name}" (GetApprovals ${queue.status}, ${queue.items.length} pending)`).toEqual({ payerAShown: true, payerBShown: false, payerAInQueue: true, payerBInQueue: false, otherPayers: [] });
    });
  });

  test(`TC-${CASES.usersInvitationsScoped.azureId}: should limit the Users list and Invitations (view, export, actions) to the user's assigned payer`, async ({ steps, suiteRoles, suitePayers, suiteUsers, suiteInvitations, roleHolder, roleAdmin, page }) => {
    let payerA!: SuitePayer;
    let payerB!: SuitePayer;
    let role!: SuiteRole;
    let userA!: ProvisionedUser;
    let userB!: ProvisionedUser;
    let invA!: ProvisionedInvitation;
    let invB!: ProvisionedInvitation;

    await steps.critical('Precondition: suite users and invitations under Payer A and Payer B; a payer-scoped role (Users, Invitations) given to the holder with Payer A only', async () => {
      [payerA, payerB] = await suitePayers.existing(2);
      userA = await suiteUsers.create({ role: SCOPED_USER_ROLE, payerIds: [payerA.id] });
      userB = await suiteUsers.create({ role: SCOPED_USER_ROLE, payerIds: [payerB.id] });
      const roleId = await suiteRoles.idOf(SCOPED_USER_ROLE);
      invA = await suiteInvitations.create(roleId, payerA.id);
      invB = await suiteInvitations.create(roleId, payerB.id);
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'scope users', modules: USER_MODULES, scoped: true, payers: [payerA] });
      expect(invB.payerId).toBe(payerB.id);
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    await steps.step('Navigate to the Users module - the user list is filtered to users associated with Payer A', async () => {
      const shown = await openScreen(roleHolder.page, 'users');
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.users.route));
      const findA = await listAll(roleHolder.page, LIST_API.users, { searchText: userA.email });
      const findB = await listAll(roleHolder.page, LIST_API.users, { searchText: userB.email });
      expect({
        status: shown.status,
        userAListed: findA.items.some((i) => idOf(i) === userA.id),
        userBListed: findB.items.some((i) => idOf(i) === userB.id),
        notOfPayerA: await usersOutsideScope(page, shown.items, payerA.id),
      }, `Users for a holder scoped to "${payerA.name}" (${shown.totalRows} rows)`).toEqual({ status: 200, userAListed: true, userBListed: false, notOfPayerA: [] });
    });

    await steps.step('Navigate to the Invitations module and review the list - only invitations tied to Payer A appear', async () => {
      const shown = await openScreen(roleHolder.page, 'invitations');
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.invitations.route));
      const direct = await listAll(roleHolder.page, LIST_API.invitations);
      expect({
        status: shown.status,
        screenOther: foreignRecords(shown.items, [payerA.id]),
        listOther: foreignRecords(direct.items, [payerA.id]).slice(0, 10),
        invitationA: direct.items.some((i) => idOf(i) === invA.id),
        invitationB: direct.items.some((i) => idOf(i) === invB.id),
      }, `Invitations for a holder scoped to "${payerA.name}" (${direct.totalRows} rows)`).toEqual({ status: 200, screenOther: [], listOther: [], invitationA: true, invitationB: false });
    });

    await steps.step('Export the Invitations list - the exported data contains only Payer A records', async () => {
      const list = new InvitationListPage(roleHolder.page);
      await list.openTable();
      const file = await list.exportAndParse('all', 'excel');
      const payerColumn = file.parsed.headers.find((h) => /payer/i.test(h)) ?? '';
      const values = file.parsed.rows.map((r) => r[payerColumn] ?? '');
      const emails = file.parsed.rows.map((r) => Object.values(r).join(' '));
      expect(payerColumn, `the export's columns: ${file.parsed.headers.join(', ')}`).not.toBe('');
      expect({
        otherPayerRows: values.filter((v) => v !== payerA.id && v !== payerA.name).slice(0, 10),
        invitationBExported: emails.some((e) => e.includes(invB.email)),
      }, `${file.filename}: ${file.parsed.rows.length} rows`).toEqual({ otherPayerRows: [], invitationBExported: false });
    });

    await steps.step('Attempt to resend a Payer B invitation through a direct reference - the action is refused', async () => {
      const before = await listAll(page, LIST_API.invitations, { searchText: invB.email }, undefined, 10);
      const res = await asSession(roleHolder.page, 'POST', ApiEndpoints.invitationResend, { id: invB.id, expiryDays: 5 });
      const after = await listAll(page, LIST_API.invitations, { searchText: invB.email }, undefined, 10);
      expect(isDenied(res), `ResendInvitation on "${invB.email}" (Payer B) through the holder: ${said(res)}`).toBe(true);
      expect(after.items.map((i) => i.expiresOn)).toEqual(before.items.map((i) => i.expiresOn));
    });
  });

  test(`TC-${CASES.dashboardScoped.azureId}: should show dashboard figures of the user's assigned payer only`, async ({ steps, suiteRoles, roleHolder, roleAdmin, page }) => {
    let payerA!: SuitePayer;
    let role!: SuiteRole;
    let calls: Awaited<ReturnType<typeof captureResponses>> = [];

    await steps.critical('Precondition: a payer-scoped role with the Dashboard rights given to the holder with Payer A only', async () => {
      const found = await payersByName(page, [DATA_PAYERS[0]]);
      requireData(steps, found.length === 1, `the data payer "${DATA_PAYERS[0]}" is not offered in this environment`);
      payerA = found[0];
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'scope dashboard', modules: DASHBOARD_MODULES, scoped: true, payers: [payerA] });
      expect(role.record.hasAssignedPayers).toBe(true);
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    await steps.critical('Navigate to the Dashboard module - the dashboard widgets and metrics load', async () => {
      calls = await captureResponses(roleHolder.page, PAYER_SCREENS.dashboard.call, () => new WriterFScreen(roleHolder.page).open(PAYER_SCREENS.dashboard.route));
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.dashboard.route));
      expect(calls.length, 'dashboard calls made by the holder\'s dashboard').toBeGreaterThan(0);
      expect(calls.filter((c) => c.status !== 200).map((c) => `${c.url} ${c.status}`)).toEqual([]);
    });

    await steps.step('Review the data on the dashboard - every figure equals Payer A\'s figures (the administrator with Payer A selected)', async () => {
      const differ = await replayAsScoped(page, calls, payerA.id, DASHBOARD_SESSION_FIELDS);
      expect(differ, `dashboard calls whose figures differ from "${payerA.name}"'s (${calls.length} compared)`).toEqual([]);
    });
  });

  test(`TC-${CASES.integrationPortalScoped.azureId}: should show only the assigned payer's Authorizations, Rebate Accruals and API Clients in the Integration Portal`, async ({ steps, suiteRoles, roleHolder, roleAdmin, page }) => {
    let payerA!: SuitePayer;
    let role!: SuiteRole;
    const section = async (key: keyof typeof ENGINE_API, label: string): Promise<{ result: { status: number; other: string[] }; note: string }> => {
      const admin = await listAll(page, ENGINE_API[key], {}, undefined, 200);
      requireData(steps, payersSpanned(admin.items).length >= 2, `${label}: the administrator sees no records of two different payers (${admin.status}, ${admin.items.length} rows) - a Payer B record to keep out does not exist`);
      const mine = await listAll(roleHolder.page, ENGINE_API[key], {}, undefined, 200);
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.enginePortal.route));
      return { result: { status: mine.status, other: foreignRecords(mine.items, [payerA.id], true).slice(0, 10) }, note: `${label} for a holder scoped to "${payerA.name}"` };
    };

    await steps.critical('Precondition: a payer-scoped role with the PBM Engine and API Clients rights given to the holder with Payer A only', async () => {
      const found = await payersByName(page, [DATA_PAYERS[0]]);
      requireData(steps, found.length === 1, `the data payer "${DATA_PAYERS[0]}" is not offered in this environment`);
      payerA = found[0];
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'scope portal', modules: PORTAL_MODULES, scoped: true, payers: [payerA] });
      expect(role.record.hasAssignedPayers).toBe(true);
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    await steps.step('Navigate to the Integration Portal module - the portal landing page is displayed', async () => {
      const screen = new WriterFScreen(roleHolder.page);
      // The entry is read on a PBM screen; the portal's own route then shows the portal (its separate sign-in).
      await screen.open(PAYER_SCREENS.dashboard.route);
      await expect(screen.el(WRITER_F_IDS.navDashboardLink).or(screen.el(WRITER_F_IDS.navEnginePortalLink)).first(), 'the side menu').toBeVisible();
      await expect(screen.el(WRITER_F_IDS.navEnginePortalLink), 'the Integration Portal entry in the side menu of a holder holding every PBM Engine and API Clients right').toBeVisible();
      const portalText = await screen.visitRaw(PAYER_SCREENS.enginePortal.route);
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.enginePortal.route));
      expect(PORTAL_TEXT.test(portalText), `the portal route showed "${portalText.slice(0, 160)}"`).toBe(true);
    });

    await steps.step('Open the Authorizations section - only Payer A authorization records are listed', async () => {
      const seen = await section('authorizations', 'Authorizations');
      expect(seen.result, seen.note).toEqual({ status: 200, other: [] });
    });

    await steps.step('Open the Rebate Accruals section - only Payer A rebate accrual records are listed', async () => {
      const seen = await section('rebateAccruals', 'Rebate Accruals');
      expect(seen.result, seen.note).toEqual({ status: 200, other: [] });
    });

    await steps.step('Open the API Clients section - only Payer A API client records are listed', async () => {
      const seen = await section('apiClients', 'API Clients');
      expect(seen.result, seen.note).toEqual({ status: 200, other: [] });
    });
  });
});
