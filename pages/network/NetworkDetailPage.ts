import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NetworkFormDialog } from './NetworkFormDialog';
import { NetworkInactivateDialog } from './NetworkInactivateDialog';
import { NetworkFacilitiesTab } from './NetworkFacilitiesTab';
import { NetworkPoliciesTab } from './NetworkPoliciesTab';
import { NetworkVersionHistoryTab } from './NetworkVersionHistoryTab';
import { NetworkAuditHistoryTab } from './NetworkAuditHistoryTab';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import {
  NETWORK_DETAIL,
  TOAST,
  buttonSelector,
  type NetworkDetailAction,
  type NetworkDetailTab,
  type NetworkOverviewField,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { GET_NETWORKS_ENDPOINT } from '../../data/networks/seedNetworks.data';

/**
 * A network's detail screen, `/network-management/{id}`.
 *
 * Verified 2026-10-21: a header card (name, status badge, `v{n} · {state}`
 * badge, a state hint such as "This network is a draft...", type and dates),
 * header actions offered by STATE (a draft offers Edit / Clone / Send for
 * Approval / Delete; an Active one Inactivate / Send for Approval when a draft
 * exists), and five tabs - Overview, Facility Assignment (n), Linked Policies
 * (n), Version History, Audit History. Each tab has its own Page Object.
 */
export class NetworkDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** Opens a network by id. */
  async open(networkId: string): Promise<void> {
    await this.goto(`${AppRoutes.networkManagement}/${networkId}`);
    // IN THE OWNER'S SCOPE (2026-10-24). A network owned by a payer outside the
    // top-bar scope ("AAA" by default) does not open: the app quietly returns
    // to the list, so the header never renders. That was 13 failures of the
    // 2026-10-24 run, all on networks owned by the case's own payer. When the
    // header does not come up, the owner is put in scope and the network
    // opened again.
    if (!(await this.isLoaded(Timeouts.short))) {
      const owner = await this.ownerOf(networkId);
      // From the LIST: the scope picker lives in its breadcrumb, and the bounce
      // from a refused detail route may not have landed yet (folder 17's shared
      // policy networks, 2026-10-25).
      if (owner) await this.goto(AppRoutes.networkManagement);
      if (owner && (await this.scopeTo(owner).catch(() => false))) {
        await this.goto(`${AppRoutes.networkManagement}/${networkId}`);
      }
    }
    await this.waitForLoaded();
  }

  /** The owning payer's English name, or '' for an unowned network (locating only). */
  private async ownerOf(networkId: string): Promise<string> {
    const record = await NetworkUtils.postAsSession(this.page, ApiEndpoints.networkGet, { id: networkId });
    const name = record.status === 200
      ? String((JSON.parse(record.text) as { payload?: { networkNameEn?: string } }).payload?.networkNameEn ?? '')
      : '';
    if (!name) return '';
    const list = await NetworkUtils.postAsSession(this.page, GET_NETWORKS_ENDPOINT, { pageNumber: 1, rowsPerPage: 10, searchText: name });
    const rows = list.status === 200
      ? (JSON.parse(list.text) as { payload?: { networks?: { items?: { id: string; payerNameEn?: string | null }[] } } }).payload?.networks?.items ?? []
      : [];
    return rows.find((row) => row.id === networkId)?.payerNameEn ?? '';
  }

  /** Opens a network by id WITHOUT asserting it loaded - for the not-found cases. */
  async openExpectingFailure(networkId: string): Promise<void> {
    await this.goto(`${AppRoutes.networkManagement}/${networkId}`);
  }

  /** Asserts the header rendered with a name. */
  async waitForLoaded(): Promise<void> {
    await expect(this.byId(NETWORK_DETAIL.name), 'the network detail header should render').not.toHaveText('', {
      timeout: Timeouts.default,
    });
  }

  /** Whether the detail header rendered at all. */
  async isLoaded(timeout: number = Timeouts.default): Promise<boolean> {
    return this.byId(NETWORK_DETAIL.name)
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /** The toast summary on screen, or '' - read after a failed load. */
  async readToast(): Promise<string> {
    return this.page
      .locator(`#${TOAST.summary}`)
      .innerText({ timeout: Timeouts.toast })
      .then((text) => text.trim())
      .catch(() => '');
  }

  async getName(): Promise<string> {
    return (await this.byId(NETWORK_DETAIL.name).innerText()).trim();
  }

  /** The lifecycle badge - Pending, Active, Inactive, Expired, Not Live. */
  /**
   * The header's badge. locator-exception: the Overview panel can render a
   * second element with the same id (seen on a draft, 2026-10-21), so the
   * badge is read inside the header card.
   */
  private statusBadge(): Locator {
    return this.byId(NETWORK_DETAIL.headerCard).locator(`#${NETWORK_DETAIL.statusBadge}`).first();
  }

  async getStatus(): Promise<string> {
    return (await this.statusBadge().innerText()).trim();
  }

  async expectStatus(expected: string): Promise<void> {
    await expect(this.statusBadge()).toHaveText(expected, { timeout: Timeouts.default });
  }

  /** The approval badge, e.g. "v1 · Published". */
  async getVersionBadge(): Promise<string> {
    return (await this.byId(NETWORK_DETAIL.headerCard).locator(`#${NETWORK_DETAIL.versionBadge}`).first().innerText()).trim();
  }

  /** The header card's whole text - hint, type and dates included. */
  async getHeaderText(): Promise<string> {
    return (await this.byId(NETWORK_DETAIL.headerCard).innerText()).trim();
  }

  // ---- Header actions -------------------------------------------------------

  private action(key: NetworkDetailAction): Locator {
    return this.page.locator(buttonSelector(NETWORK_DETAIL.action[key])).first();
  }

  /** absent / disabled / available - the same three answers the list rows give. */
  async getActionAvailability(key: NetworkDetailAction): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.action(key);
    const shown = await button
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (!shown) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /** The header actions currently offered, by key. */
  async getOfferedActions(): Promise<NetworkDetailAction[]> {
    const offered: NetworkDetailAction[] = [];
    for (const key of Object.keys(NETWORK_DETAIL.action) as NetworkDetailAction[]) {
      if ((await this.action(key).count()) > 0 && (await this.action(key).isVisible())) offered.push(key);
    }
    return offered;
  }

  async clickAction(key: NetworkDetailAction): Promise<void> {
    Logger.step(`Clicking the detail header's "${key}" action`);
    await expect(this.action(key)).toBeEnabled({ timeout: Timeouts.default });
    await this.action(key).click();
  }

  /** Opens the edit drawer from the header. */
  async openEdit(): Promise<NetworkFormDialog> {
    await this.clickAction('edit');
    const form = new NetworkFormDialog(this.page);
    await form.waitForOpen();
    await form.waitForPopulated();
    return form;
  }

  /** Opens the clone drawer from the header. */
  async openClone(): Promise<NetworkFormDialog> {
    await this.clickAction('clone');
    const form = new NetworkFormDialog(this.page);
    await form.waitForOpen();
    return form;
  }

  /** Starts a deletion and returns the confirmation dialog. */
  async openDelete(): Promise<ConfirmDialog> {
    await this.clickAction('delete');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Starts an inactivation and returns its drawer. */
  async openInactivate(): Promise<NetworkInactivateDialog> {
    await this.clickAction('inactivate');
    const drawer = new NetworkInactivateDialog(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Sends the staged draft for approval and confirms the prompt. */
  async submitForApproval(): Promise<void> {
    await this.clickAction('submit');
    await new ConfirmDialog(this.page).confirm('Send for Approval');
    await this.waitForPageReady();
  }

  // ---- Tabs -----------------------------------------------------------------

  private tab(key: NetworkDetailTab): Locator {
    return this.byId(NETWORK_DETAIL.tab[key]);
  }

  /** Every tab label, in order, counts included ("Facility Assignment (2)"). */
  async getTabLabels(): Promise<string[]> {
    await expect(this.byId(NETWORK_DETAIL.tabs)).toBeVisible({ timeout: Timeouts.default });
    return (await this.byId(NETWORK_DETAIL.tabs).locator('[id^="network-detail-tab-"]').allInnerTexts()).map((t) =>
      t.trim(),
    );
  }

  /** The number in a tab's label - "(2)" -> 2; null when the label carries none. */
  async getTabCount(key: 'facilities' | 'policies'): Promise<number | null> {
    const label = (await this.tab(key).innerText()).trim();
    const match = label.match(/\((\d+)\)/);
    return match ? Number(match[1]) : null;
  }

  async openTab(key: NetworkDetailTab): Promise<void> {
    Logger.step(`Opening the "${key}" tab`);
    await this.tab(key).click();
    await this.waitForPageReady();
  }

  /** Whether a tab is offered to this session. */
  async hasTab(key: NetworkDetailTab): Promise<boolean> {
    return this.tab(key)
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  // ---- Overview -------------------------------------------------------------

  /** One Overview field's text, or '' when the field is not rendered. */
  async readOverviewField(field: NetworkOverviewField): Promise<string> {
    // The Overview status badge is `-status-badge-2` on a live network but
    // reuses the header's `-status-badge` id on a draft (2026-10-21).
    const locator = field === 'status'
      ? this.byId(NETWORK_DETAIL.overview.status).or(this.byId(NETWORK_DETAIL.statusBadge)).last()
      : this.byId(NETWORK_DETAIL.overview[field]).last();
    return locator.innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
  }

  /** Every Overview field, keyed. */
  async readOverview(): Promise<Record<NetworkOverviewField, string>> {
    await this.openTab('overview');
    const out = {} as Record<NetworkOverviewField, string>;
    for (const field of Object.keys(NETWORK_DETAIL.overview) as NetworkOverviewField[]) {
      out[field] = await this.readOverviewField(field);
    }
    return out;
  }

  /** The Overview panel's whole text, labels included (for metadata checks). */
  async getOverviewText(): Promise<string> {
    await this.openTab('overview');
    return (await this.byId(NETWORK_DETAIL.overview.code).locator('xpath=ancestor::div[2]').innerText()).trim();
  }

  // ---- Tab objects ----------------------------------------------------------

  facilities(): NetworkFacilitiesTab {
    return new NetworkFacilitiesTab(this.page, this);
  }

  policies(): NetworkPoliciesTab {
    return new NetworkPoliciesTab(this.page, this);
  }

  versions(): NetworkVersionHistoryTab {
    return new NetworkVersionHistoryTab(this.page, this);
  }

  audit(): NetworkAuditHistoryTab {
    return new NetworkAuditHistoryTab(this.page, this);
  }

  // ---- story 12 / 18 additions ----------------------------------------------

  /**
   * The tab currently shown, by key - read from the tab's own active state
   * (aria-selected, or the `is-active` class the stepper and tabs share).
   * '' when no tab reports itself active.
   */
  async getActiveTab(): Promise<NetworkDetailTab | ''> {
    for (const key of Object.keys(NETWORK_DETAIL.tab) as NetworkDetailTab[]) {
      const tab = this.tab(key);
      const selected = await tab.getAttribute('aria-selected').catch(() => null);
      const className = (await tab.getAttribute('class').catch(() => '')) ?? '';
      if (selected === 'true' || /\b(is-)?active\b/.test(className)) return key;
    }
    return '';
  }

  /**
   * Deletes from the header: opens the prompt, confirms it, and returns what
   * DeleteNetwork answered (null when no request left the browser) together
   * with the messages shown afterwards. For the deletion story, whose outcome
   * - discarded, staged for approval, or refused for a dependency - is the
   * thing under test.
   */
  async deleteAndCapture(): Promise<{ outcome: { status: number; body: unknown; text: string } | null; messages: string[] }> {
    const dialog = await this.openDelete();
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkDelete, () => dialog.confirm());
    return { outcome, messages: await this.readMessages() };
  }

  /** Toast and dialog text on screen now (waits briefly for one to appear). */
  async readMessages(): Promise<string[]> {
    const toast = this.page.locator(`#${TOAST.summary}, #${TOAST.detail}, #pbm-dialog-message`);
    await toast.first().waitFor({ state: 'visible', timeout: Timeouts.toast }).catch(() => undefined);
    return (await toast.allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter((t) => t !== '');
  }

  /** The main content's whole text - what a not-found or denied screen says. */
  async getMainText(): Promise<string> {
    return (await this.page.locator('main, #app-layout').first().innerText().catch(() => '')).trim();
  }

  // ---- lifecycle-job reads (stories 08, 24, 31, 39) --------------------------

  /**
   * Re-opens a network until its header badge reads `status`. For the
   * job-driven transitions: the lifecycle job runs every minute here and cannot
   * be triggered on demand, so "run the job, reload the record" is a poll.
   * Opened by id, so a network owned by a payer outside the top-bar scope is
   * still reachable.
   */
  async expectStatusEventually(networkId: string, status: string, timeoutMs: number): Promise<void> {
    Logger.step(`Waiting up to ${Math.round(timeoutMs / 1000)}s for network ${networkId} to read ${status}`);
    await expect
      .poll(async () => {
        await this.open(networkId);
        return this.getStatus();
      }, { timeout: timeoutMs, intervals: [15_000], message: `the network should come to read ${status}` })
      .toBe(status);
  }

  /**
   * Asserts the badge reads `status` on EVERY re-open across `forMs` - long
   * enough for the every-minute lifecycle job to run at least twice. This is
   * how "the job ran and left it unchanged" is observed: a single read right
   * away would pass before the job had a chance to act.
   */
  async expectStatusHolds(networkId: string, status: string, forMs = 150_000): Promise<void> {
    Logger.step(`Checking network ${networkId} stays ${status} for ${Math.round(forMs / 1000)}s`);
    const deadline = Date.now() + forMs;
    do {
      await this.open(networkId);
      await expect(this.statusBadge(), `the network should still read ${status} after the job ran`).toHaveText(status, {
        timeout: Timeouts.default,
      });
      await this.page.waitForTimeout(Math.min(20_000, Math.max(0, deadline - Date.now())));
    } while (Date.now() < deadline);
  }

  // ---- story 29 additions (facility approval states) ----

  /**
   * Sends SubmitNetworkForApproval directly - the only way to repeat a
   * submission the header no longer offers once a change is pending.
   */
  async submitDirectly(networkId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.networkSubmit, { networkId });
  }

  // ---- story 34 additions (submission workflow) ----

  /**
   * The header buttons this network offers, by their id suffix
   * (`network-detail-{key}-button`) - including any the NETWORK_DETAIL map does
   * not name, such as a "Discard Draft" the submission story asks for. Scoped
   * to the detail screen's own id namespace; tab-internal buttons excluded.
   */
  async getHeaderActionKeys(): Promise<string[]> {
    await this.waitForLoaded();
    const ids = await this.page
      .locator('[id^="network-detail-"][id$="-button"]')
      .evaluateAll((elements) => elements
        .filter((element) => (element as HTMLElement).offsetParent !== null || element.getBoundingClientRect().height > 0)
        .map((element) => (element as HTMLElement).id));
    return ids
      .map((id) => id.replace(/^network-detail-/, '').replace(/-button$/, ''))
      .filter((key) => !/^(view|remove|assign|cancel|close)/.test(key) && !key.includes('-search'));
  }

  /** Clicks a header action whose id key matches `pattern` (e.g. /discard/), returning the prompt it raises. */
  async clickHeaderActionMatching(pattern: RegExp): Promise<ConfirmDialog> {
    const key = (await this.getHeaderActionKeys()).find((k) => pattern.test(k));
    expect(key, `the header should offer an action matching ${pattern}`).toBeDefined();
    await this.page.locator(buttonSelector(`network-detail-${key}-button`)).first().click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  // ---- story 05 / 10 additions (status held after approval) ----

  /**
   * Re-opens a network by id every 20 s for `durationMs` and asserts its header
   * keeps reading `status`. By id rather than through the list, so it works for
   * a network owned by a payer the top-bar scope cannot select (an inactive one).
   */
  async expectStatusHeldFor(networkId: string, status: string, durationMs: number): Promise<void> {
    const deadline = Date.now() + durationMs;
    do {
      await this.open(networkId);
      await this.expectStatus(status);
      await this.page.waitForTimeout(Math.min(20_000, Math.max(0, deadline - Date.now())));
    } while (Date.now() < deadline);
    await this.open(networkId);
    await this.expectStatus(status);
  }

  // ---- story 07 / 08 / 39 additions (header lifecycle actions) ----

  /**
   * Activates from the HEADER and reports what SetNetworkActive answered and
   * the toast shown. By id rather than through the list: the duplicate-name
   * cases have two networks with the same name, which the list's row lookup
   * cannot tell apart.
   */
  async attemptActivation(): Promise<{ status: number; text: string; toast: string }> {
    await this.clickAction('activate');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkSetActive, () => dialog.confirm('activate'));
    const toast = await this.readToast();
    await dialog.cancel().catch(() => undefined);
    return { status: outcome?.status ?? 0, text: outcome?.text ?? '', toast };
  }
}
