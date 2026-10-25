import { NETWORK_LIST_HEADERS, NETWORK_MESSAGE } from './network.data';
import { buildNetwork, englishOfLength, named, namedAr } from './networkForm.data';

/** The two interface languages. */
type AppLanguage = 'en' | 'ar';

/**
 * Test data for US 14141 "Display bilingual labels and validation messages".
 *
 * The interface language is the header toggle (LanguageSwitcher), which flips
 * <html lang/dir>. Every case that switches to Arabic switches back in
 * cleanup, because the preference is remembered per user.
 *
 * "Translated" is asserted as: Arabic letters present and no English word left
 * beyond codes and type acronyms (untranslatedWords). The Arabic wording itself
 * is not pinned, because the sheets do not give it.
 */
export const BILINGUAL = {
  english: { azureId: '18007', language: 'en' as AppLanguage },
  arabic: { azureId: '18008', language: 'ar' as AppLanguage },
  englishAccepted: { azureId: '18009', build: () => buildNetwork({ nameEn: named('Al Dawaa Pharmacy Network') }) },
  englishRejectsArabic: { azureId: '18010', value: 'شبكة الدواء' },
  arabicAccepted: { azureId: '18011', build: () => buildNetwork({ nameAr: namedAr('شبكة الدواء الصيدلية') }) },
  arabicRejectsEnglish: { azureId: '18012', value: 'Al Dawaa Network' },
  nameLength: { azureId: '18013', min: 1, max: 100, minimum: () => englishOfLength(1), atMax: () => englishOfLength(100), overMax: () => englishOfLength(101) },
  decisionTable: { azureId: '18014' },
  midFormSwitch: { azureId: '18015' },
  specialCharacters: { azureId: '18016', english: 'Network123!@#', arabic: 'شبكةNetwork' },
  arabicExploration: { azureId: '18017' },
  translationChecklist: { azureId: '18018' },
  allRoles: { azureId: '18019' },
  backendMessages: { azureId: '18020', englishWithArabic: 'شبكة الدواء' },
} as const;

/** The decision table of 18014: UI language x name content -> saves or not. */
export const DECISION_TABLE = [
  { language: 'en' as AppLanguage, row: 'English UI, both names valid', build: () => buildNetwork(), saves: true, outcome: 'saves with no validation error' },
  { language: 'en' as AppLanguage, row: 'English UI, Arabic text in the English name', build: () => buildNetwork({ nameEn: 'شبكة الدواء' }), saves: false, outcome: 'is refused with an error on the offending field' },
  { language: 'ar' as AppLanguage, row: 'Arabic UI, both names valid', build: () => buildNetwork(), saves: true, outcome: 'saves with no validation error' },
  { language: 'ar' as AppLanguage, row: 'Arabic UI, English text in the Arabic name', build: () => buildNetwork({ nameAr: 'Al Dawaa Network' }), saves: false, outcome: 'is refused with an error on the offending field' },
] as const;

/** The English list headers, in order - the English half of the checklist. */
export const ENGLISH_HEADERS = [...NETWORK_LIST_HEADERS];

/** The English required-field message. */
export const ENGLISH_REQUIRED = NETWORK_MESSAGE.required;

/** The toggle's own label: in English it offers Arabic, in Arabic it offers English. */
export const TOGGLE_LABEL = { en: 'عربي', ar: 'EN' } as const;
