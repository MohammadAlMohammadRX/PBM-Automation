import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { ROLE_CARD, ROLE_FILTER, ROLE_FORM_IDS, ROLE_LIST_IDS, ROLE_TOAST, type RoleColumn } from '../../constants/role/roleIds';
import { WRITER_A_IDS } from '../../constants/role/writerAIds';
import type { RoleAdministrationPage, RoleListResult } from '../../pages/role/RoleAdministrationPage';
import type { SaveOutcome } from '../../pages/role/RoleFormDrawer';
import { LanguageSwitcher } from '../../pages/components/LanguageSwitcher';
import { chooseSelectOption } from '../../pages/components/PrimeControls';
import { PREDEFINED_BADGE, PREDEFINED_ROLES, ROLE_STATUS } from '../../data/role/common.data';
import { parseCsv } from '../CsvUtils';
import { Logger } from '../Logger';
import { parseXlsx, type ParsedXlsx } from '../XlsxUtils';
import { arabicToken, userStamp } from '../UserProvisioning';
import type { SuiteRole, SuiteRoleSpec, SuiteRoles } from '../../fixtures/roleModule.fixture';
import { listRolesPage, type RoleListCriteria, type RoleListItem } from './roleApi';

/**
 * Writer A's helpers for Role Administration: folders 01 (Sort and Export Roles list, US 21280), 03 (View Role
 * List, US 21282) and 08 (Search and Filter Roles, US 21287) - reports/role/Role-Writers-Brief.md. Built on the
 * lead's RoleAdministrationPage (every list action there returns ITS OWN GetRoles answer). What the screen
 * shows is always compared with that answer, and an order / filter over the WHOLE list is checked by replaying
 * the screen's own request with 1000 rows (GetRoles, careconnect's session).
 *
 * Nothing here writes to a role: suite roles are made by the `suiteRoles` fixture in the specs.
 */

// ---- text --------------------------------------------------------------------------------

export const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();
/** Whitespace collapsed and every dash made one (lead decision 3). */
export const normalise = (text: string): string => flat(text).replace(/\s*[—–-]\s*/g, ' - ');
/** Labels compared as words: whitespace / dashes normalised, case ignored. */
export const sameLabel = (a: string, b: string): boolean => normalise(a).toLowerCase() === normalise(b).toLowerCase();
export const containsText = (value: string, term: string): boolean => normalise(value).toLowerCase().includes(normalise(term).toLowerCase());

// ---- order -------------------------------------------------------------------------------

export type Direction = 'asc' | 'desc';
const collator = new Intl.Collator('en', { sensitivity: 'base' });

/** "RoleNameEn desc" -> 'desc' ('' when the request names no direction). */
export function directionOf(sortBy: unknown): Direction | '' {
  const s = String(sortBy ?? '').trim();
  if (/\sasc$/i.test(s)) return 'asc';
  if (/\sdesc$/i.test(s)) return 'desc';
  return '';
}

/** "RoleNameEn desc" -> 'RoleNameEn'. */
export const fieldOf = (sortBy: unknown): string => String(sortBy ?? '').trim().split(/\s+/)[0] ?? '';

/** Every neighbouring pair out of order (case-insensitive, locale order). [] = in order. */
export function orderBreaks(values: readonly string[], direction: Direction): string[] {
  const out: string[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const c = collator.compare(values[i - 1], values[i]);
    if (direction === 'asc' ? c > 0 : c < 0) out.push(`"${values[i - 1]}" before "${values[i]}"`);
  }
  return out;
}

/**
 * Description order (lead default for 21976): the non-empty descriptions in order (case-insensitive), the roles
 * without a description kept together in ONE block at the start or the end.
 */
export function descriptionOrderBreaks(values: readonly string[], direction: Direction): string[] {
  const out = orderBreaks(values.filter((v) => v.trim() !== ''), direction);
  const pattern = values.map((v) => (v.trim() === '' ? 'E' : 'N')).join('');
  if (!/^E*N*$/.test(pattern) && !/^N*E*$/.test(pattern)) out.push(`the roles without a description are not kept together (order of empty / filled: ${pattern})`);
  return out;
}

/** Created-on order of the items (newest first = desc). */
export function createdOrderBreaks(items: readonly RoleListItem[], direction: Direction): string[] {
  const out: string[] = [];
  for (let i = 1; i < items.length; i += 1) {
    const a = Date.parse(items[i - 1].createdOn);
    const b = Date.parse(items[i].createdOn);
    if (direction === 'desc' ? a < b : a > b) out.push(`"${items[i - 1].name}" (${items[i - 1].createdOn}) before "${items[i].name}" (${items[i].createdOn})`);
  }
  return out;
}

/** Status sequence of the items, e.g. "Active x9, Inactive x3" (one entry per block). */
export function statusBlocks(items: readonly RoleListItem[]): string[] {
  const blocks: { status: string; n: number }[] = [];
  for (const item of items) {
    const status = item.isActive ? ROLE_STATUS.active : ROLE_STATUS.inactive;
    const last = blocks[blocks.length - 1];
    if (last && last.status === status) last.n += 1;
    else blocks.push({ status, n: 1 });
  }
  return blocks.map((b) => `${b.status} x${b.n}`);
}

export const namesOf = (items: readonly { name: string }[]): string[] => items.map((i) => i.name);

// ---- whole list / screen -----------------------------------------------------------------------

/** The screen's own GetRoles request replayed with 1000 rows (every page at once). */
export async function wholeListFor(page: Page, answer: RoleListResult): Promise<RoleListItem[]> {
  const criteria = { ...(answer.request as RoleListCriteria), pageNumber: 1, rowsPerPage: 1000 };
  return (await listRolesPage(page, criteria)).items;
}

/** Waits until the rows on screen ARE the answer's page, and returns both id lists. */
export async function screenShows(list: RoleAdministrationPage, answer: RoleListResult): Promise<{ shown: string[]; expected: string[] }> {
  const expected = answer.items.map((i) => i.id);
  let shown: string[] = [];
  await expect
    .poll(async () => {
      shown = await list.rowIds();
      return shown.join(',');
    }, { timeout: Timeouts.default })
    .toBe(expected.join(','))
    .catch(() => undefined);
  return { shown, expected };
}

/** Names of the rows on screen, top to bottom. */
export async function screenNames(list: RoleAdministrationPage): Promise<string[]> {
  const out: string[] = [];
  for (const id of await list.rowIds()) out.push(await list.rowName(id));
  return out;
}

/** Picks the direction (only clicks the direction button when the list is not already in it). */
export async function setDirection(list: RoleAdministrationPage, current: RoleListResult, want: Direction): Promise<RoleListResult> {
  if (directionOf(current.request.sortBy) === want) return current;
  return list.toggleSortDirection();
}

/**
 * What a column header shows as a sort indicator: `aria-sort` (not "none") or a sort icon / marker inside the
 * header cell ('' = nothing).
 */
export async function columnSortIndicator(page: Page, column: RoleColumn): Promise<string> {
  const th = page.locator(`#${WRITER_A_IDS.tableHeader(column)}`);
  if ((await th.count()) === 0) return '';
  return th.evaluate((el) => {
    const aria = el.getAttribute('aria-sort');
    if (aria && aria !== 'none') return `aria-sort=${aria}`;
    const icon = el.querySelector('[id*="sort"], [class*="sort"], [data-sort]');
    return icon ? `${icon.tagName.toLowerCase()} ${icon.id || String(icon.getAttribute('class') ?? '')}` : '';
  });
}

/** Every data column header carrying a sort indicator ("<column>: <indicator>"). */
export async function columnsWithSortIndicator(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const column of ['name', 'description', 'status'] as RoleColumn[]) {
    const indicator = await columnSortIndicator(page, column);
    if (indicator) out.push(`${column}: ${indicator}`);
  }
  return out;
}

/** The table's header texts (for failure messages). */
export async function headerTexts(page: Page): Promise<string[]> {
  return (await page.locator(`#${ROLE_LIST_IDS.tableHead} th[id^="role-list-table-th-"]`).allInnerTexts().catch(() => [] as string[])).map(flat);
}

// ---- rows / cards --------------------------------------------------------------------------

export interface RowView {
  id: string;
  name: string;
  description: string;
  status: string;
  predefined: boolean;
  badgeText: string;
  text: string;
  /** Actions present (view / edit / toggle-active / delete). */
  actions: string[];
  /** Actions present AND enabled. */
  enabledActions: string[];
}

/** One table row in full (the row must be on the current page). */
export async function readRowFull(list: RoleAdministrationPage, id: string): Promise<RowView> {
  const row = await list.readRow(id);
  const actions = await list.rowActions(id);
  const badge = list.predefinedBadge(id);
  return {
    ...row,
    badgeText: (await badge.count()) > 0 ? flat(await badge.innerText().catch(() => '')) : '',
    text: flat(await list.row(id).innerText()),
    actions: actions.map((a) => a.action),
    enabledActions: actions.filter((a) => a.enabled).map((a) => a.action),
  };
}

/** One-line description of a row for failure messages. */
export const describeRow = (r: RowView): string =>
  `row "${r.name}": text "${r.text}", status "${r.status}", badge "${r.badgeText}", actions [${r.actions.join(', ')}] enabled [${r.enabledActions.join(', ')}]`;

export interface CardView {
  id: string;
  shown: boolean;
  name: string;
  description: string;
  text: string;
  predefined: boolean;
  /** "Active" / "Inactive" when the card shows a status word ('' = none). */
  status: string;
  actions: string[];
  enabledActions: string[];
}

/**
 * Switches to Cards, reads the given cards, and ALWAYS switches back to the table (the view is careconnect's
 * server-side preference). `cardIds` = every card rendered.
 */
export async function readCards(list: RoleAdministrationPage, page: Page, ids: readonly string[]): Promise<{ cardIds: string[]; cards: CardView[] }> {
  await list.switchToCards();
  try {
    const cardIds = await list.cardIds();
    const cards: CardView[] = [];
    for (const id of ids) {
      const card = list.card(id);
      const shown = (await card.count()) > 0;
      const text = shown ? flat(await card.innerText()) : '';
      const actions = shown ? await list.cardActions(id) : [];
      const statusWord = text.match(new RegExp(`\\b(${ROLE_STATUS.active}|${ROLE_STATUS.inactive})\\b`));
      cards.push({
        id,
        shown,
        name: shown ? flat(await page.locator(`#${ROLE_CARD.name(id)}`).innerText().catch(() => '')) : '',
        description: shown ? flat(await page.locator(`#${ROLE_CARD.description(id)}`).innerText().catch(() => '')) : '',
        text,
        predefined: text.includes(PREDEFINED_BADGE.en),
        status: statusWord?.[1] ?? '',
        actions: actions.map((a) => a.action),
        enabledActions: actions.filter((a) => a.enabled).map((a) => a.action),
      });
    }
    return { cardIds, cards };
  } finally {
    await list.switchToTable();
  }
}

export const describeCard = (c: CardView): string =>
  `card ${c.shown ? `"${c.text}"` : 'NOT RENDERED'}, status "${c.status}", actions [${c.actions.join(', ')}] enabled [${c.enabledActions.join(', ')}]`;

/** Safety net (afterEach): if a failed step left the Cards view on, put the table back. */
export async function putTableViewBack(list: RoleAdministrationPage): Promise<void> {
  try {
    if (await list.el(ROLE_LIST_IDS.cards).isVisible()) await list.switchToTable();
  } catch (error) {
    Logger.warn(`[roles] could not put the table view back: ${String(error)}`);
  }
}

// ---- side menu ------------------------------------------------------------------------------

export interface MenuEntry {
  groupShown: boolean;
  groupLabel: string;
  linkShown: boolean;
  linkLabel: string;
}

/** System Settings > Role Administration in the side menu (expands the group when the link is hidden). */
export async function readMenuEntry(page: Page): Promise<MenuEntry> {
  const group = page.locator(buttonSelector(WRITER_A_IDS.nav.groupToggle)).first();
  const link = page.locator(`#${WRITER_A_IDS.nav.roleAdministrationLink}`);
  const groupShown = await group.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
  let linkShown = await link.isVisible().catch(() => false);
  if (groupShown && !linkShown) {
    await group.click();
    linkShown = await link.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
  }
  return {
    groupShown,
    groupLabel: groupShown ? flat(await group.innerText().catch(() => '')) : '',
    linkShown,
    linkLabel: linkShown ? flat(await link.innerText().catch(() => '')) : '',
  };
}

export const describeMenu = (m: MenuEntry): string =>
  `System Settings ${m.groupShown ? `shown ("${m.groupLabel}")` : 'NOT shown'}; Role Administration ${m.linkShown ? `shown ("${m.linkLabel}")` : 'NOT shown'}`;

/** The menu entry read in the Arabic UI; ALWAYS switches back to English. */
export async function readMenuEntryInArabic(page: Page): Promise<MenuEntry> {
  const language = new LanguageSwitcher(page);
  try {
    await language.switchTo('ar');
    return await readMenuEntry(page);
  } finally {
    await language.switchTo('en').catch((error: unknown) => Logger.warn(`[roles] could not switch back to English: ${String(error)}`));
  }
}

/** Opens Role Administration through the side menu; `answer` = the GetRoles the screen loaded (null = none). */
export async function openRolesFromMenu(list: RoleAdministrationPage, page: Page): Promise<{ menu: MenuEntry; answer: RoleListResult | null; url: string }> {
  const menu = await readMenuEntry(page);
  if (!menu.linkShown) return { menu, answer: null, url: page.url() };
  const answer = await list.listAnswerDuring(() => page.locator(`#${WRITER_A_IDS.nav.roleAdministrationLink}`).click()).catch(() => null);
  await list.waitForRows().catch(() => undefined);
  return { menu, answer, url: page.url() };
}

export interface ScreenAccess {
  menu: MenuEntry;
  /** GetRoles through this session (API). */
  apiStatus: number;
  /** The role list rendered at its route. */
  listShown: boolean;
  rows: number;
  url: string;
  seen: string;
}

/** What a session gets at Role Administration: menu entry, GetRoles, and a direct visit of the route. */
export async function roleScreenAccess(list: RoleAdministrationPage, page: Page): Promise<ScreenAccess> {
  const menu = await readMenuEntry(page);
  const apiStatus = (await listRolesPage(page, { rowsPerPage: 10 })).status;
  await list.navigate();
  const listShown = await list.isListShown(Timeouts.short);
  const rows = (await list.rowIds()).length;
  const seen = flat(await page.locator(`#${WRITER_A_IDS.outlet}`).innerText().catch(() => '')).slice(0, 200);
  return { menu, apiStatus, listShown, rows, url: page.url(), seen };
}

export const describeAccess = (a: ScreenAccess): string =>
  `${describeMenu(a.menu)}; GetRoles answered ${a.apiStatus}; route ${a.url} ${a.listShown ? `showed the role list (${a.rows} rows)` : 'showed no role list'}; screen: "${a.seen}"`;

// ---- Advance Search ----------------------------------------------------------------------------

/** The Search tab's fields: key (wrapper id suffix) + label. */
export async function advancedFields(page: Page): Promise<{ key: string; label: string }[]> {
  return page.locator(`#${ROLE_FILTER.body} [id^="${WRITER_A_IDS.advancedFieldPrefix}"]`).evaluateAll((els, prefix) =>
    els
      .map((e) => ({ key: e.id.slice(prefix.length), el: e }))
      .filter((x) => /^[a-z]+$/.test(x.key))
      .map((x) => ({
        key: x.key,
        label: (x.el.querySelector('label')?.textContent ?? (x.el as HTMLElement).innerText.split('\n')[0] ?? '').replace(/\s+/g, ' ').trim(),
      })), WRITER_A_IDS.advancedFieldPrefix);
}

/** Types / picks a value in each Search-tab field and reads them back (nothing searched). */
export async function useAdvancedFields(page: Page, values: { name: string; description: string; status: string }): Promise<{ name: string; description: string; status: string }> {
  await page.locator(`#${ROLE_FILTER.nameInput}`).fill(values.name);
  await page.locator(`#${ROLE_FILTER.descriptionInput}`).fill(values.description);
  await chooseSelectOption(page, page.locator(`#${ROLE_FILTER.statusSelect}`), values.status);
  return {
    name: await page.locator(`#${ROLE_FILTER.nameInput}`).inputValue(),
    description: await page.locator(`#${ROLE_FILTER.descriptionInput}`).inputValue(),
    status: flat(await page.locator(`#${ROLE_FILTER.statusSelect}`).innerText()),
  };
}

// ---- toasts ----------------------------------------------------------------------------------

async function toastTexts(page: Page): Promise<string[]> {
  return (await page.locator(`#${ROLE_TOAST.root}`).allInnerTexts().catch(() => [] as string[])).map(flat).filter(Boolean);
}

/** Every NEW toast seen during `ms` (polled). */
async function collectNewToasts(page: Page, before: readonly string[], ms: number): Promise<string[]> {
  const old = new Set(before);
  const seen = new Set<string>();
  const end = Date.now() + ms;
  while (Date.now() < end && !page.isClosed()) {
    for (const t of await toastTexts(page)) if (!old.has(t)) seen.add(t);
    await page.waitForTimeout(250).catch(() => undefined);
  }
  return [...seen];
}

/** Resolves once a new toast shows (or after `ms`). */
async function firstNewToast(page: Page, before: readonly string[], ms: number): Promise<string> {
  const old = new Set(before);
  const end = Date.now() + ms;
  while (Date.now() < end && !page.isClosed()) {
    const found = (await toastTexts(page)).find((t) => !old.has(t));
    if (found) return found;
    await page.waitForTimeout(250).catch(() => undefined);
  }
  return '';
}

/** Whether `expected` was shown (one toast carries it; dashes / spaces normalised). */
export function hasMessage(toasts: readonly string[], expected: string): boolean {
  const want = normalise(expected);
  return toasts.some((t) => normalise(t).includes(want));
}

// ---- export ----------------------------------------------------------------------------------

export interface RoleExport {
  /** The two menu labels as shown. */
  menu: string[];
  /** The chosen scope was offered and enabled. */
  scopeEnabled: boolean;
  formatDialog: boolean;
  filename: string;
  savedTo: string;
  parsed: ParsedXlsx | null;
  toasts: string[];
}

/**
 * Export -> Selected Export / Export All Data -> the shared format dialog -> `format`. The file is saved under
 * the test's output folder (download.saveAs) and parsed (Excel: utils/XlsxUtils; CSV: utils/CsvUtils). When no
 * file comes (e.g. a message instead), `parsed` is null and `toasts` says what was shown.
 */
export async function exportRoles(page: Page, testInfo: TestInfo, scope: 'selected' | 'all', format: 'excel' | 'csv' = 'excel'): Promise<RoleExport> {
  const out: RoleExport = { menu: [], scopeEnabled: false, formatDialog: false, filename: '', savedTo: '', parsed: null, toasts: [] };
  const before = await toastTexts(page);
  await page.locator(buttonSelector(ROLE_LIST_IDS.exportTrigger)).first().click();
  await page.locator(`#${ROLE_LIST_IDS.exportMenu}`).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
  out.menu = [
    flat(await page.locator(`#${ROLE_LIST_IDS.exportSelected}`).innerText().catch(() => '')),
    flat(await page.locator(`#${ROLE_LIST_IDS.exportAll}`).innerText().catch(() => '')),
  ];
  const choice = page.locator(`#${scope === 'all' ? ROLE_LIST_IDS.exportAll : ROLE_LIST_IDS.exportSelected}`);
  out.scopeEnabled = (await choice.isVisible().catch(() => false)) && (await choice.isEnabled().catch(() => false));
  if (!out.scopeEnabled) {
    await page.keyboard.press('Escape');
    out.toasts = await collectNewToasts(page, before, 2_000);
    return out;
  }
  const download = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
  const collecting = collectNewToasts(page, before, 12_000);
  await choice.click();
  const formatButton = page.locator(buttonSelector(WRITER_A_IDS.exportFormat(format))).first();
  out.formatDialog = await formatButton.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
  if (out.formatDialog) await formatButton.click();
  const messageOnly = firstNewToast(page, before, 60_000).then(() => page.waitForTimeout(5_000).catch(() => undefined)).then(() => null);
  const file = await Promise.race([download, messageOnly]);
  if (file) {
    out.filename = file.suggestedFilename();
    out.savedTo = testInfo.outputPath(`roles-${scope}-${out.filename}`);
    await file.saveAs(out.savedTo);
    const bytes = readFileSync(out.savedTo);
    const isXlsx = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    out.parsed = isXlsx ? parseXlsx(bytes) : { ...parseCsv(bytes.toString('utf8').replace(/^﻿/, '')), rightToLeft: false };
  }
  out.toasts = await collecting;
  Logger.step(`[roles] Export ${scope}/${format}: file "${out.filename}" (${out.parsed?.rows.length ?? 0} rows); toasts [${out.toasts.join(' | ')}]`);
  return out;
}

/** One column of the exported rows (trimmed). */
export const exportedColumn = (result: RoleExport, header: string): string[] => (result.parsed?.rows ?? []).map((r) => String(r[header] ?? '').trim());

export const describeExport = (r: RoleExport): string =>
  `menu [${r.menu.join(' | ')}]; scope ${r.scopeEnabled ? 'enabled' : 'NOT enabled'}; format dialog ${r.formatDialog ? 'shown' : 'not shown'}; `
  + `file "${r.filename}" headers [${r.parsed?.headers.join(', ') ?? ''}] rows ${r.parsed?.rows.length ?? '-'}; toasts [${r.toasts.join(' | ')}]`;

const sortedCopy = (values: readonly string[]): string[] => [...values].sort((a, b) => collator.compare(a, b));
export { sortedCopy };

// ---- create / view -----------------------------------------------------------------------------

/** Ids of step-1 inputs that would take a Role ID by hand ([] = none). */
export async function roleIdInputs(page: Page): Promise<string[]> {
  const ids = await page.locator(`#${ROLE_FORM_IDS.root} input[id], #${ROLE_FORM_IDS.root} textarea[id]`).evaluateAll((els) => els.map((e) => e.id));
  return ids.filter((id) => /role-?id(?!s)/i.test(id));
}

/**
 * Add Role through the screen: names, Allowed To Assign By = Organization Administrator, one right ticked,
 * Save (asserted accepted and closed by the page object). Call `suiteRoles.watch()` first and adopt the name.
 */
export async function createRoleOnScreen(list: RoleAdministrationPage, page: Page, values: { nameEn: string; nameAr: string; right: string }): Promise<SaveOutcome & { roleIdFields: string[] }> {
  const form = await list.openAdd();
  const roleIdFields = await roleIdInputs(page);
  await form.fill({ nameEn: values.nameEn, nameAr: values.nameAr, allowedToAssignBy: [PREDEFINED_ROLES.organizationAdministrator.en] });
  await form.nextToPrivileges();
  await form.tree.tick(values.right);
  const out = await form.saveExpectingSuccess();
  return { ...out, roleIdFields };
}

/** View Role as rendered: drawer text, the label/value rows, editable controls (tree search excluded), ticked keys. */
export async function readViewRole(list: RoleAdministrationPage, page: Page): Promise<{ text: string; values: Record<string, string>; editable: string[]; checked: string[] }> {
  const text = flat(await page.locator(`#${ROLE_FORM_IDS.root}`).innerText());
  const values = await list.view.values();
  const editable = (await list.view.editableControls()).filter((c) => !c.includes(ROLE_FORM_IDS.permissionSearch));
  await list.view.tree.expandAll();
  const checked = await list.view.tree.checkedKeys();
  return { text, values, editable, checked };
}

/** The value of the first View Role row whose label matches `label` ('' = no such row). */
export function viewValue(values: Record<string, string>, label: RegExp): string {
  return Object.entries(values).find(([k]) => label.test(k))?.[1] ?? '';
}

// ---- suite data --------------------------------------------------------------------------------

/** A lower-case token unique to this test, carried by every suite role of a case (the search term). */
export const groupToken = (): string => `grp${userStamp()}`;
/** A unique word of Arabic letters. */
export const arabicWord = (): string => arabicToken();

/** Creates the suite roles one after the other (the fixture BLOCKS the case when one is refused). */
export async function createSuiteRoles(suiteRoles: SuiteRoles, specs: readonly SuiteRoleSpec[]): Promise<SuiteRole[]> {
  const out: SuiteRole[] = [];
  for (const spec of specs) out.push(await suiteRoles.create(spec));
  return out;
}

// ---- comparisons -------------------------------------------------------------------------------

/** 21985: file cells that disagree with GetRoles, for the columns the file HAS (Role ID / Description / Status). */
export function exportMismatches(result: RoleExport, items: readonly RoleListItem[], nameColumn: string): string[] {
  const headers = result.parsed?.headers ?? [];
  const out: string[] = [];
  for (const row of result.parsed?.rows ?? []) {
    const name = String(row[nameColumn] ?? '').trim();
    const item = items.find((i) => i.name === name);
    if (!item) {
      out.push(`file row "${name}" is not a listed role`);
      continue;
    }
    if (headers.includes('Role ID') && String(row['Role ID'] ?? '').trim() !== item.id) out.push(`"${name}" Role ID "${row['Role ID']}" (API ${item.id})`);
    if (headers.includes('Description') && String(row.Description ?? '').trim() !== (item.englishDescription ?? '').trim()) out.push(`"${name}" Description "${row.Description}" (API "${item.englishDescription ?? ''}")`);
    const status = item.isActive ? ROLE_STATUS.active : ROLE_STATUS.inactive;
    if (headers.includes('Status') && String(row.Status ?? '').trim() !== status) out.push(`"${name}" Status "${row.Status}" (API ${status})`);
  }
  return out;
}

/** 21986: what an export of an empty result came to. */
export function emptyExportOutcome(result: RoleExport, failedText: string): { processed: boolean; handled: boolean; failureShown: boolean } {
  const headerOnlyFile = !!result.parsed && result.parsed.headers.length > 0 && result.parsed.rows.length === 0;
  const messageOnly = !result.parsed && result.toasts.some((t) => !hasMessage([t], failedText));
  return { processed: result.scopeEnabled, handled: headerOnlyFile || messageOnly, failureShown: hasMessage(result.toasts, failedText) };
}

/** 22008: where the table row and the card of one role disagree ([] = consistent). */
export function viewDifferences(row: RowView, card: CardView): string[] {
  const out: string[] = [];
  if (!card.shown) return [`"${row.name}": no card rendered`];
  if (row.predefined !== card.predefined) out.push(`"${row.name}": predefined badge table ${row.predefined}, card ${card.predefined}`);
  if (row.name !== card.name) out.push(`"${row.name}": name table "${row.name}", card "${card.name}"`);
  if (row.description !== card.description) out.push(`"${row.name}": description table "${row.description}", card "${card.description}"`);
  if (row.status !== card.status) out.push(`"${row.name}": status table "${row.status}", card "${card.status || 'not shown'}"`);
  const t = [...row.enabledActions].sort().join(', ');
  const c = [...card.enabledActions].sort().join(', ');
  if (t !== c) out.push(`"${row.name}": enabled actions table [${t}], card [${c}]`);
  return out;
}

/** The ids (of `ids`) whose value appears in their row's text on the current page. */
export async function idsShownInRows(list: RoleAdministrationPage, ids: readonly string[]): Promise<string[]> {
  const shown: string[] = [];
  for (const id of ids) {
    const text = (await list.row(id).count()) > 0 ? await list.row(id).innerText() : '';
    if (text.includes(id)) shown.push(id);
  }
  return shown;
}

/** Searches a role by name and tells whether its row shows its id. */
export async function roleIdShownInList(list: RoleAdministrationPage, name: string, id: string): Promise<{ shown: boolean; rowText: string }> {
  await list.search(name);
  const rowText = (await list.row(id).count()) > 0 ? flat(await list.row(id).innerText()) : '';
  return { shown: rowText.includes(id), rowText };
}

/** 22002: per predefined role, the row controls present (with enabled state) - searched one by one. */
export async function predefinedRowControls(list: RoleAdministrationPage, roles: readonly { en: string; id: string }[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const role of roles) {
    await list.search(role.en);
    out[role.en] = (await list.rowActions(role.id)).map((a) => `${a.action}${a.enabled ? '' : ' (disabled)'}`);
  }
  return out;
}

/** 22002: per predefined role, the card controls present (Cards switched on and back per role). */
export async function predefinedCardControls(list: RoleAdministrationPage, page: Page, roles: readonly { en: string; id: string }[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const role of roles) {
    await list.search(role.en);
    const { cards } = await readCards(list, page, [role.id]);
    out[role.en] = cards[0].shown ? cards[0].actions.map((a) => `${a}${cards[0].enabledActions.includes(a) ? '' : ' (disabled)'}`) : ['card not rendered'];
  }
  return out;
}

/** Whether the side menu shows the System Settings group. */
export async function systemSettingsShown(page: Page): Promise<boolean> {
  return page.locator(buttonSelector(WRITER_A_IDS.nav.groupToggle)).first().waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true, () => false);
}
