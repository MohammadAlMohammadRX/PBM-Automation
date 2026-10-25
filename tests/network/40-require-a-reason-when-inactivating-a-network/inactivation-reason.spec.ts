import { test, expect } from '../../../fixtures';
import type { NetworkInactivateDialog } from '../../../pages/network/NetworkInactivateDialog';
import { NETWORK_LIFECYCLE, NETWORK_MESSAGE, NETWORK_TOAST } from '../../../data/networks/network.data';
import {
  ACCEPTED_LENGTHS,
  DETAILS,
  DETAILS_LIMIT,
  INVALID_REASONS,
  LIFECYCLE_TIMEOUT_MS,
  REASON_AUDIT,
  REASON_REQUIRED,
  UNSELECTED_REASON,
  counterFor,
} from '../../../data/networks/inactivationReason.data';
import { APPROVAL_CELL, AUDIT_EXPECTATION } from '../../../data/networks/deactivateNetwork.data';

/**
 * User story 14319: Require a reason when inactivating a network.
 * The reason is mandatory and must come from the maintained list - checked on
 * screen and on the wire - and the optional details are capped at 500.
 *
 * Confirming the drawer stages a draft; a case that must see the network
 * Inactive sends it for approval and approves it (publishStagedChange).
 */
test.describe('US 14319 - Inactivation reason rules', () => {
  test('TC-18251: should inactivate the network when a valid reason from the allowed list is selected', async ({
    networkManagementPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let drawer!: NetworkInactivateDialog;
    let reason = '';

    await steps.critical('Navigate to the module and open Inactivate - the reason list is shown', async () => {
      await networkManagementPage.openList();
      drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      const reasons = await drawer.getReasonOptions();
      expect(reasons.length).toBeGreaterThan(0);
      reason = reasons[0];
    });

    await steps.step('The selected reason is displayed in the field', async () => {
      await drawer.selectReason(reason);
      expect(await drawer.getSelectedReason()).toBe(reason);
    });

    await steps.step('Confirming succeeds with a message and the network becomes Inactive', async () => {
      await drawer.confirm();
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.inactive);
    });
  });

  test('TC-18252: should refuse to confirm and keep the network Active when no reason is selected', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let drawer!: NetworkInactivateDialog;

    await steps.critical('Navigate to the module and open Inactivate - the reason is empty', async () => {
      await networkManagementPage.openList();
      drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      expect(await drawer.getSelectedReason()).toMatch(UNSELECTED_REASON);
    });

    await steps.step('Confirming without a reason shows a required-reason error and the dialog stays open', async () => {
      const attempt = await drawer.attemptConfirm();
      const errors = await drawer.getFieldErrors();
      expect(attempt.closed, 'the dialog must stay open').toBe(false);
      expect(`${errors.reason} ${attempt.toast}`).toContain(NETWORK_MESSAGE.required);
    });

    await steps.step('Closed again, the network is still Active with nothing staged', async () => {
      await drawer.cancel();
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.published);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });
  });

  test('TC-18253: should reject a reason value outside the allowed list when it is submitted directly', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module and open Inactivate - the dialog opens', async () => {
      await networkManagementPage.openList();
      const reasons = await networkManagementPage.readInactivationReasons(network.name);
      expect(reasons.length).toBeGreaterThan(0);
    });

    for (const invalid of INVALID_REASONS) {
      await steps.step(`"${invalid}" is rejected by the server with a validation error`, async () => {
        const answer = await networkManagementPage.submitInactivationRequest(network.id, invalid, DETAILS.short);
        expect(answer.status, `the server must validate the reason: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
        expect(answer.status).toBeLessThan(500);
      });
    }

    await steps.step('The network status is unchanged and nothing is staged', async () => {
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.published);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });
  });

  for (const { azureId, length, text } of ACCEPTED_LENGTHS) {
    test(`TC-${azureId}: should save all ${length} characters of details when the inactivation is confirmed`, async ({
      networkManagementPage,
      networkIn,
      steps,
    }) => {
      test.setTimeout(LIFECYCLE_TIMEOUT_MS);
      const network = await networkIn('Active');
      let drawer!: NetworkInactivateDialog;

      await steps.critical('Navigate to the module and open Inactivate', async () => {
        await networkManagementPage.openList();
        drawer = await networkManagementPage.openDeactivationDrawer(network.name);
        expect(await drawer.isOpen()).toBe(true);
      });

      await steps.step(`All ${length} characters are accepted and the counter shows ${counterFor(length)}`, async () => {
        const [reason] = await drawer.getReasonOptions();
        await drawer.selectReason(reason);
        expect((await drawer.typeDetails(text)).length).toBe(length);
        expect(await drawer.getDetailsCounter(), 'the character counter').toBe(counterFor(length));
      });

      await steps.step(`Confirmed and approved, the full ${length}-character details are saved`, async () => {
        const attempt = await drawer.attemptConfirm();
        expect(attempt.closed, `the inactivation should be accepted (toast "${attempt.toast}")`).toBe(true);
        await networkManagementPage.publishStagedChange(network.name);
        const record = await networkManagementPage.readNetworkRecord(network.id);
        expect(record.inactivationDetails, 'the stored details').toBe(text);
      });
    });
  }

  test('TC-18255: should not persist details beyond 500 characters when 501 are entered', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let drawer!: NetworkInactivateDialog;

    await steps.critical('Navigate to the module and open Inactivate', async () => {
      await networkManagementPage.openList();
      drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step('The field stops at 500 characters or flags the limit', async () => {
      const [reason] = await drawer.getReasonOptions();
      await drawer.selectReason(reason);
      const held = await drawer.typeDetails(DETAILS.overLimit);
      const errors = await drawer.getFieldErrors();
      expect(held.length <= DETAILS_LIMIT || errors.details !== '', `held ${held.length} characters, error "${errors.details}"`).toBe(true);
    });

    await steps.step('Confirming never saves more than 500 characters of details', async () => {
      const held = await drawer.getDetailsValue();
      const attempt = await drawer.attemptConfirm();
      expect(attempt.closed && held.length > DETAILS_LIMIT, 'an over-limit value must not be accepted').toBe(false);
    });
  });

  test('TC-18257: should inactivate with no details recorded when a valid reason is given and details are blank', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let reason = '';

    await steps.critical('Navigate to the module and open Inactivate', async () => {
      await networkManagementPage.openList();
      [reason] = await networkManagementPage.readInactivationReasons(network.name);
      expect(reason).toBeTruthy();
    });

    await steps.step('A reason with blank details shows no validation error and is accepted', async () => {
      const result = await networkManagementPage.attemptInactivation(network.name, reason, '');
      expect(result.closed, `accepted (toast "${result.toast}")`).toBe(true);
    });

    await steps.step('Approved, the network is Inactive with no details recorded', async () => {
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.inactive);
      const record = await networkManagementPage.readNetworkRecord(network.id);
      expect(record.inactivationDetails ?? '', 'no details should be stored').toBe('');
    });
  });

  test('TC-18258: should require a reason in every case and cap details at 500 when the rule combinations are tried', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(35 * 60_000);
    const network = await networkIn('Active');
    const second = await networkIn('Active');
    let reason = '';

    await steps.critical('Navigate to the module - read the allowed reasons', async () => {
      await networkManagementPage.openList();
      [reason] = await networkManagementPage.readInactivationReasons(network.name);
      expect(reason).toBeTruthy();
    });

    await steps.step('Rule 3: no reason + valid details - blocked with a required-reason error', async () => {
      const result = await networkManagementPage.attemptInactivation(network.name, undefined, DETAILS.short);
      expect(result.closed, 'must be blocked').toBe(false);
      expect(`${result.toast} ${result.text}`).toMatch(REASON_REQUIRED);
    });

    await steps.step('Rule 4: no reason + no details - blocked with a required-reason error', async () => {
      const result = await networkManagementPage.attemptInactivation(network.name, undefined, '');
      expect(result.closed, 'must be blocked').toBe(false);
      expect(`${result.toast} ${result.text}`).toMatch(REASON_REQUIRED);
    });

    await steps.step('Rule 2: valid reason + details over 500 - blocked, or capped at 500', async () => {
      const result = await networkManagementPage.attemptInactivation(network.name, reason, DETAILS.overLimit);
      expect(result.closed && result.detailsHeld.length > DETAILS_LIMIT, 'an over-limit value must not be accepted').toBe(false);
    });

    await steps.step('Rule 1: valid reason + details under 500 - confirmed', async () => {
      const result = await networkManagementPage.attemptInactivation(second.name, reason, DETAILS.short);
      expect(result.closed, `accepted (toast "${result.toast}")`).toBe(true);
    });
  });

  test('TC-18259: should move the network to Inactive only after a valid reason is captured', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let drawer!: NetworkInactivateDialog;

    await steps.critical('Navigate to the module and open Inactivate - the network is still Active', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
      drawer = await networkManagementPage.openDeactivationDrawer(network.name);
    });

    await steps.step('Confirming without a reason is refused and the network stays Active', async () => {
      const attempt = await drawer.attemptConfirm();
      expect(attempt.closed).toBe(false);
      expect((await drawer.getFieldErrors()).reason, 'a required-reason error').toContain(NETWORK_MESSAGE.required);
    });

    await steps.step('With a valid reason the change is captured and, approved, the network is Inactive', async () => {
      const [reason] = await drawer.getReasonOptions();
      await drawer.selectReason(reason);
      await drawer.confirm();
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.inactive);
    });
  });

  test('TC-18260: should show the recorded reason and details in the history when an inactivated network is reviewed', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let reason = '';

    await steps.critical('Navigate to the module - enter the reason and details', async () => {
      await networkManagementPage.openList();
      [reason] = await networkManagementPage.readInactivationReasons(network.name);
      const result = await networkManagementPage.attemptInactivation(network.name, reason, DETAILS.history);
      expect(result.detailsHeld).toBe(DETAILS.history);
      expect(result.closed).toBe(true);
    });

    await steps.step('Approved, the network is Inactive', async () => {
      await networkManagementPage.publishStagedChange(network.name);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.inactive);
    });

    await steps.step('The history shows the reason and details exactly as submitted', async () => {
      await networkDetailPage.open(network.id);
      const audit = networkDetailPage.audit();
      await audit.open();
      await audit.expectEntry(REASON_AUDIT.action);
      const entries = await audit.readEntries();
      const index = entries.findIndex((e) => REASON_AUDIT.action.test(e.action) && e.by !== AUDIT_EXPECTATION.systemActor);
      expect(index).toBeGreaterThanOrEqual(0);
      const changes = JSON.stringify((await audit.openEntry(index)).changes);
      expect(changes, 'the reason').toContain(reason);
      expect(changes, 'the details').toContain(DETAILS.history);
      await audit.closeEntry();
    });
  });

  test('TC-18261: should store special characters, emoji and script-like details as plain text when they are entered', async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let drawer!: NetworkInactivateDialog;

    await steps.critical('Navigate to the module and open Inactivate with a reason chosen', async () => {
      await networkManagementPage.openList();
      drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      const [reason] = await drawer.getReasonOptions();
      await drawer.selectReason(reason);
      expect(await drawer.getSelectedReason()).toBe(reason);
    });

    await steps.step('The characters are held as plain text', async () => {
      expect(await drawer.typeDetails(DETAILS.hostile)).toBe(DETAILS.hostile);
    });

    await steps.step('Confirmed and approved, the details are stored and shown safely as plain text', async () => {
      await drawer.confirm();
      await networkManagementPage.publishStagedChange(network.name);
      const record = await networkManagementPage.readNetworkRecord(network.id);
      expect(record.inactivationDetails, 'stored unchanged').toBe(DETAILS.hostile);
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getName(), 'the screen still renders normally').toBe(network.name);
    });
  });

  test('TC-18262: should discard the entered reason and details when the dialog is cancelled mid-entry', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');

    await steps.critical('Navigate to the module and open Inactivate', async () => {
      await networkManagementPage.openList();
      const drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      expect(await drawer.isOpen()).toBe(true);
      await drawer.cancel();
    });

    await steps.step('Cancelled mid-entry, the dialog closes and the network stays Active', async () => {
      const [reason] = await networkManagementPage.readInactivationReasons(network.name);
      const drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      await drawer.selectReason(reason);
      await drawer.typeDetails(DETAILS.partial);
      await drawer.cancel();
      await networkManagementPage.expectApprovalCell(network.name, APPROVAL_CELL.published);
      await networkManagementPage.expectStatusText(network.name, NETWORK_LIFECYCLE.active);
    });

    await steps.step('Reopened, the reason and details are empty', async () => {
      const drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      expect(await drawer.getSelectedReason()).toMatch(UNSELECTED_REASON);
      expect(await drawer.getDetailsValue()).toBe('');
      await drawer.cancel();
    });
  });

  test('TC-18263: should mark the reason mandatory, list every allowed reason, count characters and gate Confirm', async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(LIFECYCLE_TIMEOUT_MS);
    const network = await networkIn('Active');
    let drawer!: NetworkInactivateDialog;

    await steps.critical('Navigate to the module and open Inactivate', async () => {
      await networkManagementPage.openList();
      drawer = await networkManagementPage.openDeactivationDrawer(network.name);
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step('The reason is marked mandatory and lists the complete allowed list', async () => {
      expect(await drawer.isReasonMarkedRequired(), 'a mandatory indicator on Reason').toBe(true);
      const lookup = await networkManagementPage.readInactivationReasonLookup();
      expect(await drawer.getReasonOptions()).toEqual(lookup.map((r) => r.englishName));
    });

    await steps.step('A live counter shows 0/500 and follows the typing', async () => {
      expect(await drawer.getDetailsCounter()).toBe(counterFor(0));
      await drawer.typeDetails(DETAILS.counterProbe);
      expect(await drawer.getDetailsCounter()).toBe(counterFor(DETAILS.counterProbe.length));
    });

    await steps.step('Confirm is disabled until a reason is chosen, then enabled', async () => {
      expect(await drawer.isSaveEnabled(), 'disabled before a reason').toBe(false);
      const [reason] = await drawer.getReasonOptions();
      await drawer.selectReason(reason);
      expect(await drawer.isSaveEnabled(), 'enabled after a reason').toBe(true);
      await drawer.cancel();
    });
  });
});
