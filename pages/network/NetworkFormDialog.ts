import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { EntityWizardDialog } from '../components/EntityWizardDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { NETWORK_FORM, NETWORK_FORM_FIELD, NETWORK_FORM_PREFIX, multiselectControl } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import type { NetworkFormData } from '../../data/networks/network.data';
import { NETWORK_TYPE_LABEL_AR } from '../../data/networks/network.data';
import { deleteNetworkById, readNetwork, type NetworkRecord } from '../../utils/NetworkProvisioning';

/** Labels of the wizard's fields, as NETWORK_FORM_FIELD keys them. */
export const NETWORK_FIELD = {
  nameEn: 'Network Name',
  nameAr: 'الشبكة الطبية',
  type: 'Network Type',
  descriptionEn: 'Description',
  descriptionAr: 'Description (Arabic)',
  effectiveDate: 'Effective Date',
  expiryDate: 'Expiry Date',
} as const;

export type NetworkFieldKey = keyof typeof NETWORK_FIELD;

/** What the server said to a save, or null when no request left the browser. */
export type SaveOutcome = { status: number; body: unknown; text: string } | null;

/** A save's server answer plus every message shown afterwards (saveEditAndReport). */
export type EditSaveReport = { outcome: SaveOutcome; messages: string[] };

/** What a user is shown after a stale save (readConflictPrompt). */
export interface ConflictPrompt {
  messages: string[];
  dialogTitle: string;
  dialogActions: string[];
}

/** A save attempt, both halves: the server's answer and what the screen said. */
export interface SaveReport {
  outcome: SaveOutcome;
  messages: string[];
  /** Nothing was saved - blocked in the browser, or refused by the server. */
  refused: boolean;
  /** The save went through. */
  created: boolean;
  /** One line describing the attempt, for assertion messages. */
  text: string;
}

/**
 * The Add / Edit / Clone Network wizard (`network-form-drawer`).
 *
 * Two steps, verified 2026-10-21: "Basic Information" (English name, Arabic
 * name, type, the owning payer shown read-only as a tag, two descriptions) and
 * "Effective Period" (effective and expiry date-times, with a notice that the
 * network starts Pending). The same drawer serves add, edit and clone; only
 * its title changes.
 *
 * Field reading, validation and the discard guard are inherited from
 * EntityWizardDialog - this class adds only what the network form has that
 * the payer form does not.
 */
export class NetworkFormDialog extends EntityWizardDialog {
  constructor(page: Page) {
    super(page, NETWORK_FORM_PREFIX, NETWORK_FORM_FIELD);
  }

  /** The drawer's title - "Add New Network" or "Edit Network". */
  async getTitleText(): Promise<string> {
    await this.waitForOpen();
    return (await this.title().innerText()).trim();
  }

  /** Waits until an edit/clone drawer has been patched with the record. */
  async waitForPopulated(): Promise<void> {
    await expect(
      this.field(NETWORK_FIELD.nameEn),
      'the drawer should be populated with the network it opened',
    ).not.toHaveValue('', { timeout: Timeouts.default });
  }

  /** The owning payer shown on step 1 - read-only, taken from the top-bar scope. */
  async getPayerTag(): Promise<string> {
    await this.goToStepContaining(NETWORK_FIELD.nameEn);
    const tag = this.page.locator(`#${NETWORK_FORM.payerTag}`);
    await expect(tag).toBeVisible({ timeout: Timeouts.default });
    return (await tag.innerText()).trim();
  }

  /**
   * The payer that will own the network, whichever way step 1 shows it: the
   * read-only tag (a payer in the top-bar scope) or the payer dropdown ("All
   * Payers" in scope). '' when the dropdown is left empty - a network for every
   * user (17788, 2026-10-27).
   */
  async getOwningPayer(): Promise<string> {
    await this.goToStepContaining(NETWORK_FIELD.nameEn);
    const tag = this.page.locator(`#${NETWORK_FORM.payerTag}`);
    const payers = this.page.locator(multiselectControl(NETWORK_FORM.payersMultiselect)).first();
    await expect(tag.or(payers).first(), 'step 1 should show the owning payer').toBeVisible({ timeout: Timeouts.default });
    if (await tag.isVisible()) return (await tag.innerText()).trim();
    // "All Payers" (the default chip) means no single owner - every user.
    const shown = (await payers.innerText()).replace(/\s+/g, ' ').trim();
    return /^(select|اختر)?$|all payers|كل|جميع/i.test(shown) ? '' : shown;
  }

  /**
   * Picks the network's payer in the step-1 payer dropdown - the first payer
   * offered, or `payerName` - and returns it. Where the form shows the tag
   * instead, the scope already decided it and the tag is returned.
   */
  async chooseOwningPayer(payerName?: string): Promise<string> {
    await this.goToStepContaining(NETWORK_FIELD.nameEn);
    const payers = this.page.locator(multiselectControl(NETWORK_FORM.payersMultiselect)).first();
    if (!(await payers.isVisible().catch(() => false))) return this.getOwningPayer();
    await payers.click();
    // locator-exception: PrimeNG multiselect options carry render-order ids; read by role in the open overlay.
    const options = this.page.getByRole('option').filter({ visible: true });
    await options.first().waitFor({ state: 'visible', timeout: Timeouts.default });
    const labels = (await options.allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '' && !/^All\s|^كل\s|^جميع\s/i.test(t));
    const wanted = payerName ?? labels[0] ?? '';
    expect(wanted, 'the Payers field should offer at least one payer').not.toBe('');
    Logger.step(`Choosing "${wanted}" as the network's payer`);
    await options.filter({ hasText: new RegExp(`^\\s*${wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first().click();
    // Close the overlay by clicking the drawer's title - Escape closes the whole drawer (2026-10-27).
    await this.title().click();
    await expect(options.first(), 'the Payers overlay should close').toBeHidden({ timeout: Timeouts.short }).catch(() => undefined);
    return wanted;
  }

  /** Step 2's "Important" notice about the initial status. */
  async getImportantNotice(): Promise<string> {
    await this.goToStepContaining(NETWORK_FIELD.effectiveDate);
    const notice = this.page.locator(`#${NETWORK_FORM.importantNotice}`);
    await expect(notice).toBeVisible({ timeout: Timeouts.default });
    return (await notice.innerText()).trim();
  }

  /** Fills step 1, leaving `except` untouched (for the required-field cases). */
  async fillBasicInformation(data: NetworkFormData, except?: NetworkFieldKey): Promise<void> {
    Logger.step(`Filling Basic Information for "${data.nameEn}"`);
    await this.goToStepContaining(NETWORK_FIELD.nameEn);
    if (except !== 'nameEn') await this.fillTextField(NETWORK_FIELD.nameEn, data.nameEn);
    if (except !== 'nameAr') await this.fillTextField(NETWORK_FIELD.nameAr, data.nameAr);
    if (except !== 'type') await this.selectDropdownOption(NETWORK_FIELD.type, await this.typeLabel(data.type));
    if (except !== 'descriptionEn' && data.descriptionEn !== undefined) {
      await this.fillTextField(NETWORK_FIELD.descriptionEn, data.descriptionEn);
    }
    if (except !== 'descriptionAr' && data.descriptionAr !== undefined) {
      await this.fillTextField(NETWORK_FIELD.descriptionAr, data.descriptionAr);
    }
  }

  /**
   * Fills step 2. Both dates are written twice: opening one PrimeNG picker can
   * reset its sibling's model while its text still reads correctly (the same
   * trap PayerFormDialog.fillEffectivePeriod documents).
   */
  async fillEffectivePeriod(data: NetworkFormData, except?: NetworkFieldKey): Promise<void> {
    Logger.step(`Filling Effective Period: ${data.effectiveDate} -> ${data.expiryDate}`);
    const targets = [
      { key: 'effectiveDate' as const, value: data.effectiveDate },
      { key: 'expiryDate' as const, value: data.expiryDate },
    ].filter((target) => target.key !== except);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const target of targets) await this.fillDateField(NETWORK_FIELD[target.key], target.value);
    }
  }

  /** A network type as the CURRENT interface language labels it (see NETWORK_TYPE_LABEL_AR). */
  private async typeLabel(type: string): Promise<string> {
    const rtl = await this.page.evaluate(() => document.documentElement.dir === 'rtl');
    return rtl ? (NETWORK_TYPE_LABEL_AR[type] ?? type) : type;
  }

  /**
   * Advances from step 1 to step 2.
   *
   * ONE RETRY when the click did not take (2026-10-25). Folder 38 intermittently
   * stayed on step 1 with valid data and no error shown - the type dropdown had
   * not committed its value when Next was clicked - while the same flow reached
   * step 2 five times out of five on its own. A step 1 that SHOWS an error is a
   * real refusal and is left alone; the validation cases depend on it.
   */
  async next(): Promise<void> {
    await this.clickNext();
    const advanced = await this.submitButton()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (advanced) return;
    const errors = (await this.page.locator('[id^="network-form-drawer"][id$="-error"]').allInnerTexts()).filter((t) => t.trim() !== '');
    if (errors.length === 0 && (await this.nextButton().isVisible().catch(() => false))) await this.clickNext();
  }

  /** Fills both steps without saving. */
  async fill(data: NetworkFormData, except?: NetworkFieldKey): Promise<void> {
    await this.fillBasicInformation(data, except);
    await this.next();
    await this.fillEffectivePeriod(data, except);
  }

  /** Clicks Save from wherever the wizard is (Save lives on step 2). */
  async save(): Promise<void> {
    await this.goToStepContaining(NETWORK_FIELD.effectiveDate);
    await this.clickSubmit('Save');
  }

  /** Saves a NEW network and returns what CreateNetwork answered. */
  async saveNewAndCapture(): Promise<SaveOutcome> {
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.networkCreate, () => this.save());
  }

  /** Saves an EDIT and returns what UpdateNetwork answered. */
  async saveEditAndCapture(): Promise<SaveOutcome> {
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.networkUpdate, () => this.save());
  }

  /** Fills and saves a new network, asserting the drawer closed on success. */
  async create(data: NetworkFormData): Promise<SaveOutcome> {
    await this.fill(data);
    const outcome = await this.saveNewAndCapture();
    expect(outcome, 'the save should have reached CreateNetwork').not.toBeNull();
    expect(outcome!.status, `CreateNetwork should accept a valid network: ${outcome!.text.slice(0, 300)}`).toBeLessThan(300);
    await this.waitForClosed();
    return outcome;
  }

  /**
   * Types into a field with REAL keystrokes over its current value - edit mode
   * compares against the loaded record, and a programmatic fill reads as "no
   * changes made".
   */
  async editField(key: NetworkFieldKey, value: string): Promise<void> {
    const label = NETWORK_FIELD[key];
    if (key === 'type') {
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
  async readField(key: NetworkFieldKey): Promise<string> {
    const label = NETWORK_FIELD[key];
    await this.goToStepContaining(label);
    return key === 'type' ? this.getDropdownValue(label) : this.getFieldValue(label);
  }

  /** Every field's current value, for the pre-population cases. */
  async readAll(): Promise<Record<NetworkFieldKey, string>> {
    const out = {} as Record<NetworkFieldKey, string>;
    for (const key of Object.keys(NETWORK_FIELD) as NetworkFieldKey[]) out[key] = await this.readField(key);
    return out;
  }

  /** The inline error under a field, or '' when it shows none. */
  async readFieldError(key: NetworkFieldKey): Promise<string> {
    const label = NETWORK_FIELD[key];
    await this.goToStepContaining(label);
    const error = this.fieldError(label);
    const shown = await error
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    return shown ? (await error.innerText()).trim() : '';
  }

  /** Whether the wizard shows a control labelled "Network Code" (it must not be editable). */
  async offersNetworkCodeField(): Promise<boolean> {
    return this.hasEditableField('Network Code');
  }

  /** The 1-based step currently on screen. */
  async currentStep(): Promise<number> {
    return this.activeStepNumber();
  }

  // ---- story 05/10/11/22/37/38 additions (create / edit / validation) ----

  /** The id of the network a save created, read from CreateNetwork's answer; '' when none. */
  createdId(outcome: SaveOutcome): string {
    const body = outcome?.body as { payload?: { id?: string } } | null | undefined;
    return outcome && outcome.status < 300 ? String(body?.payload?.id ?? '') : '';
  }

  /**
   * Discards the draft a form save created, for cleanup. Only a draft that was
   * never approved is deleted (DeleteNetwork discards it outright); anything
   * already submitted onwards is left alone, so cleanup never stages a
   * deletion of a live network. A failed or absent save is a no-op.
   */
  async discardCreated(outcome: SaveOutcome): Promise<void> {
    const id = this.createdId(outcome);
    if (!id) return;
    const record = await readNetwork(this.page, id).catch(() => null);
    if (record?.isPendingCreate) {
      await deleteNetworkById(this.page, id).catch(() => undefined);
      Logger.step(`[cleanup] Discarded the draft network ${id} the case created through the form`);
    }
  }

  /**
   * Saves (create) and reports both halves of the outcome: what CreateNetwork
   * answered (null when the form never sent it - a client-side block) and
   * every message the screen showed. Validation cases assert on both.
   */
  async saveNewAndReport(): Promise<SaveReport> {
    const outcome = await this.saveNewAndCapture();
    return this.report(outcome);
  }

  /** The edit counterpart of `saveNewAndReport` (UpdateNetwork). */
  async saveEditAndReport(): Promise<SaveReport> {
    let outcome = await this.saveEditAndCapture();
    // Editing a LIVE network first answers `requiresDraftConfirmation` and
    // raises the shared dialog; only confirming it sends the real save
    // (`confirmRevertToDraft: true`). That second answer is the one reported.
    const body = outcome?.body as { payload?: { requiresDraftConfirmation?: boolean } } | null | undefined;
    if (body?.payload?.requiresDraftConfirmation) {
      const dialog = new ConfirmDialog(this.page);
      outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkUpdate, () => dialog.confirm());
    }
    return this.report(outcome);
  }

  /**
   * `refused` is true when nothing was saved: no request left the browser (a
   * client-side block) or the server answered 3xx+. Kept here so the
   * "blocked either way" cases need no branch.
   */
  private async report(outcome: SaveOutcome): Promise<SaveReport> {
    const messages = await this.waitForVisibleMessages();
    const refused = outcome === null || outcome.status >= 300;
    return { outcome, messages, refused, created: !refused, text: `${outcome?.status ?? 'no request'} ${outcome?.text.slice(0, 300) ?? ''} | ${messages.join(' | ')}` };
  }

  /**
   * Tries to save an edit from wherever the wizard is, without assuming it can
   * get there: an invalid step-1 field blocks the stepper, so the Save button
   * is never reached. Reports refused/created and every message shown (inline
   * errors included), so a validation case need not know WHICH step blocks.
   */
  async attemptEditSave(): Promise<SaveReport> {
    if (await this.nextButton().isVisible()) await this.next();
    const reachedSave = await this.submitButton()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (!reachedSave) return this.report(null);
    return this.saveEditAndReport();
  }

  /**
   * The create counterpart of `attemptEditSave` (CreateNetwork). With `data`
   * it also fills the effective period once step 2 is reached (2026-10-24):
   * the step-1 validation cases used to call next() and then fill the dates
   * unconditionally, and timed out on a date field that never appears when the
   * app - correctly - refuses to leave step 1.
   */
  async attemptNewSave(data?: NetworkFormData): Promise<SaveReport> {
    if (await this.nextButton().isVisible()) await this.next();
    const reachedSave = await this.submitButton()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (!reachedSave) return this.report(null);
    if (data) await this.fillEffectivePeriod(data);
    return this.saveNewAndReport();
  }

  /** The network a save created, as GetNetwork answers it; null when nothing was created. */
  async readCreated(outcome: SaveOutcome): Promise<NetworkRecord | null> {
    const id = this.createdId(outcome);
    return id ? readNetwork(this.page, id).catch(() => null) : null;
  }

  /**
   * Puts a long value into a text field the way a paste would: one insertText
   * after select-all + Delete. Unlike `fill`, an inserted value is subject to
   * the field's `maxlength`, which is what the boundary cases ask about.
   */
  async insertInto(key: NetworkFieldKey, value: string): Promise<string> {
    const label = NETWORK_FIELD[key];
    await this.goToStepContaining(label);
    const input = this.field(label);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    await this.page.keyboard.insertText(value);
    await input.blur();
    return input.inputValue();
  }

  /** The visible label of a field. */
  async getFieldLabel(key: NetworkFieldKey): Promise<string> {
    const label = NETWORK_FIELD[key];
    await this.goToStepContaining(label);
    const text = await this.field(label)
      .locator('xpath=ancestor::*[.//label][1]')
      .locator('label')
      .first()
      .innerText()
      .catch(() => '');
    return text.replace(/\*/g, '').trim();
  }

  /** Every label on the current step, in order. */
  async getStepLabels(): Promise<string[]> {
    return (await this.panel().locator('label').allInnerTexts())
      .map((t) => t.replace(/\*/g, '').trim())
      .filter((t) => t !== '');
  }

  /** The drawer's whole visible text (title, stepper, labels, notices, buttons). */
  async getDrawerText(): Promise<string> {
    await this.waitForOpen();
    return (await this.panel().innerText()).trim();
  }

  /** Whether a field is visibly marked invalid (aria-invalid or the invalid class). */
  async fieldHasErrorState(key: NetworkFieldKey): Promise<boolean> {
    const label = NETWORK_FIELD[key];
    await this.goToStepContaining(label);
    return this.field(label).evaluate((element) => {
      const marked = (el: Element | null): boolean =>
        !!el && (el.getAttribute('aria-invalid') === 'true' || /(ng-invalid|p-invalid)/.test(el.className.toString()));
      return marked(element) && /ng-touched|ng-dirty|p-invalid/.test(element.className.toString())
        || marked(element.closest('p-datepicker, p-select, p-inputtext, .p-inputwrapper'));
    });
  }

  /** Whether the Save button can be clicked. */
  async isSaveEnabled(): Promise<boolean> {
    await this.goToStepContaining(NETWORK_FIELD.effectiveDate);
    return this.submitButton().isEnabled({ timeout: Timeouts.short }).catch(() => false);
  }

  /**
   * Opens a date field's calendar and reports whether YESTERDAY's cell is
   * disabled. Returns null when yesterday is not on the panel the picker
   * opens on (the first of a month), so the caller can say so.
   *
   * locator-exception: PrimeNG renders day cells without ids; they are read
   * inside the open datepicker panel, which is reached from the field's id.
   */
  async isYesterdayDisabledInPicker(key: 'effectiveDate' | 'expiryDate'): Promise<boolean | null> {
    const label = NETWORK_FIELD[key];
    await this.goToStepContaining(label);
    await this.field(label).click();
    const panel = this.page.locator('.p-datepicker-panel, .p-datepicker').filter({ visible: true }).first(); // locator-exception: the PrimeNG date-picker overlay is portalled with no id
    await expect(panel, 'the date picker should open').toBeVisible({ timeout: Timeouts.default });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const sameMonth = yesterday.getMonth() === new Date().getMonth();
    const state = sameMonth
      ? await panel
        .locator('td:not(.p-datepicker-other-month) span, td:not(.p-datepicker-other-month)')
        .filter({ hasText: new RegExp(`^\\s*${yesterday.getDate()}\\s*$`) })
        .first()
        .evaluate((el) => el.className.toString().includes('disabled') || el.getAttribute('aria-disabled') === 'true'
          || (el.parentElement?.className.toString().includes('disabled') ?? false))
        .catch(() => null)
      : null;
    await this.page.keyboard.press('Escape');
    return state;
  }

  // ---- story 19 / 33 additions (concurrency conflict) ----

  /**
   * What the user is shown after a save the server refused as stale: every
   * message on screen (toasts, inline errors, the shared dialog's text) plus,
   * when the shared dialog came up, its title and action keys - so a case can
   * assert both "the user was told" and "a reload action was offered".
   */
  async readConflictPrompt(): Promise<ConflictPrompt> {
    const messages = await this.waitForVisibleMessages();
    const dialog = new ConfirmDialog(this.page);
    const shown = await dialog.isVisible();
    return {
      messages,
      dialogTitle: shown ? await dialog.getTitle() : '',
      dialogActions: shown ? await dialog.getActionKeys() : [],
    };
  }
}
