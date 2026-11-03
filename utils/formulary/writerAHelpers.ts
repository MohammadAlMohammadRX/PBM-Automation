import AdmZip from 'adm-zip';
import type { BrowserContext, Page } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { FormularyManagementPage } from '../../pages/formulary/FormularyManagementPage';
import { FormularyDetailPage } from '../../pages/formulary/FormularyDetailPage';
import { ApprovalManagementPage } from '../../pages/approval/ApprovalManagementPage';
import { LoginPage } from '../../pages/auth/LoginPage';
import { PayerScopeDialog } from '../../pages/components/PayerScopeDialog';
import { ConfirmDialog } from '../../pages/components/ConfirmDialog';
import { RoleAdministrationPage } from '../../pages/system/RoleAdministrationPage';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { GLOBAL } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { env } from '../../constants/EnvironmentConfig';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { BULK_FINAL_STATUS, BULK_OPERATION_ENDPOINT } from '../../constants/formulary/writerAIds';
import { PAYER_ADMIN_ROLE } from '../../data/accounts/payerAdminRole.data';
import { NON_ADMIN_PROFILE, nonAdminUnfit } from '../../data/accounts/nonAdminAccount.data';
import { ACCESS_TOKEN_KEY } from '../../data/payers/lifecycleGuardrails.data';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { ScreenshotUtils } from '../ScreenshotUtils';
import { readEffectivePermissions } from '../EffectivePermissions';
import { parseCsv, type ParsedCsv } from '../CsvUtils';
import { parseXlsx } from '../XlsxUtils';
import {
  FORMULARY_SUITE_PAYER,
  deleteFormulary,
  formularyStatusIds,
  submitFormulary,
  type FormularyAnswer,
  type FormularyListItem,
} from '../FormularyProvisioning';

/**
 * Writer A's helpers for the Formulary folders 01 (list search / sort /
 * export), 02 (create), 04 (dashboard counters), 08 (bulk import), 15 (clone),
 * 16 (delete) and 18 (formularies by payer), 2026-11-02.
 *
 * Three groups:
 *  - `test` - the shared fixtures plus `formularySession`, a Payer Admin
 *    session whose role is SHAPED with Formularies rights (the folder 22 way,
 *    see below). Specs that need it import `test` from here instead of
 *    `fixtures/index.ts`; every other fixture is the same.
 *  - the bulk-import plumbing (operation status, upload history, result file,
 *    multi-sheet workbooks) read off the bundle - NOT verified live yet.
 *  - small list / deletion helpers built on the shared provisioning calls.
 */

// ---- Formularies rights and the shaped session ---------------------------------------

/**
 * The Formularies-section rights, as the role catalogue is EXPECTED to label
 * them: the permission codes (`Formularies.<Action>`, read off the bundle
 * chunk-KRL4R7P3.js) without the module prefix - the way the Terminologies
 * section labels its rights (`GetTerminologies`, `CreateTerminology`).
 * VERIFIED against the Payer Admin catalogue on 2026-11-02: the Formularies
 * section lists these code names under the parent GetFormularies (GetTiers and
 * GetFormularyTrades are sub-parents of their exports), and its "Bulk import"
 * group carries the two plain-word import rights below. A label the catalogue
 * does not carry makes the shaping step throw with the labels it DOES carry,
 * and the case reports BLOCKED with that list.
 */
export const FORMULARY_PERMISSION = {
  list: 'GetFormularies',
  detail: 'GetFormulary',
  dashboard: 'GetFormulariesDashboard',
  versions: 'GetFormularyVersions',
  tiers: 'GetTiers',
  trades: 'GetFormularyTrades',
  priceHistory: 'GetPriceHistory',
  export: 'ExportFormularies',
  exportTiers: 'ExportFormularyTiers',
  exportTrades: 'ExportFormularyTrades',
  create: 'CreateFormulary',
  update: 'UpdateFormulary',
  delete: 'DeleteFormulary',
  submit: 'SubmitFormularyForApproval',
  setActive: 'SetFormularyActive',
  revert: 'RevertFormularyVersion',
  clone: 'CloneFormulary',
  createTier: 'CreateTier',
  updateTier: 'UpdateTier',
  deleteTier: 'DeleteTier',
  addTrade: 'AddFormularyTrade',
  updateTrade: 'UpdateFormularyTrade',
  setTradeStatus: 'SetFormularyTradeStatus',
  deleteTrade: 'DeleteFormularyTrade',
  addPricingPeriod: 'AddPricingPeriod',
  updatePricingPeriod: 'UpdatePricingPeriod',
  deletePricingPeriod: 'DeletePricingPeriod',
  upsertRebate: 'UpsertRebate',
  deleteRebate: 'DeleteRebate',
  bulkImport: 'Import formularies, tiers and trades',
  bulkHistory: 'View formulary upload history and results',
} as const;

export type FormularyPermissionKey = keyof typeof FORMULARY_PERMISSION;

/** The effective-permission prefix (GetCurrentUserRolesAndPermissions: `Formularies.CreateFormulary`). */
const FORMULARY_CODE_PREFIX = 'Formularies.';

/** What a "view only" formulary user holds: the list (the section's likely parent node) and every read. */
export const FORMULARY_READ_RIGHTS: readonly FormularyPermissionKey[] = ['list', 'detail', 'dashboard', 'versions', 'tiers', 'trades', 'priceHistory'];

/** Every right that changes formulary data (or exports / imports it). */
export const FORMULARY_WRITE_RIGHTS: readonly FormularyPermissionKey[] = (Object.keys(FORMULARY_PERMISSION) as FormularyPermissionKey[])
  .filter((key) => !FORMULARY_READ_RIGHTS.includes(key));

/** What a case needs the shaped role to hold and to lack. */
export interface FormularyShape {
  with?: readonly FormularyPermissionKey[];
  without?: readonly FormularyPermissionKey[];
}

/** The read rights plus `allow`; every other write right - and `alsoWithhold` - withheld. */
export const formularyShape = (
  allow: readonly FormularyPermissionKey[] = [],
  alsoWithhold: readonly FormularyPermissionKey[] = [],
): FormularyShape => ({
  with: [...FORMULARY_READ_RIGHTS, ...allow],
  without: [...FORMULARY_WRITE_RIGHTS.filter((key) => !allow.includes(key)), ...alsoWithhold],
});

/** No Formularies right at all. */
export const FORMULARY_NO_ACCESS: FormularyShape = { without: Object.keys(FORMULARY_PERMISSION) as FormularyPermissionKey[] };

/** The payer-scoped account the "by payer" cases use (the configured non-admin, "Payer Admin"). */
export const SCOPED_ACCOUNT = {
  role: NON_ADMIN_PROFILE.role,
  payers: [...NON_ADMIN_PROFILE.scopedPayers] as string[],
  /** The sheet's "Payer A". */
  payerA: NON_ADMIN_PROFILE.scopedPayers[0],
  /** The sheet's "Payer B" when the case wants a SECOND assigned payer. */
  payerB: NON_ADMIN_PROFILE.scopedPayers[1],
  /** The aggregate scope a multi-payer session may pick. */
  allMine: 'All My Payers',
  /** A payer outside the account's assignment (the suite payer). */
  outOfScope: FORMULARY_SUITE_PAYER,
} as const;

/** A signed-in Payer Admin whose role was shaped for this case, with the Formulary screens. */
export interface FormularySession {
  page: Page;
  formularies: FormularyManagementPage;
  detail: FormularyDetailPage;
  approvals: ApprovalManagementPage;
  /** Catalogue labels granted / withheld for this case, to quote in messages. */
  granted: string[];
  removed: string[];
  /** Withheld rights the account is STILL told it holds (the propagation defect), [] when the shaping took. */
  notPropagated: string[];
}

export interface WriterAFixtures {
  /**
   * Shapes the "Payer Admin" role with Formularies rights (grants first, then
   * withholds - a granted parent node ticks its children), signs the account
   * in from its own window and returns the session; the role is put back
   * exactly as found at teardown, newest change first. BLOCKED when the
   * account is not configured, a label is not in the catalogue or the sign-in
   * fails. Mirrors fixtures/shapedNonAdmin.fixture.ts, whose role data has no
   * Formularies keys yet.
   */
  formularySession: (shape: FormularyShape) => Promise<FormularySession>;
}

export const test = base.extend<WriterAFixtures>({
  formularySession: async ({ browser }, use, testInfo) => {
    const unfit = nonAdminUnfit();
    if (unfit !== null) blockedByPrecondition(testInfo, 'a non-administrator session', new Error(unfit));
    const adminContext = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
    const roles = new RoleAdministrationPage(await adminContext.newPage());
    const changed: Array<{ label: string; wanted: boolean }> = [];
    const opened: BrowserContext[] = [];

    const setPermissions = async (entries: ReadonlyArray<{ label: string; wanted: boolean }>): Promise<string[]> => {
      if (entries.length === 0) return [];
      const privileges = await roles.openPermissionCatalogue(PAYER_ADMIN_ROLE);
      const touched: string[] = [];
      for (const { label, wanted } of entries) {
        if ((await privileges.isPermissionChecked(label)) === wanted) continue;
        await privileges.togglePermission(label);
        touched.push(label);
      }
      if (touched.length === 0) {
        await roles.closeDrawer();
        return [];
      }
      await roles.saveRole();
      return touched;
    };

    await use(async (shape) => {
      const wanted = [
        ...(shape.with ?? []).map((key) => ({ label: FORMULARY_PERMISSION[key], wanted: true })),
        ...(shape.without ?? []).map((key) => ({ label: FORMULARY_PERMISSION[key], wanted: false })),
      ];
      testInfo.setTimeout(testInfo.timeout + 180_000);
      try {
        Logger.step(`[fixture] Shaping "${PAYER_ADMIN_ROLE}": ${wanted.map((w) => `${w.wanted ? '+' : '-'}${w.label}`).join(', ')}`);
        for (const label of await setPermissions(wanted)) {
          const entry = wanted.find((w) => w.label === label);
          if (entry) changed.push({ label, wanted: !entry.wanted });
        }
      } catch (error) {
        blockedByPrecondition(testInfo, `the "${PAYER_ADMIN_ROLE}" role shaped with Formularies rights`, error);
      }

      try {
        const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: DEFAULT_VIEWPORT });
        opened.push(context);
        const page = await context.newPage();
        const login = new LoginPage(page);
        await login.open();
        await login.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
        const scope = await new PayerScopeDialog(page).chooseIfAsked();
        if (scope !== null) Logger.step(`[fixture] Scoped session working on "${scope}"`);
        ScreenshotUtils.registerSession(testInfo, page);

        // Evidence, not a gate: a withheld right the account is still told it
        // holds is the role-propagation defect (utils/EffectivePermissions.ts).
        const effective = await readEffectivePermissions(page);
        const notPropagated = (shape.without ?? [])
          .map((key) => `${FORMULARY_CODE_PREFIX}${FORMULARY_PERMISSION[key]}`)
          .filter((code) => effective.includes(code));
        if (notPropagated.length > 0) {
          const note = `Withheld from "${PAYER_ADMIN_ROLE}" but still held by the signed-in account: ${notPropagated.join(', ')}`;
          Logger.warn(note);
          testInfo.annotations.push({ type: 'permission-not-propagated', description: note });
        }
        return {
          page,
          formularies: new FormularyManagementPage(page),
          detail: new FormularyDetailPage(page),
          approvals: new ApprovalManagementPage(page, 'formulary'),
          granted: (shape.with ?? []).map((key) => FORMULARY_PERMISSION[key]),
          removed: (shape.without ?? []).map((key) => FORMULARY_PERMISSION[key]),
          notPropagated,
        };
      } catch (error) {
        return blockedByPrecondition(testInfo, 'a signed-in non-administrator session', error);
      }
    });

    for (const context of opened) await context.close();
    if (changed.length > 0) {
      Logger.step(`[fixture] Restoring "${PAYER_ADMIN_ROLE}": ${changed.map((c) => c.label).join(', ')}`);
      await setPermissions([...changed].reverse());
    }
    await adminContext.close();
  },
});

export { expect } from '../../fixtures';

/** Opens the formulary list in a scoped session, answering the payer gate when it is asked. */
export async function openScopedList(session: FormularySession, scope?: string): Promise<void> {
  await session.formularies.openExpectingDenial();
  await new PayerScopeDialog(session.page).chooseIfShowingNow(scope).catch(() => null);
  if (scope !== undefined) await session.formularies.scopeTo(scope);
  await session.formularies.waitForRowsRendered();
}

// ---- list requests ------------------------------------------------------------------------

/** GetFormularies as the session behind `page` answers it, with any body - the request a tampered filter sends. */
export async function sendFormularyListRequest(page: Page, body: Record<string, unknown>): Promise<{ status: number; items: FormularyListItem[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyList, { pageNumber: 1, rowsPerPage: 200, sortBy: 'CreatedOn desc', ...body });
  try {
    const list = (JSON.parse(res.text) as { payload?: { formularies?: { items?: FormularyListItem[]; totalRows?: number } } }).payload?.formularies;
    return { status: res.status, items: res.status < 300 ? (list?.items ?? []) : [], totalRows: list?.totalRows ?? 0 };
  } catch {
    return { status: res.status, items: [], totalRows: 0 };
  }
}

/** GetFormulariesDashboard as the session behind `page` answers it (status and raw text). */
export async function requestDashboard(page: Page): Promise<{ status: number; text: string }> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.formularyDashboard, {});
}

/** Status id -> lookup code (`pending`, `active`, `inactive`, `expired`). */
export async function statusCodesById(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries(Object.entries(await formularyStatusIds(page)).map(([code, id]) => [id, code]));
}

/** The status code a list item EFFECTIVELY has ('' for a never-approved one). */
export const effectiveCodeOf = (item: FormularyListItem, codes: Record<string, string>): string =>
  codes[item.effectiveStatusId] ?? codes[item.statusId] ?? '';

/** An Expired formulary of the register (read-only use), or null - Expired cannot be produced on demand. */
export async function findExpiredFormulary(page: Page): Promise<FormularyListItem | null> {
  // On the app first: about:blank has no token to read (18648, 2026-11-02; utils/PayerFinder.ts).
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const ids = await formularyStatusIds(page);
  const res = await sendFormularyListRequest(page, { statusId: ids.expired, rowsPerPage: 50 });
  const codes = await statusCodesById(page);
  return res.items.find((item) => effectiveCodeOf(item, codes) === 'expired') ?? null;
}

// ---- deletion ----------------------------------------------------------------------------

/**
 * Stages a published formulary's deletion and sends it for approval - the
 * app's two-step "submit for deletion" (Delete saves the deletion as a draft;
 * Send for Approval queues it). Throws with the server's answer when refused.
 */
export async function submitDeletion(page: Page, formularyId: string): Promise<void> {
  const staged = await deleteFormulary(page, formularyId);
  if (staged.status >= 300) throw new Error(`DeleteFormulary answered ${staged.status} ${staged.text.slice(0, 300)}`);
  const submitted = await submitFormulary(page, formularyId);
  if (submitted.status >= 300) throw new Error(`SubmitFormularyForApproval answered ${submitted.status} ${submitted.text.slice(0, 300)}`);
}

/** Assigns (or, with null, removes) a plan's formulary through the Plans module's own call - the answer as is. */
export async function assignPlanFormulary(page: Page, planId: string, formularyId: string | null): Promise<FormularyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.planAssignFormulary, { planId, formularyId });
}

// ---- bulk import -------------------------------------------------------------------------

/** One bulk operation as the tracker normalises it (chunk-DKMKJIP5 `q()`). */
export interface BulkOperation {
  operationId: string;
  status: string;
  fileName: string;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  createdRows: number;
  updatedRows: number;
  unchangedRows: number;
  errorMessage: string | null;
  hasResultFile: boolean;
}

const pick = (record: Record<string, unknown>, key: string): unknown =>
  record[key] ?? record[key.charAt(0).toUpperCase() + key.slice(1)];

/** Normalises an operation record (camel or Pascal case keys). */
export function toOperation(record: Record<string, unknown>): BulkOperation {
  const num = (key: string): number => Number(pick(record, key) ?? 0) || 0;
  const str = (key: string): string => String(pick(record, key) ?? '');
  const message = pick(record, 'errorMessage');
  return {
    operationId: str('operationId') || str('id'),
    status: str('status'),
    fileName: str('fileName'),
    totalRows: num('totalRows'),
    processedRows: num('processedRows'),
    succeededRows: num('succeededRows'),
    failedRows: num('failedRows'),
    createdRows: num('createdRows'),
    updatedRows: num('updatedRows'),
    unchangedRows: num('unchangedRows'),
    errorMessage: typeof message === 'string' ? message : null,
    hasResultFile: pick(record, 'hasResultFile') === true,
  };
}

/** The operation id an Import* answer carries ('' when none could be read). */
export function operationIdOf(answerText: string): string {
  const named = answerText.match(/"(?:operationId|OperationId)"\s*:\s*"([^"]+)"/);
  if (named) return named[1];
  try {
    const payload = (JSON.parse(answerText) as { payload?: unknown }).payload;
    if (typeof payload === 'string') return payload;
    if (payload && typeof payload === 'object') return toOperation(payload as Record<string, unknown>).operationId;
  } catch {
    // not JSON - no id
  }
  return '';
}

const recordsIn = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[];
  if (value && typeof value === 'object') {
    const inner = value as Record<string, unknown>;
    for (const key of ['payload', 'items', 'operations']) if (key in inner) return recordsIn(inner[key]);
    return [inner];
  }
  return [];
};

/** The operation's state now (GetBulkOperationsStatus), null when unreadable. */
export async function readOperation(page: Page, operationId: string): Promise<BulkOperation | null> {
  const res = await NetworkUtils.postAsSession(page, BULK_OPERATION_ENDPOINT.status, { ids: [operationId] });
  if (res.status >= 300) return null;
  try {
    const found = recordsIn(JSON.parse(res.text)).map(toOperation).find((op) => op.operationId === operationId);
    return found ?? null;
  } catch {
    return null;
  }
}

export const isFinalStatus = (status: string): boolean => (BULK_FINAL_STATUS as readonly string[]).includes(status);

/**
 * Polls the operation until it reaches a final status (Completed /
 * CompletedWithErrors / Failed) and returns it with every status seen on the
 * way, in order. Throws when it does not finish within `timeoutMs`.
 */
export async function waitForOperation(page: Page, operationId: string, timeoutMs = 180_000): Promise<{ operation: BulkOperation; seen: string[] }> {
  const deadline = Date.now() + timeoutMs;
  const seen: string[] = [];
  let last: BulkOperation | null = null;
  while (Date.now() < deadline) {
    last = await readOperation(page, operationId);
    if (last && seen[seen.length - 1] !== last.status) seen.push(last.status);
    if (last && isFinalStatus(last.status)) return { operation: last, seen };
    await page.waitForTimeout(1_500);
  }
  throw new Error(`import ${operationId} did not finish within ${Math.round(timeoutMs / 1000)} s (last status "${last?.status ?? 'unreadable'}")`);
}

/** The import history (GetFormularyImportHistory) for an entity, newest first. */
export async function readImportHistory(page: Page, entity: 'Formulary' | 'FormularyTier' | 'FormularyTrade', formularyId?: string): Promise<BulkOperation[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.formularyImportHistory, {
    entity,
    pageNumber: 1,
    rowsPerPage: 20,
    ...(formularyId ? { formularyId } : {}),
  });
  if (res.status >= 300) throw new Error(`GetFormularyImportHistory answered ${res.status} ${res.text.slice(0, 200)}`);
  return recordsIn(JSON.parse(res.text)).map(toOperation);
}

/** Downloads an operation's result file as CSV (DownloadFormularyImportResult `{ operationId, format }`) and parses it. */
export async function downloadImportResult(page: Page, operationId: string): Promise<{ status: number; parsed: ParsedCsv; text: string }> {
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const fetchAs = (format: 'Csv' | 'Excel') => page.request.fetch(`${env.baseUrl}${ApiEndpoints.formularyImportResult}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
    data: { operationId, format },
    failOnStatusCode: false,
  });
  // A trades import has several pages: its result comes only as Excel ("only an Excel (.xlsx) file can be used"), as the screen offers.
  let response = await fetchAs('Csv');
  if (response.status() === 400 && /several pages|only an Excel/i.test(await response.text())) response = await fetchAs('Excel');
  const bytes = await response.body();
  const isZip = bytes.subarray(0, 2).toString('latin1') === 'PK';
  const sheets = isZip ? readWorkbook(bytes) : [];
  // Every page's rows together (each row keeps its own page's columns).
  const parsed = !isZip ? parseCsv(bytes.toString('utf8'))
    : sheets.length > 1 ? { headers: [...new Set(sheets.flatMap((s) => s.headers))], rows: sheets.flatMap((s) => s.rows) }
      : parseXlsx(bytes);
  return { status: response.status(), parsed, text: isZip ? '' : bytes.toString('utf8') };
}

/** The column of a result file that tells a row's outcome, or of its error text. */
export const resultColumn = (headers: string[], pattern: RegExp): string => headers.find((h) => pattern.test(h)) ?? '';

// ---- import files ------------------------------------------------------------------------

/** One worksheet: its name, header row and data rows (values by header). */
export interface Sheet {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Every worksheet of an .xlsx, in workbook order. parseXlsx reads the FIRST
 * sheet only; the Trades template "has several pages", so each sheet is read
 * by handing parseXlsx a one-sheet copy of the workbook.
 */
export function readWorkbook(bytes: Buffer): Sheet[] {
  const zip = new AdmZip(bytes);
  const text = (name: string): string => zip.getEntry(name)?.getData().toString('utf8') ?? '';
  const unprefixed = (xml: string): string => xml.replace(/<(\/?)[A-Za-z][\w.-]*:/g, '<$1');
  const workbook = unprefixed(text('xl/workbook.xml'));
  const rels = unprefixed(text('xl/_rels/workbook.xml.rels'));
  // Attributes are read one by one: the OpenXML SDK writes them in its own order (Type, Target, Id).
  const attr = (element: string, name: string): string => (element.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`)) ?? ['', ''])[1];
  const targets = Object.fromEntries([...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [attr(m[1], 'Id'), attr(m[1], 'Target')]));
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({ name: xmlDecode(attr(m[1], 'name')), target: targets[attr(m[1], 'r:id')] ?? '' }));
  return sheets.map(({ name, target }) => {
    const path = `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}`;
    const single = new AdmZip();
    const shared = zip.getEntry('xl/sharedStrings.xml');
    if (shared) single.addFile('xl/sharedStrings.xml', shared.getData());
    single.addFile('xl/worksheets/sheet1.xml', zip.getEntry(path)?.getData() ?? Buffer.from(''));
    const parsed = parseXlsx(single.toBuffer());
    return { name, headers: parsed.headers, rows: parsed.rows };
  });
}

/** An attribute as written in the workbook XML ("Trades &amp; Pricing") back to its text; buildWorkbook encodes it again. */
const xmlDecode = (value: string): string => value
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const xmlEncode = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnRef = (index: number): string => {
  let n = index + 1;
  let ref = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    ref = String.fromCharCode(65 + rem) + ref;
    n = Math.floor((n - 1) / 26);
  }
  return ref;
};

/** Writes a workbook of several sheets (inline strings) - buildXlsx for the multi-page Trades file. */
export function buildWorkbook(sheets: readonly Sheet[]): Buffer {
  const zip = new AdmZip();
  const sheetXml = (sheet: Sheet): string => {
    const grid = [sheet.headers, ...sheet.rows.map((row) => sheet.headers.map((h) => row[h] ?? ''))];
    const rows = grid.map((values, r) => `<row r="${r + 1}">${values.map((v, c) =>
      `<c r="${columnRef(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEncode(v)}</t></is></c>`).join('')}</row>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  };
  zip.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '</Types>'));
  zip.addFile('_rels/.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>'));
  zip.addFile('xl/workbook.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    + sheets.map((s, i) => `<sheet name="${xmlEncode(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
    + '</sheets></workbook>'));
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + '</Relationships>'));
  sheets.forEach((sheet, i) => zip.addFile(`xl/worksheets/sheet${i + 1}.xml`, Buffer.from(sheetXml(sheet))));
  return zip.toBuffer();
}

const csvField = (value: string): string => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** A CSV file from a header row and rows keyed by header. */
export function buildCsv(headers: readonly string[], rows: ReadonlyArray<Record<string, string>>): Buffer {
  const lines = [headers.map(csvField).join(','), ...rows.map((row) => headers.map((h) => csvField(row[h] ?? '')).join(','))];
  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8');
}

/** The header of `headers` matching `pattern` ('' when none). */
export const headerLike = (headers: readonly string[], pattern: RegExp): string => headers.find((h) => pattern.test(h)) ?? '';

/**
 * A row for a template, by meaning: `values` maps a header PATTERN to the
 * value, and every header is matched to the first pattern it fits - so a row
 * is written without knowing the template's exact header text.
 */
export function rowByMeaning(headers: readonly string[], values: ReadonlyArray<[RegExp, string]>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const header of headers) {
    const match = values.find(([pattern]) => pattern.test(header));
    row[header] = match ? match[1] : '';
  }
  return row;
}

/**
 * A date the way an existing file writes it: ISO (`2026-11-04` / with time)
 * when `sample` is ISO-like, else `DD/MM/YYYY HH:mm` as the screens show it.
 */
export function dateLike(sample: string, date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  if (/^\d{4}-\d{2}-\d{2}T/.test(sample)) return date.toISOString().slice(0, 19);
  if (/^\d{4}-\d{2}-\d{2}$/.test(sample)) return date.toISOString().slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(sample)) return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()}`;
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** A date `days` from now (local time, minutes zeroed). */
export const daysFromNow = (days: number): Date => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setSeconds(0, 0);
  return d;
};

// ---- formulary import files (folders 04 / 08) -------------------------------------------

/** A payer's code by its exact English name (GetPayers search), '' when not found. */
export async function payerCodeByName(page: Page, name: string): Promise<string> {
  const res = await NetworkUtils.postAsSession(page, '/api/Payers/GetPayers', { pageNumber: 1, rowsPerPage: 50, searchText: name });
  if (res.status >= 300) return '';
  const items = (JSON.parse(res.text) as { payload?: { payers?: { items?: { payerNameEn: string; payerCode?: string | null }[] } } }).payload?.payers?.items ?? [];
  return items.find((p) => p.payerNameEn === name)?.payerCode ?? '';
}

/** What a formulary import file is built from: the template's headers, how dates are written, the suite payer's code. */
export interface FormularyImportKit {
  headers: string[];
  dateSample: string;
  payerCode: string;
}

/** One formulary row of an import file, by meaning. */
export interface FormularyImportRow {
  nameEn: string;
  nameAr?: string;
  payerCode?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  effective?: Date;
  expiry?: Date;
  /** Formulary Code - set only to address an EXISTING formulary (an update attempt). */
  code?: string;
}

/**
 * Builds the kit from the screen's own files: the headers of Export > Export
 * Template, the date format of the list's own CSV export, and the suite
 * payer's code (GetPayers).
 */
export async function formularyImportKit(page: Page, list: FormularyManagementPage): Promise<FormularyImportKit> {
  const template = await list.exportTemplate();
  const exported = await list.exportAndParse('all', 'csv');
  const effective = headerLike(exported.parsed.headers, /effective/i);
  return {
    headers: template.parsed.headers,
    dateSample: exported.parsed.rows.find((r) => (r[effective] ?? '') !== '')?.[effective] ?? '',
    payerCode: await payerCodeByName(page, FORMULARY_SUITE_PAYER),
  };
}

/** A formulary row in the template's columns. Defaults: the suite payer, effective in 2 days, a year long. */
export function formularyImportRow(kit: FormularyImportKit, row: FormularyImportRow): Record<string, string> {
  return rowByMeaning(kit.headers, [
    [/payer/i, row.payerCode ?? kit.payerCode],
    [/name.*(english|\(en)|english.*name/i, row.nameEn],
    [/name.*(arabic|\(ar)|arabic.*name/i, row.nameAr ?? 'قائمة الأتمتة'],
    [/description.*(english|\(en)/i, row.descriptionEn ?? ''],
    [/description.*(arabic|\(ar)/i, row.descriptionAr ?? ''],
    [/effective/i, dateLike(kit.dateSample, row.effective ?? daysFromNow(2))],
    [/expiry/i, dateLike(kit.dateSample, row.expiry ?? daysFromNow(400))],
    [/code/i, row.code ?? ''],
  ]);
}

/** A file for the drop zone. */
export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A formulary import file (CSV) of `rows` in the template's columns. */
export function formularyImportFile(kit: FormularyImportKit, rows: ReadonlyArray<Record<string, string>>, name = 'formularies.csv'): UploadFile {
  return { name, mimeType: 'text/csv', buffer: buildCsv(kit.headers, rows) };
}

/** One tier row of a Tiers import file, by meaning. */
export interface TierImportRow {
  nameEn: string;
  nameAr?: string;
  coverage?: number;
  order: number;
  descriptionEn?: string;
}

/** A Tiers import file (CSV) in the Tiers template's columns. */
export function tierImportFile(headers: readonly string[], tiers: readonly TierImportRow[], name = 'tiers.csv'): UploadFile {
  const rows = tiers.map((tier) => rowByMeaning(headers, [
    [/name.*(english|\(en)|english.*name/i, tier.nameEn],
    [/name.*(arabic|\(ar)|arabic.*name/i, tier.nameAr ?? `مستوى ${tier.order}`],
    [/coverage/i, String(tier.coverage ?? 80)],
    [/order/i, String(tier.order)],
    [/description.*(english|\(en)/i, tier.descriptionEn ?? ''],
  ]));
  return { name, mimeType: 'text/csv', buffer: buildCsv(headers, rows) };
}

/** One trade row of a Trades & Pricing import file, by meaning ('' trade code = the "missing mandatory field" row). */
export interface TradeImportRow {
  tradeCode: string;
  tier: string;
  coverage?: number;
  baseCost?: number;
  publicPrice?: number;
  supplierPrice?: number;
  discount?: number;
  vat?: number;
  from?: Date;
  to?: Date;
}

/**
 * A Trades & Pricing import workbook built on the downloaded template: every
 * page of the template is kept (headers only), and the FIRST page - the trades -
 * gets `trades`, written by meaning. Dates follow any example the template's
 * first page carries, else `DD/MM/YYYY HH:mm`.
 */
export function tradeImportFile(templateBytes: Buffer, trades: readonly TradeImportRow[], name = 'trades.xlsx'): UploadFile {
  const sheets = readWorkbook(templateBytes);
  const pages = sheets.length > 0 ? sheets : [{ name: 'Trades', headers: [], rows: [] }];
  // Each page takes the columns it has: "Trades & Pricing" the trade, tier order and
  // coverage, "Price History" the prices and their period (a new trade is refused
  // without one, 2026-11-03); "Benefit Configurations" stays empty.
  const rowsOf = (sheet: Sheet): Record<string, string>[] => {
    if (/benefit/i.test(sheet.name)) return [];
    const fromHeader = headerLike(sheet.headers, /from|effective|start/i);
    const sample = sheet.rows.find((r) => (r[fromHeader] ?? '') !== '')?.[fromHeader] ?? '';
    // A row without a trade code (a case's invalid row) is one row: on the trades page only.
    const own = sheet === pages[0] ? trades : trades.filter((trade) => trade.tradeCode !== '');
    return own.map((trade) => rowByMeaning(sheet.headers, [
      [/tier/i, trade.tier],
      [/trade.*code|code/i, trade.tradeCode],
      [/coverage/i, String(trade.coverage ?? 80)],
      [/base/i, String(trade.baseCost ?? 10)],
      [/public/i, String(trade.publicPrice ?? 12)],
      [/supplier/i, String(trade.supplierPrice ?? 9)],
      [/discount/i, String(trade.discount ?? 0)],
      [/vat/i, String(trade.vat ?? 0)],
      // "Effective To" before "Effective From": the first pattern a header fits wins.
      [/\bto\b|until|end|expiry/i, dateLike(sample, trade.to ?? daysFromNow(300))],
      [/from|effective|start/i, dateLike(sample, trade.from ?? daysFromNow(2))],
    ]));
  };
  return {
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: buildWorkbook(pages.map((sheet) => ({ ...sheet, rows: rowsOf(sheet) }))),
  };
}

/** Adds a file in the drawer and returns the answer with the operation it started ('' when none). */
export async function startImport(
  dialog: { addFile: (file: UploadFile) => Promise<{ status: number; text: string; endpoint: string; messages: string[] }> },
  file: UploadFile,
): Promise<{ status: number; text: string; endpoint: string; messages: string[]; operationId: string }> {
  const answer = await dialog.addFile(file);
  return { ...answer, operationId: answer.status < 300 ? operationIdOf(answer.text) : '' };
}

/** The rows of a result file whose outcome column reads as failed. */
export function failedResultRows(parsed: ParsedCsv): Record<string, string>[] {
  const status = resultColumn(parsed.headers, /status|result|outcome/i);
  const error = resultColumn(parsed.headers, /error|reason|message/i);
  return parsed.rows.filter((r) => /fail|error|invalid|reject/i.test(r[status] ?? '') || (!status && (r[error] ?? '') !== ''));
}

/** The error text of a result row (its error / reason / message column). */
export function resultError(parsed: ParsedCsv, row: Record<string, string>): string {
  return row[resultColumn(parsed.headers, /error|reason|message/i)] ?? '';
}

// ---- detail-screen deletion (folder 16) ----------------------------------------------------

/** What a Delete attempt on the detail screen produced. */
export interface DeleteAttempt {
  /** How the header offered Delete. */
  availability: 'absent' | 'disabled' | 'available';
  /** DeleteFormulary's HTTP status, -1 when nothing was sent. */
  status: number;
  /** Everything the screen and server said (tooltip, answer, toasts, prompt). */
  said: string;
}

/**
 * Tries the header's Delete and reports the outcome rather than insisting it
 * works: a disabled control answers with its tooltip; an offered one is
 * clicked and its prompt(s) confirmed, and DeleteFormulary's answer and the
 * messages shown are returned.
 */
export async function attemptDetailDelete(detail: FormularyDetailPage): Promise<DeleteAttempt> {
  // Delete stays disabled until the page has loaded the plan assignments: read
  // at once it was "disabled" on a formulary whose Delete was usable a moment
  // later (18809, 2026-11-02). A blocked one costs this wait, nothing more.
  await expect.poll(async () => (await detail.getActionState('delete')).availability, { timeout: Timeouts.short })
    .toBe('available')
    .catch(() => undefined);
  const state = await detail.getActionState('delete');
  if (state.availability !== 'available') return { availability: state.availability, status: -1, said: state.title };
  try {
    const outcome = await detail.deleteAndCapture();
    return { availability: state.availability, status: outcome.status || -1, said: [outcome.text, ...outcome.messages].join(' | ') };
  } catch (error) {
    const messages = await detail.waitForMessages().catch(() => [] as string[]);
    return { availability: state.availability, status: -1, said: [String(error instanceof Error ? error.message : error).slice(0, 200), ...messages].join(' | ') };
  }
}

/** The labels of the detail header's action buttons (projected into the top bar). */
export async function headerActionLabels(page: Page): Promise<string[]> {
  const labels = await page.locator(`#${GLOBAL.breadcrumbActions} button`).allInnerTexts().catch(() => [] as string[]);
  return labels.map((l) => l.trim()).filter((l) => l !== '');
}

/** Clicks the header action whose label matches `label` (the sheet's "Withdraw" has no known id) and confirms its prompt. */
export async function clickHeaderActionLabelled(page: Page, label: RegExp): Promise<void> {
  // locator-exception: the action is asked for by its label because no id for it is known; scoped to the id'd header container.
  await page.locator(`#${GLOBAL.breadcrumbActions} button`).filter({ hasText: label }).first().click();
  const dialog = new ConfirmDialog(page);
  if (await dialog.isVisible()) await dialog.confirmWithFollowUps();
}
