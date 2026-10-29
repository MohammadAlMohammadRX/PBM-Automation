import { test, expect } from '../../../fixtures';
import type { NetworkInactivateDialog } from '../../../pages/network/NetworkInactivateDialog';
import { NETWORK_LIFECYCLE, NETWORK_MESSAGE, NETWORK_TOAST } from '../../../data/networks/network.data';
import {
  APPROVAL_CELL,
  DEACTIVATE,
  LIFECYCLE_TIMEOUT_MS,
  NOT_INACTIVATABLE,
  UNSELECTED_REASON,
} from '../../../data/networks/deactivateNetwork.data';

/**
 * User story 14127: Deactivate network with a documented reason.
 * The happy path, the statuses that must not offer Inactivate, and the reason
 * and details rules of the Inactivate drawer.
 *
 * Every network is the case's own (fixture `networkIn`). Confirming the drawer
 * stages a draft; "submitting the request" is Send for Approval, after which
 * the approval cell reads Pending Approval while the status stays Active.
 */
test.describe('US 14127 - Deactivate a network with a reason', () => {
  test('TC-17808: should submit the inactivation for approval with its reason and details when an Active network is inactivated', async ({
    networkManagementPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let drawer!: NetworkInactivateDialog;
    let reason = '';

    await steps.critical('Navigate to the Network Management module - the network is listed Active', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });

    await steps.critical('The detail screen shows Active with an enabled Inactivate action', async () => {
      const detail = await networkManagementPage.openDetails(network.name);
      await detail.expectStatus(NETWORK_LIFECYCLE.active);
      expect(await detail.getActionAvailability('inactivate'), 'Inactivate should be offered and enabled').toBe('available');
      drawer = await detail.openInactivate();
    });

    await steps.critical('The Inactivate drawer offers a reason list and an empty optional Details field', async () => {
      const reasons = await drawer.getReasonOptions();
      expect(reasons.length, 'the maintained reason list should not be empty').toBeGreaterThan(0);
      expect(await drawer.getDetailsValue(), 'Details starts empty').toBe('');
      reason = reasons[0];
    });

    await steps.step('The chosen reason is displayed in the Reason field', async () => {
      await drawer.selectReason(reason);
      expect(await drawer.getSelectedReason()).toBe(reason);
    });

    await steps.step('The details text is accepted and displayed', async () => {
      expect(await drawer.typeDetails(DEACTIVATE.details)).toBe(DEACTIVATE.details);
    });

    await steps.step('Submitting confirms it and leaves the network awaiting approval, still Active', async () => {
      await drawer.confirm();
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.pendingApproval);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });
  });

  for (const row of NOT_INACTIVATABLE) {
    test(`TC-${row.azureId}: should not offer Inactivate when the network is ${row.label}`, async ({
      networkManagementPage,
      networkIn,
      steps,
    }) => {
      test.setTimeout(LIFECYCLE_TIMEOUT_MS);
      const network = await networkIn(row.state);

      await steps.critical(`Navigate to the module - the network is listed ${row.label}`, async () => {
        await networkManagementPage.openList();
        await networkManagementPage.search(network.name);
        await networkManagementPage.expectStatusText(network.name, row.label);
      });

      await steps.step(`The detail screen shows ${row.label} and offers no usable Inactivate`, async () => {
        const detail = await networkManagementPage.openDetails(network.name);
        await detail.expectStatus(row.label);
        expect(await detail.getActionAvailability('inactivate'), 'Inactivate must be absent or disabled').not.toBe('available');
      });

      await steps.step('The list row offers no usable Inactivate either', async () => {
        await networkManagementPage.openList();
        await networkManagementPage.search(network.name);
        await networkManagementPage.expectRowActionUnavailable(network.name, 'inactivate');
      });
    });
  }

  test('TC-17812: should accept a 500-character Details text when the inactivation is confirmed', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let reasons: string[] = [];

    await steps.critical('Navigate to the module and read the maintained reasons', async () => {
      await networkManagementPage.openList();
      reasons = await networkManagementPage.readInactivationReasons(network.name);
      expect(reasons.length).toBeGreaterThan(0);
    });

    await steps.step('500 characters are held in full and the request is accepted without a Details error', async () => {
      const result = await networkManagementPage.attemptInactivation(network.name, reasons[0], DEACTIVATE.atLimit);
      expect(result.detailsHeld.length, 'all 500 characters should be held').toBe(DEACTIVATE.detailsLimit);
      expect(result.closed, `the request should be accepted (toast: "${result.toast}")`).toBe(true);
    });
  });

  test('TC-17813: should not let a Details text over 500 characters be submitted when 501 are entered', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let reasons: string[] = [];

    await steps.critical('Navigate to the module and read the maintained reasons', async () => {
      await networkManagementPage.openList();
      reasons = await networkManagementPage.readInactivationReasons(network.name);
      expect(reasons.length).toBeGreaterThan(0);
    });

    await steps.step('The field stops at 500, or the over-limit value is refused - never accepted', async () => {
      const result = await networkManagementPage.attemptInactivation(network.name, reasons[0], DEACTIVATE.overLimit);
      expect(result.detailsHeld.length, 'the field should not hold more than 500 characters').toBeLessThanOrEqual(DEACTIVATE.detailsLimit);
      expect(
        result.closed && result.detailsHeld.length > DEACTIVATE.detailsLimit,
        'an over-limit Details value must never be accepted',
      ).toBe(false);
    });
  });

  test('TC-17815: should accept the inactivation with only a reason when Details is left blank', async ({
    networkManagementPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let reasons: string[] = [];

    await steps.critical('Navigate to the module and read the maintained reasons', async () => {
      await networkManagementPage.openList();
      reasons = await networkManagementPage.readInactivationReasons(network.name);
      expect(reasons.length).toBeGreaterThan(0);
    });

    await steps.step('A reason with blank Details is accepted without a validation error', async () => {
      const result = await networkManagementPage.attemptInactivation(network.name, reasons[0], '');
      expect(result.closed, `the request should be accepted (toast: "${result.toast}")`).toBe(true);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
    });

    await steps.step('The request is processed for approval', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.pendingApproval);
    });
  });

  test('TC-17814: should block the inactivation and require a reason when none is selected', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let drawer!: NetworkInactivateDialog;

    await steps.critical('Navigate to the module and open the Inactivate drawer', async () => {
      await networkManagementPage.openList();
      drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step('The reason stays unselected while Details is typed', async () => {
      expect(await drawer.typeDetails(DEACTIVATE.detailsNoReason)).toBe(DEACTIVATE.detailsNoReason);
      expect(await drawer.getSelectedReason(), 'no reason should be chosen').toMatch(UNSELECTED_REASON);
    });

    await steps.step('Submitting is refused with a message requiring a reason, and nothing is staged', async () => {
      const attempt = await drawer.attemptConfirm();
      const errors = await drawer.getFieldErrors();
      expect(attempt.closed, 'the drawer must stay open - nothing may be submitted').toBe(false);
      expect(`${errors.reason} ${attempt.toast}`, 'the user should be told a reason is required').toContain(NETWORK_MESSAGE.required);
      await drawer.cancel();
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.published);
    });
  });

  test('TC-17816: should follow the decision table for status and decision when inactivation requests are submitted and decided', async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(40 * 60_000);
    const approved = await networkIn('Active');
    const rejected = await networkIn('Active');
    const pending = await networkIn('Pending');

    await steps.critical('Navigate to the Network Management module - the networks are listed', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(approved.name);
      await networkManagementPage.expectStatusText(approved.name, NETWORK_LIFECYCLE.active);
    });

    await steps.step('Active + submitted: the request waits for approval', async () => {
      await networkManagementPage.stageStatusChange(approved.name, 'inactivate');
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(approved.name);
      await networkManagementPage.expectApprovalCell(approved.name, APPROVAL_CELL.pendingApproval);
    });

    await steps.step('Active + approved: the network becomes Inactive', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(approved.name);
      expect(await networkManagementPage.readStatus(approved.name)).toBe(NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('Pending (non-Active): the request is blocked before it reaches approval', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(pending.name);
      await networkManagementPage.expectRowActionUnavailable(pending.name, 'inactivate');
      const lookup = await networkManagementPage.readInactivationReasonLookup();
      const answer = await networkManagementPage.submitInactivationRequest(pending.id, lookup[0].id, DEACTIVATE.details);
      expect(answer.status, `a direct request on a Pending network must be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });

    await steps.step('Active + rejected: the network stays Active', async () => {
      await networkManagementPage.stageStatusChange(rejected.name, 'inactivate');
      await networkManagementPage.rejectStagedChange(rejected.name);
      expect(await networkManagementPage.readStatus(rejected.name)).toBe(NETWORK_LIFECYCLE.active);
    });
  });

  test('TC-17821: should behave safely when the Inactivate drawer is explored with odd input, cancel and double submission', async ({
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let reasons: string[] = [];

    await steps.critical('Navigate to the module - the network is Active', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });

    await steps.step('The reason dropdown lists every maintained reason, each selectable', async () => {
      reasons = await networkManagementPage.readInactivationReasons(network.name);
      const lookup = await networkManagementPage.readInactivationReasonLookup();
      expect(reasons).toEqual(expect.arrayContaining(lookup.map((r) => r.englishName)));
      expect(new Set(reasons).size, 'no reason should be listed twice').toBe(reasons.length);
    });

    await steps.step('Special characters, emoji and padding are held without corruption', async () => {
      const drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      const held = await drawer.typeDetails(DEACTIVATE.exploratoryDetails);
      expect(held.trim(), 'the typed text should survive intact').toBe(DEACTIVATE.exploratoryDetails.trim());
      await drawer.cancel();
    });

    await steps.step('Cancelling after choosing a reason saves nothing - the network stays Active and Published', async () => {
      const drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      await drawer.selectReason(reasons[0]);
      await drawer.cancel();
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.published);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });

    await steps.step('A rapid double submission creates a single request', async () => {
      const drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      await drawer.selectReason(reasons[0]);
      await drawer.confirmRepeatedly(DEACTIVATE.rapidClicks);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectSingleQueuedRequest(network.name);
    });
  });
});
