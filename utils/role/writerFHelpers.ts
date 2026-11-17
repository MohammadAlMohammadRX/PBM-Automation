import type { Locator, Page, Response, TestInfo } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import type { RoleHolder, SuiteApprovals, SuitePayer, SuiteRole, SuiteRoles } from '../../fixtures/roleModule.fixture';
import { BasePage } from '../../pages/BasePage';
import { ApprovalManagementPage, type ApprovalScope } from '../../pages/approval/ApprovalManagementPage';
import { ConfirmDialog } from '../../pages/components/ConfirmDialog';
import { PayerManagementPage } from '../../pages/payer/PayerManagementPage';
import type { RoleAdministrationPage } from '../../pages/role/RoleAdministrationPage';
import type { TreeRow } from '../../pages/role/PermissionTree';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { env } from '../../constants/EnvironmentConfig';
import { Timeouts } from '../../constants/Timeouts';
import { buttonSelector } from '../../constants/ElementIds';
import { APPROVAL_TAB_KEYS, PAYER_SCREENS, WRITER_F_IDS, type ApprovalTabKey, type PayerScreenKey } from '../../constants/role/writerFIds';
import { ACCESS_TOKEN_KEY } from '../../data/payers/lifecycleGuardrails.data';
import { Logger } from '../Logger';
import { NetworkUtils } from '../NetworkUtils';
import { moduleKeys, rolePermissionKeys, type PermissionCatalogue } from './roleApi';
import type { PredefinedRoleName } from '../../data/role/common.data';
import { provisionNetwork, pendingRequestId } from '../NetworkProvisioning';
import { provisionPlan } from '../PlanProvisioning';
import { provisionSuitePolicy, suitePolicyPlan } from '../PolicyProvisioning';
import { provisionSuiteFormulary } from '../FormularyProvisioning';
import { createSuiteInvitation, discardSuiteInvitation, type ProvisionedInvitation } from '../UserProvisioning';

/**
 * Role Management - Writer F helpers (folder 15 "Enforce Payer-Scoped Role Access", US 21299, and folder 16
 * "Configure Approval Management Permissions", US 21301).
 *
 * What lives here: reading a payer-related screen's OWN list answer as it loads (and the top-bar payer
 * scope), lists read through a session with or without the `X-Selected-Payer-Id` header, the approval
 * queue (GetApprovals) per tab, pending requests made for a case (network / plan / policy / formulary /
 * payer change - always "Automation ..." / "QA Automation ..." names, tracked by `suiteApprovals`), an
 * Approval Management tab view (bulk buttons, Review drawer, pending-count menu), the bulk decision with
 * its SAFETY guard, and a role read back on the Role Administration screen (View Role).
 *
 * SAFETY (Role-Writers-Brief): Approve All / Reject All are pressed only through `bulkDecide`, after the
 * spec asserted (`requireSuiteOnly`) that every pending row of the tab in the reviewer's scope is a suite
 * request, and `bulkDecide` re-reads the confirm dialog's own list and CANCELS when any listed item is not
 * a suite request. A foreign row never gets a click: the step is BLOCKED (or FAILS when an earlier step
 * already failed - it still never clicks).
 */

// ---- fixture: suite invitations ----------------------------------------------------------------

export interface SuiteInvitations {
  /** A suite invitation (qa.automation.inv.*@example.com) for `roleId` under `payerId`; deleted at teardown. BLOCKS when refused. */
  create(roleId: string, payerId: string | null): Promise<ProvisionedInvitation>;
}

export const test = base.extend<{ suiteInvitations: SuiteInvitations }>({
  suiteInvitations: async ({ page }, use, testInfo) => {
    const made: ProvisionedInvitation[] = [];
    await use({
      create: async (roleId, payerId) => {
        try {
          await onApp(page);
          const inv = await createSuiteInvitation(page, roleId, payerId);
          made.push(inv);
          return inv;
        } catch (error) {
          return blockedByPrecondition(testInfo, 'a suite invitation', error);
        }
      },
    });
    for (const inv of made) {
      const outcome = await discardSuiteInvitation(page, inv.id, inv.email).catch(() => 'left' as const);
      if (outcome !== 'gone') testInfo.annotations.push({ type: 'leftover', description: `suite invitation ${inv.email} could not be deleted` });
    }
  },
});
export { expect };

// ---- small things ------------------------------------------------------------------------------

export type Item = Record<string, unknown>;

/** Suite entity names ("Automation ..." / "QA Automation ..."), as suiteApprovals recognises them. */
export const SUITE_ENTITY = /^(QA )?Automation /;

async function onApp(page: Page): Promise<void> {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim();

/** Typed into Rejection Details when the reason is "Other" (the dialog requires it since 2026-11). */
const REJECTION_DETAILS_FOR_OTHER = 'Rejected by the role automation suite.';

/**
 * BLOCKS with `reason` unless an earlier step already failed - then the finding stays a FAIL and the case
 * goes on (lead decision 8; the idea of utils/settings/writerBHelpers.blockUnlessAStepFailed).
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = base.info();
  if (info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `Not marked BLOCKED (an earlier step failed): ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/**
 * A data gate `{ allowed, reason }`: while closed the case is BLOCKED here. When an earlier step already failed
 * the case is not marked BLOCKED (the finding stays a FAIL) - this step then FAILS with the gate's reason, so the
 * steps behind the gate never act on data the gate keeps out (role triage 2026-11-15: 22177 went on to the
 * Registrations tab although its gate was closed).
 */
export function passGate(steps: TestSteps, gate: { allowed: boolean; reason: string }): void {
  if (gate.allowed) return;
  if (base.info().errors.length > 0) throw new Error(`Not run (gate closed): ${gate.reason}`);
  steps.blocked(gate.reason);
}

/**
 * The rows of two tree pictures (`{ key: "<label> [state]" }` or `{ key: state }`) that differ, as plain text
 * ("key: shown "...", expected "..."") - '' when they match. A bare toEqual on objects reaches the report as
 * "deep equality" with nothing the app showed (role triage 2026-11-15); this text is what the step reports.
 */
export function treeMismatch(seen: Record<string, string>, expected: Record<string, string>): string {
  return Object.keys({ ...expected, ...seen })
    .filter((k) => seen[k] !== expected[k])
    .map((k) => `${k}: shown "${seen[k] ?? '(not read)'}", expected "${expected[k] ?? '(not expected)'}"`)
    .join('; ');
}

/** BLOCKS (decided at run time) when `present` is false - "look first, block only when absent". */
export function requireData(steps: TestSteps, present: boolean, reason: string): void {
  if (!present) blockUnlessAStepFailed(steps, reason);
}

/**
 * SAFETY guard before Approve All / Reject All: every name must be a suite request. Otherwise the step is
 * BLOCKED; when an earlier step failed it THROWS instead (the step fails) - in no case does the caller go
 * on to click.
 */
export function requireSuiteOnly(steps: TestSteps, names: readonly string[], where: string): void {
  const foreign = names.filter((n) => !SUITE_ENTITY.test(n));
  if (foreign.length === 0) return;
  const reason = `SAFETY: ${where} lists ${foreign.length} request(s) that are not the suite's (${foreign.slice(0, 5).join(', ')}) - the bulk action is never pressed on other people's requests`;
  if (base.info().errors.length > 0) throw new Error(reason);
  steps.blocked(reason);
}

/** Permission keys of whole modules (module node + every node below) plus single keys. */
export function rightsOf(catalogue: PermissionCatalogue, modules: readonly string[], extra: readonly string[] = []): string[] {
  return [...new Set([...modules.flatMap((m) => moduleKeys(catalogue, m)), ...extra])];
}

/** Items + totalRows out of any list payload (`payload.<anything>.items`, or `payload.items`). */
export function itemsOf(body: unknown): { items: Item[]; totalRows: number } {
  const payload = (body as { payload?: unknown } | null)?.payload;
  if (Array.isArray(payload)) return { items: payload as Item[], totalRows: payload.length };
  if (!payload || typeof payload !== 'object') return { items: [], totalRows: 0 };
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.items)) return { items: p.items as Item[], totalRows: Number(p.totalRows ?? (p.items as unknown[]).length) };
  for (const v of Object.values(p)) {
    if (v && typeof v === 'object' && Array.isArray((v as Item).items)) {
      const list = v as { items: Item[]; totalRows?: number };
      return { items: list.items, totalRows: Number(list.totalRows ?? list.items.length) };
    }
  }
  return { items: [], totalRows: 0 };
}

export const payerIdOf = (item: Item): string | null => (typeof item.payerId === 'string' && item.payerId ? item.payerId : null);
export const idOf = (item: Item): string => String(item.id ?? '');

// ---- requests through a session (optional payer header) -----------------------------------------

export interface SessionAnswer {
  status: number;
  text: string;
  items: Item[];
  totalRows: number;
  /** The answer's human message (ErrorMessage / successMessage / validation reasons). */
  message: string;
}

function messageOf(text: string): string {
  try {
    const b = JSON.parse(text) as { ErrorMessage?: string; successMessage?: string; message?: string; Title?: string; title?: string; ValidationErrors?: { Reason?: string }[] };
    const reasons = (b.ValidationErrors ?? []).map((v) => v.Reason ?? '').filter(Boolean);
    return norm(reasons.join(' | ') || b.ErrorMessage || b.message || b.Title || b.title || b.successMessage || '');
  } catch {
    return norm(text.slice(0, 200));
  }
}

/**
 * A request with the page's own token and, when given, the top-bar payer choice as the screen sends it
 * (`X-Selected-Payer-Id`). Read-only callers only.
 */
export async function asSession(page: Page, method: 'GET' | 'POST', path: string, body?: unknown, selectedPayerId?: string): Promise<SessionAnswer> {
  await onApp(page);
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  expect(token, 'the session holds an access token').not.toBeNull();
  const res = await page.request.fetch(`${env.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(selectedPayerId ? { 'X-Selected-Payer-Id': selectedPayerId } : {}) },
    ...(body === undefined ? {} : { data: body as Record<string, unknown> }),
    failOnStatusCode: false,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const { items, totalRows } = itemsOf(parsed);
  return { status: res.status(), text, items, totalRows, message: messageOf(text) };
}

/** A list endpoint read whole (one page of `rows`) through a session. */
export async function listAll(page: Page, path: string, criteria: Item = {}, selectedPayerId?: string, rows = 500): Promise<SessionAnswer> {
  return asSession(page, 'POST', path, { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', ...criteria }, selectedPayerId);
}

/** The list endpoints of the payer-related modules (direct reads). */
export const LIST_API = {
  payers: ApiEndpoints.payerList,
  networks: ApiEndpoints.networkList,
  plans: ApiEndpoints.planList,
  policies: ApiEndpoints.policyList,
  formularies: ApiEndpoints.formularyList,
  members: ApiEndpoints.memberList,
  users: ApiEndpoints.userList,
  invitations: ApiEndpoints.invitationList,
} as const;
export type ListApiKey = keyof typeof LIST_API;

// ---- screens: open and read their own list answer ---------------------------------------------------

/** A concrete page object for the screens Writer F only navigates (BasePage answers the payer gate). */
export class WriterFScreen extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(route: string): Promise<void> {
    await this.goto(route);
  }

  /** The top-bar payer scope select. */
  scopeSelect(): Locator {
    return this.byId(WRITER_F_IDS.payerScopeSelect);
  }

  /** What the top-bar payer scope shows ('' when the select is not there). */
  async scopeLabel(): Promise<string> {
    if ((await this.scopeSelect().count()) === 0) return '';
    return norm(await this.scopeSelect().innerText().catch(() => ''));
  }

  /** Any element by id. */
  el(id: string): Locator {
    return this.byId(id);
  }

  /** The app's single main area (denied / not-found states carry no id). */
  mainArea(): Locator {
    return this.page.locator('main').first(); // locator-exception: the not-found / denied states carry no id; the app's single <main> is read whole
  }

  /** The text of the app's single main area (denied / not-found states carry no id). */
  async mainText(): Promise<string> {
    return norm(await this.page.locator('main').first().innerText().catch(() => '')); // locator-exception: the not-found / denied states carry no id; the app's single <main> is read whole
  }

  /**
   * Opens a route WITHOUT BasePage's signed-out recovery and payer gate - for the Integration Portal, which
   * since the 2026-11 build shows its OWN sign-in ("Sign in to the Integration Portal": Partner account / PBM
   * staff). BasePage.goto read that screen as "signed out" and tried to sign careconnect in on a form that is
   * not there (22166, role triage 2026-11-15). Returns the whole page text.
   */
  async visitRaw(route: string): Promise<string> {
    await this.page.goto(new URL(route, env.baseUrl).toString(), { timeout: Timeouts.navigation, waitUntil: 'domcontentloaded' });
    await this.waitForPageReady();
    await this.page.waitForLoadState('networkidle', { timeout: Timeouts.short }).catch(() => undefined);
    return norm(await this.page.locator('body').innerText().catch(() => '')); // locator-exception: the portal's own sign-in screen was never probed for ids; its text is read whole
  }
}

export interface ScreenAnswer {
  /** -1 = the screen sent no list call. */
  status: number;
  items: Item[];
  totalRows: number;
  /** The `X-Selected-Payer-Id` header the screen sent (null = none). */
  header: string | null;
  /** The top-bar scope label after loading. */
  scope: string;
  path: string;
}

async function readAnswer(res: Response | null): Promise<{ status: number; items: Item[]; totalRows: number; header: string | null }> {
  if (!res) return { status: -1, items: [], totalRows: 0, header: null };
  const body = await res.json().catch(() => null);
  const { items, totalRows } = itemsOf(body);
  const header = (await res.request().allHeaders().catch(() => ({} as Record<string, string>)))['x-selected-payer-id'] ?? null;
  return { status: res.status(), items, totalRows, header };
}

const waitList = (page: Page, key: PayerScreenKey): Promise<Response | null> =>
  page.waitForResponse((r) => PAYER_SCREENS[key].call.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: Timeouts.navigation }).catch(() => null);

/**
 * Opens a payer-related screen and returns the list answer IT asked for (and the header it sent). With
 * `scope`, the top-bar payer select is then set to that label (unless it already reads it) and the answer
 * to THAT switch is returned.
 */
export async function openScreen(page: Page, key: PayerScreenKey, scope?: string): Promise<ScreenAnswer> {
  const screen = new WriterFScreen(page);
  const waiting = waitList(page, key);
  await screen.open(PAYER_SCREENS[key].route);
  let answer = await readAnswer(await waiting);
  if (scope && (await screen.scopeLabel()) !== scope) {
    // (switchScope picks through pickScope - one retry when the re-rendering top bar loses the pick)
    const switched = await switchScope(page, key, scope);
    if (switched.status !== -1) answer = switched;
  }
  return { ...answer, scope: await screen.scopeLabel(), path: new URL(page.url()).pathname };
}

/** Sets the top-bar payer scope to `label` and returns the list answer the switch triggered (status -1 = not offered / nothing sent). */
export async function switchScope(page: Page, key: PayerScreenKey, label: string): Promise<{ status: number; items: Item[]; totalRows: number; header: string | null }> {
  const waiting = waitList(page, key);
  const offered = await pickScope(new WriterFScreen(page), label);
  if (!offered) return { status: -1, items: [], totalRows: 0, header: null };
  return readAnswer(await waiting);
}

/**
 * Picks a payer in the top-bar select, once more if the pick was lost: right after a pick the top bar
 * re-renders and the overlay of the NEXT pick can close under the click ("Al sharq" option found, then the
 * click timed out - 22167, triage 2026-11-15). Waits only for the select to READ the payer, not for any list,
 * so quick switching stays quick.
 */
async function pickScope(screen: WriterFScreen, label: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const offered = await screen.scopeTo(label).catch(() => null);
    if (offered === false) return false;
    if (offered) {
      const reads = await expect.poll(() => screen.scopeLabel(), { timeout: Timeouts.short }).toBe(label).then(() => true, () => false);
      if (reads) return true;
    }
  }
  return (await screen.scopeLabel()) === label;
}

/** Every response under `/api/<pattern>` the page receives while `action` runs (+ a settle window). */
export async function captureResponses(page: Page, pattern: RegExp, action: () => Promise<void>, settleMs = 4_000): Promise<{ url: string; method: string; body: unknown; status: number; payload: unknown }[]> {
  const seen: { url: string; method: string; body: unknown; status: number; payload: unknown }[] = [];
  const pending: Promise<void>[] = [];
  const onResponse = (r: Response): void => {
    if (!pattern.test(new URL(r.url()).pathname)) return;
    pending.push((async () => {
      const req = r.request();
      let reqBody: unknown = null;
      try {
        reqBody = req.postDataJSON();
      } catch {
        reqBody = null;
      }
      const json = (await r.json().catch(() => null)) as { payload?: unknown } | null;
      seen.push({ url: new URL(r.url()).pathname, method: req.method(), body: reqBody, status: r.status(), payload: json?.payload ?? null });
    })());
  };
  page.on('response', onResponse);
  try {
    await action();
    await page.waitForLoadState('networkidle', { timeout: settleMs * 4 }).catch(() => undefined);
    await page.waitForTimeout(settleMs);
    await Promise.all(pending);
  } finally {
    page.off('response', onResponse);
  }
  return seen;
}

// ---- approvals (GetApprovals) -------------------------------------------------------------------

export type ApprovalEntityType = 'Payer' | 'Network' | 'Plan' | 'Policy' | 'Formulary';

export interface ApprovalItem {
  id: string;
  entityType: string;
  entityId: string;
  entityNameEn: string;
  action: string;
  status: string;
  requestedBy: string;
  requestedByLabel: string;
  afterJson?: string | null;
  beforeJson?: string | null;
}

/** GetApprovals of one tab through a session (status `Pending` by default; null = any status), up to 5 x 200 rows. */
export async function listApprovals(page: Page, entityType: ApprovalEntityType, status: string | null = 'Pending'): Promise<{ status: number; items: ApprovalItem[]; message: string }> {
  const out: ApprovalItem[] = [];
  let last: SessionAnswer | null = null;
  for (let pageNumber = 1; pageNumber <= 5; pageNumber += 1) {
    last = await asSession(page, 'POST', ApiEndpoints.approvalList, { pageNumber, rowsPerPage: 200, entityType });
    if (last.status >= 300) break;
    out.push(...(last.items as unknown as ApprovalItem[]));
    if (last.items.length < 200) break;
  }
  const items = out.filter((i) => i.entityType === undefined || String(i.entityType).toLowerCase() === entityType.toLowerCase());
  return { status: last?.status ?? -1, items: status === null ? items : items.filter((i) => i.status === status), message: last?.message ?? '' };
}

/** The payer a request's change belongs to (after / before JSON `payerId`, or the payer itself on the Payer tab). */
export function approvalPayerId(item: ApprovalItem): string | null {
  if (String(item.entityType) === 'Payer') return item.entityId;
  for (const raw of [item.afterJson, item.beforeJson]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { payerId?: string | null };
      if (parsed.payerId) return parsed.payerId;
    } catch {
      /* not JSON */
    }
  }
  return null;
}

/** Statuses of every request (any status) of an entity name, as `session` may read them. */
export async function requestStatuses(page: Page, entityType: ApprovalEntityType, name: string): Promise<string[]> {
  return (await listApprovals(page, entityType, null)).items.filter((i) => i.entityNameEn === name).map((i) => i.status);
}

/** GetPendingApprovalCount `{}` (or one tab) through a session. */
export async function pendingCount(page: Page, entityType?: ApprovalEntityType): Promise<{ status: number; count: number | null }> {
  const res = await asSession(page, 'POST', '/api/Approvals/GetPendingApprovalCount', entityType ? { entityType } : {});
  let count: number | null = null;
  try {
    const p = (JSON.parse(res.text) as { payload?: unknown }).payload;
    count = typeof p === 'number' ? p : null;
  } catch {
    count = null;
  }
  return { status: res.status, count };
}

// ---- pending requests made for a case ---------------------------------------------------------------

export type RequestKind = 'network' | 'plan' | 'policy' | 'formulary' | 'payer';
export const ENTITY_OF: Record<RequestKind, ApprovalEntityType> = { network: 'Network', plan: 'Plan', policy: 'Policy', formulary: 'Formulary', payer: 'Payer' };

export interface MadeRequest {
  kind: RequestKind;
  entityType: ApprovalEntityType;
  /** The entity's English name = the queue row's name. */
  name: string;
  /** The approval request id (careconnect's read). */
  requestId: string;
}

export interface RequestOptions {
  /** Owning payer by id (network). */
  payerId?: string;
  /** Owning payer by name (plan / policy / formulary; payer = the OWNED published payer to change). */
  payerName?: string;
  /** Plan only: submit it without a formulary (approval would be refused - for requests that are never approved). */
  noFormulary?: boolean;
}

/**
 * Makes ONE pending request through `session` (careconnect's page, or the holder's page to make the holder
 * the submitter), tracks it with `suiteApprovals` (rejected at teardown) and reads its request id through
 * `adminPage`. BLOCKS when the environment refuses to build it.
 *
 *  - network: a new "Automation Network ..." (one facility) submitted - Create request;
 *  - plan: a new "Automation Plan ..." submitted (the suite formulary of its payer unless noFormulary);
 *  - policy: a new "QA Automation Policy ..." (group, one network) submitted;
 *  - formulary: a new "QA Automation Formulary ..." submitted;
 *  - payer: the OWNED published suite payer (`payerName`, from suitePayers.publish()) gets a new Licence
 *    Number and is sent for approval - Update request.
 */
export async function makeRequest(kind: RequestKind, session: Page, adminPage: Page, approvals: SuiteApprovals, opts: RequestOptions = {}): Promise<MadeRequest> {
  const info = base.info();
  try {
    await onApp(session);
    let name = '';
    if (kind === 'network') {
      name = (await provisionNetwork(session, { submitOnly: true, ...(opts.payerId ? { payerId: opts.payerId } : {}) })).name;
    } else if (kind === 'plan') {
      name = (await provisionPlan(session, { submitOnly: true, noFormulary: opts.noFormulary ?? false, ...(opts.payerName ? { payerName: opts.payerName } : {}) })).name;
    } else if (kind === 'policy') {
      name = (await provisionSuitePolicy(session, 'PendingApproval', opts.payerName ? { payerName: opts.payerName } : {})).nameEn;
    } else if (kind === 'formulary') {
      name = (await provisionSuiteFormulary(session, 'PendingApproval', opts.payerName ? { payerName: opts.payerName } : {})).nameEn;
    } else {
      if (!opts.payerName || !SUITE_ENTITY.test(opts.payerName)) throw new Error(`a payer change needs an owned suite payer, got "${opts.payerName ?? ''}"`);
      name = opts.payerName;
      const payers = new PayerManagementPage(session);
      await payers.open();
      await payers.editTextFieldAndSave(name, 'License Number', `LIC-RM-${Date.now()}`);
      await payers.open();
      await payers.sendForApproval(name);
    }
    approvals.track(name);
    const requestId = await pendingRequestId(adminPage, name);
    if (!requestId) throw new Error(`"${name}" was submitted but no Pending request of it is in the queue`);
    Logger.step(`[writerF] Pending ${kind} request "${name}" (${requestId})`);
    return { kind, entityType: ENTITY_OF[kind], name, requestId };
  } catch (error) {
    return blockedByPrecondition(info, `a pending ${kind} approval request`, error);
  }
}

/**
 * The suite policy plan of a payer (careconnect; made and approved when absent). A plan turns Active only
 * through the lifecycle job, so a new one cannot carry a policy the same day - the policy request then
 * BLOCKS in makeRequest with the server's reason.
 */
export async function ensurePolicyPlan(adminPage: Page, payerName: string): Promise<{ id: string; name: string }> {
  try {
    await onApp(adminPage);
    return await suitePolicyPlan(adminPage, payerName);
  } catch (error) {
    return blockedByPrecondition(base.info(), `the suite policy plan of "${payerName}"`, error);
  }
}

// ---- Approval Management tab view -------------------------------------------------------------------

export interface ReviewView {
  /** Footer buttons present in the drawer: approve / reject / close. */
  buttons: string[];
  /** Whole drawer text. */
  text: string;
}

/**
 * One tab of Approval Management on any session's page. Row reads / decisions reuse
 * ApprovalManagementPage (payer / network / plan / policy / formulary); the Registrations tab
 * (`invitation`) is driven here by the same id pattern (assumed - see writerFIds).
 */
export class ApprovalTabView extends BasePage {
  constructor(page: Page, readonly tab: ApprovalTabKey) {
    super(page);
  }

  /** The session page this view drives. */
  session(): Page {
    return this.page;
  }

  /** The shared page object for this tab (not for `invitation`). */
  hub(): ApprovalManagementPage {
    if (this.tab === 'invitation') throw new Error('ApprovalManagementPage has no Registrations scope - use the ApprovalTabView methods');
    return new ApprovalManagementPage(this.page, this.tab as ApprovalScope);
  }

  /** Every module section of the hub (`approvals-<tab>`), whichever is rendered. */
  private anySection(): Locator {
    return this.page.locator(APPROVAL_TAB_KEYS.map((k) => `#${WRITER_F_IDS.tabSection(k)}`).join(', '));
  }

  /**
   * Opens the hub (whatever tab it lands on) and returns the module tabs it offers, e.g. ['payer']. A session
   * offered ONE module's queue gets that queue alone WITHOUT a tab strip (role smoke 2026-11-14 / triage
   * 2026-11-15: every single-tab reviewer of folder 16 failed on "Hub <x> tab not on the screen") - so this
   * waits for the strip OR a module section.
   */
  async openHub(): Promise<string[]> {
    await this.goto('/approval-management');
    await this.byId(WRITER_F_IDS.hubTabs).or(this.anySection()).first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return this.offeredTabs();
  }

  /** Whether the hub shows its tab strip (absent when only one module is offered). */
  async hasTabStrip(): Promise<boolean> {
    return this.byId(WRITER_F_IDS.hubTabs).isVisible().catch(() => false);
  }

  /** The module tabs offered: the strip's tabs, or - without a strip - the one module section shown. */
  async offeredTabs(): Promise<string[]> {
    if (await this.hasTabStrip()) {
      const ids = await this.page.locator('[id^="approvals-hub-tab-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).id));
      return [...new Set(ids.map((id) => id.slice('approvals-hub-tab-'.length).split('-')[0]))];
    }
    const shown: string[] = [];
    for (const k of APPROVAL_TAB_KEYS) if (await this.byId(WRITER_F_IDS.tabSection(k)).isVisible().catch(() => false)) shown.push(k);
    return shown;
  }

  tabButton(): Locator {
    return this.page.locator(buttonSelector(WRITER_F_IDS.hubTab(this.tab))).first();
  }

  section(): Locator {
    return this.byId(WRITER_F_IDS.tabSection(this.tab));
  }

  /**
   * Opens the hub and this tab (clicked only when there is a tab strip), waits for the tab's own section and
   * for its list to be rendered in Table view - the bulk buttons and row actions render with the list, and a
   * read straight after the section appeared answered "absent" (22184, triage 2026-11-15).
   */
  async openTab(): Promise<void> {
    await this.openHub();
    if (await this.hasTabStrip()) await this.tabButton().click();
    await expect(this.section(), `the ${this.tab} approvals section (tabs offered: ${(await this.offeredTabs()).join(', ') || 'none'})`).toBeVisible({ timeout: Timeouts.default });
    await this.ensureTableView(WRITER_F_IDS.tabSection(this.tab));
    await this.waitForPageReady();
  }

  bulkButton(which: 'approve' | 'reject'): Locator {
    return this.page.locator(buttonSelector(which === 'approve' ? WRITER_F_IDS.approveAll(this.tab) : WRITER_F_IDS.rejectAll(this.tab))).first();
  }

  /** Approve All / Reject All: absent / disabled / available (waits a short while for it to render). */
  async bulkState(which: 'approve' | 'reject'): Promise<'absent' | 'disabled' | 'available'> {
    const b = this.bulkButton(which);
    const shown = await b.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
    if (!shown) return 'absent';
    return (await b.isEnabled()) ? 'available' : 'disabled';
  }

  rows(): Locator {
    return this.page.locator(`tr[id^="${WRITER_F_IDS.rowPrefix(this.tab)}"]`);
  }

  /** Searches the tab for a name (the hub's own debounced search) and returns the matching row ('' id when none). */
  async findRow(name: string): Promise<string> {
    const input = this.byId(`approvals-${this.tab}-search-input`);
    if ((await input.count()) === 0) await this.openTab();
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    await input.pressSequentially(name);
    await this.waitForPageReady();
    const row = this.rows().filter({ hasText: name }).first();
    const shown = await row.waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true, () => false);
    return shown ? ((await row.getAttribute('id')) ?? '') : '';
  }

  /** The id of the first row on screen ('' when the tab lists nothing). */
  async firstRowId(): Promise<string> {
    const row = this.rows().first();
    const shown = await row.waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true, () => false);
    return shown ? ((await row.getAttribute('id')) ?? '') : '';
  }

  /** The action keys a row offers (review / reject / approve), sorted. */
  async rowActions(rowId: string): Promise<string[]> {
    const keys = await this.page.locator(`[id^="${rowId}-"]`).evaluateAll((els, id) =>
      els.filter((e) => ['button', 'p-button'].includes(e.tagName.toLowerCase())).map((e) => (e as HTMLElement).id.replace(`${id}-`, '').replace(/-button$/, '')), rowId);
    return [...new Set(keys)].filter((k) => ['review', 'reject', 'approve'].includes(k)).sort();
  }

  rowAction(rowId: string, action: 'review' | 'reject' | 'approve'): Locator {
    return this.page.locator(buttonSelector(`${rowId}-${action}`)).first();
  }

  /** One row action: absent / disabled / available. */
  async rowActionState(rowId: string, action: 'review' | 'reject' | 'approve'): Promise<'absent' | 'disabled' | 'available'> {
    const b = this.rowAction(rowId, action);
    if ((await b.count()) === 0 || !(await b.isVisible().catch(() => false))) return 'absent';
    return (await b.isEnabled()) ? 'available' : 'disabled';
  }

  /** Opens a row's Review drawer and reads its footer buttons and text (left open). */
  async openReview(rowId: string): Promise<ReviewView> {
    await this.rowAction(rowId, 'review').click();
    await expect(this.byId(WRITER_F_IDS.reviewDrawerTitle(this.tab)), 'the Review drawer').toBeVisible({ timeout: Timeouts.default });
    await this.waitForPageReady();
    // The drawer opens on "Loading…" and fills when its detail call answers - read it only after that (22181 read
    // "Review Submission Loading… Close"). If it never fills, the caller's assertion reports the text it shows.
    const drawer = this.byId(WRITER_F_IDS.reviewDrawer(this.tab));
    await expect.poll(async () => /Loading/i.test(await drawer.innerText().catch(() => 'Loading')), { timeout: Timeouts.default }).toBe(false).catch(() => undefined);
    const buttons: string[] = [];
    for (const [key, id] of [['approve', WRITER_F_IDS.reviewDrawerApprove(this.tab)], ['reject', WRITER_F_IDS.reviewDrawerReject(this.tab)], ['close', WRITER_F_IDS.reviewDrawerClose(this.tab)]] as const) {
      if (await this.page.locator(buttonSelector(id)).first().isVisible().catch(() => false)) buttons.push(key);
    }
    return { buttons: buttons.sort(), text: norm(await drawer.innerText().catch(() => '')) };
  }

  reviewTitle(): Locator {
    return this.byId(WRITER_F_IDS.reviewDrawerTitle(this.tab));
  }

  reviewButton(which: 'approve' | 'reject'): Locator {
    return this.page.locator(buttonSelector(which === 'approve' ? WRITER_F_IDS.reviewDrawerApprove(this.tab) : WRITER_F_IDS.reviewDrawerReject(this.tab))).first();
  }

  async closeReview(): Promise<void> {
    const close = this.page.locator(buttonSelector(`approvals-${this.tab}-review-drawer-close`)).first();
    if (await close.isVisible().catch(() => false)) await close.click();
    else await this.page.keyboard.press('Escape');
    await expect(this.byId(WRITER_F_IDS.reviewDrawerTitle(this.tab))).toBeHidden({ timeout: Timeouts.default });
  }

  /** The Approvals menu entry (where a pending-count badge would show). */
  navEntry(): Locator {
    return this.byId(WRITER_F_IDS.navApprovals);
  }

  tabCount(): Locator {
    return this.byId(WRITER_F_IDS.hubTabCount(this.tab));
  }
}

export interface DecisionOutcome {
  /** The confirm dialog: title, message, listed items. */
  title: string;
  message: string;
  items: string[];
  /** Every Approvals decision call answered while confirming ("<path> <status> <message>"). */
  answers: string[];
  toast: string;
  /** Non-empty when the dialog listed a foreign request and was CANCELLED (nothing decided). */
  refusedBecause: string;
  dialogShown: boolean;
  /** Bulk only: the state Approve All / Reject All was in before the click ('' for row / drawer prompts). */
  buttonState?: 'absent' | 'disabled' | 'available';
}

async function readDialogItems(page: Page): Promise<string[]> {
  return (await page.locator(`#${WRITER_F_IDS.dialogItems} [id^="${WRITER_F_IDS.dialogItemPrefix}"]`).allInnerTexts().catch(() => [] as string[])).map(norm);
}

/** Confirms the open shared dialog (reason for a rejection), recording every Approvals decision answer. */
async function confirmRecording(page: Page, reason: string | null): Promise<{ answers: string[]; toast: string }> {
  const answers: string[] = [];
  const pending: Promise<void>[] = [];
  const onResponse = (r: Response): void => {
    if (!/\/api\/Approvals\/\w*(Approve|Reject)\w*/i.test(r.url()) || r.request().method() !== 'POST') return;
    pending.push(r.text().then((t) => { answers.push(`${new URL(r.url()).pathname} ${r.status()} ${messageOf(t)}`); }, () => undefined));
  };
  page.on('response', onResponse);
  const dialog = new ConfirmDialog(page);
  let toast = '';
  try {
    if (reason) await dialog.selectReasonIfPresent(reason);
    // Since 2026-11 the Reject dialog keeps Reject disabled until Rejection Details are typed when the reason is
    // "Other" ('Details are required when the reason is "Other".') - 22187 timed out on a disabled confirm.
    if (reason && /^other$/i.test(reason)) await dialog.typeReasonText(REJECTION_DETAILS_FOR_OTHER);
    await dialog.acknowledgeIfPresent();
    await dialog.clickAction('confirm');
    toast = await new WriterFScreen(page).getToastMessage(Timeouts.toast).catch(() => '');
    await dialog.waitForHidden().catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await Promise.all(pending);
  } finally {
    page.off('response', onResponse);
  }
  if (await dialog.isVisible()) await dialog.cancel().catch(() => undefined);
  return { answers, toast: norm(toast) };
}

/**
 * Clicks a decision control (a row's Approve / Reject, the Review drawer's Approve / Reject) and reads the
 * confirmation prompt it raised - LEFT OPEN (confirm with `confirmPrompt`, or cancel).
 */
export async function openPrompt(page: Page, button: Locator): Promise<DecisionOutcome> {
  await button.click();
  const dialog = new ConfirmDialog(page);
  const dialogShown = await dialog.isVisible();
  const out: DecisionOutcome = { title: '', message: '', items: [], answers: [], toast: '', refusedBecause: '', dialogShown };
  if (!dialogShown) {
    out.toast = norm(await new WriterFScreen(page).getToastMessage(Timeouts.short).catch(() => ''));
    return out;
  }
  out.title = norm(await dialog.getTitle().catch(() => ''));
  out.message = norm(await dialog.getMessage().catch(() => ''));
  out.items = await readDialogItems(page);
  return out;
}

/** Confirms the prompt that is open (reason "Other" for a rejection) and records every decision answer + the toast. */
export async function confirmPrompt(page: Page, which: 'approve' | 'reject', reason = 'Other'): Promise<{ answers: string[]; toast: string }> {
  return confirmRecording(page, which === 'reject' ? reason : null);
}

/** Confirms a prompt only when `dialog` says one was shown (nothing to confirm otherwise). */
export async function confirmIfShown(page: Page, dialog: DecisionOutcome, which: 'approve' | 'reject', reason = 'Other'): Promise<{ answers: string[]; toast: string }> {
  if (!dialog.dialogShown || dialog.refusedBecause) return { answers: [], toast: '' };
  return confirmPrompt(page, which, reason);
}

/**
 * Approve All / Reject All: reads the button's state, clicks it only when enabled, and reads the
 * confirmation it raised. SAFETY: when the dialog lists any request that is not a suite request it is
 * CANCELLED here (`refusedBecause`) - nothing is decided. Otherwise the dialog is left open for
 * `confirmPrompt`. `buttonState` says whether the button could be clicked at all.
 */
export async function openBulkDialog(view: ApprovalTabView, which: 'approve' | 'reject'): Promise<DecisionOutcome> {
  const page = view.session();
  const state = await view.bulkState(which);
  if (state !== 'available') {
    return { title: '', message: '', items: [], answers: [], toast: '', refusedBecause: '', dialogShown: false, buttonState: state };
  }
  const out: DecisionOutcome = { ...(await openPrompt(page, view.bulkButton(which))), buttonState: state };
  const foreign = out.items.filter((t) => !/(QA )?Automation /.test(t));
  if (out.dialogShown && foreign.length > 0) {
    out.refusedBecause = `the dialog listed requests that are not the suite's: ${foreign.slice(0, 5).join(' | ')}`;
    await new ConfirmDialog(page).cancel().catch(() => page.keyboard.press('Escape'));
  }
  return out;
}

/** Polls until the entity has no Pending request any more (careconnect's read); returns the statuses seen. */
export async function waitLeftPending(adminPage: Page, entityType: ApprovalEntityType, name: string, timeoutMs = 60_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let statuses: string[] = [];
  while (Date.now() < deadline) {
    statuses = await requestStatuses(adminPage, entityType, name);
    if (!statuses.includes('Pending')) return statuses;
    await adminPage.waitForTimeout(3_000);
  }
  return statuses;
}

// ---- roles on the Role Administration screen ------------------------------------------------------

export interface RoleOnScreen {
  /** The role's row was found by search. */
  listed: boolean;
  /** View Role read-only values (label -> value). */
  values: Record<string, string>;
  /** Tree rows by permission key (everything expanded). */
  rows: Map<string, TreeRow>;
}

/** careconnect opens Role Administration, finds the role and reads View Role (values + whole tree), then closes it. */
export async function readRoleOnScreen(roleAdmin: RoleAdministrationPage, role: { id: string; name: string }): Promise<RoleOnScreen> {
  await roleAdmin.open();
  await roleAdmin.search(role.name);
  const listed = (await roleAdmin.rowIds()).includes(role.id);
  const view = await roleAdmin.openView(role.id);
  await view.tree.expandAll();
  const values = await view.values();
  const rows = await view.tree.rowsByKey();
  await view.close();
  return { listed, values, rows };
}

/** The View Role value whose label matches `label`. */
export function valueOf(values: Record<string, string>, label: RegExp): string {
  const key = Object.keys(values).find((k) => label.test(k));
  return key ? values[key] : `(no "${label.source}" row; rows: ${Object.keys(values).join(', ')})`;
}

/** `{ key: "<label> [state]" }` for the asked keys - one comparable picture of a role's tree. */
export function treePicture(rows: Map<string, TreeRow>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => {
    const r = rows.get(k);
    return [k, r ? `${norm(r.label)} [${r.state}]` : '(not rendered)'];
  }));
}

// ---- payers ----------------------------------------------------------------------------------------

/** Payer ids by English name (GetPayersDropdown through careconnect) - read only. */
export async function payersByName(adminPage: Page, names: readonly string[]): Promise<SuitePayer[]> {
  await onApp(adminPage);
  const res = await asSession(adminPage, 'GET', ApiEndpoints.payerDropdown);
  const all = res.items as { id: string; payerNameEn: string }[];
  return names.map((n) => all.find((p) => p.payerNameEn === n)).filter((p): p is { id: string; payerNameEn: string } => !!p).map((p) => ({ id: p.id, name: p.payerNameEn, owned: false }));
}

/**
 * Payers listed to a scoped holder that are NOT its assigned payers, split into the holder's OWN payers still
 * waiting for their first approval (careconnect reads each: `createdBy` = the holder, `isPendingCreate`) and
 * the rest. Each as "name (code, version status, created by the holder|someone else)" - plain text for the step.
 * Live 2026-11-15: "test time" (PAY-D-0643), made by the maalmohammad account on 2026-11-11 and pending its
 * first approval, is listed to every scoped holder (22154 / 22162 / 22168).
 */
export async function payersOutsideScope(adminPage: Page, items: readonly Item[], allowed: readonly string[], holderId: string): Promise<{ ownPending: string[]; other: string[]; ownPendingIds: string[] }> {
  const out = { ownPending: [] as string[], other: [] as string[], ownPendingIds: [] as string[] };
  for (const item of items.filter((i) => !allowed.includes(idOf(i)))) {
    const res = await asSession(adminPage, 'POST', ApiEndpoints.payerDetail, { id: idOf(item) });
    let d: { createdBy?: string; isPendingCreate?: boolean } = {};
    try {
      d = (JSON.parse(res.text) as { payload?: typeof d }).payload ?? {};
    } catch {
      d = {};
    }
    const own = d.createdBy === holderId;
    const text = `${labelOf(item)} (${String(item.payerCode ?? '?')}, ${String(item.versionStatusCode ?? '?')}, created by ${own ? 'the holder itself' : 'someone else'})`;
    if (own && d.isPendingCreate) {
      out.ownPending.push(text);
      out.ownPendingIds.push(idOf(item));
    } else out.other.push(text);
  }
  return out;
}

/**
 * What is wrong with a scoped holder's payer list ('' = exactly the assigned payers): payers outside the scope
 * (the holder's own pending ones named as such - accepted when `ownPendingInScope`) and assigned payers missing.
 */
export async function payerListProblems(adminPage: Page, items: readonly Item[], assigned: readonly SuitePayer[], holderId: string, ownPendingInScope: boolean): Promise<string> {
  const unique = [...new Map(items.map((i) => [idOf(i), i])).values()];
  const allowed = assigned.map((p) => p.id);
  const extra = await payersOutsideScope(adminPage, unique, allowed, holderId);
  return [
    ...extra.other.map((t) => `listed outside the scope: ${t}`),
    ...(ownPendingInScope ? [] : extra.ownPending.map((t) => `listed outside the scope: ${t} - the holder's own payer pending its first approval`)),
    ...assigned.filter((p) => !unique.some((i) => idOf(i) === p.id)).map((p) => `assigned payer not listed: ${p.name}`),
  ].join('; ');
}

/** Records of `ids` that are NOT in `allowed` (for "every row belongs to the scope"). */
export function outside(ids: readonly (string | null)[], allowed: readonly string[]): string[] {
  return ids.map((i) => i ?? '(none)').filter((i) => !allowed.includes(i));
}

/** Writer F needs the catalogue through suiteRoles (cached per test). */
export async function catalogueOf(suiteRoles: SuiteRoles): Promise<PermissionCatalogue> {
  return suiteRoles.catalogue();
}

/** Short failure text of an answer (never JSON). */
export function said(a: { status: number; message?: string; text?: string }): string {
  return `${a.status} "${(a.message ?? messageOf(a.text ?? '')).slice(0, 160)}"`;
}

/** Shared test-info accessor for helpers that annotate. */
export function note(testInfo: TestInfo, description: string): void {
  testInfo.annotations.push({ type: 'facts', description });
}

// ---- folder 15 (payer scope) ------------------------------------------------------------------------

export interface ScopedHolderSpec {
  label: string;
  /** Whole modules the role holds. */
  modules: readonly string[];
  /** Single keys on top. */
  extra?: readonly string[];
  /** Has Assigned Payers? */
  scoped: boolean;
  /** The payers assigned with the role (may be empty). */
  payers: readonly SuitePayer[];
  /** How the "Select a Payer" gate is answered at sign-in (default: the first assigned payer). */
  payerToChoose?: string;
}

/** A suite role for the holder (rights of whole modules), given to maalmohammad with exactly `payers`, signed in. */
export async function scopedHolder(suiteRoles: SuiteRoles, holder: RoleHolder, spec: ScopedHolderSpec): Promise<SuiteRole> {
  const cat = await suiteRoles.catalogue();
  const role = await suiteRoles.create({ label: spec.label, rights: rightsOf(cat, spec.modules, spec.extra ?? []), hasAssignedPayers: spec.scoped });
  await holder.become({ role, payerIds: spec.payers.map((p) => p.id) }, spec.payerToChoose ? { payerToChoose: spec.payerToChoose } : {});
  return role;
}

/** A record's display name (first `...NameEn` field, else e-mail / code / id). */
export function labelOf(item: Item): string {
  const key = Object.keys(item).find((k) => /NameEn$/.test(k) && typeof item[k] === 'string');
  return String((key ? item[key] : undefined) ?? item.email ?? item.memberCode ?? item.id ?? '?');
}

/** "name (payerId)" of every record whose payerId is not in `allowed` (owner-less ones too unless `ownerlessAllowed`). */
export function foreignRecords(items: readonly Item[], allowed: readonly string[], ownerlessAllowed = false): string[] {
  return items
    .filter((i) => {
      const p = payerIdOf(i);
      if (p === null) return !ownerlessAllowed;
      return !allowed.includes(p);
    })
    .map((i) => `${labelOf(i)} (${payerIdOf(i) ?? 'no payer'})`);
}

export interface MemberRef {
  payerId: string;
  payerName: string;
  memberId: string;
  memberCode: string;
  memberName: string;
  policyMemberId: string;
}

/**
 * Two members tied to two different payers through their policies (careconnect's read, read only): member A
 * of a policy of `payerA`, member B of a policy of another payer and NOT enrolled under payer A. null parts
 * when the environment has none.
 */
export async function memberPair(adminPage: Page, payerA: SuitePayer): Promise<{ a: MemberRef | null; b: MemberRef | null }> {
  await onApp(adminPage);
  const policies = (await listAll(adminPage, LIST_API.policies)).items;
  const scopedA = new Set((await listAll(adminPage, LIST_API.members, {}, payerA.id)).items.map(idOf));
  const firstLive = async (policy: Item, skip: Set<string>): Promise<MemberRef | null> => {
    const res = await asSession(adminPage, 'POST', ApiEndpoints.policyMembers, { policyId: idOf(policy), pageNumber: 1, rowsPerPage: 200 });
    const m = (res.items as { id: string; memberId: string; memberCode: string; memberNameEn: string; rosterState: string }[])
      .find((x) => x.rosterState === 'live' && !skip.has(x.memberId));
    return m ? { payerId: String(policy.payerId), payerName: String(policy.payerNameEn ?? ''), memberId: m.memberId, memberCode: m.memberCode, memberName: m.memberNameEn, policyMemberId: m.id } : null;
  };
  let a: MemberRef | null = null;
  let b: MemberRef | null = null;
  for (const policy of policies.filter((p) => p.payerId === payerA.id)) {
    a = await firstLive(policy, new Set());
    if (a) break;
  }
  for (const policy of policies.filter((p) => p.payerId && p.payerId !== payerA.id)) {
    b = await firstLive(policy, scopedA);
    if (b) break;
  }
  return { a, b };
}

/** E-mails of listed users that hold no role assigned to `payerId` (careconnect reads each user). */
export async function usersOutsideScope(adminPage: Page, items: readonly Item[], payerId: string): Promise<string[]> {
  const out: string[] = [];
  for (const item of items) {
    const res = await asSession(adminPage, 'POST', ApiEndpoints.userGet, { id: idOf(item) });
    let roles: { assignedPayers?: { id: string }[] }[] = [];
    try {
      roles = ((JSON.parse(res.text) as { payload?: { assignedRoles?: { assignedPayers?: { id: string }[] }[] } }).payload?.assignedRoles) ?? [];
    } catch {
      roles = [];
    }
    if (!roles.some((r) => (r.assignedPayers ?? []).some((p) => p.id === payerId))) out.push(String(item.email ?? idOf(item)));
  }
  return out;
}

/**
 * Replays every captured dashboard call as careconnect with the top-bar payer set to `payerId` and returns
 * the calls whose figures differ (path names only - never JSON).
 */
export async function replayAsScoped(adminPage: Page, calls: readonly { url: string; method: string; body: unknown; status: number; payload: unknown }[], payerId: string, sessionFields: readonly string[] = []): Promise<string[]> {
  const differ: string[] = [];
  const figures = (v: unknown): string => JSON.stringify(withoutFields(v, sessionFields));
  for (const call of calls) {
    const method = call.method === 'GET' ? 'GET' : 'POST';
    const res = await asSession(adminPage, method, call.url, method === 'GET' ? undefined : (call.body ?? {}), payerId);
    let payload: unknown = null;
    try {
      payload = (JSON.parse(res.text) as { payload?: unknown }).payload ?? null;
    } catch {
      payload = null;
    }
    if (res.status !== call.status || figures(payload) !== figures(call.payload)) {
      const fields = differingFields(withoutFields(call.payload, sessionFields), withoutFields(payload, sessionFields));
      differ.push(`${call.url} (holder ${call.status}, administrator scoped to the payer ${res.status}; differs at ${fields.slice(0, 6).join(', ') || 'the status'})`);
    }
  }
  return differ;
}

/** A copy of `v` without the named keys at any depth (session facts that are not figures). */
function withoutFields(v: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(v)) return v.map((x) => withoutFields(x, fields));
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !fields.includes(k)).map(([k, x]) => [k, withoutFields(x, fields)]));
}

/** Dotted paths where two payloads differ (for the failure text - names only, never values). */
function differingFields(a: unknown, b: unknown, at = 'payload'): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [at];
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  return [...keys].flatMap((k) => differingFields((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`));
}

/** Detail reads per module (body builder) - careconnect opens records of two different payers (22166). */
const DETAIL_API: Record<'payers' | 'networks' | 'plans' | 'members', { path: string; body: (id: string) => Item }> = {
  // GetPayer takes { id }; { payerId } answers 400 "The supplied payer Id is invalid." (22166 read that 400 as a refusal).
  payers: { path: ApiEndpoints.payerDetail, body: (id) => ({ id }) },
  networks: { path: ApiEndpoints.networkGet, body: (id) => ({ id }) },
  plans: { path: ApiEndpoints.planGet, body: (id) => ({ id }) },
  members: { path: ApiEndpoints.memberGet, body: (id) => ({ id }) },
};

/**
 * careconnect opens two records of two DIFFERENT payers in a module and returns "<payer>: <status>" per
 * record (fewer when the module has no records of those payers). Members are found per payer scope.
 */
export async function openRecordsOfTwoPayers(adminPage: Page, module: 'payers' | 'networks' | 'plans' | 'members', payers: readonly SuitePayer[]): Promise<string[]> {
  const picks: { id: string; payer: string }[] = [];
  if (module === 'members') {
    for (const p of payers) {
      const m = (await listAll(adminPage, LIST_API.members, {}, p.id, 5)).items[0];
      if (m) picks.push({ id: idOf(m), payer: p.name });
    }
  } else if (module === 'payers') {
    payers.slice(0, 2).forEach((p) => picks.push({ id: p.id, payer: p.name }));
  } else {
    const items = (await listAll(adminPage, LIST_API[module])).items;
    for (const p of payers) {
      const it = items.find((i) => payerIdOf(i) === p.id);
      if (it) picks.push({ id: idOf(it), payer: p.name });
    }
  }
  const out: string[] = [];
  for (const pick of picks.slice(0, 2)) {
    const res = await asSession(adminPage, 'POST', DETAIL_API[module].path, DETAIL_API[module].body(pick.id));
    out.push(`${pick.payer}: ${res.status}`);
  }
  return out;
}

/**
 * Switches the top-bar payer quickly through `payers` on one screen (no check between the first switches)
 * and checks the answer to the LAST switch: the header it carried, the scope shown, and records not of the
 * last payer (members: records outside careconnect's own read of that payer).
 */
export async function switchAndCheck(page: Page, module: PayerScreenKey, payers: readonly SuitePayer[]): Promise<{ scope: string; header: string | null; foreign: string[] }> {
  await openScreen(page, module);
  const screen = new WriterFScreen(page);
  const last = payers[payers.length - 1];
  for (const p of payers.slice(0, -1)) await pickScope(screen, p.name);
  // The LAST list answer that arrives once the final pick is made - what the screen ends up showing. Taking the
  // first answer after the pick (switchScope) caught the PREVIOUS pick's request still in flight (22167, re-run of
  // 2026-11-15: "the list call carried payer <the one before>"). A stale answer that really lands last still fails.
  const answers: Response[] = [];
  const onAnswer = (r: Response): void => {
    if (PAYER_SCREENS[module].call.test(new URL(r.url()).pathname) && r.request().method() === 'POST') answers.push(r);
  };
  page.on('response', onAnswer);
  let picked = false;
  try {
    picked = await pickScope(screen, last.name);
    await page.waitForLoadState('networkidle', { timeout: Timeouts.default }).catch(() => undefined);
    await page.waitForTimeout(1_500);
  } finally {
    page.off('response', onAnswer);
  }
  const final = picked ? await readAnswer(answers[answers.length - 1] ?? null) : { status: -1, items: [] as Item[], totalRows: 0, header: null };
  let foreign: string[];
  if (module === 'members') {
    const own = new Set((await listAll(page, LIST_API.members, {}, last.id)).items.map(idOf));
    foreign = final.items.filter((i) => !own.has(idOf(i))).map(labelOf);
  } else if (module === 'payers') {
    foreign = final.items.filter((i) => idOf(i) !== last.id).map(labelOf);
  } else {
    foreign = foreignRecords(final.items, [last.id]);
  }
  return { scope: await screen.scopeLabel(), header: final.header, foreign };
}

/** What does not match the last payer chosen after `switchAndCheck` ('' = all matches) - plain text for the step. */
export function switchProblems(seen: { scope: string; header: string | null; foreign: string[] }, last: SuitePayer): string {
  return [
    ...(seen.scope === last.name ? [] : [`the filter reads "${seen.scope}"`]),
    ...(seen.header === last.id ? [] : [`the list call carried payer ${seen.header ?? '(none)'} instead of "${last.name}"`]),
    ...(seen.foreign.length ? [`records not of "${last.name}": ${seen.foreign.slice(0, 5).join(', ')}`] : []),
  ].join('; ');
}

/** Distinct payers among records (owner-less left out). */
export function payersSpanned(items: readonly Item[]): string[] {
  return [...new Set(items.map(payerIdOf).filter((p): p is string => p !== null))];
}

// ---- folder 16 (approval permissions) -------------------------------------------------------------

export interface ReviewerSpec {
  label: string;
  /** Permission keys of the suite role. */
  rights: readonly string[];
  canApproveOwnRequests?: boolean;
  /** Predefined roles held BESIDE the suite role. */
  alongside?: readonly PredefinedRoleName[];
}

/** A suite reviewer role (exact keys) for the holder - alone or beside predefined roles - signed in. */
export async function becomeReviewer(suiteRoles: SuiteRoles, holder: RoleHolder, spec: ReviewerSpec): Promise<SuiteRole> {
  const role = await suiteRoles.create({ label: spec.label, rights: spec.rights, canApproveOwnRequests: spec.canApproveOwnRequests ?? false });
  await holder.become([...(spec.alongside ?? []).map((r) => ({ role: r })), { role }]);
  return role;
}

/** The expected tree picture: `{ key: "<label> [state]" }`. */
export function picture(entries: readonly (readonly [string, string, 'checked' | 'unchecked' | 'partial'])[]): Record<string, string> {
  return Object.fromEntries(entries.map(([key, label, state]) => [key, `${label} [${state}]`]));
}

/** Only the states of keys (labels left out) - for rows whose label the step does not quote. */
export function statesOf(rows: Map<string, TreeRow>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, rows.get(k)?.state ?? '(not rendered)']));
}

/**
 * careconnect opens Edit on a suite role, goes to Privileges and ticks one tree node (a group tick fills the
 * group). Returns the states of `watch` keys afterwards; the drawer is left open on Privileges for Save.
 */
export async function tickInEditDrawer(roleAdmin: RoleAdministrationPage, role: { id: string; name: string }, key: string, watch: readonly string[]): Promise<Record<string, string>> {
  await roleAdmin.open();
  await roleAdmin.search(role.name);
  const form = await roleAdmin.openEdit(role.id);
  await form.nextToPrivileges();
  await form.tree.expandAll();
  await form.tree.tick(key);
  const out: Record<string, string> = {};
  for (const k of watch) out[k] = await form.tree.stateOf(k);
  return out;
}

/**
 * careconnect opens Add Role, fills Role Information (never saved) and goes to Privileges with everything
 * expanded - for reading the catalogue as the screen shows it. Close with `roleAdmin.form.close()`.
 */
export async function openAddPrivileges(roleAdmin: RoleAdministrationPage, suiteRoles: SuiteRoles, allowedToAssignBy: string): Promise<void> {
  await suiteRoles.watch();
  await roleAdmin.open();
  const form = await roleAdmin.openAdd();
  await form.fill({ nameEn: suiteRoles.newName('approval tree'), nameAr: suiteRoles.newArabicName(), allowedToAssignBy: [allowedToAssignBy] });
  await form.nextToPrivileges();
  await form.tree.expandAll();
}

/**
 * One approval module in the open Privileges tree: its group, one-at-a-time and bulk rows (label), and
 * whether ticking its group changed any OTHER module's group (states before / after, then unticked).
 */
export async function inspectApprovalModule(roleAdmin: RoleAdministrationPage, module: string, others: readonly string[]): Promise<{ rows: Record<string, string>; othersChanged: string[] }> {
  const tree = roleAdmin.form.tree;
  const keys = [`ApprovalManagement.${module}`, `ApprovalManagement.${module}.ApproveReject`, `ApprovalManagement.${module}.ApproveRejectAll`];
  const rows: Record<string, string> = {};
  for (const k of keys) rows[k] = (await tree.isRendered(k)) ? norm((await tree.rowInfo(k)).label) : '(not rendered)';
  const before: Record<string, string> = {};
  for (const o of others) before[o] = await tree.stateOf(o);
  await tree.tick(keys[0]);
  const othersChanged: string[] = [];
  for (const o of others) {
    const now = await tree.stateOf(o);
    if (now !== before[o]) othersChanged.push(`${o}: ${before[o]} -> ${now}`);
  }
  await tree.untick(keys[0]);
  return { rows, othersChanged };
}

/** The permission keys a role holds (GetRolePermissions through careconnect). */
export async function heldKeys(adminPage: Page, roleId: string): Promise<string[]> {
  return rolePermissionKeys(adminPage, roleId);
}

/** Pending suite registrations (GetInvitationApprovals through careconnect) - e-mails of suite addresses only. */
export async function pendingSuiteRegistrations(adminPage: Page): Promise<string[]> {
  const res = await asSession(adminPage, 'POST', ApiEndpoints.invitationApprovals, { pageNumber: 1, rowsPerPage: 200 });
  return res.items.map((i) => String(i.email ?? '')).filter((e) => e.toLowerCase().startsWith('qa.automation.'));
}
