import { test, expect } from '../../../fixtures';
import { NETWORK_LIFECYCLE, NETWORK_MESSAGE, NETWORK_SERVER_MESSAGE } from '../../../data/networks/network.data';
import { CASE, DELETE_AUDIT_ACTION } from '../../../data/networks/deleteNetwork.data';

/**
 * User story 14137: Delete a network, subject to approval when live.
 * The never-approved half: discarding outright, the confirmation and its
 * Cancel, what survives for audit, and who may start a deletion.
 */
test.describe('US 14137 - Deleting a never-approved network', () => {
  test(`TC-${CASE.draftDiscarded}: should discard a never-approved network outright when its deletion is confirmed`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilities: 0 });
    let result!: Awaited<ReturnType<typeof networkDetailPage.deleteAndCapture>>;

    await steps.critical('Navigate to the never-approved network - it shows its draft status', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getStatus()).toBe(NETWORK_LIFECYCLE.notLive);
    });

    await steps.step('Delete raises a confirmation and confirming discards the network', async () => {
      result = await networkDetailPage.deleteAndCapture();
      expect(result.outcome?.status, `DeleteNetwork: ${result.outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      expect(result.outcome?.text, 'the draft should be discarded, not staged').toContain(NETWORK_SERVER_MESSAGE.draftDiscarded);
    });

    await steps.step('The network is gone at once, with no approval step', async () => {
      expect(await networkManagementPage.isListed(network.name), 'the discarded network must leave the list').toBe(false);
    });
  });

  test(`TC-${CASE.confirmCancel}: should change nothing on Cancel and delete only on explicit confirmation when Delete is chosen`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilities: 0 });

    await steps.critical('Navigate to an eligible network', async () => {
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getName()).toBe(network.name);
    });

    await steps.step('Delete shows a confirmation describing the deletion', async () => {
      const dialog = await networkDetailPage.openDelete();
      expect(await dialog.getTitle()).toBe(NETWORK_MESSAGE.deleteTitle);
      expect(await dialog.getMessage(), 'the prompt should name the network').toContain(network.name);
      await dialog.cancel();
    });

    await steps.step('Cancel closes the dialog and the network is unchanged', async () => {
      expect(await networkManagementPage.isListed(network.name)).toBe(true);
      await networkDetailPage.open(network.id);
      expect(await networkDetailPage.getStatus()).toBe(NETWORK_LIFECYCLE.notLive);
    });

    await steps.step('Delete again and confirm - the deletion proceeds', async () => {
      const result = await networkDetailPage.deleteAndCapture();
      expect(result.outcome?.status).toBeLessThan(300);
      expect(await networkManagementPage.isListed(network.name)).toBe(false);
    });
  });

  test(`TC-${CASE.logicalDeletion}: should keep the deleted record and its history available for audit when a network is deleted`, async ({
    networkManagementPage,
    networkDetailPage,
    auditLogsPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilities: 0 });
    let code = '';

    await steps.critical('Navigate to the network, note its code and delete it', async () => {
      await networkDetailPage.open(network.id);
      code = (await networkDetailPage.readOverview()).code;
      expect(code).not.toBe('');
      const result = await networkDetailPage.deleteAndCapture();
      expect(result.outcome?.status).toBeLessThan(300);
    });

    await steps.step('The network no longer appears in the active list', async () => {
      expect(await networkManagementPage.isListed(network.name)).toBe(false);
    });

    await steps.step('The audit log still holds the deleted record', async () => {
      const rows = await auditLogsPage.findRowsMentioning(code);
      expect(rows.length, `the system audit log should mention ${code}`).toBeGreaterThan(0);
      expect(rows.map((row) => row.actionType).join(' | '), 'a Delete entry').toMatch(DELETE_AUDIT_ACTION);
    });

    await steps.step('The record itself is preserved (logically deleted), with its data intact', async () => {
      await networkDetailPage.openExpectingFailure(network.id);
      expect(await networkDetailPage.isLoaded(), 'the deleted record should still be retrievable for audit').toBe(true);
      expect((await networkDetailPage.readOverview()).code, 'its original code should survive').toBe(code);
    });
  });

  test(`TC-${CASE.noPermission}: should withhold the Delete action when a user without deletion permission opens a network`, async ({
    networkManagementPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilities: 0 });

    await steps.critical('Navigate as the administrator - the network offers Delete (baseline)', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network.name);
      expect(await networkManagementPage.getRowActionAvailability(network.name, 'delete')).toBe('available');
    });

    await steps.step('The user without deletion permission is offered no usable Delete', async () => {
      const session = await shapedNonAdmin({ without: ['deleteNetwork'] });
      await session.networks.openList();
      await session.networks.search(network.name);
      expect(await session.networks.getRowActionAvailability(network.name, 'delete'), 'Delete on the list row').not.toBe('available');
      await session.networkDetail.openExpectingFailure(network.id);
      expect(await session.networkDetail.getActionAvailability('delete'), 'Delete on the detail header').not.toBe('available');
    });
  });
});
