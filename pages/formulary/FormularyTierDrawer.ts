import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { requiredLabels } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import {
  FORMULARY_TIER_DRAWER,
  FORMULARY_TIER_ERROR,
  TOAST,
  buttonSelector,
  type FormularyTierField,
} from '../../constants/ElementIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** Tier drawer values; a key left out is not touched. */
export interface TierValues {
  nameEn?: string;
  nameAr?: string;
  coverage?: string | number;
  order?: string | number;
  descriptionEn?: string;
  descriptionAr?: string;
}

const INPUT: Record<FormularyTierField, string> = {
  nameEn: FORMULARY_TIER_DRAWER.nameEn,
  nameAr: FORMULARY_TIER_DRAWER.nameAr,
  coverage: FORMULARY_TIER_DRAWER.coverage,
  order: FORMULARY_TIER_DRAWER.order,
  descriptionEn: FORMULARY_TIER_DRAWER.descriptionEn,
  descriptionAr: FORMULARY_TIER_DRAWER.descriptionAr,
};

/**
 * The Add / Edit Tier drawer (`formulary-tier-form-drawer`), verified live
 * 2026-11-02: Tier Name EN / AR, Default Coverage %, Tier Order, Description
 * EN / AR, Cancel / Save. Empty Save shows "This field is required." under name
 * EN, name AR and order (`-tier-name-en-error`, `-tier-name-ar-error`,
 * `-tier-order-error`). A duplicate order is refused by the SERVER (409 "Tier
 * order must be unique within the formulary.", shown as a toast) and the drawer
 * stays open. Toasts: "Tier created." / "Tier updated.".
 */
export class FormularyTierDrawer {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(FORMULARY_TIER_DRAWER.title), 'the tier drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(FORMULARY_TIER_DRAWER.title).isVisible();
  }

  /** "Add Tier" / "Edit Tier". */
  async getTitle(): Promise<string> {
    return (await this.byId(FORMULARY_TIER_DRAWER.title).innerText()).trim();
  }

  async getRequiredLabels(): Promise<string[]> {
    return requiredLabels(this.byId(FORMULARY_TIER_DRAWER.root).first());
  }

  /** Types a value (real key presses for the number inputs, so the form registers it). */
  async type(field: FormularyTierField, value: string | number): Promise<void> {
    const input = this.byId(INPUT[field]);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    if (String(value) !== '') await input.pressSequentially(String(value));
    await input.blur();
  }

  async getValue(field: FormularyTierField): Promise<string> {
    return this.byId(INPUT[field]).inputValue();
  }

  async getMaxLength(field: FormularyTierField): Promise<number | null> {
    const raw = await this.byId(INPUT[field]).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async fill(values: TierValues): Promise<void> {
    Logger.step(`Tier drawer: ${JSON.stringify(values)}`);
    for (const [field, value] of Object.entries(values) as [FormularyTierField, string | number][]) {
      if (value !== undefined) await this.type(field, value);
    }
  }

  async getFieldError(field: FormularyTierField): Promise<string> {
    return (await this.byId(`${FORMULARY_TIER_DRAWER.errorPrefix}${FORMULARY_TIER_ERROR[field]}`).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  async getFieldErrors(): Promise<Partial<Record<FormularyTierField, string>>> {
    const out: Partial<Record<FormularyTierField, string>> = {};
    for (const field of Object.keys(FORMULARY_TIER_ERROR) as FormularyTierField[]) {
      const el = this.byId(`${FORMULARY_TIER_DRAWER.errorPrefix}${FORMULARY_TIER_ERROR[field]}`);
      if (await el.isVisible().catch(() => false)) out[field] = (await el.innerText()).trim();
    }
    return out;
  }

  /** Field errors and toasts, settled. */
  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${FORMULARY_TIER_DRAWER.errorPrefix}"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
  }

  /** Clicks Save and reports CreateTier / UpdateTier's answer (-1 when refused client-side), whether the drawer closed and the messages. */
  async attemptSave(): Promise<{ status: number; text: string; closed: boolean; messages: string[] }> {
    Logger.step('Tier drawer: Save');
    const answered = this.page
      .waitForResponse((r) => /\/(CreateTier|UpdateTier)$/.test(new URL(r.url()).pathname), { timeout: Timeouts.short })
      .catch(() => null);
    await this.page.locator(buttonSelector(FORMULARY_TIER_DRAWER.save)).first().click();
    const response = await answered;
    const closed = await this.byId(FORMULARY_TIER_DRAWER.title).waitFor({ state: 'hidden', timeout: Timeouts.short }).then(() => true).catch(() => false);
    return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', closed, messages: await this.getMessages() };
  }

  /** Saves and asserts it was accepted and the drawer closed. */
  async save(): Promise<void> {
    const answer = await this.attemptSave();
    expect(answer.status, `the tier save should succeed: ${answer.text.slice(0, 300)} ${answer.messages.join(' | ')}`).toBe(200);
    expect(answer.closed, 'the tier drawer should close after saving').toBe(true);
  }

  /** Cancel; a dirty form raises the Unsaved Changes prompt, answered with `discard`. */
  async cancel(discard = true): Promise<void> {
    await this.page.locator(buttonSelector(FORMULARY_TIER_DRAWER.cancel)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
  }

  async close(): Promise<void> {
    await this.byId(FORMULARY_TIER_DRAWER.close).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) await dialog.discardChanges();
    await expect(this.byId(FORMULARY_TIER_DRAWER.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
