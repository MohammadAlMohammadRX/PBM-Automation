/**
 * US 15202 "View Formulary - Trade & Pricing / Benefit Configuration"
 * (formulary folder 11).
 *
 * Configurations belong to one formulary trade (the card's "Benefit
 * Configuration" action) and are staged in the formulary's draft: a new one
 * reads "Draft · New" until the formulary is approved, then Future / Active /
 * Expired by its own dates (code BNF-nnnnnn). The administrator plays the
 * Benefits Configuration Analyst. Cases that need an approved configuration
 * use a Future formulary (first approval, ~20 s); cases that need Active or
 * Expired ones use writerBHelpers.benefitTimeline (configurations dated a few
 * minutes ahead, then waited for - about six minutes).
 *
 * Literal readings:
 * - "Approval status and version" of a configuration (18737, 18740) is the
 *   formulary's `v<n> · <status>` badge plus the card's own status.
 * - 18739: "Delete only for draft version" - the draft ("Draft · New") card
 *   must offer Delete; the approved one must not (an Inactivate alternative
 *   has no element to check).
 * - 18743: the statuses reachable on demand are Draft (Not Live), Future,
 *   Active and Expired; Pending Approval / Rejected configurations are covered
 *   by 18737 / 18740.
 * - 18745 / 19985: the other user is the Payer Admin account as provided; each
 *   runs only when that account holds (19985) or lacks (18745) the rights.
 */

/** The card status of a configuration not approved yet. */
export const DRAFT = /Draft|Not Live|New/i;
export const FUTURE = /Future/i;
export const ACTIVE = /Active/i;
export const EXPIRED = /Expired/i;
export const UNLIMITED = /unlimited|no limit|∞/i;
export const OPEN_ENDED = /open[- ]?ended|no end/i;
export const OVERLAP = /overlap|already exists|unique|duplicate|same name/i;
export const ZERO = /^0(\.0+)?$/;

/** Bilingual names a case types; suffixed per run where uniqueness matters. */
export const NAMES = {
  standardEn: 'Standard Copay',
  standardAr: 'نسبة قياسية',
} as const;

export const CASES = {
  addConfiguration: { azureId: '18726', nameEn: NAMES.standardEn, nameAr: NAMES.standardAr, copaymentAmount: 50, coinsurancePercentage: 10 },
  copayOrCoinsurance: { azureId: '18727', nameEn: 'Coinsurance Only', nameAr: 'تأمين مشترك فقط', coinsurancePercentage: 15 },
  uniqueEnglishName: { azureId: '18728', nameEn: NAMES.standardEn, nameAr: NAMES.standardAr, otherNameAr: 'نسبة قياسية أخرى', copaymentAmount: 20 },
  overlappingName: { azureId: '18729', nameEn: NAMES.standardEn, nameAr: NAMES.standardAr, otherNameEn: 'Standard Copay Arabic Check', copaymentAmount: 20 },
  coinsuranceBounds: { azureId: '18730', valid: [0, 100], invalid: 101 },
  pastEffectiveDate: { azureId: '18731', formularyInMinutes: 5, todayInMinutes: 15 },
  endAfterEffective: { azureId: '18732', effectiveAfterDays: 1, badEndBeforeDays: 1, goodEndAfterDays: 182 },
  openEnded: { azureId: '18733' },
  optionalDefaults: { azureId: '18734', copaymentAmount: 30 },
  zeroIsUnlimited: { azureId: '18735' },
  statusByPeriod: { azureId: '18736' },
  approvalProgress: { azureId: '18737', copaymentAmount: 40 },
  editOnlyFuture: { azureId: '18738', newCopay: 35 },
  deleteOnlyDraft: { azureId: '18739' },
  rejectedResubmitted: { azureId: '18740', newCopay: 25 },
  groupedList: { azureId: '18741', offsetsDays: [0, 10, 20] },
  actionsByStatus: { azureId: '18743' },
  noPermission: { azureId: '18745' },
  sharedAcrossUsers: { azureId: '19985' },
} as const;
