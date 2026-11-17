import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { SuiteUsers } from '../../fixtures/roleModule.fixture';
import { UserListPage } from '../../pages/user/UserListPage';
import { InvitationListPage } from '../../pages/user/InvitationListPage';
import type { UserFormDrawer, UserSaveAnswer } from '../../pages/user/UserFormDrawer';
import { clickDialogAction, readDialog } from '../../pages/user/userCommon';
import { PayerManagementPage } from '../../pages/payer/PayerManagementPage';
import { ApprovalManagementPage, type ApprovalScope } from '../../pages/approval/ApprovalManagementPage';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AppRoutes } from '../../constants/AppRoutes';
import { env } from '../../constants/EnvironmentConfig';
import { Timeouts } from '../../constants/Timeouts';
import { USER_LIST, INVITATION_LIST } from '../../constants/user/userIds';
import { WRITER_E_NAV } from '../../constants/role/writerEIds';
import { GET_APPROVALS_ENDPOINT } from '../../data/networks/seedNetworks.data';
import { Logger } from '../Logger';
import { NetworkUtils } from '../NetworkUtils';
import { allRoles, answerMessage, currentRolesAndPermissions, readRole } from './roleApi';
import {
  findUserByEmail,
  payerDropdown,
  readUserOrNull,
  requestCreateUser,
  suiteUserDisplayName,
  suiteUserEmail,
  suiteUserLastName,
  userBody,
  userStamp,
} from '../UserProvisioning';
import { drawerUser, errorsShown, passContact, passUserInfo } from '../user/writerBHelpers';
import { pendingRequestId, provisionNetwork, readNetwork, submitNetwork, type ProvisionedNetwork } from '../NetworkProvisioning';
import { stageNetworkEdit } from '../NetworkHistory';
import { networkAuditTrail, type AuditEntry } from '../jobDriven/lifecycle';
import { submitPlan, type ProvisionedPlan } from '../PlanProvisioning';
import { stageTrivialChange as stagePolicyDocument, submitPolicy, type ProvisionedPolicy } from '../PolicyProvisioning';
import {
  addTier,
  addTrade,
  answerText as formularyAnswerText,
  requestCreateFormulary,
  stageTrivialChange as stageFormularyBenefit,
  submitFormulary,
  suiteFormularyName,
  type ProvisionedFormulary,
} from '../FormularyProvisioning';

/**
 * Writer E helpers - Role Management folders 05 (Restrict Who Can Assign Each Role, US 21284) and 06 (Prevent
 * Self-Approval of Change Requests, US 21285). Built on the role foundation (fixtures/roleModule.fixture.ts) and
 * the earlier modules' page objects (Add User / Add Invitation drawers, Payer list, Approval Management).
 *
 * SAFETY: nothing here writes outside the suite's own records. The Add User drawer is only ever SAVED for a new
 * suite user (22040, adopted for deletion right after); the role drawers only touch suite roles; approval decisions
 * are only taken on requests the suite raised on its own networks / payers / formularies.
 */

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A server answer / text made safe for a failure message (no JSON braces or quotes - the narrator cuts at `{"`). */
export const plainText = (s: string, max = 240): string => norm(s.replace(/[{}"[\]]/g, ' ')).slice(0, max);

// ---- run-time blocking ----------------------------------------------------------------------

/**
 * BLOCKS the case (steps.blocked) unless an earlier step already FAILED - then the reason is only noted, so the
 * finding stays a FAIL (lead decision 8; the idea of utils/settings/writerBHelpers.ts).
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

/** A data gate `{ allowed, reason }`: blocks the step while it is switched off. */
export function requireGate(steps: TestSteps, gate: { allowed: boolean; reason: string }): void {
  if (!gate.allowed) steps.blocked(gate.reason);
}

/** Blocks (unless a step failed) when the session does not hold every key - the observation would prove nothing. */
export function blockUnlessHeld(steps: TestSteps, held: readonly string[], keys: readonly string[], why: string): void {
  const missing = keys.filter((k) => !held.includes(k));
  if (missing.length) blockUnlessAStepFailed(steps, `${why}: the session does not hold ${missing.join(', ')}`);
}

// ---- sets ----------------------------------------------------------------------------------------

export interface SetComparison {
  missing: string[];
  extra: string[];
  duplicates: string[];
}

/** What `shown` lacks of `expected`, what it adds, and which entries it repeats. */
export function compareSets(shown: readonly string[], expected: readonly string[]): SetComparison {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const s of shown) {
    if (seen.has(s)) duplicates.add(s);
    seen.add(s);
  }
  return {
    missing: expected.filter((e) => !seen.has(e)),
    extra: [...seen].filter((s) => !expected.includes(s)),
    duplicates: [...duplicates],
  };
}

export const sortedUnique = (names: readonly string[]): string[] => [...new Set(names)].sort((a, b) => a.localeCompare(b));

// ---- expected assignable roles (computed live) ---------------------------------------------------

/** Every ACTIVE listed role name (GetRoles) - what the System Administrator should be offered. */
export async function activeRoleNames(adminPage: Page): Promise<string[]> {
  return sortedUnique((await allRoles(adminPage)).filter((r) => r.isActive).map((r) => r.name));
}

/**
 * Every ACTIVE listed role whose "Allowed To Assign By" (GetRole assignableRoleIds) names one of `holderRoleIds` -
 * what a holder of those roles should be offered. Read through careconnect; other teams' roles count too.
 */
export async function rolesAssignableBy(adminPage: Page, holderRoleIds: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const role of (await allRoles(adminPage)).filter((r) => r.isActive)) {
    const record = await readRole(adminPage, role.id);
    if ((record?.assignableRoleIds ?? []).some((id) => holderRoleIds.includes(id))) out.push(role.name);
  }
  return sortedUnique(out);
}

/** A listed role's id by name (predefined ones included). */
export async function roleIdByName(adminPage: Page, name: string): Promise<string> {
  const role = (await allRoles(adminPage)).find((r) => r.name === name);
  if (!role) throw new Error(`no listed role named "${name}"`);
  return role.id;
}

// ---- Add User / Add Invitation role drop-downs -------------------------------------------------------

/** An Add User drawer opened on step 3 (Roles and Privileges) with one empty role card, never saved unless asked. */
export interface AddUserAtRoles {
  drawer: UserFormDrawer;
  email: string;
  /** "QA Automation User<stamp>" - the name an approval request for this user would carry. */
  displayName: string;
}

/**
 * Users Administration > Add User on `page` (any session), steps 1 and 2 filled with a valid suite user (document
 * ID checked free through careconnect), Next twice, then "Add New User Roles". Throws with the field errors when a
 * step refuses to move on.
 */
export async function openAddUserAtRoles(page: Page, adminPage: Page): Promise<AddUserAtRoles> {
  const list = new UserListPage(page);
  await list.openTable();
  // Smoke 2026-11-14: the predefined Payer Administrator holds Invitations.CreateInvitation but NOT Users.CreateUser,
  // so its Users Administration has no Add User. Say that plainly instead of a click timeout.
  const offered = await page.locator(`#${USER_LIST.addButton}`).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
  if (!offered) {
    const rights = (await currentRolesAndPermissions(page)).permissions.filter((k) => /^Users\.(CreateUser|GetUsers)$|^Invitations\.CreateInvitation$/.test(k));
    throw new Error(`Users Administration offers this session no Add User button, so its Add User role drop-down cannot be opened (session rights among Users.CreateUser / Users.GetUsers / Invitations.CreateInvitation: ${rights.join(', ') || 'none'})`);
  }
  const drawer = await list.openAddForm();
  const stamp = userStamp();
  const lastName = suiteUserLastName(stamp);
  const user = await drawerUser(adminPage, { lastName, displayNameEn: suiteUserDisplayName(lastName), email: suiteUserEmail(stamp) });
  if (!(await passUserInfo(drawer, user))) throw new Error(`Add User stayed on User Information: ${await errorsShown(drawer)}`);
  if (!(await passContact(drawer, user))) throw new Error(`Add User stayed on Contact Information: ${await errorsShown(drawer)}`);
  await drawer.addRoleCard();
  return { drawer, email: user.email, displayName: user.displayNameEn };
}

/** Closes the user drawer, discarding (the Unsaved Changes dialog is answered Discard Changes). */
export async function discardUserDrawer(drawer: UserFormDrawer): Promise<void> {
  const dialog = await drawer.close().catch(() => null);
  if (dialog) await drawer.discardChanges();
  await drawer.waitForClosed(Timeouts.default);
}

/** The Role options of the Add User drawer for `page`'s session (drawer discarded afterwards). */
export async function addUserRoleOptions(page: Page, adminPage: Page): Promise<string[]> {
  const { drawer } = await openAddUserAtRoles(page, adminPage);
  const options = await drawer.getRoleOptions();
  await discardUserDrawer(drawer);
  Logger.step(`[writerE] Add User role options: ${options.join(' | ')}`);
  return options;
}

/** The Role options, then `roleName` chosen on the card: what the card shows afterwards (drawer discarded). */
export async function addUserRoleChoice(page: Page, adminPage: Page, roleName: string): Promise<{ options: string[]; chosen: string[] }> {
  const { drawer } = await openAddUserAtRoles(page, adminPage);
  const options = await drawer.getRoleOptions();
  let chosen: string[] = [];
  if (options.includes(roleName)) {
    await drawer.chooseRole(roleName);
    chosen = await drawer.readRoles();
  }
  await discardUserDrawer(drawer);
  return { options, chosen };
}

/** The payers the Assign Payers picker offers (Available + Selected) for the role card of `roleId`. */
export async function pickerPayers(drawer: UserFormDrawer, roleId: string): Promise<string[]> {
  await drawer.openAssignPayers(roleId);
  return sortedUnique([...(await drawer.readPickerPayers('source')), ...(await drawer.readPickerPayers('target'))]);
}

/**
 * Add User on `page`: the Role options; `roleName` chosen; the payers its Assign Payers picker offers; and, when
 * `searchPayer` is given, what the picker's search finds for that name. The drawer is discarded.
 */
export async function addUserPayerChoice(
  page: Page,
  adminPage: Page,
  roleName: string,
  roleId: string,
  searchPayer?: string,
): Promise<{ options: string[]; payers: string[]; searched: string[] }> {
  const { drawer } = await openAddUserAtRoles(page, adminPage);
  const options = await drawer.getRoleOptions();
  let payers: string[] = [];
  let searched: string[] = [];
  if (options.includes(roleName)) {
    await drawer.chooseRole(roleName);
    payers = await pickerPayers(drawer, roleId);
    if (searchPayer !== undefined) {
      await drawer.searchPicker('source', searchPayer);
      searched = await drawer.readPickerPayers('source');
      await drawer.searchPicker('source', '');
    }
    await drawer.closePicker(false);
  }
  await discardUserDrawer(drawer);
  return { options, payers, searched };
}

/**
 * Add User on `page` with `roleName` chosen and its payer picker opened (left open) - the 22040 step 2 view.
 * The caller saves with `saveNewUserWithPayer` or discards with `discardUserDrawer`.
 */
export async function openAddUserForScopedRole(page: Page, adminPage: Page, roleName: string, roleId: string): Promise<AddUserAtRoles & { options: string[]; payers: string[] }> {
  const opened = await openAddUserAtRoles(page, adminPage);
  const options = await opened.drawer.getRoleOptions();
  if (!options.includes(roleName)) return { ...opened, options, payers: [] };
  await opened.drawer.chooseRole(roleName);
  const payers = await pickerPayers(opened.drawer, roleId);
  return { ...opened, options, payers };
}

/**
 * Moves `payerName` to Selected in the open picker, saves the picker and the drawer. The new user (a SUITE user)
 * is adopted for deletion as soon as it exists. Returns the CreateUser answer.
 */
export async function saveNewUserWithPayer(opened: AddUserAtRoles, payerName: string, adminPage: Page, suiteUsers: SuiteUsers): Promise<UserSaveAnswer> {
  await opened.drawer.movePayers([payerName]);
  await opened.drawer.closePicker(true);
  const answer = await opened.drawer.attemptSave();
  await adoptIfCreated(adminPage, suiteUsers, opened.email);
  return answer;
}

/** Adopts the suite user with `email` for deletion when it exists ('' = it does not). */
export async function adoptIfCreated(adminPage: Page, suiteUsers: SuiteUsers, email: string): Promise<string> {
  const found = await findUserByEmail(adminPage, email).catch(() => null);
  if (!found) return '';
  return suiteUsers.adopt(email);
}

/** The roles (names + payer NAMES) a user holds, read by careconnect via the user's e-mail ([] when no such user). */
export async function userRolesOf(adminPage: Page, email: string): Promise<{ role: string; payerIds: string[] }[]> {
  const row = await findUserByEmail(adminPage, email);
  if (!row) return [];
  const record = await readUserOrNull(adminPage, row.id);
  return (record?.assignedRoles ?? []).map((r) => ({ role: r.name, payerIds: r.assignedPayers.map((p) => p.id).sort() }));
}

/** A user's English full name (careconnect's read) - the reviewer identity an audit entry should carry. */
export async function userDisplayName(adminPage: Page, userId: string): Promise<{ name: string; email: string }> {
  const record = await readUserOrNull(adminPage, userId);
  return { name: norm(record?.fullEnglishName ?? ''), email: record?.email ?? '' };
}

/** Invitations > Add Invitation on `page`: the Role Name options (drawer closed again). */
export async function invitationRoleOptions(page: Page): Promise<string[]> {
  const list = new InvitationListPage(page);
  await list.openTable();
  const drawer = await list.openAddForm();
  const options = await drawer.getRoleOptions();
  await drawer.close();
  if ((await readDialog(page)).visible) await clickDialogAction(page, 'discard');
  Logger.step(`[writerE] Add Invitation role options: ${options.join(' | ')}`);
  return options;
}

// ---- menus and direct links ----------------------------------------------------------------------

/** The left menu on the dashboard: whether it rendered at all and every Users Mgmt id it carries. */
export async function usersMenuState(page: Page): Promise<{ menuRendered: boolean; usersGroupIds: string[] }> {
  await page.goto(new URL(AppRoutes.dashboard, env.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  const anyEntry = page.locator(`[id^="${WRITER_E_NAV.navPrefix}"][id$="-link"], [id^="${WRITER_E_NAV.navPrefix}"][id$="-toggle"]`).first();
  const menuRendered = await anyEntry.waitFor({ state: 'visible', timeout: Timeouts.navigation }).then(() => true, () => false);
  const usersGroupIds = await page.locator(`[id^="${WRITER_E_NAV.usersGroupPrefix}"]`).evaluateAll((els) => els.map((e) => e.id));
  return { menuRendered, usersGroupIds };
}

/** What a direct link to Users Administration / Invitations shows this session. */
export interface DirectLinkOutcome {
  path: string;
  listShown: boolean;
  addOffered: boolean;
  text: string;
}

export async function directLink(page: Page, which: 'users' | 'invitations'): Promise<DirectLinkOutcome> {
  const route = which === 'users' ? AppRoutes.usersAdministration : AppRoutes.invitations;
  const screen = which === 'users' ? USER_LIST.screen : INVITATION_LIST.screen;
  const add = which === 'users' ? USER_LIST.addButton : INVITATION_LIST.addButton;
  await page.goto(new URL(route, env.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: Timeouts.navigation }).catch(() => undefined);
  const listShown = await page.locator(`#${screen}-table-el, #${screen}-table-body`).first().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
  const addOffered = await page.locator(`#${add}`).isVisible().catch(() => false);
  const text = norm(await page.locator('main').first().innerText().catch(() => '')).slice(0, 200); // locator-exception: a denied / redirected screen carries no id; the app's single <main> is read whole for the message
  return { path: new URL(page.url()).pathname, listShown, addOffered, text };
}

// ---- 22036: CreateUser straight from a session -------------------------------------------------------

/**
 * POST CreateUser from `sessionPage` for a NEW suite user holding `roleId` (+ payers). When the server wrongly
 * creates it, the user is adopted at once for deletion. Returns the answer and whether a user now exists.
 */
export async function createUserAsSession(
  sessionPage: Page,
  adminPage: Page,
  suiteUsers: SuiteUsers,
  roleId: string,
  payerIds: string[] = [],
): Promise<{ status: number; message: string; email: string; displayName: string; createdId: string }> {
  const body = await userBody(adminPage, { roles: [{ roleId, payerIds }] });
  const res = await requestCreateUser(sessionPage, body as unknown as Record<string, unknown>);
  const createdId = await adoptIfCreated(adminPage, suiteUsers, body.email);
  return { status: res.status, message: plainText(answerMessage({ status: res.status, text: res.text, validationErrors: res.validationErrors })), email: body.email, displayName: suiteUserDisplayName(body.englishLastName), createdId };
}

// ---- approvals: who decides what --------------------------------------------------------------------

/** One approval request as GetApprovals lists it (the fields the cases read). */
export interface ApprovalRow {
  id: string;
  entityNameEn: string;
  status: string;
  [key: string]: unknown;
}

/** The approval request `requestId` as careconnect's GetApprovals lists it (null when not found). */
export async function approvalRow(adminPage: Page, requestId: string): Promise<ApprovalRow | null> {
  for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
    const res = await NetworkUtils.postAsSession(adminPage, GET_APPROVALS_ENDPOINT, { pageNumber, rowsPerPage: 200 });
    if (res.status >= 300) return null;
    const payload = (JSON.parse(res.text) as { payload?: Record<string, { items?: ApprovalRow[] }> }).payload ?? {};
    const rows = Object.values(payload).find((v) => Array.isArray(v?.items))?.items ?? [];
    const row = rows.find((r) => String(r.id) === requestId);
    if (row) return row;
    if (rows.length < 200) return null;
  }
  return null;
}

/** The request's status ("Pending", "Approved", "Rejected" ...; '' when not found). */
export async function requestStatus(adminPage: Page, requestId: string): Promise<string> {
  return String((await approvalRow(adminPage, requestId))?.status ?? '');
}

/** What one session was offered and what happened when it tried to decide a request. */
export interface DecisionAttempt {
  /** The request id before the attempt ('' = none was pending). */
  requestId: string;
  /** Approval Management (the scope's tab) rendered for the session. */
  screen: boolean;
  /** The request is listed in the session's queue. */
  inQueue: boolean;
  /** The row action for the decision. */
  offered: 'absent' | 'disabled' | 'available';
  /** The server's answer to the decision (when the action was available and clicked). */
  answer: string;
  /** The request is no longer pending afterwards (careconnect's read). */
  decided: boolean;
  /** Its status afterwards. */
  statusAfter: string;
}

/**
 * `sessionPage` opens Approval Management on the `scope` tab, finds `entityName`'s pending request and tries to
 * `decision` it through the row action (the dialog is acknowledged, a reason chosen for a rejection). Never
 * throws for "not offered" - that is an answer. The outcome is read back through careconnect.
 */
export async function attemptDecision(
  sessionPage: Page,
  adminPage: Page,
  scope: ApprovalScope,
  entityName: string,
  decision: 'approve' | 'reject',
): Promise<DecisionAttempt> {
  const requestId = await pendingRequestId(adminPage, entityName);
  const approvals = new ApprovalManagementPage(sessionPage, scope);
  const screen = await approvals.open().then(() => true, () => false);
  const inQueue = screen ? await approvals.isInQueue(entityName).catch(() => false) : false;
  const offered = inQueue ? await approvals.getRowActionAvailability(entityName, decision).catch(() => 'absent' as const) : 'absent';
  let answer = '';
  if (offered === 'available') {
    answer = (await approvals.attemptDecisionOnLoadedRow(entityName, decision).catch((e: Error) => ({ answer: `the attempt broke off: ${e.message.split('\n')[0]}` }))).answer;
  }
  const statusAfter = requestId ? await requestStatus(adminPage, requestId) : '';
  const decided = requestId !== '' && statusAfter !== '' && !/^pending/i.test(statusAfter);
  Logger.step(`[writerE] ${decision} "${entityName}" as this session: screen ${screen}, in queue ${inQueue}, action ${offered}, status after "${statusAfter}"`);
  return { requestId, screen, inQueue, offered, answer, decided, statusAfter };
}

/** A DecisionAttempt in words, for failure messages (no JSON - the narrator cuts at the first `{"`). */
export function describeAttempt(a: DecisionAttempt): string {
  return `request ${a.requestId || '(none pending)'}; Approval Management shown: ${a.screen}; in the queue: ${a.inQueue}; action: ${a.offered}; `
    + `server answer: ${plainText(a.answer, 220) || '(nothing sent)'}; status afterwards: ${a.statusAfter || '(not found)'}`;
}

/** The approval right keys of one tab: Approval Management > <Tab> > Approve/Reject + the general ApproveRequest. */
export function approvalRightsOf(scope: ApprovalScope): string[] {
  const tab = { payer: 'Payer', network: 'Network', plan: 'Plan', formulary: 'Formulary', policy: 'Policy' }[scope];
  return [`ApprovalManagement.${tab}.ApproveReject`, 'Approvals.ApproveRequest'];
}

/**
 * Decides `entityName`'s pending request through the queue as `sessionPage` with the screen's own flow
 * (ApprovalManagementPage.approve / reject - each asserts the request left the queue), then reads its status.
 */
export async function decide(
  sessionPage: Page,
  adminPage: Page,
  scope: ApprovalScope,
  entityName: string,
  decision: 'approve' | 'reject',
): Promise<{ requestId: string; statusAfter: string }> {
  const requestId = await pendingRequestId(adminPage, entityName);
  if (!requestId) throw new Error(`"${entityName}" has no pending request to ${decision}`);
  const approvals = new ApprovalManagementPage(sessionPage, scope);
  await approvals.open();
  if (decision === 'approve') await approvals.approve(entityName);
  else await approvals.reject(entityName);
  return { requestId, statusAfter: await requestStatus(adminPage, requestId) };
}

/** absent / disabled / available: the row action `entityName`'s request offers `sessionPage` on the `scope` tab. */
export async function decisionOffered(sessionPage: Page, scope: ApprovalScope, entityName: string, action: 'approve' | 'reject'): Promise<'absent' | 'disabled' | 'available'> {
  const approvals = new ApprovalManagementPage(sessionPage, scope);
  await approvals.open();
  return approvals.getRowActionAvailability(entityName, action);
}

/** POST ApproveRequest for `entityName`'s pending request straight from `sessionPage` (no screen). */
export async function approveDirectly(sessionPage: Page, adminPage: Page, entityName: string): Promise<{ requestId: string; status: number; message: string; statusAfter: string }> {
  const requestId = await pendingRequestId(adminPage, entityName);
  if (!requestId) return { requestId, status: -1, message: 'no pending request to approve', statusAfter: '' };
  const res = await new ApprovalManagementPage(sessionPage).approveRequestViaApi(requestId);
  const message = plainText(answerMessage({ status: res.status, text: res.text, validationErrors: res.validationErrors }));
  return { requestId, status: res.status, message, statusAfter: await requestStatus(adminPage, requestId) };
}

// ---- networks the suite owns ------------------------------------------------------------------------

/** Days ahead the suite's networks start, so an approved one never goes live during the case. */
const NETWORK_EFFECTIVE_MINUTES = 2 * 24 * 60;

/** A suite network ("Automation Network <stamp>"), created, submitted and approved by careconnect. */
export async function approvedSuiteNetwork(adminPage: Page): Promise<ProvisionedNetwork> {
  return provisionNetwork(adminPage, { effectiveInMinutes: NETWORK_EFFECTIVE_MINUTES });
}

/**
 * `sessionPage` changes the network's English description (UpdateNetwork, a draft) and submits it for approval
 * (SubmitNetworkForApproval) - the requester is that session. Throws with the server's answer when refused.
 */
export async function submitNetworkChange(sessionPage: Page, network: { id: string; name: string }, description: string): Promise<void> {
  const staged = await stageNetworkEdit(sessionPage, network.id, { descriptionEn: description });
  if (staged.status >= 300) throw new Error(`UpdateNetwork "${network.name}" answered ${staged.status}: ${answerMessage(staged)}`);
  await submitNetwork(sessionPage, network.id, network.name);
  Logger.step(`[writerE] Change to "${network.name}" submitted for approval`);
}

/** Makes sure the network has a pending change (careconnect submits one when none is pending). */
export async function ensurePendingNetworkChange(adminPage: Page, network: { id: string; name: string }, description: string): Promise<string> {
  const pending = await pendingRequestId(adminPage, network.name);
  if (pending) return pending;
  await submitNetworkChange(adminPage, network, description);
  return pendingRequestId(adminPage, network.name);
}

/** The network's live record: version, English description, whether a version waits for approval. */
export async function networkLive(adminPage: Page, id: string): Promise<{ currentVersion: number; descriptionEn: string; hasPendingVersion: boolean }> {
  const record = await readNetwork(adminPage, id);
  return { currentVersion: Number(record.currentVersion), descriptionEn: String(record.descriptionEn ?? ''), hasPendingVersion: Boolean(record.hasPendingVersion) };
}

/** The network's Audit History entries at or after `sinceIso` (careconnect's read), newest first. */
export async function networkAuditSince(adminPage: Page, networkId: string, sinceIso: string): Promise<AuditEntry[]> {
  const since = Date.parse(sinceIso) - 60_000;
  return (await networkAuditTrail(adminPage, networkId, 50)).filter((e) => Date.parse(String(e.occurredAtUtc ?? '')) >= since);
}

/**
 * Whether an audit entry after the decision records it: the reviewer (full name or e-mail), the action word and a
 * readable timestamp - with every entry in words for the failure message.
 */
export function auditEvidence(entries: readonly AuditEntry[], reviewer: { name: string; email: string }, action: RegExp): { recorded: boolean; entries: string } {
  const names = [reviewer.name, reviewer.email].filter(Boolean).map((s) => s.toLowerCase());
  const recorded = entries.some((e) => {
    const text = auditText(e);
    const byReviewer = names.some((n) => text.toLowerCase().includes(n));
    return byReviewer && action.test(text) && !Number.isNaN(Date.parse(String(e.occurredAtUtc ?? '')));
  });
  return { recorded, entries: entries.map(auditText).join(' || ').slice(0, 900) || '(no entry after the decision)' };
}

/** One audit entry in words (action, actor, time + the rest flattened). */
export function auditText(e: AuditEntry): string {
  const rest = Object.entries(e)
    .filter(([k, v]) => !['actionType', 'actorLabel', 'occurredAtUtc'].includes(k) && (typeof v === 'string' || typeof v === 'number'))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' ');
  return `${String(e.actionType ?? '')} by ${String(e.actorLabel ?? '')} at ${String(e.occurredAtUtc ?? '')} ${rest}`.replace(/[{}"]/g, ' ').trim();
}

// ---- other entities the suite owns (22046) ---------------------------------------------------------------

/** Stages the plan's inactivation (the change a published plan offers) and sends it for approval, as careconnect. */
export async function submitPlanChange(adminPage: Page, plan: ProvisionedPlan): Promise<void> {
  const reason = await NetworkUtils.requestAsSession(adminPage, 'GET', ApiEndpoints.planInactivationReasonLookup);
  const reasonId = (JSON.parse(reason.text) as { payload: { id: string }[] }).payload[0]?.id;
  const staged = await NetworkUtils.postAsSession(adminPage, ApiEndpoints.planInactivate, {
    id: plan.id,
    inactivationReasonId: reasonId,
    inactivationDetails: 'Staged by a role case to raise a change request.',
  });
  if (staged.status >= 300) throw new Error(`InactivatePlan "${plan.name}" answered ${staged.status}: ${answerMessage(staged)}`);
  await submitPlan(adminPage, plan.id, plan.name);
}

/** Stages a document on the published policy and sends the change for approval, as careconnect. */
export async function submitPolicyChange(adminPage: Page, policy: ProvisionedPolicy): Promise<void> {
  await stagePolicyDocument(adminPage, policy.id, policy.nameEn);
  const res = await submitPolicy(adminPage, policy.id);
  if (res.status >= 300) throw new Error(`SubmitPolicyForApproval "${policy.nameEn}" answered ${res.status}: ${answerMessage({ ...res, validationErrors: res.validationErrors ?? [] })}`);
}

/** Stages a benefit configuration on the published formulary and sends the change for approval, as careconnect. */
export async function submitFormularyChange(adminPage: Page, formulary: ProvisionedFormulary): Promise<void> {
  await stageFormularyBenefit(adminPage, formulary.id, formulary.nameEn);
  const res = await submitFormulary(adminPage, formulary.id);
  if (res.status >= 300) throw new Error(`SubmitFormularyForApproval "${formulary.nameEn}" answered ${res.status}: ${formularyAnswerText(res)}`);
}

/**
 * `sessionPage` creates a NEW suite formulary ("QA Automation Formulary ...") for `payerId` with one tier and one
 * trade and submits it for approval - the requester is that session. `register(name)` is called BEFORE the create
 * so the caller's teardown discards it whatever happens next. Throws with the server's answer when refused.
 */
export async function submitNewFormulary(sessionPage: Page, payerId: string, register: (name: string) => void): Promise<{ id: string; name: string }> {
  const name = suiteFormularyName('role');
  register(name);
  const created = await requestCreateFormulary(sessionPage, { nameEn: name, payerId });
  if (!created.id) throw new Error(`CreateFormulary "${name}" answered ${created.status}: ${formularyAnswerText(created)}`);
  const tier = await addTier(sessionPage, created.id, { nameEn: 'Automation Tier 1', nameAr: 'مستوى الأتمتة 1', order: 1, coverage: 80 });
  if (!tier.id) throw new Error(`CreateTier on "${name}" answered ${tier.status}: ${formularyAnswerText(tier)}`);
  const trade = await addTrade(sessionPage, created.id, {});
  if (!trade.id) throw new Error(`AddTrade on "${name}" answered ${trade.status}: ${formularyAnswerText(trade)}`);
  const submitted = await submitFormulary(sessionPage, created.id);
  if (submitted.status >= 300) throw new Error(`SubmitFormularyForApproval "${name}" answered ${submitted.status}: ${formularyAnswerText(submitted)}`);
  Logger.step(`[writerE] Formulary "${name}" created and submitted by this session`);
  return { id: created.id, name };
}

/**
 * submitNewFormulary for a role that may not be able to submit anything at all: when the session cannot create
 * and submit the formulary, the step cannot be observed and the case is BLOCKED (unless a step already failed -
 * then the refusal fails this step with the server's answer).
 */
export async function submitOwnFormulary(steps: TestSteps, sessionPage: Page, payerId: string, register: (name: string) => void, who: string): Promise<{ id: string; name: string }> {
  try {
    return await submitNewFormulary(sessionPage, payerId, register);
  } catch (error) {
    const reason = `${who} could not submit a change request of its own (a new formulary for the suite payer), so its self-approval cannot be observed: ${String(error instanceof Error ? error.message : error).split('\n')[0]}`;
    blockUnlessAStepFailed(steps, reason);
    throw new Error(reason);
  }
}

// ---- payers the suite owns --------------------------------------------------------------------------

/** Whether careconnect's GetPayersDropdown (ACTIVE payers) offers a payer named `name`. */
export async function offeredAsActivePayer(adminPage: Page, name: string): Promise<boolean> {
  return (await payerDropdown(adminPage)).some((p) => p.payerNameEn === name);
}

/**
 * `sessionPage` edits the payer's License Number in the Payer module (Edit, Save -> draft) and sends it for
 * approval - the screen's own flow; the requester is that session. `sendForApproval` asserts the row then reads
 * Pending Approval.
 */
export async function submitPayerChange(sessionPage: Page, payerName: string, field: string, value: string): Promise<void> {
  const payers = new PayerManagementPage(sessionPage);
  await payers.open();
  await payers.scopeTo(payerName);
  await payers.editTextFieldAndSave(payerName, field, value);
  await payers.sendForApproval(payerName);
}

/** The payer row's approval status as `sessionPage` sees it. */
export async function payerApprovalStatus(sessionPage: Page, payerName: string): Promise<string> {
  const payers = new PayerManagementPage(sessionPage);
  await payers.open();
  await payers.scopeTo(payerName);
  return norm(await payers.getApprovalStatus(payerName));
}

/** GetPayer `{ payerId }` as careconnect - the record's text (for "the change is applied"). */
export async function payerRecordText(adminPage: Page, payerId: string): Promise<string> {
  const res = await NetworkUtils.postAsSession(adminPage, ApiEndpoints.payerDetail, { id: payerId }); // GetPayer takes { id } ({ payerId } answers 400 "The supplied payer Id is invalid.")
  return res.text;
}

/** The Review panel's row for a field (careconnect's queue): before / after. */
export async function reviewedField(adminPage: Page, payerName: string, field: RegExp): Promise<{ field: string; before: string; after: string } | null> {
  const approvals = new ApprovalManagementPage(adminPage, 'payer');
  await approvals.open();
  const rows = await approvals.openReview(payerName);
  await approvals.closeReview().catch(() => undefined);
  return rows.find((r) => field.test(r.field)) ?? null;
}

/** Whether careconnect's queue on `scope` lists `entityName` (waits for it to arrive). */
export async function expectQueued(adminPage: Page, scope: ApprovalScope, entityName: string): Promise<void> {
  const approvals = new ApprovalManagementPage(adminPage, scope);
  await approvals.open();
  await approvals.expectInQueue(entityName);
}
