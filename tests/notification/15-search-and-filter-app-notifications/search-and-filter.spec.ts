import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { DefinitionsTab } from '../../../pages/notification/NotificationCenterPage';
import { DEF_ACTION, DEF_MODULE } from '../../../constants/notification/writerCIds';
import {
  ACTION_LABEL,
  ACTIVE_MARK,
  CASES,
  CHIP_LABEL,
  CHIP_TEXT,
  EMPTY_TEXT,
  EXPIRY_NAME_LABEL,
  FILTER_KEY,
  INACTIVE_MARK,
  MODULE_LABEL,
  NO,
  NO_MATCH_TEXT,
  SEARCH_PART,
  SPECIAL_TEXT,
  STORY,
  YES,
} from '../../../data/notification/searchAndFilterAppNotifications.data';
import { chipRemoveControl, idsOf, makeSuiteDefinition, makeSuiteDefinitions, toastTexts } from '../../../utils/notification/writerCHelpers';

/** Step 1 of every case: the App Notification tab of the Notification Center. */
async function openList(steps: TestSteps, tab: DefinitionsTab): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
    const answer = await tab.open();
    expect(answer?.status, 'GetDefinitions should answer the App Notification tab').toBe(200);
  });
}

/**
 * User story 20999: Search and Filter App Notifications - search, the Advanced
 * Search filters and their chips. Every record a case needs is its own suite
 * definition (teardown deletes it). See the data file for the readings.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.partialName.azureId}: should list only notifications whose name contains the typed part when searching "${SEARCH_PART}"`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const def = await makeSuiteDefinition(page, suiteDefinitions, { label: EXPIRY_NAME_LABEL, moduleId: DEF_MODULE.policyManagement, actionId: DEF_ACTION.policyExpiringSoon });
    await openList(steps, ncDefinitions);

    await steps.step(`Enter a partial name, "${SEARCH_PART}", in the search box - the search executes and only notifications whose name contains it are displayed`, async () => {
      const answer = await ncDefinitions.search(SEARCH_PART);
      const rows = await ncDefinitions.readRows(['name']);
      expect(answer?.request.searchText, 'the search request carries the typed text').toBe(SEARCH_PART);
      expect(rows.map((r) => r.id), 'the rows shown are the search answer').toEqual(idsOf(answer?.items ?? []));
      expect(rows.filter((r) => !r.name.toLowerCase().includes(SEARCH_PART.toLowerCase())).map((r) => r.name), `rows whose name does not contain "${SEARCH_PART}"`).toEqual([]);
      expect(rows.map((r) => r.name), `the suite notification "${def.name}" is found`).toContain(def.name);
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show an empty list with the no-records message when the search text matches no notification`, async ({ steps, ncDefinitions }) => {
    await openList(steps, ncDefinitions);

    await steps.step(`Enter a name that does not exist, "${NO_MATCH_TEXT}", in the search box - the list displays no records and says so`, async () => {
      const answer = await ncDefinitions.search(NO_MATCH_TEXT);
      expect(answer?.totalRows, `GetDefinitions answered ${answer?.status} with ${answer?.totalRows} rows`).toBe(0);
      await expect(ncDefinitions.rows()).toHaveCount(0);
      await expect(ncDefinitions.emptyState()).toHaveText(EMPTY_TEXT);
    });
  });

  test(`TC-${CASES.byAction.azureId}: should show only notifications of the chosen action when filtering by action in Advanced Search`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const wanted = await makeSuiteDefinition(page, suiteDefinitions, { label: 'action filter', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive });
    const other = await makeSuiteDefinition(page, suiteDefinitions, { label: 'action filter other', moduleId: DEF_MODULE.planManagement, actionId: DEF_ACTION.planInactive });
    await openList(steps, ncDefinitions);

    await steps.step(`Open Advanced Search and select the Action "${ACTION_LABEL.networkInactive}" - only notifications configured with that action are shown`, async () => {
      const answer = await ncDefinitions.filter({ [FILTER_KEY.action]: ACTION_LABEL.networkInactive });
      const rows = await ncDefinitions.readRows(['name', 'action']);
      expect(rows.map((r) => r.id), 'the rows shown are the filtered answer').toEqual(idsOf(answer?.items ?? []));
      expect(rows.filter((r) => r.action !== ACTION_LABEL.networkInactive).map((r) => `${r.name}: ${r.action}`), 'rows of another action').toEqual([]);
      expect(rows.map((r) => r.id), `"${wanted.name}" (${ACTION_LABEL.networkInactive}) is listed`).toContain(wanted.id);
      expect(rows.map((r) => r.id), `"${other.name}" (${ACTION_LABEL.planInactive}) is not listed`).not.toContain(other.id);
    });
  });

  test(`TC-${CASES.byModule.azureId}: should show only Payer Management notifications when filtering by that module in Advanced Search`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const payer = await makeSuiteDefinition(page, suiteDefinitions, { label: 'module filter payer', moduleId: DEF_MODULE.payerManagement, actionId: DEF_ACTION.payerInactive });
    const plan = await makeSuiteDefinition(page, suiteDefinitions, { label: 'module filter plan', moduleId: DEF_MODULE.planManagement, actionId: DEF_ACTION.planInactive });
    await openList(steps, ncDefinitions);

    await steps.step(`Open Advanced Search and select Module "${MODULE_LABEL.payer}" - only notifications of that module are shown`, async () => {
      const answer = await ncDefinitions.filter({ [FILTER_KEY.module]: MODULE_LABEL.payer });
      const rows = await ncDefinitions.readRows(['name', 'module']);
      expect(rows.map((r) => r.id), 'the rows shown are the filtered answer').toEqual(idsOf(answer?.items ?? []));
      expect(rows.filter((r) => r.module !== MODULE_LABEL.payer).map((r) => `${r.name}: ${r.module}`), 'rows of another module').toEqual([]);
      expect(rows.map((r) => r.id), `"${payer.name}" is listed`).toContain(payer.id);
      expect(rows.map((r) => r.id), `"${plan.name}" (Plan Management) is not listed`).not.toContain(plan.id);
    });
  });

  test(`TC-${CASES.inactiveOnly.azureId}: should show only inactive notifications when the Active filter is set to No`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const active = await makeSuiteDefinition(page, suiteDefinitions, { label: 'active filter on', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive, isActive: true });
    const inactive = await makeSuiteDefinition(page, suiteDefinitions, { label: 'active filter off', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive, isActive: false });
    await openList(steps, ncDefinitions);

    await steps.step(`Open Advanced Search and set the Active filter to "${NO}" - only notifications marked Inactive are displayed`, async () => {
      const answer = await ncDefinitions.filter({ [FILTER_KEY.active]: NO });
      const rows = await ncDefinitions.readRows(['name', 'active']);
      expect(rows.map((r) => r.id), 'the rows shown are the filtered answer').toEqual(idsOf(answer?.items ?? []));
      expect(rows.filter((r) => r.active !== INACTIVE_MARK).map((r) => `${r.name}: ${r.active}`), 'rows not shown as inactive').toEqual([]);
      expect((answer?.items ?? []).filter((i) => i.isActive !== false).map((i) => String(i.name)), 'answer rows that are active').toEqual([]);
      expect(rows.map((r) => r.id), `the inactive "${inactive.name}" is listed`).toContain(inactive.id);
      expect(rows.map((r) => r.id), `the active "${active.name}" is not listed`).not.toContain(active.id);
    });
  });

  test(`TC-${CASES.activeOnly.azureId}: should show only active notifications when the Active filter is set to Yes`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const active = await makeSuiteDefinition(page, suiteDefinitions, { label: 'active filter on', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive, isActive: true });
    const inactive = await makeSuiteDefinition(page, suiteDefinitions, { label: 'active filter off', moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive, isActive: false });
    await openList(steps, ncDefinitions);

    await steps.step(`Open Advanced Search and set the Active filter to "${YES}" - only notifications marked Active are displayed`, async () => {
      const answer = await ncDefinitions.filter({ [FILTER_KEY.active]: YES });
      const rows = await ncDefinitions.readRows(['name', 'active']);
      expect(rows.map((r) => r.id), 'the rows shown are the filtered answer').toEqual(idsOf(answer?.items ?? []));
      expect(rows.filter((r) => r.active !== ACTIVE_MARK).map((r) => `${r.name}: ${r.active}`), 'rows not shown as active').toEqual([]);
      expect((answer?.items ?? []).filter((i) => i.isActive !== true).map((i) => String(i.name)), 'answer rows that are inactive').toEqual([]);
      expect(rows.map((r) => r.id), `the active "${active.name}" is listed`).toContain(active.id);
      expect(rows.map((r) => r.id), `the inactive "${inactive.name}" is not listed`).not.toContain(inactive.id);
    });
  });

  test(`TC-${CASES.chipShown.azureId}: should show an applied filter as a removable chip above the list`, async ({ page, steps, ncDefinitions }) => {
    await openList(steps, ncDefinitions);

    await steps.step(`Apply a filter, Module "${MODULE_LABEL.plan}" - a chip labelled "${CHIP_TEXT(CHIP_LABEL.module, MODULE_LABEL.plan)}" appears above the list and can be removed`, async () => {
      const answer = await ncDefinitions.filter({ [FILTER_KEY.module]: MODULE_LABEL.plan });
      expect(answer?.status, 'the filtered list answers').toBe(200);
      const chips = await ncDefinitions.chips();
      expect(chips[FILTER_KEY.module], `chips shown: ${JSON.stringify(chips)}`).toBe(CHIP_TEXT(CHIP_LABEL.module, MODULE_LABEL.plan));
      await expect(chipRemoveControl(page, FILTER_KEY.module), 'the chip carries its remove (x) control').toBeVisible();
    });
  });

  test(`TC-${CASES.chipRemoved.azureId}: should remove the filter and refresh the list to the unfiltered state when the chip is closed`, async ({ steps, ncDefinitions }) => {
    let unfiltered = -1;
    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads with a filter chip applied', async () => {
      const first = await ncDefinitions.open();
      unfiltered = first?.totalRows ?? -1;
      const answer = await ncDefinitions.filter({ [FILTER_KEY.module]: MODULE_LABEL.plan });
      expect(answer?.request.moduleNameId, 'the filtered request carries the module').toBeTruthy();
      expect(Object.keys(await ncDefinitions.chips()), 'a module chip is applied').toContain(FILTER_KEY.module);
    });

    await steps.step('Click the remove (x) icon on the filter chip - the chip disappears and the list refreshes to the unfiltered state', async () => {
      const answer = await ncDefinitions.removeChip(FILTER_KEY.module);
      expect(Object.keys(await ncDefinitions.chips()), 'chips left after removing the module chip').not.toContain(FILTER_KEY.module);
      expect(answer?.request.moduleNameId ?? null, 'the refreshed request carries no module filter').toBeNull();
      expect(answer?.totalRows, `the unfiltered list had ${unfiltered} rows`).toBe(unfiltered);
    });
  });

  test(`TC-${CASES.combined.azureId}: should show only notifications meeting a Name, a Module and an Active filter together, each as a chip`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const base = suiteDefinitions.newName('combined');
    const [match, inactiveTwin, otherModule] = await makeSuiteDefinitions(page, suiteDefinitions, base, [
      { moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive, isActive: true },
      { moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive, isActive: false },
      { moduleId: DEF_MODULE.planManagement, actionId: DEF_ACTION.planInactive, isActive: true },
    ]);
    await openList(steps, ncDefinitions);

    await steps.step('Apply a Name filter, a Module filter and an Active=Yes filter together - three chips appear and only notifications satisfying all of them are displayed', async () => {
      const answer = await ncDefinitions.filter({ [FILTER_KEY.name]: base, [FILTER_KEY.module]: MODULE_LABEL.network, [FILTER_KEY.active]: YES });
      const chips = await ncDefinitions.chips();
      expect(Object.keys(chips).filter((k) => k !== 'search').sort(), `chips shown: ${JSON.stringify(chips)}`).toEqual([FILTER_KEY.active, FILTER_KEY.module, FILTER_KEY.name].sort());
      const rows = await ncDefinitions.rowIds();
      expect(rows, 'the rows shown are the filtered answer').toEqual(idsOf(answer?.items ?? []));
      expect(rows, `only "${match.name}" meets all three (not the inactive "${inactiveTwin.name}" nor the Plan "${otherModule.name}")`).toEqual([match.id]);
    });
  });

  test(`TC-${CASES.specialCharacters.azureId}: should treat special characters in the search as plain text without failing`, async ({ page, steps, ncDefinitions }) => {
    await openList(steps, ncDefinitions);

    await steps.step(`Enter special characters, "${SPECIAL_TEXT}", in the search box - the search runs as plain text, shows no (or only literal) matches and does not error`, async () => {
      const answer = await ncDefinitions.search(SPECIAL_TEXT);
      expect(answer?.status, `GetDefinitions answered ${answer?.status} to the search`).toBe(200);
      expect((answer?.items ?? []).map((i) => String(i.name)).filter((n) => !n.includes(SPECIAL_TEXT)), 'rows that do not literally contain the text').toEqual([]);
      expect(await ncDefinitions.rowIds(), 'the rows shown are the answer').toEqual(idsOf(answer?.items ?? []));
      expect((await toastTexts(page)).filter((t) => /error|failed|went wrong/i.test(t)), 'error toasts').toEqual([]);
      await expect(ncDefinitions.emptyState().or(ncDefinitions.rows().first()), 'the list still renders').toBeVisible();
    });
  });
});

