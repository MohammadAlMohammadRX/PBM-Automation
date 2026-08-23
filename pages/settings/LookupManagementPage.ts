import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import type { LookupItemData } from '../../data/payers/filterPayer.data';

/**
 * Lookup (reference-data) administration - System Settings > Lookups.
 *
 * Verified structure for a lookup category page
 * (`/system-settings/lookup-management/<category>`):
 *   - an "Add Item" button opening the shared `.pbm-form-drawer`
 *   - drawer field prefix `lookup-item-form` (div.lookup-item-form__field)
 *   - fields: Code, Name, الاسم, Display Order, Is Active; actions Cancel / Save
 *   - each existing value row offers Edit / Delete
 *
 * This is what makes a configurable Payer Type testable end to end: a value can
 * be added here and must then appear in the Payer list's Type filter with no
 * code change.
 */
export class LookupManagementPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Opens a lookup category, e.g. "payerType". */
  async openCategory(category: string): Promise<void> {
    await this.goto(`${AppRoutes.lookupManagement}/${category}`);
    await this.ensureTableView();
  }

  /** The most recently opened drawer - a stale one can linger in the DOM. */
  private drawer(): Locator {
    return this.page.locator('.pbm-form-drawer').last();
  }

  /**
   * A field's text input, located from its visible label. Falls back to the
   * drawer's inputs by position if the label wrapper cannot be matched, which
   * keeps this working if the markup is adjusted.
   */
  private drawerInput(label: string, fallbackIndex: number): Locator {
    const byLabel = this.drawer()
      .locator('div.lookup-item-form__field')
      .filter({ hasText: label })
      .locator('input')
      .first();
    const byPosition = this.drawer().locator('input.lookup-item-form__input').nth(fallbackIndex);
    return byLabel.or(byPosition).first();
  }

  private row(value: string): Locator {
    return this.page.getByRole('row').filter({ hasText: value }).first();
  }

  /** Adds a lookup value and waits for it to appear in the list. */
  async addItem(item: LookupItemData): Promise<void> {
    Logger.step(`Adding lookup item "${item.nameEn}"`);
    await this.page.getByRole('button', { name: 'Add Item', exact: true }).click();
    await expect(this.drawer()).toBeVisible({ timeout: Timeouts.default });

    // The application only registers values entered as a user would type them.
    await this.typeInto(this.drawerInput('Code', 0), item.code);
    await this.typeInto(this.drawerInput('Name', 1), item.nameEn);
    await this.typeInto(this.drawerInput('الاسم', 2), item.nameAr);
    await this.typeInto(
      this.drawer().locator('input.p-inputnumber-input').first(),
      item.displayOrder,
    );

    await this.drawer().getByRole('button', { name: 'Save', exact: true }).click();
    await expect(this.drawer()).toHaveCount(0, { timeout: Timeouts.default });
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
    if ((await this.row(value).count()) === 0) return;
    await this.row(value).getByRole('button', { name: 'Delete', exact: true }).click();
    await new ConfirmDialog(this.page).confirm('Yes');
    await this.waitForPageReady();
  }
}
