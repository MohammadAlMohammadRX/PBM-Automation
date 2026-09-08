import * as path from 'path';
import { DateUtils } from '../../utils/DateUtils';
import { RandomDataUtils } from '../../utils/RandomDataUtils';
import { toArabicToken } from './payer.data';
import type { PayerData } from './payerTypes';

/**
 * Seed plan for "Refine Automatic Status Transitions for Expiry Precedence and
 * Recalculation on Edit".
 *
 * WHY THIS EXISTS, and why it is a SECOND seed rather than a reuse of the
 * discard one. Both stories are blocked the same way - the wizard will not
 * accept a date in the past, the server clock cannot be moved, and the
 * lifecycle job has no UI trigger - and both are unblocked the same way, by
 * creating records today whose dates lapse naturally and verifying afterwards.
 * But what they wait for is different: a discard row waits for its EFFECTIVE
 * window to pass while still unapproved, whereas a row here is approved and
 * live, then waits for its EXPIRY date to pass. Their expected end states are
 * opposites, so one checker could not report on both, and sharing a name prefix
 * would let either seeder adopt the other's records. Hence `STATUS-SEED`, its
 * own manifest, and its own entry in PROTECTED_NAME_PREFIXES.
 *
 * WHAT THE ENVIRONMENT ALREADY PROVIDES, and what it does not. 210 payers were
 * cross-checked against their own expiry dates: not one whose expiry had passed
 * was showing anything other than Expired, and not one with a future expiry was
 * wrongly Expired. So the expiry transition itself is working for existing
 * data. What is missing is the specific evidence this story asks for - an
 * INACTIVE payer whose expiry has passed, which is the case that decides whether
 * expiry takes precedence over a manual inactivation. No such record exists, and
 * one cannot be manufactured on demand, because inactivating a payer and then
 * waiting for its expiry takes a day at minimum. That is exactly what these rows
 * are for.
 *
 * The job blocker stays untouched, and honestly so: the discard job has not run
 * for two days against seeded rows that are already due. If the lifecycle job is
 * equally idle, these rows will not transition and the checks will say so,
 * which distinguishes "expiry precedence is not implemented" from "expiry
 * precedence was never evaluated".
 */

/** Where the seeder records what it created, for the verification run. */
export const STATUS_SEED_MANIFEST_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'reports',
  'status-seed.json',
);

/** Prefix every seeded payer shares, and the marker ProtectedData guards. */
export const STATUS_SEED_NAME_PREFIX = 'STATUS-SEED';

/**
 * The lifecycle state a seeded row is left in once created.
 *
 * `active` rows are approved and left alone; `inactive` rows are approved and
 * then inactivated, which is the state the precedence cases need and the only
 * one that takes two round trips to reach.
 */
export type SeedLifecycle = 'active' | 'inactive';

export interface StatusSeedRow {
  /** Stable key, written into the manifest and used to look the payer up. */
  key: string;
  /** Which case in this story the row exists for. */
  forCase: string;
  lifecycle: SeedLifecycle;
  /** Expiry date, as days from the seed day. 0 = today. */
  expiryInDays: number;
  /**
   * Days after seeding at which the expiry has PASSED, so the row's expectation
   * becomes checkable. `null` marks a control that must never lapse.
   */
  lapsesAfterDays: number | null;
  /** The status the row must show once its expiry has passed. */
  expected: 'Expired' | 'Inactive' | 'Active';
  purpose: string;
}

/**
 * The seed plan.
 *
 * Expiry dates are relative to the seed day, so the plan stays correct whenever
 * it is run. Every row expires today or tomorrow rather than further out: the
 * whole point is to make the story checkable within a day, and a row expiring in
 * a week is a row nobody will come back for.
 */
export const STATUS_SEED_ROWS: readonly StatusSeedRow[] = [
  {
    key: 'inactive-expiry-passed',
    forCase: 'TC-001',
    lifecycle: 'inactive',
    expiryInDays: 0,
    lapsesAfterDays: 1,
    expected: 'Expired',
    purpose:
      'Approved, then manually inactivated, with an expiry of TODAY. Tomorrow its expiry has '
      + 'passed while it sits Inactive - the exact condition that decides whether expiry takes '
      + 'precedence over a manual inactivation. This is the record the environment does not '
      + 'contain and the one the story turns on.',
  },
  {
    key: 'inactive-expiry-today',
    forCase: 'TC-002',
    lifecycle: 'inactive',
    expiryInDays: 0,
    lapsesAfterDays: 0,
    expected: 'Inactive',
    purpose:
      'Inactive with an expiry of exactly TODAY, checked the SAME day. Probes the boundary: an '
      + 'expiry date of today has not yet passed, so the row should still read Inactive. Kept '
      + 'separate from the row above because the two differ only in when they are read, and '
      + 'conflating them would hide whichever way the boundary is implemented.',
  },
  {
    key: 'inactive-expiry-future',
    forCase: 'TC-003',
    lifecycle: 'inactive',
    expiryInDays: 30,
    lapsesAfterDays: null,
    expected: 'Inactive',
    purpose:
      'Inactive with an expiry a month out - the control. It must stay Inactive throughout. '
      + 'Without it, a job that blindly expired every inactive record would satisfy every '
      + 'other row in this plan.',
  },
  {
    key: 'active-expiry-passed',
    forCase: 'TC-004',
    lifecycle: 'active',
    expiryInDays: 0,
    lapsesAfterDays: 1,
    expected: 'Expired',
    purpose:
      'Active with an expiry of TODAY, so tomorrow it must read Expired. The batch case needs '
      + 'an Active row lapsing alongside the Inactive ones to show the transition applies '
      + 'regardless of the starting status.',
  },
  {
    key: 'expired-to-edit',
    forCase: 'TC-005',
    lifecycle: 'active',
    expiryInDays: 0,
    lapsesAfterDays: 1,
    expected: 'Expired',
    purpose:
      'A second row lapsing tomorrow, reserved for the recalculation-on-edit cases: they need '
      + 'an Expired payer whose expiry they can EXTEND, which consumes the record. Sharing one '
      + 'Expired row between the precedence checks and the edit checks would let an edit in one '
      + 'test destroy the precondition of another - the tests must stay independent.',
  },
] as const;

/** One seeded payer, as recorded in the manifest. */
export interface SeededStatusPayer {
  key: string;
  forCase: string;
  lifecycle: SeedLifecycle;
  nameEn: string;
  nameAr: string;
  licenseNumber: string;
  effectiveDate: string;
  expiryDate: string;
  lapsesOn: string | null;
  expected: 'Expired' | 'Inactive' | 'Active';
  purpose: string;
}

export interface StatusSeedManifest {
  seededOn: string;
  environment: string;
  payers: SeededStatusPayer[];
}

/**
 * Builds the payer record for a seed row.
 *
 * Effective date is TODAY for every row, so approval makes the payer live
 * immediately and the only variable left is the expiry. The name carries the
 * seed date and the row key so a record found next week explains itself without
 * the manifest - these rows are deliberately never cleaned up.
 */
export function buildStatusSeedPayer(row: StatusSeedRow, seedStamp: string): PayerData {
  const suffix = RandomDataUtils.uniqueSuffix();
  return {
    nameEn: `${STATUS_SEED_NAME_PREFIX} ${seedStamp} ${row.key} ${suffix}`,
    nameAr: `جهة ${toArabicToken(suffix)}`,
    type: 'Private',
    email: `status.seed.${suffix}@example.com`,
    phone: '512345678',
    licenseNumber: `LIC-STATUS-${suffix}`,
    city: 'Riyadh',
    language: 'English',
    contactMethod: 'Email',
    effectiveDate: DateUtils.todayFormatted(),
    expiryDate: DateUtils.futureDate(row.expiryInDays),
  };
}

/** `2026-09-07` - the seed day, used in every seeded name. */
export function statusSeedStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The date a row's expiry has passed, as DD/MM/YYYY, or null for a control. */
export function statusLapseDate(row: StatusSeedRow): string | null {
  return row.lapsesAfterDays === null ? null : DateUtils.futureDate(row.lapsesAfterDays);
}
