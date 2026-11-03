import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { FORMULARY_IMPORT, TOAST, buttonSelector } from '../../constants/ElementIds';
import { BULK_HISTORY_PART, BULK_IMPORT_PART } from '../../constants/formulary/writerAIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** A file to hand to the drop zone's input. */
export interface FormularyUploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** What adding a file answered. */
export interface FormularyUploadAnswer {
  /** HTTP status of the Import* request, -1 when none was sent (refused client-side). */
  status: number;
  text: string;
  /** The endpoint that answered (ImportFormularies / ImportFormularyTiers / ImportFormularyTrades). */
  endpoint: string;
  messages: string[];
}

/**
 * The bulk Import drawer (verified live 2026-11-02): an intro ("Import
 * Formularies from a file in the template format (Export → Export Template).
 * The import starts as soon as the file is added and runs in the background"),
 * Upload history, a drop zone ("Excel (.xlsx) or CSV (.csv), up to 25 MB" - the
 * Trades import takes .xlsx only, "this file has several pages") and Cancel.
 * There is NO Upload button: adding the file starts the import.
 *
 * The list renders it as `formulary-list-bulk-import`, the detail's Tiers and
 * Trades tabs as `formulary-detail-bulk-import` (FORMULARY_IMPORT).
 */
export class FormularyImportDialog {
  constructor(private readonly page: Page, private readonly namespace: string = FORMULARY_IMPORT.list) {}

  private part(suffix: string): Locator {
    return this.page.locator(`#${this.namespace}-${suffix}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.part(FORMULARY_IMPORT.title), 'the Import drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.part(FORMULARY_IMPORT.title).isVisible();
  }

  async getIntro(): Promise<string> {
    return (await this.part(FORMULARY_IMPORT.intro).innerText()).replace(/\s+/g, ' ').trim();
  }

  async getDropHint(): Promise<string> {
    return (await this.part(FORMULARY_IMPORT.dropHint).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The drawer's whole text. */
  async getText(): Promise<string> {
    return (await this.page.locator(`#${this.namespace}`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * The drop zone's file input: a SIBLING of the drop zone with its own id
   * `{namespace}-file` (bundle chunk-VMD4MUM4, 2026-11-02) - looking for it
   * inside the drop zone found nothing and every upload case timed out.
   */
  private fileInput(): Locator {
    return this.part(FORMULARY_IMPORT.file).or(this.page.locator(`#${this.namespace} input[type="file"]`)).first();
  }

  /** The file types the input accepts (its `accept` attribute). */
  async getAccept(): Promise<string> {
    return (await this.fileInput().getAttribute('accept').catch(() => null)) ?? '';
  }

  /**
   * Adds a file (which starts the import) and reports the Import* request's
   * answer and the messages shown - a refused file answers -1 with the
   * drawer's or toast's message.
   */
  async addFile(file: FormularyUploadFile): Promise<FormularyUploadAnswer> {
    Logger.step(`Import: adding "${file.name}" (${file.buffer.length} bytes)`);
    const waiting = this.page
      .waitForResponse((r) => /\/Import(Formularies|FormularyTiers|FormularyTrades)$/.test(new URL(r.url()).pathname), { timeout: Timeouts.default })
      .catch(() => null);
    await this.fileInput().setInputFiles(file);
    const response = await waiting;
    const messages = await this.getMessages();
    return {
      status: response?.status() ?? -1,
      text: response ? await response.text().catch(() => '') : '',
      endpoint: response ? new URL(response.url()).pathname : '',
      messages,
    };
  }

  /** The drawer's own messages and toasts, settled. */
  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`#${this.namespace} [role="alert"], [id^="${this.namespace}-"][id$="-error"], [id^="${this.namespace}-"][id$="-message"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
  }

  /** Opens Upload history (`{scope}-bulk-history`) and returns its text. */
  async openHistory(): Promise<string> {
    await this.part(FORMULARY_IMPORT.historyButton).click();
    const history = this.namespace === FORMULARY_IMPORT.list ? FORMULARY_IMPORT.listHistory : FORMULARY_IMPORT.detailHistory;
    const title = this.page.locator(`#${history}-title`);
    await title.waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return (await this.page.locator(`#${history}`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  // ---- writer A additions (folder 08), ids from the bundle (chunk-VMD4MUM4), not yet verified live ----

  /** Whether the drop zone (the upload control) is rendered. */
  async isDropZoneShown(): Promise<boolean> {
    return this.part(FORMULARY_IMPORT.dropZone).isVisible().catch(() => false);
  }

  /** The file-type / size error under the drop zone (`-file-error`), '' when none. */
  async getFileError(): Promise<string> {
    return (await this.part(BULK_IMPORT_PART.fileError).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The server error box (`-error`), '' when none. */
  async getError(): Promise<string> {
    return (await this.part(BULK_IMPORT_PART.error).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The history drawer's namespace for this import drawer. */
  private historyNamespace(): string {
    return this.namespace === FORMULARY_IMPORT.list ? FORMULARY_IMPORT.listHistory : FORMULARY_IMPORT.detailHistory;
  }

  /**
   * Opens Upload history and reads its table: the text of every row and the
   * ids of every control inside it (the result downloads `-result-csv` /
   * `-result-excel` - anything else, a re-process control for instance, shows up here).
   */
  async readHistoryTable(): Promise<{ text: string; controlIds: string[] }> {
    await this.openHistory();
    const table = this.page.locator(`#${this.historyNamespace()}-${BULK_HISTORY_PART.table}`);
    await table.waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    // The table renders its headers with "Loading…" before the jobs arrive.
    const read = async (): Promise<string> => (await table.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    await expect.poll(read, { timeout: Timeouts.default }).not.toMatch(/loading/i).catch(() => undefined);
    const text = await read();
    const controlIds = await table.locator('button, a').evaluateAll((els) => els.map((e) => e.id || (e as HTMLElement).innerText.trim()));
    return { text, controlIds };
  }

  /**
   * Closes the drawer when an earlier step left it open, so the caller opens a
   * fresh one. It may be closing on its own as that import completes, so a
   * Cancel that finds nothing to click is fine.
   */
  async closeIfOpen(): Promise<void> {
    if (!(await this.isOpen())) return;
    await this.page.locator(buttonSelector(`${this.namespace}-${FORMULARY_IMPORT.cancel}`)).first().click({ timeout: Timeouts.short }).catch(() => undefined);
    await expect(this.part(FORMULARY_IMPORT.title)).toBeHidden({ timeout: Timeouts.default });
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(`${this.namespace}-${FORMULARY_IMPORT.cancel}`)).first().click();
    await expect(this.part(FORMULARY_IMPORT.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
