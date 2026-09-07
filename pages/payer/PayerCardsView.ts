import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import {
  GLOBAL,
  PAYER_CARDS_CONTAINER,
  PAYER_CARD_FIELD,
  PAYER_CARD_PREFIX,
  buttonSelector,
  statusBadgeId,
  type PayerCardFieldKey,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * The cards view of the payer list.
 *
 * The rest of the framework works exclusively in Table view - ListPageBase
 * forces it before every row assertion, because cards live in a different id
 * namespace and cards view ignores the search box entirely. This component
 * exists for the one story that must prove a payer's name renders identically
 * in the LIST, on the CARD and in the DETAIL header, which cannot be shown
 * without reading a card.
 *
 * A card's ids are `payer-card-{payerId}-{field}`, and its actions carry a
 * `-button` suffix that row actions do not.
 */
export class PayerCardsView {
  constructor(private readonly page: Page) {}

  /** Switches the module to Cards view and waits for the cards to render. */
  async open(): Promise<void> {
    const toggle = this.page.locator(buttonSelector(GLOBAL.viewToggleCards)).first();
    await expect(toggle).toBeVisible({ timeout: Timeouts.default });
    if ((await toggle.getAttribute('aria-selected')) !== 'true') {
      Logger.step('Switching list to Cards view');
      await toggle.click();
    }
    await expect(this.container()).toBeVisible({ timeout: Timeouts.default });
    await expect(this.cards().first()).toBeVisible({ timeout: Timeouts.default });
  }

  container(): Locator {
    return this.page.locator(`#${PAYER_CARDS_CONTAINER}`);
  }

  /** Every card currently rendered, matched by its id prefix. */
  cards(): Locator {
    return this.page.locator(`article[id^="${PAYER_CARD_PREFIX}"]`);
  }

  /**
   * The card for a payer, located by the name it displays.
   *
   * Cards view does not honour the search box, so a card cannot be narrowed to
   * by searching - it is filtered out of what is already rendered, exactly as
   * ListPageBase locates a row.
   */
  private card(displayName: string): Locator {
    return this.cards().filter({ hasText: displayName }).first();
  }

  /** The payer id behind a card - the namespace its fields hang off. */
  private async cardId(displayName: string): Promise<string> {
    const card = this.card(displayName);
    await expect(card).toBeVisible({ timeout: Timeouts.default });
    const id = await card.getAttribute('id');
    if (!id) {
      throw new Error(`[PayerCardsView] Card for "${displayName}" carries no id attribute.`);
    }
    return id;
  }

  /** A card identified by the payer's record id, rather than by its text. */
  private cardById(payerId: string): Locator {
    return this.page.locator(`#${PAYER_CARD_PREFIX}${payerId}`);
  }

  private field(cardId: string, field: PayerCardFieldKey): Locator {
    return this.page.locator(`#${cardId}-${PAYER_CARD_FIELD[field]}`);
  }

  /** The name shown on a card, given the payer's record id. */
  async getTitleById(payerId: string): Promise<string> {
    const title = this.page.locator(
      `#${PAYER_CARD_PREFIX}${payerId}-${PAYER_CARD_FIELD.title}`,
    );
    await expect(title).toBeVisible({ timeout: Timeouts.default });
    return (await title.innerText()).trim();
  }

  /** Whether a card exists for the given payer record id. */
  async hasCardFor(payerId: string): Promise<boolean> {
    return this.cardById(payerId)
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /** A field value from the card of the payer with this record id. */
  async getFieldById(payerId: string, field: PayerCardFieldKey): Promise<string> {
    const value = this.field(`${PAYER_CARD_PREFIX}${payerId}`, field);
    await expect(value).toBeVisible({ timeout: Timeouts.default });
    return (await value.innerText()).trim();
  }

  /** The colour band a card's status badge declares. */
  async getStatusToneById(payerId: string): Promise<string> {
    const badge = this.page.locator(`#${statusBadgeId(`${PAYER_CARD_PREFIX}${payerId}`)}`);
    return (await badge.getAttribute('data-tone')) ?? '';
  }

  /** Every card title currently rendered, in render order. */
  async getVisibleTitles(): Promise<string[]> {
    const titles = this.page.locator(
      `h3[id^="${PAYER_CARD_PREFIX}"][id$="-${PAYER_CARD_FIELD.title}"]`,
    );
    return (await titles.allInnerTexts()).map((text) => text.trim());
  }

  /** Asserts the card for this payer shows the expected name. */
  async expectTitle(payerId: string, expected: string): Promise<void> {
    await expect(
      this.page.locator(`#${PAYER_CARD_PREFIX}${payerId}-${PAYER_CARD_FIELD.title}`),
    ).toHaveText(expected, { timeout: Timeouts.default });
  }

  /** Opens a card's View action, by the payer's record id. */
  async view(payerId: string): Promise<void> {
    await this.page
      .locator(buttonSelector(`${PAYER_CARD_PREFIX}${payerId}-view-button`))
      .first()
      .click();
  }
}
