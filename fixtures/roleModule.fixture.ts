import { test as base, expect } from '@playwright/test';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { LoginPage } from '../pages/auth/LoginPage';
import { disableAdminAutoSignIn } from '../pages/BasePage';
import { PayerScopeDialog } from '../pages/components/PayerScopeDialog';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { RoleAdministrationPage } from '../pages/role/RoleAdministrationPage';
import { DEFAULT_VIEWPORT } from '../constants/BrowserConfig';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { env } from '../constants/EnvironmentConfig';
import { Logger } from '../utils/Logger';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';
import { DateUtils } from '../utils/DateUtils';
import { buildUniquePayer } from '../data/payers/payer.data';
import { blockedByPrecondition } from './testStatus.fixture';
import { cleanUpAfterCase, provisionPublishedPayer, purgePayer } from './payerState.fixture';
import {
  SUITE_ROLE_PREFIX,
  allRoles,
  answerMessage,
  assertSuiteRole,
  currentRolesAndPermissions,
  deleteSuiteRole,
  isSuiteRoleName,
  permissionIdsByKeys,
  readPermissionCatalogue,
  readRole,
  requestCreateRole,
  setSuiteRoleActive,
  setSuiteRoleRights,
  suiteRoleNameAr,
  suiteRoleNameEn,
  updateSuiteRole,
  type PermissionCatalogue,
  type RoleApiAnswer,
  type RoleBody,
  type RoleRecord,
} from '../utils/role/roleApi';
import {
  SECOND_USER_HOME_ROLE,
  readSecondUser,
  restoreSecondUser,
  snapshotOf,
  updateSecondUser,
  type SecondUserSnapshot,
} from '../utils/notification/secondUserAccount';
import {
  discardSuiteUser,
  isSuiteUser,
  listUsers,
  payerDropdown,
  provisionSuiteUser,
  readUserOrNull,
  type ProvisionedUser,
  type RoleAssignment,
  type SuiteUserSpec,
  type UserState,
} from '../utils/UserProvisioning';
import { pendingRequestId } from '../utils/NetworkProvisioning';
import { cronInMinutes, readJobCron, waitFor as waitForJob, writeJobCron } from '../utils/JobClock';
import { rejectRequest, rejectionReasons } from '../utils/notification/notificationApi';
import { PREDEFINED_ROLE_NAMES, type PredefinedRoleName, type RoleDeactivationReasonKey } from '../data/role/common.data';

/**
 * Role Management fixtures (Feature 21279, foundation 2026-11-14). See reports/role/Role-Foundation-Notes.md.
 *
 * ACCOUNTS. The suite runs as careconnect (ADMIN_*, role "Admin" - never listed, never touched). The ONE holder
 * that can sign in is maalmohammad@neorx.co (NON_ADMIN_*): `roleHolder` gives it EXACTLY the roles a case needs,
 * signs it in from its own context, and ALWAYS puts its original roles back (Organization Administrator
 * guaranteed) and READS THEM BACK at teardown. Suite-made users (`suiteUsers`) can hold roles but cannot sign in
 * while 2FA is on.
 *
 * SAFETY. Writes only to roles named "QA Automation Role ..." (or created by this test), suite users
 * ("QA Automation User..." / qa.automation.*), suite payers ("Automation Payer ..."). Predefined roles and other
 * people's roles are only ever READ.
 *
 * Teardown order (Playwright tears down dependants first): roleHolder -> suiteUsers -> suiteApprovals -> suiteRoles
 * -> suitePayers. So a role is unassigned before it is deleted.
 */

// ---- types --------------------------------------------------------------------------------

export interface SuiteRoleSpec {
  /** Word appended to the stamped name ("QA Automation Role <stamp> <label>"). */
  label?: string;
  /** Full English name (must start with "QA Automation Role"). */
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  /** Permission KEYS, e.g. ['Roles.GetRoles', 'Roles.GetRole']. Default ['Roles.GetRoles']. [] = none (API allows it). */
  rights?: readonly string[];
  isActive?: boolean;
  hasAssignedPayers?: boolean;
  canApproveOwnRequests?: boolean;
  /**
   * "Allowed To Assign By": role NAMES or ids. Default ['Organization Administrator'] - a suite role with an empty
   * list cannot even be re-saved in the Edit drawer (the field is required there).
   */
  allowedToAssignBy?: readonly string[];
}

export interface SuiteRole {
  id: string;
  name: string;
  arabicName: string;
  rights: string[];
  record: RoleRecord;
}

export interface SuiteRoles {
  /** Creates a suite role through the API. BLOCKS the case with the answer when refused. */
  create(spec?: SuiteRoleSpec): Promise<SuiteRole>;
  /** POST CreateRole with a raw body over the defaults - NOT blocking (validation cases); any id it returns is tracked. */
  createRaw(body: Partial<RoleBody>): Promise<RoleApiAnswer & { id: string }>;
  /** Snapshots the existing suite roles so ones the CASE adds through the screen are deleted at teardown too. Call before the UI create. */
  watch(): Promise<void>;
  /** Tracks a role created through the UI (by exact English name, or by id) for deletion; returns its id. */
  adopt(nameOrId: string): Promise<string>;
  newName(label?: string): string;
  newArabicName(): string;
  /** Role id of a listed role by name (predefined ones included). */
  idOf(name: string): Promise<string>;
  read(id: string): Promise<RoleRecord | null>;
  update(id: string, changes: Partial<RoleBody>): Promise<RoleApiAnswer>;
  setRights(id: string, keys: readonly string[]): Promise<RoleApiAnswer>;
  setActive(id: string, active: boolean, reason?: RoleDeactivationReasonKey, details?: string | null): Promise<RoleApiAnswer>;
  /** Deletes now (holders first must be gone); teardown would anyway. */
  remove(id: string): Promise<RoleApiAnswer>;
  /** The permission catalogue (cached per test). */
  catalogue(): Promise<PermissionCatalogue>;
  /** Ids created / adopted by this test (the write guard lets these through even if renamed). */
  readonly owned: ReadonlySet<string>;
}

/** A role for the holder: a predefined role NAME, a suite role, or any role id the suite owns. */
export type HolderRole = PredefinedRoleName | SuiteRole | { roleId: string };
export interface HolderGrant {
  role: HolderRole;
  /** Payer ids (required by payer-scoped roles: Payer Administrator / Payer Officer / hasAssignedPayers suite roles). */
  payerIds?: string[];
}

export interface SignInResult {
  /** The Account/Login answer's requiresTwoFactor (null when not read). */
  requiresTwoFactor: boolean | null;
  /** True when the browser was held on /login/verify (a code would be needed). */
  heldAtVerify: boolean;
  url: string;
  /** The payer the "Select a Payer" gate was answered with (null = no gate). */
  payerChosen: string | null;
}

export interface RoleHolder {
  readonly email: string;
  readonly id: string;
  /** Roles before the test - restored at teardown. */
  readonly original: SecondUserSnapshot;
  /** The holder's page (changes after each sign-in - always read it from here). */
  readonly page: Page;
  readonly context: BrowserContext;
  /** Role Administration page object on the holder's page. */
  readonly roles: RoleAdministrationPage;
  /** What the last sign-in looked like (2FA evidence). */
  readonly lastSignIn: SignInResult | null;
  /**
   * Gives the account EXACTLY `grants` (read back) and signs it in a fresh context. A predefined role by name,
   * a suite role, payers per grant. BLOCKS the case if the account cannot be shaped or is held at two-factor.
   */
  become(grants: HolderGrant | HolderGrant[], opts?: { payerToChoose?: string; allowTwoFactorHold?: boolean }): Promise<SignInResult>;
  /** Creates a suite role with `spec` (suiteRoles) and becomes ONLY that (with payers when given). */
  becomeSuiteRole(spec: SuiteRoleSpec, payerIds?: string[]): Promise<SuiteRole>;
  /** Changes the roles WHILE signed in (no new sign-in; rights reach the session at once - reload to re-render). */
  reshape(grants: HolderGrant | HolderGrant[]): Promise<void>;
  /** Signs in again in a fresh context (same roles). */
  signInAgain(opts?: { payerToChoose?: string; allowTwoFactorHold?: boolean }): Promise<SignInResult>;
  /** GetCurrentUserRolesAndPermissions from the holder's session. */
  permissions(): Promise<{ status: number; roles: string[]; permissions: string[] }>;
  /** The roles the account holds now (admin read): names + payer ids. */
  currentGrants(): Promise<{ name: string; roleId: string; payerIds: string[] }[]>;
  /** Puts the original roles back now and reads them back (teardown does it anyway). */
  restoreNow(): Promise<void>;
}

export interface SuiteUsers {
  /** A suite user holding `roles` (default state Active). BLOCKS when it cannot be made. Cannot sign in (2FA). */
  create(roles: HolderGrant | HolderGrant[], opts?: { state?: UserState; user?: SuiteUserSpec }): Promise<ProvisionedUser>;
  /** Tracks a suite user the CASE created through the screen (by e-mail) for deletion. */
  adopt(email: string): Promise<string>;
}

export interface SuitePayer {
  id: string;
  name: string;
  /** True = published by this test (purged at teardown); false = an existing suite payer, read only. */
  owned: boolean;
}

export interface SuitePayers {
  /**
   * `count` EXISTING active suite payers ("Automation Payer ..." from GetPayersDropdown) - fast, READ ONLY:
   * use them only as a payer scope (assign to a role holder / suite user), never edit them. BLOCKS if too few.
   */
  existing(count?: number): Promise<SuitePayer[]>;
  /** Publishes a NEW suite payer through the UI (create, network, submit, approve; ~2-4 min). Purged at teardown. */
  publish(): Promise<SuitePayer>;
}

export interface SuiteApprovals {
  /** Rejects (as careconnect) every Pending request of this SUITE entity at teardown. */
  track(entityName: string): void;
  /** The pending request id of an entity ('' when none). */
  pendingId(entityName: string): Promise<string>;
  /** Rejects the pending request of an entity now (careconnect). */
  rejectNow(entityName: string, details?: string): Promise<RoleApiAnswer | null>;
}

export interface RoleModuleFixtures {
  suiteRoles: SuiteRoles;
  roleHolder: RoleHolder;
  suiteUsers: SuiteUsers;
  suitePayers: SuitePayers;
  suiteApprovals: SuiteApprovals;
  /** Role Administration on the ADMIN page (careconnect). `.form`, `.view`, `.deactivate`, `.dialog` hang off it. */
  roleAdmin: RoleAdministrationPage;
}

// ---- helpers ------------------------------------------------------------------------------

const leftover = (testInfo: TestInfo, description: string): void => {
  testInfo.annotations.push({ type: 'leftover', description });
  Logger.warn(`[role leftover] ${description}`);
};

async function onApp(page: Page): Promise<void> {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves role names / ids to ids (listed roles). */
async function roleIdsOf(page: Page, namesOrIds: readonly string[]): Promise<string[]> {
  if (namesOrIds.every((x) => GUID_RE.test(x))) return [...namesOrIds];
  const roles = await allRoles(page);
  return namesOrIds.map((x) => {
    if (GUID_RE.test(x)) return x;
    const r = roles.find((role) => role.name === x);
    if (!r) throw new Error(`no listed role named "${x}"`);
    return r.id;
  });
}

const SUITE_PAYER_PREFIX = 'Automation Payer ';

// ---- fixtures ----------------------------------------------------------------------------

export const test = base.extend<RoleModuleFixtures>({
  // ---- suite roles --------------------------------------------------------------------------
  suiteRoles: async ({ page }, use, testInfo) => {
    const owned = new Set<string>();
    let before: Set<string> | null = null;
    let catalogue: PermissionCatalogue | null = null;
    const getCatalogue = async (): Promise<PermissionCatalogue> => {
      await onApp(page);
      if (!catalogue) catalogue = await readPermissionCatalogue(page);
      return catalogue;
    };
    const watch = async (): Promise<void> => {
      if (before) return;
      await onApp(page);
      before = new Set((await allRoles(page)).filter((r) => isSuiteRoleName(r.name)).map((r) => r.id));
    };
    const bodyOf = async (spec: SuiteRoleSpec): Promise<RoleBody> => ({
      name: spec.nameEn ?? suiteRoleNameEn(spec.label),
      arabicName: spec.nameAr ?? suiteRoleNameAr(),
      englishDescription: spec.descriptionEn ?? 'Created by the automation suite',
      arabicDescription: spec.descriptionAr ?? '',
      isActive: spec.isActive ?? true,
      hasAssignedPayers: spec.hasAssignedPayers ?? false,
      canApproveOwnRequests: spec.canApproveOwnRequests ?? false,
      selectedPermissionIds: await permissionIdsByKeys(page, spec.rights ?? ['Roles.GetRoles'], await getCatalogue()),
      assignableRoleIds: await roleIdsOf(page, spec.allowedToAssignBy ?? [SECOND_USER_HOME_ROLE]),
    });

    const api: SuiteRoles = {
      owned,
      watch,
      newName: (label = '') => suiteRoleNameEn(label),
      newArabicName: () => suiteRoleNameAr(),
      idOf: async (name) => {
        await onApp(page);
        const r = (await allRoles(page)).find((x) => x.name === name);
        if (!r) throw new Error(`no listed role named "${name}"`);
        return r.id;
      },
      read: async (id) => {
        await onApp(page);
        return readRole(page, id);
      },
      catalogue: getCatalogue,
      create: async (spec = {}) => {
        await watch();
        try {
          const body = await bodyOf(spec);
          const res = await requestCreateRole(page, body);
          if (res.status >= 300 || !res.id) throw new Error(`CreateRole answered ${res.status}: ${answerMessage(res)}`);
          owned.add(res.id);
          const record = await readRole(page, res.id);
          if (!record) throw new Error(`CreateRole answered ${res.status} but GetRole ${res.id} found nothing`);
          Logger.step(`[suiteRoles] Created "${record.name}" (${(spec.rights ?? ['Roles.GetRoles']).length} rights${record.isActive ? '' : ', inactive'}${record.hasAssignedPayers ? ', payer-scoped' : ''})`);
          return { id: res.id, name: record.name, arabicName: record.arabicName, rights: [...(spec.rights ?? ['Roles.GetRoles'])], record };
        } catch (error) {
          return blockedByPrecondition(testInfo, `a suite role ${JSON.stringify({ ...spec, rights: spec.rights?.slice(0, 6) }).slice(0, 200)}`, error);
        }
      },
      createRaw: async (body) => {
        await watch();
        const full: RoleBody = { ...(await bodyOf({})), ...body };
        const res = await requestCreateRole(page, full);
        if (res.id) owned.add(res.id);
        return res;
      },
      adopt: async (nameOrId) => {
        await onApp(page);
        const roles = await allRoles(page);
        const r = roles.find((x) => x.id === nameOrId || x.name === nameOrId);
        if (!r) throw new Error(`no listed role "${nameOrId}" to adopt`);
        if (r.isPredefined || (!isSuiteRoleName(r.name) && !owned.has(r.id))) throw new Error(`refusing to adopt "${r.name}": not a suite role`);
        owned.add(r.id);
        return r.id;
      },
      update: async (id, changes) => updateSuiteRole(page, id, changes, owned),
      setRights: async (id, keys) => setSuiteRoleRights(page, id, keys, owned),
      setActive: async (id, active, reason = 'other', details = 'Deactivated by the automation suite.') => setSuiteRoleActive(page, id, active, reason, details, owned),
      remove: async (id) => deleteSuiteRole(page, id, owned),
    };

    await use(api);

    // teardown: every owned role + every NEW suite role since watch()
    await onApp(page).catch(() => undefined);
    const now = await allRoles(page).catch(() => []);
    const known: Set<string> = before ?? new Set<string>();
    const doomed = new Set<string>([...owned, ...now.filter((r) => isSuiteRoleName(r.name) && before !== null && !known.has(r.id)).map((r) => r.id)]);
    for (const id of doomed) {
      const listed = now.find((r) => r.id === id);
      if (!listed) continue;
      if (listed.isPredefined) continue;
      let res = await deleteSuiteRole(page, id, owned).catch((e: unknown) => ({ status: 0, text: String(e), validationErrors: [] as string[] }));
      if (res.status >= 300 && res.status !== 404) {
        // Holders first: suite users holding it are discarded, then one retry.
        const holders = await suiteUsersHolding(page, id).catch(() => [] as string[]);
        for (const userId of holders) await discardSuiteUser(page, userId).catch(() => 'left');
        if (holders.length) res = await deleteSuiteRole(page, id, owned).catch((e: unknown) => ({ status: 0, text: String(e), validationErrors: [] as string[] }));
      }
      if (res.status >= 300 && res.status !== 404) leftover(testInfo, `suite role "${listed.name}" (${id}) could not be deleted (${res.status}: ${answerMessage(res).slice(0, 160)})`);
      else Logger.step(`[suiteRoles] Deleted "${listed.name}"`);
    }
  },

  // ---- the second user as role holder -----------------------------------------------------------
  roleHolder: async ({ page, browser, suiteRoles }, use, testInfo) => {
    testInfo.setTimeout(testInfo.timeout + 180_000);
    if (!env.nonAdminUsername || !env.nonAdminPassword) blockedByPrecondition(testInfo, 'the role holder (NON_ADMIN_* in .env)', new Error('NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not set'));
    await onApp(page);
    let snapshot: SecondUserSnapshot;
    let leftovers: string[] = [];
    try {
      const raw = snapshotOf(await readSecondUser(page));
      // A suite role still on the holder is a leftover of a test that could not restore (smoke 2026-11-14: the PC
      // slept inside 22051 and its "self approver" role stayed). It is never part of the baseline - dropping it here
      // makes this test's teardown remove it.
      leftovers = raw.roleNames.filter((n) => isSuiteRoleName(n));
      const keep = raw.roleNames.map((n) => !isSuiteRoleName(n));
      snapshot = { ...raw, roles: raw.roles.filter((_, i) => keep[i]), roleNames: raw.roleNames.filter((_, i) => keep[i]) };
      Logger.step(`[roleHolder] Snapshot: roles [${snapshot.roleNames.join(', ')}]${leftovers.length ? `; leftover suite roles dropped from the baseline: ${leftovers.join(', ')}` : ''}`);
    } catch (error) {
      return blockedByPrecondition(testInfo, 'the role holder record (second user)', error);
    }
    let context: BrowserContext | null = null;
    let p: Page | null = null;
    let rolesPage: RoleAdministrationPage | null = null;
    let last: SignInResult | null = null;
    let changed = leftovers.length > 0;

    const assignmentsOf = async (grants: HolderGrant[]): Promise<RoleAssignment[]> => {
      const listed = await allRoles(page);
      return grants.map((g) => {
        let roleId: string;
        if (typeof g.role === 'string') {
          if (!(PREDEFINED_ROLE_NAMES as readonly string[]).includes(g.role)) throw new Error(`"${g.role}" is not a predefined role name`);
          const r = listed.find((x) => x.name === g.role);
          if (!r) throw new Error(`role "${g.role}" is not listed`);
          roleId = r.id;
        } else if ('roleId' in g.role) roleId = g.role.roleId;
        else roleId = g.role.id;
        return { roleId, payerIds: [...(g.payerIds ?? [])] };
      });
    };

    const applyGrants = async (grants: HolderGrant[]): Promise<void> => {
      const target = await assignmentsOf(grants);
      changed = true;
      // One retry on a client timeout (full run 2026-11-14: 22156/22182/22170 passed every step, then timed out here).
      // updateSecondUser re-reads the user, so the concurrency stamp is fresh; the read-back below verifies the result.
      const res = await updateSecondUser(page, { assignedRoles: target }).catch(async (e: Error) => {
        if (!/Timeout/i.test(e.message)) throw e;
        return updateSecondUser(page, { assignedRoles: target });
      });
      if (res.status >= 300) throw new Error(`UpdateUser answered ${res.status}: ${answerMessage(res).slice(0, 240)}`);
      const after = snapshotOf(await readSecondUser(page));
      const key = (r: RoleAssignment): string => `${r.roleId}:${[...r.payerIds].sort().join(',')}`;
      if (JSON.stringify(after.roles.map(key).sort()) !== JSON.stringify(target.map(key).sort())) {
        throw new Error(`the holder reads back [${after.roleNames.join(', ')}] (${JSON.stringify(after.roles)}), not the ${target.length} role(s) asked`);
      }
      Logger.step(`[roleHolder] Holds exactly [${after.roleNames.join(', ')}]${target.some((t) => t.payerIds.length) ? ' with payers' : ''}`);
    };

    const signIn = async (opts: { payerToChoose?: string; allowTwoFactorHold?: boolean } = {}): Promise<SignInResult> => {
      if (context) await context.close().catch(() => undefined);
      context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: DEFAULT_VIEWPORT });
      disableAdminAutoSignIn(context);
      p = await context.newPage();
      rolesPage = null;
      ScreenshotUtils.registerSession(testInfo, p);
      const login = new LoginPage(p);
      await login.open();
      const answer = p.waitForResponse((r) => r.url().includes(ApiEndpoints.accountLogin), { timeout: 60_000 }).catch(() => null);
      Logger.step(`[roleHolder] Signing in "${env.nonAdminUsername}"`);
      await login.login(env.nonAdminUsername, env.nonAdminPassword);
      const res = await answer;
      let requiresTwoFactor: boolean | null = null;
      if (res) {
        // Only the flag is read - the answer carries tokens and is never logged.
        const body = (await res.json().catch(() => null)) as { payload?: { requiresTwoFactor?: boolean } } | null;
        requiresTwoFactor = body?.payload?.requiresTwoFactor ?? null;
      }
      const page2 = p as Page;
      await page2.waitForURL((u) => !/\/login\/?$/.test(u.pathname) || /\/login\/verify/.test(u.pathname), { timeout: 60_000 }).catch(() => undefined);
      await page2.waitForLoadState('domcontentloaded');
      const heldAtVerify = /\/login\/verify/.test(new URL(page2.url()).pathname) || requiresTwoFactor === true;
      let payerChosen: string | null = null;
      if (!heldAtVerify) payerChosen = await new PayerScopeDialog(page2).chooseIfAsked(opts.payerToChoose).catch(() => null);
      last = { requiresTwoFactor, heldAtVerify, url: page2.url(), payerChosen };
      Logger.step(`[roleHolder] Sign-in: requiresTwoFactor=${requiresTwoFactor}, url=${new URL(page2.url()).pathname}${payerChosen ? `, payer gate answered "${payerChosen}"` : ''}`);
      if (heldAtVerify && !opts.allowTwoFactorHold) throw new Error(`TWO-FACTOR HOLD: the holder was sent to ${new URL(page2.url()).pathname} (requiresTwoFactor=${requiresTwoFactor}) - it cannot sign in with these roles`);
      return last;
    };

    const payerNameFor = async (grants: HolderGrant[], explicit?: string): Promise<string | undefined> => {
      if (explicit) return explicit;
      const firstPayer = grants.flatMap((g) => g.payerIds ?? [])[0];
      if (!firstPayer) return undefined;
      return (await payerDropdown(page)).find((x) => x.id === firstPayer)?.payerNameEn;
    };

    const restore = async (): Promise<void> => {
      await onApp(page);
      await restoreSecondUser(page, snapshot);
    };

    const holder: RoleHolder = {
      email: snapshot.email,
      id: snapshot.id,
      original: snapshot,
      get page() {
        if (!p) throw new Error('roleHolder: call become() first - the holder is not signed in yet');
        return p;
      },
      get context() {
        if (!context) throw new Error('roleHolder: call become() first');
        return context;
      },
      get roles() {
        if (!p) throw new Error('roleHolder: call become() first');
        if (!rolesPage) rolesPage = new RoleAdministrationPage(p);
        return rolesPage;
      },
      get lastSignIn() {
        return last;
      },
      become: async (grantOrGrants, opts = {}) => {
        const grants = Array.isArray(grantOrGrants) ? grantOrGrants : [grantOrGrants];
        try {
          await applyGrants(grants);
          return await signIn({ payerToChoose: await payerNameFor(grants, opts.payerToChoose), allowTwoFactorHold: opts.allowTwoFactorHold });
        } catch (error) {
          return blockedByPrecondition(testInfo, `the role holder signed in with exactly ${JSON.stringify(grants.map((g) => (typeof g.role === 'string' ? g.role : 'roleId' in g.role ? g.role.roleId : g.role.name)))}`, error);
        }
      },
      becomeSuiteRole: async (spec, payerIds = []) => {
        const role = await suiteRoles.create(spec);
        await holder.become({ role, payerIds });
        return role;
      },
      reshape: async (grantOrGrants) => {
        const grants = Array.isArray(grantOrGrants) ? grantOrGrants : [grantOrGrants];
        try {
          await applyGrants(grants);
        } catch (error) {
          blockedByPrecondition(testInfo, 'the role holder reshaped', error);
        }
      },
      signInAgain: async (opts = {}) => {
        try {
          return await signIn(opts);
        } catch (error) {
          return blockedByPrecondition(testInfo, 'the role holder signed in again', error);
        }
      },
      permissions: async () => currentRolesAndPermissions(holder.page),
      currentGrants: async () => {
        const rec = await readSecondUser(page);
        return rec.assignedRoles.map((r) => ({ name: r.name, roleId: r.id, payerIds: r.assignedPayers.map((x) => x.id) }));
      },
      restoreNow: restore,
    };

    try {
      await use(holder);
    } finally {
      if (context) await (context as BrowserContext).close().catch(() => undefined);
      let restoreError: unknown = null;
      try {
        await restore();
        if (changed) Logger.step(`[roleHolder] Restored and read back: [${snapshot.roleNames.join(', ')}] (home role "${SECOND_USER_HOME_ROLE}" guaranteed)`);
      } catch (error) {
        restoreError = error;
        testInfo.annotations.push({ type: 'second-user-not-restored', description: String(error) });
        Logger.error(`[roleHolder] ${String(error)}`);
      }
      if (restoreError) throw restoreError;
    }
  },

  // ---- suite users ----------------------------------------------------------------------------
  suiteUsers: async ({ page, suiteRoles }, use, testInfo) => {
    void suiteRoles; // dependency only: users are torn down BEFORE the roles they hold
    const made = new Set<string>();
    await use({
      create: async (grantOrGrants, opts = {}) => {
        const grants = Array.isArray(grantOrGrants) ? grantOrGrants : [grantOrGrants];
        try {
          await onApp(page);
          const listed = await allRoles(page);
          const roles: RoleAssignment[] = grants.map((g) => {
            const roleId = typeof g.role === 'string' ? listed.find((r) => r.name === g.role)?.id : 'roleId' in g.role ? g.role.roleId : g.role.id;
            if (!roleId) throw new Error(`role ${JSON.stringify(g.role)} is not listed`);
            return { roleId, payerIds: [...(g.payerIds ?? [])] };
          });
          const user = await provisionSuiteUser(page, opts.state ?? 'Active', { ...opts.user, roles });
          made.add(user.id);
          return user;
        } catch (error) {
          return blockedByPrecondition(testInfo, `a suite user holding ${grants.length} role(s)`, error);
        }
      },
      adopt: async (email) => {
        await onApp(page);
        const row = (await listUsers(page, { searchText: email }, 10)).items.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!row) throw new Error(`no user ${email} to adopt`);
        if (!isSuiteUser(row)) throw new Error(`refusing to adopt ${email}: not a suite user`);
        made.add(row.id);
        return row.id;
      },
    });
    await onApp(page).catch(() => undefined);
    for (const id of made) {
      const outcome = await discardSuiteUser(page, id).catch(() => 'left' as const);
      if (outcome !== 'gone') leftover(testInfo, `suite user ${id} ${outcome === 'inactivated' ? 'was only inactivated' : 'could not be deleted'}`);
    }
  },

  // ---- suite payers ---------------------------------------------------------------------------
  suitePayers: async ({ page }, use, testInfo) => {
    const published: { name: string; code: string }[] = [];
    await use({
      existing: async (count = 1) => {
        try {
          await onApp(page);
          const all = (await payerDropdown(page)).filter((x) => x.payerNameEn.startsWith(SUITE_PAYER_PREFIX));
          if (all.length < count) throw new Error(`only ${all.length} active suite payers ("${SUITE_PAYER_PREFIX}...") are offered, ${count} needed`);
          return all.slice(0, count).map((x) => ({ id: x.id, name: x.payerNameEn, owned: false }));
        } catch (error) {
          return blockedByPrecondition(testInfo, `${count} existing suite payer(s)`, error);
        }
      },
      publish: async () => {
        testInfo.setTimeout(testInfo.timeout + 300_000);
        const data = buildUniquePayer({ effectiveDate: DateUtils.minutesFromNow(2) });
        const code = await provisionPublishedPayer(new PayerManagementPage(page), new ApprovalManagementPage(page), data, testInfo);
        published.push({ name: data.nameEn, code });
        let row = (await payerDropdown(page)).find((x) => x.payerNameEn === data.nameEn);
        if (!row) {
          // Since the 2026-11-14 build a new payer may not start before today, so the approved payer reads "Future"
          // and GetPayersDropdown (active payers only) leaves it out until the payer lifecycle job runs (daily). The
          // job is moved to fire in two minutes (as the job-driven suites do, accepted 2026-11-08), the drop-down is
          // polled, and the ORIGINAL schedule is put back and read back whatever happens.
          testInfo.setTimeout(testInfo.timeout + 420_000);
          const key = 'Jobs.PayerLifecycleCron' as const;
          const original = await readJobCron(page, key);
          if (!original) return blockedByPrecondition(testInfo, `the published suite payer "${data.nameEn}"`, new Error(`${key} could not be read, so it was not moved (the payer reads "Future" until the job runs)`));
          try {
            const moved = await writeJobCron(page, key, cronInMinutes(2));
            if (moved.status !== 200) throw new Error(`moving ${key} answered ${moved.status}: ${moved.text.slice(0, 160)}`);
            const seen = await waitForJob(page, async () => (await payerDropdown(page)).find((x) => x.payerNameEn === data.nameEn), Boolean, { timeoutMs: 5 * 60_000, intervalMs: 15_000, describe: `"${data.nameEn}" active after the payer lifecycle job` });
            row = seen.value;
          } finally {
            await writeJobCron(page, key, original).catch(() => undefined);
            const back = await readJobCron(page, key).catch(() => '?');
            if (back !== original) leftover(testInfo, `${key} reads "${back}", not its original "${original}"`);
            else Logger.step(`[suitePayers] ${key} restored and read back: "${original}"`);
          }
        }
        if (!row) return blockedByPrecondition(testInfo, `the published suite payer "${data.nameEn}"`, new Error('it is not offered by GetPayersDropdown after approval'));
        return { id: row.id, name: data.nameEn, owned: true };
      },
    });
    for (const p of published) {
      await cleanUpAfterCase(testInfo, `payer ${p.name}`, () => purgePayer(new PayerManagementPage(page), new ApprovalManagementPage(page), p.code.trim() || p.name));
    }
  },

  // ---- approvals the suite submitted ---------------------------------------------------------------
  suiteApprovals: async ({ page }, use, testInfo) => {
    const tracked = new Set<string>();
    const isSuiteEntity = (name: string): boolean => /^(QA )?Automation /.test(name);
    const rejectNow = async (entityName: string, details = 'Rejected by the automation suite (clean-up).'): Promise<RoleApiAnswer | null> => {
      if (!isSuiteEntity(entityName)) throw new Error(`refusing to decide on "${entityName}": not a suite entity`);
      await onApp(page);
      const id = await pendingRequestId(page, entityName);
      if (!id) return null;
      const reason = (await rejectionReasons(page)).find((r) => /other/i.test(r.englishName)) ?? (await rejectionReasons(page))[0];
      const res = await rejectRequest(page, id, reason?.id ?? '', details);
      return { status: res.status, text: res.text, validationErrors: [] };
    };
    await use({
      track: (name) => {
        if (!isSuiteEntity(name)) throw new Error(`suiteApprovals.track refuses "${name}": not a suite entity`);
        tracked.add(name);
      },
      pendingId: async (name) => {
        await onApp(page);
        return pendingRequestId(page, name);
      },
      rejectNow,
    });
    for (const name of tracked) {
      for (let i = 0; i < 3; i += 1) {
        const res = await rejectNow(name).catch((e: unknown) => ({ status: 0, text: String(e), validationErrors: [] as string[] }));
        if (!res) break;
        if (res.status >= 300) {
          leftover(testInfo, `the pending request of "${name}" could not be rejected (${res.status}: ${res.text.slice(0, 120)})`);
          break;
        }
      }
    }
  },

  // ---- page objects -----------------------------------------------------------------------------
  roleAdmin: async ({ page }, use) => {
    await use(new RoleAdministrationPage(page));
  },
});

/** Suite users that hold a role (looked up among suite users only). */
async function suiteUsersHolding(page: Page, roleId: string): Promise<string[]> {
  const rows = (await listUsers(page, { searchText: 'qa.automation.' }, 200)).items.filter((u) => isSuiteUser(u));
  const out: string[] = [];
  for (const row of rows) {
    const rec = await readUserOrNull(page, row.id);
    if (rec?.assignedRoles.some((r) => r.id === roleId)) out.push(row.id);
  }
  return out;
}

export { expect, SUITE_ROLE_PREFIX, assertSuiteRole };
