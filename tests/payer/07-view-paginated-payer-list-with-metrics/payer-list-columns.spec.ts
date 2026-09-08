import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import {
  EMAIL_PATTERN,
  PAYER_CODE_PATTERN,
  PHONE_PATTERN,
  REQUIRED_COLUMN_KEYS,
  REQUIRED_COLUMN_NAMES,
  REQUIRED_ROW_ACTIONS,
  STATUS_TONE_CASES,
} from '../../../data/payers/payerListMetrics.data';

/**
 * User story: View Paginated Payer List with Metrics.
 * The table's shape, its data formats, and its status colour coding.
 *
 * Opening the list is `critical` throughout: every assertion here reads the
 * table, so if the list never rendered, asserting on its columns would report a
 * failure about a screen that was never exercised.
 */
test.describe('View Paginated Payer List with Metrics - Table shape and formats', () => {
  test('TC-001: should display every required column and offer working row actions', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Asserted as a SUBSET: the live table renders eleven columns, adding
    // Networks, Members, Approval Status and Actions to the six the criteria
    // enumerate. Demanding an exact set would fail on columns the application
    // legitimately provides.
    await steps.step('All six required columns are present as headers', async () => {
      const rendered = await payerManagementPage.getColumnKeys();
      const missing = REQUIRED_COLUMN_KEYS.filter((key) => !rendered.includes(key)).map(
        (key) => REQUIRED_COLUMN_NAMES[key],
      );
      expect(missing, `columns rendered: ${rendered.join(', ')}`).toEqual([]);
    });

    // The rows arrive after the table element does, so they are waited for
    // before anything reads them - otherwise the read lands on an empty table
    // and reports "the list rendered no rows", which reads like a defect and is
    // not one.
    await steps.critical('The list has rendered its rows', () =>
      payerManagementPage.expectRowsRendered());

    await steps.step('A sample row carries data in each required column', async () => {
      const names = await payerManagementPage.getVisiblePayerNames();
      expect(names.length, 'the list must render at least one row to sample').toBeGreaterThan(0);
      await payerManagementPage.expectRowRequiredColumnsPopulated(names[0], [
        PAYER_COLUMN.payerName,
        PAYER_COLUMN.payerType,
        PAYER_COLUMN.status,
      ]);
    });

    await steps.step('The sample row offers its action controls, enabled', async () => {
      const names = await payerManagementPage.getVisiblePayerNames();
      await payerManagementPage.expectRowActionsEnabled(names[0], REQUIRED_ROW_ACTIONS);
    });

    // The action must actually DO something: a rendered icon that navigates
    // nowhere would satisfy every check above.
    await steps.step('Activating the View action opens the payer detail screen', async () => {
      const names = await payerManagementPage.getVisiblePayerNames();
      const detail = await payerManagementPage.openDetails(names[0]);
      await detail.waitForLoaded();
    });
  });

  test('TC-002: should render Email, Phone and PayerCode in their expected formats', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Each format is checked over EVERY rendered row rather than one sample: a
    // single well-formed row proves nothing about the column, and a mask that
    // fails on one record in ten is exactly the defect this case looks for. The
    // list's blank marker is tolerated - a Payer Code is only issued at
    // publication, so a blank code is correct rather than malformed.
    await steps.step('Every Email value is a syntactically valid address', () =>
      payerManagementPage.expectColumnMatches(
        PAYER_COLUMN.email,
        EMAIL_PATTERN,
        'an email address',
      ));

    await steps.step('Every Phone value carries the dial-code mask, untruncated', () =>
      payerManagementPage.expectColumnMatches(
        PAYER_COLUMN.phone,
        PHONE_PATTERN,
        'a masked phone number',
      ));

    await steps.step('Every Payer Code is an issued alphanumeric code', () =>
      payerManagementPage.expectColumnMatches(
        PAYER_COLUMN.code,
        PAYER_CODE_PATTERN,
        'an issued payer code',
      ));

    await steps.step('Payer Codes are unique across the page', () =>
      payerManagementPage.expectColumnValuesUnique(PAYER_COLUMN.code));
  });

  test('TC-003: should colour-code Active, Pending, Inactive and Expired distinctly', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // The criteria name colours; the application declares the colour BAND as
    // `data-tone` on every status badge. Asserting the tone checks the same
    // mapping without pinning hex values a re-theme would invalidate, and it
    // holds in Arabic, where the status text is translated but the tone is not.
    //
    // WHICH BADGE is read comes from the case's own `column`. The list carries
    // two status columns and the four criteria span both: Active, Inactive and
    // Expired are lifecycle statuses, while Pending is an APPROVAL status
    // ("v0 · Pending Approval"). Reading Pending from the lifecycle column
    // finds nothing - a payer awaiting approval reads "Not Live" there - and
    // reports a missing colour mapping that is not missing.
    //
    // The list is filtered to each status first, to bring such a row on screen,
    // but the assertion is scoped to the badges that actually claim that
    // status rather than to every row: filtering by status does not return a
    // pure result set in this build, and a whole-list assertion would report
    // the FILTER's behaviour as a colour defect.
    for (const { status, tone, describedAs, filter, column } of STATUS_TONE_CASES) {
      await steps.step(
        `A "${status}" payer renders with its ${describedAs} tone ("${tone}")`,
        async () => {
          await payerManagementPage.filterByStatus(filter);
          if (column === 'approval') {
            await payerManagementPage.expectApprovalStatusToneFor(status, tone);
            return;
          }
          await payerManagementPage.expectStatusToneFor(status, tone);
        },
      );
    }

    // "No overlap between statuses" cannot be shown one status at a time, so
    // this reads the unfiltered list, where several statuses are on screen.
    await steps.step('No two statuses share a colour band', async () => {
      await payerManagementPage.resetFilters();
      await payerManagementPage.expectStatusTonesDistinct();
    });
  });
});
