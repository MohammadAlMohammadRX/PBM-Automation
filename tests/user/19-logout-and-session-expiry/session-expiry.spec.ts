import { test, expect } from '../../../fixtures';
import type { Page, Request } from '@playwright/test';
import type { SuiteSession } from '../../../fixtures/userModule.fixture';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { AppRoutes } from '../../../constants/AppRoutes';
import { SESSION_EXPIRED } from '../../../constants/user/userIds';
import {
  CASES,
  EXPIRED_ACTION,
  EXPIRED_MESSAGE,
  EXPIRED_TITLE,
  SESSION_SETTING_NOT_AUTOMATED,
  SESSION_WAIT_BLOCKED,
  TIMEOUT_EVENT,
  WARNING_LEAD_SECONDS,
} from '../../../data/user/logoutAndSessionExpiry.data';
import { hostButton } from '../../../pages/user/userCommon';
import type { UserMenu } from '../../../pages/user/UserMenu';
import { readSystemSettings } from '../../../utils/JobClock';
import { ScreenshotUtils } from '../../../utils/ScreenshotUtils';
import {
  allowWait,
  auditEntriesFor,
  auditText,
  clickDashboardLink,
  expireTokenClock,
  idleUntil,
  isAppShellShown,
  isSignInUrl,
  readMenuLogout,
  readNonExpiryDialog,
  returnUrlOf,
  sessionCallStatus,
  sessionSettingKeys,
  settleScreen,
  tokenSecondsLeft,
  waitForSignInOrExpired,
} from '../../../utils/user/writerEHelpers';

/** "Navigate to the User Management module - the module loads with the session marked active" (a suite window). */
async function openActive(s: SuiteSession): Promise<{ shell: boolean; active: boolean }> {
  await s.users.openTable();
  return { shell: await isAppShellShown(s.page), active: ((await tokenSecondsLeft(s.page)) ?? 0) > 0 };
}

/** The next user action after the session ended (unless the app already raised Session Expired), then its reaction. */
async function nextActionShowsExpired(page: Page, menu: UserMenu): Promise<boolean> {
  if (!(await menu.waitForSessionExpired(1_000))) await clickDashboardLink(page).catch(() => undefined);
  return menu.waitForSessionExpired(30_000);
}

/** What a window shows across the warning and the end of an idle session (the real-wait branch of 20836). */
async function idleThroughExpiry(page: Page, menu: UserMenu): Promise<{ warning: string; expired: string }> {
  await idleUntil(page, WARNING_LEAD_SECONDS - 5);
  const w = await readNonExpiryDialog(page);
  await idleUntil(page, -30);
  await nextActionShowsExpired(page, menu);
  const e = await menu.readSessionExpired();
  return { warning: w.visible ? `${w.title} / ${w.message}` : '', expired: e.visible ? `${e.title} / ${e.message} / ${e.actions.join(', ')}` : '' };
}

/**
 * User story 20427 (expiry half): Session expiry. All in SUITE windows except
 * the administrator's menu read in 20836. The 60-minute waits are switched by
 * SESSION_WAIT_BLOCKED (decision 5); the Session Expired SCREEN cases end the
 * session in place (see the data file).
 */
test.describe('US 20427 - Logout and Session Expiry - session expiry', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.sessionEndsByItself.azureId}: should end the session by itself once the configured period elapses`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('Remain idle and let the full configured session period elapse - the session moves from active to expired', async () => {
      if (SESSION_WAIT_BLOCKED) steps.blocked(SESSION_WAIT_BLOCKED);
      allowWait(75);
      await idleUntil(s.page, -30);
      expect(await sessionCallStatus(s.page), 'an authenticated call after the period').toBe(401);
    });

    await steps.step('Attempt any action after expiry - the action is blocked and the Session Expired message is triggered', async () => {
      expect(await nextActionShowsExpired(s.page, s.menu), 'the Session Expired dialog').toBe(true);
    });
  });

  test(`TC-${CASES.silentRenewal.azureId}: should renew an actively used session silently without interrupting the user`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();
    const refreshes: string[] = [];
    let interrupted = false;

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('Continuously interact with the platform across a period longer than the session timeout - the session stays active with no warning or interruption', async () => {
      if (SESSION_WAIT_BLOCKED) steps.blocked(SESSION_WAIT_BLOCKED);
      allowWait(80);
      s.page.on('request', (r: Request) => {
        if (r.url().includes(ApiEndpoints.accountRefreshToken)) refreshes.push(new Date().toISOString());
      });
      const until = Date.now() + 65 * 60_000;
      while (Date.now() < until) {
        await clickDashboardLink(s.page);
        await s.page.waitForTimeout(1_000);
        await s.page.goto(AppRoutes.usersAdministration, { waitUntil: 'domcontentloaded' });
        if ((await s.menu.readSessionExpired()).visible || (await readNonExpiryDialog(s.page)).visible || isSignInUrl(s.page)) {
          interrupted = true;
          break;
        }
        await s.page.waitForTimeout(60_000);
      }
      expect(interrupted, 'a warning, Session Expired or the sign-in page interrupted the user').toBe(false);
    });

    await steps.step('Check for background session renewal calls during continuous use - the token is refreshed silently without prompts', async () => {
      expect(refreshes.length, 'RefreshToken calls during the hour').toBeGreaterThan(0);
      expect(await sessionCallStatus(s.page), 'the session is still valid').toBe(200);
    });
  });

  test(`TC-${CASES.warningTwoMinutes.azureId}: should warn an idle user exactly two minutes before the session closes`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();
    const seen = { before: false, at: false, after: false, later: false };

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('Remain idle until exactly two minutes remain before the session expiry - a pre-expiry warning is displayed', async () => {
      if (SESSION_WAIT_BLOCKED) steps.blocked(SESSION_WAIT_BLOCKED);
      allowWait(75);
      await idleUntil(s.page, WARNING_LEAD_SECONDS + 1, 500);
      seen.before = (await readNonExpiryDialog(s.page)).visible;
      await idleUntil(s.page, WARNING_LEAD_SECONDS, 250);
      seen.at = (await readNonExpiryDialog(s.page)).visible;
      await idleUntil(s.page, WARNING_LEAD_SECONDS - 1, 250);
      seen.after = (await readNonExpiryDialog(s.page)).visible;
      await s.page.waitForTimeout(5_000);
      seen.later = (await readNonExpiryDialog(s.page)).visible;
      expect(seen.at || seen.after, 'the warning at the two-minute mark').toBe(true);
    });

    await steps.step('Remain idle until one second before the two-minute mark - no warning is displayed yet', async () => {
      expect(seen.before, 'a warning one second before the boundary').toBe(false);
    });

    await steps.step('Remain idle one second after the two-minute mark - the warning is displayed and remains visible', async () => {
      expect(seen.after, 'the warning one second after the boundary').toBe(true);
      expect(seen.later, 'the warning still visible').toBe(true);
    });
  });

  test(`TC-${CASES.idleEndsAfterWarning.azureId}: should sign an idle user out to the sign-in page when the warning is not answered`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('Remain idle until the pre-expiry warning is shown - the warning appears on screen', async () => {
      if (SESSION_WAIT_BLOCKED) steps.blocked(SESSION_WAIT_BLOCKED);
      allowWait(75);
      await idleUntil(s.page, WARNING_LEAD_SECONDS - 5);
      expect((await readNonExpiryDialog(s.page)).visible, 'the pre-expiry warning').toBe(true);
    });

    await steps.critical('Take no action and let the remaining two minutes elapse - the session ends once the countdown completes', async () => {
      await idleUntil(s.page, -15);
      expect(await sessionCallStatus(s.page).catch(() => 401), 'an authenticated call after the countdown').toBe(401);
    });

    await steps.step('Observe the resulting screen - the user is returned to the sign-in page', async () => {
      expect(await waitForSignInOrExpired(s.page, 60_000), `the screen (${s.page.url()})`).toBe('login');
      expect(isSignInUrl(s.page)).toBe(true);
    });
  });

  test(`TC-${CASES.warningAsConfigured.azureId}: should show the pre-expiry warning as configured in system settings`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    let keys: string[] = [];

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('With the warning configuration enabled, remain idle until the warning threshold - the warning shown matches the configured content', async () => {
      if (SESSION_WAIT_BLOCKED) steps.blocked(SESSION_WAIT_BLOCKED);
      allowWait(75);
      keys = await sessionSettingKeys(page);
      expect(keys, 'a session / warning setting in System Settings').not.toEqual([]);
      await idleUntil(s.page, WARNING_LEAD_SECONDS - 5);
      expect((await readNonExpiryDialog(s.page)).visible, 'the pre-expiry warning').toBe(true);
    });

    await steps.step('Change the warning configuration and repeat the idle scenario - the warning reflects the updated configuration', async () => {
      steps.blocked(SESSION_SETTING_NOT_AUTOMATED);
    });

    await steps.step('Disable the warning configuration, if supported, and repeat - the behaviour matches the configured state', async () => {
      steps.blocked(SESSION_SETTING_NOT_AUTOMATED);
    });
  });

  test(`TC-${CASES.expiredScreen.azureId}: should show the Session Expired title, message and Go to Login Page button on the next action`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('Allow the session to expire - the session is marked ended', async () => {
      await s.menu.expireSessionNow();
      expect(await sessionCallStatus(s.page), 'an authenticated call with the ended session').toBe(401);
    });

    await steps.critical('Perform the next user action on the platform - a screen is shown with title "Session Expired"', async () => {
      expect(await nextActionShowsExpired(s.page, s.menu), 'the Session Expired dialog').toBe(true);
      expect((await s.menu.readSessionExpired()).title).toBe(EXPIRED_TITLE);
    });

    await steps.step('Check the message text on the screen - "Your session has expired. Please sign in again to continue."', async () => {
      expect((await s.menu.readSessionExpired()).message).toBe(EXPIRED_MESSAGE);
    });

    await steps.step('Check the available action on the screen - a "Go to Login Page" button is present and enabled', async () => {
      expect((await s.menu.readSessionExpired()).actions, 'the dialog actions').toContain(EXPIRED_ACTION);
      expect(await hostButton(s.page, SESSION_EXPIRED.loginAction).isEnabled(), 'Go to Login Page enabled').toBe(true);
    });
  });

  test(`TC-${CASES.goToLoginPage.azureId}: should return to the sign-in page from Go to Login Page on the expired session screen`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('Allow the session to expire - the Session Expired screen is displayed with title, message and Go to Login Page button', async () => {
      await s.menu.expireSessionNow();
      expect(await nextActionShowsExpired(s.page, s.menu), 'the Session Expired dialog').toBe(true);
      const d = await s.menu.readSessionExpired();
      expect([d.title, d.message], 'the dialog texts').toEqual([EXPIRED_TITLE, EXPIRED_MESSAGE]);
      expect(d.actions).toContain(EXPIRED_ACTION);
    });

    await steps.critical('Select the Go to Login Page button - the platform navigates away from the Session Expired screen', async () => {
      await s.menu.goToLoginPage();
      // polled for up to 5 s: read 0.8 s after the click (fix1 run) it could still be the closing animation
      await expect.poll(async () => (await s.menu.readSessionExpired()).visible, { timeout: 5_000, message: 'the Session Expired dialog after the click' }).toBe(false);
    });

    await steps.step('Observe the resulting screen - the sign-in page is displayed', async () => {
      expect(isSignInUrl(s.page), `the URL ${s.page.url()}`).toBe(true);
      expect(await settleScreen(s.page), 'the screen').toBe('login');
    });
  });

  test(`TC-${CASES.reopenAfterExpiry.azureId}: should take a user reopening the platform after the session ended straight to the sign-in page`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();
    let reopened!: Page;

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('Allow the session to expire due to timeout - the session is marked ended on the server and client', async () => {
      await expireTokenClock(s.page);
      expect(await tokenSecondsLeft(s.page), 'seconds left on the session').toBeLessThanOrEqual(0);
      expect(await sessionCallStatus(s.page), 'an authenticated call with the ended session').toBe(401);
    });

    await steps.critical('Close the browser tab entirely - the platform is no longer open', async () => {
      await s.page.close();
      expect(s.context.pages().length, 'open platform tabs').toBe(0);
    });

    await steps.step('Reopen the platform using a direct URL - it goes straight to the sign-in page without any authenticated content', async () => {
      reopened = await s.context.newPage();
      ScreenshotUtils.registerSession(test.info(), reopened);
      await reopened.goto(AppRoutes.usersAdministration, { waitUntil: 'domcontentloaded' });
      expect(await settleScreen(reopened), `the screen after reopening (${reopened.url()})`).toBe('login');
      expect(isSignInUrl(reopened), `the URL ${reopened.url()}`).toBe(true);
      expect(await isAppShellShown(reopened), 'authenticated content').toBe(false);
    });
  });

  test(`TC-${CASES.returnToRequestedPage.azureId}: should return a user signing in after expiry to the page originally requested`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();
    const target = `${AppRoutes.usersAdministration}/profile/${s.user.id}`;

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('Allow the session to expire - the session is marked ended', async () => {
      await expireTokenClock(s.page);
      expect(await sessionCallStatus(s.page), 'an authenticated call with the ended session').toBe(401);
    });

    await steps.critical('Open a specific authenticated page via its direct URL - the platform redirects to the sign-in page, remembering the requested destination', async () => {
      await s.page.goto(target, { waitUntil: 'domcontentloaded' });
      const landed = await settleScreen(s.page);
      if (landed === 'expired') await s.menu.goToLoginPage();
      expect(isSignInUrl(s.page), `the URL (the screen first showed "${landed}")`).toBe(true);
      expect(returnUrlOf(s.page), `the remembered destination in ${s.page.url()}`).toContain(`/profile/${s.user.id}`);
    });

    await steps.critical('Sign in again with valid credentials - authentication succeeds', async () => {
      const outcome = await s.signInPage.attempt(s.user.email, s.password);
      expect(outcome.status, `Account/Login: ${outcome.serverMessage} ${outcome.alert}`).toBe(200);
    });

    await steps.step('Observe the page shown after sign-in - the user lands on the page originally requested', async () => {
      await expect(s.page, 'the page after sign-in').toHaveURL(new RegExp(`${target}$`), { timeout: 30_000 });
    });
  });

  test(`TC-${CASES.timeoutAudited.azureId}: should record every automatic session timeout for audit like a manual sign-out`, async ({ page, steps, suiteSession, auditLogsPage }) => {
    const since = new Date().toISOString();
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module loads with the session marked active', async () => {
      expect(await openActive(s), 'the module (authenticated header) and the session').toEqual({ shell: true, active: true });
    });

    await steps.critical('Remain idle until the session times out automatically - the Session Expired screen is shown', async () => {
      if (SESSION_WAIT_BLOCKED) steps.blocked(SESSION_WAIT_BLOCKED);
      allowWait(75);
      await idleUntil(s.page, -30);
      expect(await nextActionShowsExpired(s.page, s.menu), 'the Session Expired dialog').toBe(true);
    });

    await steps.critical('As an administrator, open the audit log for the affected user - the audit log view loads', async () => {
      await auditLogsPage.open();
    });

    await steps.step('Locate the entry for the automatic session timeout - an audit record marks it as a timeout, with the correct user and timestamp', async () => {
      await expect.poll(async () => (await auditEntriesFor(page, s.user, since)).filter((e) => TIMEOUT_EVENT.test(auditText(e))).length, {
        timeout: 45_000,
        message: `a timeout entry about ${s.user.email}`,
      }).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.sameForEveryRole.azureId}: should keep logout, warning and expiry behaviour the same for every role`, async ({ page, steps, suiteSession, userListPage, userMenu }) => {
    let admin = { warning: '', expired: '' };

    await steps.critical('Navigate to the User Management module signed in as an Administrator - the Logout option is available in the user menu', async () => {
      await userListPage.openTable();
      const menu = await readMenuLogout(page);
      expect(menu.logoutShown, `the administrator's menu: ${menu.items.join(', ')}`).toBe(true);
    });

    await steps.critical('Let the session idle through to the pre-expiry warning and then expiry - the warning and Session Expired screen appear as for a standard session', async () => {
      if (SESSION_WAIT_BLOCKED) steps.blocked(SESSION_WAIT_BLOCKED);
      allowWait(150);
      admin = await idleThroughExpiry(page, userMenu);
      expect(admin.warning, 'the administrator was warned').not.toBe('');
      expect(admin.expired, 'the administrator saw Session Expired').not.toBe('');
      await userListPage.open();
    });

    await steps.step('Repeat the same flow signed in as a Standard User - Logout, the warning and Session Expired behave identically', async () => {
      const s = await suiteSession();
      const menu = await readMenuLogout(s.page);
      expect(menu.logoutShown, `the standard user's menu: ${menu.items.join(', ')}`).toBe(true);
      const standard = await idleThroughExpiry(s.page, s.menu);
      expect(standard, 'the standard user against the administrator').toEqual(admin);
    });
  });

  test(`TC-${CASES.configurablePeriod.azureId}: should apply the session expiry period an administrator configures`, async ({ page, steps, userListPage }) => {
    await steps.critical('Navigate to the User Management module - the module loads showing the current session configuration options', async () => {
      await userListPage.openTable();
      const keys = (await readSystemSettings(page)).map((setting) => setting.key);
      expect(keys.filter((k) => /session|idle|timeout/i.test(k)), `session settings among: ${keys.join(', ')}`).not.toEqual([]);
      expect(await isAppShellShown(page), 'the administrator signed in').toBe(true);
    });

    await steps.critical('Set the configured session period to its minimum supported value - the configuration is saved and accepted', async () => {
      steps.blocked(SESSION_SETTING_NOT_AUTOMATED);
    });

    await steps.step('Sign in as a test user and remain idle until just before the minimum period elapses - the session is still active', async () => {
      steps.blocked(SESSION_SETTING_NOT_AUTOMATED);
    });

    await steps.step('Remain idle one unit past the configured minimum - the session ends in line with it', async () => {
      steps.blocked(SESSION_SETTING_NOT_AUTOMATED);
    });

    await steps.step('Repeat with the maximum supported value - the session stays active until the maximum elapses, then ends', async () => {
      steps.blocked(SESSION_SETTING_NOT_AUTOMATED);
    });
  });
});
