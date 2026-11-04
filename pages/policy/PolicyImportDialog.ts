import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { FORMULARY_IMPORT, POLICY_IMPORT, TOAST, buttonSelector } from '../../constants/ElementIds';
import { BULK_IMPORT_PART } from '../../constants/formulary/writerAIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import type { PolicyUploadFile } from '../../utils/PolicyProvisioning';

/** What adding a file answered. */
export interface PolicyImportAnswer {
  /** HTTP status of the Import* request, -1 when none was sent (refused client-side). */
  status: number;
  text: string;
  /** ImportPolicies / ImportPolicyMembers / ImportPolicyNetworks. */
  endpoint: string;
  messages: string[];
}

/**
 * The bulk Import drawer - the shared component (as Formulary's), verified live
 * 2026-11-03 under `policy-list-bulk-import`: "Import Policies from a file in
 * the template format (Export → Export Template). The import starts as soon as
 * the file is added ...", Upload history, the drop zone ("Excel (.xlsx) or CSV
 * (.csv), up to 25 MB. Headers in English or Arabic both work."), Cancel. NO
 * Upload button: adding the file starts the import. The Members / Network
 * tabs open theirs as `policy-detail-bulk-import`. Upload history is
 * `{scope}-bulk-history` (File, Record type, Record, Uploaded by / on, Total,
 * Succeeded, Failed, Status, Actions; filter "All record types").
 */
export class PolicyImportDialog {
  constructor(private readonly page: Page, private readonly namespace: string = POLICY_IMPORT.list) {}

  private part(suffix: string): Locator {
    return this.page.locator(`#${this.namespace}-${suffix}`);
  }

  private historyNamespace(): string {
    return this.namespace === POLICY_IMPORT.list ? POLICY_IMPORT.listHistory : POLICY_IMPORT.detailHistory;
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

  async getText(): Promise<string> {
    return (await this.page.locator(`#${this.namespace}`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The drop zone's file input (`{namespace}-file`, beside the drop zone). */
  private fileInput(): Locator {
    return this.part(FORMULARY_IMPORT.file).or(this.page.locator(`#${this.namespace} input[type="file"]`)).first();
  }

  async getAccept(): Promise<string> {
    return (await this.fileInput().getAttribute('accept').catch(() => null)) ?? '';
  }

  /** Adds a file (which starts the import); reports the Import* answer and the messages shown. */
  async addFile(file: PolicyUploadFile): Promise<PolicyImportAnswer> {
    Logger.step(`Policy import: adding "${file.name}" (${file.buffer.length} bytes)`);
    const waiting = this.page
      .waitForResponse((r) => /\/Import(Policies|PolicyMembers|PolicyNetworks)$/.test(new URL(r.url()).pathname), { timeout: Timeouts.default })
      .catch(() => null);
    await this.fileInput().setInputFiles(file);
    const response = await waiting;
    return {
      status: response?.status() ?? -1,
      text: response ? await response.text().catch(() => '') : '',
      endpoint: response ? new URL(response.url()).pathname : '',
      messages: await this.getMessages(),
    };
  }

  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`#${this.namespace} [role="alert"], [id^="${this.namespace}-"][id$="-error"], [id^="${this.namespace}-"][id$="-message"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
  }

  async getFileError(): Promise<string> {
    return (await this.part(BULK_IMPORT_PART.fileError).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Opens Upload history and returns its text. */
  async openHistory(): Promise<string> {
    await this.part(FORMULARY_IMPORT.historyButton).click();
    const history = this.historyNamespace();
    await this.page.locator(`#${history}-title`).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return (await this.page.locator(`#${history}`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The history table's rows (`{history}-table-row-{id}`), by cell key. */
  async readHistoryRows(): Promise<Record<string, string>[]> {
    const prefix = `${this.historyNamespace()}-table-row-`;
    return this.page.locator(`tr[id^="${prefix}"]`).evaluateAll((trs) => trs.map((tr) => {
      const out: Record<string, string> = { rowId: tr.id };
      tr.querySelectorAll('[id*="-cell-"]').forEach((cell) => { out[cell.id.split('-cell-')[1]] = (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim(); });
      return out;
    }));
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(`${this.namespace}-${FORMULARY_IMPORT.cancel}`)).first().click();
    await expect(this.part(FORMULARY_IMPORT.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
