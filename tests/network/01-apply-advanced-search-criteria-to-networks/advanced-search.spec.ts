import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import { NETWORK_LIFECYCLE, uniqueArabic } from '../../../data/networks/network.data';
import { FIELD, SEARCH_CASES, sheetNamed } from '../../../data/networks/advancedSearch.data';

/**
 * User story 14117: Apply advanced search criteria to networks.
 * The search outcomes - by English name, Arabic name, code, combined criteria -
 * and how the drawer remembers, resets and discards what was entered.
 *
 * Every network searched for is the case's own (fixture `networkIn`): the
 * sheet's "Alpha Health Network" and "NW-1023" do not exist here, and the
 * shared register must not be relied on to hold them.
 */
test.describe('US 14117 - Advanced search outcomes', () => {
  test(`TC-${SEARCH_CASES.englishName.azureId}: should list only networks whose English name matches when an English name is searched`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const data = SEARCH_CASES.englishName;
    const network = await networkIn('Draft', { nameEn: sheetNamed(data.sheetName) });

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Enter the name in the drawer and confirm - the list refreshes', async () => {
      await networkManagementPage.advancedSearchFor({ nameOrCode: data.term });
      await networkManagementPage.expectRowsRendered();
    });

    await steps.step('Only networks whose English name matches are listed, the case\'s own among them', async () => {
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      expect(names, 'the search should return the network named after the sheet').toContain(network.name);
      expect(
        names.filter((name) => !name.toLowerCase().includes(data.term.toLowerCase())),
        `every listed network should match "${data.term}"`,
      ).toEqual([]);
    });
  });

  test(`TC-${SEARCH_CASES.arabicName.azureId}: should list the matching network when its Arabic name is searched`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const data = SEARCH_CASES.arabicName;
    const network = await networkIn('Draft', { nameEn: sheetNamed(data.sheetName), nameAr: uniqueArabic(data.nameAr) });

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('The Arabic text is entered and displayed right-to-left in the field', async () => {
      const drawer = await networkManagementPage.openAdvancedSearch();
      await drawer.typeText(FIELD.nameOrCode, network.nameAr);
      expect(await drawer.getValue(FIELD.nameOrCode), 'the field should hold the Arabic text as typed').toBe(network.nameAr);
      expect(await drawer.getTextDirection(FIELD.nameOrCode), 'Arabic input should render right-to-left').toBe('rtl');
      await drawer.submit();
    });

    await steps.step('The list refreshes and shows the network whose Arabic name matches', async () => {
      await networkManagementPage.expectRowsRendered();
      expect(
        await networkManagementPage.readColumn(NETWORK_COLUMN.networkName),
        'the server should match the Arabic name and return its network',
      ).toContain(network.name);
    });
  });

  test(`TC-${SEARCH_CASES.code.azureId}: should list only the network with that code when a network code is searched`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft');
    let code = '';

    await steps.critical('Navigate to the Network Management module - the list loads with the network\'s code', async () => {
      await networkManagementPage.openList();
      code = (await networkManagementPage.readRow(network.name)).code;
      expect(code, 'the network should carry a code to search for').not.toBe('');
      await networkManagementPage.openList();
    });

    await steps.critical('Enter the code in the drawer and confirm - the list refreshes', async () => {
      await networkManagementPage.advancedSearchFor({ nameOrCode: code });
      await networkManagementPage.expectRowsRendered();
    });

    await steps.step('Only the network with the matching code is returned', async () => {
      const codes = await networkManagementPage.readColumn(NETWORK_COLUMN.code);
      expect(codes, `the search for ${code} should return exactly that network`).toEqual([code]);
    });
  });

  test(`TC-${SEARCH_CASES.combined.azureId}: should list only networks meeting every criterion when name, type and status are combined`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const data = SEARCH_CASES.combined;
    const network = await networkIn('Active', { nameEn: sheetNamed(data.sheetName), type: data.type });

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('All three criteria show the values entered or selected', async () => {
      const drawer = await networkManagementPage.openAdvancedSearch();
      await drawer.typeText(FIELD.nameOrCode, data.term);
      await drawer.choose(FIELD.networkType, data.type);
      await drawer.choose(FIELD.status, data.status);
      expect(await drawer.getValue(FIELD.nameOrCode)).toBe(data.term);
      expect(await drawer.getValue(FIELD.networkType)).toBe(data.type);
      expect(await drawer.getValue(FIELD.status)).toBe(data.status);
      await drawer.submit();
    });

    await steps.step('Only networks matching the name AND the type AND the status are listed', async () => {
      await networkManagementPage.expectRowsRendered();
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      const types = await networkManagementPage.readColumn(NETWORK_COLUMN.networkType);
      const statuses = await networkManagementPage.readColumn(NETWORK_COLUMN.status);
      expect(names, 'the case\'s own matching network should be listed').toContain(network.name);
      expect(names.filter((n) => !n.toLowerCase().includes(data.term.toLowerCase())), 'names not containing the term').toEqual([]);
      expect(types.filter((t) => t !== data.type), `types other than ${data.type}`).toEqual([]);
      expect(statuses.filter((s) => s !== NETWORK_LIFECYCLE.active), `statuses other than ${data.status}`).toEqual([]);
    });
  });

  test(`TC-${SEARCH_CASES.prepopulated.azureId}: should pre-populate the drawer with the applied criteria when it is reopened`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = SEARCH_CASES.prepopulated;

    await steps.critical('Navigate to the module and apply Name, Type and Status - the list reflects them', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.advancedSearchFor({ nameOrCode: data.sheetName, networkType: data.type, status: data.status });
      expect(await networkManagementPage.getChips(), 'the applied criteria should show as chips').toEqual(
        expect.arrayContaining([data.sheetName, data.type, data.status]),
      );
    });

    await steps.step('Reopening the drawer shows exactly the applied values', async () => {
      const drawer = await networkManagementPage.openAdvancedSearch();
      expect(await drawer.getValue(FIELD.nameOrCode), 'Name / Code').toBe(data.sheetName);
      expect(await drawer.getValue(FIELD.networkType), 'Network Type').toBe(data.type);
      expect(await drawer.getValue(FIELD.status), 'Status').toBe(data.status);
      await drawer.cancel();
    });
  });

  test(`TC-${SEARCH_CASES.pagination.azureId}: should return to page one when a search is applied from a later page`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = SEARCH_CASES.pagination;

    await steps.critical(`Navigate to the module and page to page ${data.startPage}`, async () => {
      await networkManagementPage.openList();
      await networkManagementPage.goToPage(data.startPage);
    });

    await steps.critical('Apply a valid search from the drawer - the drawer closes', async () => {
      await networkManagementPage.advancedSearchFor({ nameOrCode: data.term });
      await networkManagementPage.expectRowsRendered();
    });

    await steps.step('The pager shows page 1 as the active page', async () => {
      await networkManagementPage.expectCurrentPage(1);
    });
  });

  test(`TC-${SEARCH_CASES.cancelDiscards.azureId}: should discard unapplied edits and keep the list when the drawer is closed without searching`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = SEARCH_CASES.cancelDiscards;
    let listBefore: string[] = [];

    await steps.critical('Navigate to the module with a filter already applied', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.advancedSearchFor({ nameOrCode: data.applied });
      await networkManagementPage.expectRowsRendered();
      listBefore = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      expect(listBefore.length, 'the filtered list should have rows').toBeGreaterThan(0);
    });

    await steps.step('The drawer reflects the edited, unapplied values', async () => {
      const drawer = await networkManagementPage.openAdvancedSearch();
      await drawer.typeText(FIELD.nameOrCode, data.edited);
      await drawer.choose(FIELD.networkType, data.type);
      await drawer.choose(FIELD.status, data.status);
      expect(await drawer.getValue(FIELD.nameOrCode)).toBe(data.edited);
      await drawer.close();
    });

    await steps.step('Reopening shows the last APPLIED values and the list is unchanged', async () => {
      expect(await networkManagementPage.readColumn(NETWORK_COLUMN.networkName), 'the list should not move').toEqual(listBefore);
      const drawer = await networkManagementPage.openAdvancedSearch();
      expect(await drawer.getValue(FIELD.nameOrCode), 'the discarded edit must not survive').toBe(data.applied);
      expect(await drawer.getValue(FIELD.networkType), 'the discarded type must not survive').not.toBe(data.type);
      expect(await drawer.getValue(FIELD.status), 'the discarded status must not survive').not.toBe(data.status);
      await drawer.cancel();
    });
  });
});
