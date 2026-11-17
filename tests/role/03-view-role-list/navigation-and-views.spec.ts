import { test, expect } from '../../../fixtures';
import { AppRoutes } from '../../../constants/AppRoutes';
import { ROLE_ROUTE } from '../../../constants/role/roleIds';
import { ROLE_STATUS } from '../../../data/role/common.data';
import {
  CASES,
  CONSISTENCY_DESCRIPTION,
  CONSISTENCY_SEARCH,
  ENTRY_DESCRIPTION,
  MENU_LABELS,
  PREDEFINED_EXAMPLE,
  PREDEFINED_WORD,
} from '../../../data/role/viewRoleList.data';
import {
  containsText,
  describeCard,
  describeMenu,
  describeRow,
  openRolesFromMenu,
  putTableViewBack,
  readCards,
  readMenuEntry,
  readMenuEntryInArabic,
  readRowFull,
  systemSettingsShown,
  viewDifferences,
} from '../../../utils/role/writerAHelpers';

/**
 * User story 21282: View Role List - the side-menu entry (English + Arabic labels), the default list view, the
 * list / card switch, what an entry shows (Role ID asserted literally), the predefined badge, and the
 * consistency of rows and cards under a search. The Cards view is careconnect's server-side preference: every
 * switch is undone, and afterEach puts the table back if a step failed half-way. See the data file.
 */
test.describe('US 21282 - View Role List', () => {
  test.afterEach(async ({ roleAdmin }) => {
    await putTableViewBack(roleAdmin);
  });

  test(`TC-${CASES.menuNavigation.azureId}: should open Role Administration from System Settings in the side menu`, async ({ steps, roleAdmin, page }) => {
    await steps.critical('Navigate to the Role Management module - the application loads with System Settings in the side menu', async () => {
      await roleAdmin.goto(AppRoutes.dashboard);
      expect(await systemSettingsShown(page), 'the side menu shows System Settings').toBe(true);
    });

    await steps.step(`Open System Settings (${MENU_LABELS.ar.group}) in the side menu - the section expands showing Role Administration (${MENU_LABELS.ar.link})`, async () => {
      const en = await readMenuEntry(page);
      const ar = await readMenuEntryInArabic(page);
      expect({
        enGroup: containsText(en.groupLabel, MENU_LABELS.en.group),
        enLink: en.linkShown && containsText(en.linkLabel, MENU_LABELS.en.link),
        arGroup: containsText(ar.groupLabel, MENU_LABELS.ar.group),
        arLink: ar.linkShown && containsText(ar.linkLabel, MENU_LABELS.ar.link),
      }, `English: ${describeMenu(en)}; Arabic: ${describeMenu(ar)}`).toEqual({ enGroup: true, enLink: true, arGroup: true, arLink: true });
    });

    await steps.step(`Select Role Administration (${MENU_LABELS.ar.link}) - the Role Administration screen opens and displays the roles`, async () => {
      const opened = await openRolesFromMenu(roleAdmin, page);
      expect({ route: new URL(opened.url).pathname, status: opened.answer?.status ?? -1, rows: (await roleAdmin.rowIds()).length > 0 }, `${describeMenu(opened.menu)}; landed on ${opened.url}`)
        .toEqual({ route: ROLE_ROUTE, status: 200, rows: true });
    });
  });

  test(`TC-${CASES.listViewDefault.azureId}: should show the roles as a list (table) by default`, async ({ steps, roleAdmin }) => {
    await steps.critical('Navigate to the Role Management module - the module loads', async () => {
      const answer = await roleAdmin.listAnswerDuring(() => roleAdmin.navigate());
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Open the Role Administration screen for the first time in the session - the roles are displayed as a list rather than as cards', async () => {
      await roleAdmin.waitForRows();
      expect({ table: await roleAdmin.isTableShown(), cards: (await roleAdmin.cardIds()).length }).toEqual({ table: true, cards: 0 });
    });
  });

  test(`TC-${CASES.switchViews.azureId}: should switch the roles between list and card views and back`, async ({ steps, roleAdmin }) => {
    let rows: string[] = [];

    await steps.critical('Navigate to the Role Management module - the module loads showing the list view', async () => {
      await roleAdmin.open();
      rows = await roleAdmin.rowIds();
      expect({ table: await roleAdmin.isTableShown(), rows: rows.length > 0 }).toEqual({ table: true, rows: true });
    });

    await steps.step('Switch the display toggle to card view - the roles are redisplayed as cards', async () => {
      await roleAdmin.switchToCards();
      expect({ table: await roleAdmin.isTableShown(), cards: await roleAdmin.cardIds() }).toEqual({ table: false, cards: rows });
    });

    await steps.step('Switch the display toggle back to list view - the roles return to the list display', async () => {
      await roleAdmin.switchToTable();
      expect({ table: await roleAdmin.isTableShown(), rows: await roleAdmin.rowIds(), cards: (await roleAdmin.cardIds()).length }).toEqual({ table: true, rows, cards: 0 });
    });
  });

  test(`TC-${CASES.entryFields.azureId}: should show the role ID, name, description and status of a role in the list and in its card`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the module loads and displays the roles list (a suite role with a description is listed)', async () => {
      const made = await suiteRoles.create({ label: 'entry', descriptionEn: ENTRY_DESCRIPTION });
      role.id = made.id;
      role.name = made.name;
      await roleAdmin.open();
      const found = await roleAdmin.search(role.name);
      expect(found.items.map((i) => i.id)).toEqual([role.id]);
    });

    await steps.step('Review a role entry in the list - the entry shows the role ID, role name, description and status', async () => {
      const row = await readRowFull(roleAdmin, role.id);
      expect({ roleId: row.text.includes(role.id), name: row.name, description: row.description, status: row.status }, `${describeRow(row)} - role ID ${role.id}`)
        .toEqual({ roleId: true, name: role.name, description: ENTRY_DESCRIPTION, status: ROLE_STATUS.active });
    });

    await steps.step('Switch to card view and review the same role - the card shows the same role ID, role name, description and status', async () => {
      const { cards } = await readCards(roleAdmin, page, [role.id]);
      const card = cards[0];
      expect({ roleId: card.text.includes(role.id), name: card.name, description: card.description, status: card.status }, `${describeCard(card)} - role ID ${role.id}`)
        .toEqual({ roleId: true, name: role.name, description: ENTRY_DESCRIPTION, status: ROLE_STATUS.active });
    });
  });

  test(`TC-${CASES.predefinedBadge.azureId}: should mark a predefined role with the Predefined badge and a custom role without it`, async ({ steps, suiteRoles, roleAdmin }) => {
    const role = { id: '', name: '' };

    await steps.critical('Navigate to the Role Management module - the module loads (a predefined role and a suite role exist)', async () => {
      const made = await suiteRoles.create({ label: 'badge' });
      role.id = made.id;
      role.name = made.name;
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step(`Review a predefined role's entry (${PREDEFINED_EXAMPLE.en}) - a "${PREDEFINED_WORD}" badge is displayed on the entry`, async () => {
      await roleAdmin.search(PREDEFINED_EXAMPLE.en);
      const row = await readRowFull(roleAdmin, PREDEFINED_EXAMPLE.id);
      expect({ badge: row.predefined, says: containsText(row.text, PREDEFINED_WORD) }, describeRow(row)).toEqual({ badge: true, says: true });
    });

    await steps.step(`Review a non-predefined role's entry - no "${PREDEFINED_WORD}" badge is displayed on the entry`, async () => {
      await roleAdmin.search(role.name);
      const row = await readRowFull(roleAdmin, role.id);
      expect({ badge: row.predefined, says: containsText(row.text, PREDEFINED_WORD) }, describeRow(row)).toEqual({ badge: false, says: false });
    });
  });

  test(`TC-${CASES.consistencyAcrossViews.azureId}: should show the same badges, fields and actions for predefined and custom roles in both views while a search is active`, async ({ steps, suiteRoles, roleAdmin, page }) => {
    const role = { id: '', name: '' };

    await steps.critical(`Navigate to the Role Management module - the module loads (a search "${CONSISTENCY_SEARCH}" lists the predefined ${PREDEFINED_EXAMPLE.en} and a suite role)`, async () => {
      const made = await suiteRoles.create({ label: CONSISTENCY_SEARCH, descriptionEn: CONSISTENCY_DESCRIPTION });
      role.id = made.id;
      role.name = made.name;
      await roleAdmin.open();
      const found = await roleAdmin.search(CONSISTENCY_SEARCH);
      const ids = found.items.map((i) => i.id);
      expect({ predefined: ids.includes(PREDEFINED_EXAMPLE.id), suite: ids.includes(role.id) }, `listed: ${found.items.map((i) => i.name).join(' | ')}`).toEqual({ predefined: true, suite: true });
    });

    await steps.step('Switch between list and card views while the search is active, and inspect predefined versus non-predefined roles in each view - badges, available actions and displayed fields remain consistent', async () => {
      const rows = [await readRowFull(roleAdmin, PREDEFINED_EXAMPLE.id), await readRowFull(roleAdmin, role.id)];
      const tableIds = await roleAdmin.rowIds();
      const { cardIds, cards } = await readCards(roleAdmin, page, [PREDEFINED_EXAMPLE.id, role.id]);
      const afterIds = await roleAdmin.rowIds();
      expect({
        sameRolesInCards: [...cardIds].sort().join(',') === [...tableIds].sort().join(','),
        searchKept: afterIds.join(',') === tableIds.join(','),
        differences: [...viewDifferences(rows[0], cards[0]), ...viewDifferences(rows[1], cards[1])],
      }, `${describeRow(rows[0])}; ${describeCard(cards[0])}; ${describeRow(rows[1])}; ${describeCard(cards[1])}`)
        .toEqual({ sameRolesInCards: true, searchKept: true, differences: [] });
    });
  });
});
