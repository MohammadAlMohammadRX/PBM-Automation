import type { Page, Response, TestInfo } from '@playwright/test';
import { expect, test as base } from '@playwright/test';
import { readFileSync } from 'fs';
import { AppRoutes } from '../../constants/AppRoutes';
import { DIALOG, TOAST, buttonSelector } from '../../constants/ElementIds';
import { StepStatus } from '../../constants/TestStatus';
import { Timeouts } from '../../constants/Timeouts';
import { LOOKUP_REGISTER } from '../../constants/lookup/lookupIds';
import {
  SORT_FIELD_FRAGMENT,
  SORT_OPTION_CANDIDATES,
  WRITER_A_IDS,
  type LookupAdvancedField,
  type LookupSortField,
} from '../../constants/lookup/writerAIds';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { LookupRegisterPage } from '../../pages/lookup/LookupPages';
import { readDialog } from '../../pages/user/userCommon';
import { parseCsv, type ParsedCsv } from '../CsvUtils';
import { Logger } from '../Logger';
import { NetworkUtils } from '../NetworkUtils';
import { parseXlsx } from '../XlsxUtils';
import { directionOf, firstOutOfOrder } from '../user/writerAHelpers';
import type { LookupRow } from './lookupApi';

/**
 * Writer A's helpers for the Lookup Register (`lookup-list`): folders 01
 * (search and filter, US 20853) and 03 (sort and export, US 20855) -
 * reports/lookup/Lookup-Writers-Brief.md. Built on the lead's LookupRegisterPage
 * (ListPageBase) and the User module's list patterns (pages/user/IdentityListPage,
 * utils/user/writerAHelpers: `firstOutOfOrder`, `directionOf`).
 *
 * Every list action here (open, search, Advance Search, chip, Clear, sort,
 * pager) awaits ITS OWN GetLookups answer and then waits until the rows on
 * screen ARE that answer's items, so a read never sees the previous result.
 * Ids not probed in the foundation are in constants/lookup/writerAIds.ts
 * (inferred); an element whose exact id is absent is looked up by its id prefix.
 */

const A = WRITER_A_IDS.advancedSearch;
const GET_LOOKUPS = /\/api\/Lookups\/GetLookups(\?|$)/;
/** The register's export (not ExportLookupItems). */
export const EXPORT_LOOKUPS = /\/api\/Lookups\/ExportLookups(\?|$)/;

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();
/** Whitespace collapsed and every dash (em / en / hyphen) made one, for literal message checks (decision 2). */
export const normalise = (text: string): string => flat(text).replace(/\s*[—–-]\s*/g, ' - ');

// ---- step flow -------------------------------------------------------------------------

/**
 * BLOCKED only when nothing failed before (lead decision 7, the idea of
 * utils/settings/writerBHelpers.ts `blockUnlessAStepFailed`): when an earlier
 * step already FAILED the finding stands, a note says what could not be
 * observed, and the caller's own assertions run on.
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const failed = steps.records().filter((r) => r.status === StepStatus.FAIL).map((r) => r.name);
  const info = base.info();
  if (failed.length > 0 || info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `Not observable either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/** `blockUnlessAStepFailed` when the run-time precondition `met` is false. */
export function requireOrBlock(steps: TestSteps, met: boolean, reason: string): void {
  if (!met) blockUnlessAStepFailed(steps, reason);
}

// ---- GetLookups answers ------------------------------------------------------------------

export interface RegisterAnswer {
  totalRows: number;
  items: LookupRow[];
}

/** One GetLookups round trip the screen made: status (-1 = none), the body it sent, the answer. */
export interface RegisterCall {
  status: number;
  request: Record<string, unknown>;
  answer: RegisterAnswer;
  /** false when the action sent no request and the screen still shows the previous answer. */
  requeried: boolean;
}

const lastCall = new WeakMap<Page, RegisterCall>();
const noCall = (): RegisterCall => ({ status: -1, request: {}, answer: { totalRows: -1, items: [] }, requeried: false });

async function readCall(response: Response): Promise<RegisterCall> {
  const body = (await response.json().catch(() => null)) as { payload?: { totalRows?: number; items?: LookupRow[] } } | null;
  let request: Record<string, unknown> = {};
  try {
    request = (response.request().postDataJSON() as Record<string, unknown> | null) ?? {};
  } catch {
    request = {};
  }
  return { status: response.status(), request, answer: { totalRows: body?.payload?.totalRows ?? -1, items: body?.payload?.items ?? [] }, requeried: true };
}

/**
 * Runs `action` and returns the GetLookups answer it triggered (whose request
 * body passes `accept`), once the rows on screen are that answer's items.
 */
export async function captureRegister(
  page: Page,
  action: () => Promise<void>,
  accept: (body: string) => boolean = () => true,
  timeout: number = Timeouts.default,
): Promise<RegisterCall> {
  const waiting = page.waitForResponse((r) => GET_LOOKUPS.test(r.url()) && accept(r.request().postData() ?? ''), { timeout }).catch(() => null);
  await action();
  const response = await waiting;
  if (!response) return noCall();
  const call = await readCall(response);
  if (response.ok()) {
    lastCall.set(page, call);
    await waitScreenShows(page, call.answer.items);
  }
  return call;
}

/** Opens the register and returns its FIRST answer (the default order). `.open()` asserts the table rendered. */
export async function openCapturing(page: Page, register: LookupRegisterPage): Promise<RegisterCall> {
  return captureRegister(page, () => register.open());
}

/** Re-reads the register with a request the screen sent (its filters and sort), every row at once. */
export async function replayRegister(page: Page, request: Record<string, unknown>, rowsPerPage = 1000): Promise<RegisterAnswer & { status: number }> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', '/api/Lookups/GetLookups', { ...request, pageNumber: 1, rowsPerPage });
  let payload: { totalRows?: number; items?: LookupRow[] } | undefined;
  try {
    payload = (JSON.parse(res.text) as { payload?: { totalRows?: number; items?: LookupRow[] } }).payload;
  } catch {
    payload = undefined;
  }
  return { status: res.status, totalRows: payload?.totalRows ?? -1, items: payload?.items ?? [] };
}

// ---- rows on screen ----------------------------------------------------------------------

export interface RegisterRow {
  id: string;
  code: string;
  englishName: string;
  arabicName: string;
}

const rowsLocator = (page: Page) => page.locator(`tr[id^="${WRITER_A_IDS.rowPrefix}"]`);

/** The lookup ids of the rows on screen, in order. */
export async function rowIdsOnScreen(page: Page): Promise<string[]> {
  return (await rowsLocator(page).evaluateAll((trs) => trs.map((tr) => tr.id))).map((id) => id.slice(WRITER_A_IDS.rowPrefix.length));
}

/** Waits (polled) until the rows on screen are exactly `items`, in order; false when they never were. */
export async function waitScreenShows(page: Page, items: readonly { id: string }[]): Promise<boolean> {
  const want = items.map((i) => i.id).join(',');
  return expect
    .poll(async () => (await rowIdsOnScreen(page)).join(','), { timeout: Timeouts.default })
    .toBe(want)
    .then(() => true)
    .catch(() => false);
}

/** Every row on screen with its three data cells, in one pass. */
export async function rowsOnScreen(page: Page): Promise<RegisterRow[]> {
  const c = LOOKUP_REGISTER.column;
  return rowsLocator(page).evaluateAll(
    (trs, args) =>
      trs.map((tr) => {
        const read = (key: string): string => {
          const cell = tr.querySelector(`[id$="-cell-${key}"]`);
          return cell ? (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
        };
        return { id: tr.id.slice(args.prefix.length), code: read(args.code), englishName: read(args.en), arabicName: read(args.ar) };
      }),
    { prefix: WRITER_A_IDS.rowPrefix, code: c.code, en: c.englishName, ar: c.arabicName },
  );
}

/** The action suffixes each row on screen offers (`view`, `edit`, ...), de-duplicated. */
export async function rowActionsOnScreen(page: Page): Promise<string[]> {
  const suffixes = await rowsLocator(page).evaluateAll((trs) =>
    trs.flatMap((tr) => Array.from(tr.querySelectorAll('button[id]')).map((b) => b.id.slice(tr.id.length + 1))));
  return [...new Set(suffixes)];
}

/** The header texts and keys, in screen order. */
export async function headersOnScreen(page: Page): Promise<{ keys: string[]; texts: string[] }> {
  const headers = page.locator(`th[id^="${WRITER_A_IDS.headerPrefix}"]`);
  const keys = (await headers.evaluateAll((ths) => ths.map((th) => th.id))).map((id) => id.slice(WRITER_A_IDS.headerPrefix.length));
  const texts = (await headers.allInnerTexts()).map(flat);
  return { keys, texts };
}

/** The empty state's text: the `-table-empty` row, or the id-less placeholder block. */
export async function emptyStateText(page: Page): Promise<string> {
  const row = flat(await page.locator(`#${WRITER_A_IDS.tableEmpty}`).innerText({ timeout: 2_000 }).catch(() => ''));
  if (row) return row;
  // locator-exception: some shared lists render the empty state as an id-less block (`{screen}__placeholder`, User module 2026-11-08).
  return flat(await page.locator(`.${WRITER_A_IDS.placeholderClass}`).first().innerText({ timeout: Timeouts.short }).catch(() => ''));
}

/** Pages through the whole register (pager Next, each answer awaited): every row, the pages seen, every row action offered. */
export async function readAllPages(page: Page): Promise<{ rows: RegisterRow[]; pages: number; actions: string[] }> {
  const rows: RegisterRow[] = [];
  const actions = new Set<string>();
  let pages = 0;
  const next = page.locator(buttonSelector(`${LOOKUP_REGISTER.screen}-table-pager-next`)).first();
  for (let i = 0; i < 30; i += 1) {
    pages += 1;
    rows.push(...(await rowsOnScreen(page)));
    for (const a of await rowActionsOnScreen(page)) actions.add(a);
    if ((await next.count()) === 0 || !(await next.isVisible()) || !(await next.isEnabled())) break;
    const call = await captureRegister(page, () => next.click());
    if (call.status === -1) break;
  }
  return { rows, pages, actions: [...actions] };
}

/** Whether the register offers an Add control (shared `-add-button` id, or any id ending in add-button inside the register). */
export async function addControlOffered(page: Page): Promise<boolean> {
  const own = await page.locator(`#${WRITER_A_IDS.addButton}`).count();
  const any = await page.locator(`#${LOOKUP_REGISTER.screen} [id$="add-button"]`).count();
  return own + any > 0;
}

// ---- search ------------------------------------------------------------------------------

/** The search box's current value. */
export async function searchBoxValue(page: Page): Promise<string> {
  return page.locator(`#${LOOKUP_REGISTER.searchInput}`).inputValue().catch(() => '');
}

/** Types a keyword (debounced; Enter when nothing was sent) and returns the answer to THIS term. */
export async function searchRegister(page: Page, term: string): Promise<RegisterCall> {
  Logger.step(`Searching the Lookup Register for "${term}"`);
  const input = page.locator(`#${LOOKUP_REGISTER.searchInput}`);
  const wanted = term.trim();
  const accept = (body: string): boolean => (wanted === '' ? !/"searchText":"[^"]/.test(body) : body.includes(JSON.stringify(wanted)));
  if ((await input.inputValue()) === term && term !== '') await captureRegister(page, () => input.fill(''), () => true, Timeouts.short);
  const typed = await captureRegister(page, () => input.fill(term), accept, Timeouts.short);
  if (typed.status !== -1) return typed;
  const entered = await captureRegister(page, () => input.press('Enter'), accept);
  if (entered.status !== -1) return entered;
  // Repeating the term already searched sends NO request (the box de-duplicates):
  // the screen still shows the LAST answer it received - that is what the rows
  // must be compared with (21117, smoke 2026-11-09). Whether that answer fits
  // the term is the caller's check, so a stale list is still caught.
  const last = lastCall.get(page);
  return last ? { ...last, requeried: false } : entered;
}

// ---- Advance Search ----------------------------------------------------------------------

/** Opens the Advance Search drawer; whether it opened (its title or a field showed). */
export async function openAdvanced(page: Page): Promise<boolean> {
  await page.locator(buttonSelector(LOOKUP_REGISTER.filterButton)).first().click();
  const shown = page.locator(`#${A.title}`).or(page.locator(`[id^="${A.fieldPrefix}"][id$="-input"]`)).first();
  return shown.waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
}

/** Closes the drawer (Close, else Escape) and waits for it to animate away. */
export async function closeAdvanced(page: Page): Promise<void> {
  const close = page.locator(buttonSelector(A.close)).first();
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => undefined);
  else await page.keyboard.press('Escape');
  await page.locator(`#${A.title}`).waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
}

/** The drawer's field labels (each wrapper's first line). */
export async function advancedLabels(page: Page): Promise<string[]> {
  return (await page.locator(`[id^="${A.fieldPrefix}"]:not([id$="-input"])`).allInnerTexts().catch(() => [] as string[]))
    .map((t) => (t.trim().split('\n')[0] ?? '').replace(/\s*Select\s*$/, '').trim())
    .filter(Boolean);
}

/** The drawer's field ids (wrappers and inputs) - for "is a Predefined field offered". */
export async function advancedFieldIds(page: Page): Promise<string[]> {
  return page.locator(`[id^="${A.fieldPrefix}"]`).evaluateAll((els) => els.map((e) => e.id));
}

/** A field's input: the inferred id, else the input whose id carries the field's fragment. */
async function advancedInput(page: Page, field: LookupAdvancedField) {
  const exact = page.locator(`#${A.field[field]}`);
  if ((await exact.count()) > 0) return exact;
  return page.locator(`[id^="${A.fieldPrefix}"][id$="-input"][id*="${A.fieldFragment[field]}"]`).first();
}

/** Opens the drawer, sets all three fields (unset ones emptied), presses Search: the answer it fetched. */
export async function advancedSearch(page: Page, values: Partial<Record<LookupAdvancedField, string>>): Promise<RegisterCall & { opened: boolean }> {
  Logger.step(`Advance Search on the Lookup Register: ${JSON.stringify(values)}`);
  if (!(await openAdvanced(page))) return { ...noCall(), opened: false };
  for (const field of Object.keys(A.field) as LookupAdvancedField[]) {
    await (await advancedInput(page, field)).fill(values[field] ?? '');
  }
  const call = await captureRegister(page, () => page.locator(buttonSelector(A.search)).first().click());
  await page.locator(`#${A.title}`).waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  return { ...call, opened: true };
}

// ---- chips and Clear ---------------------------------------------------------------------

/** The applied-filter chips' texts. */
export async function chipTexts(page: Page): Promise<string[]> {
  return (await page.locator(`[id^="${WRITER_A_IDS.chipPrefix}"]:not([id$="-remove"])`).allInnerTexts().catch(() => [] as string[])).map(flat).filter(Boolean);
}

/** The keys of the chips offering a remove control (`{chipPrefix}{key}-remove`). */
export async function removableChipKeys(page: Page): Promise<string[]> {
  return (await page.locator(`[id^="${WRITER_A_IDS.chipPrefix}"][id$="-remove"]`).evaluateAll((els) => els.map((e) => e.id)))
    .map((id) => id.slice(WRITER_A_IDS.chipPrefix.length).replace(/-remove$/, ''));
}

/** Removes the chip whose key carries `fragment` (e.g. `code`, `search`): the answer it fetched; `removed` '' when none matched. */
export async function removeChip(page: Page, fragment: string): Promise<RegisterCall & { removed: string; offered: string[] }> {
  const offered = await removableChipKeys(page);
  const key = offered.find((k) => k.toLowerCase().includes(fragment.toLowerCase())) ?? '';
  if (!key) return { ...noCall(), removed: '', offered };
  const call = await captureRegister(page, () => page.locator(`#${WRITER_A_IDS.chipPrefix}${key}-remove`).click());
  return { ...call, removed: key, offered };
}

/** Presses Clear: the answer it fetched; `offered` false when no Clear control was shown. */
export async function clearAll(page: Page): Promise<RegisterCall & { offered: boolean }> {
  const clear = page.locator(buttonSelector(WRITER_A_IDS.clearAll)).first();
  const offered = await clear.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  if (!offered) return { ...noCall(), offered };
  const call = await captureRegister(page, () => clear.click());
  // No request sent: the screen keeps the last answer it received.
  const last = lastCall.get(page);
  return call.status === -1 && last ? { ...last, requeried: false, offered } : { ...call, offered };
}

/**
 * What is still in effect after Clear, read off the screen: Clear removes the
 * Advance Search filters and their chips but KEEPS the search box text on this
 * register (smoke 2026-11-09) - the box is not a chip, so the kept term is in effect.
 */
export async function keptAfterClear(page: Page): Promise<FiltersInEffect> {
  const box = (await searchBoxValue(page)).trim();
  return box ? { search: box } : {};
}

// ---- the matching rules ------------------------------------------------------------------

/** Contains, ignoring case and spacing. */
export const containsText = (value: string, term: string): boolean => flat(value).toLowerCase().includes(flat(term).toLowerCase());

/** Rows (answer items or screen rows) that do NOT contain `term` in `field`. */
export function rowsNotMatching(rows: readonly { code: string; englishName: string; arabicName: string }[], field: LookupAdvancedField, term: string): string[] {
  return rows.filter((r) => !containsText(r[field], term)).map((r) => `${r.code} / ${r.englishName} / ${r.arabicName}`);
}

/** Rows that contain `term` in NONE of Code / English Name / Arabic Name (the quick search's rule). */
export function rowsNotMatchingAny(rows: readonly { code: string; englishName: string; arabicName: string }[], term: string): string[] {
  return rows.filter((r) => !containsText(r.code, term) && !containsText(r.englishName, term) && !containsText(r.arabicName, term)).map((r) => r.code);
}

/** What an Advance Search produced, as one comparable object (expected: FILTER_OK). */
export async function filterOutcome(
  page: Page,
  call: RegisterCall & { opened: boolean },
  values: Partial<Record<LookupAdvancedField, string>>,
  expectedCode?: string,
): Promise<{ opened: boolean; status: number; outsideFilter: string[]; screenIsAnswer: boolean; expectedListed: boolean }> {
  const shown = await rowIdsOnScreen(page);
  const outside = (Object.entries(values) as [LookupAdvancedField, string][]).flatMap(([field, term]) => rowsNotMatching(call.answer.items, field, term));
  return {
    opened: call.opened,
    status: call.status,
    outsideFilter: [...new Set(outside)],
    screenIsAnswer: shown.join() === call.answer.items.map((i) => i.id).join(),
    expectedListed: expectedCode === undefined || call.answer.items.some((i) => i.code === expectedCode),
  };
}

export const FILTER_OK = { opened: true, status: 200, outsideFilter: [] as string[], screenIsAnswer: true, expectedListed: true };

/** The filters a scripted step believes are in effect. */
export interface FiltersInEffect {
  search?: string;
  code?: string;
  englishName?: string;
  arabicName?: string;
}

/**
 * Every way the screen disagrees with the filters in effect after `call`
 * (21117): the request failed, rows on screen are not the answer, a row breaks
 * a filter, the search box shows another term, an Advance Search filter has no
 * chip, a chip stands for a filter no longer in effect, or (no filter at all)
 * the list is not the whole register. `call` is the answer the screen received
 * for the action - the last one when the action sent no request.
 */
export async function inconsistencies(page: Page, label: string, call: RegisterCall, filters: FiltersInEffect, wholeRegister: number): Promise<string[]> {
  const out: string[] = [];
  if (call.status !== 200) out.push(`${label}: GetLookups answered ${call.status}`);
  const shown = await rowIdsOnScreen(page);
  if (shown.join() !== call.answer.items.map((i) => i.id).join()) out.push(`${label}: rows on screen [${shown.length}] are not the answer [${call.answer.items.length}]`);
  if (filters.search) out.push(...rowsNotMatchingAny(call.answer.items, filters.search).map((c) => `${label}: "${c}" does not match the search "${filters.search}"`));
  for (const field of Object.keys(A.field) as LookupAdvancedField[]) {
    const term = filters[field];
    if (term) out.push(...rowsNotMatching(call.answer.items, field, term).map((r) => `${label}: "${r}" breaks ${field} "${term}"`));
  }
  const box = await searchBoxValue(page);
  if (box !== (filters.search ?? '')) out.push(`${label}: the search box shows "${box}", expected "${filters.search ?? ''}"`);
  const chips = await chipTexts(page);
  for (const term of [filters.code, filters.englishName, filters.arabicName].filter((t): t is string => !!t)) {
    if (!chips.some((c) => containsText(c, term))) out.push(`${label}: no chip for "${term}" (chips: [${chips.join(' | ')}])`);
  }
  const inEffect = Object.values(filters).filter((v): v is string => !!v);
  const any = inEffect.length > 0;
  const stale = chips.filter((c) => !inEffect.some((t) => containsText(c, t)));
  if (stale.length > 0) out.push(`${label}: chips for filters no longer in effect: [${stale.join(' | ')}] (in effect: [${inEffect.join(' | ')}])`);
  if (!any && call.answer.totalRows !== wholeRegister) out.push(`${label}: ${call.answer.totalRows} lists with no filter, the register holds ${wholeRegister}`);
  return out;
}

// ---- sort --------------------------------------------------------------------------------

/** The sort trigger's label ("Newest"). */
export async function sortLabel(page: Page): Promise<string> {
  return flat(await page.locator(`#${LOOKUP_REGISTER.sortTrigger}`).innerText().catch(() => ''));
}

async function openSortMenu(page: Page): Promise<void> {
  await page.locator(buttonSelector(LOOKUP_REGISTER.sortTrigger)).first().click();
  await page.locator(`[id^="${WRITER_A_IDS.sortOptionPrefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
}

/** The Sort By options offered (id key and label); the menu is closed again. */
export async function sortOptions(page: Page): Promise<{ key: string; label: string }[]> {
  await openSortMenu(page);
  const options = page.locator(`[id^="${WRITER_A_IDS.sortOptionPrefix}"]`);
  const keys = (await options.evaluateAll((els) => els.map((e) => e.id))).map((id) => id.slice(WRITER_A_IDS.sortOptionPrefix.length));
  const labels = (await options.allInnerTexts()).map(flat);
  await page.keyboard.press('Escape');
  return keys.map((key, i) => ({ key, label: labels[i] ?? '' }));
}

export interface SortOutcome extends RegisterCall {
  /** The option key clicked ('' = none of the candidates was offered). */
  option: string;
  offered: string[];
  /** Whether the direction button had to be pressed to reach the wanted direction. */
  reversed: boolean;
}

/**
 * Sorts by `field` in `direction`: clicks the first offered option id among
 * SORT_OPTION_CANDIDATES (else one whose key carries the field's fragment),
 * then flips with the direction button when the request went the other way.
 * An option that sends no request (already applied) keeps the previous answer
 * (`requeried` false).
 */
export async function sortRegister(page: Page, field: LookupSortField, direction: 'asc' | 'desc'): Promise<SortOutcome> {
  Logger.step(`Sorting the Lookup Register by ${field} ${direction}`);
  await openSortMenu(page);
  const offered = (await page.locator(`[id^="${WRITER_A_IDS.sortOptionPrefix}"]`).evaluateAll((els) => els.map((e) => e.id)))
    .map((id) => id.slice(WRITER_A_IDS.sortOptionPrefix.length));
  const option = (SORT_OPTION_CANDIDATES[field][direction] as readonly string[]).find((k) => offered.includes(k))
    ?? offered.find((k) => k.toLowerCase().includes(SORT_FIELD_FRAGMENT[field])) ?? '';
  if (!option) {
    await page.keyboard.press('Escape');
    return { ...noCall(), option, offered, reversed: false };
  }
  let call = await captureRegister(page, () => page.locator(`#${WRITER_A_IDS.sortOptionPrefix}${option}`).click(), () => true, Timeouts.short);
  if (call.status === -1) call = { ...(lastCall.get(page) ?? noCall()), requeried: false };
  if (directionOf(call.request) === direction || directionOf(call.request) === '') return { ...call, option, offered, reversed: false };
  // The menu may stay open over the direction button.
  if (await page.locator(`[id^="${WRITER_A_IDS.sortOptionPrefix}"]`).first().isVisible().catch(() => false)) await page.keyboard.press('Escape');
  const flipped = await captureRegister(page, () => page.locator(buttonSelector(LOOKUP_REGISTER.sortDirection)).first().click());
  return { ...flipped, option, offered, reversed: true };
}

export { directionOf, firstOutOfOrder };

/** Index of the first pair of dates out of `direction` order (null = before every date, as SQL orders it), -1 when in order. */
export function firstDateOutOfOrder(values: readonly (string | null)[], direction: 'asc' | 'desc'): number {
  const t = values.map((v) => (v ? Date.parse(v) : Number.NEGATIVE_INFINITY));
  for (let i = 1; i < t.length; i += 1) {
    if ((direction === 'asc' && t[i] < t[i - 1]) || (direction === 'desc' && t[i] > t[i - 1])) return i;
  }
  return -1;
}

/** How many different values a date column holds (null counted as one value). */
export const distinctValues = (values: readonly (string | null)[]): number => new Set(values.map((v) => (v ? Date.parse(v) : 'null'))).size;

/**
 * "Last Modified" of a list that was never modified is its creation date: the
 * app orders ModifiedOn by `modifiedOn ?? createdOn` (verified against
 * GetLookups in both directions, full run 2026-11-09 - every row in order),
 * so the check uses the same date rather than putting never-modified lists last.
 */
const outOfOrder = (items: readonly LookupRow[], field: LookupSortField, direction: 'asc' | 'desc'): number =>
  field === 'modifiedOn'
    ? firstDateOutOfOrder(items.map((i) => i.modifiedOn ?? i.createdOn), direction)
    : field === 'createdOn'
      ? firstDateOutOfOrder(items.map((i) => i[field]), direction)
      : firstOutOfOrder(items.map((i) => i[field]), direction);

/**
 * A sort's result as one comparable object (expected: `orderOk(direction)`):
 * an option was offered, the request named the field (`column`) and the
 * direction, the rows on screen are the answer, and both that page and the
 * WHOLE register (re-read with the same request) are in order. `evidence` says
 * what was offered, clicked and received.
 */
export async function orderOutcome(page: Page, s: SortOutcome, field: LookupSortField, direction: 'asc' | 'desc', column: RegExp): Promise<{ outcome: Record<string, unknown>; evidence: string }> {
  const shown = await rowIdsOnScreen(page);
  const whole = s.status === 200 ? await replayRegister(page, s.request) : { status: -1, totalRows: -1, items: [] as LookupRow[] };
  const sortBy = String(s.request.sortBy ?? '');
  return {
    outcome: {
      offered: s.option !== '',
      status: s.status,
      sortField: column.test(sortBy),
      sortDirection: directionOf(s.request),
      screenIsAnswer: shown.join() === s.answer.items.map((i) => i.id).join(),
      pageOutOfOrderAt: outOfOrder(s.answer.items, field, direction),
      registerOutOfOrderAt: outOfOrder(whole.items, field, direction),
    },
    evidence: `Sort By offered [${s.offered.join(', ')}], clicked "${s.option}"${s.reversed ? ' then the direction button' : ''}${s.requeried ? '' : ' (no new request)'}; `
      + `sortBy "${sortBy}"; ${field} on screen: ${s.answer.items.map((i) => String(i[field])).join(' | ')}`,
  };
}

export const orderOk = (direction: 'asc' | 'desc'): Record<string, unknown> => ({
  offered: true,
  status: 200,
  sortField: true,
  sortDirection: direction,
  screenIsAnswer: true,
  pageOutOfOrderAt: -1,
  registerOutOfOrderAt: -1,
});

// ---- export ------------------------------------------------------------------------------

export interface RegisterExport {
  /** The Export menu's labels. */
  menu: string[];
  /** Whether the chosen scope (Selected Export / Export All Data) was offered usable. */
  scopeUsable: boolean;
  /** The format dialog (when one appeared): its title and action labels. */
  dialog: { shown: boolean; title: string; actions: string[] };
  formatOffered: boolean;
  /** ExportLookups' status (-1 = no request) and the body it sent. */
  status: number;
  request: Record<string, unknown>;
  /** The downloaded file ('' / null when none), saved under the test's output folder. */
  filename: string;
  parsed: ParsedCsv | null;
  /** Every toast summary / detail seen from the click on. */
  toasts: string[];
}

/** Every toast text seen during `ms` (polled - toasts expire), normalised. */
async function collectToasts(page: Page, ms: number): Promise<string[]> {
  const seen = new Set<string>();
  const end = Date.now() + ms;
  while (Date.now() < end && !page.isClosed()) {
    const texts = await page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    for (const t of texts.map(flat).filter(Boolean)) seen.add(t);
    await page.waitForTimeout(250).catch(() => undefined);
  }
  return [...seen];
}

/** Whether `expected` was shown: one toast equals it, or summary + detail together carry it (dash / spaces normalised). */
export function hasMessage(toasts: readonly string[], expected: string): boolean {
  const want = normalise(expected);
  return toasts.some((t) => normalise(t) === want) || normalise(toasts.join(' ')).includes(want);
}

/**
 * Export -> Selected Export / Export All Data -> the format dialog -> `format`
 * (`pbm-dialog-action-{format}`): the request, the file (saved with
 * download.saveAs under testInfo.outputPath and parsed - Excel with XlsxUtils,
 * CSV with CsvUtils) and the toasts. Never throws: a missing step is reported
 * in the result for the case to assert.
 */
export async function exportRegister(page: Page, testInfo: TestInfo, scope: 'selected' | 'all', format: string): Promise<RegisterExport> {
  Logger.step(`Exporting the Lookup Register: ${scope} / ${format}`);
  const out: RegisterExport = { menu: [], scopeUsable: false, dialog: { shown: false, title: '', actions: [] }, formatOffered: false, status: -1, request: {}, filename: '', parsed: null, toasts: [] };
  await page.locator(buttonSelector(LOOKUP_REGISTER.exportTrigger)).first().click();
  const menu = page.locator(`#${LOOKUP_REGISTER.exportMenu}`);
  if (await menu.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false)) {
    out.menu = (await menu.locator('button').allInnerTexts()).map(flat).filter(Boolean);
  }
  const choice = page.locator(buttonSelector(scope === 'all' ? LOOKUP_REGISTER.exportAll : LOOKUP_REGISTER.exportSelected)).first();
  out.scopeUsable = (await choice.count()) > 0 && (await choice.isVisible()) && (await choice.isEnabled());
  if (!out.scopeUsable) {
    await page.keyboard.press('Escape');
    return out;
  }
  const responded = page.waitForResponse((r) => EXPORT_LOOKUPS.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
  const download = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
  const toasts = collectToasts(page, 10_000);
  await choice.click();
  out.dialog.shown = await page.locator(`#${DIALOG.root}`).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  if (out.dialog.shown) {
    const d = await readDialog(page);
    out.dialog.title = d.title;
    out.dialog.actions = d.actions;
    const action = page.locator(buttonSelector(`pbm-dialog-action-${format}`)).first();
    out.formatOffered = (await action.count()) > 0;
    if (out.formatOffered) await action.click();
    else await page.keyboard.press('Escape');
  }
  const response = out.dialog.shown && !out.formatOffered ? null : await responded;
  if (response) {
    out.status = response.status();
    try {
      out.request = (response.request().postDataJSON() as Record<string, unknown> | null) ?? {};
    } catch {
      out.request = {};
    }
  }
  const ok = out.status > 0 && out.status < 400;
  const file = ok ? await download : await Promise.race([download, page.waitForTimeout(3_000).then(() => null)]);
  if (file) {
    out.filename = file.suggestedFilename();
    const target = testInfo.outputPath(`lookup-register-${scope}-${out.filename}`);
    await file.saveAs(target);
    const bytes = readFileSync(target);
    const isXlsx = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    out.parsed = isXlsx ? parseXlsx(bytes) : parseCsv(bytes.toString('utf8').replace(/^﻿/, ''));
  }
  out.toasts = await toasts;
  Logger.step(`Export ${scope}/${format} -> ${out.status}; file "${out.filename}" (${out.parsed?.rows.length ?? 0} rows); toasts [${out.toasts.join(' | ')}]`);
  return out;
}

/** The exported Code column (header "Code"). */
export const exportedCodes = (result: RegisterExport): string[] => (result.parsed?.rows ?? []).map((r) => String(r.Code ?? '').trim()).filter(Boolean);

/** Each exported row as "code | English name | Arabic name", read by the three header names, in file order. */
export function exportedTriples(result: RegisterExport, headers: readonly [string, string, string]): string[] {
  return (result.parsed?.rows ?? []).map((r) => headers.map((h) => flat(String(r[h] ?? ''))).join(' | '));
}

/** Each row on screen as "code | English name | Arabic name", in screen order. */
export async function screenTriples(page: Page): Promise<string[]> {
  return (await rowsOnScreen(page)).map((r) => [r.code, r.englishName, r.arabicName].join(' | '));
}

/** The register's DATA header texts (Actions left out), in screen order. */
export async function dataHeadersOnScreen(page: Page): Promise<string[]> {
  const { keys, texts } = await headersOnScreen(page);
  return texts.filter((_, i) => keys[i] !== 'actions');
}

/** 21142: an empty export was handled - a header-only file (every header, no row) or the literal message. */
export function emptyExportHandled(result: RegisterExport, headers: readonly string[], message: string, failedMessage: string): { handled: boolean; failedToast: boolean; serverError: boolean } {
  const headerOnly = result.parsed !== null && result.parsed.rows.length === 0 && headers.every((h) => result.parsed?.headers.includes(h));
  return {
    handled: headerOnly || hasMessage(result.toasts, message),
    failedToast: hasMessage(result.toasts, failedMessage),
    serverError: result.status >= 500,
  };
}

/** One line describing an export, for failure messages. */
export const describeExport = (r: RegisterExport): string =>
  `menu [${r.menu.join(' | ')}]; dialog ${r.dialog.shown ? `"${r.dialog.title}" [${r.dialog.actions.join(' | ')}]` : 'not shown'}; ExportLookups ${r.status} ${JSON.stringify(r.request).slice(0, 200)}; `
  + `file "${r.filename}" headers [${r.parsed?.headers.join(', ') ?? ''}] rows ${r.parsed?.rows.length ?? '-'}; toasts [${r.toasts.join(' | ')}]`;

/** Fault injection (decision 4): ExportLookups answers `status` in THIS browser only. */
export async function failExport(page: Page, status: number): Promise<void> {
  await page.route(EXPORT_LOOKUPS, (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ status, title: 'QA automation fault injection' }) }));
}

export async function restoreExport(page: Page): Promise<void> {
  await page.unroute(EXPORT_LOOKUPS);
}

// ---- View --------------------------------------------------------------------------------

/** Clicks View on a register row and returns the Items answer the list screen fetched (status -1 = none). */
export async function viewList(page: Page, register: LookupRegisterPage, lookupId: string, listCode: string): Promise<{ status: number; codes: string[] }> {
  const answered = page.waitForResponse((r) => r.url().includes(`/api/Lookups/Items/${listCode}`), { timeout: Timeouts.default }).catch(() => null);
  await register.viewButton(lookupId).click();
  const response = await answered;
  const body = response ? ((await response.json().catch(() => null)) as { payload?: { code: string }[] } | null) : null;
  return { status: response?.status() ?? -1, codes: (body?.payload ?? []).map((i) => i.code) };
}

/** The breadcrumb's last crumb. */
export async function lastCrumb(page: Page): Promise<string> {
  return flat(await page.locator(`#${WRITER_A_IDS.breadcrumbCurrent}`).last().innerText().catch(() => ''));
}

// ---- access (permission cases) -----------------------------------------------------------

export interface RegisterAccess {
  /** No register for this window: the table never rendered, or GetLookups was refused and no row shown. */
  denied: boolean;
  menuOffered: boolean;
  tableShown: boolean;
  rowsShown: number;
  /** GetLookups' status when the route was visited (-1 = no request). */
  listStatus: number;
  url: string;
  seen: string;
}

/** Whether this window is offered the Lookups menu entry, and what visiting the register's route shows. */
export async function registerAccess(page: Page): Promise<RegisterAccess> {
  const menu = page.locator(`#${WRITER_A_IDS.menuLink}`);
  let menuOffered = await menu.isVisible().catch(() => false);
  if (!menuOffered) {
    await page.locator(buttonSelector(WRITER_A_IDS.menuGroupToggle)).first().click({ timeout: Timeouts.short }).catch(() => undefined);
    menuOffered = await menu.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
  }
  const answered = page.waitForResponse((r) => GET_LOOKUPS.test(r.url()), { timeout: Timeouts.short }).catch(() => null);
  await new LookupRegisterPage(page).goto(AppRoutes.lookupManagement);
  const response = await answered;
  const tableShown = await page.locator(`#${LOOKUP_REGISTER.screen}-table-el`).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  const rowsShown = await rowsLocator(page).count();
  const listStatus = response?.status() ?? -1;
  const seen = flat(await page.locator('#app-layout-outlet').innerText().catch(() => '')).slice(0, 300);
  return { denied: !tableShown || (listStatus >= 400 && rowsShown === 0), menuOffered, tableShown, rowsShown, listStatus, url: page.url(), seen };
}

/** One line describing what a window saw at the register, for failure messages. */
export const describeAccess = (a: RegisterAccess): string =>
  `menu entry ${a.menuOffered ? 'OFFERED' : 'not offered'}; route ${a.url}; GetLookups ${a.listStatus}; table ${a.tableShown ? 'shown' : 'not shown'} with ${a.rowsShown} rows; screen: ${a.seen}`;

/** Whether Sort By and Export are shown and usable here (each opened and closed again). */
export async function sortAndExportState(page: Page): Promise<{ sortShown: boolean; sortOptions: string[]; exportShown: boolean; exportOptions: string[] }> {
  const sort = page.locator(buttonSelector(LOOKUP_REGISTER.sortTrigger)).first();
  const sortShown = (await sort.isVisible().catch(() => false)) && (await sort.isEnabled().catch(() => false));
  const sortLabels = sortShown ? (await sortOptions(page)).map((o) => o.label) : [];
  const exp = page.locator(buttonSelector(LOOKUP_REGISTER.exportTrigger)).first();
  const exportShown = (await exp.isVisible().catch(() => false)) && (await exp.isEnabled().catch(() => false));
  let exportOptions: string[] = [];
  if (exportShown) {
    await exp.click();
    const menu = page.locator(`#${LOOKUP_REGISTER.exportMenu}`);
    if (await menu.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false)) {
      exportOptions = (await menu.locator('button').allInnerTexts()).map(flat).filter(Boolean);
    }
    await page.keyboard.press('Escape');
  }
  return { sortShown, sortOptions: sortLabels, exportShown, exportOptions };
}
