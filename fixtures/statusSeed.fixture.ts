import * as fs from 'fs';
import { test as base } from '@playwright/test';
import { Logger } from '../utils/Logger';
import {
  STATUS_SEED_MANIFEST_PATH,
  type SeededStatusPayer,
  type StatusSeedManifest,
} from '../data/payers/statusSeed.data';

/**
 * Gives the expiry-precedence cases their seeded payers, when there are any.
 *
 * Same shape as `discardSeed`, and deliberately so - the two stories are
 * blocked the same way and unblock the same way, so a reader who has understood
 * one has understood both. What differs is what the rows are waiting for: a
 * discard row waits for its EFFECTIVE window to lapse while unapproved, a row
 * here is live and waits for its EXPIRY to pass. That is why this is a separate
 * fixture over a separate manifest rather than a parameter on the first one:
 * the two sets have opposite expected end states, and one lookup returning both
 * would let a case assert the wrong outcome against the wrong record.
 *
 * Three outcomes, and telling them apart is the point:
 *
 *   no manifest       nothing was seeded -> BLOCKED, naming the seed command.
 *   not yet lapsed    seeded, expiry not passed -> BLOCKED, with the date to
 *                     come back on. Checking early would report a payer as
 *                     "wrongly still Inactive" when its expiry is simply in
 *                     the future.
 *   lapsed            the case runs for real.
 *
 * Only the third says anything about the application.
 */

export interface StatusSeedLookup {
  /** Every payer in the manifest, or [] when nothing was seeded. */
  all: SeededStatusPayer[];
  /** The manifest's seed date, for messages. */
  seededOn: string | null;
  /** Whether a manifest was found at all. */
  present: boolean;
  /** One seeded payer by its plan key, or undefined. */
  find(key: string): SeededStatusPayer | undefined;
  /** Whether that row's expiry has passed as of now. */
  hasLapsed(key: string): boolean;
  /**
   * The reason a case cannot run yet - a ready-made `steps.blocked` message -
   * or null when it can.
   */
  blockedReason(key: string): string | null;
}

/** `DD/MM/YYYY` -> Date at local midnight. */
function parseUiDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export interface StatusSeedFixtures {
  statusSeed: StatusSeedLookup;
}

export const test = base.extend<StatusSeedFixtures>({
  statusSeed: async ({}, use) => {
    let manifest: StatusSeedManifest | null = null;
    if (fs.existsSync(STATUS_SEED_MANIFEST_PATH)) {
      try {
        manifest = JSON.parse(fs.readFileSync(STATUS_SEED_MANIFEST_PATH, 'utf8'));
      } catch (error) {
        // A corrupt manifest is treated as no manifest: the cases then report
        // BLOCKED rather than failing on a parse error, which would blame the
        // application for a problem in the seed file.
        Logger.warn(
          `Could not read the status seed manifest - treating it as absent: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        manifest = null;
      }
    }

    const all = manifest?.payers ?? [];
    const find = (key: string) => all.find((payer) => payer.key === key);

    const hasLapsed = (key: string): boolean => {
      const row = find(key);
      if (!row || !row.lapsesOn) return false;
      const due = parseUiDate(row.lapsesOn);
      return due !== null && startOfToday().getTime() >= due.getTime();
    };

    const lookup: StatusSeedLookup = {
      all,
      seededOn: manifest?.seededOn ?? null,
      present: manifest !== null,
      find,
      hasLapsed,
      blockedReason(key: string): string | null {
        if (!manifest) {
          return 'no seeded payers are available. This case needs a payer whose expiry date '
            + 'has already passed while it sits in a particular status, which the wizard '
            + 'cannot create directly (it refuses an expiry before today). Run '
            + '`npm run seed:status` to create the set, then re-run this case once the '
            + 'expiry dates have passed.';
        }
        const row = find(key);
        if (!row) {
          return `the seed manifest from ${manifest.seededOn} does not contain a "${key}" `
            + 'payer. Re-run `npm run seed:status` to create the full set.';
        }
        if (!row.lapsesOn) {
          return `"${key}" is a control row whose expiry is never meant to pass during `
            + 'testing, so it cannot be used to observe a transition.';
        }
        if (!hasLapsed(key)) {
          return `"${key}" was seeded on ${manifest.seededOn} with an expiry of `
            + `${row.expiryDate}; that date does not pass until ${row.lapsesOn}. Re-run this `
            + 'case on or after that date - checking now would report the payer as wrongly '
            + 'unchanged when its expiry is simply still in the future.';
        }
        return null;
      },
    };

    if (manifest) {
      Logger.step(
        `[fixture] Status seed from ${manifest.seededOn}: ${all.length} payer(s), `
          + `${all.filter((payer) => hasLapsed(payer.key)).length} already lapsed`,
      );
    }

    await use(lookup);
  },
});
