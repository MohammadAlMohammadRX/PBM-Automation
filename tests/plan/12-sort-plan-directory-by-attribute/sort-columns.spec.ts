import { test, expect } from '../../../fixtures';
import { PLAN_COLUMN } from '../../../constants/ElementIds';
import { isSorted, withoutBlanks } from '../../../utils/SortUtils';
import { ARABIC_TEXT, untranslatedWords } from '../../../data/networks/networkForm.data';
import {
  ARABIC_NAME_SORT_FIELD,
  CASES,
  COLUMN_WORDS,
  DEFAULT_OPTION,
  DEFAULT_SORT,
  DIRECTIONS,
  DIRECTION_WORDS,
  ITEM_FIELD,
  OPTIONS_PER_COLUMN,
  REQUIRED_OPTIONS,
  SORTABLE_COLUMNS,
  blanksAtOneEnd,
  dateKey,
  expectedSortBy,
  tieDataset,
} from '../../../data/plans/sortPlanDirectory.data';

/**
 * User story 14161: Sort plan directory by attribute.
 * The default order and each attribute's sort - name (English and Arabic),
 * code, type, status, effective date with ties, expiry date with blanks - and
 * the menu's full set of options.
 *
 * Every sort is checked against both the `sortBy` requested and the order the
 * first page renders (or, for Plan Type and Expiry Date, the rows the server
 * answered). The Arabic case restores English in cleanup.
 */
test.describe('US 14161 - Sort by attribute', () => {
  test(`TC-${CASES.defaultOrder.azureId}: should list the newest plan first with Newest to Oldest selected when no sort is chosen`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const newest = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      expect((await planManagementPage.captureDefaultSort()).toLowerCase(), 'the default sort requested').toBe(DEFAULT_SORT);
    });

    await steps.step('Without choosing a sort, the most recently created plan is at the top and the oldest at the bottom', async () => {
      const items = await planManagementPage.captureListItems(() => planManagementPage.openList());
      const names = await planManagementPage.readColumn(PLAN_COLUMN.name);
      expect(names[0], 'the plan created last should be first').toBe(newest.name);
      expect(isSorted(items.map((item) => String(item[ITEM_FIELD.createdOn] ?? '')), 'desc'), 'creation dates should descend').toBe(true);
    });

    await steps.step(`The Sort By menu shows "${DEFAULT_OPTION}" as the selected option`, async () => {
      expect(await planManagementPage.getActiveSortOption()).toContain(DEFAULT_OPTION);
    });
  });

  test(`TC-${CASES.nameAsc.azureId}: should order plans A to Z by name when Plan Name ascending is chosen in English`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.nameAsc;

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('The Sort By menu offers Plan Name, Plan Code, Plan Type, Status, Effective Date, Expiry Date and Newest/Oldest', async () => {
      const options = (await planManagementPage.getSortOptions()).join(' | ');
      expect(REQUIRED_OPTIONS.filter((option) => !options.includes(option)), `options missing from [${options}]`).toEqual([]);
    });

    await steps.step('Choosing Plan Name ascending reloads the list', async () => {
      expect((await planManagementPage.sortBy(data.column, 'asc')).toLowerCase()).toBe(expectedSortBy(data.column, 'asc'));
    });

    await steps.step('The plan names run alphabetically from A to Z', async () => {
      const names = await planManagementPage.readColumn(data.cell);
      expect(isSorted(names, 'asc'), `names should ascend: ${names.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.nameDescArabic.azureId}: should order Arabic plan names from last letter to first when Plan Name descending is chosen in Arabic`, async ({
    planManagementPage,
    languageSwitcher,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));

    await steps.critical('Navigate to the Plans Management module in Arabic - the directory is visible', async () => {
      await languageSwitcher.switchTo('ar');
      await planManagementPage.openList();
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step('The Sort By options are labelled in Arabic', async () => {
      const options = await planManagementPage.getSortOptions();
      expect(options.join(' '), 'Arabic labels').toMatch(ARABIC_TEXT);
      expect(untranslatedWords(options), 'English words left in the Arabic menu').toEqual([]);
    });

    await steps.step('Choosing Plan Name descending reloads the list by the Arabic name', async () => {
      const sortBy = await planManagementPage.sortBy(CASES.nameDescArabic.column, 'desc');
      expect(sortBy.toLowerCase()).toBe(`${ARABIC_NAME_SORT_FIELD} desc`);
    });

    await steps.step('The Arabic plan names follow Arabic collation from last to first', async () => {
      const names = await planManagementPage.readColumn(CASES.nameDescArabic.cell);
      expect(names.join(' '), 'the names should be shown in Arabic').toMatch(ARABIC_TEXT);
      expect(isSorted(names, 'desc'), `Arabic names should descend: ${names.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.code.azureId}: should order plans by plan code both ways when Plan Code ascending and descending are chosen`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.code;

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Plan Code ascending lists codes from lowest to highest', async () => {
      expect((await planManagementPage.sortBy(data.column, 'asc')).toLowerCase()).toBe(expectedSortBy(data.column, 'asc'));
      const codes = await planManagementPage.readColumn(data.cell);
      expect(isSorted(codes, 'asc'), `codes should ascend: ${codes.join(' | ')}`).toBe(true);
    });

    await steps.step('Plan Code descending lists codes from highest to lowest', async () => {
      expect((await planManagementPage.sortBy(data.column, 'desc')).toLowerCase()).toBe(expectedSortBy(data.column, 'desc'));
      const codes = await planManagementPage.readColumn(data.cell);
      expect(isSorted(codes, 'desc'), `codes should descend: ${codes.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.type.azureId}: should order plans alphabetically by plan type both ways when Plan Type ascending and descending are chosen`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.type;
    let labels: Record<string, string> = {};

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
      labels = await planManagementPage.planTypeLabelsById();
      expect(Object.keys(labels).length, 'the plan type lookup').toBeGreaterThan(0);
    });

    for (const direction of DIRECTIONS) {
      await steps.step(`Plan Type ${DIRECTION_WORDS[direction]} orders the list by type`, async () => {
        const result = await planManagementPage.sortByAndCaptureItems(data.column, direction);
        expect(result.sortBy.toLowerCase()).toBe(expectedSortBy(data.column, direction));
        const types = result.items.map((item) => labels[String(item[ITEM_FIELD.type])] ?? '');
        expect(isSorted(types, direction), `types should run ${direction}: ${types.join(' | ')}`).toBe(true);
      });
    }
  });

  test(`TC-${CASES.status.azureId}: should order plans by status both ways when Status ascending and descending are chosen`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.status;

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    for (const direction of DIRECTIONS) {
      await steps.step(`Status ${DIRECTION_WORDS[direction]} orders the list by status`, async () => {
        expect((await planManagementPage.sortBy(data.column, direction)).toLowerCase()).toBe(expectedSortBy(data.column, direction));
        const statuses = await planManagementPage.readColumn(data.cell);
        expect(isSorted(statuses, direction), `statuses should run ${direction}: ${statuses.join(' | ')}`).toBe(true);
      });
    }
  });

  test(`TC-${CASES.effectiveTies.azureId}: should keep plans with the same effective date adjacent with nothing lost when Effective Date ascending is chosen`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const data = CASES.effectiveTies;
    const dataset = tieDataset();
    for (const plan of dataset.plans) {
      await planIn('Draft', { nameEn: plan.name, effectiveInMinutes: plan.effectiveInMinutes, expiryInMinutes: plan.expiryInMinutes, noFormulary: true });
    }

    await steps.critical('Navigate to the Plans Management module - the case\'s three plans are listed', async () => {
      await planManagementPage.openList();
      await planManagementPage.search(dataset.prefix);
      expect(await planManagementPage.getVisibleRowCount()).toBe(dataset.plans.length);
    });

    await steps.step('Effective Date ascending orders the list from earliest to latest', async () => {
      expect((await planManagementPage.sortBy(data.column, 'asc')).toLowerCase()).toBe(expectedSortBy(data.column, 'asc'));
      const dates = (await planManagementPage.readColumn(data.cell)).map(dateKey);
      expect(isSorted(dates, 'asc'), `effective dates should ascend: ${dates.join(' | ')}`).toBe(true);
    });

    await steps.step('The two plans sharing an effective date sit next to each other, with no row missing or duplicated', async () => {
      const names = await planManagementPage.readColumn(PLAN_COLUMN.name);
      expect([...names].sort(), 'every plan exactly once').toEqual(dataset.plans.map((plan) => plan.name).sort());
      const [a, b] = dataset.tied.map((name) => names.indexOf(name));
      expect(Math.abs(a - b), `"${dataset.tied.join('" and "')}" should be adjacent in [${names.join(' | ')}]`).toBe(1);
    });
  });

  test(`TC-${CASES.expiryDesc.azureId}: should order plans from latest to earliest expiry with blank expiry dates at one end when Expiry Date descending is chosen`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.expiryDesc;
    let expiries: string[] = [];

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Expiry Date descending orders the list from latest to earliest expiry', async () => {
      const result = await planManagementPage.sortByAndCaptureItems(data.column, 'desc');
      expect(result.sortBy.toLowerCase()).toBe(expectedSortBy(data.column, 'desc'));
      expiries = result.items.map((item) => String(item[ITEM_FIELD.expiryDate] ?? ''));
      expect(isSorted(withoutBlanks(expiries), 'desc'), `expiry dates should descend: ${expiries.join(' | ')}`).toBe(true);
    });

    await steps.step('Plans without an expiry date are placed together at one end', async () => {
      expect(blanksAtOneEnd(expiries), `blank expiry dates scattered: ${expiries.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.options.azureId}: should offer every required sort option when the Sort By menu is opened`, async ({
    planManagementPage,
    steps,
  }) => {
    let options: string[] = [];

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('The Sort By menu expands showing its options', async () => {
      options = await planManagementPage.getSortOptions();
      expect(options.length).toBeGreaterThan(0);
    });

    await steps.step('Ascending and descending for each attribute plus Newest to Oldest and Oldest to Newest are all present', async () => {
      const joined = options.join(' | ');
      expect(REQUIRED_OPTIONS.filter((option) => !joined.includes(option)), `options missing from [${joined}]`).toEqual([]);
      for (const column of SORTABLE_COLUMNS) {
        expect(options.filter((option) => option.includes(COLUMN_WORDS[column])), `${COLUMN_WORDS[column]} options`).toHaveLength(OPTIONS_PER_COLUMN);
      }
    });
  });
});
