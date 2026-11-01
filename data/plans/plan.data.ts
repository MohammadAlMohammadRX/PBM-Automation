import { pickerDateTime, pickerMinutesFromNow } from '../networks/network.data';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { toArabicToken } from '../payers/payer.data';
import { PLAN_SUITE } from './planSuite.data';

/**
 * Shared test data for the Plans module (Feature 14144), read off the live
 * screens and lookups on 2026-10-27. Story data files (data/plans/<story>.data.ts)
 * build on these.
 */

/** What the Add / Edit Plan wizard is filled with. Dates are `DD/MM/YYYY HH:mm`. */
export interface PlanFormData {
  nameEn: string;
  nameAr: string;
  /** The payer, as the Payer dropdown labels it. */
  payer: string;
  /** "Individual" | "Family" | "Group" (lookup planType). */
  type: string;
  descriptionEn?: string;
  descriptionAr?: string;
  effectiveDate: string;
  expiryDate: string;
}

/** The plan types (lookup `planType`). */
export const PLAN_TYPES = ['Individual', 'Family', 'Group'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** The plan types as the Arabic interface labels them. */
export const PLAN_TYPE_LABEL_AR: Record<string, string> = {
  Individual: 'فردي',
  Family: 'عائلي',
  Group: 'جماعي',
};

/** Lifecycle statuses as the row and header badges render them. */
export const PLAN_LIFECYCLE = {
  notLive: 'Not Live',
  pending: 'Pending',
  active: 'Active',
  inactive: 'Inactive',
  expired: 'Expired',
} as const;

/** The Status quick filter's options ("All Statuses" first). */
export const PLAN_STATUS_FILTER_OPTIONS = ['All Statuses', 'Not Live', 'Pending', 'Active', 'Inactive', 'Expired'] as const;

/** The approval cell, e.g. "v0 · Draft", "v1 · Pending Approval", "v1 · Approved". */
export const PLAN_APPROVAL_CELL = {
  draft: /Draft/,
  pendingApproval: /Pending Approval/,
  approved: /Approved|Published/,
  rejected: /Rejected/,
} as const;

/** The version statuses of the Version History tab (lookup codes published / superseded / ...). */
export const PLAN_VERSION_STATUS = {
  /** A revert, and a withdrawn change, are staged as a Draft (QA lead, 2026-11-01). */
  draft: 'Draft',
  pendingApproval: 'Pending Approval',
  published: 'Published',
  superseded: 'Superseded',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
} as const;

/** The deactivation reasons (lookup `planInactivationReason`). */
export const PLAN_INACTIVATION_REASONS = ['Contract Ended', 'Payer Request', 'Regulatory Action', 'Replaced by New Plan', 'Other'] as const;

/** Server answers seen live (2026-10-27). */
export const PLAN_MESSAGE = {
  savedAsDraft: 'The plan has been saved as a draft. Send it for approval when you are ready.',
  submitted: 'The change has been submitted for approval.',
  /**
   * What the SCREEN confirms a submission with - "Submitted for approval | Your change was
   * submitted for approval ..." (2026-10-27). The case asks only for a success message,
   * so 18974 matches the meaning, not the server's successMessage wording.
   */
  submittedShown: /submitted for approval/i,
  needsFormulary: 'A plan must have an assigned formulary before this change can be approved.',
  onlyActiveFormulary: 'Only an active formulary can be assigned to a plan.',
  /** The list's empty state - live text is "No results found." (smoke run 2026-10-27). */
  noPlansFound: /No (plans|results) found/i,
} as const;

/** The plan code a published plan carries ("PLN-0034"); a draft shows a provisional "PLN-D-0036". */
export const PERMANENT_PLAN_CODE = /^PLN-\d{4,}$/;
export const PROVISIONAL_PLAN_CODE = /^PLN-D-\d+$/;

/** The payer a form-built plan belongs to - the Plans suite payer (data/plans/planSuite.data.ts). */
export const planPayer = (): string => PLAN_SUITE.payerName;

/** A unique English plan name carrying the sheet's name as a prefix. */
export const planNamed = (prefix: string): string => `${prefix} ${networkStamp()}`;

/** A unique Arabic plan name (Arabic letters only - Arabic names refuse digits). */
export const planNamedAr = (prefix = 'خطة'): string => `${prefix} ${toArabicToken(networkStamp())}`;

/**
 * Form data for a valid plan effective a few minutes from now and expiring in a
 * year. "Now" itself is refused as being in the past, so a minute-level offset is
 * used - the same rule as the network form.
 */
export const planFormData = (overrides: Partial<PlanFormData> = {}): PlanFormData => ({
  nameEn: planNamed('Automation Plan'),
  nameAr: planNamedAr(),
  payer: planPayer(),
  type: 'Individual',
  descriptionEn: 'Created by an automated plan case.',
  descriptionAr: `وصف ${toArabicToken(networkStamp())}`,
  effectiveDate: pickerMinutesFromNow(5),
  expiryDate: pickerDateTime(365),
  ...overrides,
});
