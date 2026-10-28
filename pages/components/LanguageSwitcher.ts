import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { GLOBAL, buttonSelector } from '../../constants/ElementIds';
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
   * The single language toggle, by id.
   *
   * Its LABEL is the language it switches TO - "عربي" in English, "EN" in
   * Arabic - so matching on the accessible name meant the selector had to know
   * both captions and would break on any wording change. The id does not move
   * with the language.
   *
   * Two ids cover it: the authenticated header, and the auth shell on the
   * unauthenticated screens, which has no app header.
   */
  private toggleButton(): Locator {
    return this.page
      .locator(buttonSelector(GLOBAL.languageToggle))
      .or(this.page.locator(buttonSelector(GLOBAL.authLanguageToggle)))
      .first();
  }

  /** The language the UI is currently rendered in. */
  async currentLanguage(): Promise<AppLanguage> {
    const lang = await this.page.locator('html').getAttribute('lang');
    return lang === 'ar' ? 'ar' : 'en';
  }

  /** Switches to the requested language (no-op when already active). */
  async switchTo(language: AppLanguage): Promise<void> {
    // The toggle lives in the application's top bar. A case that switches
    // language as its first act still has a blank page, so the click waited
    // on a button that was never there: 19114, 19135 and 19136 timed out
    // (2026-10-27). Open the application first.
    if (this.page.url() === 'about:blank') {
      await this.page.goto('/');
      await this.toggleButton().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    }
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

  /**
   * Asserts the page is laid out left-to-right (English).
   *
   * The counterpart to `expectRightToLeft`, so a bilingual test can check the
   * layout direction actually SWITCHED BACK rather than only that it once
   * became RTL - a direction that never reverts is a real defect and would
   * otherwise go unnoticed.
   */
  async expectLeftToRight(): Promise<void> {
    await expect(this.page.locator('html')).toHaveAttribute('dir', 'ltr', {
      timeout: Timeouts.default,
    });
  }

  // ---- story 22 additions (network bilingual labels) ----

  /** Whether the language toggle is offered to this session at all. */
  async isOffered(): Promise<boolean> {
    return this.toggleButton()
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
  }

  /** The label the toggle shows - the language it switches TO ("عربي" / "EN"). */
  async getToggleLabel(): Promise<string> {
    return (await this.toggleButton().innerText()).trim();
  }

  /** The document's layout direction - "rtl" or "ltr". */
  async getDirection(): Promise<string> {
    return ((await this.page.locator('html').getAttribute('dir')) ?? 'ltr').trim();
  }
}
