import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { SETTINGS_GENERAL, SETTINGS_JOBS, type LifecycleJob } from '../../constants/ElementIds';
import { jobIdFragment, type JobKey } from '../../utils/JobClock';
import { Logger } from '../../utils/Logger';

/** What a save attempt produced: the server's answer, the toast, and the drawer. */
export interface SettingsSaveOutcome {
  /** HTTP status of the upsert, or null when no request was sent. */
  status: number | null;
  /** The toast shown afterwards, or empty. */
  toast: string;
  /** Whether the drawer is still open once the save has settled. */
  drawerOpen: boolean;
  /** The start of the server's response body - where a 500 names its exception. */
  detail: string;
}

/**
 * System Settings > Settings (`/system-settings/settings`), the General card.
 *
 * Owns the three lifecycle job schedules - network, payer, policy - each a
 * CRON expression in UTC edited through one drawer. Built for the payer
 * lifecycle-schedule story, which needs to change the payer CRON, prove the
 * change persisted, prove invalid values are refused, and put the ORIGINAL
 * back - so every writer here is paired with a reader, and nothing saves
 * implicitly.
 *
 * The read view's values carry no ids, so values are read from the drawer's
 * inputs; the read view's text is read as a whole for "what is displayed".
 */
export class SettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** The read-view labels of the three schedules, for the displayed-value reader. */
  private static readonly JOB_LABEL: Record<LifecycleJob, string> = {
    network: 'Network lifecycle job schedule (CRON, UTC)',
    payer: 'Payer lifecycle job schedule (CRON, UTC)',
    policy: 'Policy lifecycle job schedule (CRON, UTC)',
  };

  private drawerTitle(): Locator {
    return this.byId(SETTINGS_GENERAL.drawerTitle);
  }

  private jobInput(job: LifecycleJob): Locator {
    return this.byId(SETTINGS_GENERAL.jobs[job]);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.systemSettings);
    await expect(this.btn(SETTINGS_GENERAL.editButton), 'the General settings card should render').toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /**
   * Navigates to Settings and reports whether the screen rendered for this
   * session or the application turned it away.
   *
   * For the access case: a session without System Settings is redirected to
   * the dashboard with an "Access Restricted" banner rather than shown the
   * settings cards, so `open()`'s assertion would report that as a failure of
   * the page instead of the refusal it is.
   *
   * locator-exception: the refusal banner carries no id, so the landing
   * screen's text is read whole for the caller to match the wording.
   */
  async openAndReportAccess(): Promise<{ reachable: boolean; url: string; text: string }> {
    Logger.step('Opening System Settings to see whether this session is admitted');
    await this.goto(AppRoutes.systemSettings);
    const reachable = await this.btn(SETTINGS_GENERAL.editButton)
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    const text = (await this.page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return { reachable, url: this.page.url(), text };
  }

  /** Whether the edit drawer is showing, waiting briefly for it. */
  async isDrawerOpen(): Promise<boolean> {
    return this.drawerTitle()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /** Opens the General edit drawer (no-op when it is already open). */
  async openGeneralEdit(): Promise<void> {
    if (await this.isDrawerOpen()) return;
    await this.open();
    await this.btn(SETTINGS_GENERAL.editButton).click();
    await expect(this.drawerTitle(), 'the General edit drawer should open').toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /** The CRON a lifecycle job is currently configured with, read from the drawer. */
  async getJobCron(job: LifecycleJob): Promise<string> {
    await this.openGeneralEdit();
    return (await this.jobInput(job).inputValue()).trim();
  }

  /** All three schedules at once, for the "only the payer one changed" check. */
  async getAllJobCrons(): Promise<Record<LifecycleJob, string>> {
    await this.openGeneralEdit();
    return {
      network: (await this.jobInput('network').inputValue()).trim(),
      payer: (await this.jobInput('payer').inputValue()).trim(),
      policy: (await this.jobInput('policy').inputValue()).trim(),
    };
  }

  /** Types a schedule into the drawer - NOT saved until `save()`. */
  async setJobCron(job: LifecycleJob, value: string): Promise<void> {
    await this.openGeneralEdit();
    await this.jobInput(job).fill(value);
  }

  /** The site time zone the drawer offers, as displayed. */
  async getSiteTimeZone(): Promise<string> {
    await this.openGeneralEdit();
    return (await this.byId(SETTINGS_GENERAL.siteTimezoneSelect).innerText()).replace(/\s+/g, ' ').trim();
  }

  /**
   * Presses Save and reports what happened, without asserting.
   *
   * Returned rather than asserted because the story's cases want opposite
   * things from the same click: a valid CRON must be accepted and shown, an
   * invalid one refused with the drawer still open. The server's status is
   * captured because the drawer validates nothing itself - a 422 is the only
   * hard evidence a value was refused rather than quietly dropped.
   */
  async saveAndCaptureOutcome(): Promise<SettingsSaveOutcome> {
    const waiting = this.page
      .waitForResponse(
        (response) =>
          response.url().includes(ApiEndpoints.systemSettingsUpsert)
          && response.request().method() !== 'GET',
        { timeout: Timeouts.default },
      )
      .then(async (response) => ({
        status: response.status() as number | null,
        detail: (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300),
      }))
      .catch(() => ({ status: null, detail: '' }));
    Logger.step('Saving General settings');
    await this.byId(SETTINGS_GENERAL.saveButton).click();
    const { status, detail } = await waiting;
    const toast = await this.getToastMessage(Timeouts.short).catch(() => '');
    await this.waitForPageReady();
    const drawerOpen = await this.isDrawerOpen();
    Logger.step(`Settings save -> ${status ?? 'no request'}; toast "${toast}"; drawer ${drawerOpen ? 'open' : 'closed'}`);
    return { status, toast: toast.replace(/\s+/g, ' ').trim(), drawerOpen, detail };
  }

  /** Saves and asserts the change was accepted. */
  async save(): Promise<void> {
    const outcome = await this.saveAndCaptureOutcome();
    expect(
      outcome.status !== null && outcome.status < 400,
      `the settings save should be accepted; the server answered ${outcome.status ?? 'nothing'}, `
        + `the toast read "${outcome.toast}" and the response began: ${outcome.detail || '(empty)'}`,
    ).toBe(true);
  }

  /** Cancels the drawer, discarding whatever it holds. */
  async cancel(): Promise<void> {
    await this.byId(SETTINGS_GENERAL.cancelButton).click();
    await expect(this.drawerTitle()).toBeHidden({ timeout: Timeouts.default });
  }

  /** Closes the drawer if it is open - the cleanup hook's tool. */
  async closeDrawerIfOpen(): Promise<void> {
    // A successful save closes the drawer itself (animated): let it go first (2026-11-08).
    await this.drawerTitle().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
    if (!(await this.drawerTitle().isVisible().catch(() => false))) return;
    await this.byId(SETTINGS_GENERAL.drawerClose).click({ timeout: Timeouts.short }).catch(() => undefined);
    await this.drawerTitle().waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  }

  /**
   * The schedule the READ VIEW displays for a job - what a user sees after a
   * save, distinct from what the drawer's input holds.
   *
   * locator-exception: the read view's values carry no ids; the text is read
   * from the id'd layout outlet and the value found by its label.
   */
  async getDisplayedJobCron(job: LifecycleJob): Promise<string> {
    await this.closeDrawerIfOpen();
    const text = (await this.byId('app-layout-outlet').innerText()).replace(/\s+/g, ' ');
    const label = SettingsPage.JOB_LABEL[job].replace(/[()]/g, '\\$&');
    const match = new RegExp(`${label}\\s*([^A-Za-z]*?\\*[^A-Za-z]*?)(?=\\s+[A-Z]|$)`).exec(text);
    return (match?.[1] ?? '').trim();
  }

  /** The General card's whole text - for "which sections and schedules exist". */
  async getGeneralSectionText(): Promise<string> {
    await this.open();
    return (await this.byId('app-layout-outlet').innerText()).replace(/\s+/g, ' ').trim();
  }

  // ---- Scheduled Jobs section (2026-11-08, job-driven Network / Plans cases) ----
  // The 2026-11-08 build shows each job as a Frequency select + a Riyadh-time
  // picker (+ a "Runs at hh:mm UTC" hint) instead of the CRON text inputs the
  // methods above were written for. Keyed by the setting key (utils/JobClock).

  /** What the drawer shows for one job. */
  async readJobSchedule(key: JobKey): Promise<{ frequency: string; time: string; utcHint: string; customCron: string; hasFrequency: boolean }> {
    await this.openGeneralEdit();
    const f = jobIdFragment(key);
    const frequency = this.byId(SETTINGS_JOBS.frequency(f));
    const hasFrequency = (await frequency.count()) > 0;
    const text = async (id: string): Promise<string> => {
      const el = this.byId(id);
      if ((await el.count()) === 0) return '';
      const value = await el.inputValue().catch(async () => el.innerText());
      return value.replace(/\s+/g, ' ').trim();
    };
    return {
      frequency: hasFrequency ? (await frequency.innerText()).replace(/\s+/g, ' ').trim() : '',
      time: await text(SETTINGS_JOBS.time(f)),
      utcHint: await text(SETTINGS_JOBS.utcHint(f)),
      customCron: await text(SETTINGS_JOBS.input(f)),
      hasFrequency,
    };
  }

  /** Picks a Frequency option by its label ("Every minute" ... "Once a day") - NOT saved until `save()`. */
  async setJobFrequency(key: JobKey, label: string): Promise<void> {
    await this.openGeneralEdit();
    const select = this.byId(SETTINGS_JOBS.frequency(jobIdFragment(key)));
    await select.scrollIntoViewIfNeeded();
    await select.click();
    await this.chooseOption(label);
  }

  /** The option labels the Frequency select offers for a job ([] when it has none - the daily-only job). */
  async readJobFrequencyOptions(key: JobKey): Promise<string[]> {
    await this.openGeneralEdit();
    const select = this.byId(SETTINGS_JOBS.frequency(jobIdFragment(key)));
    if ((await select.count()) === 0) return [];
    await select.scrollIntoViewIfNeeded();
    await select.click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await options.first().waitFor({ timeout: Timeouts.short });
    const labels = (await options.allInnerTexts()).map((s) => s.trim()).filter(Boolean);
    await this.page.keyboard.press('Escape');
    return labels;
  }

  /**
   * Sets a job's daily time in the picker ("hh:mm AM|PM", Riyadh) with the
   * picker's up / down arrows - typing is ignored by the control (verified
   * 2026-11-04 / 2026-11-08). NOT saved until `save()`. Returns what the
   * picker shows afterwards.
   *
   * locator-exception: the PrimeNG time panel and its arrow buttons carry no
   * ids; the panel is found as the visible date-picker overlay holding a
   * minute column, the arrows as each column's first (up) / last (down) button.
   */
  async setJobTime(key: JobKey, target: string): Promise<string> {
    await this.openGeneralEdit();
    const parse = (s: string): { h: number; m: number; pm: boolean } => {
      const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(s);
      if (!m) throw new Error(`"${s}" is not hh:mm AM|PM`);
      return { h: Number(m[1]) % 12, m: Number(m[2]), pm: /PM/i.test(m[3]) };
    };
    const want = parse(target);
    const input = this.byId(SETTINGS_JOBS.time(jobIdFragment(key)));
    await input.scrollIntoViewIfNeeded();
    await input.click();
    const panel = this.page
      .locator('[class*="datepicker-panel"], .p-datepicker:not(.p-inputwrapper)') // locator-exception: PrimeNG time overlay, no id
      .filter({ has: this.page.locator('[class*="minute-picker"]') }) // locator-exception: PrimeNG minute column, no id
      .last();
    await panel.waitFor({ timeout: Timeouts.default });
    const arrow = (column: 'hour' | 'minute' | 'ampm', up: boolean): Locator => {
      const buttons = panel.locator(`[class*="${column}-picker"] button`); // locator-exception: PrimeNG column arrows, no id
      return up ? buttons.first() : buttons.last();
    };
    for (let guard = 0; guard < 120; guard += 1) {
      const cur = parse(await input.inputValue());
      if (cur.pm !== want.pm) await arrow('ampm', true).click();
      else if (cur.h !== want.h) await arrow('hour', want.h > cur.h).click();
      else if (cur.m !== want.m) await arrow('minute', want.m > cur.m).click();
      else break;
    }
    await this.drawerTitle().click();
    const shown = (await input.inputValue()).trim();
    Logger.step(`Job ${key} picker now shows "${shown}"`);
    return shown;
  }

  /**
   * What the READ view says for a job ("Every day at 12:15 am (Riyadh)",
   * "Every 5 minutes"), found by the job's description label.
   *
   * locator-exception: the read view's values carry no ids; the outlet's text
   * is read and the line after the label returned.
   */
  async readJobDisplay(label: string): Promise<string> {
    await this.closeDrawerIfOpen();
    await this.open();
    const lines = (await this.byId('app-layout-outlet').innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
    const at = lines.indexOf(label);
    return at >= 0 ? lines[at + 1] ?? '' : '';
  }
}
