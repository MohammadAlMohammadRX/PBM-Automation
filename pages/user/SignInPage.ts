import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { LoginPage } from '../auth/LoginPage';
import { wipePasswordBoxes, type PasswordInput } from './ChangePasswordDrawer';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { SIGN_IN } from '../../constants/user/userIds';
import { SuiteSecret } from '../../utils/UserProvisioning';
import { Logger } from '../../utils/Logger';

/** What one sign-in attempt produced. */
export interface SignInOutcome {
  /** Account/Login's HTTP status (-1 when the click sent nothing - e.g. empty fields). */
  status: number;
  /** The server's message (ErrorMessage, else the first ValidationErrors reason) - never a token. */
  serverMessage: string;
  /** The banner text shown (`login-alert`, "Important" + message). */
  alert: string;
  /** The field errors shown under Username / Password. */
  errors: string[];
  /** The URL path after the attempt settled. */
  path: string;
  /** `payload.lockoutUntil` when the server sent one. */
  lockoutUntil: string | null;
}

/**
 * The sign-in screen (`/login`) for the User Management stories - extends the
 * framework's LoginPage (verified 2026-11-08): title "Login with Pharmacy
 * Benefit Management System", "* Email Address" (`login-email`, placeholder
 * "e.g. mail@mail.com", NO maxlength - accepts e-mail OR document ID),
 * "* Password" (`login-password`, masked, maxlength = the policy maximum, a
 * show / hide eye), "Forget Password?" (`login-forgot-password-link` ->
 * /reset-password), Login, the language toggle (`auth-shell-language-toggle-
 * button`, "عربي"). Refusals come back as HTTP 500 with ErrorMessage or
 * ValidationErrors and show in `login-alert` ("Important" + text):
 * unknown user "Invalid login attempt."; wrong password "Sign-in failed"
 * (ErrorMessage null, reason "Invalid login attempt."); deactivated AND never
 * activated "Your account is inactive. Please contact your administrator.".
 *
 * Use it in a context WITHOUT a session (the admin storage state redirects
 * /login to the dashboard). Every password typed is wiped from the box after
 * the attempt.
 */
export class SignInPage extends LoginPage {
  constructor(page: Page) {
    super(page);
  }

  /** Opens /login with no session (clears this context's local storage first). */
  async openSignedOut(): Promise<void> {
    await this.page.evaluate(() => {
      try {
        window.localStorage.clear();
      } catch {
        /* about:blank */
      }
    }).catch(() => undefined);
    await this.open();
  }

  async getTitle(): Promise<string> {
    return (await this.byId(SIGN_IN.title).innerText()).trim();
  }

  async getUsernamePlaceholder(): Promise<string> {
    return (await this.byId(SIGN_IN.email).getAttribute('placeholder')) ?? '';
  }

  async getMaxLength(which: 'email' | 'password'): Promise<number | null> {
    const raw = await this.byId(which === 'email' ? SIGN_IN.email : SIGN_IN.password).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async getPasswordType(): Promise<string> {
    return (await this.byId(SIGN_IN.password).getAttribute('type')) ?? '';
  }

  /** The show / hide control beside the password (PrimeNG password toggle inside the id-scoped field). */
  /**
   * Clicks the eye icon and waits for the box's `type` to flip: the attribute
   * changes a moment AFTER the icon re-renders (smoke 2026-11-08 read the old
   * type right after the click and failed 20702). Fails, with the type seen,
   * when the click never flips it.
   */
  async togglePasswordVisibility(): Promise<void> {
    const box = this.byId(SIGN_IN.password);
    const before = await box.getAttribute('type');
    // locator-exception: PrimeNG p-password's eye icon carries no id; it is
    // matched by its data-pc-section ("unmaskicon" while masked, "maskicon" while shown).
    await box.locator('xpath=..').locator('[data-pc-section="unmaskicon"], [data-pc-section="maskicon"]').first().click();
    await expect.poll(() => box.getAttribute('type'), { message: `the password box type should change from "${before}"`, timeout: Timeouts.default }).not.toBe(before);
  }

  async typeUsername(value: string): Promise<void> {
    await this.byId(SIGN_IN.email).fill(value);
  }

  /** Types a password (a SuiteSecret is revealed only into the box). */
  async typePassword(value: PasswordInput): Promise<void> {
    await this.byId(SIGN_IN.password).fill(value instanceof SuiteSecret ? value.reveal() : value);
  }

  /** Types character by character (maxlength cases). */
  async typePasswordSlowly(value: string): Promise<void> {
    await this.byId(SIGN_IN.password).click();
    // The box is autofocused while the form initialises; keys pressed at once
    // lost the first character (49 of 50 kept, 20703 smoke 2026-11-08).
    await this.page.waitForTimeout(500);
    await this.byId(SIGN_IN.password).pressSequentially(value, { delay: 20 });
  }

  async passwordLength(): Promise<number> {
    return (await this.byId(SIGN_IN.password).inputValue()).length;
  }

  async readUsername(): Promise<string> {
    return this.byId(SIGN_IN.email).inputValue();
  }

  async getFieldErrors(): Promise<string[]> {
    const out: string[] = [];
    for (const id of [SIGN_IN.emailError, SIGN_IN.passwordError]) {
      const el = this.byId(id);
      if (await el.isVisible().catch(() => false)) out.push((await el.innerText()).trim());
    }
    return out;
  }

  async getAlert(): Promise<string> {
    return (await this.byId(SIGN_IN.alert).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async isSubmitEnabled(): Promise<boolean> {
    return this.btn(SIGN_IN.submit).isEnabled().catch(() => false);
  }

  /**
   * Types both fields, clicks Login and reports what happened. Never throws on
   * a refusal (the refusal is what the case asserts). The password box is wiped
   * afterwards. WRONG passwords: suite users only.
   */
  async attempt(username: string, password: PasswordInput): Promise<SignInOutcome> {
    Logger.step(`Signing in as "${username}"`);
    try {
      await this.typeUsername(username);
      await this.typePassword(password);
      const answered = this.page.waitForResponse((r) => r.url().includes(ApiEndpoints.accountLogin), { timeout: Timeouts.navigation }).catch(() => null);
      await this.btn(SIGN_IN.submit).click({ timeout: Timeouts.default }).catch(() => undefined);
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
        await this.page.waitForLoadState('domcontentloaded').catch(() => undefined);
        await this.page.waitForTimeout(1_500);
      }
      return {
        status: response ? response.status() : -1,
        serverMessage,
        alert: await this.getAlert(),
        errors: await this.getFieldErrors(),
        path: new URL(this.page.url()).pathname + new URL(this.page.url()).search,
        lockoutUntil,
      };
    } finally {
      await wipePasswordBoxes(this.page);
    }
  }

  /** Signs in and waits for the dashboard (or the `returnUrl`); asserts success. */
  async signIn(username: string, password: PasswordInput): Promise<void> {
    const outcome = await this.attempt(username, password);
    expect(outcome.status, `signing in as ${username} should succeed: ${outcome.serverMessage} ${outcome.alert}`).toBe(200);
    await expect(this.page).not.toHaveURL(new RegExp(`${AppRoutes.login}(\\?|$)`), { timeout: Timeouts.navigation });
  }

  async clickForgotPassword(): Promise<void> {
    await this.byId(SIGN_IN.forgotLink).click();
    await this.page.waitForURL(new RegExp(AppRoutes.resetPassword), { timeout: Timeouts.navigation });
  }

  /** The language toggle on the unauthenticated shell. */
  async toggleLanguage(): Promise<void> {
    await this.byId(SIGN_IN.languageToggle).click();
    await this.page.waitForTimeout(800);
  }

  async readLanguageToggle(): Promise<string> {
    return (await this.byId(SIGN_IN.languageToggle).innerText()).trim();
  }

  async getText(): Promise<string> {
    return (await this.page.locator('#auth-shell-card').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }
}
