import { test, expect } from '../../../fixtures';
import type { ConflictPrompt, EditSaveReport } from '../../../pages/network/NetworkFormDialog';
import { CASE, CHANGES, CONFLICT, LOCKING_DRAFT, RAPID_REFRESHES, RELOAD_ACTION, edited } from '../../../data/networks/optimisticLocking.data';

/**
 * User story 14138: Prevent concurrent edits with optimistic locking.
 * The interface half - two windows editing one network, the conflict, the
 * refresh and the retry.
 *
 * The second "administrator" is a second window signed in as the same
 * administrator (fixture `staleSession`): the lock is per record, and the
 * environment has one administrator account. Every case edits its own draft.
 */
test.describe('US 14138 - Optimistic locking in the edit drawer', () => {
  test(`TC-${CASE.matchingStamp}: should save and issue a new stamp when the submitted stamp matches the current one`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const newName = `${network.name} ${CHANGES.renamedSuffix}`;
    let stampBefore = '';

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Open the network for editing - the form is populated and the record carries a stamp', async () => {
      stampBefore = String((await networkManagementPage.readNetworkRecord(network.id)).concurrencyStamp ?? '');
      expect(stampBefore, 'GetNetwork should hand the drawer a concurrency stamp').not.toBe('');
      const form = await networkManagementPage.openEditForm(network.name);
      expect(await form.readField('nameEn')).toBe(network.name);
    });

    await steps.step('The Network Name field shows the new value', async () => {
      const form = await networkManagementPage.reopenEditForm(network.name);
      await form.editField('nameEn', newName);
      expect(await form.readField('nameEn')).toBe(newName);
      const report = await form.saveEditAndReport();
      expect(report.outcome, 'the save should reach UpdateNetwork').not.toBeNull();
      expect(report.outcome!.status, `a save with the current stamp should be accepted: ${report.outcome!.text.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('The record is saved with the new name and a newly generated stamp', async () => {
      const after = await networkManagementPage.readNetworkRecord(network.id);
      expect(after.networkNameEn, 'the new name should be saved').toBe(newName);
      expect(String(after.concurrencyStamp ?? ''), 'a successful save should issue a new stamp').not.toBe(stampBefore);
    });
  });

  test(`TC-${CASE.staleStamp}: should refuse the save with a conflict and overwrite nothing when the edit form holds a stale stamp`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const firstValue = edited(CHANGES.firstAdmin);

    await steps.critical('Navigate to the module in both windows - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('The second window holds an edit form loaded before the first window saved', async () => {
      const staleForm = await staleSession.networks.openEditForm(network.name);
      expect(await staleForm.readField('descriptionEn'), 'the stale form shows the value as first loaded').not.toBe(firstValue);
      const saved = await networkManagementPage.stageEdit(network.name, 'descriptionEn', firstValue);
      expect(saved.outcome?.status ?? 0, 'the first window\'s save should be accepted').toBeLessThan(300);
    });

    await steps.step('Saving from the stale form is refused with a conflict', async () => {
      const staleForm = staleSession.networks.editForm();
      await staleForm.editField('descriptionEn', edited(CHANGES.staleEdit));
      const report = await staleForm.saveEditAndReport();
      expect(report.outcome, 'the stale save should reach the server').not.toBeNull();
      expect(report.outcome!.status, `a stale stamp should be refused with ${CONFLICT.status}`).toBe(CONFLICT.status);
      expect(report.outcome!.text, 'the refusal should say the record changed').toMatch(CONFLICT.message);
    });

    await steps.step('No data is overwritten - the record keeps the first window\'s value', async () => {
      expect((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn).toBe(firstValue);
    });
  });

  test(`TC-${CASE.stateTransition}: should move from editing through conflict and refresh to a successful update when a stale editor retries`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const firstValue = edited(CHANGES.firstAdmin);
    const retryValue = edited(CHANGES.reapplied);
    let stampOpened = '';

    await steps.critical('Navigate to the module in both windows - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('Editing: window B loads the form while the stamp is the original one', async () => {
      stampOpened = String((await networkManagementPage.readNetworkRecord(network.id)).concurrencyStamp ?? '');
      await staleSession.networks.openEditForm(network.name);
      expect(stampOpened).not.toBe('');
    });

    await steps.critical('Updated: window A saves and the stamp advances', async () => {
      const saved = await networkManagementPage.stageEdit(network.name, 'descriptionEn', firstValue);
      expect(saved.outcome?.status ?? 0).toBeLessThan(300);
      expect(String((await networkManagementPage.readNetworkRecord(network.id)).concurrencyStamp ?? '')).not.toBe(stampOpened);
    });

    await steps.step('Conflict: window B\'s save is refused and a refresh prompt is shown', async () => {
      const staleForm = staleSession.networks.editForm();
      await staleForm.editField('descriptionEn', edited(CHANGES.staleEdit));
      const report = await staleForm.saveEditAndReport();
      expect(report.outcome?.status, 'the stale save should be a conflict').toBe(CONFLICT.status);
      const prompt = await staleForm.readConflictPrompt();
      expect(prompt.messages.join(' | '), 'the user should be told the network changed').toMatch(CONFLICT.message);
      expect(prompt.dialogActions.join(','), 'the prompt should offer a refresh action').toMatch(RELOAD_ACTION);
    });

    await steps.step('Refreshed: the reloaded form shows window A\'s value', async () => {
      const form = await staleSession.networks.reopenEditForm(network.name);
      expect(await form.readField('descriptionEn')).toBe(firstValue);
    });

    await steps.step('Updated: window B reapplies its change and the save is persisted', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', retryValue);
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status ?? 0, 'the retried save should be accepted').toBeLessThan(300);
      expect((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn).toBe(retryValue);
    });
  });

  test(`TC-${CASE.twoAdministrators}: should apply both administrators' changes through conflict and retry when they edit the same network at once`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const firstValue = edited(CHANGES.firstAdmin);

    await steps.critical('Navigate to the module in both windows - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('Both administrators open the network - both forms show the same values', async () => {
      const second = await staleSession.networks.openEditForm(network.name);
      const first = await networkManagementPage.openEditForm(network.name);
      expect(await second.readField('descriptionEn')).toBe(await first.readField('descriptionEn'));
    });

    await steps.critical('Administrator 1 changes the description and saves - accepted', async () => {
      const form = networkManagementPage.editForm();
      await form.editField('descriptionEn', firstValue);
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status ?? 0).toBeLessThan(300);
    });

    await steps.step('Administrator 2 changes a different field and is shown a conflict asking to refresh', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('type', CHANGES.secondAdminType);
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status, 'the second save carries the original stamp').toBe(CONFLICT.status);
      const prompt = await form.readConflictPrompt();
      expect(prompt.messages.join(' | ')).toMatch(CONFLICT.message);
      expect(prompt.dialogActions.join(','), 'a refresh/retry action should be offered').toMatch(RELOAD_ACTION);
    });

    await steps.step('After refreshing, administrator 2 sees administrator 1\'s change', async () => {
      const form = await staleSession.networks.reopenEditForm(network.name);
      expect(await form.readField('descriptionEn')).toBe(firstValue);
    });

    await steps.step('Administrator 2 reapplies the change and both changes are kept', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('type', CHANGES.secondAdminType);
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status ?? 0).toBeLessThan(300);
      const record = await networkManagementPage.readNetworkRecord(network.id);
      expect(record.descriptionEn, 'administrator 1\'s change survives').toBe(firstValue);
      const form2 = await networkManagementPage.reopenEditForm(network.name);
      expect(await form2.readField('type'), 'administrator 2\'s change is applied').toBe(CHANGES.secondAdminType);
    });
  });

  test(`TC-${CASE.exploratory}: should keep the refresh-and-retry flow stable when the user navigates away, refreshes rapidly and edits after refreshing`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const firstValue = edited(CHANGES.firstAdmin);

    await steps.critical('Navigate to the module in both windows - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('A stale save raises a conflict', async () => {
      await staleSession.networks.openEditForm(network.name);
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', firstValue)).outcome?.status ?? 0).toBeLessThan(300);
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', edited(CHANGES.staleEdit));
      expect((await form.saveEditAndReport()).outcome?.status).toBe(CONFLICT.status);
    });

    await steps.step('Navigating away mid-conflict and returning leaves a working list', async () => {
      await staleSession.networks.goBack();
      await staleSession.networks.openList();
      await staleSession.networks.search(network.name);
      await staleSession.networks.waitForRowVisible(network.name);
    });

    await steps.step(`Refreshing ${RAPID_REFRESHES} times in a row reloads the latest data each time`, async () => {
      for (let attempt = 1; attempt <= RAPID_REFRESHES; attempt += 1) {
        const form = await staleSession.networks.reopenEditForm(network.name);
        expect(await form.readField('descriptionEn'), `refresh ${attempt} should show the saved value`).toBe(firstValue);
      }
    });

    await steps.step('Values typed after the refresh are kept alongside the refreshed data', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('descriptionAr', CHANGES.extraAfterRefresh);
      expect(await form.readField('descriptionAr')).toBe(CHANGES.extraAfterRefresh);
      expect(await form.readField('descriptionEn'), 'the refreshed base value stays').toBe(firstValue);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${CASE.checklist}: should return 409 with a clear message, offer refresh and keep the old values when a conflict occurs`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const firstName = `${network.name} ${CHANGES.renamedSuffix}`;
    const staleName = `${network.name} stale`;
    let report!: EditSaveReport;
    let prompt!: ConflictPrompt;

    await steps.critical('Navigate to the module in both windows - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('A conflict is triggered - the stale save returns an error response', async () => {
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

    await steps.step('No partial data was saved - the list still shows the pre-conflict name', async () => {
      expect(await networkManagementPage.isListed(firstName), 'the accepted name stays').toBe(true);
      expect((await networkManagementPage.readNetworkRecord(network.id)).networkNameEn).toBe(firstName);
    });
  });
});
