import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import { ALREADY_DECIDED, BLOCKED_CASES, CASES, NEEDS, NOT_ELIGIBLE, REASON_REQUIRED } from '../../../data/policy/approvalWorkflow.data';
import { blockUnless, dialogAndToastText, freeCandidates, openEditIn, readToasts, typeGracePeriod } from '../../../utils/policy/writerCHelpers';
import {
  pendingPolicyRequestId,
  readPolicyVersions,
  samplePdf,
  updatePolicyFields,
  type PolicyVersion,
} from '../../../utils/PolicyProvisioning';

const DATE_TIME = /\d{2}\/\d{2}\/\d{4}.*\d{1,2}:\d{2}/;
const versionIn = (versions: PolicyVersion[], code: string): PolicyVersion | undefined => versions.find((v) => v.versionStatusCode === code);

/**
 * User story 18434: Policy Approval Workflow - the administrator's cases. The
 * administrator holds the approval permission (it may approve its own
 * requests) and is the reviewer; the cases needing a user without that
 * permission are in approval-roles.spec.ts (data/policy/approvalWorkflow.data.ts).
 */
test.describe('US 18434 - Policy Approval Workflow', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.selfApproveWithRight.azureId}: should let a compliance officer with approval permission approve their own submitted change`, async ({
    page,
    policyManagementPage,
    policyApprovalsPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('PendingApproval', { type: 'individual' });
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the submitted change request created by the logged-in user - it shows Pending Approval', async () => {
      await policyApprovalsPage.open();
      const row = await policyApprovalsPage.readQueuedRow(policy.nameEn);
      expect(row.status).toMatch(/Pending/);
    });

    await steps.step('Verify the Approve button - it is enabled and selectable', async () => {
      expect(await policyApprovalsPage.getRowActionAvailability(policy.nameEn, 'approve')).toBe('available');
    });

    await steps.critical('Click Approve - a confirmation prompt is displayed', async () => {
      dialog = await policyApprovalsPage.openApproveDialog(policy.nameEn);
      expect(await dialog.isVisible()).toBe(true);
    });

    await steps.step('Confirm the approval - the request is Approved with the approver\'s name and approval time shown', async () => {
      await dialog.confirm('Approve');
      await policyApprovalsPage.waitForDecisionProcessed(policy.nameEn);
      const approved = versionIn(await readPolicyVersions(page, policy.id), 'published');
      expect(approved, 'an Approved version').toBeDefined();
      expect(approved!.reviewedByNameEn ?? '', 'the approver').not.toBe('');
      expect(approved!.reviewedByNameEn, 'self-approval: approver = submitter').toBe(approved!.requestedByNameEn);
      expect(String(approved!.reviewedOn ?? ''), 'the approval timestamp').not.toBe('');
    });
  });

  test(`TC-${CASES.rejectWithReason.azureId}: should reject the change and keep the written reason visible on the request`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.rejectWithReason;
    const policy = await policyIn('PendingApproval', { type: 'individual' });
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the change request pending approval - it shows Pending Approval', async () => {
      await policyApprovalsPage.open();
      expect((await policyApprovalsPage.readQueuedRow(policy.nameEn)).status).toMatch(/Pending/);
    });

    await steps.step('Click Reject - a rejection dialog opens with a mandatory reason field', async () => {
      dialog = await policyApprovalsPage.openRejectDialog(policy.nameEn);
      await dialog.selectReasonIfPresent('Other');
      expect(await dialog.hasFreeTextInput(), 'a written-reason field').toBe(true);
    });

    await steps.step(`Enter the written reason "${data.reason}" - the text is accepted`, async () => {
      expect(await dialog.typeReasonText(data.reason)).toBe(data.reason);
    });

    await steps.step('Submit the rejection - the request is Rejected and the entered reason is saved and visible on the request history', async () => {
      await dialog.acknowledgeIfPresent();
      await dialog.clickAction('confirm');
      await policyApprovalsPage.waitForDecisionProcessed(policy.nameEn);
      const rejected = versionIn(await readPolicyVersions(page, policy.id), 'rejected');
      expect(rejected, 'a Rejected version').toBeDefined();
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Rejected/);
      expect(await policyDetailPage.getHeaderText(), 'the reason on the request').toContain(data.reason);
    });
  });

  for (const [key, label] of [['rejectEmptyReason', 'without entering a reason'], ['rejectBlankReason', 'with only blank spaces as the reason']] as const) {
    test(`TC-${CASES[key].azureId}: should block a rejection submitted ${label}`, async ({
      page,
      policyManagementPage,
      policyApprovalsPage,
      policyIn,
      steps,
    }) => {
      const policy = await policyIn('PendingApproval', { type: 'individual' });
      let dialog!: ConfirmDialog;

      await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
        await policyManagementPage.openTable();
        expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
      });

      await steps.critical('Open the change request pending approval - it shows Pending Approval', async () => {
        await policyApprovalsPage.open();
        expect((await policyApprovalsPage.readQueuedRow(policy.nameEn)).status).toMatch(/Pending/);
      });

      await steps.step('Click Reject - a rejection dialog opens with a mandatory reason field', async () => {
        dialog = await policyApprovalsPage.openRejectDialog(policy.nameEn);
        if (key === 'rejectBlankReason') await dialog.selectReasonIfPresent('Other');
        expect(await dialog.hasFreeTextInput(), 'a written-reason field').toBe(true);
      });

      await steps.step(`${key === 'rejectBlankReason' ? 'Enter only spaces' : 'Leave the reason empty'} and click Submit - a validation message says a valid reason is required`, async () => {
        // Blank case (2026-11-04): with no written-reason field the spaces cannot be entered,
        // and confirming then rejected the request with the managed reason "Other" picked in
        // step 3 - a valid reason, not the case's blank one (19724 read Rejected in step 5 on
        // 2026-11-03). So the blank case submits only when it could type its spaces.
        const freeText = await dialog.hasFreeTextInput();
        if (key === 'rejectBlankReason') {
          expect(freeText, 'a written-reason field to enter only spaces into (the dialog offers a reason list and an acknowledgement only)').toBe(true);
          await dialog.typeReasonText(CASES.rejectBlankReason.reason);
        }
        await dialog.acknowledgeIfPresent();
        if (await dialog.isAffirmativeEnabled()) await dialog.clickAction('confirm');
        expect(await dialog.isVisible(), 'the dialog stays open').toBe(true);
        expect(await dialogAndToastText(page)).toMatch(REASON_REQUIRED);
        if (await dialog.isVisible()) await dialog.cancel().catch(() => undefined);
      });

      await steps.step('Verify the request status - it is still Pending Approval and no rejection is recorded', async () => {
        // A failed step 4 left the dialog open over the queue (2026-11-03).
        if (await dialog.isVisible()) await dialog.cancel().catch(() => undefined);
        expect(await policyApprovalsPage.isInQueue(policy.nameEn)).toBe(true);
        const versions = await readPolicyVersions(page, policy.id);
        expect(versionIn(versions, 'rejected'), 'no rejection').toBeUndefined();
        expect(versionIn(versions, 'pendingApproval'), 'still pending').toBeDefined();
      });
    });
  }

  test(`TC-${CASES.editPolicyToDraft.azureId}: should return an approved policy to Draft and block approval when the policy itself is edited`, async ({
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the approved policy change request - it shows Approved', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Approved/);
    });

    await steps.step(`Edit a field on the policy itself (grace period ${CASES.editPolicyToDraft.gracePeriod}) and save - the edit is saved`, async () => {
      expect(await policyDetailPage.getActionAvailability('edit'), 'an Edit action on the approved policy').toBe('available');
      const drawer = await openEditIn({ detail: policyDetailPage }, policy.id);
      await typeGracePeriod(drawer, CASES.editPolicyToDraft.gracePeriod);
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
    });

    await steps.step('Review the request status - it has changed to Draft', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Draft/);
    });

    await steps.step('Verify the Approve button - it is unavailable until the request is resent for approval', async () => {
      expect(await policyApprovalsPage.getDecisionAvailability(policy.nameEn).then((d) => d.approve)).toBe(false);
    });
  });

  test(`TC-${CASES.memberToDraft.azureId}: should return an approved policy to Draft when a member is added`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Future', { type: 'individual' });
    const [candidate] = await freeCandidates(page, policy.id, 1);
    blockUnless(testInfo, candidate !== undefined, 'a member the picker offers', 'the member picker offered no further member');

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the approved policy change request - it shows Approved', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Approved/);
    });

    await steps.step(`Add a member (${candidate.memberCode}, ${CASES.memberToDraft.relationship}) and save - the member list updates and is saved`, async () => {
      await policyMembersTab.open();
      const drawer = await policyMembersTab.openAdd();
      await drawer.search(candidate.documentId); // a full-name search finds nobody (2026-11-03); the document id does
      await drawer.pick(candidate.documentId);
      await drawer.chooseRelationship(CASES.memberToDraft.relationship);
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await policyMembersTab.open();
      await expect(policyMembersTab.rowOf(candidate.memberCode)).toBeVisible();
    });

    await steps.step('Review the request status - it has changed to Draft', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Draft/);
    });
  });

  test(`TC-${CASES.networkToDraft.azureId}: should return an approved policy to Draft when a network assignment is removed`, async ({
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future');
    const network = policy.networks[0];

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the approved policy change request - it shows Approved', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Approved/);
    });

    await steps.step(`Remove the network assignment ${network.networkCode} and save - the network list updates and is saved`, async () => {
      await policyNetworksTab.open();
      const answer = await policyNetworksTab.removeNetwork(network.networkCode);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.readAssignment(network.networkCode)).toMatch(/Removal/);
    });

    await steps.step('Review the request status - it has changed to Draft', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Draft/);
    });
  });

  test(`TC-${CASES.documentToDraft.azureId}: should return an approved policy to Draft when documentation is uploaded`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    steps,
  }) => {
    const data = CASES.documentToDraft;
    const policy = await policyIn('Future', { documents: 1 });

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the approved policy change request - it shows Approved', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Approved/);
    });

    await steps.step(`Upload a new documentation file (${data.file}) and save - the documentation list updates and is saved`, async () => {
      await policyDocumentsTab.open();
      const drawer = await policyDocumentsTab.openAdd();
      const answer = await drawer.add({ title: data.title, type: 'Other', description: 'Replaces the previous guidelines.', attachment: samplePdf(data.file) });
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await policyDocumentsTab.open();
      expect(await policyDocumentsTab.readCard(data.title)).toBeDefined();
    });

    await steps.step('Review the request status - it has changed to Draft', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Draft/);
    });
  });

  test(`TC-${CASES.resendAfterDraft.azureId}: should resend a change that went back to Draft for approval`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyApprovalsPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('DraftChange');

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy change request in Draft status - it shows Draft', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Draft/);
    });

    await steps.step('Review the edited values - the recently changed values are displayed', async () => {
      await policyDocumentsTab.open();
      const cards = await policyDocumentsTab.readCards();
      expect(cards.some((c) => /Draft/i.test(c.state)), JSON.stringify(cards.map((c) => [c.title, c.state]))).toBe(true);
    });

    await steps.step('Click Resend for Approval - the request is validated and submitted', async () => {
      const answer = await policyDetailPage.sendForApproval();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
    });

    await steps.step('Verify the request status - it is Pending Approval and visible to approvers', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Pending Approval/);
      await policyApprovalsPage.open();
      expect(await policyApprovalsPage.isInQueue(policy.nameEn)).toBe(true);
    });
  });

  for (const [key, missing] of [['needsMember', 'member'], ['needsNetwork', 'network']] as const) {
    test(`TC-${CASES[key].azureId}: should refuse to approve a policy change with no ${missing === 'member' ? 'Member' : 'Network'} assigned`, async ({
      page,
      policyManagementPage,
      policyDetailPage,
      policyApprovalsPage,
      policyIn,
      steps,
    }) => {
      const policy = await policyIn('PendingApproval', missing === 'member' ? { type: 'individual', members: 0 } : { type: 'individual', networks: 0 });
      let decided = { answer: '', messages: '', dialogStayedOpen: false };

      await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
        await policyManagementPage.openTable();
        expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
      });

      await steps.critical(`Open the change request that has no ${missing} - the request details show an empty ${missing === 'member' ? 'Member' : 'Network'} list`, async () => {
        await policyDetailPage.open(policy.id);
        expect(await policyDetailPage.readTabCount(missing === 'member' ? 'members' : 'networks')).toBe(0);
        await policyApprovalsPage.open();
        expect((await policyApprovalsPage.readQueuedRow(policy.nameEn)).status).toMatch(/Pending/);
      });

      await steps.step(`Click Approve - a validation message says at least one ${missing === 'member' ? 'Member' : 'Network'} is required`, async () => {
        decided = await policyApprovalsPage.attemptDecisionOnLoadedRow(policy.nameEn, 'approve');
        expect(`${decided.messages} ${(await readToasts(page)).join(' ')}`, `server: ${decided.answer}`).toMatch(NEEDS[missing]);
      });

      await steps.step('Verify the request status - it is still Pending Approval and not approved', async () => {
        expect(await policyApprovalsPage.isInQueue(policy.nameEn)).toBe(true);
        const versions = await readPolicyVersions(page, policy.id);
        expect(versionIn(versions, 'published'), 'not approved').toBeUndefined();
      });
    });
  }

  test(`TC-${CASES.memberAndNetwork.azureId}: should approve a policy change holding at least one Member and one Network`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('PendingApproval', { type: 'individual' });
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the change request with one Member and one Network - both are listed', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.readTabCount('members')).toBe(1);
      expect(await policyDetailPage.readTabCount('networks')).toBe(1);
      await policyApprovalsPage.open();
      await policyApprovalsPage.expectInQueue(policy.nameEn);
    });

    await steps.critical('Click Approve - a confirmation prompt is displayed', async () => {
      dialog = await policyApprovalsPage.openApproveDialog(policy.nameEn);
      expect(await dialog.isVisible()).toBe(true);
    });

    await steps.step('Confirm the approval - the status changes to Approved', async () => {
      await dialog.confirm('Approve');
      await policyApprovalsPage.waitForDecisionProcessed(policy.nameEn);
      expect(versionIn(await readPolicyVersions(page, policy.id), 'published')).toBeDefined();
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Approved/);
    });
  });

  test(`TC-${CASES.alreadyApproved.azureId}: should block a second approval of an already approved change`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('PendingApproval', { type: 'individual' });
    let requestId = '';

    await steps.critical('Precondition: the change request is approved (its request id kept)', async () => {
      requestId = await pendingPolicyRequestId(page, policy.nameEn);
      expect(requestId).not.toBe('');
      await policyApprovalsPage.open();
      await policyApprovalsPage.approve(policy.nameEn);
    });

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the already-approved change request - it shows Approved', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Approved/);
    });

    await steps.step('Check for the Approve button - it is disabled or not displayed', async () => {
      expect((await policyApprovalsPage.getDecisionAvailability(policy.nameEn)).approve).toBe(false);
    });

    await steps.step('Attempt the approval again directly - the system blocks it with a message that the request is already approved', async () => {
      const answer = await policyApprovalsPage.approveRequestViaApi(requestId);
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(ALREADY_DECIDED);
      expect((await readPolicyVersions(page, policy.id)).filter((v) => v.versionStatusCode === 'published').length, 'one approved version').toBe(1);
    });
  });

  test(`TC-${CASES.rejectNotPending.azureId}: should not allow rejecting a change that is not pending approval`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('PendingApproval', { type: 'individual' });
    let requestId = '';

    await steps.critical('Precondition: the change request is returned to Draft (its request id kept)', async () => {
      requestId = await pendingPolicyRequestId(page, policy.nameEn);
      expect(requestId).not.toBe('');
      const edited = await updatePolicyFields(page, policy.id, { gracePeriodDays: 3 }, { confirmRevertToDraft: true });
      expect(edited.status, edited.text.slice(0, 200)).toBe(200);
    });

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open a change request with status Draft - it shows Draft', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Draft/);
    });

    await steps.step('Check for the Reject button - it is disabled or not displayed', async () => {
      expect((await policyApprovalsPage.getDecisionAvailability(policy.nameEn)).reject).toBe(false);
    });

    await steps.step('Attempt the rejection directly - the system blocks it with a message that the request is not eligible for rejection', async () => {
      const answer = await policyApprovalsPage.rejectRequestViaApi(requestId, 'Not eligible check.');
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(NOT_ELIGIBLE);
      expect(versionIn(await readPolicyVersions(page, policy.id), 'rejected'), 'no rejection recorded').toBeUndefined();
    });
  });

  test(`TC-${CASES.auditTrail.azureId}: should record approver, time, resulting status and reason for approvals and rejections`, async ({
    policyManagementPage,
    policyDetailPage,
    policyVersionHistoryTab,
    policyApprovalsPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.auditTrail;
    const approved = await policyIn('PendingApproval', { type: 'individual' });
    const rejected = await policyIn('PendingApproval', { type: 'individual' });
    const checklist: Record<string, boolean> = {};

    await steps.critical('Navigate to the Policy Management module - the module home page is displayed', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(approved.nameEn)).toBe(true);
    });

    await steps.critical('Open a change request and approve it - the status changes to Approved', async () => {
      await policyApprovalsPage.open();
      await policyApprovalsPage.approve(approved.nameEn);
      await policyDetailPage.open(approved.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Approved/);
    });

    await steps.step('Open the request\'s history log - it shows the approver\'s name, the approval date and time, and the resulting status', async () => {
      await policyVersionHistoryTab.open();
      const row = (await policyVersionHistoryTab.readRows()).find((r) => /Approved/.test(r.status));
      checklist['approval: actor'] = !!row?.reviewedBy;
      checklist['approval: date and time'] = DATE_TIME.test(row?.reviewedOn ?? '');
      checklist['approval: status'] = !!row;
      expect(row, 'an Approved row').toBeDefined();
      expect(row!.reviewedBy).not.toBe('');
      expect(row!.reviewedOn).toMatch(DATE_TIME);
    });

    await steps.step(`Repeat on a separate request using Reject with the reason "${data.reason}" - the status changes to Rejected`, async () => {
      const decided = await policyApprovalsPage.decideWithComment(rejected.nameEn, 'reject', data.reason);
      expect(decided.stillQueued, decided.answer).toBe(false);
      await policyDetailPage.open(rejected.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Rejected/);
    });

    await steps.step('Open the rejected request\'s history log - it shows the reviewer\'s name, the time, the rejection reason and the resulting status', async () => {
      await policyVersionHistoryTab.open();
      const row = (await policyVersionHistoryTab.readRows()).find((r) => /Rejected/.test(r.status));
      expect(row, 'a Rejected row').toBeDefined();
      const details = await policyVersionHistoryTab.viewVersion(row!.version);
      checklist['rejection: actor'] = !!row!.reviewedBy;
      checklist['rejection: date and time'] = DATE_TIME.test(row!.reviewedOn);
      checklist['rejection: status'] = true;
      checklist['rejection: reason'] = `${details.reviewNote} ${await policyVersionHistoryTab.getDrawerText()}`.includes(data.reason);
      expect(row!.reviewedBy).not.toBe('');
      expect(row!.reviewedOn).toMatch(DATE_TIME);
      expect(checklist['rejection: reason'], `the rejection reason "${data.reason}" in the history (the version shows: "${(details.reviewNote || await policyVersionHistoryTab.getDrawerText()).slice(0, 200)}")`).toBe(true);
    });

    await steps.step('Confirm the checklist (actor, timestamp, action / status, reason) for both records - every item is satisfied', async () => {
      expect(Object.entries(checklist).filter(([, ok]) => !ok).map(([item]) => item), 'checklist items missing').toEqual([]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
