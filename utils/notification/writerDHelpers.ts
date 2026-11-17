import type { Locator, Page, Request } from '@playwright/test';
import { expect, test as base } from '@playwright/test';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { SuiteAnnouncements } from '../../fixtures/notificationModule.fixture';
import { BasePage } from '../../pages/BasePage';
import { AnnouncementDrawer, type AnnouncementRescheduleDrawer, type AnnouncementViewDrawer, type DrawerSaveOutcome } from '../../pages/notification/Drawers';
import type { AnnouncementsTab, ListAnswer, NcExport } from '../../pages/notification/NotificationCenterPage';
import { ANNOUNCEMENT_RESCHEDULE, ANNOUNCEMENT_VIEW, NC_DIALOG, NC_FORM, NC_LIST, NEXT_JOB_PATTERN } from '../../constants/notification/notificationIds';
import { WRITER_D_IDS } from '../../constants/notification/writerDIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../Logger';
import { RIYADH_OFFSET_MINUTES } from '../JobClock';
import {
  AUDIENCE_TYPE,
  SUITE_ANNOUNCEMENT_PREFIX,
  announcementCandidates,
  cancelSuiteAnnouncement,
  listAnnouncements,
  myAnnouncements,
  ncStamp,
  readAnnouncement,
  type AnnouncementAudience,
  type AnnouncementRecord,
  type AnnouncementRow,
  type InboxAnnouncement,
} from './notificationApi';

/**
 * Writer D helpers - Notification Center, Announcements folders 23-28
 * (stories 21011 Search and Filter, 21012 Create, 21013 Edit, 21014 Delete,
 * 21016 Reschedule, 21017 View Announcement Details).
 *
 * Built on the lead's page objects (AnnouncementsTab, AnnouncementDrawer,
 * AnnouncementViewDrawer, AnnouncementRescheduleDrawer) and API helpers. Every
 * record touched is a SUITE announcement ("QA Automation Announcement ...")
 * made through `suiteAnnouncements` (or created through the screen after
 * `suiteAnnouncements.watch()`), aimed at careconnect, maalmohammad or a suite
 * role. Nothing here asserts a case's expectation: the helpers act and report
 * what the screen / API showed, the specs assert.
 */

const PUBLISH_WAIT_MS = 180_000;
const POLL_MS = 5_000;

/** Whitespace collapsed, en / em dashes read as a hyphen (brief: lead decision 3). */
export function normalise(text: string): string {
  return text.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

/** A fresh suite name with `label` in it, padded or cut to exactly `length` characters when given. */
export function suiteName(label: string, length?: number): string {
  const base1 = `${SUITE_ANNOUNCEMENT_PREFIX} ${label} ${ncStamp()}`.trim();
  if (length === undefined) return base1;
  return base1.length >= length ? base1.slice(0, length) : `${base1} ${'x'.repeat(length)}`.slice(0, length);
}

/** A short unique word for a case's names / searches (letters + digits only). */
export function stampWord(prefix = 'qad'): string {
  return `${prefix}${ncStamp()}`;
}

// ---- dates ------------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0');

/** An instant shifted to Riyadh wall-clock fields (read with getUTC*). */
function riyadh(at: Date | string | number): Date {
  return new Date(new Date(at).getTime() + RIYADH_OFFSET_MINUTES * 60_000);
}

/** The Publish at picker text ("yyyy-MM-dd HH:mm", Riyadh) of an instant. */
export function pickerText(at: Date | string | number): string {
  return AnnouncementDrawer.publishText(new Date(at));
}

/** The list cell / details panel form ("dd/MM/yyyy, HH:mm:ss", Riyadh) of an instant (seconds truncated, as the screen shows them). */
export function screenDateTime(at: Date | string | number): string {
  const r = riyadh(at);
  return `${pad(r.getUTCDate())}/${pad(r.getUTCMonth() + 1)}/${r.getUTCFullYear()}, ${pad(r.getUTCHours())}:${pad(r.getUTCMinutes())}:${pad(r.getUTCSeconds())}`;
}

/** "yyyy-MM-dd HH:mm" (Riyadh) -> the instant, or null when the text is not in that form. */
export function parsePickerText(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - RIYADH_OFFSET_MINUTES * 60_000);
}

/** "dd/MM/yyyy, HH:mm:ss" (Riyadh) -> the instant, or null. */
export function parseScreenDateTime(text: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] ?? 0)) - RIYADH_OFFSET_MINUTES * 60_000);
}

/** Seconds between a picker / screen text and now (positive = ahead); null when the text cannot be read. */
export function secondsFromNow(text: string): number | null {
  const at = parsePickerText(text) ?? parseScreenDateTime(text);
  return at ? Math.round((at.getTime() - Date.now()) / 1000) : null;
}

/** Now + `days` days (same wall-clock time). */
export function daysAhead(days: number, from = Date.now()): Date {
  return new Date(from + days * 86_400_000);
}

/** Now + `minutes` minutes. */
export function minutesAhead(minutes: number, from = Date.now()): Date {
  return new Date(from + minutes * 60_000);
}

/** Waits (in the page's clock) until `at` (ms epoch) has passed. */
export async function waitUntil(page: Page, at: number): Promise<void> {
  for (;;) {
    const left = at - Date.now();
    if (left <= 0) return;
    await page.waitForTimeout(Math.min(left, 10_000));
  }
}

/**
 * Waits until the wall clock is in the first seconds of a minute, so a picker
 * default ("HH:mm", seconds dropped) is at most a few seconds older than the
 * moment the form opened.
 */
export async function waitForMinuteStart(page: Page, withinSeconds = 3): Promise<void> {
  const s = new Date().getUTCSeconds();
  if (s <= withinSeconds) return;
  await page.waitForTimeout((60 - s) * 1000 + 200);
}

// ---- blocking --------------------------------------------------------------------------

/**
 * steps.blocked(reason) - unless an earlier step already FAILED: then the
 * finding stays visible (the case ends FAIL, the reason is kept as a note).
 * Same rule as utils/settings/writerBHelpers.ts.
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = base.info();
  if (info.errors.length > 0 || steps.records().some((r) => /fail/i.test(String(r.status)))) {
    info.annotations.push({ type: 'note', description: `This step could not be observed either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/** Blocks the case (see blockUnlessAStepFailed) when `condition` is false. */
export function blockUnless(steps: TestSteps, condition: boolean, reason: string): void {
  if (!condition) blockUnlessAStepFailed(steps, reason);
}

// ---- records ----------------------------------------------------------------------------

/** The suite announcement listed under exactly `name` (GetAnnouncements search), or null. */
export async function findByName(page: Page, name: string): Promise<AnnouncementRow | null> {
  return (await listAnnouncements(page, { searchText: name })).items.find((a) => a.name === name) ?? null;
}

/** Polls GetAnnouncement until its status is `status` (or the time is up); answers the last record read. */
export async function waitForStatus(page: Page, id: string, status: string, timeoutMs = PUBLISH_WAIT_MS): Promise<AnnouncementRecord | null> {
  const end = Date.now() + timeoutMs;
  let last: AnnouncementRecord | null = null;
  for (;;) {
    last = await readAnnouncement(page, id);
    if (last?.status === status || Date.now() > end) return last;
    await page.waitForTimeout(POLL_MS);
  }
}

/** careconnect's name as the audience picker lists it (GetAudienceCandidates), `fallback` when not found. */
export async function adminPickerName(page: Page, suiteAnnouncements: SuiteAnnouncements, fallback: string): Promise<string> {
  const id = await suiteAnnouncements.adminUserId();
  return (await announcementCandidates(page, 'users')).find((c) => c.id === id)?.nameEn ?? fallback;
}

/**
 * A suite announcement PUBLISHED now (default audience careconnect): created
 * through the API with Publish at = now, then read until the publishing job
 * has run. BLOCKS the case when it is not Published in time (the precondition
 * could not be produced). Teardown cancels it (it stays listed as Cancelled).
 */
export async function publishedSuiteAnnouncement(
  page: Page,
  steps: TestSteps,
  suiteAnnouncements: SuiteAnnouncements,
  spec: { name?: string; englishMessage?: string; arabicMessage?: string; audiences?: AnnouncementAudience[] } = {},
): Promise<AnnouncementRecord> {
  const made = await suiteAnnouncements.create({ ...spec, publishAt: new Date() });
  const now = await waitForStatus(page, made.id, 'Published');
  blockUnless(steps, now?.status === 'Published', `the suite announcement "${made.name}" (Publish at now) was not Published within ${PUBLISH_WAIT_MS / 1000} s - it read "${now?.status ?? 'nothing'}"`);
  return now ?? made;
}

/**
 * A CANCELLED suite announcement. With `reuse`, the newest Cancelled suite
 * announcement already listed is used (read only - a cancelled one is inert
 * and stays listed forever); otherwise (or when none is listed) one is
 * published now to careconnect and cancelled through the API. BLOCKS when
 * none can be produced.
 */
export async function cancelledSuiteAnnouncement(
  page: Page,
  steps: TestSteps,
  suiteAnnouncements: SuiteAnnouncements,
  reuse: boolean,
): Promise<AnnouncementRecord> {
  if (reuse) {
    const listed = (await listAnnouncements(page, { searchText: SUITE_ANNOUNCEMENT_PREFIX, status: 'Cancelled' })).items
      .find((a) => a.status === 'Cancelled' && a.name.startsWith(SUITE_ANNOUNCEMENT_PREFIX));
    const record = listed ? await readAnnouncement(page, listed.id) : null;
    if (record) {
      Logger.step(`[writer D] Reusing the cancelled suite announcement "${record.name}"`);
      return record;
    }
  }
  const published = await publishedSuiteAnnouncement(page, steps, suiteAnnouncements);
  const answer = await cancelSuiteAnnouncement(page, published.id);
  const cancelled = await waitForStatus(page, published.id, 'Cancelled', 30_000);
  blockUnless(steps, cancelled?.status === 'Cancelled', `the suite announcement "${published.name}" could not be cancelled (CancelAnnouncement answered ${answer.status}: ${answer.text.slice(0, 160)})`);
  return cancelled ?? published;
}

/**
 * Looks first: when the shared list holds no Published announcement at all,
 * publishes a suite one (careconnect) so a "Status = Published" filter has rows.
 * Answers how many Published ones are listed afterwards.
 */
export async function ensurePublishedListed(page: Page, steps: TestSteps, suiteAnnouncements: SuiteAnnouncements): Promise<number> {
  const before = (await listAnnouncements(page, { status: 'Published' }, 1)).totalRows;
  if (before > 0) return before;
  await publishedSuiteAnnouncement(page, steps, suiteAnnouncements);
  return (await listAnnouncements(page, { status: 'Published' }, 1)).totalRows;
}

/** Lower-cases every entry unless `caseSensitive`. */
export function foldCase(list: readonly string[], caseSensitive: boolean): string[] {
  return list.map((s) => (caseSensitive ? s : s.toLowerCase()));
}

/**
 * Reads a countdown's samples (seconds): `falls` = it went down between
 * consecutive samples (ignoring one restart), `reachedZero` = it got to
 * `floor` or below, or restarted (jumped up) right after a low value.
 */
export function countdownVerdict(samples: readonly number[], floor: number): { falls: boolean; reachedZero: boolean } {
  let falls = false;
  let reachedZero = false;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i] < samples[i - 1]) falls = true;
    if (samples[i] > samples[i - 1] && samples[i - 1] <= floor + 2) reachedZero = true;
  }
  if (samples.some((s) => s <= floor)) reachedZero = true;
  return { falls, reachedZero };
}

/** The user's inbox copies of the announcement named `name` (GetMyAnnouncements search). */
export async function inboxCopies(page: Page, name: string): Promise<InboxAnnouncement[]> {
  return (await myAnnouncements(page, { search: name, rows: 50 })).items.filter((i) => i.name === name);
}

/** Polls the inbox until at least one copy of `name` arrived (or the time is up); then answers every copy. */
export async function waitForInboxCopies(page: Page, name: string, timeoutMs = 90_000): Promise<InboxAnnouncement[]> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const copies = await inboxCopies(page, name);
    if (copies.length > 0) {
      await page.waitForTimeout(3_000);
      return inboxCopies(page, name);
    }
    if (Date.now() > end) return copies;
    await page.waitForTimeout(POLL_MS);
  }
}

// ---- requests ---------------------------------------------------------------------------

/** Counts the requests whose URL contains `fragment` (and, when given, whose method is `method`) from now on. */
export function countRequests(page: Page, fragment: string, method?: string): { count: () => number; stop: () => void } {
  let n = 0;
  const listener = (r: Request): void => {
    if (r.url().includes(fragment) && (!method || r.method() === method)) n += 1;
  };
  page.on('request', listener);
  return { count: () => n, stop: () => page.off('request', listener) };
}

/**
 * Arms a wait for the next non-GET request to `fragment` (call BEFORE the
 * click that may send it) and answers its status and text; status null when
 * none was sent within `timeout`.
 */
export function waitForWrite(page: Page, fragment: string, timeout = 15_000): Promise<{ status: number | null; text: string }> {
  return page
    .waitForResponse((r) => r.url().includes(fragment) && r.request().method() !== 'GET', { timeout })
    .then(async (r) => ({ status: r.status(), text: await r.text().catch(() => '') }))
    .catch(() => ({ status: null, text: '' }));
}

// ---- the list ---------------------------------------------------------------------------

/** Searches the list for `name` and answers the row id ('' when not listed). */
export async function rowIdOf(tab: AnnouncementsTab, name: string): Promise<string> {
  return tab.rowIdByName(name);
}

/**
 * Sorts by Publish at, oldest first: picks the "publishat" option, then flips
 * the direction when the answer was descending. Answers the LAST list answer.
 */
export async function sortPublishAtOldestFirst(tab: AnnouncementsTab): Promise<ListAnswer | null> {
  const first = await tab.sortBy('publishat');
  if (!/desc/i.test(String(first?.request.sortBy ?? ''))) return first;
  return tab.toggleSortDirection();
}

/** Sorts by Name ascending (flips when the answer was descending). */
export async function sortNameAscending(tab: AnnouncementsTab): Promise<ListAnswer | null> {
  const first = await tab.sortBy('name');
  if (!/desc/i.test(String(first?.request.sortBy ?? ''))) return first;
  return tab.toggleSortDirection();
}

/** The `name` column of an export, in file order. */
export function exportNames(exp: NcExport | null): string[] {
  return (exp?.sheet?.rows ?? []).map((r) => normalise(r.Name ?? ''));
}

/** One line about an export for failure messages. */
export function describeExport(exp: NcExport | null): string {
  return exp ? `${exp.filename}: headers [${exp.sheet?.headers.join(', ') ?? 'not a workbook'}], ${exp.sheet?.rows.length ?? 0} rows` : 'no file';
}

/** The `Status` column of an export, in file order. */
export function exportStatuses(exp: NcExport | null): string[] {
  return (exp?.sheet?.rows ?? []).map((r) => normalise(r.Status ?? ''));
}

/** Every page of GetAnnouncements for `criteria` (names, in the API's order). */
export async function allNames(page: Page, criteria: Record<string, unknown> = {}): Promise<{ names: string[]; statuses: string[]; totalRows: number }> {
  const answer = await listAnnouncements(page, criteria, 1000);
  return { names: answer.items.map((a) => normalise(a.name)), statuses: answer.items.map((a) => String(a.status)), totalRows: answer.totalRows };
}

// ---- screen readers (no ids on these values) -----------------------------------------

/**
 * Readers for the Announcements screen parts the lead's page objects do not
 * expose: the "Next job MM:SS" text, the reschedule drawer's fields and text,
 * the view drawer's text direction, the delete / cancel confirmation.
 */
export class WriterDAnnouncements extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** The "Next job" countdown in seconds (null when not shown). */
  async nextJobSeconds(): Promise<number | null> {
    const text = normalise(await this.byId(WRITER_D_IDS.outlet).innerText().catch(() => ''));
    const m = NEXT_JOB_PATTERN.exec(text);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  /** The "Next job MM:SS" text as shown ('' when absent). */
  async nextJobText(): Promise<string> {
    const text = normalise(await this.byId(WRITER_D_IDS.outlet).innerText().catch(() => ''));
    return NEXT_JOB_PATTERN.exec(text)?.[0] ?? '';
  }

  /**
   * Samples the countdown every second for up to `maxSeconds` and stops once it
   * reached `floor` or wrapped (a new run started). Answers every sample.
   */
  async watchCountdown(maxSeconds: number, floor = 2): Promise<number[]> {
    const samples: number[] = [];
    for (let i = 0; i <= maxSeconds; i += 1) {
      const s = await this.nextJobSeconds();
      if (s !== null) samples.push(s);
      const n = samples.length;
      if (s !== null && (s <= floor || (n > 1 && samples[n - 1] > samples[n - 2]))) break;
      await this.page.waitForTimeout(1_000);
    }
    return samples;
  }

  /** The list's header texts for `keys` (`nc-announcements-table-th-<key>`), in order. */
  async headers(keys: readonly string[]): Promise<string[]> {
    const out: string[] = [];
    for (const k of keys) out.push(normalise(await this.byId(NC_LIST.th('announcements', k)).innerText().catch(() => '')));
    return out;
  }

  /** A filter chip's remove (x) button. */
  chipRemove(field: string): Locator {
    return this.byId(NC_LIST.chipRemove('announcements', field));
  }

  /** The reschedule drawer's text (title, label, hint, errors). */
  async rescheduleText(): Promise<string> {
    return normalise(await this.byId(ANNOUNCEMENT_RESCHEDULE.root).innerText().catch(() => ''));
  }

  /** How many editable fields (input / textarea / select) the reschedule drawer holds. */
  async rescheduleFieldCount(): Promise<number> {
    // Chained inside the id'd drawer host: its fields carry no ids of their own except Publish at.
    return this.byId(ANNOUNCEMENT_RESCHEDULE.root).locator('xpath=.//input[not(@type="hidden")] | .//textarea | .//*[@role="combobox"]').count();
  }

  rescheduleTitle(): Locator {
    return this.byId(ANNOUNCEMENT_RESCHEDULE.title);
  }

  /** Closes the reschedule drawer with X and discards an Unsaved Changes dialog when one appears. Answers the dialog title seen ('' when none). */
  async closeReschedule(): Promise<string> {
    await this.byId(ANNOUNCEMENT_RESCHEDULE.close).click();
    const shown = await this.byId(NC_DIALOG.title).waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
    const title = shown ? (await this.byId(NC_DIALOG.title).innerText()).trim() : '';
    if (shown) await this.btn(NC_DIALOG.action('discard')).click();
    await expect(this.byId(ANNOUNCEMENT_RESCHEDULE.title)).toBeHidden({ timeout: Timeouts.default });
    return title;
  }

  /** The view drawer's text, whitespace collapsed. */
  async viewText(): Promise<string> {
    return normalise(await this.byId(ANNOUNCEMENT_VIEW.root).innerText().catch(() => ''));
  }

  /**
   * The text direction the view drawer renders `text` in: the innermost element
   * whose own text is exactly `text` - its `dir` attribute (or an ancestor's)
   * and its computed `direction`. '' when the text is not shown.
   */
  async directionOf(text: string): Promise<{ found: boolean; dir: string; direction: string }> {
    return this.byId(ANNOUNCEMENT_VIEW.root).evaluate((root, wanted) => {
      const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
      const all = Array.from(root.querySelectorAll('*')) as HTMLElement[];
      const hit = all.filter((e) => norm(e.innerText ?? e.textContent ?? '') === norm(wanted)).pop();
      if (!hit) return { found: false, dir: '', direction: '' };
      const dirEl = hit.closest('[dir]');
      return { found: true, dir: dirEl?.getAttribute('dir') ?? '', direction: getComputedStyle(hit).direction };
    }, text);
  }

  // ---- confirmation dialog (delete / cancel) -----------------------------------------

  dialogTitle(): Locator {
    return this.byId(NC_DIALOG.title);
  }

  /** The open confirmation: title, message and the labels of its Yes (confirm) / No (cancel) actions. null when none opened. */
  async readDialog(timeout = 2_500): Promise<{ title: string; message: string; confirm: string; cancel: string } | null> {
    const shown = await this.byId(NC_DIALOG.title).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!shown) return null;
    const label = async (key: 'confirm' | 'cancel'): Promise<string> => (await this.byId(NC_DIALOG.action(key)).innerText().catch(() => '')).trim();
    return {
      title: normalise(await this.byId(NC_DIALOG.title).innerText()),
      message: normalise(await this.byId(NC_DIALOG.message).innerText().catch(() => '')),
      confirm: await label('confirm'),
      cancel: await label('cancel'),
    };
  }

  /** Answers the dialog when one is open (see answerDialog); answers whether one was. */
  async answerIfOpen(answer: 'confirm' | 'cancel' | 'close'): Promise<boolean> {
    if (!(await this.byId(NC_DIALOG.title).isVisible().catch(() => false))) return false;
    await this.answerDialog(answer);
    return true;
  }

  /** Answers the open dialog: Yes (`confirm`), No (`cancel`) or its X (`close`); waits for it to close. */
  async answerDialog(answer: 'confirm' | 'cancel' | 'close'): Promise<void> {
    if (answer === 'close') await this.byId(NC_DIALOG.close).click();
    else await this.btn(NC_DIALOG.action(answer)).click();
    await expect(this.byId(NC_DIALOG.title)).toBeHidden({ timeout: Timeouts.default });
  }
}

// ---- row actions ------------------------------------------------------------------------

/** Clicks a row's View and reads the details drawer. */
export async function viewDetails(tab: AnnouncementsTab, view: AnnouncementViewDrawer, id: string): Promise<{ text: string; fields: Record<string, string> }> {
  await tab.rowAction(id, 'view').click();
  return view.read();
}

const VIEW_LABELS = ['Name', 'Status', 'Publish at', 'Published on', 'ENGLISH MESSAGE', 'ARABIC MESSAGE', 'AUDIENCES', 'Close'];

/** A details field's value - '' when the panel shows nothing under the label (the next line is another label). */
export function viewField(fields: Record<string, string>, label: string): string {
  const v = normalise(fields[label] ?? '');
  return VIEW_LABELS.includes(v) ? '' : v;
}

/** The details panel's values by label (every label of VIEW_LABELS but Close), '' where nothing is shown. */
export function detailsShown(read: { text: string; fields: Record<string, string> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const label of VIEW_LABELS.filter((l) => l !== 'Close')) out[label] = viewField(read.fields, label);
  // AUDIENCES may span several lines (one per audience): everything between the label and Close.
  const lines = read.text.split(' | ');
  const from = lines.indexOf('AUDIENCES');
  const to = lines.lastIndexOf('Close');
  if (from >= 0) out.AUDIENCES = normalise(lines.slice(from + 1, to > from ? to : undefined).join(' '));
  return out;
}

/** `value`, or a clear error naming `what` when a precondition step left it unset. */
export function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`${what} was not produced by the precondition step`);
  return value;
}

/** The audience lines of `record` that the AUDIENCES value does not name. */
export function missingAudienceLines(record: AnnouncementRecord, shownAudiences: string): string[] {
  return audienceLines(record).filter((line) => !normalise(shownAudiences).includes(normalise(line)));
}

/** "Users:<name>" / "Roles:<name>" for every stored audience, as the panel prints them. */
export function audienceLines(record: AnnouncementRecord): string[] {
  return record.audiences.map((a) => `${a.audienceTypeId === AUDIENCE_TYPE.roles ? 'Roles' : 'Users'}:${a.referenceName}`);
}

/**
 * What the details panel should show for `record`: Name, Status, Publish at /
 * Published on as the screen formats them (`notPublished` when publishedOn is
 * null), both messages. AUDIENCES is checked separately (audienceLines).
 */
export function detailsExpected(record: AnnouncementRecord, notPublished: string): Record<string, string> {
  return {
    Name: record.name,
    Status: record.status,
    'Publish at': screenDateTime(record.publishAt),
    // normalised like the panel text (detailsShown reads "—" as "-", lead decision 3)
    'Published on': record.publishedOn ? screenDateTime(record.publishedOn) : normalise(notPublished),
    'ENGLISH MESSAGE': normalise(record.englishMessage),
    'ARABIC MESSAGE': normalise(record.arabicMessage),
  };
}

/** Clicks a row's Edit and waits for the drawer. */
export async function openEdit(tab: AnnouncementsTab, drawer: AnnouncementDrawer, id: string): Promise<void> {
  await tab.rowAction(id, 'edit').click();
  await drawer.waitForOpen();
}

/** Clicks a Cancelled row's Reschedule and waits for the drawer. */
export async function openReschedule(tab: AnnouncementsTab, drawer: AnnouncementRescheduleDrawer, id: string): Promise<void> {
  await tab.rowAction(id, 'reschedule').click();
  await drawer.waitForOpen();
}

/** The General step's current values. */
export async function generalValues(drawer: AnnouncementDrawer): Promise<{ name: string; english: string; arabic: string; publishAt: string }> {
  const v = async (l: Locator): Promise<string> => l.inputValue().catch(() => '');
  return {
    name: await v(drawer.el('name')),
    english: await v(drawer.byPart('english-message-input')),
    arabic: await v(drawer.byPart('arabic-message-input')),
    publishAt: await v(drawer.publishInput()),
  };
}

/** Empties a General text field (select-all + delete, then blur). */
export async function clearField(page: Page, field: Locator): Promise<void> {
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
}

/** Whether the drawer shows its Audiences step (the Add audience button). */
export async function onAudiencesStep(drawer: AnnouncementDrawer): Promise<boolean> {
  return drawer.el('addAudience').isVisible().catch(() => false);
}

/** How many audience cards the drawer shows. */
export async function audienceCardCount(page: Page): Promise<number> {
  return page.locator(`[id^="${NC_FORM.id('announcements', 'audience-idx-')}"][id$="-type-select"]`).count();
}

/**
 * Removes audience card `idx` with its own remove button and answers how many
 * cards the drawer shows once the removal has rendered (the card leaves with an
 * animation - a count read right after the click still saw it: full run
 * 2026-11-12, 21756 / 21760, whose screenshots show the card gone).
 */
export async function removeAudienceCard(page: Page, drawer: AnnouncementDrawer, idx: number): Promise<number> {
  const before = await audienceCardCount(page);
  await drawer.audienceCard(idx, 'remove-button').click();
  await expect.poll(() => audienceCardCount(page), { timeout: Timeouts.default }).toBeLessThan(before).catch(() => undefined);
  return audienceCardCount(page);
}

/**
 * "The date/time is entered in the field": after typing `at` into Publish at
 * and leaving the field, answers what the field holds (waiting up to 10 s for
 * it to show `at`) and a note for the failure message saying what the app did
 * instead - in this build an out-of-range value is EMPTIED as soon as the field
 * is left (21735 / 21753 / 21754) - and which inline message, if any, it showed.
 */
export async function publishAtAfterTyping(drawer: AnnouncementDrawer, at: Date): Promise<{ wanted: string; held: string; note: string }> {
  const wanted = pickerText(at);
  const kept = await expect(drawer.publishInput()).toHaveValue(wanted, { timeout: 10_000 }).then(() => true, () => false);
  const held = await drawer.publishInput().inputValue().catch(() => '');
  if (kept) return { wanted, held, note: 'Publish at' };
  const shown = (await drawer.allErrors().catch(() => [] as string[])).filter(Boolean);
  const what = held === '' ? 'the app EMPTIED the field as soon as it was left' : `the field shows "${held}" instead`;
  const said = shown.length > 0 ? `inline message "${shown.join(' | ')}"` : 'no message shown';
  return { wanted, held, note: `Publish at was typed as "${wanted}" - ${what} (${said})` };
}

/** What one submit attempt produced. */
export interface SubmitOutcome {
  /** Toast after Next ('' when none / when Save was pressed directly). */
  nextToast: string;
  /** Whether the Audiences step was reached. */
  reachedAudiences: boolean;
  /** The Save outcome, or null when Save could not be pressed (blocked on General). */
  save: DrawerSaveOutcome | null;
  /** Every message the attempt showed (toasts + the drawer's text + the server's errors), whitespace collapsed. */
  messages: string;
  /** Whether the drawer was still open afterwards. */
  drawerOpen: boolean;
}

/**
 * "Click Save" from wherever the drawer stands: presses Save when it is shown;
 * otherwise Next (General) and, when the Audiences step is reached, assigns
 * `assignUser` on a new Users card if the drawer has no card yet, then Save.
 * Reports every message seen. Asserts nothing.
 */
export async function submitAnnouncement(page: Page, drawer: AnnouncementDrawer, assignUser?: string): Promise<SubmitOutcome> {
  let nextToast = '';
  const saveShown = await drawer.el('save').isVisible().catch(() => false);
  if (!saveShown) nextToast = await drawer.next();
  const reachedAudiences = await onAudiencesStep(drawer);
  let save: DrawerSaveOutcome | null = null;
  if (reachedAudiences || saveShown) {
    if (assignUser && reachedAudiences && (await audienceCardCount(page)) === 0) {
      const idx = await drawer.addAudience('Users');
      await drawer.assign(idx, [assignUser]);
    }
    save = await drawer.save();
  }
  const drawerText = await drawer.text();
  const serverErrors = save && save.status !== null && save.status >= 300 ? save.answer.slice(0, 400) : '';
  const messages = normalise([nextToast, save?.toast ?? '', drawerText, serverErrors].filter(Boolean).join(' | '));
  return { nextToast, reachedAudiences, save, messages, drawerOpen: await drawer.isOpen() };
}

/** One-line description of a submit outcome for failure messages. */
export function describeSubmit(o: SubmitOutcome): string {
  return `Next toast "${o.nextToast}", Audiences reached ${o.reachedAudiences}, Save ${o.save ? `${o.save.status ?? 'no request'} toast "${o.save.toast}" answer ${o.save.answer.slice(0, 200)}` : 'not pressed'}; drawer showed: ${o.messages.slice(0, 400)}`;
}

/** Whether the drawer currently offers `type` for audience card `idx` (reads the type dropdown and closes it). */
export async function typeOffered(drawer: AnnouncementDrawer, idx: number, type: string): Promise<{ offered: boolean; options: string[] }> {
  const options = await drawer.audienceTypeOptions(idx);
  return { offered: options.map((o) => o.trim()).includes(type), options };
}

/** One-line description of a Save outcome for failure messages. */
export function describeSave(o: DrawerSaveOutcome | null): string {
  return o ? `Save sent ${o.status ?? 'no request'}, toast "${o.toast}", drawer open ${o.drawerOpen}, answer ${o.answer.slice(0, 240)}` : 'Save was not pressed';
}

/** Whether a Save outcome is an accepted save (request answered below 300). */
export function accepted(o: DrawerSaveOutcome | null): boolean {
  return !!o && o.status !== null && o.status < 300;
}

/**
 * 21737: with card 0 = Users, tries to make card `idx` a second Users card and
 * save. Answers whether the type was offered, the card's type afterwards, the
 * Save outcome (only pressed when Users could be chosen) and whether a second
 * Users audience was PREVENTED (not offered, not kept, or Save refused).
 */
export async function trySecondUsersCard(page: Page, drawer: AnnouncementDrawer, idx: number, users: string): Promise<{ offered: boolean; options: string[]; typeAfter: string; save: DrawerSaveOutcome | null; messages: string; prevented: boolean }> {
  const { offered, options } = await typeOffered(drawer, idx, users);
  let typeAfter = '';
  let save: DrawerSaveOutcome | null = null;
  if (offered) {
    await drawer.choose(`audience-idx-${idx}-type-select`, users);
    typeAfter = await cardType(drawer, idx);
    save = await drawer.save();
  }
  const messages = normalise([save?.toast ?? '', await drawer.text()].join(' | '));
  const prevented = !offered || typeAfter !== users || !accepted(save);
  await page.waitForTimeout(250);
  return { offered, options, typeAfter, save, messages, prevented };
}

/** The type a card shows ('' when none chosen). */
export async function cardType(drawer: AnnouncementDrawer, idx: number): Promise<string> {
  return normalise(await drawer.audienceCard(idx, 'type-select').innerText().catch(() => ''));
}

/** Marks the page so a later `stillSamePage` can tell whether it was reloaded / navigated away. */
export async function markPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __qaWriterDMark?: number }).__qaWriterDMark = 1;
  });
}

export async function stillSamePage(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __qaWriterDMark?: number }).__qaWriterDMark === 1).catch(() => false);
}

/** The bell row (if any) of the announcement named `name` after searching the bell for it. */
export function bellRowsNamed<T extends { type: string; text: string }>(rows: T[], name: string): T[] {
  return rows.filter((r) => normalise(r.type) === normalise(name));
}
