import { test, expect } from '../../../fixtures';
import type { RoleListResult } from '../../../pages/role/RoleAdministrationPage';
import {
  CASES,
  DEFAULT_SORT_BY,
  DESCRIPTION_ROLES,
  NAME_ROLES,
  SORT_FIELD,
  SORT_LABEL,
  STATUS_BLOCKS_WHEN_BOTH,
  STATUS_ROLES,
} from '../../../data/role/sortAndExportRolesList.data';
import {
  columnSortIndicator,
  columnsWithSortIndicator,
  createSuiteRoles,
  createdOrderBreaks,
  descriptionOrderBreaks,
  directionOf,
  fieldOf,
  groupToken,
  headerTexts,
  namesOf,
  orderBreaks,
  screenShows,
  setDirection,
  sortedCopy,
  statusBlocks,
  wholeListFor,
} from '../../../utils/role/writerAHelpers';

/**
 * User story 21280: Sort and Export Roles list - the sort cases (Description, default newest-first, Role Name,
 * Status). Every order is checked on the whole list (the screen's own request replayed with 1000 rows) and the
 * rows on screen must be that answer's first page. Suite roles only. See the data file for the decisions.
 */
test.describe('US 21280 - Sort and Export Roles list', () => {
  test(`TC-${CASES.sortByDescription.azureId}: should order the roles by description A to Z when Description is sorted ascending`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const group = groupToken();
    let picked: RoleListResult | null = null;

    await steps.critical('Navigate to the Role Management module - the module loads and displays the current roles list (three suite roles with different descriptions exist)', async () => {
      await createSuiteRoles(suiteRoles, DESCRIPTION_ROLES.map((r) => ({ label: `${group} ${r.label}`, descriptionEn: r.descriptionEn })));
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Select the sort option "Description" - a sort indicator appears on the Description column', async () => {
      picked = await roleAdmin.sortBy('description');
      const seen = { field: fieldOf(picked.request.sortBy), trigger: await roleAdmin.sortLabel(), columnIndicator: await columnSortIndicator(page, 'description') };
      expect({ ...seen, columnIndicator: seen.columnIndicator !== '' }, `the list asked "${String(picked.request.sortBy)}", the sort control reads "${seen.trigger}", the Description header shows no sort indicator (headers: ${(await headerTexts(page)).join(' | ')})`)
        .toEqual({ field: SORT_FIELD.description, trigger: SORT_LABEL.description, columnIndicator: true });
    });

    await steps.step('Apply ascending sort - the roles reorder alphabetically by description, A to Z', async () => {
      const asc = await setDirection(roleAdmin, picked ?? (await roleAdmin.sortBy('description')), 'asc');
      const whole = await wholeListFor(page, asc);
      const screen = await screenShows(roleAdmin, asc);
      const descriptions = whole.map((r) => r.englishDescription ?? '');
      const ours = whole.filter((r) => r.name.includes(group)).map((r) => r.englishDescription);
      expect({ direction: directionOf(asc.request.sortBy), breaks: descriptionOrderBreaks(descriptions, 'asc'), ours, screenIsAnswer: screen.shown.join(',') === screen.expected.join(',') },
        `asked "${String(asc.request.sortBy)}"; whole list by description: ${descriptions.map((d) => `"${d}"`).join(', ')}`)
        .toEqual({ direction: 'asc', breaks: [], ours: sortedCopy(DESCRIPTION_ROLES.map((r) => r.descriptionEn)), screenIsAnswer: true });
    });
  });

  test(`TC-${CASES.defaultNewestFirst.azureId}: should list the newest role first when no sort option is chosen`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    let newest = '';
    let answer: RoleListResult | null = null;

    await steps.critical('Navigate to the Role Management module - the module loads (a suite role was just created, roles exist created at different times)', async () => {
      newest = (await suiteRoles.create({ label: 'newest' })).id;
      answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Open the Role Administration screen without selecting any sort option - the roles list displays with no sort indicator active', async () => {
      const opened = answer as RoleListResult | null;
      const seen = { sortBy: opened?.request.sortBy, trigger: await roleAdmin.sortLabel(), columnIndicators: await columnsWithSortIndicator(page) };
      expect(seen, `the list asked "${String(seen.sortBy)}", the sort control reads "${seen.trigger}", column indicators [${seen.columnIndicators.join(' | ')}]`)
        .toEqual({ sortBy: DEFAULT_SORT_BY, trigger: SORT_LABEL.newest, columnIndicators: [] });
    });

    await steps.step('Review the order of the roles shown - the most recently created role appears at the top of the list', async () => {
      const opened = answer ?? (await roleAdmin.open());
      const whole = await wholeListFor(page, opened);
      const screen = await screenShows(roleAdmin, opened);
      expect({ top: screen.shown[0] ?? '', breaks: createdOrderBreaks(whole, 'desc'), screenIsAnswer: screen.shown.join(',') === screen.expected.join(',') },
        `top rows: ${namesOf(opened.items.slice(0, 3)).join(' | ')}`)
        .toEqual({ top: newest, breaks: [], screenIsAnswer: true });
    });
  });

  test(`TC-${CASES.sortByRoleName.azureId}: should order the roles by name A to Z and Z to A when Role Name is sorted both ways`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const group = groupToken();
    let current: RoleListResult | null = null;
    let ours: string[] = [];

    await steps.critical('Navigate to the Role Management module - the module loads and displays the current roles list (three suite roles with different names exist)', async () => {
      ours = namesOf(await createSuiteRoles(suiteRoles, NAME_ROLES.map((label) => ({ label: `${group} ${label}` }))));
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Select the sort option "Role Name" - a sort direction indicator appears next to the Role Name column', async () => {
      current = await roleAdmin.sortBy('rolename');
      const seen = { field: fieldOf(current.request.sortBy), trigger: await roleAdmin.sortLabel(), columnIndicator: await columnSortIndicator(page, 'name') };
      expect({ ...seen, columnIndicator: seen.columnIndicator !== '' }, `the list asked "${String(current.request.sortBy)}", the sort control reads "${seen.trigger}", the Role Name header shows no sort indicator (headers: ${(await headerTexts(page)).join(' | ')})`)
        .toEqual({ field: SORT_FIELD.rolename, trigger: SORT_LABEL.rolename, columnIndicator: true });
    });

    await steps.step('Choose ascending order - the roles list reorders and role names appear from A to Z', async () => {
      current = await setDirection(roleAdmin, current ?? (await roleAdmin.sortBy('rolename')), 'asc');
      const whole = await wholeListFor(page, current);
      const screen = await screenShows(roleAdmin, current);
      expect({ direction: directionOf(current.request.sortBy), breaks: orderBreaks(namesOf(whole), 'asc'), ours: namesOf(whole).filter((n) => n.includes(group)), screenIsAnswer: screen.shown.join(',') === screen.expected.join(',') },
        `asked "${String(current.request.sortBy)}"; whole list: ${namesOf(whole).join(' | ')}`)
        .toEqual({ direction: 'asc', breaks: [], ours: sortedCopy(ours), screenIsAnswer: true });
    });

    await steps.step('Choose descending order - the roles list reorders and role names appear from Z to A', async () => {
      current = await setDirection(roleAdmin, current ?? (await roleAdmin.sortBy('rolename')), 'desc');
      const whole = await wholeListFor(page, current);
      const screen = await screenShows(roleAdmin, current);
      expect({ direction: directionOf(current.request.sortBy), breaks: orderBreaks(namesOf(whole), 'desc'), ours: namesOf(whole).filter((n) => n.includes(group)), screenIsAnswer: screen.shown.join(',') === screen.expected.join(',') },
        `asked "${String(current.request.sortBy)}"; whole list: ${namesOf(whole).join(' | ')}`)
        .toEqual({ direction: 'desc', breaks: [], ours: sortedCopy(ours).reverse(), screenIsAnswer: true });
    });
  });

  test(`TC-${CASES.sortByStatus.azureId}: should group the Active and the Inactive roles together when Status is sorted`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const group = groupToken();
    let picked: RoleListResult | null = null;

    await steps.critical('Navigate to the Role Management module - the module loads and displays the current roles list (an Active and an Inactive suite role exist)', async () => {
      await createSuiteRoles(suiteRoles, STATUS_ROLES.map((r) => ({ label: `${group} ${r.label}`, isActive: r.isActive })));
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Select the sort option "Status" - a sort indicator appears on the Status column', async () => {
      picked = await roleAdmin.sortBy('status');
      const seen = { field: fieldOf(picked.request.sortBy), trigger: await roleAdmin.sortLabel(), columnIndicator: await columnSortIndicator(page, 'status') };
      expect({ ...seen, columnIndicator: seen.columnIndicator !== '' }, `the list asked "${String(picked.request.sortBy)}", the sort control reads "${seen.trigger}", the Status header shows no sort indicator (headers: ${(await headerTexts(page)).join(' | ')})`)
        .toEqual({ field: SORT_FIELD.status, trigger: SORT_LABEL.status, columnIndicator: true });
    });

    await steps.step('Apply the sort - the roles reorder, grouping Active and Inactive roles together (in both directions)', async () => {
      const first = picked ?? (await roleAdmin.sortBy('status'));
      const firstWhole = await wholeListFor(page, first);
      const firstScreen = await screenShows(roleAdmin, first);
      const second = await roleAdmin.toggleSortDirection();
      const secondWhole = await wholeListFor(page, second);
      const secondScreen = await screenShows(roleAdmin, second);
      expect({
        first: statusBlocks(firstWhole).length,
        second: statusBlocks(secondWhole).length,
        screensAreAnswers: firstScreen.shown.join(',') === firstScreen.expected.join(',') && secondScreen.shown.join(',') === secondScreen.expected.join(','),
      }, `"${String(first.request.sortBy)}": ${statusBlocks(firstWhole).join(', ')}; "${String(second.request.sortBy)}": ${statusBlocks(secondWhole).join(', ')}`)
        .toEqual({ first: STATUS_BLOCKS_WHEN_BOTH, second: STATUS_BLOCKS_WHEN_BOTH, screensAreAnswers: true });
    });
  });
});
