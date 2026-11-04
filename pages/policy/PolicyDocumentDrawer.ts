import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { POLICY_DOCUMENT_DRAWER, POLICY_DOCUMENT_ERROR, TOAST, buttonSelector, type PolicyDocumentField } from '../../constants/ElementIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import type { PolicyUploadFile } from '../../utils/PolicyProvisioning';

/** The drawer's fields; a key left out is not touched. */
export interface DocumentInput {
  title?: string;
  /** Rider Addition, Coverage Change, Member Change, Premium Adjustment, Other. */
  type?: string;
  /** `DD/MM/YYYY` (policyDayText). */
  effectiveDate?: string;
  description?: string;
  attachment?: PolicyUploadFile;
}

/** What Save answered (status -1 = nothing sent), the body sent and the messages. */
export interface DocumentSaveAnswer {
  status: number;
  text: string;
  body: Record<string, unknown> | null;
  /** UploadFile's status when a file was attached (-1 when none). */
  uploadStatus: number;
  messages: string[];
}

/**
 * The Add Documentation drawer (`endorsement-form-drawer`), verified live
 * 2026-11-03: Title (required; "e.g. Rider addition — dental coverage"),
 * Document Type (required), Effective Date (`DD/MM/YYYY`, a date picker),
 * Description (required, maxlength 2000), Attachment ("Optional: PDF, Word, or
 * image, up to 10 MB.", accept ".pdf,.doc,.docx,image/*", with Remove), Cancel /
 * Save. An attachment is uploaded when CHOSEN (FileUpload/UploadFile, multipart
 * File + EntityName "PolicyEndorsement" -> fileUri); Save sends
 * CreatePolicyEndorsement with the uri, name, type and size.
 * Live: an EMPTY Save showed "This field is required." under Title, Type and
 * Description but NOT under the Effective Date (it defaulted to today).
 */
export class PolicyDocumentDrawer {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(POLICY_DOCUMENT_DRAWER.title), 'the Add Documentation drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(POLICY_DOCUMENT_DRAWER.title).isVisible();
  }

  async getText(): Promise<string> {
    return (await this.byId(POLICY_DOCUMENT_DRAWER.root).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async typeTitle(value: string): Promise<void> {
    await this.byId(POLICY_DOCUMENT_DRAWER.titleInput).fill(value);
  }

  async typeDescription(value: string): Promise<void> {
    await this.byId(POLICY_DOCUMENT_DRAWER.description).fill(value);
  }

  /** Types the effective date key by key and commits it with Enter (the picker ignores fill). */
  async typeEffectiveDate(value: string): Promise<void> {
    const input = this.byId(POLICY_DOCUMENT_DRAWER.effectiveDate);
    await input.click();
    await input.press('ControlOrMeta+a');
    if (value === '') await input.press('Delete');
    else await input.pressSequentially(value);
    await input.press('Enter');
  }

  async chooseType(label: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(POLICY_DOCUMENT_DRAWER.type), label);
  }

  async getTypeOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(POLICY_DOCUMENT_DRAWER.type));
  }

  async getValue(field: 'title' | 'description' | 'effectiveDate'): Promise<string> {
    const id = field === 'title' ? POLICY_DOCUMENT_DRAWER.titleInput : field === 'description' ? POLICY_DOCUMENT_DRAWER.description : POLICY_DOCUMENT_DRAWER.effectiveDate;
    return this.byId(id).inputValue();
  }

  async getMaxLength(field: 'title' | 'description'): Promise<number | null> {
    const raw = await this.byId(field === 'title' ? POLICY_DOCUMENT_DRAWER.titleInput : POLICY_DOCUMENT_DRAWER.description).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async getAccept(): Promise<string> {
    return (await this.byId(POLICY_DOCUMENT_DRAWER.attachment).getAttribute('accept')) ?? '';
  }

  /**
   * The attachment's own error ("The attachment must be a PDF, Word document, or
   * image." / "... must not exceed 10 MB."). Unlike the other field errors it
   * carries NO id (live 2026-11-03): it is the drawer's only id-less field error.
   */
  private attachmentError(): Locator {
    // locator-exception: the file error is rendered without an id; the drawer's only `.pbm-field-error` lacking one.
    return this.byId(POLICY_DOCUMENT_DRAWER.root).locator('.pbm-field-error:not([id])').first();
  }

  /** Chooses a file (uploaded at once); returns UploadFile's status (-1 when the screen refused it before uploading). */
  async attach(file: PolicyUploadFile): Promise<number> {
    Logger.step(`Documentation: attaching "${file.name}" (${file.buffer.length} bytes)`);
    const answered = this.page.waitForResponse((r) => /\/FileUpload\/UploadFile$/.test(new URL(r.url()).pathname), { timeout: Timeouts.default }).catch(() => null);
    // A refused file (type / size) is never uploaded: its error ends the wait instead of the timeout (2026-11-04 triage).
    const refusedOnScreen = this.attachmentError().waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => null, () => null);
    await this.byId(POLICY_DOCUMENT_DRAWER.attachment).setInputFiles(file);
    return (await Promise.race([answered, refusedOnScreen]))?.status() ?? -1;
  }

  async removeAttachment(): Promise<void> {
    await this.page.locator(buttonSelector(POLICY_DOCUMENT_DRAWER.clearFile)).first().click();
  }

  async isRemoveFileOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(POLICY_DOCUMENT_DRAWER.clearFile)).first().isVisible().catch(() => false);
  }

  async fill(input: DocumentInput): Promise<number> {
    Logger.step(`Documentation drawer: ${JSON.stringify({ ...input, attachment: input.attachment?.name })}`);
    if (input.title !== undefined) await this.typeTitle(input.title);
    if (input.type !== undefined) await this.chooseType(input.type);
    if (input.effectiveDate !== undefined) await this.typeEffectiveDate(input.effectiveDate);
    if (input.description !== undefined) await this.typeDescription(input.description);
    return input.attachment ? this.attach(input.attachment) : -1;
  }

  private fieldErrorOf(field: PolicyDocumentField): Locator {
    const byId = this.byId(`${POLICY_DOCUMENT_DRAWER.errorPrefix}${POLICY_DOCUMENT_ERROR[field]}`);
    return field === 'attachment' ? byId.or(this.attachmentError()).first() : byId;
  }

  async getFieldError(field: PolicyDocumentField): Promise<string> {
    return (await this.fieldErrorOf(field).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  async getFieldErrors(): Promise<Partial<Record<PolicyDocumentField, string>>> {
    const out: Partial<Record<PolicyDocumentField, string>> = {};
    for (const field of Object.keys(POLICY_DOCUMENT_ERROR) as PolicyDocumentField[]) {
      const error = this.fieldErrorOf(field);
      if (await error.isVisible().catch(() => false)) out[field] = (await error.innerText()).trim();
    }
    return out;
  }

  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${POLICY_DOCUMENT_DRAWER.errorPrefix}"][id$="-error"]`).or(this.attachmentError()).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
    });
  }

  /** Clicks Save (confirming a "Return to draft?" prompt) and reports CreatePolicyEndorsement's answer. */
  async attemptSave(): Promise<Omit<DocumentSaveAnswer, 'uploadStatus'>> {
    const answered = this.page.waitForResponse((r) => /\/CreatePolicyEndorsement$/.test(new URL(r.url()).pathname), { timeout: Timeouts.default }).catch(() => null);
    await this.page.locator(buttonSelector(POLICY_DOCUMENT_DRAWER.save)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) await dialog.confirmWithFollowUps().catch(() => undefined);
    const response = await answered;
    let body: Record<string, unknown> | null = null;
    try { body = response ? (response.request().postDataJSON() as Record<string, unknown>) : null; } catch { body = null; }
    return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', body, messages: await this.getMessages() };
  }

  /** fill + Save. */
  async add(input: DocumentInput): Promise<DocumentSaveAnswer> {
    const uploadStatus = await this.fill(input);
    return { ...(await this.attemptSave()), uploadStatus };
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(POLICY_DOCUMENT_DRAWER.cancel)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) await dialog.discardChanges();
    await expect(this.byId(POLICY_DOCUMENT_DRAWER.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
