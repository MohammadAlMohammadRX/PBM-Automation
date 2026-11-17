import { test as base } from '@playwright/test';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { LoginPage } from '../pages/auth/LoginPage';
import { disableAdminAutoSignIn } from '../pages/BasePage';
import { LanguageSwitcher } from '../pages/components/LanguageSwitcher';
import { PayerScopeDialog } from '../pages/components/PayerScopeDialog';
import { AnnouncementBell, NotificationBell } from '../pages/notification/InboxBells';
import { AnnouncementDetailPage, NotificationDetailPage } from '../pages/notification/DetailPages';
import { NotificationSettingsPanel } from '../pages/notification/NotificationSettingsPanel';
import { AnnouncementsTab, DefinitionsTab, NotificationCenterPage, TriggersTab } from '../pages/notification/NotificationCenterPage';
import {
  AnnouncementDrawer,
  AnnouncementRescheduleDrawer,
  AnnouncementViewDrawer,
  DefinitionDrawer,
  TriggerDrawer,
} from '../pages/notification/Drawers';
import { DEFAULT_VIEWPORT } from '../constants/BrowserConfig';
import { env } from '../constants/EnvironmentConfig';
import { Logger } from '../utils/Logger';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';
import { createSuiteRole, discardSuiteRole, type ProvisionedRole, type SuiteRoleSpec } from '../utils/UserProvisioning';
import { blockedByPrecondition } from './testStatus.fixture';
import {
  SUITE_ANNOUNCEMENT_PREFIX,
  SUITE_DEFINITION_PREFIX,
  SUITE_TRIGGER_PREFIX,
  TRIGGER_MODULE,
  actionVariablesNc,
  announcementBody,
  createDefinition,
  deleteSuiteDefinition,
  deleteSuiteTrigger,
  discardSuiteAnnouncement,
  freeTriggerActions,
  listAnnouncements,
  listDefinitions,
  listTriggers,
  ncStamp,
  onApp,
  readAnnouncement,
  readTrigger,
  requestCreateAnnouncement,
  requestCreateTrigger,
  triggerBody,
  userAudience,
  userIdByEmail,
  type AnnouncementAudience,
  type AnnouncementRecord,
  type DefinitionSpec,
  type TriggerRecord,
  type TriggerSpec,
} from '../utils/notification/notificationApi';
import {
  PREFERRED_LANGUAGE,
  SECOND_USER_HOME_ROLE,
  readSecondUser,
  restoreSecondUser,
  snapshotOf,
  updateSecondUser,
  type SecondUserSnapshot,
} from '../utils/notification/secondUserAccount';
import {
  describeSettings,
  differingKeys,
  isGuardedNotificationKey,
  readNotificationSettings,
  restoreNotificationSettings,
} from '../utils/notification/notificationSettings';
import { upsertSettings, type UpsertAnswer } from '../utils/settings/systemSettingsApi';
import { NetworkUtils } from '../utils/NetworkUtils';
import { ApiEndpoints } from '../constants/ApiEndpoints';

/**
 * Notification Center Management fixtures (Feature 20980, foundation 2026-11-11).
 * See reports/notification/Notification-Foundation-Notes.md.
 *
 * ACCOUNTS. The suite runs as careconnect (ADMIN_*, role Admin, may approve its
 * own requests). The SECOND USER is maalmohammad@neorx.co (NON_ADMIN_*,
 * Organization Administrator, may NOT approve its own requests, small inbox):
 * `secondUser` signs it in from its own browser context and may change its
 * roles / language for a case - always put back and READ BACK at teardown.
 *
 * SHARED RECORDS. Triggers, definitions and announcements are GLOBAL: the
 * suite only ever edits / toggles / deletes / cancels its OWN records (names
 * "QA Automation Trigger ...", "QA Automation Notification ...",
 * "QA Automation Announcement ..."). Their audiences are only careconnect,
 * maalmohammad or a suite role. Published announcements cannot be deleted -
 * teardown CANCELS them (they stay listed as Cancelled) and reports them as
 * `leftover` annotations.
 */

// ---- suite records --------------------------------------------------------------------

export interface SuiteTriggers {
  /**
   * Creates a suite trigger through the API (the Add drawer's body). Default:
   * INACTIVE, on the first FREE action (no trigger uses it yet) - Approval or
   * Member Management first - with one English SMS template naming the
   * action's required variables. BLOCKS the case with the answer when refused.
   */
  create(spec?: Partial<TriggerSpec>): Promise<TriggerRecord>;
  /** Remembers the current suite triggers so ones the CASE adds through the screen are deleted at teardown too. */
  watch(): Promise<void>;
  /** A fresh suite name (`QA Automation Trigger <stamp>`; the screen allows 50 characters). */
  newName(label?: string): string;
}

export interface SuiteDefinitions {
  /**
   * Creates a suite App Notification (definition) through the API. Default:
   * INACTIVE, audience = careconnect (Users). `moduleId` / `actionId` /
   * messages are the caller's. BLOCKS when refused.
   */
  create(spec: Partial<DefinitionSpec> & Pick<DefinitionSpec, 'moduleId' | 'actionId'>): Promise<{ id: string; name: string }>;
  watch(): Promise<void>;
  /** `QA Automation Notification <stamp>` (screen max 200). */
  newName(label?: string): string;
}

export interface SuiteAnnouncements {
  /**
   * Creates a suite announcement through the API. Default: SCHEDULED three
   * days ahead (deletable) for careconnect. `publishAt: new Date()` publishes
   * at the next job run (about a minute). BLOCKS when refused.
   */
  create(spec?: { name?: string; englishMessage?: string; arabicMessage?: string; publishAt?: Date | string; audiences?: AnnouncementAudience[] }): Promise<AnnouncementRecord>;
  watch(): Promise<void>;
  /** `QA Automation Announcement <stamp>` (screen max 200). */
  newName(label?: string): string;
  /** careconnect's user id (the default audience). */
  adminUserId(): Promise<string>;
}

// ---- second user -----------------------------------------------------------------------

export interface SecondUser {
  /** The second user's page (changes after a re-sign-in - always read it from here). */
  readonly page: Page;
  readonly context: BrowserContext;
  /** maalmohammad's user id / e-mail. */
  readonly id: string;
  readonly email: string;
  /** Display name as the audience pickers show it ("Payer Admin" on 2026-11-11). */
  readonly displayName: string;
  /** What the account held before the test (roles, language) - restored at teardown. */
  readonly original: SecondUserSnapshot;
  readonly notificationBell: NotificationBell;
  readonly announcementBell: AnnouncementBell;
  readonly notificationDetail: NotificationDetailPage;
  readonly announcementDetail: AnnouncementDetailPage;
  readonly center: NotificationCenterPage;
  readonly triggers: TriggersTab;
  readonly definitions: DefinitionsTab;
  readonly announcements: AnnouncementsTab;
  readonly language: LanguageSwitcher;
  /** The audience entry for this user (definitions / announcements). */
  audience(): AnnouncementAudience;
  /**
   * Gives the account ONLY a suite role with exactly `rights` (permission
   * keys, e.g. 'Announcement.GetAnnouncements') and signs it in again.
   * BLOCKED when the role cannot be made or assigned.
   */
  withRights(rights: readonly string[]): Promise<ProvisionedRole>;
  /** Same with a full role spec (payer-scoped etc.). */
  withRoleSpec(spec: Partial<SuiteRoleSpec> & { rights: readonly string[] }): Promise<ProvisionedRole>;
  /**
   * Switches the UI language of the second user's session (header toggle) AND
   * its profile's preferred language (record) - both restored at teardown.
   */
  setLanguage(lang: 'ar' | 'en'): Promise<void>;
  /** Signs the account in again in a FRESH context (rights are read at sign-in). */
  signInAgain(): Promise<void>;
  /** Puts roles / language back now (teardown does it anyway) and reads them back. */
  restoreNow(): Promise<void>;
}

// ---- settings guard --------------------------------------------------------------------

export interface NotificationSettingsGuard {
  /** Notifi.* / NotifiConfig.* / SMTP.* / Jobs.* / Engine.JobFailureNotificationEmail before the test (never a secret). */
  readonly original: Readonly<Record<string, string>>;
  current(): Promise<Record<string, string>>;
  /** Upserts guarded keys through the API (refuses any other key). */
  set(changes: Record<string, string>): Promise<UpsertAnswer>;
  /** Restores now and reads back; throws when it cannot. */
  restoreNow(): Promise<void>;
}

export interface NotificationModuleFixtures {
  suiteTriggers: SuiteTriggers;
  suiteDefinitions: SuiteDefinitions;
  suiteAnnouncements: SuiteAnnouncements;
  secondUser: SecondUser;
  notificationSettingsGuard: NotificationSettingsGuard;
  // page objects on the admin page
  ncCenter: NotificationCenterPage;
  ncTriggers: TriggersTab;
  ncDefinitions: DefinitionsTab;
  ncAnnouncements: AnnouncementsTab;
  ncTriggerDrawer: TriggerDrawer;
  ncDefinitionDrawer: DefinitionDrawer;
  ncAnnouncementDrawer: AnnouncementDrawer;
  ncAnnouncementView: AnnouncementViewDrawer;
  ncRescheduleDrawer: AnnouncementRescheduleDrawer;
  notificationBell: NotificationBell;
  announcementBell: AnnouncementBell;
  notificationDetail: NotificationDetailPage;
  announcementDetail: AnnouncementDetailPage;
  /** The notification / SMTP fields of the General Edit drawer (open it with settingsHub.openEdit()). */
  ncSettingsPanel: NotificationSettingsPanel;
}

const leftover = (testInfo: TestInfo, description: string): void => {
  testInfo.annotations.push({ type: 'leftover', description });
  Logger.warn(`[notification leftover] ${description}`);
};

/** careconnect's user id - the admin page's own record (GET Manage/GetCurrentUser), cached per worker. */
let adminIdCache = '';
async function adminUserId(page: Page): Promise<string> {
  if (adminIdCache) return adminIdCache;
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.manageCurrentUser);
  const me = (JSON.parse(res.text) as { payload?: { id?: string; email?: string } }).payload;
  adminIdCache = me?.id ?? (me?.email ? await userIdByEmail(page, me.email) : '');
  if (!adminIdCache) throw new Error(`GetCurrentUser answered ${res.status} without an id for the admin session`);
  return adminIdCache;
}

export const test = base.extend<NotificationModuleFixtures>({
  // ---- suite triggers ------------------------------------------------------------------
  suiteTriggers: async ({ page }, use, testInfo) => {
    let before: Set<string> | null = null;
    const made = new Set<string>();
    const watch = async (): Promise<void> => {
      if (before) return;
      await onApp(page);
      before = new Set((await listTriggers(page, { searchText: SUITE_TRIGGER_PREFIX })).items.map((t) => t.id));
    };
    await use({
      watch,
      newName: (label = '') => `${SUITE_TRIGGER_PREFIX}${label ? ` ${label}` : ''} ${ncStamp()}`.slice(0, 50),
      create: async (spec = {}) => {
        await watch();
        try {
          let { moduleId, actionId } = spec;
          if (!moduleId || !actionId) {
            const free = await freeTriggerActions(page);
            const order = [TRIGGER_MODULE.approvalManagement, TRIGGER_MODULE.memberManagement, TRIGGER_MODULE.userManagement];
            const pickAction = order.map((m) => free.find((a) => a.parentItemId === m)).find(Boolean);
            if (!pickAction) throw new Error('no free trigger action is left (every action already has a trigger)');
            moduleId = pickAction.parentItemId ?? '';
            actionId = pickAction.id;
          }
          const body = await triggerBody(page, { ...spec, moduleId, actionId });
          const answer = await requestCreateTrigger(page, body);
          if (answer.status >= 300 || !answer.id) throw new Error(`CreateTrigger answered ${answer.status}: ${answer.errors.join('; ') || answer.text.slice(0, 200)}`);
          made.add(answer.id);
          const record = await readTrigger(page, answer.id);
          if (!record) throw new Error(`CreateTrigger answered ${answer.status} but GetTrigger ${answer.id} found nothing`);
          Logger.step(`[suiteTriggers] Created "${record.name}" (${record.isActive ? 'active' : 'inactive'})`);
          return record;
        } catch (error) {
          return blockedByPrecondition(testInfo, `a suite trigger ${JSON.stringify(spec).slice(0, 160)}`, error);
        }
      },
    });
    if (!before && made.size === 0) return;
    await onApp(page).catch(() => undefined);
    const now = await listTriggers(page, { searchText: SUITE_TRIGGER_PREFIX }).catch(() => ({ items: [], totalRows: 0 }));
    const known: Set<string> = before ?? new Set<string>();
    const doomed = new Set<string>([...made, ...now.items.filter((t) => !known.has(t.id) && t.name.startsWith(SUITE_TRIGGER_PREFIX)).map((t) => t.id)]);
    for (const id of doomed) {
      const res = await deleteSuiteTrigger(page, id).catch((e: unknown) => ({ status: 0, text: String(e), errors: [] }));
      if (res && res.status >= 300 && res.status !== 404) leftover(testInfo, `suite trigger ${id} could not be deleted (${res.status}: ${res.text.slice(0, 120)})`);
    }
  },

  // ---- suite definitions ---------------------------------------------------------------
  suiteDefinitions: async ({ page }, use, testInfo) => {
    let before: Set<string> | null = null;
    const made = new Set<string>();
    const watch = async (): Promise<void> => {
      if (before) return;
      await onApp(page);
      before = new Set((await listDefinitions(page)).filter((d) => d.name.startsWith(SUITE_DEFINITION_PREFIX)).map((d) => d.id));
    };
    await use({
      watch,
      newName: (label = '') => `${SUITE_DEFINITION_PREFIX}${label ? ` ${label}` : ''} ${ncStamp()}`,
      create: async (spec) => {
        await watch();
        try {
          const audiences = spec.audiences ?? [userAudience(await adminUserId(page), 'CareConnect Admin User')];
          // The app refuses a definition whose message bodies leave out a variable the action marks
          // Required ("Every message body must use the required variable(s) ..." - a business rule, full
          // run 2026-11-12). Setup definitions get the missing required tags appended, so provisioning
          // never BLOCKS a case for a reason that is not the case's own.
          const required = (await actionVariablesNc(page, spec.actionId)).filter((v) => v.isRequired).map((v) => `{{${v.name}}}`);
          const withRequired = (text: string): string => [text, ...required.filter((tag) => !text.includes(tag))].join(' ').trim();
          const made1 = await createDefinition(page, {
            name: spec.name ?? `${SUITE_DEFINITION_PREFIX} ${ncStamp()}`,
            moduleId: spec.moduleId,
            actionId: spec.actionId,
            englishMessageTemplate: withRequired(spec.englishMessageTemplate ?? 'QA automation notification'),
            arabicMessageTemplate: withRequired(spec.arabicMessageTemplate ?? 'إشعار اختبار آلي'),
            notesTemplate: spec.notesTemplate ?? null,
            description: spec.description ?? null,
            isActive: spec.isActive ?? false,
            audiences,
          });
          if (made1.answer.status >= 300 || !made1.id) throw new Error(`CreateDefinition answered ${made1.answer.status}: ${made1.answer.validationErrors.join('; ') || made1.answer.text.slice(0, 200)}`);
          made.add(made1.id);
          return { id: made1.id, name: made1.name };
        } catch (error) {
          return blockedByPrecondition(testInfo, `a suite app notification ${JSON.stringify(spec).slice(0, 160)}`, error);
        }
      },
    });
    if (!before && made.size === 0) return;
    await onApp(page).catch(() => undefined);
    const now = await listDefinitions(page).catch(() => [] as { id: string; name: string }[]);
    const known: Set<string> = before ?? new Set<string>();
    const doomed = new Set<string>([...made, ...now.filter((d) => !known.has(d.id) && d.name.startsWith(SUITE_DEFINITION_PREFIX)).map((d) => d.id)]);
    for (const id of doomed) {
      const res = await deleteSuiteDefinition(page, id).catch((e: unknown) => ({ status: 0, text: String(e), validationErrors: [] }));
      if (res && res.status >= 300 && res.status !== 404) leftover(testInfo, `suite app notification ${id} could not be deleted (${res.status}: ${res.text.slice(0, 120)})`);
    }
  },

  // ---- suite announcements -------------------------------------------------------------
  suiteAnnouncements: async ({ page }, use, testInfo) => {
    let before: Set<string> | null = null;
    const made = new Set<string>();
    const watch = async (): Promise<void> => {
      if (before) return;
      await onApp(page);
      before = new Set((await listAnnouncements(page, { searchText: SUITE_ANNOUNCEMENT_PREFIX })).items.map((a) => a.id));
    };
    await use({
      watch,
      newName: (label = '') => `${SUITE_ANNOUNCEMENT_PREFIX}${label ? ` ${label}` : ''} ${ncStamp()}`,
      adminUserId: async () => {
        await onApp(page);
        return adminUserId(page);
      },
      create: async (spec = {}) => {
        await watch();
        try {
          const audiences = spec.audiences ?? [userAudience(await adminUserId(page), 'CareConnect Admin User')];
          const body = announcementBody({ ...spec, publishAt: spec.publishAt ?? new Date(Date.now() + 3 * 86_400_000), audiences });
          const answer = await requestCreateAnnouncement(page, body);
          if (answer.status >= 300 || !answer.id) throw new Error(`CreateAnnouncement answered ${answer.status}: ${answer.errors.join('; ') || answer.text.slice(0, 200)}`);
          made.add(answer.id);
          const record = await readAnnouncement(page, answer.id);
          if (!record) throw new Error(`GetAnnouncement ${answer.id} found nothing`);
          Logger.step(`[suiteAnnouncements] Created "${record.name}" (${record.status}, publish ${record.publishAt})`);
          return record;
        } catch (error) {
          return blockedByPrecondition(testInfo, `a suite announcement ${JSON.stringify(spec).slice(0, 160)}`, error);
        }
      },
    });
    if (!before && made.size === 0) return;
    await onApp(page).catch(() => undefined);
    const now = await listAnnouncements(page, { searchText: SUITE_ANNOUNCEMENT_PREFIX }).catch(() => ({ items: [], totalRows: 0 }));
    const known: Set<string> = before ?? new Set<string>();
    const doomed = new Set<string>([...made, ...now.items.filter((a) => !known.has(a.id) && a.name.startsWith(SUITE_ANNOUNCEMENT_PREFIX)).map((a) => a.id)]);
    for (const id of doomed) {
      const outcome = await discardSuiteAnnouncement(page, id).catch(() => 'left' as const);
      Logger.step(`[suiteAnnouncements] ${id}: ${outcome}`);
      if (outcome === 'cancelled' || outcome === 'already-cancelled') leftover(testInfo, `suite announcement ${id} stays listed as Cancelled (a published announcement cannot be deleted)`);
      if (outcome === 'left') leftover(testInfo, `suite announcement ${id} could not be deleted or cancelled - remove it by hand`);
    }
  },

  // ---- second user ----------------------------------------------------------------------
  secondUser: async ({ page, browser }, use, testInfo) => {
    testInfo.setTimeout(testInfo.timeout + 120_000);
    if (!env.nonAdminUsername || !env.nonAdminPassword) blockedByPrecondition(testInfo, 'the second user (NON_ADMIN_* in .env)', new Error('NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not set'));
    await onApp(page);
    let snapshot: SecondUserSnapshot;
    let displayName = '';
    try {
      const record = await readSecondUser(page);
      snapshot = snapshotOf(record);
      // Kept as stored ("Payer  Admin", double space): the Assign window's search only finds it that way.
      // The cards / bells collapse the spaces - compare their text with the name whitespace-collapsed.
      displayName = record.fullEnglishName;
      Logger.step(`[secondUser] Snapshot: roles [${snapshot.roleNames.join(', ')}], language ${snapshot.preferredLanguageId}`);
    } catch (error) {
      return blockedByPrecondition(testInfo, 'the second user record', error);
    }
    const roles: string[] = [];
    let context: BrowserContext | null = null;
    let p: Page | null = null;

    const signIn = async (): Promise<void> => {
      if (context) await context.close().catch(() => undefined);
      context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: DEFAULT_VIEWPORT });
      disableAdminAutoSignIn(context);
      p = await context.newPage();
      ScreenshotUtils.registerSession(testInfo, p);
      const login = new LoginPage(p);
      await login.open();
      Logger.step(`[secondUser] Signing in "${env.nonAdminUsername}"`);
      await login.login(env.nonAdminUsername, env.nonAdminPassword);
      await p.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60_000 });
      await p.waitForLoadState('domcontentloaded');
      const payer = await new PayerScopeDialog(p).chooseIfAsked().catch(() => null);
      if (payer !== null) Logger.step(`[secondUser] Scoped session working on "${payer}"`);
    };

    try {
      await signIn();
    } catch (error) {
      if (context) await (context as BrowserContext).close().catch(() => undefined);
      return blockedByPrecondition(testInfo, `a signed-in second user (${env.nonAdminUsername})`, error);
    }

    const giveRole = async (spec: Partial<SuiteRoleSpec> & { rights: readonly string[] }): Promise<ProvisionedRole> => {
      try {
        const role = await createSuiteRole(page, { rights: spec.rights, hasAssignedPayers: spec.hasAssignedPayers, isActive: spec.isActive, assignableRoleIds: spec.assignableRoleIds, name: spec.name });
        roles.push(role.id);
        const res = await updateSecondUser(page, { assignedRoles: [{ roleId: role.id, payerIds: [] }] });
        if (res.status >= 300) throw new Error(`UpdateUser answered ${res.status}: ${res.text.slice(0, 200)}`);
        const after = snapshotOf(await readSecondUser(page));
        if (after.roles.length !== 1 || after.roles[0].roleId !== role.id) throw new Error(`the second user holds [${after.roleNames.join(', ')}] after the update, not only "${role.name}"`);
        await signIn();
        Logger.step(`[secondUser] Now holds only "${role.name}" (${spec.rights.length} rights) and is signed in again`);
        return role;
      } catch (error) {
        return blockedByPrecondition(testInfo, `the second user holding only a suite role with ${JSON.stringify(spec.rights).slice(0, 200)}`, error);
      }
    };

    const current = (): Page => p as Page;
    const objects = <T>(make: (pg: Page) => T): (() => T) => {
      let cachePage: Page | null = null;
      let cache: T | null = null;
      return () => {
        if (cachePage !== current() || cache === null) {
          cachePage = current();
          cache = make(cachePage);
        }
        return cache;
      };
    };
    const nb = objects((pg) => new NotificationBell(pg));
    const ab = objects((pg) => new AnnouncementBell(pg));
    const nd = objects((pg) => new NotificationDetailPage(pg));
    const ad = objects((pg) => new AnnouncementDetailPage(pg));
    const cp = objects((pg) => new NotificationCenterPage(pg));
    const tt = objects((pg) => new TriggersTab(pg));
    const dt = objects((pg) => new DefinitionsTab(pg));
    const at = objects((pg) => new AnnouncementsTab(pg));
    const ls = objects((pg) => new LanguageSwitcher(pg));

    const restore = async (): Promise<void> => {
      await onApp(page);
      await restoreSecondUser(page, snapshot);
    };

    const user: SecondUser = {
      get page() {
        return current();
      },
      get context() {
        return context as BrowserContext;
      },
      id: snapshot.id,
      email: snapshot.email,
      displayName,
      original: snapshot,
      get notificationBell() {
        return nb();
      },
      get announcementBell() {
        return ab();
      },
      get notificationDetail() {
        return nd();
      },
      get announcementDetail() {
        return ad();
      },
      get center() {
        return cp();
      },
      get triggers() {
        return tt();
      },
      get definitions() {
        return dt();
      },
      get announcements() {
        return at();
      },
      get language() {
        return ls();
      },
      audience: () => userAudience(snapshot.id, displayName),
      withRights: (rights) => giveRole({ rights }),
      withRoleSpec: (spec) => giveRole(spec),
      setLanguage: async (lang) => {
        const res = await updateSecondUser(page, { preferredLanguageId: PREFERRED_LANGUAGE[lang] });
        if (res.status >= 300) blockedByPrecondition(testInfo, `the second user's preferred language ${lang}`, new Error(`UpdateUser answered ${res.status}`));
        await ls().switchTo(lang);
      },
      signInAgain: signIn,
      restoreNow: restore,
    };

    try {
      await use(user);
    } finally {
      // ALWAYS: put the account back (home role guaranteed) and read it back, even when the test threw.
      if (context) await (context as BrowserContext).close().catch(() => undefined);
      let restoreError: unknown = null;
      try {
        await restore();
      } catch (error) {
        restoreError = error;
        testInfo.annotations.push({ type: 'second-user-not-restored', description: String(error) });
        Logger.error(`[secondUser] ${String(error)}`);
      }
      for (const id of roles.reverse()) {
        const outcome = await discardSuiteRole(page, id).catch(() => 'left' as const);
        if (outcome === 'left') leftover(testInfo, `suite role ${id} could not be deleted`);
      }
      if (restoreError) throw restoreError;
      Logger.step(`[secondUser] Ends with roles [${snapshot.roleNames.join(', ')}] (home role "${SECOND_USER_HOME_ROLE}")`);
    }
  },

  // ---- global settings guard -----------------------------------------------------------
  notificationSettingsGuard: async ({ page }, use, testInfo) => {
    await onApp(page);
    const original = await readNotificationSettings(page);
    Logger.step(`[notificationSettingsGuard] Original: ${describeSettings(original)}`);
    await use({
      original,
      current: () => readNotificationSettings(page),
      set: async (changes) => {
        const bad = Object.keys(changes).filter((k) => !isGuardedNotificationKey(k) || !(k in original));
        if (bad.length) throw new Error(`notificationSettingsGuard.set refuses keys it does not guard: ${bad.join(', ')}`);
        return upsertSettings(page, Object.entries(changes).map(([key, value]) => ({ key, value })));
      },
      restoreNow: async () => {
        await restoreNotificationSettings(page, original);
      },
    });
    try {
      await onApp(page);
      const restored = await restoreNotificationSettings(page, original);
      if (restored.length) Logger.step(`[notificationSettingsGuard] Restored and read back: ${restored.join(', ')}`);
      const still = differingKeys(await readNotificationSettings(page), original);
      if (still.length) throw new Error(`NOT RESTORED after read-back: ${still.join(', ')}`);
    } catch (error) {
      testInfo.annotations.push({ type: 'setting-not-restored', description: String(error) });
      Logger.error(`[notificationSettingsGuard] ${String(error)}`);
      throw error;
    }
  },

  // ---- page objects (admin page) -------------------------------------------------------
  ncCenter: async ({ page }, use) => {
    await use(new NotificationCenterPage(page));
  },
  ncTriggers: async ({ page }, use) => {
    await use(new TriggersTab(page));
  },
  ncDefinitions: async ({ page }, use) => {
    await use(new DefinitionsTab(page));
  },
  ncAnnouncements: async ({ page }, use) => {
    await use(new AnnouncementsTab(page));
  },
  ncTriggerDrawer: async ({ page }, use) => {
    await use(new TriggerDrawer(page));
  },
  ncDefinitionDrawer: async ({ page }, use) => {
    await use(new DefinitionDrawer(page));
  },
  ncAnnouncementDrawer: async ({ page }, use) => {
    await use(new AnnouncementDrawer(page));
  },
  ncAnnouncementView: async ({ page }, use) => {
    await use(new AnnouncementViewDrawer(page));
  },
  ncRescheduleDrawer: async ({ page }, use) => {
    await use(new AnnouncementRescheduleDrawer(page));
  },
  notificationBell: async ({ page }, use) => {
    await use(new NotificationBell(page));
  },
  announcementBell: async ({ page }, use) => {
    await use(new AnnouncementBell(page));
  },
  notificationDetail: async ({ page }, use) => {
    await use(new NotificationDetailPage(page));
  },
  announcementDetail: async ({ page }, use) => {
    await use(new AnnouncementDetailPage(page));
  },
  ncSettingsPanel: async ({ page }, use) => {
    await use(new NotificationSettingsPanel(page));
  },
});

export { announcementBody, SUITE_ANNOUNCEMENT_PREFIX, SUITE_DEFINITION_PREFIX, SUITE_TRIGGER_PREFIX };
