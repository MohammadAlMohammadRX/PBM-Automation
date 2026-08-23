import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/** UI languages supported by the PBM application. */
export type AppLanguage = 'en' | 'ar';

/**
 * Reusable bilingual (English / Arabic) language switcher.
 *
 * Verified against the live app: the header exposes a single toggle button
 * labelled "عربي"; activating it flips <html lang> between "en" and "ar" and
 * sets dir="rtl" for Arabic. Every module reuses this control, so it lives in
 * components/ rather than in any one Page Object.
 */
export class LanguageSwitcher {
  constructor(private readonly page: Page) {}

  /**
   * The single header toggle. Its label is the language it switches TO, so it
   * reads "عربي" while the UI is English and "EN" while the UI is Arabic.
   */
  private toggleButton(): Locator {
    return this.page.getByRole('button', { name: /^(عربي|EN)$/ }).first();
  }

  /** The language the UI is currently rendered in. */
  async currentLanguage(): Promise<AppLanguage> {
    const lang = await this.page.locator('html').getAttribute('lang');
    return lang === 'ar' ? 'ar' : 'en';
  }

  /** Switches to the requested language (no-op when already active). */
  async switchTo(language: AppLanguage): Promise<void> {
    if ((await this.currentLanguage()) === language) return;
    Logger.step(`Switching UI language to "${language}"`);
    await this.toggleButton().click();
    await this.expectLanguage(language);
  }

  async expectLanguage(language: AppLanguage): Promise<void> {
    await expect(this.page.locator('html')).toHaveAttribute('lang', language, {
      timeout: Timeouts.default,
    });
  }

  /** Asserts the page is laid out right-to-left (Arabic). */
  async expectRightToLeft(): Promise<void> {
    await expect(this.page.locator('html')).toHaveAttribute('dir', 'rtl', {
      timeout: Timeouts.default,
    });
  }
}
