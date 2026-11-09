import { readFileSync } from 'fs';
import type { Download, Page, Request } from '@playwright/test';
import { test as base } from '../../fixtures';
import { blockedByPrecondition, type TestSteps } from '../../fixtures/testStatus.fixture';
import { StepStatus } from '../../constants/TestStatus';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AppRoutes } from '../../constants/AppRoutes';
import { DIALOG } from '../../constants/ElementIds';
import { env } from '../../constants/EnvironmentConfig';
import { Timeouts } from '../../constants/Timeouts';
import { INVITATION_CARD, INVITATION_FORM, INVITATION_LIST, INVITATION_ROW_ACTION, INVITATION_SORT_OPTION, type InvitationSortOption } from '../../constants/user/userIds';
import { APPROVALS_REGISTRATIONS, INVITATION_FIELD_ERROR, type InvitationErrorField } from '../../constants/user/writerDIds';
import type { IdentityListAnswer } from '../../pages/user/IdentityListPage';
import type { InvitationListPage } from '../../pages/user/InvitationListPage';
import type { InvitationFormDrawer } from '../../pages/user/InvitationFormDrawer';
import { clickDialogAction, readDialog, toastMessages } from '../../pages/user/userCommon';
import { openSelect, closeSelect, requiredLabels } from '../../pages/components/PrimeControls';
import {
  INVITATION_STATUS_VALUE,
  SUITE_EMAIL_DOMAIN,
  SUITE_EMAIL_PREFIX,
  discardSuiteInvitation,
  listAssignableRoles,
  listInvitations,
  userStamp,
  type InvitationItem,
  type ProvisionedInvitation,
} from '../UserProvisioning';
import { NetworkUtils } from '../NetworkUtils';
import { parseCsv, type ParsedCsv } from '../CsvUtils';
import { buildXlsx } from '../XlsxUtils';
import { isSorted } from '../SortUtils';
import { Logger } from '../Logger';

/**
 * Writer D's helpers for the User Management invitation folders 11 (sort /
 * export), 12 (create) and 13 (search / filter) - reports/user/User-Writers-Brief.md.
 * Built on the foundation (pages/user/InvitationListPage, InvitationFormDrawer,
 * utils/UserProvisioning.ts, fixtures/userModule.fixture.ts). What the
 * foundation lacked is added here:
 *  - `test` with `discardInvitationsOf(email)` - deletes EVERY suite invitation
 *    of an address at teardown (the foundation's `discardInvitationEmail`
 *    deletes only the first one found, so a duplicate the app wrongly accepted
 *    would be left behind);
 *  - `openListCapturing` - the list's FIRST request and answer (default sort);
 *  - `sortByEach` - every Sort By option, its request and the order it answered;
 *  - `pauseFromList` (row Pause + its confirmation) and `pauseSuiteInvitation`
 *    (API, SUITE invitations only) - no Pause in the page object;
 *  - drawer reads the page object lacks: one field's error, the Payer
 *    mandatory marker, the Payer search box, the controls checklist;
 *  - `emailFile` - import files built in memory (.xlsx / .csv / no Email column / corrupt);
 *  - `rapidExports` - repeated Export clicks and every download they produced;
 *  - view-aware reads (table / cards), the Registrations tab, a direct link.
 * Invitations are only ever created / paused / deleted when their address
 * starts with `qa.automation.` (the suite's).
 */

// ---- fixture: delete every suite invitation of an address ---------------------------

export interface WriterDFixtures {
  /** Registers a SUITE address; at teardown every invitation to it is deleted (all roles / statuses). */
  discardInvitationsOf: (email: string) => void;
}

export const test = base.extend<WriterDFixtures>({
  // Depends on suiteRole so it is torn down BEFORE the suite roles the invitations name.
  discardInvitationsOf: async ({ page, suiteRole }, use, testInfo) => {
    void suiteRole;
    const emails: string[] = [];
    await use((email) => {
      if (!email.toLowerCase().startsWith(SUITE_EMAIL_PREFIX)) throw new Error(`"${email}" is not a suite address (${SUITE_EMAIL_PREFIX}...)`);
      emails.push(email);
    });
    for (const email of emails) {
      const found = await listInvitations(page, { searchText: email }, 50).catch(() => ({ items: [] as InvitationItem[], totalRows: 0 }));
      for (const item of found.items.filter((i) => i.email.toLowerCase() === email.toLowerCase())) {
        const outcome = await discardSuiteInvitation(page, item.id, item.email);
        if (outcome === 'left') testInfo.annotations.push({ type: 'leftover', description: `suite invitation ${item.email} (${item.id}) could not be deleted` });
      }
    }
  },
});

export { expect } from '../../fixtures';

// ---- step flow ---------------------------------------------------------------------------

/**
 * Ends a case BLOCKED for the part the environment cannot provide - unless an
 * earlier step already failed, in which case that failure stands and this step
 * records why the rest was not exercised. Call INSIDE the step that needs it.
 */
export function blockRest(steps: TestSteps, reason: string): never {
  if (steps.records().some((r) => r.status === StepStatus.FAIL)) throw new Error(`NOT EXERCISED - ${reason}`);
  return steps.blocked(reason);
}

/**
 * Decision 8 (payer scope): when the signed-in suite account is NOT offered the
 * role a case needs, the steps that need it are BLOCKED with the evidence of
 * what the account may assign (GetAssignableRoles).
 */
export async function blockUnlessRoleOffered(steps: TestSteps, page: Page, offered: readonly string[], roleName: string): Promise<void> {
  if (offered.includes(roleName)) return;
  const assignable = await listAssignableRoles(page).catch(() => []);
  blockRest(steps, `the role "${roleName}" is not offered to the signed-in suite account (Role Name offered ${JSON.stringify(offered)}; `
    + `GetAssignableRoles answered ${JSON.stringify(assignable.map((r) => r.name))}) - permission-not-granted: the account cannot pick the role the case needs`);
}

/**
 * A restricted suite account offered NO role at all was never given the role it
 * may assign (GetAssignableRoles evidence) - BLOCKED, not a verdict on the list.
 */
export async function blockWhenNoRoleOffered(steps: TestSteps, page: Page, offered: readonly string[]): Promise<void> {
  if (offered.length > 0) return;
  const assignable = await listAssignableRoles(page).catch(() => []);
  blockRest(steps, `the signed-in suite account is offered no Role Name at all (GetAssignableRoles answered ${JSON.stringify(assignable.map((r) => r.name))}) `
    + '- permission-not-granted: the suite role\'s assignable roles did not reach the account');
}

// ---- addresses and files -------------------------------------------------------------------

/** A suite invitation address sharing `stamp` (so one search term reveals every address of a case). */
export const stampedInvitationEmail = (stamp: string, tag: string): string => `${SUITE_EMAIL_PREFIX}inv.${stamp}${tag}@${SUITE_EMAIL_DOMAIN}`;

/** The search term every `stampedInvitationEmail(stamp, ...)` contains. */
export const stampTerm = (stamp: string): string => `${SUITE_EMAIL_PREFIX}inv.${stamp}`;

/**
 * A valid-FORMAT suite address of exactly `length` characters: a 64-character
 * local part (the RFC maximum) starting `qa.automation.inv.`, then a domain of
 * labels of at most 63 characters ending `example.com`.
 */
export function emailOfLength(length: number, stamp = userStamp()): string {
  const tail = SUITE_EMAIL_DOMAIN;
  let local = `${SUITE_EMAIL_PREFIX}inv.${stamp}`.padEnd(64, 'x').slice(0, 64);
  let rest = length - local.length - 1 - tail.length;
  if (rest === 1) {
    local = local.slice(0, 63);
    rest += 1;
  }
  if (rest < 0) throw new Error(`an address of ${length} characters cannot carry the suite prefix and domain`);
  const labels: string[] = [];
  while (rest > 0) {
    const take = rest > 64 ? 63 : rest - 1;
    labels.push('d'.repeat(take));
    rest -= take + 1;
  }
  const email = `${local}@${[...labels, tail].join('.')}`;
  if (email.length !== length) throw new Error(`built a ${email.length}-character address instead of ${length}`);
  return email;
}

/** A file for "Import Email from Excel". */
export interface EmailFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Import files built in memory: `xlsx` / `csv` = an "Email" column holding
 * `emails`; `noEmailColumn` = a workbook whose only column is "Name";
 * `corrupt` = random bytes named `.xlsx`.
 */
export function emailFile(kind: 'xlsx' | 'csv' | 'noEmailColumn' | 'corrupt', emails: readonly string[] = []): EmailFile {
  const stamp = userStamp();
  switch (kind) {
    case 'xlsx':
      return { name: `qa-automation-invitations-${stamp}.xlsx`, mimeType: XLSX_MIME, buffer: buildXlsx(['Email'], emails.map((e) => [e])) };
    case 'csv':
      return { name: `qa-automation-invitations-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(['Email', ...emails].join('\r\n'), 'utf8') };
    case 'noEmailColumn':
      return { name: `qa-automation-no-email-${stamp}.xlsx`, mimeType: XLSX_MIME, buffer: buildXlsx(['Name'], [['QA Automation'], ['QA Automation Two']]) };
    case 'corrupt':
    default:
      return { name: `qa-automation-corrupt-${stamp}.xlsx`, mimeType: XLSX_MIME, buffer: Buffer.from(`PK\u0003\u0004 not a workbook ${stamp} ${'#'.repeat(64)}`, 'latin1') };
  }
}

/** Imports a file and returns every message the drawer and toasts showed, plus the chips after it. */
export async function importAndRead(drawer: InvitationFormDrawer, file: EmailFile): Promise<{ messages: string[]; text: string; chips: string[] }> {
  const shown = await drawer.importFile(file);
  const messages = [...new Set([...shown, ...(await drawer.getMessages())])];
  return { messages, text: await drawer.getText(), chips: await drawer.readChips() };
}

/** Whether `expected` was shown - as a toast / field message or anywhere in the drawer's text. */
export const wasShown = (seen: { messages: readonly string[]; text: string }, expected: string): boolean =>
  seen.messages.some((m) => m.includes(expected)) || seen.text.includes(expected);

// ---- drawer reads the page object lacks ----------------------------------------------------

/** One field's error under the drawer ('' when none). */
export async function drawerFieldError(page: Page, field: InvitationErrorField): Promise<string> {
  const error = page.locator(`#${INVITATION_FIELD_ERROR[field]}`);
  return (await error.isVisible().catch(() => false)) ? (await error.innerText()).replace(/\s+/g, ' ').trim() : '';
}

/** The drawer's labels marked mandatory (the red "*" is CSS - PrimeControls.requiredLabels). */
export async function drawerRequiredLabels(page: Page): Promise<string[]> {
  return requiredLabels(page.locator(`#${INVITATION_FORM.root}`));
}

/** The Payer select shows nothing chosen (its placeholder "Select", or blank). */
export const payerIsEmpty = (shown: string): boolean => /^(select)?$/i.test(shown.trim());

/**
 * Opens the Payer select, reports whether it offers a search box, types `term`
 * into it (when given) and returns the options then offered (empty-message
 * entries dropped). The select is closed again.
 */
export async function payerSearch(page: Page, term = ''): Promise<{ searchOffered: boolean; options: string[] }> {
  const combobox = page.locator(`#${INVITATION_FORM.payer}`);
  const options = await openSelect(page, combobox);
  const filter = page.locator('input.p-select-filter').filter({ visible: true }).first(); // locator-exception: PrimeNG's filter input carries no app id
  const searchOffered = await filter.isVisible().catch(() => false);
  if (searchOffered && term !== '') {
    await filter.fill(term);
    await page.waitForTimeout(600);
  }
  const labels = (await options.allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.trim())
    .filter((t) => t !== '' && !/^no (results|data|records|available)/i.test(t));
  if (searchOffered && term !== '') await filter.fill('');
  await closeSelect(page, combobox);
  return { searchOffered, options: labels };
}

/** The Add New Invitation drawer's controls (20657's checklist), by id. */
export async function drawerChecklist(page: Page): Promise<Record<'roleSelect' | 'payerSelect' | 'emailInput' | 'addEmailButton' | 'fileInput' | 'saveButton', boolean>> {
  const visible = (id: string): Promise<boolean> => page.locator(`#${id}`).isVisible().catch(() => false);
  return {
    roleSelect: await visible(INVITATION_FORM.role),
    payerSelect: await visible(INVITATION_FORM.payer),
    emailInput: await visible(INVITATION_FORM.email),
    addEmailButton: await visible(INVITATION_FORM.addEmail),
    // The real file input is hidden behind "Browse Files" - it must be in the drawer.
    fileInput: (await page.locator(`#${INVITATION_FORM.file}`).count()) > 0,
    saveButton: await visible(INVITATION_FORM.save),
  };
}

/** Whether every request of a Save answered 2xx. */
export const allSaved = (answers: readonly { status: number }[]): boolean => answers.length > 0 && answers.every((a) => a.status >= 200 && a.status < 300);

// ---- records -------------------------------------------------------------------------

/** Hours between an invitation's creation and its expiry (5 days = 120). */
export const validityHours = (item: Pick<InvitationItem, 'createdOn' | 'expiresOn'>): number =>
  Math.round(((Date.parse(item.expiresOn) - Date.parse(item.createdOn)) / 3_600_000) * 100) / 100;

/** Every invitation of a search term (admin API), newest first. */
export async function invitationsMatching(page: Page, term: string): Promise<InvitationItem[]> {
  return (await listInvitations(page, { searchText: term }, 100)).items;
}

/** Status names compared without spaces / case ("Pending Approval" = "PendingApproval"). */
export const sameStatus = (a: string, b: string): boolean => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

/** The list's "DD/MM/YYYY HH:mm" as the export's "YYYY-MM-DD". */
export function listDateToIso(shown: string): string {
  const m = shown.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// ---- list ----------------------------------------------------------------------------

/** Opens the list (keeping the user's view) and returns its FIRST request and answer. */
export async function openListCapturing(list: InvitationListPage): Promise<{ request: Record<string, unknown>; answer: IdentityListAnswer<InvitationItem> }> {
  let request: Record<string, unknown> = {};
  const answer = await list.captureList(async () => {
    request = await list.captureListRequest(() => list.open());
  });
  return { request, answer };
}

/** The `sortBy` field each Sort By option must send (probe 2026-11-08; a field option keeps the current direction). */
export const SORT_FIELD: Record<InvitationSortOption, { field: string; direction?: 'asc' | 'desc' }> = {
  newest: { field: 'CreatedOn', direction: 'desc' },
  oldest: { field: 'CreatedOn', direction: 'asc' },
  email: { field: 'Email' },
  role: { field: 'RoleName' },
  expiration: { field: 'ExpiresOn' },
  status: { field: 'Status' },
  lastModified: { field: 'ModifiedOn' },
};

const STATUS_ORDER = Object.keys(INVITATION_STATUS_VALUE).map((s) => s.replace(/\s+/g, '').toLowerCase());

/** Texts in order under ANY of the usual collations (locale / code unit / letters and digits only) - the server's collation is not ours. */
function textOrdered(values: string[], direction: 'asc' | 'desc'): boolean {
  const lower = values.map((v) => v.toLowerCase());
  const alnum = lower.map((v) => v.replace(/[^a-z0-9؀-ۿ]+/g, ''));
  const codeUnit = (xs: string[]): boolean => xs.every((x, i) => i === 0 || (direction === 'asc' ? xs[i - 1] <= x : xs[i - 1] >= x));
  return isSorted(values, direction) || codeUnit(lower) || codeUnit(alnum);
}

function datesOrdered(values: (string | null)[], direction: 'asc' | 'desc'): boolean {
  const t = values.filter((v): v is string => !!v).map((v) => Date.parse(v));
  return t.every((x, i) => i === 0 || (direction === 'asc' ? t[i - 1] <= x : t[i - 1] >= x));
}

/** Status: by the enum's order (Pending, Active, Paused, Completed, Expired, Pending Approval, Rejected) or by name. */
function statusOrdered(values: string[], direction: 'asc' | 'desc'): boolean {
  const rank = values.map((v) => STATUS_ORDER.indexOf(v.replace(/\s+/g, '').toLowerCase()));
  const byEnum = rank.every((x, i) => i === 0 || (direction === 'asc' ? rank[i - 1] <= x : rank[i - 1] >= x));
  return byEnum || textOrdered(values, direction);
}

/** Whether `items` are in the order `sortBy` ("Field asc|desc") asks for. */
export function orderedBy(items: readonly InvitationItem[], sortBy: string): boolean {
  const [field, dir] = sortBy.split(/\s+/);
  const direction = (dir ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  switch (field) {
    case 'CreatedOn': return datesOrdered(items.map((i) => i.createdOn), direction);
    case 'ExpiresOn': return datesOrdered(items.map((i) => i.expiresOn), direction);
    case 'ModifiedOn': return datesOrdered(items.map((i) => i.modifiedOn), direction);
    case 'Email': return textOrdered(items.map((i) => i.email), direction);
    case 'RoleName': return textOrdered(items.map((i) => i.roleName), direction);
    case 'Status': return statusOrdered(items.map((i) => i.statusName || i.status), direction);
    default: return false;
  }
}

/** One Sort By option's outcome. */
export interface SortOutcome {
  option: InvitationSortOption;
  sortBy: string;
  fieldAsExpected: boolean;
  ordered: boolean;
  rowsFollowAnswer: boolean;
}

/** Picks every option in turn; for each: the request's `sortBy`, whether the answer is in that order, whether the rows on screen follow it. */
export async function sortByEach(list: InvitationListPage, options: readonly InvitationSortOption[]): Promise<SortOutcome[]> {
  const out: SortOutcome[] = [];
  for (const option of options) {
    const { request, answer } = await list.sortByOption(option);
    const sortBy = String(request.sortBy ?? '');
    const expected = SORT_FIELD[option];
    const [field, dir] = sortBy.split(/\s+/);
    out.push({
      option,
      sortBy,
      fieldAsExpected: field === expected.field && (!expected.direction || (dir ?? '').toLowerCase() === expected.direction),
      ordered: orderedBy(answer.items, sortBy),
      rowsFollowAnswer: JSON.stringify(await list.rowIdsOnScreen()) === JSON.stringify(answer.items.map((i) => i.id)),
    });
    Logger.step(`[sort] ${option} -> ${sortBy} (${answer.items.length} rows)`);
  }
  return out;
}

/** The option keys in menu order. */
export const SORT_OPTION_KEYS = Object.keys(INVITATION_SORT_OPTION) as InvitationSortOption[];

/** One invitation as shown in the CURRENT view (table row or card). */
export async function readInvitationShown(list: InvitationListPage, id: string): Promise<{ view: 'table' | 'cards'; email: string; role: string; payer: string; expiration: string; status: string }> {
  const view = await list.readView();
  if (view === 'cards') {
    const f = INVITATION_CARD.field;
    return {
      view,
      email: await list.readCardField(id, f.email),
      role: await list.readCardField(id, f.role),
      payer: await list.readCardField(id, f.payer),
      expiration: await list.readCardField(id, f.expiration),
      status: await list.readCardField(id, f.status),
    };
  }
  return { view, ...(await list.readRowById(id)) };
}

/** Switches to the other view (table <-> cards) and returns the view now shown. */
export async function toggleView(list: InvitationListPage): Promise<'table' | 'cards'> {
  if ((await list.readView()) === 'table') await list.switchToCards();
  else await list.switchToTable();
  return list.readView();
}

/**
 * Removes the applied-filter chip whose text matches `label` (e.g. /^Role/) and
 * returns the list it re-fetched. The chip key is read from the chip's own id
 * (`invitation-list-filter-chips-chip-{key}`) - only `status` was seen live.
 */
export async function removeChipLabelled(page: Page, list: InvitationListPage, label: RegExp): Promise<IdentityListAnswer<InvitationItem>> {
  const prefix = `${INVITATION_LIST.chips}-chip-`;
  const chips = await page.locator(`[id^="${prefix}"]:not([id$="-remove"])`).evaluateAll((els) => els.map((e) => ({ id: e.id, text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim() })));
  const chip = chips.find((c) => label.test(c.text));
  if (!chip) throw new Error(`no applied-filter chip matching ${label} (chips: ${chips.map((c) => c.text).join(' | ') || 'none'})`);
  return list.removeChip(chip.id.slice(prefix.length));
}

/** Keyboard-types one more character at the end of the search box and returns the box's value then. */
export async function typeOneMoreSearchChar(page: Page, char: string): Promise<string> {
  const input = page.locator(`#${INVITATION_LIST.searchInput}`);
  await input.press('End');
  await input.pressSequentially(char);
  await page.waitForTimeout(500);
  return input.inputValue();
}

// ---- pause ---------------------------------------------------------------------------

/** Row Pause, then the confirmation the app asks (when it asks): SetInvitationStatus's answer, the dialog and the toasts. */
export async function pauseFromList(page: Page, list: InvitationListPage, id: string): Promise<{ status: number; text: string; dialog: { visible: boolean; title: string; message: string }; messages: string[] }> {
  let dialog = { visible: false, title: '', message: '' };
  const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.invitationSetStatus, async () => {
    await list.clickIdentityRowAction(id, INVITATION_ROW_ACTION.pause);
    await page.locator(`#${DIALOG.root}`).waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    const d = await readDialog(page);
    dialog = { visible: d.visible, title: d.title, message: d.message };
    if (d.visible) await clickDialogAction(page, 'confirm');
  });
  return { status: answer?.status ?? -1, text: answer?.text ?? '', dialog, messages: await toastMessages(page) };
}

/** Pauses a SUITE invitation through the API (POST SetInvitationStatus `{ id, isActive: false }`); BLOCKS the case when refused. */
export async function pauseSuiteInvitation(page: Page, inv: ProvisionedInvitation): Promise<void> {
  if (!inv.email.toLowerCase().startsWith(SUITE_EMAIL_PREFIX)) throw new Error(`refusing to pause ${inv.email}: not a suite invitation`);
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.invitationSetStatus, { id: inv.id, isActive: false });
  if (res.status >= 300) blockedByPrecondition(base.info(), `a Paused suite invitation (${inv.email})`, new Error(`SetInvitationStatus answered ${res.status} ${res.text.slice(0, 200)}`));
  Logger.step(`[provision] Suite invitation ${inv.email} paused`);
}

// ---- export ---------------------------------------------------------------------------

/** The header of the first column matching `re` ('' when none). */
export const headerMatching = (parsed: ParsedCsv, re: RegExp): string => parsed.headers.find((h) => re.test(h.trim())) ?? '';

/** The export's header patterns. */
export const EXPORT_HEADER = {
  email: /^e-?mail/i,
  role: /^role/i,
  status: /^status/i,
  payer: /^payer/i,
  expiration: /^expir/i,
} as const;

/** The exported row of an invitation (by e-mail and role). */
export function exportRowFor(parsed: ParsedCsv, email: string, role: string): Record<string, string> | undefined {
  const e = headerMatching(parsed, EXPORT_HEADER.email);
  const r = headerMatching(parsed, EXPORT_HEADER.role);
  return parsed.rows.find((row) => (row[e] ?? '').toLowerCase() === email.toLowerCase() && (row[r] ?? '') === role);
}

/** The file's rows as "email | role" keys, in file order. */
export function exportKeys(parsed: ParsedCsv): string[] {
  const e = headerMatching(parsed, EXPORT_HEADER.email);
  const r = headerMatching(parsed, EXPORT_HEADER.role);
  return parsed.rows.map((row) => `${(row[e] ?? '').toLowerCase()} | ${row[r] ?? ''}`);
}

/** Every download a burst of Export clicks produced: Export -> Export All Data -> CSV, `times` times without waiting for the files. */
export async function rapidExports(page: Page, list: InvitationListPage, times: number): Promise<{ requests: number; files: { name: string; bytes: Buffer; parsed: ParsedCsv }[]; refusedClicks: number }> {
  const downloads: Download[] = [];
  let requests = 0;
  let refusedClicks = 0;
  const onDownload = (d: Download): void => {
    downloads.push(d);
  };
  const onRequest = (r: Request): void => {
    if (r.url().includes(ApiEndpoints.invitationExport)) requests += 1;
  };
  page.on('download', onDownload);
  page.on('request', onRequest);
  try {
    for (let i = 0; i < times; i += 1) {
      await list.chooseExport('all').then(() => clickDialogAction(page, 'csv')).catch(() => {
        refusedClicks += 1;
      });
    }
    await page.waitForTimeout(10_000);
  } finally {
    page.off('download', onDownload);
    page.off('request', onRequest);
  }
  const files: { name: string; bytes: Buffer; parsed: ParsedCsv }[] = [];
  for (const d of downloads) {
    const path = await d.path().catch(() => null);
    const bytes = path ? readFileSync(path) : Buffer.alloc(0);
    files.push({ name: d.suggestedFilename(), bytes, parsed: parseCsv(bytes.toString('utf8')) });
  }
  return { requests, files, refusedClicks };
}

/** Whether a buffer is a zip (an .xlsx starts "PK"). */
export const isXlsx = (bytes: Buffer): boolean => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

// ---- other screens -------------------------------------------------------------------

/** Whether Approval Management shows its Registrations tab (the registrations table) and that tab's label. */
export async function registrationsTabShown(page: Page): Promise<{ table: boolean; tabLabel: string }> {
  const table = await page.locator(`#${APPROVALS_REGISTRATIONS.table}`).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  const tabLabel = (await page.locator(`#${APPROVALS_REGISTRATIONS.tab}`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  return { table, tabLabel };
}

/** Opens an invitation "by direct link" (there is no detail page: `/users-management/invitations/{id}`) and returns where it landed and what it showed. */
export async function openInvitationLink(page: Page, id: string): Promise<{ url: string; text: string }> {
  await page.goto(new URL(`${AppRoutes.invitations}/${encodeURIComponent(id)}`, env.baseUrl).toString());
  await page.waitForLoadState('networkidle', { timeout: Timeouts.default }).catch(() => undefined);
  const text = (await page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); // locator-exception: the app's single <main> is read whole (no detail page exists)
  return { url: page.url(), text };
}

/** GetInvitations for `term` as the signed-in account of `page`: the HTTP status and the addresses answered. */
export async function invitationSearchAs(page: Page, term: string): Promise<{ status: number; emails: string[] }> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.invitationList, { pageNumber: 1, rowsPerPage: 100, sortBy: 'CreatedOn desc', searchText: term });
  let emails: string[] = [];
  try {
    emails = ((JSON.parse(res.text) as { payload?: { invitations?: { items?: InvitationItem[] } } }).payload?.invitations?.items ?? []).map((i) => i.email.toLowerCase());
  } catch {
    emails = [];
  }
  return { status: res.status, emails };
}

/** Creates `count` suite invitations through the fixture, one after another. */
export async function provisionInvitations(
  suiteInvitation: (spec?: { roleId?: string; payerName?: string; email?: string }) => Promise<ProvisionedInvitation>,
  count: number,
  spec: { roleId: string; payerName?: string; emailOf: (i: number) => string },
): Promise<ProvisionedInvitation[]> {
  const made: ProvisionedInvitation[] = [];
  for (let i = 0; i < count; i += 1) made.push(await suiteInvitation({ roleId: spec.roleId, payerName: spec.payerName, email: spec.emailOf(i) }));
  return made;
}
