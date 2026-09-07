import { test as base } from '@playwright/test';
import { expect } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { PAYER_COLUMN } from '../constants/ElementIds';
import { Timeouts } from '../constants/Timeouts';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';
import type { StatusFilterOption } from '../data/payers/filterPayer.data';
import { SAMPLE_SIZE } from '../data/payers/payerSelection.data';

/**
 * Preconditions expressed as "an EXISTING payer that displays status X".
 *
 * Several of these stories need payers that are not Active - to prove each is
 * excluded from the cross-module dropdown, or to check a status's colour band.
 * Manufacturing an Expired payer means back-dating an expiry the wizard will
 * not accept, and an Inactive one means a full inactivate-plus-approve round
 * trip per test, so these fixtures SAMPLE the environment instead of seeding
 * it. That makes them read-only and side-effect free - hence no teardown - and
 * keeps the suite from adding permanent Expired/Inactive records to a shared
 * environment on every run.
 *
 * TWO THINGS THESE FIXTURES GET RIGHT THAT A NAIVE READ DOES NOT, both learned
 * the hard way against the live application:
 *
 *   1. THE LIST RE-QUERIES ASYNCHRONOUSLY. Reading the rows straight after
 *      applying a filter returns the PREVIOUS result set. Sampled that way, a
 *      request for "an Expired payer" came back with Active ones, and the tests
 *      built on it reported defects that did not exist. So the rows are read
 *      only once two consecutive reads agree.
 *
 *   2. THE STATUS FILTER DOES NOT GUARANTEE THE STATUS. Filtering to Active
 *      returns rows displaying "Not Live" as well, so the filter alone is not
 *      evidence of a row's status. Every sampled name is therefore verified
 *      against the row's own Status cell, and only rows that actually display
 *      the requested status are returned.
 *
 * When the environment holds no payer displaying a required status the fixture
 * reports BLOCKED rather than failing: the rule under test was never exercised,
 * so calling it a failure would assert something never observed.
 */

export interface PayerIdentityFixtures {
  /**
   * Payer names whose Status cell DISPLAYS `displayedStatus`, using `filter` to
   * bring them on screen.
   *
   * A function rather than a pre-computed map, because sampling costs a filter
   * round trip per status and no single test needs all of them.
   */
  payerSample: (
    filter: StatusFilterOption,
    displayedStatus: string,
    limit?: number,
  ) => Promise<string[]>;
}

export const test = base.extend<PayerIdentityFixtures>({
  payerSample: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);

    await use(async (filter, displayedStatus, limit = SAMPLE_SIZE) => {
      try {
        return await sampleRows(
          payerPage,
          filter,
          (status) => status === displayedStatus,
          limit,
        );
      } catch (error) {
        // The list itself would not settle - an environment problem, not a
        // statement about the rule under test, so the test is BLOCKED rather
        // than failed.
        blockedByPrecondition(testInfo, `the payer list filtered to "${filter}"`, error);
      }
    });
  },
});

/**
 * Filters the payer list, waits for it to settle, and returns the names of the
 * rows whose Status cell satisfies `matches`.
 *
 * Names and statuses are read as PAIRS in one pass, so a row's name is always
 * matched against its own status - reading the two columns separately would let
 * a re-render between them pair a name with another row's status.
 */
async function sampleRows(
  payerPage: PayerManagementPage,
  filter: StatusFilterOption,
  matches: (displayedStatus: string) => boolean,
  limit: number,
): Promise<string[]> {
  Logger.step(`[fixture] Sampling up to ${limit} payer(s) under the "${filter}" filter`);
  await payerPage.open();
  await payerPage.filterByStatus(filter);

  // Wait for rows that are CONSISTENT WITH THE FILTER, not merely for the table
  // to stop changing.
  //
  // "Stopped changing" is not enough, and this is the subtle part: the list
  // re-queries asynchronously, so the rows can be perfectly stable while still
  // being the PREVIOUS result set. A sample taken then finds nothing matching
  // and reports "the environment holds no such payer" - which is a false
  // statement about the environment, and it made an exclusion check fail
  // intermittently while the data was fine.
  //
  // So the poll resolves on either:
  //   'found'  - a row matching the wanted status is on screen; or
  //   'none'   - rows have been present but non-matching for several SPACED
  //              reads, which is the honest "there really are none".
  //
  // The reads are spaced ON PURPOSE. Back-to-back polls all land inside the
  // same stale render, so counting consecutive non-matching reads without an
  // interval concludes "none exist" in under a second while the previous result
  // set is still on screen. That is exactly how a sample for "an Inactive
  // payer" reported none against an environment holding three of them. The
  // intervals below give the re-query time to land; 'found' still
  // short-circuits immediately, so the cost is paid only when the answer really
  // is "none".
  let latest: { name: string; status: string }[] = [];
  let consecutiveNonMatching = 0;

  await expect
    .poll(
      async () => {
        latest = await payerPage.getRowPairs(PAYER_COLUMN.payerName, PAYER_COLUMN.status);
        if (latest.some((row) => matches(row.status))) return 'found';
        consecutiveNonMatching = latest.length > 0 ? consecutiveNonMatching + 1 : 0;
        return consecutiveNonMatching >= 3 ? 'none' : 'loading';
      },
      {
        timeout: Timeouts.default,
        intervals: [500, 1_000, 1_000, 1_000],
        message: `the payer list should settle after filtering to "${filter}"`,
      },
    )
    .not.toBe('loading');

  const wanted = latest
    .filter((row) => matches(row.status))
    .map((row) => row.name)
    .filter((name) => name !== '' && name !== '—');

  // De-duplicated: two payers may legitimately share a name, and a test that
  // assumed a sampled name identified one record would act on whichever row
  // came first.
  return [...new Set(wanted)].slice(0, limit);
}
