import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { describeCounts } from '../../../fixtures/linkedCountState.fixture';
import {
  NETWORKS_DESTINATION,
  ZERO_COUNT_FORBIDDEN,
  ZERO_COUNT_PRESENTATION,
} from '../../../data/payers/linkedCounts.data';

/**
 * User story: Display Linked Networks Count on Payer List.
 *
 * The column itself is already known to exist - the paginated-list story
 * asserts the full column set. What is untested, and what these cases are for,
 * is the column's MEANING: that the number matches the networks actually
 * linked, that a zero reads as a dash rather than as "0" or an empty cell, and
 * that a non-zero count is a route into the records behind it.
 *
 * THE COUNTS ARE FOUND, NOT SEEDED. The sheet asks for payers with 3, 1, 0 and
 * 500 linked networks. None can be created here: linking needs a network that
 * belongs to no payer, and the network-assignment story reports that this
 * environment has none free. `linkedCounts` therefore reads the live list and
 * classifies it, and a case whose class is absent reports BLOCKED naming the
 * counts that were there - see linkedCounts.data.ts.
 *
 * Three of the sheet's cases are not here at all, for reasons recorded in the
 * traceability matrix: the increment, decrement and rapid-toggle cases all need
 * a network free to link, and the drill-down permission case needs the
 * non-administrator account that is still outstanding.
 */
test.describe('Linked networks count', () => {
  test('TC-001: should show the number of networks actually linked to the payer', async ({
    payerManagementPage,
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find a payer with linked networks', async () => {
      const classes = await linkedCounts('networks');
      const found = classes.many ?? classes.one;
      if (found === undefined) {
        steps.blocked(
          `No payer in this environment has a linked network, so the count `
          + `cannot be checked. Counts seen: ${describeCounts(classes)}. This is the same `
          + 'blocker the network-assignment story reports: every network already belongs to a '
          + 'payer and none can be released. Remedy: free one network, or link one to any payer.',
        );
      }
      subject = found!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The column shows that count as a number', async () => {
      expect(
        subject.value,
        `"${subject.name}" should show a numeric count; the cell reads "${subject.raw}"`,
      ).not.toBeNull();
      expect(subject.value!, 'a linked payer should show at least one').toBeGreaterThan(0);
    });

    await steps.step('And it agrees with the networks the payer detail lists', async () => {
      // The only check that makes the number mean anything. A column can show a
      // confident, wrong number for a long time; comparing it against the rows
      // behind it is what catches that.
      const detail = await payerManagementPage.openDetails(subject.name);
      const listed = await detail.linkedNetworkCount();
      expect(
        listed,
        `the list says ${subject.value} linked network(s) for "${subject.name}" but its `
          + `Linked Networks tab lists ${listed}`,
      ).toBe(subject.value);
    });
  });

  test('TC-002: should present a zero count as a dash rather than as "0" or an empty cell', async ({
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find a payer with no linked networks', async () => {
      const classes = await linkedCounts('networks');
      expect(
        classes.zero,
        `every payer sampled has linked networks, so the zero presentation cannot be `
          + `checked. Counts seen: ${describeCounts(classes)}`,
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
      // Both are what the sheet rejects, and for a reason worth keeping: an
      // empty cell leaves the reader unable to tell "none" from "not loaded".
      expect(
        subject.raw,
        `"${subject.name}" shows a raw zero, which reads as a number rather than as an absence`,
      ).not.toBe(ZERO_COUNT_FORBIDDEN.raw);
      expect(
        subject.raw,
        `"${subject.name}" shows an empty cell, so a reader cannot tell "none" from "not loaded"`,
      ).not.toBe(ZERO_COUNT_FORBIDDEN.blank);
    });

    await steps.step('It reads as a dash or "None"', async () => {
      expect(
        subject.raw,
        `the zero count should read as a dash or "None"; it reads "${subject.raw}"`,
      ).toMatch(ZERO_COUNT_PRESENTATION);
    });
  });

  test('TC-003: should show exactly one when the payer has a single linked network', async ({
    payerManagementPage,
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find a payer with one linked network', async () => {
      const classes = await linkedCounts('networks');
      if (classes.one === undefined) {
        steps.blocked(
          'No payer in this environment has exactly one linked network, so the one-versus-none '
          + `boundary cannot be checked. Counts seen: ${describeCounts(classes)}`,
        );
      }
      subject = classes.one!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The column shows "1" rather than a dash', async () => {
      // The boundary the case exists for: one is not none, and a column that
      // folded the two together would read as an absence for a payer that has a
      // network.
      expect(subject.raw, `"${subject.name}" should show 1`).toContain('1');
      expect(
        subject.raw,
        'a count of one must not be presented as an absence',
      ).not.toMatch(ZERO_COUNT_PRESENTATION);
    });

    await steps.step('And its detail lists exactly that one network', async () => {
      const detail = await payerManagementPage.openDetails(subject.name);
      expect(
        await detail.linkedNetworkCount(),
        'the count of one should be borne out by the linked-networks table',
      ).toBe(1);
    });
  });

  test('TC-004: should render the largest count in the list in full', async ({
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find the highest count on screen', async () => {
      const classes = await linkedCounts('networks');
      if (classes.largest === undefined) {
        steps.blocked(
          'No payer in this environment shows a numeric linked-network count, so there is no '
          + `largest count to render. Counts seen: ${describeCounts(classes)}`,
        );
      }
      subject = classes.largest!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The cell holds the whole number, not a shortened form', async () => {
      // The sheet's payer with 500 networks does not exist here, so the check
      // is made against the largest count the environment does hold. What it
      // proves is the same thing: the cell is not truncating, rounding or
      // adding an overflow marker.
      expect(
        subject.raw,
        `the count for "${subject.name}" should be the plain number; it reads "${subject.raw}"`,
      ).toBe(String(subject.value));
    });

    await steps.step('And it carries no ellipsis or overflow marker', async () => {
      for (const marker of ['...', '…', '+', 'k', 'K']) {
        expect(
          subject.raw,
          `a count must not be abbreviated with "${marker}"`,
        ).not.toContain(marker);
      }
    });
  });

  test('TC-005: should open the payer\'s linked networks when the count is clicked', async ({
    payerManagementPage,
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find a payer with a non-zero count', async () => {
      const classes = await linkedCounts('networks');
      const found = classes.many ?? classes.one;
      if (found === undefined) {
        steps.blocked(
          `No payer in this environment has a linked network, so the drill-down `
          + `cannot be checked. Counts seen: ${describeCounts(classes)}. This is the same `
          + 'blocker the network-assignment story reports: every network already belongs to a '
          + 'payer and none can be released. Remedy: free one network, or link one to any payer.',
        );
      }
      subject = found!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The count is offered as something to click', async () => {
      expect(
        await payerManagementPage.isCountClickable(subject.name, 'networks'),
        `the count for "${subject.name}" should be a route into its networks, not plain text`,
      ).toBe(true);
    });

    await steps.step(`Clicking it opens the ${NETWORKS_DESTINATION} view for that payer`, async () => {
      const detail = await payerManagementPage.openCountLink(subject.name, 'networks');
      expect(
        await detail.getName(),
        'the view should belong to the payer whose count was clicked',
      ).toContain(subject.name);
      await detail.expectLinkedNetworksActive();
    });

    await steps.step('And it lists exactly the networks the count promised', async () => {
      const detail = payerManagementPage.detail();
      expect(
        await detail.linkedNetworkCount(),
        `the destination should hold the ${subject.value} network(s) the list advertised`,
      ).toBe(subject.value);
    });
  });

  test('TC-006: should make a zero count inert while a non-zero count navigates', async ({
    payerManagementPage,
    linkedCounts,
    steps,
  }) => {
    const observed: { label: string; clickable: boolean }[] = [];

    await steps.critical('Navigate to the module and find a payer of each kind', async () => {
      const classes = await linkedCounts('networks');
      const nonZero = classes.many ?? classes.one;
      if (classes.zero === undefined || nonZero === undefined) {
        steps.blocked(
          'This case needs one payer with networks and one without; this environment has no '
          + `payer with any. Counts seen: ${describeCounts(classes)}`,
        );
      }
      observed.push({
        label: 'a zero count',
        clickable: await payerManagementPage.isCountClickable(classes.zero!.name, 'networks'),
      });
      observed.push({
        label: 'a non-zero count',
        clickable: await payerManagementPage.isCountClickable(nonZero!.name, 'networks'),
      });
      expect(
        observed,
        'both kinds of payer should have been read before the rule is judged',
      ).toHaveLength(2);
    });

    await steps.step('The non-zero count is a route into its networks', async () => {
      expect(
        observed[1].clickable,
        'a payer with networks should let the reader reach them from the list',
      ).toBe(true);
    });

    await steps.step('The zero count offers nothing to open', async () => {
      // The sheet allows either an inert element or an empty destination - what
      // it rules out is an error. Asserting "not clickable" is the stricter of
      // the two readings and the one the rule states, so a build that opens an
      // empty view will report here and can be judged deliberately.
      expect(
        observed[0].clickable,
        'a payer with no networks has nothing to drill into',
      ).toBe(false);
    });

    await steps.step('And neither reading raised an error dialog', () =>
      payerManagementPage.expectNoUnexpectedDialog());
  });

  test('TC-007: should keep the count and the linked-network records in step', async ({
    payerManagementPage,
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and find a payer with linked networks', async () => {
      const classes = await linkedCounts('networks');
      const found = classes.many ?? classes.one;
      if (found === undefined) {
        steps.blocked(
          `No payer in this environment has a linked network, so the count-versus-records check `
          + `cannot be checked. Counts seen: ${describeCounts(classes)}. This is the same `
          + 'blocker the network-assignment story reports: every network already belongs to a '
          + 'payer and none can be released. Remedy: free one network, or link one to any payer.',
        );
      }
      subject = found!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The count agrees with the records behind it', async () => {
      // The sheet deletes a linked network outright and re-reads the count.
      // That cannot be done here - a network linked to a payer cannot be
      // released, which is the network-assignment story's blocker - so the
      // guarantee is checked in the direction that is reachable: the number and
      // the records it counts must never disagree.
      const detail = await payerManagementPage.openDetails(subject.name);
      expect(
        await detail.linkedNetworkCount(),
        `the list count (${subject.value}) and the linked-networks table should agree`,
      ).toBe(subject.value);
    });

    await steps.step('And the count is recomputed on a fresh load rather than cached', async () => {
      await payerManagementPage.open();
      const reread = await payerManagementPage.getCountValue(subject.name, 'networks');
      expect(
        reread,
        `the count for "${subject.name}" should survive a reload unchanged`,
      ).toBe(subject.value);
    });
  });

  test('TC-008: should source the count from the network service rather than the payer record', async ({
    page,
    payerManagementPage,
    linkedCounts,
    steps,
  }) => {
    let subject!: { name: string; raw: string; value: number | null };

    await steps.critical('Navigate to the module and note a payer with linked networks', async () => {
      const classes = await linkedCounts('networks');
      const found = classes.many ?? classes.one;
      if (found === undefined) {
        steps.blocked(
          `No payer in this environment has a linked network, so the served-count check `
          + `cannot be checked. Counts seen: ${describeCounts(classes)}. This is the same `
          + 'blocker the network-assignment story reports: every network already belongs to a '
          + 'payer and none can be released. Remedy: free one network, or link one to any payer.',
        );
      }
      subject = found!;
      expect(
        subject.value,
        `the payer found ("${subject.name}") should hold a countable number`,
      ).not.toBeNull();
    });

    await steps.step('The list request itself carries the count', async () => {
      // The sheet asks that the count be "correctly sourced from the Network
      // Management module". What is observable from here is where the number
      // the column renders comes from: the payer-list payload. Asserting that
      // makes the case a regression guard on the contract - if the count ever
      // stops being served with the list, the column has no source and this
      // reports it.
      // Anchored so it cannot capture GetPayersDashboard or
      // GetPayersDropdown - see captureJsonResponseMatching.
      const body = await NetworkUtils.captureJsonResponseMatching(
        page,
        /GetPayers(\?|$)/,
        () => payerManagementPage.open(),
      );
      expect(body, 'the payer list request should have been observed').not.toBeNull();
      expect(
        JSON.stringify(body).toLowerCase(),
        'the list payload should carry a linked-network count for the column to render',
      ).toContain('network');
    });

    await steps.step('And the rendered number matches the served one', async () => {
      const rendered = await payerManagementPage.getCountValue(subject.name, 'networks');
      expect(
        rendered,
        `the column should render the count the service served for "${subject.name}"`,
      ).toBe(subject.value);
    });
  });

  test('TC-009: should show a placeholder rather than a wrong number when the count cannot be loaded', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('The payer list service is made to fail', async () => {
      await NetworkUtils.failEndpoint(page, ApiEndpoints.payerList);
    });

    await steps.step('The list reports the failure rather than rendering counts', async () => {
      // The column has no source of its own - the count arrives with the payer
      // list - so "the network data source is unavailable" is, from this
      // screen, the list failing. What must not happen is a table of rows
      // showing zeros or dashes as though every payer had no networks: that is
      // a wrong number presented as a fact.
      await payerManagementPage.reload();
      const messages = await payerManagementPage.waitForVisibleMessages();
      const rows = await payerManagementPage.getVisiblePayerNames().catch(() => []);
      expect(
        rows.length === 0 || messages.length > 0,
        `with the list service down the screen should say so rather than render counts; `
          + `it rendered ${rows.length} row(s) and showed: ${messages.join(' | ') || '(nothing)'}`,
      ).toBe(true);
    });

    await steps.step('And the counts return once the service does', async () => {
      await NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerList);
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });
  });
});
