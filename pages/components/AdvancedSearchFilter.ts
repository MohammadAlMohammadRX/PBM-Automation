import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * The list screens' TYPE / STATUS filters since the build of 2026-11-14 (found in the Sprint 1 retest, 2026-11-17).
 *
 * The quick-filter dropdowns above the payer / network / plan lists (`<screen>-filter-<type|status>-select`) are
 * gone. Filtering now happens in an "Advance Search for ..." drawer opened by `<screen>-search-filter-button`:
 *   - fields `<screen>-advanced-search-field-<field>-input` - a `pbm-select` combobox (aria-controls
 *     `pbm-select-N_list` while open, options `[role=option]`) for Type / Status / Approval Status;
 *   - `<screen>-advanced-search-search-button` applies and CLOSES the drawer, `-cancel-button` / `-close` discard;
 *   - each applied field shows as a chip `<screen>-filter-chips-chip-<field>` ("Status: Active") with a
 *     `-remove` button.
 * Status options are Not Live, Future, Active, Inactive, Expired; there is no "All ..." option any more - "show
 * everything" means no chip for that field.
 *
 * Field names (verified live 2026-11-17): payer `payertypeid`, `statusid`, `approvalstatus`; network
 * `networktypeid`, `statusid`, `approvalstatus`; plan `plantypeid`, `statusid`, `approvalstatus`.
 */
/** Lifecycle statuses renamed in the 2026-11-14 build: old label -> new label. */
const STATUS_RENAMED: Record<string, string> = { Pending: 'Future' };

export class AdvancedSearchFilter {
  constructor(private readonly page: Page, private readonly screen: string) {}

  private id(suffix: string): Locator {
    return this.page.locator(`#${this.screen}-${suffix}`);
  }

  openButton(): Locator {
    return this.id('search-filter-button');
  }

  body(): Locator {
    return this.id('advanced-search-body');
  }

  field(field: string): Locator {
    return this.id(`advanced-search-field-${field}-input`);
  }

  chip(field: string): Locator {
    return this.id(`filter-chips-chip-${field}`);
  }

  /** Opens the drawer (no-op when open). */
  async open(): Promise<void> {
    if (await this.body().isVisible().catch(() => false)) return;
    await this.openButton().click();
    await expect(this.body(), 'the advanced search drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** Opens a field's dropdown and returns ITS options (scoped through aria-controls). */
  private async openOptions(field: string): Promise<Locator> {
    const input = this.field(field);
    await input.click();
    let listId: string | null = null;
    await expect
      .poll(async () => (listId = await input.getAttribute('aria-controls')), { timeout: Timeouts.short })
      .toBeTruthy()
      .catch(() => undefined);
    const scope = listId ? this.page.locator(`[id="${listId}"]`) : this.page;
    const options = scope.getByRole('option').filter({ visible: true });
    await expect(options.first(), `the ${field} field should list its options`).toBeVisible({ timeout: Timeouts.default });
    return options;
  }

  /** Closes an open dropdown without closing the drawer (Escape closes the whole drawer). */
  private async closeOptions(): Promise<void> {
    await this.id('advanced-search-title').click().catch(() => undefined);
  }

  /** The options a field offers, in order, without choosing one (the drawer is left as it was found). */
  async options(field: string): Promise<string[]> {
    const wasOpen = await this.body().isVisible().catch(() => false);
    await this.open();
    const options = await this.openOptions(field);
    const texts = (await options.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.closeOptions();
    if (!wasOpen) await this.cancel();
    return texts;
  }

  /** Chooses one option of a field in the open drawer (exact text). */
  /** Chooses one option of a field in the open drawer (exact text); returns the option actually chosen (see STATUS_RENAMED). */
  async choose(field: string, option: string): Promise<string> {
    await this.open();
    const options = await this.openOptions(field);
    const offered = (await options.allInnerTexts()).map((t) => t.trim());
    // RENAMED STATUS (build of 2026-11-14): the lifecycle status "Pending" (approved, not yet effective) is now
    // "Future". A case written against "Pending" is pointed at "Future" - loudly, so the report shows the rename
    // and the test case can be updated (Needs-QA-Changes).
    if (!offered.includes(option) && STATUS_RENAMED[option] && offered.includes(STATUS_RENAMED[option])) {
      Logger.warn(`[advancedSearch] "${option}" is no longer offered (renamed "${STATUS_RENAMED[option]}" in the 2026-11-14 build) - using "${STATUS_RENAMED[option]}"`);
      option = STATUS_RENAMED[option];
    }
    const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const target = options.filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) }).first();
    await expect(target, `the ${field} field should offer "${option}"`).toBeVisible({ timeout: Timeouts.default });
    await target.click();
    await this.closeOptions();
    return option;
  }

  /** Applies the drawer (Search) and waits for it to close. */
  async search(): Promise<void> {
    await this.id('advanced-search-search-button').click();
    await expect(this.body(), 'Search should close the advanced search drawer').toBeHidden({ timeout: Timeouts.default });
  }

  async cancel(): Promise<void> {
    if (!(await this.body().isVisible().catch(() => false))) return;
    await this.id('advanced-search-cancel-button').click().catch(() => undefined);
    await expect(this.body()).toBeHidden({ timeout: Timeouts.short }).catch(() => undefined);
  }

  /** Filters the list by one field: open, choose, Search. An "All ..." option clears that field instead. */
  async apply(field: string, option: string): Promise<void> {
    if (/^(all\b|الكل|جميع)/i.test(option.trim())) {
      await this.clear(field);
      return;
    }
    Logger.step(`[advancedSearch] ${this.screen}: ${field} = "${option}"`);
    const chosen = await this.choose(field, option);
    await this.search();
    await expect(this.chip(field), `a "${field}" filter chip should show "${chosen}"`).toContainText(chosen, { timeout: Timeouts.default });
  }

  /** Removes a field's filter (its chip); no-op when it is not applied. */
  async clear(field: string): Promise<void> {
    const remove = this.id(`filter-chips-chip-${field}-remove`);
    if (!(await remove.isVisible().catch(() => false))) return;
    Logger.step(`[advancedSearch] ${this.screen}: clearing ${field}`);
    await remove.click();
    await expect(this.chip(field)).toBeHidden({ timeout: Timeouts.default });
  }

  /** The value a field is filtered by ("" when not applied), read off its chip ("Status: Active" -> "Active"). */
  async current(field: string): Promise<string> {
    const chip = this.chip(field);
    if (!(await chip.isVisible().catch(() => false))) return '';
    return (await chip.innerText()).replace(/^[^:]*:\s*/, '').trim();
  }
}
