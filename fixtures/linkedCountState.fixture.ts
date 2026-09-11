import { test as base } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { PAYER_COLUMN, type PayerColumnKey } from '../constants/ElementIds';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';

/** How many rows to read when classifying counts. One page is enough. */
const SAMPLE_LIMIT = 25;

/** One payer's count cell, as displayed and as a number where it is one. */
export interface CountSample {
  name: string;
  /** The cell exactly as rendered - "3", "-", "None", "" all matter here. */
  raw: string;
  /** The digits parsed out, or null when the cell holds no number. */
  value: number | null;
}

/** The count classes the linked-count stories need, found in the live list. */
export interface CountClasses {
  /** Every row read, so a case can report what the environment actually holds. */
  samples: CountSample[];
  /** A payer whose cell shows no number - the zero-count presentation. */
  zero?: CountSample;
  /** A payer showing exactly one. */
  one?: CountSample;
  /** A payer showing more than one. */
  many?: CountSample;
  /** The largest count on screen, for the no-truncation case. */
  largest?: CountSample;
}

/**
 * Finds payers whose Linked Networks / Linked Members counts fall into the
 * classes those two stories need - zero, exactly one, and more than one.
 *
 * DISCOVERED, NOT PROVISIONED, and deliberately. The sheets ask for payers with
 * 3 networks, 1 network, 0 networks and 500 networks, seeded to order. Nothing
 * here can create those: linking a network needs a network that belongs to no
 * payer, and the network-assignment story reports that this environment has
 * none free - every network is already owned, and a payer holding one cannot be
 * deleted to release it. Enrolling members is a different module again, with no
 * fixtures on this side.
 *
 * So the list is read and classified instead. A class that no payer occupies
 * makes its case report BLOCKED naming the counts that WERE found, which is a
 * useful statement about the environment rather than a failure of the column.
 *
 * Shared by both stories over `column`, because the two differ only in which
 * cell they read - the classification, the blocked reporting and the parsing of
 * a dash into "no number" are identical, and two copies would drift.
 */
export interface LinkedCountFixtures {
  linkedCounts: (column: PayerColumnKey) => Promise<CountClasses>;
}

export const test = base.extend<LinkedCountFixtures>({
  linkedCounts: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);

    await use(async (column: PayerColumnKey) => {
      await payerPage.open();
      await payerPage.expectRowsRendered();
      const names = (await payerPage.getVisiblePayerNames()).slice(0, SAMPLE_LIMIT);

      const samples: CountSample[] = [];
      for (const name of names) {
        const raw = (await payerPage.getCellValue(name, PAYER_COLUMN[column]).catch(() => '')).trim();
        const digits = raw.replace(/[^\d]/g, '');
        samples.push({ name, raw, value: digits === '' ? null : Number(digits) });
      }

      if (samples.length === 0) {
        return blockedByPrecondition(
          testInfo,
          `payers whose "${column}" count can be read`,
          new Error('the payer list rendered no rows to read counts from'),
        );
      }

      const numbered = samples.filter((s) => s.value !== null) as (CountSample & { value: number })[];
      const classes: CountClasses = {
        samples,
        zero: samples.find((s) => s.value === null || s.value === 0),
        one: numbered.find((s) => s.value === 1),
        many: numbered.find((s) => s.value > 1),
        largest: numbered.reduce<CountSample | undefined>(
          (best, s) => (best === undefined || s.value > (best.value ?? -1) ? s : best),
          undefined,
        ),
      };

      Logger.step(
        `[fixture] "${column}" counts sampled: `
        + `${samples.map((s) => `${s.name}=${s.raw || '(blank)'}`).slice(0, 6).join(', ')}`,
      );
      return classes;
    });
  },
});

/** A one-line description of what was sampled, for failure messages. */
export function describeCounts(classes: CountClasses): string {
  return classes.samples
    .map((s) => `${s.name}: "${s.raw || '(blank)'}"`)
    .slice(0, 8)
    .join('; ');
}
