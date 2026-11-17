import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import type { SuiteSession } from '../../../fixtures/userModule.fixture';
import { CASES, HOME_LIST, MESSAGES, NO_MATCH_TERM, RESTRICTED_RIGHTS } from '../../../data/lookup/exportLookupItems.data';
import {
  codesOnScreen,
  excelWhileFailing,
  failExportService,
  itemsExportMenu,
  itemsListEmpty,
  itemsScreenAs,
  searchItems,
  selectedExportOfNothing,
  sepless,
} from '../../../utils/lookup/writerCHelpers';

/** Step 1 of every case: the register of lists. */
async function openModule(steps: TestSteps, register: LookupRegisterPage): Promise<void> {
  await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
    await register.open();
    await register.expectRowsRendered();
  });
}

/**
 * User story 20857: Export Lookup Items - "Nothing to export in the current
 * view.", the failure message (ExportLookupItems made to answer 500 in this
 * window, lead decision 4) and who is offered Export (a suite role without
 * Lookups.ExportLookupItems; baseline: the administrator). See the data file.
 */
test.describe('US 20857 - Export Lookup Items (messages and access)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.nothingToExport.azureId}: should say there is nothing to export when the current view holds no rows`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
  }) => {
    await openModule(steps, lookupRegister);

    await steps.critical('Open a lookup and apply a search that returns no matching rows - the grid shows no items', async () => {
      await items.open(HOME_LIST);
      const shown = await searchItems(page, items, NO_MATCH_TERM);
      expect({ rows: shown.length, empty: await itemsListEmpty(page, items) }, `rows after searching "${NO_MATCH_TERM}"`).toEqual({ rows: 0, empty: true });
    });

    await steps.step('Select Export then "Selected Export" - no file format prompt appears, "Nothing to export in the current view." is shown and no file is downloaded', async () => {
      const outcome = await selectedExportOfNothing(page, MESSAGES.nothingToExport);
      expect({ formatPrompt: outcome.formatPrompt, downloaded: outcome.downloaded, messageShown: outcome.toasts.includes(sepless(MESSAGES.nothingToExport)) },
        `toasts: [${outcome.toasts.join(' | ')}]`).toEqual({ formatPrompt: false, downloaded: false, messageShown: true });
    });
  });

  test(`TC-${CASES.exportFails.azureId}: should tell the administrator when the export fails and download nothing`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
  }) => {
    const menu = itemsExportMenu(page);
    let before: string[] = [];
    let outcome: { downloaded: boolean; toasts: string[] } = { downloaded: false, toasts: [] };
    let fault!: Awaited<ReturnType<typeof failExportService>>;
    await openModule(steps, lookupRegister);

    await steps.critical('Open a lookup and start an export (Export All Data, Excel) while the export service is failing - the request is submitted', async () => {
      await items.open(HOME_LIST);
      await items.expectRowsRendered();
      before = await codesOnScreen(items);
      fault = await failExportService(page);
      await menu.open();
      await menu.chooseScope('all');
      outcome = await excelWhileFailing(page, MESSAGES.failed);
      expect(fault.hits(), 'ExportLookupItems requests sent (each answered 500)').toBeGreaterThan(0);
    });

    await steps.step('Observe the system response - no file is downloaded, "Failed to export lookups." is displayed and the item list remains unchanged', async () => {
      await fault.restore();
      expect({ downloaded: outcome.downloaded, rows: await codesOnScreen(items) }, 'the download and the list after the failed export').toEqual({ downloaded: false, rows: before });
      expect(outcome.toasts, 'the toasts after the failed export').toContain(sepless(MESSAGES.failed));
    });
  });

  test(`TC-${CASES.notAdmin.azureId}: should hide the Export option from a user who is not a System Administrator`, async ({
    steps,
    lookupItemsPage: items,
    suiteSession,
  }) => {
    let s!: SuiteSession;
    let seen: Awaited<ReturnType<typeof itemsScreenAs>> = { url: '', mode: 'full', exportShown: true };

    await steps.critical('Navigate to the Lookups Management module as a user who is not a System Administrator - the module is inaccessible or shown in read-only/limited mode (baseline: the administrator is offered Export)', async () => {
      await items.open(HOME_LIST);
      await expect(items.control('exportTrigger'), 'Export for the administrator (baseline)').toBeVisible();
      s = await suiteSession({ rights: RESTRICTED_RIGHTS });
      seen = await itemsScreenAs(s.page, HOME_LIST);
      expect(['inaccessible', 'limited'], `the items screen for "${s.role.name}" (${RESTRICTED_RIGHTS.join(', ')}) at ${seen.url}`).toContain(seen.mode);
    });

    await steps.step('Look for the Export action on any lookup - Export is not shown', async () => {
      expect(seen.exportShown, `Export offered to "${s.role.name}" (${RESTRICTED_RIGHTS.join(', ')}) on ${HOME_LIST}`).toBe(false);
    });
  });
});
