import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { EntityWizardDialog } from '../components/EntityWizardDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Timeouts } from '../../constants/Timeouts';
import { PAYER_FORM_FIELD, PAYER_FORM_STEPS, SCREEN } from '../../constants/ElementIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Logger } from '../../utils/Logger';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import {
  CITY_AR,
  CONTACT_METHOD_AR,
  LANGUAGE_AR,
  PAYER_TYPE_AR,
  type PayerData,
} from '../../data/payers/payerTypes';
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

  /**
   * Waits until an EDIT drawer has actually been filled with the record.
   *
   * The drawer mounts with empty inputs and is patched when the payer's data
   * arrives, so `waitForOpen()` - which waits for the title - returns while
   * every field is still blank. A case that then read a field got '' and
   * reported the form as not pre-populated, failing in 0.2 seconds against a
   * form that populated correctly a moment later.
   *
   * Payer Name is the signal because every payer has one; it is also the first
   * step's first field, so it is present whichever step the drawer opens on.
   */
  async waitForPopulated(): Promise<void> {
    await expect(
      this.field('Payer Name'),
      'the edit drawer should be populated with the record it opened',
    ).not.toHaveValue('', { timeout: Timeouts.default });
  }

  async waitForClosed(): Promise<void> {
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  /**
   * Reads a field's value, reporting whether it could be read at all.
   *
   * For the question "did the refused save keep the user's typing?", which has
   * three answers and not two: the value is there, the value is gone, or the
   * field cannot be reached. VERIFIED that the third is what actually happens
   * after a 409 - the drawer stays open, but the wizard's steps stop responding
   * and the edited field never becomes readable, so a plain read spends its
   * full 15-second budget and fails the step with "locator.inputValue: Timeout"
   * instead of reporting what the user is left looking at.
   *
   * A case calling this can therefore state the finding: the edit is neither
   * kept nor discarded - it is stranded in a drawer that no longer works.
   */
  async readFieldIfReachable(
    label: string,
  ): Promise<{ reachable: boolean; value: string; reason: string }> {
    try {
      const value = await this.getFieldValue(label);
      return { reachable: true, value, reason: '' };
    } catch (error) {
      return {
        reachable: false,
        value: '',
        reason: (error instanceof Error ? error.message : String(error)).split('\n')[0],
      };
    }
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

  /**
   * Fills step 2 using the option text the ARABIC interface renders.
   *
   * The counterpart to `fillBasicInformationInArabic`, and needed for the same
   * reason: City, Preferred Language and Preferred Contact Method all translate
   * their options, so the English values would each wait out an action timeout.
   * Country is left at its default - the application pre-selects Saudi Arabia,
   * and changing it re-scopes the City list, which would invalidate the city
   * chosen here.
   */
  async fillContactInformationInArabic(data: PayerData): Promise<void> {
    Logger.step('Filling Contact Information (Arabic interface)');
    await this.fillTextField('Email Address', data.email);
    await this.fillTextField('Phone Number', data.phone);
    await this.fillTextField('License Number', data.licenseNumber);
    await this.selectDropdownOption('City', CITY_AR[data.city]);
    await this.selectDropdownOption('Preferred Language', LANGUAGE_AR[data.language]);
    await this.selectDropdownOption(
      'Preferred Contact Method',
      CONTACT_METHOD_AR[data.contactMethod],
    );
  }

  /** Creates a payer end to end through the ARABIC interface. */
  async createPayerInArabic(data: PayerData): Promise<void> {
    await this.waitForOpen();
    await this.fillBasicInformationInArabic(data);
    await this.clickNext();
    await this.fillContactInformationInArabic(data);
    await this.clickNext();
    await this.fillEffectivePeriod(data);
    await this.save();
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
    // WAITS FOR THE DRAWER TO SETTLE FIRST, and the direction of that wait is
    // the whole point. Several cases attempt a save whose outcome is the thing
    // under test: it may go through and close the drawer, or be withheld and
    // leave it open. Tidying up afterwards then raced the closing animation -
    // "is it open?" answered yes while the panel was still sliding away, the
    // click found the button mid-flight and then gone, and the step failed on a
    // click timeout in place of the result the case had already established.
    //
    // Waiting for HIDDEN settles that race in the only order that is safe: a
    // drawer on its way out resolves within the window and there is nothing to
    // do, while one that is genuinely staying open never resolves and is closed
    // properly below.
    const closedItself = await this.title()
      .waitFor({ state: 'hidden', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (closedItself) return;
    if ((await this.closeButton().count()) === 0) return;
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
   * Types a value into a field and asserts whether the field REFUSES it.
   *
   * Branch kept out of the spec, as the framework does elsewhere. The
   * character-set story has cases going both ways - Arabic letters in the
   * English field are refused, a '#' or an emoji is not - and a conditional in
   * the test body is how one of those ends up asserting nothing at all.
   *
   * On the accepting path the VALUE is asserted too, not just the absence of an
   * error: a field that silently stripped characters would satisfy "no error"
   * while having quietly changed what the user typed.
   */
  async expectCharacterSetOutcome(
    label: string,
    value: string,
    expectRejected: boolean,
    message: string,
  ): Promise<void> {
    await this.goToStepContaining(label);
    await this.fillTextField(label, value);
    await this.field(label).blur();

    if (expectRejected) {
      await expect(this.fieldError(label)).toHaveText(message, { timeout: Timeouts.default });
      return;
    }
    await expect(this.fieldError(label)).toHaveCount(0, { timeout: Timeouts.short });
    await expect(this.field(label)).toHaveValue(value, { timeout: Timeouts.default });
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
   * The options a dropdown currently OFFERS, without selecting any.
   *
   * Needed by the country/city cascade cases, and it is the only way to state
   * their real guarantee. The sheet asks to "force a city belonging to another
   * country onto the form"; there is no such path - City is a closed dropdown
   * whose options are re-fetched per country, so a mismatched value is
   * unselectable rather than rejected. Proving the list EXCLUDES it is the same
   * assurance, reachable through the interface that exists.
   *
   * The panel is closed again afterwards, so a caller can chain further reads
   * without an open overlay swallowing the next click.
   */
  async getDropdownOptions(label: string): Promise<string[]> {
    await this.goToStepContaining(label);
    await this.field(label).click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    const values = await options.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).innerText.trim()).filter((text) => text !== ''),
    );
    await this.page.keyboard.press('Escape');
    return [...new Set(values)];
  }

  /**
   * The dial code shown beside the subscriber number.
   *
   * Its own control rather than part of the Phone Number field, which is why it
   * is read separately - and why the creation-validation story can find it
   * pre-selected as `+966` while the sheet expects it blank.
   */
  async getDialCode(): Promise<string> {
    await this.goToStepContaining('Phone Number');
    const dialCode = this.page.locator(`#${SCREEN.payerForm}-dial-code-select`);
    await expect(dialCode).toBeVisible({ timeout: Timeouts.default });
    return (await dialCode.innerText()).trim();
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
    // Through the animation: the stepper rides the drawer panel, so a bullet is
    // unclickable while the panel is moving. See clickThroughAnimation.
    await this.clickThroughAnimation(
      this.stepBullet(this.stepNumber(stepTitle)),
      `the stepper bullet for "${stepTitle}"`,
    );
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
  /**
   * Attempts the save and reports whether the application sent anything.
   *
   * This replaced a getSaveAvailability() that read the Save button's
   * presence on the final step. That answer could not be trusted: jumping to
   * the last step from a read-only probe does not reliably move this wizard,
   * so an untouched form and a dirty one both came back "absent" - which
   * would have reported a working save as broken.
   *
   * What the callers actually want to know is whether a save HAPPENS, so that
   * is what this returns: null when no update request left the browser, and
   * the response when one did. A wizard that offers no Save, one whose Save is
   * disabled, and one that swallows the click are the same answer to "was
   * anything submitted" - which is the question the no-change stories ask.
   */
  async attemptSave(): Promise<{ status: number; body: unknown; text: string } | null> {
    return NetworkUtils.captureResponse(
      this.page,
      ApiEndpoints.payerUpdate,
      async () => {
        await this.saveFromAnyStep().catch(() => undefined);
      },
      Timeouts.short,
    );
  }

  /**
   * Clicks Save several times as fast as the browser will dispatch them.
   *
   * The duplicate-save case. The clicks are fired WITHOUT awaiting the
   * form's reaction, because awaiting between them is the pause that lets the
   * application disable the button - and a test that paused would pass without
   * ever exercising the race.
   */
  async saveRepeatedly(times: number): Promise<void> {
    if ((await this.saveButton().count()) === 0) {
      await this.goToStep('Effective Period');
    }
    await expect(this.saveButton()).toBeVisible({ timeout: Timeouts.default });
    Logger.step(`Clicking Save ${times} times in rapid succession`);
    await Promise.all(
      Array.from({ length: times }, () =>
        this.saveButton().click({ force: true, noWaitAfter: true }),
      ),
    );
  }

  /**
   * Confirms the withdrawal warning and leaves the drawer settled.
   *
   * Pressing Continue lets the save through, but the drawer does not
   * reliably close behind it - and while it is open the application treats
   * it as dirty, so the very next navigation is ABORTED by the
   * unsaved-changes guard (`net::ERR_ABORTED`). That failure surfaces one
   * step later as a broken goto, which points at the navigation instead of
   * at the drawer. So the drawer is closed here, discarding whatever the
   * form still holds: the save has already reached the server, and the
   * caller asserts the outcome on the record rather than in the form.
   */
  async confirmWithdrawal(): Promise<void> {
    await new ConfirmDialog(this.page).confirm('Continue');
    const closed = await this.waitForClosed()
      .then(() => true)
      .catch(() => false);
    if (!closed) {
      Logger.step('The drawer stayed open after the withdrawal - discarding it so navigation is not aborted'
      );
      await this.closeAndDiscard().catch(() => undefined);
    }
  }

  /**
   * Clicks Save and reports whether a confirmation dialog was raised.
   *
   * Editing a payer that is awaiting approval raises "Return this payer to
   * draft?" before saving; editing a draft does not. A caller that always
   * expected the dialog would hang on the draft path, and one that never
   * expected it would leave the dialog open - which then aborts the next
   * navigation, because the drawer is still dirty. So the answer is returned
   * and the caller decides.
   */
  async saveAndReportDialog(): Promise<boolean> {
    await this.saveFromAnyStep();
    return new ConfirmDialog(this.page).isVisible();
  }

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
   * Saves a NEW payer and reports what the server said.
   *
   * The create counterpart of `saveAndCaptureOutcome`, and a separate method
   * rather than a parameter because the two hit different endpoints -
   * CreatePayer against UpdatePayer - and a capture waiting on the wrong one
   * reports "no response" for a request that plainly happened.
   *
   * Needed for the same reason as the update version: a name over 255
   * characters is refused with 422 while the interface shows nothing, so the
   * response is the only evidence that the record was not created.
   */
  async saveNewAndCaptureOutcome(): Promise<
    { status: number; body: unknown; text: string } | null
  > {
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.payerCreate, () =>
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

  /**
   * Whether the drawer is still open - it stays open after a rejected save.
   *
   * Waits, because the option `isVisible()` takes is ignored: it is a single
   * instantaneous read. This is asked in the moment right after a save attempt,
   * while the drawer is either closing or being kept open, so an instant read
   * answers a question the application has not finished answering.
   */
  async isOpen(): Promise<boolean> {
    return this.title()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Every message the application shows within a fair window, waiting for one.
   *
   * This is what a case asserting "the user was told something" - or, more
   * often here, "the user was told NOTHING" - should call. See
   * BasePage.settleMessages: the snapshot below is instantaneous, and a claim
   * of silence made from a single instantaneous read is a claim about timing
   * rather than about the application.
   */
  async waitForVisibleMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(() => this.getVisibleMessages(), timeout);
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
    // Waited for, not snapshotted. This assertion is the one that declares the
    // application silent, so it must not be able to fail because it looked too
    // early - see WaitUtils.settleMessages.
    const messages = await this.waitForVisibleMessages();
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
