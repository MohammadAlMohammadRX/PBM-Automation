import { pickerDateTime, pickerMinutesFromNow } from '../networks/network.data';
import type { NetworkBlockedCase } from '../networks/network.data';
import { PERMANENT_PLAN_CODE, PLAN_MESSAGE, PROVISIONAL_PLAN_CODE, planFormData, planNamed, planNamedAr, type PlanFormData } from './plan.data';
import { PLAN_FIELD } from '../../pages/plan/PlanFormDialog';

/**
 * Test data for US 14147 "Create new insurance plan with bilingual attributes"
 * (plan folder 03), written 2026-10-27.
 *
 * Every plan is built by the case for itself through the Add Plan wizard with a
 * unique suffix (planNamed), under the Plans suite payer (data/plans/planSuite
 * .data.ts) - the sheet's "Payer Tawuniya" is replaced by it, because only that
 * payer has the Active formulary an approval needs. The sheet's fixed dates
 * (2026-11-10, "today = 2026-10-08") are kept as RELATIVE dates so a re-run on
 * any day exercises the same rule.
 *
 * CONFLICT NOTED FOR THE LEAD (18978): its steps say the code is generated at
 * creation and "keeps the same" at approval, while its own summary and the
 * story's AC say generation is DEFERRED to the first approval. The live app
 * shows a provisional PLN-D- code on a draft and issues PLN-nnnn at approval
 * (live fact). The case asserts the AC / summary reading.
 */

/** Alias kept per story, as the brief asks. */
export type PlanBlockedCase = NetworkBlockedCase;

/** Validation wording the wizard / CreatePlan / UpdatePlan answer with (patterns - none confirmed word for word). */
export const PLAN_FORM_MESSAGE = {
  required: /required/i,
  englishOnly: /English/i,
  arabicOnly: /Arabic/i,
  duplicateName: /already|exist|in use|duplicate|unique/i,
  /** "Expiry must be after the effective date" in any wording. */
  expiryAfterEffective: /expiry.*(after|later|greater|before)|(after|later).*effective|period|same day/i,
  /** "Effective date cannot be in the past / must be today or later". */
  effectiveNotPast: /past|today or later|today/i,
  lengthLimit: /maximum|exceed|at most|characters|length|long/i,
  savedAsDraft: PLAN_MESSAGE.savedAsDraft,
  /**
   * What the SCREEN confirms a draft save with - "Saved as draft | Your changes were saved
   * as a draft ..." - not the server's successMessage wording, which never shows
   * (18976 on the re-run, 2026-10-28). The cases ask for a confirmation message.
   */
  savedAsDraftShown: /saved as (a )?draft/i,
} as const;

/** The labels step 1 must show (Basic Information) and step 2 (Effective Period). */
export const STEP_ONE_FIELDS = [PLAN_FIELD.nameEn, PLAN_FIELD.nameAr, PLAN_FIELD.type, PLAN_FIELD.payer, PLAN_FIELD.descriptionEn] as const;
export const STEP_TWO_FIELDS = [PLAN_FIELD.effectiveDate, PLAN_FIELD.expiryDate] as const;

/** "Draft Version 1" as the approval cell would print it (AC: Version 1 is created as Draft). */
export const DRAFT_VERSION_ONE = /v1\s*·\s*Draft/;

/** Any plan code - the provisional draft one or the permanent one. */
export const ANY_PLAN_CODE = new RegExp(`${PROVISIONAL_PLAN_CODE.source}|${PERMANENT_PLAN_CODE.source}`);

/** The detail header's version badge for version one. */
export const VERSION_ONE = /v1\b/;

/** The relative stand-ins for the sheet's dates. */
const IN_FIVE_DAYS = 5;

export const CREATE = {
  twoStep: {
    azureId: '18976',
    build: (): PlanFormData => planFormData({ nameEn: planNamed('Senior Care Plan'), nameAr: planNamedAr('خطة رعاية كبار السن'), type: 'Individual' }),
  },
  englishScript: { azureId: '18977', invalidEnglishName: 'خطة رعاية كبار السن' },
  codeAtApproval: { azureId: '18978', build: (): PlanFormData => planFormData({ nameEn: planNamed('Code Deferred Plan') }) },
  codeAndVersionOne: { azureId: '18979', build: (): PlanFormData => planFormData({ nameEn: planNamed('Version One Plan') }) },
  arabicScript: { azureId: '18980', invalidArabicName: 'Senior Care Plan' },
  duplicateInPeriod: {
    azureId: '18981',
    sheetName: 'Family Care Plan',
    existingName: (): string => planNamed('Family Care Plan'),
    /** The existing Active namesake runs for 30 days, so "after its period" is day 32 onwards. */
    existingExpiryInMinutes: 30 * 24 * 60,
    overlapping: (nameEn: string): PlanFormData => planFormData({ nameEn, effectiveDate: pickerMinutesFromNow(10), expiryDate: pickerDateTime(200) }),
    afterExisting: { effectiveDate: () => pickerDateTime(32), expiryDate: () => pickerDateTime(400) },
  },
  sameDay: {
    azureId: '18982',
    build: (): PlanFormData => planFormData({ nameEn: planNamed('Same Day Plan'), effectiveDate: pickerDateTime(IN_FIVE_DAYS, '09:00'), expiryDate: pickerDateTime(IN_FIVE_DAYS, '18:00') }),
  },
  blankExpiry: { azureId: '18983', build: (): PlanFormData => planFormData({ nameEn: planNamed('Open Ended Plan') }) },
  oneDayGap: {
    azureId: '18984',
    build: (): PlanFormData => planFormData({ nameEn: planNamed('One Day Plan'), effectiveDate: pickerDateTime(IN_FIVE_DAYS, '10:00'), expiryDate: pickerDateTime(IN_FIVE_DAYS + 1, '10:00') }),
  },
  pastEffective: { azureId: '18985', build: (): PlanFormData => planFormData({ nameEn: planNamed('Past Start Plan'), effectiveDate: pickerDateTime(-1) }) },
  effectiveToday: { azureId: '18986', build: (): PlanFormData => planFormData({ nameEn: planNamed('Starts Today Plan'), effectiveDate: pickerMinutesFromNow(10), expiryDate: pickerDateTime(365) }) },
  missingPayer: { azureId: '18987', build: (): PlanFormData => planFormData({ nameEn: planNamed('No Payer Plan') }) },
  createRole: { azureId: '18988' },
} as const;
