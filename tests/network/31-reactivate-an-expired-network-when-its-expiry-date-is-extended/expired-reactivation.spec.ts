import { test, expect } from '../../../fixtures';
import { NETWORK_LIFECYCLE } from '../../../data/networks/network.data';
import { JOB_HOLD_MS, JOB_TRANSITION_MS } from '../../../data/networks/lifecycleJob.data';
import {
  CASE,
  DATES,
  PENDING_APPROVAL_CELL,
  PUBLISHED_CELL,
  UNRELATED_EDIT,
} from '../../../data/networks/expiredReactivation.data';

/**
 * User story 14309: Reactivate an expired network when its expiry date is
 * extended.
 *
 * The recalculation the story describes happens on APPROVAL of an edit, so
 * every case stages the edit in the Edit drawer, sends it for approval and has
 * it approved (`publishStagedChange`), then re-reads the status. Status is
 * read by polling the detail screen: the recalculation, or the job behind it,
 * may take up to a minute.
 */
test.describe('US 14309 - Recalculation on an approved edit', () => {
  test(`TC-${CASE.extendToActive}: should recalculate an Expired network to Active when an approved edit extends its expiry date`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const network = await networkIn('Expired');

    await steps.critical('Navigate to the Network Management module - the list shows the Expired network', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.expired);
    });

    await steps.step('The detail page shows Status Expired', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.expired);
    });

    await steps.critical('An edit extending the expiry date is submitted and shown as Pending Approval', async () => {
      const report = await networkManagementPage.stageMultiFieldEdit(network.name, { expiryDate: DATES.extendedExpiry() });
      expect(report.outcome?.status, `the edit should save: ${report.messages.join(' | ')}`).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkManagementPage.expectApprovalCell(network.name, PENDING_APPROVAL_CELL);
    });

    await steps.step('Approving the edit recalculates the network to Active', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
      await networkDetailPage.expectStatusEventually(network.id, NETWORK_LIFECYCLE.active, JOB_TRANSITION_MS);
    });
  });

  const recalculations = [
    { caseId: CASE.futureEffectiveToPending, label: 'a future effective date', effective: DATES.futureEffective, becomes: NETWORK_LIFECYCLE.pending },
    { caseId: CASE.effectiveTodayActive, label: "an effective date of today", effective: DATES.todayEffective, becomes: NETWORK_LIFECYCLE.active },
    { caseId: CASE.effectiveTomorrowPending, label: 'an effective date of tomorrow', effective: DATES.tomorrowEffective, becomes: NETWORK_LIFECYCLE.pending },
  ] as const;

  for (const row of recalculations) {
    test(`TC-${row.caseId}: should recalculate an Expired network to ${row.becomes} when an approved edit sets ${row.label} and a future expiry`, async ({
      networkManagementPage,
      networkDetailPage,
      networkIn,
      steps,
    }) => {
      test.setTimeout(25 * 60_000);
      const network = await networkIn('Expired');

      await steps.critical('Navigate to the Network Management module - the list shows the Expired network', async () => {
        await networkManagementPage.openList();
        await networkManagementPage.search(network.name);
        await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.expired);
      });

      await steps.step('The detail page shows Status Expired', async () => {
        await networkDetailPage.open(network.id);
        await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.expired);
      });

      await steps.critical(`An edit with ${row.label} and a future expiry is submitted and approved`, async () => {
        const report = await networkManagementPage.stageMultiFieldEdit(network.name, {
          effectiveDate: row.effective(),
          expiryDate: DATES.extendedExpiry(),
        });
        expect(report.outcome?.status, `the edit should save: ${report.messages.join(' | ')}`).toBeLessThan(300);
        await networkManagementPage.publishStagedChange(network.name);
        await networkManagementPage.expectApprovalCell(network.name, PUBLISHED_CELL);
      });

      await steps.step(`The reopened record reads ${row.becomes}`, async () => {
        await networkDetailPage.expectStatusEventually(network.id, row.becomes, JOB_TRANSITION_MS);
      });
    });
  }

  const unchanged = [
    { caseId: CASE.noExtensionStaysExpired, label: 'changes an unrelated field without extending the expiry', changes: () => ({ ...UNRELATED_EDIT }) },
  ] as const;

  for (const row of unchanged) {
    test(`TC-${row.caseId}: should keep the network Expired when an approved edit ${row.label}`, async ({
      networkManagementPage,
      networkDetailPage,
      networkIn,
      steps,
    }) => {
      test.setTimeout(25 * 60_000);
      const network = await networkIn('Expired');

      await steps.critical('Navigate to the Network Management module - the list shows the Expired network', async () => {
        await networkManagementPage.openList();
        await networkManagementPage.search(network.name);
        await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.expired);
      });

      await steps.step('The detail page shows Status Expired', async () => {
        await networkDetailPage.open(network.id);
        await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.expired);
      });

      await steps.critical('The edit is submitted and approved', async () => {
        const report = await networkManagementPage.stageMultiFieldEdit(network.name, row.changes());
        expect(report.outcome?.status, `the edit should save: ${report.messages.join(' | ')}`).toBeLessThan(300);
        await networkManagementPage.publishStagedChange(network.name);
        await networkManagementPage.expectApprovalCell(network.name, PUBLISHED_CELL);
      });

      await steps.step('The reopened record still reads Expired after recalculation and the next job runs', async () => {
        await networkDetailPage.expectStatusHolds(network.id, NETWORK_LIFECYCLE.expired, JOB_HOLD_MS);
      });
    });
  }
});

/** The edges: the decision table and transition map, invalid dates, and who may extend. */
test.describe('US 14309 - Rules around the reactivation', () => {
  test(`TC-${CASE.decisionTable}: should resolve each Expired network to the status its new dates imply when the edits are approved`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(35 * 60_000);
    const [toActive, toPending, staysExpired, invalid] = await Promise.all([1, 2, 3, 4].map(() => networkIn('Expired')));

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isListed(toActive.name)).toBe(true);
    });

    await steps.step('Each of the four networks shows Status Expired', async () => {
      for (const network of [toActive, toPending, staysExpired, invalid]) {
        await networkDetailPage.open(network.id);
        expect(await networkDetailPage.getStatus(), `"${network.name}"`).toBe(NETWORK_LIFECYCLE.expired);
      }
    });

    await steps.step('Each edit is processed by the validation rules - the invalid combination is refused', async () => {
      const active = await networkManagementPage.stageMultiFieldEdit(toActive.name, { expiryDate: DATES.extendedExpiry() });
      expect(active.outcome?.status, 'past effective / future expiry should save').toBeLessThan(300);
      await networkManagementPage.publishStagedChange(toActive.name);

      const pending = await networkManagementPage.stageMultiFieldEdit(toPending.name, {
        effectiveDate: DATES.futureEffective(),
        expiryDate: DATES.extendedExpiry(),
      });
      expect(pending.outcome?.status, 'future effective / future expiry should save').toBeLessThan(300);
      await networkManagementPage.publishStagedChange(toPending.name);

      await networkManagementPage.stageMultiFieldEdit(staysExpired.name, { expiryDate: DATES.pastExpiry() });

      const refused = await networkManagementPage.stageMultiFieldEdit(invalid.name, {
        effectiveDate: DATES.futureEffective(),
        expiryDate: DATES.expiryBeforeEffective(),
      });
      expect(refused.outcome === null || refused.outcome.status >= 400, 'an expiry before the effective date must not be saved').toBe(true);
      expect(`${Object.values(refused.errors).join('')}${refused.messages.join('')}`, 'the user should be told why').not.toBe('');
    });

    await steps.step('The networks resolve to Active, Pending, Expired and Expired respectively', async () => {
      await networkDetailPage.expectStatusEventually(toActive.id, NETWORK_LIFECYCLE.active, JOB_TRANSITION_MS);
      await networkDetailPage.expectStatusEventually(toPending.id, NETWORK_LIFECYCLE.pending, JOB_TRANSITION_MS);
      await networkDetailPage.open(staysExpired.id);
      expect(await networkDetailPage.getStatus(), 'past effective / past expiry').toBe(NETWORK_LIFECYCLE.expired);
      await networkDetailPage.open(invalid.id);
      expect(await networkDetailPage.getStatus(), 'the refused combination').toBe(NETWORK_LIFECYCLE.expired);
    });
  });

  test(`TC-${CASE.stateMap}: should allow Expired to become Active or Pending through an approved edit but never Inactive directly`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(35 * 60_000);
    const [toActive, toPending, notExtended] = await Promise.all([1, 2, 3].map(() => networkIn('Expired')));

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isListed(toActive.name)).toBe(true);
    });

    await steps.step('Each of the three networks shows Status Expired', async () => {
      for (const network of [toActive, toPending, notExtended]) {
        await networkDetailPage.open(network.id);
        expect(await networkDetailPage.getStatus(), `"${network.name}"`).toBe(NETWORK_LIFECYCLE.expired);
      }
    });

    await steps.step('The extending edits and the non-extending edit are approved', async () => {
      const active = await networkManagementPage.stageMultiFieldEdit(toActive.name, { expiryDate: DATES.extendedExpiry() });
      expect(active.outcome?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(toActive.name);
      const pending = await networkManagementPage.stageMultiFieldEdit(toPending.name, {
        effectiveDate: DATES.futureEffective(),
        expiryDate: DATES.extendedExpiry(),
      });
      expect(pending.outcome?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(toPending.name);
      const other = await networkManagementPage.stageMultiFieldEdit(notExtended.name, { ...UNRELATED_EDIT });
      expect(other.outcome?.status).toBeLessThan(300);
      await networkManagementPage.publishStagedChange(notExtended.name);
    });

    await steps.step('No direct Expired -> Inactive transition is offered', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(notExtended.name);
      expect(await networkManagementPage.getRowActionAvailability(notExtended.name, 'inactivate'), 'Inactivate on an Expired network').not.toBe(
        'available',
      );
    });

    await steps.step('The three networks read Active, Pending and Expired', async () => {
      await networkDetailPage.expectStatusEventually(toActive.id, NETWORK_LIFECYCLE.active, JOB_TRANSITION_MS);
      await networkDetailPage.expectStatusEventually(toPending.id, NETWORK_LIFECYCLE.pending, JOB_TRANSITION_MS);
      await networkDetailPage.open(notExtended.id);
      expect(await networkDetailPage.getStatus()).toBe(NETWORK_LIFECYCLE.expired);
    });
  });

  test(`TC-${CASE.expiryBeforeEffectiveRejected}: should reject an edit whose new expiry date is earlier than its new effective date`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Expired');

    await steps.critical('Navigate to the Network Management module - the list shows the Expired network', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.expired);
    });

    await steps.step('The detail page shows Status Expired', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.expired);
    });

    await steps.step('The edit with expiry before effective shows a validation error and is not submitted', async () => {
      const report = await networkManagementPage.stageMultiFieldEdit(network.name, {
        effectiveDate: DATES.futureEffective(),
        expiryDate: DATES.expiryBeforeEffective(),
      });
      expect(report.outcome === null || report.outcome.status >= 400, 'the invalid edit must not be saved').toBe(true);
      expect(`${report.errors.expiryDate ?? ''}${report.errors.effectiveDate ?? ''}${report.messages.join('')}`, 'a validation error').not.toBe('');
    });

    await steps.step('No approval for the invalid edit is available', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectNotInQueue(network.name);
    });

    await steps.step('The reopened record still reads Expired', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.expired);
    });
  });

  test(`TC-${CASE.noSelfApproval}: should stop the administrator who submitted an extending edit from approving it`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Expired');

    await steps.critical('Navigate to the Network Management module - the list shows the Expired network', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.expired);
    });

    await steps.critical('The administrator submits an extending edit - it is Pending Approval', async () => {
      const report = await networkManagementPage.stageMultiFieldEdit(network.name, { expiryDate: DATES.extendedExpiry() });
      expect(report.outcome?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkManagementPage.expectApprovalCell(network.name, PENDING_APPROVAL_CELL);
    });

    await steps.step('The submitting administrator is not offered approval of their own edit', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectSelfApprovalPrevented(network.name);
    });

    await steps.step('The record still reads Expired with the edit Pending Approval', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.expired);
      await networkManagementPage.openList();
      await networkManagementPage.expectApprovalCell(network.name, PENDING_APPROVAL_CELL);
    });
  });

  test(`TC-${CASE.viewerCannotExtend}: should deny a viewer the edit of an Expired network's dates`, async ({
    networkManagementPage,
    networkDetailPage,
    shapedNonAdmin,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Expired');

    await steps.critical('Navigate to the Network Management module - the administrator is offered Edit', async () => {
      // Baseline first: the control exists for a role that holds the right.
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      expect(await networkManagementPage.getRowActionAvailability(network.name, 'edit')).toBe('available');
    });

    await steps.step('The viewer sees the Expired network read-only', async () => {
      const viewer = await shapedNonAdmin({ without: ['editNetwork'] });
      await viewer.networks.openList();
      await viewer.networks.search(network.name);
      await viewer.networks.expectStatusText(network.name, NETWORK_LIFECYCLE.expired);
    });

    await steps.step('The viewer is not offered a way to edit the dates', async () => {
      const viewer = await shapedNonAdmin({ without: ['editNetwork'] });
      await viewer.networks.openList();
      await viewer.networks.search(network.name);
      expect(await viewer.networks.getRowActionAvailability(network.name, 'edit'), 'Edit for the viewer').not.toBe('available');
    });

    await steps.step('The reopened record still reads Expired', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.expired);
    });
  });

  test(`TC-${CASE.finalValuesUsed}: should recalculate from the final approved values when the pending edit was changed before approval`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const network = await networkIn('Expired');
    const finalExpiry = DATES.finalExpiry();

    await steps.critical('Navigate to the Network Management module - the list shows the Expired network', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.expired);
    });

    await steps.step('A first edit extending the expiry is submitted - Pending Approval', async () => {
      const first = await networkManagementPage.stageMultiFieldEdit(network.name, { expiryDate: DATES.firstExpiry() });
      expect(first.outcome?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkManagementPage.expectApprovalCell(network.name, PENDING_APPROVAL_CELL);
    });

    await steps.step('Before approval a second edit reduces the expiry - the pending change carries the latest values', async () => {
      const second = await networkManagementPage.stageMultiFieldEdit(network.name, { expiryDate: finalExpiry });
      expect(second.outcome?.status, `the second edit should save: ${second.messages.join(' | ')}`).toBeLessThan(300);
    });

    await steps.step('The final edit is approved and recalculation uses it', async () => {
      await networkManagementPage.publishStagedChange(network.name);
      await networkDetailPage.expectStatusEventually(network.id, NETWORK_LIFECYCLE.active, JOB_TRANSITION_MS);
    });

    await steps.step('The record shows the status from, and the expiry of, the final values', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.readOverviewField('expiryDate'), 'the final expiry should be the live one').toBe(finalExpiry);
    });
  });
});
