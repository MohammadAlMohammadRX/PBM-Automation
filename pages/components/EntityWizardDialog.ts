import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * Generic base for the multi-step "Add/Edit <Entity>" side-panel wizards
 * used throughout PBM (Add Payer, Add Network, Add User, ...).
 *
 * Verified pattern (consistent across Payer/Network/User dialogs):
 *   <div class="{prefix}__field">
 *     <label class="{prefix}__label">Field Label</label>
 *     <pbm-input-text ...><input class="{prefix}__input" .../></pbm-input-text>
 *   </div>
 * Fields never carry a stable id/name (the app renders id="null"), so the
 * field's own label text is the most stable available locator - which is
 * exactly why this base class centralizes "find the field by its label"
 * instead of every Page Object re-inventing that lookup.
 *
 * Concrete dialogs (PayerCreateDialog, NetworkCreateDialog, UserCreateDialog)
 * extend this and only add entity-specific step methods.
 */
export abstract class EntityWizardDialog {
  protected readonly page: Page;

  protected constructor(page: Page, private readonly fieldClassPrefix: string) {
    this.page = page;
  }

  protected panel(): Locator {
    return this.page.locator('aside, .p-drawer, [role="complementary"]').last();
  }

  /** Locates the field wrapper (label + control) by the field's visible label text.
   *  Public so tests/Page Objects can assert on a specific field's visibility
   *  (e.g. to confirm a wizard advanced past the step that field belongs to). */
  field(label: string): Locator {
    return this.panel().locator(`div.${this.fieldClassPrefix}__field`, { hasText: label });
  }

  private fieldContainer(label: string): Locator {
    return this.field(label);
  }

  async fillTextField(label: string, value: string): Promise<void> {
    Logger.step(`Filling "${label}" with "${value}"`);
    await this.fieldContainer(label).getByRole('textbox').first().fill(value);
  }

  async selectDropdownOption(label: string, optionText: string): Promise<void> {
    Logger.step(`Selecting "${optionText}" for "${label}"`);
    await this.fieldContainer(label).getByRole('combobox').click();
    await this.page.getByRole('option', { name: optionText }).click();
  }

  async setCheckbox(label: string, checked: boolean): Promise<void> {
    const checkbox = this.fieldContainer(label).getByRole('checkbox');
    const isChecked = await checkbox.isChecked();
    if (isChecked !== checked) {
      await checkbox.click();
    }
  }

  async clickNext(): Promise<void> {
    Logger.step('Clicking "Next"');
    await this.panel().getByRole('button', { name: 'Next', exact: true }).click();
  }

  async clickBack(): Promise<void> {
    await this.panel().getByRole('button', { name: 'Back', exact: true }).click();
  }

  async clickCancel(): Promise<void> {
    Logger.step('Clicking "Cancel"');
    await this.panel().getByRole('button', { name: 'Cancel', exact: true }).click();
  }

  async clickClose(): Promise<void> {
    await this.panel().getByRole('button', { name: 'Close', exact: true }).click();
  }

  /** Submits the final step. The exact label ("Submit", "Save", "Create") is
   *  passed in by the concrete dialog since it varies by module/step. */
  async clickSubmit(submitLabel: string): Promise<void> {
    Logger.step(`Clicking "${submitLabel}"`);
    await this.panel().getByRole('button', { name: submitLabel, exact: true }).click();
  }

  async verifyStepHeadingVisible(heading: string): Promise<void> {
    await expect(this.panel().getByText(heading, { exact: false })).toBeVisible({ timeout: Timeouts.default });
  }
}
