import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { FORMULARY_IMPORT, TOAST, buttonSelector } from '../../constants/ElementIds';
import { BULK_HISTORY_PART, BULK_IMPORT_PART } from '../../constants/formulary/writerAIds';
import { MEMBER_IMPORT } from '../../constants/member/memberIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** A file to add to the drop zone. */
export interface MemberUploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** What adding a file answered. */
export interface MemberImportAnswer {
  /** HTTP status of ImportMembers, -1 when none was sent (refused client-side: type / size). */
  status: number;
  text: string;
  messages: string[];
}

/**
 * The member Import drawer - the shared bulk component under
 * `member-list-bulk-import` (verified live 2026-11-05): title "Import",
 * intro "Import Members from a file in the template format (Export → Export
 * Template). The import starts as soon as the file is added and runs in the
 * background ...", Upload history (`-history-button` -> `member-list-bulk-history`),
 * the drop zone ("Excel (.xlsx) or CSV (.csv), up to 25 MB. Headers in English
 * or Arabic both work."), the member rules ("Fill in the template to add new
 * records - their codes are generated for you. Fill in the Member Code of an
 * existing member to update them. Rows that changed nothing are skipped.
 * Members are saved straight away - there is no approval step. An Excel file
 * has two pages - Members and Emergency Contacts - linked by the "Document ID"
 * column. A CSV file holds the Members page only. ..."), Cancel. NO Upload
 * button: adding the file starts the import (POST ImportMembers, multipart
 * `file`); progress shows at the bottom of the screen and the member screens
 * lock ("Your member import is still running ...") until it finishes.
 */
export class MemberImportDrawer {
  constructor(private readonly page: Page, private readonly namespace: string = MEMBER_IMPORT.drawer) {}

  private part(suffix: string): Locator {
    return this.page.locator(`#${this.namespace}-${suffix}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.part(FORMULARY_IMPORT.title), 'the Import drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.part(FORMULARY_IMPORT.title).isVisible();
  }

  async closeIfOpen(): Promise<void> {
    if (await this.isOpen().catch(() => false)) await this.cancel().catch(() => undefined);
  }

  async getIntro(): Promise<string> {
    return (await this.part(FORMULARY_IMPORT.intro).innerText()).replace(/\s+/g, ' ').trim();
  }

  async getDropHint(): Promise<string> {
    return (await this.part(FORMULARY_IMPORT.dropHint).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The drawer's whole text (intro, rules, hints). */
  async getText(): Promise<string> {
    return (await this.page.locator(`#${this.namespace}`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The drop zone's file input (`{namespace}-file`, beside the drop zone). */
  private fileInput(): Locator {
    return this.part(FORMULARY_IMPORT.file).or(this.page.locator(`#${this.namespace} input[type="file"]`)).first(); // locator-exception: the file input may carry no id; it is the drawer's only file input.
  }

  async getAccept(): Promise<string> {
    return (await this.fileInput().getAttribute('accept').catch(() => null)) ?? '';
  }

  /** Adds a file (which starts the import); reports ImportMembers' answer and the messages shown. */
  async addFile(file: MemberUploadFile): Promise<MemberImportAnswer> {
    Logger.step(`Member import: adding "${file.name}" (${file.buffer.length} bytes)`);
    const waiting = this.page
      .waitForResponse((r) => new URL(r.url()).pathname === ApiEndpoints.memberImport, { timeout: Timeouts.default })
      .catch(() => null);
    await this.fileInput().setInputFiles(file);
    const response = await waiting;
    return {
      status: response?.status() ?? -1,
      text: response ? await response.text().catch(() => '') : '',
      messages: await this.getMessages(),
    };
  }

  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${this.namespace}-"][id$="-error"], #${this.namespace}-${BULK_IMPORT_PART.error}`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
  }

  async getFileError(): Promise<string> {
    return (await this.part(BULK_IMPORT_PART.fileError).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Opens Upload history (`member-list-bulk-history`) and returns its text. */
  async openHistory(): Promise<string> {
    await this.part(FORMULARY_IMPORT.historyButton).click();
    await this.page.locator(`#${MEMBER_IMPORT.history}-${BULK_HISTORY_PART.title}`).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return (await this.page.locator(`#${MEMBER_IMPORT.history}`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The history table's rows (`member-list-bulk-history-table-row-{id}`), by cell key (filename, totalrows, succeededrows, failedrows, status ...). */
  async readHistoryRows(): Promise<Record<string, string>[]> {
    const prefix = `${MEMBER_IMPORT.history}-${BULK_HISTORY_PART.table}-row-`;
    return this.page.locator(`tr[id^="${prefix}"]`).evaluateAll((trs) => trs.map((tr) => {
      const out: Record<string, string> = { rowId: tr.id };
      tr.querySelectorAll('[id*="-cell-"]').forEach((cell) => { out[cell.id.split('-cell-')[1]] = (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim(); });
      return out;
    }));
  }

  /** The Upload history panel's text, once its rows (not "Loading…") are shown. */
  async readHistoryText(): Promise<string> {
    const panel = this.page.locator(`#${MEMBER_IMPORT.history}`).first();
    await expect.poll(async () => (await panel.innerText().catch(() => '')).includes('Loading'), { timeout: Timeouts.default }).toBe(false).catch(() => undefined);
    return (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * Downloads a history row's result (error) file. The buttons sit in the row's
   * actions cell with ids `member-list-bulk-history-result-{csv|excel}-{operationId}`
   * (verified live 2026-11-05 - the id ENDS with the operation id, not with "-result-csv").
   */
  async downloadResult(rowId: string, format: 'csv' | 'excel' = 'csv'): Promise<{ filename: string; bytes: Buffer }> {
    const download = this.page.waitForEvent('download', { timeout: Timeouts.default });
    const part = format === 'csv' ? BULK_HISTORY_PART.resultCsv : BULK_HISTORY_PART.resultExcel;
    await this.page.locator(`#${rowId}`).locator(`[id^="${MEMBER_IMPORT.history}-${part}-"]`).first().click();
    const file = await download;
    const path = await file.path();
    return { filename: file.suggestedFilename(), bytes: path ? (await import('fs')).readFileSync(path) : Buffer.alloc(0) };
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(`${this.namespace}-${FORMULARY_IMPORT.cancel}`)).first().click();
    await expect(this.part(FORMULARY_IMPORT.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
