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

/** The wizard's steps, in order. */
export const WIZARD_STEPS = [
  'Basic Information',
  'Contact Information',
  'Effective Period',
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

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

  /**
   * Types a DD/MM/YYYY value into a PrimeNG datepicker using real keystrokes.
   * A programmatic value set (locator.fill) updates only what is displayed - the
   * datepicker's own model stays empty, so Save is then blocked by the required
   * -field check with no request ever sent. Enter commits and closes the panel.
   */
  async fillDateField(label: string, value: string): Promise<void> {
    Logger.step(`Setting "${label}" to "${value}"`);
    const input = this.dateInput(label);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.press('Enter');
  }

  /**
   * Fills the effective period. Opening one PrimeNG datepicker can clear its
   * sibling, so both dates are written and then verified together, retrying
   * until they hold - otherwise the step silently fails its required-field check.
   */
  async fillEffectivePeriod(data: PayerData, exceptLabel?: string): Promise<void> {
    Logger.step('Filling Effective Period');
    const targets = [
      { label: 'Effective Date', value: data.effectiveDate },
      { label: 'Expiry Date', value: data.expiryDate },
    ].filter((target) => target.label !== exceptLabel);

    // First pass: set both dates.
    for (const target of targets) {
      await this.fillDateField(target.label, target.value);
    }
    // Second pass, UNCONDITIONALLY: opening the second picker resets the first
    // one's internal model even though its text still reads correctly, so a
    // display-only check would wrongly skip this and leave the form invalid.
    for (const target of targets) {
      await this.fillDateField(target.label, target.value);
    }
  }

  /**
   * Clears a field's value (text or date) using real key presses. The app
   * ignores programmatic value changes, so a cleared field must be emptied with
   * select-all + Delete for the form to register it as empty.
   */
  async clearField(label: string): Promise<void> {
    Logger.step(`Clearing "${label}"`);
    // Wait for the field (and its control) to render before probing its type -
    // count() does not auto-wait, so this avoids racing the step transition.
    await this.field(label).waitFor({ state: 'visible', timeout: Timeouts.default });
    const dateInput = this.dateInput(label);
    const input = (await dateInput.count()) > 0
      ? dateInput
      : this.field(label).getByRole('textbox').first();
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    await input.blur();
  }

  // ---- Submission / validation ---------------------------------------------

  /** Clicks the final "Save" action (persists the payer as a private Draft). */
  async save(): Promise<void> {
    await this.clickSubmit('Save');
  }

  /**
   * Closes the wizard. The "Unsaved Changes" guard only appears when the form
   * is dirty, so a clean form (e.g. a read-only inspection) closes directly.
   */
  async closeAndDiscard(): Promise<void> {
    await this.panel().locator('button.pbm-form-drawer__close').click();
    const discard = this.page.locator('.p-dialog .pbm-dialog__actions button', {
      hasText: 'Discard Changes',
    });
    await expect(this.panel().or(discard).first()).toBeVisible({ timeout: Timeouts.short }).catch(
      () => undefined,
    );
    if (await discard.isVisible().catch(() => false)) {
      await discard.click();
    }
    await this.waitForClosed();
  }

  /** The inline field-level error under a given field. */
  fieldError(label: string): Locator {
    return this.field(label).locator('small.pbm-field-error');
  }

  async expectFieldRequired(label: string, message: string): Promise<void> {
    await this.expectFieldError(label, message);
  }

  /**
   * Asserts a specific inline validation message under a field. Saving happens
   * from the last step, but each error renders on the step that owns the field,
   * so the wizard is moved back to that step before asserting.
   */
  async expectFieldError(label: string, message: string): Promise<void> {
    await this.goToStepContaining(label);
    await expect(this.fieldError(label)).toHaveText(message, { timeout: Timeouts.default });
  }

  // ---- Edit-mode helpers ----------------------------------------------------

  /** Current value of a text field (used to prove edits persisted). */
  async getFieldValue(label: string): Promise<string> {
    return this.field(label).getByRole('textbox').first().inputValue();
  }

  /** Current selection shown by a dropdown field. */
  async getDropdownValue(label: string): Promise<string> {
    return (await this.field(label).getByRole('combobox').first().innerText()).trim();
  }

  /** True when the wizard exposes an editable control for the given label. */
  async hasEditableField(label: string): Promise<boolean> {
    const container = this.field(label);
    if ((await container.count()) === 0) return false;
    const editable = container.locator('input:not([readonly]):not([disabled]), [role="combobox"]');
    return (await editable.count()) > 0;
  }

  /**
   * Asserts a system-generated field cannot be edited: it is either absent from
   * the form entirely, or rendered read-only/disabled.
   */
  async expectFieldNotEditable(label: string): Promise<void> {
    expect(
      await this.hasEditableField(label),
      `Field "${label}" must not be editable in the payer edit form.`,
    ).toBe(false);
  }

  /**
   * Navigates to the step holding a field, then sets its value.
   *
   * Edit mode needs REAL keystrokes: the app compares the edited form against
   * the loaded record to decide whether anything changed, and a programmatic
   * value set (locator.fill) leaves that comparison seeing "no changes made".
   * Selecting the existing text and typing over it fires the full key event
   * sequence, so the change is registered and the draft is created.
   */
  async setFieldValue(label: string, value: string, kind: 'text' | 'dropdown'): Promise<void> {
    await this.goToStepContaining(label);
    if (kind === 'dropdown') {
      await this.selectDropdownOption(label, value);
      return;
    }
    Logger.step(`Typing "${value}" into "${label}"`);
    const input = this.field(label).getByRole('textbox').first();
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.blur();
  }

  private nextButton(): Locator {
    return this.panel().getByRole('button', { name: 'Next', exact: true });
  }

  private saveButton(): Locator {
    return this.panel().getByRole('button', { name: 'Save', exact: true });
  }

  /**
   * Waits for the wizard footer to finish rendering after a step transition.
   * Every step exposes exactly one of "Next" (steps 1-2) or "Save" (last step),
   * so waiting for either avoids racing the Angular step change.
   */
  private async waitForStepReady(): Promise<void> {
    await expect(this.saveButton().or(this.nextButton()).first()).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /**
   * Jumps straight to a wizard step using its stepper bullet. In edit mode all
   * steps are already valid, so the stepper is navigable directly - which is far
   * more stable than chaining "Next" clicks through intermediate steps.
   */
  async goToStep(stepTitle: WizardStep): Promise<void> {
    Logger.step(`Jumping to wizard step "${stepTitle}"`);
    const bullet = this.panel()
      .locator('.pbm-stepper__step')
      .filter({ hasText: stepTitle })
      .locator('.pbm-stepper__bullet');
    await bullet.click();
    await this.waitForStepReady();
  }

  /** The wizard step currently on screen. */
  async activeStepTitle(): Promise<string> {
    return (
      await this.panel().locator('.pbm-stepper__step.is-active .pbm-stepper__label').innerText()
    ).trim();
  }

  /** Asserts the wizard is still on the given step - i.e. it refused to advance. */
  async expectActiveStep(stepTitle: WizardStep): Promise<void> {
    await expect(
      this.panel().locator('.pbm-stepper__step.is-active .pbm-stepper__label'),
    ).toHaveText(stepTitle, { timeout: Timeouts.default });
  }

  /**
   * Attempts to advance to the next step. Validation is enforced per field, so
   * an invalid or empty required field must keep the wizard on the same step.
   */
  async attemptNext(): Promise<void> {
    await this.waitForStepReady();
    if (await this.nextButton().isVisible().catch(() => false)) {
      await this.nextButton().click();
    }
  }

  /**
   * Navigates the wizard until the given field is on screen. The stepper jump
   * occasionally does not land while the app is under load, so each step is
   * tried more than once before giving up.
   */
  async goToStepContaining(label: string): Promise<void> {
    const target = this.field(label).first();
    if (await target.isVisible().catch(() => false)) return;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      for (const step of WIZARD_STEPS) {
        await this.goToStep(step);
        if (await target.isVisible().catch(() => false)) return;
      }
    }
    await expect(target).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Saves the wizard from wherever it currently is. "Save" only exists on the
   * final step, so the stepper is used to jump there directly.
   */
  async saveFromAnyStep(): Promise<void> {
    if (!(await this.saveButton().isVisible().catch(() => false))) {
      await this.goToStep('Effective Period');
    }
    await expect(this.saveButton()).toBeVisible({ timeout: Timeouts.default });
    await this.saveButton().click();
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
