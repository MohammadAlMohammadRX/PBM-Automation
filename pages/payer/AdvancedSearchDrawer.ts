import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import {
  PAYER_ADVANCED_SEARCH_FIELD,
  SCREEN,
  buttonSelector,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/** Criteria the Advanced Search panel accepts. Omitted fields are left empty. */
export interface AdvancedSearchCriteria {
  nameOrCode?: string;
  payerType?: string;
  status?: string;
  licenseNumber?: string;
}

/**
 * The payer list's Advanced Search panel, opened from the search box's filter
 * control.
 *
 * Ids under the `payer-list-advanced-search` prefix:
 *   -title / -close / -body
 *   -field-{fieldKey}          the wrapper
 *   -field-{fieldKey}-input    the control (a text input OR a select's combobox)
 *   -cancel-button / -search-button
 *
 * Field keys come from the filter field names in code, lowercased
 * (`searchText` -> `searchtext`, `payerTypeId` -> `payertypeid`), NOT from the
 * translated labels - so this panel is now addressable in either language,
 * where before every criterion was found by its English label text.
 */
export class AdvancedSearchDrawer {
  private readonly prefix = `${SCREEN.payerList}-advanced-search`;

  constructor(private readonly page: Page) {}

  private title(): Locator {
    return this.page.locator(`#${this.prefix}-title`);
  }

  private body(): Locator {
    return this.page.locator(`#${this.prefix}-body`);
  }

  /** A criterion's control, by its filter field key. */
  private control(fieldKey: string): Locator {
    return this.page.locator(`#${this.prefix}-field-${fieldKey}-input`);
  }

  /**
   * The drawer host is permanently mounted and zero-size while closed, so it
   * never reports as visible - the title is what appears when it opens.
   */
  async waitForOpen(): Promise<void> {
    await expect(this.title()).toBeVisible({ timeout: Timeouts.default });
  }

  async waitForClosed(): Promise<void> {
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  /** Every criterion label the panel exposes, for the UI checklist test. */
  async getFieldLabels(): Promise<string[]> {
    const labels = await this.body().locator('label').allInnerTexts();
    return labels.map((label) => label.trim());
  }

  /**
   * Types into a criterion. The application only registers values entered as a
   * user would type them, so real key presses are used rather than a
   * programmatic value set.
   */
  private async typeInto(fieldKey: string, value: string): Promise<void> {
    const input = this.control(fieldKey);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.blur();
  }

  private async selectOption(fieldKey: string, option: string): Promise<void> {
    await this.control(fieldKey).click();
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
      await this.typeInto(PAYER_ADVANCED_SEARCH_FIELD.nameOrCode, criteria.nameOrCode);
    }
    if (criteria.licenseNumber !== undefined) {
      await this.typeInto(PAYER_ADVANCED_SEARCH_FIELD.licenseNumber, criteria.licenseNumber);
    }
    if (criteria.payerType !== undefined) {
      await this.selectOption(PAYER_ADVANCED_SEARCH_FIELD.payerType, criteria.payerType);
    }
    if (criteria.status !== undefined) {
      await this.selectOption(PAYER_ADVANCED_SEARCH_FIELD.status, criteria.status);
    }
  }

  /** Runs the search and waits for the panel to close. */
  async submit(): Promise<void> {
    Logger.step('Submitting advanced search');
    await this.page.locator(buttonSelector(`${this.prefix}-search-button`)).first().click();
    await this.waitForClosed();
  }

  /** Dismisses the panel without searching. */
  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(`${this.prefix}-cancel-button`)).first().click();
    await this.waitForClosed();
  }
}
