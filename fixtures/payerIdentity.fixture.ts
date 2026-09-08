import { test as base } from '@playwright/test';
import { expect } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { PAYER_COLUMN } from '../constants/ElementIds';
import { Timeouts } from '../constants/Timeouts';
import { withoutProtected } from '../constants/ProtectedData';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';
import type { StatusFilterOption } from '../data/payers/filterPayer.data';
import { SAMPLE_SIZE } from '../data/payers/payerSelection.data';

/**
 * How many high-version payers to examine when hunting for a version status.
 *
 * Bounded on purpose: the question is whether such a payer exists at all, and
 * each candidate costs a detail-screen navigation. Unbounded scanning would turn
 * a missing precondition into a multi-minute timeout.
 */
const CANDIDATE_LIMIT = 8;

/** How many list pages to gather candidates from before giving up. */
const CANDIDATE_PAGES = 6;

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

  /**
   * The name of a payer carrying at least `minVersions` versions.
   *
   * Needed by the approval-status vocabulary cases, and it is the one
   * precondition in that story that cannot be created on demand: `Superseded`
   * and `Rejected` appear only in a payer's Version History, and a payer only
   * accumulates superseded versions by being edited and re-approved repeatedly.
   * Manufacturing one would mean several full maker-checker round trips per
   * test.
   *
   * The version count is read from the LIST's Approval Status cell (`v9 ·
   * Published`), so the search costs one page read rather than opening every
   * payer's history tab.
   *
   * Reports BLOCKED when the environment holds no such payer, rather than
   * failing: the labels under test were never displayed, so there is nothing to
   * be right or wrong about.
   */
  payerWithVersionHistory: (minVersions: number) => Promise<string>;

  /**
   * The name of a payer whose VERSION HISTORY actually contains `status`.
   *
   * `payerWithVersionHistory` above is not enough for the label cases, and the
   * difference is subtle enough that it caused two false failures: a payer can
   * sit at v2 with a history of [v2 Pending Approval, v1 Published] and hold no
   * Superseded entry at all, because a version is only superseded once a LATER
   * one is published over it. Asking for a version count therefore does not ask
   * for the status.
   *
   * So this opens candidates' history tabs, highest version first, and returns
   * the first payer that genuinely displays the wanted status. Costlier than a
   * list read, and correct.
   *
   * Returns the payer's ID as well as its name, and the id is what callers
   * should use. Payer names are not unique in this register, so a later
   * `openDetails(name)` can land on a different record - and after a language
   * switch the English name matches nothing at all. The id is free here: the
   * fixture is already standing on the payer's detail page when it finds it.
   */
  payerWithVersionStatus: (status: string) => Promise<{ name: string; payerId: string }>;
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

  payerWithVersionHistory: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);

    await use(async (minVersions) => {
      Logger.step(`[fixture] Looking for a payer with at least ${minVersions} version(s)`);
      await payerPage.open();

      const found = await payerPage.findPayerWithVersionsAtLeast(minVersions);
      if (found === null) {
        blockedByPrecondition(
          testInfo,
          `a payer carrying at least ${minVersions} versions. Superseded and Rejected appear `
            + 'only in a payer\'s Version History, and a payer accumulates those only by being '
            + 'edited and re-approved repeatedly',
          new Error(
            `no payer in the pages scanned shows "v${minVersions}" or higher in its Approval `
              + 'Status cell',
          ),
        );
      }
      return found;
    });
  },

  payerWithVersionStatus: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);

    await use(async (status) => {
      Logger.step(`[fixture] Looking for a payer whose history shows "${status}"`);
      await payerPage.open();

      // Candidates highest-version-first: a payer at v9 has eight non-current
      // versions and is overwhelmingly likely to hold a superseded one, while a
      // payer at v2 may hold none at all.
      const candidates = await payerPage.listPayersByVersionDescending(CANDIDATE_LIMIT, CANDIDATE_PAGES);

      for (const candidate of candidates) {
        const detail = await payerPage.openDetails(candidate);
        const history = detail.versionHistory();
        await history.open();
        const statuses = await history.getListedStatuses();
        if (statuses.includes(status)) {
          // Taken from the URL we are already on - no extra navigation, and no
          // name-based lookup that a duplicate name could redirect.
          const payerId = page.url().split('/').pop() ?? '';
          Logger.step(`[fixture] "${candidate}" (${payerId}) shows "${status}"`);
          return { name: candidate, payerId };
        }
        await payerPage.open();
      }

      blockedByPrecondition(
        testInfo,
        `a payer whose version history displays "${status}". That status appears only on a `
          + 'version that has been replaced or refused, so it needs a payer that has been '
          + 'edited and re-approved at least twice',
        new Error(
          `none of the ${candidates.length} highest-versioned payers examined shows `
            + `"${status}" in its version history`,
        ),
      );
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

  // Protected records are dropped before a test ever sees one. A sampled name
  // is something the caller may act on - inactivate, delete, edit - and the
  // seeded auto-discard registrations must not be touched. Excluding them here
  // means no future story has to remember to.
  const wanted = withoutProtected(
    latest
      .filter((row) => matches(row.status))
      .map((row) => row.name)
      .filter((name) => name !== '' && name !== '—'),
  );

  // De-duplicated: two payers may legitimately share a name, and a test that
  // assumed a sampled name identified one record would act on whichever row
  // came first.
  return [...new Set(wanted)].slice(0, limit);
}
