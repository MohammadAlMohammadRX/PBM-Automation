import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { NetworkDetailPage } from './NetworkDetailPage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { DETAIL_TAB_SEARCH, NETWORK_FACILITIES, buttonSelector } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';

/** One row of the Facility Assignment table, as it renders. */
export interface FacilityRow {
  name: string;
  code: string;
  /** The facility's own status badge (Active / Inactive / Pending). */
  status: string;
  /** DD/MM/YYYY once approved, "—" while the change is unapproved. */
  assignedOn: string;
  /** Draft Assignment / Pending Assignment / Draft Removal / Pending Removal, or "—" when settled. */
  assignment: string;
  /** Whether the row offers its Remove action. */
  removable: boolean;
}

export type CapturedCall = { status: number; body: unknown; text: string } | null;

/**
 * The network detail screen's Facility Assignment tab.
 *
 * Rows carry no id and their badges and Remove buttons share one id each (see
 * NETWORK_FACILITIES), so a row is found by the facility's name or code within
 * the tab's own table, which is reached from the tab's search box id.
 *
 * Assigning and removing are maker-checker changes (verified 2026-10-21):
 * AssignFacilitiesToNetwork answers "The network has been saved as a draft"
 * and the row reads "Draft Assignment" with no Assigned On date; Remove asks
 * "Do you want to delete {facility}?" and stages a removal the same way.
 */
export class NetworkFacilitiesTab {
  constructor(
    private readonly page: Page,
    private readonly detail: NetworkDetailPage,
  ) {}

  private searchInput(): Locator {
    return this.page.locator(DETAIL_TAB_SEARCH.inputSelector).filter({ visible: true }).first();
  }

  /** The tab's table - the nearest table to its own search box. */
  private table(): Locator {
    return this.searchInput().locator('xpath=ancestor::*[.//table][1]').locator('table').first();
  }

  private rows(): Locator {
    return this.table().locator('tbody tr');
  }

  private row(facility: string): Locator {
    return this.rows().filter({ hasText: facility }).first();
  }

  /** Opens the tab and waits for its search box. */
  async open(): Promise<void> {
    await this.detail.openTab('facilities');
    await expect(this.searchInput(), 'the Facility Assignment tab should render').toBeVisible({
      timeout: Timeouts.default,
    });
    await this.detail.waitForPageReady();
  }

  /** The table's column headers, in order. */
  async getHeaders(): Promise<string[]> {
    return (await this.table().locator('thead th').allInnerTexts()).map((t) => t.trim());
  }

  /** Every row on the current page. An empty-state row reads as no rows. */
  async readRows(): Promise<FacilityRow[]> {
    // An EMPTY tab renders no table at all - only "No facilities assigned to
    // this network yet." (seen 2026-10-25) - so waiting for the table failed
    // every zero-facility case (17934, 17944, 18035, 18038). The search box
    // proves the tab rendered; no table then means no rows.
    await expect(this.searchInput()).toBeVisible({ timeout: Timeouts.default });
    const hasTable = await this.table()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (!hasTable) return [];
    const raw = await this.rows().evaluateAll((trs, removeId) =>
      trs.map((tr) => ({
        cells: Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()),
        removable: tr.querySelector(`#${removeId}`) !== null,
      })), NETWORK_FACILITIES.removeButton);
    return raw
      .filter((r) => r.cells.length >= 5)
      .map((r) => ({
        name: r.cells[0],
        code: r.cells[1],
        status: r.cells[2],
        assignedOn: r.cells[3],
        assignment: r.cells[4],
        removable: r.removable,
      }));
  }

  /** The text the table shows when it has no rows ('' when it has rows). */
  async getEmptyText(): Promise<string> {
    const rows = await this.readRows();
    if (rows.length > 0) return '';
    const inTable = (await this.table().locator('tbody').innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
    if (inTable) return inTable;
    // No table: the message sits in the tab's panel, below its toolbar.
    // locator-exception: the empty-state text carries no id; read from the
    // nearest ancestor of the tab's own search box that holds more than the box.
    // The first ancestor that holds a "No ..." / "لا ..." line - the toolbar
    // row alone (Export, Import, Assign) was picked before (17944, 2026-10-25).
    const panel = this.searchInput().locator('xpath=ancestor::*[contains(normalize-space(.), "No ") or contains(normalize-space(.), "لا ")][1]');
    const text = (await panel.innerText().catch(() => '')).split('\n').map((t) => t.trim()).filter(Boolean);
    return text.find((t) => /^no |^لا /i.test(t)) ?? '';
  }

  /** One facility's row, or null when the table does not show it. */
  async findRow(facility: string): Promise<FacilityRow | null> {
    return (await this.readRows()).find((r) => r.name === facility || r.code === facility) ?? null;
  }

  /** Polls until a facility's row shows `assignment` (Draft Assignment, "—", ...). */
  async expectAssignmentState(facility: string, assignment: string | RegExp): Promise<void> {
    await expect
      .poll(async () => (await this.findRow(facility))?.assignment ?? '(row absent)', {
        timeout: Timeouts.default,
        message: `the "${facility}" row should read assignment "${assignment}"`,
      })
      .toMatch(typeof assignment === 'string' ? new RegExp(`^${assignment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : assignment);
  }

  /** Searches the tab with real key presses. */
  async search(term: string): Promise<void> {
    Logger.step(`Searching assigned facilities for "${term}"`);
    const input = this.searchInput();
    await input.click();
    await input.press('ControlOrMeta+a');
    if (term === '') await input.press('Delete');
    else await input.pressSequentially(term);
    await this.detail.waitForPageReady();
    // The search is debounced, so rows read at once were the UNFILTERED list
    // (18089, 2026-10-25). Wait until two reads 600 ms apart agree.
    let previous = '';
    await expect
      .poll(async () => {
        const current = (await this.readRows()).map((r) => r.code).join('|');
        const settled = current === previous;
        previous = current;
        return settled;
      }, { timeout: Timeouts.default, intervals: [600, 600, 800, 1_000] })
      .toBe(true);
  }

  /** The applied-filter chips, by id family (see DETAIL_TAB_SEARCH). */
  private chips(): Locator {
    return this.page.locator(DETAIL_TAB_SEARCH.chipsSelector).filter({ visible: true }).first();
  }

  async getSearchValue(): Promise<string> {
    return this.searchInput().inputValue();
  }

  /** The tab's advanced search drawer (opened by its filter button). */
  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    await this.page.locator(DETAIL_TAB_SEARCH.filterButtonSelector).filter({ visible: true }).first().click();
    const drawer = new AdvancedSearchDrawer(this.page, 'network-detail-facilities');
    await drawer.waitForOpen();
    return drawer;
  }

  /** Filter chips the tab shows after an advanced search. */
  async getChips(): Promise<string[]> {
    return (await this.chips().locator('[id]').allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim())
      .filter((t) => t !== '');
  }

  /** The tab's Export control (format menu). */
  exportMenu(): ExportMenu {
    return new ExportMenu(this.page, {
      root: 'network-detail-facilities-export',
      trigger: NETWORK_FACILITIES.exportTrigger,
      menu: 'network-detail-facilities-export-menu',
      selected: 'network-detail-facilities-export-selected',
      all: 'network-detail-facilities-export-all',
    });
  }

  // ---- Assign ---------------------------------------------------------------

  private assignButton(): Locator {
    return this.page.locator(buttonSelector(NETWORK_FACILITIES.assignButton)).first();
  }

  /** Whether the Assign Facilities action is offered. */
  async isAssignOffered(): Promise<boolean> {
    return this.assignButton()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  private drawerTitle(): Locator {
    return this.page.locator(`#${NETWORK_FACILITIES.assignDrawer.title}`);
  }

  private picker(): Locator {
    return this.page
      .locator(`#${NETWORK_FACILITIES.assignDrawer.root}`)
      .locator('p-multiselect, [role="combobox"]')
      .first();
  }

  private confirmButton(): Locator {
    return this.page.locator(buttonSelector(NETWORK_FACILITIES.assignDrawer.confirm)).first();
  }

  async openAssignDrawer(): Promise<void> {
    // ON ITS OWN TAB (2026-10-24). The detail screen opens on Overview, where
    // the Assign button does not exist; folder 05's registration flows went
    // straight from openDetails to assign() and timed out on the button.
    const onTab = await this.assignButton()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (!onTab) await this.open();
    await this.assignButton().click();
    await expect(this.drawerTitle(), 'the Assign Facilities drawer should open').toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /**
   * The pool the drawer offers, as "FCL-000009 — Nathealth" labels. The panel
   * is opened and closed again so nothing is selected.
   */
  async getAssignableOptions(): Promise<string[]> {
    await this.picker().click();
    const options = this.page.getByRole('option').filter({ visible: true });
    const any = await options
      .first()
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
    const texts = any ? await options.allInnerTexts() : [];
    await this.drawerTitle().click();
    return texts.map((t) => t.trim()).filter((t) => t !== '');
  }

  /**
   * Waits for the picker's options to stop re-rendering - two consecutive reads
   * agree - as AssignNetworkDrawer does for the payer side.
   */
  private async waitForOptionsSettled(): Promise<void> {
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    let previous = '';
    await expect
      .poll(async () => {
        const current = (await options.allInnerTexts()).join('|');
        const settled = current !== '' && current === previous;
        previous = current;
        return settled;
      }, { timeout: Timeouts.default, intervals: [150, 150, 300, 500] })
      .toBe(true);
  }

  /** Ticks facilities in the drawer by any part of their label (code or name). */
  async selectFacilities(facilities: readonly string[]): Promise<void> {
    await this.picker().click();
    await this.waitForOptionsSettled();
    for (const facility of facilities) {
      Logger.step(`Selecting facility "${facility}"`);
      // By CODE when the caller passed a whole option label (17880, 2026-10-25):
      // the label read on one opening did not match the next opening's text.
      const key = /^FCL-\d+/.exec(facility.trim())?.[0] ?? facility;
      const option = this.page.getByRole('option').filter({ hasText: key }).filter({ visible: true }).first();
      // The option resolved but never read as "stable" in 17880
      // (2026-10-24): the panel keeps re-rendering while it settles. A normal
      // click first; if it cannot land, the option's own click handler is
      // fired - the option is already proven visible and enabled above.
      await option.click({ timeout: Timeouts.short }).catch(() => option.dispatchEvent('click'));
      await expect(option, `"${facility}" should be ticked`).toHaveAttribute('aria-selected', 'true', { timeout: Timeouts.short });
    }
    // Close the overlay by clicking the drawer's own title - Escape closes the
    // whole drawer (verified 2026-10-21).
    await this.drawerTitle().click();
  }

  /** Confirms the drawer and returns what AssignFacilitiesToNetwork answered. */
  async confirmAssign(): Promise<CapturedCall> {
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkAssignFacilities, async () => {
      await this.confirmButton().click();
    });
    // A live network asks to confirm reverting to draft; accept it when asked.
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) await dialog.confirm();
    await this.detail.waitForPageReady();
    return outcome;
  }

  /** The whole assign flow, returning the server's answer. */
  async assign(facilities: readonly string[]): Promise<CapturedCall> {
    await this.openAssignDrawer();
    await this.selectFacilities(facilities);
    return this.confirmAssign();
  }

  async cancelAssign(): Promise<void> {
    await this.page.locator(buttonSelector(NETWORK_FACILITIES.assignDrawer.cancel)).first().click();
    await expect(this.drawerTitle()).toBeHidden({ timeout: Timeouts.default });
  }

  // ---- Remove ---------------------------------------------------------------

  /** Whether a facility's row offers Remove. */
  async isRemoveOffered(facility: string): Promise<boolean> {
    return (await this.row(facility).locator(`#${NETWORK_FACILITIES.removeButton}`).count()) > 0;
  }

  /** Clicks a row's Remove and returns the confirmation ("Do you want to delete X?"). */
  async openRemove(facility: string): Promise<ConfirmDialog> {
    Logger.step(`Removing facility "${facility}"`);
    await this.row(facility).locator(buttonSelector(NETWORK_FACILITIES.removeButton)).first().click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /**
   * Removes a facility, confirming the prompt, and returns what
   * UnassignFacilityFromNetwork answered (null when nothing was sent).
   */
  async remove(facility: string): Promise<CapturedCall> {
    const dialog = await this.openRemove(facility);
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkUnassignFacility, async () => {
      await dialog.confirm();
    });
    await this.detail.waitForPageReady();
    return outcome;
  }

  // ---- story 14/15/16/27/28/29 additions (facility assignment stories, 2026-10-21) ----

  /** Every row's facility code, in table order. */
  async getCodes(): Promise<string[]> {
    return (await this.readRows()).map((row) => row.code);
  }

  /**
   * Codes of the SETTLED assignments - rows whose Assignment cell reads "—",
   * i.e. the live membership. A Draft/Pending Assignment row is listed in the
   * table but is not yet a member, which is what the "not live before
   * approval" cases have to tell apart.
   */
  async getSettledCodes(): Promise<string[]> {
    return (await this.readRows()).filter((row) => /^[-—–]$/.test(row.assignment)).map((row) => row.code);
  }

  /** Polls (reloading the tab) until a facility's row is gone from the table. */
  async expectRowAbsent(facility: string): Promise<void> {
    await expect
      .poll(async () => (await this.readRows()).some((r) => r.name === facility || r.code === facility), {
        timeout: Timeouts.default,
        message: `"${facility}" should no longer be listed`,
      })
      .toBe(false);
  }

  /**
   * Removes a facility through the UI and reports what happened: the server's
   * answer and the toast. A live network may ask a second time whether to
   * revert to a draft; that prompt is accepted, as a user would, and its
   * answer is the one returned. For the cases whose subject is a REFUSAL as
   * much as a success - `remove()` does not read the message.
   */
  async attemptRemove(facility: string): Promise<{ outcome: CapturedCall; toast: string; title: string; message: string }> {
    const dialog = await this.openRemove(facility);
    const title = await dialog.getTitle();
    const message = await dialog.getMessage();
    let outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkUnassignFacility, async () => {
      await dialog.confirm();
    });
    const followUp = new ConfirmDialog(this.page);
    if (await followUp.isVisible()) {
      outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkUnassignFacility, () => followUp.confirm());
    }
    const toast = await this.detail.getToastMessage().catch(() => '');
    await this.detail.waitForPageReady();
    return { outcome, toast, title, message };
  }

  /** Opens a row's Remove prompt and CANCELS it, asserting the prompt closed. */
  async cancelRemove(facility: string): Promise<void> {
    const dialog = await this.openRemove(facility);
    await dialog.cancel();
    await dialog.waitForHidden();
  }

  /** Removes a facility by calling UnassignFacilityFromNetwork directly, bypassing the UI. */
  async removeViaApi(networkId: string, facilityId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.requestAsSession(this.page, 'DELETE', `${ApiEndpoints.networkUnassignFacility}/${networkId}/${facilityId}`);
  }

  /** Assigns facilities by calling AssignFacilitiesToNetwork directly, bypassing the filtered pool. */
  async assignViaApi(networkId: string, facilityIds: readonly string[]): Promise<{ status: number; text: string }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.networkAssignFacilities, {
      networkId,
      facilityIds,
      confirmRevertToDraft: true,
    });
  }

  /**
   * Runs the tab's advanced search with any of: facility status, an
   * assigned-on range (DD/MM/YYYY each). The drawer offers ONE range criterion,
   * `assignedon` (verified 2026-10-21), typed as "from - to" the way a PrimeNG
   * range picker renders it.
   */
  async advancedSearch(criteria: { status?: string; assignedFrom?: string; assignedTo?: string }): Promise<void> {
    const drawer = await this.openAdvancedSearch();
    if (criteria.status !== undefined) await drawer.choose('facilitystatusid', criteria.status);
    if (criteria.assignedFrom !== undefined) {
      await drawer.typeDate('assignedon', `${criteria.assignedFrom} - ${criteria.assignedTo ?? criteria.assignedFrom}`);
    }
    await drawer.submit();
    await this.detail.waitForPageReady();
  }

  /** The facility-status options the advanced search offers. */
  async getStatusFilterOptions(): Promise<string[]> {
    const drawer = await this.openAdvancedSearch();
    const options = await drawer.getOptions('facilitystatusid');
    await drawer.cancel();
    return options;
  }

  /** What the tab's advanced search offers: criteria keys, labels and controls. */
  async readAdvancedSearchChecklist(): Promise<{ keys: string[]; labels: string[]; controls: { search: boolean; cancel: boolean; close: boolean } }> {
    const drawer = await this.openAdvancedSearch();
    const checklist = { keys: await drawer.getFieldKeys(), labels: await drawer.getFieldLabels(), controls: await drawer.getControlsPresent() };
    await drawer.cancel();
    return checklist;
  }

  /** Clears every applied filter with the chips' clear-all control, then the keyword. */
  async clearAllFilters(): Promise<void> {
    Logger.step('Clearing every facility filter');
    const clearAll = this.page.locator(DETAIL_TAB_SEARCH.clearButtonSelector).filter({ visible: true }).first();
    await clearAll.click();
    await this.detail.waitForPageReady();
  }

  /** Each row's badge tones (`data-tone`), for the distinct-badge checklist. */
  async readBadgeTones(): Promise<{ code: string; assignment: string; assignmentTone: string; status: string; statusTone: string }[]> {
    return this.rows().evaluateAll((trs, ids) =>
      trs
        .filter((tr) => tr.querySelectorAll('td').length >= 5)
        .map((tr) => {
          const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim());
          return {
            code: cells[1] ?? '',
            assignment: cells[4] ?? '',
            assignmentTone: tr.querySelector(`#${ids.assignment}`)?.getAttribute('data-tone') ?? '',
            status: cells[2] ?? '',
            statusTone: tr.querySelector(`#${ids.status}`)?.getAttribute('data-tone') ?? '',
          };
        }), { assignment: NETWORK_FACILITIES.assignmentBadge, status: NETWORK_FACILITIES.statusBadge });
  }

  /** Clicks a column header (to sort by it) and returns that column's values afterwards. */
  async sortByHeader(header: string): Promise<string[]> {
    const index = (await this.getHeaders()).indexOf(header);
    expect(index, `the facilities table should have a "${header}" column`).toBeGreaterThanOrEqual(0);
    await this.table().locator('thead th').nth(index).click();
    await this.detail.waitForPageReady();
    const rows = await this.rows().evaluateAll((trs, i) =>
      trs.map((tr) => ((tr.querySelectorAll('td')[i] as HTMLElement | undefined)?.innerText ?? '').trim()), index);
    return rows.filter((value) => value !== '');
  }
}
