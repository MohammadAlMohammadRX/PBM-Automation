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
/**
 * How many times a single option is clicked before the pick is called a
 * failure. Three: one ordinary click, plus room for two lost to the overlay
 * re-rendering. Higher would only lengthen a failure that is already decided.
 */
const OPTION_CLICK_ATTEMPTS = 3;

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
  /**
   * Drives an option to a wanted state - picked or cleared - and confirms it.
   *
   * THE OVERLAY FIGHTS A PLAIN CLICK. It repositions itself once its content is
   * measured, and PrimeNG re-creates the option nodes when it does: VERIFIED
   * live, Playwright reported "element is not stable" and then "element was
   * detached from the DOM" against an option it had already resolved, and the
   * case carried on with nothing selected. Waiting for the list to settle does
   * not help - the text is final while the nodes beneath it are replaced - and
   * no click timeout outlasts an element that ceases to exist.
   *
   * SO THE CLICK IS JUDGED BY ITS OUTCOME, and clicked AT MOST ONCE PER
   * ATTEMPT. The control is a TOGGLE: a retry loop that re-clicked whenever the
   * state read false would unpick what it had just picked and oscillate until
   * the budget ran out. Each attempt clicks once, waits for the state to
   * register, and tries again only if the click itself was lost to a re-render.
   *
   * `force` skips the stability wait that cannot be satisfied; the caller has
   * already asserted the option is visible.
   */
  private async setOptionSelected(option: Locator, label: string, wanted: boolean): Promise<void> {
    const isSelected = async (): Promise<boolean> =>
      (await option.getAttribute('aria-checked').catch(() => null)) === 'true'
      || (await option.getAttribute('data-p-selected').catch(() => null)) === 'true';

    for (let attempt = 1; attempt <= OPTION_CLICK_ATTEMPTS; attempt += 1) {
      if ((await isSelected()) === wanted) return;
      const landed = await option
        .click({ timeout: Timeouts.short, force: true })
        .then(() => true)
        .catch(() => false);
      // The click reached no node: re-resolve and try again WITHOUT counting it
      // as a toggle that would have to be undone.
      if (!landed) continue;
      const registered = await expect
        .poll(isSelected, { timeout: Timeouts.short, intervals: [100, 200, 400] })
        .toBe(wanted)
        .then(() => true)
        .catch(() => false);
      if (registered) return;
    }

    expect(
      await isSelected(),
      `"${label}" should ${wanted ? 'register as selected' : 'clear'} once clicked`,
    ).toBe(wanted);
  }

  /**
   * Waits for the option list to STOP re-rendering.
   *
   * The overlay paints an initial list and replaces it when the request for
   * assignable networks lands. Clicking in between loses the click: VERIFIED
   * live, Playwright reported "element is not stable" and then "element was
   * detached from the DOM" against an option it had already resolved, and the
   * case failed with nothing selected. A longer click timeout would not help -
   * the element being waited on ceases to exist - so the list is read until two
   * consecutive reads agree, and only then is an option clicked.
   */
  private async waitForOptionsSettled(): Promise<void> {
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    let previous = '';
    await expect
      .poll(
        async () => {
          const current = (await options.allInnerTexts()).join('|').replace(/s+/g, ' ');
          const settled = current !== '' && current === previous;
          previous = current;
          return settled;
        },
        {
          timeout: Timeouts.default,
          intervals: [150, 150, 300, 500],
          message: 'the network options should stop re-rendering before one is clicked',
        },
      )
      .toBe(true);
  }

  async selectNetwork(networkName?: string): Promise<string> {
    await this.networksControl().click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await this.waitForOptionsSettled();

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
    await this.setOptionSelected(target, chosen, true);

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

  /**
   * Every network the drawer currently offers, or an empty list when it offers
   * none.
   *
   * `selectNetwork` fails loudly on an empty pool, which is right for a case
   * that needs to assign one. This ASKS instead, so a fixture can find out
   * whether the pool needs refilling without taking a failure - and so a case
   * about the pool's CONTENTS (which networks are eligible) can assert on them.
   *
   * PrimeNG renders an empty list as a single "No results found" option, which
   * is why that string is filtered out rather than counted as a network.
   */
  async listAvailableNetworks(): Promise<string[]> {
    await this.networksControl().click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await this.waitForOptionsSettled();
    const labels = (await options.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
    await this.title().click();
    await this.page
      .getByRole('option')
      .first()
      .waitFor({ state: 'hidden', timeout: Timeouts.short })
      .catch(() => undefined);
    return labels.filter((label) => !/No results found/i.test(label));
  }

  /**
   * Selects several networks in one submission.
   *
   * The control is a MULTI-select, and the assignment story turns on what the
   * application does with a combined selection - an already-linked network
   * alongside a new one, or a selection that nets out to no change at all. A
   * one-at-a-time helper cannot express either.
   */
  async selectNetworks(networkNames: readonly string[]): Promise<void> {
    await this.networksControl().click();
    await this.waitForOptionsSettled();
    for (const name of networkNames) {
      const option = this.page
        .getByRole('option')
        .filter({ visible: true })
        .filter({ hasText: name })
        .first();
      await expect(option, `"${name}" should be offered by the drawer`).toBeVisible({
        timeout: Timeouts.default,
      });
      await this.setOptionSelected(option, name, true);
    }
    await this.title().click();
    await this.page
      .getByRole('option')
      .first()
      .waitFor({ state: 'hidden', timeout: Timeouts.short })
      .catch(() => undefined);
  }

  /**
   * Clears networks from the current selection.
   *
   * The control is a multi-select, so the interface UNPICKS by clicking a
   * chosen option a second time - and for a while that was expressed by calling
   * `selectNetworks` twice. It stopped working the moment picking became
   * idempotent (which it had to, so a lost click could be retried), because the
   * second call then correctly did nothing. The two intentions are now separate
   * methods, which is also what the reverted-selection case actually means.
   */
  async deselectNetworks(networkNames: readonly string[]): Promise<void> {
    await this.networksControl().click();
    await this.waitForOptionsSettled();
    for (const name of networkNames) {
      const option = this.page
        .getByRole('option')
        .filter({ visible: true })
        .filter({ hasText: name })
        .first();
      await expect(option, `"${name}" should still be listed so it can be unpicked`).toBeVisible({
        timeout: Timeouts.default,
      });
      await this.setOptionSelected(option, name, false);
    }
    await this.title().click();
    await this.page
      .getByRole('option')
      .first()
      .waitFor({ state: 'hidden', timeout: Timeouts.short })
      .catch(() => undefined);
  }

  /**
   * Every control id the drawer carries, for checklist cases that ask what the
   * drawer OFFERS - a change-reason field, say - rather than what one control
   * does. Returned as suffixes after the drawer prefix.
   *
   * locator-exception: gathered by the drawer's id prefix - an id-anchored
   * query, since the drawer's controls share it.
   */
  async getControlIds(): Promise<string[]> {
    await this.waitForOpen();
    const ids = await this.page
      .locator(`[id^="${this.prefix}-"]`)
      .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).id));
    return ids.map((id) => id.slice(this.prefix.length + 1));
  }

  /** Whether the drawer's primary action can be used right now. */
  async isSubmitEnabled(): Promise<boolean> {
    return this.assignButton()
      .isEnabled({ timeout: Timeouts.short })
      .catch(() => false);
  }

  /**
   * Confirms the drawer, which STAGES the assignment as a draft.
   *
   * It does NOT reach the approval queue on its own. VERIFIED live: the
   * linked-network row reads "Draft Assignment", the payer row reads
   * "v1 · Draft", and the list still offers Send for Approval. Reaching a
   * reviewer takes a second, explicit step - `PayerManagementPage
   * .submitStagedChange` - exactly as it does for an edit. Callers that
   * expected one step waited on a queue the change had never been sent to.
   */
  async assign(): Promise<void> {
    Logger.step('Staging the network assignment');
    await this.assignButton().click();
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  async cancel(): Promise<void> {
    await this.cancelButton().click();
    await expect(this.title()).toBeHidden({ timeout: Timeouts.short });
  }
}
