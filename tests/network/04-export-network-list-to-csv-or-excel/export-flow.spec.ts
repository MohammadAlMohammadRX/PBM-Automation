import { test, expect } from '../../../fixtures';
import {
  CASES,
  EXPORT_HEADERS,
  SCOPE,
  SHEET_SCOPE_LABELS,
  exportDateToList,
  integrityArabicName,
} from '../../../data/networks/exportNetworkList.data';

/**
 * User story 14121: Export network list to CSV or Excel.
 * The export FLOW - its prompts in order, cancelling, repeated triggers, the
 * file's structure and bilingual integrity, and who may export at all.
 */
test.describe('US 14121 - Export flow and file integrity', () => {
  test(`TC-${CASES.states.azureId}: should move from the scope prompt to the format prompt to a completed download when an export is run`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module - the directory is idle with Export available', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.exportMenu().expectAvailable();
    });

    await steps.step('Clicking Export shows the scope prompt with All Networks and Filtered Results', async () => {
      const menu = networkManagementPage.exportMenu();
      await menu.open();
      expect(await menu.isMenuOpen()).toBe(true);
      expect(await menu.getScopeLabels(), 'the prompt should name the two scopes as the story does').toEqual(
        expect.arrayContaining([...SHEET_SCOPE_LABELS]),
      );
    });

    await steps.step('Choosing a scope moves to the format prompt offering CSV and Excel', async () => {
      const menu = networkManagementPage.exportMenu();
      await menu.chooseScope(SCOPE.allNetworks);
      expect(await menu.isFormatDialogOpen()).toBe(true);
      await menu.expectFormatChoiceOffered();
    });

    await steps.step('Choosing a format completes with a downloaded file', async () => {
      const file = await networkManagementPage.exportMenu().chooseFormatAndRead('csv');
      expect(file.filename.endsWith('.csv')).toBe(true);
      expect(file.bytes.length, 'the completed file should not be empty').toBeGreaterThan(0);
      expect(await networkManagementPage.exportMenu().isFormatDialogOpen(), 'the prompt should close on completion').toBe(false);
    });
  });

  test(`TC-${CASES.cancel.azureId}: should abort cleanly without a file when the export is cancelled at the scope or the format prompt`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module - the directory loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('Cancelling the scope prompt closes it and downloads nothing', async () => {
      const menu = networkManagementPage.exportMenu();
      await menu.open();
      const downloaded = await menu.expectNoDownloadWhile(() => menu.cancelMenu());
      expect(downloaded, 'no file may be produced').toBe(false);
      expect(await menu.isMenuOpen()).toBe(false);
    });

    await steps.step('Cancelling the format prompt closes it and downloads nothing', async () => {
      const menu = networkManagementPage.exportMenu();
      await menu.open();
      await menu.chooseScope(SCOPE.allNetworks);
      const downloaded = await menu.expectNoDownloadWhile(() => menu.cancel());
      expect(downloaded, 'no file may be produced').toBe(false);
      expect(await menu.isFormatDialogOpen()).toBe(false);
    });
  });

  test(`TC-${CASES.repeated.azureId}: should show one prompt and produce intact files when Export is triggered repeatedly`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.repeated;

    await steps.critical('Navigate to the module - the directory loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('Rapid clicks on Export leave at most one prompt open', async () => {
      const open = await networkManagementPage.exportMenu().clickTriggerRepeatedly(data.clicks);
      expect(open, 'duplicate clicks must not stack prompts').toBeLessThanOrEqual(1);
      await networkManagementPage.openList();
    });

    await steps.step('Two exports run back to back each produce one complete, identical file', async () => {
      const first = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'csv');
      const second = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'csv');
      expect(first.parsed.headers).toEqual(EXPORT_HEADERS);
      expect(second.parsed.headers).toEqual(EXPORT_HEADERS);
      expect(second.parsed.rows.length, 'the second file must not be truncated or doubled').toBe(first.parsed.rows.length);
    });
  });

  test(`TC-${CASES.integrity.azureId}: should export correct headers, intact Arabic and values matching the list when all networks are exported`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { nameAr: integrityArabicName() });
    let listed: Record<string, string> = {};

    await steps.critical('Navigate to the module - the directory lists the case\'s own network', async () => {
      await networkManagementPage.openList();
      listed = await networkManagementPage.readRow(network.name);
      expect(listed.code).not.toBe('');
      await networkManagementPage.openList();
    });

    await steps.step('The CSV carries the expected headers, the Arabic name intact, and the list\'s values', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'csv');
      expect(file.parsed.headers).toEqual(EXPORT_HEADERS);
      const row = file.parsed.rows.find((r) => r[EXPORT_HEADERS[0]] === listed.code);
      expect(row, `the export should hold ${listed.code}`).toBeDefined();
      expect(row![EXPORT_HEADERS[2]], 'the Arabic name must survive encoding exactly').toBe(network.nameAr);
      expect(row![EXPORT_HEADERS[1]]).toBe(network.name);
      expect(row![EXPORT_HEADERS[3]]).toBe(listed.networkType);
      expect(exportDateToList(row![EXPORT_HEADERS[7]])).toBe(listed.effectiveDate);
      expect(exportDateToList(row![EXPORT_HEADERS[8]])).toBe(listed.expiryDate);
    });
  });

  test(`TC-${CASES.noSelection.azureId}: should not export anything until both a scope and a format are explicitly chosen`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module - the directory loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('Opening the scope prompt starts no export until a scope is chosen', async () => {
      const menu = networkManagementPage.exportMenu();
      const downloaded = await menu.expectNoDownloadWhile(() => menu.open());
      expect(downloaded).toBe(false);
      expect(await menu.isMenuOpen()).toBe(true);
    });

    await steps.step('The format prompt offers only explicit format choices and starts no export by itself', async () => {
      const menu = networkManagementPage.exportMenu();
      const downloaded = await menu.expectNoDownloadWhile(() => menu.chooseScope(SCOPE.allNetworks));
      expect(downloaded).toBe(false);
      expect(await menu.getOfferedFormats(), 'no generic Confirm that could proceed without a format').toEqual(['cancel', 'csv', 'excel']);
      await menu.cancel();
    });
  });

  test(`TC-${CASES.permission.azureId}: should withhold the export when the user's role lacks export permission`, async ({
    shapedNonAdmin,
    steps,
  }) => {
    const session = await shapedNonAdmin({ without: ['exportNetworks'] });

    await steps.critical('The restricted user opens the directory', async () => {
      await session.networks.openList();
    });

    await steps.step('The Export action is not offered, and any export attempt produces no file', async () => {
      await session.networks.exportMenu().expectExportRefused();
    });
  });
});
