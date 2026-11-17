import type { Locator, Page } from '@playwright/test';
import { DIALOG, DIALOG_ACTION, NAV, SETTINGS_JOBS } from '../../constants/ElementIds';
import { SETTINGS_DRAWER, SETTINGS_HUB, SETTINGS_TOAST, UNSAVED_DIALOG } from '../../constants/settings/settingsIds';
import { Timeouts } from '../../constants/Timeouts';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { DrawerSaveOutcome, SettingsHubPage } from '../../pages/settings/SettingsHubPage';
import type { SettingsPage } from '../../pages/system/SettingsPage';
import {
  RIYADH_OFFSET_MINUTES,
  cronAt,
  cronToRiyadhPicker,
  jobIdFragment,
  readJobCron,
  waitUntilInstant,
  type JobKey,
  type WaitForResult,
} from '../JobClock';
import { approvedNetworkAt, networkSnapshot, waitForNetworkStatus, type LifecycleSnapshot } from '../jobDriven/lifecycle';
import type { ProvisionedNetwork } from '../NetworkProvisioning';
import { Logger } from '../Logger';
import {
  BLOCK_WHEN_NOT_DEFAULT,
  EFFECTIVE_AHEAD_MS,
  FIRING_SETTLE_MS,
  MOVE_LEAD_MS,
  RUN_ON_DEMAND,
  SETTINGS_ROUTE_FRAGMENT,
  notNewInstallReason,
} from '../../data/settings/editScheduledJobs.data';

/**
 * Writer D helpers - System Setting Management folder 05 "Edit Scheduled Jobs"
 * (US 20869, 2026-11-09). What SettingsHubPage / SettingsPage do not cover:
 * the job controls as locators, the UTC arithmetic, typing into a CRON text
 * box that may not be there, emptying a control, the unsaved-changes guard,
 * the on-demand scan, and the 21053 "the saved time applies without a restart"
 * proof. Ids only (SETTINGS_JOBS / SETTINGS_DRAWER / DIALOG); every exception
 * is marked on its line.
 */

// ---- text + arithmetic -------------------------------------------------------------------

/** Displayed text as the cases compare it: whitespace collapsed, dashes normalised (lead decision 4). Case is kept. */
export function literal(text: string): string {
  return text.replace(/[‒-―−]/g, '-').replace(/\s+/g, ' ').trim();
}

/** "03:15 AM" -> minutes after Riyadh midnight. */
function pickerMinutes(picker: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(picker.trim());
  if (!m) throw new Error(`"${picker}" is not hh:mm AM|PM`);
  return ((Number(m[1]) % 12) + (/PM/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]);
}

/** The UTC line a Riyadh picker time should show, by arithmetic (Riyadh = UTC+3): "03:15 AM" -> "Runs at 00:15 UTC". */
export function riyadhPickerToUtcHint(picker: string): string {
  const utc = (pickerMinutes(picker) - RIYADH_OFFSET_MINUTES + 24 * 60) % (24 * 60);
  return `Runs at ${String(Math.floor(utc / 60)).padStart(2, '0')}:${String(utc % 60).padStart(2, '0')} UTC`;
}

/** The next firing of a stored CRON as UTC "HH:mm" ('' when it has none). */
export function utcClock(at: Date | null): string {
  return at ? at.toISOString().slice(11, 16) : '';
}

// ---- the job controls --------------------------------------------------------------------

/** The drawer controls of one job, by id (SETTINGS_JOBS). */
export function jobControls(page: Page, key: JobKey): { picker: Locator; hint: Locator; box: Locator; frequency: Locator } {
  const f = jobIdFragment(key);
  return {
    picker: page.locator(`#${SETTINGS_JOBS.time(f)}`),
    hint: page.locator(`#${SETTINGS_JOBS.utcHint(f)}`),
    box: page.locator(`#${SETTINGS_JOBS.input(f)}`),
    frequency: page.locator(`#${SETTINGS_JOBS.frequency(f)}`),
  };
}

/** What the drawer shows for one job, in words (for messages and the default cases). */
export interface JobShown {
  control: 'time picker' | 'text box' | 'nothing';
  picker: string;
  hint: string;
  box: string;
}

export async function readJobShown(page: Page, key: JobKey): Promise<JobShown> {
  const c = jobControls(page, key);
  const value = async (l: Locator): Promise<string> =>
    ((await l.count()) > 0 ? (await l.inputValue().catch(async () => l.innerText())).replace(/\s+/g, ' ').trim() : '');
  const box = await value(c.box);
  const picker = await value(c.picker);
  const hint = (await c.hint.count()) > 0 ? literal(await c.hint.innerText()) : '';
  const hasBox = (await c.box.count()) > 0;
  const hasPicker = (await c.picker.count()) > 0;
  return { control: hasBox ? 'text box' : hasPicker ? 'time picker' : 'nothing', picker, hint, box };
}

/** The value a field "shows" for the default case: the text box's CRON, or the picker in words with the stored CRON. */
export function fieldValue(s: JobShown, stored: string): string {
  return s.control === 'text box' ? s.box : `${describeShown(s)}, stored "${stored}"`;
}

export function describeShown(s: JobShown): string {
  if (s.control === 'text box') return `a text box holding "${s.box}"`;
  if (s.control === 'time picker') return `a time picker "${s.picker}" with "${s.hint}"`;
  return 'no control';
}

// ---- lead decision 1 ---------------------------------------------------------------------

/**
 * Declares the case BLOCKED (lead decision 1) when any value the screen shows
 * differs from its new-installation default; returns quietly when all are equal
 * (the case then asserts them and passes).
 */
export function blockUnlessNewInstallDefaults(
  steps: TestSteps,
  comparisons: { job: string; shown: string; expected: string }[],
): void {
  const differences = comparisons.filter((c) => c.shown !== c.expected);
  if (differences.length > 0 && BLOCK_WHEN_NOT_DEFAULT) steps.blocked(notNewInstallReason(differences));
}

// ---- typing, emptying, nudging ------------------------------------------------------------

/**
 * Types `value` into the job's CRON text box when the screen shows one. The
 * picker ignores typing, so with no text box nothing is typed and the caller
 * reports what the screen showed instead.
 */
export async function typeIntoCronBox(page: Page, key: JobKey, value: string): Promise<{ typed: boolean; shownInstead: string }> {
  const shown = await readJobShown(page, key);
  if (shown.control !== 'text box') {
    Logger.warn(`[writerD] ${key} has no CRON text box - it shows ${describeShown(shown)}`);
    return { typed: false, shownInstead: describeShown(shown) };
  }
  const box = jobControls(page, key).box;
  await box.scrollIntoViewIfNeeded();
  await box.fill(value);
  return { typed: (await box.inputValue()).trim() === value, shownInstead: '' };
}

/** The open PrimeNG time panel (no ids). */
function timePanel(page: Page): Locator {
  return page
    .locator('[class*="datepicker-panel"], .p-datepicker:not(.p-inputwrapper)') // locator-exception: PrimeNG time overlay, no id
    .filter({ has: page.locator('[class*="minute-picker"]') }) // locator-exception: PrimeNG minute column, no id
    .last();
}

/**
 * Empties a job's control the way a user would (lead decision 10): select all +
 * Delete, then any clear icon. Drives the text box when shown, else the picker.
 * Reports what the control holds afterwards - it may refuse to be emptied.
 */
export async function tryToEmptyJobControl(page: Page, key: JobKey): Promise<{ kind: JobShown['control']; emptied: boolean; valueAfter: string }> {
  const shown = await readJobShown(page, key);
  const c = jobControls(page, key);
  const target = shown.control === 'text box' ? c.box : c.picker;
  await target.scrollIntoViewIfNeeded();
  await target.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  // locator-exception: PrimeNG's clear icon has no id; it sits in the same picker host as the id'd input.
  const clear = target.locator('xpath=ancestor::*[contains(@class,"datepicker") or contains(@class,"inputwrapper")][1]').locator('[class*="clear-icon"]').first();
  if (await clear.isVisible().catch(() => false)) await clear.click().catch(() => undefined);
  await page.locator(`#${SETTINGS_DRAWER.title}`).click();
  await timePanel(page).waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  const valueAfter = (await target.inputValue().catch(() => '')).trim();
  Logger.step(`[writerD] Emptying ${key}'s ${shown.control}: it now holds "${valueAfter}"`);
  return { kind: shown.control, emptied: valueAfter === '', valueAfter };
}

/**
 * Moves a job's picker one minute up with its arrow - a valid change in any UI
 * language (the "hh:mm AM" parser of SettingsPage.setJobTime is English-only).
 * Returns the picker's value afterwards.
 */
export async function nudgeJobMinute(page: Page, key: JobKey): Promise<{ before: string; after: string }> {
  const picker = jobControls(page, key).picker;
  const before = (await picker.inputValue()).trim();
  await picker.scrollIntoViewIfNeeded();
  await picker.click();
  const panel = timePanel(page);
  await panel.waitFor({ timeout: Timeouts.default });
  await panel.locator('[class*="minute-picker"] button').first().click(); // locator-exception: PrimeNG minute arrow, no id
  await page.locator(`#${SETTINGS_DRAWER.title}`).click();
  return { before, after: (await picker.inputValue()).trim() };
}

/** The first candidate time that differs from what the picker shows now. */
export function aDifferentTime(current: string, candidates: readonly string[]): string {
  return candidates.find((c) => c !== current.trim()) ?? candidates[0];
}

// ---- save outcome --------------------------------------------------------------------------

/** "The save is blocked": no request left the browser, or the server refused it. */
export function saveBlocked(outcome: DrawerSaveOutcome): boolean {
  return outcome.status === null || outcome.status >= 400;
}

/** The drawer's whole text while it is open ('' once closed) - where inline field errors show. */
export async function drawerText(page: Page): Promise<string> {
  const drawer = page.locator(`#${SETTINGS_DRAWER.drawer}`);
  if (!(await drawer.isVisible().catch(() => false))) return '';
  return literal(await drawer.innerText().catch(() => ''));
}

/** Everything the save showed: the toast plus the open drawer's text. */
export async function messagesAfterSave(page: Page, outcome: DrawerSaveOutcome): Promise<string> {
  return literal(`${outcome.toast} ${await drawerText(page)}`);
}

/** The save in words, for failure messages. */
export function describeSave(outcome: DrawerSaveOutcome): string {
  return `Save -> ${outcome.status ?? 'no request'}${outcome.sent ? ` sending ${JSON.stringify(outcome.sent)}` : ''}`
    + `${outcome.answer ? ` answered "${outcome.answer.slice(0, 200)}"` : ''}; toast "${outcome.toast}"; drawer ${outcome.drawerOpen ? 'open' : 'closed'}`;
}

/** The start of the toast the save showed, as long as `expected` - the toast is "<summary> <detail>". */
export function toastTitle(outcome: DrawerSaveOutcome, expected: string): string {
  return literal(outcome.toast).slice(0, expected.length);
}

/** Waits for the last toast to leave, so a second save's toast is not mistaken for it. */
export async function waitForToastGone(page: Page): Promise<void> {
  await page.locator(`#${SETTINGS_TOAST.toast}`).first().waitFor({ state: 'hidden', timeout: Timeouts.toast }).catch(() => undefined);
}

// ---- the unsaved-changes guard (21056-21058) ------------------------------------------------

/** What the leave guard showed: the shared pbm-dialog (`stay` / `discard`) or the unsaved host. */
export interface LeaveGuard {
  shown: boolean;
  title: string;
  message: string;
  options: string[];
}

/** Reads the leave guard, waiting a moment for it to animate in. */
export async function readLeaveGuard(page: Page): Promise<LeaveGuard> {
  const shared = page.locator(`#${DIALOG.root}`);
  const host = page.locator(`#${UNSAVED_DIALOG.host}`).locator('.p-dialog, [role="dialog"]').first(); // locator-exception: the host's dialog has no inner ids
  const which = await Promise.race([
    shared.waitFor({ state: 'visible', timeout: 3_000 }).then(() => 'shared' as const),
    host.waitFor({ state: 'visible', timeout: 3_000 }).then(() => 'host' as const),
  ]).catch(() => null);
  if (which === null) return { shown: false, title: '', message: '', options: [] };
  if (which === 'shared') {
    const text = async (id: string): Promise<string> => literal(await page.locator(`#${id}`).innerText().catch(() => ''));
    const options = (await page.locator(`#${DIALOG.actions}`).locator('button').allInnerTexts()).map(literal).filter(Boolean); // locator-exception: the action buttons inside the id'd action bar
    return { shown: true, title: await text(DIALOG.title), message: await text(DIALOG.message), options };
  }
  const whole = literal(await host.innerText());
  const options = (await host.locator('button').allInnerTexts()).map(literal).filter(Boolean); // locator-exception: buttons inside the host's dialog
  return { shown: true, title: whole, message: whole, options };
}

/** What an attempt to leave the screen did. */
export interface LeaveAttempt {
  via: 'side menu' | 'browser Back';
  urlBefore: string;
  urlAfter: string;
  guard: LeaveGuard;
  drawerOpen: boolean;
}

/**
 * Tries to leave the Settings screen as a user would: the side-menu link to
 * Terminology Management; when the drawer's mask keeps the link from being
 * clicked, the browser Back button. Does NOT answer any guard.
 */
export async function attemptToLeave(page: Page): Promise<LeaveAttempt> {
  const urlBefore = page.url();
  const link = page.locator(`#${NAV.terminologyManagement}`);
  const clicked = await link.click({ timeout: Timeouts.short }).then(() => true).catch(() => false);
  if (!clicked) await page.goBack({ waitUntil: 'commit', timeout: Timeouts.short }).catch(() => undefined);
  const via = clicked ? ('side menu' as const) : ('browser Back' as const);
  const guard = await readLeaveGuard(page);
  const drawerOpen = await page.locator(`#${SETTINGS_DRAWER.title}`).isVisible().catch(() => false);
  const attempt = { via, urlBefore, urlAfter: page.url(), guard, drawerOpen };
  Logger.step(`[writerD] Leaving via ${via}: ${urlBefore} -> ${attempt.urlAfter}; guard ${guard.shown ? `"${guard.title}"` : 'none'}; drawer ${drawerOpen ? 'open' : 'closed'}`);
  return attempt;
}

export function describeLeave(a: LeaveAttempt): string {
  return `left via the ${a.via}: the URL went ${a.urlBefore} -> ${a.urlAfter}, the drawer is ${a.drawerOpen ? 'open' : 'closed'}, `
    + (a.guard.shown ? `the dialog read "${a.guard.title}" / "${a.guard.message}" with [${a.guard.options.join(', ')}]` : 'and NO dialog appeared');
}

/** Answers the guard: Keep Editing (`stay`) or Discard Changes (`discard`). */
export async function answerLeaveGuard(page: Page, choice: 'stay' | 'discard'): Promise<void> {
  const id = choice === 'stay' ? DIALOG_ACTION.stay : DIALOG_ACTION.discard;
  await page.locator(`#${id}`).click({ timeout: Timeouts.short });
  await page.locator(`#${DIALOG.root}`).waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
}

/** Whether the page is still on the Settings screen. */
export function onSettingsScreen(page: Page): boolean {
  return page.url().includes(SETTINGS_ROUTE_FRAGMENT);
}

/** Whether the shared dialog is on screen now. */
export async function isGuardVisible(page: Page): Promise<boolean> {
  return page.locator(`#${DIALOG.root}`).isVisible().catch(() => false);
}

// ---- 21054: on-demand controls --------------------------------------------------------------

/** One clickable control of the screen (read view + drawer). */
export interface ScreenControl {
  id: string;
  text: string;
}

/** Every button / link in the read view and the drawer, with its id and text. */
export async function screenControls(page: Page): Promise<ScreenControl[]> {
  const out: ScreenControl[] = [];
  for (const root of [SETTINGS_HUB.outlet, SETTINGS_DRAWER.drawer]) {
    // locator-exception: every clickable element inside the id'd containers is scanned - the absence of one is the assertion.
    const found = await page.locator(`#${root}`).locator('button, a, [role="button"], [role="menuitem"]').evaluateAll((els) =>
      els.map((e) => ({ id: e.id || (e.closest('[id]')?.id ?? ''), text: (e.textContent ?? '').replace(/\s+/g, ' ').trim() })),
    ).catch(() => [] as ScreenControl[]);
    out.push(...found);
  }
  return out;
}

/** The controls that would run a job on demand. */
export function onDemandControls(controls: ScreenControl[]): ScreenControl[] {
  return controls.filter((c) => RUN_ON_DEMAND.text.test(c.text) || RUN_ON_DEMAND.id.test(c.id));
}

// ---- 21053: the saved time applies without a restart ------------------------------------------

/** What the 21053 proof observed. */
export interface ScreenFiring {
  network: ProvisionedNetwork;
  firesAt: Date;
  /** What the picker showed after the arrows. */
  picker: string;
  save: DrawerSaveOutcome;
  /** The CRON stored after the save. */
  stored: string;
  wantedCron: string;
  /** The network just before the minute (Future expected). */
  before: LifecycleSnapshot;
  /** Waiting for Active after the minute. */
  after: WaitForResult<LifecycleSnapshot>;
}

/**
 * Builds an APPROVED suite network effective shortly, then sets the network job
 * THROUGH THE SCREEN (picker arrows + Save - no restart) to the first minute
 * after it, and waits for the job to make the network Active. The guard
 * restores the job at teardown.
 *
 * `blocked` is called (and must throw) when the network cannot be built - e.g.
 * "You cannot approve a request you submitted (four-eyes principle)" (409)
 * when the run signs in as a non-careconnect administrator (full run
 * 2026-11-09): the job was then never observed, so the case is BLOCKED, not a
 * failure of the schedule.
 */
export async function fireNetworkJobFromScreen(
  page: Page,
  hub: SettingsHubPage,
  settingsPage: SettingsPage,
  key: JobKey,
  blocked: (reason: string) => never,
): Promise<ScreenFiring> {
  const effectiveAt = new Date(Date.now() + EFFECTIVE_AHEAD_MS);
  let network: ProvisionedNetwork;
  try {
    network = await approvedNetworkAt(page, { effectiveAt });
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).split('\n')[0];
    blocked(`an approved suite network effective in a few minutes (the job's proof that it runs at the saved time) could not be provisioned, so the job run was never observed. Underlying failure: ${detail}`);
  }
  const earliest = Math.max(effectiveAt.getTime() + 60_000, Date.now() + MOVE_LEAD_MS);
  const firesAt = new Date(Math.ceil(earliest / 60_000) * 60_000);
  const wantedCron = cronAt(firesAt);
  await hub.open();
  await hub.openEdit();
  const picker = await settingsPage.setJobTime(key, cronToRiyadhPicker(wantedCron));
  const save = await hub.saveAndCapture();
  const stored = await readJobCron(page, key);
  Logger.step(`[writerD] ${key} set on the screen to "${picker}" (${stored}); fires ${firesAt.toISOString()} over "${network.name}"`);
  await waitUntilInstant(page, firesAt, -10_000);
  const before = await networkSnapshot(page, network.id);
  await waitUntilInstant(page, firesAt, 0);
  const after = await waitForNetworkStatus(page, network.id, 'Active', { timeoutMs: FIRING_SETTLE_MS });
  return { network, firesAt, picker, save, stored, wantedCron, before, after };
}
