import { repeatTo } from './network.data';

/**
 * Test data for US 14319 "Require a reason when inactivating a network".
 *
 * The sheet's reasons ('Contract Terminated', 'Other', 'Maintenance',
 * 'Business Closure', 'Regulatory Requirement') are examples of entries in the
 * administrator-maintained lookup `networkInactivationReason`; the cases use
 * the reasons the drawer actually offers. Details is optional, capped at 500.
 */

export const DETAILS_LIMIT = 500;

export const DETAILS = {
  atLimit: repeatTo('R', 500),
  overLimit: repeatTo('R', 501),
  underLimit: repeatTo('R', 499),
  short: 'Reason captured by an automated case.',
  hostile: '<script>alert(1)</script> test 😀 ñ日本語',
  partial: 'Partly typed then abandoned',
  counterProbe: 'abc',
} as const;

/** The accepted-length boundary cases: at the limit (18254) and just under it (18256). */
export const ACCEPTED_LENGTHS = [
  { azureId: '18254', length: 500, text: DETAILS.atLimit },
  { azureId: '18256', length: 499, text: DETAILS.underLimit },
] as const;

/** Reason values the dropdown would never offer (18253). */
export const INVALID_REASONS = ['InvalidReasonCode123', '00000000-0000-0000-0000-000000000123'] as const;

/** The counter the dialog must show ("0/500" style). */
export const counterFor = (length: number): string => `${length}/${DETAILS_LIMIT}`;

/** The placeholder the reason select shows when nothing is chosen. */
export const UNSELECTED_REASON = /^Select$|^$/;

/** What a reason-less confirmation must say. */
export const REASON_REQUIRED = /required|reason/i;

/** Lifecycle budget per case. */
export const LIFECYCLE_TIMEOUT_MS = 25 * 60_000;
