import { test, expect } from '../../../fixtures';
import { BUDGET, today } from '../../../data/networks/facilities.data';
import { ALREADY_PENDING, AFTER_REJECTION, CASE, NO_DATE, PROPOSED, START, STATE } from '../../../data/networks/facilityApprovalStates.data';

/**
 * User story 14307: Track the approval state of pending pharmacy assignment
 * changes - one change at a time through Draft, Pending and approval or
 * rejection, and the Assigned On date that only approval may set.
 *
 * Each case starts from its own Active network holding two settled facilities
 * (START), so a removal never trips the last-pharmacy rule of US 14304.
 */
test.describe('US 14307 - Assignment and removal states', () => {
  test(`TC-${CASE.draftAssignment}: should show Draft Assignment with no Assigned On date when a facility is added but not submitted`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });

    await steps.critical('Navigate to the network and add a facility without submitting it', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([PROPOSED.code]))?.status).toBeLessThan(300);
    });

    await steps.step('Its row reads Draft Assignment with a blank Assigned On date', async () => {
      await networkDetailPage.facilities().expectAssignmentState(PROPOSED.code, STATE.draftAssignment);
      expect((await networkDetailPage.facilities().findRow(PROPOSED.code))?.assignedOn).toBe(NO_DATE);
    });
  });

  test(`TC-${CASE.assignmentLifecycle}: should move an assignment from Draft to Pending to approved and date it only at approval`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });
    const tab = () => networkDetailPage.facilities();

    await steps.critical('Navigate to the network - a draft assignment shows a blank date', async () => {
      await networkDetailPage.open(network.id);
      await tab().open();
      expect((await tab().assign([PROPOSED.code]))?.status).toBeLessThan(300);
      await tab().expectAssignmentState(PROPOSED.code, STATE.draftAssignment);
      expect((await tab().findRow(PROPOSED.code))?.assignedOn).toBe(NO_DATE);
    });

    await steps.critical('Submitting it reads Pending Assignment, still undated', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await tab().open();
      await tab().expectAssignmentState(PROPOSED.code, STATE.pendingAssignment);
      expect((await tab().findRow(PROPOSED.code))?.assignedOn).toBe(NO_DATE);
    });

    await steps.step('Approving it settles the assignment and dates it with the approval date', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await tab().open();
      expect(await tab().getSettledCodes()).toContain(PROPOSED.code);
      expect((await tab().findRow(PROPOSED.code))?.assignedOn).toBe(today());
    });
  });

  test(`TC-${CASE.removalLifecycle}: should move a removal from Draft Removal to Pending Removal to removed`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });
    const tab = () => networkDetailPage.facilities();
    let assignedOn = '';

    await steps.critical('Navigate to the network and select an assigned facility for removal - Draft Removal, date kept', async () => {
      await networkDetailPage.open(network.id);
      await tab().open();
      assignedOn = (await tab().findRow(START.removed.code))?.assignedOn ?? '';
      expect(assignedOn, 'the settled facility should carry its Assigned On date').toBe(today());
      expect((await tab().attemptRemove(START.removed.code)).outcome?.status).toBeLessThan(300);
      await tab().expectAssignmentState(START.removed.code, STATE.draftRemoval);
      expect((await tab().findRow(START.removed.code))?.assignedOn).toBe(assignedOn);
    });

    await steps.critical('Submitting the removal reads Pending Removal', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await tab().open();
      await tab().expectAssignmentState(START.removed.code, STATE.pendingRemoval);
    });

    await steps.step('Approving it removes the facility from the list', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await tab().open();
      await tab().expectRowAbsent(START.removed.code);
    });
  });

  test(`TC-${CASE.dateAtApproval}: should populate Assigned On exactly at approval and not before`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });
    const tab = () => networkDetailPage.facilities();

    await steps.critical('Navigate to the network - the Pending Assignment is undated just before approval', async () => {
      await networkDetailPage.open(network.id);
      await tab().open();
      expect((await tab().assign([PROPOSED.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await tab().open();
      await tab().expectAssignmentState(PROPOSED.code, STATE.pendingAssignment);
      expect((await tab().findRow(PROPOSED.code))?.assignedOn).toBe(NO_DATE);
    });

    await steps.step('Right after approval the Assigned On date is the approval date', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.open(network.id);
      await tab().open();
      expect((await tab().findRow(PROPOSED.code))?.assignedOn).toBe(today());
    });
  });

  test(`TC-${CASE.duplicateSubmission}: should block a second submission of a change that is already pending`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });

    await steps.critical('Navigate to the network - the facility already reads Pending Assignment', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([PROPOSED.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().expectAssignmentState(PROPOSED.code, STATE.pendingAssignment);
    });

    await steps.step('Submitting it again is refused with a "change already pending" message', async () => {
      expect(await networkDetailPage.getActionAvailability('submit'), 'Send for Approval should no longer be usable').not.toBe('available');
      const answer = await networkDetailPage.submitDirectly(network.id);
      expect(answer.status, `a duplicate submission should be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(ALREADY_PENDING);
    });

    await steps.step('Only one request is queued for the network', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectSingleQueuedRequest(network.name);
    });
  });

  test(`TC-${CASE.rejectPending}: should take a rejected change out of Pending and leave it undated`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });

    await steps.critical('Navigate to the network and submit an assignment - it reads Pending Assignment', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([PROPOSED.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().expectAssignmentState(PROPOSED.code, STATE.pendingAssignment);
    });

    await steps.critical('An approver rejects the request', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.reject(network.name);
    });

    await steps.step('The facility no longer reads Pending - Draft Assignment or Rejected - and stays undated', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      const row = await networkDetailPage.facilities().findRow(PROPOSED.code);
      expect(row?.assignment ?? '(row gone)', 'the rejected change should be shown as rejected or back in draft').toMatch(AFTER_REJECTION);
      expect(row?.assignedOn).toBe(NO_DATE);
      expect(await networkDetailPage.facilities().getSettledCodes()).not.toContain(PROPOSED.code);
    });
  });

  test(`TC-${CASE.dateAfterRefresh}: should keep Assigned On blank for a pending change after the page is refreshed`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [START.kept.code, START.removed.code] });

    await steps.critical('Navigate to the network - a Pending Assignment with a blank date is confirmed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([PROPOSED.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().expectAssignmentState(PROPOSED.code, STATE.pendingAssignment);
      expect((await networkDetailPage.facilities().findRow(PROPOSED.code))?.assignedOn).toBe(NO_DATE);
    });

    await steps.step('After a browser refresh it is still Pending Assignment with a blank date', async () => {
      await networkDetailPage.reload();
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().expectAssignmentState(PROPOSED.code, STATE.pendingAssignment);
      expect((await networkDetailPage.facilities().findRow(PROPOSED.code))?.assignedOn).toBe(NO_DATE);
    });
  });
});
