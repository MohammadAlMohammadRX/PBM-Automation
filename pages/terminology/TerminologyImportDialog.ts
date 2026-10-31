import * as fs from 'fs';
import * as path from 'path';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { TERMINOLOGY_IMPORT_DIALOG, TOAST, buttonSelector } from '../../constants/ElementIds';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import { parseJson } from '../../utils/TerminologyProvisioning';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** A file to hand to the upload input. */
export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** What the Upload button answered. */
export interface UploadAnswer {
  /** HTTP status of UploadTerminologyImport, -1 when nothing was sent. */
  status: number;
  /** The import job the server queued, when it queued one. */
  jobId: string | null;
  jobStatus: string;
  messages: string[];
  text: string;
}

/**
 * The "Upload Terminology Data" drawer: Download Excel Template, a file input
 * (Excel .xlsx only), the parse message ("3 row(s) parsed.", "The file has
 * headers but no data rows. ..."), Upload and Cancel. The upload is queued as a
 * background job (UploadTerminologyImport -> `{ jobId, status: "Pending" }`).
 */
export class TerminologyImportDialog {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(TERMINOLOGY_IMPORT_DIALOG.title), 'the Upload Data drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async getText(): Promise<string> {
    return (await this.byId(TERMINOLOGY_IMPORT_DIALOG.root).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Downloads the Excel template and returns it parsed, with its file name. */
  async downloadTemplate(): Promise<{ filename: string; parsed: ParsedXlsx }> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation }),
      this.page.locator(buttonSelector(TERMINOLOGY_IMPORT_DIALOG.template)).first().click(),
    ]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    return { filename: download.suggestedFilename(), parsed: parseXlsx(Buffer.concat(chunks)) };
  }

  /** Chooses a file for upload and returns the parse message the drawer shows. */
  async chooseFile(file: UploadFile): Promise<string> {
    Logger.step(`Choosing upload file "${file.name}" (${file.buffer.length} bytes)`);
    await this.byId(TERMINOLOGY_IMPORT_DIALOG.file).setInputFiles(file);
    return this.getFileMessage();
  }

  /** Chooses a file already on disk. */
  async chooseFileFromDisk(filePath: string): Promise<string> {
    return this.chooseFile({ name: path.basename(filePath), mimeType: 'application/octet-stream', buffer: fs.readFileSync(filePath) });
  }

  /** The drawer's own message about the chosen file, '' when none shows. */
  async getFileMessage(): Promise<string> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.byId(TERMINOLOGY_IMPORT_DIALOG.root).locator(`#${TERMINOLOGY_IMPORT_DIALOG.message}, [role="alert"], small`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const parsed = await this.byId(TERMINOLOGY_IMPORT_DIALOG.root).getByText(/row\(s\) parsed/i).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...parsed].map((t) => t.trim()).filter((t) => t !== '');
    }).then((messages) => messages.join(' | '));
  }

  async isUploadEnabled(): Promise<boolean> {
    return this.page.locator(buttonSelector(TERMINOLOGY_IMPORT_DIALOG.upload)).first().isEnabled();
  }

  /** Clicks Upload and reports what the server answered and the screen said. */
  async upload(): Promise<UploadAnswer> {
    Logger.step('Upload Data: Upload');
    const waiting = this.page
      .waitForResponse((response) => new URL(response.url()).pathname.endsWith(ApiEndpoints.terminologyUpload), { timeout: Timeouts.short })
      .catch(() => null);
    await this.page.locator(buttonSelector(TERMINOLOGY_IMPORT_DIALOG.upload)).first().click({ timeout: Timeouts.short }).catch(() => undefined);
    const response = await waiting;
    const text = response === null ? '' : await response.text().catch(() => '');
    const payload = parseJson<{ payload?: { jobId?: string; status?: string } }>(text)?.payload;
    const messages = await WaitUtils.settleMessages(async () => {
      const own = await this.byId(TERMINOLOGY_IMPORT_DIALOG.root).locator(`#${TERMINOLOGY_IMPORT_DIALOG.message}, [role="alert"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
    return { status: response?.status() ?? -1, jobId: payload?.jobId ?? null, jobStatus: payload?.status ?? '', messages, text };
  }

  async isOpen(): Promise<boolean> {
    return this.byId(TERMINOLOGY_IMPORT_DIALOG.title).isVisible();
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(TERMINOLOGY_IMPORT_DIALOG.cancel)).first().click();
    await expect(this.byId(TERMINOLOGY_IMPORT_DIALOG.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
