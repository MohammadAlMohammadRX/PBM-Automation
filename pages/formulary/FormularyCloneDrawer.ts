import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { setCheckbox } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { FORMULARY_CLONE, TOAST, buttonSelector } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** The suffix of each clone-drawer control under its namespace. */
const PART = {
  title: 'title',
  close: 'close',
  sourceMessage: 'source-message-text',
  nameEn: 'formulary-name-en-input',
  nameAr: 'formulary-name-ar-input',
  descriptionEn: 'description-en-input',
  descriptionAr: 'description-ar-input',
  includeTiers: 'include-tiers-checkbox',
  includeTrades: 'include-trades-checkbox',
  includePricing: 'include-pricing-checkbox',
  periodMessage: 'period-message-text',
  effectiveDate: 'effective-date-input',
  expiryDate: 'expiry-date-input',
  back: 'back-button',
  next: 'next-button',
  clone: 'clone-button',
} as const;

export type CloneField = 'nameEn' | 'nameAr' | 'descriptionEn' | 'descriptionAr' | 'effectiveDate' | 'expiryDate';
export type CloneContent = 'includeTiers' | 'includeTrades' | 'includePricing';

const ERROR_SUFFIX: Record<CloneField, string> = {
  nameEn: 'formulary-name-en-error',
  nameAr: 'formulary-name-ar-error',
  descriptionEn: 'description-en-error',
  descriptionAr: 'description-ar-error',
  effectiveDate: 'effective-date-error',
  expiryDate: 'expiry-date-error',
};

/**
 * The Clone Formulary drawer (verified live 2026-11-02 on the detail screen,
 * `formulary-clone-dialog`). Step 1: a "Cloning a formulary: This creates a NEW
 * formulary from "<source>" ..." message, name EN / AR prefilled with
 * "(Clone)" / "مستنسخة", descriptions, and Include Tiers / Trades / Pricing
 * check boxes with hints (`-contents-*-hint`). Step 2: "A clone does not
 * inherit its source period" and its own effective / expiry date-time pickers
 * (typed `DD/MM/YYYY HH:mm`). Clone sends CloneFormulary; the clone is a new v0
 * draft with a temporary FORM-D- code.
 */
export class FormularyCloneDrawer {
  constructor(private readonly page: Page, private readonly namespace: string = FORMULARY_CLONE.root) {}

  private part(suffix: string): Locator {
    return this.page.locator(`#${this.namespace}-${suffix}`);
  }

  private button(suffix: string): Locator {
    return this.page.locator(buttonSelector(`${this.namespace}-${suffix}`)).first();
  }

  async waitForOpen(): Promise<void> {
    await expect(this.part(PART.title), 'the Clone Formulary drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.part(PART.title).isVisible();
  }

  async getTitle(): Promise<string> {
    return (await this.part(PART.title).innerText()).trim();
  }

  /** The drawer's whole text. */
  async getText(): Promise<string> {
    return (await this.page.locator(`#${this.namespace}`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** "Cloning a formulary: This creates a NEW formulary from ..." */
  async getSourceMessage(): Promise<string> {
    return (await this.part(PART.sourceMessage).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Every hint under the include check boxes, by suffix (`timing`, `pricing-range`, `none`, `blocked`, `trades-left-out`). */
  async getContentHints(): Promise<Record<string, string>> {
    const prefix = `${this.namespace}-contents-`;
    const hints = await this.page.locator(`[id^="${prefix}"][id$="-hint"]`).evaluateAll((els) =>
      els.map((e) => ({ id: e.id, text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim() })));
    return Object.fromEntries(hints.map((h) => [h.id.slice(prefix.length).replace(/-hint$/, ''), h.text]));
  }

  async getPeriodMessage(): Promise<string> {
    return (await this.part(PART.periodMessage).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getValue(field: CloneField): Promise<string> {
    return this.part(PART[field]).inputValue();
  }

  async type(field: CloneField, value: string): Promise<void> {
    const input = this.part(PART[field]);
    await input.click();
    await input.press('ControlOrMeta+a');
    if (value === '') {
      await input.press('Delete');
    } else if (field === 'effectiveDate' || field === 'expiryDate') {
      await input.pressSequentially(value);
      await input.press('Enter');
      return;
    } else {
      await input.fill(value);
    }
    await input.blur();
  }

  /** Whether an include check box is ticked, null when it is not rendered. */
  async isIncluded(content: CloneContent): Promise<boolean | null> {
    const box = this.part(PART[content]);
    if ((await box.count()) === 0) return null;
    return box.isChecked();
  }

  async isIncludeEnabled(content: CloneContent): Promise<boolean> {
    return this.part(PART[content]).isEnabled().catch(() => false);
  }

  async setIncluded(content: CloneContent, value: boolean): Promise<void> {
    await setCheckbox(this.part(PART[content]), value);
  }

  async getFieldError(field: CloneField): Promise<string> {
    return (await this.part(ERROR_SUFFIX[field]).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${this.namespace}-"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
  }

  /** Next to step 2; returns whether it moved. */
  async next(): Promise<boolean> {
    await this.button(PART.next).click();
    return this.part(PART.effectiveDate).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  async back(): Promise<void> {
    await this.button(PART.back).click();
  }

  /**
   * Clicks Clone and reports CloneFormulary's answer (-1 when nothing was sent)
   * with the messages shown and the page's URL afterwards (the screen may open
   * the clone).
   */
  async attemptClone(): Promise<{ status: number; text: string; messages: string[]; url: string }> {
    Logger.step('Clone drawer: Clone');
    const answer = await NetworkUtils.captureResponse(this.page, '/CloneFormulary', () => this.button(PART.clone).click(), Timeouts.default);
    const messages = await this.getMessages();
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages, url: this.page.url() };
  }

  /** Step 2 dates then Clone - the whole flow from step 1 (names left as prefilled unless given). */
  async clone(period: { effectiveDate: string; expiryDate: string }, names: { nameEn?: string; nameAr?: string } = {}): Promise<{ status: number; text: string; messages: string[]; url: string }> {
    if (names.nameEn !== undefined) await this.type('nameEn', names.nameEn);
    if (names.nameAr !== undefined) await this.type('nameAr', names.nameAr);
    expect(await this.next(), `the clone's step 1 should be accepted: ${(await this.getMessages()).join(' | ')}`).toBe(true);
    await this.type('effectiveDate', period.effectiveDate);
    await this.type('expiryDate', period.expiryDate);
    return this.attemptClone();
  }

  /**
   * The drawer's controls as rendered (writer A, 18795): Back (Cancel on step
   * 1), Next, Clone and the header Close - 'absent' | 'disabled' | 'available'
   * with their labels.
   */
  async readControls(): Promise<Record<'back' | 'next' | 'clone' | 'close', { availability: 'absent' | 'disabled' | 'available'; label: string }>> {
    const read = async (control: Locator): Promise<{ availability: 'absent' | 'disabled' | 'available'; label: string }> => {
      if ((await control.count()) === 0 || !(await control.isVisible())) return { availability: 'absent', label: '' };
      return { availability: (await control.isEnabled()) ? 'available' : 'disabled', label: (await control.innerText().catch(() => '')).trim() };
    };
    return {
      back: await read(this.button(PART.back)),
      next: await read(this.button(PART.next)),
      clone: await read(this.button(PART.clone)),
      close: await read(this.part(PART.close)),
    };
  }

  /** Step 1's Cancel (the Back button): closes the drawer, discarding a dirty form. */
  async cancel(): Promise<void> {
    await this.button(PART.back).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) await dialog.discardChanges();
  }

  async close(): Promise<void> {
    await this.part(PART.close).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) await dialog.discardChanges();
    await expect(this.part(PART.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
