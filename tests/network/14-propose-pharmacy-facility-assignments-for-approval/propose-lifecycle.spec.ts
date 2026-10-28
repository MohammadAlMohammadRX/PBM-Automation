import { test, expect } from '../../../fixtures';
import { ASSIGNMENT_STATE, BUDGET, codeOfOption, today } from '../../../data/networks/facilities.data';
import { CASE, MEMBERSHIP } from '../../../data/networks/proposeFacilities.data';

/**
 * User story 14131: Propose pharmacy facility assignments for approval.
 * A proposal's life: Draft -> Pending Approval -> Approved (applied) or
 * Rejected, what the reviewer sees, overlap between two coordinators, and
 * reverting the membership to an earlier version.
 *
 * Every case starts from its own Active network holding one facility, so the
 * live membership before the proposal is known exactly.
 */
test.describe('US 14131 - Proposal lifecycle', () => {
  test(`TC-${CASE.approvedApplied}: should apply the proposed facilities only once the proposal is approved`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [MEMBERSHIP.existing.code] });
    const proposed = MEMBERSHIP.proposed.map((f) => f.code);

    await steps.critical('Navigate to the network - the Facility Assignment tab loads', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([MEMBERSHIP.existing.code]);
    });

    await steps.critical('Proposing two facilities creates a Draft that is not yet live membership', async () => {
      const outcome = await networkDetailPage.facilities().assign(proposed);
      expect(outcome?.status, 'the proposal should be accepted as a draft').toBeLessThan(300);
      for (const code of proposed) await networkDetailPage.facilities().expectAssignmentState(code, ASSIGNMENT_STATE.draftAssignment);
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([MEMBERSHIP.existing.code]);
    });

    await steps.critical('Submitting the draft moves it to Pending Approval', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      for (const code of proposed) await networkDetailPage.facilities().expectAssignmentState(code, ASSIGNMENT_STATE.pendingAssignment);
    });

    await steps.critical('A reviewer approves the change', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });

    await steps.step('The approved facilities now appear as assigned, dated today', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getSettledCodes()).sort()).toEqual([MEMBERSHIP.existing.code, ...proposed].sort());
      for (const code of proposed) {
        expect((await networkDetailPage.facilities().findRow(code))?.assignedOn, `${code} Assigned On`).toBe(today());
      }
    });
  });

  test(`TC-${CASE.rejected}: should leave the live membership unchanged and the facility still available when a proposal is rejected`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [MEMBERSHIP.existing.code] });
    const facility = MEMBERSHIP.single.code;

    await steps.critical('Navigate to the network and propose a facility, submitted for review', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([facility]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.critical('A reviewer rejects the change with a reason', async () => {
      await networkApprovalsPage.reject(network.name);
    });

    await steps.step('The rejected facility is not part of the live membership', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([MEMBERSHIP.existing.code]);
    });

    await steps.step('The facility is still offered in the pool for a future proposal', async () => {
      await networkDetailPage.facilities().openAssignDrawer();
      expect((await networkDetailPage.facilities().getAssignableOptions()).map(codeOfOption)).toContain(facility);
      await networkDetailPage.facilities().cancelAssign();
    });
  });

  test(`TC-${CASE.draftNotLive}: should keep a pending proposal out of every live view of the network`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [MEMBERSHIP.existing.code] });
    const facility = MEMBERSHIP.single.code;

    await steps.critical('Navigate to the network and submit a proposal adding one facility', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([facility]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
    });

    await steps.step('The live membership does not include the proposed facility', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).not.toContain(facility);
    });

    await steps.step('The network directory still counts only the live facility', async () => {
      await networkManagementPage.openList();
      expect((await networkManagementPage.readRow(network.name)).facilities, 'the directory Facilities count').toBe('1');
    });

    await steps.step('The change is still Pending Approval in the queue', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });
  });

  test(`TC-${CASE.concurrent}: should not duplicate or silently lose a facility when two coordinators propose it at once`, async ({
    networkDetailPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [MEMBERSHIP.existing.code] });
    const facility = MEMBERSHIP.single;
    let secondAnswer = { status: 0, text: '' };

    await steps.critical('Navigate to the network in both sessions - both show the same membership', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await staleSession.networkDetail.open(network.id);
      await staleSession.networkDetail.facilities().open();
      expect(await staleSession.networkDetail.facilities().getCodes()).toEqual(await networkDetailPage.facilities().getCodes());
    });

    await steps.critical('Coordinator A proposes the facility - a draft is created', async () => {
      expect((await networkDetailPage.facilities().assign([facility.code]))?.status).toBeLessThan(300);
      await networkDetailPage.facilities().expectAssignmentState(facility.code, ASSIGNMENT_STATE.draftAssignment);
    });

    await steps.step('Coordinator B proposing the same facility does not create a second assignment', async () => {
      secondAnswer = await staleSession.networkDetail.facilities().assignViaApi(network.id, [facility.id]);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      const rows = (await networkDetailPage.facilities().getCodes()).filter((code) => code === facility.code);
      expect(rows.length, `"${facility.code}" should be listed once (second answer ${secondAnswer.status})`).toBe(1);
    });

    await steps.step('A\'s proposal survives - nothing was silently lost', async () => {
      await networkDetailPage.facilities().expectAssignmentState(facility.code, ASSIGNMENT_STATE.draftAssignment);
    });
  });

  test(`TC-${CASE.revert}: should restore exactly the earlier membership when the network is reverted to that version`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [MEMBERSHIP.existing.code] });
    const added = MEMBERSHIP.single.code;

    await steps.critical('Navigate to the network and publish a second version adding a facility', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([added]))?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getSettledCodes()).sort()).toEqual([MEMBERSHIP.existing.code, added].sort());
    });

    await steps.critical('Version history lists version 1 and version 2', async () => {
      await networkDetailPage.versions().open();
      const versions = (await networkDetailPage.versions().readRows()).map((r) => r.version);
      expect(versions).toEqual(expect.arrayContaining(['v1', 'v2']));
    });

    await steps.critical('Version 1 offers a revert, which is confirmed', async () => {
      expect(await networkDetailPage.versions().offersRevert('v1'), 'version 1 should offer Revert').toBe(true);
      const outcome = await networkDetailPage.versions().revertTo('v1');
      expect(outcome?.status, 'the revert should be accepted').toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
    });

    await steps.step('The membership is exactly version 1\'s again', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([MEMBERSHIP.existing.code]);
      expect(await networkDetailPage.facilities().getCodes()).not.toContain(added);
    });
  });
});
