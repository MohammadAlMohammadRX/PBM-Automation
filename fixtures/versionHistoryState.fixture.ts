import { test as base } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';

/** How many payers to open when hunting for an empty history. */
const CANDIDATE_LIMIT = 8;

/**
 * The precondition the empty-state story needs: a payer whose Version History
 * genuinely has nothing in it.
 *
 * DISCOVERED, NOT ASSUMED, and the first attempt at this story got it wrong by
 * assuming. A payer that has never been approved seemed like the obvious empty
 * case - and it is not: a v0 draft's own version is LISTED in the history, so
 * the panel shows a table rather than the empty state.
 *
 * That leaves an open question the fixture answers on every run: does any payer
 * state produce the empty state at all? It opens candidates' history tabs and
 * returns the first with zero rows. When none has, it reports BLOCKED with what
 * it looked at - which is the finding, because the story's entire premise is
 * that this state is reachable.
 *
 * WHAT IS ALREADY KNOWN, and is asserted by the cases that can run: the empty
 * state EXISTS as an element and reads "No version history yet.", and it appears
 * when the history request FAILS. So the panel uses one message for "there is
 * nothing" and "I could not load it", which is the conflation the story is
 * meant to prevent.
 */
export interface VersionHistoryStateFixtures {
  /** A payer whose version history lists nothing; BLOCKED when none does. */
  payerWithoutVersionHistory: () => Promise<string>;
}

export const test = base.extend<VersionHistoryStateFixtures>({
  payerWithoutVersionHistory: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);

    await use(async () => {
      await payerPage.open();
      await payerPage.expectRowsRendered();
      const names = (await payerPage.getVisiblePayerNames()).slice(0, CANDIDATE_LIMIT);
      const examined: string[] = [];

      for (const name of names) {
        await payerPage.open();
        await payerPage.search(name);
        const detail = await payerPage.openDetails(name).catch(() => null);
        if (detail === null) continue;

        const versions = detail.versionHistory();
        const opened = await versions
          .open()
          .then(() => true)
          .catch(() => false);
        if (!opened) continue;

        const count = await versions.getEntryCount().catch(() => -1);
        examined.push(`${name} (${count} entr${count === 1 ? 'y' : 'ies'})`);
        if (count === 0) {
          Logger.step(`[fixture] "${name}" has an empty version history`);
          return name;
        }
      }

      return blockedByPrecondition(
        testInfo,
        'a payer whose version history is empty',
        new Error(
          `every payer examined lists at least one version, so the empty state cannot be `
          + `reached by data: ${examined.join('; ') || '(none examined)'}. A payer\'s own draft `
          + 'version appears in its history, which is why a newly created payer is not empty '
          + 'either. The empty state does exist as an element, and it is what the panel shows '
          + 'when the history request FAILS - see the load-failure case.',
        ),
      );
    });
  },
});
