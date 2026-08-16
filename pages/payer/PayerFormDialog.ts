import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { EntityWizardDialog } from '../components/EntityWizardDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import type { PayerData } from '../../data/payers/payerTypes';
import { PAYER_NAME_AR_LABEL } from '../../data/payers/payer.data';

/** A named field-filling action, so steps can be filled with one field omitted. */
type FieldFillers = Record<string, () => Promise<void>>;

/**
 * The multi-step "Add New Payer" side-panel wizard.
 *
 * Extends the shared EntityWizardDialog (field-by-label pattern) and adds only
 * the payer-specific step methods. Verified structure:
 *   - drawer:        div.pbm-form-drawer (PrimeNG p-drawer)
 *   - field prefix:  payer-dialog  (div.payer-dialog__field / label.payer-dialog__label)
 *   - field error:   small.pbm-field-error  ("This field is required.")
 *   - steps:         Basic Information -> Contact Information -> Effective Period
 *   - final action:  "Save" (Send for Approval is a separate list-row action)
 */
export class PayerFormDialog extends EntityWizardDialog {
  constructor(page: Page) {
    super(page, 'payer-dialog');
  }

  /** Scope the wizard to the payer drawer specifically (the app also renders a
   *  navigation <complementary> that the base selector would otherwise match). */
  protected override panel(): Locator {
    return this.page.locator('.pbm-form-drawer');
  }

  async waitForOpen(): Promise<void> {
    await expect(this.panel()).toBeVisible({ timeout: Timeouts.default });
  }

  async waitForClosed(): Promise<void> {
    await expect(this.panel()).toHaveCount(0, { timeout: Timeouts.default });
  }

  // ---- Per-step field fillers (single source of truth, keyed by label) ------

  private basicFillers(data: PayerData): FieldFillers {
    return {
      'Payer Name': () => this.fillTextField('Payer Name', data.nameEn),
      [PAYER_NAME_AR_LABEL]: () => this.fillTextField(PAYER_NAME_AR_LABEL, data.nameAr),
      'Payer Type': () => this.selectDropdownOption('Payer Type', data.type),
    };
  }

  private contactFillers(data: PayerData): FieldFillers {
    return {
      'Email Address': () => this.fillTextField('Email Address', data.email),
      // First textbox in the Phone Number field is the digit-masked subscriber
      // (the +966 dial code is a separate combobox left at its default).
      'Phone Number': () => this.fillTextField('Phone Number', data.phone),
      'License Number': () => this.fillTextField('License Number', data.licenseNumber),
      City: () => this.selectDropdownOption('City', data.city),
      'Preferred Language': () => this.selectDropdownOption('Preferred Language', data.language),
      'Preferred Contact Method': () =>
        this.selectDropdownOption('Preferred Contact Method', data.contactMethod),
    };
  }

  private effectiveFillers(data: PayerData): FieldFillers {
    return {
      'Effective Date': () => this.fillDateField('Effective Date', data.effectiveDate),
      'Expiry Date': () => this.fillDateField('Expiry Date', data.expiryDate),
    };
  }

  private async runFillers(fillers: FieldFillers, exceptLabel?: string): Promise<void> {
    for (const [label, fill] of Object.entries(fillers)) {
      if (label !== exceptLabel) {
        await fill();
      }
    }
  }

  // ---- Step 1: Basic Information -------------------------------------------

  async fillBasicInformation(data: PayerData, exceptLabel?: string): Promise<void> {
    Logger.step('Filling Basic Information');
    await this.runFillers(this.basicFillers(data), exceptLabel);
  }

  // ---- Step 2: Contact Information ------------------------------------------

  async fillContactInformation(data: PayerData, exceptLabel?: string): Promise<void> {
    Logger.step('Filling Contact Information');
    await this.runFillers(this.contactFillers(data), exceptLabel);
  }

  // ---- Step 3: Effective Period --------------------------------------------

  private dateInput(label: string): Locator {
    return this.field(label).locator('input.p-datepicker-input');
  }

  /** Types a DD/MM/YYYY value into a PrimeNG datepicker and commits with Enter. */
  async fillDateField(label: string, value: string): Promise<void> {
    Logger.step(`Setting "${label}" to "${value}"`);
    const input = this.dateInput(label);
    await input.click();
    await input.fill(value);
    await input.press('Enter');
  }

  async fillEffectivePeriod(data: PayerData, exceptLabel?: string): Promise<void> {
    Logger.step('Filling Effective Period');
    await this.runFillers(this.effectiveFillers(data), exceptLabel);
    // PrimeNG occasionally clears a sibling datepicker when the other opens;
    // re-affirm any value that was supposed to be set.
    if (exceptLabel !== 'Effective Date') {
      await this.ensureDateValue('Effective Date', data.effectiveDate);
    }
    if (exceptLabel !== 'Expiry Date') {
      await this.ensureDateValue('Expiry Date', data.expiryDate);
    }
  }

  private async ensureDateValue(label: string, value: string): Promise<void> {
    if ((await this.dateInput(label).inputValue()) !== value) {
      await this.fillDateField(label, value);
    }
  }

  /** Clears a field's value (text or date), e.g. to make a record incomplete. */
  async clearField(label: string): Promise<void> {
    Logger.step(`Clearing "${label}"`);
    // Wait for the field (and its control) to render before probing its type -
    // count() does not auto-wait, so this avoids racing the step transition.
    await this.field(label).waitFor({ state: 'visible', timeout: Timeouts.default });
    const dateInput = this.dateInput(label);
    if ((await dateInput.count()) > 0) {
      await dateInput.fill('');
      await dateInput.press('Enter');
      return;
    }
    await this.field(label).getByRole('textbox').first().fill('');
  }

  // ---- Submission / validation ---------------------------------------------

  /** Clicks the final "Save" action (persists the payer as a private Draft). */
  async save(): Promise<void> {
    await this.clickSubmit('Save');
  }

  /** Closes the wizard, discarding unsaved changes via the guard dialog. The
   *  callers always have a dirty form, so the "Unsaved Changes" guard appears. */
  async closeAndDiscard(): Promise<void> {
    await this.panel().locator('button.pbm-form-drawer__close').click();
    const guard = new ConfirmDialog(this.page);
    await guard.waitForVisible();
    await guard.confirm('Discard Changes');
    await this.waitForClosed();
  }

  /** The inline field-level error under a given field. */
  fieldError(label: string): Locator {
    return this.field(label).locator('small.pbm-field-error');
  }

  async expectFieldRequired(label: string, message: string): Promise<void> {
    await expect(this.fieldError(label)).toHaveText(message, { timeout: Timeouts.default });
  }

  /** Asserts a specific inline validation message under a field (e.g. bad email). */
  async expectFieldError(label: string, message: string): Promise<void> {
    await expect(this.fieldError(label)).toHaveText(message, { timeout: Timeouts.default });
  }

  /** Fills every step with valid data and saves - the create happy path. */
  async createPayer(data: PayerData): Promise<void> {
    await this.waitForOpen();
    await this.fillBasicInformation(data);
    await this.clickNext();
    await this.fillContactInformation(data);
    await this.clickNext();
    await this.fillEffectivePeriod(data);
    await this.save();
  }
}
