import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { TOAST } from '../../constants/ElementIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { MEMBER_COB, MEMBER_DETAIL } from '../../constants/member/memberIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { readCobTimeline, type CobEntry } from '../../utils/MemberProvisioning';

/** One row of the current ordering (or History) as shown. */
export interface CobRowView {
  /** "Primary" | "Secondary" | "Tertiary" | "Order n". */
  order: string;
  /** The row's text: "<policy name> · <policy number>", "<payer> · <from> — <to>", the benefit line. */
  text: string;
  /** "Deductible: SAR 100.00 · Coinsurance: 20% · OOPM: SAR 500.00 · Sublimit: SAR 1,000.00". */
  benefit: string;
}

/** What a drop sent and answered. */
export interface CobReorderAnswer {
  /** The ReorderMemberCoverage body (`{ memberId, policyIds }`), null when nothing was sent (a drop on the same place, one policy, no right). */
  request: { memberId: string; policyIds: string[] } | null;
  status: number;
  text: string;
  messages: string[];
}

/**
 * The Coverage Ordering (COB) tab (`pbm-cob-timeline` under
 * `member-detail-cob-timeline`, verified live 2026-11-05). Needs
 * Cob.GetMemberCobTimeline (the tab is hidden without it); reordering needs
 * Cob.ReorderMemberCoverage. "Coverage Ordering", CURRENT ORDERING with the hint
 * "Drag the policies into the order they should pay: the first is primary."
 * (only with more than one policy), one row per policy: order badge (Primary /
 * Secondary / Tertiary / Order n), "<policy> · <POL-number>", "<payer> ·
 * <effective from> — <to>" (the POLICY's dates, DD/MM/YYYY HH:mm), the benefit
 * line; History lists earlier orderings. A drop sends PUT
 * ReorderMemberCoverage `{ memberId, policyIds }` at once (no approval), toast
 * "Coverage ordering / Coverage priority updated.", and reloads the timeline
 * AND the dashboard's policies. Rows' ids repeat (every entry's id is the
 * empty GUID until the first reorder), so rows are reached by position.
 * Empty: "This member is not enrolled in any policy yet, so there is nothing to
 * rank." + "No coverage ordering recorded for this member.".
 */
export class MemberCobTab {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  /** locator-exception: entry ids repeat (empty-GUID entry ids) - every handle / badge is reached by the id SUFFIX and position. */
  private handles(): Locator {
    return this.page.locator(`[id^="${MEMBER_COB.prefix}-entry-"][id$="-${MEMBER_COB.entry.dragHandle}"]`);
  }

  private badges(): Locator {
    return this.page.locator(`[id^="${MEMBER_COB.prefix}-entry-"][id$="-${MEMBER_COB.entry.orderBadge}"]`);
  }

  async isOffered(): Promise<boolean> {
    return this.byId(MEMBER_DETAIL.tab.cob).isVisible().catch(() => false);
  }

  /** Clicks the tab and waits for GetMemberCobTimeline. */
  async open(): Promise<CobEntry[]> {
    Logger.step("Opening the member's Coverage Ordering (COB) tab");
    const answered = this.page.waitForResponse((r) => r.url().includes(ApiEndpoints.cobTimeline), { timeout: Timeouts.default }).catch(() => null);
    await this.byId(MEMBER_DETAIL.tab.cob).click();
    const res = await answered;
    await this.page.waitForTimeout(300);
    try {
      return ((await res?.json()) as { payload?: { entries?: CobEntry[] } } | undefined)?.payload?.entries ?? [];
    } catch {
      return [];
    }
  }

  async getText(): Promise<string> {
    return (await this.byId(MEMBER_DETAIL.root).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The empty texts shown ("This member is not enrolled ...", "No coverage ordering recorded ..."), '' when rows show. */
  async getEmptyText(): Promise<string> {
    return (await this.byId(MEMBER_COB.empty).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The drag hint ("Drag the policies into the order they should pay: the first is primary."), '' when not offered. */
  async getReorderHint(): Promise<string> {
    return (await this.byId(MEMBER_COB.reorderHint).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  /** How many drag handles render (0 = dragging not offered). */
  async countHandles(): Promise<number> {
    return this.handles().count();
  }

  /** The current ordering's rows, top first (rows with a drag handle or an order badge). */
  async readRows(): Promise<CobRowView[]> {
    const count = await this.badges().count();
    const out: CobRowView[] = [];
    for (let i = 0; i < count; i += 1) {
      const badge = this.badges().nth(i);
      const row = badge.locator('xpath=ancestor::*[contains(@class,"cob-timeline__row")][1]'); // locator-exception: the row element carries no id; it is the badge's row.
      out.push({
        order: (await badge.innerText()).trim(),
        text: (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
        benefit: (await row.locator(`[id$="-${MEMBER_COB.entry.benefit}"]`).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
      });
    }
    return out;
  }

  /** The policy numbers in the order shown (POL-...), read off the rows. */
  async readPolicyNumbers(): Promise<string[]> {
    return (await this.readRows()).map((r) => (r.text.match(/POL-[\w-]+/) ?? [''])[0]);
  }

  /**
   * Drags the row at `from` onto the row at `to` (0-based) with the mouse (cdk
   * drag-and-drop needs real movement) and reports what the drop sent and
   * answered, and the toasts.
   */
  async drag(from: number, to: number): Promise<CobReorderAnswer> {
    Logger.step(`COB: dragging row ${from + 1} to position ${to + 1}`);
    const a = await this.handles().nth(from).boundingBox();
    const b = await this.handles().nth(to).boundingBox();
    if (!a || !b) throw new Error(`the COB rows ${from + 1} / ${to + 1} have no drag handle on screen`);
    const sent = this.page.waitForRequest((r) => r.url().includes(ApiEndpoints.cobReorder), { timeout: Timeouts.short }).catch(() => null);
    await this.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 5 });
    await this.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + (to > from ? 30 : -30), { steps: 15 });
    await this.page.mouse.up();
    const request = await sent;
    const response = request ? await request.response().catch(() => null) : null;
    const messages = await WaitUtils.settleMessages(async () => (await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''));
    await this.page.waitForTimeout(500);
    return {
      request: request ? (request.postDataJSON() as { memberId: string; policyIds: string[] }) : null,
      status: response?.status() ?? -1,
      text: response ? await response.text().catch(() => '') : '',
      messages,
    };
  }

  /** Polls until the rows show `policyNumbers` in this order. */
  async expectOrder(policyNumbers: string[]): Promise<void> {
    await expect.poll(() => this.readPolicyNumbers(), { timeout: Timeouts.default, message: `the COB order should read ${policyNumbers.join(', ')}` }).toEqual(policyNumbers);
  }

  /** The tab's data through the API (current + History). */
  async fetchTimeline(memberId: string): Promise<CobEntry[]> {
    return readCobTimeline(this.page, memberId);
  }
}
