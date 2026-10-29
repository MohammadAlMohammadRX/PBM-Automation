import { test, expect } from '../../../fixtures';
import { CASE, CHANGES, CONFLICT, LOCKING_DRAFT, RAPID_REFRESHES, edited } from '../../../data/networks/optimisticLocking.data';

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
});
