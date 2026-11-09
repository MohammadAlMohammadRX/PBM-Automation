import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import { AppRoutes } from '../../../constants/AppRoutes';
import { Timeouts } from '../../../constants/Timeouts';
import { SIGN_IN, USER_MENU } from '../../../constants/user/userIds';
import {
  BLOCKED_CASES,
  CASES,
  ERROR_TEXT,
  LOGOUT_LABEL,
  RAPID_CLICKS,
  SESSION_WAIT_BLOCKED,
  SIGN_OUT_EVENT,
  SIGN_OUT_EVERYWHERE,
  WARNING_LEAD_SECONDS,
} from '../../../data/user/logoutAndSessionExpiry.data';
import { toastMessages } from '../../../pages/user/userCommon';
import { ScreenshotUtils } from '../../../utils/ScreenshotUtils';
import {
  allowWait,
  auditEntriesFor,
  auditText,
  clickDashboardLink,
  idleUntil,
  isAppShellShown,
  isSignInUrl,
  menuTriggerPosition,
  rapidLogout,
  readMenuLogout,
  readNonExpiryDialog,
  sessionCallStatus,
  settleScreen,
  tokenSecondsLeft,
  waitForSignInOrExpired,
} from '../../../utils/user/writerEHelpers';

/** The Logout entry of a window's header menu ("same option, same place"). */
async function logoutEntry(page: Page): Promise<string> {
  const menu = await readMenuLogout(page);
  expect(menu.logoutShown, `the menu entries: ${menu.items.join(', ') || 'none'}`).toBe(true);
  expect(menu.logoutText, 'the Logout label').toMatch(LOGOUT_LABEL);
  return menu.logoutText;
}

/**
 * User story 20427 (logout half): Logout. Every Logout happens in a SUITE
 * user's window - the administrator's window only reads its menu and the audit
 * log (its Logout would end the session the rest of the run uses). Windows that
 * logged out are driven by raw navigation only (see the data file).
 */
test.describe('US 20427 - Logout and Session Expiry - logout', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.logoutOnEveryScreen.azureId}: should offer Logout in the header user menu on every screen`, async ({
    page,
    steps,
    userListPage,
    invitationListPage,
    myProfilePage,
  }) => {
    let home: { x: number; y: number } | null = null;

    await steps.critical("Navigate to the User Management module - the module loads with the signed-in user's workspace visible", async () => {
      await userListPage.openTable();
      expect(await isAppShellShown(page), 'the authenticated header').toBe(true);
    });

    await steps.step('Open the user menu in the page header - the menu expands showing a Logout option', async () => {
      await logoutEntry(page);
      home = await menuTriggerPosition(page);
      expect(home, 'the user menu in the header').not.toBeNull();
    });

    await steps.step('Navigate to at least three different screens and open the user menu on each - the Logout option is present and in the same location on every screen', async () => {
      const screens: [string, () => Promise<void>][] = [
        ['Dashboard', async () => {
          await page.goto(AppRoutes.dashboard, { waitUntil: 'domcontentloaded' });
          expect(await settleScreen(page), 'the Dashboard').toBe('app');
        }],
        ['Invitations', () => invitationListPage.open()],
        ['My Profile', () => myProfilePage.open()],
      ];
      for (const [name, open] of screens) {
        await open();
        await logoutEntry(page);
        expect(await menuTriggerPosition(page), `the user menu's place on ${name}`).toEqual(home);
      }
    });
  });

  test(`TC-${CASES.logoutEndsSession.azureId}: should end the session at once and return to the sign-in page when Logout is selected`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical("Navigate to the User Management module - the module loads showing the user's active session", async () => {
      await s.users.openTable();
      expect(await isAppShellShown(s.page), 'the authenticated header').toBe(true);
    });

    await steps.critical('Open the user menu in the page header - the menu displays the Logout option', async () => {
      expect(await logoutEntry(s.page), 'the Logout entry').toMatch(LOGOUT_LABEL);
    });

    await steps.critical('Select Logout - the session ends immediately and the platform redirects to the sign-in page', async () => {
      const out = await s.menu.logout();
      expect(out.status, 'Account/Logout answered').toBe(200);
      expect(out.path, 'the page after Logout').toBe(AppRoutes.login);
      expect(await s.menu.hasSession(), 'a session token left in the browser').toBe(false);
    });

    await steps.step('Attempt to navigate back to the previously open authenticated page using browser back - the sign-in page is shown instead', async () => {
      await s.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
      expect(await settleScreen(s.page), `the screen after Back (${s.page.url()})`).toBe('login');
      expect(isSignInUrl(s.page), `the URL ${s.page.url()}`).toBe(true);
      expect(await isAppShellShown(s.page), 'no authenticated content').toBe(false);
    });
  });

  test(`TC-${CASES.logoutOffline.azureId}: should log out and return to the sign-in page even when the backend is unreachable`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    try {
      await steps.critical("Navigate to the User Management module - the module loads showing the user's active session", async () => {
        await s.users.openTable();
        expect(await isAppShellShown(s.page), 'the authenticated header').toBe(true);
      });

      await steps.critical('Simulate the platform backend becoming unreachable - the application gets no response from the backend', async () => {
        await s.page.route('**/api/**', (route) => route.abort('internetdisconnected'));
        const reached = await s.page.evaluate(async () => {
          try {
            await fetch('/api/Manage/GetCurrentUser');
            return true;
          } catch {
            return false;
          }
        });
        expect(reached, 'an API call reached the backend').toBe(false);
      });

      await steps.critical('Open the user menu and select Logout - the client ends the local session immediately without waiting for the backend', async () => {
        await s.menu.open();
        const started = Date.now();
        await s.page.locator(`#${USER_MENU.logout}`).click();
        await s.page.waitForURL(new RegExp(AppRoutes.login), { timeout: 15_000 }).catch(() => undefined);
        const tookMs = Date.now() - started;
        expect(await s.menu.hasSession(), `a session token left in the browser (${tookMs} ms after Logout)`).toBe(false);
      });

      await steps.step('Observe the resulting page - the user is returned to the sign-in page despite the backend being unreachable', async () => {
        expect(isSignInUrl(s.page), `the URL ${s.page.url()}`).toBe(true);
        await expect(s.page.locator(`#${SIGN_IN.email}`), 'the sign-in form').toBeVisible({ timeout: Timeouts.default });
      });
    } finally {
      await s.page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);
    }
  });

  test(`TC-${CASES.signOutAudited.azureId}: should record every manual sign-out for audit`, async ({ page, steps, suiteSession, auditLogsPage }) => {
    const since = new Date().toISOString();
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      await s.users.openTable();
      expect(await isAppShellShown(s.page), 'the authenticated header').toBe(true);
    });

    await steps.critical('Open the user menu and select Logout - the session ends and the sign-in page is shown', async () => {
      const out = await s.menu.logout();
      expect(out.path, `the page after Logout (Account/Logout ${out.status})`).toBe(AppRoutes.login);
    });

    await steps.critical('As an administrator, open the audit log for the affected user - the audit log view loads', async () => {
      await auditLogsPage.open();
    });

    await steps.step('Locate the entry for the sign-out just performed - an audit record exists with the correct user, timestamp and sign-out event type', async () => {
      let entries = await auditEntriesFor(page, s.user, since);
      await expect.poll(async () => {
        entries = await auditEntriesFor(page, s.user, since);
        return entries.filter((e) => SIGN_OUT_EVENT.test(auditText(e))).length;
      }, { timeout: 45_000, message: `a sign-out entry about ${s.user.email} (entries: ${entries.map((e) => `${e.actionType}/${e.entityType}`).join(', ') || 'none'})` }).toBeGreaterThan(0);
      const entry = entries.find((e) => SIGN_OUT_EVENT.test(auditText(e)));
      expect(Date.parse(entry?.occurredAtUtc ?? ''), 'the entry time').toBeGreaterThanOrEqual(Date.parse(since) - 60_000);
    });
  });

  test(`TC-${CASES.noSignOutEverywhere.azureId}: should end only the current session on Logout and offer no sign-out of every device`, async ({ steps, suiteSession, signedOut }) => {
    const deviceA = await suiteSession();
    const deviceB = await signedOut();

    await steps.critical('Navigate to the User Management module on Device A while also signed in on Device B - both devices show active independent sessions', async () => {
      await deviceA.users.openTable();
      await deviceB.signIn.open();
      await deviceB.signIn.signIn(deviceA.user.email, deviceA.password);
      expect(await isAppShellShown(deviceA.page), 'Device A signed in').toBe(true);
      expect(await settleScreen(deviceB.page), 'Device B signed in').toBe('app');
    });

    await steps.step('Open the user menu on Device A and review the options - only a single-session Logout is available, no "sign out of all devices"', async () => {
      const menu = await readMenuLogout(deviceA.page);
      expect(menu.logoutShown, `the menu entries: ${menu.items.join(', ')}`).toBe(true);
      expect(menu.items.filter((i) => SIGN_OUT_EVERYWHERE.test(i)), 'an every-device sign-out option').toEqual([]);
    });

    await steps.critical('Select Logout on Device A - only the session on Device A ends', async () => {
      const out = await deviceA.menu.logout();
      expect(out.path, 'Device A after Logout').toBe(AppRoutes.login);
      expect(await deviceA.menu.hasSession(), 'Device A session token').toBe(false);
    });

    await steps.step("Check Device B's session state - the session on Device B remains active and unaffected", async () => {
      await deviceB.page.reload({ waitUntil: 'domcontentloaded' });
      expect(await settleScreen(deviceB.page), `Device B after reload (${deviceB.page.url()})`).toBe('app');
      expect(await sessionCallStatus(deviceB.page), 'an authenticated call from Device B').toBe(200);
    });
  });

  test(`TC-${CASES.unusualActions.azureId}: should handle sign-out and expiry consistently across tabs and rapid or unusual actions`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();
    let second!: Page;

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      await s.users.openTable();
      expect(await isAppShellShown(s.page), 'the authenticated header').toBe(true);
    });

    await steps.critical('Open the same session in a second browser tab, then select Logout in the first tab - the session ends and the first tab returns to the sign-in page', async () => {
      second = await s.context.newPage();
      ScreenshotUtils.registerSession(test.info(), second);
      await second.goto(AppRoutes.usersAdministration, { waitUntil: 'domcontentloaded' });
      expect(await settleScreen(second), 'the second tab shares the session').toBe('app');
      const out = await s.menu.logout();
      expect(out.path, 'the first tab after Logout').toBe(AppRoutes.login);
    });

    await steps.step('Switch to the second tab and attempt an action - it also reflects the ended session (sign-in page or Session Expired)', async () => {
      await second.bringToFront();
      await clickDashboardLink(second).catch(() => undefined);
      const reaction = await waitForSignInOrExpired(second);
      expect(['login', 'expired'], `the second tab's reaction (${second.url()})`).toContain(reaction);
    });

    await steps.step('Rapidly click Logout multiple times in quick succession in a fresh session - no errors occur and the user ends up cleanly on the sign-in page', async () => {
      await s.page.bringToFront();
      const again = await s.signInPage.attempt(s.user.email, s.password);
      expect(again.status, `signing in again: ${again.serverMessage} ${again.alert}`).toBe(200);
      expect(await settleScreen(s.page), 'the fresh session').toBe('app');
      const statuses = await rapidLogout(s.page, RAPID_CLICKS);
      const shown = await toastMessages(s.page, 2_000);
      expect(isSignInUrl(s.page), `the URL ${s.page.url()}`).toBe(true);
      expect(statuses.every((st) => st < 400), `Account/Logout answers: ${statuses.join(', ') || 'none'}`).toBe(true);
      expect(shown.filter((m) => ERROR_TEXT.test(m)), 'error messages shown').toEqual([]);
      expect(await s.menu.readSessionExpired().then((d) => d.visible), 'no Session Expired dialog').toBe(false);
    });

    await steps.step('During the two-minute pre-expiry warning, perform a user interaction - the behaviour is consistent with the silent-renewal / warning rules', async () => {
      if (SESSION_WAIT_BLOCKED) steps.blocked(SESSION_WAIT_BLOCKED);
      allowWait(75);
      const back = await s.signInPage.attempt(s.user.email, s.password);
      expect(back.status, 'signing in for the idle period').toBe(200);
      await idleUntil(s.page, WARNING_LEAD_SECONDS - 5);
      const warning = await readNonExpiryDialog(s.page);
      expect(warning.visible, 'the pre-expiry warning').toBe(true);
      await clickDashboardLink(s.page);
      await idleUntil(s.page, -30);
      expect(await s.menu.waitForSessionExpired(5_000), 'activity during the warning keeps the session').toBe(false);
      expect(await tokenSecondsLeft(s.page), 'the session was renewed').toBeGreaterThan(0);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
