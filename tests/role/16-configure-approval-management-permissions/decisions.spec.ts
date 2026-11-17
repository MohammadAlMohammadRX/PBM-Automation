import {
  test,
  expect,
  ApprovalTabView,
  becomeReviewer,
  confirmPrompt,
  heldKeys,
  listApprovals,
  makeRequest,
  openPrompt,
  picture,
  readRoleOnScreen,
  requestStatuses,
  statesOf,
  treeMismatch,
  treePicture,
  waitLeftPending,
  type MadeRequest,
} from '../../../utils/role/writerFHelpers';
import type { SuitePayer, SuiteRole } from '../../../fixtures/roleModule.fixture';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import {
  ACTION_LABEL,
  CASES,
  FULL_REVIEWER,
  GENERAL,
  GENERAL_LABEL,
  REJECT_REASON,
  ROLE_RIGHTS,
  ROW_ACTIONS,
  STATUS,
  TREE_DIFF,
  allKey,
  oneKey,
  tabKey,
} from '../../../data/role/configureApprovalManagementPermissions.data';

/**
 * US 21301 - Configure Approval Management Permissions: what a reviewer may do on a request submitted by
 * ANOTHER user (careconnect) - approve one, view only, module right without the general Approve, one-at-a-time
 * vs bulk controls, Reject only inside the Review drawer, and requests leaving the queue as Approved /
 * Rejected. Decisions: data/role/configureApprovalManagementPermissions.data.ts.
 */
test.describe('US 21301 - Configure Approval Management Permissions (decisions)', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.approveOne.azureId}: should let a reviewer with tab, module and general Approve permissions approve a single submission`, async ({ steps, suiteRoles, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let role!: SuiteRole;
    let req!: MadeRequest;
    let rowId = '';
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'plan');

    await steps.critical('Precondition: a pending Plan change submitted by another user; the reviewer holds the Plan tab, its Approve/Reject and Approve a Submission', async () => {
      req = await makeRequest('plan', page, page, suiteApprovals);
      role = await becomeReviewer(suiteRoles, roleHolder, { label: 'plan approve', rights: ROLE_RIGHTS.planApprove });
      expect(role.rights).toEqual(expect.arrayContaining([tabKey('Plan'), oneKey('Plan'), GENERAL.approve]));
    });

    await steps.step('Navigate to the Role Management module - the reviewer\'s role has all three required permissions', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(await heldKeys(page, role.id)).toContain(tabKey('Plan'));
      expect(treeMismatch(treePicture(seen.rows, [oneKey('Plan'), GENERAL.approve]), picture([
        [oneKey('Plan'), ACTION_LABEL.one, 'checked'],
        [GENERAL.approve, GENERAL_LABEL[GENERAL.approve], 'checked'],
      ])), TREE_DIFF).toBe('');
    });

    await steps.critical('Log in as the reviewer and open Approval Management > Plan tab - the pending row offers Review and Approve', async () => {
      await view().openTab();
      rowId = await view().findRow(req.name);
      expect(rowId, `"${req.name}" on the reviewer's Plan tab`).not.toBe('');
      expect(await view().rowActions(rowId)).toEqual(expect.arrayContaining(['approve', 'review']));
    });

    await steps.critical('Click Approve on the row - a confirmation prompt asks to confirm the approval', async () => {
      const prompt = await openPrompt(roleHolder.page, view().rowAction(rowId, 'approve'));
      expect(prompt.dialogShown, `no prompt after Approve (toast "${prompt.toast}")`).toBe(true);
    });

    await steps.step('Confirm the approval - the request is Approved and leaves the pending list', async () => {
      const out = await confirmPrompt(roleHolder.page, 'approve');
      const statuses = await waitLeftPending(page, 'Plan', req.name);
      expect(await view().findRow(req.name), `answers: ${out.answers.join(' | ')}; toast "${out.toast}"`).toBe('');
      expect(statuses.some((s) => STATUS.approved.test(s)), `statuses of "${req.name}": ${statuses.join(', ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.viewOnly.azureId}: should let a reviewer with only the Policy tab view requests without approve or reject options`, async ({ steps, suiteRoles, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let role!: SuiteRole;
    let req!: MadeRequest;
    let rowId = '';
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'policy');

    await steps.critical('Precondition: a pending Policy change; the reviewer holds the Policy tab only (no module or general Approve / Reject)', async () => {
      req = await makeRequest('policy', page, page, suiteApprovals);
      role = await becomeReviewer(suiteRoles, roleHolder, { label: 'policy view', rights: ROLE_RIGHTS.policyView });
      expect(role.rights).not.toContain(GENERAL.approve);
    });

    await steps.step('Navigate to the Role Management module - only the tab view permission is enabled for Policy', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(await heldKeys(page, role.id)).toContain(tabKey('Policy'));
      expect(treeMismatch(statesOf(seen.rows, [oneKey('Policy'), allKey('Policy'), GENERAL.approve, GENERAL.reject]), { [oneKey('Policy')]: 'unchecked', [allKey('Policy')]: 'unchecked', [GENERAL.approve]: 'unchecked', [GENERAL.reject]: 'unchecked' }), TREE_DIFF).toBe('');
    });

    await steps.critical('Log in as the reviewer and open Approval Management > Policy tab - the pending requests are listed', async () => {
      await view().openTab();
      rowId = await view().findRow(req.name);
      expect(rowId, `"${req.name}" on the reviewer's Policy tab`).not.toBe('');
    });

    await steps.step('Inspect a request row - no Approve, Reject or bulk action is offered', async () => {
      await expect(view().bulkButton('approve')).toHaveCount(0);
      expect({ row: await view().rowActions(rowId), approveAll: await view().bulkState('approve'), rejectAll: await view().bulkState('reject') })
        .toEqual({ row: [...ROW_ACTIONS.viewOnly], approveAll: 'absent', rejectAll: 'absent' });
    });

    await steps.step('Open the request via its view action - details are read-only with no Approve or Reject', async () => {
      const review = await view().openReview(rowId);
      await expect(view().reviewButton('approve')).toHaveCount(0);
      expect(review.buttons.filter((b) => b !== 'close')).toEqual([]);
      await view().closeReview();
    });
  });

  test(`TC-${CASES.noGeneralApprove.azureId}: should not let a reviewer approve without the general Approve a Submission permission`, async ({ steps, suiteRoles, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let role!: SuiteRole;
    let req!: MadeRequest;
    let rowId = '';
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'formulary');

    await steps.critical('Precondition: a pending Formulary change; the reviewer holds the Formulary tab and its Approve/Reject but not Approve a Submission', async () => {
      req = await makeRequest('formulary', page, page, suiteApprovals);
      role = await becomeReviewer(suiteRoles, roleHolder, { label: 'formulary no general', rights: ROLE_RIGHTS.formularyNoGeneral });
      expect(role.rights).not.toContain(GENERAL.approve);
    });

    await steps.step('Navigate to the Role Management module - the general "Approve a Submission" permission is unchecked', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(treeMismatch(treePicture(seen.rows, [GENERAL.approve, oneKey('Formulary')]), picture([
        [GENERAL.approve, GENERAL_LABEL[GENERAL.approve], 'unchecked'],
        [oneKey('Formulary'), ACTION_LABEL.one, 'checked'],
      ])), TREE_DIFF).toBe('');
    });

    await steps.critical('Log in as the reviewer and open Approval Management > Formulary tab - pending requests are shown', async () => {
      await view().openTab();
      rowId = await view().findRow(req.name);
      expect(rowId, `"${req.name}" on the reviewer's Formulary tab`).not.toBe('');
    });

    await steps.step('Attempt to click Approve on the row - Approve is not available / not clickable', async () => {
      const state = await view().rowActionState(rowId, 'approve');
      await expect(view().section()).toBeVisible();
      expect(['absent', 'disabled'], `Approve on "${req.name}" is ${state} for a reviewer without Approve a Submission`).toContain(state);
    });
  });

  test(`TC-${CASES.bulkVsSingle.azureId}: should give only the bulk-enabled reviewer the per-row Reject and Approve All / Reject All`, async ({ steps, suiteRoles, suitePayers, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let roleA!: SuiteRole;
    let roleB!: SuiteRole;
    let payer!: SuitePayer;
    let req!: MadeRequest;
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'payer');

    await steps.critical('Precondition: a pending Payer change; Role A (one-at-a-time) and Role B (one-at-a-time + bulk) for the Payer tab', async () => {
      payer = await suitePayers.publish();
      req = await makeRequest('payer', page, page, suiteApprovals, { payerName: payer.name });
      roleB = await suiteRoles.create({ label: 'payer bulk', rights: ROLE_RIGHTS.payerBulk });
      roleA = await becomeReviewer(suiteRoles, roleHolder, { label: 'payer one', rights: ROLE_RIGHTS.payerOne });
      expect(roleA.rights).not.toContain(allKey('Payer'));
    });

    await steps.step('Navigate to the Role Management module - Role A lacks the bulk permission and Role B has it', async () => {
      const a = await readRoleOnScreen(roleAdmin, roleA);
      const b = await readRoleOnScreen(roleAdmin, roleB);
      const diffA = treeMismatch(treePicture(a.rows, [allKey('Payer')]), picture([[allKey('Payer'), ACTION_LABEL.all, 'unchecked']]));
      const diffB = treeMismatch(treePicture(b.rows, [allKey('Payer')]), picture([[allKey('Payer'), ACTION_LABEL.all, 'checked']]));
      expect([diffA && `Role A: ${diffA}`, diffB && `Role B: ${diffB}`].filter(Boolean).join(' | '), TREE_DIFF).toBe('');
    });

    await steps.step('Log in as a user with Role A and open the Payer tab - rows show only Review and Approve, no bulk controls', async () => {
      await view().openTab();
      const rowId = await view().findRow(req.name);
      await expect(view().bulkButton('approve')).toHaveCount(0);
      expect({ row: await view().rowActions(rowId), approveAll: await view().bulkState('approve'), rejectAll: await view().bulkState('reject') })
        .toEqual({ row: [...ROW_ACTIONS.oneAtATime], approveAll: 'absent', rejectAll: 'absent' });
    });

    await steps.step('Log out and log in as a user with Role B, open the Payer tab - rows show Review, Reject and Approve, and Approve All / Reject All appear', async () => {
      await roleHolder.reshape({ role: roleB });
      await roleHolder.signInAgain();
      await view().openTab();
      const rowId = await view().findRow(req.name);
      await expect(view().bulkButton('approve')).toBeVisible();
      expect({ row: await view().rowActions(rowId), approveAll: await view().bulkState('approve'), rejectAll: await view().bulkState('reject') })
        .toEqual({ row: [...ROW_ACTIONS.bulk], approveAll: 'available', rejectAll: 'available' });
    });
  });

  test(`TC-${CASES.rejectInDrawer.azureId}: should offer Reject only inside the Review drawer in one-at-a-time mode`, async ({ steps, suiteRoles, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let role!: SuiteRole;
    let req!: MadeRequest;
    let rowId = '';
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'plan');

    await steps.critical('Precondition: a pending Plan change; the reviewer holds the Plan tab one-at-a-time Approve/Reject (no bulk)', async () => {
      req = await makeRequest('plan', page, page, suiteApprovals);
      role = await becomeReviewer(suiteRoles, roleHolder, { label: 'plan one', rights: ROLE_RIGHTS.planOne });
      expect(role.rights).not.toContain(allKey('Plan'));
    });

    await steps.step('Navigate to the Role Management module - only the one-at-a-time permission is enabled', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(treeMismatch(treePicture(seen.rows, [oneKey('Plan'), allKey('Plan')]), picture([
        [oneKey('Plan'), ACTION_LABEL.one, 'checked'],
        [allKey('Plan'), ACTION_LABEL.all, 'unchecked'],
      ])), TREE_DIFF).toBe('');
    });

    await steps.critical('Log in as the reviewer and open the Plan tab - each row shows only Review and Approve', async () => {
      await view().openTab();
      rowId = await view().findRow(req.name);
      expect(rowId, `"${req.name}" on the reviewer's Plan tab`).not.toBe('');
      expect(await view().rowActions(rowId)).toEqual([...ROW_ACTIONS.oneAtATime]);
    });

    await steps.step('Confirm no Reject option is visible on the row - the row-level Reject is absent', async () => {
      await expect(view().rowAction(rowId, 'reject')).toHaveCount(0);
    });

    await steps.critical('Click Review on the request - the Review drawer shows the details with Approve and Reject', async () => {
      const review = await view().openReview(rowId);
      await expect(view().reviewButton('reject')).toBeVisible();
      expect(review.buttons).toEqual(expect.arrayContaining(['approve', 'reject']));
    });

    await steps.step('Click Reject inside the drawer - a confirmation prompt appears, and confirming it rejects the request', async () => {
      const prompt = await openPrompt(roleHolder.page, view().reviewButton('reject'));
      expect(prompt.dialogShown, `no prompt after Reject in the drawer (toast "${prompt.toast}")`).toBe(true);
      const out = await confirmPrompt(roleHolder.page, 'reject', REJECT_REASON);
      const statuses = await waitLeftPending(page, 'Plan', req.name);
      expect(statuses.some((s) => STATUS.rejected.test(s)), `statuses of "${req.name}": ${statuses.join(', ')}; answers: ${out.answers.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.bulkControls.azureId}: should show Review, Reject and Approve on every row plus enabled Approve All and Reject All to a bulk-enabled reviewer`, async ({ steps, suiteRoles, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let role!: SuiteRole;
    let reqs: MadeRequest[] = [];
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'policy');

    await steps.critical('Precondition: several pending Policy requests; the reviewer holds the Policy bulk Approve/Reject all', async () => {
      reqs = [await makeRequest('policy', page, page, suiteApprovals), await makeRequest('policy', page, page, suiteApprovals)];
      role = await becomeReviewer(suiteRoles, roleHolder, { label: 'policy bulk', rights: ROLE_RIGHTS.policyBulk });
      expect(role.rights).toContain(allKey('Policy'));
    });

    await steps.step('Navigate to the Role Management module - the bulk permission is enabled for Policy', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(treeMismatch(treePicture(seen.rows, [allKey('Policy')]), picture([[allKey('Policy'), ACTION_LABEL.all, 'checked']])), TREE_DIFF).toBe('');
    });

    await steps.step('Log in as the reviewer and open the Policy tab - the pending requests are listed', async () => {
      await view().openTab();
      const queue = await listApprovals(roleHolder.page, 'Policy');
      await expect(view().section()).toBeVisible();
      expect(reqs.map((r) => queue.items.some((i) => i.entityNameEn === r.name))).toEqual(reqs.map(() => true));
    });

    await steps.step('Inspect each row - every row shows Review, Reject and Approve', async () => {
      const actions: Record<string, string[]> = {};
      for (const r of reqs) actions[r.name] = await view().rowActions(await view().findRow(r.name));
      await expect(view().section()).toBeVisible();
      expect(actions).toEqual(Object.fromEntries(reqs.map((r) => [r.name, [...ROW_ACTIONS.bulk]])));
    });

    await steps.step('Inspect the area above the list - Approve All and Reject All are present and enabled (not pressed)', async () => {
      await expect(view().bulkButton('approve')).toBeEnabled();
      await expect(view().bulkButton('reject')).toBeEnabled();
    });
  });

  test(`TC-${CASES.approveThenReject.azureId}: should move an approved and a rejected request out of the pending queue with their final statuses`, async ({ steps, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let first!: MadeRequest;
    let second!: MadeRequest;
    let rowFirst = '';
    let rowSecond = '';
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'network');
    const fullReviewer = PREDEFINED_ROLES.organizationAdministrator;

    await steps.critical(`Precondition: two pending Network requests from another submitter; the reviewer holds full Network approval rights ("${FULL_REVIEWER}")`, async () => {
      first = await makeRequest('network', page, page, suiteApprovals);
      second = await makeRequest('network', page, page, suiteApprovals);
      await roleHolder.become({ role: FULL_REVIEWER });
      expect((await roleHolder.currentGrants()).map((g) => g.name)).toEqual([FULL_REVIEWER]);
    });

    await steps.step('Navigate to the Role Management module - the reviewer\'s permissions are confirmed', async () => {
      const seen = await readRoleOnScreen(roleAdmin, { id: fullReviewer.id, name: fullReviewer.en });
      expect(seen.listed).toBe(true);
      expect(treeMismatch(statesOf(seen.rows, [oneKey('Network'), allKey('Network')]), { [oneKey('Network')]: 'checked', [allKey('Network')]: 'checked' }), TREE_DIFF).toBe('');
    });

    await steps.critical('Open Approval Management > Network tab - both requests are listed as Pending', async () => {
      await view().openTab();
      rowFirst = await view().findRow(first.name);
      rowSecond = await view().findRow(second.name);
      const statuses = [...(await requestStatuses(roleHolder.page, 'Network', first.name)), ...(await requestStatuses(roleHolder.page, 'Network', second.name))];
      expect({ first: rowFirst !== '', second: rowSecond !== '', statuses }).toEqual({ first: true, second: true, statuses: [STATUS.pending, STATUS.pending] });
    });

    await steps.step('Approve the first request and confirm - it is Approved and removed from the pending list', async () => {
      rowFirst = await view().findRow(first.name);
      await openPrompt(roleHolder.page, view().rowAction(rowFirst, 'approve'));
      const out = await confirmPrompt(roleHolder.page, 'approve');
      const statuses = await waitLeftPending(page, 'Network', first.name);
      expect(await view().findRow(first.name)).toBe('');
      expect(statuses.some((s) => STATUS.approved.test(s)), `statuses: ${statuses.join(', ')}; answers: ${out.answers.join(' | ')}`).toBe(true);
    });

    await steps.step('Reject the second request and confirm - it is Rejected and removed from the pending list', async () => {
      rowSecond = await view().findRow(second.name);
      await openPrompt(roleHolder.page, view().rowAction(rowSecond, 'reject'));
      const out = await confirmPrompt(roleHolder.page, 'reject', REJECT_REASON);
      const statuses = await waitLeftPending(page, 'Network', second.name);
      expect(await view().findRow(second.name)).toBe('');
      expect(statuses.some((s) => STATUS.rejected.test(s)), `statuses: ${statuses.join(', ')}; answers: ${out.answers.join(' | ')}`).toBe(true);
    });

    await steps.step('View the history / status list of Network requests - both appear with their final Approved and Rejected statuses', async () => {
      const history = await listApprovals(roleHolder.page, 'Network', null);
      const of = (name: string): string => history.items.filter((i) => i.entityNameEn === name).map((i) => i.status).join(', ');
      await expect(view().section()).toBeVisible();
      expect({ first: STATUS.approved.test(of(first.name)), second: STATUS.rejected.test(of(second.name)) }, `first "${of(first.name)}", second "${of(second.name)}"`).toEqual({ first: true, second: true });
    });
  });
});
