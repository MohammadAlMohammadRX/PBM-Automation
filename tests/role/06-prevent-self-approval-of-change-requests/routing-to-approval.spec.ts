import { test, expect } from '../../../fixtures';
import { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import { assignANetwork } from '../../../fixtures/payerState.fixture';
import { CASES, PAYER_EDIT_FIELD, PAYER_PENDING_APPROVAL, newLicence, newNetworkDescription } from '../../../data/role/preventSelfApprovalOfChangeRequests.data';
import {
  expectQueued,
  offeredAsActivePayer,
  payerApprovalStatus,
  reviewedField,
  submitFormularyChange,
  submitNetworkChange,
  submitPayerChange,
  submitPlanChange,
  submitPolicyChange,
} from '../../../utils/role/writerEHelpers';

/**
 * US 21285 - Prevent Self-Approval of Change Requests: every change to payers, networks, plans, policies and
 * formularies, and every new registration (a new suite payer - lead decision 7), goes to Approval Management
 * before it takes effect. careconnect makes the changes on the suite's own records; each request is tracked and
 * rejected at teardown. See data/role/preventSelfApprovalOfChangeRequests.data.ts.
 */
test.describe('US 21285 - Prevent Self-Approval of Change Requests', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.payerChangeRouted.azureId}: should route a payer change to Approval Management before it takes effect`, async ({ steps, page, roleAdmin, suitePayers, suiteApprovals }) => {
    const payer = await suitePayers.publish();
    suiteApprovals.track(payer.name);
    const licence = newLicence('P');

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Edit an existing payer's details ("${payer.name}" ${PAYER_EDIT_FIELD}) and save the change - the change moves to a "Pending Approval" state rather than applying immediately`, async () => {
      await submitPayerChange(page, payer.name, PAYER_EDIT_FIELD, licence);
      expect(await payerApprovalStatus(page, payer.name), `the approval status of "${payer.name}"`).toMatch(PAYER_PENDING_APPROVAL);
    });

    await steps.step('Open Approval Management - the pending payer change request is listed for review', async () => {
      await expectQueued(page, 'payer', payer.name);
      const row = await reviewedField(page, payer.name, /licen[cs]e/i);
      expect(row, `the Review panel's ${PAYER_EDIT_FIELD} row`).not.toBeNull();
      expect({ after: row?.after, beforeIsOld: row?.before !== licence }, `Review: ${row?.field} ${row?.before} -> ${row?.after}`).toEqual({ after: licence, beforeIsOld: true });
    });
  });

  test(`TC-${CASES.otherChangesRouted.azureId}: should route network, plan, policy and formulary changes to Approval Management`, async ({ steps, page, roleAdmin, networkIn, planIn, policyIn, formularyIn, suiteApprovals }) => {
    const network = await networkIn('Pending');
    const plan = await planIn('Active');
    const policy = await policyIn('Future');
    const formulary = await formularyIn('Future');
    const names = { network: network.name, plan: plan.name, policy: policy.nameEn, formulary: formulary.nameEn };
    Object.values(names).forEach((name) => suiteApprovals.track(name));

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical('Make and save a change to a Network, a Plan, a Policy, and a Formulary record in turn - each change enters a pending-approval state', async () => {
      await submitNetworkChange(page, network, newNetworkDescription('22046'));
      await submitPlanChange(page, plan);
      await submitPolicyChange(page, policy);
      await submitFormularyChange(page, formulary);
      const pending = {
        network: (await suiteApprovals.pendingId(names.network)) !== '',
        plan: (await suiteApprovals.pendingId(names.plan)) !== '',
        policy: (await suiteApprovals.pendingId(names.policy)) !== '',
        formulary: (await suiteApprovals.pendingId(names.formulary)) !== '',
      };
      expect(pending, 'a pending approval request per entity').toEqual({ network: true, plan: true, policy: true, formulary: true });
    });

    await steps.step('Open Approval Management - all four pending requests appear, one per entity type', async () => {
      await expectQueued(page, 'network', names.network);
      await expectQueued(page, 'plan', names.plan);
      await expectQueued(page, 'policy', names.policy);
      await expectQueued(page, 'formulary', names.formulary);
      expect(Object.keys(names)).toHaveLength(4);
    });
  });

  test(`TC-${CASES.newRegistrationRouted.azureId}: should route a new payer registration to Approval Management before it becomes active`, async ({ steps, page, roleAdmin, draftPayer, suiteApprovals }) => {
    suiteApprovals.track(draftPayer.nameEn);

    await steps.critical('Navigate to the Role Management module - the Role Management list page loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.critical(`Submit a new registration (a new payer "${draftPayer.nameEn}") - the registration enters a pending state`, async () => {
      const payers = new PayerManagementPage(page);
      await payers.open();
      await assignANetwork(payers, draftPayer.nameEn);
      await payers.sendForApproval(draftPayer.nameEn);
      expect(await payerApprovalStatus(page, draftPayer.nameEn), `the approval status of "${draftPayer.nameEn}"`).toMatch(PAYER_PENDING_APPROVAL);
      expect(await offeredAsActivePayer(page, draftPayer.nameEn), 'the pending payer among the ACTIVE payers (GetPayersDropdown)').toBe(false);
    });

    await steps.step('Open Approval Management - the new registration request appears for review', async () => {
      await expectQueued(page, 'payer', draftPayer.nameEn);
      expect(await suiteApprovals.pendingId(draftPayer.nameEn), `a pending request for "${draftPayer.nameEn}"`).not.toBe('');
    });
  });
});
