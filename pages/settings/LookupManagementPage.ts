import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { SCREEN, buttonSelector } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';
import type { LookupItemData } from '../../data/payers/filterPayer.data';

/**
 * Lookup (reference-data) administration - System Settings > Lookups.
 *
 * Ids for a lookup category page
 * (`/system-settings/lookup-management/<category>`):
 *
 *   lookup-items-add-button
 *   lookup-items-table-row-{itemId}          plus -edit / -delete actions
 *   lookup-item-form-drawer-code-input
 *   lookup-item-form-drawer-english-name-input
 *   lookup-item-form-drawer-arabic-name-input
 *   lookup-item-form-drawer-index-input      the display order
 *   lookup-item-form-drawer-is-active-checkbox
 *   lookup-item-form-drawer-cancel-button / -save-button
 *
 * This is what makes a configurable Payer Type testable end to end: a value can
 * be added here and must then appear in the Payer list's Type filter with no
 * code change.
 *
 * The drawer's fields previously had to be found by their visible label, with a
 * positional fallback (`input.lookup-item-form__input` at index N) for when the
 * label wrapper could not be matched - including one field whose label is the
 * Arabic word for "name". Each now has its own id, so both the label lookup and
 * the fallback are gone.
 */
export class LookupManagementPage extends BasePage {
  private readonly screen = SCREEN.lookupItems;
  private readonly formPrefix = SCREEN.lookupItemForm;

  constructor(page: Page) {
    super(page);
  }

  /** Opens a lookup category, e.g. "payerType". */
  async openCategory(category: string): Promise<void> {
    await this.goto(`${AppRoutes.lookupManagement}/${category}`);
    await this.ensureTableView(this.screen);
  }

  private formField(key: string): Locator {
    return this.byId(`${this.formPrefix}-${key}-input`);
  }

  private saveButton(): Locator {
    return this.page.locator(buttonSelector(`${this.formPrefix}-save-button`)).first();
  }

  private rows(): Locator {
    return this.page.locator(`tr[id^="${this.screen}-table-row-"]`);
  }

  private row(value: string): Locator {
    return this.rows().filter({ hasText: value }).first();
  }

  /** Adds a lookup value and waits for it to appear in the list. */
  async addItem(item: LookupItemData): Promise<void> {
    Logger.step(`Adding lookup item "${item.nameEn}"`);
    await this.btn(`${this.screen}-add-button`).click();
    await expect(this.formField('code')).toBeVisible({ timeout: Timeouts.default });

    // The application only registers values entered as a user would type them.
    await this.typeInto(this.formField('code'), item.code);
    await this.typeInto(this.formField('english-name'), item.nameEn);
    await this.typeInto(this.formField('arabic-name'), item.nameAr);
    await this.typeInto(this.formField('index'), item.displayOrder);

    await this.saveButton().click();
    await expect(this.formField('code')).toBeHidden({ timeout: Timeouts.default });
    await this.waitForPageReady();
  }

  private async typeInto(input: Locator, value: string): Promise<void> {
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.blur();
  }

  async expectItemListed(value: string): Promise<void> {
    await expect(this.row(value)).toBeVisible({ timeout: Timeouts.default });
  }

  /** Removes a lookup value - used to leave the reference data as it was found. */
  async deleteItem(value: string): Promise<void> {
    Logger.cleanup(`Deleting lookup item "${value}"`);
    const row = this.row(value);
    if ((await row.count()) === 0) return;
    const rowId = await row.getAttribute('id');
    if (!rowId) return;
    await this.page.locator(buttonSelector(`${rowId}-delete`)).first().click();
    await new ConfirmDialog(this.page).confirm('Yes');
    await this.waitForPageReady();
  }
}
