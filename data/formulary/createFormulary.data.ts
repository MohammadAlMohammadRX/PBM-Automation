import { SUITE_FORMULARY_PREFIX, formularyDateText, formularyStamp } from '../../utils/FormularyProvisioning';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';

/**
 * US 15192 "Create Formulary" (formulary folder 02).
 *
 * The Add Formulary drawer (`formulary-form-drawer`): step 1 Basic Information
 * (name EN / AR, payer, description EN / AR), step 2 Effective Period
 * (date-time pickers typed `DD/MM/YYYY HH:mm`). "Submit" on step 2 is Save.
 * The administrator opens the list under the suite payer's scope, so "the
 * current selected payer" is "Al sharq"; every name carries the suite prefix
 * and every formulary a case saves is registered for discard first.
 *
 * Readings of ambiguous lines (noted per case below):
 *  - 18589 "no formulary code shown" is read with 18600: no PERMANENT code
 *    (FORM-nnnn) before approval - the temporary FORM-D- code 18600 expects is allowed.
 *  - 18591 / 18597: a field that stops input at its limit "prevents further
 *    input"; otherwise Next must be blocked with a maximum-length message.
 *  - 18604: the period is entered on step 2 before going Back, so its retention can be checked.
 *  - 19385 / 18603 use the Payer Admin account (assigned "Al Dawaa 2" and
 *    "NUPCO") shaped with the Formularies rights (writerAHelpers.formularySession).
 */

/** A suite name with a label: `QA Automation Formulary <label> <stamp>`. */
export const suiteName = (label: string): string => `${SUITE_FORMULARY_PREFIX} ${label} ${formularyStamp()}`;

/** An English name of exactly `length` characters, letters and spaces only, starting with the suite prefix. */
export const englishNameOfLength = (length: number): string => {
  const head = `${SUITE_FORMULARY_PREFIX} ${formularyStamp().replace(/\d/g, 'x')} `;
  return (head + 'A'.repeat(Math.max(length - head.length, 0))).slice(0, length);
};

/** `DD/MM/YYYY HH:mm`, `minutes` from now. */
export const dateIn = (minutes: number): string => formularyDateText(new Date(Date.now() + minutes * 60_000));

const DAY = 24 * 60;

export const CASES = {
  happyPath: { azureId: '18589', label: 'Cardio Formulary', nameAr: 'قائمة القلب', effective: () => dateIn(DAY), expiry: () => dateIn(DAY + 365 * DAY) },
  nameAt255: { azureId: '18590', length: 255 },
  nameAt256: { azureId: '18591', length: 256, limit: 255 },
  arabicInEnglish: { azureId: '18592', value: 'قائمة الأدوية' },
  englishInArabic: { azureId: '18593', value: 'Cardio Formulary' },
  namesRequired: { azureId: '18594' },
  payerAutoFilled: { azureId: '18595', otherPayer: NON_ADMIN_PROFILE.scopedPayers[0] },
  /** "Today" = a few minutes from now (still today). */
  effectiveNotPast: { azureId: '18596', yesterday: () => dateIn(-DAY), today: () => dateIn(10), expiry: () => dateIn(200 * DAY) },
  descriptionAt1000: { azureId: '18597', valid: 1000, invalid: 1001 },
  /** Effective today; expiry equal to the effective date-time, then a day earlier, then a day later. */
  expiryAfterEffective: { azureId: '18598', effectiveInMinutes: 30 },
  savedAsDraft: { azureId: '18599', effective: () => dateIn(10), expiry: () => dateIn(100 * DAY) },
  codeOnApproval: { azureId: '18600', effective: () => dateIn(2 * DAY), expiry: () => dateIn(300 * DAY) },
  payerLockedByPlan: { azureId: '18601', otherPayer: NON_ADMIN_PROFILE.scopedPayers[0] },
  injection: { azureId: '18602' },
  createPermission: { azureId: '18603' },
  stepsKeepValues: { azureId: '18604', changedDescription: 'Changed after going back.' },
  // The name labels read "Formulary Name" / "اسم القائمة الدوائية" (2026-11-02), not "English / Arabic Name".
  indicators: { azureId: '18605', required: [/^formulary name$/i, /^اسم القائمة الدوائية$/], requiredPeriod: [/effective/i, /expiry/i], optional: [/description/i] },
  assignedPayers: { azureId: '19385', payers: [...NON_ADMIN_PROFILE.scopedPayers] as string[] },
} as const;
