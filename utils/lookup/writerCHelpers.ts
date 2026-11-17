import { test as base } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { LookupItemsPage, type LookupItemDrawer } from '../../pages/lookup/LookupPages';
import { ExportMenu } from '../../pages/components/ExportMenu';
import { captureExport, type UserExportResult } from '../../pages/user/userCommon';
import { buttonSelector } from '../../constants/ElementIds';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { LOOKUP_ITEMS } from '../../constants/lookup/lookupIds';
import {
  LOOKUP_DELETE_DIALOG,
  LOOKUP_EXPORT_FORMAT,
  LOOKUP_ITEMS_EXPORT,
  LOOKUP_ITEM_API,
  LOOKUP_ITEM_ROW,
  LOOKUP_TOAST,
} from '../../constants/lookup/writerCIds';
import { EXPORT_COLUMNS } from '../../data/lookup/exportLookupItems.data';
import type { ParsedCsv } from '../CsvUtils';
import { Logger } from '../Logger';
import { NetworkUtils } from '../NetworkUtils';
import { readAllLookups, readLookupItems, type LookupItem } from './lookupApi';

/**
 * Writer C helpers - Lookups Management folders 05 (Export Lookup Items,
 * US 20857) and 07 (Delete Lookup Item, US 20859). Readers and small actions on
 * top of the lead's LookupItemsPage / LookupItemDrawer and the shared
 * ExportMenu; nothing here asserts - each returns what the screen / server
 * showed, so the spec asserts what ITS case expects.
 */

export type ExportedFile = UserExportResult;

// ---------------------------------------------------------------- text

/** Whitespace collapsed and every dash normalised to "-" (lead decision 2). */
export function normText(text: string): string {
  return text.replace(/[‒–—―−]/g, '-').replace(/\s+/g, ' ').trim();
}

/** normText without the dash BETWEEN a toast's summary and detail ("A — B" -> "A B"). */
export function sepless(text: string): string {
  return normText(text).replace(/ - /g, ' ');
}

// ---------------------------------------------------------------- BLOCKED (lead decision 7)

/**
 * Marks the case BLOCKED - unless an earlier step already FAILED: then the
 * finding stays visible (the case ends FAIL) and the reason is kept as a note.
 * Same idea as utils/settings/writerBHelpers.ts `blockUnlessAStepFailed`.
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = base.info();
  if (info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `This step could not be observed either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/** Returns `value`, or BLOCKS the case with `reason` when it is null (throws when an earlier step failed). */
export function requireOrBlock<T>(steps: TestSteps, value: T | null, reason: string): T {
  if (value !== null) return value;
  blockUnlessAStepFailed(steps, reason);
  throw new Error(reason);
}

// ---------------------------------------------------------------- toasts

/** Every toast on screen as its forms: "summary detail", summary, detail, whole text (each sepless). */
export async function toastForms(page: Page): Promise<string[]> {
  const toasts = await page.locator(`#${LOOKUP_TOAST.root}`).evaluateAll((els, ids) => els.map((el) => ({
    summary: (el.querySelector(`#${ids.summary}`)?.textContent ?? '').trim(),
    detail: (el.querySelector(`#${ids.detail}`)?.textContent ?? '').trim(),
    whole: (el as HTMLElement).innerText ?? '',
  })), { summary: LOOKUP_TOAST.summary, detail: LOOKUP_TOAST.detail }).catch(() => [] as { summary: string; detail: string; whole: string }[]);
  const forms = toasts.flatMap((t) => [`${t.summary} ${t.detail}`, t.summary, t.detail, t.whole]).map(sepless).filter((f) => f !== '');
  return [...new Set(forms)];
}

/**
 * Waits up to `timeout` for a toast reading `expected` (summary, detail or
 * "summary - detail") and returns every toast form seen - the caller asserts
 * `toContain(sepless(expected))`, so a miss reports what WAS shown.
 */
export async function waitForToast(page: Page, expected: string, timeout: number = Timeouts.toast): Promise<string[]> {
  const want = sepless(expected);
  const seen = new Set<string>();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const f of await toastForms(page)) seen.add(f);
    if (seen.has(want)) break;
    await page.waitForTimeout(200);
  }
  return [...seen];
}

// ---------------------------------------------------------------- items list

/** The codes of the item rows on screen, in screen order. */
export async function codesOnScreen(items: LookupItemsPage): Promise<string[]> {
  return items.readColumn(LOOKUP_ITEMS.column.code);
}

/**
 * Types `term` in the items search box and presses Enter, then waits for the
 * list's own answer (GET Items, when the search asks the server) and for the
 * rows to stop changing; returns the codes on screen.
 *
 * Not ListPageBase.search: that first enforces the Table/Cards toggle, which
 * the lookup screens do not have - it would reload the page three times.
 */
export async function searchItems(page: Page, items: LookupItemsPage, term: string): Promise<string[]> {
  Logger.step(`Searching the lookup items for "${term}"`);
  const answered = page.waitForResponse((r) => r.url().includes(LOOKUP_ITEM_API.items), { timeout: Timeouts.short }).catch(() => null);
  const box = items.control('searchInput');
  await box.fill(term);
  await box.press('Enter');
  await answered;
  await items.waitForPageReady();
  let last = (await codesOnScreen(items)).join('|');
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(300);
    const now = (await codesOnScreen(items)).join('|');
    if (now === last) break;
    last = now;
  }
  return codesOnScreen(items);
}

/** A row's cells as shown (code, names, order, status, predefined) - for "unchanged" checks. */
export async function rowCells(items: LookupItemsPage, itemId: string): Promise<Record<keyof typeof LOOKUP_ITEMS.column, string>> {
  const out = {} as Record<keyof typeof LOOKUP_ITEMS.column, string>;
  for (const key of Object.keys(LOOKUP_ITEMS.column) as (keyof typeof LOOKUP_ITEMS.column)[]) {
    out[key] = normText(await items.cellOf(itemId, key).innerText({ timeout: Timeouts.default }).catch(() => ''));
  }
  return out;
}

/** Whether the items list shows its empty state (or simply no rows). */
export async function itemsListEmpty(page: Page, items: LookupItemsPage): Promise<boolean> {
  const empty = await page.locator(`#${LOOKUP_ITEM_ROW.empty}`).isVisible().catch(() => false);
  return empty || (await items.getRowCount()) === 0;
}

// ---------------------------------------------------------------- export

/** The shared ExportMenu pointed at the items screen (inferred ids). */
export function itemsExportMenu(page: Page): ExportMenu {
  return new ExportMenu(page, LOOKUP_ITEMS_EXPORT);
}

/** The scope menu's two choices as shown ('' when one is not rendered). */
export async function scopeChoices(page: Page): Promise<{ selected: string; all: string }> {
  const read = async (id: string): Promise<string> => normText(await page.locator(`#${id}`).innerText({ timeout: Timeouts.short }).catch(() => ''));
  return { selected: await read(LOOKUP_ITEMS_EXPORT.selected), all: await read(LOOKUP_ITEMS_EXPORT.all) };
}

/** Whether the format prompt (or any of its format buttons) is on screen now. */
export async function formatPromptShown(page: Page): Promise<boolean> {
  const dialog = await page.locator(`#${LOOKUP_EXPORT_FORMAT.root}`).isVisible().catch(() => false);
  const excel = await page.locator(buttonSelector(LOOKUP_EXPORT_FORMAT.excel)).first().isVisible().catch(() => false);
  return dialog || excel;
}

/** The FORMATS the open prompt offers (action keys, dismissals excluded), e.g. `['excel']`. */
export async function formatsOffered(page: Page): Promise<string[]> {
  await page.locator(`#${LOOKUP_EXPORT_FORMAT.root}`).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
  const ids = await page.locator(`#${LOOKUP_EXPORT_FORMAT.actions} [id^="${LOOKUP_EXPORT_FORMAT.actionPrefix}"]`)
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).id)).catch(() => [] as string[]);
  const dismissive: readonly string[] = LOOKUP_EXPORT_FORMAT.dismissive;
  return [...new Set(ids.map((id) => id.slice(LOOKUP_EXPORT_FORMAT.actionPrefix.length)))].filter((key) => !dismissive.includes(key));
}

/** With the format prompt open: picks Excel and returns the request sent, the file and its parsed first sheet. */
export async function downloadExcel(page: Page): Promise<ExportedFile> {
  return captureExport(page, LOOKUP_ITEM_API.export, async () => {
    await page.locator(buttonSelector(LOOKUP_EXPORT_FORMAT.excel)).first().click({ timeout: Timeouts.default });
  });
}

/** Whether the bytes are an .xlsx (a ZIP: "PK"). */
export const isXlsx = (bytes: Buffer): boolean => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

const headerOf = (headers: readonly string[], pattern: RegExp): string => headers.find((h) => pattern.test(h.trim())) ?? '';

/** The file's Code column. */
export function exportedCodes(parsed: ParsedCsv): string[] {
  const header = headerOf(parsed.headers, EXPORT_COLUMNS[0][1]);
  return header === '' ? [] : parsed.rows.map((r) => (r[header] ?? '').trim());
}

/** The columns of EXPORT_COLUMNS the file lacks. */
export function missingColumns(parsed: ParsedCsv): string[] {
  return EXPORT_COLUMNS.filter(([, pattern]) => headerOf(parsed.headers, pattern) === '').map(([name]) => name);
}

const sorted = (values: readonly string[]): string[] => [...values].sort((a, b) => a.localeCompare(b));

/** Sorted codes - for comparing a file with the list regardless of order. */
export const sortedCodes = (values: readonly string[]): string[] => sorted(values);

/**
 * Every disagreement between the file's rows and the API items (by code):
 * missing / extra rows, and per row the English name, Arabic name, order,
 * status and predefined values.
 */
export function rowMismatches(parsed: ParsedCsv, items: readonly LookupItem[]): string[] {
  const col = (i: number): string => headerOf(parsed.headers, EXPORT_COLUMNS[i][1]);
  const [code, en, ar, order, status, predefined] = [0, 1, 2, 3, 4, 5].map(col);
  const out: string[] = [];
  const byCode = new Map(items.map((i) => [i.code, i]));
  const seen = new Set<string>();
  for (const row of parsed.rows) {
    const c = (row[code] ?? '').trim();
    seen.add(c);
    const item = byCode.get(c);
    if (!item) {
      out.push(`row "${c}" is not an item of the list`);
      continue;
    }
    const cell = (h: string): string => (h === '' ? '' : (row[h] ?? '').trim());
    if (cell(en) !== item.englishName) out.push(`${c}: English "${cell(en)}" vs "${item.englishName}"`);
    if (cell(ar) !== item.arabicName) out.push(`${c}: Arabic "${cell(ar)}" vs "${item.arabicName}"`);
    const o = cell(order);
    const orderOk = Number(o) === item.index || (item.index === 0 && ['', '-', '—'].includes(o));
    if (!orderOk) out.push(`${c}: order "${o}" vs ${item.index}`);
    const active = /^(active|yes|true|نشط|نعم)$/i.test(cell(status));
    if (active !== item.isActive) out.push(`${c}: status "${cell(status)}" vs isActive ${item.isActive}`);
    const pre = /^(yes|true|نعم)$/i.test(cell(predefined));
    if (pre !== item.predefined) out.push(`${c}: predefined "${cell(predefined)}" vs ${item.predefined}`);
  }
  for (const item of items) if (!seen.has(item.code)) out.push(`item "${item.code}" is missing from the file`);
  return out;
}

/**
 * 21160: Export -> Selected Export on an empty view. Reports whether the
 * format prompt came up, whether a file downloaded, and the toasts shown.
 */
export async function selectedExportOfNothing(page: Page, expectedMessage: string): Promise<{ formatPrompt: boolean; downloaded: boolean; toasts: string[] }> {
  const download = page.waitForEvent('download', { timeout: Timeouts.short }).then(() => true).catch(() => false);
  await page.locator(buttonSelector(LOOKUP_ITEMS_EXPORT.trigger)).first().click();
  await page.locator(`#${LOOKUP_ITEMS_EXPORT.selected}`).click({ timeout: Timeouts.default });
  const toasts = await waitForToast(page, expectedMessage);
  const formatPrompt = await formatPromptShown(page);
  return { formatPrompt, downloaded: await download, toasts };
}

/**
 * 21161 (lead decision 4): ExportLookupItems answers 500 in this window only.
 * Returns how many export requests the app sent, and the function that
 * removes the fault.
 */
export async function failExportService(page: Page): Promise<{ hits: () => number; restore: () => Promise<void> }> {
  let hits = 0;
  const matcher = (url: URL): boolean => url.pathname.includes(LOOKUP_ITEM_API.export);
  const handler = async (route: Route): Promise<void> => {
    hits += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ status: 500, title: 'QA automation: export service made to fail (page.route)' }) });
  };
  await page.route(matcher, handler);
  Logger.step(`[writerC] ${LOOKUP_ITEM_API.export} answers 500 in this window`);
  return { hits: () => hits, restore: async () => page.unroute(matcher, handler).catch(() => undefined) };
}

/** With the format prompt open and the service failing: picks Excel; returns whether a file downloaded and the toasts. */
export async function excelWhileFailing(page: Page, expectedMessage: string): Promise<{ downloaded: boolean; toasts: string[] }> {
  const download = page.waitForEvent('download', { timeout: Timeouts.short }).then(() => true).catch(() => false);
  await page.locator(buttonSelector(LOOKUP_EXPORT_FORMAT.excel)).first().click({ timeout: Timeouts.default });
  const toasts = await waitForToast(page, expectedMessage);
  return { downloaded: await download, toasts };
}

/** 21163: the first register list holding exactly one item (API, read only), or null. */
export async function findSingleItemList(page: Page): Promise<{ code: string; item: LookupItem } | null> {
  const { items: lists } = await readAllLookups(page);
  for (const list of lists) {
    const items = await readLookupItems(page, list.code).catch(() => [] as LookupItem[]);
    if (items.length === 1) {
      Logger.step(`[21163] "${list.code}" holds exactly one item (${items[0].code})`);
      return { code: list.code, item: items[0] };
    }
  }
  return null;
}

/**
 * 21162: opens a list's items screen in a (restricted) window and reports
 * what it offers: 'inaccessible' (no items table), 'limited' (table, no Add
 * Item) or 'full' (table and Add Item), and whether Export is offered.
 */
export async function itemsScreenAs(page: Page, listCode: string): Promise<{ url: string; mode: 'inaccessible' | 'limited' | 'full'; exportShown: boolean }> {
  const items = new LookupItemsPage(page);
  await items.goto(`${AppRoutes.lookupManagement}/${listCode}`);
  const visible = async (id: string, timeout: number): Promise<boolean> => page.locator(`#${id}`).first()
    .waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  const table = await visible(LOOKUP_ITEM_ROW.table, Timeouts.default);
  const add = table && (await visible(LOOKUP_ITEMS.addButton, Timeouts.short));
  const exportShown = await visible(LOOKUP_ITEMS_EXPORT.trigger, table ? Timeouts.short : 1_000);
  return { url: page.url(), mode: !table ? 'inaccessible' : add ? 'full' : 'limited', exportShown };
}

// ---------------------------------------------------------------- delete

export interface DeletePrompt {
  visible: boolean;
  title: string;
  message: string;
  /** Button labels in the prompt's actions row. */
  buttons: string[];
}

/** The open confirmation: title, message, button labels (normalised). */
export async function readDeletePrompt(page: Page): Promise<DeletePrompt> {
  const root = page.locator(`#${LOOKUP_DELETE_DIALOG.root}`);
  const visible = await root.waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  if (!visible) return { visible, title: '', message: '', buttons: [] };
  const text = async (id: string): Promise<string> => normText(await page.locator(`#${id}`).innerText().catch(() => ''));
  const buttons = (await page.locator(`#${LOOKUP_DELETE_DIALOG.actions} [id^="${LOOKUP_DELETE_DIALOG.actionPrefix}"]`).allInnerTexts().catch(() => [] as string[]))
    .map(normText).filter((t) => t !== '');
  return { visible, title: await text(LOOKUP_DELETE_DIALOG.title), message: await text(LOOKUP_DELETE_DIALOG.message), buttons: [...new Set(buttons)] };
}

/** The prompt's question: the title or message line that asks "Do you want to delete", else the message. */
export function promptQuestion(prompt: DeletePrompt): string {
  return [prompt.title, prompt.message].find((t) => /^Do you want to delete/i.test(t)) ?? prompt.message;
}

/** Whether the confirmation is still on screen (waits briefly for it to animate out). */
export async function deletePromptOpen(page: Page): Promise<boolean> {
  return page.locator(`#${LOOKUP_DELETE_DIALOG.root}`).waitFor({ state: 'hidden', timeout: Timeouts.short }).then(() => false).catch(() => true);
}

/** A row's Delete button: rendered? enabled? */
export async function deleteControl(items: LookupItemsPage, itemId: string): Promise<{ present: boolean; enabled: boolean }> {
  const button = items.rowAction(itemId, 'delete');
  const present = await button.waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  return { present, enabled: present && (await button.isEnabled().catch(() => false)) };
}

/** Clicks Delete on a row (waiting for it to be usable) and returns the confirmation it raised. */
export async function requestDelete(page: Page, items: LookupItemsPage, itemId: string): Promise<DeletePrompt> {
  Logger.step(`Clicking Delete on lookup item ${itemId}`);
  await items.waitForPageReady();
  await items.rowAction(itemId, 'delete').click({ timeout: Timeouts.default });
  return readDeletePrompt(page);
}

/** Answers Yes: the DeleteLookupItem answer (null when no request left), the toasts (waiting for `expectedToast`) and whether the prompt closed. */
export async function answerYes(page: Page, expectedToast: string): Promise<{ status: number | null; text: string; toasts: string[]; closed: boolean }> {
  const answer = await NetworkUtils.captureResponse(page, LOOKUP_ITEM_API.delete, async () => {
    await page.locator(buttonSelector(LOOKUP_DELETE_DIALOG.yes)).first().click({ timeout: Timeouts.default });
  });
  const toasts = await waitForToast(page, expectedToast);
  return { status: answer?.status ?? null, text: (answer?.text ?? '').replace(/\s+/g, ' ').slice(0, 300), toasts, closed: !(await deletePromptOpen(page)) };
}

/** Answers No: how many DeleteLookupItem requests left, and whether the prompt closed. */
export async function answerNo(page: Page): Promise<{ sent: number; closed: boolean }> {
  const sent = await NetworkUtils.countRequestsDuring(page, LOOKUP_ITEM_API.delete, async () => {
    await page.locator(buttonSelector(LOOKUP_DELETE_DIALOG.no)).first().click({ timeout: Timeouts.default });
  }, 1_500);
  return { sent, closed: !(await deletePromptOpen(page)) };
}

/** Whether the list (API, inactive included) still holds the item. */
export async function stillInList(page: Page, listCode: string, itemId: string): Promise<boolean> {
  return (await readLookupItems(page, listCode)).some((i) => i.id === itemId);
}

/** The stored item (API), or null when it is gone. */
export async function storedItem(page: Page, listCode: string, itemId: string): Promise<LookupItem | null> {
  return (await readLookupItems(page, listCode)).find((i) => i.id === itemId) ?? null;
}

/**
 * Tries to delete an IN-USE suite item through the screen (Delete, then Yes
 * when a prompt comes up) and reports whether it was refused: the button is
 * disabled, or the delete was answered with an error / never sent AND the
 * item is still in the list. `detail` says what the screen and server did.
 */
export async function tryDeleteInUse(page: Page, items: LookupItemsPage, listCode: string, itemId: string, deletedToast: string): Promise<{ refused: boolean; detail: string }> {
  const control = await deleteControl(items, itemId);
  if (!control.present || !control.enabled) {
    return { refused: true, detail: `Delete ${control.present ? 'disabled' : 'not rendered'} on the in-use row` };
  }
  const prompt = await requestDelete(page, items, itemId);
  const answer = prompt.visible ? await answerYes(page, deletedToast) : { status: null, text: '', toasts: await toastForms(page), closed: true };
  const kept = await stillInList(page, listCode, itemId);
  const errored = answer.status === null || answer.status >= 400;
  return {
    refused: errored && kept,
    detail: `prompt ${prompt.visible ? `"${promptQuestion(prompt)}"` : 'not shown'}; DeleteLookupItem ${answer.status ?? 'not sent'} ${answer.text}; `
      + `toasts [${answer.toasts.join(' | ')}]; item ${kept ? 'still in the list' : 'GONE'}`,
  };
}

/**
 * The explanation a DISABLED Delete gives: its own `title`, then the tooltip
 * shown when the button (or, since a disabled button gets no mouse events in
 * some browsers, its actions cell) is pointed at. Never clicks.
 */
export async function disabledDeleteTooltip(page: Page, items: LookupItemsPage, itemId: string): Promise<string> {
  const button = items.rowAction(itemId, 'delete');
  const title = normText((await button.getAttribute('title').catch(() => null)) ?? '');
  if (title !== '') return title;
  // locator-exception: PrimeNG renders the tooltip as a body-level overlay with no app id; it is read by its PrimeNG class.
  const tooltip = page.locator('.p-tooltip').filter({ visible: true }).last();
  const shown = async (): Promise<string> => normText(await tooltip.innerText({ timeout: Timeouts.short }).catch(() => ''));
  await button.hover({ force: true }).catch(() => undefined);
  let text = await shown();
  if (text === '') {
    await page.locator(`#${LOOKUP_ITEM_ROW.actions(itemId)}`).hover({ force: true }).catch(() => undefined);
    text = await shown();
  }
  return text;
}

/** The list's predefined item with the lowest Display Order (read only), or null. */
export async function firstPredefined(page: Page, listCode: string): Promise<LookupItem | null> {
  const predefined = (await readLookupItems(page, listCode)).filter((i) => i.predefined);
  return predefined.sort((a, b) => a.index - b.index)[0] ?? null;
}

// ---------------------------------------------------------------- retire (21185)

/**
 * Opens Edit on a SUITE item, clears Is Active and saves. Returns the
 * UpdateLookupItem answer, the toasts (waiting for `expectedToast`) and the
 * stored item's isActive afterwards.
 */
export async function retireThroughDrawer(
  page: Page,
  items: LookupItemsPage,
  drawer: LookupItemDrawer,
  listCode: string,
  itemId: string,
  expectedToast: string,
): Promise<{ opened: boolean; unticked: boolean; status: number | null; text: string; toasts: string[]; isActiveAfter: boolean | null }> {
  await items.waitForPageReady();
  await items.rowAction(itemId, 'edit').click({ timeout: Timeouts.default });
  const opened = await drawer.isOpen(Timeouts.default);
  const box = drawer.field('isActive');
  await box.uncheck({ force: true, timeout: Timeouts.default }).catch(() => undefined);
  const unticked = !(await box.isChecked().catch(() => true));
  const answer = await NetworkUtils.captureResponse(page, LOOKUP_ITEM_API.update, async () => {
    await drawer.field('save').click({ timeout: Timeouts.default });
  });
  const toasts = await waitForToast(page, expectedToast);
  const after = await storedItem(page, listCode, itemId);
  return { opened, unticked, status: answer?.status ?? null, text: (answer?.text ?? '').replace(/\s+/g, ' ').slice(0, 300), toasts, isActiveAfter: after ? after.isActive : null };
}
