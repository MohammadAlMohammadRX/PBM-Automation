import { test, expect } from '../../../fixtures';
import {
  AUDIT_ACTION,
  BYPASS_APPROVE_GATE,
  CASES,
  REQUEST_STATUS,
  REVIEWER_SHAPES,
  THREE_PERMISSIONS,
  WITHOUT_GENERAL_RIGHTS,
  newNetworkDescription,
} from '../../../data/role/preventSelfApprovalOfChangeRequests.data';
import {
  approveDirectly,
  attemptDecision,
  auditEvidence,
  decide,
  decisionOffered,
  describeAttempt,
  ensurePendingNetworkChange,
  networkAuditSince,
  networkLive,
  requireGate,
  submitNetworkChange,
  userDisplayName,
} from '../../../utils/role/writerEHelpers';

/**
 * US 21285 - Prevent Self-Approval of Change Requests: what a REVIEWER needs - the module tab, the tab's
 * Approve/Reject and the general ApproveRequest / RejectRequest (mapping in REVIEWER_SHAPES) - and what a decision
 * leaves behind. careconnect raises every request on networks the suite provisions; the reviewer is the role
 * holder (a reshaped suite role, or Organization Administrator). See data/role/preventSelfApprovalOfChangeRequests.data.ts.
 */
test.describe('US 21285 - Prevent Self-Approval of Change Requests', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.missingAnyPermission.azureId}: should let only a reviewer holding all three permissions process a request`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles, networkIn, suiteApprovals }) => {
    const network = await networkIn('Pending');
    suiteApprovals.track(network.name);
    const role = await suiteRoles.create({ label: CASES.missingAnyPermission.label, rights: REVIEWER_SHAPES.a });

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Precondition: a pending request exists (careconnect submits a change to "${network.name}")`, async () => {
      await submitNetworkChange(page, network, newNetworkDescription('22048'));
      expect(await suiteApprovals.pendingId(network.name)).not.toBe('');
    });

    await steps.step('Sign in as user (a) with only tab access and attempt to approve a pending request - the approve/reject action is unavailable or blocked', async () => {
      await roleHolder.become({ role });
      expect((await roleHolder.permissions()).permissions, 'user (a) holds the tab').toEqual(expect.arrayContaining([...THREE_PERMISSIONS.tab]));
      const attempt = await attemptDecision(roleHolder.page, page, 'network', network.name, 'approve');
      expect(attempt.decided, `user (a): ${describeAttempt(attempt)}`).toBe(false);
    });

    await steps.step('Sign in as user (b) with only action permission and attempt to approve - the action is unavailable or blocked', async () => {
      expect((await suiteRoles.setRights(role.id, REVIEWER_SHAPES.b)).status, 'UpdateRole to shape (b)').toBeLessThan(300);
      await ensurePendingNetworkChange(page, network, newNetworkDescription('22048-b'));
      const attempt = await attemptDecision(roleHolder.page, page, 'network', network.name, 'approve');
      expect(attempt.decided, `user (b): ${describeAttempt(attempt)}`).toBe(false);
    });

    await steps.step('Sign in as user (c) with only the general review permission and attempt to approve - the action is unavailable or blocked', async () => {
      expect((await suiteRoles.setRights(role.id, REVIEWER_SHAPES.c)).status, 'UpdateRole to shape (c)').toBeLessThan(300);
      await ensurePendingNetworkChange(page, network, newNetworkDescription('22048-c'));
      const attempt = await attemptDecision(roleHolder.page, page, 'network', network.name, 'approve');
      expect(attempt.decided, `user (c): ${describeAttempt(attempt)}`).toBe(false);
    });

    await steps.step('Sign in as user (d) with all three permissions and attempt to approve - the request is successfully approved', async () => {
      expect((await suiteRoles.setRights(role.id, REVIEWER_SHAPES.d)).status, 'UpdateRole to shape (d)').toBeLessThan(300);
      await ensurePendingNetworkChange(page, network, newNetworkDescription('22048-d'));
      const attempt = await attemptDecision(roleHolder.page, page, 'network', network.name, 'approve');
      expect(attempt.decided, `user (d): ${describeAttempt(attempt)}`).toBe(true);
      expect(attempt.statusAfter, `user (d): ${describeAttempt(attempt)}`).toBe(REQUEST_STATUS.approved);
    });
  });

  test(`TC-${CASES.approveAndReject.azureId}: should let a fully-permissioned reviewer both approve and reject change requests`, async ({ steps, page, roleAdmin, roleHolder, networkIn, suiteApprovals }) => {
    const first = await networkIn('Pending');
    const second = await networkIn('Pending');
    suiteApprovals.track(first.name);
    suiteApprovals.track(second.name);
    const change = { first: newNetworkDescription('22049-approve'), second: newNetworkDescription('22049-reject') };
    const before = { second: { currentVersion: 0, descriptionEn: '', hasPendingVersion: false } };

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Precondition: two pending requests (careconnect changes "${first.name}" and "${second.name}"); the reviewer is the holder as ${CASES.approveAndReject.reviewerRole}`, async () => {
      before.second = await networkLive(page, second.id);
      await submitNetworkChange(page, first, change.first);
      await submitNetworkChange(page, second, change.second);
      expect([await suiteApprovals.pendingId(first.name), await suiteApprovals.pendingId(second.name)].every(Boolean), 'both requests pending').toBe(true);
      await roleHolder.become({ role: CASES.approveAndReject.reviewerRole });
    });

    await steps.step('Sign in as the reviewer and open Approval Management, then approve one pending request - the request status becomes Approved and the underlying change is applied', async () => {
      const outcome = await decide(roleHolder.page, page, 'network', first.name, 'approve');
      const live = await networkLive(page, first.id);
      expect(outcome.statusAfter, `request ${outcome.requestId}`).toBe(REQUEST_STATUS.approved);
      expect({ descriptionEn: live.descriptionEn, hasPendingVersion: live.hasPendingVersion }, `"${first.name}" after approval (v${live.currentVersion})`).toEqual({ descriptionEn: change.first, hasPendingVersion: false });
    });

    await steps.step('Open a second pending request and reject it - the request status becomes Rejected and the underlying change is discarded', async () => {
      const outcome = await decide(roleHolder.page, page, 'network', second.name, 'reject');
      const live = await networkLive(page, second.id);
      expect(outcome.statusAfter, `request ${outcome.requestId}`).toBe(REQUEST_STATUS.rejected);
      expect(live, `"${second.name}" after rejection (the change was "${change.second}")`).toEqual({ ...before.second, hasPendingVersion: false });
    });
  });

  test(`TC-${CASES.bypassScreen.azureId}: should refuse an approval sent directly by a user without the review permission`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles, networkIn, suiteApprovals }) => {
    const network = await networkIn('Pending');
    suiteApprovals.track(network.name);
    const role = await suiteRoles.create({ label: CASES.bypassScreen.label, rights: WITHOUT_GENERAL_RIGHTS });

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical('Precondition: a pending request careconnect may approve (baseline: Approve is offered to it); the test user lacks the general review/approve/reject permission', async () => {
      await submitNetworkChange(page, network, newNetworkDescription('22050'));
      expect(await decisionOffered(page, 'network', network.name, 'approve'), 'Approve for careconnect (baseline)').toBe('available');
      await roleHolder.become({ role });
      expect((await roleHolder.permissions()).permissions, 'the test user lacks the general review permission').not.toContain(THREE_PERMISSIONS.general[0]);
    });

    await steps.step('As the test user, attempt to trigger an approve action directly via a replayed request, bypassing the Approval Management screen - the system rejects the action', async () => {
      requireGate(steps, BYPASS_APPROVE_GATE);
      const res = await approveDirectly(roleHolder.page, page, network.name);
      const said = `ApproveRequest from the test user's session answered ${res.status}: ${res.message}; request ${res.requestId} now "${res.statusAfter}"`;
      expect(res.status, said).toBeGreaterThanOrEqual(400);
      expect(res.status, said).toBeLessThan(500);
      expect(res.statusAfter, said).toBe(REQUEST_STATUS.pending);
    });
  });

  test(`TC-${CASES.auditTrail.azureId}: should record the reviewer, the action and the time when a request is approved or rejected`, async ({ steps, page, roleAdmin, roleHolder, networkIn, suiteApprovals }) => {
    const rejected = await networkIn('Pending');
    const approved = await networkIn('Pending');
    suiteApprovals.track(rejected.name);
    suiteApprovals.track(approved.name);
    const reviewer = { name: '', email: '' };
    const decidedAt = { iso: '' };

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Precondition: two pending requests (careconnect changes "${rejected.name}" and "${approved.name}"); the reviewer is the holder as ${CASES.auditTrail.reviewerRole}`, async () => {
      await submitNetworkChange(page, rejected, newNetworkDescription('22052-reject'));
      await submitNetworkChange(page, approved, newNetworkDescription('22052-approve'));
      await roleHolder.become({ role: CASES.auditTrail.reviewerRole });
      Object.assign(reviewer, await userDisplayName(page, roleHolder.id));
      expect(reviewer.name || reviewer.email, 'the reviewer identity').not.toBe('');
    });

    await steps.critical('Reject one pending request and approve another - both actions complete successfully', async () => {
      decidedAt.iso = new Date().toISOString();
      const rejection = await decide(roleHolder.page, page, 'network', rejected.name, 'reject');
      const approval = await decide(roleHolder.page, page, 'network', approved.name, 'approve');
      expect({ rejected: rejection.statusAfter, approved: approval.statusAfter }).toEqual({ rejected: REQUEST_STATUS.rejected, approved: REQUEST_STATUS.approved });
    });

    await steps.step(`Open the audit trail/history for both requests - each entry records the reviewer's identity (${reviewer.name || reviewer.email}), the action taken, and a timestamp`, async () => {
      const rejection = auditEvidence(await networkAuditSince(page, rejected.id, decidedAt.iso), reviewer, AUDIT_ACTION.reject);
      const approval = auditEvidence(await networkAuditSince(page, approved.id, decidedAt.iso), reviewer, AUDIT_ACTION.approve);
      expect({ rejectionRecorded: rejection.recorded, approvalRecorded: approval.recorded }, `reviewer ${reviewer.name} (${reviewer.email}); "${rejected.name}" audit: ${rejection.entries}; "${approved.name}" audit: ${approval.entries}`)
        .toEqual({ rejectionRecorded: true, approvalRecorded: true });
    });
  });

  test(`TC-${CASES.cannotRejectEither.azureId}: should not let a reviewer without the general review permission reject a request`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles, networkIn, suiteApprovals }) => {
    const network = await networkIn('Pending');
    suiteApprovals.track(network.name);
    const role = await suiteRoles.create({ label: CASES.cannotRejectEither.label, rights: WITHOUT_GENERAL_RIGHTS });

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical('Precondition: a pending request careconnect may reject (baseline: Reject is offered to it); the test user holds tab access and action permission only', async () => {
      await submitNetworkChange(page, network, newNetworkDescription('22053'));
      expect(await decisionOffered(page, 'network', network.name, 'reject'), 'Reject for careconnect (baseline)').toBe('available');
      await roleHolder.become({ role });
      const held = (await roleHolder.permissions()).permissions;
      expect(held, 'the test user holds the tab and the action').toEqual(expect.arrayContaining([...THREE_PERMISSIONS.tab, ...THREE_PERMISSIONS.action]));
      expect(held, 'the test user lacks the general review permission').not.toContain(THREE_PERMISSIONS.general[1]);
    });

    await steps.step('Sign in as the test user and open a pending request, then attempt to reject it - the reject action is unavailable or blocked', async () => {
      const attempt = await attemptDecision(roleHolder.page, page, 'network', network.name, 'reject');
      expect(attempt.requestId, 'the request was pending before the attempt').not.toBe('');
      expect(attempt.decided, describeAttempt(attempt)).toBe(false);
    });
  });
});
