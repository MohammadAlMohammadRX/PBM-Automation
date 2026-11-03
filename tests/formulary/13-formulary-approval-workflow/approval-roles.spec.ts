import { test, expect, decisionOfferedTo, type FormularySession } from '../../../utils/formulary/writerCHelpers';
import { ADMIN_NAME, AUTH_ERROR_STATUSES, CASES, SCOPED_PAYER } from '../../../data/formulary/approvalWorkflow.data';
import { readVersions } from '../../../utils/FormularyProvisioning';

/**
 * User story 15205: Formulary Approval Workflow - who may decide.
 * The Payer Admin account holds no approval right. Shaped with the formulary
 * rights (fixture `formularyRole`) it submits its own change (the submitter
 * without the approval permission), or only views (the Read-Only Viewer); the
 * administrator - who did not submit - is the independent reviewer. The
 * formularies belong to a payer in the Payer Admin's scope, so only the
 * permission can explain what it is offered.
 */
test.describe('US 15205 - Formulary Approval Workflow - roles', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.selfApproveWithoutRight.azureId}: should keep a submitter without the approval permission from approving their own change`, async ({
    page,
    formularyApprovalsPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      session = await formularyRole.signIn(CASES.selfApproveWithoutRight.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Precondition: the same user sends the formulary for approval', async () => {
      await session.detail.open(formulary.id);
      const sent = await session.detail.sendForApproval();
      expect(sent.status, sent.text.slice(0, 200)).toBe(200);
    });

    await steps.critical('Open the change request the current user submitted - it shows Pending Approval', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getVersionBadge()).toMatch(/Pending Approval/);
    });

    await steps.step('Attempt to click Approve - the Approve control is disabled or hidden for the submitter', async () => {
      const offered = await decisionOfferedTo(session.approvals, formulary.nameEn);
      expect(offered.approve, `approvals hub offers the formulary tab: ${offered.tab}`).toBe(false);
    });

    await steps.step('Attempt the approval directly - it is rejected and the status stays Pending Approval', async () => {
      await formularyApprovalsPage.open();
      const requestId = await formularyApprovalsPage.getPendingRequestId(formulary.nameEn);
      const answer = await session.approvals.approveRequestViaApi(requestId);
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect((await readVersions(page, formulary.id)).some((v) => v.versionStatusCode === 'pendingApproval')).toBe(true);
    });
  });

  test(`TC-${CASES.independentReviewer.azureId}: should let a different reviewer with the approval permission approve the submitted change`, async ({
    page,
    formularyManagementPage,
    formularyApprovalsPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });

    await steps.critical('Precondition: User A (the Payer Admin) sends the formulary for approval', async () => {
      const userA = await formularyRole.signIn(CASES.independentReviewer.shape);
      await requireFormularyListAccess(userA);
      await userA.detail.open(formulary.id);
      expect((await userA.detail.sendForApproval()).status).toBe(200);
    });

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Log in as User B and open the request submitted by User A - it shows Pending Approval and submitter User A', async () => {
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.expectInQueue(formulary.nameEn);
      const pending = (await readVersions(page, formulary.id)).find((v) => v.versionStatusCode === 'pendingApproval');
      expect(pending, 'a Pending Approval version').toBeDefined();
      expect(pending?.requestedByNameEn ?? '', 'submitted by User A, not by the reviewer').not.toBe(ADMIN_NAME);
    });

    await steps.step('Click Approve and confirm - the status is Approved with User B recorded as approver', async () => {
      await formularyApprovalsPage.approve(formulary.nameEn);
      const approved = (await readVersions(page, formulary.id)).find((v) => v.versionStatusCode === 'published');
      expect(approved?.reviewedByNameEn).toBe(ADMIN_NAME);
      expect(approved?.requestedByNameEn, 'two different actors').not.toBe(approved?.reviewedByNameEn);
    });
  });

  test(`TC-${CASES.readOnlyViewer.azureId}: should offer no approve or reject control and change nothing when a user without approval rights opens a pending request`, async ({
    page,
    formularyApprovalsPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval', { payerName: SCOPED_PAYER });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      session = await formularyRole.signIn(CASES.readOnlyViewer.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Log in as the Read-Only Viewer and open the pending request - it loads in read-only mode', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getVersionBadge()).toMatch(/Pending Approval/);
      const actions = await session.detail.readActionStates();
      const usable = Object.entries(actions).filter(([, state]) => state.availability === 'available').map(([key]) => key);
      expect(usable, 'changing actions offered to a read-only user').toEqual([]);
    });

    await steps.step('Check for the Approve and Reject controls - they are not displayed or disabled', async () => {
      const offered = await decisionOfferedTo(session.approvals, formulary.nameEn);
      expect({ approve: offered.approve, reject: offered.reject }).toEqual({ approve: false, reject: false });
    });

    await steps.step('Attempt the approve / reject through any route - unavailable and no status change', async () => {
      await formularyApprovalsPage.open();
      const requestId = await formularyApprovalsPage.getPendingRequestId(formulary.nameEn);
      const approve = await session.approvals.approveRequestViaApi(requestId);
      const reject = await session.approvals.rejectRequestViaApi(requestId, 'Rejected by a read-only user');
      expect([approve.status, reject.status].filter((s) => s < 400), 'decisions accepted').toEqual([]);
      expect((await readVersions(page, formulary.id)).some((v) => v.versionStatusCode === 'pendingApproval')).toBe(true);
    });
  });

  test(`TC-${CASES.alternateRoute.azureId}: should refuse with an authorization error when the submitter approves or rejects their own request through a direct route`, async ({
    page,
    formularyApprovalsPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;
    let requestId = '';

    await steps.critical('Precondition: the submitter without the approval permission sends the formulary for approval', async () => {
      session = await formularyRole.signIn(CASES.alternateRoute.shape);
      await requireFormularyListAccess(session);
      await session.detail.open(formulary.id);
      expect((await session.detail.sendForApproval()).status).toBe(200);
      await formularyApprovalsPage.open();
      requestId = await formularyApprovalsPage.getPendingRequestId(formulary.nameEn);
    });

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('As the submitter, approve through a direct link to the approval action - blocked with an authorization error', async () => {
      const answer = await session.approvals.approveRequestViaApi(requestId);
      expect(AUTH_ERROR_STATUSES as readonly number[], `answered ${answer.status}: ${answer.text.slice(0, 200)}`).toContain(answer.status);
    });

    await steps.step('Reject the same request through the same route - blocked with an authorization error', async () => {
      const answer = await session.approvals.rejectRequestViaApi(requestId, 'Self-rejection through a direct route');
      expect(AUTH_ERROR_STATUSES as readonly number[], `answered ${answer.status}: ${answer.text.slice(0, 200)}`).toContain(answer.status);
      expect((await readVersions(page, formulary.id)).some((v) => v.versionStatusCode === 'pendingApproval'), 'still Pending Approval').toBe(true);
    });
  });
});
