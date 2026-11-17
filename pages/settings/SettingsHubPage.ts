import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { PBM_DIALOG, SETTINGS_DRAWER, SETTINGS_HUB, SETTINGS_TOAST, UNSAVED_DIALOG } from '../../constants/settings/settingsIds';
import { Logger } from '../../utils/Logger';

/** What one press of Save produced - returned, never asserted, because the cases want opposite outcomes from the same click. */
export interface DrawerSaveOutcome {
  /** HTTP status of the PUT UpsertSystemSettings, or null when no request left the browser. */
  status: number | null;
  /** The request body the drawer sent (`{ settings: [{ key, value }] }`), or null. */
  sent: { settings: { key: string; value: string }[] } | null;
  /** The start of the server's answer (a 422 names the failing key and its message). */
  answer: string;
  /** Toast summary + detail, or ''. */
  toast: string;
  /** Whether the currency confirmation dialog opened instead of a save. */
  confirmationOpened: boolean;
  /** Whether the drawer is still open once everything settled. */
  drawerOpen: boolean;
}

/**
 * System Settings > Settings hub (Feature 20863, 2026-11-09): the tab strip,
 * the General tab's read view, its "Edit Setting" drawer, and the currency
 * confirmation. Built on what the foundation saw on the live screen
 * (reports/settings/Settings-Foundation-Notes.md); writers add their own
 * readers in utils/settings/writer<X>Helpers.ts, not here.
 *
 * Read view: values carry no ids - `readViewValue(label)` returns the line
 * after a label inside the id'd outlet. Drawer: every control has an id
 * (constants/settings/settingsIds.ts). Saving: `saveAndCapture()` returns the
 * request the drawer sent, the server's answer, the toast, and whether the
 * confirmation opened, so each case asserts what IT expects.
 */
export class SettingsHubPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ---------------------------------------------------------------- hub + tabs

  /** Opens the hub. Does NOT assert the Edit button (a view-only role has none). */
  async open(): Promise<void> {
    // The read view renders its values after GetSystemSettings answers - reading
    // the outlet straight after it appeared found no "Currency" / "Scheduled Jobs"
    // (smoke 2026-11-09: 15 cases). Wait for that answer (a session without the
    // right never asks - hence the catch), then for the text to stop changing.
    const loaded = this.page
      .waitForResponse((r) => r.url().includes(ApiEndpoints.systemSettingsGet), { timeout: Timeouts.default })
      .catch(() => null);
    await this.goto(AppRoutes.systemSettings);
    await expect(this.byId(SETTINGS_HUB.outlet), 'the Settings screen should render').toBeVisible({ timeout: Timeouts.default });
    await loaded;
    await this.waitForOutletToSettle();
  }

  /**
   * Waits until the outlet's text is non-empty and unchanged across two reads
   * 500 ms apart (max ~10 s) - tabs and the read view fill in after their own
   * requests answer. Never throws: a screen that keeps changing is read as is.
   */
  async waitForOutletToSettle(): Promise<void> {
    const outlet = this.byId(SETTINGS_HUB.outlet);
    let previous = '';
    for (let i = 0; i < 20; i += 1) {
      const now = await outlet.innerText().catch(() => '');
      if (now.trim() !== '' && now === previous) return;
      previous = now;
      await this.page.waitForTimeout(500);
    }
  }

  /** The tab labels the strip offers, in order ([] when the strip is not shown). */
  async tabLabels(): Promise<string[]> {
    const strip = this.byId(SETTINGS_HUB.tabs);
    if (!(await strip.isVisible().catch(() => false))) return [];
    return (await strip.locator('button[id^="settings-hub-tab-"]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim()); // locator-exception: tab buttons inside the id'd strip, matched by their own id prefix
  }

  async isTabStripVisible(): Promise<boolean> {
    return this.byId(SETTINGS_HUB.tabs).isVisible().catch(() => false);
  }

  async openTab(tab: keyof typeof SETTINGS_HUB.tab): Promise<void> {
    await this.byId(SETTINGS_HUB.tab[tab]).click();
    await this.waitForPageReady();
    await this.waitForOutletToSettle();
  }

  tabButton(tab: keyof typeof SETTINGS_HUB.tab): Locator {
    return this.byId(SETTINGS_HUB.tab[tab]);
  }

  /** The outlet's text, whitespace collapsed - for "which sections / values are shown". */
  async outletText(): Promise<string> {
    return (await this.byId(SETTINGS_HUB.outlet).innerText()).replace(/\s+/g, ' ').trim();
  }

  /**
   * The value the read view shows under a label ("Time zone" -> "(GMT+03:00) Riyadh",
   * "Exchange rate (SAR per 1 USD)" -> "1 USD = 3.75 SAR", "Payer status update schedule"
   * -> "Every day at 12:20 pm (Riyadh)"). '' when the label is absent.
   *
   * locator-exception: the read view's values carry no ids; the outlet's lines are read.
   */
  async readViewValue(label: string): Promise<string> {
    const lines = (await this.byId(SETTINGS_HUB.outlet).innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
    const at = lines.indexOf(label);
    return at >= 0 ? lines[at + 1] ?? '' : '';
  }

  // ---------------------------------------------------------------- drawer

  editButton(): Locator {
    return this.btn(SETTINGS_DRAWER.editButton);
  }

  drawerTitle(): Locator {
    return this.byId(SETTINGS_DRAWER.title);
  }

  control(id: keyof typeof SETTINGS_DRAWER): Locator {
    return this.byId(SETTINGS_DRAWER[id] as string);
  }

  async isDrawerOpen(timeout: number = Timeouts.short): Promise<boolean> {
    return this.drawerTitle().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  /** Opens the hub (if needed) and the Edit drawer. */
  async openEdit(): Promise<void> {
    if (await this.isDrawerOpen(500)) return;
    if (!(await this.editButton().isVisible().catch(() => false))) await this.open();
    await this.editButton().click();
    await expect(this.drawerTitle(), 'the Edit Setting drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** Picks an option in a drawer select (time zone / currency) by its visible text. Types into the filter when the select has one. */
  async pick(select: 'timeZoneSelect' | 'currencySelect', optionText: string, filterWith?: string): Promise<void> {
    const control = this.control(select);
    await control.scrollIntoViewIfNeeded();
    await control.click();
    if (filterWith) {
      // Typed INTO the overlay's searchbox once shown: keystrokes sent straight
      // after the click were lost before the filter took focus (full run 2026-11-09).
      // locator-exception: PrimeNG's overlay filter carries no id; it is the open overlay's only searchbox.
      const filter = this.page.getByRole('searchbox').filter({ visible: true }).last();
      await filter.waitFor({ state: 'visible', timeout: Timeouts.short });
      await filter.pressSequentially(filterWith, { delay: 30 });
    }
    const option = this.page.getByRole('option', { name: optionText, exact: true }).filter({ visible: true }).first();
    await option.waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    if (!(await option.isVisible().catch(() => false))) {
      const offered = (await this.page.getByRole('option').filter({ visible: true }).allInnerTexts().catch(() => [] as string[]))
        .map((t) => t.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      expect(offered, `the "${optionText}" option${filterWith ? ` (searched "${filterWith}")` : ''} is offered - the list offers: ${offered.slice(0, 12).join(', ') || 'nothing'}`).toContain(optionText);
    }
    await option.click();
  }

  async setSiteTitle(value: string): Promise<void> {
    await this.control('siteTitleInput').fill(value);
  }

  /**
   * Types the rate and leaves the box. The rate and converter-amount boxes are
   * PrimeNG number boxes: a value reaches the form only when the box loses
   * focus (verified 2026-11-09 - "4" filled left the converter on 26.67 until
   * Tab), and leaving it applies the box's own rules (min 0.0001).
   */
  async setRate(value: string): Promise<void> {
    await this.control('rateInput').fill(value);
    await this.control('rateInput').press('Tab');
  }

  /** Types the converter amount and leaves the box (see `setRate`). */
  async setConverterAmount(value: string): Promise<void> {
    await this.control('converterAmount').fill(value);
    await this.control('converterAmount').press('Tab');
  }

  /** Picks a logo file (buffer) - only a preview until Save. */
  async pickLogo(file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await this.control('logoFileInput').setInputFiles(file);
  }

  /**
   * Presses Save and reports everything it produced (see DrawerSaveOutcome).
   * When the currency confirmation opens no request is sent yet; the caller
   * answers the dialog and calls `confirmCurrencyChange()`.
   */
  async saveAndCapture(): Promise<DrawerSaveOutcome> {
    const upsert = this.page
      .waitForResponse((r) => r.url().includes(ApiEndpoints.systemSettingsUpsert) && r.request().method() === 'PUT', { timeout: Timeouts.short })
      .then(async (r) => ({
        status: r.status() as number | null,
        sent: (r.request().postDataJSON() as DrawerSaveOutcome['sent']) ?? null,
        answer: (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400),
      }))
      .catch(() => ({ status: null, sent: null, answer: '' }));
    Logger.step('Pressing Save in the Edit Setting drawer');
    await this.btn(SETTINGS_DRAWER.save).click();
    const confirmation = await this.byId(PBM_DIALOG.title).waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
    const { status, sent, answer } = confirmation ? { status: null, sent: null, answer: '' } : await upsert;
    const toast = confirmation ? '' : await this.readToast();
    const drawerOpen = confirmation ? true : await this.drawerStillOpenAfterSettle();
    Logger.step(`Save -> ${status ?? 'no request'}${confirmation ? ' (currency confirmation opened)' : ''}; toast "${toast}"; drawer ${drawerOpen ? 'open' : 'closed'}`);
    return { status, sent, answer, toast, confirmationOpened: confirmation, drawerOpen };
  }

  /** Waits out the drawer's closing animation, then reports whether it is still open. */
  private async drawerStillOpenAfterSettle(): Promise<boolean> {
    await this.drawerTitle().waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
    return this.drawerTitle().isVisible().catch(() => false);
  }

  /** Toast summary + detail ("Setting updated The setting was updated successfully."), '' when none shows. */
  async readToast(timeout: number = Timeouts.short): Promise<string> {
    const toast = this.byId(SETTINGS_TOAST.toast);
    return toast
      .waitFor({ state: 'visible', timeout })
      .then(async () => (await toast.innerText()).replace(/\s+/g, ' ').trim())
      .catch(() => '');
  }

  // ---------------------------------------------------------------- currency confirmation (pbm-dialog)

  dialog(part: Exclude<keyof typeof PBM_DIALOG, 'item'>): Locator {
    return this.byId(PBM_DIALOG[part] as string);
  }

  dialogItem(index: number): Locator {
    return this.byId(PBM_DIALOG.item(index));
  }

  /** Every line of the confirmation's list (example + affected screens). */
  async dialogItems(): Promise<string[]> {
    return (await this.byId(PBM_DIALOG.items).locator('li').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim()); // locator-exception: list items inside the id'd list (each also has its own idx id)
  }

  /** Ticks the acknowledgement and presses Change currency; returns the save outcome. */
  async confirmCurrencyChange(): Promise<DrawerSaveOutcome> {
    const upsert = this.page
      .waitForResponse((r) => r.url().includes(ApiEndpoints.systemSettingsUpsert) && r.request().method() === 'PUT', { timeout: Timeouts.default })
      .then(async (r) => ({
        status: r.status() as number | null,
        sent: (r.request().postDataJSON() as DrawerSaveOutcome['sent']) ?? null,
        answer: (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400),
      }))
      .catch(() => ({ status: null, sent: null, answer: '' }));
    await this.byId(PBM_DIALOG.acknowledge).check();
    await this.btn(PBM_DIALOG.confirm).click();
    const { status, sent, answer } = await upsert;
    const toast = await this.readToast();
    const drawerOpen = await this.drawerStillOpenAfterSettle();
    return { status, sent, answer, toast, confirmationOpened: true, drawerOpen };
  }

  // ---------------------------------------------------------------- unsaved changes

  /**
   * The unsaved-changes dialog, in either form the app uses: its own host, or the
   * shared `pbm-dialog` with Keep Editing (`pbm-dialog-action-stay`) / Discard
   * (`pbm-dialog-action-discard`) - the form other modules show.
   */
  private unsavedDialog(): Locator {
    // locator-exception: the host's dialog was never rendered in the foundation (no inner ids known); its visible dialog is matched.
    const host = this.byId(UNSAVED_DIALOG.host).locator('.p-dialog, [role="dialog"]').first();
    const shared = this.byId(PBM_DIALOG.dialog).filter({ has: this.page.locator('#pbm-dialog-action-stay, #pbm-dialog-action-discard') }); // locator-exception: the shared dialog counts only when it carries the leave buttons (ids)
    return host.or(shared).first();
  }

  /** Whether the unsaved-changes dialog is showing (checked for `timeout`). */
  async isUnsavedDialogOpen(timeout: number = 2_000): Promise<boolean> {
    return this.unsavedDialog().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  /** The unsaved-changes dialog's text, '' when absent. */
  async unsavedDialogText(): Promise<string> {
    if (!(await this.isUnsavedDialogOpen(500))) return '';
    return (await this.unsavedDialog().innerText()).replace(/\s+/g, ' ').trim();
  }
}
