import { SAFE_TEXT, textOfLength } from './formulary.data';

/**
 * US 15193 "View Formulary - Tiers tab" (formulary folder 03).
 *
 * Every case builds its own Draft formulary (fixture `formularyIn`): tier
 * edits behave the same on a draft and a published formulary (they apply at
 * once - foundation notes), so no case needs a live one.
 *
 * Literal readings:
 * - 18616 "tier name advanced search filter ... for Trades & Pricing": the
 *   story's AC lists the Tiers tab's own advanced search (Tier Name,
 *   Description) under that heading, and the case opens the Tiers tab, so the
 *   filter is the Tiers tab's Tier Name field; the expected "only records of
 *   tiers matching Generic" is checked on the tier cards it leaves.
 * - 18610 / 18612: a number input that refuses the minus sign outright counts
 *   as rejecting the value; one that takes it must refuse the save with a
 *   message.
 */

/** A tier order must be positive. */
export const POSITIVE_ORDER = /positive|greater than|at least|minimum|must be|invalid|range|between/i;
/** Coverage must be 0-100. */
export const COVERAGE_RANGE = /between|range|0.*100|100|maximum|minimum|greater|less|exceed/i;
/** A delete prompt that warns the tier is in use. */
export const IN_USE_WARNING = /in use|assigned|trades|cannot be deleted|linked/i;

export const CASES = {
  nameAtLimit: { azureId: '18606', nameEn: textOfLength(100, 'T'), nameAr: SAFE_TEXT.tierNameAr, order: 2, coverage: 50 },
  nameOverLimit: { azureId: '18607', nameEn: textOfLength(101, 'T'), nameAr: SAFE_TEXT.tierNameAr, order: 2, coverage: 50 },
  addGeneric: { azureId: '18608', tier: { order: 1, nameEn: 'Generic', nameAr: 'جنيسة', coverage: 80, descriptionEn: 'Generic medicines at the standard coverage.' } },
  namesRequired: { azureId: '18609', nameEn: 'Required Names Tier', nameAr: SAFE_TEXT.tierNameAr, order: 2, coverage: 60 },
  orderPositive: { azureId: '18610', nameEn: 'Order Check Tier', nameAr: SAFE_TEXT.tierNameAr, coverage: 60, invalid: [0, -1], valid: 1 },
  orderUnique: { azureId: '18611', nameEn: 'Second Order Tier', nameAr: SAFE_TEXT.tierNameAr, coverage: 70, duplicate: 1, unique: 2 },
  coverageRange: { azureId: '18612', nameAr: SAFE_TEXT.tierNameAr, valid: [0, 100], invalid: [-1, 101] },
  editCoverage: { azureId: '18613', from: 80, to: 90 },
  deleteUnused: { azureId: '18614', unused: { nameEn: 'Unused Tier', nameAr: 'مستوى غير مستخدم', order: 2, coverage: 40 } },
  warnInUse: { azureId: '18615' },
  tierNameSearch: {
    azureId: '18616',
    tiers: [
      { nameEn: 'Generic', nameAr: 'جنيسة', order: 1, coverage: 80, descriptionEn: 'Generic medicines' },
      { nameEn: 'Brand', nameAr: 'تجارية', order: 2, coverage: 50, descriptionEn: 'Branded medicines' },
    ],
    term: 'Generic',
  },
  descriptionSearch: {
    azureId: '18617',
    tiers: [
      { nameEn: 'Generic', nameAr: 'جنيسة', order: 1, coverage: 80, descriptionEn: 'Covers generic medicines' },
      { nameEn: 'Specialty', nameAr: 'تخصصية', order: 2, coverage: 30, descriptionEn: 'For specialist medicines only' },
    ],
    term: 'specialist',
  },
  cardFormat: {
    azureId: '18618',
    tiers: [
      { nameEn: 'Generic', nameAr: 'جنيسة', order: 1, coverage: 80, descriptionEn: 'Generic medicines' },
      { nameEn: 'Preferred Brand', nameAr: 'تجارية مفضلة', order: 2, coverage: 60, descriptionEn: 'Preferred branded medicines' },
      { nameEn: 'Non Preferred', nameAr: 'غير مفضلة', order: 3, coverage: 30 },
    ],
  },
  rapidChanges: {
    azureId: '18620',
    first: { nameEn: 'Rapid Tier A', nameAr: 'مستوى أ', order: 1, coverage: 70 },
    second: { nameEn: 'Rapid Tier B', nameAr: 'مستوى ب', order: 2, coverage: 40 },
    editedCoverage: 90,
  },
} as const;
