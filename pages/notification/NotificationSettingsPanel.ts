import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Timeouts } from '../../constants/Timeouts';
import { SETTINGS_NOTIFICATION_FIELDS } from '../../constants/notification/notificationIds';
import { SETTINGS_DRAWER } from '../../constants/settings/settingsIds';
import { readSelectOptions } from '../components/PrimeControls';

/**
 * The notification parts of System Settings > General > "Edit Setting"
 * drawer (SMTP, archiving, expiry reminders) - foundation 2026-11-11.
 * Open the drawer with `settingsHub.openEdit()`; this object reads / types
 * the notification fields and closes the drawer. Saving goes through
 * `settingsHub.saveAndCapture()`; every value is GLOBAL, so a case that saves
 * takes `notificationSettingsGuard` (restore + read-back at teardown).
 */
export class NotificationSettingsPanel extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  field(key: keyof typeof SETTINGS_NOTIFICATION_FIELDS): Locator {
    return this.byId(SETTINGS_NOTIFICATION_FIELDS[key]);
  }

  async value(key: Exclude<keyof typeof SETTINGS_NOTIFICATION_FIELDS, 'remindEverySelect' | 'reminderBeforeHint'>): Promise<string> {
    return this.field(key).inputValue();
  }

  /** The Remind every select's shown label ("Every day"). */
  async remindEvery(): Promise<string> {
    return (await this.field('remindEverySelect').innerText()).trim();
  }

  async remindEveryOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.field('remindEverySelect').locator('xpath=descendant-or-self::*[@role="combobox"]').first());
  }

  /** The hint under Reminder before ("Reminds 7 day(s) before ..."). */
  async reminderHint(): Promise<string> {
    return (await this.field('reminderBeforeHint').innerText().catch(() => '')).trim();
  }

  async type(key: Exclude<keyof typeof SETTINGS_NOTIFICATION_FIELDS, 'remindEverySelect' | 'reminderBeforeHint'>, value: string): Promise<void> {
    await this.field(key).fill(value);
  }

  /** Cancel - closes the drawer without saving. */
  async cancel(): Promise<void> {
    await this.btn(SETTINGS_DRAWER.cancel).click();
    await expect(this.byId(SETTINGS_DRAWER.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
