import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { PolicyDetailPage } from '../../../pages/policy/PolicyDetailPage';
import { CASES, MEMBERS_BLOCK, NEEDS_APPROVAL, PENDING_SHOWN, REASON_SHOWN } from '../../../data/policy/deletePolicy.data';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { POLICY_DROPDOWN_PATH } from '../../../constants/policy/writerBIds';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  answerText,
  approvePolicy,
  deletePolicy,
  pendingPolicyRequestId,
  policyStatusCode,
  readPolicy,
  readPolicyAuditTrail,
  readPolicyOrNull,
  readPolicyVersions,
  submitPolicy,
  type PolicyAuditEntry,
  type PolicyVersion,
} from '../../../utils/PolicyProvisioning';
import {
  attemptDelete,
  expectAccepted,
  expectRefused,
  openPolicyReview,
  refused,
  stageAndSubmitDeletion,
} from '../../../utils/policy/writerBHelpers';

const pendingBadge = /·\s*Pending Approval$/;

/** The audit trail of a policy by id, or the reason it could not be read (a deleted policy may answer 404). */
async function trailOf(page: Page, policyId: string): Promise<{ items: PolicyAuditEntry[]; error: string }> {
  return readPolicyAuditTrail(page, policyId).then((t) => ({ items: t.items, error: '' })).catch((e: unknown) => ({ items: [], error: String(e instanceof Error ? e.message : e) }));
}

/** The version history of a policy by id, or [] with the reason. */
async function versionsOf(page: Page, policyId: string): Promise<{ items: PolicyVersion[]; error: string }> {
  return readPolicyVersions(page, policyId).then((items) => ({ items, error: '' })).catch((e: unknown) => ({ items: [], error: String(e instanceof Error ? e.message : e) }));
}

/** Send for Approval from the header when offered, else the request the screen would send. */
async function sendForApproval(page: Page, detail: PolicyDetailPage, policyId: string): Promise<{ status: number; text: string }> {
  await detail.open(policyId);
  if ((await detail.getActionAvailability('submit')) === 'available') return detail.sendForApproval();
  return submitPolicy(page, policyId);
}

/**
 * User story 15183: Delete Policy.
 * A never-approved draft is deleted at once; a published one only through
 * approval (logically, its history kept); members block deletion. See the data
 * file for how the sheet maps onto this build.
 */
test.describe('US 15183 - Delete Policy', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.draftImmediate.azureId}: should delete a never-approved draft at once without an approval step`, async ({
    policyManagementPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    let dialog!: Awaited<ReturnType<typeof policyManagementPage.requestAction>>;

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Locate the draft policy with no members and select the Delete action - a confirmation prompt is displayed', async () => {
      expect((await readPolicy(page, policy.id)).memberCount).toBe(0);
      dialog = await policyManagementPage.requestAction(policy.nameEn, 'delete');
      expect(await dialog.isVisible()).toBe(true);
    });

    await steps.step('Confirm the deletion - the policy is removed from the active policy list immediately', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.policyDelete, async () => { await dialog.confirmWithFollowUps(); });
      expect(answer?.status ?? -1, answer?.text.slice(0, 200)).toBeLessThan(300);
      expect(await readPolicyOrNull(page, policy.id), 'the deleted draft').toBeNull();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(false);
    });

    await steps.step('Check the policy audit / version history - a deletion record is logged with no pending approval step', async () => {
      const trail = await trailOf(page, policy.id);
      expect(trail.items.map((e) => e.actionType), `the deleted draft's audit trail ${trail.error}`).toContain('DELETE');
      expect(await pendingPolicyRequestId(page, policy.nameEn), 'a pending approval request').toBe('');
    });
  });

  test(`TC-${CASES.publishedRouted.azureId}: should route the deletion of a published policy for approval and keep it live meanwhile`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Select the published policy and choose the Delete action - a confirmation prompt explaining that approval is required is displayed', async () => {
      const row = (await policyManagementPage.getActionState(policy.nameEn, 'delete')).availability;
      await policyDetailPage.open(policy.id);
      const header = await policyDetailPage.getActionAvailability('delete');
      expect({ row, header }, 'Delete on the published policy').toEqual({ row: 'available', header: 'available' });
      const dialog = await policyDetailPage.requestDelete();
      expect(`${await dialog.getTitle()} ${await dialog.getMessage()}`).toMatch(NEEDS_APPROVAL);
      await dialog.cancel();
    });

    await steps.critical('Confirm the deletion request - the policy status changes to Pending Deletion Approval', async () => {
      const attempt = await attemptDelete(page, policyDetailPage, policy.id);
      expect(attempt.status, `the deletion (${attempt.via}): ${attempt.said}`).toBeLessThan(300);
      expectAccepted(await sendForApproval(page, policyDetailPage, policy.id), 'Send for Approval');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(pendingBadge);
      expect((await readPolicyVersions(page, policy.id))[0]?.changeType, 'the pending change').toMatch(/Delete/i);
    });

    await steps.step('Open the policy record - the policy remains visible and active pending the approval outcome', async () => {
      expect(await readPolicyOrNull(page, policy.id)).not.toBeNull();
      expect(await policyStatusCode(page, policy.id)).toBe('pending');
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });
  });

  test(`TC-${CASES.draftWithMembers.azureId}: should refuse to delete a draft policy that still has members`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft', { type: 'individual', members: CASES.draftWithMembers.members });
    let attempt!: Awaited<ReturnType<typeof attemptDelete>>;

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Select the draft policy that has members and choose the Delete action - the system evaluates the member count', async () => {
      attempt = await attemptDelete(page, policyDetailPage, policy.id);
      expect(attempt.status, `the deletion was not answered (${attempt.via})`).not.toBe(-1);
    });

    await steps.step('Observe the system response - a blocking message says the policy cannot be deleted because members exist, and it stays in Draft', async () => {
      expect(refused(attempt), `the deletion was accepted: ${attempt.said}`).toBe(true);
      expect(attempt.said).toMatch(MEMBERS_BLOCK);
      const record = await readPolicyOrNull(page, policy.id);
      expect({ exists: record !== null, notLive: record?.isPendingCreate, state: record?.versionStatusCode }).toEqual({ exists: true, notLive: true, state: 'draft' });
    });
  });

  for (const key of ['publishedWithMembers', 'oneMember'] as const) {
    const data = CASES[key];
    const single = key === 'oneMember';
    test(single
      ? `TC-${data.azureId}: should block the deletion of a policy with exactly one member`
      : `TC-${data.azureId}: should refuse to delete a published policy that still has members without starting an approval`, async ({
      policyManagementPage,
      policyDetailPage,
      policyIn,
      page,
      steps,
    }) => {
      const policy = await policyIn('Future', { type: 'individual', members: data.members });
      let attempt!: Awaited<ReturnType<typeof attemptDelete>>;

      await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
        await policyManagementPage.openTable();
        expect((await readPolicy(page, policy.id)).memberCount).toBe(data.members);
      });

      await steps.step(single
        ? 'Select the policy with exactly one member and choose the Delete action - the system checks the member count'
        : 'Select the published policy that has members and choose the Delete action - the member count is evaluated before an approval request', async () => {
        attempt = await attemptDelete(page, policyDetailPage, policy.id);
        expect(attempt.status, `the deletion was not answered (${attempt.via})`).not.toBe(-1);
      });

      await steps.step(single
        ? 'Observe the system response - deletion is blocked with a message that members exist'
        : 'Observe the system response - a blocking message says members exist and no approval workflow is started', async () => {
        expect(refused(attempt), `the deletion was accepted: ${attempt.said}`).toBe(true);
        expect(attempt.said).toMatch(MEMBERS_BLOCK);
        const record = await readPolicy(page, policy.id);
        expect({ staged: record.hasDraft, pending: record.hasPendingVersion }).toEqual({ staged: false, pending: false });
        expect(await pendingPolicyRequestId(page, policy.nameEn)).toBe('');
      });
    });
  }

  test(`TC-${CASES.approvedDeletion.azureId}: should remove the published policy logically when its deletion is approved and keep its history`, async ({
    policyManagementPage,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    await stageAndSubmitDeletion(page, policy.id);

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the pending deletion request as the approver - the request details are displayed with the requester and reason', async () => {
      const review = await openPolicyReview(page, policyApprovalsPage, policy.nameEn);
      expect(review.requestedBy, 'the requester').not.toBe('');
      expect(review.text, 'a reason on the deletion request').toMatch(REASON_SHOWN);
    });

    await steps.critical('Approve the deletion request - the policy is Deleted and disappears from the active list', async () => {
      await policyApprovalsPage.approve(policy.nameEn);
      await expect.poll(() => readPolicyOrNull(page, policy.id), { message: 'the policy should be removed once the deletion is approved' }).toBeNull();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(false);
    });

    await steps.step('Open the policy\'s version / audit history - the full history including the deletion event and approver remains visible', async () => {
      const versions = await versionsOf(page, policy.id);
      const trail = await trailOf(page, policy.id);
      expect(versions.items.map((v) => v.changeType), `the version history after the deletion ${versions.error}`).toEqual(expect.arrayContaining([expect.stringMatching(/Create/i), expect.stringMatching(/Delete/i)]));
      expect(versions.items.find((v) => /Delete/i.test(v.changeType))?.reviewedByNameEn ?? '', 'the approver of the deletion').not.toBe('');
      expect(trail.items.map((e) => e.actionType), `the audit trail after the deletion ${trail.error}`).toContain('DELETE');
    });
  });

  test(`TC-${CASES.rejectedDeletion.azureId}: should keep the published policy live when its deletion request is rejected`, async ({
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    await stageAndSubmitDeletion(page, policy.id);

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the pending deletion request as the approver - the request details are displayed', async () => {
      const review = await openPolicyReview(page, policyApprovalsPage, policy.nameEn);
      expect(review.text).toContain(policy.nameEn);
    });

    await steps.critical(`Reject the deletion request with a reason ("${CASES.rejectedDeletion.reason}") - the request status changes to Rejected`, async () => {
      await policyApprovalsPage.reject(policy.nameEn);
      const rejected = (await readPolicyVersions(page, policy.id)).find((v) => v.versionStatusCode === 'rejected');
      expect(rejected?.changeType, 'the rejected deletion request').toMatch(/Delete/i);
    });

    await steps.step('Open the policy record - it is still shown as published and fully usable', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).not.toMatch(pendingBadge);
      expect(await policyStatusCode(page, policy.id)).toBe('pending');
      expect(await policyDetailPage.getActionAvailability('clone')).toBe('available');
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });
  });

  test(`TC-${CASES.endToEnd.azureId}: should take a published policy's deletion with a justification from request through approval to logical removal`, async ({
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.endToEnd;
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Select the published policy and initiate deletion with the justification "${data.justification}" - the request is created and shows Pending Deletion Approval`, async () => {
      await policyDetailPage.open(policy.id);
      const offered = await policyDetailPage.getActionAvailability('delete');
      let justified = false;
      if (offered === 'available') {
        const dialog = await policyDetailPage.requestDelete();
        justified = await dialog.hasFreeTextInput();
        if (justified) await dialog.typeReasonText(data.justification);
        await dialog.confirmWithFollowUps();
      } else {
        expectAccepted(await deletePolicy(page, policy.id, true), 'the deletion request');
      }
      expectAccepted(await sendForApproval(page, policyDetailPage, policy.id), 'Send for Approval');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(pendingBadge);
      expect({ deleteOffered: offered, justificationField: justified }, 'how the screen let the deletion be requested').toEqual({ deleteOffered: 'available', justificationField: true });
    });

    await steps.step('Log in as the approver and review the request - the justification note and requester are visible', async () => {
      const review = await openPolicyReview(page, policyApprovalsPage, policy.nameEn);
      expect(review.requestedBy).not.toBe('');
      expect(review.text).toContain(data.justification);
    });

    await steps.critical('Approve the request - the policy status updates to Deleted and an audit entry is created', async () => {
      await policyApprovalsPage.approve(policy.nameEn);
      await expect.poll(() => readPolicyOrNull(page, policy.id), { message: 'the policy should be removed once the deletion is approved' }).toBeNull();
      const trail = await trailOf(page, policy.id);
      expect(trail.items.map((e) => e.actionType), `the audit trail ${trail.error}`).toContain('DELETE');
    });

    await steps.step('Return to the policy list as the compliance officer - the policy no longer appears among active policies', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(false);
    });
  });

  test(`TC-${CASES.duplicateRequest.azureId}: should prevent a second deletion request while one is pending approval`, async ({
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    await stageAndSubmitDeletion(page, policy.id);

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Select the policy that already has a pending deletion request - the Delete action is disabled or shows the existing request status', async () => {
      await policyDetailPage.open(policy.id);
      const offered = await policyDetailPage.getActionAvailability('delete');
      expect(offered !== 'available' || PENDING_SHOWN.test(await policyDetailPage.getHeaderText()), `Delete ${offered}; header: ${await policyDetailPage.getHeaderText()}`).toBe(true);
      expect(await policyDetailPage.getVersionBadge()).toMatch(pendingBadge);
    });

    await steps.step('Attempt to submit another deletion request - the system prevents a second request', async () => {
      const again = await deletePolicy(page, policy.id, false);
      expect(refused(again) || /"requiresDraftConfirmation"\s*:\s*true/.test(again.text), `a second deletion request answered ${again.status} ${answerText(again)}`).toBe(true);
      await policyApprovalsPage.open();
      expect(await policyApprovalsPage.getQueuedChangeTypes(policy.nameEn), 'requests queued for the policy').toHaveLength(1);
    });
  });

  test(`TC-${CASES.alreadyDeleted.azureId}: should offer no Delete action on a policy that is already deleted`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    await stageAndSubmitDeletion(page, policy.id);
    await approvePolicy(page, policy.nameEn);
    await expect.poll(() => readPolicyOrNull(page, policy.id), { message: 'the prior deletion should take effect' }).toBeNull();

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Search for the previously deleted policy by direct link or audit search - it appears only in the historical / audit view, not the active list', async () => {
      expect(await policyManagementPage.isListed(policy.nameEn), 'in the active list').toBe(false);
      await policyDetailPage.openExpectingFailure(policy.id);
      expect(await policyDetailPage.isLoaded(), 'the active record by direct link').toBe(false);
      const trail = await trailOf(page, policy.id);
      expect(trail.items.length, `its audit history ${trail.error}`).toBeGreaterThan(0);
    });

    await steps.step('Attempt to access a Delete action on it - no delete option is available', async () => {
      expect(await policyDetailPage.getActionAvailability('delete')).not.toBe('available');
      expectRefused(await deletePolicy(page, policy.id, true), 'deleting the deleted policy again');
    });
  });

  test(`TC-${CASES.draftGoneButAudited.azureId}: should drop a deleted draft from the active views but keep it in the audit records`, async ({
    policyManagementPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    expectAccepted(await deletePolicy(page, policy.id, true), 'deleting the draft');

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await readPolicyOrNull(page, policy.id)).toBeNull();
    });

    await steps.step('Check the active policy list and the policy selection dropdowns - the deleted policy does not appear in any of them', async () => {
      expect(await policyManagementPage.isListed(policy.nameEn), 'in the active list').toBe(false);
      const dropdown = await NetworkUtils.requestAsSession(page, 'GET', `${POLICY_DROPDOWN_PATH}?searchText=${encodeURIComponent(policy.nameEn)}`);
      expect(dropdown.status, `GetPoliciesDropdown answered ${dropdown.status}`).toBeLessThan(300);
      expect(dropdown.text, 'the policy dropdown').not.toContain(policy.id);
    });

    await steps.step('Open the audit / version history search - the deleted policy and its deletion event are still retrievable', async () => {
      const trail = await trailOf(page, policy.id);
      expect(trail.items.map((e) => e.actionType), `the deleted draft's audit trail ${trail.error}`).toContain('DELETE');
    });
  });

  test(`TC-${CASES.requestAudit.azureId}: should record the requester, request date and justification of a deletion request`, async ({
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.requestAudit;
    const policy = await policyIn('Future');
    let justified = false;

    await steps.critical('Navigate to the Policy Management module - the module home screen loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Initiate a deletion request on the published policy - a request form is displayed', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getActionAvailability('delete'), 'Delete on the published policy').toBe('available');
      const dialog = await policyDetailPage.requestDelete();
      justified = await dialog.hasFreeTextInput();
      expect(justified, `a request form (reason / justification) - the prompt reads "${await dialog.getMessage()}"`).toBe(true);
      await dialog.typeReasonText(data.justification);
      await dialog.confirmWithFollowUps();
    });

    await steps.step('Submit the request and open its details as the approver - the requester name, request date and reason / justification are recorded and visible', async () => {
      if (!(await readPolicy(page, policy.id)).hasDraft) expectAccepted(await deletePolicy(page, policy.id, true), 'the deletion request');
      expectAccepted(await sendForApproval(page, policyDetailPage, policy.id), 'Send for Approval');
      const review = await openPolicyReview(page, policyApprovalsPage, policy.nameEn);
      expect({ requester: review.requestedBy !== '', date: review.requestedOn !== '' }).toEqual({ requester: true, date: true });
      if (justified) expect(review.text, 'the justification on the request').toContain(data.justification);
      else expect(review.text, 'a reason / justification on the request').toMatch(REASON_SHOWN);
    });
  });
});

