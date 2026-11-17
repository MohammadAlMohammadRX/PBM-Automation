import { test as base } from '@playwright/test';
import type { Locator, Page, Request } from '@playwright/test';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import type { LanguageSwitcher } from '../../pages/components/LanguageSwitcher';
import type { DefinitionDrawer } from '../../pages/notification/Drawers';
import type { DefinitionsTab } from '../../pages/notification/NotificationCenterPage';
import type { SuiteDefinitions } from '../../fixtures/notificationModule.fixture';
import { NC_DIALOG, NC_FORM, NC_LIST, NC_ROUTE } from '../../constants/notification/notificationIds';
import { DEF_DRAWER_PART, DEF_WRITE_API } from '../../constants/notification/writerCIds';
import { TOAST, buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../Logger';
import { NetworkUtils } from '../NetworkUtils';
import type { JobClock } from '../JobClock';
import { provisionNetwork, waitForNetworkStatusCode, type NetworkSpec, type ProvisionedNetwork } from '../NetworkProvisioning';
import {
  LIFECYCLE_JOB,
  NC_API,
  actionVariablesNc,
  audienceCandidates as audienceCandidatesOf,
  myNotifications,
  ncOptions,
  ncStamp,
  payloadOf,
  readDefinition,
  type DefinitionVariable,
  type InboxNotification,
  type NcOptions,
} from './notificationApi';

/**
 * Writer C helpers - App Notification (definitions) folders 15 Search/Filter,
 * 16 Create, 17 Edit, 18 Activate/Deactivate and 19 Delete (US 20999-21003).
 * Readers and small actions on top of the lead's DefinitionsTab /
 * DefinitionDrawer; nothing here asserts - each returns what the screen or the
 * server showed, so the spec asserts what ITS case expects.
 *
 * SAFETY: every write goes to a suite definition ("QA Automation Notification
 * ...") made through `suiteDefinitions` (or saved through the drawer after
 * `suiteDefinitions.watch()`), so the fixture deletes it at teardown.
 */

const DRAWER = 'definitions' as const;

/** Whitespace collapsed and every dash normalised to "-" (lead decision 3). */
export function normText(text: string): string {
  return text.replace(/[‒–—―−]/g, '-').replace(/\s+/g, ' ').trim();
}

/** True when any of `texts` contains `expected` (both normalised). */
export function anyContains(texts: readonly string[], expected: string): boolean {
  return texts.some((t) => normText(t).includes(normText(expected)));
}

// ---------------------------------------------------------------- blocking

/**
 * Runs a precondition the case cannot do without; when it cannot be made the
 * case is BLOCKED (before anything was observed) with the reason.
 */
export async function orBlock<T>(precondition: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    return blockedByPrecondition(base.info(), precondition, error);
  }
}

/**
 * The same INSIDE a step: when an earlier step already FAILED the error is
 * re-thrown (the finding stays a FAIL - lead decision 8); otherwise BLOCKED.
 */
export async function orBlockInStep<T>(steps: TestSteps, precondition: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (base.info().errors.length > 0) throw error;
    return steps.blocked(`${precondition} could not be made: ${String(error instanceof Error ? error.message : error).split('\n')[0]}`);
  }
}

// ---------------------------------------------------------------- options / messages

let optionsCache: NcOptions | null = null;

/** GetOptions (cached per worker - seed GUIDs never change). */
export async function definitionOptions(page: Page): Promise<NcOptions> {
  if (!optionsCache) optionsCache = await ncOptions(page);
  return optionsCache;
}

/** The label of a module or action id in the UI language. */
export async function labelOf(page: Page, id: string, lang: 'en' | 'ar' = 'en'): Promise<string> {
  const o = await definitionOptions(page);
  const hit = [...o.modules, ...o.actions].find((x) => x.id === id);
  if (!hit) throw new Error(`GetOptions has no module / action ${id}`);
  return lang === 'ar' ? hit.arabicName : hit.englishName;
}

/** The action labels GetOptions files under a module. */
export async function actionLabelsOf(page: Page, moduleId: string, lang: 'en' | 'ar' = 'en'): Promise<string[]> {
  const o = await definitionOptions(page);
  return o.actions.filter((a) => a.parentItemId === moduleId).map((a) => (lang === 'ar' ? a.arabicName : a.englishName));
}

export interface DefinitionMessages {
  english: string;
  arabic: string;
  variables: DefinitionVariable[];
}

/**
 * Valid messages for an action: English letters + every REQUIRED variable of
 * the action (every variable with `allVariables`), and Arabic letters + the same variables. `marker` (English
 * letters / digits only) makes the English text unique to the case.
 */
export async function messagesFor(page: Page, actionId: string, marker: string, allVariables = false): Promise<DefinitionMessages> {
  const variables = await actionVariablesNc(page, actionId);
  const vars = variables.filter((v) => allVariables || v.isRequired).map((v) => `{{${v.name}}}`).join(' ');
  return {
    english: `QA automation ${marker} ${vars}`.trim(),
    arabic: `إشعار اختبار آلي ${vars}`.trim(),
    variables,
  };
}

/** A message with every `{{Variable}}` replaced by the action's sample value (what Preview shows). */
export function withSamples(template: string, variables: readonly DefinitionVariable[]): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, name: string) => variables.find((v) => v.name === name)?.sampleValue ?? all);
}

// ---------------------------------------------------------------- definitions (API)

export interface DefinitionRow {
  id: string;
  name: string;
  moduleNameEn: string;
  moduleActionEn: string;
  isActive: boolean;
  audienceCount: number;
}

export interface DefinitionAudience {
  audienceTypeId: string;
  referenceId: string;
  referenceName: string;
}

export interface DefinitionRecord {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  englishMessageTemplate: string;
  arabicMessageTemplate: string;
  notesTemplate: string | null;
  moduleNameId: string;
  moduleActionId: string;
  concurrencyStamp: string;
  audiences: DefinitionAudience[];
}

/** POST GetDefinitions with the list's own criteria (searchText / name / modulenameid ... keys as the screen sends). */
export async function definitionsBy(page: Page, criteria: Record<string, unknown> = {}, rows = 200): Promise<{ status: number; items: DefinitionRow[]; totalRows: number }> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', NC_API.definitions, { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', ...criteria });
  const p = payloadOf<{ items?: DefinitionRow[]; totalRows?: number }>(res);
  return { status: res.status, items: p?.items ?? [], totalRows: p?.totalRows ?? 0 };
}

/** GetDefinition, typed (null when it is gone). */
export async function definitionRecord(page: Page, id: string): Promise<DefinitionRecord | null> {
  return (await readDefinition(page, id)) as DefinitionRecord | null;
}

/** The ids in a list answer's items. */
export function idsOf(items: readonly Record<string, unknown>[] | readonly DefinitionRow[]): string[] {
  return items.map((i) => String((i as Record<string, unknown>).id));
}

// ---------------------------------------------------------------- list screen

/** The header texts by column key (`nc-definitions-table-th-<key>`). */
export async function headerTexts(page: Page): Promise<Record<string, string>> {
  const prefix = NC_LIST.th(DRAWER, '');
  return page.locator(`[id^="${prefix}"]`).evaluateAll((els, p) => {
    const out: Record<string, string> = {};
    for (const e of els) out[e.id.slice(p.length)] = (e.textContent ?? '').replace(/\s+/g, ' ').trim();
    return out;
  }, prefix);
}

/** Every row of every page as `{ id, name, active }` (pager Next until disabled); the pager is left on the last page. */
export async function readAllPages(tab: DefinitionsTab, page: Page, maxPages = 20): Promise<{ id: string; name: string; active: string; pageNo: number }[]> {
  const out: { id: string; name: string; active: string; pageNo: number }[] = [];
  for (let n = 1; n <= maxPages; n += 1) {
    for (const r of await tab.readRows(['name', 'active'])) out.push({ id: r.id, name: r.name, active: r.active, pageNo: n });
    const next = page.locator(`#${NC_LIST.pagerNext(DRAWER)}`);
    const canGo = (await next.isVisible().catch(() => false)) && (await next.isEnabled().catch(() => false));
    if (!canGo) break;
    await tab.nextPage();
  }
  return out;
}

/** Whether the pager offers a page button `n`. */
export async function hasPagerPage(page: Page, n: number): Promise<boolean> {
  return page.locator(`#${NC_LIST.pagerPage(DRAWER, n)}`).isVisible().catch(() => false);
}

// ---------------------------------------------------------------- toasts

/** The texts of every toast on screen now (summary + detail, normalised). */
export async function toastTexts(page: Page): Promise<string[]> {
  return (await page.locator(`#${TOAST.root}`).allInnerTexts().catch(() => [] as string[])).map(normText).filter(Boolean);
}

/** Waits up to `timeout` for a toast containing `expected`; answers every toast text seen meanwhile. */
export async function waitForToast(page: Page, expected: string, timeout: number = Timeouts.toast): Promise<{ seen: boolean; texts: string[] }> {
  const all = new Set<string>();
  const end = Date.now() + timeout;
  for (;;) {
    for (const t of await toastTexts(page)) all.add(t);
    if (anyContains([...all], expected)) return { seen: true, texts: [...all] };
    if (Date.now() > end) return { seen: false, texts: [...all] };
    await page.waitForTimeout(250);
  }
}

// ---------------------------------------------------------------- drawer reading

export type DrawerStep = 'general' | 'content' | 'audiences' | 'variables' | 'closed';

/** Which step the drawer shows, read from the fields on screen. */
export async function currentStep(drawer: DefinitionDrawer): Promise<DrawerStep> {
  if (!(await drawer.isOpen(300))) return 'closed';
  if (await drawer.byPart(DEF_DRAWER_PART.name).isVisible().catch(() => false)) return 'general';
  if (await drawer.byPart(DEF_DRAWER_PART.english).isVisible().catch(() => false)) return 'content';
  if (await drawer.byPart(DEF_DRAWER_PART.addAudience).isVisible().catch(() => false)) return 'audiences';
  if (await drawer.byPart(DEF_DRAWER_PART.save).isVisible().catch(() => false)) return 'audiences';
  return 'variables';
}

export interface GeneralShown {
  name: string;
  module: string;
  action: string;
  description: string;
  active: boolean;
}

/** What the General step shows. */
export async function generalShown(drawer: DefinitionDrawer): Promise<GeneralShown> {
  return {
    name: await drawer.byPart(DEF_DRAWER_PART.name).inputValue(),
    module: normText(await drawer.selected(DEF_DRAWER_PART.module)),
    action: normText(await drawer.selected(DEF_DRAWER_PART.action)),
    description: await drawer.byPart(DEF_DRAWER_PART.description).inputValue(),
    active: await drawer.el('isActive').locator('xpath=descendant-or-self::input').first().isChecked(),
  };
}

/** What the Content step shows. */
export async function contentShown(drawer: DefinitionDrawer): Promise<{ english: string; arabic: string; notes: string }> {
  return {
    english: await drawer.byPart(DEF_DRAWER_PART.english).inputValue(),
    arabic: await drawer.byPart(DEF_DRAWER_PART.arabic).inputValue(),
    notes: await drawer.byPart(DEF_DRAWER_PART.notes).inputValue(),
  };
}

/** Visible inline errors in the drawer as `{ <id suffix>: text }` (e.g. `action-error`, `english-message-error`). */
export async function visibleErrors(page: Page): Promise<Record<string, string>> {
  const prefix = NC_FORM.id(DRAWER, '');
  const out = await page.locator(`[id^="${prefix}"][id$="${DEF_DRAWER_PART.errorSuffix}"]`).evaluateAll((els, p) => {
    const found: Record<string, string> = {};
    for (const e of els) if ((e as HTMLElement).offsetParent !== null) found[e.id.slice(p.length)] = (e.textContent ?? '').replace(/\s+/g, ' ').trim();
    return found;
  }, prefix);
  // The General step's "This field is required." lines carry NO id (smoke 2 / 21578: shown under Name, read as
  // nothing) - read them inside each field's own wrapper, keyed by the field.
  const general: Array<[string, string]> = [['name', DEF_DRAWER_PART.name], ['module', DEF_DRAWER_PART.module], ['action', DEF_DRAWER_PART.action]];
  for (const [key, part] of general) {
    if (Object.keys(out).some((k) => k.startsWith(key))) continue;
    const host = page.locator(`#${NC_FORM.id(DRAWER, part)}`);
    if (!(await host.isVisible().catch(() => false))) continue;
    // The nearest wrapper holding a <small> - but only while it wraps THIS field alone (never another field's message).
    const text = await host.evaluate((el) => {
      let a = el.parentElement;
      while (a && !a.querySelector('small')) a = a.parentElement;
      if (!a) return '';
      const others = Array.from(a.querySelectorAll('[id$="-input"], [id$="-select"]')).filter((o) => o !== el && !el.contains(o) && !o.contains(el));
      if (others.length > 0) return '';
      const small = Array.from(a.querySelectorAll('small')).map((s) => (s as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).find(Boolean);
      return small ?? '';
    }).catch(() => '');
    if (text) out[`${key}-error`] = text;
  }
  return out;
}

/** The error text of the field whose error id contains `field` ('' when none is visible). */
export function errorOf(errors: Record<string, string>, field: string): string {
  return Object.entries(errors).find(([k]) => k.startsWith(field))?.[1] ?? '';
}

/** Number of audience cards on the Audiences step. */
export async function audienceCardCount(page: Page): Promise<number> {
  const prefix = NC_FORM.id(DRAWER, DEF_DRAWER_PART.audiencePrefix);
  return page.locator(`[id^="${prefix}"][id$="${DEF_DRAWER_PART.audienceTypeSuffix}"]`).count();
}

/** Each card's text (type + assigned names / "None assigned yet."). */
export async function audienceSummary(page: Page, drawer: DefinitionDrawer): Promise<string[]> {
  const out: string[] = [];
  const n = await audienceCardCount(page);
  for (let i = 0; i < n; i += 1) out.push(await drawer.audienceCardText(i));
  return out;
}

/** Removes every audience card (last first); answers how many were removed. */
export async function removeAllAudiences(page: Page, drawer: DefinitionDrawer): Promise<number> {
  let removed = 0;
  for (let n = await audienceCardCount(page); n > 0; n = await audienceCardCount(page)) {
    await drawer.audienceCard(n - 1, 'remove-button').click();
    await page.waitForFunction(
      ({ prefix, suffix, before }) => document.querySelectorAll(`[id^="${prefix}"][id$="${suffix}"]`).length < before,
      { prefix: NC_FORM.id(DRAWER, DEF_DRAWER_PART.audiencePrefix), suffix: DEF_DRAWER_PART.audienceTypeSuffix, before: n },
      { timeout: Timeouts.default },
    );
    removed += 1;
  }
  return removed;
}

/** Adds a card of `type` and assigns `names` through the Assign window; answers the card index. */
export async function addAudienceWith(drawer: DefinitionDrawer, type: 'Users' | 'Roles', names: readonly string[]): Promise<number> {
  const idx = await drawer.addAudience(type);
  await drawer.assign(idx, names);
  return idx;
}

// ---------------------------------------------------------------- drawer flows

/** Opens a row's Edit and waits until the General step shows the record's name. */
export async function openEdit(page: Page, tab: DefinitionsTab, drawer: DefinitionDrawer, id: string, name: string): Promise<GeneralShown> {
  await tab.rowAction(id, 'edit').click();
  await drawer.waitForOpen();
  await drawer.byPart(DEF_DRAWER_PART.name).waitFor({ state: 'visible', timeout: Timeouts.default });
  const end = Date.now() + Timeouts.default;
  while (Date.now() < end && (await drawer.byPart(DEF_DRAWER_PART.name).inputValue()) !== name) await page.waitForTimeout(200);
  return generalShown(drawer);
}

/** Next until the drawer shows `step` (or Next stops moving it); answers the step reached and the toasts seen. */
export async function forwardTo(page: Page, drawer: DefinitionDrawer, step: 'content' | 'audiences'): Promise<{ reached: DrawerStep; toasts: string[] }> {
  const toasts: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const now = await currentStep(drawer);
    if (now === step) return { reached: now, toasts };
    await nextButton(page).click();
    await page.waitForTimeout(400);
    toasts.push(...(await toastTexts(page)));
    if ((await currentStep(drawer)) === now) return { reached: now, toasts };
  }
  return { reached: await currentStep(drawer), toasts };
}

/** Back until General. */
export async function backToGeneral(page: Page, drawer: DefinitionDrawer): Promise<DrawerStep> {
  for (let i = 0; i < 3 && (await currentStep(drawer)) !== 'general'; i += 1) {
    await drawer.back();
    await page.waitForTimeout(300);
  }
  return currentStep(drawer);
}

export interface SaveAttempt {
  /** Whether a Save button was reached and clicked. */
  clickedSave: boolean;
  /** The step the attempt started on / ended on. */
  from: DrawerStep;
  to: DrawerStep;
  /** Create/UpdateDefinition status, null when nothing left the browser. */
  status: number | null;
  sent: Record<string, unknown> | null;
  answer: string;
  toasts: string[];
  errors: Record<string, string>;
  drawerOpen: boolean;
}

/**
 * "Click Save" from wherever the drawer is: Save is only rendered on the
 * Audiences step (probe b32-b39), so the attempt clicks Save when shown,
 * otherwise (with `jump`) tries the stepper's step-3 bullet, otherwise walks
 * Next (the General / Content gate) - and reports what the app answered.
 * `revisit` walks back to General after the attempt and adds the errors shown
 * there (a General error raised by a Save on step 3).
 */
export async function saveFromHere(page: Page, drawer: DefinitionDrawer, opts: { jump?: boolean; revisit?: boolean } = {}): Promise<SaveAttempt> {
  const from = await currentStep(drawer);
  const saveButton = drawer.byPart(DEF_DRAWER_PART.save);
  const collected = new Set<string>();
  const grab = async (): Promise<void> => {
    for (const t of await toastTexts(page)) collected.add(t);
  };
  if (opts.jump && !(await saveButton.isVisible().catch(() => false))) {
    await drawer.stepBullet(3).click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await grab();
  }
  if (!(await saveButton.isVisible().catch(() => false))) {
    for (let i = 0; i < 2 && !(await saveButton.isVisible().catch(() => false)); i += 1) {
      const before = await currentStep(drawer);
      await nextButton(page).click();
      await page.waitForTimeout(500);
      await grab();
      if ((await currentStep(drawer)) === before) break;
    }
  }
  let status: number | null = null;
  let sent: Record<string, unknown> | null = null;
  let answer = '';
  const clickedSave = await saveButton.isVisible().catch(() => false);
  if (clickedSave) {
    const outcome = await drawer.save();
    status = outcome.status;
    sent = outcome.sent;
    answer = outcome.answer;
    if (outcome.toast) collected.add(normText(outcome.toast));
  }
  await page.waitForTimeout(300);
  await grab();
  const to = await currentStep(drawer);
  const errors = await visibleErrors(page);
  // After an accepted save the drawer animates out: its X is still visible for a moment (full run
  // 21314 / 21335 read "drawer open true" 300 ms after the 200 although the screenshot showed it
  // closed) - so wait for it to go; a refused attempt keeps the short "is it still there" read.
  const accepted = status !== null && status < 300;
  const drawerOpen = accepted
    ? !(await drawer.el('close').waitFor({ state: 'hidden', timeout: Timeouts.default }).then(() => true).catch(() => false))
    : await drawer.isOpen(500);
  if (opts.revisit && drawerOpen && to !== 'general') {
    await moveToStep(page, drawer, 'general');
    Object.assign(errors, await visibleErrors(page));
  }
  return { clickedSave, from, to, status, sent, answer, toasts: [...collected], errors, drawerOpen };
}

/** The drawer's Next button (a p-button host - the inner button is clicked). */
function nextButton(page: Page): Locator {
  return page.locator(buttonSelector(NC_FORM.id(DRAWER, DEF_DRAWER_PART.next)));
}

/** Short text of an attempt, for failure messages. */
export function describeAttempt(a: SaveAttempt): string {
  return `save clicked ${a.clickedSave}, ${a.from} -> ${a.to}, request ${a.status ?? 'none'} ${a.answer.slice(0, 200)}; toasts [${a.toasts.join(' | ')}]; field errors ${JSON.stringify(a.errors)}; drawer open ${a.drawerOpen}`;
}

/** Variable names the right-click "Insert variable" menu offers on the English message (the menu is closed again by clicking Notes). */
export async function insertMenuVariables(drawer: DefinitionDrawer): Promise<string[]> {
  const names = await drawer.insertVariableMenu(drawer.byPart(DEF_DRAWER_PART.english));
  await drawer.byPart(DEF_DRAWER_PART.notes).click();
  return names;
}

// ---------------------------------------------------------------- Assign window (picklist)

export interface AudienceCandidateRef {
  id: string;
  name: string;
  /** Other names the Assign window may list it under (e.g. the Arabic name in the Arabic UI). */
  altNames?: string[];
}

/** Opens a card's Assign window. */
export async function openAssign(drawer: DefinitionDrawer, idx: number): Promise<void> {
  await drawer.audienceCard(idx, 'assign-button').click();
  await drawer.picklist('source-list').waitFor({ state: 'visible', timeout: Timeouts.default });
}

/** Moves one candidate (by id) from Available to Selected. */
export async function moveToSelected(drawer: DefinitionDrawer, who: AudienceCandidateRef): Promise<void> {
  const item = drawer.byPart(`${DEF_DRAWER_PART.sourceItemPrefix}${who.id}`);
  // Search only when the item is not rendered. The list shows display names in the UI language, so
  // the English name finds nothing in the Arabic UI (rerun1 21335 step 3) - each known name is tried.
  if ((await item.count()) === 0) {
    for (const term of [who.name, ...(who.altNames ?? [])]) {
      await drawer.picklist('source-search-input').fill(term);
      if (await item.waitFor({ state: 'attached', timeout: 3_000 }).then(() => true).catch(() => false)) break;
    }
  }
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await drawer.picklist('move-selected-to-target').click();
  await drawer.byPart(`${DEF_DRAWER_PART.targetItemPrefix}${who.id}`).waitFor({ state: 'visible', timeout: Timeouts.default });
  await drawer.picklist('source-search-input').fill('');
}

/** Where each candidate sits in the open Assign window. */
export async function pickState(drawer: DefinitionDrawer, who: readonly AudienceCandidateRef[]): Promise<{ name: string; available: boolean; selected: boolean }[]> {
  const out: { name: string; available: boolean; selected: boolean }[] = [];
  for (const w of who) {
    out.push({
      name: w.name,
      available: (await drawer.byPart(`${DEF_DRAWER_PART.sourceItemPrefix}${w.id}`).count()) > 0,
      selected: await drawer.byPart(`${DEF_DRAWER_PART.targetItemPrefix}${w.id}`).isVisible().catch(() => false),
    });
  }
  return out;
}

/** Saves the Assign window. */
export async function saveAssign(page: Page, drawer: DefinitionDrawer): Promise<void> {
  await page.locator(buttonSelector(NC_FORM.id(DRAWER, 'assign-save-button'))).click();
  await drawer.picklist('source-list').waitFor({ state: 'hidden', timeout: Timeouts.default });
}

// ---------------------------------------------------------------- row actions + dialogs

export interface ControlState {
  present: boolean;
  enabled: boolean;
}

/** Whether a row action is rendered and enabled. */
export async function rowActionState(tab: DefinitionsTab, id: string, action: 'edit' | 'toggle-active' | 'delete'): Promise<ControlState> {
  const l: Locator = tab.rowAction(id, action);
  const present = await l.isVisible().catch(() => false);
  const enabled = present && (await l.isEnabled().catch(() => false)) && (await l.getAttribute('aria-disabled').catch(() => null)) !== 'true';
  return { present, enabled };
}

/** Clicks a row action and reads the confirmation dialog when one appears (null when none did within ~2.5 s). */
export async function clickRowAction(tab: DefinitionsTab, id: string, action: 'toggle-active' | 'delete'): Promise<{ title: string; message: string } | null> {
  await tab.rowAction(id, action).click();
  const shown = await tab.dialog('title').waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
  return shown ? tab.dialogText() : null;
}

/** The dialog's Confirm (`confirm`) / Cancel (`cancel`) buttons as shown, with their labels. */
export async function dialogButtons(page: Page, tab: DefinitionsTab): Promise<{ confirm: boolean; cancel: boolean; labels: string[] }> {
  const confirm = await tab.dialogAction('confirm').isVisible().catch(() => false);
  const cancel = await tab.dialogAction('cancel').isVisible().catch(() => false);
  const labels = (await page.locator(`#${NC_DIALOG.actions}`).innerText().catch(() => '')).split('\n').map((s) => s.trim()).filter(Boolean);
  return { confirm, cancel, labels };
}

/** Whether the row-action confirmation dialog is on screen now. */
export async function dialogOpen(tab: DefinitionsTab): Promise<boolean> {
  return tab.dialog('title').isVisible().catch(() => false);
}

/**
 * Answers the open dialog (Yes / No) and, on Yes, waits for the write `apiFragment`.
 * When NO dialog is on screen (e.g. a Delete that deleted at once) nothing is clicked:
 * `open` is false, `dialogGone` false (there was no dialog to close) and `status` null.
 */
export async function answerDialog(page: Page, tab: DefinitionsTab, confirm: boolean, apiFragment: string): Promise<{ open: boolean; status: number | null; answer: string; dialogGone: boolean }> {
  if (!(await tab.dialog('title').waitFor({ state: 'visible', timeout: 1_000 }).then(() => true).catch(() => false))) {
    return { open: false, status: null, answer: 'no confirmation dialog was on screen to answer', dialogGone: false };
  }
  const write = confirm
    ? page.waitForResponse((r) => r.url().includes(apiFragment) && r.request().method() !== 'GET', { timeout: Timeouts.default }).catch(() => null)
    : Promise.resolve(null);
  await tab.dialogAction(confirm ? 'confirm' : 'cancel').click();
  const r = await write;
  const dialogGone = await tab.dialog('title').waitFor({ state: 'hidden', timeout: Timeouts.default }).then(() => true).catch(() => false);
  await tab.waitForRowsToSettle();
  return { open: true, status: r?.status() ?? null, answer: (await r?.text().catch(() => '')) ?? '', dialogGone };
}

/** What a row's Delete click did: the dialog it showed, the DeleteDefinition it sent at once (no dialog), whether the record survives. */
export interface DeleteClick {
  dialog: { title: string; message: string } | null;
  /** DeleteDefinition status sent by the click itself (null when a dialog came first or nothing was sent). */
  sentAtOnce: number | null;
  /** GetDefinition still finds the record right after the click. */
  stored: boolean;
}

/** Clicks Delete on a row and reports what happened (asserts nothing). */
export async function clickDelete(page: Page, tab: DefinitionsTab, id: string): Promise<DeleteClick> {
  const seen: number[] = [];
  const onResponse = (r: { url: () => string; status: () => number; request: () => Request }): void => {
    if (r.url().includes(DEF_WRITE_API.delete) && r.request().method() !== 'GET') seen.push(r.status());
  };
  page.on('response', onResponse);
  let dialog: { title: string; message: string } | null = null;
  try {
    dialog = await clickRowAction(tab, id, 'delete');
    if (!dialog) await page.waitForTimeout(1_000);
  } finally {
    page.off('response', onResponse);
  }
  return { dialog, sentAtOnce: dialog ? null : (seen[0] ?? null), stored: (await definitionRecord(page, id)) !== null };
}

/** One line for failure messages: what the Delete click showed and did. */
export function describeDeleteClick(c: DeleteClick): string {
  if (c.dialog) return `a confirmation dialog appeared ("${c.dialog.title}" - "${c.dialog.message}")`;
  const sent = c.sentAtOnce !== null ? `sent DeleteDefinition at once (answer ${c.sentAtOnce})` : 'sent no DeleteDefinition that was seen';
  return `NO confirmation dialog appeared - the Delete click itself ${sent}; the notification is ${c.stored ? 'still stored' : 'ALREADY deleted'}`;
}

/** Counts the write requests matching `apiFragment` that `act` causes (settles 2 s after the first answer). */
export async function countWrites(page: Page, apiFragment: string, act: () => Promise<void>): Promise<{ bodies: string[]; statuses: number[] }> {
  const bodies: string[] = [];
  const statuses: number[] = [];
  const onRequest = (r: Request): void => {
    if (r.url().includes(apiFragment) && r.method() !== 'GET') bodies.push(r.postData() ?? '');
  };
  const onResponse = (r: { url: () => string; status: () => number; request: () => Request }): void => {
    if (r.url().includes(apiFragment) && r.request().method() !== 'GET') statuses.push(r.status());
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  try {
    const first = page.waitForResponse((r) => r.url().includes(apiFragment) && r.request().method() !== 'GET', { timeout: Timeouts.default }).catch(() => null);
    await act();
    await first;
    await page.waitForTimeout(2_000);
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
  }
  return { bodies, statuses };
}

/** A double-click on a dialog / drawer button by id (both clicks reach it unless the app disables it). */
export async function doubleClick(l: Locator): Promise<void> {
  await l.dblclick({ delay: 40 });
}

// ---------------------------------------------------------------- permission cases

/**
 * As a user who may lack the right: whether Edit is offered and whether
 * clicking it (when offered and enabled) opens the drawer.
 */
export async function tryEditAs(tab: DefinitionsTab, drawer: DefinitionDrawer, id: string): Promise<ControlState & { opened: boolean }> {
  const state = await rowActionState(tab, id, 'edit');
  if (!state.present || !state.enabled) return { ...state, opened: false };
  await tab.rowAction(id, 'edit').click();
  const opened = await drawer.isOpen(3_000);
  if (opened) await drawer.close('discard');
  return { ...state, opened };
}

/** As a user who may lack the right: whether a write action is offered and what clicking it (and confirming) did. */
export async function tryWriteAs(page: Page, tab: DefinitionsTab, id: string, action: 'toggle-active' | 'delete', apiFragment: string): Promise<ControlState & { dialog: string; status: number | null }> {
  const state = await rowActionState(tab, id, action);
  if (!state.present || !state.enabled) return { ...state, dialog: '', status: null };
  const dialog = await clickRowAction(tab, id, action);
  if (!dialog) return { ...state, dialog: '', status: null };
  const answered = await answerDialog(page, tab, true, apiFragment);
  return { ...state, dialog: dialog.message, status: answered.status };
}

/** Sends a definition write AS the page's user (the server's own answer to a user without the right). */
export async function writeAs(page: Page, method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<{ status: number; text: string }> {
  const res = await NetworkUtils.requestAsSession(page, method, path, body);
  return { status: res.status, text: res.text.slice(0, 300) };
}

// ---------------------------------------------------------------- navigation away

/**
 * Leaves the Notification Center with the browser Back button while the
 * drawer is dirty. A browser `beforeunload` prompt or the app's own "Unsaved
 * Changes" dialog counts as a warning (answered with leave / Discard).
 */
export async function leaveWithBack(page: Page): Promise<{ left: boolean; warned: boolean; url: string }> {
  let warned = false;
  const onDialog = (d: { accept: () => Promise<void> }): void => {
    warned = true;
    void d.accept().catch(() => undefined);
  };
  page.on('dialog', onDialog);
  try {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: Timeouts.default }).catch(() => null);
    const appDialog = await page.locator(`#${NC_DIALOG.title}`).waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
    if (appDialog) {
      warned = true;
      await page.locator(`#${NC_DIALOG.action('discard')}`).click();
      await page.waitForTimeout(800);
      if (page.url().includes(NC_ROUTE)) await page.goBack({ waitUntil: 'domcontentloaded', timeout: Timeouts.default }).catch(() => null);
    }
    await page.waitForTimeout(500);
  } finally {
    page.off('dialog', onDialog);
  }
  return { left: !page.url().includes(NC_ROUTE), warned, url: page.url() };
}

// ---------------------------------------------------------------- language

/** Runs `run` with the page's UI in Arabic, switching back to English after (even on error). */
export async function inArabic<T>(switcher: LanguageSwitcher, run: () => Promise<T>): Promise<T> {
  await switcher.switchTo('ar');
  try {
    return await run();
  } finally {
    await switcher.switchTo('en').catch((e: unknown) => Logger.warn(`could not switch the UI back to English: ${String(e)}`));
  }
}

// ---------------------------------------------------------------- failures watcher (exploration)

/** Collects 5xx answers and uncaught page errors from now on; `stop()` answers them. */
export function watchFailures(page: Page): { stop: () => string[] } {
  const seen: string[] = [];
  const onResponse = (r: { url: () => string; status: () => number }): void => {
    if (r.status() >= 500 && r.url().includes('/api/')) seen.push(`${r.status()} ${r.url()}`);
  };
  const onError = (e: Error): void => {
    seen.push(`page error: ${e.message.split('\n')[0]}`);
  };
  page.on('response', onResponse);
  page.on('pageerror', onError);
  return {
    stop: () => {
      page.off('response', onResponse);
      page.off('pageerror', onError);
      return seen;
    },
  };
}

/** Tries the header language toggle while the drawer is open (a modal mask may refuse the click); answers whether it switched. */
export async function trySwitchLanguage(switcher: LanguageSwitcher, lang: 'ar' | 'en'): Promise<boolean> {
  const done = await Promise.race([
    switcher.switchTo(lang).then(() => true).catch(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(false), 8_000)),
  ]);
  return done && (await switcher.currentLanguage()) === lang;
}

// ---------------------------------------------------------------- delivery (inbox)

/** The page user's inbox items of definition `type` (searched by `search`, plus the newest page). */
export async function inboxOfType(page: Page, type: string, search?: string): Promise<InboxNotification[]> {
  const found = new Map<string, InboxNotification>();
  const pools = [await myNotifications(page, { rows: 50 })];
  if (search) pools.push(await myNotifications(page, { rows: 50, search }));
  for (const pool of pools) for (const item of pool.items) if (item.type === type) found.set(item.id, item);
  return [...found.values()];
}

/** Polls the page user's inbox until an item of `type` arrives (or `timeoutMs`); answers every such item. */
export async function waitForDelivered(page: Page, type: string, search?: string, timeoutMs = 3 * 60_000): Promise<InboxNotification[]> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const items = await inboxOfType(page, type, search);
    if (items.length > 0 || Date.now() > end) return items;
    await page.waitForTimeout(5_000);
  }
}

/**
 * An ACTIVE suite network ("Automation Network ..."): the network job is
 * moved (jobClock, restored at teardown) to fire in `jobInMinutes`, the
 * network is created + approved effective in one minute, and the job makes it
 * Active. `spec` may set the expiry.
 */
export async function activeSuiteNetwork(page: Page, jobClock: JobClock, spec: NetworkSpec = {}, jobInMinutes = 3): Promise<ProvisionedNetwork> {
  await jobClock.moveTo(LIFECYCLE_JOB.network, jobInMinutes);
  const network = await provisionNetwork(page, { effectiveInMinutes: 1, ...spec });
  await waitForNetworkStatusCode(page, network.id, 'active', (jobInMinutes + 6) * 60_000);
  Logger.step(`[writerC] Suite network "${network.name}" is Active`);
  return network;
}

/** Moves the network job to fire in `minutes` and waits until that minute has passed (+ `graceMs`). */
export async function fireNetworkJob(page: Page, jobClock: JobClock, minutes = 2, graceMs = 60_000): Promise<Date> {
  const move = await jobClock.moveTo(LIFECYCLE_JOB.network, minutes);
  const wait = move.firesAt.getTime() + graceMs - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  return move.firesAt;
}

/** The definitions write API fragments (re-exported for the specs' readability). */
export const WRITE_API = DEF_WRITE_API;

// ---------------------------------------------------------------- suite records

export interface SuiteDefinitionSpec {
  /** Full name (must start with the suite prefix); default `suiteDefinitions.newName(label)`. */
  name?: string;
  label?: string;
  moduleId: string;
  actionId: string;
  isActive?: boolean;
  audiences?: DefinitionAudience[];
  notesTemplate?: string | null;
  description?: string | null;
  /** Message marker (English letters / digits); default a fresh stamp. */
  marker?: string;
  /** Name every variable of the action in the messages (default: the required ones). */
  allVariables?: boolean;
}

export interface MadeDefinition {
  id: string;
  name: string;
  english: string;
  arabic: string;
}

/**
 * A suite definition through `suiteDefinitions.create` with VALID messages for
 * its action (every required variable named) - BLOCKS the case when refused.
 */
export async function makeSuiteDefinition(page: Page, defs: SuiteDefinitions, spec: SuiteDefinitionSpec): Promise<MadeDefinition> {
  const messages = await messagesFor(page, spec.actionId, spec.marker ?? ncStamp(), spec.allVariables ?? false);
  const made = await defs.create({
    name: spec.name ?? defs.newName(spec.label),
    moduleId: spec.moduleId,
    actionId: spec.actionId,
    englishMessageTemplate: messages.english,
    arabicMessageTemplate: messages.arabic,
    notesTemplate: spec.notesTemplate ?? null,
    description: spec.description ?? null,
    isActive: spec.isActive ?? false,
    ...(spec.audiences ? { audiences: spec.audiences } : {}),
  });
  return { ...made, english: messages.english, arabic: messages.arabic };
}

/** `count` suite definitions named `<base> 01..NN` (created in that order, so the newest is last). */
export async function makeSuiteDefinitions(page: Page, defs: SuiteDefinitions, base: string, specs: readonly Omit<SuiteDefinitionSpec, 'name' | 'label'>[]): Promise<MadeDefinition[]> {
  const out: MadeDefinition[] = [];
  for (let i = 0; i < specs.length; i += 1) out.push(await makeSuiteDefinition(page, defs, { ...specs[i], name: `${base} ${String(i + 1).padStart(2, '0')}` }));
  return out;
}

/** The remove (x) control of an App Notification filter chip. */
export function chipRemoveControl(page: Page, field: string): Locator {
  return page.locator(`#${NC_LIST.chipRemove(DRAWER, field)}`);
}

// ---------------------------------------------------------------- drawer composites

export interface GeneralInput {
  name?: string;
  module?: string;
  action?: string;
  description?: string;
  active?: boolean;
}

export interface ContentInput {
  english?: string;
  arabic?: string;
  notes?: string;
}

/** Fills General, walks to Content, fills it, walks to the last step; answers the step reached. */
export async function fillToAudiences(page: Page, drawer: DefinitionDrawer, general: GeneralInput, content: ContentInput): Promise<DrawerStep> {
  await drawer.fillGeneral(general);
  await forwardTo(page, drawer, 'content');
  await drawer.fillContent(content);
  return (await forwardTo(page, drawer, 'audiences')).reached;
}

/** Whether the Audiences step offers an audience picker ("Add audience"). */
export async function audiencePickerShown(drawer: DefinitionDrawer): Promise<boolean> {
  return drawer.byPart(DEF_DRAWER_PART.addAudience).isVisible().catch(() => false);
}

/** Clicks the drawer's X and reads the Unsaved Changes dialog WITHOUT answering it (null when none appeared). */
export async function pressClose(page: Page, drawer: DefinitionDrawer): Promise<{ title: string; message: string } | null> {
  await drawer.el('close').click();
  const shown = await page.locator(`#${NC_DIALOG.title}`).waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
  if (!shown) return null;
  return {
    title: normText(await page.locator(`#${NC_DIALOG.title}`).innerText()),
    message: normText(await page.locator(`#${NC_DIALOG.message}`).innerText()),
  };
}

/** Answers the open Unsaved Changes dialog (`stay` = Keep Editing, `discard` = Discard Changes). */
export async function answerUnsaved(page: Page, answer: 'stay' | 'discard'): Promise<void> {
  await page.locator(buttonSelector(NC_DIALOG.action(answer))).click();
  await page.locator(`#${NC_DIALOG.title}`).waitFor({ state: 'hidden', timeout: Timeouts.default });
}

/** Closes the drawer whatever its state (discarding edits). */
export async function discardDrawer(drawer: DefinitionDrawer): Promise<void> {
  if (await drawer.isOpen(300)) await drawer.close('discard');
}

/**
 * The same attempt in the Arabic UI: closes the drawer, switches the page to
 * Arabic, reopens the App Notification tab and the Create drawer, runs `fill`
 * (labels in Arabic), clicks Save from there and reports - then closes the
 * drawer and switches back to English.
 */
export async function attemptInArabic(
  page: Page,
  switcher: LanguageSwitcher,
  tab: DefinitionsTab,
  drawer: DefinitionDrawer,
  fill: () => Promise<void>,
  opts: { jump?: boolean; revisit?: boolean } = {},
): Promise<SaveAttempt> {
  await discardDrawer(drawer);
  return inArabic(switcher, async () => {
    await tab.open();
    await drawer.openCreate();
    await fill();
    const attempt = await saveFromHere(page, drawer, opts);
    await discardDrawer(drawer);
    return attempt;
  });
}

/**
 * ACTIVE suite networks made together: the network job is moved once to fire
 * in `jobInMinutes`, every network is created + approved effective in a
 * minute (`spec.expiryInMinutes` sets the expiry), and the job makes them
 * Active. Each comes back with its expiry instant.
 */
export async function activeSuiteNetworks(page: Page, jobClock: JobClock, specs: readonly NetworkSpec[], jobInMinutes = 3): Promise<(ProvisionedNetwork & { expiresAt: Date | null })[]> {
  await jobClock.moveTo(LIFECYCLE_JOB.network, jobInMinutes);
  const made: (ProvisionedNetwork & { expiresAt: Date | null })[] = [];
  for (const spec of specs) {
    const expiresAt = spec.expiryInMinutes === undefined ? null : new Date(Date.now() + spec.expiryInMinutes * 60_000);
    made.push({ ...(await provisionNetwork(page, { effectiveInMinutes: 1, ...spec })), expiresAt });
  }
  for (const n of made) await waitForNetworkStatusCode(page, n.id, 'active', (jobInMinutes + 6) * 60_000);
  Logger.step(`[writerC] Suite networks Active: ${made.map((n) => n.name).join(', ')}`);
  return made;
}

/** Minutes from now until `at` (at least `min`), rounded up - for moving a job just past an instant. */
export function minutesPast(at: Date, min = 2): number {
  return Math.max(min, Math.ceil((at.getTime() - Date.now()) / 60_000) + 1);
}

/** The new definition's id by its exact name (API), '' when not found. */
export async function definitionIdByName(page: Page, name: string): Promise<string> {
  return (await definitionsBy(page, { searchText: name })).items.find((d) => d.name === name)?.id ?? '';
}

/** The audience type label (Users / Roles) in the UI language (GetOptions `audienceTypes`). */
export async function audienceTypeLabel(page: Page, code: 'users' | 'roles', lang: 'en' | 'ar' = 'en'): Promise<string> {
  const hit = (await definitionOptions(page)).audienceTypes.find((t) => t.code === code);
  if (!hit) throw new Error(`GetOptions has no audience type "${code}"`);
  return lang === 'ar' ? hit.arabicName : hit.englishName;
}

/** Adds an audience card and picks its type by the label shown (any UI language); answers its index. */
export async function addAudienceCard(page: Page, drawer: DefinitionDrawer, typeLabel: string): Promise<number> {
  const idx = await audienceCardCount(page);
  await drawer.el('addAudience').click();
  await drawer.audienceCard(idx, 'type-select').waitFor({ state: 'visible', timeout: Timeouts.default });
  await drawer.choose(`${DEF_DRAWER_PART.audiencePrefix}${idx}${DEF_DRAWER_PART.audienceTypeSuffix}`, typeLabel);
  return idx;
}

/** Assigns candidates to card `idx` by their ids (works in either UI language) and saves the window. */
export async function assignByIds(page: Page, drawer: DefinitionDrawer, idx: number, who: readonly AudienceCandidateRef[]): Promise<void> {
  await openAssign(drawer, idx);
  for (const w of who) await moveToSelected(drawer, w);
  await saveAssign(page, drawer);
}

/** Audience candidates (users / roles) by English name -> `{ id, name, altNames: [Arabic name] }` ('' id when absent). */
export async function candidatesNamed(page: Page, type: 'users' | 'roles', names: readonly string[]): Promise<AudienceCandidateRef[]> {
  const all = await audienceCandidatesOf(page, type);
  return names.map((name) => {
    const hit = all.find((c) => c.nameEn === name);
    return { name, id: hit?.id ?? '', altNames: hit?.nameAr ? [hit.nameAr] : [] };
  });
}

/**
 * The Action the General step shows once a Module change has settled: the reset of the Action runs
 * after the Module choice and the read can come too early (rerun1 21335 read the old action while
 * the screen already showed it empty) - polls up to `timeout` for the field to empty, answers what
 * it shows then.
 */
export async function actionAfterModuleChange(page: Page, drawer: DefinitionDrawer, timeout = 5_000): Promise<string> {
  const end = Date.now() + timeout;
  for (;;) {
    const action = (await generalShown(drawer)).action;
    if (action === '' || Date.now() > end) return action;
    await page.waitForTimeout(250);
  }
}

/** `text` followed by every REQUIRED variable of the action (a body the drawer accepts). */
export async function wordingWithRequired(page: Page, actionId: string, text: string): Promise<string> {
  const vars = (await actionVariablesNc(page, actionId)).filter((v) => v.isRequired).map((v) => `{{${v.name}}}`).join(' ');
  return `${text} ${vars}`.trim();
}

/** The drawer's Save button (Audiences step). */
export function saveButton(drawer: DefinitionDrawer): Locator {
  return drawer.byPart(DEF_DRAWER_PART.save);
}

const STEP_ORDER: Record<'general' | 'content' | 'audiences', number> = { general: 1, content: 2, audiences: 3 };

/** Walks the drawer (Back / Next) to `target`; answers the step reached. */
export async function moveToStep(page: Page, drawer: DefinitionDrawer, target: 'general' | 'content' | 'audiences'): Promise<DrawerStep> {
  for (let i = 0; i < 4; i += 1) {
    const now = await currentStep(drawer);
    if (now === target || now === 'closed' || now === 'variables') return now;
    if (STEP_ORDER[now] < STEP_ORDER[target]) return (await forwardTo(page, drawer, target as 'content' | 'audiences')).reached;
    await drawer.back();
    await page.waitForTimeout(300);
  }
  return currentStep(drawer);
}

/** Whether a definition is listed after searching its name. */
export async function isListed(tab: DefinitionsTab, id: string, name: string): Promise<boolean> {
  await tab.search(name);
  return (await tab.rowIds()).includes(id);
}

/**
 * Search + Delete + Confirm on a row; answers whether a confirmation appeared, the DeleteDefinition
 * status (after the Confirm, or - with no dialog - the one the Delete click sent at once) and
 * whether the row is still listed.
 */
export async function deleteThroughRow(page: Page, tab: DefinitionsTab, id: string, name: string): Promise<{ name: string; confirmation: boolean; status: number | null; listed: boolean }> {
  await tab.search(name);
  const click = await clickDelete(page, tab, id);
  const status = click.dialog ? (await answerDialog(page, tab, true, DEF_WRITE_API.delete)).status : click.sentAtOnce;
  return { name, confirmation: click.dialog !== null, status, listed: await isListed(tab, id, name) };
}

/** Polls (up to `timeout`) the toasts, the drawer's field errors and the drawer text for `pattern`; answers what was seen. */
export async function waitForDrawerMessage(page: Page, drawer: DefinitionDrawer, pattern: RegExp, timeout = 3_000): Promise<{ found: boolean; texts: string[] }> {
  const end = Date.now() + timeout;
  for (;;) {
    const texts = [...(await toastTexts(page)), ...Object.values(await visibleErrors(page)), normText(await drawer.text())];
    const found = texts.some((t) => pattern.test(t));
    if (found || Date.now() > end) return { found, texts };
    await page.waitForTimeout(250);
  }
}
