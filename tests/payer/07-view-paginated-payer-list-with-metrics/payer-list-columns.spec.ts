import { test, expect } from '../../../fixtures';
import { GLOBAL, PAYER_COLUMN, byId } from '../../../constants/ElementIds';
import {
  EMAIL_PATTERN,
  PAYER_CODE_PATTERN,
  PHONE_PATTERN,
  REQUIRED_COLUMN_KEYS,
  REQUIRED_COLUMN_NAMES,
  REQUIRED_ROW_ACTIONS,
  STATUS_TONE_CASES,
} from '../../../data/payers/payerListMetrics.data';
import { ALLOWED_TRANSITIONS } from '../../../data/payers/lifecycleGuardrails.data';

/**
 * User story: View Paginated Payer List with Metrics.
 * The table's shape, its data formats, and its status colour coding.
 *
 * Opening the list is `critical` throughout: every assertion here reads the
 * table, so if the list never rendered, asserting on its columns would report a
 * failure about a screen that was never exercised.
 */
test.describe('View Paginated Payer List with Metrics - Table shape and formats', () => {
  // Azure test case 14444
  test('14444: should display every required column and offer working row actions', async ({
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

  // Azure test case 14444
  test('14444: should render Email, Phone and PayerCode in their expected formats', async ({
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

  // Azure test case 14445
  test('14445: should colour-code Active, Pending, Inactive and Expired distinctly', async ({
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

  // Azure test case 14460
  test('14460: should offer each row the actions its own status allows, and no others', async ({
    payerManagementPage,
    steps,
  }) => {
    test.slow();

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // 14444 above proves a row's actions are rendered and usable. This is the
    // separate question: that WHICH actions appear depends on the row's status.
    // A table that offered every action on every row would satisfy 14444
    // completely and be wrong here - an Active payer would be offered a
    // reactivation, and an Expired one a withdrawal it cannot perform.
    //
    // The expectation is read from the same matrix the status-transition story
    // asserts against, so the two cannot drift apart.
    const STATUS_ACTIONS = ['activate', 'inactivate'] as const;
    const exercised: string[] = [];
    const absent: string[] = [];
    const wrong: string[] = [];

    for (const status of ['Active', 'Inactive', 'Expired'] as const) {
      await steps.step(`A ${status} row offers exactly what the matrix allows`, async () => {
        await payerManagementPage.open();
        await payerManagementPage.filterByStatus(status);
        const names = await payerManagementPage.getVisiblePayerNames();
        if (names.length === 0) {
          // Not a failure: the register need not hold a payer in every status.
          // Recorded so the closing assertion can say what was not covered.
          absent.push(status);
          return;
        }

        const allowed = ALLOWED_TRANSITIONS.filter((row) => row.status === status).map(
          (row) => row.action,
        );
        const offered = await payerManagementPage.getEnabledRowActions(names[0], STATUS_ACTIONS);
        exercised.push(status);

        const missing = allowed.filter((action) => !offered.includes(action));
        const extra = offered.filter((action) => !allowed.includes(action as 'activate'));
        if (missing.length > 0 || extra.length > 0) {
          wrong.push(
            `${status} ("${names[0]}") offered [${offered.join(', ') || 'none'}] `
            + `but the matrix allows [${allowed.join(', ') || 'none'}]`,
          );
        }
      });
    }

    // THE GUARD. With one status in the list there is nothing to compare
    // against, and "every row offered what it should" would be true of a table
    // that varied its actions not at all.
    await steps.critical('At least two different statuses were on the list to compare', () => {
      expect(
        exercised.length,
        `this case can only discriminate across statuses, and the list held only `
          + `[${exercised.join(', ') || 'none'}] (absent: ${absent.join(', ') || 'none'}). `
          + 'Seed a payer in a second status and re-run.',
      ).toBeGreaterThan(1);
      return Promise.resolve();
    });

    await steps.step('No row offered an action its status forbids', async () => {
      expect(
        wrong,
        `row actions should follow the payer's status: ${wrong.join('; ')}`,
      ).toEqual([]);
      await payerManagementPage.resetFilters();
    });
  });

  test('16456: should render the payer list as a table rather than as cards', async ({
    payerManagementPage,
    page,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // THE VIEW IS A STORED PREFERENCE, not a fresh default, and this case is
    // the one place that matters. The application remembers each user's choice
    // server-side, so "the first time, with no preference set" cannot be
    // reproduced by a suite signing in as an account that has used the module
    // before - and ours has. What CAN be asserted is the half the sheet's
    // criterion really turns on: the table layout is the one on offer, the
    // toggle exists, and Table is a reachable, real state rather than a card
    // grid with no way out.
    await steps.step('The toggle offers a table view and a card view', async () => {
      await expect(
        page.locator(byId(GLOBAL.viewToggleTable)),
        'the list should offer a table view',
      ).toBeVisible();
      await expect(
        page.locator(byId(GLOBAL.viewToggleCards)),
        'and a card view to switch away from',
      ).toBeVisible();
    });

    await steps.step('The rows render as a table with shared column headers', async () => {
      const headers = await payerManagementPage.getColumnKeys();
      expect(
        headers.length,
        'a table shares one set of column headers across every row; a card layout has none',
      ).toBeGreaterThan(0);
      await payerManagementPage.expectRowsRendered();
    });
  });
});
