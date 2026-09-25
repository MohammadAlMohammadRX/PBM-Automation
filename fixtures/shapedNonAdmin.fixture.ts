import { test as base } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { LoginPage } from '../pages/auth/LoginPage';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { PayerMetricsPanel } from '../pages/payer/PayerMetricsPanel';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { NetworkManagementPage } from '../pages/network/NetworkManagementPage';
import { RoleAdministrationPage } from '../pages/system/RoleAdministrationPage';
import { ExportMenu } from '../pages/components/ExportMenu';
import { PayerScopeDialog } from '../pages/components/PayerScopeDialog';
import { DEFAULT_VIEWPORT } from '../constants/BrowserConfig';
import { env } from '../constants/EnvironmentConfig';
import { Logger } from '../utils/Logger';
import {
  PAYER_ADMIN_ROLE,
  PAYER_PERMISSION,
  type PayerPermissionKey,
} from '../data/accounts/payerAdminRole.data';
import { AUTH_STORAGE_STATE_PATH } from '../constants/Paths';
import { blockedByPrecondition } from './testStatus.fixture';
import { permissionsStillHeld, propagationFailure } from '../utils/EffectivePermissions';

/** What a case needs the shaped account to hold and to lack. */
export interface PermissionShape {
  /** Permissions to take OFF the role, so a refusal can be observed. */
  without?: readonly PayerPermissionKey[];
  /** Permissions to ensure are ON, for the granted half of a gate. */
  with?: readonly PayerPermissionKey[];
}

/** A signed-in non-administrator whose role was shaped for this case. */
export interface ShapedSession {
  page: Page;
  payers: PayerManagementPage;
  payerMetrics: PayerMetricsPanel;
  approvals: ApprovalManagementPage;
  networks: NetworkManagementPage;
  exportMenu: ExportMenu;
  /** What was actually changed, so a case can say so in its message. */
  removed: string[];
  granted: string[];
}

/** What was changed on the role, for a case to quote in its message. */
export interface RoleShape {
  removed: string[];
  granted: string[];
}

export interface ShapedNonAdminFixtures {
  shapedNonAdmin: (shape: PermissionShape) => Promise<ShapedSession>;
  /**
   * Reshapes the role WITHOUT signing anyone in.
   *
   * For the cases that already had their own sign-in written - they opt the
   * spec out of the shared session and authenticate as the non-administrator
   * themselves. Those only ever lacked the right ACCOUNT, so the smallest
   * honest change is to give them one: this edits the role from its own
   * administrator window and leaves the case's login exactly as it was.
   */
  shapeRole: (shape: PermissionShape) => Promise<RoleShape>;
}

/**
 * Builds the non-administrator a case needs by EDITING the role it holds.
 *
 * THE PROBLEM THIS SOLVES. Sixty-eight cases prove that an action is refused to
 * someone who lacks a right. The environment offers one non-administrator - a
 * Payer Admin - and it holds nearly every right those cases want withheld, so
 * they all reported BLOCKED. Provisioning eight more accounts would fix it;
 * until that happens, the account we have can be shaped into the account the
 * case needs.
 *
 * HOW IT WORKS. Before the case runs, the ADMINISTRATOR session opens Role
 * Administration, edits the "Payer Admin" role, clears the permissions the case
 * needs absent, and saves. A second browser window then signs in as the Payer
 * Admin and is handed to the case. Afterwards the role is put back exactly as it
 * was found.
 *
 * THE RESTORE IS THE IMPORTANT PART, and it is why the original state is read
 * rather than assumed: this is a SHARED role on a shared environment, and a
 * permission left switched off would silently change what every later case -
 * and every human using that account - is allowed to do. Teardown runs whether
 * the case passed, failed or threw.
 *
 * THE WINDOW SIZE IS NOT INCIDENTAL. Every context opened here is given the
 * suite's own viewport (1920x1080). A context built without one defaults to
 * 1280x720, and at that width Role Administration renders a TABLE instead of
 * role cards - so the role could not be found and every case using this
 * reported BLOCKED against a screen that was working perfectly.
 *
 * ONE RUN AT A TIME. The suite runs with a single worker, so no two cases can be
 * shaping the same role at once. Running this in parallel would have them
 * overwrite each other's setup; if the suite is ever parallelised, these cases
 * need a worker to themselves.
 */
export const test = base.extend<ShapedNonAdminFixtures>({
  shapedNonAdmin: async ({ page, browser }, use, testInfo) => {
    const roles = new RoleAdministrationPage(page);
    /** What was changed, so teardown can put back exactly that. */
    const changed: Array<{ label: string; wanted: boolean }> = [];
    // A LIST rather than one handle: a case may shape the role more than once,
    // and every window it opened has to be closed at the end.
    const opened: BrowserContext[] = [];

    const setPermissions = async (
      entries: ReadonlyArray<{ label: string; wanted: boolean }>,
    ): Promise<string[]> => {
      if (entries.length === 0) return [];
      const privileges = await roles.openPermissionCatalogue(PAYER_ADMIN_ROLE);
      const touched: string[] = [];
      for (const { label, wanted } of entries) {
        const current = await privileges.isPermissionChecked(label);
        if (current === wanted) continue;
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

    await use(async (shape: PermissionShape): Promise<ShapedSession> => {
      const wanted = [
        ...(shape.without ?? []).map((key) => ({ label: PAYER_PERMISSION[key], wanted: false })),
        ...(shape.with ?? []).map((key) => ({ label: PAYER_PERMISSION[key], wanted: true })),
      ];

      // THE BUDGET IS EXTENDED HERE, not in each case. Reshaping the role costs a
      // round trip through Role Administration and a second sign-in - about 60 to
      // 90 seconds before the case does anything of its own. Cases written
      // against the default budget were timing out with every step passing,
      // which reads as a defect and is not one. The cost belongs to whatever
      // causes it, so the fixture pays for it and no spec has to remember.
      testInfo.setTimeout(testInfo.timeout + 180_000);
      let touched: string[] = [];
      try {
        Logger.step(
          `[fixture] Shaping "${PAYER_ADMIN_ROLE}": `
          + `${wanted.map((w) => `${w.wanted ? '+' : '-'}${w.label}`).join(', ')}`,
        );
        touched = await setPermissions(wanted);
        // Remembered AFTER the save, so teardown only undoes what actually took.
        for (const label of touched) {
          const entry = wanted.find((w) => w.label === label);
          if (entry) changed.push({ label, wanted: !entry.wanted });
        }
      } catch (error) {
        blockedByPrecondition(testInfo, `the "${PAYER_ADMIN_ROLE}" role reshaped for this case`, error);
      }

      try {
        const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: DEFAULT_VIEWPORT });
        opened.push(context);
        const shaped = await context.newPage();
        const login = new LoginPage(shaped);
        await login.open();
        await login.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
        // THE SCOPE GATE IS ANSWERED HERE, before the case gets the session. A
        // scoped account is asked which payer it is working with, and until it
        // answers, every payer screen renders no rows. Cases that did not know
        // this failed with "the list should render at least one row" and read
        // as the application over-restricting a role - it was only ever an
        // unanswered question. The administrator never sees it.
        const payerName = await new PayerScopeDialog(shaped).chooseIfAsked();
        if (payerName !== null) Logger.step(`[fixture] Scoped session working on "${payerName}"`);

        // THE SHAPING IS VERIFIED HERE, against the application's own answer -
        // and the answer is ATTACHED, not acted on. The case's expectation is a
        // user-level one: the administrator withdrew the right, so the action
        // must stop being available. If it is still available the expectation is
        // broken and the case FAILS, which is a defect to report. Whether the
        // cause is the screen not gating or the right never reaching the account
        // is for the developers to separate - the evidence for both is recorded
        // here so the report can say exactly what was done and what was seen.
        const stillHeld = await permissionsStillHeld(shaped, shape.without ?? []);
        if (stillHeld.length > 0) {
          Logger.warn(propagationFailure(stillHeld));
          testInfo.annotations.push({ type: 'permission-not-propagated', description: propagationFailure(stillHeld) });
        }
        return {
          page: shaped,
          payers: new PayerManagementPage(shaped),
          payerMetrics: new PayerMetricsPanel(shaped),
          approvals: new ApprovalManagementPage(shaped),
          networks: new NetworkManagementPage(shaped),
          exportMenu: new ExportMenu(shaped),
          removed: (shape.without ?? []).map((key) => PAYER_PERMISSION[key]),
          granted: (shape.with ?? []).map((key) => PAYER_PERMISSION[key]),
        };
      } catch (error) {
        blockedByPrecondition(testInfo, 'a signed-in non-administrator session', error);
        throw error;
      }
    });

    // ---- teardown: hand the role back exactly as it was found ---------------
    for (const context of opened) await context.close();
    if (changed.length > 0) {
      Logger.step(`[fixture] Restoring "${PAYER_ADMIN_ROLE}": ${changed.map((c) => c.label).join(', ')}`);
      // Not swallowed: a failed restore leaves the shared role wrong, and the
      // next case would report a permission defect that does not exist. Better
      // to fail loudly here, where the cause is obvious.
      await setPermissions(changed);
    }
  },
  shapeRole: async ({ browser }, use, testInfo) => {
    // Its OWN administrator window, because the calling spec has opted the
    // shared session out of storage state to sign in as the non-administrator -
    // so the default page is not an administrator and cannot edit a role.
    const admin = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
    const page = await admin.newPage();
    const roles = new RoleAdministrationPage(page);
    const changed: Array<{ label: string; wanted: boolean }> = [];

    const setPermissions = async (
      entries: ReadonlyArray<{ label: string; wanted: boolean }>,
    ): Promise<string[]> => {
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

    await use(async (shape: PermissionShape): Promise<RoleShape> => {
      const wanted = [
        ...(shape.without ?? []).map((key) => ({ label: PAYER_PERMISSION[key], wanted: false })),
        ...(shape.with ?? []).map((key) => ({ label: PAYER_PERMISSION[key], wanted: true })),
      ];
      // The same allowance as the sibling fixture, for the same reason: the role
      // round trip costs a minute or so before the case does anything of its own.
      testInfo.setTimeout(testInfo.timeout + 180_000);
      try {
        Logger.step(
          `[fixture] Shaping "${PAYER_ADMIN_ROLE}": `
          + `${wanted.map((w) => `${w.wanted ? '+' : '-'}${w.label}`).join(', ')}`,
        );
        for (const label of await setPermissions(wanted)) {
          const entry = wanted.find((w) => w.label === label);
          if (entry) changed.push({ label, wanted: !entry.wanted });
        }
      } catch (error) {
        blockedByPrecondition(testInfo, `the "${PAYER_ADMIN_ROLE}" role reshaped for this case`, error);
      }
      return {
        removed: (shape.without ?? []).map((key) => PAYER_PERMISSION[key]),
        granted: (shape.with ?? []).map((key) => PAYER_PERMISSION[key]),
      };
    });

    if (changed.length > 0) {
      Logger.step(`[fixture] Restoring "${PAYER_ADMIN_ROLE}": ${changed.map((c) => c.label).join(', ')}`);
      await setPermissions(changed);
    }
    await admin.close();
  },
});
