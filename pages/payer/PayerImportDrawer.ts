import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { FORMULARY_IMPORT, TOAST, buttonSelector } from '../../constants/ElementIds';
import { BULK_HISTORY_PART, BULK_IMPORT_PART } from '../../constants/formulary/writerAIds';
import { BULK_HISTORY_CELL, BULK_UPLOAD_TOAST, PAYER_IMPORT } from '../../constants/payer/payerImportIds';
import { parseCsv, type ParsedCsv } from '../../utils/CsvUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** A file to add to the drop zone. */
export interface ImportFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** What adding a file answered. */
export interface ImportAnswer {
  /** HTTP status of ImportPayers, -1 when none was sent (refused before upload: type / size). */
  status: number;
  text: string;
  /** The bulk operation started, '' when none. */
  operationId: string;
  /** Messages on screen right after (drawer errors, toasts). */
  messages: string[];
}

/** One Upload history row, by cell key. */
export type HistoryRow = Partial<Record<keyof typeof BULK_HISTORY_CELL, string>>;

const IMPORT_PATH = '/api/Payers/ImportPayers';

/**
 * The payer list's Import drawer (`payer-list-bulk-import`) and its Upload
 * history - verified live 2026-11-24. Adding a file starts the import; the
 * drawer closes and the bottom "Upload complete" panel reports
 * "Succeeded: n Failed: n" per operation (constants/payer/payerImportIds.ts).
 */
export class PayerImportDrawer {
  constructor(private readonly page: Page) {}

  private part(suffix: string): Locator {
    return this.page.locator(`#${PAYER_IMPORT.drawer}-${suffix}`);
  }

  /** The list's Import control (`payer-list-import-trigger`). */
  trigger(): Locator {
    return this.page.locator(buttonSelector(PAYER_IMPORT.trigger)).first();
  }

  async isOffered(): Promise<boolean> {
    return this.trigger().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Opens the drawer from the payer list (the list must be open). */
  async open(): Promise<void> {
    if (await this.isOpen()) return;
    await this.trigger().click();
    await expect(this.part(FORMULARY_IMPORT.title), 'the Import drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.part(FORMULARY_IMPORT.title).isVisible().catch(() => false);
  }

  /** The drawer's whole text (intro, drop hint, rules). */
  async getText(): Promise<string> {
    return (await this.page.locator(`#${PAYER_IMPORT.drawer}`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The drop zone's file control. */
  fileInput(): Locator {
    return this.part(FORMULARY_IMPORT.file);
  }

  async hasUploadControl(): Promise<boolean> {
    return (await this.fileInput().count()) > 0 && (await this.part(FORMULARY_IMPORT.dropZone).isVisible().catch(() => false));
  }

  /** Adds a file (which starts the import) and reports ImportPayers' answer and the messages shown. */
  async addFile(file: ImportFile): Promise<ImportAnswer> {
    Logger.step(`Payer import: adding "${file.name}" (${file.buffer.length} bytes)`);
    await this.open();
    const waiting = this.page
      .waitForResponse((r) => new URL(r.url()).pathname === IMPORT_PATH, { timeout: Timeouts.queuePropagation })
      .catch(() => null);
    await this.fileInput().setInputFiles(file);
    // A file refused before upload (type / size) never sends the request - do not wait out the long timeout for it.
    const refused = this.part(BULK_IMPORT_PART.fileError).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => null).catch(() => undefined);
    const response = await Promise.race([waiting, refused.then((r) => (r === null ? null : waiting))]);
    const text = response ? await response.text().catch(() => '') : '';
    let operationId = '';
    try {
      const payload = (JSON.parse(text) as { payload?: Record<string, unknown> }).payload ?? {};
      operationId = String(payload.operationId ?? '');
    } catch { /* not JSON */ }
    return { status: response?.status() ?? -1, text, operationId, messages: await this.getMessages() };
  }

  /** Visible drawer errors (file error, server error box) and toasts. */
  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page
        .locator(`#${PAYER_IMPORT.drawer}-${BULK_IMPORT_PART.fileError}, #${PAYER_IMPORT.drawer}-${BULK_IMPORT_PART.error}`)
        .filter({ visible: true })
        .allInnerTexts()
        .catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
    });
  }

  /** The bottom panel's entry for an operation, once it reports its counts ('' when it never does). */
  async summaryOf(operationId: string, timeoutMs = Timeouts.queuePropagation): Promise<string> {
    const item = this.page.locator(`#${BULK_UPLOAD_TOAST.itemPrefix}${operationId}`);
    const read = async (): Promise<string> => (await item.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    await expect.poll(read, { timeout: timeoutMs }).toMatch(/Succeeded:\s*\d+.*Failed:\s*\d+/i).catch(() => undefined);
    return read();
  }

  /** Every alert / message on screen now (the bulk panel announces "Completed <file>: 3 of 3 rows imported, 0 failed."). */
  async alertsShown(): Promise<string[]> {
    return (await this.page.locator('[role="alert"], .p-message, .p-inline-message, .p-toast-message').allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter((t) => t !== '');
  }

  /** The bottom panel's whole text ('' when it is not shown). */
  async panelText(): Promise<string> {
    return (await this.page.locator(`#${BULK_UPLOAD_TOAST.list}`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Opens Upload history (opening the drawer first when needed). */
  async openHistory(): Promise<void> {
    await this.open();
    await this.part(FORMULARY_IMPORT.historyButton).click();
    await this.page.locator(`#${PAYER_IMPORT.history}-${BULK_HISTORY_PART.title}`).waitFor({ state: 'visible', timeout: Timeouts.default });
    await expect.poll(async () => this.page.locator(`tr[id^="${PAYER_IMPORT.history}-${BULK_HISTORY_PART.table}-row-"]`).count(), { timeout: Timeouts.default }).toBeGreaterThan(0).catch(() => undefined);
  }

  /** An operation's Upload history row, by cell ({} when it is not listed on the first page). */
  async historyRow(operationId: string): Promise<HistoryRow> {
    const row = this.page.locator(`#${PAYER_IMPORT.history}-${BULK_HISTORY_PART.table}-row-${operationId}`);
    if (!(await row.isVisible().catch(() => false))) return {};
    const out: HistoryRow = {};
    for (const [key, cell] of Object.entries(BULK_HISTORY_CELL) as [keyof typeof BULK_HISTORY_CELL, string][]) {
      out[key] = (await row.locator(`[id$="-cell-${cell}"]`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    }
    return out;
  }

  /** Downloads an operation's result file (CSV) from Upload history and returns it parsed; null when it offers none. */
  async downloadResult(operationId: string): Promise<ParsedCsv | null> {
    const button = this.page.locator(`#${PAYER_IMPORT.history}-${BULK_HISTORY_PART.resultCsv}-${operationId}`);
    if (!(await button.isVisible().catch(() => false))) return null;
    const download = this.page.waitForEvent('download', { timeout: Timeouts.default });
    await button.click();
    const file = await download;
    const chunks: Buffer[] = [];
    for await (const chunk of await file.createReadStream()) chunks.push(Buffer.from(chunk));
    return parseCsv(Buffer.concat(chunks).toString('utf8'));
  }

  /** Closes Upload history and the drawer, whichever are open. */
  async closeAll(): Promise<void> {
    for (const id of [`${PAYER_IMPORT.history}-close`, `${PAYER_IMPORT.drawer}-close`]) {
      const button = this.page.locator(buttonSelector(id)).first();
      if (await button.isVisible().catch(() => false)) await button.click().catch(() => undefined);
    }
  }

  /** The drawer's Cancel. */
  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(`${PAYER_IMPORT.drawer}-${FORMULARY_IMPORT.cancel}`)).first().click();
    await expect(this.part(FORMULARY_IMPORT.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
