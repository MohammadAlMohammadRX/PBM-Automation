import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { buttonSelector, type WizardField } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

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
    await this.field(label).fill(value);
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
  }

  async setCheckbox(label: string, checked: boolean): Promise<void> {
    const checkbox = this.field(label);
    if ((await checkbox.isChecked()) !== checked) {
      await checkbox.click();
    }
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
    await this.closeButton().click();
  }

  /** Submits the final step. The label is accepted for call-site readability
   *  only - the save control has one id regardless of what it reads. */
  async clickSubmit(submitLabel?: string): Promise<void> {
    Logger.step(`Clicking "${submitLabel ?? 'Save'}"`);
    await this.submitButton().click();
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
