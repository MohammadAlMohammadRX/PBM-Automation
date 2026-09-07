import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AssignNetworkDrawer } from './AssignNetworkDrawer';
import { PayerVersionHistoryTab } from './PayerVersionHistoryTab';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Timeouts } from '../../constants/Timeouts';
import {
  PAYER_AUDIT,
  PAYER_DETAIL_FIELD,
  PAYER_DETAIL_HEADER,
  PAYER_DETAIL_TAB,
  buttonSelector,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * Read-only payer detail view (`/payer-management/{id}`), reached via the "View"
 * row action.
 *
 * Values now come from their own ids rather than a label-text lookup over
 * `div.payer-detail__field` - see PAYER_DETAIL_FIELD for the label -> id map.
 * The screen splits its values between a contact block and the Overview tab,
 * which the map absorbs so callers keep asking by label.
 *
 * The page's action buttons (Edit / Delete / Submit for Approval / Inactivate)
 * carry `payer-detail-*` ids but are PROJECTED into the global breadcrumb bar,
 * so they are outside `#payer-detail`.
 */
export class PayerDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private fieldValue(label: string): Locator {
    const id = PAYER_DETAIL_FIELD[label];
    if (!id) {
      throw new Error(
        `[PayerDetailPage] No id mapping for detail field "${label}". `
          + `Known fields: ${Object.keys(PAYER_DETAIL_FIELD).join(', ')}`,
      );
    }
    return this.byId(id);
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId('payer-detail-name')).toBeVisible({ timeout: Timeouts.default });
  }

  /** Returns the displayed value of a labelled detail field (e.g. "Created At"). */
  async getFieldValue(label: string): Promise<string> {
    return (await this.fieldValue(label).innerText()).trim();
  }

  /** The payer's display name as shown on the detail header. */
  async getName(): Promise<string> {
    return (await this.byId('payer-detail-name').innerText()).trim();
  }

  /**
   * The version badge ("v1 · Published"). Its status is also exposed as
   * `data-tone` on the status badge, which is the language-independent signal.
   */
  versionBadge(): Locator {
    return this.byId('payer-detail-version-badge');
  }

  statusBadge(): Locator {
    return this.byId('payer-detail-status-badge');
  }

  // ---- Page actions (projected into the breadcrumb bar) ---------------------

  editButton(): Locator {
    return this.btn('payer-detail-edit-button');
  }

  deleteButton(): Locator {
    return this.btn('payer-detail-delete-button');
  }

  submitForApprovalButton(): Locator {
    return this.btn('payer-detail-submit-for-approval-button');
  }

  // ---- Linked Networks ------------------------------------------------------

  private networksTab(): Locator {
    return this.page.locator(buttonSelector(PAYER_DETAIL_TAB.networks)).first();
  }

  private assignNetworkButton(): Locator {
    return this.btn('payer-detail-networks-assign-button');
  }

  private networkRows(): Locator {
    return this.page.locator('tr[id^="payer-detail-networks-table-row-"]');
  }

  /**
   * Switches to the Linked Networks section. The section content mounts lazily,
   * so the click is retried until the Assign Network control is on screen.
   */
  async openLinkedNetworks(): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.networksTab().click();
      const ready = await this.assignNetworkButton()
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      if (ready) return;
    }
    await expect(this.assignNetworkButton()).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * How many networks the payer is currently linked to.
   *
   * Counted from the rows of the Linked Networks table rather than parsed out of
   * the tab's "(N)" label, so it no longer depends on the label's wording.
   */
  async linkedNetworkCount(): Promise<number> {
    await this.openLinkedNetworks();
    return this.networkRows().count();
  }

  /** Opens the Assign Network drawer from the Linked Networks section. */
  async openAssignNetwork(): Promise<AssignNetworkDrawer> {
    await this.assignNetworkButton().click();
    const drawer = new AssignNetworkDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /**
   * Links a network to the payer and returns the network chosen. The assignment
   * is only SUBMITTED here - a reviewer still has to approve it before the
   * dependency exists, exactly as the drawer's own note says.
   */
  async assignNetwork(networkName?: string): Promise<string> {
    await this.openLinkedNetworks();
    const drawer = await this.openAssignNetwork();
    const chosen = await drawer.selectNetwork(networkName);
    await drawer.assign();
    return chosen;
  }

  /**
   * Releases every network linked to this payer.
   *
   * One click per linked row - NOT a loop until the control disappears. Removing
   * a link is a maker-checker change like adding one, so the row and its
   * Unassign button stay on screen until a checker approves; looping would fire
   * the same request over and over.
   *
   * Cleanup needs this: a payer holding a network cannot be deleted, so without
   * releasing the link the test record survives forever AND the network stays
   * consumed, which drains the pool of assignable networks.
   */
  async unassignAllNetworks(): Promise<number> {
    await this.openLinkedNetworks();

    const rowIds = await this.networkRows().evaluateAll((rows) =>
      rows.map((row) => (row as HTMLElement).id),
    );
    let released = 0;
    for (const rowId of rowIds) {
      const unassign = this.page.locator(buttonSelector(`${rowId}-unassign`)).first();
      const present = await unassign
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      if (!present) continue;

      await unassign.click();
      // A confirmation may or may not appear; confirm it if it does. This WAITS
      // rather than sampling with isVisible(), which would answer before the
      // dialog had finished animating in and leave its mask blocking the next
      // row's Unassign click.
      const dialog = new ConfirmDialog(this.page);
      const confirmNeeded = await this.byId('pbm-dialog')
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      if (confirmNeeded) {
        await dialog.confirm().catch(() => undefined);
      }
      await this.waitForPageReady();
      released += 1;
    }
    if (released > 0) Logger.step(`Submitted removal of ${released} network link(s)`);
    return released;
  }

  async expectLinkedNetworkCount(expected: number): Promise<void> {
    await expect
      .poll(() => this.linkedNetworkCount(), { timeout: Timeouts.default })
      .toBe(expected);
  }

  // ---- Tab strip ------------------------------------------------------------

  /**
   * The tabs the screen offers, as their id suffixes, in left-to-right order.
   *
   * Read from the ids rather than the captions so the same assertion holds in
   * Arabic, and read in DOM order so "which tab is fifth" is answerable - which
   * one acceptance criterion asks about directly.
   */
  async getTabOrder(): Promise<string[]> {
    const prefix = 'payer-detail-tab-';
    const ids = await this.page
      .locator(`#${PAYER_DETAIL_HEADER.tabs} button[id^="${prefix}"]`)
      .evaluateAll((tabs) => tabs.map((tab) => (tab as HTMLElement).id));
    return ids.map((id) => id.slice(prefix.length));
  }

  /** Asserts every tab in the strip is enabled - none merely decorative. */
  async expectAllTabsEnabled(): Promise<void> {
    const tabs = this.page.locator(`#${PAYER_DETAIL_HEADER.tabs} button[id^="payer-detail-tab-"]`);
    const total = await tabs.count();
    expect(total, 'the detail screen must render a tab strip').toBeGreaterThan(0);
    for (let index = 0; index < total; index += 1) {
      const tab = tabs.nth(index);
      await expect(tab, `tab ${await tab.getAttribute('id')} must be enabled`).toBeEnabled({
        timeout: Timeouts.default,
      });
    }
  }

  /** The Version History tab - its own component, see PayerVersionHistoryTab. */
  versionHistory(): PayerVersionHistoryTab {
    return new PayerVersionHistoryTab(this.page);
  }

  // ---- Audit History tab ----------------------------------------------------

  private auditTab(): Locator {
    return this.page.locator(buttonSelector(PAYER_DETAIL_TAB.audit)).first();
  }

  private auditEntries(): Locator {
    return this.page.locator(`li[id^="${PAYER_AUDIT.rowPrefix}"]`);
  }

  /**
   * Switches to Audit History.
   *
   * This tab is a TIMELINE rather than a table, so readiness is the timeline
   * element - not a table that will never appear. Retried for the same reason
   * the networks tab is: the strip re-renders as the screen settles.
   */
  async openAuditHistory(): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.auditTab().click();
      const ready = await this.byId(PAYER_AUDIT.timeline)
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      if (ready) return;
    }
    await expect(this.byId(PAYER_AUDIT.timeline)).toBeVisible({ timeout: Timeouts.default });
  }

  /** The text of every audit timeline entry, in the order shown. */
  async getAuditEntryTexts(): Promise<string[]> {
    return (await this.auditEntries().allInnerTexts()).map((text) =>
      text.replace(/\s+/g, ' ').trim(),
    );
  }

  /**
   * Asserts the audit trail carries an entry matching `pattern`.
   *
   * Matched against the entries' text rather than a structured field because
   * the timeline exposes none: it has no `-cell-` ids, only one element per
   * event.
   */
  async expectAuditEntryMatching(pattern: RegExp, description: string): Promise<void> {
    await expect
      .poll(() => this.getAuditEntryTexts(), {
        timeout: Timeouts.default,
        message: `the audit trail should record ${description}`,
      })
      .toEqual(expect.arrayContaining([expect.stringMatching(pattern)]));
  }

  // ---- Localized display name ----------------------------------------------

  /**
   * The Arabic payer name as STORED, read from the Overview tab.
   *
   * Distinct from `getName()`, which returns whatever the header is currently
   * DISPLAYING. Having both is what lets a test tell a correct localization
   * apart from a fallback: if the header shows the English name while this
   * field holds an Arabic one, the UI chose the wrong name rather than falling
   * back for lack of one.
   */
  async getStoredArabicName(): Promise<string> {
    const field = this.byId(PAYER_DETAIL_HEADER.nameAr);
    if ((await field.count()) === 0) return '';
    return (await field.innerText()).trim();
  }

  /** Asserts the detail header displays exactly this name. */
  async expectDisplayName(expected: string): Promise<void> {
    await expect(this.byId(PAYER_DETAIL_HEADER.name)).toHaveText(expected, {
      timeout: Timeouts.default,
    });
  }

  /** The colour band the detail header's status badge declares. */
  async getStatusTone(): Promise<string> {
    return (await this.statusBadge().getAttribute('data-tone')) ?? '';
  }

  /** The version badge's text, e.g. "v1 · Published". */
  async getVersionLabel(): Promise<string> {
    return (await this.versionBadge().innerText()).trim();
  }

  /** The payer's record id, taken from the detail URL. */
  async getPayerId(): Promise<string> {
    const match = this.page.url().match(/payer-management\/([0-9a-fA-F-]{36})/);
    if (!match) {
      throw new Error(
        `[PayerDetailPage] Could not read a payer id from the URL "${this.page.url()}".`,
      );
    }
    return match[1];
  }
}
