import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { fieldErrors, readDialog, toastMessages } from './userCommon';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { INVITATION_FORM } from '../../constants/user/userIds';

/** What Save sent and answered: one CreateInvitation per e-mail chip. */
export interface InvitationSaveAnswer {
  requests: Record<string, unknown>[];
  answers: { status: number; text: string }[];
  messages: string[];
  errors: string[];
}

/**
 * Add New Invitation drawer (`invitation-form-drawer`, verified 2026-11-08):
 * Role Name (select - EVERY assignable role, the inactive "role without payer"
 * included), Payer (select `-role-name-select-2`, disabled + "Select" until a
 * payer-scoped role is chosen; 246 payers for the admin), Email Address
 * (type=email, no maxlength; Enter or the (+) button adds a chip; "colleague@"
 * -> "Enter a valid email address."), Import Email from Excel (hidden file input
 * `-file-input`, .xlsx / .xls / .csv with an "Email" column), Cancel / Save.
 * Save with nothing -> "This field is required." under Role and Email. Save ->
 * POST CreateInvitation `{ email, roleId, payerId, expiryDays: 5 }` per chip ->
 * toast "Invitation sent / The invitation has been created and is now active.";
 * a duplicate (same e-mail + role, Pending) -> 409 "An active invitation already
 * exists for this email address and role." (toast).
 */
export class InvitationFormDrawer extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(INVITATION_FORM.title), 'the invitation drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(INVITATION_FORM.title).isVisible().catch(() => false);
  }

  async getTitle(): Promise<string> {
    return (await this.byId(INVITATION_FORM.title).innerText()).trim();
  }

  async getText(): Promise<string> {
    return (await this.byId(INVITATION_FORM.root).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getRoleOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(INVITATION_FORM.role));
  }

  async chooseRole(name: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(INVITATION_FORM.role), name);
  }

  async isPayerDisabled(): Promise<boolean> {
    return (await this.byId(INVITATION_FORM.payer).getAttribute('aria-disabled')) === 'true';
  }

  async readPayer(): Promise<string> {
    return (await this.byId(INVITATION_FORM.payer).innerText()).trim();
  }

  async getPayerOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(INVITATION_FORM.payer));
  }

  async choosePayer(name: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(INVITATION_FORM.payer), name);
  }

  async getEmailMaxLength(): Promise<number | null> {
    const raw = await this.byId(INVITATION_FORM.email).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  /** Types an address and presses Enter (or clicks (+) when `viaButton`). */
  async addEmail(email: string, viaButton = false): Promise<void> {
    await this.byId(INVITATION_FORM.email).fill(email);
    if (viaButton) await this.byId(INVITATION_FORM.addEmail).click();
    else await this.byId(INVITATION_FORM.email).press('Enter');
    await this.page.waitForTimeout(300);
  }

  async readEmailInput(): Promise<string> {
    return this.byId(INVITATION_FORM.email).inputValue();
  }

  /** The e-mail chips' texts (`invitation-form-drawer-email-chips-chip-{e-mail, non-alphanumerics as -}`). */
  async readChips(): Promise<string[]> {
    // Past three chips the rest are folded behind "+N more" (full run 20656 read only three) - unfold first.
    const toggle = this.byId(INVITATION_FORM.chipsToggle);
    if (await toggle.isVisible().catch(() => false)) {
      if (/more/i.test(await toggle.innerText().catch(() => ''))) {
        await toggle.click();
        await this.page.waitForTimeout(300);
      }
    }
    return (await this.page.locator(`span[id^="${INVITATION_FORM.chipPrefix}"]`).allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter(Boolean);
  }

  /** Removes the chip of `email`. */
  async removeChip(email: string): Promise<void> {
    await this.byId(`${INVITATION_FORM.chipPrefix}${email.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-remove`).click();
  }

  /** Import Email from Excel: sets the hidden file input; returns the messages shown ("{n} email(s) added from the file." ...). */
  async importFile(file: { name: string; mimeType: string; buffer: Buffer }): Promise<string[]> {
    await this.byId(INVITATION_FORM.file).setInputFiles(file);
    await this.page.waitForTimeout(800);
    return [...(await toastMessages(this.page)), ...(await this.getErrors())];
  }

  async getErrors(): Promise<string[]> {
    return fieldErrors(this.page, `${INVITATION_FORM.root}-`);
  }

  /** Every `small` message in the drawer (field errors without ids included). */
  async getMessages(): Promise<string[]> {
    return (await this.byId(INVITATION_FORM.root).locator('small').allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter(Boolean);
  }

  /** Save -> every CreateInvitation sent (one per chip) with its answer, the toasts and errors. */
  async attemptSave(waitMs = 4_000): Promise<InvitationSaveAnswer> {
    const requests: Record<string, unknown>[] = [];
    const answers: { status: number; text: string }[] = [];
    const onRequest = (r: import('@playwright/test').Request): void => {
      if (r.url().includes(ApiEndpoints.invitationCreate)) requests.push((r.postDataJSON() as Record<string, unknown>) ?? {});
    };
    const onResponse = async (r: import('@playwright/test').Response): Promise<void> => {
      if (r.url().includes(ApiEndpoints.invitationCreate)) answers.push({ status: r.status(), text: await r.text().catch(() => '') });
    };
    this.page.on('request', onRequest);
    this.page.on('response', onResponse);
    try {
      await this.btn(INVITATION_FORM.save).click();
      await this.page.waitForTimeout(waitMs);
    } finally {
      this.page.off('request', onRequest);
      this.page.off('response', onResponse);
    }
    return { requests, answers, messages: await toastMessages(this.page), errors: [...(await this.getErrors()), ...(await this.getMessages())] };
  }

  async cancel(): Promise<{ title: string; message: string } | null> {
    await this.btn(INVITATION_FORM.cancel).click();
    await this.page.waitForTimeout(500);
    const d = await readDialog(this.page);
    return d.visible ? { title: d.title, message: d.message } : null;
  }

  async close(): Promise<void> {
    await this.byId(INVITATION_FORM.close).click();
    await this.page.waitForTimeout(400);
  }
}
