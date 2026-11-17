import {
  test,
  expect,
  ApprovalTabView,
  asSession,
  becomeReviewer,
  confirmIfShown,
  confirmPrompt,
  ensurePolicyPlan,
  listApprovals,
  makeRequest,
  openBulkDialog,
  openPrompt,
  picture,
  readRoleOnScreen,
  requestStatuses,
  requireData,
  requireSuiteOnly,
  treeMismatch,
  treePicture,
  valueOf,
  waitLeftPending,
  type MadeRequest,
} from '../../../utils/role/writerFHelpers';
import type { SuitePayer, SuiteRole } from '../../../fixtures/roleModule.fixture';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import { currentRolesAndPermissions } from '../../../utils/role/roleApi';
import {
  ACTION_LABEL,
  ADMIN_SELF_APPROVAL_PRECONDITION,
  CASES,
  FOUR_EYES_MESSAGE,
  FULL_REVIEWER,
  OWN_REQUEST_MESSAGE,
  REJECT_REASON,
  ROLE_RIGHTS,
  SCOPED_BULK_REVIEWER,
  SEVERAL_OTHERS,
  STATUS,
  TREE_DIFF,
  VIEW_LABEL,
  YES_NO,
  allKey,
} from '../../../data/role/configureApprovalManagementPermissions.data';

/**
 * US 21301 - Configure Approval Management Permissions: a reviewer and its OWN requests - the explanatory
 * message, self-approval allowed by one of its roles, the System Administrator, bulk Approve All / Reject All
 * skipping own requests (SAFETY: the reviewer is scoped to one suite payer and every row is checked to be a
 * suite request before a bulk button is pressed), and the four-eyes refusal. Decisions:
 * data/role/configureApprovalManagementPermissions.data.ts.
 */
test.describe('US 21301 - Configure Approval Management Permissions (own requests)', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.ownRequestMessage.azureId}: should show the explanatory message instead of Approve / Reject on the reviewer's own request`, async ({ steps, suitePayers, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let own!: MadeRequest;
    let rowId = '';
    let review: Awaited<ReturnType<ApprovalTabView['openReview']>> = { buttons: [], text: '' };
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'payer');
    const reviewer = PREDEFINED_ROLES.organizationAdministrator;

    await steps.critical(`Precondition: the reviewer ("${FULL_REVIEWER}": full Payer approval rights, self-approval disabled) has submitted a Payer change itself`, async () => {
      const payer = await suitePayers.publish();
      await roleHolder.become({ role: FULL_REVIEWER });
      own = await makeRequest('payer', roleHolder.page, page, suiteApprovals, { payerName: payer.name });
      expect(own.requestId).not.toBe('');
    });

    await steps.step('Navigate to the Role Management module - "Can a User Approve Their Own Requests?" is disabled for the role', async () => {
      const seen = await readRoleOnScreen(roleAdmin, { id: reviewer.id, name: reviewer.en });
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.selfApproval)).toBe(YES_NO.no);
    });

    await steps.critical('Log in as the reviewer and open Approval Management > Payer tab - the reviewer\'s own submission is listed', async () => {
      await view().openTab();
      rowId = await view().findRow(own.name);
      expect(rowId, `the own request "${own.name}" on the reviewer's Payer tab`).not.toBe('');
    });

    await steps.critical('Open the reviewer\'s own request via Review - the Review drawer shows the request details', async () => {
      review = await view().openReview(rowId);
      await expect(view().reviewTitle()).toBeVisible();
      expect(review.text).toContain(own.name);
    });

    await steps.step(`Check for Approve / Reject on the own request - not shown; "${OWN_REQUEST_MESSAGE}" is displayed`, async () => {
      await expect(view().reviewButton('approve')).toHaveCount(0);
      expect({ buttons: review.buttons.filter((b) => b !== 'close'), message: review.text.includes(OWN_REQUEST_MESSAGE) }, `the Review drawer read: "${review.text.slice(0, 300)}"`).toEqual({ buttons: [], message: true });
    });
  });

  test(`TC-${CASES.selfApproveAllowed.azureId}: should let a reviewer approve its own request when one of its roles allows approving own requests`, async ({ steps, suiteRoles, suitePayers, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let role!: SuiteRole;
    let own!: MadeRequest;
    let rowId = '';
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'payer');

    await steps.critical('Precondition: the reviewer holds a role with full Payer approval rights and "Can a User Approve Their Own Requests?" enabled, and has submitted a Payer change itself', async () => {
      const payer = await suitePayers.publish();
      role = await becomeReviewer(suiteRoles, roleHolder, { label: 'self approve', rights: ROLE_RIGHTS.payerSelfApprove, canApproveOwnRequests: true, alongside: [FULL_REVIEWER] });
      own = await makeRequest('payer', roleHolder.page, page, suiteApprovals, { payerName: payer.name });
      expect(role.record.canApproveOwnRequests).toBe(true);
    });

    await steps.step('Navigate to the Role Management module - "Can a User Approve Their Own Requests?" is enabled for the role', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.selfApproval)).toBe(YES_NO.yes);
    });

    await steps.critical('Log in as the reviewer and open the Payer tab - the own pending request offers Review and Approve', async () => {
      await view().openTab();
      rowId = await view().findRow(own.name);
      expect(rowId, `the own request "${own.name}"`).not.toBe('');
      expect(await view().rowActions(rowId)).toEqual(expect.arrayContaining(['approve', 'review']));
    });

    await steps.critical('Click Approve on the own request - a confirmation prompt appears', async () => {
      const prompt = await openPrompt(roleHolder.page, view().rowAction(rowId, 'approve'));
      expect(prompt.dialogShown, `no prompt after Approve (toast "${prompt.toast}")`).toBe(true);
    });

    await steps.step('Confirm the approval - the request turns Approved and leaves the pending list', async () => {
      const out = await confirmPrompt(roleHolder.page, 'approve');
      const statuses = await waitLeftPending(page, 'Payer', own.name);
      expect(statuses.some((s) => STATUS.approved.test(s)), `statuses of "${own.name}": ${statuses.join(', ')}; answers: ${out.answers.join(' | ')}; toast "${out.toast}"`).toBe(true);
    });
  });

  test(`TC-${CASES.adminSelfApprove.azureId}: should let the System Administrator approve its own submission`, async ({ steps, suiteApprovals, roleAdmin, page }, testInfo) => {
    let own!: MadeRequest;
    let rowId = '';
    const view = (): ApprovalTabView => new ApprovalTabView(page, 'network');

    await steps.critical('Precondition: the System Administrator (careconnect) has submitted a Network change', async () => {
      own = await makeRequest('network', page, page, suiteApprovals);
      testInfo.annotations.push({ type: 'note', description: ADMIN_SELF_APPROVAL_PRECONDITION.note });
      expect(ADMIN_SELF_APPROVAL_PRECONDITION.met).toBe(false);
    });

    await steps.step('Navigate to the Role Management module - it loads; the user is the System Administrator', async () => {
      const answer = await roleAdmin.open();
      const me = await currentRolesAndPermissions(page);
      expect(answer.status).toBe(200);
      expect(answer.items.some((r) => me.roles.includes(r.name)), `the administrator's own role (${me.roles.join(', ')}) is not among the listed roles`).toBe(false);
    });

    await steps.critical('Open Approval Management > Network tab as the System Administrator - the own pending request offers Review and Approve', async () => {
      await view().openTab();
      rowId = await view().findRow(own.name);
      expect(rowId, `the own request "${own.name}"`).not.toBe('');
      expect(await view().rowActions(rowId)).toEqual(expect.arrayContaining(['approve', 'review']));
    });

    await steps.critical('Click Approve on the own request - a confirmation prompt appears', async () => {
      const prompt = await openPrompt(page, view().rowAction(rowId, 'approve'));
      expect(prompt.dialogShown, `no prompt after Approve (toast "${prompt.toast}")`).toBe(true);
    });

    await steps.step('Confirm the approval - the request turns Approved', async () => {
      const out = await confirmPrompt(page, 'approve');
      const statuses = await waitLeftPending(page, 'Network', own.name);
      expect(statuses.some((s) => STATUS.approved.test(s)), `statuses of "${own.name}": ${statuses.join(', ')}; answers: ${out.answers.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.approveAllSkipsOwn.azureId}: should skip the reviewer's own requests in Approve All, from none eligible up to several`, async ({ steps, suitePayers, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let payer!: SuitePayer;
    let own!: MadeRequest;
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'plan');
    const reviewer = PREDEFINED_ROLES.payerAdministrator;
    const approveAllOn = async (others: MadeRequest[]): Promise<{ after: Record<string, boolean>; expected: Record<string, boolean>; note: string }> => {
      await view().openTab();
      const queue = await listApprovals(roleHolder.page, 'Plan');
      requireSuiteOnly(steps, queue.items.map((i) => i.entityNameEn), `the Plan queue of the reviewer scoped to "${payer.name}"`);
      const dialog = await openBulkDialog(view(), 'approve');
      expect(dialog.refusedBecause, 'SAFETY: the Approve All dialog').toBe('');
      expect(dialog.buttonState, 'Approve All above the Plan list').toBe('available');
      expect(dialog.dialogShown, `no confirmation after Approve All (toast "${dialog.toast}")`).toBe(true);
      const out = await confirmPrompt(roleHolder.page, 'approve');
      const after: Record<string, boolean> = {};
      for (const r of others) after[r.name] = (await waitLeftPending(page, 'Plan', r.name)).some((s) => STATUS.approved.test(s));
      after[own.name] = (await requestStatuses(page, 'Plan', own.name)).includes(STATUS.pending);
      return { after, expected: Object.fromEntries([...others.map((r) => [r.name, true]), [own.name, true]]), note: `after Approve All (dialog "${dialog.title}" listing ${dialog.items.join(' | ')}; answers ${out.answers.join(' | ')}; toast "${out.toast}")` };
    };

    await steps.critical(`Precondition: the reviewer ("${SCOPED_BULK_REVIEWER}" scoped to one suite payer: Plan bulk, self-approval disabled) has submitted a Plan change itself`, async () => {
      [payer] = await suitePayers.existing(1);
      await roleHolder.become({ role: SCOPED_BULK_REVIEWER, payerIds: [payer.id] });
      own = await makeRequest('plan', roleHolder.page, page, suiteApprovals, { payerName: payer.name, noFormulary: true });
      expect(own.requestId).not.toBe('');
    });

    await steps.step('Navigate to the Role Management module - bulk Approve is enabled and self-approval is disabled', async () => {
      const seen = await readRoleOnScreen(roleAdmin, { id: reviewer.id, name: reviewer.en });
      expect(valueOf(seen.values, VIEW_LABEL.selfApproval), '"Can a user approve their own requests?" on View Role').toBe(YES_NO.no);
      expect(treeMismatch(treePicture(seen.rows, [allKey('Plan')]), picture([[allKey('Plan'), ACTION_LABEL.all, 'checked']])), TREE_DIFF).toBe('');
    });

    await steps.step('Open the Plan tab where the list holds only the reviewer\'s own requests and click Approve All - zero requests are processed and a message says so', async () => {
      await view().openTab();
      const queue = await listApprovals(roleHolder.page, 'Plan');
      requireSuiteOnly(steps, queue.items.map((i) => i.entityNameEn), `the Plan queue of the reviewer scoped to "${payer.name}"`);
      requireData(steps, queue.items.every((i) => i.requestedBy === roleHolder.id), `the reviewer's Plan queue also holds other submitters' requests (${queue.items.filter((i) => i.requestedBy !== roleHolder.id).map((i) => i.entityNameEn).join(', ')}) - "only own requests" cannot be shown`);
      const dialog = await openBulkDialog(view(), 'approve');
      expect(dialog.refusedBecause, 'SAFETY: the Approve All dialog').toBe('');
      expect(dialog.buttonState, 'Approve All above a Plan list holding only the reviewer\'s own requests (the case clicks it)').toBe('available');
      const out = await confirmIfShown(roleHolder.page, dialog, 'approve');
      const said = [dialog.title, dialog.message, dialog.toast, out.toast].filter(Boolean).join(' / ');
      expect({ ownPending: (await requestStatuses(page, 'Plan', own.name)).includes(STATUS.pending), approved: out.answers.filter((a) => / 2\d\d /.test(a)).length },
        `Approve All with only own requests: "${said}"`).toEqual({ ownPending: true, approved: 0 });
      expect(said, 'a message about no eligible requests').not.toBe('');
    });

    await steps.step('Add one request from another submitter and click Approve All - only that request is approved; the own requests stay pending', async () => {
      const other = await makeRequest('plan', page, page, suiteApprovals, { payerName: payer.name });
      const seen = await approveAllOn([other]);
      expect(seen.after, seen.note).toEqual(seen.expected);
    });

    await steps.step(`Add ${SEVERAL_OTHERS} more requests from another submitter and click Approve All - all of them are approved; the own requests stay untouched`, async () => {
      const others: MadeRequest[] = [];
      for (let i = 0; i < SEVERAL_OTHERS; i += 1) others.push(await makeRequest('plan', page, page, suiteApprovals, { payerName: payer.name }));
      const seen = await approveAllOn(others);
      expect(seen.after, seen.note).toEqual(seen.expected);
    });
  });

  test(`TC-${CASES.rejectAllSkipsOwn.azureId}: should skip the reviewer's own request in Reject All`, async ({ steps, suitePayers, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let payer!: SuitePayer;
    let own!: MadeRequest;
    let others: MadeRequest[] = [];
    let listed: string[] = [];
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'policy');
    const reviewer = PREDEFINED_ROLES.payerAdministrator;

    await steps.critical(`Precondition: the reviewer ("${SCOPED_BULK_REVIEWER}" scoped to one suite payer: Policy bulk, self-approval disabled) has submitted a Policy change; two other Policy requests are pending`, async () => {
      [payer] = await suitePayers.existing(1);
      await ensurePolicyPlan(page, payer.name);
      await roleHolder.become({ role: SCOPED_BULK_REVIEWER, payerIds: [payer.id] });
      own = await makeRequest('policy', roleHolder.page, page, suiteApprovals, { payerName: payer.name });
      others = [await makeRequest('policy', page, page, suiteApprovals, { payerName: payer.name }), await makeRequest('policy', page, page, suiteApprovals, { payerName: payer.name })];
      expect(others.length).toBe(2);
    });

    await steps.step('Navigate to the Role Management module - the bulk Reject permission is enabled', async () => {
      const seen = await readRoleOnScreen(roleAdmin, { id: reviewer.id, name: reviewer.en });
      expect(valueOf(seen.values, VIEW_LABEL.selfApproval), '"Can a user approve their own requests?" on View Role').toBe(YES_NO.no);
      expect(treeMismatch(treePicture(seen.rows, [allKey('Policy')]), picture([[allKey('Policy'), ACTION_LABEL.all, 'checked']])), TREE_DIFF).toBe('');
    });

    await steps.critical('Open Approval Management > Policy tab - the own and the other users\' pending requests are shown', async () => {
      await view().openTab();
      const queue = await listApprovals(roleHolder.page, 'Policy');
      listed = queue.items.map((i) => i.entityNameEn);
      await expect(view().section()).toBeVisible();
      expect([own, ...others].map((r) => listed.includes(r.name))).toEqual([true, true, true]);
    });

    await steps.critical('Click Reject All - a confirmation prompt lists the requests that will be rejected', async () => {
      requireSuiteOnly(steps, listed, `the Policy queue of the reviewer scoped to "${payer.name}"`);
      const dialog = await openBulkDialog(view(), 'reject');
      expect(dialog.refusedBecause, 'SAFETY: the Reject All dialog').toBe('');
      expect(dialog.dialogShown, `no prompt after Reject All (${dialog.title} ${dialog.toast})`).toBe(true);
      expect({ others: others.every((r) => dialog.items.some((t) => t.includes(r.name))), own: dialog.items.some((t) => t.includes(own.name)) }, `the prompt listed: ${dialog.items.join(' | ')}`).toEqual({ others: true, own: false });
    });

    await steps.step('Confirm the rejection - only the other users\' requests are rejected; the own request stays pending', async () => {
      const out = await confirmPrompt(roleHolder.page, 'reject', REJECT_REASON);
      const after: Record<string, boolean> = {};
      for (const r of others) after[r.name] = (await waitLeftPending(page, 'Policy', r.name)).some((s) => STATUS.rejected.test(s));
      after[own.name] = (await requestStatuses(page, 'Policy', own.name)).includes(STATUS.pending);
      expect(after, `after Reject All (answers ${out.answers.join(' | ')}; toast "${out.toast}")`).toEqual(Object.fromEntries([...others.map((r) => [r.name, true]), [own.name, true]]));
    });
  });

  test(`TC-${CASES.fourEyes.azureId}: should refuse a forced approval of the reviewer's own request with the four-eyes message`, async ({ steps, suiteApprovals, roleHolder, roleAdmin, page }) => {
    let own!: MadeRequest;
    let rowId = '';
    let forced: Awaited<ReturnType<typeof asSession>> = { status: 0, text: '', items: [], totalRows: 0, message: '' };
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'formulary');
    const reviewer = PREDEFINED_ROLES.organizationAdministrator;

    await steps.critical(`Precondition: self-approval disabled ("${FULL_REVIEWER}"); the reviewer has submitted a Formulary change itself`, async () => {
      await roleHolder.become({ role: FULL_REVIEWER });
      own = await makeRequest('formulary', roleHolder.page, page, suiteApprovals);
      expect(own.requestId).not.toBe('');
    });

    await steps.step('Navigate to the Role Management module - self-approval is disabled for the role', async () => {
      const seen = await readRoleOnScreen(roleAdmin, { id: reviewer.id, name: reviewer.en });
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.selfApproval)).toBe(YES_NO.no);
    });

    await steps.step('Open Approval Management > Formulary tab and locate the own pending request - it is listed without Approve / Reject', async () => {
      await view().openTab();
      rowId = await view().findRow(own.name);
      await expect(view().rowAction(rowId, 'approve')).toHaveCount(0);
      expect({ found: rowId !== '', approve: await view().rowActionState(rowId, 'approve'), reject: await view().rowActionState(rowId, 'reject') }).toEqual({ found: true, approve: 'absent', reject: 'absent' });
    });

    await steps.step('Trigger the approve action on the own request (replayed approve call) - the system rejects it', async () => {
      forced = await asSession(roleHolder.page, 'POST', ApiEndpoints.approvalApprove, { id: own.requestId });
      await expect(view().section()).toBeVisible();
      expect(forced.status, `ApproveRequest on the own request answered ${forced.status} "${forced.message}"`).toBeGreaterThanOrEqual(400);
    });

    await steps.step(`Observe the response - "${FOUR_EYES_MESSAGE}" and the request remains Pending`, async () => {
      const statuses = await requestStatuses(page, 'Formulary', own.name);
      await expect(view().section()).toBeVisible();
      expect({ message: forced.message.includes(FOUR_EYES_MESSAGE), pending: statuses.includes(STATUS.pending) }, `the answer said "${forced.message}"; statuses ${statuses.join(', ')}`).toEqual({ message: true, pending: true });
    });
  });
});
