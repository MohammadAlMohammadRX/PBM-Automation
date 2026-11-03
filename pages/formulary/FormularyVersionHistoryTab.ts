import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { FormularyDetailPage } from './FormularyDetailPage';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  FORMULARY_VERSIONS,
  FORMULARY_VERSION_COLUMN,
  FORMULARY_VERSION_FIELD,
  TOAST,
  buttonSelector,
  type FormularyVersionColumn,
  type FormularyVersionField,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { readVersions, revertFormulary, type FormularyVersion } from '../../utils/FormularyProvisioning';
import { FORMULARY_VERSION_FILTER, type FormularyVersionFilterKey } from '../../constants/formulary/writerCIds';

/** One table row, by column, with the row's own id. */
export type FormularyVersionRow = Record<FormularyVersionColumn, string> & { rowId: string };

/**
 * The detail's Version History tab (verified live 2026-11-02): a search box
 * ("Search by version, change type, status or user") with Filters, the table
 * `formulary-detail-versions-table` (Version, Change, Approval Status,
 * Requested By, Requested On, Reviewed By, Reviewed On, Actions) and the
 * "Version Details" drawer (approval status, business status, names, payer,
 * dates, description, requested / reviewed by / on).
 *
 * Revert sits in a row's actions (`formulary-detail-revert-button`, shared by
 * every row) and is offered - per the screen's own rule - only on a published
 * or superseded version that is not a status change and not the current one;
 * it sends RevertFormularyVersion `{ formularyId, targetVersion }`, staging the
 * version as a draft ("Saved as draft").
 */
export class FormularyVersionHistoryTab {
  private readonly detail: FormularyDetailPage;

  constructor(private readonly page: Page) {
    this.detail = new FormularyDetailPage(page);
  }

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private rows(): Locator {
    return this.page.locator(`tr[id^="${FORMULARY_VERSIONS.rowPrefix}"]`);
  }

  async open(): Promise<void> {
    await this.detail.openTab('versions');
    await expect(this.byId(FORMULARY_VERSIONS.searchInput), 'the Version History tab should render').toBeVisible({ timeout: Timeouts.default });
    await this.rows().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  }

  /** Every row on the current page, top to bottom. */
  async readRows(): Promise<FormularyVersionRow[]> {
    await this.detail.waitForPageReady();
    return this.rows().evaluateAll((trs, columns) => trs.map((tr) => {
      const out: Record<string, string> = { rowId: tr.id };
      for (const [key, column] of Object.entries(columns)) {
        const cell = tr.querySelector(`[id$="-cell-${column}"]`);
        out[key] = cell ? (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
      }
      return out;
    }), FORMULARY_VERSION_COLUMN) as Promise<FormularyVersionRow[]>;
  }

  /** The column headers, as labelled. */
  async getHeaders(): Promise<string[]> {
    return (await this.page.locator(`th[id^="${FORMULARY_VERSIONS.headerPrefix}"]`).allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  /** The row showing `version` ("v1", "v2"). */
  private row(version: string): Locator {
    return this.rows().filter({ has: this.page.locator(`[id$="-cell-${FORMULARY_VERSION_COLUMN.version}"]`, { hasText: new RegExp(`^\\s*${version}\\s*$`) }) }).first();
  }

  async expectVersionStatus(version: string, status: string | RegExp): Promise<void> {
    await expect(this.row(version).locator(`[id$="-cell-${FORMULARY_VERSION_COLUMN.status}"]`), `${version} should read ${String(status)}`)
      .toHaveText(status, { timeout: Timeouts.default });
  }

  /** Searches the table (types and presses Enter) and waits for it to settle. */
  async search(term: string): Promise<void> {
    Logger.step(`Searching version history for "${term}"`);
    const input = this.byId(FORMULARY_VERSIONS.searchInput);
    await input.fill(term);
    await input.press('Enter');
    await this.detail.waitForPageReady();
  }

  /** The tab's advanced search (status, requester, change type, reviewer, requested date ...). */
  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    await this.page.locator(buttonSelector(FORMULARY_VERSIONS.searchFilterButton)).first().click();
    const drawer = new AdvancedSearchDrawer(this.page, FORMULARY_VERSIONS.advancedSearch.replace(/-advanced-search$/, ''));
    await drawer.waitForOpen();
    return drawer;
  }

  /** The panel's text (empty state "no versions match"). */
  async getPanelText(): Promise<string> {
    return (await this.byId(FORMULARY_VERSIONS.table).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  // ---- Version Details drawer ---------------------------------------------------------------

  /** Opens the Version Details drawer of a row (by version label) and reads every field. */
  async viewVersion(version: string): Promise<Record<FormularyVersionField, string>> {
    await this.row(version).locator(buttonSelector(FORMULARY_VERSIONS.viewButton)).first().click();
    await expect(this.byId(FORMULARY_VERSIONS.drawer.title), 'the Version Details drawer should open').toBeVisible({ timeout: Timeouts.default });
    const out = {} as Record<FormularyVersionField, string>;
    for (const [key, suffix] of Object.entries(FORMULARY_VERSION_FIELD) as [FormularyVersionField, string][]) {
      out[key] = (await this.byId(`${FORMULARY_VERSIONS.drawer.fieldPrefix}${suffix}`).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
    }
    return out;
  }

  /** Whether the open drawer offers anything to type into or change (read-only check). */
  async isDrawerReadOnly(): Promise<boolean> {
    // locator-exception: the question is whether ANY editable control exists in the drawer; scoped to its id.
    const editable = await this.byId(FORMULARY_VERSIONS.drawer.root).locator('input:not([type="hidden"]), textarea, [role="combobox"]').count();
    return editable === 0;
  }

  async closeVersion(): Promise<void> {
    await this.byId(FORMULARY_VERSIONS.drawer.close).click();
    await expect(this.byId(FORMULARY_VERSIONS.drawer.title)).toBeHidden({ timeout: Timeouts.default });
  }

  // ---- revert ---------------------------------------------------------------------------------

  /** Whether a row offers a usable Revert. */
  async getRevertAvailability(version: string): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.row(version).locator(buttonSelector(FORMULARY_VERSIONS.revertButton)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /** Clicks a row's Revert (confirming any prompt) and returns RevertFormularyVersion's answer and the messages. */
  async revertTo(version: string): Promise<{ status: number; text: string; messages: string[] }> {
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularyRevert, async () => {
      await this.row(version).locator(buttonSelector(FORMULARY_VERSIONS.revertButton)).first().click();
      const dialog = new ConfirmDialog(this.page);
      if (await dialog.isVisible()) await dialog.confirmWithFollowUps();
    });
    const messages = await WaitUtils.settleMessages(async () => (await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages };
  }

  // ---- Writer C additions (folder 17, 2026-11-02) -------------------------------------------

  /**
   * Clicks a row's Revert and returns the confirmation it raised, still open,
   * or null when none appeared (18819 asserts the prompt itself).
   */
  async requestRevert(version: string): Promise<ConfirmDialog | null> {
    await this.row(version).locator(buttonSelector(FORMULARY_VERSIONS.revertButton)).first().click();
    const dialog = new ConfirmDialog(this.page);
    return (await dialog.isVisible()) ? dialog : null;
  }

  /** The criterion keys the advanced search renders (`-field-{key}-input`), and their labels. */
  async readFilterFields(): Promise<{ keys: string[]; labels: string[] }> {
    const drawer = await this.openAdvancedSearch();
    const out = { keys: await drawer.getFieldKeys(), labels: (await drawer.getFieldLabels()).filter((l) => l !== '') };
    await drawer.cancel();
    return out;
  }

  /**
   * Applies the advanced search: each criterion is put into the field whose key
   * matches its pattern (FORMULARY_VERSION_FILTER.key - the keys were not
   * probed). A select is chosen by label, a text field typed, the date range
   * typed as `DD/MM/YYYY - DD/MM/YYYY`. Reports whether the drawer closed (the
   * search ran), any messages it showed, the criteria it could not place, and
   * the rows afterwards.
   */
  async applyFilter(criteria: Partial<Record<FormularyVersionFilterKey, string>>): Promise<{
    applied: boolean;
    messages: string[];
    unplaced: string[];
    rows: FormularyVersionRow[];
  }> {
    Logger.step(`Version history advanced search: ${JSON.stringify(criteria)}`);
    const drawer = await this.openAdvancedSearch();
    const keys = await drawer.getFieldKeys();
    const unplaced: string[] = [];
    const used = new Set<string>();
    for (const [criterion, value] of Object.entries(criteria) as [FormularyVersionFilterKey, string][]) {
      const key = keys.find((k) => !used.has(k) && FORMULARY_VERSION_FILTER.key[criterion].test(k));
      if (key === undefined) {
        unplaced.push(criterion);
        continue;
      }
      used.add(key);
      const control = this.byId(`${FORMULARY_VERSION_FILTER.prefix}-field-${key}-input`);
      const tag = await control.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      if (criterion === 'requestedOn') await this.pickDateRange(control, value);
      else if (tag === 'input' || tag === 'textarea') await drawer.typeText(key, value);
      else await drawer.choose(key, value);
    }
    await this.page.locator(buttonSelector(FORMULARY_VERSION_FILTER.searchButton)).first().click();
    const applied = await drawer.waitForClosed().then(() => true).catch(() => false);
    const messages = applied ? [] : await drawer.getMessages();
    if (!applied) await drawer.cancel().catch(() => undefined);
    await this.detail.waitForPageReady();
    await this.rows().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    return { applied, messages, unplaced, rows: await this.readRows() };
  }

  /**
   * Picks a "DD/MM/YYYY - DD/MM/YYYY" range by clicking its days in the
   * calendar: a typed range showed in the box but did not filter (2026-11-03).
   *
   * locator-exception: PrimeNG renders day cells without ids; they are read
   * inside the open datepicker panel, which is reached from the field.
   */
  private async pickDateRange(input: Locator, range: string): Promise<void> {
    const days = range.split(/\s+-\s+/).map((text) => {
      const [d, m, y] = text.split('/').map(Number);
      return new Date(y, m - 1, d);
    });
    await input.click();
    const panel = this.page.locator('.p-datepicker-panel, .p-datepicker').filter({ visible: true }).first(); // locator-exception: the PrimeNG date-picker overlay is portalled with no id
    await expect(panel, 'the date picker should open').toBeVisible({ timeout: Timeouts.default });
    let shown = new Date();
    for (const day of days) {
      const months = (day.getFullYear() - shown.getFullYear()) * 12 + day.getMonth() - shown.getMonth();
      for (let i = 0; i < Math.abs(months); i++) {
        await panel.locator(months > 0 ? '.p-datepicker-next, .p-datepicker-next-button' : '.p-datepicker-prev, .p-datepicker-prev-button').first().click();
      }
      shown = day;
      await panel
        .locator('td:not(.p-datepicker-other-month) span')
        .filter({ hasText: new RegExp(`^\\s*${day.getDate()}\\s*$`) })
        .first()
        .click();
    }
    if (await panel.isVisible().catch(() => false)) await input.click();
  }

  /** The options a filter criterion offers (a select), [] when it is not a select or not found. */
  async getFilterOptions(criterion: FormularyVersionFilterKey): Promise<string[]> {
    const drawer = await this.openAdvancedSearch();
    const key = (await drawer.getFieldKeys()).find((k) => FORMULARY_VERSION_FILTER.key[criterion].test(k));
    const options = key === undefined ? [] : await drawer.getOptions(key).catch(() => [] as string[]);
    await drawer.cancel();
    return options;
  }

  /** The table's empty-state text ("No versions match ..."), '' when rows are shown. */
  async getEmptyStateText(): Promise<string> {
    const empty = await this.byId(FORMULARY_VERSION_FILTER.emptyState).innerText({ timeout: Timeouts.short }).catch(() => '');
    return (empty || ((await this.rows().count()) === 0 ? await this.getPanelText() : '')).replace(/\s+/g, ' ').trim();
  }

  // ---- API ------------------------------------------------------------------------------------

  async fetchVersions(formularyId: string): Promise<FormularyVersion[]> {
    return readVersions(this.page, formularyId);
  }

  async revertViaApi(formularyId: string, targetVersion: number): Promise<{ status: number; text: string }> {
    return revertFormulary(this.page, formularyId, targetVersion);
  }
}
