import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import { ADVANCED_SEARCH_FIELDS } from '../../data/payers/searchPayer.data';

/** Criteria the Advanced Search panel accepts. Omitted fields are left empty. */
export interface AdvancedSearchCriteria {
  nameOrCode?: string;
  payerType?: string;
  status?: string;
  licenseNumber?: string;
}

/**
 * The payer list's Advanced Search panel, opened from the search box's "Filters"
 * control.
 *
 * Verified structure: it renders in the shared side drawer
 * (`div.pbm-form-drawer`) as `div.adv-search`, with one `div.adv-search__field`
 * per criterion - Payer Name / Code, Payer Type, Status, License Number - and
 * Cancel / Search actions in the drawer footer.
 */
export class AdvancedSearchDrawer {
  constructor(private readonly page: Page) {}

  private panel(): Locator {
    return this.page.locator('.pbm-form-drawer').last();
  }

  private field(label: string): Locator {
    return this.panel().locator('div.adv-search__field').filter({ hasText: label });
  }

  async waitForOpen(): Promise<void> {
    await expect(this.panel().locator('div.adv-search')).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  async waitForClosed(): Promise<void> {
    await expect(this.panel()).toHaveCount(0, { timeout: Timeouts.default });
  }

  /** Every criterion label the panel exposes, for the UI checklist test. */
  async getFieldLabels(): Promise<string[]> {
    const labels = await this.panel().locator('div.adv-search__field label').allInnerTexts();
    return labels.map((label) => label.trim());
  }

  /**
   * Types into a criterion. The application only registers values entered as a
   * user would type them, so real key presses are used rather than a
   * programmatic value set.
   */
  private async typeInto(label: string, value: string): Promise<void> {
    const input = this.field(label).locator('input').first();
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.blur();
  }

  private async selectOption(label: string, option: string): Promise<void> {
    await this.field(label).getByRole('combobox').first().click();
    await this.page
      .getByRole('option', { name: option, exact: true })
      .filter({ visible: true })
      .first()
      .click();
  }

  /** Fills the given criteria, leaving any omitted field untouched. */
  async fill(criteria: AdvancedSearchCriteria): Promise<void> {
    Logger.step(`Filling advanced search: ${JSON.stringify(criteria)}`);
    if (criteria.nameOrCode !== undefined) {
      await this.typeInto(ADVANCED_SEARCH_FIELDS.nameOrCode, criteria.nameOrCode);
    }
    if (criteria.licenseNumber !== undefined) {
      await this.typeInto(ADVANCED_SEARCH_FIELDS.licenseNumber, criteria.licenseNumber);
    }
    if (criteria.payerType !== undefined) {
      await this.selectOption(ADVANCED_SEARCH_FIELDS.payerType, criteria.payerType);
    }
    if (criteria.status !== undefined) {
      await this.selectOption(ADVANCED_SEARCH_FIELDS.status, criteria.status);
    }
  }

  /** Runs the search and waits for the panel to close. */
  async submit(): Promise<void> {
    Logger.step('Submitting advanced search');
    await this.panel().getByRole('button', { name: 'Search', exact: true }).click();
    await this.waitForClosed();
  }

  /** Dismisses the panel without searching. */
  async cancel(): Promise<void> {
    await this.panel().getByRole('button', { name: 'Cancel', exact: true }).click();
    await this.waitForClosed();
  }
}
