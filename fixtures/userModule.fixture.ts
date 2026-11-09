import { test as base } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { UserListPage } from '../pages/user/UserListPage';
import { UserFormDrawer } from '../pages/user/UserFormDrawer';
import { UserDeactivateDrawer } from '../pages/user/UserDeactivateDrawer';
import { UserProfilePage } from '../pages/user/UserProfilePage';
import { InvitationListPage } from '../pages/user/InvitationListPage';
import { InvitationFormDrawer } from '../pages/user/InvitationFormDrawer';
import { MyProfilePage } from '../pages/user/MyProfilePage';
import { ChangePasswordDrawer, wipePasswordBoxes } from '../pages/user/ChangePasswordDrawer';
import { SignInPage } from '../pages/user/SignInPage';
import { ResetPasswordPage } from '../pages/user/ResetPasswordPage';
import { PasswordPolicyTab } from '../pages/user/PasswordPolicyTab';
import { UserMenu } from '../pages/user/UserMenu';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { disableAdminAutoSignIn } from '../pages/BasePage';
import { PayerScopeDialog } from '../pages/components/PayerScopeDialog';
import { blockedByPrecondition } from './testStatus.fixture';
import { env } from '../constants/EnvironmentConfig';
import { DEFAULT_VIEWPORT } from '../constants/BrowserConfig';
import { Logger } from '../utils/Logger';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';
import {
  SUITE_EMAIL_PREFIX,
  createSuiteInvitation,
  createSuiteRole,
  discardSuiteInvitation,
  discardSuiteRole,
  discardSuiteUser,
  establishSuitePassword,
  findInvitationByEmail,
  findUserByEmail,
  letRoleAssign,
  listUsers,
  payerIdByName,
  provisionSuiteUser,
  readPasswordPolicy,
  requestUpdatePasswordPolicy,
  restorePasswordPolicy,
  suiteUserEmail,
  suiteUserLastName,
  userSearchKey,
  userStamp,
  type PasswordPolicy,
  type ProvisionedInvitation,
  type ProvisionedRole,
  type ProvisionedUser,
  type RoleAssignment,
  type SuiteRoleSpec,
  type SuiteSecret,
  type SuiteUserSpec,
  type UserAnswer,
  type UserState,
} from '../utils/UserProvisioning';

/** The default rights of a suite role when a case names none: read the Users list. */
export const DEFAULT_SUITE_RIGHTS = ['Users.GetUsers', 'Users.GetUser', 'Users.GetUsersDashboard'] as const;

/** What `suiteSession` builds: a suite role with `rights`, a suite user holding it, signed in (second browser context). */
export interface SuiteSessionSpec {
  /** Permission keys of the suite role (default DEFAULT_SUITE_RIGHTS). */
  rights?: readonly string[];
  /** Payer names: makes the role payer-scoped ("Has Assigned Payers?") and assigns these payers to the user. */
  payers?: readonly string[];
  /**
   * Role ids (SUITE roles) the session's role may assign - offered in Add / Assign User and Add Invitation.
   * Applied by naming the session's role in EACH TARGET role's `assignableRoleIds` (that list means
   * "roles that may assign me" - see `letRoleAssign`; fixed 2026-11-08 after the full run).
   */
  assignableRoleIds?: string[];
  /** Overrides on the user. */
  user?: SuiteUserSpec;
  /** false: build the user and its password but do not sign in (the case drives the sign-in page itself). Default true. */
  signIn?: boolean;
}

/** A signed-in suite user in its own browser window. */
export interface SuiteSession {
  context: BrowserContext;
  page: Page;
  user: ProvisionedUser;
  role: ProvisionedRole;
  /** The password the suite set through the reset flow - a SuiteSecret, never logged. */
  password: SuiteSecret;
  users: UserListPage;
  profile: UserProfilePage;
  invitations: InvitationListPage;
  myProfile: MyProfilePage;
  menu: UserMenu;
  signInPage: SignInPage;
  resetPage: ResetPasswordPage;
  policy: PasswordPolicyTab;
}

/** A browser window with NO session (sign-in / reset screens). */
export interface SignedOutWindow {
  page: Page;
  signIn: SignInPage;
  reset: ResetPasswordPage;
  menu: UserMenu;
  myProfile: MyProfilePage;
}

/** Global settings a case may change - snapshotted first, ALWAYS restored and read back at teardown. */
export interface SettingsRestore {
  /** Reads (and on the first call remembers) the password policy. */
  snapshotPolicy: () => Promise<PasswordPolicy>;
  /** Snapshots, then PUTs `changes` over the current policy; returns the answer. */
  changePolicy: (changes: Partial<PasswordPolicy>) => Promise<UserAnswer>;
  /** Restores the snapshot now (teardown does it anyway) and returns the read-back. */
  restorePolicyNow: () => Promise<PasswordPolicy | null>;
}

export interface UserModuleFixtures {
  userListPage: UserListPage;
  userFormDrawer: UserFormDrawer;
  userDeactivateDrawer: UserDeactivateDrawer;
  userProfilePage: UserProfilePage;
  invitationListPage: InvitationListPage;
  invitationFormDrawer: InvitationFormDrawer;
  myProfilePage: MyProfilePage;
  changePasswordDrawer: ChangePasswordDrawer;
  /** The sign-in page on the DEFAULT page - only useful after the case signs the admin window out; prefer `signedOut()`. */
  signInPage: SignInPage;
  resetPasswordPage: ResetPasswordPage;
  passwordPolicyTab: PasswordPolicyTab;
  userMenu: UserMenu;
  /** The shared `#pbm-dialog` (Delete User, Activate User?, Unsaved Changes, Export format). */
  userConfirmDialog: ConfirmDialog;
  /** A suite role "QA Automation Role <stamp>" with exactly `spec.rights`; deleted at teardown (after the users). */
  suiteRole: (spec?: Partial<SuiteRoleSpec>) => Promise<ProvisionedRole>;
  /**
   * A suite user "QA Automation User<stamp>" in `state` (Active / InactiveAtCreate /
   * Deactivated) through the API; its role defaults to a fresh suite role
   * with DEFAULT_SUITE_RIGHTS. DELETED at teardown (deactivated if refused).
   * BLOCKED, with the server's answer, when the application refuses.
   */
  userIn: (state?: UserState, spec?: SuiteUserSpec) => Promise<ProvisionedUser>;
  /** A suite user WITH a password the suite knows (reset flow) - for sign-in cases driven on `signedOut()`. */
  userWithPassword: (spec?: SuiteUserSpec & { roles?: RoleAssignment[] }) => Promise<{ user: ProvisionedUser; password: SuiteSecret }>;
  /** A suite invitation (Pending) for a suite role; deleted at teardown. */
  suiteInvitation: (spec?: { roleId?: string; payerName?: string; email?: string }) => Promise<ProvisionedInvitation>;
  /** Registers a user the CASE created through the screen, by e-mail (suite addresses only), for teardown. */
  discardUserEmail: (email: string) => void;
  /** Registers a user the case created, by id. */
  discardUserId: (id: string) => void;
  /** Registers an invitation the case created through the screen, by e-mail (suite addresses only). */
  discardInvitationEmail: (email: string) => void;
  /** A second window signed in as a fresh suite user holding a fresh suite role. Everything is discarded at teardown. */
  suiteSession: (spec?: SuiteSessionSpec) => Promise<SuiteSession>;
  /** A window with no session - for the sign-in, reset and session cases. */
  signedOut: () => Promise<SignedOutWindow>;
  /** Snapshot / change / ALWAYS-restore of global settings (the password policy). */
  settingsRestore: SettingsRestore;
  /** A fresh suite name pair for a user the case types into the drawer: `{ stamp, lastName, displayNameEn, email }`. */
  newSuiteUserName: () => { stamp: string; lastName: string; displayNameEn: string; email: string };
}

/** Wipes every password box of every page of a context (no password may reach a failure snapshot), then closes it. */
async function closeQuietly(context: BrowserContext): Promise<void> {
  for (const p of context.pages()) await wipePasswordBoxes(p);
  await context.close().catch(() => undefined);
}

export const test = base.extend<UserModuleFixtures>({
  userListPage: async ({ page }, use) => {
    await use(new UserListPage(page));
  },
  userFormDrawer: async ({ page }, use) => {
    await use(new UserFormDrawer(page));
  },
  userDeactivateDrawer: async ({ page }, use) => {
    await use(new UserDeactivateDrawer(page));
  },
  userProfilePage: async ({ page }, use) => {
    await use(new UserProfilePage(page));
  },
  invitationListPage: async ({ page }, use) => {
    await use(new InvitationListPage(page));
  },
  invitationFormDrawer: async ({ page }, use) => {
    await use(new InvitationFormDrawer(page));
  },
  myProfilePage: async ({ page }, use) => {
    await use(new MyProfilePage(page));
  },
  changePasswordDrawer: async ({ page }, use) => {
    await use(new ChangePasswordDrawer(page));
    await wipePasswordBoxes(page);
  },
  signInPage: async ({ page }, use) => {
    await use(new SignInPage(page));
    await wipePasswordBoxes(page);
  },
  resetPasswordPage: async ({ page }, use) => {
    await use(new ResetPasswordPage(page));
    await wipePasswordBoxes(page);
  },
  passwordPolicyTab: async ({ page }, use) => {
    await use(new PasswordPolicyTab(page));
  },
  userMenu: async ({ page }, use) => {
    await use(new UserMenu(page));
  },
  userConfirmDialog: async ({ page }, use) => {
    await use(new ConfirmDialog(page));
  },

  // ---- teardown registries (users before roles) --------------------------------------

  suiteRole: async ({ page }, use, testInfo) => {
    const roles: string[] = [];
    await use(async (spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const role = await createSuiteRole(page, { rights: spec.rights ?? DEFAULT_SUITE_RIGHTS, hasAssignedPayers: spec.hasAssignedPayers, isActive: spec.isActive, assignableRoleIds: spec.assignableRoleIds, name: spec.name });
        roles.push(role.id);
        return role;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a suite role ${JSON.stringify(spec).slice(0, 160)}`, error);
      }
    });
    // Runs AFTER userIn / suiteSession teardown (they depend on this fixture), so no user still holds the role.
    for (const id of roles.reverse()) {
      const outcome = await discardSuiteRole(page, id).catch(() => 'left');
      if (outcome === 'left') testInfo.annotations.push({ type: 'leftover', description: `suite role ${id} could not be deleted` });
    }
  },

  userIn: async ({ page, suiteRole }, use, testInfo) => {
    const built: string[] = [];
    await use(async (state = 'Active', spec = {}) => {
      const lastName = spec.lastName ?? suiteUserLastName();
      const email = spec.email ?? suiteUserEmail(userStamp());
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const roles = spec.roles ?? [{ roleId: (await suiteRole({ rights: DEFAULT_SUITE_RIGHTS })).id, payerIds: [] }];
        const user = await provisionSuiteUser(page, state, { ...spec, lastName, email, roles }).catch(async (error: unknown) => {
          const partial = await findUserByEmail(page, email).catch(() => null);
          if (partial) built.push(partial.id);
          throw error;
        });
        built.push(user.id);
        return user;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a suite user in state ${state} ${JSON.stringify(spec).slice(0, 160)}`, error);
      }
    });
    for (const id of [...built].reverse()) {
      const outcome = await discardSuiteUser(page, id);
      if (outcome === 'left') testInfo.annotations.push({ type: 'leftover', description: `suite user ${id} could not be deleted or deactivated` });
    }
  },

  userWithPassword: async ({ page, userIn }, use, testInfo) => {
    await use(async (spec = {}) => {
      const user = await userIn('Active', spec);
      try {
        const password = await establishSuitePassword(page, user.email);
        return { user, password };
      } catch (error) {
        return blockedByPrecondition(testInfo, `a known password for suite user ${user.email} (ForgotPassword code + ResetPassword)`, error);
      }
    });
  },

  suiteInvitation: async ({ page, suiteRole }, use, testInfo) => {
    const made: { id: string; email: string }[] = [];
    await use(async (spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const roleId = spec.roleId ?? (await suiteRole({ rights: DEFAULT_SUITE_RIGHTS })).id;
        const payerId = spec.payerName ? await payerIdByName(page, spec.payerName) : null;
        const inv = await createSuiteInvitation(page, roleId, payerId, spec.email);
        made.push({ id: inv.id, email: inv.email });
        return inv;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a suite invitation ${JSON.stringify(spec).slice(0, 160)}`, error);
      }
    });
    for (const inv of made.reverse()) await discardSuiteInvitation(page, inv.id, inv.email);
  },

  discardUserEmail: async ({ page }, use) => {
    const emails: string[] = [];
    await use((email) => {
      if (!email.toLowerCase().startsWith(SUITE_EMAIL_PREFIX)) throw new Error(`"${email}" is not a suite address (${SUITE_EMAIL_PREFIX}...)`);
      emails.push(email);
    });
    for (const email of emails) {
      const found = await findUserByEmail(page, email).catch(() => null);
      if (found) await discardSuiteUser(page, found.id);
    }
  },

  discardUserId: async ({ page }, use) => {
    const ids: string[] = [];
    await use((id) => ids.push(id));
    for (const id of ids.reverse()) await discardSuiteUser(page, id);
  },

  discardInvitationEmail: async ({ page }, use) => {
    const emails: string[] = [];
    await use((email) => {
      if (!email.toLowerCase().startsWith(SUITE_EMAIL_PREFIX)) throw new Error(`"${email}" is not a suite address (${SUITE_EMAIL_PREFIX}...)`);
      emails.push(email);
    });
    for (const email of emails) {
      const found = await findInvitationByEmail(page, email).catch(() => null);
      if (found) await discardSuiteInvitation(page, found.id, found.email);
    }
  },

  suiteSession: async ({ browser, page, suiteRole, userIn }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    await use(async (spec = {}) => {
      testInfo.setTimeout(testInfo.timeout + 120_000);
      if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
      const role = await suiteRole({ rights: spec.rights ?? DEFAULT_SUITE_RIGHTS, hasAssignedPayers: (spec.payers?.length ?? 0) > 0 });
      if (spec.assignableRoleIds?.length) {
        try {
          await letRoleAssign(page, role.id, spec.assignableRoleIds);
        } catch (error) {
          blockedByPrecondition(testInfo, `suite roles ${JSON.stringify(spec.assignableRoleIds)} assignable by the session's role`, error);
        }
      }
      let payerIds: string[] = [];
      try {
        payerIds = await Promise.all((spec.payers ?? []).map((name) => payerIdByName(page, name)));
      } catch (error) {
        blockedByPrecondition(testInfo, `the payers ${JSON.stringify(spec.payers)} for a payer-scoped suite user`, error);
      }
      const user = await userIn('Active', { ...spec.user, roles: [{ roleId: role.id, payerIds }] });
      let password: SuiteSecret;
      try {
        password = await establishSuitePassword(page, user.email);
      } catch (error) {
        return blockedByPrecondition(testInfo, `a known password for suite user ${user.email}`, error);
      }
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: DEFAULT_VIEWPORT });
      contexts.push(context);
      disableAdminAutoSignIn(context);
      const p = await context.newPage();
      ScreenshotUtils.registerSession(testInfo, p);
      const session: SuiteSession = {
        context,
        page: p,
        user,
        role,
        password,
        users: new UserListPage(p),
        profile: new UserProfilePage(p),
        invitations: new InvitationListPage(p),
        myProfile: new MyProfilePage(p),
        menu: new UserMenu(p),
        signInPage: new SignInPage(p),
        resetPage: new ResetPasswordPage(p),
        policy: new PasswordPolicyTab(p),
      };
      if (spec.signIn === false) return session;
      try {
        await session.signInPage.open();
        await session.signInPage.signIn(user.email, password);
        const payerName = await new PayerScopeDialog(p).chooseIfAsked().catch(() => null);
        if (payerName !== null) Logger.step(`[suiteSession] Scoped session working on "${payerName}"`);
      } catch (error) {
        return blockedByPrecondition(testInfo, `a signed-in suite user (${user.email})`, error);
      }
      Logger.step(`[suiteSession] Signed in as suite user "${user.displayNameEn}" (role "${role.name}")`);
      return session;
    });
    // Closed BEFORE userIn / suiteRole discard the user and role (they are this fixture's dependencies).
    for (const c of contexts) await closeQuietly(c);
  },

  signedOut: async ({ browser }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: DEFAULT_VIEWPORT });
      contexts.push(context);
      disableAdminAutoSignIn(context);
      const p = await context.newPage();
      ScreenshotUtils.registerSession(testInfo, p);
      return { page: p, signIn: new SignInPage(p), reset: new ResetPasswordPage(p), menu: new UserMenu(p), myProfile: new MyProfilePage(p) };
    });
    for (const c of contexts) await closeQuietly(c);
  },

  settingsRestore: async ({ page }, use, testInfo) => {
    let snapshot: PasswordPolicy | null = null;
    const snapshotPolicy = async (): Promise<PasswordPolicy> => {
      if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
      const current = await readPasswordPolicy(page);
      if (snapshot === null) {
        snapshot = current;
        Logger.step(`[settingsRestore] Password policy snapshot: ${JSON.stringify({ ...current, concurrencyStamp: undefined })}`);
      }
      return current;
    };
    await use({
      snapshotPolicy,
      changePolicy: async (changes) => {
        await snapshotPolicy();
        return requestUpdatePasswordPolicy(page, changes);
      },
      restorePolicyNow: async () => (snapshot ? restorePasswordPolicy(page, snapshot) : null),
    });
    if (snapshot !== null) {
      // NOT swallowed: a policy left changed breaks every team's sign-in rules. Fail loudly.
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        await restorePasswordPolicy(page, snapshot);
        Logger.step('[settingsRestore] Password policy restored and read back');
      } catch (error) {
        testInfo.annotations.push({ type: 'setting-not-restored', description: String(error) });
        throw error;
      }
    }
  },

  newSuiteUserName: async ({}, use) => {
    await use(() => {
      const stamp = userStamp();
      const lastName = suiteUserLastName(stamp);
      return { stamp, lastName, displayNameEn: `QA ${lastName}`, email: suiteUserEmail(stamp) };
    });
  },
});

export { listUsers, userSearchKey };
