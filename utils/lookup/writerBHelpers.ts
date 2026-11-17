import type { Locator, Page } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { LookupItemsPage, LookupRegisterPage } from '../../pages/lookup/LookupPages';
import { LanguageSwitcher } from '../../pages/components/LanguageSwitcher';
import { ConfirmDialog } from '../../pages/components/ConfirmDialog';
import { chooseSelectOption, readSelectOptions } from '../../pages/components/PrimeControls';
import { toastMessages } from '../../pages/user/userCommon';
import { AppRoutes } from '../../constants/AppRoutes';
import { GLOBAL } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { LOOKUP_ITEMS } from '../../constants/lookup/lookupIds';
import {
  LOOKUP_CHROME,
  LOOKUP_ITEMS_ADVANCED,
  LOOKUP_ITEMS_CHIPS,
  LOOKUP_ITEMS_VIEW,
  type ItemFilterField,
  type ItemFilters,
} from '../../constants/lookup/writerBIds';
import type { RapidOperation } from '../../data/lookup/searchAndFilterLookupItems.data';
import { lookupByCode, readAllLookups, readLookupItems, type LookupItem, type LookupRow } from './lookupApi';
import { Logger } from '../Logger';

/**
 * Writer B helpers - Lookups Management folders 02 (View Lookup Item List,
 * US 20854) and 04 (Search and Filter Lookup Items, US 20856).
 *
 * `WriterBItemsPage` extends the lead's LookupItemsPage with the readers these
 * two stories need: every row of every page, a row looked for across pages,
 * badges, row-action states, the predefined guidance, the Advance Search drawer
 * (ids INFERRED - constants/lookup/writerBIds.ts) and its chips. Nothing here
 * asserts a case's expectation: each case asserts what IT expects, and its
 * failure message says what the screen showed.
 *
 * The grid's expected content is computed from GET /api/Lookups/Items/<list>
 * (every item, inactive ones included) with the same criterion the screen was
 * given, so items of other runs never make a case fail.
 */

/** One grid row as shown (cells by column key). */
export interface ScreenRow {
  id: string;
  code: string;
  englishName: string;
  arabicName: string;
  order: string;
  status: string;
  predefined: string;
}

export type ActionState = 'absent' | 'disabled' | 'available';

/** What one Delete on a row produced - returned, never asserted. */
export interface DeleteAttempt {
  availability: ActionState;
  /** The button's own title / tooltip, when it has one. */
  hint: string;
  dialog: string;
  /** HTTP status of DeleteLookupItem, or null when no request left the browser. */
  status: number | null;
  answer: string;
  toasts: string[];
}

/** One applied-filter chip. */
export interface FilterChip {
  id: string;
  text: string;
  removable: boolean;
}

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();

export class WriterBItemsPage extends LookupItemsPage {
  constructor(page: Page) {
    super(page);
  }

  /** The empty state: the shared `-table-empty` row, or the id-less placeholder block some lists render instead. */
  protected emptyState(): Locator {
    // locator-exception: the placeholder block ({screen}__placeholder, User-module convention) carries no id.
    return this.byId(LOOKUP_ITEMS_VIEW.tableEmpty).or(this.page.locator(`.${LOOKUP_ITEMS_VIEW.placeholderClass}`)).first();
  }

  emptyBlock(): Locator {
    return this.emptyState();
  }

  table(): Locator {
    return this.byId(LOOKUP_ITEMS_VIEW.table);
  }

  /** The screen's main area (for error / guidance text). */
  section(): Locator {
    return this.byId(LOOKUP_ITEMS_VIEW.section);
  }

  headerTitle(): Locator {
    return this.byId(GLOBAL.headerTitle);
  }

  /** The breadcrumb's last crumb - the list's name ("Lookups > <list>"). */
  breadcrumbName(): Locator {
    return this.byId(LOOKUP_CHROME.breadcrumbCurrent).last();
  }

  async breadcrumbText(): Promise<string> {
    return flat(await this.breadcrumbName().innerText({ timeout: Timeouts.default }).catch(() => ''));
  }

  lookupsCrumb(): Locator {
    return this.byId(LOOKUP_CHROME.lookupsCrumb);
  }

  addItemButton(): Locator {
    return this.control('addButton');
  }

  searchBox(): Locator {
    return this.control('searchInput');
  }

  /** Every visible row action with this suffix, on any row (`{row}-{suffix}`). */
  visibleRowActions(suffix: string): Locator {
    return this.page.locator(`[id^="${LOOKUP_ITEMS_VIEW.rowPrefix}"][id$="-${suffix}"]`).filter({ visible: true });
  }

  /**
   * Opens a list's items screen by its code (route) and waits for GET Items and
   * for rows OR the empty state - unlike open(), which demands the table, so an
   * empty list can be opened too. Returns the Items answer's status (null: none).
   */
  async openList(listCode: string): Promise<number | null> {
    const answered = this.page
      .waitForResponse((r) => r.url().includes(`/api/Lookups/Items/${listCode}`), { timeout: Timeouts.default })
      .catch(() => null);
    await this.goto(`${AppRoutes.lookupManagement}/${listCode}`);
    const response = await answered;
    await this.waitShown();
    return response ? response.status() : null;
  }

  /** Waits for the table or the empty state, then for rows (or the empty state). */
  async waitShown(): Promise<void> {
    await this.table().or(this.emptyState()).first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    await this.waitForRowsRendered().catch(() => undefined);
  }

  /** The column keys the table renders (`-th-{key}`). */
  async columnKeys(): Promise<string[]> {
    return this.getColumnKeys();
  }

  /** The rows of the CURRENT page, cells by column key. */
  async rowsOnScreen(): Promise<ScreenRow[]> {
    return this.rows().evaluateAll(
      (trs, args) =>
        trs.map((tr) => {
          const read = (key: string): string => {
            const cell = tr.querySelector(`[id$="-cell-${key}"]`);
            return cell ? (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
          };
          return {
            id: tr.id.slice(args.prefix.length),
            code: read(args.col.code),
            englishName: read(args.col.englishName),
            arabicName: read(args.col.arabicName),
            order: read(args.col.order),
            status: read(args.col.status),
            predefined: read(args.col.predefined),
          };
        }),
      { prefix: LOOKUP_ITEMS_VIEW.rowPrefix, col: LOOKUP_ITEMS.column },
    );
  }

  private async firstRowId(): Promise<string> {
    return (await this.rowsOnScreen())[0]?.id ?? '';
  }

  private async nextPageOffered(): Promise<boolean> {
    const next = this.byId(LOOKUP_ITEMS_VIEW.pagerNext);
    return (await next.isVisible().catch(() => false)) && (await next.isEnabled().catch(() => false));
  }

  private async turnPage(button: Locator): Promise<void> {
    const before = await this.firstRowId();
    await button.click();
    await expect.poll(() => this.firstRowId(), { timeout: Timeouts.default }).not.toBe(before).catch(() => undefined);
  }

  /** Back to page 1 when the pager shows another page. */
  async goToFirstPage(): Promise<void> {
    const first = this.byId(`${LOOKUP_ITEMS_VIEW.pagerPagePrefix}1`);
    if (!(await first.isVisible().catch(() => false))) return;
    if ((await this.getCurrentPageNumber()) === 1) return;
    await this.turnPage(first);
  }

  /** Every row of EVERY page (walks the pager from page 1). */
  async readAllPages(): Promise<ScreenRow[]> {
    await this.waitForRowsRendered().catch(() => undefined);
    await this.goToFirstPage();
    const all = [...(await this.rowsOnScreen())];
    for (let guard = 0; guard < 50 && (await this.nextPageOffered()); guard += 1) {
      await this.turnPage(this.byId(LOOKUP_ITEMS_VIEW.pagerNext));
      all.push(...(await this.rowsOnScreen()));
    }
    return all;
  }

  /**
   * Waits until the current page shows only `expectedIds` (or the empty state
   * when none is expected) - the screen has applied the search / filter - then
   * returns every row of every page. Never throws on a mismatch: the caller compares.
   */
  async readResult(expected: readonly LookupItem[]): Promise<ScreenRow[]> {
    const want = new Set(expected.map((i) => i.id));
    await expect
      .poll(
        async () => {
          const ids = (await this.rowsOnScreen()).map((r) => r.id);
          if (want.size === 0) return ids.length === 0 && (await this.emptyState().isVisible().catch(() => false)) ? 'settled' : 'waiting';
          return ids.length > 0 && ids.every((id) => want.has(id)) ? 'settled' : 'waiting';
        },
        { timeout: Timeouts.default },
      )
      .toBe('settled')
      .catch(() => undefined);
    return this.readAllPages();
  }

  /** Brings the row of `itemId` on screen (walks the pages); false when no page shows it. */
  async findRow(itemId: string): Promise<boolean> {
    await this.waitForRowsRendered().catch(() => undefined);
    if (await this.row(itemId).isVisible().catch(() => false)) return true;
    await this.goToFirstPage();
    for (let guard = 0; guard < 50; guard += 1) {
      if (await this.row(itemId).isVisible().catch(() => false)) return true;
      if (!(await this.nextPageOffered())) return false;
      await this.turnPage(this.byId(LOOKUP_ITEMS_VIEW.pagerNext));
    }
    return false;
  }

  /** A row's badge text ('status' = Active column, 'predefined' = Predefined column), found across pages. */
  async badgeText(itemId: string, badge: 'status' | 'predefined'): Promise<string> {
    await this.findRow(itemId);
    const locator = badge === 'status' ? this.itemStatusBadge(itemId) : this.predefinedBadge(itemId);
    return flat(await locator.innerText({ timeout: Timeouts.default }).catch(() => '(no badge)'));
  }

  /** Whether a cell's text is cut (overflowing its box, or drawn with an ellipsis). */
  async cellTruncated(itemId: string, key: keyof typeof LOOKUP_ITEMS.column): Promise<boolean> {
    return this.cellOf(itemId, key).evaluate((el) => {
      const e = el as HTMLElement;
      const inner = (e.firstElementChild as HTMLElement | null) ?? e;
      return e.scrollWidth > e.clientWidth + 1 || inner.scrollWidth > inner.clientWidth + 1 || /…|\.\.\.$/.test(e.innerText.trim());
    });
  }

  /** How a row action is offered. */
  async actionState(itemId: string, suffix: string): Promise<ActionState> {
    const button = this.byId(`${LOOKUP_ITEMS_VIEW.rowPrefix}${itemId}-${suffix}`).first();
    if ((await button.count()) === 0 || !(await button.isVisible().catch(() => false))) return 'absent';
    return (await button.isEnabled().catch(() => false)) ? 'available' : 'disabled';
  }

  /** The states of several row actions at once, e.g. `{ activate: 'absent', inactivate: 'absent' }`. */
  async actionStates(itemId: string, suffixes: readonly string[]): Promise<Record<string, ActionState>> {
    const out: Record<string, ActionState> = {};
    for (const suffix of suffixes) out[suffix] = await this.actionState(itemId, suffix);
    return out;
  }

  /** A row action's own title / aria-label (where a disabled control explains itself). */
  private async actionHint(itemId: string, suffix: string): Promise<string> {
    const button = this.byId(`${LOOKUP_ITEMS_VIEW.rowPrefix}${itemId}-${suffix}`).first();
    if ((await button.count()) === 0) return '';
    const attrs = await button.evaluate((el) => {
      const own = ['title', 'aria-label', 'ptooltip', 'data-pc-tooltip'].map((a) => el.getAttribute(a) ?? '');
      const host = el.parentElement ? ['title', 'aria-label'].map((a) => el.parentElement!.getAttribute(a) ?? '') : [];
      return [...own, ...host].filter((t) => t !== '');
    });
    return attrs.join(' | ');
  }

  /** The tooltip shown while the pointer rests on a row action (empty when none). */
  private async actionTooltip(itemId: string, suffix: string): Promise<string> {
    const button = this.byId(`${LOOKUP_ITEMS_VIEW.rowPrefix}${itemId}-${suffix}`).first();
    if ((await button.count()) === 0) return '';
    await button.hover({ force: true, timeout: Timeouts.short }).catch(() => undefined);
    // locator-exception: PrimeNG renders tooltips into <body> without an id; only the one on screen is read.
    const tip = this.page.locator('.p-tooltip').filter({ visible: true });
    await tip.first().waitFor({ state: 'visible', timeout: 2_000 }).catch(() => undefined);
    const text = (await tip.allInnerTexts().catch(() => [] as string[])).map(flat).filter(Boolean).join(' | ');
    await this.page.mouse.move(0, 0).catch(() => undefined);
    return text;
  }

  /**
   * Every place the "predefined" guidance could be shown for a row: the screen's
   * text, the Edit / Delete buttons' own title, and their hover tooltip.
   */
  async predefinedGuidance(itemId: string): Promise<{ screen: string; hints: string; tooltips: string }> {
    await this.findRow(itemId);
    const screen = flat(await this.section().innerText().catch(() => ''));
    const hints = [await this.actionHint(itemId, 'edit'), await this.actionHint(itemId, 'delete')].filter(Boolean).join(' | ');
    const tooltips = [await this.actionTooltip(itemId, 'edit'), await this.actionTooltip(itemId, 'delete')].filter(Boolean).join(' | ');
    return { screen, hints, tooltips };
  }

  /** Presses Delete on a row and, when the confirmation appears, confirms it; reports everything seen. */
  async attemptDelete(itemId: string): Promise<DeleteAttempt> {
    await this.findRow(itemId);
    const availability = await this.actionState(itemId, 'delete');
    const hint = [await this.actionHint(itemId, 'delete'), availability === 'available' ? '' : await this.actionTooltip(itemId, 'delete')].filter(Boolean).join(' | ');
    if (availability !== 'available') return { availability, hint, dialog: '', status: null, answer: '', toasts: [] };
    const request = this.page
      .waitForResponse((r) => r.url().includes('/api/Lookups/DeleteLookupItem'), { timeout: Timeouts.default })
      .then(async (r) => ({ status: r.status() as number | null, answer: flat(await r.text().catch(() => '')).slice(0, 300) }))
      .catch(() => ({ status: null as number | null, answer: '' }));
    Logger.step(`Pressing Delete on lookup item ${itemId}`);
    await this.rowAction(itemId, 'delete').click();
    const dialog = new ConfirmDialog(this.page);
    let dialogText = '';
    if (await dialog.isVisible()) {
      dialogText = flat(`${await dialog.getTitle().catch(() => '')} ${await dialog.getMessage().catch(() => '')}`);
      await dialog.confirm().catch(() => undefined);
    }
    const { status, answer } = await request;
    const toasts = await toastMessages(this.page);
    Logger.step(`Delete -> ${status ?? 'no request'}; dialog "${dialogText}"; toasts ${JSON.stringify(toasts)}`);
    return { availability, hint, dialog: dialogText, status, answer, toasts };
  }

  /** Uses the first available Activate / Inactivate control of a row (confirming its prompt); '' when none is offered. */
  async useActivation(itemId: string, suffixes: readonly string[]): Promise<{ suffix: string; dialog: string; toasts: string[] }> {
    await this.findRow(itemId);
    for (const suffix of suffixes) {
      if ((await this.actionState(itemId, suffix)) !== 'available') continue;
      Logger.step(`Pressing "${suffix}" on lookup item ${itemId}`);
      await this.byId(`${LOOKUP_ITEMS_VIEW.rowPrefix}${itemId}-${suffix}`).first().click();
      const dialog = new ConfirmDialog(this.page);
      let dialogText = '';
      if (await dialog.isVisible()) {
        dialogText = flat(`${await dialog.getTitle().catch(() => '')} ${await dialog.getMessage().catch(() => '')}`);
        await dialog.confirm().catch(() => undefined);
      }
      return { suffix, dialog: dialogText, toasts: await toastMessages(this.page) };
    }
    return { suffix: '', dialog: '', toasts: [] };
  }

  async readToasts(): Promise<string[]> {
    return toastMessages(this.page);
  }

  // ---- Search ---------------------------------------------------------------------

  /** Types a keyword into the toolbar search and submits it (Enter). '' clears the search. */
  async typeSearch(term: string): Promise<void> {
    Logger.step(`Searching the lookup items for "${term}"`);
    await this.searchBox().fill(term);
    await this.searchBox().press('Enter');
    await this.waitForPageReady();
  }

  // ---- Advance Search (ids INFERRED - writerBIds.ts) ---------------------------------

  advancedTitle(): Locator {
    return this.byId(LOOKUP_ITEMS_ADVANCED.title);
  }

  /** A drawer field, by its first candidate id that exists. */
  advancedField(field: ItemFilterField): Locator {
    const ids = LOOKUP_ITEMS_ADVANCED.field[field].map((key) => `${LOOKUP_ITEMS_ADVANCED.fieldPrefix}${key}-input`);
    return ids.slice(1).reduce((locator, id) => locator.or(this.byId(id)), this.byId(ids[0])).first();
  }

  /** Opens the Advance Search drawer; returns whether it opened. */
  async openAdvanced(): Promise<boolean> {
    if (await this.advancedTitle().isVisible().catch(() => false)) return true;
    await this.control('filterButton').click();
    return this.advancedTitle().waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** Fills the given fields (text typed; selects chosen by option label, ignoring case). The drawer must be open. */
  async fillAdvanced(filters: ItemFilters): Promise<void> {
    for (const [field, value] of Object.entries(filters) as [ItemFilterField, string][]) {
      const control = this.advancedField(field);
      // A filter the drawer does not offer is a FINDING - say so, rather than a 15 s click timeout
      // that reads like an automation fault (full run 2026-11-09: the drawer offers Code, English
      // Name, Arabic Name and Active only - no Predefined, although AC 20856 lists it).
      // locator-exception: the drawer's field labels carry no ids; its labels are read for the message.
      const offered = (await this.page.locator(`#${LOOKUP_ITEMS_ADVANCED.root} label`).allInnerTexts().catch(() => [] as string[])).map((s) => s.trim()).filter(Boolean);
      await expect(control, `the Advance Search offers a "${field}" filter (it offers: ${offered.join(', ') || 'nothing readable'})`).toBeVisible({ timeout: Timeouts.short });
      if ((LOOKUP_ITEMS_ADVANCED.selects as readonly string[]).includes(field)) {
        const options = await readSelectOptions(this.page, control);
        const label = options.find((o) => o.trim().toLowerCase() === value.toLowerCase()) ?? value;
        await chooseSelectOption(this.page, control, label);
      } else {
        await control.fill(value);
      }
    }
  }

  /** The drawer's Search; waits for the drawer to close. */
  async applyAdvanced(): Promise<void> {
    await this.btn(LOOKUP_ITEMS_ADVANCED.search).click();
    await this.advancedTitle().waitFor({ state: 'hidden', timeout: Timeouts.default }).catch(() => undefined);
    await this.waitForPageReady();
  }

  /** Opens the drawer, fills `filters`, presses Search. Throws when the drawer does not open. */
  async advancedSearch(filters: ItemFilters): Promise<void> {
    Logger.step(`Advance Search on the lookup items: ${JSON.stringify(filters)}`);
    if (!(await this.openAdvanced())) throw new Error(`the Advance Search drawer (#${LOOKUP_ITEMS_ADVANCED.title}) did not open from #${LOOKUP_ITEMS.filterButton}`);
    await this.fillAdvanced(filters);
    await this.applyAdvanced();
  }

  /** The value a drawer field holds now (text value, or the select's shown label). */
  async advancedValue(field: ItemFilterField): Promise<string> {
    const control = this.advancedField(field);
    if ((LOOKUP_ITEMS_ADVANCED.selects as readonly string[]).includes(field)) return flat(await control.innerText().catch(() => ''));
    return control.inputValue().catch(() => '');
  }

  // ---- Chips (ids INFERRED) --------------------------------------------------------

  /** The applied-filter chips shown (outermost chip elements only) and whether each offers its remove control. */
  async readChips(): Promise<FilterChip[]> {
    const found = await this.page
      .locator(`[id^="${LOOKUP_ITEMS_CHIPS.chipPrefix}"]:not([id$="${LOOKUP_ITEMS_CHIPS.removeSuffix}"])`)
      .evaluateAll(
        (els, prefix) =>
          els
            .filter((e) => !(e.parentElement?.closest(`[id^="${prefix}"]`)))
            .filter((e) => (e as HTMLElement).offsetParent !== null)
            .map((e) => ({ id: e.id, text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim() })),
        LOOKUP_ITEMS_CHIPS.chipPrefix,
      )
      .catch(() => [] as { id: string; text: string }[]);
    const chips: FilterChip[] = [];
    for (const chip of found) {
      const removable = await this.byId(`${chip.id}${LOOKUP_ITEMS_CHIPS.removeSuffix}`).first().isVisible().catch(() => false);
      chips.push({ ...chip, removable });
    }
    return chips;
  }

  /** Removes the chip whose text carries `value`; returns its id ('' when no chip carries it). */
  async removeChipFor(value: string): Promise<string> {
    const chip = (await this.readChips()).find((c) => chipCarries(c.text, value));
    if (!chip) return '';
    Logger.step(`Removing the filter chip "${chip.text}"`);
    await this.byId(`${chip.id}${LOOKUP_ITEMS_CHIPS.removeSuffix}`).first().click();
    await this.waitForPageReady();
    return chip.id;
  }
}

// ---- free helpers ----------------------------------------------------------------------

/** resultDiff of a grid that shows exactly what it should. */
export const NO_DIFF = { missing: [] as string[], unexpected: [] as string[], duplicates: [] as string[] };

/** Whitespace collapsed, en / em dashes read as a hyphen (lead decision 2). */
export function normalise(text: string): string {
  return text.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

/** The UI language switcher of a window. */
export function languageOf(page: Page): LanguageSwitcher {
  return new LanguageSwitcher(page);
}

/** Whether a chip's text carries a filter value as a whole word ("Active" is not in "Inactive"). */
export function chipCarries(text: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

/** Item matches a keyword (code, English or Arabic name contains it, ignoring case); '' matches all. */
export function matchesKeyword(item: LookupItem, term: string): boolean {
  const t = term.trim().toLowerCase();
  return t === '' || [item.code, item.englishName, item.arabicName].some((v) => (v ?? '').toLowerCase().includes(t));
}

/** Item matches Advance Search criteria (text: contains, ignoring case; status Active/Inactive; predefined Yes/No). */
export function matchesFilters(item: LookupItem, filters: ItemFilters): boolean {
  const has = (value: string, part: string | undefined): boolean => part === undefined || (value ?? '').toLowerCase().includes(part.toLowerCase());
  return (
    has(item.code, filters.code)
    && has(item.englishName, filters.englishName)
    && has(item.arabicName, filters.arabicName)
    && (filters.status === undefined || (filters.status.toLowerCase() === 'active') === item.isActive)
    && (filters.predefined === undefined || (filters.predefined.toLowerCase() === 'yes') === item.predefined)
  );
}

/** What the screen showed against what it should show: codes missing, rows not expected, rows shown twice. */
export function resultDiff(shown: readonly ScreenRow[], expected: readonly LookupItem[]): { missing: string[]; unexpected: string[]; duplicates: string[] } {
  const want = new Map(expected.map((i) => [i.id, i.code]));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const row of shown) {
    if (seen.has(row.id)) duplicates.push(row.code || row.id);
    seen.add(row.id);
  }
  return {
    missing: [...want.entries()].filter(([id]) => !seen.has(id)).map(([, code]) => code).sort(),
    unexpected: shown.filter((r) => !want.has(r.id)).map((r) => `${r.code} (${r.status}, predefined ${r.predefined})`).sort(),
    duplicates,
  };
}

/** The chips that should show for `filters`, checked against the chips shown: [] when they agree. */
export function chipProblems(chips: readonly FilterChip[], filters: ItemFilters): string[] {
  const values = Object.entries(filters).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  const problems: string[] = [];
  if (chips.length !== values.length) problems.push(`${chips.length} chip(s) shown [${chips.map((c) => c.text).join(' | ')}] for ${values.length} filter(s) ${JSON.stringify(filters)}`);
  for (const [field, value] of values) {
    const chip = chips.find((c) => chipCarries(c.text, value));
    if (!chip) problems.push(`no chip for ${field} = "${value}"`);
    else if (!chip.removable) problems.push(`the ${field} chip "${chip.text}" has no remove control`);
  }
  return problems;
}

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

/** A unique Arabic name for a suite item - Arabic letters only (the suite's phrase + a random Arabic tag). */
export function uniqueArabicName(): string {
  let tag = '';
  for (let i = 0; i < 6; i += 1) tag += ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
  return `قيمة اختبار ${tag}`;
}

/** The unique part of a suite item's English name ("QA Automation <stamp>" -> "<stamp>"). */
export function stampOf(item: LookupItem): string {
  return item.englishName.replace(/^QA Automation\s*/i, '').trim() || item.code;
}

/**
 * Opens a list the way a person does: search the register for its code and
 * press the row's View. Returns the list's register row (names for the breadcrumb).
 */
export async function openFromRegister(page: Page, register: LookupRegisterPage, items: WriterBItemsPage, listCode: string): Promise<LookupRow> {
  const list = await lookupByCode(page, listCode);
  const searched = page
    .waitForResponse((r) => r.url().includes('/api/Lookups/GetLookups') && (r.request().postData() ?? '').includes(listCode), { timeout: Timeouts.default })
    .catch(() => null);
  await register.control('searchInput').fill(listCode);
  await register.control('searchInput').press('Enter');
  await searched;
  const opened = page.waitForResponse((r) => r.url().includes(`/api/Lookups/Items/${listCode}`), { timeout: Timeouts.default }).catch(() => null);
  Logger.step(`Opening the list "${listCode}" from the register (View)`);
  await register.viewButton(list.id).click({ timeout: Timeouts.default });
  await opened;
  await items.waitShown();
  return list;
}

/** Reads a value in English, then in Arabic (UI switched, list reopened); ALWAYS switches back to English. */
export async function readInBothLanguages(page: Page, items: WriterBItemsPage, listCode: string, read: () => Promise<string>): Promise<{ en: string; ar: string }> {
  const language = new LanguageSwitcher(page);
  try {
    await language.switchTo('en');
    await items.openList(listCode);
    const en = await read();
    await language.switchTo('ar');
    await items.openList(listCode);
    const ar = await read();
    return { en, ar };
  } finally {
    await language.switchTo('en').catch(() => undefined);
  }
}

/** A list of the register with no item at all (API), or null. */
export async function findEmptyList(page: Page): Promise<LookupRow | null> {
  const { items } = await readAllLookups(page);
  for (const list of items) {
    const listItems = await readLookupItems(page, list.code).catch(() => null);
    if (listItems !== null && listItems.length === 0) return list;
  }
  return null;
}

/**
 * Marks the case BLOCKED for data the environment cannot produce - unless an
 * earlier step already FAILED, in which case the finding must stay visible (the
 * case ends FAIL and the reason is kept as a note). Same idea as
 * utils/settings/writerBHelpers.ts.
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

/** The empty list to open, or BLOCKED (`reason`) when the register has none. */
export async function requireEmptyList(steps: TestSteps, page: Page, reason: string): Promise<LookupRow | null> {
  const list = await findEmptyList(page);
  if (!list) blockUnlessAStepFailed(steps, reason);
  return list;
}

/** A predefined item of the list, or BLOCKED (`reason`) when it has none. */
export function requirePredefined(steps: TestSteps, items: readonly LookupItem[], reason: string): LookupItem | null {
  const found = items.find((i) => i.predefined && i.isActive) ?? items.find((i) => i.predefined) ?? null;
  if (!found) blockUnlessAStepFailed(steps, reason);
  return found;
}

/**
 * 21153: applies the operations one straight after the other; after each, the
 * chips and the grid must match the filters then applied. Returns every
 * disagreement (empty = in sync at every step).
 */
export async function runFilterSequence(items: WriterBItemsPage, all: readonly LookupItem[], start: ItemFilters, operations: readonly RapidOperation[]): Promise<string[]> {
  const applied: ItemFilters = { ...start };
  const problems: string[] = [];
  for (const [index, op] of operations.entries()) {
    const label = `#${index + 1} ${JSON.stringify(op)}`;
    if ('set' in op) {
      Object.assign(applied, op.set);
      await items.advancedSearch(op.set);
    } else {
      const value = applied[op.removeChip] ?? '';
      delete applied[op.removeChip];
      if ((await items.removeChipFor(value)) === '') problems.push(`${label}: no chip carrying "${value}" to remove`);
    }
    const expected = all.filter((i) => matchesFilters(i, applied));
    const diff = resultDiff(await items.readResult(expected), expected);
    if (diff.missing.length || diff.unexpected.length || diff.duplicates.length) problems.push(`${label}: grid ${JSON.stringify(diff)} for ${JSON.stringify(applied)}`);
    for (const p of chipProblems(await items.readChips(), applied)) problems.push(`${label}: ${p}`);
  }
  return problems;
}

/** Page objects for another window (a suite session). */
export function lookupPagesFor(page: Page): { register: LookupRegisterPage; items: WriterBItemsPage } {
  return { register: new LookupRegisterPage(page), items: new WriterBItemsPage(page) };
}

export interface WriterBLookupFixtures {
  /** The Lookup Items screen with Writer B's readers. */
  itemsView: WriterBItemsPage;
}

export const test = base.extend<WriterBLookupFixtures>({
  itemsView: async ({ page }, use) => {
    await use(new WriterBItemsPage(page));
  },
});

export { expect };
