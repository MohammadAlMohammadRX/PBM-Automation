import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FacilityFormDrawer } from './FacilityFormDrawer';
import { FacilityInactivateDrawer } from './FacilityInactivateDrawer';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { TOAST, buttonSelector } from '../../constants/ElementIds';
import {
  FACILITY_DETAIL,
  type FacilityDetailAction,
  type FacilityDetailTab,
  type FacilityOverviewField,
} from '../../constants/facility/facilityIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { readFacility, readFacilityOrNull, type FacilityRecord } from '../../utils/FacilityProvisioning';

/** How a header action is offered, with its label and tooltip. */
export interface FacilityHeaderActionState {
  availability: 'absent' | 'disabled' | 'available';
  label: string;
  title: string;
}

/** What a header write answered (status -1 when nothing was sent) and the messages shown. */
export interface FacilityDetailWriteAnswer {
  status: number;
  text: string;
  messages: string[];
}

/**
 * A facility's detail screen (`/facility-management/{id}`), verified live 2026-11-04.
 *
 * Header card: initials, the English name (`facility-detail-name`), the type
 * tag, and a strip "License Number / Email Address / Mobile Number" (no ids;
 * the "Mobile Number" there showed the PHONE value on 2026-11-04). Actions in
 * the breadcrumb bar: Edit, Inactivate (active) | Activate (inactive; disabled
 * for an expired licence), Delete. Tabs: Overview, Network Assignment, Audit
 * History. Overview sections Basic Information (Facility Code, اسم المنشأة,
 * Authority Code, Provider Type, Status, National Code), License (start /
 * expiry, shown RAW `YYYY-MM-DD`), Contact (Phone, Mobile), Address (Building
 * Name, Unit Number, Zip Code, Additional Address En / Ar), Geo-coordinates
 * (Longitude, Latitude + a read-only map), Record (Created On / By, Modified
 * On / By - "—" until the first edit). A deleted / unknown id: GetFacility 404
 * -> toast "The requested facility was not found." and back to the list.
 */
export class FacilityDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private action(key: FacilityDetailAction): Locator {
    return this.page.locator(buttonSelector(FACILITY_DETAIL.action[key])).first();
  }

  async open(facilityId: string): Promise<void> {
    await this.goto(`${AppRoutes.facilityManagement}/${facilityId}`);
    await this.waitForLoaded();
  }

  /** Navigates WITHOUT expecting the screen - a deleted facility, a denied user. */
  async openExpectingFailure(facilityId: string): Promise<void> {
    await this.goto(`${AppRoutes.facilityManagement}/${facilityId}`);
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId(FACILITY_DETAIL.name), 'the facility detail should load').toBeVisible({ timeout: Timeouts.default });
    await this.waitForPageReady();
  }

  async isLoaded(): Promise<boolean> {
    return this.byId(FACILITY_DETAIL.name).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** The header's (English) name. */
  async getName(): Promise<string> {
    return (await this.byId(FACILITY_DETAIL.name).innerText()).trim();
  }

  async getTypeTag(): Promise<string> {
    return (await this.byId(FACILITY_DETAIL.typeTag).innerText().catch(() => '')).trim();
  }

  /** The facility id in the URL. */
  idFromUrl(): string {
    return new URL(this.page.url()).pathname.split('/').pop() ?? '';
  }

  /** The header card's whole text (name, type, the licence / e-mail / mobile strip). */
  async getHeaderText(): Promise<string> {
    return (await this.byId(FACILITY_DETAIL.headerCard).innerText({ timeout: Timeouts.default })).replace(/\s+/g, ' ').trim();
  }

  /** The screen's whole text (header, tabs, the open tab). */
  async getPageText(): Promise<string> {
    return (await this.byId(FACILITY_DETAIL.root).innerText({ timeout: Timeouts.default })).replace(/\s+/g, ' ').trim();
  }

  /** The main area's text and the toasts, whether or not the detail rendered (not-found / denied states carry no id). */
  async getScreenText(): Promise<string> {
    await this.waitForPageReady().catch(() => undefined);
    const main = await this.page.locator('main').first().innerText({ timeout: Timeouts.short }).catch(() => ''); // locator-exception: the failure states carry no id; the app's single <main> is read whole.
    return `${main} ${(await this.readMessages()).join(' ')}`.replace(/\s+/g, ' ').trim();
  }

  /** The Overview status ("Future", "Active", "Inactive", "Expired"). */
  async getStatus(): Promise<string> {
    return this.readOverviewField('status');
  }

  /** Polls (reloading) until the Overview status reads `expected`. */
  async expectStatus(expected: string | RegExp, timeout: number = Timeouts.default): Promise<void> {
    await expect.poll(async () => {
      await this.reload();
      await this.waitForLoaded().catch(() => undefined);
      return this.getStatus().catch(() => '');
    }, { timeout, message: `the facility status should read ${String(expected)}` }).toMatch(expected);
  }

  // ---- header actions -------------------------------------------------------------------

  async getActionAvailability(key: FacilityDetailAction): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.action(key);
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /** One header action with its label and tooltip ("Cannot activate: the facility licence has expired. ..."). */
  async getActionState(key: FacilityDetailAction): Promise<FacilityHeaderActionState> {
    const availability = await this.getActionAvailability(key);
    if (availability === 'absent') return { availability, label: '', title: '' };
    const button = this.action(key);
    const host = this.byId(FACILITY_DETAIL.action[key]);
    const title = (await button.getAttribute('title')) ?? (await host.getAttribute('title').catch(() => null)) ?? '';
    return { availability, label: (await button.innerText().catch(() => '')).trim(), title };
  }

  async readActionStates(): Promise<Record<FacilityDetailAction, FacilityHeaderActionState>> {
    await this.waitForPageReady();
    const out = {} as Record<FacilityDetailAction, FacilityHeaderActionState>;
    for (const key of Object.keys(FACILITY_DETAIL.action) as FacilityDetailAction[]) out[key] = await this.getActionState(key);
    return out;
  }

  /** The labels of the header actions on screen ("Edit", "Inactivate", "Delete"). */
  async readOfferedActions(): Promise<string[]> {
    return Object.values(await this.readActionStates()).filter((s) => s.availability !== 'absent').map((s) => s.label);
  }

  async clickAction(key: FacilityDetailAction): Promise<void> {
    Logger.step(`Clicking the facility's "${key}" action`);
    await this.waitForPageReady();
    await expect(this.action(key), `the "${key}" action should be usable`).toBeEnabled({ timeout: Timeouts.default });
    await this.action(key).click();
  }

  // ---- tabs and Overview ---------------------------------------------------------------

  async openTab(tab: FacilityDetailTab): Promise<void> {
    Logger.step(`Opening the facility's ${tab} tab`);
    await this.page.locator(`#${FACILITY_DETAIL.tab[tab]}`).click();
    await this.waitForPageReady();
  }

  /** The tabs offered, by key, with their labels. */
  async readTabs(): Promise<Partial<Record<FacilityDetailTab, string>>> {
    const out: Partial<Record<FacilityDetailTab, string>> = {};
    for (const [key, id] of Object.entries(FACILITY_DETAIL.tab) as [FacilityDetailTab, string][]) {
      const tab = this.page.locator(`#${id}`);
      if (await tab.isVisible().catch(() => false)) out[key] = (await tab.innerText()).trim();
    }
    return out;
  }

  async hasTab(tab: FacilityDetailTab): Promise<boolean> {
    return (await this.readTabs())[tab] !== undefined;
  }

  /** One Overview value ('' when not rendered; "—" is what an empty field shows). */
  async readOverviewField(field: FacilityOverviewField): Promise<string> {
    return this.byId(FACILITY_DETAIL.overview[field]).last().innerText({ timeout: Timeouts.short }).then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  }

  async readOverview(): Promise<Record<FacilityOverviewField, string>> {
    await this.byId(FACILITY_DETAIL.overview.facilityCode).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    const out = {} as Record<FacilityOverviewField, string>;
    for (const field of Object.keys(FACILITY_DETAIL.overview) as FacilityOverviewField[]) out[field] = await this.readOverviewField(field);
    return out;
  }

  /** Whether an Overview field renders at all (the field list cases). */
  async hasOverviewField(field: FacilityOverviewField): Promise<boolean> {
    return this.byId(FACILITY_DETAIL.overview[field]).first().isVisible().catch(() => false);
  }

  /**
   * The Overview's labels with their values, read off the field rows (the
   * labels carry no ids): "Facility Code" -> "FCL-000064", ... - for the
   * "every documented field is labelled" cases.
   */
  async readOverviewLabels(): Promise<Record<string, string>> {
    const ids = Object.values(FACILITY_DETAIL.overview);
    return this.page.locator(ids.map((id) => `#${id}`).join(', ')).evaluateAll((values) => {
      const out: Record<string, string> = {};
      for (const value of values) {
        const row = value.parentElement;
        const label = row ? Array.from(row.children).find((c) => c !== value) : undefined;
        out[(label as HTMLElement | undefined)?.innerText.trim() ?? value.id] = (value as HTMLElement).innerText.trim();
      }
      return out;
    });
  }

  // ---- writes ---------------------------------------------------------------------------

  /** Opens the Edit drawer and returns it, loaded. */
  async openEditDrawer(): Promise<FacilityFormDrawer> {
    await this.clickAction('edit');
    const drawer = new FacilityFormDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** Opens the detail's Inactivate drawer (`facility-detail-deactivate-drawer`). */
  async openInactivate(): Promise<FacilityInactivateDrawer> {
    await this.clickAction('inactivate');
    const drawer = new FacilityInactivateDrawer(this.page, 'detail');
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks Activate and leaves "Activate facility / Do you want to activate {name}?" (No / Activate) open. */
  async requestActivate(): Promise<ConfirmDialog> {
    await this.clickAction('activate');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Activate + confirm; returns SetFacilityActive's answer (applied at once) and the toasts. */
  async activate(): Promise<FacilityDetailWriteAnswer> {
    const dialog = await this.requestActivate();
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.facilitySetActive, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  /** Clicks Delete and leaves "Delete Facility / Do you want to delete {name}?" (No / Yes) open. */
  async requestDelete(): Promise<ConfirmDialog> {
    await this.clickAction('delete');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Delete + Yes; returns DeleteFacility's answer. Deleted: toast "Facility deleted" and back to the list; blocked: 409 and the reason as a toast. */
  async deleteFacility(): Promise<FacilityDetailWriteAnswer> {
    const dialog = await this.requestDelete();
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.facilityDelete, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  /** Toasts and dialog messages on screen now (no wait). */
  async readMessages(): Promise<string[]> {
    const toasts = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    const dialog = await this.page.locator('#pbm-dialog-message').allInnerTexts().catch(() => [] as string[]);
    return [...toasts, ...dialog].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
  }

  /** Toasts on screen, settled. */
  async waitForMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(() => this.readMessages(), timeout);
  }

  // ---- API ------------------------------------------------------------------------------

  async readViaApi(facilityId: string): Promise<FacilityRecord> {
    return readFacility(this.page, facilityId);
  }

  async readViaApiOrNull(facilityId: string): Promise<FacilityRecord | null> {
    return readFacilityOrNull(this.page, facilityId);
  }
}
