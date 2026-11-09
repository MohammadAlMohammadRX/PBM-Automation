import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fieldErrors, toastMessages } from './userCommon';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { PASSWORD_POLICY, type PolicyFlagField, type PolicyNumberField } from '../../constants/user/userIds';
import { NetworkUtils } from '../../utils/NetworkUtils';

/**
 * System Settings > Settings > Password Policy (verified 2026-11-08). The read
 * view lists Minimum length 8, Maximum length 16, Minimum distinct characters 7,
 * Require an uppercase letter / lowercase letter / digit / symbol Yes, Force a
 * change on system-issued passwords Yes, Passwords remembered 5, Password
 * expires after (days) 90, When it applies ("Applies immediately to every new
 * password — user creation, password reset, change password and invitation
 * registration. Existing passwords are not revalidated."). Values carry no ids
 * (`readView` parses the tab text). Edit -> drawer "Edit Password Policy".
 *
 * DANGER (2026-11-08): the number boxes CLAMP a typed out-of-range value to the
 * nearest bound (7 -> 8, 25 -> 24, 366 -> 365, 0 -> 1) and Save then SAVES the
 * clamped policy without an error - a probe left max 8 / distinct 1 / history
 * 24 / expiry 365 for two minutes. NEVER press Save in a case without the
 * `settingsRestore` fixture having snapshotted the policy first.
 */
export class PasswordPolicyTab extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.systemSettings);
    await this.byId(PASSWORD_POLICY.tab).click();
    await expect(this.byId(PASSWORD_POLICY.editButton)).toBeVisible({ timeout: Timeouts.default });
  }

  async isEditOffered(): Promise<boolean> {
    return this.byId(PASSWORD_POLICY.editButton).isVisible().catch(() => false);
  }

  async isTabOffered(): Promise<boolean> {
    return this.byId(PASSWORD_POLICY.tab).isVisible().catch(() => false);
  }

  /** The read view as label -> value (lines after the "Password Policy" heading). */
  async readView(): Promise<Record<string, string>> {
    const text = await this.page.locator('#app-layout-outlet').innerText().catch(() => '');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const labels = ['Minimum length', 'Maximum length', 'Minimum distinct characters', 'Require an uppercase letter', 'Require a lowercase letter', 'Require a digit', 'Require a symbol', 'Force a change on system-issued passwords', 'Passwords remembered', 'Password expires after (days)', 'When it applies'];
    const out: Record<string, string> = {};
    for (const label of labels) {
      const i = lines.lastIndexOf(label);
      if (i >= 0 && i + 1 < lines.length) out[label] = lines[i + 1];
    }
    return out;
  }

  async openEdit(): Promise<void> {
    await this.btn(PASSWORD_POLICY.editButton).click();
    await expect(this.byId(PASSWORD_POLICY.title)).toBeVisible({ timeout: Timeouts.default });
  }

  async isDrawerOpen(): Promise<boolean> {
    return this.byId(PASSWORD_POLICY.title).isVisible().catch(() => false);
  }

  async readNumber(field: PolicyNumberField): Promise<string> {
    return this.byId(PASSWORD_POLICY.input[field]).inputValue();
  }

  /** Types a number (select-all + type, then blur - the box clamps out-of-range values on blur). */
  async typeNumber(field: PolicyNumberField, value: string): Promise<void> {
    const input = this.byId(PASSWORD_POLICY.input[field]);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.blur();
    await this.page.waitForTimeout(200);
  }

  async isFlagTicked(field: PolicyFlagField): Promise<boolean> {
    return this.byId(PASSWORD_POLICY.checkbox[field]).isChecked();
  }

  async setFlag(field: PolicyFlagField, value: boolean): Promise<void> {
    const box = this.byId(PASSWORD_POLICY.checkbox[field]);
    if ((await box.isChecked()) !== value) await box.evaluate((el) => (el as HTMLInputElement).click());
  }

  /** The drawer's field errors (range messages). */
  async getErrors(): Promise<string[]> {
    const ids = fieldErrors(this.page, 'settings-password-policy-drawer-');
    const other = (await this.byId(PASSWORD_POLICY.drawer).locator('small').allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter(Boolean);
    return [...new Set([...(await ids), ...other])];
  }

  /** The drawer's hint texts (Reuse allowed / Never expires / the system-issued hint ...). */
  async getDrawerText(): Promise<string> {
    return (await this.byId(PASSWORD_POLICY.drawer).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * Save -> UpdatePasswordPolicy's answer (status -1 = refused on screen), the
   * body sent, toasts and errors. ONLY with `settingsRestore` active.
   */
  async save(): Promise<{ status: number; text: string; body: Record<string, unknown>; messages: string[]; errors: string[] }> {
    const sent = this.page.waitForRequest((r) => r.url().includes(ApiEndpoints.passwordPolicyUpdate), { timeout: Timeouts.short }).catch(() => null);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.passwordPolicyUpdate, () => this.btn(PASSWORD_POLICY.save).click(), Timeouts.short).catch(() => null);
    const request = await sent;
    return {
      status: request && answer ? answer.status : -1,
      text: answer?.text ?? '',
      body: (request?.postDataJSON() as Record<string, unknown> | null) ?? {},
      messages: await toastMessages(this.page, 1_500),
      errors: await this.getErrors(),
    };
  }

  async cancel(): Promise<void> {
    await this.btn(PASSWORD_POLICY.cancel).click();
    await this.byId(PASSWORD_POLICY.title).waitFor({ state: 'hidden', timeout: Timeouts.default }).catch(() => undefined);
  }
}
