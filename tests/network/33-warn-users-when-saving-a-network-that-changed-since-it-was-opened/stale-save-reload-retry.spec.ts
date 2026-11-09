import { test, expect } from '../../../fixtures';
import { CASES, CHANGES, CONFLICT, LOCKING_DRAFT, RELOAD_ACTION, SAVED_TOAST, edited } from '../../../data/networks/staleSaveReloadRetry.data';

/**
 * User story 14312: Warn users when saving a network that changed since it was
 * opened. Case 18155 - reload after the warning, reapply, save (see
 * staleSaveReloadRetry.data.ts).
 */
test.describe('US 14312 - Reload and retry after a stale-save warning', () => {
  test(`TC-${CASES.reloadRetry.azureId}: should save successfully after reloading when the user retries following a conflict warning`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const retry = edited(CHANGES.reapplied);

    await steps.critical('Navigate to the Network Management module in both sessions - the landing page loads', async () => {
      expect(await networkManagementPage.isListed(network.name), "NA_UserB's window lists the network").toBe(true);
      expect(await staleSession.networks.isListed(network.name), "NA_UserA's window lists the network").toBe(true);
    });

    await steps.step("NA_UserA's save after NA_UserB's update shows a warning instructing a reload", async () => {
      await staleSession.networks.openEditForm(network.name);
      expect((await networkManagementPage.stageEdit(network.name, 'type', CHANGES.otherUserType)).outcome?.status ?? 0).toBeLessThan(300);
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', edited(CHANGES.description));
      expect((await form.saveEditAndReport()).outcome?.status).toBe(CONFLICT.status);
      const prompt = await form.readConflictPrompt();
      expect(prompt.messages.join(' | ')).toMatch(CONFLICT.message);
      expect(prompt.dialogActions.join(','), 'the warning should offer Reload').toMatch(RELOAD_ACTION);
    });

    await steps.step("Reload shows NA_UserB's latest change and current version", async () => {
      const form = await staleSession.networks.reopenEditForm(network.name);
      expect(await form.readField('type')).toBe(CHANGES.otherUserType);
    });

    await steps.step('The change is reapplied on the freshly loaded data', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', retry);
      expect(await form.readField('descriptionEn')).toBe(retry);
    });

    await steps.step('Saving again succeeds with a confirmation and no further warning', async () => {
      const report = await staleSession.networks.editForm().saveEditAndReport();
      expect(report.outcome?.status ?? 0).toBeLessThan(300);
      expect(report.messages.join(' | ')).toContain(SAVED_TOAST);
      expect(report.messages.join(' | ')).not.toMatch(CONFLICT.message);
    });
  });
});
