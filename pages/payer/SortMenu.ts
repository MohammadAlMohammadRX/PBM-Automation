import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
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
 * Structure verified against the live app:
 *   div.pbm-sort[.is-open]
 *     button.pbm-sort__trigger[aria-haspopup="menu"][aria-expanded]
 *       span.pbm-sort__label      -> "Sort By" / "ترتيب حسب"
 *     div.pbm-sort__menu[role="menu"]
 *       span.pbm-sort__group-label
 *       button.pbm-sort__item[role="menuitemradio"][aria-checked][.is-active]
 *
 * Options are selected by their position in the menu rather than by label,
 * because the position is fixed (7 columns x 2 directions, in a known order)
 * while the label is localized. The label is then asserted separately, which is
 * exactly the "sort indicator names the active column and direction" check.
 */
export class SortMenu {
  constructor(private readonly page: Page) {}

  private root(): Locator {
    return this.page.locator('div.pbm-sort').first();
  }

  trigger(): Locator {
    return this.root().locator('button.pbm-sort__trigger');
  }

  private menu(): Locator {
    return this.root().locator('div.pbm-sort__menu[role="menu"]');
  }

  private items(): Locator {
    return this.menu().locator('button[role="menuitemradio"]');
  }

  /** The menu item for a column/direction pair, addressed by menu position. */
  private item(column: SortColumnKey, direction: SortDirection): Locator {
    const index = sortColumn(column).menuOrder * SORT_DIRECTIONS.length
      + SORT_DIRECTIONS.indexOf(direction);
    return this.items().nth(index);
  }

  private async isOpen(): Promise<boolean> {
    return this.trigger()
      .getAttribute('aria-expanded')
      .then((value) => value === 'true')
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
}
