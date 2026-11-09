import type { Page, Response } from '@playwright/test';
import { test } from '@playwright/test';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { RESET_PASSWORD, SESSION_EXPIRED, SIGN_IN, USER_LIST, USER_MENU } from '../../constants/user/userIds';
import { WRITER_E } from '../../constants/user/writerEIds';
import { ACCESS_TOKEN_KEY } from '../../data/payers/lifecycleGuardrails.data';
import { wipePasswordBoxes } from '../../pages/user/ChangePasswordDrawer';
import type { SignInOutcome } from '../../pages/user/SignInPage';
import { hostButton, readDialog, toastMessages } from '../../pages/user/userCommon';
import { readSystemSettings } from '../JobClock';
import { Logger } from '../Logger';
import { NetworkUtils } from '../NetworkUtils';
import { SUITE_EMAIL_DOMAIN, SUITE_EMAIL_PREFIX, emailsTo, userStamp, type TriggerExecution } from '../UserProvisioning';

/**
 * Writer E helpers - User Management folders 14 (sign in), 16 (reset forgotten
 * password) and 19 (logout and session expiry). What the foundation lacked:
 *
 * - NAVIGATION IN A WINDOW WITHOUT A SESSION. `BasePage.goto` (every page
 *   object's `open()`) signs the ADMINISTRATOR in when it lands on /login
 *   (`recoverIfSignedOut`). In a signed-out / logged-out suite window that would
 *   put the admin's session in the suite window, so these helpers navigate with
 *   the raw `page.goto` and wait for the screen themselves.
 * - A sign-in SUBMIT without typing (the blank-field cases), and slow typing
 *   into the username box (maxlength cases).
 * - The reset screen's live checklist state (`is-met` per rule).
 * - A REAL-looking session end for the reopen / deep-link cases
 *   (`expireTokenClock`: the access token's `exp` moved into the past).
 * - Sign-in / sign-out entries of the audit log (GetAuditLogs, read only).
 *
 * Passwords: nothing here reads, logs or returns a password or a token.
 */

/** Path + query of the page's URL. */
export function pathOf(page: Page): string {
  const u = new URL(page.url());
  return u.pathname + u.search;
}

/** Whether the URL is the sign-in page (with or without `?returnUrl=`). */
export function isSignInUrl(page: Page): boolean {
  return new URL(page.url()).pathname === AppRoutes.login;
}

/** The decoded `returnUrl` of the sign-in page ('' when none). */
export function returnUrlOf(page: Page): string {
  return new URL(page.url()).searchParams.get('returnUrl') ?? '';
}

/** Whether the authenticated shell (app header) is showing. */
export async function isAppShellShown(page: Page): Promise<boolean> {
  return page.locator(`#${WRITER_E.appHeader}`).isVisible().catch(() => false);
}

/**
 * "Navigate to the User Management module" in a window WITHOUT a session: a
 * raw navigation to Users Administration, then the screen it settles on.
 * Returns where it landed ('login' = the sign-in form).
 */
export async function openModuleWithoutSession(page: Page, route: string = AppRoutes.usersAdministration): Promise<'login' | 'app' | 'expired' | 'unknown'> {
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: Timeouts.navigation });
  return settleScreen(page);
}

/** Waits for the sign-in form, the app shell or the Session Expired dialog - whichever renders first. */
export async function settleScreen(page: Page, timeout: number = Timeouts.navigation): Promise<'login' | 'app' | 'expired' | 'unknown'> {
  return Promise.race([
    page.locator(`#${SIGN_IN.email}`).waitFor({ state: 'visible', timeout }).then(() => 'login' as const),
    page.locator(`#${SESSION_EXPIRED.loginAction}`).waitFor({ state: 'visible', timeout }).then(() => 'expired' as const),
    page.locator(`#${WRITER_E.appHeader}`).waitFor({ state: 'visible', timeout }).then(async () => {
      // The shell can render a moment before the Session Expired dialog of an ended session.
      const expired = await page.locator(`#${SESSION_EXPIRED.loginAction}`).waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
      return expired ? ('expired' as const) : ('app' as const);
    }),
  ]).catch(() => 'unknown' as const);
}

/**
 * After an action in a window whose session has ended: waits for the app's
 * reaction - the sign-in form or the Session Expired dialog ('none' when it
 * stays on the authenticated screen for `timeout`).
 */
export async function waitForSignInOrExpired(page: Page, timeout = 30_000): Promise<'login' | 'expired' | 'none'> {
  return Promise.race([
    page.locator(`#${SIGN_IN.email}`).waitFor({ state: 'visible', timeout }).then(() => 'login' as const),
    page.locator(`#${SESSION_EXPIRED.loginAction}`).waitFor({ state: 'visible', timeout }).then(() => 'expired' as const),
  ]).catch(() => 'none' as const);
}

/** Top-left corner of the header's user menu trigger (the "same location" check). */
export async function menuTriggerPosition(page: Page): Promise<{ x: number; y: number } | null> {
  const box = await page.locator(`#${USER_MENU.trigger}`).boundingBox().catch(() => null);
  return box ? { x: Math.round(box.x), y: Math.round(box.y) } : null;
}

// ---- sign-in screen ------------------------------------------------------------------

/**
 * Clicks Login WITHOUT typing (the fields hold whatever the case typed) and
 * reports like `SignInPage.attempt`. A click that sends nothing (blank fields)
 * gives status -1 after `waitMs`. Every password box is wiped afterwards.
 */
export async function submitSignIn(page: Page, waitMs = 8_000): Promise<SignInOutcome> {
  try {
    const answered = page.waitForResponse((r) => r.url().includes(ApiEndpoints.accountLogin), { timeout: waitMs }).catch(() => null);
    await hostButton(page, SIGN_IN.submit).click({ timeout: Timeouts.short }).catch(() => Logger.warn('The Login button did not take the click (disabled?)'));
    const response = await answered;
    let serverMessage = '';
    let lockoutUntil: string | null = null;
    if (response) {
      try {
        const body = (await response.json()) as { ErrorMessage?: string | null; errorMessage?: string | null; ValidationErrors?: { Reason?: string }[]; payload?: { lockoutUntil?: string | null } };
        serverMessage = String(body.ErrorMessage ?? body.errorMessage ?? body.ValidationErrors?.[0]?.Reason ?? '');
        lockoutUntil = body.payload?.lockoutUntil ?? null;
      } catch {
        /* not JSON */
      }
      await page.waitForTimeout(1_500);
    } else {
      await page.waitForTimeout(500);
    }
    const errors: string[] = [];
    for (const id of [SIGN_IN.emailError, SIGN_IN.passwordError]) {
      const el = page.locator(`#${id}`);
      if (await el.isVisible().catch(() => false)) errors.push((await el.innerText()).replace(/\s+/g, ' ').trim());
    }
    return {
      status: response ? response.status() : -1,
      serverMessage,
      alert: (await page.locator(`#${SIGN_IN.alert}`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
      errors,
      path: pathOf(page),
      lockoutUntil,
    };
  } finally {
    await wipeSignInPassword(page);
  }
}

/** The field error shown under Username / Password ('' when none). */
export async function signInFieldError(page: Page, field: 'email' | 'password'): Promise<string> {
  const el = page.locator(`#${field === 'email' ? SIGN_IN.emailError : SIGN_IN.passwordError}`);
  return (await el.isVisible().catch(() => false)) ? (await el.innerText()).replace(/\s+/g, ' ').trim() : '';
}

/** Types into the username box key by key (maxlength cases - `fill` would bypass the browser's cap). */
export async function typeUsernameSlowly(page: Page, value: string): Promise<void> {
  await page.locator(`#${SIGN_IN.email}`).click();
  await page.locator(`#${SIGN_IN.email}`).pressSequentially(value);
}

/** Length of the username box's value. */
export async function usernameLength(page: Page): Promise<number> {
  return (await page.locator(`#${SIGN_IN.email}`).inputValue()).length;
}

/**
 * Empties the sign-in password box whatever its type (after the show / hide
 * control it is `type=text`, which `wipePasswordBoxes` would miss).
 */
export async function wipeSignInPassword(page: Page): Promise<void> {
  await page.evaluate((id) => {
    const box = document.getElementById(id) as HTMLInputElement | null;
    if (box) box.value = '';
  }, SIGN_IN.password).catch(() => undefined);
  await wipePasswordBoxes(page);
}

/**
 * Throwaway text for the password box of the field-level cases (no account
 * owns it and it is never submitted for one). Built at runtime, `length` long.
 */
export function throwawayBoxText(length: number): string {
  const unit = `Zq${userStamp().slice(0, 4)}7!`;
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

// ---- reset password screen -----------------------------------------------------------

/** From the sign-in page: Forget Password? -> the Reset Password screen (step 1). */
export async function waitForResetScreen(page: Page): Promise<void> {
  await page.locator(`#${RESET_PASSWORD.title}`).waitFor({ state: 'visible', timeout: Timeouts.navigation });
}

/** Types into the reset e-mail box key by key (maxlength cases). */
export async function typeResetEmailSlowly(page: Page, value: string): Promise<void> {
  const box = page.locator(`#${RESET_PASSWORD.email}`);
  await box.fill('');
  await box.click();
  await box.pressSequentially(value);
  await box.blur();
}

/** The live checklist: rule key (lengthrange, uppercase, lowercase, digit, symbol, uniquechars) -> met. */
export async function resetChecklistState(page: Page): Promise<Record<string, boolean>> {
  return page.locator(`[id^="${WRITER_E.resetRulePrefix}"]`).evaluateAll((items, prefix) => Object.fromEntries(
    items.map((li) => [li.id.slice(prefix.length), li.classList.contains('is-met')]),
  ), WRITER_E.resetRulePrefix);
}

/** A SUITE address (unregistered unless a case creates it) exactly `length` characters long. */
export function suiteAddressOfLength(length: number): string {
  const tail = `@${SUITE_EMAIL_DOMAIN}`;
  const room = length - SUITE_EMAIL_PREFIX.length - tail.length;
  if (room < 1) throw new Error(`a suite address cannot be ${length} characters long`);
  const filler = `${userStamp()}${'q'.repeat(60)}`.slice(0, room);
  return `${SUITE_EMAIL_PREFIX}${filler}${tail}`;
}

/** Every ForgotPassword answer (status) while `action` runs, plus the toasts it left. */
export async function captureForgotAnswers(page: Page, action: () => Promise<void>, settleMs = 4_000): Promise<{ statuses: number[]; messages: string[]; path: string }> {
  const statuses: number[] = [];
  const onResponse = (r: Response): void => {
    if (r.url().includes(ApiEndpoints.accountForgotPassword)) statuses.push(r.status());
  };
  page.on('response', onResponse);
  try {
    await action();
    const messages = await toastMessages(page);
    await page.waitForTimeout(settleMs);
    return { statuses, messages, path: new URL(page.url()).pathname };
  } finally {
    page.off('response', onResponse);
  }
}

/** Double-clicks Continue on step 1 (the "rapid submission" case). */
export async function doubleClickContinue(page: Page): Promise<void> {
  await hostButton(page, RESET_PASSWORD.continue).dblclick({ timeout: Timeouts.default });
}

/** The "Forget Password" e-mails the platform logged for a SUITE address since `sinceIso`. */
export async function forgotEmailsSince(adminPage: Page, address: string, sinceIso: string): Promise<TriggerExecution[]> {
  const after = Date.parse(sinceIso) - 5_000;
  return (await emailsTo(adminPage, address, 2)).filter((e) => e.actionCode === 'forgetPassword' && Date.parse(e.createdOn) >= after);
}

// ---- session ---------------------------------------------------------------------------

/** Status of an authenticated call made with the window's CURRENT token (401 = the session has ended). */
export async function sessionCallStatus(page: Page): Promise<number> {
  return (await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.manageCurrentUser)).status;
}

/**
 * Ends the window's session THE WAY TIME DOES: the access token's `exp` claim is
 * moved into the past (which also voids its signature - the server answers 401)
 * and the refresh token is removed, so the session cannot be renewed. The token
 * value is never read out of the page.
 */
export async function expireTokenClock(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const t = window.localStorage.getItem(key);
    if (t) {
      const [head, body, sig] = t.split('.');
      const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
      json.exp = Math.floor(Date.now() / 1000) - 120;
      const encoded = btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      window.localStorage.setItem(key, `${head}.${encoded}.${sig}`);
    }
    for (const k of Object.keys(window.localStorage)) if (/refresh/i.test(k)) window.localStorage.removeItem(k);
  }, ACCESS_TOKEN_KEY);
}

/**
 * The "next user action": the side menu's Dashboard link (an in-app navigation that calls the API).
 * A suite role holding only Users rights has NO Dashboard entry in its side menu (full run 20828,
 * 20829, 20837: the click failed silently and nothing was asked of the server, so no Session
 * Expired could follow) - then the Users list's sort-direction button is the action (it asks
 * GetUsers; probe 2026-11-08: 401 -> Session Expired at once).
 */
export async function clickDashboardLink(page: Page): Promise<void> {
  const dashboard = page.locator(`#${WRITER_E.navDashboardLink}`);
  if (await dashboard.isVisible().catch(() => false)) {
    await dashboard.click({ timeout: Timeouts.default });
    return;
  }
  await page.locator(`#${USER_LIST.sortDirection}`).click({ timeout: Timeouts.default });
}

/** Opens the header user menu and reports its entries and whether Logout is shown; closes it again. */
export async function readMenuLogout(page: Page): Promise<{ items: string[]; logoutShown: boolean; logoutText: string }> {
  await page.locator(`#${USER_MENU.trigger}`).click();
  await page.locator(`#${USER_MENU.panel}`).waitFor({ state: 'visible', timeout: Timeouts.default });
  const logout = page.locator(`#${USER_MENU.logout}`);
  const logoutShown = await logout.isVisible().catch(() => false);
  const logoutText = logoutShown ? (await logout.innerText()).trim() : '';
  const items = (await page.locator(`#${USER_MENU.panel}`).locator('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  await page.locator(`#${USER_MENU.trigger}`).click().catch(() => undefined);
  return { items, logoutShown, logoutText };
}

/** Opens the menu and clicks Logout `times` times as fast as possible; returns the Logout answers' statuses. */
export async function rapidLogout(page: Page, times: number): Promise<number[]> {
  const statuses: number[] = [];
  const onResponse = (r: Response): void => {
    if (r.url().includes(ApiEndpoints.accountLogout)) statuses.push(r.status());
  };
  page.on('response', onResponse);
  try {
    await page.locator(`#${USER_MENU.trigger}`).click();
    await page.locator(`#${USER_MENU.panel}`).waitFor({ state: 'visible', timeout: Timeouts.default });
    await page.locator(`#${USER_MENU.logout}`).click({ clickCount: times, delay: 30, timeout: Timeouts.short }).catch(() => undefined);
    await page.waitForURL(new RegExp(AppRoutes.login), { timeout: Timeouts.navigation }).catch(() => undefined);
    await page.waitForTimeout(2_000);
    return statuses;
  } finally {
    page.off('response', onResponse);
  }
}

/** A dialog other than Session Expired showing now (the pre-expiry warning, when one exists). */
export async function readNonExpiryDialog(page: Page): Promise<{ visible: boolean; title: string; message: string }> {
  const d = await readDialog(page);
  const isExpired = /Session Expired|انتهت/.test(d.title);
  return { visible: d.visible && !isExpired, title: d.title, message: d.message };
}

/** Seconds left on the window's access token (null when none). */
export async function tokenSecondsLeft(page: Page): Promise<number | null> {
  return page.evaluate((key) => {
    const t = window.localStorage.getItem(key);
    if (!t) return null;
    try {
      const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      return p.exp ? Math.round(p.exp - Date.now() / 1000) : null;
    } catch {
      return null;
    }
  }, ACCESS_TOKEN_KEY);
}

/** Raises the running test's timeout by `minutes` (the real-wait branches of the session / reset-link cases). */
export function allowWait(minutes: number): void {
  test.info().setTimeout(test.info().timeout + minutes * 60_000);
}

/**
 * Stays idle (no interaction) until the window's token has `secondsBefore`
 * seconds left (negative = past expiry), checking every `pollMs`. Returns the
 * seconds left when it stopped (null when no token).
 */
export async function idleUntil(page: Page, secondsBefore: number, pollMs = 15_000): Promise<number | null> {
  for (;;) {
    const left = await tokenSecondsLeft(page);
    if (left === null || left <= secondsBefore) return left;
    await page.waitForTimeout(Math.min(pollMs, Math.max(1_000, (left - secondsBefore) * 1_000)));
  }
}

/** Session-related keys in System Settings (none on 2026-11-08). */
export async function sessionSettingKeys(adminPage: Page): Promise<string[]> {
  return (await readSystemSettings(adminPage)).map((s) => s.key).filter((k) => /session|idle|timeout|token/i.test(k));
}

// ---- audit ----------------------------------------------------------------------------

/** One GetAuditLogs row (the fields the auth cases read). */
export interface AuthAuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  actorUserId: string | null;
  actorLabel: string;
  occurredAtUtc: string;
  afterJson?: string | null;
}

/**
 * Audit entries about a SUITE user since `sinceIso` (read only): by entity
 * (ApplicationUser / its id), by search text (its e-mail) and by actor - merged
 * and de-duplicated. A query the server refuses contributes nothing.
 */
export async function auditEntriesFor(adminPage: Page, user: { id: string; email: string }, sinceIso: string): Promise<AuthAuditEntry[]> {
  if (!user.email.toLowerCase().startsWith(SUITE_EMAIL_PREFIX)) throw new Error(`refusing to read the audit trail of ${user.email}: not a suite user`);
  const fromUtc = new Date(Date.parse(sinceIso) - 60_000).toISOString();
  const queries: Record<string, unknown>[] = [
    { entityType: 'ApplicationUser', entityId: user.id, actionType: null, fromUtc },
    { entityType: null, entityId: user.id, actionType: null, fromUtc },
    { entityType: null, entityId: null, actionType: null, fromUtc, searchText: user.email },
    { entityType: null, entityId: null, actionType: null, fromUtc },
  ];
  const seen = new Map<string, AuthAuditEntry>();
  for (const q of queries) {
    const res = await NetworkUtils.postAsSession(adminPage, ApiEndpoints.auditLogList, { ...q, pageNumber: 1, rowsPerPage: 100 }).catch(() => null);
    if (!res || res.status !== 200) continue;
    let items: AuthAuditEntry[] = [];
    try {
      items = (JSON.parse(res.text) as { payload?: { items?: AuthAuditEntry[] } }).payload?.items ?? [];
    } catch {
      /* not JSON */
    }
    for (const e of items) {
      const mine = e.entityId === user.id || e.actorUserId === user.id || `${e.actorLabel} ${e.afterJson ?? ''}`.toLowerCase().includes(user.email.toLowerCase());
      if (mine) seen.set(e.id, e);
    }
  }
  return [...seen.values()];
}

/** The text of an audit entry the event patterns are matched against. */
export function auditText(e: AuthAuditEntry): string {
  return `${e.actionType} ${e.entityType} ${e.afterJson ?? ''}`;
}
