import { test, expect } from '../../../fixtures';
import type { NetworkRecord } from '../../../utils/NetworkProvisioning';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import {
  CASE,
  CHANGES,
  CONFLICT,
  ERROR_BODY_FIELDS,
  FORBIDDEN_STATUS,
  LOCKING_DRAFT,
  edited,
} from '../../../data/networks/optimisticLocking.data';

/**
 * User story 14138: Prevent concurrent edits with optimistic locking.
 * The server half - the stamp sent directly to `PUT /api/Networks/UpdateNetwork`
 * (stale, raced) and the permission check in front of it. Requests go through
 * NetworkManagementPage.updateWithStamp, which sends the body the edit drawer
 * itself sends.
 */
test.describe('US 14138 - Optimistic locking on the update endpoint', () => {
  test(`TC-${CASE.decisionTable}: should check permission before the stamp when updates combine permission and stamp match`, async ({
    networkManagementPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Pending', LOCKING_DRAFT);
    let record!: NetworkRecord;
    let staleStamp = '';

    await steps.critical('Navigate to the module and read the network\'s current stamp', async () => {
      await networkManagementPage.openList();
      record = await networkManagementPage.readNetworkRecord(network.id);
      staleStamp = String(record.concurrencyStamp ?? '');
      expect(staleStamp).not.toBe('');
    });

    await steps.critical('Permitted + matching stamp: the record is saved', async () => {
      const answer = await networkManagementPage.updateWithStamp(record, { descriptionEn: edited(CHANGES.firstAdmin) }, staleStamp);
      expect(answer.status, answer.text.slice(0, 200)).toBeLessThan(300);
    });

    await steps.step('Permitted + mismatched stamp: a 409 conflict', async () => {
      const answer = await networkManagementPage.updateWithStamp(record, { descriptionEn: edited(CHANGES.staleEdit) }, staleStamp);
      expect(answer.status).toBe(CONFLICT.status);
    });

    await steps.step('Not permitted, matching or mismatched stamp: 403 every time, never a conflict', async () => {
      const current = await networkManagementPage.readNetworkRecord(network.id);
      const session = await shapedNonAdmin({ without: ['editNetwork'] });
      const matching = await session.networks.updateWithStamp(current, { descriptionEn: edited(CHANGES.staleEdit) }, String(current.concurrencyStamp));
      const mismatched = await session.networks.updateWithStamp(current, { descriptionEn: edited(CHANGES.staleEdit) }, staleStamp);
      expect(matching.status, 'no permission + matching stamp').toBe(FORBIDDEN_STATUS);
      expect(mismatched.status, 'no permission + stale stamp - permission takes precedence').toBe(FORBIDDEN_STATUS);
    });
  });

  test(`TC-${CASE.simultaneous}: should accept exactly one of two simultaneous updates when both carry the same stamp`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    let record!: NetworkRecord;
    let answers: { status: number }[] = [];

    await steps.critical('Navigate to the module and load the network twice - both copies hold the same stamp', async () => {
      await networkManagementPage.openList();
      record = await networkManagementPage.readNetworkRecord(network.id);
      expect(String(record.concurrencyStamp ?? '')).not.toBe('');
    });

    await steps.critical('Both sessions submit at the same moment - both requests reach the server', async () => {
      answers = await networkManagementPage.sendConcurrentUpdates(record, String(record.concurrencyStamp), [
        { descriptionEn: edited(CHANGES.firstAdmin) },
        { descriptionEn: edited(CHANGES.staleEdit) },
      ]);
      expect(answers).toHaveLength(2);
    });

    await steps.step('The first-processed request succeeds and the second is a conflict', async () => {
      const statuses = answers.map((a) => a.status).sort();
      expect(statuses.filter((s) => s < 300), 'exactly one update should be accepted').toHaveLength(1);
      expect(statuses.filter((s) => s === CONFLICT.status), 'the other should be a 409 conflict').toHaveLength(1);
    });
  });

  test(`TC-${CASE.noEditPermission}: should refuse the update with 403 when the user lacks Edit Network, whatever the stamp`, async ({
    networkManagementPage,
    networkIn,
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Pending', LOCKING_DRAFT);
    let record!: NetworkRecord;
    let session!: ShapedSession;

    await steps.critical('Navigate to the module as a user without Edit Network', async () => {
      record = await networkManagementPage.readNetworkRecord(network.id);
      session = await shapedNonAdmin({ without: ['editNetwork'] });
      await session.networks.openList();
      await session.networks.search(network.name);
      await session.networks.waitForRowVisible(network.name);
    });

    await steps.step('The edit action is unavailable on the network', async () => {
      await session.networks.expectRowActionUnavailable(network.name, 'edit');
    });

    await steps.step('An update with the valid, matching stamp is refused with 403 and not applied', async () => {
      const answer = await session.networks.updateWithStamp(record, { descriptionEn: edited(CHANGES.staleEdit) }, String(record.concurrencyStamp));
      expect(answer.status).toBe(FORBIDDEN_STATUS);
      expect((await networkManagementPage.readNetworkRecord(network.id)).descriptionEn).toBe(record.descriptionEn);
    });
  });

  test(`TC-${CASE.apiContract}: should return a structured 409 and leave the record untouched when the API is sent an outdated stamp`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', LOCKING_DRAFT);
    let original!: NetworkRecord;
    let afterFirst!: NetworkRecord;
    let answer!: { status: number; text: string };

    await steps.critical('Navigate to the module and read the network - the response includes its stamp', async () => {
      await networkManagementPage.openList();
      original = await networkManagementPage.readNetworkRecord(network.id);
      expect(String(original.concurrencyStamp ?? '')).not.toBe('');
      const moved = await networkManagementPage.updateWithStamp(original, { descriptionEn: edited(CHANGES.firstAdmin) }, String(original.concurrencyStamp));
      expect(moved.status, 'an update first moves the stamp on').toBeLessThan(300);
      afterFirst = await networkManagementPage.readNetworkRecord(network.id);
    });

    await steps.critical('An update with the outdated stamp is submitted', async () => {
      answer = await networkManagementPage.updateWithStamp(original, { descriptionEn: edited(CHANGES.staleEdit) }, String(original.concurrencyStamp));
      expect(answer.text).not.toBe('');
    });

    await steps.step('The response is 409 with a structured body identifying a concurrency conflict', async () => {
      expect(answer.status).toBe(CONFLICT.status);
      const body = JSON.parse(answer.text) as Record<string, unknown>;
      for (const field of ERROR_BODY_FIELDS) expect(Object.keys(body), `the error body should carry "${field}"`).toContain(field);
      expect(answer.text, 'the body should identify the concurrency conflict').toMatch(CONFLICT.message);
    });

    await steps.step('A subsequent read shows the data and the stamp unchanged', async () => {
      const now = await networkManagementPage.readNetworkRecord(network.id);
      expect(now.descriptionEn).toBe(afterFirst.descriptionEn);
      expect(now.concurrencyStamp).toBe(afterFirst.concurrencyStamp);
    });
  });
});
