import type { Page, Response } from '@playwright/test';
import { expect, test as pwTest } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import { LanguageSwitcher } from '../../pages/components/LanguageSwitcher';
import type { PermissionTree, TreeRow } from '../../pages/role/PermissionTree';
import type { RoleAdministrationPage } from '../../pages/role/RoleAdministrationPage';
import type { RoleFormDrawer } from '../../pages/role/RoleFormDrawer';
import type { UserFormDrawer } from '../../pages/user/UserFormDrawer';
import { drawerUser, passContact, passUserInfo, type DrawerUser, type SuiteName } from '../user/writerBHelpers';
import type { HolderGrant, SuiteRoles, SuiteUsers } from '../../fixtures/roleModule.fixture';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { MODULE_SCREEN, WRITER_D_SCREEN, type HolderModule } from '../../constants/role/writerDIds';
import { PREDEFINED_ROLES } from '../../data/role/common.data';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { USER_LOOKUP, findUserByEmail, payerDropdown, readUserOrNull, isSuiteUser, updateBodyOf, type RoleAssignment, type UserBody } from '../UserProvisioning';
import { permissionToggleId } from '../../constants/role/roleIds';
import { currentRolesAndPermissions, descendantsOf, type PermissionCatalogue, type PermissionNode } from './roleApi';

/**
 * Writer D helpers (Role Management folders 04 Assign Privileges, 07 Predefined Role Module Access, 17 Viewing
 * Audit History Permissions). On top of the lead's shared layer (pages/role/*, fixtures/roleModule.fixture.ts,
 * utils/role/roleApi.ts) - nothing here writes to a role, user or payer the suite does not own:
 *  - roles are only ever made / changed through `suiteRoles` (the caller's fixture);
 *  - user writes as the holder go through `asHolderOnSuiteUser`, which checks the target is a suite user through
 *    the ADMIN session first;
 *  - every other module is only READ (lists, detail pages, audit tabs) - other people's records are opened, never
 *    saved.
 */

// ---- step outcome -------------------------------------------------------------------------

/**
 * Lead decision 8: data the run cannot produce is BLOCKED - unless an earlier step already FAILED, in which case
 * the case stays a FAIL (a note is left instead). Returns only when it did not block.
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = pwTest.info();
  if (info.errors.length > 0 || steps.records().some((r) => r.status === 'FAIL')) {
    info.annotations.push({ type: 'note', description: `Not observed (an earlier step failed): ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/** 401 / 403 = the server refused the session. */
export const REFUSED_STATUSES: readonly number[] = [401, 403];
export const isRefused = (status: number): boolean => REFUSED_STATUSES.includes(status);

/** Whitespace / dash normalisation for literal texts (lead decision 3). */
export const norm = (s: string): string => s.replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim();

// ---- API ------------------------------------------------------------------------------------

export interface ApiAnswer {
  status: number;
  text: string;
}

/** A request through the session of `page` (careconnect or the holder). */
export async function asSession(page: Page, method: 'POST' | 'PUT' | 'DELETE' | 'GET', path: string, data?: unknown): Promise<ApiAnswer> {
  const res = await NetworkUtils.requestAsSession(page, method, path, data);
  return { status: res.status, text: res.text };
}

/** The answer in a few words for a failure message (no JSON - the narrator cuts at the first `{"`). */
export function told(a: { status: number; text: string }): string {
  let message = '';
  try {
    const b = JSON.parse(a.text) as { successMessage?: string; ErrorMessage?: string; message?: string; title?: string; Title?: string };
    message = b.ErrorMessage ?? b.message ?? b.Title ?? b.title ?? b.successMessage ?? '';
  } catch {
    message = a.text.slice(0, 120);
  }
  return `HTTP ${a.status}${message ? ` "${message.replace(/[{}"]/g, '').slice(0, 160)}"` : ''}`;
}

/** List / get endpoints of every module the holder cases read. */
export const MODULE_API: Record<HolderModule, { list: string; get: string; getBody: (id: string) => Record<string, unknown> }> = {
  users: { list: ApiEndpoints.userList, get: ApiEndpoints.userGet, getBody: (id) => ({ id }) },
  invitations: { list: ApiEndpoints.invitationList, get: '', getBody: (id) => ({ id }) },
  payers: { list: ApiEndpoints.payerList, get: ApiEndpoints.payerDetail, getBody: (id) => ({ id }) },
  networks: { list: ApiEndpoints.networkList, get: ApiEndpoints.networkGet, getBody: (id) => ({ id }) },
  plans: { list: ApiEndpoints.planList, get: ApiEndpoints.planGet, getBody: (id) => ({ id }) },
  policies: { list: ApiEndpoints.policyList, get: ApiEndpoints.policyGet, getBody: (id) => ({ id }) },
  formularies: { list: ApiEndpoints.formularyList, get: ApiEndpoints.formularyGet, getBody: (id) => ({ id }) },
  facilities: { list: ApiEndpoints.facilityList, get: ApiEndpoints.facilityGet, getBody: (id) => ({ id }) },
  members: { list: ApiEndpoints.memberList, get: ApiEndpoints.memberGet, getBody: (id) => ({ id }) },
};

export type ListItem = Record<string, unknown> & { id: string };

export interface ListAnswer {
  status: number;
  items: ListItem[];
  totalRows: number;
  text: string;
}

/**
 * The first `{ items, totalRows }` inside a payload, whatever the module calls it: the payload itself
 * (AuditLogs/GetAuditLogs, Get...AuditTrail - flat; missed before 2026-11-15, which read every audit answer as 0 rows
 * and blocked 22193 / failed 22196's baseline) or one level down (`payload.networks.items`, `payload.roles.items`).
 */
function listOf(text: string): { items: ListItem[]; totalRows: number } {
  try {
    const payload = (JSON.parse(text) as { payload?: unknown }).payload;
    if (Array.isArray(payload)) return { items: payload as ListItem[], totalRows: payload.length };
    const flat = payload as { items?: unknown; totalRows?: number } | null | undefined;
    if (flat && Array.isArray(flat.items)) return { items: flat.items as ListItem[], totalRows: flat.totalRows ?? flat.items.length };
    const holder = Object.values((payload ?? {}) as Record<string, unknown>).find((v) => !!v && typeof v === 'object' && Array.isArray((v as { items?: unknown }).items)) as
      | { items: ListItem[]; totalRows?: number }
      | undefined;
    return { items: holder?.items ?? [], totalRows: holder?.totalRows ?? holder?.items.length ?? 0 };
  } catch {
    return { items: [], totalRows: 0 };
  }
}

/** A module's list (first `rows`) through the session of `page`. */
export async function listRecords(page: Page, module: HolderModule, criteria: Record<string, unknown> = {}, rows = 50): Promise<ListAnswer> {
  const body: Record<string, unknown> = { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', ...criteria };
  if (module === 'members') body.isActive = criteria.isActive ?? null;
  const res = await asSession(page, 'POST', MODULE_API[module].list, body);
  return { status: res.status, text: res.text, ...listOf(res.text) };
}

/** A module's record through the session of `page` (status + payload). */
export async function getRecord(page: Page, module: HolderModule, id: string): Promise<{ status: number; text: string; payload: Record<string, unknown> | null }> {
  const res = await asSession(page, 'POST', MODULE_API[module].get, MODULE_API[module].getBody(id));
  let payload: Record<string, unknown> | null = null;
  try {
    payload = ((JSON.parse(res.text) as { payload?: Record<string, unknown> }).payload ?? null) as Record<string, unknown> | null;
  } catch {
    payload = null;
  }
  return { status: res.status, text: res.text, payload };
}

/** Denied = refused, not found, or an answer with no record in it. */
export const deniedOrEmpty = (a: { status: number; payload: unknown }): boolean => a.status >= 400 || !a.payload;

/**
 * The payers a record belongs to (ids and English names), read through the ADMIN session:
 * payers = itself; networks / plans / policies / formularies / invitations = `payerId`; users = every payer of every
 * assigned role; members = the payers of the member's benefit policies (names). Facilities belong to no payer.
 */
export async function payersOfRecord(adminPage: Page, module: HolderModule, item: ListItem): Promise<{ ids: string[]; names: string[] }> {
  if (module === 'payers') return { ids: [item.id], names: [String(item.payerNameEn ?? '')] };
  if (module === 'facilities') return { ids: [], names: [] };
  if (module === 'users') {
    const rec = await readUserOrNull(adminPage, item.id);
    const payers = (rec?.assignedRoles ?? []).flatMap((r) => r.assignedPayers ?? []);
    return { ids: payers.map((p) => p.id), names: payers.map((p) => String((p as { payerNameEn?: string }).payerNameEn ?? '')) };
  }
  if (module === 'members') {
    const rec = await getRecord(adminPage, 'members', item.id);
    const policies = ((rec.payload?.benefitPolicies ?? []) as { payerNameEn?: string }[]).map((p) => String(p.payerNameEn ?? ''));
    return { ids: [], names: policies };
  }
  if (typeof item.payerId === 'string') return { ids: [item.payerId], names: [String(item.payerNameEn ?? '')] };
  const rec = await getRecord(adminPage, module, item.id);
  const id = rec.payload?.payerId;
  return { ids: typeof id === 'string' ? [id] : [], names: [String(rec.payload?.payerNameEn ?? '')] };
}

/**
 * The listed records (first `cap`) that belong to NO payer in `scope` - what a payer-scoped list must not show.
 * A user / member with no payer at all counts as outside the scope.
 */
export async function recordsOutsideScope(adminPage: Page, module: HolderModule, items: ListItem[], scope: { ids: string[]; names: string[] }, cap = 25): Promise<string[]> {
  if (module === 'facilities') return [];
  const out: string[] = [];
  for (const item of items.slice(0, cap)) {
    const owner = await payersOfRecord(adminPage, module, item);
    const inside = owner.ids.some((id) => scope.ids.includes(id)) || owner.names.some((n) => n && scope.names.includes(n));
    if (!inside) out.push(`${item.id} (payer ${owner.names.filter(Boolean).join(', ') || owner.ids.join(', ') || 'none'})`);
  }
  return out;
}

// ---- payer scope data ------------------------------------------------------------------------

export interface ScopePayer {
  id: string;
  name: string;
}

export interface ScopeData {
  /** The payer the payer-scoped holder is given. */
  payer: ScopePayer;
  /** One record of `payer` per module ('' = none found). */
  inScope: Partial<Record<HolderModule, string>>;
  /** One record of ANOTHER payer per module (out-of-scope probes). */
  outOfScope: Partial<Record<HolderModule, { id: string; payerName: string }>>;
  /** Members: the policy-member id of the in-scope member (its accumulator page). */
  policyMemberId: string;
}

const PAYER_OWNED: readonly HolderModule[] = ['networks', 'plans', 'policies', 'formularies'];

/** Rows read per module list when choosing the scope payer (owned networks are sparse: ~80 of the newest 500). */
const SCOPE_LIST_ROWS = 500;

/**
 * Picks the ACTIVE payer that owns records in the most of `modules` (suite payers "Automation Payer ..." first on a
 * tie) and one record of it per module, plus one record of another payer per module. Everything is READ through
 * the admin session; the payer is only used as the holder's scope (lead brief: suite payers are read-only scopes;
 * a colleague's payer is used the same way - nothing of it is written - when no suite payer owns the records).
 * Members are reached through the payer's policies that have members.
 */
export async function scopeDataFor(adminPage: Page, modules: readonly HolderModule[]): Promise<ScopeData> {
  const active = await payerDropdown(adminPage);
  const activeIds = new Set(active.map((p) => p.id));
  const nameOf = (id: string): string => active.find((p) => p.id === id)?.payerNameEn ?? id;
  const owned = new Map<HolderModule, ListItem[]>();
  const wanted = modules.filter((m) => PAYER_OWNED.includes(m) || m === 'members');
  for (const m of wanted.filter((x) => x !== 'members')) owned.set(m, (await listRecords(adminPage, m, {}, SCOPE_LIST_ROWS)).items);
  const policies = owned.get('policies') ?? (wanted.includes('members') ? (await listRecords(adminPage, 'policies', {}, SCOPE_LIST_ROWS)).items : []);
  if (wanted.includes('members')) owned.set('policies', policies);

  // The owner straight from the LIST row when the list carries `payerId` (networks, plans, policies, formularies):
  // null = no owner. Before 2026-11-15 a null sent every network to GetNetwork (whose payerId is null too) and only
  // the first 60 rows were read - the newest ~400 networks are unowned disposable ones, so no network ever had an
  // owner and 22056 / 22062 / 22066 were BLOCKED. Lists without the key still resolve per record (capped).
  const listsOwner = (items: ListItem[]): boolean => items.some((i) => 'payerId' in i);
  const scanned = (items: ListItem[]): ListItem[] => (listsOwner(items) ? items : items.slice(0, 60));
  const payerKey = async (m: HolderModule, item: ListItem): Promise<string> => {
    if ('payerId' in item) return typeof item.payerId === 'string' ? item.payerId : '';
    return (await payersOfRecord(adminPage, m, item)).ids[0] ?? '';
  };
  const score = new Map<string, Set<HolderModule>>();
  for (const [m, items] of owned) {
    for (const item of scanned(items)) {
      const pid = await payerKey(m, item);
      if (!pid || !activeIds.has(pid)) continue;
      if (!score.has(pid)) score.set(pid, new Set());
      score.get(pid)?.add(m);
      if (m === 'policies' && wanted.includes('members') && Number(item.memberCount ?? 0) > 0) score.get(pid)?.add('members');
    }
  }
  const ranked = [...score.entries()].sort((a, b) => b[1].size - a[1].size || Number(nameOf(b[0]).startsWith('Automation Payer')) - Number(nameOf(a[0]).startsWith('Automation Payer')));
  const fallback = active.find((p) => p.payerNameEn.startsWith('Automation Payer')) ?? active[0];
  const payerId = ranked[0]?.[0] ?? fallback?.id ?? '';
  const data: ScopeData = { payer: { id: payerId, name: nameOf(payerId) }, inScope: {}, outOfScope: {}, policyMemberId: '' };

  for (const m of wanted.filter((x) => x !== 'members')) {
    for (const item of scanned(owned.get(m) ?? [])) {
      const pid = await payerKey(m, item);
      if (pid === payerId && !data.inScope[m]) data.inScope[m] = item.id;
      // Another ACTIVE payer only: careconnect's baseline opens the record in its owner's scope (the scope picker
      // offers active payers only).
      if (pid && pid !== payerId && activeIds.has(pid) && !data.outOfScope[m]) data.outOfScope[m] = { id: item.id, payerName: nameOf(pid) };
      if (data.inScope[m] && data.outOfScope[m]) break;
    }
  }
  if (wanted.includes('members')) {
    for (const p of policies.filter((x) => Number(x.memberCount ?? 0) > 0).slice(0, 40)) {
      const pid = await payerKey('policies', p);
      const mine = pid === payerId;
      if ((mine && data.inScope.members) || (!mine && data.outOfScope.members)) continue;
      const res = await asSession(adminPage, 'POST', ApiEndpoints.policyMembers, { policyId: p.id, pageNumber: 1, rowsPerPage: 5 });
      const first = listOf(res.text).items[0] as (ListItem & { memberId?: string }) | undefined;
      if (!first?.memberId) continue;
      if (mine) {
        data.inScope.members = String(first.memberId);
        data.policyMemberId = first.id;
      } else data.outOfScope.members = { id: String(first.memberId), payerName: nameOf(pid) };
      if (data.inScope.members && data.outOfScope.members) break;
    }
  }
  Logger.step(`[writerD] Scope payer "${data.payer.name}": in scope ${JSON.stringify(data.inScope)}`);
  return data;
}

/** What the scope data lacks: a record of the scope payer in `inScope` modules, of another payer in `outOfScope` modules. */
export function scopeGaps(data: ScopeData, inScope: readonly HolderModule[], outOfScope: readonly HolderModule[] = []): string[] {
  return [
    ...inScope.filter((m) => m !== 'facilities' && !data.inScope[m]).map((m) => `a ${m} record of ${data.payer.name || 'any active payer'}`),
    ...outOfScope.filter((m) => !data.outOfScope[m]).map((m) => `a ${m} record of another payer`),
  ];
}

export type OutOfScopeProbe = Awaited<ReturnType<typeof probeOutOfScope>>;

/** `[what]` when `value` is empty, else [] - feeds blockWhenMissing. */
export const need = (value: string | null | undefined, what: string): string[] => (value ? [] : [what]);

/** BLOCKS (lead decision 8) when the environment holds none of the `missing` records the case needs. */
export function blockWhenMissing(steps: TestSteps, missing: readonly string[], what: string): void {
  if (missing.length > 0) blockUnlessAStepFailed(steps, `${what}: ${missing.join(', ')}`);
}

/**
 * For each module, the records the HOLDER's own list shows that belong to no payer of `scope` (empty modules left
 * out) - a payer-scoped list must show none.
 */
export async function scopeLeaks(adminPage: Page, holderPage: Page, modules: readonly HolderModule[], scope: { ids: string[]; names: string[] }): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const m of modules) {
    const listed = await listRecords(holderPage, m, {}, 25);
    if (listed.status >= 300) {
      out[m] = [`list refused: ${told(listed)}`];
      continue;
    }
    const outside = await recordsOutsideScope(adminPage, m, listed.items, scope);
    if (outside.length) out[m] = outside;
  }
  return out;
}

/**
 * Another payer's record probed by careconnect (baseline: it opens - in its owner's scope when `ownerName` is given)
 * and by the holder (screen + API): the holder must neither open it nor get it from the API.
 */
export async function probeOutOfScope(adminPage: Page, holderPage: Page, module: HolderModule, id: string, ownerName = ''): Promise<{ module: HolderModule; adminOpened: boolean; holderOpened: boolean; holderDenied: boolean; told: string }> {
  const adminOpened = (await new HolderScreens(adminPage).record(module, id, true, ownerName)).opened;
  const visit = await new HolderScreens(holderPage).record(module, id, false);
  const api = await getRecord(holderPage, module, id);
  return { module, adminOpened, holderOpened: visit.opened, holderDenied: deniedOrEmpty(api), told: `${module} ${id}: the holder ended on ${visit.path} ("${visit.text}"), API ${told(api)}` };
}

/** A member's coverage order and benefit accumulator as a session sees them (22063). */
export async function memberAccess(
  page: Page,
  ids: { memberId: string; policyMemberId: string },
  rights: { coverageEdit: string; accumulatorEdit: string },
): Promise<{ opened: boolean; coverageTab: boolean; coverageRead: number; accumulatorRead: number; coverageEditable: boolean; accumulatorEditable: boolean }> {
  const screens = new HolderScreens(page);
  const visit = await screens.record('members', ids.memberId);
  const coverageTab = visit.opened && (await screens.shows(WRITER_D_SCREEN.member.cobTab));
  const cob = await asSession(page, 'POST', ApiEndpoints.cobTimeline, { memberId: ids.memberId });
  const acc = await asSession(page, 'POST', ApiEndpoints.memberAccumulator, { policyMemberId: ids.policyMemberId });
  const held = new Set((await currentRolesAndPermissions(page)).permissions);
  return {
    opened: visit.opened,
    coverageTab,
    coverageRead: cob.status,
    accumulatorRead: acc.status,
    coverageEditable: held.has(rights.coverageEdit),
    accumulatorEditable: held.has(rights.accumulatorEdit),
  };
}

/**
 * The suite user with `email` (admin read); when the case could not create it through the screen, careconnect makes
 * it with `grants` so the later steps still run. Returns its id.
 */
export async function ensureSuiteUser(adminPage: Page, suiteUsers: SuiteUsers, name: SuiteName, grants: HolderGrant): Promise<string> {
  const found = await findUserByEmail(adminPage, name.email);
  if (found) {
    await suiteUsers.adopt(name.email);
    return found.id;
  }
  return (await suiteUsers.create(grants, { user: { lastName: name.lastName, email: name.email } })).id;
}

/** `count` active suite payers' names by id (from GetPayersDropdown). */
export async function payerNames(adminPage: Page, ids: readonly string[]): Promise<string[]> {
  const all = await payerDropdown(adminPage);
  return ids.map((id) => all.find((p) => p.id === id)?.payerNameEn ?? id);
}

// ---- screens a holder visits -------------------------------------------------------------------

export interface ScreenVisit {
  /** The screen's root rendered. */
  shown: boolean;
  /** Where the browser ended (pathname). */
  path: string;
  /** What the page showed instead (when not shown). */
  text: string;
}

export interface ModuleAccess extends ScreenVisit {
  module: HolderModule;
  add: boolean;
  export: boolean;
}

export interface RecordVisit {
  opened: boolean;
  path: string;
  auditTab: boolean;
  text: string;
}

export interface AuditCall {
  /** The audit request the tab sent ('' = none). */
  path: string;
  body: Record<string, unknown>;
  status: number;
  /** Rows the answer carried. */
  rows: number;
}

/**
 * Any session's view of other modules: the side menu, a module's list screen, a record's detail screen and its
 * Audit History tab. Navigation goes through BasePage.goto (the payer gate is answered there).
 */
export class HolderScreens extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Whether the side menu offers `linkId` (collapsed groups are expanded first - their links render only then). */
  async menuOffers(linkId: string): Promise<boolean> {
    await this.byId(WRITER_D_SCREEN.headerTitle).waitFor({ state: 'attached', timeout: Timeouts.default }).catch(() => undefined);
    const link = this.byId(linkId);
    if ((await link.count()) > 0) return true;
    const toggles = this.page.locator(`button[id^="${WRITER_D_SCREEN.navPrefix}"][id$="${WRITER_D_SCREEN.navToggleSuffix}"]`);
    const n = await toggles.count();
    for (let i = 0; i < n; i += 1) {
      const toggle = toggles.nth(i); // locator-exception: every menu group toggle is expanded in turn; their number varies with the role
      const open = await toggle.evaluate((el, cls) => el.classList.contains(cls), WRITER_D_SCREEN.navOpenClass).catch(() => true);
      if (!open && (await toggle.isVisible().catch(() => false))) await toggle.click().catch(() => undefined);
    }
    return link.waitFor({ state: 'attached', timeout: Timeouts.short }).then(() => true, () => false);
  }

  /** Opens `route` and reports whether `rootId` rendered (a refused route bounces to the dashboard). */
  async visit(route: string, rootId: string, expectShown = true): Promise<ScreenVisit> {
    await this.goto(route);
    const shown = await this.byId(rootId).waitFor({ state: 'visible', timeout: expectShown ? Timeouts.default : Timeouts.toast }).then(() => true, () => false);
    const path = new URL(this.page.url()).pathname;
    const text = shown ? '' : norm(await this.byId(WRITER_D_SCREEN.outlet).innerText().catch(() => '')).slice(0, 160);
    return { shown, path, text };
  }

  /** A module's list screen and its Add / Export controls. */
  async module(module: HolderModule, expectShown = true): Promise<ModuleAccess> {
    const s = MODULE_SCREEN[module];
    const visit = await this.visit(s.route, s.screen, expectShown);
    const present = async (id: string): Promise<boolean> => visit.shown && (await this.byId(id).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false));
    return { module, ...visit, add: await present(s.add), export: await present(s.export) };
  }

  /**
   * A record's detail screen: opened? Audit History tab shown? `ownerScope` (a payer's English name): when the
   * detail does not open, put that payer in the top-bar scope from the module's list and open it again - a
   * payer-owned record outside the session's scope bounces to the list (NetworkDetailPage.open does the same;
   * careconnect's out-of-scope baselines need it, the holder's probes never pass it).
   */
  async record(module: HolderModule, id: string, expectOpened = true, ownerScope = ''): Promise<RecordVisit> {
    const s = MODULE_SCREEN[module];
    const ready = this.page.locator(`[id^="${s.detailReady}"]`).first(); // locator-exception: any detail tab id proves the detail rendered
    await this.goto(`${s.detailRoute}/${id}`);
    let opened = await ready.waitFor({ state: 'visible', timeout: expectOpened ? Timeouts.default : Timeouts.toast }).then(() => true, () => false);
    if (!opened && ownerScope) {
      await this.goto(s.route);
      if (await this.scopeTo(ownerScope).catch(() => false)) {
        await this.goto(`${s.detailRoute}/${id}`);
        opened = await ready.waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true, () => false);
      }
    }
    const auditTab = opened && (await this.byId(s.auditTab).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false));
    const path = new URL(this.page.url()).pathname;
    const text = opened ? '' : norm(await this.byId(WRITER_D_SCREEN.outlet).innerText().catch(() => '')).slice(0, 160);
    return { opened, path, auditTab, text };
  }

  /** Clicks the record's Audit History tab and reports the audit request it sent and its answer. */
  async openAuditTab(module: HolderModule): Promise<AuditCall> {
    const isAudit = (r: Response): boolean => /\/api\/.*Audit/i.test(new URL(r.url()).pathname) && r.request().method() !== 'GET';
    const answer = this.page.waitForResponse(isAudit, { timeout: Timeouts.default }).catch(() => null);
    await this.byId(MODULE_SCREEN[module].auditTab).click();
    const res = await answer;
    if (!res) return { path: '', body: {}, status: 0, rows: 0 };
    const text = await res.text().catch(() => '');
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(res.request().postData() ?? '{}') as Record<string, unknown>;
    } catch {
      body = {};
    }
    return { path: new URL(res.url()).pathname, body, status: res.status(), rows: listOf(text).totalRows };
  }

  /** The Approval Management hub's tab strip. */
  async approvalsHub(): Promise<ScreenVisit> {
    return this.visit(WRITER_D_SCREEN.approvals.route, WRITER_D_SCREEN.approvals.tabs);
  }

  /** The home page's text (its welcome card has no id) and the Dashboard API answers it received while loading. */
  async home(): Promise<{ path: string; text: string; dashboardStatuses: number[] }> {
    const statuses: number[] = [];
    const listen = (r: Response): void => {
      if (/\/api\/Dashboard\//i.test(r.url())) statuses.push(r.status());
    };
    this.page.on('response', listen);
    await this.goto(WRITER_D_SCREEN.dashboard.route);
    await this.byId(WRITER_D_SCREEN.outlet).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    await this.page.waitForTimeout(2_000);
    this.page.off('response', listen);
    return { path: new URL(this.page.url()).pathname, text: norm(await this.byId(WRITER_D_SCREEN.outlet).innerText().catch(() => '')), dashboardStatuses: statuses };
  }

  /** Entity types of the audit-log rows on screen (System Settings > Audit Logs). */
  async auditLogEntityTypes(): Promise<string[]> {
    const a = WRITER_D_SCREEN.auditLogs;
    return this.page.locator(`[id^="${a.rowPrefix}"][id$="${a.entityTypeCellSuffix}"]`).allInnerTexts().then((t) => t.map(norm)).catch(() => [] as string[]);
  }

  /** Browser Back and Forward, each settled. */
  async back(): Promise<void> {
    await this.goBack();
  }

  async forward(): Promise<void> {
    await this.goForward();
  }

  /** Ids of every Audit History tab on the screen (`...-tab-audit`). */
  async auditTabsShown(): Promise<string[]> {
    return this.page.locator('[id$="-tab-audit"]').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.id));
  }

  /** Whether the element is on screen now (short wait). */
  async shows(id: string): Promise<boolean> {
    return this.byId(id).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
  }

  /** Clicks a control (detail tabs / buttons) by id. */
  async click(id: string): Promise<void> {
    await this.byId(id).click();
  }
}

// ---- the permission tree -----------------------------------------------------------------------

/** Add Role -> stamped suite names + Allowed To Assign By [Organization Administrator] -> Next -> Privileges. */
export async function openAddPrivileges(roleAdmin: RoleAdministrationPage, suiteRoles: SuiteRoles, label: string): Promise<{ nameEn: string; nameAr: string; form: RoleFormDrawer }> {
  const nameEn = suiteRoles.newName(label);
  const nameAr = suiteRoles.newArabicName();
  await suiteRoles.watch();
  await roleAdmin.open();
  const form = await roleAdmin.openAdd();
  await form.fill({ nameEn, nameAr, allowedToAssignBy: [PREDEFINED_ROLES.organizationAdministrator.en] });
  await form.nextToPrivileges();
  return { nameEn, nameAr, form };
}

/** Edit of a SUITE role -> Next -> Privileges. */
export async function openEditPrivileges(roleAdmin: RoleAdministrationPage, role: { id: string; name: string }): Promise<RoleFormDrawer> {
  await roleAdmin.open();
  await roleAdmin.search(role.name);
  const form = await roleAdmin.openEdit(role.id);
  await form.nextToPrivileges();
  return form;
}

/** The rows of one top-level heading's block (the heading itself excluded), as rendered now. */
export async function rowsUnderHeading(tree: PermissionTree, heading: string): Promise<TreeRow[]> {
  const rows = await tree.readRows();
  const start = rows.findIndex((r) => r.depth === 0 && r.label === heading);
  if (start < 0) return [];
  const out: TreeRow[] = [];
  for (let i = start + 1; i < rows.length && rows[i].depth > 0; i += 1) out.push(rows[i]);
  return out;
}

/** "x/y" of a heading as the screen prints it. */
export async function countText(tree: PermissionTree, key: string): Promise<string> {
  const c = await tree.countOf(key);
  return `${c.selected}/${c.total}`;
}

/** The DIRECT children of a module whose English name is `label` (e.g. "View Audit Logs"). */
export function childrenLabelled(catalogue: PermissionCatalogue, moduleKey: string, label: string): PermissionNode[] {
  return (catalogue.byKey.get(moduleKey)?.permissions ?? []).filter((n) => n.englishName === label);
}

/** The module's "View Audit Logs" key (`<Module>.AuditLogs`), '' when the module has none. */
export function auditKeyOf(catalogue: PermissionCatalogue, moduleKey: string): string {
  return catalogue.byKey.get(`${moduleKey}.AuditLogs`)?.key ?? '';
}

/**
 * The rights a holder needs to LIST and OPEN a module's records: every `Get...` right below the module that is
 * not an audit right (e.g. Plans.GetPlans, Plans.GetPlan, Plans.GetPlanVersions ...).
 */
export function viewRightsOf(catalogue: PermissionCatalogue, moduleKey: string): string[] {
  const m = catalogue.byKey.get(moduleKey);
  if (!m) throw new Error(`the permission catalogue has no module "${moduleKey}"`);
  return descendantsOf(m).map((n) => n.key).filter((k) => /\.Get/.test(k) && !/Audit/i.test(k));
}

/** Every audit right below a module (View Audit Logs, Get...AuditTrail, the sub-entity audit logs). */
export function auditRightsOf(catalogue: PermissionCatalogue, moduleKey: string): string[] {
  const m = catalogue.byKey.get(moduleKey);
  if (!m) throw new Error(`the permission catalogue has no module "${moduleKey}"`);
  return descendantsOf(m).map((n) => n.key).filter((k) => /Audit/i.test(k));
}

/**
 * A holder role's rights: the VIEW rights of each module, plus every audit right of the modules marked `audit`, plus
 * `extra` (the system log rights).
 */
export function holderRights(catalogue: PermissionCatalogue, modules: readonly { moduleKey: string; audit: boolean }[], extra: readonly string[] = []): string[] {
  const keys = modules.flatMap((m) => [...viewRightsOf(catalogue, m.moduleKey), ...(m.audit ? auditRightsOf(catalogue, m.moduleKey) : [])]);
  return [...new Set([...keys, ...extra])];
}

/** Same label ignoring case, whitespace and dashes (finding an entry; the exact text is 22197's own check). */
export const sameLabel = (a: string, b: string): boolean => norm(a).toLowerCase() === norm(b).toLowerCase();

/**
 * A module heading's row and the rows of its block, found by the module's chevron id (headings were renamed by the
 * 2026-11-14 build, the ids were not). `heading` null = the module is not in the tree.
 */
export async function moduleBlock(tree: PermissionTree, moduleKey: string): Promise<{ heading: TreeRow | null; rows: TreeRow[] }> {
  const rows = await tree.readRows();
  const start = rows.findIndex((r) => r.depth === 0 && r.toggleId === permissionToggleId(moduleKey));
  if (start < 0) return { heading: null, rows: [] };
  const out: TreeRow[] = [];
  for (let i = start + 1; i < rows.length && rows[i].depth > 0; i += 1) out.push(rows[i]);
  return { heading: rows[start], rows: out };
}

/** The "View Audit Logs" row directly under a module's heading (label matched ignoring case), null when it has none. */
export async function auditRowUnder(tree: PermissionTree, moduleKey: string, label: string): Promise<TreeRow | null> {
  return (await moduleBlock(tree, moduleKey)).rows.find((r) => r.depth === 1 && sameLabel(r.label, label)) ?? null;
}

/** What a module heading holds directly below it, for failure messages. */
export async function directEntries(tree: PermissionTree, moduleKey: string): Promise<string> {
  const block = await moduleBlock(tree, moduleKey);
  if (!block.heading) return `no "${moduleKey}" heading in the tree`;
  return `heading "${block.heading.label}" holds ${block.rows.filter((r) => r.depth === 1).map((r) => `"${r.label}"`).join(', ') || 'nothing'}`;
}

export interface AuditRecordType {
  type: string;
  moduleKey: string;
  /** How the heading may read (the TC's name or the friendly one). */
  heading: RegExp;
}

/** Record types whose heading has no `label` row directly below it, ignoring case (with what the heading holds instead). */
export async function missingAuditEntries(tree: PermissionTree, types: readonly AuditRecordType[], label: string): Promise<string[]> {
  const out: string[] = [];
  for (const t of types) {
    const block = await moduleBlock(tree, t.moduleKey);
    const direct = block.rows.filter((r) => r.depth === 1).map((r) => r.label);
    if (!direct.some((l) => sameLabel(l, label))) out.push(`${t.type} (${block.heading ? `heading "${block.heading.label}": ${direct.join(', ') || 'nothing'}` : 'heading not found'})`);
  }
  return out;
}

/**
 * Record types whose heading is not recognisably named, or does not hold EXACTLY one row reading exactly `label`
 * (whitespace / dashes normalised, case kept - lead decision 3) directly below it. Rows that match only when case is
 * ignored are reported with the text the screen showed.
 */
export async function misplacedAuditEntries(tree: PermissionTree, types: readonly AuditRecordType[], label: string): Promise<string[]> {
  const out: string[] = [];
  for (const t of types) {
    const block = await moduleBlock(tree, t.moduleKey);
    if (!block.heading) {
      out.push(`${t.type}: no heading in the tree`);
      continue;
    }
    const name = block.heading.label;
    if (!t.heading.test(norm(name))) out.push(`${t.type}: the heading reads "${name}"`);
    const direct = block.rows.filter((r) => r.depth === 1);
    const exact = direct.filter((r) => norm(r.label) === norm(label)).length;
    const nearly = direct.filter((r) => norm(r.label) !== norm(label) && sameLabel(r.label, label)).map((r) => r.label);
    if (exact !== 1) out.push(`${t.type}: heading "${name}" holds ${exact} "${label}" entries directly below it${nearly.length ? ` (it reads "${nearly.join('", "')}")` : ''}`);
  }
  return out;
}

/** The module's own "View Audit Logs" permission: the direct child `<Module>.AuditLogs`, or a direct child so labelled (any case). */
export function ownAuditPermissions(catalogue: PermissionCatalogue, moduleKey: string, label: string): PermissionNode[] {
  return (catalogue.byKey.get(moduleKey)?.permissions ?? []).filter((n) => n.key === `${moduleKey}.AuditLogs` || sameLabel(n.englishName, label));
}

/** Catalogue check: each type's module has its own `label` permission, none shared between types. */
export function sharedOrMissingAuditPermissions(catalogue: PermissionCatalogue, types: readonly AuditRecordType[], label: string): string[] {
  const owners = new Map<string, string[]>();
  const problems: string[] = [];
  for (const t of types) {
    const own = ownAuditPermissions(catalogue, t.moduleKey, label);
    if (!own.length) problems.push(`${t.type}: no "${label}" permission below ${t.moduleKey}`);
    for (const node of own) owners.set(node.id, [...(owners.get(node.id) ?? []), t.type]);
  }
  for (const types2 of owners.values()) if (types2.length > 1) problems.push(`one permission shared by ${types2.join(' and ')}`);
  return problems;
}

/** What `toggleRepeatedly` should read: full, empty, full ... */
export function alternatingStates(total: number, times: number): { count: string; state: string }[] {
  return Array.from({ length: times }, (_, i) => (i % 2 === 0 ? { count: `${total}/${total}`, state: 'checked' } : { count: `0/${total}`, state: 'unchecked' }));
}

/** The rendered rows in a few words (failure messages). */
export function describeRows(rows: readonly TreeRow[], extra = ''): string {
  return `the tree showed ${rows.length} row(s) [${rows.map((r) => r.label).join(', ')}]${extra ? `; ${extra}` : ''}`;
}

/** Catalogue keys that occur more than once (whole tree). */
export function duplicateKeys(catalogue: PermissionCatalogue): string[] {
  const seen = new Map<string, number>();
  const walk = (n: PermissionNode): void => {
    seen.set(n.key, (seen.get(n.key) ?? 0) + 1);
    (n.permissions ?? []).forEach(walk);
  };
  catalogue.modules.forEach(walk);
  return [...seen.entries()].filter(([, c]) => c > 1).map(([k]) => k);
}

/** Labels that occur more than once among the rows of one heading block. */
export function duplicateLabels(rows: readonly TreeRow[]): string[] {
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.label, (seen.get(r.label) ?? 0) + 1);
  return [...seen.entries()].filter(([, c]) => c > 1).map(([l]) => l);
}

/**
 * Lead decision 10: the Privileges step searched in the ARABIC UI. Switches careconnect's UI to Arabic, opens Add
 * Role (step 1 filled; Allowed To Assign By picked by its Arabic name, the English one as fallback), searches
 * `term` and reads the tree - then closes the drawer and switches back to English whatever happened.
 */
export async function searchPrivilegesInArabic(
  page: Page,
  roleAdmin: RoleAdministrationPage,
  suiteRoles: SuiteRoles,
  term: string,
): Promise<{ lang: string; rows: TreeRow[]; payersToggleExpanded: string | null }> {
  const switcher = new LanguageSwitcher(page);
  try {
    await suiteRoles.watch();
    await roleAdmin.open();
    await switcher.switchTo('ar');
    await roleAdmin.open();
    const form = await roleAdmin.openAdd();
    await form.fill({ nameEn: suiteRoles.newName('arabic search'), nameAr: suiteRoles.newArabicName() });
    await form.chooseAllowedToAssignBy([PREDEFINED_ROLES.organizationAdministrator.ar]).catch(() => form.chooseAllowedToAssignBy([PREDEFINED_ROLES.organizationAdministrator.en]));
    await form.nextToPrivileges();
    await form.tree.search(term);
    const rows = await form.tree.readRows();
    const lang = (await switcher.currentLanguage()) as string;
    const payersToggleExpanded = await page.locator(`#${permissionToggleId('Payers')}`).getAttribute('aria-expanded', { timeout: Timeouts.short }).catch(() => null);
    return { lang, rows, payersToggleExpanded };
  } finally {
    if (await roleAdmin.form.isOpen()) await roleAdmin.form.close('x').catch(() => undefined);
    await switcher.switchTo('en').catch(() => undefined);
  }
}

/** Clicks a tree node `times` times and reads its "(x/y)" and state after each click. */
export async function toggleRepeatedly(tree: PermissionTree, key: string, times: number): Promise<{ count: string; state: string }[]> {
  const out: { count: string; state: string }[] = [];
  for (let i = 0; i < times; i += 1) {
    const want = i % 2 === 0 ? 'checked' : 'unchecked';
    await tree.click(key);
    await expect.poll(() => tree.stateOf(key), { timeout: Timeouts.default }).toBe(want).catch(() => undefined);
    out.push({ count: await countText(tree, key), state: await tree.stateOf(key) });
  }
  return out;
}

// ---- users as the holder ------------------------------------------------------------------------

/** Closes the Add / Edit User drawer without saving (answers Unsaved Changes with Discard when it asks). */
export async function discardUserDrawer(drawer: UserFormDrawer): Promise<void> {
  const guard = await drawer.close();
  if (guard) await drawer.discardChanges();
}

/**
 * Fills Add User steps 1-2 with a valid suite user and moves to Roles and Privileges (step 3). Returns whether
 * step 3 is showing. Nothing is saved here.
 */
export async function addUserToRolesStep(page: Page, drawer: UserFormDrawer, name: SuiteName): Promise<{ onStep3: boolean; user: DrawerUser }> {
  const user = await drawerUser(page, name);
  const info = await passUserInfo(drawer, user);
  const contact = info && (await passContact(drawer, user));
  return { onStep3: !!contact, user };
}

/**
 * A write AS THE HOLDER on a SUITE user (checked through the admin session first, so even an accepted request
 * only ever touches a suite user): update (changes), activate / deactivate, delete.
 */
export async function asHolderOnSuiteUser(
  adminPage: Page,
  holderPage: Page,
  id: string,
  action: { update: Partial<UserBody> } | { active: boolean } | 'delete',
): Promise<ApiAnswer> {
  const record = await readUserOrNull(adminPage, id);
  if (!record || !isSuiteUser(record)) throw new Error(`refusing to act on user ${id}: not a suite user`);
  if (action === 'delete') return asSession(holderPage, 'DELETE', `${ApiEndpoints.userDelete}?id=${encodeURIComponent(id)}`);
  if ('active' in action) {
    return asSession(holderPage, 'POST', ApiEndpoints.userToggleActivation, {
      id,
      isActive: action.active,
      inactivationReasonId: action.active ? null : USER_LOOKUP.deactivationReason.other,
      inactivationDetails: action.active ? null : 'Deactivated by the automation suite (role holder).',
    });
  }
  return asSession(holderPage, 'PUT', ApiEndpoints.userUpdate, updateBodyOf(record, action.update));
}

/** A suite user's roles as `roleId:payerIds` strings (admin read) - compare assignments. */
export async function userAssignments(adminPage: Page, id: string): Promise<string[]> {
  const rec = await readUserOrNull(adminPage, id);
  return (rec?.assignedRoles ?? []).map((r) => `${r.id}:${(r.assignedPayers ?? []).map((p) => p.id).sort().join(',')}`).sort();
}

export const assignmentKey = (a: RoleAssignment): string => `${a.roleId}:${[...a.payerIds].sort().join(',')}`;

// ---- audit logs ---------------------------------------------------------------------------------

/** POST AuditLogs/GetAuditLogs `{entityType, pageNumber, rowsPerPage}` through a session. */
export async function auditLogsOf(page: Page, entityType: string, rows = 10): Promise<ListAnswer> {
  const res = await asSession(page, 'POST', ApiEndpoints.auditLogList, { entityType, pageNumber: 1, rowsPerPage: rows });
  return { status: res.status, text: res.text, ...listOf(res.text) };
}

/** Replays an audit request a tab sent, through another session (status 0 when no request was captured). */
export async function replayAudit(page: Page, call: AuditCall | null): Promise<ListAnswer> {
  if (!call?.path) return { status: 0, text: 'no audit request was captured to replay', items: [], totalRows: 0 };
  const res = await asSession(page, 'POST', call.path, call.body);
  return { status: res.status, text: res.text, ...listOf(res.text) };
}

/**
 * Among the first `candidates` records of a module (admin list), the first whose Audit History tab - opened by
 * careconnect - lists at least one entry (the "record with change history" a TC asks for). '' when none does.
 */
export async function recordWithHistory(adminPage: Page, module: HolderModule, candidates = 4): Promise<{ id: string; call: AuditCall | null }> {
  const screens = new HolderScreens(adminPage);
  const items = (await listRecords(adminPage, module, {}, candidates)).items;
  for (const item of items) {
    const visit = await screens.record(module, item.id);
    if (!visit.auditTab) continue;
    const call = await screens.openAuditTab(module);
    if (call.rows > 0) return { id: item.id, call };
  }
  return { id: '', call: null };
}

/**
 * The first of the newest `candidates` formularies whose audit trail (GetFormularyAuditTrail, admin read) holds an
 * entry, with its owner's name ('' id when none does). Read through the API, not the screen: a formulary owned by a
 * payer outside careconnect's top-bar scope never opens on screen, which (with the flat-payload miss in listOf)
 * BLOCKED 22193 on 2026-11-14 although all 40 newest formularies had history (probe 2026-11-15).
 */
export async function formularyWithHistory(adminPage: Page, candidates = 20): Promise<{ id: string; payerName: string; rows: number }> {
  for (const item of (await listRecords(adminPage, 'formularies', {}, candidates)).items) {
    const res = await asSession(adminPage, 'POST', ApiEndpoints.formularyAuditTrail, { formularyId: item.id, actionType: null, pageNumber: 1, rowsPerPage: 5 });
    const rows = listOf(res.text).totalRows;
    if (res.status === 200 && rows > 0) return { id: item.id, payerName: String(item.payerNameEn ?? ''), rows };
  }
  return { id: '', payerName: '', rows: 0 };
}

/**
 * A REVERSED authorization in the PBM Engine (admin read; GetAuthorizations held 0 rows on 2026-11-05). '' when
 * there is none - the case is then BLOCKED (the suite cannot post an authorization: it needs the partner API).
 */
export async function reversedAuthorizationId(adminPage: Page): Promise<string> {
  const res = await asSession(adminPage, 'POST', ApiEndpoints.engineAuthorizations, { pageNumber: 1, rowsPerPage: 200 });
  const hit = listOf(res.text).items.find((i) => /revers/i.test(Object.values(i).map((v) => String(v ?? '')).join(' ')));
  return hit?.id ?? '';
}
