import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fieldErrors, toastMessages } from './userCommon';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { CHANGE_PASSWORD, PASSWORD_RULE, type PasswordRule } from '../../constants/user/userIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { SuiteSecret, scrubTokens } from '../../utils/UserProvisioning';

/** A value typed into a password box: a SuiteSecret (a real password - revealed only here) or a throwaway string. */
export type PasswordInput = SuiteSecret | string;

const reveal = (v: PasswordInput): string => (v instanceof SuiteSecret ? v.reveal() : v);

/**
 * The Change Password drawer (`change-password-drawer`, from the user menu or My
 * Profile; verified 2026-11-08): title "Change Password" (forced: "Set a New
 * Password", no Cancel / close), intro "Enter your current password, then
 * choose a new one that meets the password policy.", Current / New / Confirm
 * Password (masked, maxlength = the policy maximum), the live checklist
 * (`-requirements-rule-{lengthrange|uppercase|lowercase|digit|symbol|uniquechars}`:
 * "Between 8 and 16 characters", "One uppercase letter", "One lowercase
 * letter", "One number", "One symbol", "At least 7 different characters"), the
 * strength meter (`-strength`, aria-label Weak / Fair / Good / Strong), Cancel /
 * Change Password (`-submit-button`). Submit -> POST Manage/ChangePassword
 * `{ oldPassword, newPassword, confirmPassword }`; a wrong current password ->
 * 500 ValidationErrors PasswordMismatch "Incorrect password.".
 *
 * PASSWORDS: type them with `fill(..., SuiteSecret)`; every method that returns
 * leaves the boxes as the app left them - the fixture wipes password boxes
 * before a context closes (no password in a failure snapshot).
 */
export class ChangePasswordDrawer extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(CHANGE_PASSWORD.title), 'the Change Password drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(CHANGE_PASSWORD.title).isVisible().catch(() => false);
  }

  async getTitle(): Promise<string> {
    return (await this.byId(CHANGE_PASSWORD.title).innerText()).trim();
  }

  async getIntro(): Promise<string> {
    return (await this.byId(CHANGE_PASSWORD.intro).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getText(): Promise<string> {
    return (await this.byId(CHANGE_PASSWORD.body).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async isCancelOffered(): Promise<boolean> {
    return this.byId(CHANGE_PASSWORD.cancel).isVisible().catch(() => false);
  }

  async isCloseOffered(): Promise<boolean> {
    return this.byId(CHANGE_PASSWORD.close).isVisible().catch(() => false);
  }

  private box(which: 'current' | 'next' | 'confirm'): string {
    return CHANGE_PASSWORD[which];
  }

  /** Types into one box (never logged). */
  async fill(which: 'current' | 'next' | 'confirm', value: PasswordInput): Promise<void> {
    const input = this.byId(this.box(which));
    await input.fill(reveal(value));
    await input.blur();
  }

  /** Types character by character (the maxlength cases: typing stops at the policy maximum). */
  async typeSlowly(which: 'current' | 'next' | 'confirm', value: PasswordInput): Promise<void> {
    const input = this.byId(this.box(which));
    await input.click();
    await input.pressSequentially(reveal(value));
  }

  /** How many characters a box holds (never the value itself). */
  async valueLength(which: 'current' | 'next' | 'confirm'): Promise<number> {
    return (await this.byId(this.box(which)).inputValue()).length;
  }

  async getInputType(which: 'current' | 'next' | 'confirm'): Promise<string> {
    return (await this.byId(this.box(which)).getAttribute('type')) ?? '';
  }

  async getMaxLength(which: 'current' | 'next' | 'confirm'): Promise<number | null> {
    const raw = await this.byId(this.box(which)).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  /** The checklist lines rendered (by key) with their texts. */
  async readRules(): Promise<Partial<Record<PasswordRule, string>>> {
    const out: Partial<Record<PasswordRule, string>> = {};
    for (const [key, suffix] of Object.entries(PASSWORD_RULE) as [PasswordRule, string][]) {
      const li = this.byId(`${CHANGE_PASSWORD.rulePrefix}${suffix}`);
      if (await li.isVisible().catch(() => false)) out[key] = (await li.innerText()).trim();
    }
    return out;
  }

  /** Whether a checklist line reads as met (class `is-met`, icon pi-check-circle; unmet: pi-circle). */
  async isRuleMet(rule: PasswordRule): Promise<boolean> {
    const li = this.byId(`${CHANGE_PASSWORD.rulePrefix}${PASSWORD_RULE[rule]}`);
    return li.evaluate((el) => el.classList.contains('is-met'));
  }

  /** The strength meter's label (Weak / Fair / Good / Strong; '' before typing). */
  async readStrength(): Promise<string> {
    return (await this.byId(CHANGE_PASSWORD.strengthLabel).innerText().catch(() => '')).trim();
  }

  async getFieldErrors(): Promise<string[]> {
    return fieldErrors(this.page, `${CHANGE_PASSWORD.root}-`);
  }

  /** Every message in the drawer body (`small`, alerts) - some errors carry no id. */
  async getMessages(): Promise<string[]> {
    return (await this.byId(CHANGE_PASSWORD.body).locator('small, [role="alert"]').allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** Change Password -> ChangePassword's answer (status -1 = refused on screen), toasts, errors; whether the drawer closed. */
  async attemptSubmit(): Promise<{ status: number; text: string; messages: string[]; errors: string[]; closed: boolean }> {
    const sent = this.page.waitForRequest((r) => r.url().includes(ApiEndpoints.manageChangePassword), { timeout: Timeouts.short }).catch(() => null);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.manageChangePassword, () => this.btn(CHANGE_PASSWORD.submit).click(), Timeouts.short).catch(() => null);
    const request = await sent;
    await this.page.waitForTimeout(600);
    return {
      status: request && answer ? answer.status : -1,
      text: scrubTokens(answer?.text ?? ''),
      messages: await toastMessages(this.page, 1_500),
      errors: [...(await this.getFieldErrors()), ...(await this.getMessages())],
      closed: !(await this.isOpen()),
    };
  }

  /** Fills the three boxes and submits. */
  async change(current: PasswordInput, next: PasswordInput, confirm: PasswordInput = next): Promise<{ status: number; text: string; messages: string[]; errors: string[]; closed: boolean }> {
    await this.fill('current', current);
    await this.fill('next', next);
    await this.fill('confirm', confirm);
    return this.attemptSubmit();
  }

  async cancel(): Promise<void> {
    await this.btn(CHANGE_PASSWORD.cancel).click();
    await this.byId(CHANGE_PASSWORD.title).waitFor({ state: 'hidden', timeout: Timeouts.default }).catch(() => undefined);
  }

  /** Clears every password box in the page (call before leaving a failing state). */
  async wipe(): Promise<void> {
    await wipePasswordBoxes(this.page);
  }
}

/** Empties every password input on the page (no password may reach a failure snapshot). */
export async function wipePasswordBoxes(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('input').forEach((i) => {
      if (i.type === 'password') i.value = '';
    });
  }).catch(() => undefined);
}
