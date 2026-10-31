import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AuditHistoryTab } from '../components/AuditHistoryTab';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { setCheckbox } from '../components/PrimeControls';
import { TerminologyFormDrawer } from './TerminologyFormDrawer';
import { TerminologyDeactivateDrawer } from './TerminologyDeactivateDrawer';
import { TerminologyRecordDialog, type RecordSaveAnswer } from './TerminologyRecordDialog';
import type { SampleRecord } from '../../utils/TerminologyProvisioning';
import { TerminologyImportDialog, type UploadAnswer, type UploadFile } from './TerminologyImportDialog';
import type { ActionState } from './TerminologyManagementPage';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  TERMINOLOGY_AUDIT,
  TERMINOLOGY_DEACTIVATE,
  TERMINOLOGY_DETAIL,
  TERMINOLOGY_SCHEMA_COLUMN,
  TOAST,
  buttonSelector,
  type TerminologyDetailAction,
  type TerminologyDetailTab,
  type TerminologyGrid,
  type TerminologySchemaColumn,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';
import { parseCsv } from '../../utils/CsvUtils';

/** One row of a detail grid: its id and its cells by column header. */
export interface GridRow {
  rowId: string;
  cells: Record<string, string>;
  /** Per-cell error explanations (the Upload Errors grid's tooltips), in column order. */
  errors: string[];
}

/** One field as the Fields tab lists it. */
export type SchemaRow = Record<TerminologySchemaColumn, string>;

/**
 * A terminology's detail screen (`/terminology-management/{id}`).
 *
 * Header actions (Deactivate / Activate, Edit, Delete) sit in the breadcrumb
 * bar; the tabs are Data, Fields, Upload Errors and Audit History (verified
 * 2026-10-29 - there is no Overview tab). The record rows repeat their Edit /
 * Delete button ids, so a record is addressed by the row that shows its text.
 */
export class TerminologyDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(id: string): Promise<void> {
    await this.goto(`${AppRoutes.terminologyManagement}/${id}`);
    await this.waitForLoaded();
  }

  /** Navigates without expecting the terminology to load - stale links, denied access. */
  async openExpectingFailure(id: string): Promise<void> {
    await this.goto(`${AppRoutes.terminologyManagement}/${id}`);
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.btn(TERMINOLOGY_DETAIL.tab.data), 'the terminology detail should load').toBeVisible({ timeout: Timeouts.default });
    await this.waitForPageReady();
  }

  async isLoaded(timeout: number = Timeouts.default): Promise<boolean> {
    return this.btn(TERMINOLOGY_DETAIL.tab.data).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  /** The terminology's name, as the breadcrumb shows it. */
  async getName(): Promise<string> {
    return (await this.byId('app-breadcrumb-current').innerText()).trim();
  }

  async getBreadcrumb(): Promise<string> {
    return (await this.byId('app-breadcrumb-list').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The whole screen's text (header + active tab) - for markers with no id of their own. */
  async getScreenText(): Promise<string> {
    const header = await this.byId('app-breadcrumb').innerText().catch(() => '');
    const body = await this.byId(TERMINOLOGY_DETAIL.root).innerText().catch(() => '');
    return `${header} ${body}`.replace(/\s+/g, ' ').trim();
  }

  // ---- header actions ----------------------------------------------------------

  async getActionState(action: TerminologyDetailAction): Promise<ActionState> {
    const button = this.btn(TERMINOLOGY_DETAIL.action[action]);
    if ((await button.count()) === 0) return { availability: 'absent', label: '', title: '' };
    return {
      availability: (await button.isEnabled()) ? 'available' : 'disabled',
      label: (await button.innerText()).trim(),
      title: (await button.getAttribute('title')) ?? (await this.byId(TERMINOLOGY_DETAIL.action[action]).getAttribute('title')) ?? '',
    };
  }

  async readActionStates(): Promise<Record<TerminologyDetailAction, ActionState>> {
    const out = {} as Record<TerminologyDetailAction, ActionState>;
    for (const action of Object.keys(TERMINOLOGY_DETAIL.action) as TerminologyDetailAction[]) out[action] = await this.getActionState(action);
    return out;
  }

  async openEditForm(): Promise<TerminologyFormDrawer> {
    await this.btn(TERMINOLOGY_DETAIL.action.edit).click();
    const drawer = new TerminologyFormDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** Clicks Deactivate and returns the drawer it opens. */
  async openDeactivateDrawer(): Promise<TerminologyDeactivateDrawer> {
    await this.btn(TERMINOLOGY_DETAIL.action.toggleActive).click();
    const drawer = new TerminologyDeactivateDrawer(this.page, TERMINOLOGY_DEACTIVATE.detail);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks a confirmation-raising header action and returns the dialog, still open. */
  async requestAction(action: 'toggleActive' | 'delete'): Promise<ConfirmDialog> {
    await this.btn(TERMINOLOGY_DETAIL.action[action]).click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  // ---- tabs --------------------------------------------------------------------

  async getTabLabels(): Promise<string[]> {
    const labels = await this.page.locator(`button[id^="${TERMINOLOGY_DETAIL.root}-tab-"]`).allInnerTexts();
    return labels.map((t) => t.trim()).filter((t) => t !== '');
  }

  async hasTab(tab: TerminologyDetailTab): Promise<boolean> {
    return this.btn(TERMINOLOGY_DETAIL.tab[tab]).isVisible();
  }

  async openTab(tab: TerminologyDetailTab): Promise<void> {
    Logger.step(`Opening the terminology's "${tab}" tab`);
    await this.btn(TERMINOLOGY_DETAIL.tab[tab]).click();
    await this.waitForPageReady();
  }

  /** Which tab is selected now (its key), '' when none reports itself selected. */
  async getActiveTab(): Promise<string> {
    for (const [key, id] of Object.entries(TERMINOLOGY_DETAIL.tab)) {
      const tab = this.page.locator(`#${id}`);
      if ((await tab.count()) === 0) continue;
      const selected = (await tab.getAttribute('aria-selected')) === 'true' || /active|selected/.test((await tab.getAttribute('class')) ?? '');
      if (selected) return key;
    }
    return '';
  }

  audit(): AuditHistoryTab {
    return new AuditHistoryTab(this.page, this, TERMINOLOGY_AUDIT, 'terminology');
  }

  // ---- grids (Data, Fields, Upload Errors) -----------------------------------------

  private gridRows(grid: TerminologyGrid): Locator {
    return this.page.locator(`tr[id^="${TERMINOLOGY_DETAIL.grid[grid]}-table-row-"]`);
  }

  /** A grid's empty state - an id when the grid has one, else the "No results found." text of the screen (as on the list). */
  private gridEmpty(grid: TerminologyGrid): Locator {
    return this.byId(`${TERMINOLOGY_DETAIL.grid[grid]}-table-empty`)
      .or(this.byId(TERMINOLOGY_DETAIL.root).getByText(/no results found|no records|no data|no errors/i))
      .first();
  }

  /** Waits for a grid to show rows or its empty state. */
  async waitForGrid(grid: TerminologyGrid): Promise<void> {
    await expect
      .poll(async () => ((await this.gridRows(grid).count()) > 0 ? 'rows' : (await this.gridEmpty(grid).count()) > 0 ? 'empty' : 'loading'), {
        timeout: Timeouts.default,
      })
      .not.toBe('loading');
  }

  /** A grid's column headers. */
  async getGridHeaders(grid: TerminologyGrid): Promise<string[]> {
    const headers = await this.page.locator(`th[id^="${TERMINOLOGY_DETAIL.grid[grid]}-table-th-"]`).allInnerTexts();
    return headers.map((t) => t.trim());
  }

  /** Every row of a grid (current page), cells keyed by header. */
  async readGrid(grid: TerminologyGrid): Promise<GridRow[]> {
    await this.waitForGrid(grid);
    const headers = await this.getGridHeaders(grid);
    const prefix = `${TERMINOLOGY_DETAIL.grid[grid]}-table-row-`;
    const rows = this.gridRows(grid);
    const out: GridRow[] = [];
    for (let i = 0; i < (await rows.count()); i += 1) {
      const row = rows.nth(i);
      const id = (await row.getAttribute('id')) ?? '';
      const cells = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
      const errors = await row.locator(`#${TERMINOLOGY_DETAIL.errorDetail}`).evaluateAll((buttons) => buttons.map((b) => b.getAttribute('title') ?? ''));
      out.push({ rowId: id.slice(prefix.length), cells: Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? ''])), errors });
    }
    return out;
  }

  /** A grid's empty-state text, '' when it lists rows. */
  async getGridEmptyText(grid: TerminologyGrid): Promise<string> {
    await this.waitForGrid(grid);
    return (await this.gridEmpty(grid).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  /** The text of the active grid's whole panel - the empty state when there is no dedicated element. */
  async getGridPanelText(grid: TerminologyGrid): Promise<string> {
    return (await this.byId(`${TERMINOLOGY_DETAIL.grid[grid]}-table`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The row with a cell reading exactly `text` - a substring match found "SAU" for "SA". */
  private gridRow(grid: TerminologyGrid, text: string): Locator {
    const exact = new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    return this.gridRows(grid).filter({ has: this.page.locator('td', { hasText: exact }) }).first();
  }

  async isGridRowShown(grid: TerminologyGrid, text: string): Promise<boolean> {
    return this.gridRow(grid, text).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /**
   * Whether a grid row has gone (waits for it to leave). isGridRowShown answers
   * at once while the grid still holds a just-deleted row (20132, 2026-10-30).
   */
  async isGridRowGone(grid: TerminologyGrid, text: string): Promise<boolean> {
    return this.gridRow(grid, text).waitFor({ state: 'hidden', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** Searches a grid (`{grid}-search-input`) and waits for it to answer. */
  async searchGrid(grid: TerminologyGrid, term: string): Promise<void> {
    const input = this.byId(`${TERMINOLOGY_DETAIL.grid[grid]}-search-input`);
    // Wait for THIS search's answer: the unfiltered rows already on screen count as a
    // rendered grid, and reading them showed all three Countries for "Sau" (20286, 2026-10-31).
    const answered = this.page
      .waitForResponse((r) => r.url().includes('/api/Terminologies/') && (r.request().postData() ?? '').includes(`"searchText":${JSON.stringify(term)}`), { timeout: Timeouts.default })
      .catch(() => null);
    await input.fill(term);
    await input.press('Enter');
    await answered;
    await this.waitForPageReady();
    await this.waitForGrid(grid);
  }

  // ---- Data tab: records ---------------------------------------------------------------

  async readRecords(): Promise<GridRow[]> {
    await this.openTab('data');
    return this.readGrid('data');
  }

  /** How the Data tab offers Add Record / Upload Data. */
  async getToolbarState(control: 'addRecord' | 'upload'): Promise<ActionState> {
    const button = this.btn(TERMINOLOGY_DETAIL[control]);
    if ((await button.count()) === 0) return { availability: 'absent', label: '', title: '' };
    return { availability: (await button.isEnabled()) ? 'available' : 'disabled', label: (await button.innerText()).trim(), title: (await button.getAttribute('title')) ?? '' };
  }

  /** How a record row offers Edit / Delete. */
  async getRecordActionState(text: string, action: 'edit' | 'delete'): Promise<ActionState> {
    const row = this.gridRow('data', text);
    await expect(row, `a record row showing "${text}"`).toBeVisible({ timeout: Timeouts.default });
    // locator-exception: every record row repeats these ids, so the button is found within its row.
    const button = row.locator(`#${action === 'edit' ? TERMINOLOGY_DETAIL.editRecord : TERMINOLOGY_DETAIL.deleteRecord}`).first();
    if ((await button.count()) === 0) return { availability: 'absent', label: '', title: '' };
    return { availability: (await button.isEnabled()) ? 'available' : 'disabled', label: (await button.innerText()).trim(), title: (await button.getAttribute('title')) ?? '' };
  }

  /** Opens Add Record - from the Data tab, the only one that carries it (20164 was left on Fields). */
  async openAddRecord(): Promise<TerminologyRecordDialog> {
    if (!(await this.btn(TERMINOLOGY_DETAIL.addRecord).isVisible())) await this.openTab('data');
    await this.btn(TERMINOLOGY_DETAIL.addRecord).click();
    const dialog = new TerminologyRecordDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
  }

  /**
   * Adds a record through Add Record from a sample (utils `sampleRecord`):
   * text inputs typed, list / mapping selects set to their first option, Is
   * Active ticked. `labelOverride` replaces the identifying value - for the
   * blank / too-long / invalid-format cases. Returns what Save answered.
   */
  async addRecordFrom(sample: SampleRecord, labelOverride?: string): Promise<RecordSaveAnswer> {
    const dialog = await this.openAddRecord();
    for (const [fieldId, value] of Object.entries(sample.text)) {
      await dialog.type(fieldId, fieldId === sample.labelFieldId && labelOverride !== undefined ? labelOverride : value);
    }
    for (const fieldId of sample.selectFirst) {
      const first = (await dialog.getOptions(fieldId))[0];
      if (first !== undefined) await dialog.choose(fieldId, first);
    }
    // Most predefined lists carry no Is Active field; a new record is active by default there.
    if (await dialog.hasActiveField()) await dialog.setActive(true);
    const answer = await dialog.save();
    if (!answer.closed) await dialog.cancel().catch(() => undefined);
    return answer;
  }

  /** Sets a record's Is Active through its Edit drawer; returns what Save answered. */
  async setRecordActive(text: string, active: boolean): Promise<RecordSaveAnswer> {
    const dialog = await this.openEditRecord(text);
    await dialog.setActive(active);
    return dialog.save();
  }

  /** The labels of a record row's own controls - for a Deactivate / Activate action on the value itself. */
  async getRecordRowControls(text: string): Promise<string[]> {
    const row = this.gridRow('data', text);
    await expect(row, `a record row showing "${text}"`).toBeVisible({ timeout: Timeouts.default });
    return row.locator('button').evaluateAll((buttons) => buttons.map((b) => `${b.getAttribute('title') ?? ''} ${b.getAttribute('aria-label') ?? ''} ${(b as HTMLElement).innerText}`.trim()));
  }

  async openEditRecord(text: string): Promise<TerminologyRecordDialog> {
    const row = this.gridRow('data', text);
    await expect(row, `a record row showing "${text}"`).toBeVisible({ timeout: Timeouts.default });
    await row.locator(`#${TERMINOLOGY_DETAIL.editRecord}`).first().click();
    const dialog = new TerminologyRecordDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
  }

  /** Clicks a record's Delete and returns the confirmation, still open. */
  async requestDeleteRecord(text: string): Promise<ConfirmDialog> {
    const row = this.gridRow('data', text);
    await expect(row, `a record row showing "${text}"`).toBeVisible({ timeout: Timeouts.default });
    await row.locator(`#${TERMINOLOGY_DETAIL.deleteRecord}`).first().click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Confirms a record deletion; returns the server's status and the messages shown. */
  async deleteRecord(text: string): Promise<{ status: number; messages: string[] }> {
    const dialog = await this.requestDeleteRecord(text);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.terminologyDeleteRow, () => dialog.confirm());
    return { status: answer?.status ?? -1, messages: await this.waitForVisibleMessages() };
  }

  /** Filters the Data tab through its advanced search, by field id (text) or flag (checkbox). */
  async filterRecords(criteria: Record<string, string | boolean>): Promise<void> {
    await this.btn(TERMINOLOGY_DETAIL.dataSearchFilterButton).click();
    await expect(this.byId(`${TERMINOLOGY_DETAIL.dataAdvancedSearch}-title`)).toBeVisible({ timeout: Timeouts.default });
    for (const [fieldId, value] of Object.entries(criteria)) {
      const input = this.byId(`${TERMINOLOGY_DETAIL.dataAdvancedSearch}-field-${fieldId}-input`);
      if (typeof value === 'string') await input.fill(value);
      else await setCheckbox(input, value);
    }
    await this.btn(`${TERMINOLOGY_DETAIL.dataAdvancedSearch}-search-button`).click();
    await this.waitForPageReady();
    await this.waitForGrid('data');
  }

  // ---- Fields tab -----------------------------------------------------------------------

  async readFields(): Promise<SchemaRow[]> {
    await this.openTab('schema');
    const rows = this.gridRows('schema');
    // A terminology always has fields (Is Active at least), so wait for rows: the Data tab's
    // "No records yet" still on screen passed for the schema grid's empty state (20269, 2026-10-30).
    await expect(rows.first(), 'the Fields tab should list the fields').toBeVisible({ timeout: Timeouts.default });
    const out: SchemaRow[] = [];
    for (let i = 0; i < (await rows.count()); i += 1) {
      const id = (await rows.nth(i).getAttribute('id')) ?? '';
      const field = {} as SchemaRow;
      for (const [key, column] of Object.entries(TERMINOLOGY_SCHEMA_COLUMN) as [TerminologySchemaColumn, string][]) {
        field[key] = (await this.byId(`${id}-cell-${column}`).innerText().catch(() => '')).trim();
      }
      out.push(field);
    }
    return out;
  }

  // ---- Upload Errors tab ------------------------------------------------------------------

  async readErrorRows(): Promise<GridRow[]> {
    await this.openTab('errors');
    return this.readGrid('errors');
  }

  /** The failed rows this session is shown - none when the tab is withheld from it. */
  async readErrorRowsIfOffered(): Promise<GridRow[]> {
    if (!(await this.hasTab('errors'))) return [];
    return this.readErrorRows();
  }

  /** Opens "Fix & save this row" for the failed row showing `text`. */
  async openFixRow(text: string): Promise<TerminologyRecordDialog> {
    const row = this.gridRow('errors', text);
    await expect(row, `a failed row showing "${text}"`).toBeVisible({ timeout: Timeouts.default });
    await row.locator(`#${TERMINOLOGY_DETAIL.fixErrorRow}`).first().click();
    const dialog = new TerminologyRecordDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
  }

  /** How a failed row offers "Fix & save". */
  async getFixRowState(text: string): Promise<ActionState> {
    const row = this.gridRow('errors', text);
    await expect(row, `a failed row showing "${text}"`).toBeVisible({ timeout: Timeouts.default });
    const button = row.locator(`#${TERMINOLOGY_DETAIL.fixErrorRow}`).first();
    if ((await button.count()) === 0) return { availability: 'absent', label: '', title: '' };
    return { availability: (await button.isEnabled()) ? 'available' : 'disabled', label: '', title: (await button.getAttribute('title')) ?? '' };
  }

  /** Whether the failed rows can be selected together (a row checkbox) for one resubmission. */
  async isRowSelectionOffered(): Promise<boolean> {
    return this.gridRows('errors').first().locator('input[type="checkbox"]').first()
      .waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  // ---- upload and export --------------------------------------------------------------------

  async openImport(): Promise<TerminologyImportDialog> {
    await this.openTab('data');
    await this.btn(TERMINOLOGY_DETAIL.upload).click();
    const dialog = new TerminologyImportDialog(this.page);
    await dialog.waitForOpen();
    return dialog;
  }

  /**
   * Tries to start an import through the screen. When Upload Data is not
   * usable the attempt stops there and says how it was offered - the
   * one-import-at-a-time cases accept a disabled control OR a refusal.
   */
  async attemptImport(file: UploadFile): Promise<UploadAnswer & { offered: ActionState['availability'] }> {
    const offered = (await this.getToolbarState('upload')).availability;
    if (offered !== 'available') return { status: -1, jobId: null, jobStatus: '', messages: [], text: '', offered };
    const dialog = await this.openImport();
    await dialog.chooseFile(file);
    return { ...(await dialog.upload()), offered };
  }

  /** The import progress snackbar's text, '' when none shows. */
  async getImportProgressText(): Promise<string> {
    const dismiss = this.byId(TERMINOLOGY_DETAIL.snackbarDismiss);
    const shown = await dismiss.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    return shown ? (await dismiss.locator('xpath=..').innerText()).replace(/\s+/g, ' ').trim() : '';
  }

  /** Everything the screen says about an import - the progress snackbar and the screen's own text. */
  async getImportStatusText(): Promise<string> {
    return `${await this.getImportProgressText()} ${await this.getScreenText()}`.trim();
  }

  /**
   * Exports a grid (data or errors) and returns it parsed. The Upload Errors
   * menu offers the formats directly (`-export-csv` / `-export-excel`), with no
   * Selected / All step (verified 2026-10-30: 20141 waited for `-export-all`).
   */
  async exportGrid(grid: 'data' | 'errors', format: 'csv' | 'excel'): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    await this.openTab(grid);
    if (grid === 'data') return new ExportMenu(this.page, TERMINOLOGY_DETAIL.dataExport).exportAndParse('all', format);
    const ids = TERMINOLOGY_DETAIL.errorsExport;
    await this.btn(ids.trigger).click();
    const option = this.byId(`${ids.root}-${format}`);
    await expect(option, `the Upload Errors export should offer ${format}`).toBeVisible({ timeout: Timeouts.default });
    const [download] = await Promise.all([this.page.waitForEvent('download', { timeout: Timeouts.queuePropagation }), option.click()]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const parsed = format === 'excel' ? parseXlsx(bytes) : { ...parseCsv(bytes.toString('utf8')), rightToLeft: false };
    return { filename: download.suggestedFilename(), bytes, parsed };
  }

  /** Inputs on the screen that would edit the terminology's definition (name / description). */
  async countDefinitionInputs(): Promise<number> {
    return this.byId(TERMINOLOGY_DETAIL.root)
      .locator('input:not([type="checkbox"]):not([id$="search-input"]), textarea')
      .filter({ visible: true })
      .count();
  }

  async waitForVisibleMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      const dialog = await this.page.locator('#pbm-dialog-message').allInnerTexts().catch(() => [] as string[]);
      return [...toast, ...dialog].map((text) => text.trim()).filter((text) => text !== '');
    }, timeout);
  }

  /** The id-addressed button of a header action - exposed for the hover / tooltip case. */
  async hoverAction(action: TerminologyDetailAction): Promise<string> {
    await this.page.locator(buttonSelector(TERMINOLOGY_DETAIL.action[action])).first().hover({ force: true });
    const tooltip = this.page.getByRole('tooltip').first();
    return tooltip.innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
  }
}
