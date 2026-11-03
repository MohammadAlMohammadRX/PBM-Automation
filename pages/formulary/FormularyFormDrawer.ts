import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { chooseSelectOption, readSelectOptions, requiredLabels } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  FORMULARY_FORM_DRAWER,
  FORMULARY_FORM_ERROR,
  TOAST,
  buttonSelector,
  type FormularyFormField,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** Step 1 of the drawer; a key left out is not touched. */
export interface FormularyBasicInfo {
  nameEn?: string;
  nameAr?: string;
  /** The payer, by its label in the select (Add only - Edit shows it read-only). */
  payer?: string;
  descriptionEn?: string;
  descriptionAr?: string;
}

/** Step 2: dates as `DD/MM/YYYY HH:mm` (see formularyDateText). */
export interface FormularyPeriod {
  effectiveDate?: string;
  expiryDate?: string;
}

/** What a Save answered: the HTTP status (-1 when nothing was sent), the body and the messages shown. */
export interface FormularySaveAnswer {
  status: number;
  text: string;
  messages: string[];
}

/** The text input behind each step-1 / step-2 field. */
const INPUT: Record<Exclude<FormularyFormField, 'payer'>, string> = {
  nameEn: FORMULARY_FORM_DRAWER.nameEn,
  nameAr: FORMULARY_FORM_DRAWER.nameAr,
  descriptionEn: FORMULARY_FORM_DRAWER.descriptionEn,
  descriptionAr: FORMULARY_FORM_DRAWER.descriptionAr,
  effectiveDate: FORMULARY_FORM_DRAWER.effectiveDate,
  expiryDate: FORMULARY_FORM_DRAWER.expiryDate,
};

/**
 * The Add / Edit Formulary drawer (`formulary-form-drawer`), verified live
 * 2026-11-02. Two steps: Basic Information (name EN / AR, payer, description EN
 * / AR) and Effective Period (effective and expiry date-time pickers, typed as
 * `DD/MM/YYYY HH:mm`, plus the "saved as a draft" notice). Next validates step
 * 1 ("This field is required." under each empty mandatory field); Back on step
 * 1 is labelled Cancel. In Edit mode the payer is a read-only tag.
 *
 * THE PICKERS IGNORE `fill` (2026-11-02): a filled date stayed empty and Save
 * answered "This field is required." - dates are typed key by key and
 * committed with Enter, as the payer wizard's are.
 */
export class FormularyFormDrawer {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private btn(id: string): Locator {
    return this.page.locator(buttonSelector(id)).first();
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(FORMULARY_FORM_DRAWER.title), 'the formulary drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** Edit mode: waits until the drawer shows the formulary's values (name filled, payer tag rendered). */
  async waitForLoadedValues(): Promise<void> {
    await expect(this.byId(FORMULARY_FORM_DRAWER.nameEn), 'the Edit drawer should load the formulary').not.toHaveValue('', { timeout: Timeouts.default });
    await this.byId(FORMULARY_FORM_DRAWER.payerTag).waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  }

  async isOpen(): Promise<boolean> {
    return this.byId(FORMULARY_FORM_DRAWER.title).isVisible();
  }

  async getTitle(): Promise<string> {
    return (await this.byId(FORMULARY_FORM_DRAWER.title).innerText()).trim();
  }

  /** The drawer's whole text (notices, labels, errors). */
  async getText(): Promise<string> {
    return (await this.byId(FORMULARY_FORM_DRAWER.root).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The step showing now (1 or 2), read from which step's fields are rendered. */
  async currentStep(): Promise<1 | 2> {
    return (await this.byId(FORMULARY_FORM_DRAWER.effectiveDate).isVisible()) ? 2 : 1;
  }

  /** Whether the drawer renders any formulary-code control (writer A, 18600: the code must never be entered). */
  async hasCodeField(): Promise<boolean> {
    return (await this.page.locator(`[id^="${FORMULARY_FORM_DRAWER.errorPrefix}"][id*="code"]`).filter({ visible: true }).count()) > 0;
  }

  /** The labels the visible step marks as required. */
  async getRequiredLabels(): Promise<string[]> {
    return requiredLabels(this.byId(FORMULARY_FORM_DRAWER.root).first());
  }

  // ---- step 1 -------------------------------------------------------------------------

  /** Types into a text field (real key presses, so the form registers the value). */
  async type(field: Exclude<FormularyFormField, 'payer'>, value: string): Promise<void> {
    const input = this.byId(INPUT[field]);
    await input.click();
    await input.press('ControlOrMeta+a');
    if (value === '') {
      await input.press('Delete');
      // A cleared date keeps its calendar open over the next field (the Expiry
      // Date click timed out under it, 18605 on 2026-11-02); Enter closes it.
      if (field === 'effectiveDate' || field === 'expiryDate') {
        await input.press('Enter');
        return;
      }
    } else if (field === 'effectiveDate' || field === 'expiryDate') {
      await input.pressSequentially(value);
      await input.press('Enter');
      return;
    } else await input.fill(value);
    await input.blur();
  }

  /** Clears a field with real key presses. */
  async clear(field: Exclude<FormularyFormField, 'payer'>): Promise<void> {
    await this.type(field, '');
  }

  /** What a field holds now. */
  async getValue(field: Exclude<FormularyFormField, 'payer'>): Promise<string> {
    return this.byId(INPUT[field]).inputValue();
  }

  /** A field's maxlength attribute, null when it sets none. */
  async getMaxLength(field: Exclude<FormularyFormField, 'payer'>): Promise<number | null> {
    const raw = await this.byId(INPUT[field]).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  /** Fills step 1 (only the keys given). */
  async fillBasicInfo(info: FormularyBasicInfo): Promise<void> {
    Logger.step(`Formulary drawer step 1: ${JSON.stringify(info)}`);
    if (info.nameEn !== undefined) await this.type('nameEn', info.nameEn);
    if (info.nameAr !== undefined) await this.type('nameAr', info.nameAr);
    if (info.payer !== undefined) await this.choosePayer(info.payer);
    if (info.descriptionEn !== undefined) await this.type('descriptionEn', info.descriptionEn);
    if (info.descriptionAr !== undefined) await this.type('descriptionAr', info.descriptionAr);
  }

  /** Chooses the owning payer in the select. */
  async choosePayer(payer: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(FORMULARY_FORM_DRAWER.payerSelect), payer);
  }

  /** The payers the select offers (the "assigned payers" of US 15192). */
  async getPayerOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FORMULARY_FORM_DRAWER.payerSelect));
  }

  /** The payer as shown: the read-only tag in Edit, the select's label in Add. */
  async readPayer(): Promise<string> {
    const tag = this.byId(FORMULARY_FORM_DRAWER.payerTag);
    if (await tag.isVisible().catch(() => false)) return (await tag.innerText()).trim();
    return (await this.byId(FORMULARY_FORM_DRAWER.payerSelect).innerText().catch(() => '')).trim();
  }

  /** Whether the payer can be chosen (a usable select) rather than shown read-only. */
  async isPayerEditable(): Promise<boolean> {
    const select = this.byId(FORMULARY_FORM_DRAWER.payerSelect);
    if (!(await select.isVisible().catch(() => false))) return false;
    return (await select.getAttribute('aria-disabled').catch(() => null)) !== 'true';
  }

  // ---- step 2 -------------------------------------------------------------------------

  /** Fills step 2 (dates as `DD/MM/YYYY HH:mm`). */
  async fillPeriod(period: FormularyPeriod): Promise<void> {
    Logger.step(`Formulary drawer step 2: ${JSON.stringify(period)}`);
    if (period.effectiveDate !== undefined) await this.type('effectiveDate', period.effectiveDate);
    if (period.expiryDate !== undefined) await this.type('expiryDate', period.expiryDate);
  }

  /** The "Important: The formulary is saved as a draft ..." notice of step 2. */
  async getNotice(): Promise<string> {
    return (await this.byId(FORMULARY_FORM_DRAWER.notice).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  // ---- validation ---------------------------------------------------------------------

  /** A field's own error under it, '' when none. */
  async getFieldError(field: FormularyFormField): Promise<string> {
    const error = this.byId(`${FORMULARY_FORM_DRAWER.errorPrefix}${FORMULARY_FORM_ERROR[field]}`);
    return (await error.innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  /** Every field error on screen, by field. */
  async getFieldErrors(): Promise<Partial<Record<FormularyFormField, string>>> {
    const out: Partial<Record<FormularyFormField, string>> = {};
    for (const field of Object.keys(FORMULARY_FORM_ERROR) as FormularyFormField[]) {
      const error = this.byId(`${FORMULARY_FORM_DRAWER.errorPrefix}${FORMULARY_FORM_ERROR[field]}`);
      if (await error.isVisible().catch(() => false)) out[field] = (await error.innerText()).trim();
    }
    return out;
  }

  /** Field errors and toasts, settled - for a refused Next / Save. */
  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${FORMULARY_FORM_DRAWER.errorPrefix}"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
  }

  // ---- buttons -------------------------------------------------------------------------

  /** Next: moves to step 2 when step 1 is valid. Returns whether it moved. */
  async next(): Promise<boolean> {
    await this.btn(FORMULARY_FORM_DRAWER.next).click();
    return this.byId(FORMULARY_FORM_DRAWER.effectiveDate).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Back to step 1 (step 2's Back). */
  async back(): Promise<void> {
    await this.btn(FORMULARY_FORM_DRAWER.back).click();
    await expect(this.byId(FORMULARY_FORM_DRAWER.nameEn)).toBeVisible({ timeout: Timeouts.default });
  }

  /** Jumps to a step by its stepper bullet. */
  async goToStep(step: 1 | 2): Promise<void> {
    await this.page.locator(`#${FORMULARY_FORM_DRAWER.stepPrefix}${step}-bullet`).click();
  }

  async isSaveEnabled(): Promise<boolean> {
    return this.btn(FORMULARY_FORM_DRAWER.save).isEnabled().catch(() => false);
  }

  /**
   * Clicks Save and reports what CreateFormulary / UpdateFormulary answered and
   * what the screen said. A refused save (client validation) answers -1.
   * The "Return to draft?" prompt a pending formulary raises is confirmed.
   */
  async attemptSave(): Promise<FormularySaveAnswer> {
    Logger.step('Formulary drawer: Save');
    const answered = this.page
      .waitForResponse((r) => /\/(CreateFormulary|UpdateFormulary)$/.test(new URL(r.url()).pathname), { timeout: Timeouts.default })
      .catch(() => null);
    await this.btn(FORMULARY_FORM_DRAWER.save).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) await dialog.confirmWithFollowUps().catch(() => undefined);
    const response = await answered;
    const text = response ? await response.text().catch(() => '') : '';
    return { status: response?.status() ?? -1, text, messages: await this.getMessages() };
  }

  /** Saves and asserts the drawer closed on a successful answer. */
  async save(): Promise<FormularySaveAnswer> {
    const answer = await this.attemptSave();
    expect(answer.status, `the formulary save should succeed: ${answer.text.slice(0, 300)} ${answer.messages.join(' | ')}`).toBeGreaterThanOrEqual(200);
    expect(answer.status).toBeLessThan(300);
    await expect(this.byId(FORMULARY_FORM_DRAWER.title), 'the drawer should close after saving').toBeHidden({ timeout: Timeouts.default });
    return answer;
  }

  /** Step 1 + Next + step 2 + Save - the whole Add flow; returns the save answer. */
  async create(info: FormularyBasicInfo, period: FormularyPeriod): Promise<FormularySaveAnswer> {
    await this.fillBasicInfo(info);
    expect(await this.next(), `step 1 should accept ${JSON.stringify(info)}: ${(await this.getMessages()).join(' | ')}`).toBe(true);
    await this.fillPeriod(period);
    return this.attemptSave();
  }

  /** Runs `action` and returns the BODY of the Create / Update request it sent. */
  async captureSaveRequest(action: () => Promise<void>): Promise<Record<string, unknown> | null> {
    const body = await NetworkUtils.captureRequestBody(this.page, /\/(CreateFormulary|UpdateFormulary)$/, action);
    return body ? (JSON.parse(body) as Record<string, unknown>) : null;
  }

  /** Closes with the header X; a dirty form raises the discard prompt, which is answered with `discard`. */
  async close(discard = true): Promise<void> {
    await this.page.locator(`#${FORMULARY_FORM_DRAWER.close}`).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
    if (discard) await expect(this.byId(FORMULARY_FORM_DRAWER.title)).toBeHidden({ timeout: Timeouts.default });
  }

  /** Step 1's Cancel (the Back button); a dirty form raises the discard prompt. */
  async cancel(discard = true): Promise<void> {
    await this.btn(FORMULARY_FORM_DRAWER.back).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
  }

  /** The endpoint a save calls, for the fault-injection cases. */
  static readonly saveEndpoints = [ApiEndpoints.formularyCreate, ApiEndpoints.formularyUpdate] as const;
}
