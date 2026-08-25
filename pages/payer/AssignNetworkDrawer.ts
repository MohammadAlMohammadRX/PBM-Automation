import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * The "Assign Network" side drawer, opened from the Linked Networks section of a
 * payer's detail page.
 *
 * Verified against the live app:
 *   div.pbm-form-drawer  (PrimeNG p-drawer, right)
 *     "Assign Network"
 *     Networks  ->  a single combobox, placeholder "Select networks to assign"
 *     Cancel | Assign
 *
 * The drawer itself states that "Assigning or removing a network is submitted
 * for approval and takes effect once a reviewer approves it", so assigning is a
 * maker-checker operation like every other change to a live payer.
 */
export class AssignNetworkDrawer {
  constructor(private readonly page: Page) {}

  /**
   * Scoped by the drawer's own title, not by position: the payer module keeps
   * other `.pbm-form-drawer` shells in the DOM, so "the first visible drawer"
   * can resolve to the wrong one and its fields report as hidden.
   */
  private panel(): Locator {
    return this.page
      .locator('.pbm-form-drawer')
      .filter({ hasText: 'Assign Network' })
      .filter({ visible: true })
      .first();
  }

  /**
   * The clickable Networks control. PrimeNG puts role="combobox" on a HIDDEN
   * input and renders the interactive element as a styled div, so the widget
   * class is targeted first and the role is only a fallback.
   */
  private networksControl(): Locator {
    return this.panel()
      .locator('.p-multiselect, .p-select, .p-dropdown, [role="combobox"]')
      .filter({ visible: true })
      .first();
  }

  async waitForOpen(): Promise<void> {
    await expect(this.panel()).toBeVisible({ timeout: Timeouts.default });
    // Wait on the Assign button: it is reliably visible, unlike the multiselect's
    // hidden inner input.
    await expect(this.panel().getByRole('button', { name: 'Assign', exact: true })).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /**
   * Picks a network from the Networks list and returns the option chosen, so the
   * caller can assert on the link afterwards. Selects the first available option
   * unless a specific name is asked for - which network is linked does not
   * matter to the dependency tests, only that one is.
   */
  async selectNetwork(networkName?: string): Promise<string> {
    await this.networksControl().click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });

    // PrimeNG renders an empty list as a single "No results found" option. Taking
    // it would leave nothing selected, Assign disabled, and the click would time
    // out 15 seconds later with no clue why - so fail here, with the reason.
    const first = (await options.first().innerText()).replace(/\s+/g, ' ').trim();
    expect(
      first,
      'No network is available to assign. Each dependency test links a network to a payer that then '
        + 'cannot be deleted, so the link is never released and the pool of assignable networks runs '
        + 'dry. Free one in Network Management, or unassign it from the payer holding it.',
    ).not.toMatch(/No results found/i);

    const target = networkName
      ? options.filter({ hasText: networkName }).first()
      : options.first();
    const chosen = (await target.innerText()).replace(/\s+/g, ' ').trim();
    await target.click();

    // The control is a multi-select, so the overlay stays open after a pick.
    // Dismiss it by clicking the drawer's own title: Escape closes the DRAWER
    // itself once the overlay has gone, which loses the whole form.
    await this.panel().getByText('Assign Network').first().click();
    await this.page
      .getByRole('option')
      .first()
      .waitFor({ state: 'hidden', timeout: Timeouts.short })
      .catch(() => undefined);

    // Assign only enables once a real selection is held - proof the pick landed.
    await expect(
      this.panel().getByRole('button', { name: 'Assign', exact: true }),
    ).toBeEnabled({ timeout: Timeouts.default });

    Logger.step(`Selected network "${chosen}" to assign`);
    return chosen;
  }

  async assign(): Promise<void> {
    Logger.step('Submitting the network assignment');
    await this.panel().getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(this.panel()).toBeHidden({ timeout: Timeouts.default });
  }

  async cancel(): Promise<void> {
    await this.panel().getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(this.panel()).toBeHidden({ timeout: Timeouts.short });
  }
}
