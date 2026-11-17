import type { BrowserContext, Locator, Page, Response } from '@playwright/test';
import { test as userRoleTest, expect } from '../user/userRole';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { SettingsHubPage, type DrawerSaveOutcome } from '../../pages/settings/SettingsHubPage';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { env } from '../../constants/EnvironmentConfig';
import { Timeouts } from '../../constants/Timeouts';
import { SETTINGS_JOBS } from '../../constants/ElementIds';
import { SETTINGS_DRAWER, SETTINGS_HUB, SETTINGS_TOAST, UNSAVED_DIALOG } from '../../constants/settings/settingsIds';
import { cronToRiyadhPicker, jobIdFragment, JOB_KEYS, type JobKey } from '../JobClock';
import { ScreenshotUtils } from '../ScreenshotUtils';
import { Logger } from '../Logger';
import type { GuardedSettingKey } from './systemSettingsApi';
import {
  CURRENCY_LABEL,
  JOB_VIEW_LABEL,
  KNOWN_GENERAL_SECTIONS,
  SINGLE_TAB_BLOCKED,
  TAB_LABEL,
  TAB_SIGNATURE,
  TAB_VIEW_RIGHT,
  type HubTab,
} from '../../data/settings/viewSettingsGeneralTab.data';
import { PICKER_VALUE, TIME_ZONE_CHOICES } from '../../data/settings/editSettingsGeneralTab.data';

/**
 * Writer B helpers - System Setting Management folders 02 (View Settings -
 * General Tab, US 20865) and 03 (Edit Settings - General Tab, US 20866).
 *
 * `WriterBSettings` extends the lead's SettingsHubPage with the readers these
 * two stories need (sections shown, a label's value when a heading repeats the
 * label, the read-view logo, the drawer's values and control kinds, the
 * unsaved-changes dialog, repeated Save). Nothing here asserts: each case
 * asserts what IT expects and its failure says what the screen showed.
 *
 * `test` = the shared fixtures + the user module's `userRole` /
 * `requireShapeApplied` (suite sessions with exact rights) + `settingsView`
 * (WriterBSettings on the admin page) + `secondAdminWindow` (21090: another
 * administrator session, closed at teardown).
 */

/** Whitespace collapsed, em / en dashes read as a hyphen (lead decision 4). */
export function normalise(text: string): string {
  return text.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

/** A quoted toast / dialog "Summary — Detail" as the screen joins summary and detail (whitespace), normalised. */
export function asShown(quote: string): string {
  return normalise(quote.replace(/\s+[–—]\s+/, ' '));
}

/** The parts of a quoted "Summary — Detail". */
export function quoteParts(quote: string): { summary: string; detail: string } {
  const [summary, ...rest] = quote.split(/\s+[–—]\s+/);
  return { summary: normalise(summary), detail: normalise(rest.join(' ')) };
}

/** "Asia/Riyadh" -> "Riyadh", "America/New_York" -> "New York". */
export function cityOf(iana: string): string {
  return (iana.split('/').pop() ?? iana).replace(/_/g, ' ');
}

/** The time in a schedule's text ("Every day at 12:15 am (Riyadh)" -> "12:15 AM"), '' when none. */
export function timeIn(text: string): string {
  const m = /(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(text);
  return m ? `${m[1].padStart(2, '0')}:${m[2]} ${m[3].toUpperCase()}` : '';
}

/** The rate in "1 USD = 3.75 SAR" (NaN when absent). */
export function rateIn(text: string): number {
  const m = /1\s*USD\s*=\s*([\d.,]+)\s*SAR/i.exec(text);
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
}

/** The last path segment of a logo URI (the stored file's id), '' for none. */
export function logoIdOf(uri: string): string {
  return /\/Download\/([^/?#]+)/i.exec(uri)?.[1] ?? '';
}

/** A different valid rate (+0.01), for "change only the Exchange Rate". */
export function nudgedRate(rate: string): string {
  const next = (Number(rate) + 0.01).toFixed(2);
  return Number(next) === Number(rate) ? (Number(rate) + 0.02).toFixed(2) : next;
}

/** A valid time zone other than `currentIana`. */
export function otherTimeZone(currentIana: string): (typeof TIME_ZONE_CHOICES)[number] {
  return TIME_ZONE_CHOICES.find((z) => z.iana !== currentIana) ?? TIME_ZONE_CHOICES[0];
}

/** The other currency: { code, label }. */
export function otherCurrency(code: string): { code: 'SAR' | 'USD'; label: string } {
  return code === 'USD' ? { code: 'SAR', label: 'SAR — Saudi Riyal' } : { code: 'USD', label: 'USD — US Dollar' };
}

/** What a stored job CRON should read as in the picker ("12:15 AM"), '' when it is not a daily CRON. */
export function expectedPicker(cron: string): string {
  return cronToRiyadhPicker(cron);
}

/** The tab labels a set of permission keys should offer (an empty set = an account told it holds every key). */
export function permittedTabs(permissions: readonly string[]): string[] {
  const all = permissions.length === 0;
  return (Object.keys(TAB_LABEL) as HubTab[]).filter((t) => all || permissions.includes(TAB_VIEW_RIGHT[t])).map((t) => TAB_LABEL[t]);
}

/** 21081: BLOCKS the case when the candidate's strip offers two or more tabs (no single-tab right set exists). */
export function blockUnlessSingleTab(steps: TestSteps, rights: readonly string[], labels: readonly string[]): void {
  if (labels.length >= 2) steps.blocked(SINGLE_TAB_BLOCKED(rights.join(' + '), labels));
}

/** What the drawer shows for one job. */
export interface DrawerJob {
  time: string;
  timeVisible: boolean;
  customCron: string;
  hasFrequency: boolean;
}

/** Every value the Edit Setting drawer holds for the guarded settings. */
export interface DrawerValues {
  timeZone: string;
  title: string;
  logoSrc: string;
  currency: string;
  rate: string;
  jobs: Record<JobKey, DrawerJob>;
}

/**
 * The drawer's values beside what the server stores, as two records to
 * compare with toEqual (21093 / 21098): the time zone by city, the rate as a
 * number, the logo by its stored file id, each job's picker against its CRON.
 */
export function drawerAgainstStored(
  v: DrawerValues,
  stored: Record<GuardedSettingKey, string>,
): { shown: Record<string, string>; wanted: Record<string, string> } {
  const city = cityOf(stored['Site.TimeZone']);
  const logoId = logoIdOf(stored['Site.Logo']);
  const logoIsStored = stored['Site.Logo'] === '' || (logoId !== '' && v.logoSrc.includes(logoId)) || /^(blob|data):/.test(v.logoSrc);
  const shown: Record<string, string> = {
    'Time zone': v.timeZone.endsWith(city) ? city : v.timeZone,
    'Site title': v.title,
    'Site logo': logoIsStored ? 'the stored logo' : `preview "${v.logoSrc.slice(0, 120)}"`,
    Currency: normalise(v.currency),
    'Exchange rate': String(Number(v.rate)),
  };
  const wanted: Record<string, string> = {
    'Time zone': city,
    'Site title': stored['Site.Title'],
    'Site logo': 'the stored logo',
    Currency: normalise(CURRENCY_LABEL[stored['Currency.Code']] ?? stored['Currency.Code']),
    'Exchange rate': String(Number(stored['Currency.UsdToSarRate'])),
  };
  for (const key of JOB_KEYS) {
    shown[JOB_VIEW_LABEL[key]] = v.jobs[key].time || v.jobs[key].customCron;
    wanted[JOB_VIEW_LABEL[key]] = expectedPicker(stored[key]) || stored[key];
  }
  return { shown, wanted };
}

/** Each job's control in the drawer: 'clock' when a visible picker holds a time, else what is there (21095). */
export function jobControlKinds(v: DrawerValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of JOB_KEYS) {
    const j = v.jobs[key];
    out[JOB_VIEW_LABEL[key]] = j.timeVisible && PICKER_VALUE.test(j.time) ? 'clock' : `no clock (picker "${j.time}", visible ${j.timeVisible}; CRON text box "${j.customCron}")`;
  }
  return out;
}

/** What closing the drawer produced. */
export interface CloseOutcome {
  dialogShown: boolean;
  dialogText: string;
  drawerOpen: boolean;
}

/** What pressing Save several times produced. */
export interface RepeatedSaveOutcome {
  attempts: number;
  clicked: number;
  answers: { status: number; keys: string[] }[];
  messages: string;
  drawerOpen: boolean;
}

export class WriterBSettings extends SettingsHubPage {
  constructor(page: Page) {
    super(page);
  }

  /** Navigates to the hub WITHOUT asserting it rendered (the access-denied case). */
  async visitHub(): Promise<void> {
    await this.goto(AppRoutes.systemSettings);
  }

  /** The outlet's lines (trimmed, non-empty). */
  async lines(): Promise<string[]> {
    const text = await this.byId(SETTINGS_HUB.outlet).innerText().catch(() => '');
    return text.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  /**
   * The value under a label - the first occurrence followed by a different
   * line (the Currency HEADING is followed by the Currency LABEL). '' when absent.
   *
   * locator-exception: the read view's values carry no ids; the outlet's lines are read.
   */
  async labelValue(label: string): Promise<string> {
    const lines = await this.lines();
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (lines[i] === label && lines[i + 1] !== label) return lines[i + 1];
    }
    return '';
  }

  /** The known General section headings the outlet shows, in screen order. */
  async sectionsShown(): Promise<string[]> {
    const lines = await this.lines();
    return KNOWN_GENERAL_SECTIONS.filter((s) => lines.includes(s));
  }

  /** The tab strip itself. */
  tabStrip(): Locator {
    return this.byId(SETTINGS_HUB.tabs);
  }

  /** The tab buttons visible on screen, by key. */
  async visibleTabs(): Promise<HubTab[]> {
    const out: HubTab[] = [];
    for (const t of Object.keys(TAB_LABEL) as HubTab[]) {
      if (await this.tabButton(t).isVisible().catch(() => false)) out.push(t);
    }
    return out;
  }

  /**
   * Whether a tab button marks itself active - aria-selected / aria-current, or
   * an active / selected class - with the attributes read, for the failure message.
   *
   * locator-exception: the class is read as STATE; the tab is found by its id.
   */
  async tabActiveState(tab: HubTab): Promise<{ active: boolean; marker: string }> {
    const button = this.tabButton(tab);
    const attrs = await button.evaluate((el) => ({
      selected: el.getAttribute('aria-selected'),
      current: el.getAttribute('aria-current'),
      className: el.getAttribute('class') ?? '',
    })).catch(() => ({ selected: null, current: null, className: '' }));
    const active = attrs.selected === 'true' || (attrs.current !== null && attrs.current !== 'false') || /(?<![a-z])(active|selected)/i.test(attrs.className);
    return { active, marker: `aria-selected=${attrs.selected} aria-current=${attrs.current} class="${attrs.className}"` };
  }

  /** Whether the outlet shows `signature` text (any line contains any of them). */
  async shows(signature: readonly string[]): Promise<boolean> {
    const lines = await this.lines();
    return signature.some((s) => lines.includes(s));
  }

  /** The labels of the tabs (of `tabs`) whose own content is on screen now. */
  async tabsWithContentShown(tabs: readonly HubTab[]): Promise<string[]> {
    const out: string[] = [];
    for (const tab of tabs) if (await this.shows(TAB_SIGNATURE[tab])) out.push(TAB_LABEL[tab]);
    return out;
  }

  /** The Edit button: shown / enabled. */
  async editState(): Promise<{ shown: boolean; enabled: boolean }> {
    const shown = await this.editButton().isVisible().catch(() => false);
    return { shown, enabled: shown && (await this.editButton().isEnabled().catch(() => false)) };
  }

  /**
   * Editable controls visible in the read view (inputs, text areas, content-editable).
   *
   * locator-exception: counting any editable element inside the id'd outlet - the point is that none exists.
   */
  async editableControlsInView(): Promise<number> {
    return this.byId(SETTINGS_HUB.outlet)
      .locator('input:not([type="hidden"]), textarea, select, [contenteditable="true"]')
      .filter({ visible: true })
      .count();
  }

  /** Clicks the site-title value of the read view and types; returns the value shown afterwards. */
  async typeOnReadValue(label: string, typed: string): Promise<string> {
    const value = await this.labelValue(label);
    // locator-exception: the read view's value carries no id; it is found by its text inside the id'd outlet.
    await this.byId(SETTINGS_HUB.outlet).getByText(value, { exact: true }).first().click().catch(() => undefined);
    await this.page.keyboard.type(typed);
    return this.labelValue(label);
  }

  /**
   * The read view's logo: its src, whether it loaded, and whether "Default logo" shows instead.
   *
   * locator-exception: the read-view logo image carries no id; it is the outlet's visible image.
   */
  async readViewLogo(): Promise<{ src: string; loaded: boolean; defaultShown: boolean }> {
    const img = this.byId(SETTINGS_HUB.outlet).locator('img').filter({ visible: true }).first();
    const present = (await img.count()) > 0;
    const src = present ? (await img.getAttribute('src').catch(() => '')) ?? '' : '';
    const loaded = present ? await img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0).catch(() => false) : false;
    return { src, loaded, defaultShown: (await this.lines()).includes('Default logo') };
  }

  /** Whether the System Settings > Settings entry is offered in the side menu (the group is expanded to look). */
  async settingsMenuEntryShown(): Promise<boolean> {
    const group = this.byId('app-nav-system-settings');
    if (!(await group.isVisible().catch(() => false))) return false;
    const entries = async (): Promise<string[]> => (await group.innerText().catch(() => '')).split('\n').map((s) => s.trim());
    if ((await entries()).includes('Settings')) return true;
    await this.btn('app-nav-system-settings-toggle').click().catch(() => undefined);
    await this.page.waitForTimeout(500);
    return (await entries()).includes('Settings');
  }

  /** What the hub route shows this session: whether any tab / the General view / Edit is reachable. */
  async accessState(): Promise<{ denied: boolean; url: string; seen: string }> {
    const tabs = await this.visibleTabs();
    const strip = await this.tabStrip().isVisible().catch(() => false);
    const general = await this.shows(['Time Zone & Theme', 'Scheduled Jobs']);
    const edit = (await this.editState()).shown;
    const seen = normalise((await this.lines()).slice(0, 25).join(' | '));
    return {
      denied: !strip && tabs.length === 0 && !general && !edit,
      url: this.page.url(),
      seen: `strip ${strip}, tabs [${tabs.join(', ')}], General content ${general}, Edit ${edit}; screen: ${seen.slice(0, 300)}`,
    };
  }

  // ---------------------------------------------------------------- drawer

  /**
   * Opens Edit, picks the currency `label` and saves it - through the
   * confirmation (acknowledged + Change currency) when it opens. Returns the
   * save's outcome; the caller asserts it.
   */
  async saveCurrency(label: string): Promise<DrawerSaveOutcome> {
    await this.openEdit();
    await this.pick('currencySelect', label);
    const first = await this.saveAndCapture();
    return first.confirmationOpened ? this.confirmCurrencyChange() : first;
  }

  /** The drawer's whole text (normalised), '' when closed. */
  async drawerText(): Promise<string> {
    return normalise(await this.byId(SETTINGS_DRAWER.drawer).innerText().catch(() => ''));
  }

  private async jobInDrawer(key: JobKey): Promise<DrawerJob> {
    const f = jobIdFragment(key);
    const time = this.byId(SETTINGS_JOBS.time(f));
    const custom = this.byId(SETTINGS_JOBS.input(f));
    return {
      time: (await time.count()) > 0 ? (await time.inputValue().catch(() => '')).trim() : '',
      timeVisible: await time.isVisible().catch(() => false),
      customCron: (await custom.count()) > 0 ? (await custom.inputValue().catch(() => '')).trim() : '',
      hasFrequency: (await this.byId(SETTINGS_JOBS.frequency(f)).count()) > 0,
    };
  }

  /** Every guarded value the open drawer holds. */
  async drawerValues(): Promise<DrawerValues> {
    const jobs = {} as Record<JobKey, DrawerJob>;
    for (const key of JOB_KEYS) jobs[key] = await this.jobInDrawer(key);
    return {
      timeZone: normalise(await this.control('timeZoneSelect').innerText().catch(() => '')),
      title: await this.control('siteTitleInput').inputValue().catch(() => ''),
      logoSrc: (await this.control('logoPreview').getAttribute('src').catch(() => '')) ?? '',
      currency: normalise(await this.control('currencySelect').innerText().catch(() => '')),
      rate: (await this.control('rateInput').inputValue().catch(() => '')).trim(),
      jobs,
    };
  }

  /** Which drawer controls are NOT usable (disabled / read-only / aria-disabled). */
  async unusableDrawerControls(): Promise<string[]> {
    const out: string[] = [];
    const inputs: (keyof typeof SETTINGS_DRAWER)[] = ['siteTitleInput', 'rateInput'];
    for (const id of inputs) if (!(await this.control(id).isEditable().catch(() => false))) out.push(id);
    for (const id of ['timeZoneSelect', 'currencySelect'] as (keyof typeof SETTINGS_DRAWER)[]) {
      const disabled = await this.control(id).evaluate((el) => el.getAttribute('aria-disabled') === 'true' || !!el.closest('.p-disabled')).catch(() => true);
      if (disabled) out.push(id);
    }
    if (!(await this.control('logoUploadButton').isVisible().catch(() => false))) out.push('logoUploadButton');
    for (const key of JOB_KEYS) {
      const f = jobIdFragment(key);
      const time = this.byId(SETTINGS_JOBS.time(f));
      const custom = this.byId(SETTINGS_JOBS.input(f));
      // Counted first: isEnabled / isEditable wait for an element that is not there.
      const usable = ((await time.count()) > 0 && (await time.isEnabled().catch(() => false)))
        || ((await custom.count()) > 0 && (await custom.isEditable().catch(() => false)));
      if (!usable) out.push(key);
    }
    return out;
  }

  /**
   * The time-zone control (21094): does it open an option list, how many
   * options, and does the list carry a filter searchbox. Closes it again.
   *
   * locator-exception: the select's overlay (options + filter searchbox) is a PrimeNG portal with no ids.
   */
  async timeZoneControlKind(): Promise<{ opensList: boolean; options: number; searchbox: boolean }> {
    const select = this.control('timeZoneSelect');
    await select.scrollIntoViewIfNeeded();
    await select.click();
    const options = this.page.getByRole('option').filter({ visible: true });
    const opensList = await options.first().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    const count = await options.count();
    // locator-exception: PrimeNG's select filter input has no id; it is the visible searchbox of the open overlay.
    const searchbox = await this.page.locator('input[role="searchbox"], input.p-select-filter').filter({ visible: true }).first().isVisible().catch(() => false);
    await this.page.keyboard.press('Escape');
    return { opensList, options: count, searchbox };
  }

  /** The site-title control: its tag and type ("input" / "text" for a text box). */
  async titleControlKind(): Promise<{ tag: string; type: string; editable: boolean }> {
    const input = this.control('siteTitleInput');
    const kind = await input.evaluate((el) => ({ tag: el.tagName.toLowerCase(), type: (el.getAttribute('type') ?? 'text').toLowerCase() })).catch(() => ({ tag: '', type: '' }));
    return { ...kind, editable: await input.isEditable().catch(() => false) };
  }

  /** The site-logo control: the file input's type / accept and the upload button. */
  async logoControlKind(): Promise<{ type: string; accept: string; buttonVisible: boolean; buttonText: string }> {
    const file = this.control('logoFileInput');
    return {
      type: ((await file.getAttribute('type').catch(() => '')) ?? '').toLowerCase(),
      accept: (await file.getAttribute('accept').catch(() => '')) ?? '',
      buttonVisible: await this.control('logoUploadButton').isVisible().catch(() => false),
      buttonText: normalise(await this.control('logoUploadButton').innerText().catch(() => '')),
    };
  }

  /** Every message the drawer and the toasts show right now (normalised, joined). */
  async messagesShown(): Promise<string> {
    const toasts = await this.byId(SETTINGS_TOAST.toast).allInnerTexts().catch(() => [] as string[]);
    return normalise([await this.drawerText(), ...toasts].join(' | '));
  }

  /**
   * Presses Save `times` times in quick succession; reports every UpsertSystemSettings
   * answer, the messages shown and whether the drawer stayed open.
   */
  async saveRepeatedly(times: number): Promise<RepeatedSaveOutcome> {
    const answers: { status: number; keys: string[] }[] = [];
    const onResponse = (r: Response): void => {
      if (!r.url().includes(ApiEndpoints.systemSettingsUpsert) || r.request().method() !== 'PUT') return;
      const body = (r.request().postDataJSON() as { settings?: { key: string }[] } | null) ?? null;
      answers.push({ status: r.status(), keys: (body?.settings ?? []).map((s) => s.key) });
    };
    this.page.on('response', onResponse);
    let clicked = 0;
    for (let i = 0; i < times; i += 1) {
      await this.btn(SETTINGS_DRAWER.save).click({ timeout: 1_500 }).then(() => { clicked += 1; }).catch(() => undefined);
    }
    await this.page.waitForTimeout(1_500);
    const messages = await this.messagesShown();
    await this.page.waitForTimeout(1_500);
    this.page.off('response', onResponse);
    const drawerOpen = await this.isDrawerOpen(1_000);
    Logger.step(`Save x${times}: ${clicked} click(s), answers [${answers.map((a) => `${a.status} ${a.keys.join('+')}`).join('; ')}], drawer ${drawerOpen ? 'open' : 'closed'}`);
    return { attempts: times, clicked, answers, messages, drawerOpen };
  }

  // ---------------------------------------------------------------- unsaved changes

  /** The unsaved dialog's text (normalised; the lead's reader, either host), '' when it is not showing within `timeout`. */
  async unsavedDialogShown(timeout = 2_000): Promise<string> {
    const visible = await this.isUnsavedDialogOpen(timeout);
    return visible ? normalise(await this.unsavedDialogText().catch(() => '')) : '';
  }

  /** Presses the drawer's X and reports whether the unsaved dialog showed and the drawer stayed. */
  async closeWithX(): Promise<CloseOutcome> {
    await this.btn(SETTINGS_DRAWER.close).click();
    const dialogText = await this.unsavedDialogShown();
    const drawerOpen = dialogText ? true : !(await this.drawerTitle().waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false));
    Logger.step(`Drawer X: unsaved dialog ${dialogText ? `"${dialogText.slice(0, 120)}"` : 'NOT shown'}; drawer ${drawerOpen ? 'open' : 'closed'}`);
    return { dialogShown: dialogText !== '', dialogText, drawerOpen };
  }

  /**
   * Presses Keep Editing (`pbm-dialog-action-stay`) / Discard Changes
   * (`pbm-dialog-action-discard`) in the unsaved dialog - or, in the unsaved
   * host's own dialog (ids never seen), the button with that English label.
   *
   * locator-exception: the host's own dialog buttons have no known ids; they are matched by the host id prefix and their label.
   */
  async chooseUnsaved(choice: 'keep' | 'discard', label: string): Promise<void> {
    const id = choice === 'keep' ? 'pbm-dialog-action-stay' : 'pbm-dialog-action-discard';
    await this.btn(id)
      .or(this.page.locator(`[id^="${UNSAVED_DIALOG.host}"] button`).filter({ hasText: label }))
      .filter({ visible: true })
      .first()
      .click({ timeout: Timeouts.short });
  }

  /** Whether the unsaved dialog has gone (checked until `timeout`). */
  async unsavedDialogGone(timeout = 3_000): Promise<boolean> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (!(await this.isUnsavedDialogOpen(150))) return true;
      await this.page.waitForTimeout(250);
    }
    return false;
  }

  /** Reloads the page (drops a dirty drawer - the beforeunload prompt is accepted by BasePage). */
  async reloadHub(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForPageReady();
  }
}

/** A second administrator window (21090). */
export interface SecondAdminWindow {
  page: Page;
  view: WriterBSettings;
  close: () => Promise<void>;
}

export interface WriterBFixtures {
  /** WriterBSettings on the admin page. */
  settingsView: WriterBSettings;
  /** Opens another window signed in as the administrator (storage state .auth/admin.json); closed at teardown. */
  secondAdminWindow: () => Promise<SecondAdminWindow>;
}

export const test = userRoleTest.extend<WriterBFixtures>({
  settingsView: async ({ page }, use) => {
    await use(new WriterBSettings(page));
  },

  secondAdminWindow: async ({ browser }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
      contexts.push(context);
      const p = await context.newPage();
      ScreenshotUtils.registerSession(testInfo, p);
      await p.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
      Logger.step('[secondAdminWindow] A second administrator window is open');
      return { page: p, view: new WriterBSettings(p), close: () => context.close().catch(() => undefined) };
    });
    for (const c of contexts) await c.close().catch(() => undefined);
  },
});

export { expect };

/**
 * Marks the case BLOCKED for an environment-gated last step - unless an earlier
 * step already FAILED, in which case the finding must stay visible: the case
 * ends FAIL and the blocked reason is kept as a note. Calling `steps.blocked`
 * after a failed step skipped the test and the report showed BLOCKED, hiding
 * the finding (21088 in the 2026-11-09 smoke: the SMTP / Notifications sections).
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = userRoleTest.info();
  if (info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `This step could not be observed either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}
