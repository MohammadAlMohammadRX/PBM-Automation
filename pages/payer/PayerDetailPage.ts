import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AssignNetworkDrawer } from './AssignNetworkDrawer';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * Read-only payer detail view (`/payer-management/{id}`), reached via the "View"
 * row action. Verified structure:
 *   div.payer-detail__field
 *     span.payer-detail__field-label   e.g. "Created At"
 *     span.payer-detail__field-value   e.g. "27/07/2026 01:06 PM"
 */
export class PayerDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private field(label: string): Locator {
    return this.page
      .locator('div.payer-detail__field')
      .filter({ has: this.page.locator('span.payer-detail__field-label', { hasText: label }) });
  }

  private fieldValue(label: string): Locator {
    return this.field(label).locator('span.payer-detail__field-value');
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.page.locator('.payer-detail__field').first()).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /** Returns the displayed value of a labelled detail field (e.g. "Created At"). */
  async getFieldValue(label: string): Promise<string> {
    return (await this.fieldValue(label).innerText()).trim();
  }

  // ---- Linked Networks ------------------------------------------------------
  // The detail page groups content behind section buttons: Overview,
  // "Linked Networks (N)", "Linked Policies (N)", Version History, Audit
  // History. The count in the label is the payer's live dependency count, which
  // is what makes it usable as a precondition check.

  private linkedNetworksTab(): Locator {
    return this.page.getByRole('button', { name: /Linked Networks/i }).first();
  }

  private assignNetworkButton(): Locator {
    // Regex, not an exact name: the control renders with surrounding whitespace
    // and an icon, and it appears a beat after the section is switched to.
    return this.page.getByRole('button', { name: /Assign Network/i }).first();
  }

  /**
   * Switches to the Linked Networks section. The section content mounts lazily,
   * so the click is retried until the Assign Network control is on screen.
   */
  async openLinkedNetworks(): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.linkedNetworksTab().click();
      const ready = await this.assignNetworkButton()
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      if (ready) return;
    }
    await expect(this.assignNetworkButton()).toBeVisible({ timeout: Timeouts.default });
  }

  /** How many networks the payer is currently linked to, read from "(N)". */
  async linkedNetworkCount(): Promise<number> {
    const label = await this.linkedNetworksTab().innerText();
    const match = label.match(/\((\d+)\)/);
    return match ? Number(match[1]) : 0;
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
   * The Linked Networks table exposes an "Unassign" action per row. Removing a
   * link is a maker-checker change like assigning one, so the caller still has
   * to send the payer for approval and have it approved before the dependency
   * is actually gone.
   *
   * Cleanup needs this: a payer holding a network cannot be deleted, so without
   * releasing the link the test record survives forever AND the network stays
   * consumed, which drains the pool of assignable networks.
   */
  async unassignAllNetworks(): Promise<number> {
    await this.openLinkedNetworks();

    // One click per linked row - NOT a loop until the control disappears. The
    // link is only submitted for removal, so the row and its Unassign button
    // stay on screen until a checker approves; looping would fire the same
    // request over and over.
    const rows = this.page.locator('table tbody tr');
    const total = await rows.count();
    let released = 0;
    for (let index = 0; index < total; index += 1) {
      // Loose match, not anchored: the control renders with an icon and padding,
      // so its accessible name is not exactly "Unassign".
      const unassign = rows.nth(index).getByRole('button', { name: /Unassign/i }).first();
      const present = await unassign
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      if (!present) continue;

      await unassign.click();
      // A confirmation may or may not appear; accept whichever affirmative it offers.
      await this.page
        .locator('.p-dialog, .pbm-dialog, [role="dialog"]')
        .filter({ visible: true })
        .first()
        .getByRole('button', { name: /^(Unassign|Yes|Confirm|OK)$/i })
        .first()
        .click({ timeout: Timeouts.short })
        .catch(() => undefined);
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
