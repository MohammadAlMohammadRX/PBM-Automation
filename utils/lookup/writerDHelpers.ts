import type { Locator, Page } from '@playwright/test';
import { test as userRoleTest, expect } from '../user/userRole';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { SuiteLookupItems } from '../../fixtures/lookupModule.fixture';
import { BasePage } from '../../pages/BasePage';
import { LookupItemDrawer, LookupItemsPage, type ItemSaveOutcome } from '../../pages/lookup/LookupPages';
import { UserListPage } from '../../pages/user/UserListPage';
import { UserProfilePage } from '../../pages/user/UserProfilePage';
import type { UserDeactivateDrawer } from '../../pages/user/UserDeactivateDrawer';
import { setCheckbox } from '../../pages/components/PrimeControls';
import { fieldErrors } from '../../pages/user/userCommon';
import { AppRoutes } from '../../constants/AppRoutes';
import { DIALOG_ACTION } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { LOOKUP_ITEMS, LOOKUP_ITEM_DRAWER } from '../../constants/lookup/lookupIds';
import type { LanguageSwitcher } from '../../pages/components/LanguageSwitcher';
import { WRITER_D_IDS } from '../../constants/lookup/writerDIds';
import { Logger } from '../Logger';
import { arabicToken, userSearchKey, userStamp, type ProvisionedUser } from '../UserProvisioning';
import { LINK_RECORD_FIELD, type LookupItemLink } from './lookupInUse';
import { createLookupItem, lookupByCode, readLookupItems, updateLookupItem, type LookupAnswer, type LookupItem } from './lookupApi';

/**
 * Writer D helpers - Lookups Management folders 06 (Edit Lookup Item, US 20858)
 * and 09 (Populate Drop-downs From Lookup Lists, US 20861).
 *
 * `test` = the shared fixtures (lookup + user modules, `steps`) + the user
 * module's `userRole` / `requireShapeApplied` (suite sessions with exact
 * rights). `WriterDLookups` adds to the lead's LookupItemsPage / LookupItemDrawer
 * the readers these stories need (edit drawer values, tooltip, unsaved dialog,
 * an edit attempt, the Lookups screen's reachability). The consumer readers
 * open the forms that use a list and read what they offer. Nothing here asserts
 * a case's expectation: each case asserts what IT expects and its failure says
 * what the screen showed.
 */
export const test = userRoleTest;
export { expect };

export type Lang = 'en' | 'ar';

/** Whitespace collapsed, em / en dashes read as a hyphen (lead decision 2). */
export function normalise(text: string): string {
  return text.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

/** A quoted "Summary — Detail" as the screen joins summary and detail (whitespace), normalised. */
export function asShown(quote: string): string {
  return normalise(quote.replace(/\s+[–—]\s+/, ' '));
}

/** The parts of a quoted "Summary — Detail", normalised. */
export function quoteParts(quote: string): { summary: string; detail: string } {
  const [summary, ...rest] = quote.split(/\s+[–—]\s+/);
  return { summary: normalise(summary), detail: normalise(rest.join(' ')) };
}

/**
 * steps.blocked(reason) - unless an earlier step already FAILED: then the
 * finding must stay visible, so the case ends FAIL and the reason is kept as a
 * note (the settings module's rule, utils/settings/writerBHelpers.ts).
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = userRoleTest.info();
  if (info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `This step could not be observed either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/** BLOCKS (unless a step failed) when a suite item could not be created; `reason` + the server's answer. */
export function requireCreated(steps: TestSteps, made: { answer: LookupAnswer; item?: LookupItem }, reason: string): void {
  if (made.answer.status < 300 && made.item) return;
  blockUnlessAStepFailed(steps, `${reason}. CreateLookupItem answered ${made.answer.status}: ${made.answer.errors.join('; ') || made.answer.text.slice(0, 200)}`);
}

/** Names for a suite item that pass the drawer's letter rules: English "QA Automation <letters>", an Arabic phrase. */
export function suiteNames(): { englishName: string; arabicName: string } {
  const stamp = userStamp();
  return { englishName: `QA Automation ${stamp.charAt(0).toUpperCase()}${stamp.slice(1)}`, arabicName: `قيمة اختبار ${arabicToken()}` };
}

/** The label a form shows for an item: the interface language's name, the other name when it is empty (the bundle's rule). */
export function labelOf(item: Pick<LookupItem, 'englishName' | 'arabicName'>, lang: Lang): string {
  const en = (item.englishName ?? '').trim();
  const ar = (item.arabicName ?? '').trim();
  return normalise(lang === 'ar' ? ar || en : en || ar);
}

/** What a drop-down offered, compared with the list's ACTIVE items (display order, ties in any order). */
export interface OfferReport {
  /** Active items not offered. */
  missing: string[];
  /** Offered labels that are not active items of the list. */
  unexpected: string[];
  /** Labels offered more often than the list holds them. */
  duplicated: string[];
  /** Labels offered after one with a higher display order. */
  outOfOrder: string[];
}

export function offerReport(offered: readonly string[], items: readonly LookupItem[], lang: Lang): OfferReport {
  const shown = offered.map(normalise);
  const active = items.filter((i) => i.isActive);
  const expected = active.map((i) => labelOf(i, lang));
  const count = (list: string[], label: string): number => list.filter((l) => l === label).length;
  const missing = [...new Set(expected.filter((l) => !shown.includes(l)))];
  const unexpected = [...new Set(shown.filter((l) => !expected.includes(l)))];
  const duplicated = [...new Set(shown.filter((l) => expected.includes(l) && count(shown, l) > count(expected, l)))];
  const outOfOrder: string[] = [];
  let last = Number.NEGATIVE_INFINITY;
  let lastLabel = '';
  for (const label of shown) {
    const orders = active.filter((i) => labelOf(i, lang) === label).map((i) => i.index);
    if (orders.length === 0) continue;
    const order = Math.min(...orders);
    if (order < last) outOfOrder.push(`"${label}" (order ${order}) after "${lastLabel}" (order ${last})`);
    else {
      last = order;
      lastLabel = label;
    }
  }
  return { missing, unexpected, duplicated, outOfOrder };
}

export const CLEAN_OFFER: OfferReport = { missing: [], unexpected: [], duplicated: [], outOfOrder: [] };

/** The Edit drawer's controls. */
export interface DrawerValues {
  title: string;
  code: string;
  englishName: string;
  arabicName: string;
  order: string;
  isActive: boolean;
}

/** One Save in the item drawer, plus what the drawer showed afterwards. */
export interface SaveReport extends ItemSaveOutcome {
  /** Field errors (`lookup-item-form-drawer-*-error`) after the press. */
  errors: string[];
  /** The drawer's whole text after the press ('' when it closed). */
  drawerText: string;
}

/** What closing the drawer with its X produced. */
export interface CloseOutcome {
  dialogShown: boolean;
  dialogText: string;
  drawerOpen: boolean;
}

/** An edit attempt on an item (21169): the control, the save (if one could be made) and the stored item afterwards. */
export interface EditAttempt {
  editState: 'absent' | 'disabled' | 'available';
  save: SaveReport | null;
  stored: LookupItem | undefined;
  /** Edit unavailable, or the stored item unchanged after the attempt. */
  refused: boolean;
}

/** The lead's Lookup Items page + drawer, with Writer D's readers. Works on any page (admin or a suite session). */
export class WriterDLookups extends BasePage {
  readonly items: LookupItemsPage;
  readonly drawer: LookupItemDrawer;

  constructor(page: Page) {
    super(page);
    this.items = new LookupItemsPage(page);
    this.drawer = new LookupItemDrawer(page);
  }

  async openList(listCode: string): Promise<void> {
    await this.items.open(listCode);
  }

  /** Searches the items screen for the item's code (the lead's search awaits its own answer) and waits for its row. */
  async revealItem(listCode: string, item: Pick<LookupItem, 'id' | 'code'>): Promise<void> {
    const row = this.items.row(item.id);
    if (await row.isVisible().catch(() => false)) return;
    await this.items.search(item.code);
    await expect(row, `the row of ${item.code} in ${listCode}`).toBeVisible({ timeout: Timeouts.default });
  }

  /** Whether the item's row is on the screen after a search for its code (waits briefly). */
  async isItemListed(listCode: string, item: Pick<LookupItem, 'id' | 'code'>): Promise<boolean> {
    await this.items.search(item.code);
    Logger.step(`Looking for ${item.code} in ${listCode}`);
    return this.items.row(item.id).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** The row's cells as shown. */
  async rowCells(itemId: string): Promise<{ code: string; englishName: string; arabicName: string; order: string; status: string }> {
    const read = async (key: 'code' | 'englishName' | 'arabicName' | 'order' | 'status'): Promise<string> =>
      normalise(await this.items.cellOf(itemId, key).innerText().catch(() => ''));
    return { code: await read('code'), englishName: await read('englishName'), arabicName: await read('arabicName'), order: await read('order'), status: await read('status') };
  }

  /** The Edit control of a row: absent, disabled or available. */
  async editState(itemId: string): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.items.rowAction(itemId, 'edit');
    if (!(await button.isVisible().catch(() => false))) return 'absent';
    return (await button.isEnabled().catch(() => false)) ? 'available' : 'disabled';
  }

  /** Reveals the row and presses its Edit; waits for the drawer and its loaded values. */
  async openEdit(listCode: string, item: Pick<LookupItem, 'id' | 'code'>): Promise<void> {
    await this.revealItem(listCode, item);
    Logger.step(`Opening Edit on ${item.code}`);
    await this.items.rowAction(item.id, 'edit').click();
    await expect(this.drawer.field('title'), 'the Edit Lookup Item drawer').toBeVisible({ timeout: Timeouts.default });
    await expect(this.drawer.field('code'), 'the drawer loads the item').toHaveValue(item.code, { timeout: Timeouts.short }).catch(() => undefined);
  }

  async readDrawer(): Promise<DrawerValues> {
    return {
      title: normalise(await this.drawer.field('title').innerText().catch(() => '')),
      code: await this.drawer.field('code').inputValue(),
      englishName: await this.drawer.field('englishName').inputValue(),
      arabicName: await this.drawer.field('arabicName').inputValue(),
      order: await this.drawer.field('order').inputValue(),
      isActive: await this.drawer.field('isActive').isChecked(),
    };
  }

  async setActive(value: boolean): Promise<void> {
    await setCheckbox(this.drawer.field('isActive'), value);
  }

  /** Types into a name box and leaves it (Tab), so its checks run. */
  async typeAndLeave(field: 'code' | 'englishName' | 'arabicName', value: string): Promise<void> {
    await this.drawer.field(field).fill(value);
    await this.drawer.field(field).press('Tab');
  }

  async drawerErrors(): Promise<string[]> {
    return fieldErrors(this.page, `${LOOKUP_ITEM_DRAWER.drawer}-`);
  }

  async drawerText(): Promise<string> {
    return normalise(await this.byId(LOOKUP_ITEM_DRAWER.drawer).innerText().catch(() => ''));
  }

  /** Save, then what the drawer shows (errors, text). */
  async save(): Promise<SaveReport> {
    const outcome = await this.drawer.saveAndCapture();
    const errors = await this.drawerErrors();
    const drawerText = outcome.drawerOpen ? await this.drawerText() : '';
    return { ...outcome, errors, drawerText };
  }

  /** Every message the drawer / toast showed for a save, joined (for "a message ... appears"). */
  static messagesOf(save: SaveReport): string {
    return normalise([...save.errors, save.toast, save.drawerText].join(' | '));
  }

  /** Edit > clear Is Active > Save (the screen's way to retire a value). */
  async retireOnScreen(listCode: string, item: Pick<LookupItem, 'id' | 'code'>): Promise<SaveReport> {
    await this.openEdit(listCode, item);
    await this.setActive(false);
    return this.save();
  }

  // ---------------------------------------------------------------- unsaved changes

  /**
   * The unsaved-changes dialog: the screen's own host, or the shared `pbm-dialog`
   * carrying the leave choices (`pbm-dialog-action-stay` / `-discard`).
   */
  private unsavedDialog(): Locator {
    const host = this.byId(WRITER_D_IDS.unsavedHost).locator('[role="dialog"]').first();
    const shared = this.byId(WRITER_D_IDS.sharedDialog).filter({ has: this.page.locator(`#${DIALOG_ACTION.stay}, #${DIALOG_ACTION.discard}`) });
    return host.or(shared).first();
  }

  /** The drawer's X; reports the unsaved dialog (text) or whether the drawer closed. */
  async closeWithX(): Promise<CloseOutcome> {
    await this.drawer.field('close').click();
    const shown = await this.unsavedDialog().waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false);
    const dialogText = shown ? normalise(await this.unsavedDialog().innerText().catch(() => '')) : '';
    const drawerOpen = shown ? true : !(await this.drawer.field('title').waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false));
    Logger.step(`Drawer X: unsaved dialog ${shown ? `"${dialogText.slice(0, 120)}"` : 'NOT shown'}; drawer ${drawerOpen ? 'open' : 'closed'}`);
    return { dialogShown: shown, dialogText, drawerOpen };
  }

  /**
   * Keep Editing / Discard Changes: the shared dialog's id'd buttons, or - in the
   * host's own dialog, whose inner ids were never seen - its button with that label.
   */
  async chooseUnsaved(choice: 'keep' | 'discard', label: string): Promise<void> {
    const id = choice === 'keep' ? DIALOG_ACTION.stay : DIALOG_ACTION.discard;
    await this.btn(id)
      .or(this.byId(WRITER_D_IDS.unsavedHost).locator('button').filter({ hasText: label })) // locator-exception: the host dialog's buttons have no known ids; matched inside the id'd host by label
      .filter({ visible: true })
      .first()
      .click({ timeout: Timeouts.short });
  }

  /** Whether the unsaved dialog has gone (checked until `timeout`). */
  async unsavedDialogGone(timeout = 3_000): Promise<boolean> {
    return this.unsavedDialog().waitFor({ state: 'hidden', timeout }).then(() => true).catch(() => false);
  }

  /** Closes a dirty drawer without saving (X, then Discard when asked). */
  async discardDrawer(label: string): Promise<void> {
    const close = await this.closeWithX();
    if (close.dialogShown) await this.chooseUnsaved('discard', label);
    await this.drawer.field('title').waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  }

  // ---------------------------------------------------------------- tooltip, in use, reachability

  /**
   * The tooltip shown when pointing at `target` (a disabled button gets no mouse
   * events, so its parent is tried next); falls back to a `title` attribute.
   */
  async tooltipOf(target: Locator): Promise<string> {
    // locator-exception: PrimeNG renders the tooltip in an overlay at the end of <body> with no id
    const tip = this.page.locator('[role="tooltip"]').filter({ visible: true }).last();
    const spots: [Locator, { x: number; y: number } | undefined][] = [
      [target, undefined],
      [target.locator('xpath=..'), undefined],
      [target.locator('xpath=..'), { x: 1, y: 1 }],
    ];
    for (const [spot, position] of spots) {
      await spot.hover({ force: true, ...(position ? { position } : {}) }).catch(() => undefined);
      const shown = await tip.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
      if (shown) return normalise(await tip.innerText().catch(() => ''));
    }
    const title = (await target.getAttribute('title').catch(() => null)) ?? (await target.locator('xpath=..').getAttribute('title').catch(() => null));
    return normalise(title ?? '');
  }

  /** Tries to edit `item` (new English name, Save) and reads the stored item back. */
  async attemptEdit(listCode: string, item: LookupItem, englishName: string, discardLabel: string): Promise<EditAttempt> {
    await this.revealItem(listCode, item);
    const editState = await this.editState(item.id);
    let save: SaveReport | null = null;
    if (editState === 'available') {
      await this.items.rowAction(item.id, 'edit').click();
      if (await this.drawer.isOpen(Timeouts.default)) {
        await this.drawer.fill({ englishName });
        save = await this.save();
        if (save.drawerOpen) await this.discardDrawer(discardLabel);
      }
    }
    const stored = (await readLookupItems(this.page, listCode)).find((i) => i.id === item.id);
    const refused = editState !== 'available' || (stored !== undefined && stored.englishName === item.englishName);
    Logger.step(`Edit attempt on in-use ${item.code}: Edit ${editState}; save ${save ? `${save.status ?? 'no request'} "${save.toast}"` : 'not made'}; stored "${stored?.englishName}"`);
    return { editState, save, stored, refused };
  }

  /**
   * Opens a list's items screen directly (no assertion - a session may be denied)
   * and reports what it may do there: the screen shown, enabled Edit buttons on
   * the first page, and the Edit control of `item`.
   */
  async editReach(listCode: string, item: Pick<LookupItem, 'id' | 'code'>): Promise<{ listShown: boolean; enabledEdits: number; listed: boolean; editState: 'absent' | 'disabled' | 'available'; url: string }> {
    await this.goto(`${AppRoutes.lookupManagement}/${listCode}`).catch(() => undefined);
    const listShown = await this.byId(`${LOOKUP_ITEMS.screen}-table-el`).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
    const enabledEdits = listShown ? await this.page.locator(`[id^="${LOOKUP_ITEMS.screen}-table-row-"][id$="-edit"]:enabled`).filter({ visible: true }).count() : 0;
    const listed = listShown ? await this.isItemListed(listCode, item) : false;
    const editState = listed ? await this.editState(item.id) : 'absent';
    Logger.step(`Items screen of ${listCode}: ${listShown ? 'shown' : 'not shown'} (${this.page.url()}); enabled Edit buttons ${enabledEdits}; ${item.code} Edit ${editState}`);
    return { listShown, enabledEdits, listed, editState, url: this.page.url() };
  }

  /** Opens the Lookups screen and reports whether its register rendered (a session without the right should not see it). */
  async lookupsScreen(): Promise<{ registerShown: boolean; url: string }> {
    await this.goto(AppRoutes.lookupManagement).catch(() => undefined);
    const registerShown = await this.byId(WRITER_D_IDS.registerTable).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    return { registerShown, url: this.page.url() };
  }
}

// ---------------------------------------------------------------- the API side

/** The list's items now (inactive included). */
export async function itemsOf(page: Page, listCode: string): Promise<LookupItem[]> {
  return readLookupItems(page, listCode);
}

/** One item now, by id (undefined when gone). */
export async function storedItem(page: Page, listCode: string, id: string): Promise<LookupItem | undefined> {
  return (await readLookupItems(page, listCode)).find((i) => i.id === id);
}

/** The list's first predefined item (read-only use: hover its disabled Edit). */
export async function predefinedItem(page: Page, listCode: string): Promise<LookupItem> {
  const item = (await readLookupItems(page, listCode)).find((i) => i.predefined);
  if (!item) throw new Error(`no predefined item in ${listCode}`);
  return item;
}

/**
 * Creates a suite item through the API WITHOUT the fixture's "throw when refused"
 * (21211 / 21212 want the server's answer to decide BLOCKED). The list is
 * watched first, so the teardown deletes whatever was made.
 */
export async function createRawSuiteItem(
  page: Page,
  suiteLookupItems: SuiteLookupItems,
  listCode: string,
  spec: { englishName: string; arabicName: string; index?: number },
): Promise<{ answer: LookupAnswer; item?: LookupItem }> {
  await suiteLookupItems.watch(listCode);
  const list = await lookupByCode(page, listCode);
  const code = suiteLookupItems.newCode();
  const answer = await createLookupItem(page, { lookupId: list.id, code, englishName: spec.englishName, arabicName: spec.arabicName, index: spec.index ?? 0, isActive: true });
  const item = answer.status < 300 ? (await readLookupItems(page, listCode)).find((i) => i.code === code) : undefined;
  Logger.step(`[writerD] CreateLookupItem ${code} (en "${spec.englishName}", ar "${spec.arabicName}") -> ${answer.status}`);
  return { answer, item };
}

/**
 * A record holding a RETIRED suite value of `listCode` (21176). First the held
 * item is retired through the API; when the server refuses that (AC 20858: an
 * in-use value cannot be edited), a second record is given an item created
 * inactive - `linkLookupItem` BLOCKS the case when that is refused too.
 */
export async function heldRetiredValue(
  page: Page,
  suiteLookupItems: SuiteLookupItems,
  linkLookupItem: (listCode: string, item: LookupItem) => Promise<LookupItemLink>,
  listCode: string,
): Promise<{ item: LookupItem; link: LookupItemLink; how: string }> {
  const first = await suiteLookupItems.create(listCode, suiteNames());
  const firstLink = await linkLookupItem(listCode, first);
  const off = await updateLookupItem(page, { ...first, isActive: false });
  const retired = await storedItem(page, listCode, first.id);
  if (off.status < 300 && retired && !retired.isActive) return { item: retired, link: firstLink, how: `${firstLink.description}, then retired` };
  const refusal = `retiring the held item answered ${off.status}: ${off.errors.join('; ') || off.text.slice(0, 160)}`;
  Logger.warn(`[writerD] ${refusal} - giving a new record an item created inactive`);
  const second = await suiteLookupItems.create(listCode, { ...suiteNames(), isActive: false });
  const secondLink = await linkLookupItem(listCode, second);
  return { item: second, link: secondLink, how: `${secondLink.description} (created inactive: ${refusal})` };
}

// ---------------------------------------------------------------- the consuming forms

/**
 * Opens the Deactivate drawer of an ACTIVE suite user (Users Administration >
 * row Inactivate); `itemsStatus` = the answer of the list it loads on opening.
 * `navigate: false` reopens it on the list already on screen (no reload).
 */
export async function openReasonDrawer(page: Page, user: ProvisionedUser, listCode: string, navigate = true): Promise<{ drawer: UserDeactivateDrawer; itemsStatus: number | null }> {
  const users = new UserListPage(page);
  if (navigate) {
    await users.openTable();
    // By id, not by the English name: in Arabic the Name cell shows the Arabic name.
    await users.searchFor(userSearchKey(user.displayNameEn));
    await expect.poll(() => users.isRowShownById(user.id), { timeout: Timeouts.default, message: `the row of suite user ${user.displayNameEn} in Users Administration` }).toBe(true);
  }
  const answered = page.waitForResponse((r) => r.url().includes(`/api/Lookups/Items/${listCode}`), { timeout: Timeouts.default }).then((r) => r.status()).catch(() => null);
  const drawer = await users.openDeactivate(user.id);
  const itemsStatus = await answered;
  return { drawer, itemsStatus };
}

/** Reads the options of an OPEN Deactivate drawer and closes it with Cancel. */
export async function readOpenReasons(drawer: UserDeactivateDrawer): Promise<string[]> {
  const offered = (await drawer.getReasonOptions()).map(normalise);
  await drawer.cancel();
  return offered;
}

/** The reasons the Deactivate drawer offers for `user`, read and closed with Cancel (nobody is deactivated). */
export async function readReasonOffer(page: Page, user: ProvisionedUser, listCode: string): Promise<{ offered: string[]; itemsStatus: number | null }> {
  const { drawer, itemsStatus } = await openReasonDrawer(page, user, listCode);
  const offered = (await drawer.getReasonOptions()).map(normalise);
  await drawer.cancel();
  Logger.step(`Deactivate drawer (${listCode} -> ${itemsStatus}) offers: ${offered.join(' | ')}`);
  return { offered, itemsStatus };
}

/** The Gender options of a NEW user (Add User drawer), closed without saving. */
export async function readGenderOffer(page: Page): Promise<string[]> {
  const users = new UserListPage(page);
  await users.openTable();
  const form = await users.openAddForm();
  const offered = (await form.getOptions('gender')).map(normalise);
  const dialog = await form.close();
  if (dialog) await form.discardChanges();
  Logger.step(`Add User Gender offers: ${offered.join(' | ')}`);
  return offered;
}

/** Opens the record holding a linked value and reads the field that shows it ('' when the profile has no such field). */
export async function readHeldValue(page: Page, link: LookupItemLink, listCode: string): Promise<string> {
  await link.openRecord();
  const field = LINK_RECORD_FIELD[listCode];
  if (!field) return '';
  return normalise((await new UserProfilePage(page).readSection(field.section))[field.label] ?? '');
}

/** The suite user's profile field (e.g. Personal Information > Gender) as shown now. */
export async function readProfileField(page: Page, userId: string, section: 'personal' | 'contact', label: string): Promise<string> {
  const profile = new UserProfilePage(page);
  await profile.open(userId);
  return normalise((await profile.readSection(section))[label] ?? '');
}

/**
 * 21216: switches the language `switches` times (Arabic, English, Arabic ...),
 * reopening the Deactivate drawer after each switch and comparing what it offers
 * with the list in THAT language; the user's profile is opened once in Arabic
 * (the "previously opened record" rechecked later in English).
 */
export async function switchAndRead(
  page: Page,
  languageSwitcher: LanguageSwitcher,
  user: ProvisionedUser,
  listCode: string,
  items: readonly LookupItem[],
  switches: number,
): Promise<{ lang: Lang; offered: string[]; report: OfferReport }[]> {
  const reads: { lang: Lang; offered: string[]; report: OfferReport }[] = [];
  for (let i = 0; i < switches; i += 1) {
    const lang: Lang = i % 2 === 0 ? 'ar' : 'en';
    await languageSwitcher.switchTo(lang);
    const { offered } = await readReasonOffer(page, user, listCode);
    reads.push({ lang, offered, report: offerReport(offered, items, lang) });
    if (i === 0) await new UserProfilePage(page).open(user.id);
  }
  return reads;
}

/** A second tab of the same (admin) session - "a form open elsewhere" (21213). */
export async function openSecondTab(page: Page): Promise<Page> {
  return page.context().newPage();
}
