import { test, expect } from '../../../fixtures';
import type { NetworkDetailPage } from '../../../pages/network/NetworkDetailPage';
import type { ApprovalManagementPage } from '../../../pages/approval/ApprovalManagementPage';
import type { ProvisionedNetwork } from '../../../utils/NetworkProvisioning';
import { NETWORK_LIFECYCLE } from '../../../data/networks/network.data';
import {
  BLOCKED_CASES,
  CASE,
  DELETED_STATUS,
  DELETE_AUDIT_ACTION,
  NETWORK_CODE_PATTERN,
} from '../../../data/networks/networkCodeRetention.data';

/**
 * User story 14142: Retain network codes permanently without reuse.
 * Retention: a deleted network's code is never handed out again, stays on the
 * record, and the record stays findable for audit.
 *
 * "Soft delete" of a published network = its deletion staged, sent for
 * approval and approved - the application's own route. Every network deleted
 * here is the case's own.
 */

/** Stages, submits and approves a published network's deletion (the approved soft delete). */
async function applyDeletion(detail: NetworkDetailPage, approvals: ApprovalManagementPage, network: ProvisionedNetwork): Promise<void> {
  await detail.open(network.id);
  const result = await detail.deleteAndCapture();
  expect(result.outcome?.status, `DeleteNetwork: ${result.outcome?.text.slice(0, 200)}`).toBeLessThan(300);
  await detail.open(network.id);
  await detail.submitForApproval();
  await approvals.open();
  await approvals.approve(network.name);
}

test.describe('US 14142 - Code retention after deletion', () => {
  test(`TC-${CASE.neverReassigned}: should never reassign a soft-deleted network's code when a new network is created afterwards`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const deleted = await networkIn('Pending', { facilities: 0 });
    let oldCode = '';

    await steps.critical('Navigate to the module - Network C carries its code', async () => {
      await networkManagementPage.openList();
      oldCode = (await networkManagementPage.readNetworkRecord(deleted.id)).networkCode ?? '';
      expect(oldCode).toMatch(NETWORK_CODE_PATTERN);
    });

    await steps.critical('Soft-delete Network C - it leaves the active list', async () => {
      await applyDeletion(networkDetailPage, networkApprovalsPage, deleted);
      expect(await networkManagementPage.isListed(deleted.name)).toBe(false);
    });

    await steps.step('A new network is created with a new code, never the deleted one', async () => {
      const created = await networkIn('Pending', { facilities: 0 });
      const newCode = (await networkManagementPage.readNetworkRecord(created.id)).networkCode ?? '';
      expect(newCode).toMatch(NETWORK_CODE_PATTERN);
      expect(newCode, `${oldCode} must not be reassigned`).not.toBe(oldCode);
    });
  });

  test(`TC-${CASE.decisionTable}: should keep codes unique and never reusable across active and soft-deleted states when each rule is exercised`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const existing = await networkIn('Pending', { facilities: 0 });
    const d = await networkIn('Pending', { facilities: 0 });
    let codeD = '';

    await steps.critical('Navigate to the module with Network C in place', async () => {
      await networkManagementPage.openList();
      expect((await networkManagementPage.readNetworkRecord(existing.id)).networkCode).toMatch(NETWORK_CODE_PATTERN);
    });

    await steps.step('Scenario 1: Network D (active) gets a unique code with no conflict', async () => {
      codeD = (await networkManagementPage.readNetworkRecord(d.id)).networkCode ?? '';
      expect(codeD).toMatch(NETWORK_CODE_PATTERN);
      expect(codeD).not.toBe((await networkManagementPage.readNetworkRecord(existing.id)).networkCode);
    });

    await steps.step('Scenario 2: soft-delete D, create E - E gets a new code', async () => {
      await applyDeletion(networkDetailPage, networkApprovalsPage, d);
      const e = await networkIn('Pending', { facilities: 0 });
      expect((await networkManagementPage.readNetworkRecord(e.id)).networkCode).not.toBe(codeD);
    });

    await steps.step('Scenario 3: the soft-deleted D still shows its original code', async () => {
      await networkDetailPage.openExpectingFailure(d.id);
      expect(await networkDetailPage.isLoaded(), 'the soft-deleted record should stay viewable').toBe(true);
      expect((await networkDetailPage.readOverview()).code).toBe(codeD);
    });

    await steps.step('Scenario 4: a new record offers no way to enter D\'s old code', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      expect(await form.offersNetworkCodeField(), 'code entry is not exposed, so a retired code cannot be reused').toBe(false);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${CASE.unchangedOnDelete}: should keep the network's code unchanged when an Active network is soft-deleted`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const network = await networkIn('Active', { facilities: 0 });
    let code = '';

    await steps.critical('Navigate to Network F - its code shows and its status is Active', async () => {
      await networkDetailPage.open(network.id);
      code = (await networkDetailPage.readOverview()).code;
      expect(code).toMatch(NETWORK_CODE_PATTERN);
      expect(await networkDetailPage.getStatus()).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.critical('Soft-delete Network F - it leaves the active list', async () => {
      await applyDeletion(networkDetailPage, networkApprovalsPage, network);
      expect(await networkManagementPage.isListed(network.name)).toBe(false);
    });

    await steps.step('The archived record shows status Deleted and the unchanged code', async () => {
      await networkDetailPage.openExpectingFailure(network.id);
      expect(await networkDetailPage.isLoaded(), 'the deleted record should be found').toBe(true);
      expect(await networkDetailPage.getStatus()).toMatch(DELETED_STATUS);
      expect((await networkDetailPage.readOverview()).code).toBe(code);
    });
  });

  test(`TC-${CASE.fieldsRetained}: should keep every original field of a soft-deleted network when the record is viewed for audit`, async ({
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', { facilities: 0 });
    let before!: Awaited<ReturnType<typeof networkDetailPage.readOverview>>;
    let name = '';

    await steps.critical('Navigate to Network G, record its fields and soft-delete it', async () => {
      await networkDetailPage.open(network.id);
      before = await networkDetailPage.readOverview();
      name = await networkDetailPage.getName();
      expect(before.code).toMatch(NETWORK_CODE_PATTERN);
      await applyDeletion(networkDetailPage, networkApprovalsPage, network);
    });

    await steps.step('Every checklist field matches its pre-deletion value', async () => {
      await networkDetailPage.openExpectingFailure(network.id);
      expect(await networkDetailPage.isLoaded(), 'the soft-deleted record should be retrievable').toBe(true);
      const after = await networkDetailPage.readOverview();
      expect(await networkDetailPage.getName()).toBe(name);
      expect({ ...after, status: '' }, 'code, names, type, descriptions and dates must not be cleared').toEqual({ ...before, status: '' });
    });
  });

  test(`TC-${CASE.adminOnlyAudit}: should open soft-deleted network records only to the System Administrator when both roles try the audit view`, async ({
    networkManagementPage,
    auditLogsPage,
    nonAdminSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilities: 0 });
    let code = '';

    await steps.critical('Navigate to the module and soft-delete a network', async () => {
      code = await networkManagementPage.readCode(network.name);
      expect((await networkManagementPage.deleteNetwork(network.name))?.status).toBeLessThan(300);
    });

    await steps.step('The Network Administrator role is denied the audit records view', async () => {
      const access = await nonAdminSession.auditLogs.openAndReportAccess();
      expect(access.reachable, `the non-administrator reached ${access.url}`).toBe(false);
    });

    await steps.step('The System Administrator sees the soft-deleted record with its original code', async () => {
      const rows = await auditLogsPage.findRowsMentioning(code);
      expect(rows.length, `the audit view should hold ${code}`).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASE.auditSearch}: should find a soft-deleted network by its original code when the System Administrator searches the audit records`, async ({
    networkManagementPage,
    auditLogsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilities: 0 });
    let code = '';

    await steps.critical('Navigate to the module and soft-delete a network, noting its code', async () => {
      code = await networkManagementPage.readCode(network.name);
      expect((await networkManagementPage.deleteNetwork(network.name))?.status).toBeLessThan(300);
    });

    await steps.step('Searching the audit records by that code returns the soft-deleted record', async () => {
      const rows = await auditLogsPage.findRowsMentioning(code);
      expect(rows.length, `a record for ${code}`).toBeGreaterThan(0);
    });

    await steps.step('The record shows its original code, a Deleted marking and its details', async () => {
      const rows = await auditLogsPage.findRowsMentioning(code);
      expect(rows.map((row) => row.actionType).join(' | ')).toMatch(DELETE_AUDIT_ACTION);
      expect(rows.filter((row) => row.entityId.includes(code)).length).toBeGreaterThan(0);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
