import type { NetworkBlockedCase } from '../networks/network.data';
import type { PlanSpec } from '../../utils/PlanProvisioning';
import { ARABIC_TEXT, LATIN_WORD, untranslatedWords } from '../networks/networkForm.data';

/**
 * Test data for US 14162 "Display localized plan names and labels" (plan
 * folder 13; network twin: tests/network/22 + data/networks/bilingualLabels.data.ts).
 *
 * The AC names five Arabic labels. The sheet's cases look for each on the
 * screen - the View action of a plan row, the KPI band ("dashboard"), the
 * Export control, and the Version History and Audit History tabs - so that is
 * where they are asserted. (The AC words them like the payer module's
 * permission names; if the lead reads them as role-catalogue labels instead,
 * the strings below are the ones to look for there.)
 *
 * Plans with a blank English and/or Arabic name are built through the API; if
 * the application refuses a blank name, `planIn` reports the case BLOCKED (the
 * fallback rule cannot be exercised on a record that cannot exist).
 */

export type PlanBlockedCase = NetworkBlockedCase;
export { ARABIC_TEXT, LATIN_WORD, untranslatedWords };

/** The exact Arabic labels the AC requires. */
export const ARABIC_LABEL = {
  viewDetails: 'عرض تفاصيل الخطة',
  dashboard: 'عرض لوحة الخطط',
  exportPlans: 'تصدير الخطط',
  versions: 'عرض إصدارات الخطة',
  audit: 'عرض سجلات تدقيق الخطة',
} as const;

/** What the list shows when a plan has no name in either language. */
export const NO_NAME_PLACEHOLDER = '—';

/** A blank name, as the API is sent it. */
export const BLANK = '';

/** The direction an Arabic screen must render in. */
export const RTL = 'rtl';

/** Which value a plan name should DISPLAY: its English name, its Arabic name, or the placeholder. */
export type ShownName = 'en' | 'ar' | 'placeholder';

/** The four population combinations (19140) and what each interface language should show. */
export const NAME_COMBINATIONS: { label: string; spec: Pick<PlanSpec, 'nameEn' | 'nameAr'>; shows: Record<'en' | 'ar', ShownName> }[] = [
  { label: 'English only', spec: { nameAr: BLANK }, shows: { en: 'en', ar: 'en' } },
  { label: 'Arabic only', spec: { nameEn: BLANK }, shows: { en: 'ar', ar: 'ar' } },
  { label: 'both', spec: {}, shows: { en: 'en', ar: 'ar' } },
  { label: 'neither', spec: { nameEn: BLANK, nameAr: BLANK }, shows: { en: 'placeholder', ar: 'placeholder' } },
];

/** The interface languages a name is read in. */
export const LANGUAGES = ['en', 'ar'] as const;

export const CASES = {
  arabicEverywhere: { azureId: '19127' },
  englishEverywhere: { azureId: '19128' },
  englishFallback: { azureId: '19129', spec: { nameAr: BLANK } },
  selectedLanguage: { azureId: '19130' },
  bothBlank: { azureId: '19131', spec: { nameEn: BLANK, nameAr: BLANK }, placeholder: NO_NAME_PLACEHOLDER },
  latinInArabic: { azureId: '19132', value: 'Gold Plan' },
  arabicInEnglish: { azureId: '19133', value: 'خطة الذهب' },
  viewDetailsLabel: { azureId: '19134', label: ARABIC_LABEL.viewDetails },
  dashboardLabel: { azureId: '19135', label: ARABIC_LABEL.dashboard, tiles: 5 },
  exportLabel: { azureId: '19136', label: ARABIC_LABEL.exportPlans },
  versionsLabel: { azureId: '19137', label: ARABIC_LABEL.versions },
  auditLabel: { azureId: '19138', label: ARABIC_LABEL.audit },
  midSessionSwitch: { azureId: '19139' },
  allCombinations: { azureId: '19140', combinations: NAME_COMBINATIONS, placeholder: NO_NAME_PLACEHOLDER },
  rightToLeft: { azureId: '19141', direction: RTL },
} as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [];
