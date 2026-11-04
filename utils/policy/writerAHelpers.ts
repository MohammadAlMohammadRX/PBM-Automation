import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { env } from '../../constants/EnvironmentConfig';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { POLICY_AUDIT, POLICY_CARD, POLICY_LIST, TOAST, buttonSelector } from '../../constants/ElementIds';
import { POLICY_AUDIT_ENTITY, POLICY_HISTORY_PART } from '../../constants/policy/writerAIds';
import { NON_ADMIN_PROFILE } from '../../data/accounts/nonAdminAccount.data';
import { ACCESS_TOKEN_KEY } from '../../data/payers/lifecycleGuardrails.data';
import { toArabicToken } from '../../data/payers/payer.data';
import { PayerScopeDialog } from '../../pages/components/PayerScopeDialog';
import { AUDIT_FILTER_FIELD, type AuditEntry } from '../../pages/components/AuditHistoryTab';
import type { PolicyManagementPage, PolicyListAnswer } from '../../pages/policy/PolicyManagementPage';
import type { PolicyAuditTab } from '../../pages/policy/PolicyAuditTab';
import type { PolicyImportDialog, PolicyImportAnswer } from '../../pages/policy/PolicyImportDialog';
import type { PolicyCoverage } from '../../pages/policy/PolicyFormDrawer';
import type { PolicySession } from './policyRole';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { WaitUtils } from '../WaitUtils';
import { parseCsv, type ParsedCsv } from '../CsvUtils';
import { parseXlsx } from '../XlsxUtils';
import { payerIdByName } from '../NetworkProvisioning';
import {
  buildCsv,
  buildWorkbook,
  dateLike,
  daysFromNow,
  headerLike,
  operationIdOf,
  payerCodeByName,
  rowByMeaning,
  toOperation,
  type BulkOperation,
} from '../formulary/writerAHelpers';
import {
  POLICY_SUITE_PAYER,
  activatePolicy,
  inactivatePolicy,
  plansForPayer,
  policyDateText,
  publishPolicyChange,
  rejectPolicy,
  stageTrivialChange,
  submitPolicy,
  suitePolicyPlan,
  updatePolicyFields,
  waitForPolicy,
  waitForPolicyStatus,
  type PolicyListItem,
  type PolicyUploadFile,
  type ProvisionedPolicy,
} from '../PolicyProvisioning';

/**
 * Writer A's helpers for the Policy folders 01 (dashboard counters and grid),
 * 02 (search, sort, export), 09 (bulk import), 14 (version history), 16 (audit
 * history), 17 (policies per payer) and 21 (clone), 2026-11-03.
 *
 * What the page objects do not offer, as functions taking the page object or
 * the Page: the payer-scoped session's list, generic control availability,
 * the bulk-import files and their tracking, multi-version provisioning, the
 * audit tab's full advanced search (Performed By and a CLICKED date range) and
 * the clone's period. The bulk import is the shared component Formulary uses -
 * its CSV / workbook builders and operation tracker are reused from
 * utils/formulary/writerAHelpers.ts. Nothing here changes a record the suite
 * did not create.
 */

// ---- the payer-scoped account ------------------------------------------------------------

/**
 * Who plays the payer-scoped user: the configured non-admin "Payer Admin",
 * assigned "Al Dawaa 2" (inactive since 2026-11-02, so no policy can be created
 * for it) and "NUPCO" (active - the sheet's "Payer A"). The suite payer "Al
 * sharq" is outside its assignment (the sheet's "Payer B" / "Payer C").
 */
export const POLICY_SCOPE = {
  assigned: [...NON_ADMIN_PROFILE.scopedPayers] as string[],
  payerA: NON_ADMIN_PROFILE.scopedPayers[1],
  inactivePayer: NON_ADMIN_PROFILE.scopedPayers[0],
  outside: POLICY_SUITE_PAYER,
  allMine: 'All My Payers',
  allPayers: 'All Payers',
} as const;

/** Opens the policy list in a shaped session, answering the payer gate, with `scope` put in the top bar when given. */
export async function openScopedPolicies(session: PolicySession, scope?: string): Promise<void> {
  await session.policies.open();
  await new PayerScopeDialog(session.page).chooseIfShowingNow(scope).catch(() => null);
  if (scope !== undefined) await session.policies.scopeTo(scope);
  await session.policies.waitForRowsRendered().catch(() => undefined);
}

/** The GetPolicies answer the screen itself fetches on a reload (the top-bar scope applied). */
export async function readScreenList(list: PolicyManagementPage): Promise<PolicyListAnswer> {
  return list.captureList(() => list.reload());
}

/** The distinct payers of a list answer. */
export const payersOf = (items: readonly PolicyListItem[]): string[] => [...new Set(items.map((p) => p.payerNameEn))];

/** Whether a payer of the register is active (GetPayers `isActive`), null when it is not found. */
export async function payerIsActive(page: Page, name: string): Promise<boolean | null> {
  const res = await NetworkUtils.postAsSession(page, '/api/Payers/GetPayers', { pageNumber: 1, rowsPerPage: 50, searchText: name });
  if (res.status >= 300) return null;
  const items = (JSON.parse(res.text) as { payload?: { payers?: { items?: { payerNameEn: string; isActive?: boolean }[] } } }).payload?.payers?.items ?? [];
  const found = items.find((p) => p.payerNameEn === name);
  return found ? found.isActive !== false : null;
}

// ---- controls, cards, list reads ---------------------------------------------------------

/** How a button is offered by its id: absent, disabled or available. */
export async function controlAvailability(page: Page, id: string): Promise<'absent' | 'disabled' | 'available'> {
  const button = page.locator(buttonSelector(id)).first();
  if ((await button.count()) === 0 || !(await button.isVisible().catch(() => false))) return 'absent';
  return (await button.isEnabled()) ? 'available' : 'disabled';
}

/** Whether any element carries the id at all. */
export async function isRendered(page: Page, id: string): Promise<boolean> {
  return (await page.locator(`#${id}`).count()) > 0;
}

/** How many policy cards the Cards view shows. */
export async function countCards(page: Page): Promise<number> {
  return page.locator(`article[id^="${POLICY_CARD.prefix}"]`).count();
}

/** What the list's search box holds. */
export async function readSearchBox(page: Page): Promise<string> {
  return page.locator(`#${POLICY_LIST.searchInput}`).inputValue().catch(() => '');
}

/** The `maxlength` the list's search box declares (null = none). */
export async function searchMaxLength(page: Page): Promise<number | null> {
  const value = await page.locator(`#${POLICY_LIST.searchInput}`).getAttribute('maxlength').catch(() => null);
  return value === null ? null : Number(value);
}

/** Toasts on screen, settled. */
export async function visibleMessages(page: Page, timeout: number = Timeouts.short): Promise<string[]> {
  return WaitUtils.settleMessages(async () => (await page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== ''), timeout);
}

/** A message that reads as an error the user should not see after a normal action. */
export const ERROR_MESSAGE = /error|exception|failed|unable|went wrong|status code|stack/i;

/**
 * Searches the list and returns the status and contents of the GetPolicies
 * answer to THIS search (the search page object only waits for it).
 */
export async function searchAnswer(list: PolicyManagementPage, page: Page, term: string): Promise<{ status: number; items: PolicyListItem[]; totalRows: number }> {
  const waiting = page.waitForResponse((r) => /\/GetPolicies$/.test(new URL(r.url()).pathname)
    && (r.request().postData() ?? '').includes(`"searchText":${JSON.stringify(term)}`), { timeout: Timeouts.default }).catch(() => null);
  await list.search(term);
  const response = await waiting;
  if (!response) return { status: -1, items: [], totalRows: -1 };
  const body = await response.json().catch(() => null) as { payload?: { policies?: { items?: PolicyListItem[]; totalRows?: number } } } | null;
  return { status: response.status(), items: body?.payload?.policies?.items ?? [], totalRows: body?.payload?.policies?.totalRows ?? -1 };
}

/**
 * A status cell's STATUS badge alone. The cell also carries the "In Grace" tag
 * (2026-11-04: "Active\nIn Grace" / "Active In Grace" was reported as another
 * status under the Active filter); the tag is not a status.
 */
export const primaryStatus = (cell: string): string => cell.split('\n')[0].replace(/\s+In Grace\s*$/i, '').trim();

/** Text order the way a user reads A-Z (case and accents ignored, numbers by value). */
export const byText = (a: string, b: string): number => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });

/** Whether `values` are in the order `compare` defines. */
export function isOrdered<T>(values: readonly T[], compare: (a: T, b: T) => number): boolean {
  return values.every((value, i) => i === 0 || compare(values[i - 1], value) <= 0);
}

/** A list date (`DD/MM/YYYY HH:mm`) or ISO date as a number. */
export function dateValue(text: string): number {
  const shown = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (shown) return new Date(Number(shown[3]), Number(shown[2]) - 1, Number(shown[1]), Number(shown[4] ?? 0), Number(shown[5] ?? 0)).getTime();
  return Date.parse(text);
}

/** Every number in a JSON answer set to 0 - the empty-scope dashboard (as the Formulary suite does it). */
export const zeroed = (value: unknown): unknown => {
  if (typeof value === 'number') return 0;
  if (Array.isArray(value)) return value.map(zeroed);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, zeroed(v)]));
  return value;
};

/** The values of the export column matching `pattern` ('' header -> []). */
export function exportColumn(parsed: ParsedCsv, pattern: RegExp): string[] {
  const header = headerLike(parsed.headers, pattern);
  return header === '' ? [] : parsed.rows.map((row) => (row[header] ?? '').trim());
}

/** The export / template header of the policy's (English) name: a "name" column that is not the plan's, payer's, holder's or the Arabic one ('' when none). */
export const nameHeaderOf = (headers: readonly string[]): string =>
  headers.find((h) => /name/i.test(h) && !/plan|payer|holder|arabic|\(ar\b|\bar\)|عرب/i.test(h)) ?? '';

/** The export row whose name column reads `name` exactly. */
export function exportRowNamed(parsed: ParsedCsv, name: string): Record<string, string> | undefined {
  const header = nameHeaderOf(parsed.headers);
  return parsed.rows.find((row) => (row[header] ?? '').trim() === name);
}

/** The policy names of an export, in file order. */
export const exportNames = (parsed: ParsedCsv): string[] => parsed.rows.map((row) => (row[nameHeaderOf(parsed.headers)] ?? '').trim());

/** The plan quick filter's label of a plan: "<name> (PLN-nnnn)" (live 2026-11-03). */
export async function planFilterLabel(page: Page, payerName: string, planId: string, planName: string): Promise<string> {
  const plan = (await plansForPayer(page, await payerIdByName(page, payerName))).find((p) => p.id === planId);
  return plan ? `${planName} (${plan.planCode})` : planName;
}

// ---- bulk import ---------------------------------------------------------------------------

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A CSV upload of `rows` in `headers`' columns. */
export const csvUpload = (headers: readonly string[], rows: ReadonlyArray<Record<string, string>>, name: string): PolicyUploadFile =>
  ({ name, mimeType: 'text/csv', buffer: buildCsv(headers, rows) });

/** An .xlsx upload (one sheet) of `rows` in `headers`' columns. */
export const xlsxUpload = (headers: readonly string[], rows: ReadonlyArray<Record<string, string>>, name: string, sheet = 'Sheet1'): PolicyUploadFile =>
  ({ name, mimeType: XLSX_MIME, buffer: buildWorkbook([{ name: sheet, headers: [...headers], rows: [...rows] }]) });

/**
 * A CSV of EXACTLY `totalBytes`: the rows given plus one padding row whose
 * `padHeader` cell is filled with "X" (a row that can only fail validation -
 * an oversized value with no other field), so the file's size is the case's
 * own and the import creates nothing from the padding.
 */
export function paddedCsv(headers: readonly string[], rows: ReadonlyArray<Record<string, string>>, padHeader: string, totalBytes: number, name: string): PolicyUploadFile {
  const base = buildCsv(headers, [...rows, { [padHeader]: '' }]).length;
  const padding = Math.max(0, totalBytes - base);
  const buffer = buildCsv(headers, [...rows, { [padHeader]: 'X'.repeat(padding) }]);
  if (buffer.length !== totalBytes) throw new Error(`padded CSV is ${buffer.length} bytes, ${totalBytes} wanted`);
  return { name, mimeType: 'text/csv', buffer };
}

/** What a policy import file is built from: the template's headers, how dates are written, the suite plan / payer and the holders' tags. */
export interface PolicyImportKit {
  headers: string[];
  dateSample: string;
  planCode: string;
  planName: string;
  payerCode: string;
  /** Holder English name -> its TAG ("Acme Corporation" -> "ACME"), as GetPolicyHoldersDropdown answers. */
  holderTags: Record<string, string>;
}

/**
 * The policy holders' import tags. 2026-11-04: the template's column is "Policy
 * Holder Tag" and a NAME there fails every row ("No policy holder with tag Acme
 * Corporation was found").
 */
async function policyHolderTags(page: Page): Promise<Record<string, string>> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.policyHoldersDropdown}?rowsPerPage=50`);
  if (res.status >= 300) return {};
  const holders = (JSON.parse(res.text) as { payload?: { nameEn: string; tag?: string }[] }).payload ?? [];
  return Object.fromEntries(holders.filter((h) => (h.tag ?? '') !== '').map((h) => [h.nameEn, h.tag as string]));
}

/**
 * An Arabic-only policy name for an import row, unique per English name.
 * 2026-11-04: "وثيقة استيراد zrnb 1" failed every row ("Policy Arabic name must
 * contain only Arabic characters") - the English name's tail is now spelt in
 * Arabic letters (toArabicToken).
 */
const importArabicName = (nameEn: string): string => `وثيقة استيراد ${toArabicToken(nameEn.replace(/[^a-z0-9]/gi, '').slice(-8))}`;

/**
 * Builds the kit from the screen's own files: Export > Export Template's
 * headers, the date format of the list's CSV export, the suite plan's code
 * (GetPlansDropdown) and the suite payer's code. NOT verified live: the
 * template's exact headers were never read (the probe uploaded nothing), so
 * rows are written BY MEANING (rowByMeaning).
 */
export async function policyImportKit(page: Page, list: PolicyManagementPage): Promise<PolicyImportKit> {
  const template = await list.exportTemplate('csv');
  const exported = await list.exportAndParse('all', 'csv');
  const effective = headerLike(exported.parsed.headers, /effective/i);
  const plan = await suitePolicyPlan(page);
  const payerId = await payerIdByName(page, POLICY_SUITE_PAYER);
  const offered = (await plansForPayer(page, payerId)).find((p) => p.id === plan.id);
  return {
    headers: template.parsed.headers,
    dateSample: exported.parsed.rows.find((r) => (r[effective] ?? '') !== '')?.[effective] ?? '',
    planCode: offered?.planCode ?? '',
    planName: plan.name,
    payerCode: await payerCodeByName(page, POLICY_SUITE_PAYER),
    holderTags: await policyHolderTags(page),
  };
}

/** One policy row of an import file, by meaning. */
export interface PolicyImportRow {
  nameEn: string;
  nameAr?: string;
  /** "Group" (default) | "Individual" - or any text (the unrecognised-type row). */
  type?: string;
  holder?: string;
  planCode?: string;
  effective?: Date | string;
  expiry?: Date | string;
  maxMembers?: string;
}

/**
 * A policy row in the template's columns: a Group policy of "Acme Corporation"
 * (written as its TAG, the template's "Policy Holder Tag") on the suite plan,
 * effective in 2 days for 60 days. A string date is written as is (the
 * invalid-date row).
 */
export function policyImportRow(kit: PolicyImportKit, row: PolicyImportRow): Record<string, string> {
  const date = (value: Date | string | undefined, fallback: Date): string => (typeof value === 'string' ? value : dateLike(kit.dateSample, value ?? fallback));
  const holder = row.holder ?? 'Acme Corporation';
  return rowByMeaning(kit.headers, [
    [/plan/i, row.planCode ?? kit.planCode],
    [/payer.*(code|number|id)/i, kit.payerCode],
    [/payer/i, POLICY_SUITE_PAYER],
    [/holder/i, kit.holderTags[holder] ?? holder],
    [/type/i, row.type ?? 'Group'],
    [/arabic|\(ar\b|\bar\)|عرب/i, row.nameAr ?? importArabicName(row.nameEn)],
    [/name/i, row.nameEn],
    [/effective|start/i, date(row.effective, daysFromNow(2))],
    [/expiry|expir|end/i, date(row.expiry, daysFromNow(60))],
    [/grace/i, ''],
    [/max|limit/i, row.maxMembers ?? ''],
    [/deductible/i, '0'],
    [/coinsurance/i, '0'],
    [/out.?of.?pocket|oop/i, '0'],
    [/sublimit/i, '0'],
  ]);
}

/**
 * A member row of the Members tab's import template, by meaning: the member is
 * named by its Member Code ONLY. 2026-11-04: with the National ID filled too every
 * row failed ("National ID: leave it empty when the Member Code is filled in —
 * name the member by one of the two, not both"), so the ID column stays empty.
 */
export function memberImportRow(headers: readonly string[], member: { memberCode: string; documentId: string }, relationship = 'Spouse'): Record<string, string> {
  return rowByMeaning(headers, [
    [/relation/i, relationship],
    [/document|national|iqama|identity/i, ''],
    [/member|code|number|id/i, member.memberCode],
  ]);
}

/** A network row of the Network Assignment tab's import template, by meaning. */
export function networkImportRow(headers: readonly string[], networkCode: string): Record<string, string> {
  return rowByMeaning(headers, [[/network|code/i, networkCode]]);
}

/** Adds a file in the drawer; returns the answer with the operation it started ('' when none). */
export async function startPolicyImport(dialog: PolicyImportDialog, file: PolicyUploadFile): Promise<PolicyImportAnswer & { operationId: string }> {
  const answer = await dialog.addFile(file);
  return { ...answer, operationId: answer.status < 300 ? operationIdOf(answer.text) : '' };
}

/** The policy import history (GetPolicyImportHistory) for a record type, newest first. */
export async function readPolicyImportHistory(page: Page, entity: string | null = null): Promise<BulkOperation[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyImportHistory, { entity, pageNumber: 1, rowsPerPage: 20 });
  if (res.status >= 300) throw new Error(`GetPolicyImportHistory answered ${res.status} ${res.text.slice(0, 200)}`);
  const items = (JSON.parse(res.text) as { payload?: { items?: Record<string, unknown>[] } }).payload?.items ?? [];
  return items.map(toOperation);
}

/** Downloads an operation's result file (DownloadPolicyImportResult `{ operationId, format }`) and parses it. */
export async function downloadPolicyImportResult(page: Page, operationId: string): Promise<{ status: number; parsed: ParsedCsv }> {
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const response = await page.request.fetch(`${env.baseUrl}${ApiEndpoints.policyImportResult}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
    data: { operationId, format: 'Csv' },
    failOnStatusCode: false,
  });
  const bytes = await response.body();
  const isZip = bytes.subarray(0, 2).toString('latin1') === 'PK';
  return { status: response.status(), parsed: isZip ? parseXlsx(bytes) : parseCsv(bytes.toString('utf8')) };
}

/** The history row (`{history}-table-row-{id}`) of the newest upload of `fileName`, '' when none. */
export async function historyRowIdFor(page: Page, history: string, fileName: string): Promise<string> {
  const prefix = `${history}-${POLICY_HISTORY_PART.rowPrefix}`;
  const rows = await page.locator(`tr[id^="${prefix}"]`).evaluateAll((trs, args) => trs.map((tr) => ({
    id: tr.id.slice(args.prefix.length),
    file: ((tr.querySelector('[id$="-cell-filename"]') as HTMLElement | null)?.innerText ?? '').trim(),
    status: ((tr.querySelector('[id$="-cell-status"]') as HTMLElement | null)?.innerText ?? '').trim(),
  })), { prefix });
  return rows.find((r) => r.file === fileName)?.id ?? '';
}

/** One history row's cells by key (filename, totalrows, succeededrows, failedrows, status ...). */
export async function readHistoryRow(page: Page, history: string, rowId: string): Promise<Record<string, string>> {
  return page.locator(`#${history}-${POLICY_HISTORY_PART.rowPrefix}${rowId}`).evaluate((tr) => {
    const out: Record<string, string> = {};
    tr.querySelectorAll('[id*="-cell-"]').forEach((cell) => { out[cell.id.split('-cell-')[1]] = (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim(); });
    return out;
  });
}

/** Clicks a history row's "Download the failed rows" button and returns the file parsed ('' name when nothing downloaded). */
export async function downloadHistoryResult(page: Page, history: string, rowId: string, format: 'csv' | 'excel' = 'csv'): Promise<{ filename: string; parsed: ParsedCsv }> {
  const part = format === 'csv' ? POLICY_HISTORY_PART.resultCsv : POLICY_HISTORY_PART.resultExcel;
  const downloaded = page.waitForEvent('download', { timeout: Timeouts.default }).catch(() => null);
  await page.locator(buttonSelector(`${history}-${part}${rowId}`)).first().click();
  const download = await downloaded;
  if (!download) return { filename: '', parsed: { headers: [], rows: [] } };
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const name = download.suggestedFilename();
  return { filename: name, parsed: /\.csv$/i.test(name) ? parseCsv(bytes.toString('utf8')) : parseXlsx(bytes) };
}

/** Sends an Import* request directly as the session (multipart `File` + extra fields) - the "invoke it directly" checks. */
export async function postImportAsSession(page: Page, endpoint: string, file: PolicyUploadFile, fields: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const response = await page.request.fetch(`${env.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
    multipart: { File: file, ...fields },
    failOnStatusCode: false,
  });
  return { status: response.status(), text: await response.text().catch(() => '') };
}

/** The import result's error text of a row (its error / reason / message column; '' when the file has none). */
export function resultReason(parsed: ParsedCsv, row: Record<string, string> | undefined): string {
  const header = headerLike(parsed.headers, /error|reason|message|result/i);
  return header === '' || row === undefined ? '' : (row[header] ?? '').trim();
}

/** The result rows carrying `text` in any cell. */
export const resultRowsWith = (parsed: ParsedCsv, text: string): Record<string, string>[] =>
  parsed.rows.filter((row) => Object.values(row).some((v) => v.includes(text)));

// ---- versions -------------------------------------------------------------------------------

/** "v3" -> 3. */
export const versionNumber = (cell: string): number => Number((cell.match(/(\d+)/) ?? ['', 'NaN'])[1]);

/** Publishes `count` harmless changes (a document each, sent and approved): v1 -> v1 + count. */
export async function publishDocumentChanges(page: Page, policy: Pick<ProvisionedPolicy, 'id' | 'nameEn'>, count: number): Promise<void> {
  for (let n = 0; n < count; n += 1) {
    await stageTrivialChange(page, policy.id, policy.nameEn);
    await publishPolicyChange(page, policy.id, policy.nameEn);
    await waitForPolicy(page, policy.id, (p) => !p.hasDraft && !p.hasPendingVersion, `change ${n + 1} published`);
  }
}

/** Activates an Inactive suite policy and approves it (a new version, "Activated"). */
export async function activateAndPublish(page: Page, policy: Pick<ProvisionedPolicy, 'id' | 'nameEn'>): Promise<void> {
  const staged = await activatePolicy(page, policy.id);
  if (staged.status >= 300) throw new Error(`SetPolicyActive answered ${staged.status} ${staged.text.slice(0, 200)}`);
  await publishPolicyChange(page, policy.id, policy.nameEn);
  await waitForPolicy(page, policy.id, (p) => p.isActive && !p.hasPendingVersion, 'activated');
}

/** Stages a harmless change (a document) and sends it for approval: a Pending Approval version. */
export async function stageAndSubmit(page: Page, policy: Pick<ProvisionedPolicy, 'id' | 'nameEn'>): Promise<void> {
  await stageTrivialChange(page, policy.id, policy.nameEn);
  const sent = await submitPolicy(page, policy.id);
  if (sent.status >= 300) throw new Error(`SubmitPolicyForApproval answered ${sent.status} ${sent.text.slice(0, 200)}`);
}

/** Stages a harmless change, sends it and rejects it: a Rejected version. */
export async function stageAndReject(page: Page, policy: Pick<ProvisionedPolicy, 'id' | 'nameEn'>): Promise<void> {
  await stageAndSubmit(page, policy);
  const rejected = await rejectPolicy(page, policy.nameEn);
  if (rejected.status >= 300) throw new Error(`RejectRequest answered ${rejected.status} ${rejected.text.slice(0, 200)}`);
  await waitForPolicy(page, policy.id, (p) => !p.hasPendingVersion, 'the rejection applied');
}

/**
 * Runs a case's own data building beyond `policyIn` (more versions, a trail)
 * and turns a refusal into BLOCKED with the server's answer, as the fixtures do.
 */
export async function provisionOrBlock<T>(what: string, build: () => Promise<T>): Promise<T> {
  try {
    return await build();
  } catch (error) {
    return blockedByPrecondition(test.info(), what, error);
  }
}

/** Sends the staged change (a revert) and approves it, then waits for it to be published. */
export async function publishStaged(page: Page, policy: Pick<ProvisionedPolicy, 'id' | 'nameEn'>): Promise<void> {
  await publishPolicyChange(page, policy.id, policy.nameEn);
  await waitForPolicy(page, policy.id, (p) => !p.hasDraft && !p.hasPendingVersion, 'the staged change published');
}

// ---- audit ----------------------------------------------------------------------------------

/**
 * Gives a never-approved suite policy (policyIn('Draft')) a varied audit trail,
 * every step published: an edit of the draft (grace period), the first
 * approval, a document, and an inactivation - Create, Update, Network
 * assigned, Documentation added and Status changed entries (staged changes are
 * audited when approved).
 */
export async function buildAuditTrail(page: Page, policy: Pick<ProvisionedPolicy, 'id' | 'nameEn'>): Promise<void> {
  const edited = await updatePolicyFields(page, policy.id, { gracePeriodDays: 7 });
  if (edited.status >= 300) throw new Error(`UpdatePolicy answered ${edited.status} ${edited.text.slice(0, 200)}`);
  await publishPolicyChange(page, policy.id, policy.nameEn);
  await waitForPolicy(page, policy.id, (p) => !p.isPendingCreate && p.currentVersion >= 1, 'approved (v1)');
  await publishDocumentChanges(page, policy, 1);
  const staged = await inactivatePolicy(page, policy.id);
  if (staged.status >= 300) throw new Error(`InactivatePolicy answered ${staged.status} ${staged.text.slice(0, 200)}`);
  await publishPolicyChange(page, policy.id, policy.nameEn);
  await waitForPolicyStatus(page, policy.id, 'inactive');
}

/** What an audit advanced search may set. Dates are CLICKED in the calendar. */
export interface AuditCriteria {
  actionType?: string;
  performedBy?: string;
  from?: Date;
  to?: Date;
}

const auditField = (key: string): string => `${POLICY_AUDIT.advancedSearch}-field-${key}-input`;

/**
 * Clicks a date range's two days in the open calendar of `input` - a TYPED
 * range is ignored by these filters (Formulary lesson, 2026-11-03).
 */
export async function pickDateRange(page: Page, input: Locator, from: Date, to: Date): Promise<void> {
  await input.click();
  const panel = page.locator('.p-datepicker-panel, .p-datepicker').filter({ visible: true }).first(); // locator-exception: the PrimeNG date-picker overlay is portalled with no id
  await expect(panel, 'the date picker should open').toBeVisible({ timeout: Timeouts.default });
  let shown = new Date();
  for (const day of [from, to]) {
    const months = (day.getFullYear() - shown.getFullYear()) * 12 + day.getMonth() - shown.getMonth();
    for (let i = 0; i < Math.abs(months); i += 1) {
      // locator-exception: the calendar's month arrows carry no id; scoped to the open panel.
      await panel.locator(months > 0 ? '.p-datepicker-next, .p-datepicker-next-button' : '.p-datepicker-prev, .p-datepicker-prev-button').first().click();
    }
    shown = day;
    // locator-exception: PrimeNG day cells carry no id; scoped to the open panel, matched by the day number.
    await panel.locator('td:not(.p-datepicker-other-month) span').filter({ hasText: new RegExp(`^\\s*${day.getDate()}\\s*$`) }).first().click();
  }
  if (await panel.isVisible().catch(() => false)) await input.click();
}

/**
 * Applies the audit tab's advanced search - Action Type, Performed By and a
 * clicked Date Range (the shared AuditHistoryTab.applyFilter types the range
 * and has no Performed By). Returns whether the drawer closed (applied), what
 * it said, and the entries shown afterwards (every page).
 */
/**
 * Opens the audit tab's advanced search and sets the criteria WITHOUT
 * searching; returns what the fields hold afterwards (action type label,
 * Performed By text, date range text) and the drawer's labels.
 */
export async function fillAuditCriteria(page: Page, audit: PolicyAuditTab, criteria: AuditCriteria): Promise<{ labels: string[]; actionType: string; performedBy: string; dateRange: string }> {
  Logger.step(`Policy audit advanced search: ${JSON.stringify(criteria)}`);
  const drawer = await audit.openAdvancedSearch();
  if (criteria.actionType !== undefined) await drawer.choose(AUDIT_FILTER_FIELD.actionType, criteria.actionType);
  if (criteria.performedBy !== undefined) {
    await drawer.clearText(AUDIT_FILTER_FIELD.actor);
    if (criteria.performedBy !== '') await drawer.typeText(AUDIT_FILTER_FIELD.actor, criteria.performedBy);
  }
  if (criteria.from !== undefined) await pickDateRange(page, page.locator(`#${auditField(AUDIT_FILTER_FIELD.dateRange)}`), criteria.from, criteria.to ?? criteria.from);
  return {
    labels: await drawer.getFieldLabels(),
    actionType: await drawer.getValue(AUDIT_FILTER_FIELD.actionType).catch(() => ''),
    performedBy: await drawer.getValue(AUDIT_FILTER_FIELD.actor).catch(() => ''),
    dateRange: await drawer.getValue(AUDIT_FILTER_FIELD.dateRange).catch(() => ''),
  };
}

/**
 * Clicks Search in the open audit advanced search: whether the drawer closed
 * (applied), whether the trail was requested again, what was said, and the
 * entries shown afterwards (every page).
 */
export async function submitAuditSearch(page: Page, audit: PolicyAuditTab): Promise<{ applied: boolean; requested: boolean; messages: string[]; entries: AuditEntry[] }> {
  const title = page.locator(`#${POLICY_AUDIT.advancedSearch}-title`);
  const requested = page.waitForRequest((r) => /\/GetPolicyAuditTrail$/.test(new URL(r.url()).pathname), { timeout: Timeouts.short }).then(() => true).catch(() => false);
  const answered = page.waitForResponse((r) => /\/GetPolicyAuditTrail$/.test(new URL(r.url()).pathname), { timeout: Timeouts.short }).catch(() => null);
  await page.locator(buttonSelector(`${POLICY_AUDIT.advancedSearch}-search-button`)).first().click();
  const applied = await title.waitFor({ state: 'hidden', timeout: Timeouts.default }).then(() => true).catch(() => false);
  await answered;
  const sent = await requested;
  const inline = applied ? [] : (await page.locator(`#${POLICY_AUDIT.advancedSearch}-body [id$="-error"]`).allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter((t) => t !== '');
  if (!applied) await page.locator(buttonSelector(`${POLICY_AUDIT.advancedSearch}-cancel-button`)).first().click().catch(() => undefined);
  const entries = applied ? await audit.readAllEntries().catch(() => [] as AuditEntry[]) : [];
  return { applied, requested: sent, messages: [...inline, ...(await visibleMessages(page))], entries };
}

/** Closes the open audit advanced search with Cancel. */
export async function cancelAuditSearch(page: Page): Promise<void> {
  await page.locator(buttonSelector(`${POLICY_AUDIT.advancedSearch}-cancel-button`)).first().click();
  await page.locator(`#${POLICY_AUDIT.advancedSearch}-title`).waitFor({ state: 'hidden', timeout: Timeouts.default });
}

/** fillAuditCriteria + submitAuditSearch. */
export async function applyAuditCriteria(page: Page, audit: PolicyAuditTab, criteria: AuditCriteria): Promise<{ applied: boolean; messages: string[]; entries: AuditEntry[] }> {
  await fillAuditCriteria(page, audit, criteria);
  const { applied, messages, entries } = await submitAuditSearch(page, audit);
  return { applied, messages, entries };
}

/**
 * TYPES a start date later than the end date into the Date Range of the audit
 * advanced search (a calendar cannot be clicked backwards) and leaves the
 * drawer open: whether the field is marked invalid, and the drawer's messages.
 */
export async function typeReversedRange(page: Page, audit: PolicyAuditTab, fromText: string, toText: string): Promise<{ highlighted: boolean; messages: string[]; value: string }> {
  const drawer = await audit.openAdvancedSearch();
  await drawer.typeDate(AUDIT_FILTER_FIELD.dateRange, `${fromText} - ${toText}`);
  const input = page.locator(`#${auditField(AUDIT_FILTER_FIELD.dateRange)}`);
  const aria = await input.getAttribute('aria-invalid').catch(() => null);
  const cls = `${(await input.getAttribute('class').catch(() => '')) ?? ''} ${(await input.locator('xpath=..').getAttribute('class').catch(() => '')) ?? ''}`;
  const messages = await drawer.getMessages();
  return { highlighted: aria === 'true' || /ng-invalid|p-invalid/.test(cls) || messages.length > 0, messages, value: await input.inputValue().catch(() => '') };
}

/** The policy's records in the system-wide Audit Logs (GetAuditLogs by entity). */
export async function readSystemAuditLogs(page: Page, policyId: string): Promise<{ status: number; total: number; text: string }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogList, { entityType: POLICY_AUDIT_ENTITY, entityId: policyId, actionType: null, pageNumber: 1, rowsPerPage: 50 });
  let total = 0;
  try {
    const payload = (JSON.parse(res.text) as { payload?: { totalRows?: number; items?: unknown[] } }).payload;
    total = payload?.totalRows ?? payload?.items?.length ?? 0;
  } catch {
    total = 0;
  }
  return { status: res.status, total, text: res.text };
}

/** Opens System Settings > Audit Logs and returns its main text. */
export async function openSystemAuditLogs(page: Page): Promise<string> {
  await page.goto(new URL(AppRoutes.auditLogs, env.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return (await page.locator('main').first().innerText({ timeout: Timeouts.default }).catch(() => '')).replace(/\s+/g, ' ').trim(); // locator-exception: the Audit Logs screen has no page object; its single <main> is read whole.
}

// ---- clone ----------------------------------------------------------------------------------

/** The clone's period: effective in 2 days for 60 days (inside the suite plan), as the drawer takes it. */
export const clonePeriod = (): PolicyCoverage => ({
  effectiveDate: policyDateText(daysFromNow(2)),
  expiryDate: policyDateText(daysFromNow(60)),
});

/** Downloads an attachment by its URI as the session (bytes and status). */
export async function downloadAttachment(page: Page, uri: string): Promise<{ status: number; bytes: Buffer }> {
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const response = await page.request.fetch(uri, { method: 'GET', headers: { Authorization: `Bearer ${token ?? ''}` }, failOnStatusCode: false });
  return { status: response.status(), bytes: await response.body() };
}

/** What a direct request answered, for messages. */
export const said = (answer: { status: number; text: string }): string => `${answer.status} ${answer.text.slice(0, 240)}`;
