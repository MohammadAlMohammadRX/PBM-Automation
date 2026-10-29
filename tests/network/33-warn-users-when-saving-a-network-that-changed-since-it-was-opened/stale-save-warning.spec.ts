import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import {
  CASE,
  CHANGES,
  CONFLICT,
  LOCKING_DRAFT,
  OVERWRITE_ACTIONS,
  RELOAD_ACTION,
  SAVED_TOAST,
  edited,
} from '../../../data/networks/staleSaveWarning.data';

/**
 * User story 14312: Warn users when saving a network that changed since it was
 * opened. What the second saver is shown, and what reloading does.
 *
 * NA_UserA is the stale window (`staleSession`), NA_UserB the main window -
 * both the same administrator, since the version check is per record. Each
 * case edits its own network.
 */
test.describe('US 14312 - Stale-save warning in the edit drawer', () => {
  test(`TC-${CASE.noConflict}: should save without any conflict warning when nobody changed the network in the meantime`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const value = edited(CHANGES.description);

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Open the network for editing - the current values load', async () => {
      const form = await networkManagementPage.openEditForm(network.name);
      expect(await form.readField('nameEn')).toBe(network.name);
    });

    await steps.step('The description shows the new value', async () => {
      const form = networkManagementPage.editForm();
      await form.editField('descriptionEn', value);
      expect(await form.readField('descriptionEn')).toBe(value);
    });

    await steps.step('Save succeeds with a confirmation and no conflict warning', async () => {
      const report = await networkManagementPage.editForm().saveEditAndReport();
      expect(report.outcome?.status ?? 0, 'the save should be accepted').toBeLessThan(300);
      expect(report.messages.join(' | '), 'a confirmation should be shown').toContain(SAVED_TOAST);
      expect(report.messages.join(' | '), 'no conflict warning').not.toMatch(CONFLICT.message);
      expect((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn).toBe(value);
    });
  });

  test(`TC-${CASE.warned}: should warn the saving user and block the save when another user changed the network after it was opened`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);

    await steps.critical('Navigate to the module in both sessions - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('NA_UserA opens the network for editing', async () => {
      const form = await staleSession.networks.openEditForm(network.name);
      expect(await form.readField('nameEn')).toBe(network.name);
    });

    await steps.critical('NA_UserB changes a field and saves - accepted', async () => {
      expect((await networkManagementPage.stageEdit(network.name, 'type', CHANGES.otherUserType)).outcome?.status ?? 0).toBeLessThan(300);
    });

    await steps.step('NA_UserA changes a different field and saves - the save request is sent', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', edited(CHANGES.description));
      const report = await form.saveEditAndReport();
      expect(report.outcome, 'the stale save should reach the server').not.toBeNull();
      expect(report.outcome!.status, 'it should be refused as stale').toBe(CONFLICT.status);
    });

    await steps.step('NA_UserA is warned the network changed since it was opened, and the save is not applied', async () => {
      const prompt = await staleSession.networks.editForm().readConflictPrompt();
      expect(prompt.messages.join(' | '), 'a change-since-opened warning').toMatch(CONFLICT.message);
      expect((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn, 'NA_UserA\'s description must not be applied')
        .not.toContain(CHANGES.description);
    });
  });

  test(`TC-${CASE.stateTransition}: should move the attempted save into a conflict-warning state when the record version changed underneath it`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    let openedStamp = '';
    const local = edited(CHANGES.description);

    await steps.critical('Navigate to the module in both sessions - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('Opened/unmodified: NA_UserA loads the record at its current version', async () => {
      openedStamp = String((await networkManagementPage.readNetworkRecord(network.id)).concurrencyStamp ?? '');
      await staleSession.networks.openEditForm(network.name);
      expect(openedStamp).not.toBe('');
    });

    await steps.critical('NA_UserB saves a change - the version moves on', async () => {
      expect((await networkManagementPage.stageEdit(network.name, 'type', CHANGES.otherUserType)).outcome?.status ?? 0).toBeLessThan(300);
      expect(String((await networkManagementPage.readNetworkRecord(network.id)).concurrencyStamp ?? '')).not.toBe(openedStamp);
    });

    await steps.step('Opened/modified locally: NA_UserA\'s edit shows on screen', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', local);
      expect(await form.readField('descriptionEn')).toBe(local);
    });

    await steps.step('The save transition is blocked and a conflict warning is shown instead', async () => {
      const form = staleSession.networks.editForm();
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status).toBe(CONFLICT.status);
      expect((await form.readConflictPrompt()).messages.join(' | ')).toMatch(CONFLICT.message);
    });
  });

  test(`TC-${CASE.roleDecisionTable}: should warn editors by version state and keep viewers from saving at all when roles and versions combine`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active', LOCKING_DRAFT);
    let viewer!: ShapedSession;

    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.step('Case 1 - administrator, version matches: the save succeeds with no warning', async () => {
      const report = await networkManagementPage.stageEdit(network.name, 'descriptionEn', edited(CHANGES.description));
      expect(report.outcome?.status ?? 0).toBeLessThan(300);
      expect(report.messages.join(' | ')).not.toMatch(CONFLICT.message);
    });

    await steps.step('Case 2 - administrator, version mismatched: a conflict warning is shown', async () => {
      await staleSession.networks.openEditForm(network.name);
      expect((await networkManagementPage.stageEdit(network.name, 'type', CHANGES.otherUserType)).outcome?.status ?? 0).toBeLessThan(300);
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', edited(CHANGES.reapplied));
      expect((await form.saveEditAndReport()).outcome?.status).toBe(CONFLICT.status);
      expect((await form.readConflictPrompt()).messages.join(' | ')).toMatch(CONFLICT.message);
    });

    await steps.step('Case 3 - viewer role: no edit/save is offered whatever the version', async () => {
      viewer = await shapedNonAdmin({ without: ['editNetwork'] });
      await viewer.networks.openList();
      await viewer.networks.search(network.name);
      await viewer.networks.expectRowActionUnavailable(network.name, 'edit');
    });
  });

  test(`TC-${CASE.differentFields}: should still flag a conflict when the two users edited entirely different fields`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);

    await steps.critical('Navigate to the module in both sessions - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('NA_UserA opens the network planning to edit only the description', async () => {
      const form = await staleSession.networks.openEditForm(network.name);
      expect(await form.readField('nameEn')).toBe(network.name);
    });

    await steps.critical('NA_UserB changes only the type and saves - accepted', async () => {
      expect((await networkManagementPage.stageEdit(network.name, 'type', CHANGES.otherUserType)).outcome?.status ?? 0).toBeLessThan(300);
    });

    await steps.step('NA_UserA\'s save of a field NA_UserB never touched is still flagged as a conflict', async () => {
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', edited(CHANGES.description));
      expect((await form.saveEditAndReport()).outcome?.status, 'the check is on the record version, not per field').toBe(CONFLICT.status);
      expect((await form.readConflictPrompt()).messages.join(' | ')).toMatch(CONFLICT.message);
    });
  });

  test(`TC-${CASE.dialogChecklist}: should state the change, prompt a reload and offer no overwrite when the conflict warning appears`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    let actions: string[] = [];
    let messages = '';

    await steps.critical('Navigate to the module in both sessions - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('The conflict scenario is triggered and Save is clicked - the warning appears', async () => {
      await staleSession.networks.openEditForm(network.name);
      expect((await networkManagementPage.stageEdit(network.name, 'type', CHANGES.otherUserType)).outcome?.status ?? 0).toBeLessThan(300);
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', edited(CHANGES.description));
      expect((await form.saveEditAndReport()).outcome?.status).toBe(CONFLICT.status);
      const prompt = await form.readConflictPrompt();
      actions = prompt.dialogActions;
      messages = [prompt.dialogTitle, ...prompt.messages].join(' | ');
      expect(messages, 'a warning should be on screen').not.toBe('');
    });

    await steps.step('Message clarity: the warning says the network changed since it was opened', async () => {
      expect(messages).toMatch(CONFLICT.message);
    });

    await steps.step('Reload prompt: a reload instruction or button is present', async () => {
      expect([...actions, messages].join(' | ')).toMatch(RELOAD_ACTION);
    });

    await steps.step('No silent save: no option saves over the conflict without reloading', async () => {
      expect(actions.filter((action) => OVERWRITE_ACTIONS.test(action)), 'overwrite-style actions offered').toEqual([]);
    });
  });

  test(`TC-${CASE.reloadDiscards}: should replace the stale local edit with the server's values when the user reloads after the warning`, async ({
    networkManagementPage,
    staleSession,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    const serverValue = edited(CHANGES.description);

    await steps.critical('Navigate to the module in both sessions - the list loads', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
    });

    await steps.critical('A local description edit hits the conflict warning on save', async () => {
      await staleSession.networks.openEditForm(network.name);
      expect((await networkManagementPage.stageEdit(network.name, 'descriptionEn', serverValue)).outcome?.status ?? 0).toBeLessThan(300);
      const form = staleSession.networks.editForm();
      await form.editField('descriptionEn', CHANGES.localUnsaved);
      expect((await form.saveEditAndReport()).outcome?.status).toBe(CONFLICT.status);
    });

    await steps.step('Reloading shows the other user\'s latest saved data', async () => {
      const form = await staleSession.networks.reopenEditForm(network.name);
      expect(await form.readField('descriptionEn')).toBe(serverValue);
    });

    await steps.step('The description holds the server value, not the discarded local edit', async () => {
      expect(await staleSession.networks.editForm().readField('descriptionEn')).not.toBe(CHANGES.localUnsaved);
    });

    await steps.step('The version now held matches the server\'s current version', async () => {
      const record = await networkManagementPage.readNetworkRecord(network.id);
      const report = await staleSession.networks.updateWithStamp(record, { descriptionEn: edited(CHANGES.reapplied) }, String(record.concurrencyStamp));
      expect(report.status, 'a save on the reloaded version should be accepted').toBeLessThan(300);
    });
  });
});
