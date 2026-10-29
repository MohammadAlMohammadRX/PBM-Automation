import { test, expect } from '../../../fixtures';
import type { NetworkRecord } from '../../../utils/NetworkProvisioning';
import {
  CASE,
  CHANGES,
  CONFLICT,
  LOCKING_DRAFT,
  RELOAD_ACTION,
  edited,
} from '../../../data/networks/staleSaveWarning.data';

/**
 * User story 14312: Warn users when saving a network that changed since it was
 * opened. The server side of the warning - a stale version sent straight to
 * UpdateNetwork, the exact-match boundary, and two racing saves. Sent through
 * NetworkManagementPage.updateWithStamp.
 */
test.describe('US 14312 - Stale-save check on the server', () => {
  test(`TC-${CASE.apiBypass}: should refuse a force-save with a conflict and keep the newer data when a stale version is sent directly`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    let stale!: NetworkRecord;
    let answer!: { status: number; text: string };

    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('NA_UserA\'s version is recorded at open time', async () => {
      stale = await networkManagementPage.readNetworkRecord(network.id);
      expect(String(stale.concurrencyStamp ?? '')).not.toBe('');
    });

    await steps.critical('After NA_UserB\'s update, a direct save with the stale version is submitted', async () => {
      expect((await networkManagementPage.stageEdit(network.name, 'type', CHANGES.otherUserType)).outcome?.status ?? 0).toBeLessThan(300);
      answer = await networkManagementPage.updateWithStamp(stale, { descriptionEn: edited(CHANGES.localUnsaved) }, String(stale.concurrencyStamp));
      expect(answer.text).not.toBe('');
    });

    await steps.step('The server rejects it with a conflict rather than applying the overwrite', async () => {
      expect(answer.status).toBe(CONFLICT.status);
      expect(answer.text).toMatch(CONFLICT.message);
    });

    await steps.step('The record still reflects NA_UserB\'s update', async () => {
      const form = await networkManagementPage.reopenEditForm(network.name);
      expect(await form.readField('type')).toBe(CHANGES.otherUserType);
      expect((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn).toBe(stale.descriptionEn);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${CASE.offByOne}: should save on an exact version match and flag a conflict the moment the version moves by one`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    let current!: NetworkRecord;

    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('A save referencing the exact current version succeeds', async () => {
      current = await networkManagementPage.readNetworkRecord(network.id);
      const answer = await networkManagementPage.updateWithStamp(current, { descriptionEn: edited(CHANGES.description) }, String(current.concurrencyStamp));
      expect(answer.status, answer.text.slice(0, 200)).toBeLessThan(300);
    });

    await steps.critical('The record is opened again, then updated once in the background - the version moves by one', async () => {
      current = await networkManagementPage.readNetworkRecord(network.id);
      const background = await networkManagementPage.updateWithStamp(current, { descriptionEn: edited(CHANGES.reapplied) }, String(current.concurrencyStamp));
      expect(background.status).toBeLessThan(300);
      expect(String((await networkManagementPage.readNetworkRecord(network.id)).concurrencyStamp)).not.toBe(String(current.concurrencyStamp));
    });

    await steps.step('A save referencing the version one behind is blocked as a conflict', async () => {
      const answer = await networkManagementPage.updateWithStamp(current, { descriptionEn: edited(CHANGES.localUnsaved) }, String(current.concurrencyStamp));
      expect(answer.status).toBe(CONFLICT.status);
    });
  });

  test(`TC-${CASE.concurrentApi}: should accept one and reject the other as a conflict when two saves race with the same version`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    let record!: NetworkRecord;
    let answers: { status: number; text: string }[] = [];

    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Two save requests are prepared, both referencing the same version', async () => {
      record = await networkManagementPage.readNetworkRecord(network.id);
      expect(String(record.concurrencyStamp ?? '')).not.toBe('');
    });

    await steps.critical('Both are dispatched near-simultaneously - the server processes them', async () => {
      answers = await networkManagementPage.sendConcurrentUpdates(record, String(record.concurrencyStamp), [
        { descriptionEn: edited(CHANGES.description) },
        { descriptionEn: edited(CHANGES.reapplied) },
      ]);
      expect(answers).toHaveLength(2);
    });

    await steps.step('The first-processed request succeeds', async () => {
      expect(answers.filter((a) => a.status < 300), 'exactly one save should succeed').toHaveLength(1);
    });

    await steps.step('The second is rejected as a conflict instructing the client to reload', async () => {
      const losers = answers.filter((a) => a.status >= 300);
      expect(losers.map((a) => a.status)).toEqual([CONFLICT.status]);
      expect(losers.map((a) => a.text).join(' '), 'the conflict should say to reload').toMatch(RELOAD_ACTION);
    });
  });
});
