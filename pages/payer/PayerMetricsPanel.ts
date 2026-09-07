import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import {
  PAYER_KPI,
  PAYER_KPI_BAND,
  payerKpiId,
  type PayerKpiKey,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';
import { METRIC_LABELS, type PayerMetrics } from '../../data/payers/payerListMetrics.data';

/**
 * The five-counter dashboard band above the payer list (`payer-list-kpis`).
 *
 * A component of its own rather than more methods on PayerManagementPage, for
 * the same reason SortMenu and AdvancedSearchDrawer are: it is a self-contained
 * region with its own id namespace, and the payer list class is already the
 * largest in the framework. It is constructed against whatever page is showing
 * the payer module - it does no navigation of its own.
 *
 * Every counter is read by id, so the same locators serve the English and the
 * Arabic run; only the `-label` text differs between them.
 */
export class PayerMetricsPanel {
  constructor(private readonly page: Page) {}

  /** The band itself - proves the metrics section rendered at all. */
  band(): Locator {
    return this.page.locator(`#${PAYER_KPI_BAND}`);
  }

  private valueOf(metric: PayerKpiKey): Locator {
    return this.page.locator(`#${payerKpiId(metric, 'value')}`);
  }

  private labelOf(metric: PayerKpiKey): Locator {
    return this.page.locator(`#${payerKpiId(metric, 'label')}`);
  }

  /**
   * Waits until the counters hold their real figures.
   *
   * The band mounts with every counter rendering a literal "0" and fills them
   * in when its own request returns. So "the text contains a digit" is NOT a
   * usable readiness signal - it matches the placeholder immediately, and a
   * baseline captured on the back of it reads 0/0/0/0/0. That is precisely the
   * bug this method exists to prevent: a later re-read then looks like the
   * counters drifted, when the first read was simply too early.
   *
   * Readiness is therefore "Total has become non-zero". Total counts every
   * payer in the register, so on any populated environment it is the first
   * counter to leave the placeholder behind.
   *
   * LIMITATION, stated rather than hidden: on a genuinely empty register every
   * counter is legitimately 0 and this wait cannot tell that apart from the
   * placeholder, so it would burn its timeout. A test asserting the empty-state
   * figures should read `getAllMetrics()` directly instead of waiting here.
   */
  async waitForLoaded(): Promise<void> {
    await expect(this.band()).toBeVisible({ timeout: Timeouts.default });

    await expect
      .poll(() => this.getMetric('total'), {
        timeout: Timeouts.default,
        message:
          'the metrics band should replace its placeholder zeros with the register figures',
      })
      .toBeGreaterThan(0);

    // The five figures do not all land in the same frame, so the band is only
    // settled once two consecutive reads agree.
    let previous = JSON.stringify(await this.getAllMetrics());
    await expect
      .poll(
        async () => {
          const current = JSON.stringify(await this.getAllMetrics());
          const stable = current === previous;
          previous = current;
          return stable;
        },
        { timeout: Timeouts.default, message: 'the metric figures should settle' },
      )
      .toBe(true);
  }

  /**
   * One counter's number.
   *
   * Thousands separators differ by locale (the Arabic UI may group differently),
   * so every non-digit is stripped before parsing rather than assuming a
   * format. A counter that holds no digits at all returns NaN, which the
   * assertions below report as a failure instead of silently reading as zero -
   * the bug that would otherwise make an unrendered counter look like a
   * legitimate count of nothing.
   */
  async getMetric(metric: PayerKpiKey): Promise<number> {
    const text = (await this.valueOf(metric).innerText()).trim();
    const digits = text.replace(/[^\d-]/g, '');
    return digits === '' ? Number.NaN : Number(digits);
  }

  /** All five counters, read together. */
  async getAllMetrics(): Promise<PayerMetrics> {
    return {
      total: await this.getMetric('total'),
      active: await this.getMetric('active'),
      pending: await this.getMetric('pending'),
      inactive: await this.getMetric('inactive'),
      expired: await this.getMetric('expired'),
    };
  }

  /** Asserts all five counters are present, labelled and hold a real number. */
  async expectAllCountersPresent(): Promise<void> {
    for (const metric of Object.keys(PAYER_KPI) as PayerKpiKey[]) {
      await expect(
        this.labelOf(metric),
        `the "${metric}" counter must carry a caption`,
      ).toBeVisible({ timeout: Timeouts.default });
      await expect(
        this.valueOf(metric),
        `the "${metric}" counter must show a number`,
      ).toHaveText(/^\s*-?[\d,.  ٬]+\s*$/, { timeout: Timeouts.default });
    }
  }

  /** Asserts each counter carries the caption expected for the active language. */
  async expectLabels(language: 'en' | 'ar'): Promise<void> {
    for (const metric of Object.keys(PAYER_KPI) as PayerKpiKey[]) {
      await expect(this.labelOf(metric)).toHaveText(METRIC_LABELS[language][metric], {
        timeout: Timeouts.default,
      });
    }
  }

  /**
   * Asserts every counter is an independently calculated, non-negative whole
   * number.
   *
   * Deliberately NOT asserting `total === active + pending + inactive +
   * expired`. Verified live: the counters read 350 / 255 / 1 / 3 / 4, and the
   * four status counts sum to 263. The difference is real and correct - a payer
   * whose first version has never been published carries no lifecycle status at
   * all (it shows as "Not Live"), so it is counted in Total and in none of the
   * four. Asserting the sum would fail against a healthy system and would be a
   * false statement about the application.
   */
  async expectMetricsIndependentlyCalculated(): Promise<void> {
    const metrics = await this.getAllMetrics();
    for (const [name, value] of Object.entries(metrics)) {
      expect(Number.isInteger(value), `the ${name} counter must be a whole number`).toBe(true);
      expect(value, `the ${name} counter must not be negative`).toBeGreaterThanOrEqual(0);
    }
    const statusCounts = metrics.active + metrics.pending + metrics.inactive + metrics.expired;
    expect(
      metrics.total,
      'Total must account for at least every payer that carries a lifecycle status '
        + `(active ${metrics.active} + pending ${metrics.pending} + inactive `
        + `${metrics.inactive} + expired ${metrics.expired} = ${statusCounts})`,
    ).toBeGreaterThanOrEqual(statusCounts);
  }

  /**
   * Asserts a counter matches what the list itself reports for that status.
   *
   * This is the independent cross-check the acceptance criterion asks for: the
   * counter is compared against the number of records the LIST returns when
   * filtered to the same status, so a counter computed from a stale or
   * different query is caught. The list is measured in pages rather than by
   * counting every row, because a 255-record status would otherwise mean paging
   * through 26 pages for one assertion.
   */
  async expectMetricAgreesWithList(
    metric: PayerKpiKey,
    readPageCount: () => Promise<number>,
    readRowCount: () => Promise<number>,
    pageSize: number,
  ): Promise<void> {
    const counted = await this.getMetric(metric);
    const expectedPages = counted === 0 ? 1 : Math.ceil(counted / pageSize);

    // Both reads are POLLED, not taken once. Applying a filter re-queries the
    // list asynchronously and the pager keeps the previous result set's buttons
    // until the new response lands, so a single read compares the counter
    // against the WRONG result set and reports a race as a mismatch.
    //
    // WHICH comparison is used matters, and this is the part that catches real
    // defects. When the counter implies a single page, the row count is
    // compared EXACTLY - a counter reading 1 against a list returning 4 rows is
    // a genuine disagreement, and a page-count comparison would call both "1
    // page" and pass. Only when the result set spans several pages does the
    // check fall back to pages, because counting every row would mean paging
    // through the whole list for one assertion.
    if (expectedPages === 1) {
      await expect
        .poll(readRowCount, {
          timeout: Timeouts.default,
          message:
            `the ${metric} counter reports ${counted} payer(s), so the list narrowed to that `
            + 'status should return exactly that many rows',
        })
        .toBe(counted);
      return;
    }

    await expect
      .poll(readPageCount, {
        timeout: Timeouts.default,
        message:
          `the ${metric} counter reports ${counted} payers, so the list narrowed to that `
          + `status should span ${expectedPages} page(s) at ${pageSize} rows per page`,
      })
      .toBe(expectedPages);
  }

  /** Asserts a counter changed by exactly `delta` since it was last read. */
  async expectMetricChangedBy(
    metric: PayerKpiKey,
    before: number,
    delta: number,
  ): Promise<void> {
    Logger.step(`Expecting the ${metric} counter to move from ${before} by ${delta}`);
    await expect
      .poll(() => this.getMetric(metric), {
        timeout: Timeouts.default,
        message:
          `the ${metric} counter should read ${before + delta} after the change made `
          + 'elsewhere in the system',
      })
      .toBe(before + delta);
  }

  /**
   * Asserts the metrics band is NOT available to the signed-in user.
   *
   * The RBAC rules allow either outcome - the module may be denied outright, or
   * served without its administrative metrics - so this checks the band is not
   * exposing figures, which is what both outcomes have in common. The branch
   * lives here rather than in the test, keeping conditional logic out of the
   * spec.
   */
  async expectBandUnavailable(): Promise<void> {
    await expect
      .poll(
        async () => {
          if ((await this.band().count()) === 0) return 'absent';
          return (await this.band().isVisible()) ? 'visible' : 'absent';
        },
        {
          timeout: Timeouts.default,
          message:
            'a user without payer administration rights must not be shown the payer '
            + 'dashboard metrics',
        },
      )
      .toBe('absent');
  }

  /** Asserts every counter reads zero - the empty-dataset state. */
  async expectAllCountersZero(): Promise<void> {
    for (const metric of Object.keys(PAYER_KPI) as PayerKpiKey[]) {
      await expect(this.valueOf(metric), `the ${metric} counter should read 0`).toHaveText(
        /^\s*0\s*$/,
        { timeout: Timeouts.default },
      );
    }
  }
}
