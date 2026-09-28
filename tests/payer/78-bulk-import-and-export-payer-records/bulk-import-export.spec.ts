import { test, expect } from '../../../fixtures';
import { Logger } from '../../../utils/Logger';
import type { CsvRow } from '../../../utils/CsvUtils';
import { REQUIRED_EXPORT_COLUMNS } from '../../../data/payers/exportPayers.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import {
  NEEDS_BULK_IMPORT,
  NEEDS_IMPORT_TEMPLATE,
  TOOLBAR_ACTIONS_OBSERVED,
} from '../../../data/payers/bulkImportExport.data';

/**
 * User story: Bulk Import and Export Payer Records (Azure US 16218).
 *
 * THE STORY IS HALF BUILT - see bulkImportExport.data.ts. Export is real and
 * these cases use it; Bulk Import does not exist, so TC-169 asserts its
 * presence and FAILS (the finding) and the ten cases that depend on uploading
 * a file report BLOCKED behind it.
 *
 * These cases were written before Azure had issued ids for them, against the
 * local ids the 2026-09-27 sheet carried, and were restamped to their Azure
 * ids (16430-16443) from the 2026-09-28 sheet.
 */
test.describe('Bulk import and export payer records - the import half', () => {
  test('16430: should offer a Bulk Import that accepts a file of new payer records', async ({
    payerManagementPage,
    page,
    steps,
  }) => {
    let toolbarIds: string[] = [];
    let fileInputs = 0;

    await steps.critical('Open the payer list', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
      toolbarIds = await page
        .locator('[id]') // locator-exception: the case asks what the toolbar offers, so it cannot name the id it is looking for
        .evaluateAll((elements) => elements.map((element) => element.id).filter(Boolean));
      fileInputs = await page
        .locator('input[type="file"]') // locator-exception: a file input is what Bulk Import would add, and it has no id to name yet
        .count();
      Logger.info(`the list offers ${toolbarIds.length} identified elements, ${fileInputs} file input(s)`);
    });

    // THE FINDING. This is the only import case that can be observed today,
    // and it is expected to fail: the story asks for a Bulk Import and the
    // module has none. The moment one ships, this passes and the ten BLOCKED
    // cases below can be written against it.
    await steps.step('A Bulk Import control is on the payer list', async () => {
      const importControls = toolbarIds.filter((id) => /import|upload|bulk|template/i.test(id));
      // Either route counts: a named import control, or the file input one
      // would have to place. Neither being present is the absence itself.
      const reachable = importControls.length + fileInputs;
      expect(
        reachable,
        'the story requires a Bulk Import, and the payer list offers no way into one: '
          + `${importControls.length} control(s) matching import, upload, bulk or template and `
          + `${fileInputs} file input(s). When last probed its actions were `
          + `[${TOOLBAR_ACTIONS_OBSERVED.join(', ')}]. If this now passes, the feature has landed `
          + 'and the ten BLOCKED cases in this story can be implemented.',
      ).toBeGreaterThan(0);
    });
  });

  for (const [azureId, what] of [
    ['16432', 'update existing payer records from a file matched on Payer ID'],
    ['16433', 'accept a file at the maximum record count and refuse one record more'],
    ['16434', 'import the valid rows of a mixed file and report the invalid ones separately'],
    ['16436', 'put a bulk-imported payer through the same draft-to-approval workflow'],
    ['16435', 'reject a row that leaves a mandatory field blank, naming the field'],
    ['16437', 'reject a row whose field format is invalid, naming the field'],
    ['16439', 'report two rows carrying the same Payer ID within one file'],
    ['16440', 'report that a header-only file holds no records to import'],
    ['16441', 'reject an unsupported or corrupted file with a message saying which'],
    ['16442', 'survive a cancelled upload, a navigation away mid-processing and a repeated file'],
  ] as const) {
    test(`${azureId}: should ${what}`, async ({ steps }) => {
      steps.blocked(NEEDS_BULK_IMPORT);
      // steps.blocked() does not narrow the type for the compiler.
      return;
    });
  }
});

/**
 * The export half, which is real.
 */
test.describe('Bulk import and export payer records - the export half', () => {
  test('16431: should export the payer records as a file that can be read back', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    test.slow();
    let rows: CsvRow[] = [];
    let headers: string[] = [];

    await steps.critical('Export the payer records', async () => {
      await payerManagementPage.open();
      await exportMenu.expectAvailable();
      const parsed = await exportMenu.exportCsv('all');
      headers = parsed.headers;
      rows = parsed.rows;
    });

    // A file that downloads but holds nothing - a header row and no data, or a
    // byte count with no parseable structure - satisfies "a file was produced"
    // and is useless to whoever asked for it.
    await steps.step('The file carries the expected columns', async () => {
      const missing = REQUIRED_EXPORT_COLUMNS.filter((column) => !headers.includes(column));
      expect(
        missing,
        `the export should carry every required column; these were absent: ${missing.join(', ')}. `
          + `The file's headers were: ${headers.join(', ')}`,
      ).toEqual([]);
    });

    await steps.step('And it carries the records themselves, not just headers', async () => {
      expect(
        rows.length,
        'an export of the register should hold at least one payer row beneath its headers',
      ).toBeGreaterThan(0);
    });
  });

  test('16438: should withhold the export from a role without the right', async ({
    payerManagementPage,
    exportMenu,
    shapedNonAdmin,
    steps,
  }) => {
    test.slow();
    let session!: ShapedSession;

    // THE CONTROL. "The export is not offered" proves nothing unless it is
    // offered to somebody - a payer list that rendered no toolbar at all would
    // satisfy the second half on its own.
    await steps.critical('As an administrator the export is offered', async () => {
      await payerManagementPage.open();
      await exportMenu.expectAvailable();
    });

    await steps.critical('Sign in as a role without the export right', async () => {
      session = await shapedNonAdmin({ without: ['exportPayers'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    // The import half of this case cannot be checked: there is no Bulk Import
    // control to withhold. When one exists, add the same assertion for it here.
    await steps.step('That role is refused the export', () => session.exportMenu.expectExportRefused());
  });

  test('16443: should export the same columns, in the same order, as the import template', async ({
    steps,
  }) => {
    steps.blocked(NEEDS_IMPORT_TEMPLATE);
    // steps.blocked() does not narrow the type for the compiler.
    return;
  });
});
