import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  PAYER_AUDIT,
  PAYER_DETAIL_HEADER,
  PAYER_DETAIL_TAB,
  buttonSelector,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/** One timeline entry, parsed from its single line of text. */
export interface AuditEntry {
  action: string;
  /** As rendered, e.g. "12/09/2026 03:45 PM". */
  timestamp: string;
  user: string;
  raw: string;
}

/** One changed field in an entry's detail drawer. */
export interface AuditDiffRow {
  key: string;
  field: string;
  before: string;
  after: string;
}

/** What an entry's detail drawer shows. */
export interface AuditEntryDetails {
  summary: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: string;
  diff: AuditDiffRow[];
}

/** The panel's placeholder while the trail query is in flight. */
const LOADING_PATTERN = /loading\.{3}|loading…/i;

/** "Status Change 12/09/2026 03:45 PM By: CareConnect View Details" */
const ENTRY_PATTERN =
  /^(?<action>.+?)\s+(?<timestamp>\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s+(?:AM|PM))\s+By:\s+(?<user>.+?)(?:\s+View Details)?$/i;

/**
 * The payer detail screen's Audit History tab - a filtered TIMELINE, not a
 * table.
 *
 * VERIFIED live: entries are `<li>`s with one line of text and a View Details
 * action that opens a drawer holding a field/before/after diff; the Action
 * Type select and the date-range picker both re-query the server
 * (`GetPayerAuditTrail` with `actionType` and `fromUtc`/`toUtc`); an empty
 * result renders "No audit history yet." with no id. Typing into the date
 * input applies nothing - ranges are chosen on the calendar.
 */
export class PayerAuditHistoryTab {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private tab(): Locator {
    return this.page.locator(buttonSelector(PAYER_DETAIL_TAB.audit)).first();
  }

  private entries(): Locator {
    return this.page.locator(`li[id^="${PAYER_AUDIT.rowPrefix}"]`);
  }

  /** The Action Type control - PrimeNG puts the id on a hidden element inside the widget. */
  private actionControl(): Locator {
    return this.byId(PAYER_AUDIT.actionSelect)
      .locator('xpath=ancestor-or-self::*[contains(@class,"p-select")][1]')
      .first();
  }

  /**
   * Switches to the tab; ready when its filter bar is on screen AND the trail
   * has finished loading.
   *
   * VERIFIED: the filter bar renders first, above a "Loading..." line, and the
   * entries arrive with the trail query a moment later. Reading the timeline
   * as soon as the filters showed returned zero entries for a payer with
   * three, so every reader waits for the panel to settle.
   */
  async open(): Promise<void> {
    const ready = this.byId(PAYER_AUDIT.filters);
    let shown = false;
    for (let attempt = 1; attempt <= 3 && !shown; attempt += 1) {
      await this.tab().click();
      shown = await ready
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
    }
    await expect(ready, 'the Audit History tab should open').toBeVisible({ timeout: Timeouts.default });
    await this.waitForSettled();
  }

  /** Waits until the panel is no longer reporting that it is loading. */
  private async waitForSettled(): Promise<void> {
    await expect
      .poll(() => this.getPanelText(), {
        message: 'the audit trail should finish loading',
        timeout: Timeouts.default,
      })
      .not.toMatch(LOADING_PATTERN);
  }

  async getEntryCount(): Promise<number> {
    return this.entries().count();
  }

  /** Every entry, parsed; an unparseable line keeps its raw text with blank fields. */
  async getEntries(): Promise<AuditEntry[]> {
    const texts = (await this.entries().allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    return texts.map((raw) => {
      const match = ENTRY_PATTERN.exec(raw);
      return {
        action: match?.groups?.action?.trim() ?? '',
        timestamp: match?.groups?.timestamp?.trim() ?? '',
        user: match?.groups?.user?.trim() ?? '',
        raw,
      };
    });
  }

  /** The action ids an entry offers (suffixes after the row id), e.g. ["view-details"]. */
  async getEntryActionIds(index: number): Promise<string[]> {
    const rowId = await this.entries().nth(index).getAttribute('id'); // locator-exception: index into the timeline the caller already read
    const ids = await this.page
      .locator(`[id^="${rowId}-"]`)
      .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).id));
    return ids.map((id) => id.slice(`${rowId}-`.length));
  }

  /** The Action Type options the filter offers, as labelled. */
  async getActionOptions(): Promise<string[]> {
    await this.actionControl().click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    const labels = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  /**
   * Waits for the next trail query to be ANSWERED and returns what it asked,
   * or gives up quietly (a filter may be client-side).
   *
   * The response, not the request: VERIFIED that reading the timeline the
   * moment the query was sent returned the previous filter's entries - a
   * "Create" filter listing a Status Change - because the rows are replaced
   * only once the answer lands.
   */
  private trailQuery(): Promise<string | null> {
    return this.page
      .waitForResponse(
        (response) => response.url().includes(ApiEndpoints.payerAuditTrail) && response.request().method() !== 'GET',
        { timeout: Timeouts.short },
      )
      .then((response) => response.request().postData() ?? '')
      .catch(() => null);
  }

  /** Applies an Action Type filter and returns the query it sent (or null). */
  async selectAction(label: string): Promise<string | null> {
    Logger.step(`Filtering the audit trail by action "${label}"`);
    const waiting = this.trailQuery();
    await this.actionControl().click();
    const option = this.page.getByRole('option', { name: label, exact: true }).filter({ visible: true }).first();
    await expect(option, `the action filter should offer "${label}"`).toBeVisible({ timeout: Timeouts.default });
    await option.click();
    const query = await waiting;
    await this.waitForSettled();
    return query;
  }

  /** PrimeNG's day-cell key for a date: zero-based month. */
  private static dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  /**
   * Chooses a date range on the calendar and returns the query it sent.
   *
   * Both days must be in the month the calendar opens on (the current one) -
   * the stories only need "today" and "yesterday".
   */
  async setDateRange(from: Date, to: Date): Promise<string | null> {
    Logger.step(`Filtering the audit trail to ${from.toDateString()} - ${to.toDateString()}`);
    await this.byId(PAYER_AUDIT.dateRangeInput).click();
    const fromCell = this.page.locator(`[${PAYER_AUDIT.calendarDayAttribute}="${PayerAuditHistoryTab.dayKey(from)}"]`).first();
    const toCell = this.page.locator(`[${PAYER_AUDIT.calendarDayAttribute}="${PayerAuditHistoryTab.dayKey(to)}"]`).first();
    await expect(fromCell, 'the calendar should show the start day').toBeVisible({ timeout: Timeouts.default });
    await fromCell.click();
    const waiting = this.trailQuery();
    await toCell.click();
    const query = await waiting;
    await this.page.keyboard.press('Escape');
    await this.waitForSettled();
    return query;
  }

  /** Types into the date input and returns the query it sent - VERIFIED: none. */
  async typeDateRange(text: string): Promise<string | null> {
    const input = this.byId(PAYER_AUDIT.dateRangeInput);
    await input.click();
    const waiting = this.trailQuery();
    await input.fill(text);
    await this.page.keyboard.press('Enter');
    return waiting;
  }

  async getDateRangeValue(): Promise<string> {
    return (await this.byId(PAYER_AUDIT.dateRangeInput).inputValue()).trim();
  }

  /** Clears the date range and returns the query it sent. */
  async clearDateRange(): Promise<string | null> {
    const input = this.byId(PAYER_AUDIT.dateRangeInput);
    await input.click();
    await input.press('Control+a');
    const waiting = this.trailQuery();
    await input.press('Backspace');
    await this.page.keyboard.press('Escape');
    const query = await waiting;
    await this.waitForSettled();
    return query;
  }

  /**
   * The whole tab panel's text - the only way to read the empty-state line,
   * which carries no id.
   *
   * locator-exception: the panel follows the id'd tab strip and has no id.
   */
  async getPanelText(): Promise<string> {
    const texts = await this.byId(PAYER_DETAIL_HEADER.tabs)
      .locator('xpath=following-sibling::*')
      .allInnerTexts()
      .catch(() => [] as string[]);
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Opens an entry's drawer and waits for its body to settle, reading nothing
   * from it.
   *
   * Split out of `openEntryDetails` because the checklist case only asks what
   * the drawer OFFERS, not what it says: building the diff costs one
   * auto-waiting read per header field and three per changed field, and for an
   * entry whose body never settles those reads each burn their full timeout -
   * enough to exhaust even the extended budget and time the case out with no
   * assertion ever reached.
   */
  async openEntryDetailsDrawer(index: number): Promise<void> {
    const rowId = await this.entries().nth(index).getAttribute('id'); // locator-exception: index into the timeline the caller already read
    await this.page.locator(buttonSelector(`${rowId}-${PAYER_AUDIT.viewDetailsSuffix}`)).first().click();
    await expect(this.byId(PAYER_AUDIT.detailDrawerTitle), 'the audit entry drawer should open').toBeVisible({
      timeout: Timeouts.default,
    });
    // The drawer opens on its header and fetches the diff afterwards, showing
    // "Loading..." meanwhile - VERIFIED a read at that moment found no rows
    // for an entry that has them. Wait briefly for the body to settle; a body
    // that never does (VERIFIED for some Create entries) is left to the
    // caller's own assertion to report, rather than costing every entry the
    // full budget and timing the case out.
    await expect
      .poll(async () => (await this.byId(PAYER_AUDIT.detailDrawer).innerText().catch(() => '')).replace(/\s+/g, ' '), {
        timeout: Timeouts.short,
      })
      .not.toMatch(LOADING_PATTERN)
      .catch(() => undefined);
  }

  /** Opens an entry's detail drawer and reads everything it says. */
  async openEntryDetails(index: number): Promise<AuditEntryDetails> {
    await this.openEntryDetailsDrawer(index);
    const text = async (id: string): Promise<string> =>
      (await this.byId(id).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const keys = await this.page
      .locator(`[id^="${PAYER_AUDIT.detailRowPrefix}"][id$="-field"]`)
      .evaluateAll((elements, prefix) =>
        elements.map((element) => (element as HTMLElement).id.slice(prefix.length).replace(/-field$/, '')),
      PAYER_AUDIT.detailRowPrefix);
    const diff: AuditDiffRow[] = [];
    for (const key of keys) {
      diff.push({
        key,
        field: await text(`${PAYER_AUDIT.detailRowPrefix}${key}-field`),
        before: await text(`${PAYER_AUDIT.detailRowPrefix}${key}-before`),
        after: await text(`${PAYER_AUDIT.detailRowPrefix}${key}-after`),
      });
    }
    return {
      summary: await text(PAYER_AUDIT.detailSummary),
      action: await text(PAYER_AUDIT.detailActionChip),
      entityType: await text(PAYER_AUDIT.detailEntityType),
      entityId: await text(PAYER_AUDIT.detailEntityId),
      meta: await text(PAYER_AUDIT.detailMeta),
      diff,
    };
  }

  /**
   * The interactive CONTROLS the entry drawer carries, as id suffixes.
   *
   * Buttons, links and fields - not every id beneath the drawer. The immutable
   * -entry case asks whether the drawer offers any way to CHANGE the entry and
   * matches the answer against /edit|delete|remove|save/, so returning data ids
   * too made it report "the drawer must not offer edit/delete; it carries:
   * row-deletedby, row-deletedon" - the Deleted By and Deleted On FIELDS of a
   * deletion entry, which are the record OF a deletion rather than a control
   * that performs one. VERIFIED live: the drawer holds no such control.
   *
   * locator-exception: gathered by the drawer id prefix - an id-anchored query
   * - then narrowed to the elements a user can actually operate.
   */
  async getDetailDrawerControlIds(): Promise<string[]> {
    const ids = await this.page
      .locator(`[id^="${PAYER_AUDIT.detailDrawer}-"]`)
      .evaluateAll((elements) => elements
        .filter((element) => element.matches('button, a, input, select, textarea, [role="button"]'))
        .map((element) => (element as HTMLElement).id));
    return ids.map((id) => id.slice(`${PAYER_AUDIT.detailDrawer}-`.length));
  }

  async closeDetails(): Promise<void> {
    await this.page.locator(buttonSelector(PAYER_AUDIT.detailDrawerClose)).first().click();
    await expect(this.byId(PAYER_AUDIT.detailDrawerTitle)).toBeHidden({ timeout: Timeouts.default });
  }
}
