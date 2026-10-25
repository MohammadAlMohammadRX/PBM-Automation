import { arabicOfLength, buildNetwork, named, namedAr } from './networkForm.data';

/**
 * Test data for US 14316 "Validate network naming and Arabic description on
 * create and edit".
 *
 * "Payer X" is the top-bar scope payer - the payer every network created
 * through the form belongs to. "Payer Y" is a payer the case publishes
 * (publishedPayer). The existing "Network A" / "Network B" are provisioned by
 * `networkIn` under the payer the case needs, in the status it needs.
 */
export const NAMING = {
  uniqueName: { azureId: '18206', build: () => buildNetwork({ nameEn: named('Gulf Care Network'), nameAr: namedAr('شبكة الخليج للرعاية') }) },
  duplicateActive: { azureId: '18207', sheetName: 'Network A' },
  otherPayer: { azureId: '18208', sheetName: 'Network A' },
  editToDuplicate: { azureId: '18209', sheetNameA: 'Network A', sheetNameB: 'Network B' },
  reuseExpired: { azureId: '18210', sheetName: 'Network A' },
  reuseInactive: { azureId: '18211', sheetName: 'Network A' },
  reuseDeleted: { azureId: '18212', sheetName: 'Network A' },
  arabicRequired: { azureId: '18213' },
  arabicAt255: { azureId: '18214', length: 255, value: () => arabicOfLength(255) },
  arabicOver255: { azureId: '18215', limit: 255, value: () => arabicOfLength(256) },
  arabicNameLatin: { azureId: '18217', value: 'Network123' },
  arabicDescriptionLatin: { azureId: '18216', value: 'This is a network #1' },
  arabicDescriptionValid: { azureId: '18218', value: 'شبكة رعاية صحية شاملة لجميع المناطق' },
  arabicNameMixed: { azureId: '18219', value: 'شبكة123' },
  pastedOddities: { azureId: '18221', nameAr: 'شبكة 😀‎‏', descriptionAr: 'وصف 😀‎‏' },
  allRulesTogether: { azureId: '18220', sheetName: 'Network A', descriptionAr: 'This is a network #1' },
} as const;

/** Emoji and bidi control characters - none may reach a stored Arabic field. */
export const ODD_CHARACTERS = /[‎‏‪-‮]|\p{Extended_Pictographic}/u;
