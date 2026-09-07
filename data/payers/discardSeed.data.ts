import * as path from 'path';
import { DateUtils } from '../../utils/DateUtils';
import { RandomDataUtils } from '../../utils/RandomDataUtils';
import { toArabicToken } from './payer.data';
import type { PayerData } from './payerTypes';

/**
 * Seed plan for the user story: Automatically Discard Unapproved Registrations
 * Past Their Effective Window.
 *
 * WHY THIS EXISTS. The story was blocked on three things: the wizard refuses an
 * effective date in the past, the server clock cannot be moved, and the discard
 * job has no UI trigger. Seeding solves the first two WITHOUT any of the tricks
 * that would have been unsound - it does not back-date anything and it does not
 * fake a clock. It creates registrations today whose effective dates lapse
 * naturally over the following days, and the verification runs later, once real
 * time has done the work.
 *
 * The third blocker is untouched: if the scheduled job never runs, the seeded
 * records simply will not change, and the checks report that rather than
 * pretending. That is the correct outcome - it distinguishes "the rule is not
 * implemented" from "the rule was never evaluated".
 *
 * DATES ARE RELATIVE TO THE SEED DAY, not to any fixed calendar date, so this
 * plan stays correct whenever it is run. `lapsesAfterDays` says how many days
 * after seeding the row's effective window has passed - which is when its
 * expectation becomes checkable.
 */

/** Where the seeder records what it created, for the verification run. */
export const SEED_MANIFEST_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'reports',
  'discard-seed.json',
);

/** What state a seeded registration should be left in. */
export type SeedState =
  /** Saved as v0 and submitted - shows "v0 · Pending Approval". */
  | 'v0-submitted'
  /** Saved as v0 and left alone - shows "v0 · Draft". */
  | 'v0-draft'
  /** Approved to v1, then an edit staged as v2 and left awaiting review. */
  | 'v1-published-with-pending-v2'
  /** Approved to v1 and left clean - no pending change. */
  | 'v1-published';

export interface DiscardSeedRow {
  /** Stable key, written into the manifest and used to look the payer up. */
  key: string;
  /** Which case in this story the row exists for. */
  forCase: string;
  state: SeedState;
  /** Effective date, as days from the seed day. 0 = today. */
  effectiveInDays: number;
  /**
   * Days after seeding at which this row's effective window has LAPSED.
   * `null` means it is a control that should never lapse during testing.
   */
  lapsesAfterDays: number | null;
  /** What the discard rule says should happen once the window has lapsed. */
  expected: 'Discarded' | 'Unchanged';
  /** Why this row is in the plan - carried into the manifest for the reader. */
  purpose: string;
}

/**
 * The rows to seed.
 *
 * Between them they cover every runnable line of the decision matrix plus the
 * two date boundaries, using nothing but dates the wizard will accept today.
 */
export const DISCARD_SEED_PLAN: readonly DiscardSeedRow[] = [
  {
    key: 'lapsed-v0',
    forCase: 'TC-001 / TC-007',
    state: 'v0-submitted',
    effectiveInDays: 0,
    lapsesAfterDays: 1,
    expected: 'Discarded',
    purpose:
      'A version-zero registration awaiting approval whose effective date is TODAY. From '
      + 'tomorrow its window has lapsed with no approval, which is the case the rule exists '
      + 'for: it must end up Discarded.',
  },
  {
    key: 'boundary-today',
    forCase: 'TC-003',
    state: 'v0-submitted',
    effectiveInDays: 1,
    lapsesAfterDays: 1,
    expected: 'Discarded',
    purpose:
      'Effective TOMORROW, so on the day after seeding its effective date IS today - the '
      + 'exact boundary the criteria call out ("discarded precisely when the effective date '
      + 'arrives").',
  },
  {
    key: 'future-control',
    forCase: 'TC-004',
    state: 'v0-submitted',
    effectiveInDays: 7,
    lapsesAfterDays: null,
    expected: 'Unchanged',
    purpose:
      'Effective a week out - the negative boundary. It must survive every job run until '
      + 'that date. Without this row a job that discarded EVERYTHING would look correct.',
  },
  {
    key: 'well-past-v0',
    forCase: 'TC-005',
    state: 'v0-submitted',
    effectiveInDays: 0,
    lapsesAfterDays: 3,
    expected: 'Discarded',
    purpose:
      'The same shape as lapsed-v0 but checked several days later, to show the rule is not '
      + 'limited to a same-day lapse. Check this one from day three onward.',
  },
  {
    key: 'approved-v1-pending-v2',
    forCase: 'TC-002 / TC-006',
    state: 'v1-published-with-pending-v2',
    effectiveInDays: 0,
    lapsesAfterDays: 1,
    expected: 'Unchanged',
    purpose:
      'A payer already approved at v1 carrying a pending v2. Once the window lapses the rule '
      + 'says the pending change is NOT discarded and v1 keeps being honoured - the opposite '
      + 'outcome to lapsed-v0, from the same elapsed time.',
  },
  {
    key: 'draft-v0',
    forCase: 'TC-001 (variant)',
    state: 'v0-draft',
    effectiveInDays: 0,
    lapsesAfterDays: 1,
    expected: 'Discarded',
    purpose:
      'A version-zero DRAFT that was never submitted. The criteria say "Pending", and the '
      + 'application distinguishes Draft from Pending Approval - so this row exists to show '
      + 'which of the two the job actually acts on. Treat a difference here as a question '
      + 'for the BA rather than a defect.',
  },
  {
    key: 'approved-v1-pending-v2-future',
    forCase: 'TC-008',
    state: 'v1-published-with-pending-v2',
    effectiveInDays: 7,
    lapsesAfterDays: null,
    expected: 'Unchanged',
    purpose:
      'The fourth row of the decision matrix: an approved version carrying a pending change '
      + 'whose window has NOT lapsed. Without it the matrix has three rows and the case can '
      + 'only ever be partially evaluated.',
  },
  {
    key: 'approved-before-lapse',
    forCase: 'TC-012',
    state: 'v1-published',
    effectiveInDays: 1,
    lapsesAfterDays: 1,
    expected: 'Unchanged',
    purpose:
      'Created as version zero effective TOMORROW and approved TODAY - i.e. approved before '
      + 'its window lapsed. When that date arrives it must be live rather than discarded, '
      + 'because by then it was no longer an unapproved version-zero registration. This is '
      + 'the race the criteria ask about, and seeding reaches it without needing to control '
      + 'when the job runs: the approval simply happens first, in real time.',
  },
] as const;

/** One seeded payer, as recorded in the manifest. */
export interface SeededPayer {
  key: string;
  forCase: string;
  state: SeedState;
  nameEn: string;
  nameAr: string;
  licenseNumber: string;
  effectiveDate: string;
  expiryDate: string;
  lapsesOn: string | null;
  expected: 'Discarded' | 'Unchanged';
  purpose: string;
}

export interface DiscardSeedManifest {
  seededOn: string;
  environment: string;
  payers: SeededPayer[];
}

/**
 * Builds the payer record for a seed row.
 *
 * The name carries the seed date and the row key, so a record found next week
 * can be traced back to why it exists without opening the manifest - these rows
 * are deliberately NOT cleaned up, so they have to explain themselves.
 */
export function buildSeedPayer(row: DiscardSeedRow, seedStamp: string): PayerData {
  const suffix = RandomDataUtils.uniqueSuffix();
  return {
    nameEn: `DISCARD-SEED ${seedStamp} ${row.key} ${suffix}`,
    nameAr: `جهة ${toArabicToken(suffix)}`,
    type: 'Private',
    email: `discard.seed.${suffix}@example.com`,
    phone: '512345678',
    licenseNumber: `LIC-SEED-${suffix}`,
    city: 'Riyadh',
    language: 'English',
    contactMethod: 'Email',
    effectiveDate: DateUtils.futureDate(row.effectiveInDays),
    expiryDate: DateUtils.futureDate(365),
  };
}

/** `2026-09-06` - the seed day, used in every seeded name. */
export function seedStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The date a row's window lapses, as DD/MM/YYYY, or null for a control. */
export function lapseDate(row: DiscardSeedRow): string | null {
  return row.lapsesAfterDays === null ? null : DateUtils.futureDate(row.lapsesAfterDays);
}

/** Prefix every seeded payer shares, for finding them all later. */
export const SEED_NAME_PREFIX = 'DISCARD-SEED';
