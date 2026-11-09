import { test, expect } from '../../../fixtures';
import type { ConflictPrompt, SaveReport } from '../../../pages/network/NetworkFormDialog';
import { CASES, CHANGES, CONFLICT, LOCKING_DRAFT, RELOAD_ACTION, edited } from '../../../data/networks/conflictRetry.data';

/**
 * User story 14138: Prevent concurrent edits with optimistic locking.
 * The conflict-and-retry cases automated again on 2026-11-08 (see
 * conflictRetry.data.ts): two windows of the administrator edit one draft
 * network; the stale save meets a conflict, refreshes and retries.
 */
test.describe('US 14138 - Conflict, refresh and retry', () => {
  test(`TC-${CASES.stateTransition.azureId}: should move from editing through conflict and refresh to a successful update when a stale editor retries`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const firstValue = edited(CHANGES.firstAdmin);
    const retryValue = edited(CHANGES.reapplied);
    let stampOpened = '';

    await steps.critical('Navigate to the Network Management module in both windows - the list loads', async () => {
      expect(await networkManagementPage.isListed(network.name), 'window A lists the network').toBe(true);
      expect(await staleSession.networks.isListed(network.name), 'window B lists the network').toBe(true);
    });

    await steps.critical('Editing: user B opens the form while the stamp is the original one', async () => {
      stampOpened = String((await networkManagementPage.readNetworkRecord(network.id)).concurrencyStamp ?? '');
      await staleSession.networks.openEditForm(network.name);
      expect(stampOpened, 'the form loads with the current stamp').not.toBe('');
    });

    await steps.critical('Updated: user A saves and the stamp advances', async () => {
      const saved = await networkManagementPage.stageEdit(network.name, 'descriptionEn', firstValue);
      expect(saved.outcome?.status ?? 0).toBeLessThan(300);
      expect(String((await networkManagementPage.readNetworkRecord(network.id)).concurrencyStamp ?? '')).not.toBe(stampOpened);
    });

    await steps.step("Conflict: user B's save with the stale stamp is refused with a prompt to refresh", async () => {
      const staleForm = staleSession.networks.editForm();
      await staleForm.editField('descriptionEn', edited(CHANGES.staleEdit));
      const report = await staleForm.saveEditAndReport();
      expect(report.outcome?.status, 'the stale save should be a conflict').toBe(CONFLICT.status);
      const prompt = await staleForm.readConflictPrompt();
      expect(prompt.messages.join(' | '), 'the user should be told the network changed').toMatch(CONFLICT.message);
      expect(prompt.dialogActions.join(','), 'the prompt should offer a refresh action').toMatch(RELOAD_ACTION);
    });

    await steps.step("Refreshed: the reloaded form shows the current values (user A's)", async () => {
      const form = await staleSession.networks.reopenEditForm(network.name);
      expect(await form.readField('descriptionEn')).toBe(firstValue);
    });

    await steps.step('Updated: user B reapplies the change and the save is persisted', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', retryValue);
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status ?? 0, 'the retried save should be accepted').toBeLessThan(300);
      expect((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn).toBe(retryValue);
    });
  });

  test(`TC-${CASES.twoAdministrators.azureId}: should apply both administrators' changes through conflict and retry when they edit the same network at once`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const firstValue = edited(CHANGES.firstAdmin);

    await steps.critical('Navigate to the Network Management module in both windows - the list loads', async () => {
      expect(await networkManagementPage.isListed(network.name), 'administrator 1 lists the network').toBe(true);
      expect(await staleSession.networks.isListed(network.name), 'administrator 2 lists the network').toBe(true);
    });

    await steps.critical('Administrator 1 opens the network for editing - the form loads with the current values', async () => {
      const first = await networkManagementPage.openEditForm(network.name);
      expect(await first.readField('descriptionEn'), 'the form is populated').not.toBe('');
    });

    await steps.critical('Administrator 2 opens the same network at the same time - the same values load', async () => {
      const second = await staleSession.networks.openEditForm(network.name);
      expect(await second.readField('descriptionEn')).toBe(await networkManagementPage.editForm().readField('descriptionEn'));
    });

    await steps.critical('Administrator 1 changes the description and saves - accepted', async () => {
      const form = networkManagementPage.editForm();
      await form.editField('descriptionEn', firstValue);
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status ?? 0).toBeLessThan(300);
    });

    await steps.step('Administrator 2 changes a different field and is shown a conflict asking to refresh and retry', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('type', CHANGES.secondAdminType);
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status, 'the second save carries the original stamp').toBe(CONFLICT.status);
      const prompt = await form.readConflictPrompt();
      expect(prompt.messages.join(' | ')).toMatch(CONFLICT.message);
      expect(prompt.dialogActions.join(','), 'a refresh/retry action should be offered').toMatch(RELOAD_ACTION);
    });

    await steps.step("After refreshing, administrator 2 sees administrator 1's change", async () => {
      const form = await staleSession.networks.reopenEditForm(network.name);
      expect(await form.readField('descriptionEn')).toBe(firstValue);
    });

    await steps.step('Administrator 2 reapplies the change and both changes are kept', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('type', CHANGES.secondAdminType);
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status ?? 0).toBeLessThan(300);
      const record = await networkManagementPage.readNetworkRecord(network.id);
      expect(record.descriptionEn, "administrator 1's change survives").toBe(firstValue);
      const reopened = await networkManagementPage.reopenEditForm(network.name);
      expect(await reopened.readField('type'), "administrator 2's change is applied").toBe(CHANGES.secondAdminType);
    });
  });

  test(`TC-${CASES.checklist.azureId}: should return 409 with a clear message, offer refresh and keep the old values when a conflict occurs`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const firstName = `${network.name} ${CHANGES.renamedSuffix}`;
    const staleName = `${network.name} stale`;
    let report!: SaveReport;
    let prompt!: ConflictPrompt;

    await steps.critical('Navigate to the Network Management module in both windows - the list loads', async () => {
      expect(await networkManagementPage.isListed(network.name), 'window A lists the network').toBe(true);
      expect(await staleSession.networks.isListed(network.name), 'window B lists the network').toBe(true);
    });

    await steps.critical('A concurrency conflict is triggered - the stale save returns an error response', async () => {
      await staleSession.networks.openEditForm(network.name);
      expect((await networkManagementPage.stageEdit(network.name, 'nameEn', firstName)).outcome?.status ?? 0).toBeLessThan(300);
      const form = staleSession.networks.editForm();
      await form.editField('nameEn', staleName);
      report = await form.saveEditAndReport();
      prompt = await form.readConflictPrompt();
      expect(report.outcome, 'the stale save should reach the server').not.toBeNull();
    });

    await steps.step('The status code is 409 Conflict', async () => {
      expect(report.outcome!.status).toBe(CONFLICT.status);
    });

    await steps.step('The response says the record was modified by another user', async () => {
      expect(report.outcome!.text).toMatch(CONFLICT.message);
    });

    await steps.step('The screen prompts the user to refresh and retry, with a visible action', async () => {
      expect(prompt.messages.join(' | '), 'a message should be shown').toMatch(CONFLICT.message);
      expect(prompt.dialogActions.join(','), 'a refresh/retry action should be visible').toMatch(RELOAD_ACTION);
    });

    await steps.step('No partial data was saved - the list still shows the pre-conflict values', async () => {
      expect(await networkManagementPage.isListed(firstName), 'the accepted name stays').toBe(true);
      expect((await networkManagementPage.readNetworkRecord(network.id)).networkNameEn).toBe(firstName);
    });
  });
});
