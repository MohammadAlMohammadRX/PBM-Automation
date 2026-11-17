import type { Locator, Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import { ROLE_DEACTIVATE_IDS, ROLE_DIALOG, ROLE_TOAST } from '../../constants/role/roleIds';
import { buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { ROLE_API, answerMessage } from '../../utils/role/roleApi';

/** What a SetActive-sending click produced. */
export interface ToggleOutcome {
  /** SetActive answer status (null = no request went out, e.g. a validation error). */
  status: number | null;
  apiMessage: string;
  /** New toast "summary detail" ('' when none). */
  toast: string;
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Snapshot of the toasts on screen, then the first NEW one after `action` ('' after the toast timeout). */
export async function toastAfter(page: Page, action: () => Promise<void>): Promise<string> {
  const before = new Set((await page.locator(`#${ROLE_TOAST.root}`).allInnerTexts().catch(() => [] as string[])).map(norm));
  await action();
  let found = '';
  await expect
    .poll(async () => {
      const now = (await page.locator(`#${ROLE_TOAST.root}`).allInnerTexts().catch(() => [] as string[])).map(norm);
      found = now.find((t) => !before.has(t)) ?? '';
      return found;
    }, { timeout: Timeouts.toast })
    .not.toBe('')
    .catch(() => undefined);
  return found;
}

async function setActiveAfter(page: Page, action: () => Promise<void>): Promise<ToggleOutcome> {
  // A validation refusal sends nothing: wait SHORT for the request, then long for its answer.
  const sent = page.waitForRequest((r) => r.url().includes(ROLE_API.setActive), { timeout: Timeouts.short }).catch(() => null);
  const answer = page.waitForResponse((r) => r.url().includes(ROLE_API.setActive), { timeout: Timeouts.navigation }).catch(() => null as Response | null);
  let res: Response | null = null;
  let wasSent = true;
  const toast = await toastAfter(page, async () => {
    await action();
    wasSent = !!(await sent);
    res = wasSent ? await answer : null;
  });
  if (!res) return { status: null, apiMessage: '', toast };
  const r = res as Response;
  const text = await r.text().catch(() => '');
  let reasons: string[] = [];
  try {
    reasons = ((JSON.parse(text) as { ValidationErrors?: { Reason?: string }[] }).ValidationErrors ?? []).map((v) => v.Reason ?? '').filter(Boolean);
  } catch {
    /* non-JSON */
  }
  return { status: r.status(), apiMessage: answerMessage({ status: r.status(), text, validationErrors: reasons }), toast };
}

/**
 * The Deactivate drawer `role-deactivate-drawer` - opened by "Inactivate" on an ACTIVE role's row.
 *
 * Title "Deactivate Role"; warning "Deactivate <name>? Users holding this role lose its permissions. No other
 * record is changed." (the `-warning` <p> holds the first two sentences); "Deactivation Reason" p-select
 * (Reorganisation / Superseded by Another Role / No Longer Required / Security Review / Other); "Details"
 * textarea (maxlength 500, optional unless Other); Cancel / Deactivate.
 * Deactivate with no reason -> `-reason-error` "This field is required."; reason Other + empty details ->
 * `-details-error` 'Details are required when the reason is "Other".' - both client side, no request.
 * Success: POST Roles/SetActive, toast "Role deactivated The role is now inactive and can no longer be assigned.",
 * drawer closes, row badge "Inactive", toggle reads "Activate".
 */
export class RoleDeactivateDrawer {
  constructor(private readonly page: Page) {}

  el(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  async waitOpen(): Promise<void> {
    await expect(this.el(ROLE_DEACTIVATE_IDS.title), 'the Deactivate Role drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.el(ROLE_DEACTIVATE_IDS.title).isVisible().catch(() => false);
  }

  async title(): Promise<string> {
    return norm(await this.el(ROLE_DEACTIVATE_IDS.title).innerText());
  }

  /** The confirmation text: every paragraph of the body ("Deactivate <name>? Users ... permissions. No other record is changed."). */
  async bodyText(): Promise<string> {
    return norm((await this.el(ROLE_DEACTIVATE_IDS.body).locator('p').allInnerTexts()).join(' '));
  }

  async warningText(): Promise<string> {
    return norm(await this.el(ROLE_DEACTIVATE_IDS.warning).innerText());
  }

  reasonSelect(): Locator {
    return this.el(ROLE_DEACTIVATE_IDS.reasonSelect);
  }

  async reasonOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.reasonSelect());
  }

  async chooseReason(label: string): Promise<void> {
    Logger.step(`[deactivate] Reason "${label}"`);
    await chooseSelectOption(this.page, this.reasonSelect(), label);
  }

  async selectedReason(): Promise<string> {
    return norm(await this.reasonSelect().innerText());
  }

  detailsInput(): Locator {
    return this.el(ROLE_DEACTIVATE_IDS.detailsInput);
  }

  async fillDetails(text: string): Promise<string> {
    await this.detailsInput().fill(text);
    return this.detailsInput().inputValue();
  }

  async reasonError(): Promise<string> {
    const e = this.el(ROLE_DEACTIVATE_IDS.reasonError);
    return (await e.isVisible().catch(() => false)) ? norm(await e.innerText()) : '';
  }

  async detailsError(): Promise<string> {
    const e = this.el(ROLE_DEACTIVATE_IDS.detailsError);
    return (await e.isVisible().catch(() => false)) ? norm(await e.innerText()) : '';
  }

  /** Clicks Deactivate and reports the SetActive answer + toast (status null = refused on screen). */
  async confirm(): Promise<ToggleOutcome> {
    Logger.step('[deactivate] Confirm');
    const out = await setActiveAfter(this.page, async () => {
      await this.page.locator(buttonSelector(ROLE_DEACTIVATE_IDS.confirmButton)).first().click();
    });
    if (out.status !== null && out.status < 300) await expect(this.el(ROLE_DEACTIVATE_IDS.title)).toBeHidden({ timeout: Timeouts.default });
    return out;
  }

  /** Reason + optional details + confirm. */
  async deactivate(reason: string, details?: string): Promise<ToggleOutcome> {
    await this.chooseReason(reason);
    if (details !== undefined) await this.fillDetails(details);
    return this.confirm();
  }

  async cancel(how: 'cancel' | 'x' = 'cancel'): Promise<void> {
    const target = how === 'x' ? this.el(ROLE_DEACTIVATE_IDS.close) : this.page.locator(buttonSelector(ROLE_DEACTIVATE_IDS.cancelButton)).first();
    await target.click();
    await expect(this.el(ROLE_DEACTIVATE_IDS.title), 'the Deactivate Role drawer should close').toBeHidden({ timeout: Timeouts.default });
  }
}

/**
 * The shared confirm dialog `pbm-dialog` as Role Administration raises it:
 *  - Activate (row toggle on an INACTIVE role): "Activate Role" / "Are you sure you want to activate <name>?" /
 *    Cancel + Activate -> SetActive, toast "Role activated The role is now active and can be assigned to users.";
 *  - Delete: "Delete Role" / "Do you want to delete <name>?" / No + Yes -> DeleteRole, toast
 *    "Role deleted The role has been removed and is no longer available.".
 */
export class RoleConfirmDialog {
  constructor(private readonly page: Page) {}

  root(): Locator {
    return this.page.locator(`#${ROLE_DIALOG.root}`);
  }

  async waitOpen(): Promise<void> {
    await expect(this.root(), 'the confirmation dialog should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.root().isVisible().catch(() => false);
  }

  async read(): Promise<{ title: string; message: string; confirmLabel: string; cancelLabel: string }> {
    return {
      title: norm(await this.page.locator(`#${ROLE_DIALOG.title}`).innerText()),
      message: norm(await this.page.locator(`#${ROLE_DIALOG.message}`).innerText()),
      confirmLabel: norm(await this.page.locator(`#${ROLE_DIALOG.confirm}`).innerText()),
      cancelLabel: norm(await this.page.locator(`#${ROLE_DIALOG.cancel}`).innerText()),
    };
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(ROLE_DIALOG.cancel)).first().click();
    await expect(this.root()).toBeHidden({ timeout: Timeouts.default });
  }

  /** Activate confirm: clicks the affirmative button, returns the SetActive answer + toast. */
  async confirmActivate(): Promise<ToggleOutcome> {
    const out = await setActiveAfter(this.page, async () => {
      await this.page.locator(buttonSelector(ROLE_DIALOG.confirm)).first().click();
    });
    await expect(this.root()).toBeHidden({ timeout: Timeouts.default });
    return out;
  }

  /** Delete confirm: clicks Yes, returns the DeleteRole answer + toast. */
  async confirmDelete(): Promise<ToggleOutcome> {
    const answer = this.page.waitForResponse((r) => r.url().includes('/api/identity/Roles/DeleteRole'), { timeout: Timeouts.default }).catch(() => null as Response | null);
    let res: Response | null = null;
    const toast = await toastAfter(this.page, async () => {
      await this.page.locator(buttonSelector(ROLE_DIALOG.confirm)).first().click();
      res = await answer;
    });
    await expect(this.root()).toBeHidden({ timeout: Timeouts.default });
    if (!res) return { status: null, apiMessage: '', toast };
    const r = res as Response;
    const text = await r.text().catch(() => '');
    let reasons: string[] = [];
    try {
      reasons = ((JSON.parse(text) as { ValidationErrors?: { Reason?: string }[] }).ValidationErrors ?? []).map((v) => v.Reason ?? '').filter(Boolean);
    } catch {
      /* non-JSON */
    }
    return { status: r.status(), apiMessage: answerMessage({ status: r.status(), text, validationErrors: reasons }), toast };
  }
}
