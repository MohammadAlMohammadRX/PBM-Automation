import type { Page } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import type { MemberManagementPage, MemberListAnswer } from '../../pages/member/MemberManagementPage';
import type { MemberImportAnswer, MemberImportDrawer } from '../../pages/member/MemberImportDrawer';
import type { ConfirmDialog } from '../../pages/components/ConfirmDialog';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { env } from '../../constants/EnvironmentConfig';
import { Timeouts } from '../../constants/Timeouts';
import { MEMBER_LIST, type MemberKpiKey } from '../../constants/member/memberIds';
import { WRITER_A_IDS } from '../../constants/member/writerAIds';
import { ACCESS_TOKEN_KEY } from '../../data/payers/lifecycleGuardrails.data';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { parseCsv, type ParsedCsv } from '../CsvUtils';
import { parseXlsx } from '../XlsxUtils';
import {
  buildMemberImportCsv,
  discardSuiteMember,
  findMemberByDocumentId,
  isSuiteMember,
  listMemberRegister,
  suiteImportRow,
  suiteMemberDisplayName,
  waitForImport,
  type MemberDashboard,
  type MemberImportColumn,
  type MemberListItem,
} from '../MemberProvisioning';

/**
 * Writer A's helpers for the member list folders: 01 counters, 02 list,
 * 03 sort, 04 search & filter, 06 export, 16 bulk import
 * (reports/member/Member-Writers-Brief.md). Built on the foundation
 * (pages/member/*, utils/MemberProvisioning.ts, fixtures/memberModule.fixture.ts);
 * what the foundation lacked is added here:
 *  - `importCleanup` - members created by an IMPORT are tracked by DOCUMENT ID
 *    (a row the case blanks a name in cannot be found by display name) and
 *    discarded at teardown when they are suite members;
 *  - `listInPayerScope` - GetMembers with the `X-Selected-Payer-Id` header the
 *    breadcrumb payer select sends (listMemberRegister sends none);
 *  - the screen ORDER of rows and cards (ids in DOM order), the export
 *    download in its separate steps (menu, format dialog, file), and the import
 *    summary / result file readers.
 */

// ---- fixtures -------------------------------------------------------------------------

export interface WriterAFixtures {
  /**
   * Registers the document IDs of rows a case IMPORTS; at teardown each member
   * found with one of them is discarded (deleted / inactivated) - suite
   * members only ("QA" / "Automation" first / second names).
   */
  importCleanup: (documentIds: readonly string[]) => void;
}

export const test = base.extend<WriterAFixtures>({
  importCleanup: async ({ page }, use) => {
    const tracked: string[] = [];
    await use((documentIds) => {
      for (const id of documentIds) if (id.trim() !== '' && !tracked.includes(id)) tracked.push(id);
    });
    for (const documentId of tracked) {
      const found = await findMemberByDocumentId(page, documentId).catch(() => null);
      if (found && isSuiteMember(found)) {
        const outcome = await discardSuiteMember(page, found.id).catch(() => 'left');
        Logger.step(`[importCleanup] ${found.memberCode} (${documentId}): ${outcome}`);
      }
    }
  },
});

export { expect };

// ---- order / text ---------------------------------------------------------------------

/** Case-insensitive text order (the database's CI collation). */
export const compareText = (a: string, b: string): number => a.localeCompare(b, 'en', { sensitivity: 'base' });

export function isOrdered<T>(values: readonly T[], compare: (a: T, b: T) => number): boolean {
  return values.every((value, i) => i === 0 || compare(values[i - 1], value) <= 0);
}

/** How many times consecutive values change - 1 at most when the values are grouped (two groups). */
export function groupChanges(values: readonly string[]): number {
  return values.reduce((n, value, i) => (i > 0 && value !== values[i - 1] ? n + 1 : n), 0);
}

export const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The status text the list shows for a register item. */
export const statusOf = (item: Pick<MemberListItem, 'isActive'>): string => (item.isActive ? 'Active' : 'Inactive');

// ---- register -------------------------------------------------------------------------

/** The whole register (GetMembers, every row) - read-only. */
export async function wholeRegister(page: Page, criteria: Record<string, unknown> = {}): Promise<MemberListItem[]> {
  const first = await listMemberRegister(page, criteria, 500);
  if (first.totalRows <= first.items.length) return first.items;
  return (await listMemberRegister(page, criteria, first.totalRows + 50)).items;
}

/** What the four tiles should read, counted off the register: total, active, inactive, flagged (whatever the status). */
export function countRegister(items: readonly MemberListItem[]): MemberDashboard {
  return {
    total: items.length,
    active: items.filter((i) => i.isActive).length,
    inactive: items.filter((i) => !i.isActive).length,
    specialNeeds: items.filter((i) => i.isSpecialNeeds).length,
  };
}

/** The tiles as numbers (settled). */
export async function readTiles(list: MemberManagementPage): Promise<MemberDashboard> {
  const kpis = await list.readKpis();
  const num = (key: MemberKpiKey): number => Number(kpis[key].value.replace(/[^\d-]/g, '') || NaN);
  return { total: num('total'), active: num('active'), inactive: num('inactive'), specialNeeds: num('specialNeeds') };
}

/** Each tile value's rendered font size and weight (a "consistent styling" check). */
export async function readTileStyles(page: Page): Promise<Record<MemberKpiKey, string>> {
  const out = {} as Record<MemberKpiKey, string>;
  for (const [key, id] of Object.entries(MEMBER_LIST.kpi) as [MemberKpiKey, string][]) {
    out[key] = await page.locator(`#${id}${WRITER_A_IDS.kpiValueSuffix}`)
      .evaluate((el) => `${getComputedStyle(el).fontSize} ${getComputedStyle(el).fontWeight}`).catch(() => '');
  }
  return out;
}

/**
 * GetMembers as the breadcrumb payer select sends it - the `X-Selected-Payer-Id`
 * header (`payerId`) - with any list criteria. Read-only.
 */
export async function listInPayerScope(page: Page, payerId: string, criteria: Record<string, unknown> = {}, rows = 500): Promise<MemberListAnswer & { status: number }> {
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const res = await page.request.fetch(`${env.baseUrl}${ApiEndpoints.memberList}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Selected-Payer-Id': payerId },
    data: { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', isActive: null, ...criteria },
    failOnStatusCode: false,
  });
  const body = (await res.json().catch(() => ({}))) as { payload?: { members?: MemberListAnswer } };
  return { status: res.status(), items: body.payload?.members?.items ?? [], totalRows: body.payload?.members?.totalRows ?? -1 };
}

// ---- screen order -----------------------------------------------------------------------

/** The member ids of the table rows on screen, in screen order. */
export async function readTableIds(page: Page): Promise<string[]> {
  const ids = await page.locator(`[id^="${WRITER_A_IDS.rowCodeCellPrefix}"][id$="${WRITER_A_IDS.rowCodeCellSuffix}"]`).evaluateAll((cells) => cells.map((c) => c.id));
  return ids.map((id) => id.slice(WRITER_A_IDS.rowCodeCellPrefix.length, id.length - WRITER_A_IDS.rowCodeCellSuffix.length));
}

/** The member ids of the cards on screen, in screen order. */
export async function readCardIds(page: Page): Promise<string[]> {
  const ids = await page.locator(`[id^="${WRITER_A_IDS.cardTitlePrefix}"][id$="${WRITER_A_IDS.cardTitleSuffix}"]`).evaluateAll((titles) => titles.map((t) => t.id));
  return ids.map((id) => id.slice(WRITER_A_IDS.cardTitlePrefix.length, id.length - WRITER_A_IDS.cardTitleSuffix.length));
}

/** Waits for the cards to render, then their ids in screen order. */
export async function waitForCardIds(page: Page): Promise<string[]> {
  await expect.poll(async () => (await readCardIds(page)).length, { message: 'the cards should render', timeout: Timeouts.default }).toBeGreaterThan(0);
  return readCardIds(page);
}

/** The keyword search box: its value and its accessible label (placeholder / aria-label / label). */
export async function readSearchBox(page: Page): Promise<{ value: string; label: string; visible: boolean }> {
  const box = page.locator(`#${MEMBER_LIST.searchInput}`);
  const visible = await box.isVisible().catch(() => false);
  const value = await box.inputValue().catch(() => '');
  const label = await box.evaluate((el) => {
    const input = el as HTMLInputElement;
    const labelled = input.labels && input.labels.length > 0 ? input.labels[0].innerText : '';
    return (input.getAttribute('aria-label') ?? '') || labelled || input.placeholder || '';
  }).catch(() => '');
  return { value, label: label.trim(), visible };
}

/** Types into the search box WITHOUT waiting for the list (the typed value check). */
export async function typeKeyword(page: Page, term: string): Promise<void> {
  await page.locator(`#${MEMBER_LIST.searchInput}`).fill(term);
}

/**
 * The toolbar's buttons whose text matches `label` (Search / Apply / Clear
 * Filters) - the case names them by label, and the toolbar is the id scope.
 */
export async function toolbarButtons(page: Page, label: RegExp): Promise<{ text: string; enabled: boolean }[]> {
  const buttons = page.locator(`#${WRITER_A_IDS.toolbar}`).locator('button'); // locator-exception: the case names the Search / Apply / Clear Filters buttons by label; read inside the toolbar's id.
  const all = await buttons.evaluateAll((els) => els.map((b) => ({ text: (b as HTMLElement).innerText.trim() || (b.getAttribute('aria-label') ?? ''), enabled: !(b as HTMLButtonElement).disabled })));
  return all.filter((b) => label.test(b.text));
}

// ---- export ---------------------------------------------------------------------------

export interface DownloadedFile {
  filename: string;
  bytes: Buffer;
  request: Record<string, unknown>;
}

/** Clicks a format in the open export dialog and returns the file and the ExportMembers body sent (null when no download started). */
export async function downloadFormat(page: Page, dialog: ConfirmDialog, format: 'csv' | 'excel', timeout: number = Timeouts.default): Promise<DownloadedFile | null> {
  const request = page.waitForRequest((r) => r.url().includes(ApiEndpoints.memberExport), { timeout }).catch(() => null);
  const download = page.waitForEvent('download', { timeout }).catch(() => null);
  await dialog.clickAction(format);
  const file = await download;
  const sent = await request;
  if (!file) return null;
  const path = await file.path().catch(() => null);
  const bytes = path ? (await import('fs')).readFileSync(path) : Buffer.alloc(0);
  let body: Record<string, unknown> = {};
  try { body = (sent?.postDataJSON() as Record<string, unknown> | null) ?? {}; } catch { body = {}; }
  return { filename: file.suggestedFilename(), bytes, request: body };
}

/** Parses an export (CSV text or the first page of an .xlsx). */
export function parseExport(format: 'csv' | 'excel', bytes: Buffer): ParsedCsv {
  return format === 'csv' ? parseCsv(bytes.toString('utf8')) : parseXlsx(bytes);
}

/** Whether the bytes are an .xlsx (a ZIP: "PK"). */
export const isXlsx = (bytes: Buffer): boolean => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

export const headerOf = (headers: readonly string[], pattern: RegExp): string => headers.find((h) => pattern.test(h.trim())) ?? '';

export function columnOf(parsed: ParsedCsv, pattern: RegExp): string[] {
  const header = headerOf(parsed.headers, pattern);
  return header === '' ? [] : parsed.rows.map((r) => (r[header] ?? '').trim());
}

// ---- import ---------------------------------------------------------------------------

export type ImportRow = Record<string, string>;

/** `count` fresh suite import rows; `overrides(i)` changes row i (0-based). */
export async function importRows(page: Page, count: number, overrides: (i: number) => Partial<Record<MemberImportColumn | 'Member Code', string>> = () => ({})): Promise<ImportRow[]> {
  const rows: ImportRow[] = [];
  for (let i = 0; i < count; i += 1) rows.push(await suiteImportRow(page, overrides(i)));
  return rows;
}

/** The document IDs of import rows (for importCleanup). */
export const documentIdsOf = (rows: readonly ImportRow[]): string[] => rows.map((r) => r['Document ID *'] ?? '').filter((d) => d !== '');

/** The display name a suite import row creates. */
export const importedName = (row: ImportRow): string => suiteMemberDisplayName(row['Last Name (English) *'] ?? '');

/** A CSV upload of rows (the template's columns; "Member Code" first when any row has one). */
export const csvUpload = (name: string, rows: ImportRow[]): { name: string; mimeType: string; buffer: Buffer } => ({ name, mimeType: 'text/csv', buffer: buildMemberImportCsv(rows) });

/** The bulk operation id in ImportMembers' answer. */
export function operationIdOf(answerText: string): string | null {
  try {
    const payload = (JSON.parse(answerText) as { payload?: Record<string, unknown> }).payload ?? {};
    return String(payload.operationId ?? payload.OperationId ?? payload.id ?? '') || null;
  } catch {
    return null;
  }
}

/** The state ImportMembers answered the operation with ("Pending"). */
export function operationStatusOf(answerText: string): string {
  try {
    return String(((JSON.parse(answerText) as { payload?: Record<string, unknown> }).payload ?? {}).status ?? '');
  } catch {
    return '';
  }
}

/** Adds the file to the open Import drawer and returns the answer and the operation id. */
export async function addImportFile(drawer: MemberImportDrawer, file: { name: string; mimeType: string; buffer: Buffer }): Promise<MemberImportAnswer & { operationId: string | null }> {
  const answer = await drawer.addFile(file);
  return { ...answer, operationId: operationIdOf(answer.text) };
}

/** Waits for an import to finish; the final bulk operation (status, totalRows, succeededRows, failedRows, createdRows, updatedRows ...). */
export async function finishImport(page: Page, operationId: string | null, timeoutMs = 180_000): Promise<Record<string, unknown>> {
  if (!operationId) throw new Error('ImportMembers answered no operation id');
  return waitForImport(page, operationId, timeoutMs);
}

/** A number field of the bulk operation (camel or Pascal case). */
export const opNumber = (op: Record<string, unknown>, key: string): number => Number(op[key] ?? op[key.charAt(0).toUpperCase() + key.slice(1)] ?? NaN);

/** Polls the operation's status every `everyMs` until it is final; every status seen, in order (duplicates collapsed). */
export async function watchImport(page: Page, operationId: string, timeoutMs = 180_000, everyMs = 250): Promise<{ seen: string[]; last: Record<string, unknown> }> {
  const seen: string[] = [];
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const res = await NetworkUtils.postAsSession(page, ApiEndpoints.bulkOperationsStatus, { ids: [operationId] });
    try {
      const items = ((JSON.parse(res.text) as { payload?: Record<string, unknown>[] }).payload ?? []) as Record<string, unknown>[];
      last = items[0] ?? last;
    } catch { /* keep the last */ }
    const status = String(last.status ?? last.Status ?? '');
    if (status !== '' && seen[seen.length - 1] !== status) seen.push(status);
    if (['Completed', 'CompletedWithErrors', 'Failed'].includes(status)) return { seen, last };
    await page.waitForTimeout(everyMs);
  }
  return { seen, last };
}

/**
 * Opens Upload history (reopening the Import drawer first when it closed) and
 * returns the row of `fileName` (cells by key, `rowId`) and the history text.
 */
export async function historyRowFor(list: MemberManagementPage, drawer: MemberImportDrawer, fileName: string): Promise<{ row: Record<string, string> | null; text: string }> {
  // The drawer may be sliding closed once the import starts (2026-11-05: "not stable" / "detached" on the history button):
  // let it settle, and when the click still fails reopen the drawer and try again.
  await new Promise((settle) => setTimeout(settle, 1_000));
  if (!(await drawer.isOpen().catch(() => false))) await list.openImport();
  let text = '';
  for (let attempt = 1; ; attempt += 1) {
    try {
      text = await drawer.openHistory();
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      Logger.warn(`[import] Upload history did not open (attempt ${attempt}) - reopening the Import drawer`);
      await new Promise((settle) => setTimeout(settle, 1_000));
      if (!(await drawer.isOpen().catch(() => false))) await list.openImport();
    }
  }
  let row: Record<string, string> | null = null;
  await expect.poll(async () => {
    row = (await drawer.readHistoryRows()).find((r) => Object.values(r).some((v) => v.includes(fileName))) ?? null;
    return row !== null;
  }, { message: `an Upload history row for "${fileName}"`, timeout: Timeouts.default }).toBe(true).catch(() => undefined);
  // The text read when the panel opened can still say "Loading…" - read it again once the rows are in (2026-11-05).
  if (row) text = await drawer.readHistoryText();
  return { row, text };
}

/** A history cell by a key pattern (`/fail/` -> failedrows). */
export function cellOf(row: Record<string, string> | null, key: RegExp): string {
  if (!row) return '';
  const found = Object.keys(row).find((k) => k !== 'rowId' && key.test(k));
  return found ? row[found] : '';
}

/** The result (error) file's rows; the "Error" column first. */
export function resultRows(bytes: Buffer, format: 'csv' | 'excel' = 'csv'): ParsedCsv {
  return parseExport(format, bytes);
}

/** The error text of a result row. */
export const errorOf = (row: Record<string, string> | undefined): string => (row ? (row[Object.keys(row).find((k) => /^error/i.test(k.trim())) ?? ''] ?? '') : '');

/** The result row holding `documentId`. */
export function resultRowFor(parsed: ParsedCsv, documentId: string): Record<string, string> | undefined {
  const header = headerOf(parsed.headers, /^document id/i);
  return parsed.rows.find((r) => (r[header] ?? '').trim() === documentId);
}

/** The ids of the register members holding a document ID (a keyword search; exact match). */
export async function membersWithDocumentId(page: Page, documentId: string): Promise<MemberListItem[]> {
  return (await listMemberRegister(page, { searchText: documentId }, 50)).items.filter((i) => i.documentId === documentId);
}
