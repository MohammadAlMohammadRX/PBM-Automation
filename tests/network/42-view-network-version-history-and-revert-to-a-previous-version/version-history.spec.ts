import { test, expect } from '../../../fixtures';
import {
  CASE,
  OUT_OF_ORDER,
  PUBLISHED_STATES,
  SIZE,
  VERSION_LABEL_PATTERN,
  VERSION_TIME_PATTERN,
  v,
  versionDescription,
} from '../../../data/networks/versionHistoryRevert.data';

/**
 * User story 14321: View network version history and revert to a previous version.
 * What the history shows - every published version, its metadata and its
 * facility membership - and who is offered Revert.
 *
 * Every history is the case's own, built by `networkWithVersions`.
 */
test.describe('US 14321 - Version history', () => {
  test(`TC-${CASE.listsPublished}: should list every published version newest first with its facility membership when the history opens`, async ({
    networkDetailPage,
    networkWithVersions,
    steps,
  }) => {
    const network = await networkWithVersions(SIZE.three);
    let facility = '';

    await steps.critical('Navigate to the network - its detail page loads', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      facility = (await networkDetailPage.facilities().readRows())[0]?.name ?? '';
      expect(facility, 'the network\'s facility').not.toBe('');
    });

    await steps.step('Version History lists the published versions in reverse chronological order', async () => {
      const tab = networkDetailPage.versions();
      await tab.open();
      const rows = await tab.readRows();
      expect(rows.filter((row) => PUBLISHED_STATES.test(row.status)).length, 'published versions').toBeGreaterThanOrEqual(SIZE.three);
      const numbers = rows.map((row) => Number(row.version.slice(1)));
      expect(numbers, 'most recent first').toEqual([...numbers].sort((a, b) => b - a));
    });

    await steps.step('A version\'s details show the approved change and the facility membership at that time', async () => {
      const text = await networkDetailPage.versions().viewVersionText(v(2));
      expect(text, 'the approved change').toContain(versionDescription(2));
      expect(text, 'the facility membership snapshot').toContain(facility);
    });
  });

  test(`TC-${CASE.facilitySnapshot}: should show each version's facilities exactly as they were when it was published`, async ({
    networkDetailPage,
    networkWithVersions,
    publishFacilityChange,
    steps,
  }) => {
    const network = await networkWithVersions(1, { facilities: 2 });
    let members: string[] = [];

    await steps.critical('Navigate to the network - v1 was published with facilities A and B', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      members = (await networkDetailPage.facilities().readRows()).map((row) => row.name);
      expect(members.length).toBe(2);
      await publishFacilityChange(network, { unassign: [network.facilityIds[0]] });
    });

    await steps.step('The earlier version\'s snapshot lists both facilities', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      const text = await networkDetailPage.versions().viewVersionText(v(1));
      for (const member of members) expect(text, `${member} at v1`).toContain(member);
    });

    await steps.step('The next version shows facility A removed and B kept', async () => {
      const text = await networkDetailPage.versions().viewVersionText(v(2));
      const removed = members.filter((member) => !text.includes(member));
      expect(removed.length, 'exactly one facility should be gone from v2').toBe(1);
    });
  });

  test(`TC-${CASE.singleVersion}: should offer no Revert when a network has only its initial published version`, async ({
    networkDetailPage,
    networkWithVersions,
    steps,
  }) => {
    const baseline = await networkWithVersions(SIZE.two);
    const single = await networkWithVersions(1);

    await steps.critical('Navigate to a network with history - Revert is offered on its earlier version (baseline)', async () => {
      await networkDetailPage.open(baseline.id);
      await networkDetailPage.versions().open();
      expect(await networkDetailPage.versions().offersRevert(v(1)), 'Revert must exist for the absence to mean anything').toBe(true);
    });

    await steps.step('The new network lists only its current version', async () => {
      await networkDetailPage.open(single.id);
      await networkDetailPage.versions().open();
      expect((await networkDetailPage.versions().readRows()).map((row) => row.version)).toEqual([v(1)]);
    });

    await steps.step('Revert is absent or disabled on that only version', async () => {
      expect(await networkDetailPage.versions().offersRevert(v(1))).toBe(false);
    });
  });

  test(`TC-${CASE.adminOnly}: should withhold Revert when a user without the Network Administrator role opens the history`, async ({
    networkDetailPage,
    networkWithVersions,
    shapedNonAdmin,
    steps,
  }) => {
    const network = await networkWithVersions(SIZE.two);

    await steps.critical('Navigate as the administrator - Revert is offered on the earlier version (baseline)', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      expect(await networkDetailPage.versions().offersRevert(v(1))).toBe(true);
    });

    await steps.step('The non-administrator sees the history read-only', async () => {
      const session = await shapedNonAdmin({ without: ['revertNetworkVersion'] });
      await session.networkDetail.open(network.id);
      await session.networkDetail.versions().open();
      expect((await session.networkDetail.versions().readRows()).length).toBeGreaterThan(0);
      expect(await session.networkDetail.versions().offersRevert(v(1)), 'Revert must be withheld').toBe(false);
    });
  });

  test(`TC-${CASE.largeHistory}: should keep version data consistent and process one revert at a time when a long history is browsed out of order`, async ({
    networkDetailPage,
    networkWithVersions,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkWithVersions(SIZE.large);

    await steps.critical('Navigate to the network with 10+ versions - the history lists them', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      expect((await networkDetailPage.versions().readRows()).length).toBeGreaterThanOrEqual(SIZE.large);
    });

    await steps.step('Opening versions out of order shows each one\'s own data, never another\'s', async () => {
      for (const n of OUT_OF_ORDER) {
        const details = await networkDetailPage.versions().viewVersion(v(n));
        await networkDetailPage.versions().closeVersion();
        expect(details.descriptionEn, `v${n}`).toBe(versionDescription(n));
      }
    });

    await steps.step('Two reverts fired together result in at most one processed revert', async () => {
      const versions = await networkDetailPage.versions().readVersionsViaApi(network.id);
      const idOf = (n: number) => versions.find((record) => record.version === n)?.id ?? '';
      const answers = await networkDetailPage.versions().revertTwiceAtOnce(network.id, idOf(3), idOf(4));
      expect(answers.filter((answer) => answer.status < 300).length, 'no duplicate or conflicting revert').toBeLessThanOrEqual(1);
    });
  });

  test(`TC-${CASE.metadata}: should show a version number, dates, people and a change summary on every entry when the history is listed`, async ({
    networkDetailPage,
    networkWithVersions,
    steps,
  }) => {
    const network = await networkWithVersions(SIZE.three);

    await steps.critical('Navigate to the network and open Version History - the versions are listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.versions().open();
      expect((await networkDetailPage.versions().readRows()).length).toBeGreaterThanOrEqual(SIZE.three);
    });

    await steps.step('Every entry has a version number, a change summary, its requester and a well-formed date', async () => {
      const rows = await networkDetailPage.versions().readRows();
      expect(rows.filter((row) => !VERSION_LABEL_PATTERN.test(row.version)), 'bad version labels').toEqual([]);
      expect(rows.filter((row) => row.change === ''), 'entries without a change summary').toEqual([]);
      expect(rows.filter((row) => row.requestedBy === ''), 'entries without a requester').toEqual([]);
      expect(rows.filter((row) => !VERSION_TIME_PATTERN.test(row.requestedOn)), 'malformed requested dates').toEqual([]);
    });

    await steps.step('Every published entry names its approver and its publish date', async () => {
      const published = (await networkDetailPage.versions().readRows()).filter((row) => PUBLISHED_STATES.test(row.status));
      expect(published.length).toBeGreaterThan(0);
      expect(published.filter((row) => row.reviewedBy === '' || row.reviewedBy === '—'), 'no approver').toEqual([]);
      expect(published.filter((row) => !VERSION_TIME_PATTERN.test(row.reviewedOn)), 'malformed publish dates').toEqual([]);
    });
  });
});
