import { pickerDateTime, repeatTo } from '../networks/network.data';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import { planNamed } from './plan.data';
import { PLAN_FORM_MESSAGE } from './createPlan.data';
import type { PlanSpec } from '../../utils/PlanProvisioning';

/**
 * Test data for US 14146 "Edit a plan's attributes through the approval
 * workflow" (plan folder 02), written 2026-10-27.
 *
 * Every case edits its OWN plan (fixture `planIn`), which starts with
 * ORIGINAL_DESCRIPTION so "the live / other user's view is unchanged" has a
 * known value. The sheet's fixed dates (2026-11-01, "today = 2026-10-08") are
 * kept as RELATIVE dates.
 *
 * "A DIFFERENT USER" (18961) is the non-admin account, a Payer Admin scoped to
 * "Al Dawaa 2" / "NUPCO" - so that case's plan is built under its first scoped
 * payer without a formulary (a draft needs none). The second editing session
 * of 18971 is the same administrator in a second window (`staleSession`) -
 * the stamp is per record, not per user.
 *
 * CONFLICTS NOTED FOR THE LEAD:
 *  - 18962 used to edit an ACTIVE plan. The business team confirmed on
 *    2026-10-27 that an Active plan is not edited (no Edit button), so the case
 *    now checks that no Edit is shown and the live values stay as they are.
 *  - 18973 expects Send for Approval to be REFUSED without a formulary; the AC
 *    says formulary assignment is "no longer a prerequisite to send it
 *    forward". The case asserts the test case.
 *  - 18974 expects the status badge to read "Pending" after submission; a v0
 *    plan pending approval may read "Not Live" (its approval cell carries the
 *    "Pending Approval"). The case asserts the test case.
 */

export const ORIGINAL_DESCRIPTION = 'Original plan description before the edit.';

/** A unique edited text value. */
export const edited = (label: string): string => `${label} ${networkStamp()}`;

/** Spec for a case's own plan: effective a day ahead, so a re-sent body is never refused for a past date. */
export const EDIT_PLAN: PlanSpec = { descriptionEn: ORIGINAL_DESCRIPTION, effectiveInMinutes: 24 * 60, expiryInMinutes: 400 * 24 * 60 };

/** A live (Active) plan's spec - effective a minute ahead so the approval makes it Active at once. */
export const LIVE_PLAN: PlanSpec = { descriptionEn: ORIGINAL_DESCRIPTION };

/** A draft whose effective time is a minute ahead - it lies in the past once the case waits it out (18968). */
export const PAST_EFFECTIVE_DRAFT: PlanSpec = { descriptionEn: ORIGINAL_DESCRIPTION, effectiveInMinutes: 1 };

/** The payer the non-admin account can see - the plan of 18961 / 18975 belongs to it. */
export const NON_ADMIN_PLAN_PAYER = NON_ADMIN_PROFILE.scopedPayers[0];

/** A plan the non-admin account can see: a draft of its scoped payer, with no formulary. */
export const NON_ADMIN_VISIBLE_PLAN: PlanSpec = { ...EDIT_PLAN, payerName: NON_ADMIN_PLAN_PAYER, noFormulary: true };

/** The plan name the uniqueness check is probed with ("Family Care Plan" on the sheet). */
export const DUPLICATE_SHEET_NAME = 'Family Care Plan';

/** The maximum English plan-name length - INFERRED from the network module's 255, not yet verified on plans. */
export const PLAN_NAME_MAX = 255;

/** How the server answers a stale save (the network module's 409). */
export const CONFLICT = {
  status: 409,
  message: /modified|changed|updated by another|concurrency|no longer current|stale|reload|refresh/i,
} as const;

/** "A change is already awaiting approval" in any wording - a toast, an error or the detail header's notice. */
export const ALREADY_PENDING = /already.*(pending|awaiting|submitted)|pending approval|awaiting approval/i;

export { PLAN_FORM_MESSAGE };

export const EDIT = {
  editableStates: {
    azureId: '18960',
    states: [
      { state: 'Draft', label: 'Not Live' },
      { state: 'PendingApproval', label: 'V0 - Pending Approval' },
      { state: 'Rejected', label: 'Rejected' },
    ] as const,
  },
  privateDraft: { azureId: '18961', description: () => edited('Updated English description text') },
  /**
   * 18962 - an Active plan is NOT edited (business rule, 2026-10-27): its row and
   * header show no Edit at all, so the live plan can only change through a
   * staged status change that is approved.
   */
  liveUnchanged: { azureId: '18962', editShown: 'absent' as const },
  secondSubmission: { azureId: '18964', description: () => edited('A second change') },
  sameDayExpiry: { azureId: '18965', effectiveDate: () => pickerDateTime(5, '09:00'), expiryDate: () => pickerDateTime(5, '18:00') },
  oneDayExpiry: { azureId: '18966', effectiveDate: () => pickerDateTime(5, '10:00'), expiryDate: () => pickerDateTime(6, '10:00') },
  blankExpiry: { azureId: '18967' },
  untouchedPastEffective: { azureId: '18968', description: () => edited('Only the description changed') },
  movedPastEffective: { azureId: '18969', effectiveDate: () => pickerDateTime(-1) },
  rulesEnforced: {
    azureId: '18970',
    existingName: () => planNamed(DUPLICATE_SHEET_NAME),
    oversized: () => repeatTo('Oversized plan name ', 300),
    arabicInEnglish: 'خطة رعاية الأسرة',
    validName: () => planNamed('Corrected Plan Name'),
  },
  concurrentSessions: { azureId: '18971', sessionA: () => edited('Saved first by session A'), sessionBNameAr: 'خطة الجلسة الثانية' },
  unsavedGuard: { azureId: '18972', description: () => edited('Unsaved description text change') },
  formularyRequired: { azureId: '18973', description: () => edited('Saved without a formulary') },
  directoryRefresh: { azureId: '18974', description: () => edited('Change sent for approval') },
  editRole: { azureId: '18975' },
} as const;

/** Whether a `DD/MM/YYYY HH:mm` picker value lies before now. */
export function pickerIsPast(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(value.trim());
  if (!match) return false;
  const [, dd, mm, yyyy, hh = '00', mi = '00'] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi)).getTime() < Date.now();
}
