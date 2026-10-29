import { test, expect } from '../../../fixtures';
import { BUDGET, FACILITY_ACTIVE, today } from '../../../data/networks/facilities.data';
import { CASE, IN_PROGRESS, NO_DATE, PROPOSED, START, STATE } from '../../../data/networks/facilityApprovalStates.data';

/**
 * User story 14307: Track the approval state of pending pharmacy assignment
 * changes - every state side by side, the badges that tell them apart, who may
 * decide, and how a decision in the approvals module shows up here.
 *
 * A network carries ONE change set at a time, so the four in-progress states
 * need two networks: one holding a draft (an addition and a removal), one
 * holding the same change submitted.
 */
test.describe('US 14307 - States side by side and approvals', () => {
  test(`TC-${CASE.decisionTable}: should label and date every action/approval combination as the decision table says`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.twoLiveNetworks);
    const drafted = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });
    const pending = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });
    const tab = () => networkDetailPage.facilities();

    await steps.critical('Navigate to the networks and stage an addition and a removal on each, submitting the second', async () => {
      for (const network of [drafted, pending]) {
        await networkDetailPage.open(network.id);
        await tab().open();
        expect((await tab().assign([PROPOSED.code]))?.status).toBeLessThan(300);
        expect((await tab().attemptRemove(START.removed.code)).outcome?.status).toBeLessThan(300);
      }
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(pending.name);
    });

    await steps.step('Draft rows: Draft Assignment undated, Draft Removal keeping its date', async () => {
      await networkDetailPage.open(drafted.id);
      await tab().open();
      expect(await tab().findRow(PROPOSED.code)).toMatchObject({ assignment: STATE.draftAssignment, assignedOn: NO_DATE });
      expect(await tab().findRow(START.removed.code)).toMatchObject({ assignment: STATE.draftRemoval, assignedOn: today() });
    });

    await steps.step('Pending rows: Pending Assignment undated, Pending Removal keeping its date', async () => {
      await networkDetailPage.open(pending.id);
      await tab().open();
      expect(await tab().findRow(PROPOSED.code)).toMatchObject({ assignment: STATE.pendingAssignment, assignedOn: NO_DATE });
      expect(await tab().findRow(START.removed.code)).toMatchObject({ assignment: STATE.pendingRemoval, assignedOn: today() });
    });

    await steps.step('The approved row shows the active status with its date', async () => {
      expect(await tab().findRow(START.kept.code)).toMatchObject({ status: FACILITY_ACTIVE, assignedOn: today() });
    });
  });

  test(`TC-${CASE.distinctLabels}: should show a distinct label for each of the four in-progress states`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.twoLiveNetworks);
    const drafted = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });
    const pending = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });
    const labels: string[] = [];

    await steps.critical('Navigate to the networks holding one facility in each in-progress state', async () => {
      for (const network of [drafted, pending]) {
        await networkDetailPage.open(network.id);
        await networkDetailPage.facilities().open();
        expect((await networkDetailPage.facilities().assign([PROPOSED.code]))?.status).toBeLessThan(300);
        expect((await networkDetailPage.facilities().attemptRemove(START.removed.code)).outcome?.status).toBeLessThan(300);
      }
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(pending.name);
    });

    await steps.step('The unsubmitted addition and removal read Draft Assignment and Draft Removal', async () => {
      await networkDetailPage.open(drafted.id);
      await networkDetailPage.facilities().open();
      labels.push(...(await networkDetailPage.facilities().readRows()).map((r) => r.assignment));
      expect(labels).toEqual(expect.arrayContaining([STATE.draftAssignment, STATE.draftRemoval]));
    });

    await steps.step('The submitted addition and removal read Pending Assignment and Pending Removal', async () => {
      await networkDetailPage.open(pending.id);
      await networkDetailPage.facilities().open();
      labels.push(...(await networkDetailPage.facilities().readRows()).map((r) => r.assignment));
      expect(labels).toEqual(expect.arrayContaining([STATE.pendingAssignment, STATE.pendingRemoval]));
      expect(new Set(labels.filter((l) => (IN_PROGRESS as readonly string[]).includes(l))).size, 'four distinct labels').toBe(4);
    });
  });

  test(`TC-${CASE.approversOnly}: should let only an approver decide a pending facility change`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    requireNonAdmin,
    nonAdminSession,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    requireNonAdmin({ lacking: ['approvePayer'] });
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });

    await steps.critical('Navigate to the network and submit an assignment - it is Pending Assignment', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([PROPOSED.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
    });

    await steps.step('The coordinator sees the Pending status but no Approve or Reject', async () => {
      await nonAdminSession.networkDetail.open(network.id);
      await nonAdminSession.networkDetail.facilities().open();
      await nonAdminSession.networkDetail.facilities().expectAssignmentState(PROPOSED.code, STATE.pendingAssignment);
      await nonAdminSession.networkApprovals.open();
      const decision = await nonAdminSession.networkApprovals.getDecisionAvailability(network.name);
      expect({ approve: decision.approve, reject: decision.reject }).toEqual({ approve: false, reject: false });
    });

    await steps.step('The approver is offered Approve and Reject', async () => {
      await networkApprovalsPage.open();
      expect(await networkApprovalsPage.getDecisionAvailability(network.name)).toEqual({ inQueue: true, approve: true, reject: true });
    });

    await steps.step('The approver\'s approval settles the assignment', async () => {
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toContain(PROPOSED.code);
    });
  });

  test(`TC-${CASE.workflowSync}: should reflect a decision taken in the approvals module on the facilities list`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });

    await steps.critical('Navigate to the network and submit an assignment - a task appears in the approval queue', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([PROPOSED.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('The approval is processed in the approvals module', async () => {
      await networkApprovalsPage.approve(network.name);
    });

    await steps.step('Back on the facilities list the assignment is settled and dated', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().findRow(PROPOSED.code)).toMatchObject({ assignedOn: today() });
      expect(await networkDetailPage.facilities().getSettledCodes()).toContain(PROPOSED.code);
    });
  });

  test(`TC-${CASE.dateMatchesApproval}: should date the assignment with the day it was approved`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });
    let approvedOn = '';

    await steps.critical('Navigate to the network and submit an assignment - it is Pending Assignment', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([PROPOSED.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().expectAssignmentState(PROPOSED.code, STATE.pendingAssignment);
    });

    await steps.critical('The request is approved on a known date (today)', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      approvedOn = today();
      expect(approvedOn).not.toBe('');
    });

    await steps.step('Assigned On equals the approval date exactly', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().findRow(PROPOSED.code))?.assignedOn).toBe(approvedOn);
    });
  });
});
