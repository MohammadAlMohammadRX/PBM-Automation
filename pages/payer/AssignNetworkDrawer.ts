import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { buttonSelector } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * The "Assign Network" side drawer, opened from the Linked Networks section of a
 * payer's detail page.
 *
 * The drawer now has its own id (`payer-detail-assign-drawer`), which removes
 * the previous need to disambiguate it by title text: the payer module keeps
 * several form-drawer shells mounted at once, so "the first visible drawer"
 * could resolve to the wrong one and report its fields as hidden.
 *
 * The drawer itself states that "Assigning or removing a network is submitted
 * for approval and takes effect once a reviewer approves it", so assigning is a
 * maker-checker operation like every other change to a live payer.
 */
export class AssignNetworkDrawer {
  private readonly prefix = 'payer-detail-assign-drawer';

  constructor(private readonly page: Page) {}

  private title(): Locator {
    return this.page.locator(`#${this.prefix}-title`);
  }

  /**
   * The Networks multi-select.
   *
   * `#{prefix}-networks-multiselect` is where the id lands, but PrimeNG puts it
   * on a HIDDEN input and renders the interactive surface as a styled sibling -
   * so the id identifies the widget while the click has to go to the visible
   * `.p-multiselect` wrapper that contains it. Verified live: the id is on an
   * `<input>` that cannot be clicked.
   */
  private networksControl(): Locator {
    // Anchored ON the id: PrimeNG puts the id on a hidden <input>, so the click
    // has to land on the widget WRAPPING it. Walking up from the id is exact -
    // the previous form ("any multiselect inside the drawer") would silently
    // pick a different control if the drawer ever gained one.
    return this.page
      .locator(`#${this.prefix}-networks-multiselect`)
      .locator(
        'xpath=ancestor::*[contains(@class,"p-multiselect") or contains(@class,"p-select")][1]',
      )
      .first();
  }

  /**
   * The drawer's primary action. Note the id is `-confirm-button`, not
   * `-assign-button` - the shared form-drawer names its primary action
   * generically regardless of the verb shown on it.
   */
  private assignButton(): Locator {
    return this.page.locator(buttonSelector(`${this.prefix}-confirm-button`)).first();
  }

  private cancelButton(): Locator {
    return this.page.locator(buttonSelector(`${this.prefix}-cancel-button`)).first();
  }

  async waitForOpen(): Promise<void> {
    // The drawer host is zero-size while closed, so assert on its title.
    await expect(this.title()).toBeVisible({ timeout: Timeouts.default });
    // The Assign button is reliably visible, unlike the multiselect's hidden
    // inner input.
    await expect(this.assignButton()).toBeVisible({ timeout: Timeouts.default });
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
    // out later with no clue why - so fail here, with the reason.
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
    await this.title().click();
    await this.page
      .getByRole('option')
      .first()
      .waitFor({ state: 'hidden', timeout: Timeouts.short })
      .catch(() => undefined);

    // Assign only enables once a real selection is held - proof the pick landed.
    await expect(this.assignButton()).toBeEnabled({ timeout: Timeouts.default });

    Logger.step(`Selected network "${chosen}" to assign`);
    return chosen;
  }

  async assign(): Promise<void> {
    Logger.step('Submitting the network assignment');
    await this.assignButton().click();
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  async cancel(): Promise<void> {
    await this.cancelButton().click();
    await expect(this.title()).toBeHidden({ timeout: Timeouts.short });
  }
}
