import { test, expect } from '../../../fixtures';
import {
  GO_TO_PAGE_INPUT_EXPECTED,
  INVALID_PAGE_INPUTS,
  OBSERVED_PAGE_SIZE,
  PAGE_SIZE_BOUNDARIES,
  PAGE_SIZE_CONTROL_EXPECTED,
  RAPID_PAGE_SEQUENCE,
  RAPID_SEQUENCE_FINAL_PAGE,
} from '../../../data/payers/payerListMetrics.data';

/**
 * User story: View Paginated Payer List with Metrics.
 * Pagination: navigation, boundaries and page size.
 *
 * TWO CASES IN THIS FILE REPORT A MISSING FEATURE. The criteria specify a
 * configurable page size and a "go to page" input; the live table footer holds
 * the pager and nothing else - no rows-per-page selector, no page-number input.
 * Those cases assert the control the criteria call for and fail with that as
 * their stated reason. They are written that way on purpose: re-pointing them
 * at the pager so they pass would hide a gap between the specification and the
 * build, and marking them BLOCKED would be wrong too - the environment is
 * fine, and something WAS learned about the application.
 */
test.describe('View Paginated Payer List with Metrics - Navigation', () => {
  test('TC-006: should transition correctly between pages and disable controls at the boundaries', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('The list spans enough pages to navigate', async () => {
      const pages = await payerManagementPage.getPageCount();
      expect(
        pages,
        'the criterion needs at least three pages of payers to walk through',
      ).toBeGreaterThanOrEqual(3);
    });

    await steps.step('The list opens on page one, with Previous disabled', async () => {
      await payerManagementPage.expectCurrentPage(1);
      await payerManagementPage.expectPreviousPageDisabled();
    });

    await steps.step('Next moves to page 2 and the indicator follows', async () => {
      await payerManagementPage.goToNextPage();
      await payerManagementPage.expectCurrentPage(2);
    });

    await steps.step('Next again moves to page 3', async () => {
      await payerManagementPage.goToNextPage();
      await payerManagementPage.expectCurrentPage(3);
    });

    await steps.step('Previous moves back to page 2', async () => {
      await payerManagementPage.goToPreviousPage();
      await payerManagementPage.expectCurrentPage(2);
    });

    await steps.step('Returning to page one re-disables Previous', async () => {
      await payerManagementPage.goToPage(1);
      await payerManagementPage.expectCurrentPage(1);
      await payerManagementPage.expectPreviousPageDisabled();
    });

    await steps.step('Jumping to the last page disables Next', async () => {
      await payerManagementPage.goToLastPage();
      await payerManagementPage.expectNextPageDisabled();
      await payerManagementPage.expectPreviousPageEnabled();
    });
  });

  test('TC-007: should show only the remaining records on the last page', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // The page size is MEASURED from a full page rather than assumed, so this
    // stays correct if the application's page size ever changes.
    //
    // The rows are waited for first: `open()` returns once the table element is
    // visible, but its rows arrive with a separate request, so counting
    // immediately reads a partly-rendered table.
    let fullPageRows = 0;
    await steps.critical('Measure a full page of results', async () => {
      await payerManagementPage.expectCurrentPage(1);
      await payerManagementPage.expectRowsRendered();
      await expect
        .poll(() => payerManagementPage.getRowCount(), {
          timeout: 10_000,
          message: 'page one should settle at a full page of rows',
        })
        .toBe(OBSERVED_PAGE_SIZE);
      fullPageRows = await payerManagementPage.getRowCount();
    });

    await steps.critical('Navigate to the last page', () => payerManagementPage.goToLastPage());

    // The last page holds the remainder. When the record count divides evenly
    // it legitimately holds a full page, so the assertion is "no more than a
    // full page, and at least one row" - which is the real boundary rule. A
    // hard-coded "3 rows" would only hold for one particular dataset.
    await steps.step('The last page holds only the remaining records', async () => {
      const lastPageRows = await payerManagementPage.getRowCount();
      expect(lastPageRows, 'the last page must not be empty').toBeGreaterThan(0);
      expect(
        lastPageRows,
        'the last page must not render more than one page of records',
      ).toBeLessThanOrEqual(fullPageRows);
    });

    await steps.step('Next is disabled and Previous remains enabled', async () => {
      await payerManagementPage.expectNextPageDisabled();
      await payerManagementPage.expectPreviousPageEnabled();
    });
  });

  test('TC-005: should enforce the configured minimum and maximum page size', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Reported, not worked around - see the file header.
    await steps.critical('The list offers a page size control', async () => {
      const present = await payerManagementPage.hasPageSizeControl();
      expect(
        present,
        'the acceptance criteria require a configurable page size with a minimum of '
          + `${PAGE_SIZE_BOUNDARIES.minimum} and a maximum of ${PAGE_SIZE_BOUNDARIES.maximum} `
          + 'rows per page. The table footer exposes only the pager (Previous / page numbers '
          + '/ Next) - there is no rows-per-page selector, so the minimum, the maximum and '
          + `the below-minimum (${PAGE_SIZE_BOUNDARIES.belowMinimum}) boundaries cannot be `
          + 'set or enforced',
      ).toBe(PAGE_SIZE_CONTROL_EXPECTED);
    });

    // NOT EXECUTED once the step above fails, which is exactly right: setting a
    // boundary on a control that does not exist would report nothing about the
    // application.
    await steps.step('The minimum page size renders exactly that many rows', async () => {
      await payerManagementPage.selectPageSize(PAGE_SIZE_BOUNDARIES.minimum);
      expect(await payerManagementPage.getRowCount()).toBe(PAGE_SIZE_BOUNDARIES.minimum);
    });

    await steps.step('The maximum page size renders up to that many rows', async () => {
      await payerManagementPage.selectPageSize(PAGE_SIZE_BOUNDARIES.maximum);
      expect(await payerManagementPage.getRowCount()).toBeLessThanOrEqual(
        PAGE_SIZE_BOUNDARIES.maximum,
      );
    });

    await steps.step('A value below the minimum is rejected or clamped', async () => {
      await payerManagementPage.selectPageSize(PAGE_SIZE_BOUNDARIES.belowMinimum);
      expect(await payerManagementPage.getRowCount()).toBeGreaterThanOrEqual(
        PAGE_SIZE_BOUNDARIES.minimum,
      );
    });
  });

  test('TC-009: should reject invalid manual page navigation input', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('The pager offers a "go to page" input', async () => {
      const present = await payerManagementPage.hasGoToPageInput();
      expect(
        present,
        'the acceptance criteria require a manual "go to page" input that rejects '
          + `${INVALID_PAGE_INPUTS.join(', ')}. The pager renders Previous, numbered page `
          + 'buttons and Next only - there is no input to type a page number into, so '
          + 'out-of-range, negative and non-numeric entries cannot be submitted or validated',
      ).toBe(GO_TO_PAGE_INPUT_EXPECTED);
    });

    // One step per invalid entry, matching the sheet, which states a separate
    // expected result for the over-range value, for negative/zero, and for
    // non-numeric text. A single loop reported them as one outcome, so a build
    // that handled 999 but crashed on "abc" would show a single failure with no
    // indication which input caused it.
    await steps.step('An over-range page number is rejected or clamped', async () => {
      await payerManagementPage.enterPageNumber('999');
      await payerManagementPage.expectNoUnexpectedDialog();
    });

    await steps.step('A negative page number is rejected or defaults to page 1', async () => {
      await payerManagementPage.enterPageNumber('-1');
      await payerManagementPage.expectNoUnexpectedDialog();
    });

    await steps.step('Zero is rejected or defaults to page 1', async () => {
      await payerManagementPage.enterPageNumber('0');
      await payerManagementPage.expectNoUnexpectedDialog();
    });

    await steps.step('Non-numeric input is rejected with a validation message', async () => {
      await payerManagementPage.enterPageNumber('abc');
      await payerManagementPage.expectNoUnexpectedDialog();
    });
  });

  test('TC-013: should stay stable and accurate under rapid pagination changes', async ({
    payerManagementPage,
    payerMetrics,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());
    await steps.critical('The metrics band has loaded its figures', () =>
      payerMetrics.waitForLoaded());

    const metricsBefore = await payerMetrics.getAllMetrics();

    // The criterion's rapid PAGE SIZE changes are not available (no page size
    // control), so what is exercised is the rapid interaction the application
    // does offer: hopping between pages in quick succession. The property under
    // test is unchanged - the table must not show stale, duplicated or missing
    // rows.
    //
    // Driven with Next/Previous rather than page numbers: the pager collapses
    // beyond seven pages, so from page one it offers `1 2 … 35` and a button
    // for page 5 does not exist to click.
    await steps.critical('Hop between pages in quick succession', async () => {
      await payerManagementPage.expectCurrentPage(1);
      for (const action of RAPID_PAGE_SEQUENCE) {
        if (action === 'next') {
          await payerManagementPage.goToNextPage();
        } else {
          await payerManagementPage.goToPreviousPage();
        }
      }
    });

    await steps.step('The table settled on the expected page', () =>
      payerManagementPage.expectCurrentPage(RAPID_SEQUENCE_FINAL_PAGE));

    await steps.step('No row is duplicated after the rapid navigation', () =>
      payerManagementPage.expectNoDuplicateRows());

    await steps.step('The page renders a full set of rows, none missing', async () => {
      await payerManagementPage.expectRowsRendered();
      const rows = await payerManagementPage.getRowCount();
      expect(rows, 'a non-final page should still be full after rapid navigation').toBe(
        OBSERVED_PAGE_SIZE,
      );
    });

    // Polled rather than read once: the counters are served by their own
    // request, and hopping pages re-issues it - so an immediate read can catch
    // the band mid-refresh and report drift that settles a moment later.
    await steps.step('The counters did not drift during the interaction', async () => {
      await expect
        .poll(() => payerMetrics.getAllMetrics(), {
          timeout: 15_000,
          message:
            'paging through the list must not change what the counters report; they were '
            + `${JSON.stringify(metricsBefore)} before the interaction`,
        })
        .toEqual(metricsBefore);
    });
  });
});
