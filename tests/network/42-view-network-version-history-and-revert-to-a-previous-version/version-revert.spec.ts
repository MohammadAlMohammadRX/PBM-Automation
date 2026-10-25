import { test, expect } from '../../../fixtures';
import type { NetworkVersionRecord } from '../../../utils/NetworkHistory';
import {
  CASE,
  MESSAGE,
  NONEXISTENT_VERSION_ID,
  REVERT_CHANGE,
  SIZE,
  v,
} from '../../../data/networks/versionHistoryRevert.data';

/**
 * User story 14321: View network version history and revert to a previous version.
 * Reverting: to an earlier published version, the oldest one, and the refusals
 * - the current version, an unpublished draft, a version that does not exist.
 *
 * The refusals the screen cannot express (a stale link to a draft, an unknown
 * id) are sent directly, by version id (NetworkVersionHistoryTab.revertViaApi).
 */

/** A version's id by its number. */
const idOf = (versions: readonly NetworkVersionRecord[], n: number): string =>
  versions.find((record) => record.version === n)?.id ?? '';

test.describe('US 14321 - Reverting to a previous version', () => {
  test(`TC-${CASE.revertEarlier}: should revert to the earlier published version and record the revert when V3 is chosen on a V5 network`, async ({
    networkDetailPage,
    networkWithVersions,
    steps,
  }) => {
    const network = await networkWithVersions(SIZE.five);
    let before = 0;

    await steps.critical('Navigate to the network\'s Version History - V1 to V5 are listed', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.versions();
      await tab.open();
      const rows = await tab.readRows();
      before = rows.length;
      expect(rows.map((row) => row.version)).toEqual(expect.arrayContaining([v(1), v(2), v(3), v(4), v(5)]));
    });

    await steps.step('V3 offers Revert, and confirming it is processed', async () => {
      const tab = networkDetailPage.versions();
      expect(await tab.offersRevert(v(3)), 'V3 should offer Revert').toBe(true);
      const outcome = await tab.revertTo(v(3));
      expect(outcome?.status, `RevertNetworkVersion: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('A new history entry reflects the revert', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.versions();
      await tab.open();
      const rows = await tab.readRows();
      expect(rows.length, 'the revert should add a version').toBe(before + 1);
      expect(rows[0].change, 'the newest entry should be the revert').toMatch(REVERT_CHANGE);
    });
  });

  test(`TC-${CASE.blockCurrent}: should refuse to revert with "nothing to revert" when the chosen version is the current live one`, async ({
    networkDetailPage,
    networkWithVersions,
    steps,
  }) => {
    const network = await networkWithVersions(SIZE.five);
    let versions: NetworkVersionRecord[] = [];

    await steps.critical('Navigate to the network\'s Version History - V5 is the current version', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      versions = await networkDetailPage.versions().readVersionsViaApi(network.id);
      expect(idOf(versions, SIZE.five)).not.toBe('');
    });

    await steps.step('Reverting to V5 is blocked with a clear message and creates no version', async () => {
      const tab = networkDetailPage.versions();
      expect(await tab.offersRevert(v(SIZE.five)), 'the current version must not offer Revert').toBe(false);
      const answer = await tab.revertViaApi(network.id, idOf(versions, SIZE.five));
      expect(answer.status, 'the server must refuse').toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(MESSAGE.nothingToRevert);
      expect((await tab.readVersionsViaApi(network.id)).length, 'no new version').toBe(versions.length);
    });
  });

  test(`TC-${CASE.blockUnpublished}: should refuse a revert to a version that was never published when it is requested through a stale reference`, async ({
    networkDetailPage,
    networkWithVersions,
    stageEdit,
    steps,
  }) => {
    const network = await networkWithVersions(SIZE.two);
    await stageEdit(network);
    let draft: NetworkVersionRecord | undefined;

    await steps.critical('Navigate to the network\'s Version History - a draft version exists behind it', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      draft = (await networkDetailPage.versions().readVersionsViaApi(network.id)).find((r) => r.versionStatusCode === 'draft');
      expect(draft, 'the staged edit should be a draft version').toBeDefined();
    });

    await steps.step('Reverting to the unpublished version is blocked - only published versions qualify', async () => {
      const tab = networkDetailPage.versions();
      const answer = await tab.revertViaApi(network.id, draft!.id);
      expect(answer.status, 'the server must refuse').toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(MESSAGE.onlyPublished);
    });
  });

  test(`TC-${CASE.decisionTable}: should revert only to the published non-current version when V1, the current V2 and a missing V99 are tried`, async ({
    networkDetailPage,
    networkWithVersions,
    steps,
  }) => {
    const network = await networkWithVersions(SIZE.two);
    let versions: NetworkVersionRecord[] = [];

    await steps.critical('Navigate to the Version History - V1 and V2 are listed, V2 current', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      versions = await networkDetailPage.versions().readVersionsViaApi(network.id);
      expect([idOf(versions, 1), idOf(versions, 2)].filter((id) => id === '')).toEqual([]);
    });

    await steps.step('Revert to V1 (published, not current) succeeds', async () => {
      const answer = await networkDetailPage.versions().revertViaApi(network.id, idOf(versions, 1));
      expect(answer.status, answer.text.slice(0, 200)).toBeLessThan(300);
    });

    await steps.step('Revert to V2 (current) is blocked with "nothing to revert"', async () => {
      const answer = await networkDetailPage.versions().revertViaApi(network.id, idOf(versions, 2));
      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(MESSAGE.nothingToRevert);
    });

    await steps.step('Revert to V99 (nonexistent) is blocked with "version not found"', async () => {
      const answer = await networkDetailPage.versions().revertViaApi(network.id, NONEXISTENT_VERSION_ID);
      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(MESSAGE.notFound);
    });
  });

  test(`TC-${CASE.revertOldest}: should revert to the oldest published version when V1 of a V5 network is chosen`, async ({
    networkDetailPage,
    networkWithVersions,
    steps,
  }) => {
    const network = await networkWithVersions(SIZE.five);

    await steps.critical('Navigate to the Version History - V1 is the last entry', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      const rows = await networkDetailPage.versions().readRows();
      expect(rows[rows.length - 1].version, 'the oldest entry should be listed last').toBe(v(1));
    });

    await steps.step('Reverting to V1 is submitted and processed', async () => {
      const tab = networkDetailPage.versions();
      expect(await tab.offersRevert(v(1)), 'V1 should offer Revert').toBe(true);
      const outcome = await tab.revertTo(v(1));
      expect(outcome?.status, `RevertNetworkVersion: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
    });
  });
});
