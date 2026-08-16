import { RandomDataUtils } from '../../utils/RandomDataUtils';
import { DateUtils } from '../../utils/DateUtils';
import type { PayerData } from './payerTypes';

/**
 * Factories and canned data for the Create New Payer feature.
 *
 * Every generator returns a fresh, unique, VALID record so tests stay
 * independent and parallel-safe (no shared mutable state). Invalid values used
 * by negative tests are defined explicitly and locally here so the intent is
 * obvious at the call site.
 */

/** The Arabic "Payer Name" label, kept as a constant so specs/POs share it. */
export const PAYER_NAME_AR_LABEL = 'اسم الجهة المانحة';

/**
 * Builds a unique, fully valid payer. `overrides` lets a test pin specific
 * fields (e.g. a fixed effective date) while keeping everything else unique.
 */
export function buildUniquePayer(overrides: Partial<PayerData> = {}): PayerData {
  const suffix = RandomDataUtils.uniqueSuffix();
  return {
    nameEn: `Automation Payer ${suffix}`,
    // The Arabic name field enforces "Arabic letters only", so uniqueness is
    // carried by the English name (used for search/identification) while this
    // stays a valid Arabic-only string.
    nameAr: 'جهة تأمين مؤتمتة',
    type: 'Private',
    email: `automation.payer.${suffix}@example.com`,
    phone: '512345678',
    licenseNumber: `LIC-AUTO-${suffix}`,
    city: 'Riyadh',
    language: 'English',
    contactMethod: 'Email',
    // Default: effective today, expires in one year -> Active on approval.
    effectiveDate: DateUtils.todayFormatted(),
    expiryDate: DateUtils.futureDate(365),
    ...overrides,
  };
}

/** Invalid field values for data-format validation (TC-010). */
export const INVALID_FIELD_VALUES = {
  email: 'notanemail',
  /** The phone control is digit-masked, so letters simply do not register. */
  phone: 'ABCINVALID',
  /** An impossible calendar date the datepicker must reject. */
  effectiveDate: '32/13/2026',
} as const;

/** Verified user-facing validation messages. */
export const VALIDATION_MESSAGES = {
  required: 'This field is required.',
  invalidEmail: 'Enter a valid email address.',
} as const;

/**
 * Approval decision-table rows (TC-018, and individually TC-004/006/007/008).
 * Dates are computed relative to the run date so the suite never goes stale.
 */
export interface ApprovalScenario {
  id: string;
  decision: 'Approve' | 'Reject';
  effectiveDate: string;
  effectiveLabel: string;
  expectedApprovalStatus: 'Published' | 'Rejected';
  expectedLifecycleStatus: 'Active' | 'Pending' | 'Rejected';
  expectPayerCode: boolean;
}

export function approvalScenarios(): ApprovalScenario[] {
  return [
    {
      id: 'approve-past',
      decision: 'Approve',
      effectiveDate: DateUtils.pastDate(30),
      effectiveLabel: 'Past',
      expectedApprovalStatus: 'Published',
      expectedLifecycleStatus: 'Active',
      expectPayerCode: true,
    },
    {
      id: 'approve-today',
      decision: 'Approve',
      effectiveDate: DateUtils.todayFormatted(),
      effectiveLabel: 'Today',
      expectedApprovalStatus: 'Published',
      expectedLifecycleStatus: 'Active',
      expectPayerCode: true,
    },
    {
      id: 'approve-future',
      decision: 'Approve',
      effectiveDate: DateUtils.futureDate(1),
      effectiveLabel: 'Future (today + 1)',
      expectedApprovalStatus: 'Published',
      expectedLifecycleStatus: 'Pending',
      expectPayerCode: true,
    },
    {
      id: 'reject-any',
      decision: 'Reject',
      effectiveDate: DateUtils.futureDate(10),
      effectiveLabel: 'Any',
      expectedApprovalStatus: 'Rejected',
      expectedLifecycleStatus: 'Rejected',
      expectPayerCode: false,
    },
  ];
}
