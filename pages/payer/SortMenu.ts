import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { PAYER_SORT_FIELD, SCREEN, buttonSelector } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';
import type { SortDirection } from '../../utils/SortUtils';
import {
  SORT_DIRECTIONS,
  SORT_TRIGGER_LABEL,
  sortColumn,
  sortOptionLabel,
  type SortColumnKey,
} from '../../data/payers/sortPayer.data';

/**
 * The list toolbar's "Sort By" menu.
 *
 * Ids (verified live):
 *   payer-list-sort                        the control
 *   payer-list-sort-trigger                the button that opens the menu
 *   payer-list-sort-menu                   the panel - only in the DOM while open
 *   payer-list-sort-option-{field}-{dir}   one option, e.g. `payernameen-asc`
 *
 * Options are now addressed by their sort EXPRESSION rather than by their
 * position in the menu. That was the last positional selector in this class: it
 * relied on the menu listing 7 columns x 2 directions in a fixed order, so
 * adding or reordering a sortable column would have silently pointed every
 * selection at the wrong option. The sort key is built from the column name and
 * direction, so it is identical in English and Arabic - the option's localized
 * label is still asserted separately, which is the "sort indicator names the
 * active column and direction" requirement.
 */
export class SortMenu {
  constructor(private readonly page: Page) {}

  trigger(): Locator {
    return this.page.locator(buttonSelector(`${SCREEN.payerList}-sort-trigger`)).first();
  }

  private menu(): Locator {
    return this.page.locator(`#${SCREEN.payerList}-sort-menu`);
  }

  /** Every option in the menu, in menu order. */
  private items(): Locator {
    return this.page.locator(`[id^="${SCREEN.payerList}-sort-option-"]`);
  }

  /** The option for a column/direction pair, by its sort expression. */
  private item(column: SortColumnKey, direction: SortDirection): Locator {
    const field = PAYER_SORT_FIELD[column];
    return this.page
      .locator(buttonSelector(`${SCREEN.payerList}-sort-option-${field}-${direction}`))
      .first();
  }

  private async isOpen(): Promise<boolean> {
    return this.menu()
      .isVisible({ timeout: Timeouts.short })
      .catch(() => false);
  }

  async open(): Promise<void> {
    if (await this.isOpen()) return;
    await this.trigger().click();
    await expect(this.menu()).toBeVisible({ timeout: Timeouts.default });
  }

  async close(): Promise<void> {
    if (!(await this.isOpen())) return;
    await this.page.keyboard.press('Escape');
    await expect(this.menu()).toBeHidden({ timeout: Timeouts.short });
  }

  /** Applies a sort and waits for the menu to close, i.e. for it to be taken. */
  async select(column: SortColumnKey, direction: SortDirection): Promise<void> {
    Logger.step(`Sorting by ${sortOptionLabel(column, direction)}`);
    await this.open();
    await this.item(column, direction).click();
    await expect(this.menu()).toBeHidden({ timeout: Timeouts.default });
  }

  /** Every option label, in menu order, whitespace normalized. */
  async optionLabels(): Promise<string[]> {
    await this.open();
    await expect(this.items().first()).toBeVisible({ timeout: Timeouts.default });
    const labels = (await this.items().allInnerTexts()).map((text) =>
      text.replace(/\s+/g, ' ').trim(),
    );
    await this.close();
    return labels;
  }

  async optionCount(): Promise<number> {
    await this.open();
    await expect(this.items().first()).toBeVisible({ timeout: Timeouts.default });
    const count = await this.items().count();
    await this.close();
    return count;
  }

  /**
   * The sort indicator: the label of the checked menu item. Returns `'<none>'`
   * when no option is marked, so a missing indicator fails with a readable
   * message instead of a null dereference.
   */
  async activeOptionLabel(): Promise<string> {
    await this.open();
    const checked = this.items().and(this.page.locator('[aria-checked="true"]'));
    const found = await checked.count();
    const label = found === 0
      ? '<none>'
      : (await checked.first().innerText()).replace(/\s+/g, ' ').trim();
    await this.close();
    return label;
  }

  /**
   * The sort expression currently applied, e.g. `payernameen-asc`.
   *
   * Language independent, unlike `activeOptionLabel` - useful for asserting the
   * applied sort without depending on the rendered text.
   */
  async activeOptionKey(): Promise<string> {
    await this.open();
    const checked = this.items().and(this.page.locator('[aria-checked="true"]'));
    const id = (await checked.count()) === 0 ? null : await checked.first().getAttribute('id');
    await this.close();
    return id?.replace(`${SCREEN.payerList}-sort-option-`, '') ?? '<none>';
  }

  /** Asserts the indicator names exactly this column and direction. */
  async expectActive(
    column: SortColumnKey,
    direction: SortDirection,
    language: 'en' | 'ar' = 'en',
  ): Promise<void> {
    const expected = sortOptionLabel(column, direction, language);
    await expect
      .poll(() => this.activeOptionLabel(), { timeout: Timeouts.default })
      .toBe(expected);
  }

  /** Asserts exactly one option is marked as active at a time. */
  async expectSingleActiveOption(): Promise<void> {
    await this.open();
    await expect(this.items().and(this.page.locator('[aria-checked="true"]'))).toHaveCount(1, {
      timeout: Timeouts.default,
    });
    await this.close();
  }

  /**
   * The text the sort control shows while its menu is CLOSED.
   *
   * Acceptance criterion 2 asks the sort indicator to display the current sort
   * column and direction; that is only satisfied if it can be read without
   * opening the menu, so this deliberately closes the menu first.
   */
  async collapsedText(): Promise<string> {
    await this.close();
    return (await this.trigger().innerText()).replace(/\s+/g, ' ').trim();
  }

  async expectTriggerPresent(language: 'en' | 'ar' = 'en'): Promise<void> {
    await expect(this.trigger()).toBeVisible({ timeout: Timeouts.default });
    await expect(this.trigger()).toContainText(SORT_TRIGGER_LABEL[language], {
      timeout: Timeouts.default,
    });
    await expect(this.trigger()).toHaveAttribute('aria-haspopup', 'menu');
  }

  /** Kept so callers can still reason in menu positions if they need to. */
  static optionOrder(column: SortColumnKey, direction: SortDirection): number {
    return sortColumn(column).menuOrder * SORT_DIRECTIONS.length
      + SORT_DIRECTIONS.indexOf(direction);
  }
}
