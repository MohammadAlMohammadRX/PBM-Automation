import type { Locator, Page } from '@playwright/test';
import { expect, test as pwTest } from '@playwright/test';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { NotificationSettingsGuard, SuiteDefinitions, SuiteTriggers } from '../../fixtures/notificationModule.fixture';
import { TriggersTab, type ListAnswer, type NcExport } from '../../pages/notification/NotificationCenterPage';
import { TriggerDrawer, type DrawerSaveOutcome } from '../../pages/notification/Drawers';
import { NotificationSettingsPanel } from '../../pages/notification/NotificationSettingsPanel';
import { SettingsHubPage, type DrawerSaveOutcome as SettingsSaveOutcome } from '../../pages/settings/SettingsHubPage';
import { LanguageSwitcher, type AppLanguage } from '../../pages/components/LanguageSwitcher';
import { chooseSelectOption, readSelectOptions, setCheckbox } from '../../pages/components/PrimeControls';
import { NC_LIST, SETTINGS_NOTIFICATION_FIELDS, TRIGGER_DRAWER } from '../../constants/notification/notificationIds';
import { VARIABLE_FIELD, WRITER_B_PREFIX } from '../../constants/notification/writerBIds';
import { SETTINGS_DRAWER, SETTINGS_HUB, SETTINGS_TOAST } from '../../constants/settings/settingsIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { env } from '../../constants/EnvironmentConfig';
import { ACCESS_TOKEN_KEY } from '../../data/payers/lifecycleGuardrails.data';
import { Logger } from '../Logger';
import type { JobClock } from '../JobClock';
import { DateUtils } from '../DateUtils';
import { findPayer } from '../PayerFinder';
import { provisionFormulary, FORMULARY_SUITE_PAYER } from '../FormularyProvisioning';
import type { PayerStateFixtures } from '../../fixtures/payerState.fixture';
import type { PolicyModuleFixtures } from '../../fixtures/policyModule.fixture';
import { approvedNetworkAt, approvedPlanAt, waitForNetworkStatus } from '../jobDriven/lifecycle';
import {
  LIFECYCLE_JOB,
  TRIGGER_MODULE,
  freeTriggerActions,
  listTriggers,
  myNotifications,
  ncOptions,
  readTrigger,
  updateTrigger,
  waitForInboxItem,
  type DefinitionVariable,
  type InboxNotification,
  type TriggerRecord,
} from './notificationApi';
import { isGuardedNotificationKey } from './notificationSettings';

/**
 * Writer B helpers - Notification Center folders 09 (Sort and Export Triggers,
 * US 20986), 10 (Manage Trigger Variables, US 20987), 03 (Edit Notification
 * Archiving and Expiry Reminders, US 20868), 20 (Configure Expiry Reminder
 * Schedule, US 21006) and 30 (Edit Email Provider Settings, US 21022).
 *
 * Nothing here asserts a case's expectation: readers return what the screen /
 * API showed and each case asserts what IT expects (failure messages state what
 * was seen). Only the lead's shared layer is built on - never edited.
 *
 * SAFETY: every global value (archiving, reminder, SMTP) changes through the
 * Edit drawer or `rawUpsert` while the case holds `notificationSettingsGuard`
 * (restored + read back at teardown); `rawUpsert` refuses unguarded keys. No
 * password value is ever read, held or logged (no such key exists; any key
 * naming a password is only ever listed by NAME).
 */

// ---------------------------------------------------------------- text

/** Whitespace collapsed, em / en dashes read as a hyphen (lead decision 3). */
export function normalise(text: string): string {
  return text.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: false });

/** The first adjacent pair that is NOT in ascending (case-insensitive) order, or null. */
export function firstOutOfOrder(values: readonly string[]): string | null {
  for (let i = 1; i < values.length; i += 1) {
    if (collator.compare(values[i - 1], values[i]) > 0) return `"${values[i - 1]}" before "${values[i]}"`;
  }
  return null;
}

/** The values that appear in more than one run (i.e. are NOT grouped together). */
export function splitGroups(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const split = new Set<string>();
  for (let i = 0; i < values.length; i += 1) {
    if (i > 0 && values[i] === values[i - 1]) continue;
    if (seen.has(values[i])) split.add(values[i]);
    seen.add(values[i]);
  }
  return [...split];
}

/** 'asc' / 'desc' from a list answer's `sortBy` ("Name desc"), '' when unknown. */
export function directionOf(answer: ListAnswer | null): 'asc' | 'desc' | '' {
  const m = /\s(asc|desc)$/i.exec(String(answer?.request.sortBy ?? ''));
  return m ? (m[1].toLowerCase() as 'asc' | 'desc') : '';
}

/** The ids of a list answer, in order. */
export function answerIds(answer: ListAnswer | null): string[] {
  return (answer?.items ?? []).map((i) => String(i.id));
}

/** A string of `length` characters (letters, so no field strips it). */
export function textOfLength(length: number, seed = 'QA'): string {
  return `${seed}${'x'.repeat(Math.max(0, length - seed.length))}`.slice(0, length);
}

/**
 * Marks the case BLOCKED for data the run cannot produce - unless an earlier
 * step already FAILED: then the finding stays a FAIL and the reason is kept as
 * a note (lead decision 8; same rule as the settings module).
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = pwTest.info();
  if (info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `Could not be observed either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/** BLOCKS the case (unless an earlier step already failed) when `missing` is true - decided at run time. */
export function blockWhen(steps: TestSteps, missing: boolean, reason: string): void {
  if (missing) blockUnlessAStepFailed(steps, reason);
}

// ---------------------------------------------------------------- 09: trigger list

/** Triggers (Email&SMS) with the readers folder 09 needs. */
export class TriggerListView extends TriggersTab {
  constructor(page: Page) {
    super(page);
  }

  /** The header labels of `keys` (`nc-triggers-table-th-<key>`), as shown. */
  async headerLabels(keys: readonly string[]): Promise<string[]> {
    const out: string[] = [];
    for (const k of keys) out.push(normalise(await this.byId(NC_LIST.th('triggers', k)).innerText().catch(() => '')));
    return out;
  }

  /**
   * Picks the sort option `key` and makes the direction ascending (the menu keeps
   * the previous direction - probe 2026-11-11 saw "Name desc"). Returns the
   * answer the rows now show.
   */
  async sortAscending(key: string): Promise<ListAnswer | null> {
    const first = await this.sortBy(key);
    if (directionOf(first) !== 'desc') return first;
    Logger.step(`[triggers] ${key} came sorted descending - toggling the direction to ascending`);
    return this.toggleSortDirection();
  }

  /** Every row of the current page as `{ id, <column>: text }`. */
  async pageRows(columns: readonly string[]): Promise<Record<string, string>[]> {
    return this.readRows(columns);
  }

  /** Whether the export menu offers both entries (labels as shown) - closes nothing. */
  async exportMenuLabels(): Promise<string[]> {
    return this.openExportMenu();
  }
}

/** The two suite triggers of 21419 / 21421, named "... Order ...": one ACTIVE, one inactive. */
export async function createOrderTriggers(
  page: Page,
  suiteTriggers: SuiteTriggers,
  label: string,
): Promise<{ active: TriggerRecord; inactive: TriggerRecord }> {
  // The ACTIVE one on a free Member Management action when there is one (it would
  // only ever notify a member, and only for the seconds the case runs).
  const free = await freeTriggerActions(page);
  const member = free.find((a) => a.parentItemId === TRIGGER_MODULE.memberManagement);
  const active = await suiteTriggers.create({
    name: suiteTriggers.newName(label),
    isActive: true,
    ...(member ? { moduleId: TRIGGER_MODULE.memberManagement, actionId: member.id } : {}),
  });
  const inactive = await suiteTriggers.create({ name: suiteTriggers.newName(label), isActive: false });
  return { active, inactive };
}

/**
 * Every trigger the SAME list request matches (all pages, through the API) -
 * the request the screen sent, with paging widened. Answers the names.
 */
export async function namesForRequest(page: Page, answer: ListAnswer | null): Promise<{ names: string[]; totalRows: number }> {
  const criteria: Record<string, unknown> = { ...(answer?.request ?? {}) };
  delete criteria.pageNumber;
  delete criteria.rowsPerPage;
  const all = await listTriggers(page, criteria, 500);
  return { names: all.items.map((t) => t.name), totalRows: all.totalRows };
}

/** Every trigger, sorted as `sortBy` asks (API) - ids in order. */
export async function triggerIdsSorted(page: Page, sortBy: string): Promise<string[]> {
  return (await listTriggers(page, { sortBy }, 500)).items.map((t) => t.id);
}

/** The Name column of an export ([] when the file is not a workbook). */
export function exportNames(file: NcExport): string[] {
  return (file.sheet?.rows ?? []).map((r) => (r.Name ?? '').trim());
}

/** A one-line description of an export, for failure messages. */
export function describeExport(file: NcExport): string {
  const head = file.bytes.subarray(0, 2).toString();
  return `"${file.filename}" (${file.bytes.length} bytes, starts "${head}", ${file.sheet ? `headers [${file.sheet.headers.join(', ')}], ${file.sheet.rows.length} row(s)` : 'not a workbook'})`;
}

// ---------------------------------------------------------------- 10: Manage Variables

/** A variable of a suite trigger that is NOT required (falls back to the first). */
export function optionalVariable(record: TriggerRecord): DefinitionVariable {
  const v = record.variableDefinitions.find((x) => !x.isRequired) ?? record.variableDefinitions[0];
  if (!v) throw new Error(`trigger "${record.name}" has no variables`);
  return v;
}

/** Stores a Sample Value on a SUITE trigger's variable through the API (UpdateTrigger refuses any other trigger). */
export async function storeSampleValue(page: Page, id: string, name: string, value: string): Promise<number> {
  const record = await readTrigger(page, id);
  if (!record) throw new Error(`GetTrigger ${id} found nothing`);
  const variableDefinitions = record.variableDefinitions.map((v) => (v.name === name ? { ...v, sampleValue: value } : v));
  return (await updateTrigger(page, id, { variableDefinitions })).status;
}

/** The stored definition of variable `name` on trigger `id` (GetTrigger), null when absent. */
export async function storedVariable(page: Page, id: string, name: string): Promise<DefinitionVariable | null> {
  return (await readTrigger(page, id))?.variableDefinitions.find((v) => v.name === name) ?? null;
}

export type VariableCheckbox = 'use-as-default-checkbox' | 'is-required-checkbox' | 'is-sensitive-checkbox';
export type VariableField = keyof typeof VARIABLE_FIELD;

/** What pressing Save in the Variables view produced. */
export interface VariablesSaveOutcome {
  toast: string;
  /** Whether the Variables view is still shown (a refused save keeps it). */
  panelOpen: boolean;
  /** Every variable-level validation line visible afterwards. */
  errors: string[];
}

/** The trigger drawer's Manage Variables view (folder 10). */
export class TriggerVariablesView extends TriggerDrawer {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Opens the trigger's Edit drawer from the list (searched by name) and its
   * Manage Variables view. A custom trigger opens on General (Next goes to
   * Content); a predefined one opens on Content.
   */
  async openVariablesOf(list: TriggersTab, id: string, name: string): Promise<void> {
    await list.search(name);
    await list.rowAction(id, 'edit').click();
    await this.waitForOpen();
    const onContent = await this.el('manageVariables').waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
    if (!onContent) {
      await this.next();
      await expect(this.el('manageVariables'), 'Next should reach the Content step').toBeVisible({ timeout: Timeouts.default });
    }
    await this.openVariables();
  }

  /** Whether the Variables view is shown. */
  async panelOpen(timeout = 500): Promise<boolean> {
    return this.byId(TRIGGER_DRAWER.variables.back).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  backButton(): Locator {
    return this.byId(TRIGGER_DRAWER.variables.back);
  }

  /** The variable names the view lists, in order (the name element of each block). */
  async listedNames(): Promise<string[]> {
    const prefix = WRITER_B_PREFIX.triggerVariable;
    return this.page.locator(`[id^="${prefix}"]`).evaluateAll(
      (els, p) => els
        .filter((e) => !e.id.slice(p.length).includes('-'))
        .map((e) => (e.textContent ?? '').trim())
        .filter(Boolean),
      prefix,
    );
  }

  /** Ids of any control that would add / remove / delete a variable (there should be none). */
  async addRemoveControls(): Promise<string[]> {
    const prefixes = [WRITER_B_PREFIX.triggerVariable, WRITER_B_PREFIX.triggerVariablesView];
    const ids: string[] = [];
    for (const prefix of prefixes) {
      ids.push(...(await this.page.locator(`[id^="${prefix}"]`).evaluateAll((els) => els.map((e) => e.id))));
    }
    return ids.filter((id) => /(add|remove|delete|new)(-|$)/.test(id));
  }

  /** The name element of a variable block (`...-variable-<name>`). */
  nameElement(name: string): Locator {
    return this.byId(`${WRITER_B_PREFIX.triggerVariable}${name.toLowerCase()}`);
  }

  /** What kind of element shows the name: its tag, whether it is editable, and how many inputs it holds. */
  async nameElementKind(name: string): Promise<{ tag: string; editable: boolean; inputs: number }> {
    return this.nameElement(name).evaluate((el) => ({
      tag: el.tagName.toLowerCase(),
      editable: (el as HTMLElement).isContentEditable || ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase()),
      inputs: el.querySelectorAll('input, textarea, [contenteditable="true"]').length,
    }));
  }

  /** Clicks the name and types `text` (an attempt to edit it). */
  async typeOnName(name: string, text: string): Promise<void> {
    await this.nameElement(name).click();
    await this.page.keyboard.type(text);
  }

  /** A field of a variable: one of VARIABLE_FIELD (masking etc.) or the lead's sample / description / checkbox ids. */
  fieldOf(name: string, key: VariableField): Locator {
    return this.byId(TRIGGER_DRAWER.variables.field(name, VARIABLE_FIELD[key]));
  }

  sample(name: string): Locator {
    return this.byId(TRIGGER_DRAWER.variables.sampleValue(name));
  }

  descriptionInput(name: string): Locator {
    return this.byId(TRIGGER_DRAWER.variables.description(name));
  }

  checkbox(name: string, which: VariableCheckbox): Locator {
    return this.variable(name, which);
  }

  async tick(name: string, which: VariableCheckbox, value: boolean): Promise<void> {
    await setCheckbox(this.checkbox(name, which), value);
  }

  /** Types into a text field key by key (as a user does - a maxlength applies). */
  async typeInto(field: Locator, text: string): Promise<void> {
    await field.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    if (text) await field.pressSequentially(text);
  }

  async setSample(name: string, text: string): Promise<void> {
    await this.typeInto(this.sample(name), text);
  }

  async setDescription(name: string, text: string): Promise<void> {
    await this.typeInto(this.descriptionInput(name), text);
  }

  /** Picks a Masking Mode by its label (None / Full / Keep First / Keep Last / Keep First & Last). */
  async setMaskingMode(name: string, label: string): Promise<void> {
    await chooseSelectOption(this.page, this.fieldOf(name, 'maskingMode').locator('xpath=descendant-or-self::*[@role="combobox"]').first(), label);
  }

  async maskingModeOptions(name: string): Promise<string[]> {
    return readSelectOptions(this.page, this.fieldOf(name, 'maskingMode').locator('xpath=descendant-or-self::*[@role="combobox"]').first());
  }

  async setMaskChar(name: string, text: string): Promise<void> {
    await this.typeInto(this.fieldOf(name, 'maskChar'), text);
  }

  /** Types into a number box (Keep First / Keep Last) and leaves it - the value reaches the form on blur. */
  async setNumber(name: string, key: 'keepFirst' | 'keepLast', value: string): Promise<void> {
    await this.typeInto(this.fieldOf(name, key), value);
    await this.fieldOf(name, key).press('Tab');
  }

  /** Which masking fields are visible now. */
  async maskingFieldsShown(name: string): Promise<{ maskingMode: boolean; maskChar: boolean; keepFirst: boolean; keepLast: boolean }> {
    return {
      maskingMode: await this.fieldOf(name, 'maskingMode').isVisible().catch(() => false),
      maskChar: await this.fieldOf(name, 'maskChar').isVisible().catch(() => false),
      keepFirst: await this.fieldOf(name, 'keepFirst').isVisible().catch(() => false),
      keepLast: await this.fieldOf(name, 'keepLast').isVisible().catch(() => false),
    };
  }

  /** A variable-level line ('' when not shown): config-error / required-error / mask-preview. */
  async line(name: string, key: 'configError' | 'requiredError' | 'maskPreview'): Promise<string> {
    const l = this.fieldOf(name, key);
    return (await l.isVisible().catch(() => false)) ? normalise(await l.innerText()) : '';
  }

  /** Every visible variable-level validation line. */
  async visibleErrors(): Promise<string[]> {
    const prefix = WRITER_B_PREFIX.triggerVariable;
    return this.page.locator(`[id^="${prefix}"][id$="-error"]`).evaluateAll((els) => els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean));
  }

  /**
   * The visible variable-level lines once they settle: read again every 250 ms
   * until none shows or `timeoutMs` passed. Answers what is still shown then
   * (a line that stays is stale, not a passing flash).
   */
  async errorsAfterSettling(timeoutMs = 3_000): Promise<string[]> {
    const end = Date.now() + timeoutMs;
    let errors = await this.visibleErrors();
    while (errors.length && Date.now() < end) {
      await this.page.waitForTimeout(250);
      errors = await this.visibleErrors();
    }
    return errors.map(normalise);
  }

  /** Presses Save in the Variables view and reports the toast, whether the view stayed and the errors shown. */
  async saveVariables(): Promise<VariablesSaveOutcome> {
    const toast = await this.variablesSave();
    const panelOpen = await this.backButton().waitFor({ state: 'hidden', timeout: 1_500 }).then(() => false).catch(() => true);
    const errors = panelOpen ? await this.visibleErrors() : [];
    Logger.step(`[variables] Save -> toast "${toast}", view ${panelOpen ? 'still open' : 'closed'}${errors.length ? `, errors: ${errors.join(' | ')}` : ''}`);
    return { toast: normalise(toast), panelOpen, errors: errors.map(normalise) };
  }

  /** Cancel in the Variables view (discards its changes). */
  async cancelVariables(): Promise<void> {
    await this.btn(TRIGGER_DRAWER.variables.cancel).click();
    await expect(this.backButton()).toBeHidden({ timeout: Timeouts.default });
  }

  /** Saves the Variables view and then the trigger (UpdateTrigger). */
  async saveVariablesAndTrigger(): Promise<{ variables: VariablesSaveOutcome; trigger: DrawerSaveOutcome | null }> {
    const variables = await this.saveVariables();
    if (variables.panelOpen) return { variables, trigger: null };
    return { variables, trigger: await this.save() };
  }

  /** Opens the Variables view again from the Content step when it is not shown (e.g. after a save went through). */
  async ensureVariablesOpen(): Promise<void> {
    if (await this.panelOpen(300)) return;
    await this.openVariables();
  }

  /**
   * 21446: walks the Default / Sensitive toggle sequence on `name` and answers
   * every state whose dependent fields did not follow (Masking Mode and Mask
   * Character shown exactly while Sensitive is ticked, "*" by default).
   */
  async walkToggles(name: string, sequence: readonly { default: boolean; sensitive: boolean }[]): Promise<string[]> {
    const problems: string[] = [];
    for (const [i, s] of sequence.entries()) {
      await this.tick(name, 'use-as-default-checkbox', s.default);
      await this.tick(name, 'is-sensitive-checkbox', s.sensitive);
      const shown = await this.maskingFieldsShown(name);
      const state = `state ${i + 1} (Default ${s.default ? 'on' : 'off'}, Sensitive ${s.sensitive ? 'on' : 'off'})`;
      if (shown.maskingMode !== s.sensitive) problems.push(`${state}: Masking Mode ${shown.maskingMode ? 'shown' : 'hidden'}`);
      if (shown.maskChar !== s.sensitive) problems.push(`${state}: Mask Character ${shown.maskChar ? 'shown' : 'hidden'}`);
      const char = s.sensitive ? await this.fieldOf(name, 'maskChar').inputValue().catch(() => '') : '*';
      if (char !== '*') problems.push(`${state}: Mask Character reads "${char}", not the default "*"`);
      const errors = await this.visibleErrors();
      if (errors.length) problems.push(`${state}: stale messages ${errors.join(' | ')}`);
    }
    return problems;
  }

  /**
   * 21446: with Default ticked, empties the Sample Value, presses Save and puts
   * the sample back. Answers what the refused save showed.
   */
  async defaultWithoutSample(name: string): Promise<VariablesSaveOutcome> {
    const sample = await this.sample(name).inputValue();
    await this.tick(name, 'use-as-default-checkbox', true);
    await this.setSample(name, '');
    const outcome = await this.saveVariables();
    await this.ensureVariablesOpen();
    await this.setSample(name, sample);
    return outcome;
  }

  /** Closes the drawer when it is still open (discarding). */
  async closeIfOpen(): Promise<void> {
    if (await this.panelOpen(300)) await this.cancelVariables().catch(() => undefined);
    if (await this.isOpen(300)) await this.close('discard');
  }
}

/** A one-line description of a variables save + trigger save, for failure messages. */
export function describeSave(o: { variables: VariablesSaveOutcome; trigger: DrawerSaveOutcome | null }): string {
  const v = `Variables Save -> toast "${o.variables.toast}", view ${o.variables.panelOpen ? 'stayed open' : 'closed'}${o.variables.errors.length ? `, errors [${o.variables.errors.join(' | ')}]` : ''}`;
  const t = o.trigger ? `; trigger Save -> ${o.trigger.status ?? 'no request'} "${o.trigger.toast}" ${o.trigger.answer.slice(0, 200)}` : '; trigger not saved';
  return v + t;
}

/** Whether a variables + trigger save went through (the view closed and UpdateTrigger answered 2xx). */
export function savedThrough(o: { variables: VariablesSaveOutcome; trigger: DrawerSaveOutcome | null }): boolean {
  return !o.variables.panelOpen && !!o.trigger && o.trigger.status !== null && o.trigger.status < 300;
}

// ---------------------------------------------------------------- 03 / 20 / 30: settings drawer

export type NumberSetting = 'autoArchiveAnnouncements' | 'autoArchiveNotifications' | 'reminderBeforeDays';
export type TextSetting = 'smtpFromEmail' | 'smtpPort' | 'smtpServer' | 'smtpUser';

/** What one Save of the Edit Setting drawer produced, plus every message on screen. */
export interface SettingsSave {
  outcome: SettingsSaveOutcome;
  /** Toast + drawer text after the save (normalised). */
  messages: string;
  /** A one-line summary for failure messages. */
  said: string;
}

/**
 * System Settings > General > Edit Setting - the notification / SMTP parts
 * (the lead's NotificationSettingsPanel) with the hub around it.
 */
export class NotificationSettingsView extends NotificationSettingsPanel {
  readonly hub: SettingsHubPage;
  readonly language: LanguageSwitcher;

  constructor(page: Page) {
    super(page);
    this.hub = new SettingsHubPage(page);
    this.language = new LanguageSwitcher(page);
  }

  /** Opens System Settings > Settings (General) and waits for its values. */
  async openHub(): Promise<void> {
    await this.hub.open();
  }

  editButton(): Locator {
    return this.hub.editButton();
  }

  drawerTitle(): Locator {
    return this.hub.drawerTitle();
  }

  async openEdit(): Promise<void> {
    await this.hub.openEdit();
  }

  /** Types a number box key by key (as a user does: the box's own rules apply) and leaves it. */
  async typeNumber(key: NumberSetting, text: string): Promise<void> {
    const f = this.field(key);
    await f.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    if (text) await f.pressSequentially(text, { delay: 20 });
    await f.press('Tab');
  }

  /** Replaces a text box's value (SMTP) and leaves it. */
  async setText(key: TextSetting, text: string): Promise<void> {
    await this.field(key).fill(text);
    await this.field(key).press('Tab');
  }

  async chooseRemindEvery(label: string): Promise<void> {
    await chooseSelectOption(this.page, this.field('remindEverySelect').locator('xpath=descendant-or-self::*[@role="combobox"]').first(), label);
  }

  /** The drawer's own text (normalised), '' when closed. */
  async drawerText(): Promise<string> {
    return normalise(await this.byId(SETTINGS_DRAWER.drawer).innerText().catch(() => ''));
  }

  /** Presses Save and gathers the outcome and every message shown. */
  async save(): Promise<SettingsSave> {
    const outcome = await this.hub.saveAndCapture();
    const toasts = await this.byId(SETTINGS_TOAST.toast).allInnerTexts().catch(() => [] as string[]);
    const messages = normalise([outcome.toast, ...toasts, outcome.drawerOpen ? await this.drawerErrors() : ''].filter(Boolean).join(' | '));
    const sent = JSON.stringify(outcome.sent?.settings ?? null).slice(0, 200);
    const said = `Save -> ${outcome.status ?? 'no request'}, sent ${sent}, answer ${outcome.answer.slice(0, 200)}; drawer ${outcome.drawerOpen ? 'open' : 'closed'}; shown: ${messages.slice(0, 300) || 'nothing'}`;
    return { outcome, messages, said };
  }

  /** The drawer's inline error lines (ids ending in -error), normalised and joined. */
  async drawerErrors(): Promise<string> {
    const lines = await this.page.locator(`[id^="settings-general-"][id$="-error"]`).evaluateAll((els) => els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => (e.textContent ?? '').trim()));
    return normalise(lines.join(' | '));
  }

  /** Ids of the visible drawer controls starting with `prefix`. */
  async controlIds(prefix: string): Promise<string[]> {
    return this.page.locator(`[id^="${prefix}"]`).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.id));
  }

  /** The expiry-reminder controls of the open drawer (ids). */
  async reminderControlIds(): Promise<string[]> {
    return this.controlIds(WRITER_B_PREFIX.reminderControls);
  }

  /**
   * Any password control in the open drawer: ids naming a password, and
   * password-type inputs inside the drawer. Only ids / counts - never a value.
   */
  async passwordControls(): Promise<{ ids: string[]; passwordInputs: number }> {
    const ids = await this.page.locator('[id^="settings-general-"]').evaluateAll((els) => els.map((e) => e.id).filter((id) => /pass|secret/i.test(id)));
    const passwordInputs = await this.byId(SETTINGS_DRAWER.drawer).locator('input[type="password"]').count();
    return { ids, passwordInputs };
  }

  /** The read view's value under `label` (the line after it), '' when absent. */
  async readView(label: string): Promise<string> {
    return this.hub.readViewValue(label);
  }

  /** The read view's whole text (normalised). */
  async readViewText(): Promise<string> {
    return normalise(await this.hub.outletText());
  }

  /** The read view lines from heading `start` up to (not including) heading `end`, joined (normalised). */
  async readViewSection(start: string, end: string): Promise<string> {
    const lines = (await this.byId(SETTINGS_HUB.outlet).innerText().catch(() => '')).split('\n').map((s) => s.trim()).filter(Boolean);
    const from = lines.indexOf(start);
    const to = lines.indexOf(end, from + 1);
    return from < 0 ? '' : normalise(lines.slice(from, to < 0 ? undefined : to).join(' | '));
  }

  /** How many lines of the read view are exactly `label`. */
  async labelCount(label: string): Promise<number> {
    const text = await this.byId(SETTINGS_HUB.outlet).innerText().catch(() => '');
    return text.split('\n').map((s) => s.trim()).filter((l) => l === label).length;
  }

  /**
   * Opens the drawer (if needed), types `text` into a number box, notes what the
   * box shows after leaving it, and presses Save.
   */
  async attemptNumber(key: NumberSetting, text: string): Promise<SettingsSave & { boxShowed: string }> {
    await this.openEdit();
    await this.typeNumber(key, text);
    const boxShowed = await this.field(key).inputValue();
    const saved = await this.save();
    Logger.step(`[settings] ${key} typed "${text}" -> box "${boxShowed}"; ${saved.said}`);
    return { ...saved, boxShowed, said: `typed "${text}", the box showed "${boxShowed}"; ${saved.said}` };
  }

  /**
   * Puts every guarded value back to the case's starting values
   * (guard.restoreNow - restored and read back) and reloads the hub, so the
   * next attempt starts from the stored ORIGINAL (the drawer only sends keys
   * that differ from what it loaded). Call before switching the language: the
   * reload is a navigation.
   */
  async restoreAndReload(guard: NotificationSettingsGuard): Promise<void> {
    await this.cancelIfOpen();
    await guard.restoreNow();
    await this.openHub();
  }

  /** Opens the drawer (if needed), picks a Remind every option and presses Save. */
  async attemptRemindEvery(label: string): Promise<SettingsSave> {
    await this.openEdit();
    await this.chooseRemindEvery(label);
    return this.save();
  }

  /** Closes the drawer when it is open (Cancel - no prompt in this build). */
  async cancelIfOpen(): Promise<void> {
    if (await this.hub.isDrawerOpen(500)) await this.cancel();
  }

  /** Switches the UI language (header toggle); closes the drawer first. */
  async switchLanguage(lang: AppLanguage): Promise<void> {
    await this.cancelIfOpen();
    await this.language.switchTo(lang);
  }
}

/** What a raw UpsertSystemSettings produced. */
export interface RawUpsertAnswer {
  status: number;
  reasons: string[];
  text: string;
}

/**
 * PUT UpsertSystemSettings straight to the server (bypassing the drawer) with
 * `Accept-Language: <lang>` - the header the application sends - so the
 * refusal comes back in that language. Only keys the guard holds are allowed;
 * an ACCEPTED write is put back at once (guard.restoreNow) and still reported.
 */
export async function rawUpsert(
  page: Page,
  guard: NotificationSettingsGuard,
  settings: { key: string; value: string }[],
  lang: AppLanguage,
): Promise<RawUpsertAnswer> {
  const bad = settings.map((s) => s.key).filter((k) => !isGuardedNotificationKey(k) || !(k in guard.original));
  if (bad.length) throw new Error(`rawUpsert refuses keys the guard does not hold: ${bad.join(', ')}`);
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const res = await page.request.fetch(`${env.baseUrl}${ApiEndpoints.systemSettingsUpsert}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json', 'Accept-Language': lang },
    data: { settings },
    failOnStatusCode: false,
  });
  const text = await res.text();
  const reasons: string[] = [];
  try {
    const body = JSON.parse(text) as { ValidationErrors?: { Reason?: string }[]; message?: string; detail?: string; title?: string };
    for (const e of body.ValidationErrors ?? []) if (e.Reason) reasons.push(e.Reason);
    if (!reasons.length && res.status() >= 400) reasons.push(body.message ?? body.detail ?? body.title ?? '');
  } catch {
    if (res.status() >= 400) reasons.push(text.slice(0, 200));
  }
  Logger.step(`[rawUpsert ${lang}] ${settings.map((s) => `${s.key}=${JSON.stringify(s.value)}`).join(', ')} -> ${res.status()} ${reasons.join(' | ')}`);
  if (res.status() < 300) {
    Logger.warn('[rawUpsert] the server ACCEPTED the value - restoring the original at once');
    await guard.restoreNow();
  }
  return { status: res.status(), reasons: reasons.map(normalise), text: text.slice(0, 300) };
}

/** Whether the stored values of `keys` still equal the guard's snapshot (and which differ). */
export async function changedKeys(guard: NotificationSettingsGuard, keys: readonly string[]): Promise<string[]> {
  const now = await guard.current();
  return keys.filter((k) => now[k] !== guard.original[k]).map((k) => `${k}: "${guard.original[k]}" -> "${now[k]}"`);
}

/** The SETTINGS_NOTIFICATION_FIELDS key of each guarded setting the drawer edits. */
export const FIELD_KEY: Readonly<Record<NumberSetting | TextSetting, string>> = {
  autoArchiveAnnouncements: 'Notifi.AutoArchiveAnnouncementsAfterRead',
  autoArchiveNotifications: 'Notifi.AutoArchiveNotificationsAfterRead',
  reminderBeforeDays: 'NotifiConfig.ExpiryReminderBeforeDays',
  smtpFromEmail: 'SMTP.FromEmail',
  smtpPort: 'SMTP.Port',
  smtpServer: 'SMTP.Server',
  smtpUser: 'SMTP.User',
};
export const REMIND_EVERY_KEY = 'NotifiConfig.ExpiryReminderEveryDays';
export { SETTINGS_NOTIFICATION_FIELDS };

// ---------------------------------------------------------------- 03 / 20: Expiring Soon runs

export type ExpiringKind = 'payer' | 'network' | 'plan' | 'policy' | 'formulary';

/**
 * The fixtures that make the suite's OWN payer / policy (both removed at
 * teardown): `publishPayer` (payer module - create, give it a seeded network,
 * send, approve; purged after) and `policyIn` (policy module - a suite policy,
 * discarded after). A failure there BLOCKS the case at once with the
 * application's answer (blockedByPrecondition), so nothing else is made.
 */
export interface ExpiringMakers {
  publishPayer: PayerStateFixtures['publishPayer'];
  policyIn: PolicyModuleFixtures['policyIn'];
}

/** One kind's record for an Expiring Soon check: made by the suite, or missing. */
export interface ExpiringRecord {
  kind: ExpiringKind;
  /** The record's name ('' when missing). */
  name: string;
  /** 'made' = the suite's own; 'missing' = none could be had. */
  source: 'made' | 'missing';
  /** When it becomes effective (made records) - the job must run after it. */
  effectiveAt: Date | null;
  expiryDate: string;
  why: string;
  id: string;
  /** What the register said when it was made ('' when not read) - the payer's status, read back after approval. */
  state: string;
}

const KIND_LABEL: Record<ExpiringKind, string> = { payer: 'Payer', network: 'Network', plan: 'Plan', policy: 'Policy', formulary: 'Formulary' };

/** The module / action ids of "Expiring Soon - <Kind>" (GetOptions). */
export async function expiringSoonAction(page: Page, kind: ExpiringKind): Promise<{ moduleId: string; actionId: string; label: string }> {
  const label = `Expiring Soon - ${KIND_LABEL[kind]}`;
  const action = (await ncOptions(page)).actions.find((a) => a.englishName === label);
  if (!action?.parentItemId) throw new Error(`GetOptions offers no "${label}" action`);
  return { moduleId: action.parentItemId, actionId: action.id, label };
}

/** An ACTIVE suite app notification on "Expiring Soon - <Kind>" for careconnect (the fixture deletes it). */
export async function expiringSoonDefinition(page: Page, suiteDefinitions: SuiteDefinitions, kind: ExpiringKind): Promise<{ id: string; name: string }> {
  const target = await expiringSoonAction(page, kind);
  return suiteDefinitions.create({
    name: suiteDefinitions.newName(`expiring ${kind}`),
    moduleId: target.moduleId,
    actionId: target.actionId,
    isActive: true,
    englishMessageTemplate: `QA automation: a ${kind} expires soon`,
    arabicMessageTemplate: 'اختبار آلي: سجل ينتهي قريبًا',
  });
}

const DAY_MS = 86_400_000;
/** Whether `iso` is in the future and at most `days` days ahead. */
const withinDays = (iso: string, days: number): boolean => {
  // ISO from the API; a DD/MM/YYYY (the wizard's form) is read as the END of that day.
  const ui = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(iso);
  const at = ui ? new Date(Number(ui[3]), Number(ui[2]) - 1, Number(ui[1]), 23, 59).getTime() : new Date(iso).getTime();
  return Number.isFinite(at) && at > Date.now() && at <= Date.now() + days * DAY_MS;
};

/**
 * A record of `kind` that is (or will be, once its job runs) Active and expires
 * within `days` - always the suite's OWN:
 * - payer: `publishPayer` (effective 30 days back, so Active once approved;
 *   expiry date `days - 1` days ahead - a date-only expiry, still inside `days`);
 * - policy: `policyIn('Future')` going live in 4 minutes, grace 0, expiring
 *   `days - 1` days ahead (the policy job makes it Active - folder 11's route);
 * - network / plan / formulary: approved, effective in 4 minutes, expiring
 *   `days - 1` days ahead.
 * Payer / policy failures BLOCK at once (their fixtures); the others answer
 * 'missing' with the reason.
 */
export async function expiringRecord(page: Page, kind: ExpiringKind, days: number, make: ExpiringMakers): Promise<ExpiringRecord> {
  const effectiveAt = new Date(Date.now() + 4 * 60_000);
  const expiryAt = new Date(Date.now() + Math.max(1, days - 1) * DAY_MS);
  const base = { kind, effectiveAt: null as Date | null, expiryDate: '', why: '', id: '', name: '', state: '' };
  // Outside the try below: these fixtures BLOCK (skip) on failure, which must not be caught.
  if (kind === 'payer') {
    const p = await make.publishPayer({ expiryDate: DateUtils.futureDate(Math.max(1, days - 1)) });
    // Read back (GetPayers): the precondition is an ACTIVE payer expiring within `days` - approval alone does not prove it.
    const row = await findPayer(page, (r) => r.payerNameEn === p.nameEn, `the suite payer "${p.nameEn}"`, []);
    const state = row ? (row.isActive ? 'Active' : 'not Active') : 'not found in the register';
    const expiry = row?.expiryDate ?? p.expiryDate;
    const made = { ...base, name: p.nameEn, expiryDate: expiry, state };
    if (!row?.isActive || !withinDays(expiry, days)) {
      return { ...made, source: 'missing', why: `the suite payer "${p.nameEn}" was published but reads ${state}, expiry ${expiry} (needs Active, expiring within ${days} days)` };
    }
    return { ...made, source: 'made' };
  }
  if (kind === 'policy') {
    const pol = await make.policyIn('Future', { effectiveDate: effectiveAt.toISOString(), expiryDate: expiryAt.toISOString(), gracePeriodDays: 0 });
    return { ...base, source: 'made', id: pol.id, name: pol.policyNumber || pol.nameEn, effectiveAt, expiryDate: pol.expiryDate || expiryAt.toISOString() };
  }
  try {
    if (kind === 'network') {
      const n = await approvedNetworkAt(page, { effectiveAt, expiryAt });
      return { ...base, source: 'made', id: n.id, name: n.name, effectiveAt, expiryDate: expiryAt.toISOString() };
    }
    if (kind === 'plan') {
      const p = await approvedPlanAt(page, { effectiveAt, expiryAt });
      return { ...base, source: 'made', id: p.id, name: p.name, effectiveAt, expiryDate: expiryAt.toISOString() };
    }
    const f = await provisionFormulary(page, { payerName: FORMULARY_SUITE_PAYER, effectiveInMinutes: 4, expiryInDays: Math.max(1, days - 1) });
    return { ...base, source: 'made', id: f.id, name: f.formularyNameEn, effectiveAt, expiryDate: f.expiryDate };
  } catch (error) {
    return { ...base, source: 'missing', why: `the suite could not make one: ${String(error).split('\n')[0].slice(0, 200)}` };
  }
}

/** Kinds made through a fixture that BLOCKS on failure - made first, so nothing else is created when one blocks. */
const FIXTURE_KINDS: ReadonlySet<ExpiringKind> = new Set<ExpiringKind>(['payer', 'policy']);

/**
 * The record of every kind, in the order asked. The fixture-made kinds go
 * first; when a kind is missing nothing more is made (the case will be
 * BLOCKED) and only the records had so far are answered.
 */
export async function expiringRecords(page: Page, kinds: readonly ExpiringKind[], days: number, make: ExpiringMakers): Promise<ExpiringRecord[]> {
  const order = [...kinds].sort((a, b) => Number(!FIXTURE_KINDS.has(a)) - Number(!FIXTURE_KINDS.has(b)));
  const had: ExpiringRecord[] = [];
  for (const kind of order) {
    const record = await expiringRecord(page, kind, days, make);
    had.push(record);
    if (record.source === 'missing') break;
  }
  const out = kinds.map((k) => had.find((r) => r.kind === k)).filter((r): r is ExpiringRecord => !!r);
  Logger.step(`[expiring] ${out.map((r) => `${r.kind}: ${r.source}${r.name ? ` "${r.name}"` : ''}${r.expiryDate ? ` expiry ${r.expiryDate}` : ''}${r.state ? ` (${r.state})` : ''}${r.why ? ` (${r.why})` : ''}`).join('; ')}`);
  return out;
}

/** The kinds that could not be had, as one reason line ('' when none). */
export function missingKinds(records: readonly ExpiringRecord[]): string {
  return records.filter((r) => r.source === 'missing').map((r) => `${r.kind}: ${r.why}`).join('; ');
}

/** BLOCKS the case (unless a step already failed) when a kind's record could not be had (lead decision 8). */
export function blockIfAnyMissing(steps: TestSteps, records: readonly ExpiringRecord[], reason: (missing: string) => string): void {
  const missing = missingKinds(records);
  if (missing) blockUnlessAStepFailed(steps, reason(missing));
}

/** BLOCKS the case when the stored schedule is not the default (21628 - "never configured" cannot be proven). */
export function blockUnlessDefaults(
  steps: TestSteps,
  stored: Readonly<Record<string, string>>,
  defaults: { reminderBefore: string; remindEveryStored: string },
  reason: (reminder: string, every: string) => string,
): void {
  const reminder = stored['NotifiConfig.ExpiryReminderBeforeDays'] ?? '';
  const every = stored[REMIND_EVERY_KEY] ?? '';
  if (reminder !== defaults.reminderBefore || every !== defaults.remindEveryStored) blockUnlessAStepFailed(steps, reason(reminder, every));
}

/** Whether a refused save really refused: no request accepted. */
export function refused(save: SettingsSave): boolean {
  return save.outcome.status === null || save.outcome.status >= 400;
}

/**
 * A save of an invalid value counts as refused-or-prevented when the server
 * refused it with `message`, or when the box never let the value through so
 * nothing was sent (HOW of 21960: "a box that refuses the keystrokes is
 * recorded as prevention").
 */
export function refusedOrPrevented(save: SettingsSave & { boxShowed: string }, message: string | RegExp): boolean {
  const said = typeof message === 'string' ? save.messages.includes(normalise(message)) : message.test(save.messages);
  return (refused(save) && said) || save.outcome.status === null;
}

/** What one kind's job run produced. */
export interface ExpiringSoonResult {
  kind: ExpiringKind;
  record: string;
  definition: string;
  jobFiresAt: string;
  notification: InboxNotification | null;
}

/**
 * Moves each kind's lifecycle job to run after its record became effective,
 * then waits (bounded) for an inbox item of that kind's suite definition in
 * careconnect's inbox. Answers per kind what arrived (null = nothing).
 */
export async function awaitExpiringSoon(
  page: Page,
  jobClock: JobClock,
  runs: readonly { record: ExpiringRecord; definition: { id: string; name: string } }[],
  waitMs = 5 * 60_000,
): Promise<ExpiringSoonResult[]> {
  const fires: Date[] = [];
  for (const r of runs) {
    const after = r.record.effectiveAt ? Math.ceil((r.record.effectiveAt.getTime() - Date.now()) / 60_000) + 2 : 2;
    const move = await jobClock.moveTo(LIFECYCLE_JOB[r.record.kind], Math.max(2, after));
    fires.push(move.firesAt);
  }
  const out: ExpiringSoonResult[] = [];
  for (let i = 0; i < runs.length; i += 1) {
    const r = runs[i];
    const remaining = Math.max(60_000, fires[i].getTime() - Date.now() + waitMs);
    const hit = await waitForInboxItem(() => myNotifications(page, { rows: 50 }), (n) => n.type === r.definition.name, remaining, 10_000);
    out.push({ kind: r.record.kind, record: r.record.name, definition: r.definition.name, jobFiresAt: fires[i].toISOString(), notification: hit });
  }
  return out;
}

/** The ids of careconnect's inbox items of `definition` now. */
async function definitionItemIds(page: Page, definition: { name: string }): Promise<Set<string>> {
  return new Set((await myNotifications(page, { rows: 50 })).items.filter((n) => n.type === definition.name).map((n) => n.id));
}

/**
 * 21957 precondition "expiry reminders are active": the network job is moved
 * after the control record's effective time; once it made the network Active,
 * the inbox is watched for an item of the suite "Expiring Soon - Network"
 * definition; when none came, the job is fired once more (a reminder may need
 * a run on an already Active record) and watched again. Answers the item
 * (null = the reminder process never sent one - the case is then BLOCKED).
 */
export async function networkReminderControl(
  page: Page,
  jobClock: JobClock,
  record: ExpiringRecord,
  definition: { id: string; name: string },
  watchMs = 2 * 60_000,
): Promise<{ notification: InboxNotification | null; status: string; firings: string[] }> {
  const after = record.effectiveAt ? Math.ceil((record.effectiveAt.getTime() - Date.now()) / 60_000) + 2 : 2;
  const first = await jobClock.moveTo(LIFECYCLE_JOB.network, Math.max(2, after));
  const ran = await waitForNetworkStatus(page, record.id, 'Active', { timeoutMs: first.firesAt.getTime() - Date.now() + 4 * 60_000 });
  const read = (): Promise<{ items: InboxNotification[] }> => myNotifications(page, { rows: 50 });
  const isIt = (n: InboxNotification): boolean => n.type === definition.name;
  const firstHit = await waitForInboxItem(read, isIt, watchMs, 10_000);
  if (firstHit) return { notification: firstHit, status: ran.value.status, firings: [first.firesAt.toISOString()] };
  const second = await jobClock.moveTo(LIFECYCLE_JOB.network, 2);
  const secondHit = await waitForInboxItem(read, isIt, second.firesAt.getTime() - Date.now() + watchMs, 10_000);
  return { notification: secondHit, status: ran.value.status, firings: [first.firesAt.toISOString(), second.firesAt.toISOString()] };
}

/**
 * 21964 / 21637: the per-kind outcome in plain words (no JSON - the failure
 * narrator cuts a message at the first `{"`): every kind asked, its record and
 * expiry date (or why there is none), when its job fired and whether its
 * Expiring Soon arrived. `notArrived` names each kind without one.
 */
export function expiringSoonReport(
  kinds: readonly ExpiringKind[],
  records: readonly ExpiringRecord[],
  results: readonly ExpiringSoonResult[],
): { notArrived: string[]; summary: string } {
  const notArrived: string[] = [];
  const lines = kinds.map((kind) => {
    const record = records.find((r) => r.kind === kind);
    const result = results.find((r) => r.kind === kind);
    if (!record || record.source === 'missing') {
      notArrived.push(kind);
      return `${kind}: no record${record?.why ? ` (${record.why})` : ''}`;
    }
    if (!result?.notification) notArrived.push(kind);
    const what = `${kind} "${record.name}" expiring ${record.expiryDate}${record.state ? ` (${record.state} when made)` : ''}`;
    const job = result ? `job fired ${result.jobFiresAt}` : 'job not fired';
    const got = result?.notification ? `Expiring Soon arrived (${normalise(result.notification.englishMessage).slice(0, 80)})` : 'NO Expiring Soon arrived';
    return `${what}, ${job}, ${got}`;
  });
  return { notArrived, summary: lines.join('; ') };
}

/**
 * 21957: moves the network job after the record's effective time, waits until
 * the job made it Active (proof the job ran) plus `graceMs`, and answers every
 * inbox item of the suite definition that arrived SINCE the job was moved
 * (expected: none - for this record or any other, e.g. a control record).
 */
export async function networkJobWithoutReminder(
  page: Page,
  jobClock: JobClock,
  record: ExpiringRecord,
  definition: { id: string; name: string },
  graceMs = 90_000,
): Promise<{ jobRan: boolean; status: string; items: InboxNotification[]; firesAt: string }> {
  const before = await definitionItemIds(page, definition);
  const after = record.effectiveAt ? Math.ceil((record.effectiveAt.getTime() - Date.now()) / 60_000) + 2 : 2;
  const move = await jobClock.moveTo(LIFECYCLE_JOB.network, Math.max(2, after));
  const ran = await waitForNetworkStatus(page, record.id, 'Active', { timeoutMs: move.firesAt.getTime() - Date.now() + 4 * 60_000 });
  await page.waitForTimeout(graceMs);
  const items = (await myNotifications(page, { rows: 50 })).items.filter((n) => n.type === definition.name && !before.has(n.id));
  return { jobRan: ran.ok, status: ran.value.status, items, firesAt: move.firesAt.toISOString() };
}
