import type { Page } from '@playwright/test';
import { StepStatus } from '../../constants/TestStatus';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { IdentityListAnswer } from '../../pages/user/IdentityListPage';
import type { UserListPage } from '../../pages/user/UserListPage';
import type { UserFormDrawer } from '../../pages/user/UserFormDrawer';
import type { UserExportResult } from '../../pages/user/userCommon';
import { ChangePasswordDrawer } from '../../pages/user/ChangePasswordDrawer';
import { Timeouts } from '../../constants/Timeouts';
import { USER_ADVANCED_SEARCH, type UserAdvancedField, type UserKpiKey, type UserSortOption } from '../../constants/user/userIds';
import { WRITER_A_IDS } from '../../constants/user/writerAIds';
import { payerDropdown, type UserListItem } from '../UserProvisioning';
import { Logger } from '../Logger';

/**
 * Writer A's helpers for the User Management folders 01 (role-scope payer
 * assignments), 02 (dashboard counters), 03 (search / filter), 06 (sort /
 * export) and 07 (view profile) - reports/user/User-Writers-Brief.md. Built on
 * the foundation (pages/user/*, utils/UserProvisioning.ts,
 * fixtures/userModule.fixture.ts). What the foundation lacked is added here:
 *  - `earlierFailures` - a case is ended BLOCKED for a trailing
 *    un-provisionable part only when no earlier step failed (else it stands);
 *  - `openCapturing` - the list's FIRST request and answer (default sort);
 *  - `sortInDirection` - a Sort By field in a given direction (a field option
 *    keeps the current direction; the direction button flips it);
 *  - `movePayersBack` - the picker's "Move selected up" (Selected -> Available);
 *  - `advancedFieldKinds` - text box vs dropdown of each Advance Search field;
 *  - `clearAllChips` - removes every applied-filter chip, one by one;
 *  - `pressEnterOn` - keyboard focus + Enter on an element (tiles, rows);
 *  - `otherPayer` - a payer outside the suite scope payer (read-only).
 */

// ---- step flow ---------------------------------------------------------------------------

/**
 * The steps that already FAILED. A case whose trailing part the environment
 * cannot provide is ended BLOCKED only when nothing failed before it - else the
 * failure stands and the blocking step says why the rest was not exercised:
 *
 *     expect(earlierFailures(steps), `NOT EXERCISED - ${REASON}`).toEqual([]);
 *     steps.blocked(REASON);
 */
export function earlierFailures(steps: TestSteps): string[] {
  return steps.records().filter((r) => r.status === StepStatus.FAIL).map((r) => r.name);
}

// ---- tiles -------------------------------------------------------------------------------

export type Tiles = Record<UserKpiKey, number> & { caption: string; labels: Record<UserKpiKey, string>; clickable: Record<UserKpiKey, boolean> };

/** The four tiles, settled (values, labels, Pending Approval's full text, whether each sits in a button). */
export async function readTiles(list: UserListPage): Promise<Tiles> {
  const k = await list.readKpis();
  return {
    total: k.total.value,
    active: k.active.value,
    inactive: k.inactive.value,
    pendingApproval: k.pendingApproval.value,
    caption: k.pendingApproval.text,
    labels: { total: k.total.label, active: k.active.label, inactive: k.inactive.label, pendingApproval: k.pendingApproval.label },
    clickable: { total: k.total.clickable, active: k.active.clickable, inactive: k.inactive.clickable, pendingApproval: k.pendingApproval.clickable },
  };
}

// ---- list ------------------------------------------------------------------------------

/** Opens the list and returns the FIRST GetUsers request it sent and its answer (table view). */
export async function openCapturing(list: UserListPage): Promise<{ request: Record<string, unknown>; answer: IdentityListAnswer<UserListItem> }> {
  let request: Record<string, unknown> = {};
  const answer = await list.captureList(async () => {
    request = await list.captureListRequest(() => list.open());
  });
  await list.switchToTable();
  return { request, answer };
}

/** `"EnglishFirstName asc"` -> `asc`. */
export function directionOf(request: Record<string, unknown>): 'asc' | 'desc' | '' {
  const m = String(request.sortBy ?? '').match(/\b(asc|desc)\s*$/i);
  return m ? (m[1].toLowerCase() as 'asc' | 'desc') : '';
}

/** Picks a Sort By field and flips the direction button when needed; the request + answer that hold the wanted order. */
export async function sortInDirection(list: UserListPage, option: UserSortOption, direction: 'asc' | 'desc'): Promise<{ request: Record<string, unknown>; answer: IdentityListAnswer<UserListItem>; reversed: boolean }> {
  const first = await list.sortByOption(option);
  if (directionOf(first.request) === direction) return { ...first, reversed: false };
  const second = await list.reverseSort();
  return { ...second, reversed: true };
}

/** Index of the first pair out of `direction` order (case-insensitive), -1 when in order. */
export function firstOutOfOrder(values: readonly string[], direction: 'asc' | 'desc'): number {
  for (let i = 1; i < values.length; i += 1) {
    const cmp = values[i - 1].trim().localeCompare(values[i].trim(), undefined, { sensitivity: 'base' });
    if ((direction === 'asc' && cmp > 0) || (direction === 'desc' && cmp < 0)) return i;
  }
  return -1;
}

/** Whether a list item legitimately matches a quick-search term (English / Arabic name, document ID, e-mail). */
export function matchesTerm(item: UserListItem, term: string): boolean {
  const t = term.trim().toLowerCase().replace(/\s+/g, ' ');
  const hay = [item.fullEnglishName, item.fullArabicName, item.englishFirstName, item.englishSecondName, item.englishLastName,
    item.arabicFirstName, item.arabicSecondName, item.arabicLastName, item.userName, item.email]
    .map((v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' '));
  return hay.some((h) => h.includes(t));
}

// ---- Advance Search ------------------------------------------------------------------------

/** The option of a dropdown field whose label matches `re` (the drawer must be open). */
export async function advancedOptionLike(list: UserListPage, field: UserAdvancedField, re: RegExp): Promise<string> {
  const options = await list.getAdvancedOptions(field);
  const hit = options.find((o) => re.test(o));
  if (!hit) throw new Error(`the Advance Search ${field} offers no option like ${re} (offers: ${options.join(' | ')})`);
  return hit;
}

/** Each Advance Search field's control kind: a text box (`input`) or a dropdown (anything else - the p-select span). */
export async function advancedFieldKinds(page: Page): Promise<Record<UserAdvancedField, 'text' | 'dropdown' | 'absent'>> {
  const out = {} as Record<UserAdvancedField, 'text' | 'dropdown' | 'absent'>;
  for (const [key, id] of Object.entries(USER_ADVANCED_SEARCH.field) as [UserAdvancedField, string][]) {
    const el = page.locator(`#${id}`);
    if ((await el.count()) === 0) {
      out[key] = 'absent';
      continue;
    }
    const tag = (await el.evaluate((e) => e.tagName.toLowerCase()).catch(() => '')) || '';
    out[key] = tag === 'input' ? 'text' : 'dropdown';
  }
  return out;
}

/** What an Advance Search field shows now (a text box's value, a dropdown's chosen label; "Select" = nothing chosen). */
export async function readAdvancedValue(page: Page, field: UserAdvancedField): Promise<string> {
  const el = page.locator(`#${USER_ADVANCED_SEARCH.field[field]}`);
  const tag = await el.evaluate((e) => e.tagName.toLowerCase()).catch(() => '');
  return (tag === 'input' ? await el.inputValue().catch(() => '') : await el.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
}

/** Removes every applied-filter chip one by one; the list's answer after the last removal (null when there was none). */
export async function clearAllChips(list: UserListPage, page: Page): Promise<IdentityListAnswer<UserListItem> | null> {
  let last: IdentityListAnswer<UserListItem> | null = null;
  for (let i = 0; i < 12; i += 1) {
    const ids = await page.locator(`[id^="${WRITER_A_IDS.userChipPrefix}"][id$="-remove"]`).evaluateAll((els) => els.map((e) => e.id));
    if (ids.length === 0) break;
    const key = ids[0].replace(WRITER_A_IDS.userChipPrefix, '').replace(/-remove$/, '');
    last = await list.removeChip(key);
  }
  return last;
}

// ---- keyboard --------------------------------------------------------------------------

/** Focuses an element by id and presses Enter; the URL before / after and whether a GetUsers request went out. */
export async function pressEnterOn(page: Page, id: string): Promise<{ urlBefore: string; urlAfter: string; listRequested: boolean; focused: boolean }> {
  const urlBefore = page.url();
  const el = page.locator(`#${id}`);
  await el.focus().catch(() => undefined);
  const focused = await el.evaluate((e) => document.activeElement === e || e.contains(document.activeElement)).catch(() => false);
  const requested = page.waitForRequest((r) => /\/GetUsers$/.test(r.url()), { timeout: Timeouts.short }).then(() => true).catch(() => false);
  await page.keyboard.press('Enter');
  const listRequested = await requested;
  await page.waitForTimeout(500);
  return { urlBefore, urlAfter: page.url(), listRequested, focused };
}

// ---- Assign Payers picker ---------------------------------------------------------------

/** Every payer name on both sides of the open picker. */
export async function pickerAll(drawer: UserFormDrawer): Promise<{ available: string[]; selected: string[] }> {
  return { available: await drawer.readPickerPayers('source'), selected: await drawer.readPickerPayers('target') };
}

/** Selected -> Available ("Move selected up") for each payer name. */
export async function movePayersBack(page: Page, names: readonly string[]): Promise<void> {
  const search = page.locator(`#${WRITER_A_IDS.picker.targetSearch}`);
  for (const name of names) {
    await search.fill(name);
    await page.waitForTimeout(400);
    const exact = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    await page.locator(`li[id^="${WRITER_A_IDS.picker.targetItemPrefix}"]`).filter({ hasText: exact }).first().click();
    await page.locator(`#${WRITER_A_IDS.picker.moveSelectedToSource}`).click();
  }
  await search.fill('');
  await page.waitForTimeout(300);
}

// ---- profile --------------------------------------------------------------------------

/**
 * Clicks a Change Password control on the User Profile page (any id holding
 * "change-password" inside the page outlet - none existed on 2026-11-08) and
 * reports whether one was offered and whether the Change Password drawer opened.
 */
export async function clickProfileChangePassword(page: Page): Promise<{ offered: boolean; opened: boolean }> {
  const control = page.locator('#app-layout-outlet [id*="change-password"]').first();
  if (!(await control.isVisible().catch(() => false))) return { offered: false, opened: false };
  await control.click();
  const opened = await new ChangePasswordDrawer(page).waitForOpen().then(() => true).catch(() => false);
  return { offered: true, opened };
}

// ---- payers --------------------------------------------------------------------------

/** The payer names the signed-in page may pick (GetPayersDropdown). */
export async function payerNamesOf(page: Page): Promise<string[]> {
  return (await payerDropdown(page)).map((p) => p.payerNameEn.trim());
}

/** A payer other than `exclude` (read-only use: "Al Dawaa" when present, else the first other). */
export async function otherPayer(page: Page, exclude: string): Promise<{ id: string; name: string }> {
  const all = await payerDropdown(page);
  const pick = all.find((p) => p.payerNameEn === 'Al Dawaa') ?? all.find((p) => p.payerNameEn !== exclude && p.payerNameEn.trim() !== '');
  if (!pick) throw new Error(`no payer other than "${exclude}" in the payer dropdown`);
  return { id: pick.id, name: pick.payerNameEn };
}

// ---- export ---------------------------------------------------------------------------

/** An export that may produce no file (an empty filtered result): the file, or the error and toasts. */
export async function tryExport(list: UserListPage, scope: 'selected' | 'all', format: 'csv' | 'excel'): Promise<{ result: UserExportResult | null; error: string; toasts: string[] }> {
  try {
    const result = await list.exportAndParse(scope, format);
    return { result, error: '', toasts: await list.readToasts() };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).split('\n')[0];
    Logger.warn(`[writerA] export ${scope}/${format} produced no file: ${message}`);
    return { result: null, error: message, toasts: await list.readToasts() };
  }
}

/** The exported Username (document ID) column. */
export function exportedUserNames(result: UserExportResult): string[] {
  return result.parsed.rows.map((r) => String(r.Username ?? '').trim()).filter(Boolean);
}
