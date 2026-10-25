import { test, expect } from '../../../fixtures';
import { NO_FACILITIES, SERVER_ERROR_MARKERS } from '../../../data/networks/facilities.data';
import { ALL, CASE, HOSTILE_KEYWORDS, KEYWORD, SCOPING } from '../../../data/networks/facilitySearchFilter.data';

/**
 * User story 14306: Search and filter the assigned facilities list.
 * The keyword box: matching classes, empty and hostile input, and scoping to
 * the network on screen. Keyword cases need no approval, so they run on the
 * case's own never-approved network holding all three facilities.
 */
test.describe('US 14306 - Keyword search of assigned facilities', () => {
  test(`TC-${CASE.keyword}: should list only the matching facilities when a keyword is searched`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: ALL });

    await steps.critical('Navigate to the network - its assigned facilities are listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getCodes()).length).toBe(ALL.length);
    });

    await steps.critical('Enter the keyword and submit - the search runs', async () => {
      await networkDetailPage.facilities().search(KEYWORD.single.term);
      expect(await networkDetailPage.facilities().getSearchValue()).toBe(KEYWORD.single.term);
    });

    await steps.step('Only the facility matching the keyword is listed', async () => {
      expect(await networkDetailPage.facilities().getCodes()).toEqual(KEYWORD.single.expected);
    });
  });

  test(`TC-${CASE.keywordClasses}: should handle exact, partial and no-match keywords correctly`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: ALL });

    await steps.critical('Navigate to the network - the full list is shown', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getCodes()).length).toBe(ALL.length);
    });

    await steps.step('An exact facility name returns that facility', async () => {
      await networkDetailPage.facilities().search(KEYWORD.exact.term);
      expect(await networkDetailPage.facilities().getCodes()).toEqual(KEYWORD.exact.expected);
    });

    await steps.step('A substring returns every facility containing it', async () => {
      await networkDetailPage.facilities().search(KEYWORD.partial.term);
      expect((await networkDetailPage.facilities().getCodes()).sort()).toEqual([...KEYWORD.partial.expected].sort());
    });

    await steps.step('A keyword matching nothing shows an empty "no facilities found" state', async () => {
      await networkDetailPage.facilities().search(KEYWORD.none.term);
      expect(await networkDetailPage.facilities().getCodes()).toEqual([]);
      expect(await networkDetailPage.facilities().getEmptyText()).toMatch(NO_FACILITIES);
    });
  });

  test(`TC-${CASE.injection}: should treat special and injection-like keywords as literal text without errors`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: ALL });

    await steps.critical('Navigate to the network - its facilities are listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getCodes()).length).toBe(ALL.length);
    });

    for (const keyword of HOSTILE_KEYWORDS) {
      await steps.step(`"${keyword}" is searched literally - no match, no error, nothing exposed`, async () => {
        await networkDetailPage.facilities().search(keyword);
        expect(await networkDetailPage.facilities().getSearchValue()).toBe(keyword);
        expect(await networkDetailPage.facilities().getCodes(), 'no facility name contains the payload').toEqual([]);
        const shown = await networkDetailPage.facilities().getEmptyText();
        for (const marker of SERVER_ERROR_MARKERS) expect(shown).not.toContain(marker);
      });
    }
  });

  test(`TC-${CASE.emptyKeyword}: should return the full list when the keyword is left empty and searched`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: ALL });

    await steps.critical('Navigate to the network - the full list is shown', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().getCodes()).length).toBe(ALL.length);
    });

    await steps.step('Searching with an empty keyword returns every facility, not an error or nothing', async () => {
      await networkDetailPage.facilities().search(KEYWORD.single.term);
      await networkDetailPage.facilities().search('');
      expect((await networkDetailPage.facilities().getCodes()).sort()).toEqual([...ALL].sort());
    });
  });

  test(`TC-${CASE.scopedToNetwork}: should return only the current network's facilities when another network's facility is searched`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const networkA = await networkIn('Draft', { facilityCodes: SCOPING.networkA });
    const networkB = await networkIn('Draft', { facilityCodes: SCOPING.networkB });

    await steps.critical('Navigate to network A - only its own facility is listed', async () => {
      await networkDetailPage.open(networkB.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toEqual(SCOPING.networkB);
      await networkDetailPage.open(networkA.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toEqual(SCOPING.networkA);
    });

    await steps.step('Searching A for B\'s facility returns nothing from B', async () => {
      await networkDetailPage.facilities().search(SCOPING.term);
      expect(await networkDetailPage.facilities().getCodes()).toEqual([]);
    });
  });
});
