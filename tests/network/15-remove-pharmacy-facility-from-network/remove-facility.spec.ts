import { test, expect } from '../../../fixtures';
import { ASSIGNMENT_STATE, BUDGET, NO_FACILITIES, REMOVE_PROMPT, SERVER_ERROR_MARKERS, codeOfOption, today } from '../../../data/networks/facilities.data';
import {
  ALREADY_REMOVED,
  ASSIGN_ACTION,
  AUDIT_ACTOR,
  BLOCKED_CASES,
  CASE,
  PAIR,
  REMOVAL_ACTION,
  UNRELATED_ADDITION,
} from '../../../data/networks/removeFacility.data';

/**
 * User story 14132: Remove pharmacy facility from network.
 *
 * Removal from a LIVE network is maker-checker (see removeFacility.data.ts):
 * the cases that must see the facility gone send the staged removal for
 * approval and approve it. The dialog cases use a never-approved network,
 * where the row goes at once - their subject is the prompt, not the approval.
 */
test.describe('US 14132 - Removing a facility', () => {
  test(`TC-${CASE.confirmRemoves}: should remove the facility after the prompt is confirmed and refresh the list`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PAIR.removed.code, PAIR.kept.code] });

    await steps.critical('Navigate to the network - the facility is listed as assigned', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toContain(PAIR.removed.code);
    });

    let attempt = { outcome: null as { status: number } | null, toast: '', title: '', message: '' };

    await steps.critical('Remove asks the user to confirm the removal of that facility', async () => {
      attempt = await networkDetailPage.facilities().attemptRemove(PAIR.removed.code);
      expect(attempt.title).toBe(REMOVE_PROMPT.title);
      expect(attempt.message).toContain(PAIR.removed.name);
    });

    await steps.step('Confirming processes the removal and shows a success message', async () => {
      expect(attempt.outcome?.status, 'the removal should be accepted').toBeLessThan(300);
      expect(attempt.toast, 'a success message should follow the confirmation').not.toBe('');
    });

    await steps.step('Once the removal takes effect the list no longer shows the facility', async () => {
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().expectRowAbsent(PAIR.removed.code);
      expect(await networkDetailPage.facilities().getSettledCodes()).toEqual([PAIR.kept.code]);
    });
  });

  test(`TC-${CASE.decisionCancelConfirm}: should keep the facility on Cancel and remove it on Confirm when the prompt is answered`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: [PAIR.removed.code, PAIR.kept.code] });

    await steps.critical('Navigate to the network - both facilities are listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getCodes()).sort()).toEqual([PAIR.removed.code, PAIR.kept.code].sort());
    });

    await steps.step('Cancel closes the prompt and the facility stays listed', async () => {
      await networkDetailPage.facilities().cancelRemove(PAIR.removed.code);
      expect(await networkDetailPage.facilities().getCodes()).toContain(PAIR.removed.code);
    });

    await steps.step('Confirm removes the facility and the list refreshes without it', async () => {
      const { outcome } = await networkDetailPage.facilities().attemptRemove(PAIR.removed.code);
      expect(outcome?.status, 'the removal should be accepted').toBeLessThan(300);
      await networkDetailPage.facilities().expectRowAbsent(PAIR.removed.code);
    });
  });

  test(`TC-${CASE.cancelKeeps}: should leave the assignment unchanged when the removal prompt is cancelled`, async ({
    networkDetailPage,
    networkIn,
    toast,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: [PAIR.removed.code, PAIR.kept.code] });

    await steps.critical('Navigate to the network - the facility is listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toContain(PAIR.removed.code);
    });

    await steps.step('Cancelling the prompt shows no success or removal message', async () => {
      await networkDetailPage.facilities().cancelRemove(PAIR.removed.code);
      await toast.expectNone();
    });

    await steps.step('After a manual refresh the facility is still assigned', async () => {
      await networkDetailPage.reload();
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toContain(PAIR.removed.code);
    });
  });

  test(`TC-${CASE.auditCaptures}: should log the user, time and facility when a facility is removed`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PAIR.removed.code, PAIR.kept.code] });

    await steps.critical('Navigate to the network and remove the facility - the removal completes', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().attemptRemove(PAIR.removed.code)).outcome?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
    });

    await steps.critical('The audit history has a new entry for the removal', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.audit().open();
      await networkDetailPage.audit().expectEntry(REMOVAL_ACTION);
    });

    await steps.step('The entry records who removed it, when, and which facility', async () => {
      const entries = await networkDetailPage.audit().readEntries();
      const index = entries.findIndex((entry) => REMOVAL_ACTION.test(entry.action));
      const detail = await networkDetailPage.audit().openEntry(Math.max(index, 0));
      expect(detail.meta, 'the acting user').toMatch(AUDIT_ACTOR);
      expect(detail.meta, 'the removal date').toContain(today());
      expect(JSON.stringify(detail.changes), 'the facility removed').toMatch(new RegExp(`${PAIR.removed.code}|${PAIR.removed.name}`));
      await networkDetailPage.audit().closeEntry();
    });
  });

  test(`TC-${CASE.alreadyRemoved}: should answer a stale second removal gracefully when the facility was already removed`, async ({
    networkDetailPage,
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PAIR.removed.code, PAIR.kept.code] });
    let stale = { status: 0, toast: '', text: '' };

    await steps.critical('Navigate to the network in a second tab that still lists the facility', async () => {
      await staleSession.networkDetail.open(network.id);
      await staleSession.networkDetail.facilities().open();
      expect(await staleSession.networkDetail.facilities().getCodes()).toContain(PAIR.removed.code);
    });

    await steps.critical('The facility is removed (and approved) from the first tab', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().attemptRemove(PAIR.removed.code)).outcome?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
    });

    await steps.step('Removing it again from the stale tab gets an informational message, not an unhandled error', async () => {
      const attempt = await staleSession.networkDetail.facilities().attemptRemove(PAIR.removed.code);
      stale = { status: attempt.outcome?.status ?? 0, text: attempt.outcome?.text ?? '', toast: attempt.toast };
      expect(stale.status, 'the stale removal must not be a server error').toBeLessThan(500);
      expect(stale.toast, 'the user should be told the facility is already removed').toMatch(ALREADY_REMOVED);
      for (const marker of SERVER_ERROR_MARKERS) expect(stale.text).not.toContain(marker);
    });

    await steps.step('After a refresh the facility is absent, matching the real state', async () => {
      await staleSession.networkDetail.open(network.id);
      await staleSession.networkDetail.facilities().open();
      await staleSession.networkDetail.facilities().expectRowAbsent(PAIR.removed.code);
    });
  });

  test(`TC-${CASE.roleRestricted}: should refuse a removal from every entry point when the user lacks the removal permission`, async ({
    networkDetailPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: [PAIR.removed.code, PAIR.kept.code] });

    await steps.critical('Navigate to the network as the administrator - Remove is offered (baseline)', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().isRemoveOffered(PAIR.removed.code)).toBe(true);
    });

    const session = await shapedNonAdmin({ without: ['unassignFacility'] });

    await steps.step('The restricted user sees the facility but no usable Remove', async () => {
      await session.networkDetail.open(network.id);
      await session.networkDetail.facilities().open();
      expect(await session.networkDetail.facilities().getCodes()).toContain(PAIR.removed.code);
      expect(await session.networkDetail.facilities().isRemoveOffered(PAIR.removed.code)).toBe(false);
    });

    await steps.step('A direct removal request is refused and the facility stays assigned', async () => {
      const answer = await session.networkDetail.facilities().removeViaApi(network.id, PAIR.removed.id);
      expect(answer.status, `the direct removal should be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(401);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toContain(PAIR.removed.code);
    });
  });

  test(`TC-${CASE.lastFacility}: should leave a valid empty membership when the last remaining facility is removed`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.twoLiveNetworks);
    // Inactive, not Active: US 14304 forbids removing an ACTIVE network's last pharmacy.
    const network = await networkIn('Inactive', { facilityCodes: [PAIR.removed.code] });

    await steps.critical('Navigate to the network - its only facility is listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toEqual([PAIR.removed.code]);
    });

    await steps.critical('Removing it is processed without error', async () => {
      const { outcome } = await networkDetailPage.facilities().attemptRemove(PAIR.removed.code);
      expect(outcome?.status, `the removal should be accepted: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
    });

    await steps.step('The list is empty and shows a "no facilities" state, not an error', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().readRows()).toEqual([]);
      expect(await networkDetailPage.facilities().getEmptyText()).toMatch(NO_FACILITIES);
      expect(await networkDetailPage.getTabCount('facilities')).toBe(0);
    });
  });

  test(`TC-${CASE.reAdd}: should let a removed facility be proposed again and keep both events in the audit trail`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PAIR.removed.code, PAIR.kept.code] });

    await steps.critical('Navigate to the network and remove a facility (approved)', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().attemptRemove(PAIR.removed.code)).outcome?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
    });

    await steps.critical('The removed facility is offered in the pool again', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().openAssignDrawer();
      expect((await networkDetailPage.facilities().getAssignableOptions()).map(codeOfOption)).toContain(PAIR.removed.code);
      await networkDetailPage.facilities().cancelAssign();
    });

    await steps.step('Proposing and approving it again makes it a current assignment', async () => {
      expect((await networkDetailPage.facilities().assign([PAIR.removed.code]))?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getSettledCodes()).toContain(PAIR.removed.code);
    });

    await steps.step('The audit history shows the removal and the new assignment as separate events', async () => {
      await networkDetailPage.audit().open();
      await networkDetailPage.audit().expectEntry(REMOVAL_ACTION);
      const actions = (await networkDetailPage.audit().readEntries()).map((e) => e.action);
      expect(actions.filter((a) => ASSIGN_ACTION.test(a)).length, `separate facility events: ${actions.join(', ')}`).toBeGreaterThanOrEqual(2);
    });
  });

  test(`TC-${CASE.pendingUnrelated}: should remove a facility independently of an unrelated pending change`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [PAIR.removed.code, PAIR.kept.code] });

    await steps.critical('Navigate to the network with an unrelated facility proposal pending', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign([UNRELATED_ADDITION.code]))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().expectAssignmentState(UNRELATED_ADDITION.code, ASSIGNMENT_STATE.pendingAssignment);
    });

    await steps.step('Removing the assigned facility completes while the other change is still pending', async () => {
      const { outcome } = await networkDetailPage.facilities().attemptRemove(PAIR.removed.code);
      expect(outcome?.status, `the removal should be accepted: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('Approving the unrelated change applies it and does not bring the removed facility back', async () => {
      await networkApprovalsPage.approve(network.name);
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getSettledCodes()).sort()).toEqual([PAIR.kept.code, UNRELATED_ADDITION.code].sort());
    });
  });

  test(`TC-${CASE.refreshesInPlace}: should update the list at once without a reload when a facility is removed`, async ({
    networkDetailPage,
    networkIn,
    toast,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: [PAIR.removed.code, PAIR.kept.code] });

    await steps.critical('Navigate to the network - both facilities are listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getCodes()).sort()).toEqual([PAIR.removed.code, PAIR.kept.code].sort());
    });

    await steps.step('Removing one shows a success message without a manual refresh', async () => {
      const dialog = await networkDetailPage.facilities().openRemove(PAIR.removed.code);
      await dialog.confirm();
      expect((await toast.waitForText()).summary).not.toBe('');
    });

    await steps.step('Only the other facility remains, with no stale or duplicate rows', async () => {
      await networkDetailPage.facilities().expectRowAbsent(PAIR.removed.code);
      expect(await networkDetailPage.facilities().getCodes()).toEqual([PAIR.kept.code]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
