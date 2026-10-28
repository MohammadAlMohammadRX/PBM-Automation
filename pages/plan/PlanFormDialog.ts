import type { Locator, Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import { EntityWizardDialog } from '../components/EntityWizardDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PayerSelectionDropdown } from '../components/PayerSelectionDropdown';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { PLAN_FORM, PLAN_FORM_FIELD, PLAN_FORM_PREFIX } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import { deletePlanById, readPlan, type PlanRecord } from '../../utils/PlanProvisioning';
import type { ConflictPrompt, SaveOutcome, SaveReport } from '../network/NetworkFormDialog';
import { PLAN_TYPE_LABEL_AR, type PlanFormData } from '../../data/plans/plan.data';

export type { SaveOutcome, SaveReport, ConflictPrompt } from '../network/NetworkFormDialog';

/** Labels of the wizard's fields, as PLAN_FORM_FIELD keys them. */
export const PLAN_FIELD = {
  nameEn: 'Plan Name',
  nameAr: 'Plan Name (Arabic)',
  payer: 'Payer',
  type: 'Plan Type',
  descriptionEn: 'Description',
  descriptionAr: 'Description (Arabic)',
  effectiveDate: 'Effective Date',
  expiryDate: 'Expiry Date',
} as const;

export type PlanFieldKey = keyof typeof PLAN_FIELD;

/**
 * The Add / Edit Plan wizard (`plan-form-drawer`), verified 2026-10-27.
 *
 * Two steps: "Basic Information" (English and Arabic names, Payer, Plan Type,
 * two descriptions) and "Effective Period" (effective and expiry date-times,
 * `DD/MM/YYYY HH:mm`), each under the notice "This plan will be submitted for
 * approval ...". Unlike the network form the payer is a field of its own.
 *
 * Built like NetworkFormDialog on EntityWizardDialog; the save-report shapes
 * are shared with it so a plan case reads its outcome exactly as a network case
 * does.
 */
export class PlanFormDialog extends EntityWizardDialog {
  constructor(page: Page) {
    super(page, PLAN_FORM_PREFIX, PLAN_FORM_FIELD);
  }

  /** The drawer's title - "Add New Plan" or "Edit Plan". */
  async getTitleText(): Promise<string> {
    await this.waitForOpen();
    return (await this.title().innerText()).trim();
  }

  /** Waits until an edit drawer has been patched with the plan. */
  async waitForPopulated(): Promise<void> {
    await expect(this.field(PLAN_FIELD.nameEn), 'the drawer should be populated with the plan it opened')
      .not.toHaveValue('', { timeout: Timeouts.default });
  }

  /** The "Important" notice on the current step. */
  async getImportantNotice(): Promise<string> {
    // A prefix since 2026-10-27: the id became `...-important-title-message-2-text`.
    const notice = this.page.locator(`[id^="${PLAN_FORM.importantNotice}"][id$="-text"]`).filter({ visible: true }).first();
    await expect(notice).toBeVisible({ timeout: Timeouts.default });
    return (await notice.innerText()).trim();
  }

  /** The Payer field - the shared payer dropdown component. */
  payerDropdown(): PayerSelectionDropdown {
    return new PayerSelectionDropdown(this.page, 'planForm');
  }

  /**
   * The read-only payer tag. VERIFIED 2026-10-27: with a payer chosen in the
   * top-bar scope the drawer shows that payer as a fixed tag instead of a
   * dropdown, and Add Plan is only offered while a payer is in scope - so the
   * plan's payer is the scoped payer. 13 create / edit cases timed out opening a
   * dropdown that is no longer there.
   */
  payerTag(): Locator {
    return this.page.locator(`#${PLAN_FORM.payerTag}`);
  }

  /** Whether the payer is fixed by the scope (the tag) rather than chosen in the form. */
  async isPayerFixed(): Promise<boolean> {
    await this.field(PLAN_FIELD.nameEn).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return this.payerTag().isVisible().catch(() => false);
  }

  /**
   * The fields the CURRENT step offers, as PLAN_FIELD labels, read by control id.
   * Not by label text: since 2026-10-27 the Arabic fields are labelled in Arabic
   * ("اسم الخطة") and Payer precedes Plan Type, which failed 18976 on wording
   * while every field was there.
   */
  async getStepFields(): Promise<string[]> {
    await this.field(PLAN_FIELD.nameEn).or(this.field(PLAN_FIELD.effectiveDate)).first()
      .waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    const present: string[] = [];
    for (const label of Object.values(PLAN_FIELD)) {
      const control = label === PLAN_FIELD.payer ? this.field(label).or(this.payerTag()) : this.field(label);
      if (await control.first().isVisible().catch(() => false)) present.push(label);
    }
    return present;
  }

  /**
   * Moves the wizard to the step holding a field. The payer is located by the
   * Plan Name beside it on step 1: "go to the step containing" looks for the
   * field's control, and the payer's control is a read-only tag now, not the
   * drop-down it looked for - 18961 timed out there on the re-run (2026-10-28).
   */
  private async goToStepOf(key: PlanFieldKey): Promise<void> {
    await this.goToStepContaining(key === 'payer' ? PLAN_FIELD.nameEn : PLAN_FIELD[key]);
  }

  /** The payer the drawer carries - the tag's text, or the dropdown's value. */
  private async readPayer(): Promise<string> {
    if (await this.isPayerFixed()) return (await this.payerTag().innerText()).trim();
    return this.getDropdownValue(PLAN_FIELD.payer);
  }

  /** A plan type as the CURRENT interface language labels it. */
  private async typeLabel(type: string): Promise<string> {
    const rtl = await this.page.evaluate(() => document.documentElement.dir === 'rtl');
    return rtl ? (PLAN_TYPE_LABEL_AR[type] ?? type) : type;
  }

  /** Fills step 1, leaving `except` untouched (for the required-field cases). */
  async fillBasicInformation(data: PlanFormData, except?: PlanFieldKey): Promise<void> {
    Logger.step(`Filling Basic Information for "${data.nameEn}"`);
    await this.goToStepContaining(PLAN_FIELD.nameEn);
    if (except !== 'nameEn') await this.fillTextField(PLAN_FIELD.nameEn, data.nameEn);
    if (except !== 'nameAr') await this.fillTextField(PLAN_FIELD.nameAr, data.nameAr);
    if (except !== 'payer') {
      if (await this.isPayerFixed()) {
        // The scope already chose it; say so plainly when it is the wrong one.
        const fixed = (await this.payerTag().innerText()).trim();
        if (fixed.toLowerCase() !== data.payer.toLowerCase()) {
          throw new Error(`The drawer's payer is fixed to "${fixed}" by the top-bar scope, but the case needs "${data.payer}" - scope to it before opening Add Plan`);
        }
      } else {
        const payer = this.payerDropdown();
        await payer.open();
        await payer.select(data.payer);
      }
    }
    if (except !== 'type') await this.selectDropdownOption(PLAN_FIELD.type, await this.typeLabel(data.type));
    if (except !== 'descriptionEn' && data.descriptionEn !== undefined) await this.fillTextField(PLAN_FIELD.descriptionEn, data.descriptionEn);
    if (except !== 'descriptionAr' && data.descriptionAr !== undefined) await this.fillTextField(PLAN_FIELD.descriptionAr, data.descriptionAr);
  }

  /** Fills step 2 - both dates twice, for the PrimeNG sibling-reset trap (see NetworkFormDialog). */
  async fillEffectivePeriod(data: PlanFormData, except?: PlanFieldKey): Promise<void> {
    Logger.step(`Filling Effective Period: ${data.effectiveDate} -> ${data.expiryDate}`);
    const targets = [
      { key: 'effectiveDate' as const, value: data.effectiveDate },
      { key: 'expiryDate' as const, value: data.expiryDate },
    ].filter((target) => target.key !== except);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const target of targets) await this.fillDateField(PLAN_FIELD[target.key], target.value);
    }
  }

  /** Step 1 -> step 2, with one retry when the click did not take and no error shows. */
  async next(): Promise<void> {
    await this.clickNext();
    const advanced = await this.submitButton()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (advanced) return;
    const errors = (await this.page.locator(`[id^="${PLAN_FORM_PREFIX}"][id$="-error"]`).allInnerTexts()).filter((t) => t.trim() !== '');
    if (errors.length === 0 && (await this.nextButton().isVisible().catch(() => false))) await this.clickNext();
  }

  /** Fills both steps without saving. */
  async fill(data: PlanFormData, except?: PlanFieldKey): Promise<void> {
    await this.fillBasicInformation(data, except);
    await this.next();
    await this.fillEffectivePeriod(data, except);
  }

  /** Clicks Save from wherever the wizard is (Save lives on step 2). */
  async save(): Promise<void> {
    await this.goToStepContaining(PLAN_FIELD.effectiveDate);
    await this.clickSubmit('Save');
  }

  async saveNewAndCapture(): Promise<SaveOutcome> {
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.planCreate, () => this.save());
  }

  async saveEditAndCapture(): Promise<SaveOutcome> {
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.planUpdate, () => this.save());
  }

  /** Saves (create) and reports what CreatePlan answered and every message shown. */
  async saveNewAndReport(): Promise<SaveReport> {
    return this.report(await this.saveNewAndCapture());
  }

  /** Saves an edit; a live plan first asks to confirm the revert to draft, and that second answer is reported. */
  async saveEditAndReport(): Promise<SaveReport> {
    let outcome = await this.saveEditAndCapture();
    const body = outcome?.body as { payload?: { requiresDraftConfirmation?: boolean } } | null | undefined;
    if (body?.payload?.requiresDraftConfirmation) {
      outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planUpdate, () => new ConfirmDialog(this.page).confirm());
    }
    return this.report(outcome);
  }

  private async report(outcome: SaveOutcome): Promise<SaveReport> {
    const messages = await this.waitForVisibleMessages();
    const refused = outcome === null || outcome.status >= 300;
    return { outcome, messages, refused, created: !refused, text: `${outcome?.status ?? 'no request'} ${outcome?.text.slice(0, 300) ?? ''} | ${messages.join(' | ')}` };
  }

  /** Tries to save a NEW plan from wherever the wizard is; a blocked step 1 reports refused with its messages. */
  async attemptNewSave(data?: PlanFormData): Promise<SaveReport> {
    if (await this.nextButton().isVisible()) await this.next();
    const reachedSave = await this.submitButton().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    if (!reachedSave) return this.report(null);
    if (data) await this.fillEffectivePeriod(data);
    return this.saveNewAndReport();
  }

  /** The edit counterpart of attemptNewSave. */
  async attemptEditSave(): Promise<SaveReport> {
    if (await this.nextButton().isVisible()) await this.next();
    const reachedSave = await this.submitButton().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    if (!reachedSave) return this.report(null);
    return this.saveEditAndReport();
  }

  /** The id of the plan a save created; '' when none. */
  createdId(outcome: SaveOutcome): string {
    const body = outcome?.body as { payload?: { id?: string } } | null | undefined;
    return outcome && outcome.status < 300 ? String(body?.payload?.id ?? '') : '';
  }

  /** The plan a save created, as GetPlan answers it; null when nothing was created. */
  async readCreated(outcome: SaveOutcome): Promise<PlanRecord | null> {
    const id = this.createdId(outcome);
    return id ? readPlan(this.page, id).catch(() => null) : null;
  }

  /** Discards the never-approved draft a form save created (cleanup). */
  async discardCreated(outcome: SaveOutcome): Promise<void> {
    const id = this.createdId(outcome);
    if (!id) return;
    const record = await readPlan(this.page, id).catch(() => null);
    // A never-approved plan carries the provisional PLN-D- code; anything published is left alone.
    if (record && (record.isPendingCreate || /^PLN-D-/.test(record.planCode ?? ''))) {
      await deletePlanById(this.page, id).catch(() => undefined);
      Logger.step(`[cleanup] Discarded the draft plan ${id} the case created through the form`);
    }
  }

  /** Types into a field with real keystrokes over its current value (edit mode compares to the record). */
  async editField(key: PlanFieldKey, value: string): Promise<void> {
    const label = PLAN_FIELD[key];
    if (key === 'payer' && (await this.isPayerFixed())) {
      throw new Error(`The plan's payer is fixed by the top-bar scope ("${await this.readPayer()}") and cannot be changed in the form`);
    }
    if (key === 'type' || key === 'payer') {
      await this.setFieldValue(label, value, 'dropdown');
      return;
    }
    if (key === 'effectiveDate' || key === 'expiryDate') {
      await this.goToStepContaining(label);
      await this.fillDateField(label, value);
      return;
    }
    await this.setFieldValue(label, value, 'text');
  }

  /** The current value of a field, navigating to its step first. */
  async readField(key: PlanFieldKey): Promise<string> {
    const label = PLAN_FIELD[key];
    await this.goToStepOf(key);
    if (key === 'payer') return this.readPayer();
    return key === 'type' ? this.getDropdownValue(label) : this.getFieldValue(label);
  }

  /** Every field's current value, for the pre-population cases. */
  async readAll(): Promise<Record<PlanFieldKey, string>> {
    const out = {} as Record<PlanFieldKey, string>;
    for (const key of Object.keys(PLAN_FIELD) as PlanFieldKey[]) out[key] = await this.readField(key);
    return out;
  }

  /** The inline error under a field, or '' when it shows none. */
  async readFieldError(key: PlanFieldKey): Promise<string> {
    const label = PLAN_FIELD[key];
    await this.goToStepOf(key);
    const error = this.fieldError(label);
    const shown = await error.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    return shown ? (await error.innerText()).trim() : '';
  }

  /** Whether the form offers an editable "Plan Code" (it must not: hidden or read-only). */
  async offersPlanCodeField(): Promise<boolean> {
    return this.hasEditableField('Plan Code');
  }

  /** Whether a field can be changed (not read-only / disabled). */
  async isFieldEditable(key: PlanFieldKey): Promise<boolean> {
    await this.goToStepContaining(PLAN_FIELD[key]);
    return this.hasEditableField(PLAN_FIELD[key]);
  }

  async currentStep(): Promise<number> {
    return this.activeStepNumber();
  }

  /** Puts a long value into a text field the way a paste would, so `maxlength` applies. */
  async insertInto(key: PlanFieldKey, value: string): Promise<string> {
    const label = PLAN_FIELD[key];
    await this.goToStepContaining(label);
    const input = this.field(label);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    await this.page.keyboard.insertText(value);
    await input.blur();
    return input.inputValue();
  }

  /** Every label on the current step, in order. */
  async getStepLabels(): Promise<string[]> {
    return (await this.panel().locator('label').allInnerTexts()).map((t) => t.replace(/\*/g, '').trim()).filter((t) => t !== '');
  }

  /** The drawer's whole visible text. */
  async getDrawerText(): Promise<string> {
    await this.waitForOpen();
    return (await this.panel().innerText()).trim();
  }

  async isSaveEnabled(): Promise<boolean> {
    await this.goToStepContaining(PLAN_FIELD.effectiveDate);
    return this.submitButton().isEnabled({ timeout: Timeouts.short }).catch(() => false);
  }

  /** What the user is shown after a stale save: messages plus the shared dialog's title and actions. */
  async readConflictPrompt(): Promise<ConflictPrompt> {
    const messages = await this.waitForVisibleMessages();
    const dialog = new ConfirmDialog(this.page);
    const shown = await dialog.isVisible();
    return { messages, dialogTitle: shown ? await dialog.getTitle() : '', dialogActions: shown ? await dialog.getActionKeys() : [] };
  }

  // ---- plan folder 02 / 15 additions (2026-10-27) ----

  /**
   * Edits BOTH dates of an open edit drawer with real keystrokes, twice over -
   * the PrimeNG sibling-reset trap fillEffectivePeriod guards against (setting
   * one picker can reset the other). Pass '' to clear a date.
   */
  async editPeriod(effectiveDate: string, expiryDate: string): Promise<void> {
    Logger.step(`Editing the Effective Period: ${effectiveDate || '(blank)'} -> ${expiryDate || '(blank)'}`);
    await this.goToStepContaining(PLAN_FIELD.effectiveDate);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const [label, value] of [[PLAN_FIELD.effectiveDate, effectiveDate], [PLAN_FIELD.expiryDate, expiryDate]] as const) {
        if (value === '') await this.clearField(label);
        else await this.fillDateField(label, value);
      }
    }
  }

  /**
   * Clicks Save `times` times without waiting between the clicks (the
   * double-save race) and returns every UpdatePlan answer seen in the
   * settling window, in arrival order, plus the messages then shown.
   */
  async saveRapidlyAndCaptureAll(times: number, settleMs = 4_000): Promise<{ statuses: number[]; texts: string[]; messages: string[] }> {
    const statuses: number[] = [];
    const texts: string[] = [];
    const pending: Promise<void>[] = [];
    const listener = (response: Response): void => {
      if (!response.url().includes(ApiEndpoints.planUpdate)) return;
      statuses.push(response.status());
      pending.push(response.text().then((text) => { texts.push(text); }, () => { texts.push(''); }));
    };
    await this.goToStepContaining(PLAN_FIELD.effectiveDate);
    this.page.on('response', listener);
    try {
      await this.saveRepeatedly(times);
      await this.page.waitForTimeout(settleMs);
      await Promise.all(pending);
    } finally {
      this.page.off('response', listener);
    }
    const messages = await this.waitForVisibleMessages();
    Logger.step(`UpdatePlan answered ${statuses.join(', ') || 'nothing'} to ${times} rapid saves`);
    return { statuses, texts, messages };
  }

  // ---- plan folder 14 additions (2026-10-27) ----

  /**
   * Makes the open form dirty by typing `value` into the English description
   * (real keystrokes, so the form registers the change) - or leaves it pristine
   * when `value` is null. For the guard's create/edit x dirty/pristine table.
   */
  async makeDirty(value: string | null): Promise<void> {
    if (value === null) return;
    await this.editField('descriptionEn', value);
  }
}
