import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { EntityWizardDialog } from '../components/EntityWizardDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Timeouts } from '../../constants/Timeouts';
import { PAYER_FORM_FIELD, PAYER_FORM_STEPS, SCREEN } from '../../constants/ElementIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Logger } from '../../utils/Logger';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { PAYER_TYPE_AR, type PayerData } from '../../data/payers/payerTypes';
import { PAYER_NAME_AR_LABEL } from '../../data/payers/payer.data';

/** A named field-filling action, so steps can be filled with one field omitted. */
type FieldFillers = Record<string, () => Promise<void>>;

/** The wizard's steps, in order. */
export const WIZARD_STEPS = PAYER_FORM_STEPS;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * The multi-step "Add New Payer" / "Edit Payer" side-panel wizard.
 *
 * Every locator comes from the `payer-form-drawer` id namespace (see
 * PAYER_FORM_FIELD for the label -> id map). Steps: Basic Information ->
 * Contact Information -> Effective Period; the final action is "Save" (Send for
 * Approval is a separate list-row action).
 *
 * The drawer and all of its select panels and date-picker calendars are
 * portalled to <body>, outside the payer list, so everything is queried from
 * the document root.
 */
export class PayerFormDialog extends EntityWizardDialog {
  constructor(page: Page) {
    super(page, SCREEN.payerForm, PAYER_FORM_FIELD);
  }

  /**
   * The drawer host stays mounted and zero-size while closed, so it never
   * reports as visible - the title is what actually appears when it opens.
   */
  async waitForOpen(): Promise<void> {
    await expect(this.title()).toBeVisible({ timeout: Timeouts.default });
  }

  async waitForClosed(): Promise<void> {
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
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
      // The +966 dial code is its own select, left at its default, so this field
      // takes only the subscriber number.
      'Phone Number': () => this.fillTextField('Phone Number', data.phone),
      'License Number': () => this.fillTextField('License Number', data.licenseNumber),
      City: () => this.selectDropdownOption('City', data.city),
      'Preferred Language': () => this.selectDropdownOption('Preferred Language', data.language),
      'Preferred Contact Method': () =>
        this.selectDropdownOption('Preferred Contact Method', data.contactMethod),
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

  /**
   * Fills step 1 using the option text the ARABIC interface renders.
   *
   * `fillBasicInformation` cannot be reused for this. The field IDS are the same
   * in both languages - which is what makes almost every locator in this
   * framework language-independent - but the dropdown's OPTION TEXT is
   * translated, so asking for "Private" in the Arabic form waits out a full
   * action timeout on an option that is not there. That is exactly how the
   * bilingual validation-message check first failed, on a form that was working
   * perfectly.
   *
   * Only step 1 needs this: it is the only step whose options a test has to name
   * before the field under test becomes reachable.
   */
  async fillBasicInformationInArabic(data: PayerData): Promise<void> {
    Logger.step('Filling Basic Information (Arabic interface)');
    await this.fillTextField('Payer Name', data.nameEn);
    await this.fillTextField(PAYER_NAME_AR_LABEL, data.nameAr);
    await this.selectDropdownOption('Payer Type', PAYER_TYPE_AR[data.type]);
  }

  async fillContactInformation(data: PayerData, exceptLabel?: string): Promise<void> {
    Logger.step('Filling Contact Information');
    await this.runFillers(this.contactFillers(data), exceptLabel);
  }

  // ---- Step 3: Effective Period --------------------------------------------

  /**
   * Types a DD/MM/YYYY value into a PrimeNG datepicker using real keystrokes.
   * A programmatic value set (locator.fill) updates only what is displayed - the
   * datepicker's own model stays empty, so Save is then blocked by the required
   * -field check with no request ever sent. Enter commits and closes the panel.
   */
  async fillDateField(label: string, value: string): Promise<void> {
    Logger.step(`Setting "${label}" to "${value}"`);
    const input = this.field(label);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.press('Enter');
  }

  /**
   * Fills the effective period. Opening one PrimeNG datepicker can clear its
   * sibling, so both dates are written twice - unconditionally, because the
   * first field's text still reads correctly after its model has been reset, so
   * a display-only check would wrongly skip the second pass and leave the form
   * invalid.
   */
  async fillEffectivePeriod(data: PayerData, exceptLabel?: string): Promise<void> {
    Logger.step('Filling Effective Period');
    const targets = [
      { label: 'Effective Date', value: data.effectiveDate },
      { label: 'Expiry Date', value: data.expiryDate },
    ].filter((target) => target.label !== exceptLabel);

    for (const target of targets) {
      await this.fillDateField(target.label, target.value);
    }
    for (const target of targets) {
      await this.fillDateField(target.label, target.value);
    }
  }

  /**
   * Clears a field's value using real key presses. The app ignores programmatic
   * value changes, so a cleared field must be emptied with select-all + Delete
   * for the form to register it as empty.
   */
  async clearField(label: string): Promise<void> {
    Logger.step(`Clearing "${label}"`);
    const input = this.field(label);
    await input.waitFor({ state: 'visible', timeout: Timeouts.default });
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
   * Closes the wizard, discarding any unsaved changes.
   *
   * The guard only appears when the form is dirty, so a clean form (e.g. a
   * read-only inspection) closes directly. The guard is the app's shared dialog
   * with a `discard` action key - not a separate unsaved-changes dialog.
   */
  async closeAndDiscard(): Promise<void> {
    await this.clickClose();
    const guard = new ConfirmDialog(this.page);
    if (await guard.isDiscardPromptVisible()) {
      await guard.discardChanges();
    }
    await this.waitForClosed();
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

  /**
   * Asserts a field shows NO inline error.
   *
   * The positive counterpart of `expectFieldError`, and not the same as "the
   * error text does not match": a field that has never been touched has no
   * error element at all, so this asserts absence rather than emptiness. That
   * is what "accepts the input without an inline error" means for the
   * length-boundary cases.
   */
  async expectNoFieldError(label: string): Promise<void> {
    await this.goToStepContaining(label);
    await expect(this.fieldError(label)).toHaveCount(0, { timeout: Timeouts.short });
  }

  /**
   * Asserts the wizard offers a control for this label ON THE CURRENT STEP.
   *
   * Deliberately does NOT navigate to the field's step, unlike the assertions
   * below. Navigating means clicking Next, which the wizard refuses while the
   * current step is incomplete - so on a freshly opened form this would time out
   * waiting for a field it had never managed to reach, and report a missing
   * control on a wizard that has one. Callers reach the step by filling it,
   * which is what a user does, and then assert.
   */
  async expectFieldPresent(label: string): Promise<void> {
    await expect(this.field(label)).toBeVisible({ timeout: Timeouts.default });
  }

  /** Asserts a text field currently holds exactly `expected`. */
  async expectFieldValue(label: string, expected: string): Promise<void> {
    await this.goToStepContaining(label);
    await expect(this.field(label)).toHaveValue(expected, { timeout: Timeouts.default });
  }

  /**
   * Asserts how many characters a field is holding.
   *
   * Length rather than the value itself, for the over-limit case: the point
   * there is that the field truncated a longer input, and comparing against a
   * 100-character expected string would report a mismatch without saying which
   * end was wrong.
   */
  async expectFieldValueLength(label: string, expected: number): Promise<void> {
    await this.goToStepContaining(label);
    await expect
      .poll(async () => (await this.getFieldValue(label)).length, {
        timeout: Timeouts.default,
        message: `"${label}" should be holding exactly ${expected} character(s).`,
      })
      .toBe(expected);
  }

  /**
   * Asserts the field declares a `maxlength`.
   *
   * This is the application's own statement of the limit, and asserting it
   * alongside the observed truncation separates two different reasons the field
   * might hold 100 characters: a declared cap, or a coincidence of the value
   * used. Only the first is the behaviour the story requires.
   */
  async expectFieldMaxLength(label: string, expected: number): Promise<void> {
    await this.goToStepContaining(label);
    await expect(this.field(label)).toHaveAttribute('maxlength', String(expected), {
      timeout: Timeouts.default,
    });
  }

  // ---- Edit-mode helpers ----------------------------------------------------

  /** Current value of a text field (used to prove edits persisted). */
  async getFieldValue(label: string): Promise<string> {
    return this.field(label).inputValue();
  }

  /** Current selection shown by a dropdown field. */
  async getDropdownValue(label: string): Promise<string> {
    return (await this.field(label).innerText()).trim();
  }

  /**
   * True when the wizard exposes an editable control for the given label.
   *
   * A label this wizard has no mapping for means the form does not offer that
   * field at all, so the answer is a plain `false` - NOT an error. The
   * system-generated identifiers the edit tests check ("Payer ID", "Payer
   * Code") are exactly that case: they are deliberately absent from the form,
   * which is the very thing `expectFieldNotEditable` asserts.
   */
  async hasEditableField(label: string): Promise<boolean> {
    const spec = this.optionalFieldSpec(label);
    if (!spec) return false;

    const control = this.field(label);
    if ((await control.count()) === 0) return false;
    if (spec.kind === 'select') {
      return (await control.getAttribute('aria-disabled')) !== 'true';
    }
    const readonly = await control.getAttribute('readonly');
    const disabled = await control.isDisabled().catch(() => false);
    return readonly === null && !disabled;
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
    const input = this.field(label);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.blur();
  }

  private saveButton(): Locator {
    return this.submitButton();
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

  /** The 1-based stepper position of a step title. */
  private stepNumber(stepTitle: WizardStep): 1 | 2 | 3 {
    return (WIZARD_STEPS.indexOf(stepTitle) + 1) as 1 | 2 | 3;
  }

  /**
   * Jumps straight to a wizard step using its stepper bullet. In edit mode all
   * steps are already valid, so the stepper is navigable directly - far more
   * stable than chaining "Next" clicks through intermediate steps.
   */
  async goToStep(stepTitle: WizardStep): Promise<void> {
    Logger.step(`Jumping to wizard step "${stepTitle}"`);
    await this.stepBullet(this.stepNumber(stepTitle)).click();
    await this.waitForStepReady();
  }

  /** The wizard step currently on screen. */
  async activeStepTitle(): Promise<string> {
    return (await this.stepLabel(await this.activeStepNumber()).innerText()).trim();
  }

  /** Asserts the wizard is still on the given step - i.e. it refused to advance. */
  async expectActiveStep(stepTitle: WizardStep): Promise<void> {
    await expect
      .poll(() => this.activeStepNumber(), { timeout: Timeouts.default })
      .toBe(this.stepNumber(stepTitle));
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
   * Navigates the wizard until the given field is on screen.
   *
   * The field map knows which step owns each field, so this jumps straight there
   * instead of walking every step looking for it. The jump occasionally does not
   * land while the app is under load, so it is retried.
   */
  async goToStepContaining(label: string): Promise<void> {
    const target = this.field(label);
    if (await target.isVisible().catch(() => false)) return;

    const step = WIZARD_STEPS[this.fieldSpec(label).step - 1];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.goToStep(step);
      if (await target.isVisible().catch(() => false)) return;
    }
    await expect(target).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Saves the wizard from wherever it currently is. "Save" only exists on the
   * final step, so the stepper is used to jump there directly.
   */
  async saveFromAnyStep(): Promise<void> {
    // Save is rendered ONLY on the final step; steps 1 and 2 offer Next. Counted
    // rather than probed with isVisible(), which samples the current frame and
    // ignores its own timeout - so a Save button that simply had not rendered yet
    // read as "not on this step" and sent the wizard navigating needlessly.
    if ((await this.saveButton().count()) === 0) {
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

  // ---- Concurrent-edit conflict detection ----------------------------------

  /**
   * Saves and reports what the server actually said.
   *
   * The concurrent-edit story cannot be tested through the interface alone, and
   * this is why: when a stale save is rejected the application shows NOTHING -
   * no toast, no inline error - and simply leaves the drawer open. That is
   * pixel-for-pixel what a save that never fired looks like, so a UI-only test
   * cannot distinguish "the record was protected" from "the click was lost" or
   * from "the write went through". Reading the response is the only way to make
   * the protection assertable.
   *
   * The message the user should have seen is asserted SEPARATELY, by
   * `expectConflictReported` - so the two halves of the story fail
   * independently and the report says which one broke.
   */
  async saveAndCaptureOutcome(): Promise<{ status: number; body: unknown; text: string } | null> {
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.payerUpdate, () =>
      this.saveFromAnyStep(),
    );
  }

  /**
   * Asserts a captured save outcome is the CONCURRENCY conflict, not merely a 409.
   *
   * WHY THE STATUS ALONE IS NOT ENOUGH, learned the hard way. The application
   * answers 409 for more than one reason: a stale save gets "This payer has been
   * modified since it was loaded", and a duplicate email gets "Email '...' is
   * already taken". Three of these cases originally asserted only the status,
   * and when a hard-coded test address collided they went on passing - reporting
   * that concurrency was correctly detected on a save that had been refused for
   * something else entirely.
   *
   * Every conflict assertion in the story now goes through here, so the reason
   * cannot be forgotten at a single call site.
   */
  expectStaleSaveRejected(
    outcome: { status: number; text: string } | null,
    expected: { status: number; reason: string },
  ): void {
    expect(outcome, 'the stale save should have reached the server').not.toBeNull();
    expect(outcome!.status, `the save should be refused with ${expected.status}`).toBe(
      expected.status,
    );
    expect(
      outcome!.text,
      'the rejection should be the CONCURRENCY conflict. A 409 carrying any other reason - a '
        + 'duplicate email, say - means this case was refused for something other than the '
        + 'rule under test.',
    ).toContain(expected.reason);
  }

  /** Whether the drawer is still open - it stays open after a rejected save. */
  async isOpen(): Promise<boolean> {
    return this.title()
      .isVisible({ timeout: Timeouts.short })
      .catch(() => false);
  }

  /**
   * Every message the application is currently showing, from any of the places
   * it could put one.
   *
   * Collected from toasts, inline field errors and the shared dialog together,
   * because the assertion is "the user was told SOMETHING, somewhere". Checking
   * only the toast host would let a conflict reported as an inline error read as
   * a failure, and vice versa - and this story's finding is that none of them
   * carries anything at all, which is a claim worth making carefully.
   */
  async getVisibleMessages(): Promise<string[]> {
    return this.page.evaluate(() => {
      const selectors = [
        '.p-toast-summary',
        '.p-toast-detail',
        '[id$="-error"]',
        '.p-error',
        '#pbm-dialog-message',
        '#pbm-dialog-alert',
      ];
      const seen = new Set<string>();
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          const element = node as HTMLElement;
          const text = (element.innerText || '').trim().replace(/\s+/g, ' ');
          if (element.offsetParent !== null && text !== '') seen.add(text);
        });
      });
      return [...seen];
    });
  }

  /**
   * Asserts the user was told the record changed underneath them.
   *
   * Two moves on purpose, in this order: first that ANY message appeared, then
   * that it says the right thing. Today the first assertion is the one that
   * fails, which keeps the reported defect independent of the exact wording the
   * application might eventually use - see CONFLICT_MESSAGE_PATTERNS.
   */
  async expectConflictReported(pattern: RegExp): Promise<void> {
    const messages = await this.getVisibleMessages();
    expect(
      messages,
      'A rejected save must tell the user something - the application currently shows no '
        + 'toast, no inline error and no dialog, leaving the drawer open as though the click '
        + 'never landed.',
    ).not.toEqual([]);
    expect(
      messages.some((message) => pattern.test(message)),
      `One of the visible messages should say the record changed and ask for a refresh. `
        + `Saw: ${JSON.stringify(messages)}`,
    ).toBe(true);
  }
}
