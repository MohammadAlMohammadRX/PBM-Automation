import { test, expect, SCOPED_POLICY_PAYER, decisionOfferedTo, heldApprovalCodes, refused, type PolicySession } from '../../../utils/policy/writerCHelpers';
import { CASES } from '../../../data/policy/approvalWorkflow.data';
import { pendingPolicyRequestId, readPolicyVersions } from '../../../utils/PolicyProvisioning';

/**
 * User story 18434: Policy Approval Workflow - who may decide. The Payer Admin
 * account, given every policy right (fixture `policyRole`) and - where the case
 * needs a user WITHOUT the approval permission - its "Policy Approvals" rights
 * withheld (fixture `policyApprovalRight`), is the submitter / the user without
 * the permission; the administrator is the reviewer holding it. The policies
 * belong to a payer in the Payer Admin's scope.
 */
test.describe('US 18434 - Policy Approval Workflow - roles', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.selfApproveWithoutRight.azureId}: should keep a user without the approval permission from approving their own change`, async ({
    page,
    policyManagementPage,
    policyApprovalsPage,
    policyIn,
    policyRole,
    policyApprovalRight,
    requirePolicyListAccess,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Draft', { type: 'individual', payerName: SCOPED_POLICY_PAYER });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      await policyApprovalRight.withhold();
      session = await policyRole.signIn(CASES.selfApproveWithoutRight.shape);
      await requirePolicyListAccess(session);
      const held = await heldApprovalCodes(session.page);
      if (held.length > 0) testInfo.annotations.push({ type: 'permission-not-propagated', description: `the role no longer holds the Policy Approvals rights, yet the account is told it holds ${held.join(', ')}` });
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Precondition: the same user sends the policy for approval', async () => {
      await session.detail.open(policy.id);
      const sent = await session.detail.sendForApproval();
      expect(sent.status, sent.text.slice(0, 200)).toBe(200);
    });

    await steps.critical('Open the change request the logged-in user submitted - it shows Pending Approval', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getVersionBadge()).toMatch(/Pending Approval/);
    });

    await steps.step('Check the Approve button - it is disabled or hidden', async () => {
      const offered = await decisionOfferedTo(session.approvals, policy.nameEn);
      expect(offered.approve, `the hub offers the Policy tab: ${offered.tab}, the request: ${offered.inQueue}`).toBe(false);
    });

    await steps.step('Attempt the approval directly - the system blocks it with a permission-denied message', async () => {
      await policyApprovalsPage.open();
      const requestId = await pendingPolicyRequestId(page, policy.nameEn);
      expect(requestId).not.toBe('');
      const answer = await session.approvals.approveRequestViaApi(requestId);
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
    });

    await steps.step('Verify the request status - it is still Pending Approval', async () => {
      const versions = await readPolicyVersions(page, policy.id);
      expect(versions.some((v) => v.versionStatusCode === 'pendingApproval')).toBe(true);
      expect(versions.some((v) => v.versionStatusCode === 'published')).toBe(false);
    });
  });

  test(`TC-${CASES.approveOthers.azureId}: should let a reviewer with the approval permission approve a change submitted by another user`, async ({
    page,
    policyManagementPage,
    policyApprovalsPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const policy = await policyIn('Draft', { type: 'individual', payerName: SCOPED_POLICY_PAYER });
    // The submitter as the approval queue names it (2026-11-04): the version's
    // requestedBy is the DRAFT's author - the administrator who provisioned it - not
    // the user who sent it for approval, so comparing against it misread the case.
    let submitter = '';

    await steps.critical('Precondition: User A (the Payer Admin) sends the policy for approval', async () => {
      const userA = await policyRole.signIn(CASES.approveOthers.shape);
      await requirePolicyListAccess(userA);
      await userA.detail.open(policy.id);
      expect((await userA.detail.sendForApproval()).status).toBe(200);
    });

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the request submitted by another user - it shows Pending Approval and the original submitter\'s name', async () => {
      await policyApprovalsPage.open();
      const row = await policyApprovalsPage.readQueuedRow(policy.nameEn);
      expect(row.status).toMatch(/Pending/);
      expect(row.requestedby ?? '', 'the submitter').not.toBe('');
      submitter = (row.requestedby ?? '').trim();
    });

    await steps.critical('Click Approve - a confirmation prompt is displayed', async () => {
      const dialog = await policyApprovalsPage.openApproveDialog(policy.nameEn);
      expect(await dialog.isVisible()).toBe(true);
      await dialog.confirm('Approve');
    });

    await steps.step('Confirm the approval - the status is Approved and the reviewer is recorded as the approver', async () => {
      await policyApprovalsPage.waitForDecisionProcessed(policy.nameEn);
      const approved = (await readPolicyVersions(page, policy.id)).find((v) => v.versionStatusCode === 'published');
      expect(approved, 'an Approved version').toBeDefined();
      expect(approved!.reviewedByNameEn ?? '').not.toBe('');
      expect(approved!.reviewedByNameEn, 'reviewer differs from the submitter named in the approval queue').not.toBe(submitter);
    });
  });

  test(`TC-${CASES.noRightOthers.azureId}: should deny approval of another user's change to a user without the approval permission`, async ({
    page,
    policyManagementPage,
    policyApprovalsPage,
    policyIn,
    policyRole,
    policyApprovalRight,
    requirePolicyListAccess,
    steps,
  }) => {
    const policy = await policyIn('PendingApproval', { type: 'individual', payerName: SCOPED_POLICY_PAYER });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      await policyApprovalRight.withhold();
      session = await policyRole.signIn(CASES.noRightOthers.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the change request submitted by another user - it shows Pending Approval', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getVersionBadge()).toMatch(/Pending Approval/);
    });

    await steps.step('Check the Approve button - it is disabled or hidden', async () => {
      const offered = await decisionOfferedTo(session.approvals, policy.nameEn);
      expect(offered.approve, `the hub offers the Policy tab: ${offered.tab}, the request: ${offered.inQueue}`).toBe(false);
    });

    await steps.step('Attempt to approve the request - the system blocks it with a permission-denied message', async () => {
      await policyApprovalsPage.open();
      const requestId = await pendingPolicyRequestId(page, policy.nameEn);
      const answer = await session.approvals.approveRequestViaApi(requestId);
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      expect((await readPolicyVersions(page, policy.id)).some((v) => v.versionStatusCode === 'published'), 'not approved').toBe(false);
    });
  });

  test(`TC-${CASES.rolesAndStates.azureId}: should keep approval and rejection controls consistent across roles and request states`, async ({
    page,
    policyManagementPage,
    policyApprovalsPage,
    policyIn,
    policyRole,
    policyApprovalRight,
    requirePolicyListAccess,
    steps,
  }) => {
    const draft = await policyIn('Draft', { type: 'individual', payerName: SCOPED_POLICY_PAYER, networks: 0 });
    const pending = await policyIn('PendingApproval', { type: 'individual', payerName: SCOPED_POLICY_PAYER });
    const approved = await policyIn('Future', { type: 'individual', payerName: SCOPED_POLICY_PAYER });
    const rejected = await policyIn('Rejected', { type: 'individual', payerName: SCOPED_POLICY_PAYER });
    const findings: string[] = [];
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      await policyApprovalRight.withhold();
      session = await policyRole.signIn(CASES.rolesAndStates.shape);
      await requirePolicyListAccess(session);
      expect(await policyManagementPage.isListed(pending.nameEn)).toBe(true);
    });

    await steps.step('Explore requests in each status with each role - the Approve / Reject controls match the role\'s permission and the request\'s state', async () => {
      for (const [state, policy] of [['Draft', draft], ['Approved', approved], ['Rejected', rejected]] as const) {
        const admin = await policyApprovalsPage.getDecisionAvailability(policy.nameEn);
        if (admin.approve || admin.reject) findings.push(`administrator offered a decision on the ${state} request`);
      }
      const adminPending = await policyApprovalsPage.getDecisionAvailability(pending.nameEn);
      if (!adminPending.approve || !adminPending.reject) findings.push(`administrator not offered Approve / Reject on the pending request: ${JSON.stringify(adminPending)}`);
      for (const [state, policy] of [['Draft', draft], ['Pending Approval', pending], ['Approved', approved], ['Rejected', rejected]] as const) {
        const offered = await decisionOfferedTo(session.approvals, policy.nameEn);
        if (offered.approve || offered.reject) findings.push(`user without the approval permission offered a decision on the ${state} request`);
      }
      expect(findings).toEqual([]);
    });

    await steps.step('Try double-clicking Approve, browser back / forward and refreshing mid-action - no unauthorized or duplicate state change happens', async () => {
      await policyApprovalsPage.open();
      const dialog = await policyApprovalsPage.openApproveDialog(pending.nameEn);
      await dialog.confirmRepeatedly(2).catch(() => undefined);
      await policyApprovalsPage.waitForDecisionProcessed(pending.nameEn).catch(() => undefined);
      await page.goBack().catch(() => undefined);
      await page.goForward().catch(() => undefined);
      await page.reload();
      const versions = await readPolicyVersions(page, pending.id);
      const published = versions.filter((v) => v.versionStatusCode === 'published').length;
      if (published !== 1) findings.push(`the double-clicked request has ${published} approved versions`);
      if (await policyApprovalsPage.isInQueue(pending.nameEn)) findings.push('the double-clicked request is still pending');
      expect(findings).toEqual([]);
    });

    await steps.step('Record any inconsistent control, misleading message or unexpected status change - the findings are logged', async () => {
      await test.info().attach('approval-exploration-findings.txt', { body: findings.length ? findings.join('\n') : 'none', contentType: 'text/plain' });
      expect(findings, 'inconsistencies across roles and states').toEqual([]);
    });
  });
});
