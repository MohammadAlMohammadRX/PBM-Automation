import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { SETTINGS_GENERAL, type LifecycleJob } from '../../constants/ElementIds';
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
    if (!(await this.isDrawerOpen())) return;
    await this.byId(SETTINGS_GENERAL.drawerClose).click();
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
}
