import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import {
  PAYER_DETAIL_ACTIVE_TAB_CLASS,
  PAYER_DETAIL_TAB,
  PAYER_VERSION_COLUMN,
  PAYER_VERSION_DRAWER,
  PAYER_VERSION_DRAWER_TITLE,
  PAYER_VERSIONS_SCREEN,
  buttonSelector,
  type PayerVersionColumnKey,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';
import {
  PUBLISHED_STATUSES,
  REQUIRED_VERSION_FIELDS,
  UNAPPROVED_STATUSES,
  type VersionEntry,
} from '../../data/payers/versionHistory.data';

/**
 * The Version History tab of the payer detail screen.
 *
 * A component rather than more methods on PayerDetailPage, matching how
 * AssignNetworkDrawer and SortMenu are factored: the tab owns a whole table in
 * its own id namespace (`payer-detail-versions-table-*`) and is only ever used
 * by the versioning story.
 *
 * The table follows the application's shared list shape, so rows are keyed on
 * the approval-request id and cells are addressed by model-property key - never
 * by position, and never by the translated header caption.
 */
export class PayerVersionHistoryTab {
  constructor(private readonly page: Page) {}

  // ---- Tab activation -------------------------------------------------------

  private tabButton(): Locator {
    return this.page.locator(buttonSelector(PAYER_DETAIL_TAB.versions)).first();
  }

  table(): Locator {
    return this.page.locator(`#${PAYER_VERSIONS_SCREEN}-table-el`);
  }

  /**
   * Activates the tab.
   *
   * The panel mounts lazily and the tab strip re-renders as the detail screen
   * settles, so the click is retried until the tab's own content is on screen -
   * the same pattern PayerDetailPage.openLinkedNetworks uses, and for the same
   * reason: a single blind click lands before the strip is interactive.
   *
   * Completion is the table OR the empty state, because a payer with no
   * versions legitimately renders no table and waiting only for the table would
   * turn that into a timeout.
   */
  async open(): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.tabButton().click();
      const ready = await this.table()
        .or(this.emptyState())
        .first()
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      if (ready) {
        await this.waitForEntriesSettled();
        Logger.step('Version History tab is showing');
        return;
      }
    }
    await expect(this.table().or(this.emptyState()).first()).toBeVisible({
      timeout: Timeouts.default,
    });
    await this.waitForEntriesSettled();
  }

  /**
   * Waits until the tab's content has actually settled.
   *
   * The table ELEMENT appears before its rows do - they arrive with a separate
   * request - so returning as soon as the table is visible hands the caller an
   * empty table. Read that way, a payer with one published version reported
   * ZERO entries and the case failed claiming the history was missing.
   *
   * "Settled" is therefore: rows are present, OR the empty state is showing and
   * was ALSO showing on the previous read. The second read is what separates a
   * genuinely empty history from a table that simply has not filled in yet -
   * without it, the early-empty frame is indistinguishable from the real thing.
   */
  private async waitForEntriesSettled(): Promise<void> {
    let previouslyEmpty = false;
    await expect
      .poll(
        async () => {
          if ((await this.rows().count()) > 0) return 'rows';
          const emptyShown = await this.emptyState()
            .isVisible()
            .catch(() => false);
          const settledEmpty = emptyShown && previouslyEmpty;
          previouslyEmpty = emptyShown;
          return settledEmpty ? 'empty' : 'loading';
        },
        { timeout: Timeouts.default },
      )
      .not.toBe('loading');
  }

  /** Whether the tab is offered to the signed-in user at all (RBAC checks). */
  async isAvailable(): Promise<boolean> {
    return (await this.tabButton().count()) > 0;
  }

  async expectTabVisible(): Promise<void> {
    await expect(this.tabButton()).toBeVisible({ timeout: Timeouts.default });
  }

  /** Asserts the tab is the active one after being clicked. */
  async expectTabActive(): Promise<void> {
    // The strip marks its active tab with a CSS CLASS and exposes no
    // `aria-selected` and no `role="tab"` - verified across all five tabs,
    // before and after switching. An earlier version of this asserted
    // `aria-selected="true"` and failed on a tab that was plainly active.
    //
    // locator-exception: the class is the only signal the application offers for
    // "this tab is showing"; the tab itself is still found by its id.
    await expect(this.tabButton()).toHaveClass(
      new RegExp(`\\b${PAYER_DETAIL_ACTIVE_TAB_CLASS}\\b`),
      { timeout: Timeouts.default },
    );
  }

  // ---- Rows -----------------------------------------------------------------

  private rows(): Locator {
    return this.page.locator(`tr[id^="${PAYER_VERSIONS_SCREEN}-table-row-"]`);
  }

  /** The tab's empty state - its own element, not a row of placeholder text. */
  private emptyState(): Locator {
    return this.page.locator(`#${PAYER_VERSIONS_SCREEN}-table-empty`);
  }

  async getEntryCount(): Promise<number> {
    return this.rows().count();
  }

  /**
   * Every version entry the tab lists, as structured records.
   *
   * Read in ONE round trip through the DOM rather than a locator call per cell:
   * a payer with a long history would otherwise cost dozens of protocol
   * round-trips per assertion, and the whole table is a single consistent
   * snapshot this way.
   */
  async getEntries(): Promise<VersionEntry[]> {
    return this.rows().evaluateAll((rows, columns) => {
      const read = (row: Element, key: string): string => {
        const cell = row.querySelector(`[id$="-cell-${key}"]`);
        return cell ? (cell as HTMLElement).innerText.trim() : '';
      };
      return rows.map((row) => ({
        version: read(row, columns.version),
        changeType: read(row, columns.changeType),
        status: read(row, columns.status),
        requestedBy: read(row, columns.requestedBy),
        requestedOn: read(row, columns.requestedOn),
        reviewedBy: read(row, columns.reviewedBy),
        reviewedOn: read(row, columns.reviewedOn),
      }));
    }, PAYER_VERSION_COLUMN);
  }

  /** The status of every listed entry, de-duplicated. */
  async getListedStatuses(): Promise<string[]> {
    const entries = await this.getEntries();
    return [...new Set(entries.map((entry) => entry.status))];
  }

  /** The version labels listed, in the order the tab renders them. */
  async getVersionLabels(): Promise<string[]> {
    return (await this.getEntries()).map((entry) => entry.version);
  }

  private async rowId(versionLabel: string): Promise<string> {
    const row = this.rows().filter({ hasText: versionLabel }).first();
    await expect(row).toBeVisible({ timeout: Timeouts.default });
    const id = await row.getAttribute('id');
    if (!id) {
      throw new Error(
        `[PayerVersionHistoryTab] Row for version "${versionLabel}" carries no id.`,
      );
    }
    return id;
  }

  /** A single cell of a version entry, by the column's model-property key. */
  async getCell(versionLabel: string, column: PayerVersionColumnKey): Promise<string> {
    const id = await this.rowId(versionLabel);
    const cell = this.page.locator(`#${id}-cell-${PAYER_VERSION_COLUMN[column]}`);
    return (await cell.innerText()).trim();
  }

  // ---- Assertions -----------------------------------------------------------

  async expectTableVisible(): Promise<void> {
    await expect(this.table()).toBeVisible({ timeout: Timeouts.default });
  }

  /** Asserts the tab reports "nothing to show" rather than erroring or hanging. */
  async expectEmptyState(): Promise<void> {
    await expect(
      this.emptyState(),
      'a payer with no approved changes should get an explicit empty state',
    ).toBeVisible({ timeout: Timeouts.default });
  }

  async expectEntryCount(expected: number): Promise<void> {
    await expect
      .poll(() => this.getEntryCount(), { timeout: Timeouts.default })
      .toBe(expected);
  }

  /** Asserts a version label is listed. */
  async expectListsVersion(versionLabel: string): Promise<void> {
    await expect
      .poll(() => this.getVersionLabels(), {
        timeout: Timeouts.default,
        message: `Version History should list "${versionLabel}"`,
      })
      .toContain(versionLabel);
  }

  /** Asserts a version label is NOT listed. */
  async expectDoesNotListVersion(versionLabel: string): Promise<void> {
    await expect
      .poll(() => this.getVersionLabels(), {
        timeout: Timeouts.default,
        message: `Version History should not list "${versionLabel}"`,
      })
      .not.toContain(versionLabel);
  }

  /**
   * Asserts the tab lists ONLY approved/published versions.
   *
   * This is the story's central rule, and it is asserted against the statuses
   * the tab actually reports rather than against a count: an entry carrying
   * "Pending Approval" or "Rejected" is a violation however many rows there
   * are.
   */
  async expectOnlyPublishedVersions(): Promise<void> {
    const statuses = await this.getListedStatuses();
    const unapproved = statuses.filter((status) =>
      UNAPPROVED_STATUSES.some((banned) => status.includes(banned)),
    );
    expect(
      unapproved,
      'Version History must list only approved (published) changes, but it also listed '
        + `entries with status: ${unapproved.join(', ')}`,
    ).toEqual([]);
    expect(
      statuses.every((status) => PUBLISHED_STATUSES.some((ok) => status.includes(ok))),
      `every listed entry should be published; statuses seen: ${statuses.join(', ')}`,
    ).toBe(true);
  }

  /** Asserts entries run newest-first, by the version number in each label. */
  async expectReverseChronologicalOrder(): Promise<void> {
    const numbers = (await this.getVersionLabels())
      .map((label) => Number(label.replace(/[^\d]/g, '')))
      .filter((value) => Number.isInteger(value));
    const descending = [...numbers].sort((a, b) => b - a);
    expect(
      numbers,
      `Version History should be newest-first; version order seen: ${numbers.join(' | ')}`,
    ).toEqual(descending);
  }

  /**
   * Asserts every entry carries each mandatory field.
   *
   * A reviewer is only expected on a version that HAS been reviewed, so the
   * reviewer columns are required only for published entries - demanding them
   * on a pending row would report a defect that is not one.
   */
  async expectEveryEntryComplete(): Promise<void> {
    const entries = await this.getEntries();
    expect(entries.length, 'there must be at least one entry to check').toBeGreaterThan(0);

    for (const entry of entries) {
      for (const field of REQUIRED_VERSION_FIELDS) {
        expect(
          entry[field],
          `version "${entry.version}" is missing its ${field}`,
        ).not.toBe('');
      }
      const published = PUBLISHED_STATUSES.some((ok) => entry.status.includes(ok));
      if (published) {
        expect(
          entry.reviewedBy,
          `published version "${entry.version}" must name its approver`,
        ).not.toMatch(/^(|—|-)$/);
        expect(
          entry.reviewedOn,
          `published version "${entry.version}" must carry its approval timestamp`,
        ).not.toMatch(/^(|—|-)$/);
      }
    }
  }

  // ---- Entry detail drawer --------------------------------------------------

  /**
   * The drawer's TITLE, not its host element.
   *
   * The `p-drawer` host is always in the DOM and never reports as visible - it
   * has no box of its own and the rendered panel is its child - so waiting on
   * the host fails on a drawer that is open on screen. The title is inside the
   * panel, so it appears exactly when the drawer does. See
   * PAYER_VERSION_DRAWER_TITLE.
   */
  private drawerTitle(): Locator {
    return this.page.locator(`#${PAYER_VERSION_DRAWER_TITLE}`);
  }

  /** Opens a version entry's detail drawer via its View action. */
  async openEntry(versionLabel: string): Promise<void> {
    const id = await this.rowId(versionLabel);
    await this.page.locator(buttonSelector(`${id}-view`)).first().click();
    await expect(this.drawerTitle()).toBeVisible({ timeout: Timeouts.default });
  }

  async expectEntryDrawerOpen(): Promise<void> {
    await expect(this.drawerTitle()).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Closes the entry drawer.
   *
   * Must be called before touching anything behind it: the drawer lays a modal
   * mask over the page, so the next click - on another tab, say - is swallowed
   * and fails as a click timeout against a control that is visible and enabled
   * the whole time. That is exactly how the navigation case failed once the
   * drawer step was added before it.
   */
  async closeEntry(): Promise<void> {
    const close = this.page.locator(buttonSelector(`${PAYER_VERSION_DRAWER}-close`)).first();
    if ((await close.count()) === 0) return;
    await close.click();

    // The closed panel's title disappearing is the completion signal.
    //
    // Deliberately NOT also waiting for the PrimeNG mask to leave the DOM.
    // Verified: the mask element persists with a non-zero box after the drawer
    // closes (it keeps `p-overlay-mask-leave-active`), so waiting for zero
    // visible masks never succeeds - an earlier version of this burned its full
    // timeout there. And it is unnecessary: once the drawer is closing, the tab
    // strip behind it accepts clicks again, and Playwright's own actionability
    // checks retry until the target actually receives the event. This is the
    // opposite call to the one ConfirmDialog makes for the shared modal, where
    // the mask genuinely does block - hence the note rather than a silent
    // difference.
    await expect(this.drawerTitle()).toBeHidden({ timeout: Timeouts.default });
  }

  /** Asserts the tab loaded no data and said so, rather than rendering blank. */
  async expectLoadFailureReported(): Promise<void> {
    // The application has no dedicated error element with an id, so the honest
    // check is that the tab did NOT silently present an empty, healthy-looking
    // table: either an explicit empty/error state is shown, or the table is
    // absent altogether. A rendered table with rows would mean the failure was
    // masked by stale data.
    await expect
      .poll(
        async () => {
          const rows = await this.getEntryCount();
          const emptyShown = (await this.emptyState().count()) > 0;
          const tableShown = (await this.table().count()) > 0;
          if (rows > 0) return 'rows-rendered';
          if (emptyShown) return 'state-shown';
          return tableShown ? 'empty-table' : 'state-shown';
        },
        {
          timeout: Timeouts.default,
          message:
            'with the version service failing, the tab must not present rows as if the '
            + 'history had loaded successfully',
        },
      )
      .not.toBe('rows-rendered');
  }
}
