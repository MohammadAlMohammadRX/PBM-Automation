import { test, expect } from '../../../fixtures';
import { ApprovalManagementPage } from '../../../pages/approval/ApprovalManagementPage';
import { ROLE_MESSAGES } from '../../../data/role/common.data';
import {
  CASES,
  NETWORK_MAKER_CHECKER_RIGHTS,
  PAYER_EDIT_FIELD,
  REQUEST_STATUS,
  newLicence,
  newNetworkDescription,
} from '../../../data/role/preventSelfApprovalOfChangeRequests.data';
import {
  approvalRightsOf,
  attemptDecision,
  blockUnlessHeld,
  describeAttempt,
  expectQueued,
  payerRecordText,
  requestStatus,
  roleIdByName,
  submitNetworkChange,
  submitOwnFormulary,
  submitPayerChange,
} from '../../../utils/role/writerEHelpers';

/**
 * US 21285 - Prevent Self-Approval of Change Requests: the requester may not decide its own request unless its
 * role says so. Requester / reviewer per case in data/role/preventSelfApprovalOfChangeRequests.data.ts - always the
 * role holder (maalmohammad) and careconnect, never the same account unless the case is about self-approval.
 * Every request raised is tracked and rejected at teardown.
 */
test.describe('US 21285 - Prevent Self-Approval of Change Requests', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.otherReviewerApproves.azureId}: should let a different authorized reviewer approve a submitted payer change`, async ({ steps, page, roleAdmin, roleHolder, suitePayers, suiteApprovals }) => {
    const payer = await suitePayers.publish();
    suiteApprovals.track(payer.name);
    const licence = newLicence('A');
    const request = { id: '' };

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`As User A (the holder as ${CASES.otherReviewerApproves.requesterRole}), submit a change to a Payer record ("${payer.name}" ${PAYER_EDIT_FIELD}) and save - the change appears in Approval Management as a pending request`, async () => {
      await roleHolder.become({ role: CASES.otherReviewerApproves.requesterRole }, { payerToChoose: payer.name });
      await submitPayerChange(roleHolder.page, payer.name, PAYER_EDIT_FIELD, licence);
      await expectQueued(page, 'payer', payer.name);
      request.id = await suiteApprovals.pendingId(payer.name);
      expect(request.id, `a pending request for "${payer.name}"`).not.toBe('');
    });

    await steps.step('Sign in as User B (careconnect, all three permissions) and open Approval Management, then approve the request - the request status changes to Approved and the payer record update is applied', async () => {
      const approvals = new ApprovalManagementPage(page, 'payer');
      await approvals.open();
      await approvals.approve(payer.name);
      expect(await requestStatus(page, request.id), `request ${request.id}`).toBe(REQUEST_STATUS.approved);
      expect(await payerRecordText(page, payer.id), `GetPayer of "${payer.name}" should carry the approved ${PAYER_EDIT_FIELD}`).toContain(licence);
    });
  });

  test(`TC-${CASES.requesterCannotSelfApprove.azureId}: should not let a requester whose role disallows self-approval approve its own network change`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles, networkIn, suiteApprovals }) => {
    const role = CASES.requesterCannotSelfApprove.requesterRole;
    const network = await networkIn('Pending');
    suiteApprovals.track(network.name);

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Precondition: the requester's role (${role}) has "Can a User Approve Their Own Requests?" unchecked and may otherwise approve network requests`, async () => {
      expect((await suiteRoles.read(await roleIdByName(page, role)))?.canApproveOwnRequests, `${role} canApproveOwnRequests`).toBe(false);
      await roleHolder.become({ role });
      const me = await roleHolder.permissions();
      blockUnlessHeld(steps, me.permissions, approvalRightsOf('network'), 'a hidden Approve proves the self-approval rule only for a requester that may approve network requests');
      expect(me.roles).toEqual([role]);
    });

    await steps.critical(`As the requester, submit a change to a Network record ("${network.name}") - the request appears in Approval Management as pending`, async () => {
      await submitNetworkChange(roleHolder.page, network, newNetworkDescription('22043'));
      await expectQueued(page, 'network', network.name);
      expect(await suiteApprovals.pendingId(network.name), `a pending request for "${network.name}"`).not.toBe('');
    });

    await steps.step('While still signed in as the requester, attempt to open and approve the same request - the Approve/Reject action is hidden or blocked for this request', async () => {
      const attempt = await attemptDecision(roleHolder.page, page, 'network', network.name, 'approve');
      expect(attempt.requestId, 'the request was pending before the attempt').not.toBe('');
      expect(attempt.decided, describeAttempt(attempt)).toBe(false);
    });
  });

  test(`TC-${CASES.predefinedRolesNoSelfApproval.azureId}: should block self-approval for each of the three predefined roles`, async ({ steps, page, roleAdmin, roleHolder, suitePayers, suiteApprovals, discardFormularyNamed }) => {
    const [oa, pa, po] = CASES.predefinedRolesNoSelfApproval.roles;
    const payer = await suitePayers.publish();
    const register = (name: string): void => {
      discardFormularyNamed(name);
      suiteApprovals.track(name);
    };

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.step(`As ${oa}, submit a change request and attempt to approve it under the same account - self-approval is blocked`, async () => {
      await roleHolder.become({ role: oa }, { payerToChoose: payer.name });
      const own = await submitOwnFormulary(steps, roleHolder.page, payer.id, register, oa);
      const attempt = await attemptDecision(roleHolder.page, page, 'formulary', own.name, 'approve');
      expect(attempt.requestId, `a pending request for "${own.name}"`).not.toBe('');
      expect(attempt.decided, `${oa}: ${describeAttempt(attempt)}`).toBe(false);
    });

    await steps.step(`As ${pa}, repeat the same submit-and-approve attempt - self-approval is blocked`, async () => {
      await roleHolder.become({ role: pa, payerIds: [payer.id] }, { payerToChoose: payer.name });
      const own = await submitOwnFormulary(steps, roleHolder.page, payer.id, register, pa);
      const attempt = await attemptDecision(roleHolder.page, page, 'formulary', own.name, 'approve');
      expect(attempt.requestId, `a pending request for "${own.name}"`).not.toBe('');
      expect(attempt.decided, `${pa}: ${describeAttempt(attempt)}`).toBe(false);
    });

    await steps.step(`As ${po}, repeat the same submit-and-approve attempt - self-approval is blocked`, async () => {
      await roleHolder.become({ role: po, payerIds: [payer.id] }, { payerToChoose: payer.name });
      const own = await submitOwnFormulary(steps, roleHolder.page, payer.id, register, po);
      const attempt = await attemptDecision(roleHolder.page, page, 'formulary', own.name, 'approve');
      expect(attempt.requestId, `a pending request for "${own.name}"`).not.toBe('');
      expect(attempt.decided, `${po} (holds no approval right at all): ${describeAttempt(attempt)}`).toBe(false);
    });
  });

  test(`TC-${CASES.selfApprovalToggle.azureId}: should let the holder of a custom role approve its own requests only while the role allows self-approval`, async ({ steps, page, roleAdmin, roleHolder, suiteRoles, networkIn, suiteApprovals }) => {
    const network = await networkIn('Pending');
    suiteApprovals.track(network.name);
    const role = await suiteRoles.create({ label: CASES.selfApprovalToggle.label, rights: NETWORK_MAKER_CHECKER_RIGHTS, canApproveOwnRequests: false });

    await steps.critical(`Precondition: the test user holds only the custom role "${role.name}" (may change, submit and review network requests; self-approval unchecked)`, async () => {
      await roleHolder.become({ role });
      const me = await roleHolder.permissions();
      expect(me.roles).toEqual([role.name]);
      expect(role.record.canApproveOwnRequests).toBe(false);
    });

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical('Edit the custom role and enable "Can a User Approve Their Own Requests?", then save - the role setting updates to allow self-approval', async () => {
      await roleAdmin.search(role.name);
      const form = await roleAdmin.openEdit(role.id);
      expect(await form.title()).toBe(ROLE_MESSAGES.editTitle);
      await form.setCheckbox('canApproveOwnRequests', true);
      await form.nextToPrivileges();
      const out = await form.saveExpectingSuccess();
      expect((await suiteRoles.read(role.id))?.canApproveOwnRequests, `UpdateRole answered ${out.status} "${out.apiMessage}"`).toBe(true);
    });

    await steps.step('Sign in as a user holding only this custom role, submit a change request, and attempt to approve it themselves - the approval succeeds', async () => {
      await submitNetworkChange(roleHolder.page, network, newNetworkDescription('22051-on'));
      const attempt = await attemptDecision(roleHolder.page, page, 'network', network.name, 'approve');
      expect(attempt.decided, describeAttempt(attempt)).toBe(true);
      expect(attempt.statusAfter, describeAttempt(attempt)).toBe(REQUEST_STATUS.approved);
    });

    await steps.step('Disable the checkbox again and repeat the self-approval attempt - the approval is now blocked', async () => {
      await roleAdmin.open();
      await roleAdmin.search(role.name);
      const form = await roleAdmin.openEdit(role.id);
      await form.setCheckbox('canApproveOwnRequests', false);
      await form.nextToPrivileges();
      const out = await form.saveExpectingSuccess();
      expect((await suiteRoles.read(role.id))?.canApproveOwnRequests, `UpdateRole answered ${out.status} "${out.apiMessage}"`).toBe(false);
      await submitNetworkChange(roleHolder.page, network, newNetworkDescription('22051-off'));
      const attempt = await attemptDecision(roleHolder.page, page, 'network', network.name, 'approve');
      expect(attempt.requestId, 'the second change is pending before the attempt').not.toBe('');
      expect(attempt.decided, describeAttempt(attempt)).toBe(false);
    });
  });
});
