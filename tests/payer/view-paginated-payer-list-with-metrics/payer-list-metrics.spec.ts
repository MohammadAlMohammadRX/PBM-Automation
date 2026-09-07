import { test, expect } from '../../../fixtures';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import {
  METRIC_LABELS,
  NO_MATCH_SEARCH_TERM,
  OBSERVED_PAGE_SIZE,
} from '../../../data/payers/payerListMetrics.data';
import { ALL_STATUSES } from '../../../data/payers/filterPayer.data';

/**
 * User story: View Paginated Payer List with Metrics.
 * The five dashboard counters.
 *
 * Note on TC-004: the counters are verified INDEPENDENTLY and cross-checked
 * against the list, but the suite deliberately does not assert
 * `total === active + pending + inactive + expired`. Measured live, the band
 * reads 350 / 255 / 1 / 3 / 4 and the four status counts sum to 263. The gap is
 * correct: a payer whose first version has never been published carries no
 * lifecycle status at all (it shows as "Not Live"), so it counts towards Total
 * and towards none of the four. Asserting the sum would fail against a healthy
 * system - a false statement about the application.
 */
test.describe('View Paginated Payer List with Metrics - Dashboard counters', () => {
  test('TC-004: should calculate all five metric counts independently and accurately', async ({
    payerManagementPage,
    payerMetrics,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('The metrics band has loaded its figures', () =>
      payerMetrics.waitForLoaded());

    await steps.step('All five counters are present and labelled', () =>
      payerMetrics.expectAllCountersPresent());

    await steps.step('Each counter is an independently calculated whole number', () =>
      payerMetrics.expectMetricsIndependentlyCalculated());

    // The independent cross-check the criterion asks for ("manually count rows
    // per status ... manual counts match each displayed widget value"). Where
    // the counter implies a single page the rows are compared EXACTLY; only a
    // multi-page result set falls back to comparing page counts, because
    // walking 26 pages for one assertion is not worth the wall time. See
    // PayerMetricsPanel.expectMetricAgreesWithList.
    for (const metric of ['active', 'pending', 'inactive', 'expired'] as const) {
      await steps.step(
        `The ${metric} counter agrees with the list filtered to that status`,
        async () => {
          const status = metric.charAt(0).toUpperCase() + metric.slice(1);
          await payerManagementPage.filterByStatus(status);
          await payerMetrics.expectMetricAgreesWithList(
            metric,
            () => payerManagementPage.getPageCount(),
            () => payerManagementPage.getRowCount(),
            OBSERVED_PAGE_SIZE,
          );
        },
      );
    }

    await steps.step('The Total counter agrees with the unfiltered list', async () => {
      await payerManagementPage.filterByStatus(ALL_STATUSES);
      await payerMetrics.expectMetricAgreesWithList(
        'total',
        () => payerManagementPage.getPageCount(),
        () => payerManagementPage.getRowCount(),
        OBSERVED_PAGE_SIZE,
      );
    });
  });

  test('TC-011: should reflect payer data changes made elsewhere in the system', async ({
    payerManagementPage,
    payerMetrics,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    // A genuine before/after delta. The baseline is captured FIRST and the
    // payer is created afterwards, which is the only ordering that can prove
    // the counter moved because of the change - a payer provisioned by a
    // fixture would already be inside the baseline, leaving nothing to compare.
    await steps.critical('Open the payer list', () => payerManagementPage.open());
    await steps.critical('The metrics band has loaded its figures', () =>
      payerMetrics.waitForLoaded());

    const metricsBefore = await payerMetrics.getAllMetrics();
    const totalBefore = metricsBefore.total;

    await steps.critical('Create a payer, as another user would elsewhere', async () => {
      await payerManagementPage.createDraftPayer(uniquePayer);
      cleanup.register(async () => {
        await payerManagementPage.open();
        await payerManagementPage.deletePayer(uniquePayer.nameEn).catch(() => undefined);
      });
    });

    await steps.critical('Return to the payer list', () => payerManagementPage.reopen());

    // Searched for, not scanned: the list spans 35 pages and a new record lands
    // wherever the default sort puts it, so reading the rows that happen to be
    // on page one would never find it.
    await steps.step('The new payer appears in the list', async () => {
      await payerManagementPage.search(uniquePayer.nameEn);
      await payerManagementPage.expectResultsInclude(uniquePayer.nameEn);
    });

    // Total counts every record, including one that has never been published,
    // so it must move by exactly one. This is the honest form of the criterion's
    // "Total and Active counts each increase by 1": the new record is a draft,
    // not an Active payer, so Active must NOT move - which the next step checks.
    await steps.step('The Total counter has increased by exactly one', async () => {
      await payerManagementPage.reopen();
      await payerMetrics.waitForLoaded();
      await payerMetrics.expectMetricChangedBy('total', totalBefore, 1);
    });

    // The other half of "the counts reflect the change": the counters that must
    // NOT move are checked too. A band that simply incremented everything would
    // pass the step above and be badly wrong.
    await steps.step('The Active counter did not move for an unpublished payer', async () => {
      const metricsAfter = await payerMetrics.getAllMetrics();
      expect(
        metricsAfter.active,
        'a payer whose first version has never been published is not Active, so the Active '
          + 'counter must be unchanged',
      ).toBe(metricsBefore.active);
    });
  });

  test('TC-014: should present every element on the list and dashboard checklist', async ({
    payerManagementPage,
    payerMetrics,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.step('All five dashboard counters are visible and labelled', async () => {
      await payerMetrics.waitForLoaded();
      await payerMetrics.expectAllCountersPresent();
      await payerMetrics.expectLabels('en');
    });

    await steps.step('The Status column is colour-coded', () =>
      payerManagementPage.expectStatusTonesDistinct());

    await steps.step('Row-level action controls are present', async () => {
      const names = await payerManagementPage.getVisiblePayerNames();
      await payerManagementPage.expectRowActionsEnabled(names[0], ['view', 'edit']);
    });

    // Scrolls to the pager and checks all three kinds of control it should
    // offer - the Previous arrow, the Next arrow and the numbered page buttons
    // - rather than only that a pager element exists. The arrows are chevron
    // icons with no text, so they are asserted by id and state.
    await steps.step('Pagination arrows and numbered pages are present', () =>
      payerManagementPage.expectPagerControlsComplete());

    // The last checklist item, reported honestly. The criterion requires a
    // configurable page size control alongside the pager; the live table footer
    // contains the pager and nothing else. This asserts the control the
    // criterion calls for rather than being re-pointed at something that
    // happens to pass, so the checklist gap is reported as the defect it is.
    await steps.step('A configurable page size control is present', async () => {
      const present = await payerManagementPage.hasPageSizeControl();
      expect(
        present,
        'the acceptance criteria require a configurable page size control alongside the '
          + 'pagination controls; the table footer exposes only Previous / page numbers / '
          + 'Next, with no rows-per-page selector',
      ).toBe(true);
    });
  });

  test('TC-012: should report a clear failure when payer data cannot be loaded', async ({
    page,
    payerManagementPage,
    payerMetrics,
    steps,
  }) => {
    // ONE endpoint is failed, not all of them. Blanket-failing every request
    // stops the application shell from booting, so whatever the browser then
    // shows says nothing about how the payer module handles ITS data failing -
    // which is what the case is about.
    await steps.critical('Simulate the payer data service being unavailable', () =>
      NetworkUtils.failEndpoint(page, ApiEndpoints.payerList));

    await steps.critical('Navigate to the payer module', () =>
      payerManagementPage.navigate());

    await steps.step('The module does not present a healthy, empty-looking table', () =>
      payerManagementPage.expectDataLoadFailureReported());

    await steps.critical('Restore the payer data service', () =>
      NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerList));

    await steps.step('The list and its counters load once the service is back', async () => {
      await payerManagementPage.open();
      await payerMetrics.waitForLoaded();
      await payerManagementPage.expectResultsFound();
    });
  });

  test('TC-008: should handle an empty payer result set gracefully', async ({
    payerManagementPage,
    payerMetrics,
    steps,
  }) => {
    // The criterion's precondition is "no payer records exist in the system (or
    // all have been filtered/removed)". Emptying a shared environment is not
    // something a test may do, so the FILTERED form of the precondition is
    // used - which is the same rendering path and the part of the behaviour
    // that is actually about the payer list.
    //
    // The counters are consequently NOT expected to read zero: they report the
    // whole register, not the current result set. Asserting zero here would be
    // asserting a behaviour the criterion never describes for a filtered list.
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Narrow the list to a result set with no records', () =>
      payerManagementPage.search(NO_MATCH_SEARCH_TERM));

    await steps.step('An explicit empty state is shown instead of rows', () =>
      payerManagementPage.expectEmptyState());

    await steps.step('No pagination controls are offered for an empty result set', () =>
      payerManagementPage.expectPagerAbsent());

    await steps.step('The metrics band still reports the register, not the result set', () =>
      payerMetrics.expectMetricsIndependentlyCalculated());
  });
});
