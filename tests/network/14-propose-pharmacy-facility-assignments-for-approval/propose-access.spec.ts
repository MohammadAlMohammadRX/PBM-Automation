import { test, expect } from '../../../fixtures';
import { BUDGET } from '../../../data/networks/facilities.data';
import { CASE, MEMBERSHIP } from '../../../data/networks/proposeFacilities.data';

/**
 * User story 14131: Propose pharmacy facility assignments for approval.
 * Who may propose, and who may decide.
 *
 * Proposing: the shared "Payer Admin" role is shaped WITHOUT
 * AssignFacilitiesToNetwork (`shapedNonAdmin`). Role edits do not propagate to
 * a signed-in user in this build; the fixture verifies propagation and reports
 * BLOCKED when the permission is still held - an honest "not observable", never
 * a false pass. Each case first baselines that the administrator IS offered
 * the control, so an absent control is not mistaken for a refusal.
 *
 * Deciding: the configured non-admin account is DEFINED without approval rights
 * (`requireNonAdmin({ lacking: ['approvePayer'] })` blocks otherwise).
 */
test.describe('US 14131 - Proposal access control', () => {
  test(`TC-${CASE.coordinatorOnly}: should refuse a facility proposal from every entry point when the user lacks the assignment permission`, async ({
    networkDetailPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Draft', { facilityCodes: [MEMBERSHIP.existing.code] });

    await steps.critical('Navigate to the network as the administrator - Assign Facilities is offered (baseline)', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().isAssignOffered(), 'the control must exist before its absence can mean anything').toBe(true);
    });

    const session = await shapedNonAdmin({ without: ['assignFacilities'] });

    await steps.step('The restricted user opening the network is not offered Assign Facilities', async () => {
      await session.networkDetail.open(network.id);
      await session.networkDetail.facilities().open();
      expect(await session.networkDetail.facilities().isAssignOffered()).toBe(false);
    });

    await steps.step('Invoking the proposal directly is refused with an authorization error', async () => {
      const answer = await session.networkDetail.facilities().assignViaApi(network.id, [MEMBERSHIP.single.id]);
      expect(answer.status, `a direct proposal should be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(401);
      expect(answer.status).toBeLessThan(500);
    });

    await steps.step('The network\'s membership is unchanged', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toEqual([MEMBERSHIP.existing.code]);
    });
  });

  test(`TC-${CASE.approverOnly}: should let only an approver decide a pending facility change when a coordinator tries`, async ({
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
    const network = await networkIn('Active', { facilityCodes: [MEMBERSHIP.existing.code] });
    let requestId = '';

    await steps.critical('Navigate to the network and submit a facility proposal - it is pending', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([MEMBERSHIP.single.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkApprovalsPage.open();
      requestId = await networkApprovalsPage.getPendingRequestId(network.name);
      expect(requestId, 'the change should be queued').not.toBe('');
    });

    await steps.step('The non-approver is offered no Approve or Reject for it', async () => {
      await nonAdminSession.networkApprovals.open();
      const decision = await nonAdminSession.networkApprovals.getDecisionAvailability(network.name);
      expect(decision.approve, 'Approve must not be usable by a non-approver').toBe(false);
      expect(decision.reject, 'Reject must not be usable by a non-approver').toBe(false);
    });

    await steps.step('Approving it directly as the non-approver is refused', async () => {
      const answer = await nonAdminSession.networkApprovals.approveRequestViaApi(requestId);
      expect(answer.status, `a direct approval should be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(401);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('An approver approves it and the facility goes live', async () => {
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toContain(MEMBERSHIP.single.code);
    });
  });
});
