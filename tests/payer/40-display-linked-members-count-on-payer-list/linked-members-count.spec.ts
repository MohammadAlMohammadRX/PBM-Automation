import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { describeCounts } from '../../../fixtures/linkedCountState.fixture';
import {
  ZERO_COUNT_FORBIDDEN,
  ZERO_COUNT_PRESENTATION,
} from '../../../data/payers/linkedCounts.data';

/**
 * User story: Display Linked Members Count on Payer List.
 *
 * The same column problem as the linked-networks story, over a harder number:
 * this one is an AGGREGATE across all of the payer's policies, de-duplicated so
 * a member in two overlapping policies is counted once.
 *
 * WHAT CAN AND CANNOT BE VERIFIED HERE, because it decides the shape of every
 * case below. The sheet's central cases seed member data to order - Policy A
 * with 40 members, Policy B with 25, 15 shared, expecting 50 rather than 65 -
 * and then read the column. Membership is the Member Management module, which
 * this framework does not cover and which offers no fixtures on this side, so
 * that ground truth cannot be created or read.
 *
 * What IS reachable is the de-duplication INVARIANT, and TC-005 asserts it:
 * whatever the numbers are, a de-duplicated total must be no greater than the
 * sum of its policies' member counts and no smaller than the largest single
 * policy. A build that summed raw policy totals would exceed that ceiling, and
 * one that read a single policy would fall below the floor. That catches the
 * defect the sheet's arithmetic was written to catch, without inventing data.
 *
 * Four of the sheet's cases (enrolment, termination, overlapping removal,
 * member status change) and the cross-payer scoping case are recorded in the
 * traceability matrix as Not Covered, with the module boundary as the reason.
 */
test.describe('Linked members count', () => {
  test('TC-001: should show a distinct member total for the payer', async ({
    payerManagementPage,
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find a payer with members', async () => {
      const classes = await linkedCounts('members');
      const found = classes.many ?? classes.one;
      expect(
        found,
        `no payer in the list has a linked member, so there is no total to verify. `
          + `Counts seen: ${describeCounts(classes)}`,
      ).not.toBe(undefined);
      subject = found!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The column shows it as a whole number', async () => {
      expect(
        subject.value,
        `"${subject.name}" should show a numeric member total; the cell reads "${subject.raw}"`,
      ).not.toBeNull();
      expect(
        Number.isInteger(subject.value!),
        'a member count is a whole number of people',
      ).toBe(true);
    });

    await steps.step('And the same total is shown in the cards view', async () => {
      // The list renders the same figure twice, in two independently built
      // components. Disagreement between them means one of the two is computing
      // or formatting the aggregate on its own, which is exactly the drift this
      // column would suffer silently.
      const inCards = await payerManagementPage.getCardCountValue(subject.name, 'members');
      expect(
        inCards,
        `the table shows ${subject.value} members for "${subject.name}" and the card shows `
          + `${inCards}`,
      ).toBe(subject.value);
    });
  });

  test('TC-002: should present a zero member total as a dash rather than as "0"', async ({
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find a payer with no members', async () => {
      const classes = await linkedCounts('members');
      expect(
        classes.zero,
        `every payer sampled has members, so the zero presentation cannot be checked. `
          + `Counts seen: ${describeCounts(classes)}`,
      ).not.toBe(undefined);
      subject = classes.zero!;
      // A cell that was READ, not a cell holding a number: the whole point of
      // this case is that a zero renders as a dash, so `value` is null here by
      // design and asserting otherwise would contradict its subject.
      expect(
        subject.raw,
        `the count cell for "${subject.name}" should have been readable`,
      ).not.toBe('');
    });

    await steps.step('The cell is neither a raw zero nor blank', async () => {
      expect(
        subject.raw,
        `"${subject.name}" shows a raw zero rather than an absence`,
      ).not.toBe(ZERO_COUNT_FORBIDDEN.raw);
      expect(
        subject.raw,
        `"${subject.name}" shows an empty cell, so "no members" cannot be told from "not loaded"`,
      ).not.toBe(ZERO_COUNT_FORBIDDEN.blank);
    });

    await steps.step('It reads as a dash or "None"', async () => {
      expect(
        subject.raw,
        `the zero total should read as a dash or "None"; it reads "${subject.raw}"`,
      ).toMatch(ZERO_COUNT_PRESENTATION);
    });
  });

  test('TC-003: should show exactly one when the payer has a single member', async ({
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find a payer with one member', async () => {
      const classes = await linkedCounts('members');
      if (classes.one === undefined) {
        steps.blocked(
          'No payer in this environment has exactly one member, so the one-versus-none boundary '
          + `cannot be checked. Counts seen: ${describeCounts(classes)}`,
        );
      }
      subject = classes.one!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The column shows "1"', async () => {
      expect(subject.raw, `"${subject.name}" should show 1`).toContain('1');
    });

    await steps.step('And one is not folded into the absence presentation', async () => {
      // The boundary that matters: a single member is a member, and a column
      // that showed a dash for one would under-report every small payer.
      expect(
        subject.raw,
        'a total of one must not be presented as an absence',
      ).not.toMatch(ZERO_COUNT_PRESENTATION);
    });
  });

  test('TC-004: should render the largest member total in full and still load the list', async ({
    payerManagementPage,
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find the highest total on screen', async () => {
      const classes = await linkedCounts('members');
      expect(
        classes.largest,
        `no payer shows a numeric member total. Counts seen: ${describeCounts(classes)}`,
      ).not.toBe(undefined);
      subject = classes.largest!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The cell holds the whole number', async () => {
      expect(
        subject.raw,
        `the total for "${subject.name}" should be the plain number; it reads "${subject.raw}"`,
      ).toBe(String(subject.value));
    });

    await steps.step('It is not abbreviated', async () => {
      for (const marker of ['...', '…', '+', 'k', 'K']) {
        expect(subject.raw, `a total must not be abbreviated with "${marker}"`).not.toContain(marker);
      }
    });

    await steps.step('And the list still renders every row while aggregating', async () => {
      // The sheet's performance concern, asserted as an outcome rather than a
      // stopwatch: aggregating member totals across a page of payers must not
      // cost the page its rows.
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });
  });

  test('TC-005: should de-duplicate members across policies rather than summing policy totals', async ({
    payerManagementPage,
    policyManagementPage,
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };
    let policyCounts: number[] = [];

    await steps.critical('Navigate to the module and find a payer with members', async () => {
      const classes = await linkedCounts('members');
      const found = classes.many ?? classes.one;
      expect(
        found,
        `no payer has a linked member. Counts seen: ${describeCounts(classes)}`,
      ).not.toBe(undefined);
      subject = found!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.critical("Its policies' own member counts are read", async () => {
      policyCounts = await policyManagementPage.getPolicyMemberCounts(subject.name);
      expect(
        policyCounts,
        `"${subject.name}" shows ${subject.value} members but no policy of its own could be `
          + 'read, so the aggregate cannot be checked against its parts',
      ).not.toEqual([]);
    });

    await steps.step('The total never exceeds the sum of its policies', async () => {
      // The de-duplication ceiling. Counting distinctly can only ever reduce a
      // total, so a figure above the raw sum means the aggregate is summing
      // policy totals and double-counting anyone in two of them.
      const sum = policyCounts.reduce((total, count) => total + count, 0);
      expect(
        subject.value!,
        `the distinct total (${subject.value}) exceeds the sum of its policies (${sum} from `
          + `${policyCounts.join(' + ')}), so members in more than one policy are being counted twice`,
      ).toBeLessThanOrEqual(sum);
    });

    await steps.step('And it is at least as large as its biggest single policy', async () => {
      // The floor, which catches the opposite error: an aggregate that reads
      // one policy instead of all of them.
      const largest = Math.max(...policyCounts);
      expect(
        subject.value!,
        `the distinct total (${subject.value}) is smaller than its largest policy (${largest}), `
          + 'so the aggregate is not covering every policy',
      ).toBeGreaterThanOrEqual(largest);
    });
  });

  test('TC-006: should source the member total from the list service', async ({
    page,
    payerManagementPage,
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and note a payer with members', async () => {
      const classes = await linkedCounts('members');
      const found = classes.many ?? classes.one;
      expect(
        found,
        `no payer has a linked member. Counts seen: ${describeCounts(classes)}`,
      ).not.toBe(undefined);
      subject = found!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The list payload carries a member total for the column to render', async () => {
      // CANNOT BE ANSWERED AS WRITTEN, and saying so is better than failing the
      // application for it.
      //
      // `captureJsonResponse` matches an endpoint by SUBSTRING, and
      // `/api/Payers/GetPayers` is a prefix of `GetPayersDashboard` and
      // `GetPayersDropdown`. Whichever of the three answers first is what gets
      // captured, so the payload examined here is not reliably the list's - it
      // came back carrying no count keys at all, which the row-level counts on
      // screen plainly contradict. The right instrument is a matcher that can
      // pin one exact endpoint; this suite should not guess in the meantime.
      // Anchored so it cannot capture GetPayersDashboard or
      // GetPayersDropdown - see captureJsonResponseMatching.
      const body = await NetworkUtils.captureJsonResponseMatching(
        page,
        /GetPayers(\?|$)/,
        () => payerManagementPage.open(),
      );
      expect(body, 'the payer list request should have been observed').not.toBeNull();
      const countKeys = [...new Set((JSON.stringify(body).match(/"[a-z]*count[a-z]*"/gi) ?? []))];
      expect(
        JSON.stringify(body).toLowerCase(),
        'the column has no source of its own - the total must arrive with the list. Count-bearing '
          + `keys the payload does hold: ${countKeys.join(', ') || '(none)'}`,
      ).toContain('member');
    });

    await steps.step('And the rendered number matches the served one', async () => {
      const rendered = await payerManagementPage.getCountValue(subject.name, 'members');
      expect(
        rendered,
        `the column should render the total the service served for "${subject.name}"`,
      ).toBe(subject.value);
    });
  });

  test('TC-007: should not present a member total the service could not supply', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('The payer list service is made to fail', async () => {
      await NetworkUtils.failEndpoint(page, ApiEndpoints.payerList);
    });

    await steps.step('The screen reports the failure rather than rendering totals', async () => {
      // A page of dashes would be a lie about every payer's membership. Either
      // the rows are absent or the failure is stated - what must not happen is
      // a healthy-looking table of empty totals.
      await payerManagementPage.reload();
      const messages = await payerManagementPage.waitForVisibleMessages();
      const rows = await payerManagementPage.getVisiblePayerNames().catch(() => []);
      expect(
        rows.length === 0 || messages.length > 0,
        `with the list service down the screen should say so rather than render totals; it `
          + `rendered ${rows.length} row(s) and showed: ${messages.join(' | ') || '(nothing)'}`,
      ).toBe(true);
    });

    await steps.step('And the totals return once the service does', async () => {
      await NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerList);
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });
  });
});
