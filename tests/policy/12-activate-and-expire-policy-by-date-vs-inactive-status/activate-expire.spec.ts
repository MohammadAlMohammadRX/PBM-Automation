import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { PolicyDetailPage } from '../../../pages/policy/PolicyDetailPage';
import type { ApprovalManagementPage } from '../../../pages/approval/ApprovalManagementPage';
import type { PolicyInactivateDrawer } from '../../../pages/policy/PolicyInactivateDrawer';
import { CASES, NO_EXPIRED_REASON, UNMET_REQUIREMENT } from '../../../data/policy/activateExpire.data';
import { DIALOG, FIELD_MESSAGE, POLICY_STATUS_LABEL } from '../../../data/policy/policy.data';
import {
  policyStatusCode,
  readPolicy,
  readPolicyAuditTrail,
  requestApprovePolicy,
  unassignPolicyNetwork,
  type ProvisionedPolicy,
} from '../../../utils/PolicyProvisioning';
import {
  expectAccepted,
  expectRefused,
  findExpiredPolicy,
  inactivationEntry,
  inactiveFromActiveSeed,
  refused,
  said,
  waitUntilPast,
} from '../../../utils/policy/writerBHelpers';

/** Activate (confirmed), Send for Approval and approve in the hub - the application's whole activation path. */
async function activateThroughApproval(detail: PolicyDetailPage, approvals: ApprovalManagementPage, policy: ProvisionedPolicy): Promise<void> {
  await detail.open(policy.id);
  expectAccepted(await detail.activate(), 'Activate');
  await detail.open(policy.id);
  expectAccepted(await detail.sendForApproval(), 'Send for Approval');
  await approvals.approve(policy.nameEn);
}

/** Inactivate with a reason (and details), Send for Approval and approve in the hub. */
async function inactivateThroughApproval(page: Page, detail: PolicyDetailPage, approvals: ApprovalManagementPage, policy: ProvisionedPolicy, details: string, reason?: string): Promise<void> {
  await detail.open(policy.id);
  const drawer = await detail.openInactivate();
  expectAccepted(await drawer.inactivate(details, reason), 'Inactivate');
  await detail.open(policy.id);
  expectAccepted(await detail.sendForApproval(), 'Send for Approval');
  await approvals.approve(policy.nameEn);
  await expect.poll(() => policyStatusCode(page, policy.id), { message: 'the policy should read Inactive once approved' }).toBe('inactive');
}

/**
 * User story 15181: Activate and expire Policy by date vs Inactive status.
 * Inactivate with a required reason, Activate an Inactive policy (members and
 * history untouched), Inactive and Expired kept apart. Every change goes
 * through the approval gate. See the data file.
 */
test.describe('US 15181 - Activate and expire Policy by date vs Inactive status', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.manualActivate.azureId}: should reactivate an Inactive policy through the Activate action`, async ({
    policyManagementPage,
    policyDetailPage,
    policyConfirmDialog,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await inactiveFromActiveSeed(page, policyIn);

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Inactive policy - the policy detail shows the Activate action available', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getStatus()).toBe(POLICY_STATUS_LABEL.inactive);
      expect(await policyDetailPage.getActionAvailability('activate')).toBe('available');
    });

    await steps.critical('Click Activate - a confirmation prompt is displayed', async () => {
      await policyDetailPage.clickAction('activate');
      await policyConfirmDialog.waitForVisible();
      expect(await policyConfirmDialog.getTitle()).toBe(DIALOG.activate.title);
      await policyConfirmDialog.cancel();
    });

    await steps.step('Confirm the activation - the policy status updates to Active', async () => {
      await activateThroughApproval(policyDetailPage, policyApprovalsPage, policy);
      await waitUntilPast(page, policy.effectiveDate);
      await expect.poll(() => policyStatusCode(page, policy.id), { timeout: 60_000, message: 'the reactivated policy (effective time passed) should read Active' }).toBe('active');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getStatus()).toBe(POLICY_STATUS_LABEL.active);
    });
  });

  test(`TC-${CASES.inactivateWithReason.azureId}: should set a live policy to Inactive with its reason recorded`, async ({
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.inactivateWithReason;
    const policy = await policyIn('Future');
    let drawer!: PolicyInactivateDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy and select the Inactivate action - the Inactivate dialog opens requesting a reason', async () => {
      await policyDetailPage.open(policy.id);
      drawer = await policyDetailPage.openInactivate();
      expect(await drawer.getReasonOptions()).toContain(data.reason);
    });

    await steps.critical('Enter a valid reason and confirm - the policy status updates', async () => {
      expectAccepted(await drawer.inactivate(data.details, data.reason), 'Inactivate');
      await policyDetailPage.open(policy.id);
      expectAccepted(await policyDetailPage.sendForApproval(), 'Send for Approval');
      await policyApprovalsPage.approve(policy.nameEn);
      await expect.poll(() => policyStatusCode(page, policy.id), { message: 'the inactivation should take effect once approved' }).toBe('inactive');
    });

    await steps.step('Verify the policy status field - it shows Inactive, with the reason recorded and not Expired', async () => {
      await policyDetailPage.open(policy.id);
      expect({
        status: await policyDetailPage.getStatus(),
        overview: await policyDetailPage.readOverviewField('status'),
        reason: await policyDetailPage.readOverviewField('inactivationReason'),
        details: await policyDetailPage.readOverviewField('inactivationDetails'),
      }).toEqual({ status: POLICY_STATUS_LABEL.inactive, overview: POLICY_STATUS_LABEL.inactive, reason: data.reason, details: data.details });
    });
  });

  test(`TC-${CASES.reasonRequired.azureId}: should require a reason before a policy can be inactivated`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    const statusBefore = await policyStatusCode(page, policy.id);
    let drawer!: PolicyInactivateDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy and select the Inactivate action - the Inactivate dialog opens', async () => {
      await policyDetailPage.open(policy.id);
      drawer = await policyDetailPage.openInactivate();
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step('Leave the reason field empty and attempt to confirm - a required-field validation error is displayed', async () => {
      const attempt = await drawer.attemptConfirm();
      expect(attempt.closed, `the drawer closed without a reason (${attempt.toast})`).toBe(false);
      expect((await drawer.getFieldErrors()).reason).toBe(FIELD_MESSAGE.required);
    });

    await steps.step('Verify the policy status remains unchanged - it is still what it was before (not Inactive)', async () => {
      const record = await readPolicy(page, policy.id);
      expect({ status: await policyStatusCode(page, policy.id), staged: record.hasDraft }).toEqual({ status: statusBefore, staged: false });
    });
  });

  test(`TC-${CASES.activationRequirements.azureId}: should refuse to reactivate an Inactive policy that fails an activation requirement`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Inactive');
    const network = policy.networks[0];
    const staged = network ? await unassignPolicyNetwork(page, policy.id, network.networkId) : { status: -1, text: 'the policy has no network' };
    if (refused(staged)) steps.blocked(`the unmet requirement (no network) could not be staged: UnassignPolicyNetwork answered ${said(staged)}`);
    let outcome = { status: -1, text: '' };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Inactive policy that is missing a required activation condition - the policy detail shows the Activate action', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getActionAvailability('activate')).toBe('available');
    });

    await steps.step('Click Activate - the system validates the activation requirements', async () => {
      const activation = await policyDetailPage.activate();
      if (refused(activation)) {
        outcome = activation;
      } else {
        await policyDetailPage.open(policy.id);
        expectAccepted(await policyDetailPage.sendForApproval(), 'Send for Approval');
        outcome = await requestApprovePolicy(page, policy.nameEn);
      }
      expect(outcome.status, 'an answer to the activation').not.toBe(-1);
    });

    await steps.step('Review the result - activation is rejected with a message listing the unmet requirement, and the status remains Inactive', async () => {
      expectRefused(outcome, 'activating a policy without a network');
      expect(said(outcome)).toMatch(UNMET_REQUIREMENT);
      expect(await policyStatusCode(page, policy.id)).toBe('inactive');
    });
  });

  test(`TC-${CASES.inactiveVsExpired.azureId}: should keep Inactive and Expired as two distinct statuses with different actions`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const expired = await findExpiredPolicy(page) ?? steps.blocked(NO_EXPIRED_REASON);
    const inactive = await policyIn('Inactive');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(inactive.nameEn)).toBe(true);
    });

    await steps.step('Open the manually inactivated policy and verify its status - it shows Inactive, not Expired', async () => {
      await policyDetailPage.open(inactive.id);
      expect(await policyDetailPage.getStatus()).toBe(POLICY_STATUS_LABEL.inactive);
    });

    await steps.step('Open the policy that passed its end date and verify its status - it shows Expired, not Inactive', async () => {
      await policyDetailPage.open(expired.id);
      expect(await policyDetailPage.getStatus()).toBe(POLICY_STATUS_LABEL.expired);
    });

    await steps.step('Verify the available actions differ between the two - Activate is available only for the Inactive policy', async () => {
      await policyDetailPage.open(inactive.id);
      const onInactive = await policyDetailPage.getActionAvailability('activate');
      await policyDetailPage.open(expired.id);
      const onExpired = await policyDetailPage.getActionAvailability('activate');
      expect({ inactive: onInactive, expired: onExpired === 'available' }).toEqual({ inactive: 'available', expired: false });
    });
  });

  test(`TC-${CASES.membersKept.azureId}: should leave the enrolled members unchanged when a policy is reactivated`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.membersKept;
    const policy = await inactiveFromActiveSeed(page, policyIn, { type: 'individual', members: data.members });
    let before: { number: string; state: string }[] = [];
    const roster = async (): Promise<{ number: string; state: string }[]> => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      return (await policyMembersTab.readRows()).map((r) => ({ number: r.number, state: r.state })).sort((a, b) => a.number.localeCompare(b.number));
    };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Inactive policy\'s Members tab and record the enrolled members and their statuses - the member list is captured', async () => {
      before = await roster();
      expect(before.length).toBe(data.members);
    });

    await steps.step('Activate the policy - the policy status changes to Active', async () => {
      await activateThroughApproval(policyDetailPage, policyApprovalsPage, policy);
      await waitUntilPast(page, policy.effectiveDate);
      await expect.poll(() => policyStatusCode(page, policy.id), { timeout: 60_000, message: 'the reactivated policy (effective time passed) should read Active' }).toBe('active');
    });

    await steps.step('Re-open the Members tab - the enrolled members are unchanged, with the same members and statuses as before', async () => {
      expect(await roster()).toEqual(before);
    });
  });

  test(`TC-${CASES.expiredNoActivate.azureId}: should offer no Activate action on an Expired policy`, async ({
    policyManagementPage,
    policyDetailPage,
    page,
    steps,
  }) => {
    const expired = await findExpiredPolicy(page) ?? steps.blocked(NO_EXPIRED_REASON);

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Open the Expired policy - the policy detail is displayed', async () => {
      await policyDetailPage.open(expired.id);
      expect(await policyDetailPage.getStatus()).toBe(POLICY_STATUS_LABEL.expired);
    });

    await steps.step('Check for an Activate action - it is not available for Expired policies', async () => {
      expect(await policyDetailPage.getActionAvailability('activate')).not.toBe('available');
    });
  });

  test(`TC-${CASES.historyKept.azureId}: should keep the policy history and append the inactivation event`, async ({
    policyManagementPage,
    policyDetailPage,
    policyAuditTab,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    let before: string[] = [];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy and record its history / audit trail before inactivation - the history entries are captured', async () => {
      await policyDetailPage.open(policy.id);
      await policyAuditTab.open();
      before = (await readPolicyAuditTrail(page, policy.id)).items.map((e) => e.id);
      expect(before.length).toBeGreaterThan(0);
      expect((await policyAuditTab.readAllEntries()).length).toBeGreaterThan(0);
    });

    await steps.critical('Inactivate the policy with a valid reason - the status updates to Inactive', async () => {
      await inactivateThroughApproval(page, policyDetailPage, policyApprovalsPage, policy, CASES.historyKept.details);
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getStatus()).toBe(POLICY_STATUS_LABEL.inactive);
    });

    await steps.step('Open the policy\'s history / audit log again - every prior entry remains and the inactivation event is appended', async () => {
      const after = (await readPolicyAuditTrail(page, policy.id)).items;
      expect(before.filter((id) => !after.some((e) => e.id === id)), 'prior entries missing').toEqual([]);
      // The approved inactivation is audited as an UPDATE (IsActive true -> false with its reason), not a
      // STATUS_CHANGE (live 2026-11-03): the entry recording it is looked for, whatever its action type.
      const added = after.filter((e) => !before.includes(e.id));
      const recorded = await inactivationEntry(page, added);
      expect(recorded?.entry.actionType ?? null, `an entry recording the inactivation among the new ones (${added.map((e) => e.actionType).join(', ') || 'none'})`).not.toBeNull();
      await policyAuditTab.expectEntry(recorded?.entry.actionType === 'UPDATE' ? /Policy updated/i : /Status chang/i);
    });
  });
});

