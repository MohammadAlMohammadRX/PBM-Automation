import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { wipePasswordBoxes, type PasswordInput } from './ChangePasswordDrawer';
import { toastMessages } from './userCommon';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { RESET_PASSWORD } from '../../constants/user/userIds';
import { SuiteSecret } from '../../utils/UserProvisioning';
import { NetworkUtils } from '../../utils/NetworkUtils';

/**
 * Reset Password (`/reset-password`, unauthenticated; verified 2026-11-08).
 * Step 1 "Sending an Email": `reset-email` (no maxlength), Continue, Log In.
 * Continue -> POST ForgotPassword `{ email }` -> toast "Password reset link was
 * sent. Please check your email." and back to /login - the same text for an
 * unknown address (but the answer's payload differs: `code` null /
 * `displayConfirmPasswordLink` false). Step 2 "Reset your Password", opened
 * with `?email=&code=` (the e-mailed link; its host is http://127.0.0.1:56291
 * on 2026-11-08): `reset-password` + `reset-confirm`, the requirements list and
 * strength meter, Save Password -> POST ResetPassword `{ email, password,
 * confirmPassword, code }` -> "Your password has been reset" and /login. A used
 * code -> "Invalid token."; a malformed code -> 500 "An error occurred while
 * processing your request." (stack trace in the answer); a MISMATCHED confirm is
 * ACCEPTED by the server (screen check only).
 */
export class ResetPasswordPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.resetPassword);
    await expect(this.byId(RESET_PASSWORD.title)).toBeVisible({ timeout: Timeouts.navigation });
  }

  /** Step 2 straight from a code (a SuiteSecret from `suiteResetCode` / the e-mail). The URL is never logged. */
  async openWithCode(email: string, code: SuiteSecret): Promise<void> {
    await this.page.goto(`${AppRoutes.resetPassword}?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code.reveal())}`);
    await expect(this.byId(RESET_PASSWORD.title)).toBeVisible({ timeout: Timeouts.navigation });
  }

  async getTitle(): Promise<string> {
    return (await this.byId(RESET_PASSWORD.title).innerText()).trim();
  }

  async getStepLabels(): Promise<string[]> {
    const out: string[] = [];
    for (let n = 1; n <= 2; n += 1) out.push((await this.byId(`${RESET_PASSWORD.stepPrefix}${n}-label`).innerText().catch(() => '')).trim());
    return out;
  }

  async getText(): Promise<string> {
    return (await this.page.locator('#auth-shell-card').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async isStep2(): Promise<boolean> {
    return this.byId(RESET_PASSWORD.password).isVisible().catch(() => false);
  }

  // ---- step 1 ----

  async typeEmail(value: string): Promise<void> {
    await this.byId(RESET_PASSWORD.email).fill(value);
    await this.byId(RESET_PASSWORD.email).blur();
  }

  async getEmailMaxLength(): Promise<number | null> {
    const raw = await this.byId(RESET_PASSWORD.email).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async readEmail(): Promise<string> {
    return this.byId(RESET_PASSWORD.email).inputValue();
  }

  async getEmailError(): Promise<string> {
    const el = this.byId(RESET_PASSWORD.emailError);
    return (await el.isVisible().catch(() => false)) ? (await el.innerText()).trim() : '';
  }

  /** Continue -> ForgotPassword's status (-1 = refused on screen), the toasts and where it landed. The reset code is NOT returned. */
  async continue(): Promise<{ status: number; messages: string[]; path: string; codePresent: boolean }> {
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.accountForgotPassword, () => this.btn(RESET_PASSWORD.continue).click(), Timeouts.short).catch(() => null);
    const messages = await toastMessages(this.page);
    let codePresent = false;
    try {
      codePresent = !!(JSON.parse(answer?.text ?? '{}') as { payload?: { code?: string | null } }).payload?.code;
    } catch {
      /* not JSON */
    }
    await this.page.waitForTimeout(1_000);
    return { status: answer?.status ?? -1, messages, path: new URL(this.page.url()).pathname, codePresent };
  }

  async clickLogIn(): Promise<void> {
    await this.btn(RESET_PASSWORD.login).click();
    await this.page.waitForURL(new RegExp(AppRoutes.login), { timeout: Timeouts.navigation });
  }

  // ---- step 2 ----

  async fillPasswords(password: PasswordInput, confirm: PasswordInput = password): Promise<void> {
    const reveal = (v: PasswordInput): string => (v instanceof SuiteSecret ? v.reveal() : v);
    await this.byId(RESET_PASSWORD.password).fill(reveal(password));
    await this.byId(RESET_PASSWORD.confirm).fill(reveal(confirm));
    await this.byId(RESET_PASSWORD.confirm).blur();
  }

  async typePasswordOnly(password: string): Promise<void> {
    await this.byId(RESET_PASSWORD.password).fill(password);
  }

  /** The requirements list text and the strength label. */
  async readChecklist(): Promise<{ requirements: string; strength: string }> {
    return {
      requirements: (await this.byId(RESET_PASSWORD.requirements).innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
      strength: (await this.byId(RESET_PASSWORD.strength).innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
    };
  }

  async getErrors(): Promise<string[]> {
    const out: string[] = [];
    for (const id of [RESET_PASSWORD.passwordError, RESET_PASSWORD.confirmError, RESET_PASSWORD.alert]) {
      const el = this.byId(id);
      if (await el.isVisible().catch(() => false)) out.push((await el.innerText()).replace(/\s+/g, ' ').trim());
    }
    return out;
  }

  /** Save Password -> ResetPassword's answer (status -1 = refused on screen), toasts, errors, path. Boxes wiped after. */
  async save(): Promise<{ status: number; text: string; messages: string[]; errors: string[]; path: string }> {
    try {
      const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.accountResetPassword, () => this.btn(RESET_PASSWORD.save).click(), Timeouts.short).catch(() => null);
      const messages = await toastMessages(this.page);
      await this.page.waitForTimeout(800);
      return { status: answer?.status ?? -1, text: answer?.text ?? '', messages, errors: await this.getErrors(), path: new URL(this.page.url()).pathname };
    } finally {
      await wipePasswordBoxes(this.page);
    }
  }
}
