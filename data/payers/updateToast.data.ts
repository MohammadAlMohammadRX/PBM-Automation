import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Display Toast Notification on Payer Update".
 *
 * The toast wording, lifetime and dismissal constants are the creation-toast
 * story's (folder 34) and are reused whole - the update path shows the SAME
 * "Saved as draft" toast. This sheet's own ground is the update flow: the
 * toast after an edit, never the submission toast at save time, the payer
 * staying Draft, the maximum-length name, several fields at once, a failed
 * save showing no success toast, rapid saves, and the toast arriving only
 * after the server confirmed.
 *
 * ONE EXPECTATION IS ASSERTED AS WRITTEN AND EXPECTED TO REPORT: the sheet
 * wants the payer's NAME in the toast; the verified wording names no payer.
 */

export {
  DRAFT_SAVED_TOAST,
  SUBMITTED_TOAST,
  TOAST_GONE_BY_MS,
  TOAST_STILL_VISIBLE_AT_MS,
} from './creationToast.data';
export { MAX_NAME_LENGTH } from './localizedName.data';

/** The fields edited to trigger the toast. */
export const UPDATE_EDIT = {
  licence: { label: 'License Number', first: 'LIC-TOAST-1', second: 'LIC-TOAST-2' },
  email: { label: 'Email Address', value: 'toast.update@example.com' },
  name: { label: 'Payer Name' },
} as const;

/** A name at exactly the maximum length: a unique prefix padded with letters. */
export const nameAtMaxLength = (prefix: string, max: number): string =>
  (prefix + ' ' + 'X'.repeat(max)).slice(0, max);

/** How many edits the rapid-save case performs back to back. */
export const RAPID_EDITS = 2;

/** At most one toast may be on screen after rapid saves. */
export const MAX_STACKED_TOASTS = 1;

/** The account the role case needs. */
export const UPDATE_TOAST_ROLE_REQUIREMENT = {
  role: 'a view-only role without Edit Payer',
  reason: 'The case proves a view-only user cannot reach the save/toast flow at all; the shared administrator cannot show the refusal.',
} as const;

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '010',
    title: 'should not let a user without edit permission reach the save and toast flow',
    reason: `${nonAdminBlockReason({ lacking: ['editPayer'] })} ${UPDATE_TOAST_ROLE_REQUIREMENT.reason}`,
  },
];
