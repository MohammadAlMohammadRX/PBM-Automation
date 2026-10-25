import type { Download, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from './ConfirmDialog';
import { PAYER_EXPORT, buttonSelector } from '../../constants/ElementIds';

/** The ids an Export control is built from - PAYER_EXPORT and NETWORK_EXPORT both fit. */
export interface ExportMenuIds {
  root: string;
  trigger: string;
  menu: string;
  selected: string;
  all: string;
}
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import { parseCsv, type ParsedCsv } from '../../utils/CsvUtils';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';

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

  /**
   * `ids` defaults to the payer list. The Network list passes NETWORK_EXPORT:
   * the component is shared, so only the namespace differs (2026-10-21).
   */
  constructor(page: Page, private readonly ids: ExportMenuIds = PAYER_EXPORT) {
    this.page = page;
    this.dialog = new ConfirmDialog(page);
  }

  private trigger() {
    return this.page.locator(buttonSelector(this.ids.trigger)).first();
  }

  /** Opens the export menu and asserts it offered both scopes. */
  async open(): Promise<void> {
    Logger.step('Opening the export menu');
    await this.trigger().click();
    await expect(this.page.locator(`#${this.ids.all}`)).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /**
   * Whether the export control is offered at all - the RBAC question.
   *
   * Waits for it rather than reading once: `isVisible()` ignores its timeout
   * option, and a toolbar read the instant a list finishes loading would report
   * a control that is present as withheld - turning a passing permission into a
   * reported defect.
   */
  async isAvailable(): Promise<boolean> {
    return this.trigger()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  async expectAvailable(): Promise<void> {
    await expect(this.trigger()).toBeVisible({ timeout: Timeouts.default });
  }

  async expectDenied(): Promise<void> {
    await expect(this.trigger()).toHaveCount(0, { timeout: Timeouts.default });
  }

  /**
   * Asserts the export is REFUSED, and proves it by trying to run it.
   *
   * WHY THIS IS NOT `expectDenied`. That one asserts the trigger is absent,
   * which is a proxy: a hidden button and a refused export are different
   * claims, and only the second is what an export permission is for. When the
   * control IS offered this runs it, so the report can say whether the data
   * actually left the application - "the file downloaded with 1 row" is a
   * defect a developer can act on; "a locator had count 1" is not.
   */
  async expectExportRefused(): Promise<void> {
    if (!(await this.isAvailable())) return;

    const parsed = await this.exportCsv('all').catch(() => null);
    expect(
      parsed,
      'the export control was offered to a role without export rights, and the export '
      + 'then COMPLETED - the file was produced and downloaded',
    ).toBeNull();
  }

  /**
   * The scopes the menu offers, as their logical id suffixes.
   *
   * Read rather than assumed, because this is exactly what the export-scope
   * story disputes: the sheet expects "all" and "filtered", and the menu
   * offers "selected" and "all". A case that assumed either would report the
   * wrong thing.
   */
  async getOfferedScopes(): Promise<string[]> {
    const prefix = `${this.ids.root}-`;
    const ids = await this.page
      .locator(`#${this.ids.menu} [id^="${prefix}"]`)
      .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).id));
    return ids
      .map((id) => id.slice(prefix.length))
      .filter((suffix) => suffix.length > 0 && suffix !== 'menu' && suffix !== 'trigger');
  }

  /** The labels the menu shows for its scope options. */
  async getScopeLabels(): Promise<string[]> {
    return (await this.page.locator(`#${this.ids.menu}`).allInnerTexts())
      .join(String.fromCharCode(10))
      .split(String.fromCharCode(10))
      .map((label) => label.trim())
      .filter((label) => label.length > 0);
  }

  /**
   * Closes the scope MENU without choosing anything.
   *
   * Not the same as `cancel()`, which dismisses the FORMAT dialog one step
   * later. The menu has no cancel button of its own - it is a popup, closed
   * by pressing Escape - and a case about cancelling the prompt has to close
   * the step it actually opened.
   */
  async cancelMenu(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.page.locator(`#${this.ids.all}`)).toBeHidden({
      timeout: Timeouts.short,
    });
  }

  /**
   * Runs `action` and reports whether a download started.
   *
   * For the cancel case, where the assertion is an ABSENCE. Playwright fires
   * the download event once and does not replay it, so the listener is armed
   * before the action rather than polled afterwards.
   */
  async expectNoDownloadWhile(action: () => Promise<void>): Promise<boolean> {
    const waiting = this.page
      .waitForEvent('download', { timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    await action();
    return waiting;
  }

  /** Chooses a scope, which raises the format dialog. */
  async chooseScope(scope: ExportScope): Promise<void> {
    const id = scope === 'all' ? this.ids.all : this.ids.selected;
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
   * Clicks one format in the dialog, without waiting for a download.
   *
   * `exportAndDownload` arms the download listener around this click, which
   * is right for a successful export. The failure case needs the click on
   * its own: it is asserting that NO file arrives, so it cannot be wrapped
   * in a helper that waits for one.
   */
  async clickFormat(format: 'csv' | 'excel'): Promise<void> {
    await this.dialog.clickAction(format);
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
  /**
   * Exports in either format and returns the file's name and bytes.
   *
   * For the cases about the FILE rather than its rows: the naming convention,
   * and whether an Excel export is a real workbook (a zip beginning "PK") or a
   * corrupt or empty download.
   */
  async exportAndReadBytes(
    scope: ExportScope,
    format: 'csv' | 'excel',
  ): Promise<{ filename: string; bytes: Buffer }> {
    const download = await this.exportAndDownload(scope, format);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return { filename: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
  }

  async exportCsv(scope: ExportScope = 'all'): Promise<ParsedCsv> {
    const download = await this.exportAndDownload(scope, 'csv');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return parseCsv(Buffer.concat(chunks).toString('utf8'));
  }

  // ---- story 04 / 26 additions (network export) ------------------------------

  /**
   * Exports and returns the file PARSED, whichever the format - the network
   * export stories assert on rows, headers and Arabic text in both CSV and
   * Excel, so both come back in the same `{ headers, rows }` shape.
   */
  async exportAndParse(
    scope: ExportScope,
    format: 'csv' | 'excel',
  ): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    const { filename, bytes } = await this.exportAndReadBytes(scope, format);
    const parsed: ParsedXlsx = format === 'csv'
      ? { ...parseCsv(bytes.toString('utf8')), rightToLeft: false }
      : parseXlsx(bytes);
    return { filename, bytes, parsed };
  }

  /**
   * Clicks the trigger `times` times without waiting between clicks, then
   * reports how many scope menus are on screen - the rapid-click case. The
   * clicks are fired unawaited so the menu has no chance to settle between
   * them (the same argument ConfirmDialog.confirmRepeatedly makes).
   */
  async clickTriggerRepeatedly(times: number): Promise<number> {
    Logger.step(`Clicking Export ${times} times in rapid succession`);
    const trigger = this.trigger();
    await Promise.all(Array.from({ length: times }, () => trigger.click({ noWaitAfter: true }).catch(() => undefined)));
    return this.page.locator(`#${this.ids.menu}`).filter({ visible: true }).count();
  }

  /**
   * With the format dialog already open, picks a format and returns the
   * downloaded file - for the cases that step through the prompts one by one.
   * The download listener is armed before the click (see exportAndDownload).
   */
  async chooseFormatAndRead(format: 'csv' | 'excel'): Promise<{ filename: string; bytes: Buffer }> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation }),
      this.dialog.clickAction(format),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return { filename: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
  }

  /** Whether the scope menu is open now. */
  async isMenuOpen(): Promise<boolean> {
    return this.page.locator(`#${this.ids.all}`).isVisible();
  }

  /** Whether the format dialog is on screen. */
  async isFormatDialogOpen(): Promise<boolean> {
    return this.dialog.isVisible();
  }

  /** The format dialog's title and message, as one read. */
  async getFormatDialogText(): Promise<{ title: string; message: string }> {
    return { title: await this.dialog.getTitle(), message: await this.dialog.getMessage() };
  }
}
