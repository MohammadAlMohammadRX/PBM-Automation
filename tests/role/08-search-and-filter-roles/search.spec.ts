import { test, expect } from '../../../fixtures';
import { ROLE_MESSAGES } from '../../../data/role/common.data';
import {
  ARABIC_DESCRIPTION_PREFIX,
  CASES,
  ENGLISH_DESCRIPTION,
  EXAMPLE_NAMES,
  NO_MATCH_NAME,
} from '../../../data/role/searchAndFilterRoles.data';
import { allRoles } from '../../../utils/role/roleApi';
import { arabicWord, containsText, groupToken, screenNames, screenShows } from '../../../utils/role/writerAHelpers';

/**
 * User story 21287: Search and Filter Roles - the search box: by English name, no result ("No roles found."),
 * Arabic name + Arabic description, English name + English description, clearing, and opening a found role
 * for management (Edit, closed without saving). Every search awaits its own GetRoles answer. Suite roles only.
 */
test.describe('US 21287 - Search and Filter Roles (search)', () => {
  test(`TC-${CASES.searchByName.azureId}: should narrow the list to the roles matching the name typed in the search box`, async ({ steps, suiteRoles, roleAdmin }) => {
    const role = { id: '', name: '' };
    let total = 0;

    await steps.critical(`Navigate to the Role Management module - the module home page shows the role list (a suite role "... ${EXAMPLE_NAMES.claimsReviewer}" exists)`, async () => {
      const made = await suiteRoles.create({ label: `${groupToken()} ${EXAMPLE_NAMES.claimsReviewer}` });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      total = answer.totalRows;
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Enter the role\'s name in the search field - the role list narrows', async () => {
      const searched = await roleAdmin.search(role.name);
      expect({ searchText: searched.request.searchText, narrowed: searched.totalRows < total }, `${searched.totalRows} of ${total} roles`).toEqual({ searchText: role.name, narrowed: true });
    });

    await steps.step('Review the results - only roles whose name matches the term are listed', async () => {
      const names = await screenNames(roleAdmin);
      expect({ listed: names.includes(role.name), notMatching: names.filter((n) => !containsText(n, role.name)) }, `rows: ${names.join(' | ')}`).toEqual({ listed: true, notMatching: [] });
    });
  });

  test(`TC-${CASES.noRolesFound.azureId}: should say "${ROLE_MESSAGES.noRolesFound}" when the search matches no role`, async ({ steps, roleAdmin }) => {
    await steps.critical('Navigate to the Role Management module - the module home page shows the role list', async () => {
      const answer = await roleAdmin.open();
      expect({ status: answer.status, rows: answer.totalRows > 0 }).toEqual({ status: 200, rows: true });
    });

    await steps.step(`Enter "${NO_MATCH_NAME}" in the search field - the search executes`, async () => {
      const searched = await roleAdmin.search(NO_MATCH_NAME);
      expect({ status: searched.status, searchText: searched.request.searchText }).toEqual({ status: 200, searchText: NO_MATCH_NAME });
    });

    await steps.step(`Review the result area - the message "${ROLE_MESSAGES.noRolesFound}" is displayed and the list is empty`, async () => {
      await expect(roleAdmin.emptyText()).toHaveText(ROLE_MESSAGES.noRolesFound);
      expect((await roleAdmin.rowIds()).length).toBe(0);
    });
  });

  test(`TC-${CASES.arabicNameAndDescription.azureId}: should find a role by its Arabic name and by a word of its Arabic description`, async ({ steps, suiteRoles, roleAdmin }) => {
    const role = { id: '', nameAr: '', descriptionWord: '' };

    await steps.critical(`Navigate to the Role Management module - the module home page shows the role list (a suite role "${EXAMPLE_NAMES.arabicNetworkManager} ..." with an Arabic description exists)`, async () => {
      role.nameAr = `${EXAMPLE_NAMES.arabicNetworkManager} ${arabicWord()}`;
      role.descriptionWord = arabicWord();
      const made = await suiteRoles.create({ label: 'arabic search', nameAr: role.nameAr, descriptionAr: `${ARABIC_DESCRIPTION_PREFIX} ${role.descriptionWord}` });
      role.id = made.id;
      const answer = await roleAdmin.open();
      expect({ status: answer.status, arabicName: made.arabicName }).toEqual({ status: 200, arabicName: role.nameAr });
    });

    let byName: string[] = [];
    await steps.step(`Enter the Arabic role name ("${EXAMPLE_NAMES.arabicNetworkManager} ...") in the search field - the search executes`, async () => {
      const searched = await roleAdmin.search(role.nameAr);
      byName = searched.items.map((i) => i.id);
      expect({ status: searched.status, searchText: searched.request.searchText }).toEqual({ status: 200, searchText: role.nameAr });
    });

    await steps.step('Review the results - the role with the matching Arabic name is listed', async () => {
      expect({ answer: byName.includes(role.id), screen: (await roleAdmin.rowIds()).includes(role.id) }, `GetRoles answered ${byName.length} role(s) for "${role.nameAr}"`).toEqual({ answer: true, screen: true });
    });

    await steps.step('Clear the search and search instead using a keyword from the role\'s Arabic description - the same role is listed', async () => {
      await roleAdmin.clearSearch();
      const searched = await roleAdmin.search(role.descriptionWord);
      const screen = await screenShows(roleAdmin, searched);
      expect({ answer: searched.items.map((i) => i.id).includes(role.id), screen: screen.shown.includes(role.id) }, `the search box found ${searched.totalRows} role(s) for "${role.descriptionWord}", a word of the role's Arabic description (the box matched its Arabic name)`).toEqual({ answer: true, screen: true });
    });
  });

  test(`TC-${CASES.englishNameAndDescription.azureId}: should find a role by its English name and by a word of its English description`, async ({ steps, suiteRoles, roleAdmin }) => {
    const role = { id: '', name: '', keyword: '' };

    await steps.critical(`Navigate to the Role Management module - the module home page shows the role list (a suite role "... ${EXAMPLE_NAMES.networkAdministrator}" with an English description exists)`, async () => {
      role.keyword = groupToken();
      const made = await suiteRoles.create({ label: `${groupToken()} ${EXAMPLE_NAMES.networkAdministrator}`, descriptionEn: ENGLISH_DESCRIPTION(role.keyword) });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    let byName: string[] = [];
    await steps.step(`Enter the English role name ("... ${EXAMPLE_NAMES.networkAdministrator}") in the search field - the search executes`, async () => {
      const searched = await roleAdmin.search(role.name);
      byName = searched.items.map((i) => i.id);
      expect({ status: searched.status, searchText: searched.request.searchText }).toEqual({ status: 200, searchText: role.name });
    });

    await steps.step('Review the results - the role with the matching English name is listed', async () => {
      expect({ answer: byName.includes(role.id), screen: (await roleAdmin.rowIds()).includes(role.id) }, `GetRoles answered ${byName.length} role(s) for "${role.name}"`).toEqual({ answer: true, screen: true });
    });

    await steps.step('Clear the search and search instead using a keyword from the role\'s English description - the same role is listed', async () => {
      await roleAdmin.clearSearch();
      const searched = await roleAdmin.search(role.keyword);
      const screen = await screenShows(roleAdmin, searched);
      expect({ answer: searched.items.map((i) => i.id).includes(role.id), screen: screen.shown.includes(role.id) }, `the search box found ${searched.totalRows} role(s) for "${role.keyword}", a word of the role's English description (the box matched its English name)`).toEqual({ answer: true, screen: true });
    });
  });

  test(`TC-${CASES.clearSearch.azureId}: should return to the full role list when the search field is cleared`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const role = { id: '', name: '' };
    let total = 0;

    await steps.critical('Navigate to the Role Management module - the module home page shows the full role list', async () => {
      const made = await suiteRoles.create({ label: `${groupToken()} ${EXAMPLE_NAMES.claimsReviewer}` });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      total = answer.totalRows;
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Enter a role name in the search field to narrow the list - the list narrows to matching roles only', async () => {
      const searched = await roleAdmin.search(role.name);
      expect({ ids: searched.items.map((i) => i.id), narrowed: searched.totalRows < total }, `${searched.totalRows} of ${total} roles`).toEqual({ ids: [role.id], narrowed: true });
    });

    await steps.step('Clear the search field - the role list returns to showing all roles', async () => {
      const cleared = await roleAdmin.search('');
      const screen = await screenShows(roleAdmin, cleared);
      const every = (await allRoles(page)).length;
      expect({ searchText: cleared.request.searchText ?? '', total: cleared.totalRows, screenIsAnswer: screen.shown.join(',') === screen.expected.join(',') }, `GetRoles lists ${every} roles; the cleared list answered ${cleared.totalRows}`)
        .toEqual({ searchText: '', total: every, screenIsAnswer: true });
    });
  });

  test(`TC-${CASES.searchThenManage.azureId}: should open a role found by search for management (Edit)`, async ({ steps, suiteRoles, roleAdmin }) => {
    const role = { id: '', name: '' };

    await steps.critical(`Navigate to the Role Management module - the module home page shows the role list (a suite role "... ${EXAMPLE_NAMES.claimsReviewer}" exists)`, async () => {
      const made = await suiteRoles.create({ label: `${groupToken()} ${EXAMPLE_NAMES.claimsReviewer}` });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Search for the role - the matching role is listed', async () => {
      const searched = await roleAdmin.search(role.name);
      await expect(roleAdmin.row(role.id)).toBeVisible();
      expect(searched.items.map((i) => i.id)).toEqual([role.id]);
    });

    await steps.step('Select the role from the search results (Edit) - the role\'s details open for management', async () => {
      const form = await roleAdmin.openEdit(role.id);
      const title = await form.title();
      const values = await form.readValues();
      const guard = await form.close();
      expect({ title, name: values.nameEn, closedWithoutChanges: guard }).toEqual({ title: ROLE_MESSAGES.editTitle, name: role.name, closedWithoutChanges: '' });
    });
  });
});
