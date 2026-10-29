import { pickerDateTime } from './network.data';

/**
 * Test data for US 14318 "Enforce status prerequisites for activation and
 * inactivation actions".
 *
 * Action availability as the Network list renders it (verified 2026-10-12 and
 * 2026-10-21): Active offers Inactivate; Inactive offers Activate; Expired
 * offers Activate DISABLED with the title "Cannot reactivate: the network has
 * expired. Update its expiry date to reactivate it."; Pending and Not Live
 * offer neither. The server's own refusal for a repeated inactivation is
 * "Only an active network can be inactivated."
 */

/** The guidance an Expired network's lifecycle actions must give. */
export const EXPIRY_GUIDANCE = /expiry date/i;

/** The new expiry for 18244 ("2027-06-30" in the sheet - any valid future date). */
export const EXTENDED_EXPIRY = pickerDateTime(250, '23:00');

/** Lifecycle budget per case. */
export const LIFECYCLE_TIMEOUT_MS = 25 * 60_000;
export const MATRIX_TIMEOUT_MS = 35 * 60_000;

/** HTTP statuses a refused direct request may answer. */
export const REFUSED = { min: 400, max: 499 } as const;

/** What an unauthorised direct request must answer. */
export const UNAUTHORISED: readonly number[] = [401, 403];
