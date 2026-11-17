import type { Locator, Page } from '@playwright/test';
import { expect, test as base } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import { Timeouts } from '../../constants/Timeouts';
import { StepStatus } from '../../constants/TestStatus';
import { NC_DIALOG, NC_LIST, NC_ROUTE, TRIGGER_DRAWER, type NcTab } from '../../constants/notification/notificationIds';
import { WRITER_A_IDS } from '../../constants/notification/writerAIds';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { SuiteTriggers } from '../../fixtures/notificationModule.fixture';
import { DefinitionsTab, TriggersTab, type ListAnswer, type NcListTab } from '../../pages/notification/NotificationCenterPage';
import { TriggerDrawer, type DrawerSaveOutcome } from '../../pages/notification/Drawers';
import { chooseSelectOption, readSelectOptions } from '../../pages/components/PrimeControls';
import { Logger } from '../Logger';
import { NetworkUtils } from '../NetworkUtils';
import { parseXlsx, type ParsedXlsx } from '../XlsxUtils';
import {
  CHANNEL,
  LANGUAGE,
  NC_API,
  SUITE_TRIGGER_PREFIX,
  TRIGGER_MODULE,
  actionVariablesNc,
  freeTriggerActions,
  listTriggers,
  ncOptions,
  ncStamp,
  payloadOf,
  readTrigger,
  updateTrigger,
  type DefinitionVariable,
  type NcOption,
  type TriggerRecord,
  type TriggerTemplate,
} from './notificationApi';

/**
 * Writer A's helpers for the Notification Center (Feature 20980): folders
 * 04 Edit Trigger, 05 Delete Trigger, 06 Create Trigger, 07 Activate and
 * Deactivate Trigger, 08 Search and Filter Triggers (the Triggers (Email&SMS)
 * tab) and 14 Sort and Export App Notifications (the App Notification tab) -
 * reports/notification/Notification-Writers-Brief.md.
 *
 * Built on the lead's page objects (TriggersTab / DefinitionsTab / TriggerDrawer)
 * and API helpers (notificationApi.ts). Every record created, edited, toggled
 * or deleted here is a SUITE trigger ("QA Automation Trigger ...") made through
 * `suiteTriggers` (deleted at teardown) - except the predefined-wording case,
 * which edits a predefined trigger's English SMS text through the screen and
 * ALWAYS puts the original templates back through the API and reads them back
 * (`rewordPredefined`, safety rule 1 of the foundation notes).
 *
 * Extra ids (Clear All, insert-template button) live in
 * constants/notification/writerAIds.ts.
 */

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();
/** Whitespace collapsed and every dash made one, for literal message checks (lead decision 3). */
export const normalise = (text: string): string => flat(text).replace(/\s*[—–-]\s*/g, ' - ');

// ---- step flow -------------------------------------------------------------------------

/**
 * BLOCKED only when nothing failed before (lead decision 8, the idea of
 * utils/settings/writerBHelpers.ts): when an earlier step already FAILED the
 * finding stands, a note says what could not be observed, and the caller's own
 * assertions run on.
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

// ---- names, options, templates ---------------------------------------------------------

/**
 * A suite trigger name within the screen's 50 characters: the prefix, the
 * (shortened) label, then a fresh stamp - the stamp is never cut, so two runs
 * never clash on a leftover name.
 */
export function suiteTriggerName(label = ''): string {
  const stamp = ncStamp();
  const room = 50 - SUITE_TRIGGER_PREFIX.length - stamp.length - 2;
  const cut = label.slice(0, Math.max(0, room)).trim();
  return cut ? `${SUITE_TRIGGER_PREFIX} ${cut} ${stamp}` : `${SUITE_TRIGGER_PREFIX} ${stamp}`;
}

/** A suite name padded to exactly `length` characters (still the suite prefix + a stamp). */
export function suiteTriggerNameOfLength(length: number): string {
  const base1 = `${SUITE_TRIGGER_PREFIX} ${ncStamp()} `;
  return (base1 + 'x'.repeat(Math.max(0, length - base1.length))).slice(0, length);
}

export type Channel = 'SMS' | 'Email';
export type Lang = 'English' | 'Arabic';

export interface TemplateSpec {
  channel: Channel;
  language: Lang;
  /** Default: a message in the language naming every REQUIRED placeholder of the action. */
  body?: string;
  /** Email only; default a short subject in the language. */
  subject?: string;
}

const CHANNEL_ID: Record<Channel, string> = { SMS: CHANNEL.sms, Email: CHANNEL.email };
const LANGUAGE_ID: Record<Lang, string> = { English: LANGUAGE.en, Arabic: LANGUAGE.ar };

/** `{{A}} {{B}}` for the action's required placeholders. */
export async function requiredPlaceholders(page: Page, actionId: string): Promise<string> {
  return (await actionVariablesNc(page, actionId)).filter((v) => v.isRequired).map((v) => `{{${v.name}}}`).join(' ');
}

/** Every placeholder name the action offers (what Insert variable lists). */
export async function placeholderNames(page: Page, actionId: string): Promise<string[]> {
  return (await actionVariablesNc(page, actionId)).map((v) => v.name);
}

export function defaultBody(t: TemplateSpec, required: string): string {
  const text = t.language === 'English' ? `QA automation message ${required}` : `رسالة اختبار آلية ${required}`;
  return t.channel === 'Email' ? `<p>${text.trim()}</p>` : text.trim();
}

export function defaultSubject(language: Lang): string {
  return language === 'English' ? 'QA automation subject' : 'موضوع اختبار آلي';
}

/** The CreateTrigger templates for `specs` on `actionId`. */
export async function templatesOf(page: Page, actionId: string, specs: readonly TemplateSpec[]): Promise<TriggerTemplate[]> {
  const required = await requiredPlaceholders(page, actionId);
  return specs.map((t) => ({
    channelId: CHANNEL_ID[t.channel],
    languageId: LANGUAGE_ID[t.language],
    bodies: [{ subject: t.channel === 'Email' ? (t.subject ?? defaultSubject(t.language)) : null, body: t.body ?? defaultBody(t, required), isDefault: true, targets: [] }],
  }));
}

/** "Channel/Language" of a stored template. */
export function pairOf(t: TriggerTemplate): string {
  const ch = (Object.keys(CHANNEL_ID) as Channel[]).find((k) => CHANNEL_ID[k] === t.channelId) ?? t.channelId;
  const lg = (Object.keys(LANGUAGE_ID) as Lang[]).find((k) => LANGUAGE_ID[k] === t.languageId) ?? t.languageId;
  return `${ch}/${lg}`;
}

/** The stored body (first) of the template `pair` ('SMS/English'), '' when none. */
export function storedBody(record: TriggerRecord | null, pair: string): string {
  return record?.templates.find((t) => pairOf(t) === pair)?.bodies[0]?.body ?? '';
}

export function storedSubject(record: TriggerRecord | null, pair: string): string {
  return record?.templates.find((t) => pairOf(t) === pair)?.bodies[0]?.subject ?? '';
}

/** Text of an HTML body (tags dropped, entities of the editor decoded). */
export function textOfHtml(html: string): string {
  return flat(html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'));
}

/** A body of exactly `length` characters: `lead` + English filler words. */
export function bodyOfLength(lead: string, length: number): string {
  let text = `${lead.trim()} `;
  while (text.length < length) text += 'abc ';
  return text.slice(0, length).replace(/\s$/, 'z');
}

/** The trigger modules / actions of GetOptions, labels in English. */
export interface TriggerCatalogue {
  modules: NcOption[];
  actions: NcOption[];
  moduleLabel(id: string): string;
  actionsOf(moduleId: string): string[];
  actionByName(name: string): NcOption | null;
  smsMax: number;
}

export async function triggerCatalogue(page: Page): Promise<TriggerCatalogue> {
  const o = await ncOptions(page);
  return {
    modules: o.triggerModules,
    actions: o.triggerActions,
    moduleLabel: (id) => o.triggerModules.find((m) => m.id === id)?.englishName ?? '',
    actionsOf: (moduleId) => o.triggerActions.filter((a) => a.parentItemId === moduleId).map((a) => a.englishName),
    actionByName: (name) => o.triggerActions.find((a) => a.englishName === name) ?? null,
    smsMax: o.smsMaxMessageLength,
  };
}

/** A trigger action no trigger uses yet (Approval > Member > User Management), not in `exclude`. */
export async function freeAction(page: Page, exclude: readonly string[] = []): Promise<NcOption> {
  const free = (await freeTriggerActions(page)).filter((a) => !exclude.includes(a.id));
  const order = [TRIGGER_MODULE.approvalManagement, TRIGGER_MODULE.memberManagement, TRIGGER_MODULE.userManagement];
  const pick = order.map((m) => free.find((a) => a.parentItemId === m)).find(Boolean);
  if (!pick) throw new Error('no free trigger action is left (every action already has a trigger)');
  return pick;
}

/** The trigger (any owner) that holds `actionId`, or null. */
export async function triggerOnAction(page: Page, actionId: string): Promise<TriggerRecord | null> {
  for (const t of (await listTriggers(page)).items) {
    const record = await readTrigger(page, t.id);
    if (record?.actionId === actionId) return record;
  }
  return null;
}

export interface SuiteTriggerSpec {
  /** The label inside the suite name (TC example names, shortened to fit 50). */
  label?: string;
  name?: string;
  isActive?: boolean;
  templates?: readonly TemplateSpec[];
  /** Default: a free action. */
  action?: NcOption;
}

/** A suite trigger through `suiteTriggers.create` on a free action (or `spec.action`), with the given templates. */
export async function makeSuiteTrigger(page: Page, suiteTriggers: SuiteTriggers, spec: SuiteTriggerSpec = {}): Promise<TriggerRecord> {
  await suiteTriggers.watch();
  const action = spec.action ?? (await freeAction(page));
  const templates = await templatesOf(page, action.id, spec.templates ?? [{ channel: 'SMS', language: 'English' }]);
  return suiteTriggers.create({
    name: spec.name ?? suiteTriggerName(spec.label ?? ''),
    moduleId: action.parentItemId ?? '',
    actionId: action.id,
    isActive: spec.isActive ?? false,
    templates,
  });
}

/** Whether two template sets hold the same channel/language/subject/body. */
export function sameTemplates(a: readonly TriggerTemplate[], b: readonly TriggerTemplate[]): boolean {
  const key = (ts: readonly TriggerTemplate[]): string => ts.map((t) => `${pairOf(t)}|${t.bodies.map((x) => `${x.subject ?? ''}§${x.body}`).join('¶')}`).sort().join('\n');
  return key(a) === key(b);
}

// ---- sort helpers ----------------------------------------------------------------------

export function directionOf(request: Record<string, unknown>): 'asc' | 'desc' | '' {
  const m = String(request.sortBy ?? '').match(/\b(asc|desc)\s*$/i);
  return m ? (m[1].toLowerCase() as 'asc' | 'desc') : '';
}

/** Index of the first pair out of `direction` order (case-insensitive), -1 when in order. */
export function firstOutOfOrder(values: readonly string[], direction: 'asc' | 'desc' | ''): number {
  const dir = direction || 'asc';
  for (let i = 1; i < values.length; i += 1) {
    const cmp = values[i - 1].trim().localeCompare(values[i].trim(), undefined, { sensitivity: 'base' });
    if ((dir === 'asc' && cmp > 0) || (dir === 'desc' && cmp < 0)) return i;
  }
  return -1;
}

/** Whether every distinct value forms ONE contiguous run (rows grouped by the value). */
export function isGrouped(values: readonly string[]): boolean {
  const seen = new Set<string>();
  for (let i = 0; i < values.length; i += 1) {
    if (i > 0 && values[i] === values[i - 1]) continue;
    if (seen.has(values[i])) return false;
    seen.add(values[i]);
  }
  return true;
}

// ---- definitions API (App Notification list) -------------------------------------------

export interface DefinitionRow {
  id: string;
  name: string;
  moduleNameEn: string;
  moduleActionEn: string;
  isActive: boolean;
  audienceCount: number;
}

/** POST GetDefinitions with the screen's own body (any filters / sort), `rows` per page. */
export async function definitionsPage(page: Page, body: Record<string, unknown>, rows = 500): Promise<{ status: number; totalRows: number; items: DefinitionRow[] }> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', NC_API.definitions, { ...body, pageNumber: 1, rowsPerPage: rows });
  const p = payloadOf<{ totalRows?: number; items?: DefinitionRow[] }>(res);
  return { status: res.status, totalRows: p?.totalRows ?? 0, items: p?.items ?? [] };
}

// ---- the Triggers tab + drawer ---------------------------------------------------------

export interface SaveReport extends DrawerSaveOutcome {
  /** Inline errors in the drawer after the save. */
  errors: string[];
  /** One line for failure messages: request + answer + toast + errors. */
  shown: string;
}

export interface RowWrite {
  /** The confirmation dialog the click raised, or null when none appeared. */
  dialog: { title: string; message: string } | null;
  /** Answers the dialog (when one is up) and returns the write's status (null = nothing sent) and the toast. */
  finish(confirm: boolean): Promise<{ status: number | null; toast: string; answer: string }>;
}

export interface GeneralState {
  name: string;
  module: string;
  action: string;
  recipient: string;
  active: boolean;
  nameEnabled: boolean;
  moduleDisabled: boolean;
  actionDisabled: boolean;
  activeEnabled: boolean;
}

export interface ExportAttempt {
  downloaded: boolean;
  filename: string;
  sheet: ParsedXlsx | null;
  isWorkbook: boolean;
  toast: string;
}

/** Triggers (Email&SMS) tab, the Add/Edit drawer and the list exports, for Writer A's cases. */
export class WriterATriggers extends BasePage {
  readonly tab: TriggersTab;
  readonly drawer: TriggerDrawer;

  constructor(page: Page) {
    super(page);
    this.tab = new TriggersTab(page);
    this.drawer = new TriggerDrawer(page);
  }

  // ---- list ------------------------------------------------------------------------

  /** Searches the name and clicks the row's Edit; the drawer is open after. */
  async openRowEdit(id: string, name: string): Promise<void> {
    await this.tab.search(name);
    await expect(this.tab.row(id), `the row of "${name}" after searching its name`).toBeVisible({ timeout: Timeouts.default });
    await this.tab.rowAction(id, 'edit').click();
    await this.drawer.waitForOpen();
  }

  /** The row's Active cell ("✓" / "✗"). */
  async activeMark(id: string): Promise<string> {
    return flat(await this.tab.cell(id, 'active').innerText());
  }

  /** The row's Active cell, its toggle label and GetTrigger isActive, read together. */
  async rowState(id: string): Promise<{ mark: string; label: string; stored: boolean | undefined }> {
    return { mark: await this.activeMark(id), label: await this.tab.toggleLabel(id), stored: (await readTrigger(this.page, id))?.isActive };
  }

  /**
   * Web-first: polls `rowState` until it equals `expected` (up to `Timeouts.default`). After a toggle
   * the list refreshes a moment after the toast (rerun 2026-11-12, 21378 / 21379: GetTrigger already
   * changed while the row still showed the old state).
   */
  async expectRowState(id: string, expected: { mark: string; label: string; stored: boolean }, message: string): Promise<void> {
    await expect.poll(() => this.rowState(id), { message, timeout: Timeouts.default }).toEqual(expected);
  }

  /**
   * Clicks a row's Toggle / Delete and reports the confirmation dialog it
   * raised (null when the write went out at once); `finish` answers it.
   */
  async startRowWrite(id: string, action: 'toggle-active' | 'delete'): Promise<RowWrite> {
    const fragment = action === 'delete' ? '/TriggersConfiguration/DeleteTrigger' : '/TriggersConfiguration/ToggleTriggerActivation';
    const write = this.page.waitForResponse((r) => r.url().includes(fragment) && r.request().method() !== 'GET', { timeout: Timeouts.default }).catch(() => null);
    await this.tab.rowAction(id, action).click();
    const shown = await this.byId(NC_DIALOG.title).waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
    const dialog = shown ? { title: flat(await this.byId(NC_DIALOG.title).innerText()), message: flat(await this.byId(NC_DIALOG.message).innerText()) } : null;
    return {
      dialog,
      finish: async (confirm) => {
        if (shown) await this.btn(NC_DIALOG.action(confirm ? 'confirm' : 'cancel')).click();
        if (shown && !confirm) {
          await expect(this.byId(NC_DIALOG.title), 'the confirmation should close').toBeHidden({ timeout: Timeouts.default });
          const toast = await this.tab.toastText(2_500);
          return { status: null, toast, answer: '' };
        }
        const toastWait = this.tab.toastText(Timeouts.toast);
        const r = await write;
        const toast = await toastWait;
        await this.tab.waitForRowsToSettle();
        return { status: r?.status() ?? null, toast, answer: (await r?.text().catch(() => '')) ?? '' };
      },
    };
  }

  /** Clicks Clear (Clear All) and waits for the list's answer. */
  async clearAll(): Promise<ListAnswer | null> {
    const answer = this.tab.listAnswer();
    await this.btn(WRITER_A_IDS.clearAll('triggers')).click();
    const a = await answer;
    await this.tab.waitForRowsToSettle();
    return a;
  }

  // ---- drawer: steps ---------------------------------------------------------------

  async onGeneral(): Promise<boolean> {
    return this.byId(TRIGGER_DRAWER.nameInput).isVisible().catch(() => false);
  }

  async onContent(): Promise<boolean> {
    return this.byId(TRIGGER_DRAWER.addTemplateButton).isVisible().catch(() => false);
  }

  /** Next on General; waits for the Content step. Returns the toast it raised. */
  async toContent(): Promise<string> {
    const toast = await this.drawer.next();
    await this.byId(TRIGGER_DRAWER.addTemplateButton).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return toast;
  }

  /** The stepper's General bullet (an existing / predefined trigger); waits for General. */
  async toGeneral(): Promise<void> {
    await this.byId(TRIGGER_DRAWER.stepBullet(1)).click();
    await this.byId(TRIGGER_DRAWER.nameInput).waitFor({ state: 'visible', timeout: Timeouts.default });
  }

  nameInput(): Locator {
    return this.byId(TRIGGER_DRAWER.nameInput);
  }

  activeCheckbox(): Locator {
    return this.byId(TRIGGER_DRAWER.isActiveCheckbox);
  }

  predefinedNotice(): Locator {
    return this.byId(TRIGGER_DRAWER.predefinedNotice);
  }

  async selectDisabled(part: 'module-select' | 'action-select'): Promise<boolean> {
    return this.drawer.byPart(part).evaluate((el) => el.getAttribute('aria-disabled') === 'true' || el.closest('.p-disabled, [aria-disabled="true"], [disabled]') !== null
      || el.querySelector('[aria-disabled="true"]') !== null);
  }

  async generalState(): Promise<GeneralState> {
    return {
      name: await this.nameInput().inputValue(),
      module: flat(await this.drawer.selected('module-select')),
      action: flat(await this.drawer.selected('action-select')),
      recipient: flat(await this.byId(TRIGGER_DRAWER.recipientIndicator).innerText().catch(() => '')),
      active: await this.activeCheckbox().isChecked(),
      nameEnabled: await this.nameInput().isEnabled(),
      moduleDisabled: await this.selectDisabled('module-select'),
      actionDisabled: await this.selectDisabled('action-select'),
      activeEnabled: await this.activeCheckbox().isEnabled(),
    };
  }

  /** Tries to type a name, pick another module and untick Active on a locked General step; answers the state after. */
  async attemptGeneralChanges(name: string, module: string): Promise<GeneralState> {
    await this.nameInput().fill(name, { force: true, timeout: 2_000 }).catch(() => undefined);
    const combo = this.drawer.selectOf('module-select');
    await combo.click({ force: true, timeout: 2_000 }).catch(() => undefined);
    const option = this.page.getByRole('option', { name: module, exact: true });
    if (await option.isVisible().catch(() => false)) await option.click({ timeout: 2_000 }).catch(() => undefined);
    if (await this.page.getByRole('option').first().isVisible().catch(() => false)) await combo.click({ force: true, timeout: 2_000 }).catch(() => undefined);
    await this.activeCheckbox().click({ force: true, timeout: 2_000 }).catch(() => undefined);
    return this.generalState();
  }

  /** The inline error under a General field ('' when none) - by its id, else the field's own message line. */
  async generalError(field: 'name' | 'module' | 'action'): Promise<string> {
    const byOwnId = await this.drawer.fieldError(field);
    if (byOwnId) return byOwnId;
    const host = this.drawer.byPart(field === 'name' ? 'name-input' : `${field}-select`);
    // locator-exception: the General step's "This field is required." lines carry no id (probe e01); read inside the field's own wrapper.
    const small = host.locator('xpath=ancestor::*[.//small][1]//small');
    const texts = await small.allInnerTexts().catch(() => [] as string[]);
    return flat(texts.find((t) => t.trim() !== '') ?? '');
  }

  // ---- drawer: templates -----------------------------------------------------------

  async templateIndexes(): Promise<number[]> {
    const prefix = WRITER_A_IDS.trigger.templatePrefix;
    const ids = await this.page.locator(`[id^="${prefix}"][id$="-channel-select"]`).evaluateAll((els) => els.map((e) => e.id));
    return ids.map((id) => Number(id.slice(prefix.length).split('-')[0])).filter((n) => !Number.isNaN(n));
  }

  async templatePair(t: number): Promise<string> {
    const ch = flat(await this.drawer.selected(`template-idx-${t}-channel-select`));
    const lg = flat(await this.drawer.selected(`template-idx-${t}-language-select`));
    return `${ch}/${lg}`;
  }

  /** "Channel/Language" of every template card, in order. */
  async templatePairs(): Promise<string[]> {
    const out: string[] = [];
    for (const t of await this.templateIndexes()) out.push(await this.templatePair(t));
    return out;
  }

  /** The card index holding `channel`/`language` (-1 when none). */
  async indexOf(channel: Channel, language: Lang): Promise<number> {
    for (const t of await this.templateIndexes()) if ((await this.templatePair(t)) === `${channel}/${language}`) return t;
    return -1;
  }

  /** Clicks "Add message template"; returns the new card's index. */
  async addTemplate(): Promise<number> {
    const before = await this.templateIndexes();
    await this.drawer.addTemplate();
    const next = before.length ? Math.max(...before) + 1 : 0;
    await expect(this.drawer.byPart(`template-idx-${next}-channel-select`), 'a new template card should appear').toBeVisible({ timeout: Timeouts.default });
    return next;
  }

  async removeTemplate(t: number): Promise<void> {
    const before = (await this.templateIndexes()).length;
    await this.byId(TRIGGER_DRAWER.template.removeButton(t)).click();
    await expect.poll(async () => (await this.templateIndexes()).length, { timeout: Timeouts.default }).toBe(before - 1);
  }

  /**
   * The channel/language pairs card `t` lets you pick: every channel it
   * offers, and for each the languages offered once that channel is chosen.
   */
  async offeredPairs(t: number): Promise<string[]> {
    const channelCombo = this.drawer.selectOf(`template-idx-${t}-channel-select`);
    const languageCombo = this.drawer.selectOf(`template-idx-${t}-language-select`);
    const out: string[] = [];
    for (const ch of await readSelectOptions(this.page, channelCombo)) {
      await chooseSelectOption(this.page, channelCombo, ch);
      for (const lg of await readSelectOptions(this.page, languageCombo)) out.push(`${ch}/${lg}`);
    }
    return out;
  }

  addTemplateButton(): Locator {
    return this.byId(TRIGGER_DRAWER.addTemplateButton);
  }

  allChannelsHint(): Locator {
    return this.byId(TRIGGER_DRAWER.allChannelsUsedHint);
  }

  smsBody(t: number): Locator {
    return this.byId(TRIGGER_DRAWER.template.bodyInput(t));
  }

  subject(t: number): Locator {
    return this.byId(TRIGGER_DRAWER.template.subjectInput(t));
  }

  editor(t: number): Locator {
    return this.byId(TRIGGER_DRAWER.template.editorArea(t));
  }

  templateError(t: number): Locator {
    return this.byId(TRIGGER_DRAWER.template.error(t));
  }

  contentError(t: number): Locator {
    return this.byId(TRIGGER_DRAWER.template.contentError(t));
  }

  /** The visible text of every inline error in the drawer, joined. */
  async errorsText(): Promise<string> {
    return flat((await this.drawer.allErrors()).join(' | '));
  }

  /** Clicks the rich editor's Template button. */
  async insertBrandedTemplate(t: number): Promise<void> {
    await this.byId(WRITER_A_IDS.trigger.insertTemplateButton(t)).click();
  }

  async editorText(t: number): Promise<string> {
    return flat(await this.editor(t).innerText());
  }

  /** Fills Name / Module / Action, clicks Next, sets template 0 to `channel`/English with `body` (and `subject` for Email). */
  async fillNewTrigger(v: { name: string; module: string; action: string; channel: Channel; body: string; subject?: string }): Promise<void> {
    await this.drawer.fillGeneral({ name: v.name, module: v.module, action: v.action });
    await this.toContent();
    await this.drawer.setTemplate(0, v.channel, 'English');
    await this.drawer.setBody(0, v.body, v.subject);
  }

  /**
   * Save, then the drawer's errors - with one line describing everything seen.
   * After an ACCEPTED save the drawer closes itself with an animation (full run 2026-11-12, 21361 /
   * 21369: the close button is still visible the instant the toast shows, gone a moment later), so
   * `drawerOpen` is read only once the drawer had `Timeouts.default` to close.
   */
  async saveAndReport(): Promise<SaveReport> {
    const out = await this.drawer.save();
    const errors = await this.drawer.allErrors();
    const accepted = out.status !== null && out.status >= 200 && out.status < 300;
    const drawerOpen = accepted
      ? !(await this.drawer.el('close').waitFor({ state: 'hidden', timeout: Timeouts.default }).then(() => true).catch(() => false))
      : out.drawerOpen;
    const shown = `${out.status === null ? 'no request sent' : `request answered ${out.status} ${out.answer.slice(0, 200)}`}; toast "${out.toast}"; errors ${JSON.stringify(errors)}; drawer ${drawerOpen ? 'open' : 'closed'}`;
    return { ...out, drawerOpen, errors, shown };
  }

  /** Closes the drawer, discarding when Unsaved Changes asks; returns the dialog seen (null when none). */
  async closeDrawer(): Promise<{ title: string; message: string } | null> {
    if (!(await this.drawer.isOpen())) return null;
    const seen = await this.drawer.close('discard');
    await expect(this.drawer.el('close'), 'the drawer should close').toBeHidden({ timeout: Timeouts.default });
    return seen;
  }

  // ---- drawer: placeholders, preview -----------------------------------------------

  /** Reads the Sample Value of each variable in Manage Variables and goes back to Content. */
  async sampleValues(names: readonly string[]): Promise<Record<string, string>> {
    await this.drawer.openVariables();
    const out: Record<string, string> = {};
    for (const n of names) out[n] = await this.drawer.variable(n, 'sample-value-input').inputValue().catch(() => '');
    await this.drawer.variablesBack();
    await this.addTemplateButton().waitFor({ state: 'visible', timeout: Timeouts.default });
    return out;
  }

  /**
   * Puts the caret at the END of the first paragraph of template `t`'s rich
   * body by clicking there; answers the click point, the paragraph's text and
   * whether the caret sits at its end.
   */
  async caretAtEndOfFirstBlock(t: number): Promise<{ x: number; y: number; before: string; caretAtEnd: boolean }> {
    // The English Email card of a predefined trigger is the third card, below the fold (full run
    // 2026-11-12, 21374): a mouse click at off-screen coordinates lands nowhere. Centre it first.
    const point = await this.editor(t).evaluate((el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
      const block = (el.querySelector('p, li, h1, h2, h3, div') ?? el) as HTMLElement;
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let last: Text | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.textContent ?? '').length > 0) last = n as Text;
      let rect = block.getBoundingClientRect();
      if (last) {
        const r = document.createRange();
        const len = (last.textContent ?? '').length;
        r.setStart(last, Math.max(0, len - 1));
        r.setEnd(last, len);
        rect = r.getBoundingClientRect();
      }
      return { x: rect.right - 0.5, y: rect.top + rect.height / 2, before: block.textContent ?? '' };
    });
    await this.page.mouse.click(point.x, point.y);
    const readCaret = (): Promise<boolean> => this.editor(t).evaluate((el) => {
      const block = (el.querySelector('p, li, h1, h2, h3, div') ?? el) as HTMLElement;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
      const range = sel.getRangeAt(0);
      if (!block.contains(range.endContainer)) return false;
      const tail = document.createRange();
      tail.setStart(range.endContainer, range.endOffset);
      tail.setEnd(block, block.childNodes.length);
      return (tail.toString() ?? '').length === 0;
    });
    // The editor settles its selection after mouseup - read it for up to 2 s.
    let caretAtEnd = await readCaret();
    for (let i = 0; i < 8 && !caretAtEnd; i += 1) {
      await this.page.waitForTimeout(250);
      caretAtEnd = await readCaret();
    }
    return { ...point, caretAtEnd };
  }

  /** Right-clicks at a point and answers the Insert variable menu's names. */
  async insertMenuAt(x: number, y: number): Promise<string[]> {
    await this.page.mouse.click(x, y, { button: 'right' });
    return this.insertMenuNames();
  }

  /**
   * Right-clicks `field` and returns the Insert-variable menu's names - `[]` when no menu opens within
   * `timeout` (the Subject box offers none, smoke 1 / 21925) - then closes the menu again.
   */
  async insertMenuOn(field: Locator, timeout = 5_000): Promise<string[]> {
    await field.click({ button: 'right' });
    const opened = await this.page.locator(`[id^="${WRITER_A_IDS.trigger.insertVariablePrefix}"]`).first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!opened) return [];
    const names = await this.insertMenuNames();
    await this.drawer.closeInsertVariableMenu();
    return names;
  }

  /**
   * The Action select's text once the module change has settled: the select keeps showing the old action
   * for a moment before it empties (probe 2026-11-11: "Active / Inactive" at once, '' after 3 s). Waits up
   * to `timeout` for it to stop showing `previous`, then answers what it shows (still `previous` = never cleared).
   */
  async actionAfterModuleChange(previous: string, timeout = Timeouts.default): Promise<string> {
    const deadline = Date.now() + timeout;
    let shown = flat(await this.drawer.selected('action-select'));
    while (shown === previous && Date.now() < deadline) {
      await this.page.waitForTimeout(250);
      shown = flat(await this.drawer.selected('action-select'));
    }
    return shown;
  }

  async insertMenuNames(): Promise<string[]> {
    const prefix = WRITER_A_IDS.trigger.insertVariablePrefix;
    await this.page.locator(`[id^="${prefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.default });
    return this.page.locator(`[id^="${prefix}"]`).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e.textContent ?? '').trim().replace(/^\{\{|\}\}$/g, '')));
  }

  /** The first paragraph's text of template `t`'s rich body. */
  async firstBlockText(t: number): Promise<string> {
    return this.editor(t).evaluate((el) => ((el.querySelector('p, li, h1, h2, h3, div') ?? el) as HTMLElement).textContent ?? '');
  }

  // ---- exports ---------------------------------------------------------------------

  /** See `tryExport`. */
  async tryExport(scope: 'all' | 'selected', timeout = 30_000): Promise<ExportAttempt> {
    return tryExport(this.page, this.tab, scope, timeout);
  }

  // ---- another session's tab (permission cases) ------------------------------------

  /**
   * Opens Triggers (Email&SMS) in THIS page's session and reports what the
   * session got: GetTriggers' status (0 = none sent), and whether the search
   * box, the filter button and the table are on screen.
   */
  async probeTriggersTab(): Promise<{ listStatus: number; searchVisible: boolean; searchEnabled: boolean; filterVisible: boolean; tableVisible: boolean; url: string }> {
    const answer = this.page.waitForResponse((r) => r.url().includes('/TriggersConfiguration/GetTriggers'), { timeout: Timeouts.default }).catch(() => null);
    await this.goto(`${NC_ROUTE}?tab=triggers`);
    const r = await answer;
    await this.byId(NC_LIST.tableEl('triggers')).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
    const search = this.byId(NC_LIST.searchInput('triggers'));
    return {
      listStatus: r?.status() ?? 0,
      searchVisible: await search.isVisible().catch(() => false),
      searchEnabled: await search.isEnabled().catch(() => false),
      filterVisible: await this.byId(NC_LIST.filterButton('triggers')).isVisible().catch(() => false),
      tableVisible: await this.byId(NC_LIST.tableEl('triggers')).isVisible().catch(() => false),
      url: this.page.url(),
    };
  }

  /** Whether a row's Delete is on screen AND clickable. */
  async deleteUsable(id: string): Promise<boolean> {
    const del = this.tab.rowAction(id, 'delete');
    return (await del.isVisible().catch(() => false)) && (await del.isEnabled().catch(() => false));
  }
}

/**
 * Opens the tab's Export menu, clicks Selected Export / Export All Data, answers
 * a format dialog with Excel when one appears, and reports the download (or
 * the message shown instead) - never throws when no file comes.
 */
export async function tryExport(page: Page, tab: NcListTab, scope: 'all' | 'selected', timeout = 30_000): Promise<ExportAttempt> {
  const ids = { menu: NC_LIST.exportMenu(tab.tab as NcTab), item: scope === 'all' ? NC_LIST.exportAll(tab.tab as NcTab) : NC_LIST.exportSelected(tab.tab as NcTab) };
  if (!(await page.locator(`#${ids.menu}`).isVisible().catch(() => false))) await tab.openExportMenu();
  const download = page.waitForEvent('download', { timeout }).catch(() => null);
  await page.locator(`#${ids.item}`).click();
  const excel = tab.dialogAction('excel');
  if (await excel.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true).catch(() => false)) await excel.click();
  const toastWait = tab.toastText(Timeouts.toast);
  const d = await download;
  const toast = await toastWait;
  if (!d) return { downloaded: false, filename: '', sheet: null, isWorkbook: false, toast };
  const chunks: Buffer[] = [];
  for await (const chunk of await d.createReadStream()) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const isZip = bytes.subarray(0, 2).toString() === 'PK';
  let sheet: ParsedXlsx | null = null;
  try {
    sheet = isZip ? parseXlsx(bytes) : null;
  } catch {
    sheet = null;
  }
  const filename = d.suggestedFilename();
  return { downloaded: true, filename, sheet, isWorkbook: isZip && sheet !== null && /\.xlsx$/i.test(filename), toast };
}

// ---- predefined wording (edit, then ALWAYS put back) ------------------------------------

export interface RewordOutcome {
  name: string;
  save: SaveReport | null;
  expectedBody: string;
  storedAfterSave: string;
  restored: boolean;
  problem: string;
}

/**
 * Edits the English SMS wording of a PREDEFINED trigger through the screen
 * (appends `suffix`), saves, reads the stored body - and then ALWAYS puts the
 * original templates back through the API and reads them back (annotation
 * `predefined-not-restored` when that fails).
 */
export async function rewordPredefined(page: Page, view: WriterATriggers, id: string, suffix: string): Promise<RewordOutcome> {
  const original = await readTrigger(page, id);
  if (!original) return { name: id, save: null, expectedBody: '', storedAfterSave: '', restored: false, problem: `GetTrigger ${id} found nothing` };
  const out: RewordOutcome = { name: original.name, save: null, expectedBody: '', storedAfterSave: '', restored: false, problem: '' };
  try {
    await view.openRowEdit(id, original.name);
    const t = await view.indexOf('SMS', 'English');
    if (t < 0) throw new Error(`"${original.name}" shows no SMS/English template (cards: ${JSON.stringify(await view.templatePairs())})`);
    const before = await view.smsBody(t).inputValue();
    out.expectedBody = `${before}${suffix}`;
    await view.smsBody(t).fill(out.expectedBody);
    out.save = await view.saveAndReport();
    out.storedAfterSave = storedBody(await readTrigger(page, id), 'SMS/English');
  } catch (error) {
    out.problem = String(error instanceof Error ? error.message : error).split('\n')[0];
  } finally {
    await view.closeDrawer().catch(() => null);
    const current = await readTrigger(page, id);
    const merged = (current?.templates ?? []).map((t) => {
      const o = original.templates.find((x) => pairOf(x) === pairOf(t));
      return o ? { ...t, bodies: t.bodies.map((b, i) => ({ ...b, subject: o.bodies[i]?.subject ?? b.subject, body: o.bodies[i]?.body ?? b.body })) } : t;
    });
    const putBack = merged.length === original.templates.length ? merged : original.templates;
    await updateTrigger(page, id, { templates: putBack }, true).catch(() => null);
    let back = await readTrigger(page, id);
    if (back && !sameTemplates(back.templates, original.templates)) {
      await updateTrigger(page, id, { templates: original.templates }, true).catch(() => null);
      back = await readTrigger(page, id);
    }
    out.restored = !!back && sameTemplates(back.templates, original.templates);
    if (!out.restored) {
      base.info().annotations.push({ type: 'predefined-not-restored', description: `${original.name} (${id}) - put its templates back by hand` });
      Logger.error(`[writerA] predefined trigger "${original.name}" NOT restored`);
    }
  }
  return out;
}

// ---- App Notification list ---------------------------------------------------------------

/** The App Notification tab with Writer A's reads. */
export class WriterADefinitions extends DefinitionsTab {
  constructor(page: Page) {
    super(page);
  }

  async tryExport(scope: 'all' | 'selected', timeout = 30_000): Promise<ExportAttempt> {
    return tryExport(this.page, this, scope, timeout);
  }

  /** The toolbar's Export button. */
  exportControl(): Locator {
    return this.byId(NC_LIST.exportTrigger('definitions'));
  }

  /**
   * `sortOptionLabels`, then waits until the sort menu has really closed. Rerun 2026-11-12 (21549):
   * the menu was still animating shut when `sortBy` asked whether it was open, so `sortBy` skipped
   * opening it and its option click found no option.
   */
  async sortOptionLabelsClosed(): Promise<string[]> {
    const labels = await this.sortOptionLabels();
    await expect(this.byId(NC_LIST.sortMenu('definitions')), 'the sort menu should close after reading its options').toBeHidden({ timeout: Timeouts.default });
    return labels;
  }
}

/** Names of a sheet's rows (column "Name"), in file order. */
export function sheetNames(sheet: ParsedXlsx | null): string[] {
  return (sheet?.rows ?? []).map((r) => String((r as Record<string, unknown>).Name ?? '').trim());
}

/** Waits `ms` (definitions created "a few seconds apart" need distinct CreatedOn values). */
export async function pause(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export type { DefinitionVariable };

/** The message an API answer carries (successMessage / message / its validation errors), else its first 160 characters. */
export function answerMessage(answer: string): string {
  try {
    const a = JSON.parse(answer) as { successMessage?: string; message?: string; detail?: string; validationErrors?: unknown };
    const errors = Array.isArray(a.validationErrors) ? a.validationErrors.map(String).join('; ') : '';
    return flat(a.successMessage || a.message || a.detail || errors || answer.slice(0, 160));
  } catch {
    return flat(answer.slice(0, 160));
  }
}

/** Placeholder names used in a text ({{Name}}), each once. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}

/** A free action with its screen labels (module + action), for cases that SAVE through the Add drawer. */
export async function freeActionLabels(page: Page, exclude: readonly string[] = []): Promise<{ option: NcOption; module: string; action: string }> {
  const option = await freeAction(page, exclude);
  const catalogue = await triggerCatalogue(page);
  return { option, module: catalogue.moduleLabel(option.parentItemId ?? ''), action: option.englishName };
}

/** The trigger whose name is exactly `name` (null when none) and how many carry it. */
export async function triggersNamed(page: Page, name: string): Promise<{ count: number; first: { id: string; isActive: boolean } | null }> {
  const hits = (await listTriggers(page, { searchText: name })).items.filter((t) => t.name === name);
  return { count: hits.length, first: hits[0] ? { id: hits[0].id, isActive: hits[0].isActive } : null };
}
