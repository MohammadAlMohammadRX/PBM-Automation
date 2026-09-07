import * as fs from 'fs';
import { test as base } from '@playwright/test';
import { Logger } from '../utils/Logger';
import {
  SEED_MANIFEST_PATH,
  type DiscardSeedManifest,
  type SeededPayer,
} from '../data/payers/discardSeed.data';

/**
 * Gives the auto-discard cases their seeded registrations, when there are any.
 *
 * This is what lets that story unblock itself. Its cases need a version-zero
 * registration whose effective window has already lapsed - which the wizard
 * cannot create, because it refuses a past effective date. The seeder makes
 * those records with dates that lapse naturally over the following days, and
 * this fixture hands them to the cases once they have.
 *
 * Three outcomes, and the distinction between them is the whole point:
 *
 *   no manifest        nothing was seeded -> BLOCKED, exactly as before.
 *   not yet lapsed     seeded, but its window has not passed -> BLOCKED, with
 *                      the date to come back on. Checking early would report a
 *                      registration as "wrongly kept" when it is simply not due.
 *   lapsed             the case runs for real.
 *
 * Only the third makes a claim about the application. The first two report that
 * the rule was never evaluated, which is true and is not a failure.
 */

/** A seeded payer plus whether its effective window has actually lapsed. */
export interface SeedLookup {
  /** Every payer in the manifest, or [] when nothing was seeded. */
  all: SeededPayer[];
  /** The manifest's seed date, for messages. */
  seededOn: string | null;
  /** Whether a manifest was found at all. */
  present: boolean;
  /** One seeded payer by its plan key, or undefined. */
  find(key: string): SeededPayer | undefined;
  /** Whether that row's window has lapsed as of now. */
  hasLapsed(key: string): boolean;
  /**
   * The reason a case cannot run yet - a ready-made `steps.blocked` message -
   * or null when it can. Keeping the wording here means every case reports the
   * same thing the same way.
   */
  blockedReason(key: string): string | null;
}

/** `DD/MM/YYYY` -> Date at local midnight. */
function parseUiDate(value: string): Date | null {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export interface DiscardSeedFixtures {
  discardSeed: SeedLookup;
}

export const test = base.extend<DiscardSeedFixtures>({
  discardSeed: async ({}, use) => {
    let manifest: DiscardSeedManifest | null = null;
    if (fs.existsSync(SEED_MANIFEST_PATH)) {
      try {
        manifest = JSON.parse(fs.readFileSync(SEED_MANIFEST_PATH, 'utf8'));
      } catch (error) {
        // A corrupt manifest is treated as no manifest: the cases then report
        // BLOCKED rather than failing on a parse error, which would blame the
        // application for a problem in the seed file.
        Logger.warn(`Could not read the discard seed manifest - treating it as absent: ${
          error instanceof Error ? error.message : String(error)}`);
        manifest = null;
      }
    }

    const all = manifest?.payers ?? [];
    const find = (key: string) => all.find((p) => p.key === key);

    const hasLapsed = (key: string): boolean => {
      const row = find(key);
      if (!row || !row.lapsesOn) return false;
      const due = parseUiDate(row.lapsesOn);
      return due !== null && startOfToday().getTime() >= due.getTime();
    };

    const lookup: SeedLookup = {
      all,
      seededOn: manifest?.seededOn ?? null,
      present: manifest !== null,
      find,
      hasLapsed,
      blockedReason(key: string): string | null {
        if (!manifest) {
          return 'no seeded registrations are available. This case needs a version-zero '
            + 'registration whose effective window has already lapsed, which the wizard '
            + 'cannot create directly (it refuses a past effective date). Run '
            + '`npm run seed:discard` to create one, then re-run this case once its '
            + 'effective date has passed.';
        }
        const row = find(key);
        if (!row) {
          return `the seed manifest from ${manifest.seededOn} does not contain a "${key}" `
            + 'registration. Re-run `npm run seed:discard` to create the full set.';
        }
        if (!row.lapsesOn) {
          return `"${key}" is a control row that is never meant to lapse, so it cannot be `
            + 'used to observe a discard.';
        }
        if (!hasLapsed(key)) {
          return `"${key}" was seeded on ${manifest.seededOn} with an effective date of `
            + `${row.effectiveDate}; its window does not lapse until ${row.lapsesOn}. `
            + 'Re-run this case on or after that date - checking now would report a '
            + 'registration as wrongly kept when it is simply not due yet.';
        }
        return null;
      },
    };

    if (manifest) {
      Logger.step(
        `[fixture] Discard seed from ${manifest.seededOn}: ${all.length} registration(s), `
          + `${all.filter((p) => hasLapsed(p.key)).length} already lapsed`,
      );
    }

    await use(lookup);
  },
});
