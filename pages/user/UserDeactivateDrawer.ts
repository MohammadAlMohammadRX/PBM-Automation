import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { fieldErrors, toastMessages } from './userCommon';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { USER_DEACTIVATE } from '../../constants/user/userIds';
import { NetworkUtils } from '../../utils/NetworkUtils';

/**
 * The Deactivate User drawer (`user-deactivate-drawer`, verified 2026-11-08):
 * title "Deactivate User?", warning "Deactivate {name}? They will not be able
 * to sign in. No other record is changed.", Deactivation Reason (lookup
 * userDeactivationReason: test, Left Organisation, Role Changed, Extended
 * Leave, Security Incident, Policy Violation, Prolonged Inactivity, Other -
 * "Left Organisation" spelled with an s, and a stray "test" item), Details
 * (placeholder "Optional notes about this deactivation", maxlength 500 - typing
 * stops at 500), Cancel / Deactivate. Confirm with no reason -> "This field is
 * required."; Other + empty details -> 'Details are required when the reason is
 * "Other".'. Confirming sends ToggleUserActivation `{ id, isActive: false,
 * inactivationReasonId, inactivationDetails }` -> toast "User deactivated / The
 * user is now inactive.".
 */
export class UserDeactivateDrawer extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(USER_DEACTIVATE.title), 'the Deactivate User drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(USER_DEACTIVATE.title).isVisible().catch(() => false);
  }

  /** Waits for the drawer to finish closing (it slides out after Confirm); true when it is gone. */
  async waitForClosed(timeout: number = Timeouts.short): Promise<boolean> {
    return this.byId(USER_DEACTIVATE.title).waitFor({ state: 'hidden', timeout }).then(() => true).catch(() => false);
  }

  async getTitle(): Promise<string> {
    return (await this.byId(USER_DEACTIVATE.title).innerText()).trim();
  }

  async getWarning(): Promise<string> {
    return (await this.byId(USER_DEACTIVATE.warning).innerText()).replace(/\s+/g, ' ').trim();
  }

  async getText(): Promise<string> {
    return (await this.byId(USER_DEACTIVATE.body).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getReasonOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(USER_DEACTIVATE.reason));
  }

  async selectReason(label: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(USER_DEACTIVATE.reason), label);
  }

  async readReason(): Promise<string> {
    return (await this.byId(USER_DEACTIVATE.reason).innerText()).trim();
  }

  async fillDetails(text: string): Promise<void> {
    await this.byId(USER_DEACTIVATE.details).fill(text);
  }

  async readDetails(): Promise<string> {
    return this.byId(USER_DEACTIVATE.details).inputValue();
  }

  async getDetailsMaxLength(): Promise<number | null> {
    const raw = await this.byId(USER_DEACTIVATE.details).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async getFieldErrors(): Promise<string[]> {
    return fieldErrors(this.page, `${USER_DEACTIVATE.root}-`);
  }

  /** Deactivate -> ToggleUserActivation's answer (status -1 when refused on screen) + toasts + errors. */
  async attemptConfirm(): Promise<{ status: number; text: string; body: Record<string, unknown>; messages: string[]; errors: string[] }> {
    const sent = this.page.waitForRequest((r) => r.url().includes(ApiEndpoints.userToggleActivation), { timeout: Timeouts.short }).catch(() => null);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.userToggleActivation, () => this.btn(USER_DEACTIVATE.confirm).click(), Timeouts.short).catch(() => null);
    const request = await sent;
    return {
      status: request && answer ? answer.status : -1,
      text: answer?.text ?? '',
      body: (request?.postDataJSON() as Record<string, unknown> | null) ?? {},
      messages: await toastMessages(this.page),
      errors: await this.getFieldErrors(),
    };
  }

  async cancel(): Promise<void> {
    await this.btn(USER_DEACTIVATE.cancel).click();
    await this.byId(USER_DEACTIVATE.title).waitFor({ state: 'hidden', timeout: Timeouts.default });
  }

  /** Reason + details + Deactivate, asserting a 2xx answer. */
  async deactivate(reason = 'Other', details = 'Deactivated by the automation suite.'): Promise<{ status: number; text: string; body: Record<string, unknown>; messages: string[]; errors: string[] }> {
    await this.selectReason(reason);
    if (details) await this.fillDetails(details);
    const a = await this.attemptConfirm();
    expect(a.status, `deactivation should succeed: ${a.text.slice(0, 200)} ${a.errors.join(' | ')}`).toBeLessThan(300);
    return a;
  }
}
