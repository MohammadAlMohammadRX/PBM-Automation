import type { Download, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from './ConfirmDialog';
import { PAYER_EXPORT, buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import { parseCsv, type ParsedCsv } from '../../utils/CsvUtils';

/** Which rows an export covers. */
export type ExportScope = 'all' | 'selected';

/**
 * The payer list's Export control.
 *
 * TWO STEPS, and this is the part that is easy to get wrong: the toolbar
 * trigger opens a menu offering "Selected Export" / "Export All Data", and only
 * after choosing one does the shared confirmation dialog appear asking for a
 * FORMAT. VERIFIED against the live list - a test that clicks "Export All Data"
 * and waits for a download waits out its whole timeout, because no file is
 * produced until a format is picked.
 *
 * The download listener is armed BEFORE the format is clicked. Playwright's
 * download event fires once and is not replayed, so attaching the wait
 * afterwards is a race that passes on a slow machine and fails on a fast one.
 * That is also why ConfirmDialog.clickAction deliberately does not wait for the
 * dialog to close.
 *
 * Lives in `components` rather than under `payer` because the ids are the only
 * payer-specific part: role administration carries the same
 * `{screen}-export-trigger` control, so a future story points this at another
 * screen instead of copying it.
 */
export class ExportMenu {
  private readonly page: Page;
  private readonly dialog: ConfirmDialog;

  constructor(page: Page) {
    this.page = page;
    this.dialog = new ConfirmDialog(page);
  }

  private trigger() {
    return this.page.locator(buttonSelector(PAYER_EXPORT.trigger)).first();
  }

  /** Opens the export menu and asserts it offered both scopes. */
  async open(): Promise<void> {
    Logger.step('Opening the export menu');
    await this.trigger().click();
    await expect(this.page.locator(`#${PAYER_EXPORT.all}`)).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /** Whether the export control is offered at all - the RBAC question. */
  async isAvailable(): Promise<boolean> {
    return this.trigger()
      .isVisible({ timeout: Timeouts.short })
      .catch(() => false);
  }

  async expectAvailable(): Promise<void> {
    await expect(this.trigger()).toBeVisible({ timeout: Timeouts.default });
  }

  async expectDenied(): Promise<void> {
    await expect(this.trigger()).toHaveCount(0, { timeout: Timeouts.default });
  }

  /** Chooses a scope, which raises the format dialog. */
  async chooseScope(scope: ExportScope): Promise<void> {
    const id = scope === 'all' ? PAYER_EXPORT.all : PAYER_EXPORT.selected;
    Logger.step(`Choosing export scope "${scope}"`);
    await this.page.locator(`#${id}`).click();
    await this.dialog.waitForVisible();
  }

  /** The formats the dialog offers, e.g. `['cancel', 'csv', 'excel']`. */
  async getOfferedFormats(): Promise<string[]> {
    return this.dialog.getActionKeys();
  }

  async expectFormatChoiceOffered(): Promise<void> {
    const offered = await this.getOfferedFormats();
    expect(offered).toContain('csv');
    expect(offered).toContain('excel');
  }

  /**
   * Dismisses the format dialog without exporting.
   *
   * Needed by the case that asserts WHICH formats are offered without picking
   * one: leaving the dialog standing would have the next navigation tear it
   * down, and BasePage treats an unexpected open dialog as a problem worth
   * reporting.
   */
  async cancel(): Promise<void> {
    await this.dialog.cancel();
  }
  /**
   * Runs a whole export and hands back the downloaded file.
   *
   * Returns the Download rather than a path so the caller can assert on the
   * suggested FILENAME as well as the contents - the export names its file
   * `PayerList_<timestamp>.csv`, which is itself part of what a reviewer checks.
   */
  async exportAndDownload(scope: ExportScope, format: 'csv' | 'excel'): Promise<Download> {
    await this.open();
    await this.chooseScope(scope);
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation }),
      this.dialog.clickAction(format),
    ]);
    Logger.step(`Export downloaded as "${download.suggestedFilename()}"`);
    return download;
  }

  /**
   * Exports as CSV and returns the parsed file.
   *
   * CSV rather than Excel for the licence-number check on purpose: the
   * assertion is about a column's VALUES, and reading those out of a .xlsx
   * would mean adding a spreadsheet parser to the framework to learn nothing
   * more than the CSV already tells us. The Excel option is still asserted as
   * being OFFERED.
   */
  async exportCsv(scope: ExportScope = 'all'): Promise<ParsedCsv> {
    const download = await this.exportAndDownload(scope, 'csv');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return parseCsv(Buffer.concat(chunks).toString('utf8'));
  }
}
