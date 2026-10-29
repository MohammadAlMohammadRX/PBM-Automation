import { test, expect } from '../../../fixtures';
import {
  ARABIC,
  CASES,
  COL,
  PAYER_COLUMN_BUG,
  SCOPE,
  UTF8_BOM,
  XLSX_SIGNATURE,
  cellAt,
  payerColumns,
  rowFor,
} from '../../../data/networks/arabicPayerExport.data';

/**
 * User story 14303: Include Arabic details and owning payer when exporting the
 * network list.
 * What the exported file says about a network: its Arabic name and
 * description, its owning payer, encoded intact - in CSV and in Excel, with
 * the interface in Arabic.
 *
 * Each case exports its OWN network, owned by a suite payer, with the payer in
 * the top-bar scope so the export (which follows the scope) includes it.
 */
test.describe('US 14303 - Arabic and owning-payer columns', () => {
  test.beforeEach(async ({ languageSwitcher, cleanup }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
  });

  // Bug 20021: the expected result is now that no payer column is exported.
  test(`TC-${CASES.csvColumns.azureId}: should write the Arabic name and Arabic description to CSV, with no payer column, when the list is exported in Arabic`, {
    annotation: PAYER_COLUMN_BUG,
  }, async ({
    networkManagementPage,
    languageSwitcher,
    publishedPayer,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Draft', { payerName: publishedPayer.nameEn, nameAr: ARABIC.name(), descriptionAr: ARABIC.description });
    let code = '';

    await steps.critical('Navigate to the module in Arabic with the owning payer in scope', async () => {
      await networkManagementPage.openListFor(publishedPayer.nameEn);
      code = (await networkManagementPage.readRow(network.name)).code;
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openListFor(publishedPayer.nameEn);
      expect(code).not.toBe('');
    });

    let file!: Awaited<ReturnType<typeof networkManagementPage.exportAndParse>>;
    await steps.step('The CSV downloads and carries the Arabic name and description exactly', async () => {
      file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'csv');
      const row = rowFor(file.parsed, code);
      expect(row, `the export should hold ${code}`).toBeDefined();
      expect(cellAt(file.parsed, row!, COL.nameAr)).toBe(network.nameAr);
      expect(cellAt(file.parsed, row!, COL.descriptionAr)).toBe(ARABIC.description);
    });

    await steps.step('The exported file has no payer column', async () => {
      expect(payerColumns(file.parsed), `payer columns in the export (headers: ${file.parsed.headers.join(' | ')})`).toEqual([]);
    });
  });

  test(`TC-${CASES.excelColumns.azureId}: should write the Arabic name, Arabic description and owning payer to Excel when the list is exported in Arabic`, async ({
    networkManagementPage,
    languageSwitcher,
    publishedPayer,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Draft', { payerName: publishedPayer.nameEn, nameAr: ARABIC.name(), descriptionAr: ARABIC.description });
    let code = '';

    await steps.critical('Navigate to the module in Arabic with the owning payer in scope', async () => {
      await networkManagementPage.openListFor(publishedPayer.nameEn);
      code = (await networkManagementPage.readRow(network.name)).code;
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openListFor(publishedPayer.nameEn);
      expect(code).not.toBe('');
    });

    let row: Record<string, string> | undefined;
    let headers: string[] = [];
    await steps.step('The .xlsx downloads and carries the Arabic name and description exactly', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'excel');
      expect(file.bytes.subarray(0, 2).toString('utf8')).toBe(XLSX_SIGNATURE);
      headers = file.parsed.headers;
      row = rowFor(file.parsed, code);
      expect(row, `the workbook should hold ${code}`).toBeDefined();
      expect(cellAt(file.parsed, row!, COL.nameAr)).toBe(network.nameAr);
      expect(cellAt(file.parsed, row!, COL.descriptionAr)).toBe(ARABIC.description);
      expect(cellAt(file.parsed, row!, COL.payer)).not.toBe('');
    });

    await steps.step('The owning payer column names the network\'s payer', async () => {
      expect(row?.[headers[COL.payer]]).toBe(publishedPayer.nameEn);
    });
  });

  test(`TC-${CASES.encoding.azureId}: should keep Arabic with diacritics and mixed text intact when the list is exported to CSV`, async ({
    networkManagementPage,
    languageSwitcher,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { nameAr: ARABIC.diacriticName(), descriptionEn: ARABIC.mixedText });
    let code = '';

    await steps.critical('Navigate to the module in Arabic', async () => {
      await networkManagementPage.openList();
      code = (await networkManagementPage.readRow(network.name)).code;
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
    });

    await steps.step('The CSV is UTF-8 with a BOM and the Arabic and mixed text read back byte for byte', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'csv');
      expect(file.bytes.subarray(0, 3).toString('hex'), 'a UTF-8 byte-order mark lets Excel read the Arabic').toBe(UTF8_BOM);
      const row = rowFor(file.parsed, code);
      expect(row).toBeDefined();
      expect(cellAt(file.parsed, row!, COL.nameAr), 'diacritics must survive').toBe(network.nameAr);
      expect(cellAt(file.parsed, row!, COL.descriptionEn), 'mixed-script text must survive').toBe(ARABIC.mixedText);
      expect(file.bytes.toString('utf8'), 'no replacement characters (mojibake)').not.toContain('�');
    });
  });

  test(`TC-${CASES.missingArabic.azureId}: should export blank cells without error when a network has no Arabic description`, async ({
    networkManagementPage,
    languageSwitcher,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { descriptionAr: null });
    let code = '';

    await steps.critical('Navigate to the module in Arabic', async () => {
      await networkManagementPage.openList();
      code = (await networkManagementPage.readRow(network.name)).code;
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
    });

    for (const format of ['csv', 'excel'] as const) {
      await steps.step(`The ${format} export completes with a blank Arabic description cell`, async () => {
        const file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, format);
        const row = rowFor(file.parsed, code);
        expect(row, `the export should hold ${code}`).toBeDefined();
        expect(cellAt(file.parsed, row!, COL.descriptionAr), 'a missing Arabic description exports blank').toBe('');
        expect(cellAt(file.parsed, row!, COL.nameAr), 'the Arabic name is still written').toBe(network.nameAr);
      });
    }
  });

  // Bug 20021: the expected result is now that no payer column is exported.
  test(`TC-${CASES.withAndWithoutPayer.azureId}: should export no payer column for either an owned or an unowned network`, {
    annotation: PAYER_COLUMN_BUG,
  }, async ({
    networkManagementPage,
    languageSwitcher,
    publishedPayer,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const owned = await networkIn('Draft', { payerName: publishedPayer.nameEn });
    const unowned = await networkIn('Draft');
    const codes = { owned: '', unowned: '' };
    let file!: Awaited<ReturnType<typeof networkManagementPage.exportAndParse>>;

    await steps.critical('Navigate to the module in Arabic with the payer in scope and export the full list', async () => {
      await networkManagementPage.openListFor(publishedPayer.nameEn);
      codes.owned = (await networkManagementPage.readRow(owned.name)).code;
      codes.unowned = (await networkManagementPage.readRow(unowned.name)).code;
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openListFor(publishedPayer.nameEn);
      file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'csv');
      expect(file.parsed.rows.length).toBeGreaterThan(0);
    });

    await steps.step('Both networks are exported', async () => {
      expect(rowFor(file.parsed, codes.owned), `the export should hold the owned network ${codes.owned}`).toBeDefined();
      expect(rowFor(file.parsed, codes.unowned), `the export should hold the unowned network ${codes.unowned}`).toBeDefined();
    });

    await steps.step('The exported file has no payer column', async () => {
      expect(payerColumns(file.parsed), `payer columns in the export (headers: ${file.parsed.headers.join(' | ')})`).toEqual([]);
    });
  });

  test(`TC-${CASES.excelRtl.azureId}: should open as a clean workbook with right-to-left Arabic when the list is exported to Excel`, async ({
    networkManagementPage,
    languageSwitcher,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { nameAr: ARABIC.name() });
    let code = '';

    await steps.critical('Navigate to the module in Arabic', async () => {
      await networkManagementPage.openList();
      code = (await networkManagementPage.readRow(network.name)).code;
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
    });

    let rtl = false;
    await steps.step('The workbook downloads intact and holds the Arabic name exactly', async () => {
      const file = await networkManagementPage.exportAndParse(SCOPE.allNetworks, 'excel');
      expect(file.bytes.subarray(0, 2).toString('utf8'), 'a valid .xlsx').toBe(XLSX_SIGNATURE);
      const row = rowFor(file.parsed, code);
      expect(row).toBeDefined();
      expect(cellAt(file.parsed, row!, COL.nameAr)).toBe(network.nameAr);
      rtl = file.parsed.rightToLeft;
    });

    await steps.step('The sheet is set to read right-to-left', async () => {
      expect(rtl, 'the worksheet view should be right-to-left for Arabic content').toBe(true);
    });
  });
});
