import type { Page } from '@playwright/test';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { env } from '../../constants/EnvironmentConfig';
import { SUITE_ROLE_PREFIX, arabicToken, userStamp, updateBodyOf, readUser, isSuiteUser, type RoleAssignment, type UserAnswer } from '../UserProvisioning';
import { PREDEFINED_ROLE_NAMES, ROLE_DEACTIVATION_REASON, SUITE_ROLE_ARABIC_PREFIX, type RoleDeactivationReasonKey } from '../../data/role/common.data';

/**
 * Role Management (Feature 21279) API helpers - every call goes through the session of the page passed in
 * (the admin `page` = careconnect, or a holder's page to prove a refusal). Observed live 2026-11-14:
 *
 *  - POST identity/Roles/GetRoles `{pageNumber, rowsPerPage, sortBy, searchText?, includeStaticRoles: true}`
 *    -> `payload.roles.{items, totalRows, totalPages}`. includeStaticRoles true/false/absent answer the SAME
 *    10 roles here; careconnect's own role "Admin" is never listed. sortBy: "CreatedOn desc|asc",
 *    "RoleNameEn asc|desc", "DescriptionEn ...", "Status ...", "ModifiedOn ...".
 *  - POST GetRole `{id}` -> record + concurrencyStamp + selectedPermissionIds + assignableRoleIds.
 *  - POST GetRolePermissions `{roleId, loadingOnDemand:false}` -> `requestedPermissions: [ROOT "Actions"]`
 *    whose `permissions` are the 32 modules, + `selectedPermissions: [{id, key, ...}]`.
 *  - POST CreateRole (body below) -> `{id}`; duplicate name 409 ValidationErrors[Name] "Role name '<n>' is already taken.".
 *  - PUT UpdateRole = create body + `id, concurrencyStamp`.
 *  - POST SetActive `{id, isActive, inactivationReasonId, inactivationDetails}` (lookup roleDeactivationReason).
 *  - DELETE DeleteRole?id=.
 *  - POST GetAssignableRoles `{rowsPerPage}` -> the roles the SIGNED-IN user may assign (inactive included).
 *
 * SAFETY: every WRITE refuses a role whose English name does not start with "QA Automation Role" unless the
 * id is in the caller's `owned` set (a role this run created, e.g. a refused-name case that slipped through).
 * Predefined roles are refused outright - there is deliberately no helper that writes to one.
 */

export { SUITE_ROLE_PREFIX };

export type RoleApiAnswer = { status: number; text: string; validationErrors: string[] };

const payloadOf = <T>(res: { text: string }): T | null => {
  try {
    return ((JSON.parse(res.text) as { payload?: T }).payload ?? null) as T | null;
  } catch {
    return null;
  }
};

/** The answer's human text: successMessage, or the validation reasons / ErrorMessage. */
export function answerMessage(res: { status: number; text: string; validationErrors?: string[] }): string {
  if (res.validationErrors?.length) return res.validationErrors.join(' | ');
  try {
    const b = JSON.parse(res.text) as { successMessage?: string; ErrorMessage?: string; message?: string; title?: string; Title?: string };
    return b.successMessage ?? b.ErrorMessage ?? b.message ?? b.Title ?? b.title ?? res.text.slice(0, 300);
  } catch {
    return res.text.slice(0, 300);
  }
}

// ---- names --------------------------------------------------------------------------------

/** `QA Automation Role <stamp>[ label]` (<= 100 characters, the screen's limit). */
export function suiteRoleNameEn(label = ''): string {
  return `${SUITE_ROLE_PREFIX} ${userStamp()}${label ? ` ${label}` : ''}`.slice(0, 100);
}
/** `دور اختبار <arabic token>` - Arabic letters only (the Arabic box refuses Latin). */
export function suiteRoleNameAr(): string {
  return `${SUITE_ROLE_ARABIC_PREFIX} ${arabicToken()}`;
}
export const isSuiteRoleName = (name: string | null | undefined): boolean => !!name && name.startsWith(SUITE_ROLE_PREFIX);
export const isPredefinedRoleName = (name: string): boolean => (PREDEFINED_ROLE_NAMES as readonly string[]).includes(name);

// ---- reads --------------------------------------------------------------------------------

export interface RoleListItem {
  id: string;
  name: string;
  arabicName: string;
  englishDescription: string;
  arabicDescription: string;
  isActive: boolean;
  hasAssignedPayers: boolean;
  canApproveOwnRequests: boolean;
  isStatic: boolean;
  isPredefined: boolean;
  createdOn: string;
  createdByName: string | null;
  modifiedOn?: string | null;
}

export interface RoleListAnswer {
  status: number;
  items: RoleListItem[];
  totalRows: number;
  totalPages: number;
}

export interface RoleListCriteria {
  pageNumber?: number;
  rowsPerPage?: number;
  sortBy?: string;
  searchText?: string;
  includeStaticRoles?: boolean;
  [key: string]: unknown;
}

/** POST GetRoles with the screen's defaults (page 1, 1000 rows, newest first, includeStaticRoles true). */
export async function listRolesPage(page: Page, criteria: RoleListCriteria = {}): Promise<RoleListAnswer> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleList, { pageNumber: 1, rowsPerPage: 1000, sortBy: 'CreatedOn desc', includeStaticRoles: true, ...criteria });
  const roles = payloadOf<{ roles: { items: RoleListItem[]; totalRows: number; totalPages: number } }>(res)?.roles;
  return { status: res.status, items: roles?.items ?? [], totalRows: roles?.totalRows ?? 0, totalPages: roles?.totalPages ?? 0 };
}

/** Every listed role (one page of 1000). */
export async function allRoles(page: Page): Promise<RoleListItem[]> {
  return (await listRolesPage(page)).items;
}

export async function roleIdByName(page: Page, name: string): Promise<string> {
  const role = (await allRoles(page)).find((r) => r.name === name);
  if (!role) throw new Error(`no role named "${name}" is listed (GetRoles)`);
  return role.id;
}

export interface RoleRecord extends Omit<RoleListItem, 'isStatic' | 'createdByName'> {
  concurrencyStamp: string;
  selectedPermissionIds: string[];
  /** "Allowed To Assign By": the role ids whose holders may ASSIGN this role. */
  assignableRoleIds: string[];
  createdByName: string | null;
  modifiedByName: string | null;
}

/** POST GetRole `{id}` - null when the role does not exist (404 / no payload). */
export async function readRole(page: Page, id: string): Promise<RoleRecord | null> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleGet, { id });
  if (res.status >= 300) return null;
  return payloadOf<RoleRecord>(res);
}

/** The raw GetRole answer (status + text) - for the refusal cases (403 / 404). */
export async function requestReadRole(page: Page, id: string): Promise<RoleApiAnswer> {
  return NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleGet, { id });
}

export interface PermissionNode {
  id: string;
  key: string;
  englishName: string;
  arabicName: string;
  parentId: string | null;
  hasChildren: boolean;
  permissions: PermissionNode[];
}

export interface PermissionCatalogue {
  /** The 32 module nodes (children of the ROOT "Actions"). */
  modules: PermissionNode[];
  /** Selected permissions of the role asked for (`{id, key}`). */
  selected: { id: string; key: string }[];
  /** key -> node, every node (modules included). */
  byKey: Map<string, PermissionNode>;
  /** id -> node. */
  byId: Map<string, PermissionNode>;
}

/** POST GetRolePermissions for `roleId` (any listed role for the bare catalogue). */
export async function readPermissionCatalogue(page: Page, roleId?: string): Promise<PermissionCatalogue> {
  const id = roleId ?? (await allRoles(page))[0]?.id;
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.rolePermissions, { roleId: id, loadingOnDemand: false });
  const p = payloadOf<{ requestedPermissions: PermissionNode[]; selectedPermissions: { id: string; key: string }[] }>(res);
  if (!p) throw new Error(`GetRolePermissions answered ${res.status}: ${answerMessage(res)}`);
  const root = p.requestedPermissions;
  const modules = root.length === 1 && root[0].key === 'Actions' ? root[0].permissions : root;
  const byKey = new Map<string, PermissionNode>();
  const byId = new Map<string, PermissionNode>();
  const walk = (n: PermissionNode): void => {
    byKey.set(n.key, n);
    byId.set(n.id, n);
    (n.permissions ?? []).forEach(walk);
  };
  modules.forEach(walk);
  return { modules, selected: (p.selectedPermissions ?? []).map((s) => ({ id: s.id, key: s.key })), byKey, byId };
}

/** Every node under `node` (not counting itself) - what a tree heading's "(x/y)" counts as y. */
export function descendantsOf(node: PermissionNode): PermissionNode[] {
  const out: PermissionNode[] = [];
  const walk = (n: PermissionNode): void => {
    for (const c of n.permissions ?? []) {
      out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

/** The "(x/y)" a heading should show for `moduleOrBranchKey` given the selected keys. */
export function expectedHeadingCount(catalogue: PermissionCatalogue, key: string, selectedKeys: readonly string[]): { selected: number; total: number } {
  const node = catalogue.byKey.get(key);
  if (!node) throw new Error(`the permission catalogue has no "${key}"`);
  const all = descendantsOf(node);
  return { selected: all.filter((n) => selectedKeys.includes(n.key)).length, total: all.length };
}

/** Catalogue ids of `keys` (throws naming the first unknown key). */
export async function permissionIdsByKeys(page: Page, keys: readonly string[], catalogue?: PermissionCatalogue): Promise<string[]> {
  const cat = catalogue ?? (await readPermissionCatalogue(page));
  return keys.map((k) => {
    const n = cat.byKey.get(k);
    if (!n) throw new Error(`the permission catalogue has no "${k}"`);
    return n.id;
  });
}

/** Every permission key of one module (module node included when `withModule`). */
export function moduleKeys(catalogue: PermissionCatalogue, moduleKey: string, withModule = true): string[] {
  const m = catalogue.byKey.get(moduleKey);
  if (!m) throw new Error(`the permission catalogue has no module "${moduleKey}"`);
  return [...(withModule ? [m.key] : []), ...descendantsOf(m).map((n) => n.key)];
}

/** The selected permission KEYS of a role. */
export async function rolePermissionKeys(page: Page, roleId: string): Promise<string[]> {
  return (await readPermissionCatalogue(page, roleId)).selected.map((s) => s.key);
}

/** GetCurrentUserRolesAndPermissions of the page's session. */
export async function currentRolesAndPermissions(page: Page): Promise<{ status: number; roles: string[]; permissions: string[] }> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.manageCurrentPermissions);
  const p = payloadOf<{ roles: string[]; permissions: string[] }>(res);
  return { status: res.status, roles: p?.roles ?? [], permissions: p?.permissions ?? [] };
}

/** GetAssignableRoles of the page's session (INACTIVE roles included - the User drawer filters them, the Invitation drawer does not). */
export async function assignableRoles(page: Page): Promise<{ status: number; items: RoleListItem[] }> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleAssignable, { rowsPerPage: 1000 });
  return { status: res.status, items: payloadOf<{ roles: { items: RoleListItem[] } }>(res)?.roles.items ?? [] };
}

/** Lookup roleDeactivationReason (GET). */
export async function roleDeactivationReasons(page: Page): Promise<{ id: string; code: string; englishName: string; arabicName: string }[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', ROLE_API.deactivationReasons);
  return payloadOf<{ id: string; code: string; englishName: string; arabicName: string }[]>(res) ?? [];
}

/** Paths observed 2026-11-14 that ApiEndpoints does not carry. */
export const ROLE_API = {
  setActive: '/api/identity/Roles/SetActive',
  deactivationReasons: '/api/Lookups/Items/roleDeactivationReason',
} as const;

// ---- writes (suite roles only) ------------------------------------------------------------

/** The Add Role drawer's body (POST CreateRole) - captured 2026-11-14. */
export interface RoleBody {
  name: string;
  arabicName: string;
  englishDescription: string;
  arabicDescription: string;
  isActive: boolean;
  hasAssignedPayers: boolean;
  canApproveOwnRequests: boolean;
  selectedPermissionIds: string[];
  assignableRoleIds: string[];
}

/** POST CreateRole as-is (the caller tracks the id for deletion). Refuses a name outside the suite prefix. */
export async function requestCreateRole(page: Page, body: RoleBody): Promise<RoleApiAnswer & { id: string }> {
  if (!isSuiteRoleName(body.name)) throw new Error(`refusing to create "${body.name}": suite roles start with "${SUITE_ROLE_PREFIX}"`);
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleCreate, body);
  return { ...res, id: payloadOf<{ id: string }>(res)?.id ?? '' };
}

/** Throws unless `id` is a suite role (or one this run created - `owned`). Never a predefined role. */
export async function assertSuiteRole(page: Page, id: string, owned: ReadonlySet<string> = new Set()): Promise<RoleRecord> {
  const role = await readRole(page, id);
  if (!role) throw new Error(`GetRole ${id} found no role`);
  if (role.isPredefined) throw new Error(`refusing to change the predefined role "${role.name}"`);
  if (!isSuiteRoleName(role.name) && !owned.has(id)) throw new Error(`refusing to change role "${role.name}": not a suite role`);
  return role;
}

/** The UpdateRole body of `role` with `changes` over it. */
export function updateRoleBodyOf(role: RoleRecord, changes: Partial<RoleBody> = {}): RoleBody & { id: string; concurrencyStamp: string } {
  return {
    name: role.name,
    arabicName: role.arabicName,
    englishDescription: role.englishDescription ?? '',
    arabicDescription: role.arabicDescription ?? '',
    isActive: role.isActive,
    hasAssignedPayers: role.hasAssignedPayers,
    canApproveOwnRequests: role.canApproveOwnRequests,
    selectedPermissionIds: role.selectedPermissionIds ?? [],
    assignableRoleIds: role.assignableRoleIds ?? [],
    ...changes,
    id: role.id,
    concurrencyStamp: role.concurrencyStamp,
  };
}

/** PUT UpdateRole on a SUITE role with `changes` (GetRole first for the stamp). Rights reach signed-in holders at once. */
export async function updateSuiteRole(page: Page, id: string, changes: Partial<RoleBody>, owned?: ReadonlySet<string>): Promise<RoleApiAnswer> {
  const role = await assertSuiteRole(page, id, owned);
  if (changes.name !== undefined && !isSuiteRoleName(changes.name) && !owned?.has(id)) throw new Error(`refusing to rename a suite role to "${changes.name}" (outside the suite prefix the teardown could not find it)`);
  const res = await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.roleUpdateIdentity, updateRoleBodyOf(role, changes));
  Logger.step(`[roleApi] UpdateRole "${role.name}" (${Object.keys(changes).join(', ')}) answered ${res.status}`);
  return res;
}

/** PUT UpdateRole replacing the rights (permission KEYS) of a suite role. */
export async function setSuiteRoleRights(page: Page, id: string, keys: readonly string[], owned?: ReadonlySet<string>): Promise<RoleApiAnswer> {
  return updateSuiteRole(page, id, { selectedPermissionIds: await permissionIdsByKeys(page, keys) }, owned);
}

/** POST SetActive on a suite role. Deactivation needs a reason (default Other + details). */
export async function setSuiteRoleActive(
  page: Page,
  id: string,
  isActive: boolean,
  reason: RoleDeactivationReasonKey = 'other',
  details: string | null = 'Deactivated by the automation suite.',
  owned?: ReadonlySet<string>,
): Promise<RoleApiAnswer> {
  await assertSuiteRole(page, id, owned);
  return NetworkUtils.requestAsSession(page, 'POST', ROLE_API.setActive, {
    id,
    isActive,
    inactivationReasonId: isActive ? null : ROLE_DEACTIVATION_REASON[reason].id,
    inactivationDetails: isActive ? null : details,
  });
}

/** DELETE DeleteRole on a suite role (holders must be gone first). */
export async function deleteSuiteRole(page: Page, id: string, owned?: ReadonlySet<string>): Promise<RoleApiAnswer> {
  await assertSuiteRole(page, id, owned);
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.roleDelete}?id=${encodeURIComponent(id)}`);
}

/**
 * A raw request AS THE GIVEN SESSION against a SUITE role - for "a holder without the right is refused"
 * cases (the caller's page is the holder's). The target is checked through `adminPage` first, so even an
 * accepted request can only ever touch a suite role.
 */
export async function attemptOnSuiteRole(
  adminPage: Page,
  sessionPage: Page,
  id: string,
  action: 'update' | 'deactivate' | 'activate' | 'delete' | 'read',
  owned?: ReadonlySet<string>,
): Promise<RoleApiAnswer> {
  const role = await assertSuiteRole(adminPage, id, owned);
  switch (action) {
    case 'read':
      return NetworkUtils.requestAsSession(sessionPage, 'POST', ApiEndpoints.roleGet, { id });
    case 'update':
      return NetworkUtils.requestAsSession(sessionPage, 'PUT', ApiEndpoints.roleUpdateIdentity, updateRoleBodyOf(role, { englishDescription: `Changed by a refused session ${userStamp()}` }));
    case 'deactivate':
      return NetworkUtils.requestAsSession(sessionPage, 'POST', ROLE_API.setActive, { id, isActive: false, inactivationReasonId: ROLE_DEACTIVATION_REASON.other.id, inactivationDetails: 'Refused-session attempt' });
    case 'activate':
      return NetworkUtils.requestAsSession(sessionPage, 'POST', ROLE_API.setActive, { id, isActive: true, inactivationReasonId: null, inactivationDetails: null });
    case 'delete':
      return NetworkUtils.requestAsSession(sessionPage, 'DELETE', `${ApiEndpoints.roleDelete}?id=${encodeURIComponent(id)}`);
    default:
      throw new Error(`unknown action ${String(action)}`);
  }
}

// ---- user role assignment -----------------------------------------------------------------

/**
 * Gives a SUITE user exactly `roles` (PUT UpdateUser, the Edit User drawer's call). The second user goes
 * through the roleHolder fixture, never through here.
 */
export async function assignRolesToSuiteUser(page: Page, userId: string, roles: RoleAssignment[]): Promise<UserAnswer> {
  const record = await readUser(page, userId);
  if (!isSuiteUser(record)) throw new Error(`refusing to change the roles of ${record.email}: not a suite user`);
  if (record.email.toLowerCase() === env.nonAdminUsername.toLowerCase()) throw new Error('the second user is reshaped only by the roleHolder fixture');
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.userUpdate, updateBodyOf(record, { assignedRoles: roles }));
}
