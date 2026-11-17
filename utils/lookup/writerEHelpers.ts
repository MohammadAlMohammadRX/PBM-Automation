import type { Locator, Page } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import { LookupItemDrawer, LookupItemsPage, type ItemSaveOutcome, type LookupRegisterPage } from '../../pages/lookup/LookupPages';
import type { UserListPage } from '../../pages/user/UserListPage';
import type { UserDeactivateDrawer } from '../../pages/user/UserDeactivateDrawer';
import type { ProvisionedUser } from '../UserProvisioning';
import { LOOKUP_ITEMS, LOOKUP_ITEM_DRAWER } from '../../constants/lookup/lookupIds';
import { DIALOG, DIALOG_ACTION } from '../../constants/ElementIds';
import { UNSAVED_DIALOG } from '../../constants/settings/settingsIds';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { SUITE_ITEM_PREFIX, deleteLookupItem, lookupByCode, readLookupItems, updateLookupItem, type LookupItem } from './lookupApi';

/**
 * Writer E helpers - Lookups Management folder 08 (Add Lookup Item, US 20860).
 *
 * `WriterEDrawer` extends the lead's LookupItemDrawer with the readers the Add
 * cases need (values, placeholders, the field errors under each field, the
 * unsaved-changes dialog); `WriterEItems` extends LookupItemsPage (Add Item,
 * revealing a row, a non-asserting visit for a restricted session). Nothing
 * here asserts a case's expectation: each case asserts what IT expects, and
 * its failure message says what the screen showed.
 *
 * `strayLookupNames` (fixture): an item saved with a blank / whitespace Code
 * cannot carry the `QA-AUTO-` prefix, so suiteLookupItems' teardown would not
 * see it. Such a case tracks its unique "QA Automation <letters>" English name
 * and teardown deletes any item of that list with exactly that name (made
 * inactive, with a `leftover` note, when the delete is refused).
 */

export { expect };

export type DrawerInput = 'code' | 'englishName' | 'arabicName' | 'order';

export interface DrawerValues {
  code: string;
  englishName: string;
  arabicName: string;
  order: string;
  isActive: boolean;
}

/** A message with its whitespace and the summary / detail dash normalised ("A — B" == "A\nB" == "A - B"). */
export function norm(text: string): string {
  return text.replace(/\s+[—–-]\s+/g, ' ').replace(/[—–]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Digits of a stamp as letters (English names must hold English letters only). */
function lettersOf(stamp: string): string {
  return stamp.replace(/\d/g, (d) => 'ABCDEFGHIJ'[Number(d)]);
}

/** The suite's English name for a suite code: "QA Automation <letters of the code's stamp>". */
export function englishNameFor(code: string): string {
  return `QA Automation ${lettersOf(code.replace(SUITE_ITEM_PREFIX, '').replace(/[^A-Za-z0-9]/g, ''))}`;
}

/** A suite code padded with "X" to exactly `length` characters. */
export function codeOfLength(code: string, length: number): string {
  return `${code}${'X'.repeat(Math.max(0, length - code.length))}`.slice(0, length);
}

/** A suite English name of exactly `length` English letters / spaces. */
export function englishNameOfLength(base: string, length: number): string {
  return `${base} ${'abcdefghij'.repeat(Math.ceil(length / 10))}`.slice(0, length);
}

/** Every item of a list now (API). */
export async function itemsOf(page: Page, listCode: string): Promise<LookupItem[]> {
  return readLookupItems(page, listCode);
}

/** The items of a list whose code is exactly `code` (or one of `code`). */
export async function itemsWithCode(page: Page, listCode: string, code: string | readonly string[]): Promise<LookupItem[]> {
  const codes: readonly string[] = typeof code === 'string' ? [code] : code;
  return (await readLookupItems(page, listCode)).filter((i) => codes.includes(i.code));
}

/** The named drawer values only. */
export function pick<K extends keyof DrawerValues>(values: DrawerValues, fields: readonly K[]): Pick<DrawerValues, K> {
  return Object.fromEntries(fields.map((f) => [f, values[f]])) as Pick<DrawerValues, K>;
}

/** `{ field: value }` for every named field (e.g. all empty, all "Enter value"). */
export function uniform<K extends string>(fields: readonly K[], value: string): Record<K, string> {
  return Object.fromEntries(fields.map((f) => [f, value])) as Record<K, string>;
}

/** Add Item -> the drawer (asserts it opened). */
export async function openAddForm(items: WriterEItems, drawer: WriterEDrawer): Promise<void> {
  await items.clickAddItem();
  await drawer.waitForOpen();
}

/** The items of a list with exactly this English name. */
export async function itemsNamed(page: Page, listCode: string, englishName: string): Promise<LookupItem[]> {
  return (await readLookupItems(page, listCode)).filter((i) => i.englishName === englishName);
}

/** What one Save produced, for failure messages. */
export function described(o: ItemSaveOutcome): string {
  return `Create answered ${o.status ?? 'nothing (no request)'}${o.answer ? ` "${o.answer.slice(0, 160)}"` : ''}; toast "${o.toast}"; drawer ${o.drawerOpen ? 'open' : 'closed'}`;
}

/** The Create request was sent and accepted (2xx). */
export function wasSaved(o: ItemSaveOutcome): boolean {
  return o.status !== null && o.status >= 200 && o.status < 300;
}

/** "Does not submit": no Create request succeeded (none sent, or refused). */
export function wasNotSubmitted(o: ItemSaveOutcome): boolean {
  return o.status === null || o.status >= 400;
}

/** The Add / Edit Lookup Item drawer with Writer E's readers. */
export class WriterEDrawer extends LookupItemDrawer {
  title(): Locator {
    return this.byId(LOOKUP_ITEM_DRAWER.title);
  }

  /** Waits for the drawer's title (asserts the drawer opened). */
  async waitForOpen(): Promise<void> {
    await expect(this.title(), 'the lookup item drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** True once the drawer has slid out. */
  async waitForClosed(timeout: number = Timeouts.short): Promise<boolean> {
    return this.title().waitFor({ state: 'hidden', timeout }).then(() => true).catch(() => false);
  }

  async values(): Promise<DrawerValues> {
    return {
      code: await this.field('code').inputValue(),
      englishName: await this.field('englishName').inputValue(),
      arabicName: await this.field('arabicName').inputValue(),
      order: await this.field('order').inputValue(),
      isActive: await this.field('isActive').isChecked(),
    };
  }

  async placeholder(field: DrawerInput): Promise<string> {
    return (await this.field(field).getAttribute('placeholder')) ?? '';
  }

  /** The placeholder of each named input ('' when it has none). */
  async placeholders<K extends DrawerInput>(fields: readonly K[]): Promise<Record<K, string>> {
    const out = {} as Record<K, string>;
    for (const f of fields) out[f] = await this.placeholder(f);
    return out;
  }

  async setActive(on: boolean): Promise<void> {
    await this.field('isActive').setChecked(on);
  }

  /**
   * The message(s) under one field. The drawer's errors were not seen in the
   * foundation, so both shapes are read: an element with its own `-error` id
   * and the id-less `small.pbm-field-error` (member / user drawers) - inside the
   * field's own block (the largest ancestor holding no other input), or right
   * after it when the form is flat.
   */
  async fieldError(field: DrawerInput): Promise<string> {
    return this.field(field)
      .evaluate((input) => {
        const ERROR = 'small.pbm-field-error, [id$="-error"]';
        const inputs = (el: Element): number => el.querySelectorAll('input:not([type="hidden"]), textarea').length + (el.matches('input, textarea') ? 1 : 0);
        const shown = (el: Element): boolean => (el as HTMLElement).getClientRects().length > 0;
        const text = (el: Element): string => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
        let block: Element = input;
        while (block.parentElement && inputs(block.parentElement) <= 1) block = block.parentElement;
        const found = Array.from(block.querySelectorAll(ERROR));
        for (let sib = block.nextElementSibling; sib && inputs(sib) === 0; sib = sib.nextElementSibling) {
          if (sib.matches(ERROR)) found.push(sib);
          found.push(...Array.from(sib.querySelectorAll(ERROR)));
        }
        return found.filter(shown).map(text).filter((t, i, all) => t !== '' && all.indexOf(t) === i).join(' | ');
      })
      .catch(() => '');
  }

  /** Every field error shown in the drawer (for failure messages and "no validation error"). */
  async fieldErrors(): Promise<string[]> {
    return this.byId(LOOKUP_ITEM_DRAWER.drawer)
      .evaluate((root) =>
        Array.from(root.querySelectorAll('small.pbm-field-error, [id$="-error"]'))
          .filter((el) => (el as HTMLElement).getClientRects().length > 0)
          .map((el) => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
          .filter((t) => t !== ''))
      .catch(() => [] as string[]);
  }

  /** Save, reporting the request, answer, toast and drawer state (the lead's saveAndCapture). */
  async attemptSave(): Promise<ItemSaveOutcome> {
    return this.saveAndCapture();
  }

  async pressCancel(): Promise<void> {
    await this.field('cancel').click();
  }

  async pressClose(): Promise<void> {
    await this.field('close').click();
  }

  // ---- unsaved-changes dialog (same shape as SettingsHubPage) ------------------------

  unsavedDialog(): Locator {
    // locator-exception: the unsaved-changes host's inner dialog carries no id of its own; its visible dialog is matched.
    const host = this.byId(UNSAVED_DIALOG.host).locator('.p-dialog, [role="dialog"]').first();
    const shared = this.byId(DIALOG.root).filter({ has: this.page.locator(`#${DIALOG_ACTION.stay}, #${DIALOG_ACTION.discard}`) });
    return host.or(shared).first();
  }

  async isUnsavedDialogOpen(timeout: number = Timeouts.short): Promise<boolean> {
    return this.unsavedDialog().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  /** "<title> — <message>" of the unsaved-changes dialog, '' when none shows. */
  async unsavedDialogText(): Promise<string> {
    if (!(await this.isUnsavedDialogOpen(1_000))) return '';
    if (await this.byId(DIALOG.title).isVisible().catch(() => false)) {
      const title = (await this.byId(DIALOG.title).innerText()).trim();
      const message = (await this.byId(DIALOG.message).innerText().catch(() => '')).trim();
      return norm(`${title} — ${message}`);
    }
    return norm(await this.unsavedDialog().innerText());
  }

  keepEditingButton(): Locator {
    return this.btn(DIALOG_ACTION.stay);
  }

  discardButton(): Locator {
    return this.btn(DIALOG_ACTION.discard);
  }

  async keepEditing(): Promise<void> {
    await this.keepEditingButton().click();
    await this.unsavedDialog().waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  }

  async discardChanges(): Promise<void> {
    await this.discardButton().click();
    await this.unsavedDialog().waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  }
}

/** What a (possibly restricted) session sees on a list's items screen. */
export interface ItemsScreenState {
  mode: 'denied' | 'read-only' | 'editable';
  url: string;
  tableShown: boolean;
  addShown: boolean;
  addEnabled: boolean;
}

/** One list's items screen with Writer E's readers. */
export class WriterEItems extends LookupItemsPage {
  async clickAddItem(): Promise<void> {
    Logger.step('Clicking Add Item');
    await this.control('addButton').click();
  }

  /** Types `term` in the items search and waits for the list to settle. */
  async searchItems(term: string): Promise<void> {
    const answered = this.page.waitForResponse((r) => r.url().includes('/api/Lookups/Items/'), { timeout: Timeouts.short }).catch(() => null);
    await this.control('searchInput').fill(term);
    await this.control('searchInput').press('Enter');
    await answered;
    await this.waitForPageReady();
  }

  /** Brings an item's row on screen (searching its code when it is not on this page); true when shown. */
  async revealItem(item: Pick<LookupItem, 'id' | 'code'>): Promise<boolean> {
    if (await this.row(item.id).isVisible().catch(() => false)) return true;
    await this.searchItems(item.code);
    return this.row(item.id).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** Reveals the item's row and presses its Edit (opens the drawer for review; nothing is saved). */
  async openEdit(item: Pick<LookupItem, 'id' | 'code'>): Promise<void> {
    await this.revealItem(item);
    await this.rowAction(item.id, 'edit').click();
  }

  async cellText(itemId: string, key: keyof typeof LOOKUP_ITEMS.column): Promise<string> {
    return (await this.cellOf(itemId, key).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Whether Add Item is offered (shown, and enabled). */
  async addState(): Promise<{ shown: boolean; enabled: boolean }> {
    const add = this.byId(LOOKUP_ITEMS.addButton);
    const shown = await add.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    const enabled = shown && (await this.control('addButton').isEnabled().catch(() => false));
    return { shown, enabled };
  }

  /** Goes to a list's items screen WITHOUT asserting it renders (a restricted session may be denied). */
  async visit(listCode: string): Promise<ItemsScreenState> {
    await this.goto(`${AppRoutes.lookupManagement}/${listCode}`).catch(() => undefined);
    const tableShown = await this.byId(`${LOOKUP_ITEMS.screen}-table-el`).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
    const { shown, enabled } = tableShown ? await this.addState() : { shown: false, enabled: false };
    const mode = !tableShown ? 'denied' : shown && enabled ? 'editable' : 'read-only';
    Logger.step(`Items screen of ${listCode}: ${mode} (url ${this.page.url()}, Add Item shown ${shown}, enabled ${enabled})`);
    return { mode, url: this.page.url(), tableShown, addShown: shown, addEnabled: enabled };
  }
}

/** Searches the register for a list code (awaiting GetLookups) and returns its row's View button. */
export async function registerRowOf(register: LookupRegisterPage, page: Page, listCode: string): Promise<Locator> {
  const list = await lookupByCode(page, listCode);
  const answered = page.waitForResponse((r) => r.url().includes('/api/Lookups/GetLookups'), { timeout: Timeouts.default }).catch(() => null);
  await register.control('searchInput').fill(listCode);
  await register.control('searchInput').press('Enter');
  await answered;
  return register.viewButton(list.id);
}

/** CreateLookupItem sent with the token of `sessionPage` (the "direct" way in for 21208). */
export async function createAsSession(
  sessionPage: Page,
  adminPage: Page,
  listCode: string,
  item: { code: string; englishName: string; arabicName: string },
): Promise<{ status: number; text: string }> {
  const list = await lookupByCode(adminPage, listCode);
  const res = await NetworkUtils.requestAsSession(sessionPage, 'POST', '/api/Lookups/CreateLookupItem', { lookupId: list.id, index: 0, isActive: true, ...item });
  Logger.step(`CreateLookupItem as the session user -> ${res.status}`);
  return { status: res.status, text: res.text.replace(/\s+/g, ' ').slice(0, 300) };
}

// ---- the consuming form: the user Deactivate drawer -------------------------------------

/** Users > the suite user's row > Inactivate: the Deactivate drawer (asserts it opened). Nobody is deactivated. */
export async function openDeactivateFor(userListPage: UserListPage, user: ProvisionedUser): Promise<UserDeactivateDrawer> {
  await userListPage.openTable();
  expect(await userListPage.isListed(user.displayNameEn), `the suite user "${user.displayNameEn}" in the user list`).toBe(true);
  return userListPage.openDeactivate(user.id);
}

/**
 * Where the offered options break the display order around `newName`: every
 * option before it must have an order <= `order`, every one after it >= `order`
 * (orders from GetItems; options that are not active items of the list are ignored).
 */
export function orderProblems(options: string[], items: LookupItem[], newName: string, order: number): string[] {
  const indexOf = new Map(items.filter((i) => i.isActive).map((i) => [i.englishName, i.index] as const));
  const at = options.indexOf(newName);
  if (at < 0) return [`"${newName}" is not offered`];
  const problems: string[] = [];
  options.forEach((label, i) => {
    const index = indexOf.get(label);
    if (index === undefined || i === at) return;
    if (i < at && index > order) problems.push(`"${label}" (order ${index}) is offered BEFORE the new value (order ${order})`);
    if (i > at && index < order) problems.push(`"${label}" (order ${index}) is offered AFTER the new value (order ${order})`);
  });
  return problems;
}

// ---- fixture: items saved without the suite prefix ----------------------------------------

export interface StrayLookupNames {
  /** Remembers a suite English name ("QA Automation ...") typed with a blank-ish Code, for teardown. */
  track(listCode: string, englishName: string): void;
}

export interface WriterEFixtures {
  strayLookupNames: StrayLookupNames;
  /** The Add / Edit Lookup Item drawer with Writer E's readers. */
  addDrawer: WriterEDrawer;
  /** A list's items screen with Writer E's readers. */
  addItems: WriterEItems;
}

export const test = base.extend<WriterEFixtures>({
  addDrawer: async ({ page }, use) => {
    await use(new WriterEDrawer(page));
  },
  addItems: async ({ page }, use) => {
    await use(new WriterEItems(page));
  },
  strayLookupNames: async ({ page }, use, testInfo) => {
    const tracked: { listCode: string; englishName: string }[] = [];
    await use({
      track: (listCode, englishName) => {
        if (!englishName.startsWith('QA Automation ')) throw new Error(`"${englishName}" is not a suite English name`);
        tracked.push({ listCode, englishName });
      },
    });
    for (const { listCode, englishName } of tracked) {
      const items = await readLookupItems(page, listCode).catch(() => [] as LookupItem[]);
      for (const item of items.filter((i) => i.englishName === englishName && !i.code.startsWith(SUITE_ITEM_PREFIX))) {
        const del = await deleteLookupItem(page, item.id).catch((e: unknown) => ({ status: 0, text: String(e), errors: [] }));
        if (del.status > 0 && del.status < 400) {
          Logger.step(`[strayLookupNames] Deleted "${englishName}" (code "${item.code}") from ${listCode}`);
          continue;
        }
        const off = item.isActive ? await updateLookupItem(page, { ...item, isActive: false }).catch(() => ({ status: 0 })) : { status: 200 };
        testInfo.annotations.push({
          type: 'leftover',
          description: `lookup item "${englishName}" (code "${item.code}") in ${listCode} could not be deleted (${del.status}); ${off.status > 0 && off.status < 400 ? 'made inactive' : 'STILL ACTIVE - retire it by hand'}`,
        });
      }
    }
  },
});
