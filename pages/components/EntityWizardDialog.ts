import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { TOAST, buttonSelector, type WizardField } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';
import { ConfirmDialog } from './ConfirmDialog';
import { WaitUtils } from '../../utils/WaitUtils';

/**
 * Generic base for the multi-step "Add/Edit <Entity>" side-panel wizards used
 * throughout PBM (Add Payer, Add Network, Add User, ...).
 *
 * Every wizard is rendered from the shared form-drawer component and takes its
 * id namespace from the screen that opened it, so one prefix plus a field map
 * describes the whole drawer:
 *
 *   {prefix}                        the drawer host
 *   {prefix}-title / -close
 *   {prefix}-stepper-step-{n}       step, plus -bullet and -label
 *   {prefix}-{fieldKey}-input       a text / date control
 *   {prefix}-{fieldKey}-select      a dropdown's combobox
 *   {prefix}-{fieldKey}-error       that field's validation message
 *   {prefix}-back-button            "Cancel" on step 1, "Back" afterwards
 *   {prefix}-next-button            steps before the last
 *   {prefix}-save-button            the last step only
 *
 * The subclass supplies a LABEL -> field map, so callers keep addressing fields
 * by their visible label while every locator is built from an id. That was the
 * whole point of the id work here: fields previously had no usable id at all
 * (the app rendered `id="null"`), which forced a `div.{prefix}__field` +
 * label-text lookup, and made the Arabic run break whenever a label was
 * reworded.
 */
export abstract class EntityWizardDialog {
  protected readonly page: Page;

  protected constructor(
    page: Page,
    /** The drawer's id namespace, e.g. `payer-form-drawer`. */
    protected readonly prefix: string,
    /** Visible field label -> its id segment, control kind and step. */
    protected readonly fields: Record<string, WizardField>,
  ) {
    this.page = page;
  }

  /**
   * The drawer host. PrimeNG keeps it mounted permanently and it is zero-size
   * while closed, so it never reports as visible - `waitForOpen` asserts on the
   * title inside it instead.
   */
  protected panel(): Locator {
    return this.page.locator(`#${this.prefix}`);
  }

  protected title(): Locator {
    return this.page.locator(`#${this.prefix}-title`);
  }

  /**
   * A field's spec, or `undefined` when this wizard has no such field.
   *
   * Use this for questions that a MISSING field legitimately answers - most
   * importantly "is this field editable?", where a system-generated value like
   * Payer ID or Payer Code is simply not on the form at all. Throwing there
   * would turn a passing assertion into an error.
   */
  protected optionalFieldSpec(label: string): WizardField | undefined {
    return this.fields[label];
  }

  /**
   * Resolves a field label to its spec, failing loudly on an unknown label.
   *
   * Use this when the caller intends to READ or WRITE the field: an unmapped
   * label there is a programming error, and a clear message naming the known
   * fields beats a bare locator timeout.
   */
  protected fieldSpec(label: string): WizardField {
    const spec = this.optionalFieldSpec(label);
    if (!spec) {
      throw new Error(
        `[EntityWizardDialog] No id mapping for field "${label}". `
          + `Known fields: ${Object.keys(this.fields).join(', ')}`,
      );
    }
    return spec;
  }

  /**
   * The control for a field.
   *
   * Public so tests/Page Objects can assert on a specific field's visibility -
   * e.g. to confirm the wizard advanced past the step that field belongs to.
   * Note this is now the CONTROL itself, not the wrapper div the old
   * implementation returned; every caller wanted the control.
   */
  field(label: string): Locator {
    const spec = this.fieldSpec(label);
    const suffix = spec.kind === 'select' ? 'select' : 'input';
    return this.page.locator(`#${this.prefix}-${spec.key}-${suffix}`);
  }

  /** A field's inline validation message - present only while it is invalid. */
  fieldError(label: string): Locator {
    return this.page.locator(`#${this.prefix}-${this.fieldSpec(label).key}-error`);
  }

  async fillTextField(label: string, value: string): Promise<void> {
    Logger.step(`Filling "${label}" with "${value}"`);
    const input = this.field(label);
    await input.fill(value);

    // Post-condition: something actually landed in the control. Deliberately NOT
    // an equality check - several fields transform what is typed (the phone
    // control is digit-masked and drops non-digits, dates are reformatted), so
    // demanding the exact string back would fail on correct behaviour. What
    // matters is catching the silent case: a masked or read-only field that
    // accepted the keystrokes and kept nothing.
    if (value !== '') {
      await expect(input).not.toHaveValue('', { timeout: Timeouts.short });
    }
  }

  /**
   * Opens a dropdown and picks an option.
   *
   * The select's id lands on its inner `span[role="combobox"]`, which is the
   * element that opens the panel. Option elements get PrimeNG-generated,
   * render-order-dependent ids, so the option itself is still matched by label -
   * the one place the framework cannot be id-based. Overlays are portalled to
   * <body> and a closed one can linger, so only the visible overlay is clicked.
   */
  async selectDropdownOption(label: string, optionText: string): Promise<void> {
    Logger.step(`Selecting "${optionText}" for "${label}"`);
    await this.field(label).click();
    await this.page
      .getByRole('option', { name: optionText, exact: true })
      .filter({ visible: true })
      .first()
      .click();

    // Post-condition: the trigger now shows the chosen option. A PrimeNG select
    // can swallow a click on a portalled overlay and leave the previous value in
    // place, which is invisible here and surfaces much later as a saved record
    // with the wrong data.
    await expect(this.field(label)).toContainText(optionText, { timeout: Timeouts.short });
  }

  async setCheckbox(label: string, checked: boolean): Promise<void> {
    const checkbox = this.field(label);
    if ((await checkbox.isChecked()) !== checked) {
      await checkbox.click();
    }
  }


  // ---- Lifecycle shared by every wizard (lifted from PayerFormDialog 2026-10-21,
  // when the Network wizard became the second user) --------------------------

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

  /**
   * Types a DD/MM/YYYY value into a PrimeNG datepicker using real keystrokes.
   * A programmatic value set (locator.fill) updates only what is displayed - the
   * datepicker's own model stays empty, so Save is then blocked by the required
   * -field check with no request ever sent. Enter commits and closes the panel.
   */
  async fillDateField(label: string, value: string): Promise<void> {
    const input = this.field(label);
    // DATE AND TIME since the 2026-10-12 build. The pickers now read
    // "DD/MM/YYYY HH:mm"; a bare date is rejected, the field stays empty and
    // Save is refused with "This field is required." - which blocked every
    // payer the suite creates (found by 14911, 2026-10-13). A date-only value
    // gets 23:59, which keeps "today" from reading as earlier than now and
    // leaves past and future dates on the same day.
    const placeholder = (await input.getAttribute('placeholder').catch(() => '')) ?? '';
    if (/HH:mm/i.test(placeholder) && /^\d{2}\/\d{2}\/\d{4}$/.test(value.trim())) value = `${value.trim()} 23:59`;
    Logger.step(`Setting "${label}" to "${value}"`);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.press('Enter');
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

  // ---- Field reading and validation (lifted from PayerFormDialog 2026-10-21) ----

  /**
   * Navigates the wizard until the given field is on screen, by the step its
   * field map assigns it - the stepper bullet for that step number. Retried,
   * because a bullet on a sliding panel does not always take the first click.
   * PayerFormDialog overrides this with its step-title navigation.
   */
  async goToStepContaining(label: string): Promise<void> {
    const target = this.field(label);
    if (await target.isVisible().catch(() => false)) return;
    const step = this.fieldSpec(label).step;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.clickThroughAnimation(this.stepBullet(step), `the stepper bullet for step ${step}`);
      const shown = await target
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      if (shown) return;
    }
    await expect(target).toBeVisible({ timeout: Timeouts.default });
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

  /**
   * Whether a field can be typed into: present, enabled and not read-only.
   * A field that is missing altogether also counts as not editable - a form
   * that hides the control has refused the edit as surely as one that locks it.
   */
  async isFieldEditable(label: string): Promise<boolean> {
    const field = this.field(label);
    if ((await field.count()) === 0) return false;
    return field.isEditable({ timeout: Timeouts.short }).catch(() => false);
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
   * Types into a dropdown's filter box and returns what survives.
   *
   * Returns an EMPTY LIST when the overlay carries no filter input, so a case
   * can report "this control offers no search" instead of timing out against a
   * box that was never rendered. PrimeNG renders the filter only when the
   * component asks for it, and a three-entry catalogue may well not.
   *
   * locator-exception: the filter input is a PrimeNG internal with no id.
   * Scoped to the open overlay, which is reached from the field's own id.
   */
  async filterDropdownOptions(label: string, query: string): Promise<string[]> {
    await this.goToStepContaining(label);
    await this.field(label).click();
    const filter = this.page.locator('.p-select-filter, .p-dropdown-filter').first();
    const hasFilter = await filter
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (!hasFilter) {
      await this.page.keyboard.press('Escape');
      Logger.warn(`The "${label}" dropdown offers no filter box - returning no matches`);
      return [];
    }
    await filter.fill(query);
    const options = this.page.getByRole('option').filter({ visible: true });
    const values = await options
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).innerText.trim()))
      .catch(() => []);
    await this.page.keyboard.press('Escape');
    return values.filter((text) => text !== '');
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
      `Field "${label}" must not be editable in this form.`,
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
    // THE APPLICATION'S OWN TOAST IDS COME FIRST, and their absence here was a
    // long-running false negative. This list used to name PrimeNG's
    // `.p-toast-summary`, which the application does not render: it wraps the
    // toast in its own markup and puts the text in `#pbm-toast-summary`. The
    // two read almost identically, so a duplicate-email save that DID show
    // "Email 'dd@dd.dd' is already taken." was reported as showing nothing at
    // all. PayerDetailPage has always read the right id; only this copy drifted.
    //
    // `offsetParent` is no longer the visibility test either. It is null for
    // any position:fixed element, and a toast is exactly that - so even the
    // right selector would have been discarded. A laid-out box is the honest
    // check.
    const selectors = [
      `#${TOAST.summary}`,
      `#${TOAST.detail}`,
      '.p-toast-summary',
      '.p-toast-detail',
      '[id$="-error"]',
      '.p-error',
      '#pbm-dialog-message',
      '#pbm-dialog-alert',
    ];
    return this.page.evaluate((queries) => {
      const seen = new Set<string>();
      queries.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          const element = node as HTMLElement;
          const text = (element.innerText || '').trim().replace(/\s+/g, ' ');
          if (text === '') return;
          const style = window.getComputedStyle(element);
          const laidOut = element.getBoundingClientRect().height > 0;
          if (laidOut && style.visibility !== 'hidden' && style.display !== 'none') {
            seen.add(text);
          }
        });
      });
      return [...seen];
    }, selectors);
  }

  // ---- Footer actions -------------------------------------------------------

  protected nextButton(): Locator {
    return this.page.locator(buttonSelector(`${this.prefix}-next-button`)).first();
  }

  /**
   * The footer's secondary action. One element serves both roles: it reads
   * "Cancel" on the first step and "Back" on later ones, so `clickBack()` and
   * `clickCancel()` are deliberately the same control.
   */
  protected backButton(): Locator {
    return this.page.locator(buttonSelector(`${this.prefix}-back-button`)).first();
  }

  protected submitButton(): Locator {
    return this.page.locator(buttonSelector(`${this.prefix}-save-button`)).first();
  }

  protected closeButton(): Locator {
    return this.page.locator(buttonSelector(`${this.prefix}-close`)).first();
  }

  async clickNext(): Promise<void> {
    Logger.step('Clicking "Next"');
    await this.nextButton().click();
  }

  async clickBack(): Promise<void> {
    await this.backButton().click();
  }

  async clickCancel(): Promise<void> {
    Logger.step('Clicking "Cancel"');
    await this.backButton().click();
  }

  async clickClose(): Promise<void> {
    await this.clickThroughAnimation(this.closeButton(), 'the drawer close button');
  }

  /**
   * Clicks a control that belongs to the drawer's own chrome, tolerating the
   * drawer being mid-animation.
   *
   * The close button and the stepper bullets sit on a panel that slides, and
   * Playwright will not click an element whose box is still moving - it retries
   * until the actionability timeout and then fails with "element is not
   * stable". Observed for 15 seconds at a stretch after a save that the server
   * answered but the drawer did not act on, so the panel never settled: the
   * step failed on a click timeout rather than on its own subject.
   *
   * A normal click is tried first, so genuine problems - a control that is
   * absent, covered or disabled - still surface as themselves. Only the
   * stability check is bypassed on the retry, and only for chrome whose
   * position is the thing in motion.
   */
  protected async clickThroughAnimation(locator: Locator, description: string): Promise<void> {
    const clicked = await locator
      .click({ timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (clicked) return;
    Logger.warn(`${description} would not settle - clicking through the animation`);
    await locator.click({ force: true, timeout: Timeouts.short });
  }

  /** Submits the final step. The label is accepted for call-site readability
   *  only - the save control has one id regardless of what it reads. */
  async clickSubmit(submitLabel?: string): Promise<void> {
    Logger.step(`Clicking "${submitLabel ?? 'Save'}"`);
    await this.submitButton().click();
  }

  /**
   * Clicks Save several times without waiting between them.
   *
   * For the cases that ask whether a repeated submission can create a second
   * record. The clicks are fired WITHOUT awaiting the form's reaction, because
   * awaiting between them is exactly the pause that lets the application
   * disable the button - the test would then pass without ever having raced
   * anything. Mirrors ConfirmDialog.confirmRepeatedly, which makes the same
   * argument for the confirmation dialogs.
   */
  async saveRepeatedly(times: number): Promise<void> {
    Logger.step(`Clicking "Save" ${times} times in rapid succession`);
    const button = this.submitButton();
    await button.scrollIntoViewIfNeeded();
    await Promise.all(
      Array.from({ length: times }, () => button.click({ force: true, noWaitAfter: true })),
    );
  }

  // ---- Stepper --------------------------------------------------------------

  /** A stepper entry by its 1-based position, which is part of the flow's
   *  definition rather than an array offset. */
  protected step(stepNumber: number): Locator {
    return this.page.locator(`#${this.prefix}-stepper-step-${stepNumber}`);
  }

  protected stepBullet(stepNumber: number): Locator {
    return this.page.locator(buttonSelector(`${this.prefix}-stepper-step-${stepNumber}-bullet`)).first();
  }

  protected stepLabel(stepNumber: number): Locator {
    return this.page.locator(`#${this.prefix}-stepper-step-${stepNumber}-label`);
  }

  /**
   * The step currently on screen, as a 1-based number.
   *
   * Which step is active is exposed as a CSS class rather than an id or an ARIA
   * attribute, so the class is read here - but only to answer "which of these
   * identified steps is active", never to identify the element itself.
   */
  protected async activeStepNumber(): Promise<number> {
    // Steps are ENUMERATED by id; only the active-state flag is read from the
    // class, because the application exposes that state nowhere else. So
    // identity comes from the id and never from the markup.
    const ids = (
      await this.page
        .locator(`[id^="${this.prefix}-stepper-step-"]`)
        .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).id))
    ).filter((id) => /-step-\d+$/.test(id));

    for (const id of ids) {
      const className = (await this.page.locator(`#${id}`).getAttribute('class')) ?? '';
      if (className.includes('is-active')) {
        return Number(id.split('-').pop());
      }
    }
    return 1;
  }

  /**
   * Asserts a wizard step's heading is on screen, matched against the stepper's
   * own label elements rather than any text inside the drawer.
   */
  async verifyStepHeadingVisible(heading: string): Promise<void> {
    const labels = this.page.locator(`[id^="${this.prefix}-stepper-step-"][id$="-label"]`);
    await expect(labels.filter({ hasText: heading }).first()).toBeVisible({
      timeout: Timeouts.default,
    });
  }
}
