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
  private readonly prefix: string;

  /**
   * `screen` defaults to the payer list. Every list and tab that offers an
   * advanced search renders the same component under `{screen}-advanced-search`
   * - the Network list, and the network detail Facilities and Audit tabs
   * (verified 2026-10-21) - so they reuse this class with their own namespace.
   */
  constructor(private readonly page: Page, screen: string = SCREEN.payerList) {
    this.prefix = `${screen}-advanced-search`;
  }

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

  // ---- Field-key access, for drawers other than the payer list's -----------

  /** Whether the drawer is on screen. Waits briefly rather than reading once. */
  async isOpen(): Promise<boolean> {
    return this.title()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /** The drawer title, e.g. "Advance Search for Networks". */
  async getTitle(): Promise<string> {
    await this.waitForOpen();
    return (await this.title().innerText()).trim();
  }

  /** The criterion keys the drawer offers, read from its own field ids. */
  async getFieldKeys(): Promise<string[]> {
    const head = `${this.prefix}-field-`;
    const ids = await this.page
      .locator(`[id^="${head}"][id$="-input"]`)
      .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).id));
    return ids.map((id) => id.slice(head.length, -'-input'.length));
  }

  /** Whether a criterion is offered at all. */
  async hasField(fieldKey: string): Promise<boolean> {
    return (await this.control(fieldKey).count()) > 0;
  }

  /** Types into a text criterion with real key presses. */
  async typeText(fieldKey: string, value: string): Promise<void> {
    Logger.step(`Advanced search: "${fieldKey}" = "${value}"`);
    await this.typeInto(fieldKey, value);
  }

  /** Clears a text criterion with real key presses. */
  async clearText(fieldKey: string): Promise<void> {
    const input = this.control(fieldKey);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    await input.blur();
  }

  /** Types a date criterion and commits it with Enter. */
  async typeDate(fieldKey: string, value: string): Promise<void> {
    const input = this.control(fieldKey);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.press('Enter');
  }

  /** Picks an option of a select criterion. */
  async choose(fieldKey: string, option: string): Promise<void> {
    Logger.step(`Advanced search: "${fieldKey}" -> "${option}"`);
    await this.selectOption(fieldKey, option);
    await expect(this.control(fieldKey)).toContainText(option, { timeout: Timeouts.short });
  }

  /** The options a select criterion offers, without choosing one. */
  async getOptions(fieldKey: string): Promise<string[]> {
    await this.control(fieldKey).click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    const texts = await options.allInnerTexts();
    await this.page.keyboard.press('Escape');
    return texts.map((text) => text.trim()).filter((text) => text !== '');
  }

  /** What a criterion currently holds - an input value or a select label. */
  async getValue(fieldKey: string): Promise<string> {
    const control = this.control(fieldKey);
    const tag = await control.evaluate((element) => element.tagName.toLowerCase());
    return tag === 'input' || tag === 'textarea'
      ? (await control.inputValue()).trim()
      : (await control.innerText()).trim();
  }

  /** The `maxlength` a text criterion declares, or null when it declares none. */
  async getMaxLength(fieldKey: string): Promise<number | null> {
    const value = await this.control(fieldKey).getAttribute('maxlength');
    return value === null ? null : Number(value);
  }

  /** Every inline message the drawer is showing. */
  async getMessages(): Promise<string[]> {
    const texts = await this.body().locator('[id$="-error"], .p-error').allInnerTexts().catch(() => [] as string[]);
    return texts.map((text) => text.trim()).filter((text) => text !== '');
  }

  /** A text criterion's placeholder. */
  async getPlaceholder(fieldKey: string): Promise<string> {
    return ((await this.control(fieldKey).getAttribute('placeholder')) ?? '').trim();
  }

  /** The computed text direction of a criterion's control - "rtl" or "ltr". */
  async getTextDirection(fieldKey: string): Promise<string> {
    return this.control(fieldKey).evaluate((element) => window.getComputedStyle(element).direction);
  }

  /** Which of the drawer's own controls are on screen. */
  async getControlsPresent(): Promise<{ search: boolean; cancel: boolean; close: boolean }> {
    const shown = (id: string) => this.page.locator(buttonSelector(id)).first().isVisible();
    return {
      search: await shown(`${this.prefix}-search-button`),
      cancel: await shown(`${this.prefix}-cancel-button`),
      close: await shown(`${this.prefix}-close`),
    };
  }

  /** Closes the drawer with its X control. */
  async close(): Promise<void> {
    await this.page.locator(buttonSelector(`${this.prefix}-close`)).first().click();
    await this.waitForClosed();
  }
}
