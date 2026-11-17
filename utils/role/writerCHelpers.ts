import { test as base, expect } from '@playwright/test';
import type { Locator, Page, Response } from '@playwright/test';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage, RoleRowView, RowActionView } from '../../pages/role/RoleAdministrationPage';
import type { NodeState } from '../../pages/role/PermissionTree';
import { UserListPage } from '../../pages/user/UserListPage';
import type { UserFormDrawer, UserSaveAnswer } from '../../pages/user/UserFormDrawer';
import { InvitationListPage } from '../../pages/user/InvitationListPage';
import { clickDialogAction, readDialog } from '../../pages/user/userCommon';
import { ApprovalManagementPage } from '../../pages/approval/ApprovalManagementPage';
import { PayerScopeDialog } from '../../pages/components/PayerScopeDialog';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { env } from '../../constants/EnvironmentConfig';
import { Timeouts } from '../../constants/Timeouts';
import { ROLE_CARD, ROLE_DIALOG, ROLE_FORM_IDS, ROLE_TOAST } from '../../constants/role/roleIds';
import { buttonSelector } from '../../constants/ElementIds';
import { toastAfter } from '../../pages/role/RoleDeactivateDrawer';
import { WRITER_C_AUDIT_MODULES, WRITER_C_HOME, WRITER_C_NAV, WRITER_C_USERS, type AuditTabModule } from '../../constants/role/writerCIds';
import { PREDEFINED_ROLE_NAMES, ROLE_TOGGLE_LABEL } from '../../data/role/common.data';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import {
  approvePending,
  deleteNetworkById,
  pendingRequestId,
  provisionNetwork,
} from '../NetworkProvisioning';
import {
  isSuiteUser,
  listUsers,
  payerDropdown,
  readUser,
  readUserOrNull,
  suiteUserDisplayName,
  suiteUserEmail,
  suiteUserLastName,
  updateBodyOf,
  userStamp,
  type ProvisionedUser,
  type UserRecord,
} from '../UserProvisioning';
import { drawerUser, passContact, passUserInfo } from '../user/writerBHelpers';
import {
  allRoles,
  answerMessage,
  currentRolesAndPermissions,
  listRolesPage,
  readPermissionCatalogue,
  readRole,
  updateRoleBodyOf,
  type RoleApiAnswer,
  type RoleBody,
  type RoleRecord,
} from './roleApi';

/**
 * Writer C helpers - Role Management folders 02 (System Administrator Role), 12 (Prevent Changes to Predefined
 * and System Roles), 13 (Activate and Deactivate Role), 14 (Delete Role). Readers and small actions on top of the
 * lead's role page objects (pages/role/*) and the User module's page objects; NOTHING here asserts - each
 * returns what the screen / server showed, so the spec asserts what ITS case expects.
 *
 * SAFETY: no helper writes to a predefined role, another person's role or the careconnect account, EXCEPT the
 * three `attempt...` functions at the bottom, which the specs call only through `gated()` behind a folder's
 * API_WRITE_GATE (false by default) and which put the captured original back at once if a write is accepted.
 */

// ---------------------------------------------------------------- text

/** Whitespace collapsed and every dash normalised to "-" (lead decision 3). */
export function normText(text: string): string {
  return text.replace(/[‒–—―−]/g, '-').replace(/\s+/g, ' ').trim();
}

/** normText without the dash BETWEEN a toast's summary and detail ("A — B" -> "A B"). */
export function sepless(text: string): string {
  return normText(text).replace(/ - /g, ' ');
}

// ---------------------------------------------------------------- BLOCKED (lead decision 8)

/**
 * Marks the case BLOCKED - unless an earlier step already FAILED: then the finding stays visible (the case ends
 * FAIL) and the reason is kept as a note. Same idea as utils/settings/writerBHelpers.ts `blockUnlessAStepFailed`.
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = base.info();
  if (info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `This step could not be observed either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/** blockUnlessAStepFailed when `condition` holds (a run-time precondition that turned out absent). */
export function blockWhen(steps: TestSteps, condition: boolean, reason: string): void {
  if (condition) blockUnlessAStepFailed(steps, reason);
}

/** A folder's API write gate (data file). */
export interface WriteGate {
  allowed: boolean;
  reason: string;
}

/**
 * Runs `attempt` only when the gate is open; otherwise BLOCKS the case (or, after an earlier failure, notes
 * it and answers null so the finding stays a FAIL).
 */
export async function gated<T>(steps: TestSteps, gate: WriteGate, attempt: () => Promise<T>): Promise<T | null> {
  if (!gate.allowed) {
    blockUnlessAStepFailed(steps, gate.reason);
    return null;
  }
  return attempt();
}

// ---------------------------------------------------------------- role list readers

/** A table row with its actions. */
export interface RowWithActions extends RoleRowView {
  actions: RowActionView[];
}

/** One action's view on a row ('absent' when the row does not render it). */
export function actionOf(row: { actions: RowActionView[] }, action: RowActionView['action']): { present: boolean; enabled: boolean; label: string } {
  const a = row.actions.find((x) => x.action === action);
  return a ? { present: true, enabled: a.enabled, label: a.label } : { present: false, enabled: false, label: '' };
}

/** Waits until the rows on screen are the rows of `answerIds` (page change re-render). */
async function rowsSettledTo(roleAdmin: RoleAdministrationPage, answerIds: string[]): Promise<void> {
  await expect.poll(async () => (await roleAdmin.rowIds()).join(','), { timeout: Timeouts.default }).toBe(answerIds.slice(0, 10).join(',')).catch(() => undefined);
}

/**
 * Opens the list (table) and reads EVERY row of EVERY page with its actions, walking the pager with Next.
 * Returns the rows plus the GetRoles totals of the first answer.
 */
export async function allTableRows(roleAdmin: RoleAdministrationPage): Promise<{ rows: RowWithActions[]; totalRows: number; totalPages: number; apiNames: string[] }> {
  const first = await roleAdmin.open();
  const rows: RowWithActions[] = [];
  const apiNames: string[] = first.items.map((r) => r.name);
  const read = async (): Promise<void> => {
    for (const id of await roleAdmin.rowIds()) rows.push({ ...(await roleAdmin.readRow(id)), actions: await roleAdmin.rowActions(id) });
  };
  await rowsSettledTo(roleAdmin, first.items.map((r) => r.id));
  await read();
  for (let p = 2; p <= first.totalPages; p += 1) {
    const answer = await roleAdmin.nextPage();
    apiNames.push(...answer.items.map((r) => r.name));
    await rowsSettledTo(roleAdmin, answer.items.map((r) => r.id));
    await read();
  }
  return { rows, totalRows: first.totalRows, totalPages: first.totalPages, apiNames };
}

/** Switches to Cards, runs `fn`, and ALWAYS switches back to the table (the view is a server-side preference). */
export async function inCardsView<T>(roleAdmin: RoleAdministrationPage, fn: () => Promise<T>): Promise<T> {
  await roleAdmin.switchToCards();
  try {
    return await fn();
  } finally {
    await roleAdmin.switchToTable();
  }
}

/** The cards on screen: id, the name value and the actions present. */
export async function cardsOnScreen(roleAdmin: RoleAdministrationPage): Promise<{ id: string; name: string; title: string; actions: { action: string; enabled: boolean }[] }[]> {
  const out: { id: string; name: string; title: string; actions: { action: string; enabled: boolean }[] }[] = [];
  for (const id of await roleAdmin.cardIds()) {
    out.push({
      id,
      name: normText(await roleAdmin.el(ROLE_CARD.name(id)).innerText().catch(() => '')),
      title: normText(await roleAdmin.el(ROLE_CARD.title(id)).innerText().catch(() => '')),
      actions: await roleAdmin.cardActions(id),
    });
  }
  return out;
}

/** Searches `term` in Cards view and returns the cards shown (table restored afterwards). */
export async function cardsForSearch(roleAdmin: RoleAdministrationPage, term: string): Promise<{ id: string; name: string; title: string; actions: { action: string; enabled: boolean }[] }[]> {
  return inCardsView(roleAdmin, async () => {
    await roleAdmin.search(term);
    return cardsOnScreen(roleAdmin);
  });
}

/** Ids of the listed predefined roles by name (GetRoles; '' when a name is not listed). */
export async function predefinedIds(page: Page): Promise<Record<string, string>> {
  const listed = await allRoles(page);
  return Object.fromEntries(PREDEFINED_ROLE_NAMES.map((n) => [n, listed.find((r) => r.name === n)?.id ?? '']));
}

/** Each predefined role's table row (searched by name): badge, status and actions. */
export async function predefinedRows(roleAdmin: RoleAdministrationPage, page: Page): Promise<Record<string, RowWithActions | null>> {
  const ids = await predefinedIds(page);
  const out: Record<string, RowWithActions | null> = {};
  for (const name of PREDEFINED_ROLE_NAMES) {
    const id = ids[name];
    await roleAdmin.search(name);
    out[name] = id && (await roleAdmin.row(id).count()) > 0 ? { ...(await roleAdmin.readRow(id)), actions: await roleAdmin.rowActions(id) } : null;
  }
  return out;
}

/** Each predefined role's card (searched by name in Cards view; table restored): actions present. */
export async function predefinedCards(roleAdmin: RoleAdministrationPage, page: Page): Promise<Record<string, { listed: boolean; actions: { action: string; enabled: boolean }[] }>> {
  const ids = await predefinedIds(page);
  return inCardsView(roleAdmin, async () => {
    const out: Record<string, { listed: boolean; actions: { action: string; enabled: boolean }[] }> = {};
    for (const name of PREDEFINED_ROLE_NAMES) {
      await roleAdmin.search(name);
      const listed = (await roleAdmin.cardIds()).includes(ids[name]);
      out[name] = { listed, actions: listed ? await roleAdmin.cardActions(ids[name]) : [] };
    }
    return out;
  });
}

/** Closes whatever the role screen opened (drawer / dialog) WITHOUT confirming anything. */
async function closeAnythingOpen(roleAdmin: RoleAdministrationPage): Promise<void> {
  if (await roleAdmin.deactivate.isOpen()) await roleAdmin.deactivate.cancel().catch(() => undefined);
  if (await roleAdmin.dialog.isOpen()) await roleAdmin.dialog.cancel().catch(() => undefined);
  if (await roleAdmin.form.isOpen()) await roleAdmin.form.close('x').catch(() => '');
}

/**
 * A REAL mouse click on a control (force: the actionability check would refuse a disabled one) and whether
 * anything opened. Whatever opened is closed again unconfirmed - nothing is ever saved, toggled or deleted.
 * NOT `dispatchEvent('click')`: a synthetic event reaches the Angular handler even on a `<button disabled>`
 * (probe 2026-11-15: the dispatched click opened "Delete Role" / the Deactivate drawer of Payer Officer, while
 * a real click - force click or mouse at its centre - opened nothing), so it is no user's attempt (22141, 22147).
 */
export async function pokeControl(roleAdmin: RoleAdministrationPage, target: Locator): Promise<{ present: boolean; enabled: boolean; opened: boolean }> {
  if ((await target.count()) === 0) return { present: false, enabled: false, opened: false };
  const enabled = await target.isEnabled();
  await target.click({ force: true, timeout: Timeouts.short }).catch((e: unknown) => Logger.warn(`[writerC] click on a control failed: ${String(e).split('\n')[0]}`));
  const opened = await roleAdmin.somethingOpened(Timeouts.short);
  if (opened) await closeAnythingOpen(roleAdmin);
  return { present: true, enabled, opened };
}

// ---------------------------------------------------------------- predefined Edit / privileges

/** Opens Edit on a listed role (searched by name), Next to Privileges; reads the lock state. Nothing is saved. */
export async function openEditToPrivileges(roleAdmin: RoleAdministrationPage, page: Page, id: string, name: string): Promise<{
  title: string;
  note: string;
  fieldsDisabled: Record<string, boolean>;
  step: 1 | 2;
  rows: number;
  disabledRows: number;
  privilegesNote: boolean;
}> {
  await roleAdmin.open();
  await roleAdmin.search(name);
  const form = await roleAdmin.openEdit(id);
  const title = await form.title();
  const note = normText(await form.predefinedNote().innerText().catch(() => ''));
  const fieldsDisabled = await form.disabledFields();
  const step = await form.next();
  let rows = 0;
  let disabledRows = 0;
  if (step === 2) {
    await form.tree.expandAll();
    const read = await form.tree.readRows();
    rows = read.length;
    disabledRows = read.filter((r) => r.disabled).length;
  }
  const drawerText = normText(await page.locator(`#${ROLE_FORM_IDS.root}`).innerText().catch(() => ''));
  return { title, note, fieldsDisabled, step, rows, disabledRows, privilegesNote: drawerText.includes('The privileges of a predefined role are part of the product and cannot be changed.') };
}

/**
 * A ticked and an unticked privilege (both LEAVES) of the role on the open Privileges step, given a REAL mouse
 * click each (force: the box is disabled). The state is the native checkbox's own `checked` - it holds for the
 * PrimeNG tree of the run and for the `pbm-checkbox` tree deployed by 2026-11-15. A dispatched DOM click is not
 * used: it flips even a disabled native input (probe 2026-11-15), which no user can do (22117).
 */
export async function pokePrivileges(roleAdmin: RoleAdministrationPage, page: Page, roleId: string, unheldKey: string): Promise<{ key: string; before: NodeState; after: NodeState }[]> {
  const catalogue = await readPermissionCatalogue(page, roleId);
  const heldLeaf = catalogue.selected.map((s) => catalogue.byKey.get(s.key)).find((n) => n && !n.hasChildren && !(n.permissions?.length));
  const keys = [heldLeaf?.key ?? '', unheldKey].filter(Boolean);
  const tree = roleAdmin.form.tree;
  const out: { key: string; before: NodeState; after: NodeState }[] = [];
  for (const key of keys) {
    const box = (await tree.rowOf(key)).locator('input[type="checkbox"]').first();
    const state = async (): Promise<NodeState> => ((await box.isChecked()) ? 'checked' : 'unchecked');
    const before = await state();
    await box.click({ force: true, timeout: Timeouts.short }).catch((e: unknown) => Logger.warn(`[writerC] click on "${key}" failed: ${String(e).split('\n')[0]}`));
    await page.waitForTimeout(500);
    out.push({ key, before, after: await state() });
  }
  return out;
}

/** Closes the role drawer (X, discarding a guard if one shows) and answers the role's concurrency stamp. */
export async function closeFormAndStamp(roleAdmin: RoleAdministrationPage, page: Page, id: string): Promise<{ guard: string; stamp: string }> {
  const guard = await roleAdmin.form.close('x');
  return { guard, stamp: (await readRole(page, id))?.concurrencyStamp ?? '' };
}

// ---------------------------------------------------------------- the System Administrator account

export interface AdminAccount {
  id: string;
  email: string;
  /** The names the account carries (first / full / e-mail). */
  names: string[];
  /** Session role names (GetCurrentUserRolesAndPermissions). */
  roles: string[];
  permissions: string[];
  /** GetUser isActive (null when GetUser answered nothing). */
  isActive: boolean | null;
  /** GetCurrentUser answer status (200 = the account works). */
  sessionStatus: number;
  record: UserRecord | null;
}

/** The signed-in account of `page` (careconnect on the admin page) - read only. */
export async function readAdminAccount(page: Page): Promise<AdminAccount> {
  const me = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.manageCurrentUser);
  let payload: Record<string, unknown> = {};
  try {
    payload = ((JSON.parse(me.text) as { payload?: Record<string, unknown> }).payload ?? {});
  } catch {
    /* non-JSON */
  }
  const perms = await currentRolesAndPermissions(page);
  const id = String(payload.id ?? '');
  const record = id ? await readUserOrNull(page, id) : null;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const names = [str(payload.email), str(payload.userName), str(payload.fullEnglishName), `${str(payload.englishFirstName)} ${str(payload.englishLastName)}`.trim(), record?.fullEnglishName ?? '']
    .filter((n) => n !== '');
  return {
    id,
    email: str(payload.email) || record?.email || env.adminUsername,
    names: [...new Set(names)],
    roles: perms.roles,
    permissions: perms.permissions,
    isActive: record ? record.isActive : null,
    sessionStatus: me.status,
    record,
  };
}

/** Whether the account still works and is active (GetUser isActive, else the session answering 200). */
export function accountActive(account: AdminAccount): boolean {
  return account.sessionStatus === 200 && account.isActive !== false;
}

/** The id of the account's role named `roleName` ('' when GetUser does not show it). */
export function adminRoleIdOf(account: AdminAccount, roleName: string): string {
  return account.record?.assignedRoles.find((r) => r.name === roleName)?.id ?? '';
}

export type ActionAvailability = 'absent' | 'disabled' | 'available';

/**
 * Users Administration as careconnect: is the admin account listed (GetUsers, all users and by its e-mail), is
 * its row shown after a search for its e-mail, and which row actions does that row offer (absent when no row).
 */
export async function adminInUsersAdministration(page: Page, admin: AdminAccount): Promise<{
  apiListed: boolean;
  searchListed: boolean;
  rowShown: boolean;
  totalUsers: number;
  actions: Record<'edit' | 'delete' | 'toggleActivation' | 'assign', ActionAvailability>;
}> {
  const all = await listUsers(page, {}, 1000);
  const list = new UserListPage(page);
  await list.openTable();
  const answer = await list.searchFor(admin.email);
  const rowShown = await list.isRowShownById(admin.id);
  const actions = {} as Record<'edit' | 'delete' | 'toggleActivation' | 'assign', ActionAvailability>;
  for (const a of ['edit', 'delete', 'toggleActivation', 'assign'] as const) actions[a] = (await list.getActionState(admin.id, a)).availability;
  return {
    apiListed: all.items.some((u) => u.id === admin.id),
    searchListed: answer.items.some((u) => u.id === admin.id),
    rowShown,
    totalUsers: all.totalRows,
    actions,
  };
}

/** Ids of Users Administration elements that look like a bulk action (none exist on 2026-11-08). */
export async function bulkActionIds(page: Page): Promise<string[]> {
  const list = new UserListPage(page);
  await list.openTable();
  return page.locator(`#${WRITER_C_USERS.root} [id*="${WRITER_C_USERS.bulkIdFragment}"]`).evaluateAll((els) => els.map((e) => e.id));
}

// ---------------------------------------------------------------- Users Administration / Invitations

/**
 * Closes the user drawer, discarding an Unsaved Changes guard if one shows. `afterSave`: a successful Save
 * slides the drawer out by itself - its X still reads visible mid-animation and the click then timed out
 * (22118 / 22119 / 22151, full run 2026-11-14), so wait for that first and tolerate the X vanishing.
 */
async function closeUserDrawer(page: Page, drawer: UserFormDrawer, afterSave = false): Promise<void> {
  if (afterSave && (await drawer.waitForClosed(Timeouts.short))) return;
  if (!(await drawer.isOpen())) return;
  const guard = await drawer.close().catch(async (error: unknown) => {
    if (await drawer.waitForClosed(Timeouts.short)) return null;
    throw error;
  });
  if (guard) await drawer.discardChanges();
  await drawer.waitForClosed(Timeouts.default);
  if (await page.locator(`#${ROLE_DIALOG.root}`).isVisible().catch(() => false)) await clickDialogAction(page, 'discard').catch(() => undefined);
}

/** The Role options Users Administration > Assign Roles & Payers offers for a NEW card on `user` (closed unsaved). */
export async function roleOptionsInAssign(page: Page, user: ProvisionedUser): Promise<string[]> {
  const list = new UserListPage(page);
  await list.openTable();
  await list.revealRow(user.displayNameEn);
  const drawer = await list.openAssign(user.id);
  await drawer.addRoleCard();
  const options = await drawer.getRoleOptions();
  await closeUserDrawer(page, drawer);
  return options;
}

/** The Role options of Invitations > Add Invitation (closed unsaved). */
export async function roleOptionsInInvitation(page: Page): Promise<string[]> {
  const list = new InvitationListPage(page);
  await list.openTable();
  const drawer = await list.openAddForm();
  const options = await drawer.getRoleOptions();
  await drawer.close();
  if ((await readDialog(page)).visible) await clickDialogAction(page, 'discard').catch(() => undefined);
  return options;
}

/** What a drawer Save answered, in a few words (no JSON). */
export function saidSave(answer: { status: number; text: string; messages: string[]; errors: string[] }): string {
  const text = answer.text ? answerMessage({ status: answer.status, text: answer.text }) : '';
  return `UpdateUser/CreateUser answered ${answer.status === -1 ? 'nothing (refused on screen)' : answer.status}${text ? ` "${text.slice(0, 200)}"` : ''}; messages [${answer.messages.join(' | ')}]; errors [${answer.errors.join(' | ')}]`;
}

/**
 * Assign Roles & Payers on a suite user: a new card with `roleName` (and `payerNames` through the picker), Save.
 * `offered` false = the role was not in the card's list (nothing saved).
 */
export async function assignThroughDrawer(page: Page, user: ProvisionedUser, roleName: string, roleId: string, payerNames: readonly string[] = []): Promise<UserSaveAnswer & { offered: boolean; options: string[] }> {
  const list = new UserListPage(page);
  await list.openTable();
  await list.revealRow(user.displayNameEn);
  const drawer = await list.openAssign(user.id);
  await drawer.addRoleCard();
  const options = await drawer.getRoleOptions();
  if (!options.includes(roleName)) {
    await closeUserDrawer(page, drawer);
    return { status: -1, text: '', body: {}, messages: [], errors: [`"${roleName}" is not offered`], offered: false, options };
  }
  await drawer.chooseRole(roleName);
  if (payerNames.length) await drawer.assignPayers(roleId, payerNames);
  const saved = await drawer.attemptSave();
  await closeUserDrawer(page, drawer, true);
  return { ...saved, offered: true, options };
}

/** Assign Roles & Payers on a suite user: removes the card of `removeRoleId`, adds `addRoleName`, Save. */
export async function replaceRoleThroughDrawer(page: Page, user: ProvisionedUser, removeRoleId: string, addRoleName: string): Promise<UserSaveAnswer> {
  const list = new UserListPage(page);
  await list.openTable();
  await list.revealRow(user.displayNameEn);
  const drawer = await list.openAssign(user.id);
  await drawer.removeRole(removeRoleId);
  await drawer.addRole(addRoleName);
  const saved = await drawer.attemptSave();
  await closeUserDrawer(page, drawer, true);
  return saved;
}

/** The roles on a user's record: role name -> payer ids (admin read). */
export async function rolesOnUser(page: Page, userId: string): Promise<Record<string, string[]>> {
  const rec = await readUserOrNull(page, userId);
  return Object.fromEntries((rec?.assignedRoles ?? []).map((r) => [r.name, r.assignedPayers.map((p) => p.id)]));
}

/** The names of `users` whose record (GetUser, admin read) holds `roleName` right now. */
export async function usersHoldingRole(page: Page, users: readonly { id: string; name: string }[], roleName: string): Promise<string[]> {
  const out: string[] = [];
  for (const u of users) if (roleName in (await rolesOnUser(page, u.id))) out.push(u.name);
  return out;
}

/**
 * Add User through the screen as `page`'s account: a valid suite user (qa.automation.* e-mail) with ONE role.
 * The user is handed to `adopt` (suiteUsers.adopt - deleted at teardown) whenever it was saved.
 */
export async function createUserThroughAddUser(page: Page, roleName: string, adopt: (email: string) => Promise<string>): Promise<{
  email: string;
  displayName: string;
  reached: number;
  save: UserSaveAnswer | null;
  userId: string;
  roles: Record<string, string[]>;
}> {
  const stamp = userStamp();
  const lastName = suiteUserLastName(stamp);
  const name = { lastName, displayNameEn: suiteUserDisplayName(lastName), email: suiteUserEmail(stamp) };
  const list = new UserListPage(page);
  await list.openTable();
  const drawer = await list.openAddForm();
  const user = await drawerUser(page, name);
  let reached = 1;
  let save: UserSaveAnswer | null = null;
  if (await passUserInfo(drawer, user)) {
    reached = 2;
    if (await passContact(drawer, user)) {
      reached = 3;
      await drawer.addRole(roleName);
      save = await drawer.attemptSave();
    }
  }
  await closeUserDrawer(page, drawer, save !== null).catch(() => undefined);
  const userId = save && save.status >= 200 && save.status < 300 ? await adopt(name.email).catch(() => '') : '';
  return { email: name.email, displayName: name.displayNameEn, reached, save, userId, roles: userId ? await rolesOnUser(page, userId) : {} };
}

/**
 * PUT UpdateUser AS `sessionPage` giving a SUITE user one more role (+ payers) - for the "refused" cases. The
 * target is read through `adminPage` and must be a suite user (never the second user, never careconnect).
 */
export async function attemptAssignAsSession(adminPage: Page, sessionPage: Page, userId: string, roleId: string, payerIds: readonly string[]): Promise<RoleApiAnswer> {
  const record = await readUser(adminPage, userId);
  if (!isSuiteUser(record)) throw new Error(`refusing to change the roles of ${record.email}: not a suite user`);
  if (record.email.toLowerCase() === env.nonAdminUsername.toLowerCase()) throw new Error('the second user is reshaped only by the roleHolder fixture');
  const roles = [...record.assignedRoles.map((r) => ({ roleId: r.id, payerIds: r.assignedPayers.map((p) => p.id) })), { roleId, payerIds: [...payerIds] }];
  return NetworkUtils.requestAsSession(sessionPage, 'PUT', ApiEndpoints.userUpdate, updateBodyOf(record, { assignedRoles: roles }));
}

/** The pending approval request of a suite user's change ('' when none) - looked up by display name, then e-mail. */
export async function pendingRequestForUser(page: Page, user: ProvisionedUser): Promise<string> {
  return (await pendingRequestId(page, user.displayNameEn)) || (await pendingRequestId(page, user.email));
}

// ---------------------------------------------------------------- payer scope

/** Whether a session is offered a payer (GetPayersDropdown) and finds it in the payer list (GetPayers; null = refused). */
export async function payerVisibility(page: Page, payer: { id: string; name: string }): Promise<{ inDropdown: boolean; inPayerList: boolean | null; listStatus: number }> {
  const dropdown = await payerDropdown(page);
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.payerList, { pageNumber: 1, rowsPerPage: 50, searchText: payer.name });
  let inPayerList: boolean | null = null;
  if (res.status < 300) {
    try {
      const items = (JSON.parse(res.text) as { payload?: { payers?: { items?: { id: string }[] } } }).payload?.payers?.items ?? [];
      inPayerList = items.some((p) => p.id === payer.id);
    } catch {
      inPayerList = null;
    }
  }
  return { inDropdown: dropdown.some((p) => p.id === payer.id), inPayerList, listStatus: res.status };
}

/** Payer ids a session is offered (GetPayersDropdown), sorted. */
export async function offeredPayerIds(page: Page): Promise<string[]> {
  return (await payerDropdown(page)).map((p) => p.id).sort();
}

// ---------------------------------------------------------------- Audit History tabs

export interface AuditTabObservation {
  module: string;
  recordId: string;
  adminLoaded: boolean;
  adminTab: boolean;
  holderLoaded: boolean;
  holderTab: boolean;
}

/** The first record id a session's list call answers ('' when none / refused). */
async function firstRecordId(page: Page, listCall: string): Promise<string> {
  const res = await NetworkUtils.postAsSession(page, listCall, { pageNumber: 1, rowsPerPage: 5 }).catch(() => null);
  if (!res || res.status >= 300) return '';
  try {
    const payload = (JSON.parse(res.text) as { payload?: Record<string, unknown> }).payload ?? {};
    const holder = Object.values(payload).find((v) => v && typeof v === 'object' && Array.isArray((v as { items?: unknown }).items)) as { items: { id?: string }[] } | undefined;
    return String(holder?.items[0]?.id ?? '');
  } catch {
    return '';
  }
}

/** Opens a detail route and reports whether its tab strip rendered and whether the audit tab is there. */
async function detailTabs(page: Page, mod: AuditTabModule, id: string, payerName?: string): Promise<{ loaded: boolean; audit: boolean }> {
  await page.goto(new URL(`${mod.detailRoute}/${id}`, env.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await new PayerScopeDialog(page).chooseIfAsked(payerName).catch(() => null);
  const loaded = await page.locator(`[id^="${mod.tabPrefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true, () => false);
  const audit = loaded && (await page.locator(`#${mod.auditTab}`).isVisible().catch(() => false));
  return { loaded, audit };
}

/**
 * For every module with an Audit History tab: the first record the HOLDER session lists, opened by careconnect
 * (baseline) and by the holder. Modules where the holder lists nothing are left out.
 */
export async function auditTabObservations(adminPage: Page, holderPage: Page, payerName?: string, modules: readonly AuditTabModule[] = WRITER_C_AUDIT_MODULES): Promise<AuditTabObservation[]> {
  const out: AuditTabObservation[] = [];
  for (const mod of modules) {
    const recordId = await firstRecordId(holderPage, mod.listCall);
    if (!recordId) {
      Logger.step(`[writerC] ${mod.module}: the holder lists no record - skipped`);
      continue;
    }
    const admin = await detailTabs(adminPage, mod, recordId);
    const holder = await detailTabs(holderPage, mod, recordId, payerName);
    out.push({ module: mod.module, recordId, adminLoaded: admin.loaded, adminTab: admin.audit, holderLoaded: holder.loaded, holderTab: holder.audit });
  }
  return out;
}

// ---------------------------------------------------------------- home page

/** The home page as the session sees it: the welcome card, every other id in the outlet, the Dashboard calls. */
export async function homePageView(page: Page): Promise<{ path: string; welcome: boolean; otherIds: string[]; dashboardCalls: { path: string; status: number }[] }> {
  const calls: { path: string; status: number }[] = [];
  const onResponse = (r: Response): void => {
    if (r.url().includes(WRITER_C_HOME.dashboardApi)) calls.push({ path: new URL(r.url()).pathname, status: r.status() });
  };
  page.on('response', onResponse);
  try {
    await page.goto(new URL(WRITER_C_HOME.route, env.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.locator(`#${WRITER_C_HOME.outlet}`).waitFor({ state: 'visible', timeout: Timeouts.navigation }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: Timeouts.default }).catch(() => undefined);
    await page.waitForTimeout(1_500);
    const welcome = await page.locator(`#${WRITER_C_HOME.welcomeCard}`).isVisible().catch(() => false);
    const ids = await page.locator(`#${WRITER_C_HOME.outlet} [id]`).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.id)).catch(() => [] as string[]);
    return { path: new URL(page.url()).pathname, welcome, otherIds: ids.filter((id) => !id.startsWith(WRITER_C_HOME.welcomePrefix)), dashboardCalls: calls };
  } finally {
    page.off('response', onResponse);
  }
}

// ---------------------------------------------------------------- approval requests (suite network)

/** A suite network ("Automation Network ...") on `payerId`, created and SUBMITTED by `page`'s session (pending). */
export async function submitSuiteNetworkAs(page: Page, payerId: string): Promise<{ id: string; name: string }> {
  const made = await provisionNetwork(page, { payerId, submitOnly: true });
  return { id: made.id, name: made.name };
}

/** The approval request row of `requestId` (GetApprovals): its status ('' when not found). */
export async function approvalStatusOf(page: Page, requestId: string): Promise<string> {
  for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
    const res = await NetworkUtils.postAsSession(page, ApiEndpoints.approvalList, { pageNumber, rowsPerPage: 200 });
    let rows: Record<string, unknown>[] = [];
    try {
      const body = JSON.parse(res.text) as { payload?: Record<string, { items?: Record<string, unknown>[] }> };
      rows = Object.values(body.payload ?? {}).find((v) => Array.isArray(v?.items))?.items ?? [];
    } catch {
      rows = [];
    }
    const row = rows.find((r) => String(r.id) === requestId);
    if (row) return String(row.status ?? '');
    if (rows.length < 200) break;
  }
  return '';
}

/** Approve on the submitter's own queue row: absent / disabled / available, or 'not in queue'. */
export async function approveOfferedTo(page: Page, entityName: string): Promise<ActionAvailability | 'not in queue'> {
  const approvals = new ApprovalManagementPage(page, 'network');
  await approvals.openHub();
  await approvals.openTab('network');
  return approvals.getRowActionAvailability(entityName, 'approve').catch(() => 'not in queue' as const);
}

/** POST ApproveRequest as `page`'s session. */
export async function approveRequestAs(page: Page, requestId: string): Promise<RoleApiAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.approvalApprove, { id: requestId });
}

/** Teardown of the suite network: delete it as careconnect and approve a staged deletion (best effort). */
export async function discardSuiteNetwork(page: Page, network: { id: string; name: string }): Promise<void> {
  if (!network.id || !network.name.startsWith('Automation Network')) return;
  await deleteNetworkById(page, network.id).catch(() => undefined);
  await approvePending(page, network.name).catch(() => undefined);
}

// ---------------------------------------------------------------- 22153: delete after a list action

export interface DeletionObservation {
  action: string;
  deleted: string;
  targetOnScreen: boolean;
  status: number | null;
  toast: string;
  /** Suite-role ids of THIS case on screen after the deletion. */
  ownOnScreen: string[];
  /** The ids the screen shows vs the GetRoles answer the deletion reload rendered. */
  screenIds: string[];
  reloadIds: string[];
  reloadTotal: number;
  reloadPages: number;
  pagerPages: number[];
  /** GetRoles with the token: ids. */
  apiIds: string[];
}

/** Runs a list action (search / sort / advance filter / direction), then deletes `target` through the dialog. */
export async function listActionThenDelete(roleAdmin: RoleAdministrationPage, page: Page, action: string, token: string, target: { id: string; name: string }, ownIds: readonly string[]): Promise<DeletionObservation> {
  if (action === 'search') await roleAdmin.search(token);
  else if (action === 'sort') await roleAdmin.sortBy('rolename');
  else if (action === 'filter') await roleAdmin.filter({ name: token });
  else await roleAdmin.toggleSortDirection();
  await roleAdmin.waitForRows();
  let targetOnScreen = (await roleAdmin.rowIds()).includes(target.id);
  if (!targetOnScreen) {
    await roleAdmin.search(token);
    targetOnScreen = (await roleAdmin.rowIds()).includes(target.id);
  }
  // toastAfter() reads the toast whose TEXT is new; the previous deletion's identical "Role deleted" toast still
  // on screen hid this one (22153: deletions 2 and 4 read "" while the toast showed) - let it go first.
  await expect.poll(async () => page.locator(`#${ROLE_TOAST.root}`).filter({ visible: true }).count(), { timeout: Timeouts.toast + Timeouts.short }).toBe(0).catch(() => undefined);
  const dialog = await roleAdmin.openDelete(target.id);
  let outcome: { status: number | null; toast: string } = { status: null, toast: '' };
  const reload = await roleAdmin.listAnswerDuring(async () => {
    outcome = await dialog.confirmDelete();
  }).catch(() => null);
  await expect(roleAdmin.row(target.id)).toHaveCount(0, { timeout: Timeouts.default }).catch(() => undefined);
  if (reload) await rowsSettledTo(roleAdmin, reload.items.map((r) => r.id));
  const screenIds = await roleAdmin.rowIds();
  const pager = await roleAdmin.pagerState().catch(() => ({ prevEnabled: false, nextEnabled: false, pages: [] as number[] }));
  const api = await listRolesPage(page, { searchText: token });
  return {
    action,
    deleted: target.name,
    targetOnScreen,
    status: outcome.status,
    toast: outcome.toast,
    ownOnScreen: screenIds.filter((id) => ownIds.includes(id)),
    screenIds,
    reloadIds: (reload?.items ?? []).slice(0, 10).map((r) => r.id),
    reloadTotal: reload?.totalRows ?? -1,
    reloadPages: reload?.totalPages ?? -1,
    pagerPages: pager.pages,
    apiIds: api.items.map((r) => r.id),
  };
}

/** The delete dialog's message: its text and whether it renders whole (no clipping / ellipsis). */
export async function dialogMessageFits(page: Page): Promise<{ text: string; fits: boolean; overflow: string }> {
  return page.locator(`#${ROLE_DIALOG.message}`).evaluate((e) => {
    const el = e as HTMLElement;
    const style = getComputedStyle(el);
    return {
      text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
      fits: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
      overflow: `${style.textOverflow}/${style.overflow}/${style.whiteSpace}`,
    };
  });
}

/** A name of exactly `length` characters starting with `base` (a suite role name). */
export function padName(base: string, length: number): string {
  return `${base} ${'x'.repeat(Math.max(0, length))}`.slice(0, length);
}

// ---------------------------------------------------------------- gated write attempts (API_WRITE_GATE only)

/** Same names / roles / state before and after (a user record). */
function sameUser(a: UserRecord | null, b: UserRecord | null): boolean {
  if (!a || !b) return false;
  const key = (u: UserRecord): string => [u.email, u.fullEnglishName, u.fullArabicName, u.isActive, u.phoneNumber, u.assignedRoles.map((r) => r.id).sort().join(',')].join('|');
  return key(a) === key(b);
}

/**
 * GATED (folder 02). PUT UpdateUser for careconnect carrying its OWN record unchanged (a no-op "forced edit").
 * Answers the status / message and whether the record reads the same afterwards.
 */
export async function attemptNoopAdminUserUpdate(page: Page, admin: AdminAccount): Promise<{ status: number; message: string; unchanged: boolean }> {
  const before = await readUserOrNull(page, admin.id);
  if (!before) return { status: 0, message: `GetUser ${admin.id} answered nothing - no attempt sent`, unchanged: true };
  const res = await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.userUpdate, updateBodyOf(before));
  const after = await readUserOrNull(page, admin.id);
  return { status: res.status, message: answerMessage(res), unchanged: sameUser(before, after) };
}

/** Puts a role's captured fields back (UpdateRole with the current stamp). */
async function restoreRole(page: Page, original: RoleRecord): Promise<boolean> {
  const current = await readRole(page, original.id);
  if (!current) return false;
  const res = await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.roleUpdateIdentity, updateRoleBodyOf(current, {
    name: original.name,
    arabicName: original.arabicName,
    englishDescription: original.englishDescription ?? '',
    arabicDescription: original.arabicDescription ?? '',
    isActive: original.isActive,
    hasAssignedPayers: original.hasAssignedPayers,
    canApproveOwnRequests: original.canApproveOwnRequests,
    selectedPermissionIds: original.selectedPermissionIds ?? [],
    assignableRoleIds: original.assignableRoleIds ?? [],
  }));
  Logger.warn(`[writerC] Restored role "${original.name}" after an ACCEPTED write attempt: ${res.status}`);
  return res.status < 300;
}

const sameRole = (a: RoleRecord | null, b: RoleRecord | null): boolean =>
  !!a && !!b && a.name === b.name && a.arabicName === b.arabicName && [...(a.selectedPermissionIds ?? [])].sort().join(',') === [...(b.selectedPermissionIds ?? [])].sort().join(',');

/**
 * GATED (folders 02 / 12). ONE PUT UpdateRole on a protected role (`changes` over its own record). If the server
 * accepts and the role changed, the captured original is put back at once. Answers what happened.
 */
export async function attemptProtectedRoleUpdate(page: Page, roleId: string, changes: (role: RoleRecord) => Partial<RoleBody>): Promise<{ status: number; message: string; unchangedAfter: boolean; restored: boolean | null }> {
  const before = await readRole(page, roleId);
  if (!before) return { status: 0, message: `GetRole ${roleId} answered nothing - no attempt sent`, unchangedAfter: true, restored: null };
  const res = await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.roleUpdateIdentity, updateRoleBodyOf(before, changes(before)));
  const after = await readRole(page, roleId);
  const unchangedAfter = sameRole(before, after);
  const restored = unchangedAfter ? null : await restoreRole(page, before);
  return { status: res.status, message: answerMessage(res), unchangedAfter, restored };
}

/** Permission ids of `keys` (catalogue of `page`). */
export async function permissionIdsOf(page: Page, keys: readonly string[]): Promise<string[]> {
  const cat = await readPermissionCatalogue(page);
  return keys.map((k) => cat.byKey.get(k)?.id ?? '').filter(Boolean);
}

// ---------------------------------------------------------------- failure-message wording

/** A createUserThroughAddUser outcome in a few words. */
export function saidCreate(made: { email: string; reached: number; save: UserSaveAnswer | null; userId: string; roles: Record<string, string[]> }): string {
  const save = made.save ? saidSave(made.save) : `never reached Save (stopped on step ${made.reached})`;
  return `Add User for ${made.email}: ${save}; record ${made.userId || 'not found'} holds [${Object.keys(made.roles).join(', ')}]`;
}

/** A gated write outcome in a few words (null = not sent: the gate is closed). */
export function saidWrite(out: { status: number; message: string; restored?: boolean | null } | null, what: string): string {
  if (!out) return `${what}: not sent (API_WRITE_GATE closed)`;
  const restored = out.restored === undefined || out.restored === null ? '' : `; the original was put back: ${out.restored}`;
  return `${what} answered ${out.status} "${out.message}"${restored}`;
}

// ---------------------------------------------------------------- small readers for the specs

/** Per row: the state of one action ('not listed' when the row is missing). */
export function controlStates(rows: Record<string, RowWithActions | null>, action: RowActionView['action']): Record<string, ActionAvailability | 'not listed'> {
  const out: Record<string, ActionAvailability | 'not listed'> = {};
  for (const [name, row] of Object.entries(rows)) {
    const a = row ? actionOf(row, action) : null;
    out[name] = !a ? 'not listed' : !a.present ? 'absent' : a.enabled ? 'available' : 'disabled';
  }
  return out;
}

/** "name: state" for every entry whose state is not one of `allowed`. */
export function statesOutside(states: Record<string, string>, allowed: readonly string[]): string[] {
  return Object.entries(states).filter(([, s]) => !allowed.includes(s)).map(([n, s]) => `${n}: ${s}`);
}

/** Whether the side menu offers Users Management to the session (the page must be on the app). */
export async function usersMenuOffered(page: Page): Promise<boolean> {
  await page.locator(`#${WRITER_C_NAV.usersManagementToggle}`).waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  return page.locator(`#${WRITER_C_NAV.usersManagementToggle}`).isVisible().catch(() => false);
}

/**
 * Whether a payer-scoped role assignment landed: on the user's record (with the payer), or - when the change
 * went to approval - as a Pending request for the user ('' when none).
 */
export async function assignmentOutcome(page: Page, user: ProvisionedUser, roleName: string, payerId: string): Promise<{ onRecord: boolean; pendingId: string; roles: Record<string, string[]> }> {
  const roles = await rolesOnUser(page, user.id);
  const onRecord = (roles[roleName] ?? []).includes(payerId);
  return { onRecord, pendingId: onRecord ? '' : await pendingRequestForUser(page, user), roles };
}

/** A suite network submitted by `page`'s session, or BLOCKED (unless a step failed) when it cannot be built. */
export async function submitSuiteNetworkOrBlock(steps: TestSteps, page: Page, payerId: string): Promise<{ id: string; name: string }> {
  try {
    return await submitSuiteNetworkAs(page, payerId);
  } catch (error) {
    const reason = `a suite network submitted by the holder could not be built: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`;
    blockUnlessAStepFailed(steps, reason);
    throw new Error(reason);
  }
}

/** The audit observations that break the case: baseline missing, holder screen not loaded, or the tab shown. */
export function auditTabProblems(obs: readonly AuditTabObservation[]): string[] {
  return obs
    .filter((o) => !o.adminTab || !o.holderLoaded || o.holderTab)
    .map((o) => `${o.module} ${o.recordId}: careconnect sees the tab ${o.adminTab} (screen loaded ${o.adminLoaded}); Payer Officer screen loaded ${o.holderLoaded}, tab shown ${o.holderTab}`);
}

/** The sorted permission keys of a role ([] when `id` is '' - the role was never found). */
export async function rightsOfOrNone(page: Page, id: string): Promise<string[]> {
  if (!id) return [];
  return (await readPermissionCatalogue(page, id)).selected.map((s) => s.key).sort();
}

/**
 * For each predefined row (searched by name): a real (force) mouse click on its `action` control and whether
 * anything opened (whatever opened is closed unconfirmed).
 */
export async function pokePredefined(roleAdmin: RoleAdministrationPage, page: Page, action: RowActionView['action']): Promise<Record<string, { present: boolean; enabled: boolean; opened: boolean }>> {
  const ids = await predefinedIds(page);
  const out: Record<string, { present: boolean; enabled: boolean; opened: boolean }> = {};
  for (const name of PREDEFINED_ROLE_NAMES) {
    await roleAdmin.search(name);
    out[name] = await pokeControl(roleAdmin, roleAdmin.action(ids[name] || 'not-listed', action));
  }
  return out;
}

/** Non-predefined rows whose Activate / Inactivate control does not match the row's status (or is missing). */
export function toggleMismatches(rows: readonly RowWithActions[]): string[] {
  return rows
    .filter((r) => !r.predefined)
    .map((r) => ({ r, t: actionOf(r, 'toggle-active') }))
    .filter(({ r, t }) => !t.present || !t.enabled || t.label !== (r.status === 'Active' ? ROLE_TOGGLE_LABEL.inactivate : r.status === 'Inactive' ? ROLE_TOGGLE_LABEL.activate : '?'))
    .map(({ r, t }) => `${r.name} (${r.status}): ${t.present ? `"${t.label}"${t.enabled ? '' : ' disabled'}` : 'no control'}`);
}

/** Non-predefined rows that show a given action control (present at all). */
export function rowsShowing(rows: readonly RowWithActions[], action: RowActionView['action']): string[] {
  return rows.filter((r) => !r.predefined && actionOf(r, action).present).map((r) => r.name);
}

/** The deactivate drawer's Details box: value length and the details error after typing `text`. */
export async function typeDetails(roleAdmin: RoleAdministrationPage, text: string): Promise<{ value: string; error: string }> {
  const value = await roleAdmin.deactivate.fillDetails(text);
  return { value, error: await roleAdmin.deactivate.detailsError() };
}

/** A unique token for names that must find each other (22153). */
export function uniqueToken(): string {
  return userStamp();
}

/**
 * What is inconsistent after each deletion of 22153: the delete not accepted / no toast, the deleted role still
 * on screen or in GetRoles, a remaining role missing from GetRoles, the screen not showing what its own reload
 * answered, or the pager not matching the reload's page count.
 */
export function deletionProblems(observations: readonly DeletionObservation[], ownIds: readonly string[], deletedToast: string): string[] {
  const problems: string[] = [];
  observations.forEach((o, i) => {
    const deletedIds = ownIds.slice(0, i + 1);
    const remaining = ownIds.slice(i + 1);
    const tag = `deletion ${i + 1} after ${o.action}`;
    if (!o.targetOnScreen) problems.push(`${tag}: "${o.deleted}" was not on screen to delete`);
    if (o.status !== 200) problems.push(`${tag}: DeleteRole answered ${o.status}`);
    if (sepless(o.toast) !== sepless(deletedToast)) problems.push(`${tag}: toast "${o.toast}"`);
    const stale = [...o.screenIds, ...o.apiIds].filter((id) => deletedIds.includes(id));
    if (stale.length) problems.push(`${tag}: deleted role(s) still listed (${stale.length})`);
    const missing = remaining.filter((id) => !o.apiIds.includes(id));
    if (missing.length) problems.push(`${tag}: ${missing.length} remaining role(s) missing from GetRoles`);
    if (o.reloadTotal >= 0 && o.screenIds.join(',') !== o.reloadIds.join(',')) problems.push(`${tag}: the screen shows ${o.screenIds.length} rows, its reload answered ${o.reloadIds.length}`);
    if (o.reloadTotal < 0) problems.push(`${tag}: the list did not reload after the deletion`);
    const pagerOk = o.pagerPages.length === o.reloadPages || (o.reloadPages <= 1 && o.pagerPages.length <= 1);
    if (o.reloadTotal >= 0 && !pagerOk) problems.push(`${tag}: the pager shows ${o.pagerPages.length} page(s), the reload answered ${o.reloadPages} (${o.reloadTotal} rows)`);
  });
  return problems;
}

/** Rows whose Delete breaks "enabled on every non-predefined role, disabled / absent on the predefined ones". */
export function deleteControlProblems(rows: readonly RowWithActions[]): string[] {
  const stateOf = (d: { present: boolean; enabled: boolean }): string => (!d.present ? 'absent' : d.enabled ? 'enabled' : 'disabled');
  return rows
    .map((r) => ({ r, d: actionOf(r, 'delete') }))
    .filter(({ r, d }) => (r.predefined ? d.present && d.enabled : !(d.present && d.enabled)))
    .map(({ r, d }) => `${r.name}${r.predefined ? ' (predefined)' : ''}: ${stateOf(d)}`);
}

/** Predefined cards that present a Delete action (or are not listed at all). */
export function cardsPresentingDelete(cards: Record<string, { listed: boolean; actions: { action: string; enabled: boolean }[] }>): string[] {
  return Object.entries(cards)
    .filter(([, c]) => !c.listed || c.actions.some((a) => a.action === 'delete'))
    .map(([n, c]) => `card ${n}: ${c.listed ? 'Delete present' : 'not listed'}`);
}

/**
 * Yes on the open Delete dialog WITHOUT assuming it closes (a refused delete may keep it open - then it is
 * dismissed with No): the DeleteRole answer (null = nothing sent), its message and the new toast.
 */
export async function confirmDeleteTolerant(roleAdmin: RoleAdministrationPage, page: Page): Promise<{ status: number | null; apiMessage: string; toast: string; dialogStayed: boolean }> {
  const answer = page.waitForResponse((r) => r.url().includes(ApiEndpoints.roleDelete), { timeout: Timeouts.default }).catch(() => null as Response | null);
  let res: Response | null = null;
  const toast = await toastAfter(page, async () => {
    await page.locator(buttonSelector(ROLE_DIALOG.confirm)).first().click();
    res = await answer;
  });
  const dialogStayed = await roleAdmin.dialog.isOpen();
  if (dialogStayed) await roleAdmin.dialog.cancel().catch(() => undefined);
  if (!res) return { status: null, apiMessage: '', toast, dialogStayed };
  const r = res as Response;
  const text = await r.text().catch(() => '');
  return { status: r.status(), apiMessage: answerMessage({ status: r.status(), text }), toast, dialogStayed };
}
