import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AssignNetworkDrawer } from './AssignNetworkDrawer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Timeouts } from '../../constants/Timeouts';
import {
  PAYER_DETAIL_FIELD,
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
}
