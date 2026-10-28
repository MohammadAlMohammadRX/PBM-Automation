import { test, expect } from '../../../fixtures';
import { PLAN_ADVANCED_SEARCH_FIELD, PLAN_COLUMN } from '../../../constants/ElementIds';
import type { AdvancedSearchDrawer } from '../../../pages/payer/AdvancedSearchDrawer';
import {
  APPROVED,
  CASES,
  SUITE_TYPE,
  goldPlan,
  partialNameDataset,
} from '../../../data/plans/planAdvancedSearch.data';

/**
 * User story 14159: Advanced search plans by name, payer, type, and status.
 * The CRITERIA - each field on its own and together, the drawer's fields and
 * their controls, the name field's length limit and odd input, and a search
 * nothing matches.
 */
test.describe('US 14159 - Advanced search criteria', () => {
  test(`TC-${CASES.partialName.azureId}: should list every plan whose name contains the text when only a partial plan name is searched`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const dataset = partialNameDataset();
    for (const name of dataset.names) await planIn('Draft', { nameEn: name });
    let drawer!: AdvancedSearchDrawer;

    await steps.critical('Navigate to the Plans Management module - the full plan list loads', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('The advanced search opens with the Plan Name field empty', async () => {
      drawer = await planManagementPage.openAdvancedSearch();
      expect(await drawer.getValue(PLAN_ADVANCED_SEARCH_FIELD.nameOrCode)).toBe('');
    });

    await steps.critical('A partial plan name alone is submitted - the drawer closes and the results refresh', async () => {
      await drawer.typeText(PLAN_ADVANCED_SEARCH_FIELD.nameOrCode, dataset.partial);
      await drawer.submit();
      expect(await drawer.isOpen(), 'the drawer should close').toBe(false);
    });

    await steps.step('Every plan whose name contains the text is listed, whatever its payer, type or status', async () => {
      await planManagementPage.waitForRowsRendered();
      const names = (await planManagementPage.getPlanRows()).map((row) => row.name);
      expect(names.filter((name) => !name.includes(dataset.partial)), 'rows not containing the partial name').toEqual([]);
      expect([...names].sort(), 'both plans sharing the partial name').toEqual([...dataset.names].sort());
    });
  });

  test(`TC-${CASES.allCriteria.azureId}: should list only plans meeting all five criteria when name, payer, type, status and approval status are searched together`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const data = CASES.allCriteria;
    const gold = goldPlan();
    await planIn('Active', { nameEn: gold.name, type: SUITE_TYPE.code });
    let drawer!: AdvancedSearchDrawer;
    let items: Record<string, unknown>[] = [];

    await steps.critical('Navigate to the Plans Management module - the full plan directory loads', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('The advanced search shows Plan Name, Payer, Plan Type, Status and Approval Status', async () => {
      drawer = await planManagementPage.openAdvancedSearch();
      const keys = await drawer.getFieldKeys();
      expect(keys).toEqual(expect.arrayContaining([
        PLAN_ADVANCED_SEARCH_FIELD.nameOrCode,
        PLAN_ADVANCED_SEARCH_FIELD.payer,
        PLAN_ADVANCED_SEARCH_FIELD.type,
        PLAN_ADVANCED_SEARCH_FIELD.status,
        PLAN_ADVANCED_SEARCH_FIELD.approvalStatus,
      ]));
    });

    await steps.critical('All five criteria are filled and submitted - the drawer closes and the directory refreshes', async () => {
      await drawer.typeText(PLAN_ADVANCED_SEARCH_FIELD.nameOrCode, gold.partial);
      await drawer.choose(PLAN_ADVANCED_SEARCH_FIELD.payer, data.payer);
      await drawer.choose(PLAN_ADVANCED_SEARCH_FIELD.type, data.type);
      await drawer.choose(PLAN_ADVANCED_SEARCH_FIELD.status, data.status);
      await drawer.choose(PLAN_ADVANCED_SEARCH_FIELD.approvalStatus, data.approval);
      items = await planManagementPage.captureListItems(() => drawer.submit());
      expect(await drawer.isOpen()).toBe(false);
    });

    await steps.step('Only plans satisfying all five criteria are returned', async () => {
      const rows = await planManagementPage.getPlanRows();
      const approvals = await planManagementPage.readColumn(PLAN_COLUMN.approvalStatus);
      const typeId = await planManagementPage.planTypeIdFor(data.type);
      expect(rows.map((row) => row.name), 'the case\'s own plan').toContain(gold.name);
      expect(rows.filter((row) => !row.name.includes(gold.partial) || row.payer !== data.payer || row.status !== data.status), 'rows outside name, payer or status').toEqual([]);
      expect(approvals.filter((cell) => !APPROVED.cell.test(cell)), 'rows not Approved').toEqual([]);
      expect(items.filter((item) => String(item.planTypeId) !== typeId).length, `rows that are not ${data.type}`).toBe(0);
    });
  });

  test(`TC-${CASES.maxLength.azureId}: should accept a plan name up to its maximum length and block one character more when the longest name is searched`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.maxLength;
    const field = PLAN_ADVANCED_SEARCH_FIELD.nameOrCode;
    let drawer!: AdvancedSearchDrawer;
    let limit: number = data.fallbackMax;
    let declared: number | null = null;

    await steps.critical('Navigate to the Plans Management module', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('The advanced search shows an editable Plan Name field', async () => {
      drawer = await planManagementPage.openAdvancedSearch();
      expect(await drawer.hasField(field), 'the Plan Name field').toBe(true);
      declared = await drawer.getMaxLength(field);
      limit = declared ?? data.fallbackMax;
      expect(await drawer.getValue(field)).toBe('');
    });

    await steps.step('A name of exactly the maximum length is accepted in full and searched', async () => {
      const longest = data.character.repeat(limit);
      await drawer.typeText(field, longest);
      expect((await drawer.getValue(field)).length, 'the full text should be kept').toBe(limit);
      await drawer.submit();
      expect(await drawer.isOpen()).toBe(false);
    });

    await steps.step('One character beyond the maximum is prevented or reported', async () => {
      drawer = await planManagementPage.openAdvancedSearch();
      await drawer.typeText(field, data.character.repeat(limit + 1));
      const kept = (await drawer.getValue(field)).length;
      const messages = await drawer.getMessages();
      // The case asks for the extra character to be prevented or reported - not
      // for a maxlength attribute, which the field does not carry (2026-10-27).
      expect(kept <= limit || messages.length > 0, `${kept} characters kept with the limit ${limit}; messages [${messages.join(' | ')}]`).toBe(true);
      await drawer.cancel();
    });
  });

  test(`TC-${CASES.progressive.azureId}: should narrow the results further with each criterion added when payer, type, status and approval status are combined`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.progressive;
    let first = -1;
    let second = -1;

    await steps.critical('Navigate to the Plans Management module - all plans are visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('Payer and Plan Type alone return plans matching both', async () => {
      let items: Record<string, unknown>[] = [];
      first = await planManagementPage.captureListTotal(async () => {
        items = await planManagementPage.captureListItems(() => planManagementPage.advancedSearchFor({ payer: data.payer, type: data.type }));
      });
      const typeId = await planManagementPage.planTypeIdFor(data.type);
      expect(first, 'plans of that payer and type').toBeGreaterThan(0);
      expect((await planManagementPage.getPlanRows()).filter((row) => row.payer !== data.payer), 'rows of another payer').toEqual([]);
      expect(items.filter((item) => String(item.planTypeId) !== typeId).length, `rows that are not ${data.type}`).toBe(0);
    });

    await steps.critical('Adding Status narrows the results to plans that also match the status', async () => {
      second = await planManagementPage.captureListTotal(() => planManagementPage.advancedSearchFor({ status: data.status }));
      const chips = (await planManagementPage.getChips()).join(' | ');
      expect(chips, 'the earlier criteria should still apply').toContain(data.payer);
      expect(chips).toContain(data.status);
      expect(second).toBeLessThanOrEqual(first);
      expect((await planManagementPage.getPlanRows()).filter((row) => row.payer !== data.payer || row.status !== data.status), 'rows outside payer and status').toEqual([]);
    });

    await steps.step('Adding Approval Status narrows the results to plans matching all four', async () => {
      const third = await planManagementPage.captureListTotal(() => planManagementPage.advancedSearchFor({ approvalStatus: data.approval }));
      const chips = (await planManagementPage.getChips()).join(' | ');
      for (const value of [data.payer, data.type, data.status, data.approval]) expect(chips, `the ${value} criterion`).toContain(value);
      expect(third).toBeLessThanOrEqual(second);
      const approvals = await planManagementPage.readColumn(PLAN_COLUMN.approvalStatus);
      expect(approvals.filter((cell) => !APPROVED.cell.test(cell)), 'rows not Approved').toEqual([]);
    });
  });

  test(`TC-${CASES.specialCharacters.azureId}: should search safely with no error or script execution when the plan name holds quotes, percent signs or script text`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.specialCharacters;
    const totals: number[] = [];

    await steps.critical('Navigate to the Plans Management module', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Each unusual plan name is searched without an error', async () => {
      for (const term of data.terms) {
        await planManagementPage.openList();
        const total = await planManagementPage.captureListTotal(() => planManagementPage.advancedSearchFor({ nameOrCode: term }));
        expect(total, `"${term}" should be answered with a result set`).toBeGreaterThanOrEqual(0);
        totals.push(total);
      }
      expect(totals.length).toBe(data.terms.length);
    });

    await steps.step('The screen stays intact, returns safe results and executes no script', async () => {
      expect(await planManagementPage.hasWindowFlag(data.flag), 'the script in the search text must not run').toBe(false);
      expect(await planManagementPage.getTableBodyText(), 'the list section should still render').not.toBe('');
      expect(await planManagementPage.isAdvancedSearchOffered(), 'the search controls should stay usable').toBe(true);
    });
  });

  test(`TC-${CASES.fieldsPresent.azureId}: should offer Plan Name, Approval Status, Payer, Plan Type and Status as usable controls when the advanced search opens`, async ({
    planManagementPage,
    steps,
  }) => {
    const fields = CASES.fieldsPresent.fields;
    let drawer!: AdvancedSearchDrawer;

    await steps.critical('Navigate to the Plans Management module', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('The advanced search opens and shows its fields', async () => {
      drawer = await planManagementPage.openAdvancedSearch();
      expect(await drawer.getTitle(), 'the drawer title').not.toBe('');
    });

    await steps.step('All five fields are present, labelled and usable as their control type', async () => {
      const keys = await drawer.getFieldKeys();
      const labels = (await drawer.getFieldLabels()).join(' | ');
      expect(fields.filter((f) => !keys.includes(PLAN_ADVANCED_SEARCH_FIELD[f.key])).map((f) => f.label), 'fields missing').toEqual([]);
      expect(fields.filter((f) => !labels.includes(f.label)).map((f) => f.label), `labels missing from [${labels}]`).toEqual([]);
      for (const select of fields.filter((f) => f.control === 'select')) {
        expect((await drawer.getOptions(PLAN_ADVANCED_SEARCH_FIELD[select.key])).length, `${select.label} should offer options`).toBeGreaterThan(0);
      }
      const text = fields.find((f) => f.control === 'text')!;
      await drawer.typeText(PLAN_ADVANCED_SEARCH_FIELD[text.key], text.label);
      expect(await drawer.getValue(PLAN_ADVANCED_SEARCH_FIELD[text.key]), `${text.label} should accept text`).toBe(text.label);
      await drawer.cancel();
    });
  });

  test(`TC-${CASES.noResults.azureId}: should show a clear no-results message when the advanced search criteria match no plan`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.noResults;

    await steps.critical('Navigate to the Plans Management module - plans are visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Criteria no plan meets are submitted - the drawer closes and the directory refreshes', async () => {
      const total = await planManagementPage.captureListTotal(() => planManagementPage.advancedSearchFor({ nameOrCode: data.name(), payer: data.payer }));
      expect(total).toBe(0);
      expect(await planManagementPage.advancedSearch().isOpen()).toBe(false);
    });

    await steps.step('A clear "no results" message is shown instead of an empty or broken table', async () => {
      expect(await planManagementPage.getVisibleRowCount()).toBe(0);
      expect(await planManagementPage.getTableBodyText()).toMatch(data.empty);
    });
  });

  test(`TC-${CASES.approvalOptions.azureId}: should offer only the predefined approval statuses and refuse free text when the Approval Status field is used`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.approvalOptions;
    const field = PLAN_ADVANCED_SEARCH_FIELD.approvalStatus;
    let drawer!: AdvancedSearchDrawer;

    await steps.critical('Navigate to the Plans Management module', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('The Approval Status list shows only the predefined approval statuses', async () => {
      drawer = await planManagementPage.openAdvancedSearch();
      const options = await drawer.getOptions(field);
      expect(data.expected.filter((pattern) => !options.some((option) => pattern.test(option))).map(String), `predefined values missing from [${options.join(', ')}]`).toEqual([]);
      expect(options.filter((option) => !data.anyApprovalStatus.test(option)), 'options that are not approval statuses').toEqual([]);
    });

    await steps.step('Free text cannot be entered into the field', async () => {
      await drawer.typeText(field, data.freeText);
      expect(await drawer.getValue(field), 'typed text must not become the value').not.toContain(data.freeText);
      await drawer.cancel();
    });
  });

  test(`TC-${CASES.blankName.azureId}: should apply payer and status and ignore the empty name when the plan name is left blank`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.blankName;
    let drawer!: AdvancedSearchDrawer;

    await steps.critical('Navigate to the Plans Management module', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Payer and Status are chosen with the name left empty and submitted - the results refresh', async () => {
      drawer = await planManagementPage.openAdvancedSearch();
      expect(await drawer.getValue(PLAN_ADVANCED_SEARCH_FIELD.nameOrCode), 'the name stays empty').toBe('');
      await drawer.choose(PLAN_ADVANCED_SEARCH_FIELD.payer, data.payer);
      await drawer.choose(PLAN_ADVANCED_SEARCH_FIELD.status, data.status);
      const total = await planManagementPage.captureListTotal(() => drawer.submit());
      expect(total, 'the empty name must not exclude every plan').toBeGreaterThan(0);
    });

    await steps.step('Only Payer and Status are applied; the empty name is no constraint', async () => {
      const rows = await planManagementPage.getPlanRows();
      expect(rows.filter((row) => row.payer !== data.payer || row.status !== data.status), 'rows outside payer and status').toEqual([]);
      expect(await planManagementPage.getChips(), 'one chip per applied criterion, none for the empty name').toHaveLength(2);
    });
  });
});
