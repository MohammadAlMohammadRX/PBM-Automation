import { env } from '../../constants/EnvironmentConfig';
import { pickerDateTime, repeatTo } from './network.data';
import { arabicOfLength, buildNetwork, named, namedAr, networkEffectiveToday } from './networkForm.data';

/**
 * Test data for US 14122 "Register a new network with bilingual information".
 *
 * The sheet's networks ('Al Noor Medical Network', 'Al Shifa Network', ...) are
 * created by each case for itself with a unique suffix, so a re-run never
 * collides with an earlier run's records. "Payer A" is the top-bar scope payer
 * the form shows; "Payer B" is a payer the case publishes (publishedPayer).
 */

/** The Arabic name field's label - Arabic in both interface languages. */
export const ARABIC_NAME_LABEL = 'الشبكة الطبية';

export const REGISTER = {
  approvedActive: { azureId: '17774', build: () => networkEffectiveToday({ nameEn: named('Al Noor Medical Network'), nameAr: namedAr('شبكة النور الطبية') }) },
  approvedFuture: { azureId: '17776', build: () => buildNetwork({ nameEn: named('Al Noor Future Network'), effectiveDate: pickerDateTime(30), expiryDate: pickerDateTime(400) }) },
  rejected: { azureId: '17778', build: () => networkEffectiveToday({ nameEn: named('Al Noor Rejected Network') }) },
  arabicAccepted: { azureId: '17777', build: () => buildNetwork({ nameAr: namedAr('شبكة الأمل الطبية') }) },
  arabicRejected: { azureId: '17780', invalid: ['Al Amal Network', 'شبكة Amal'] as const },
  descriptionsAtLimit: { azureId: '17779', limit: 1000, english: repeatTo('Coverage ', 1000), arabic: repeatTo('تغطية ', 1000) },
  descriptionsOverLimit: { azureId: '17781', limit: 1000, english: repeatTo('Coverage ', 1001), arabic: repeatTo('تغطية ', 1001) },
  duplicateSamePayer: { azureId: '17782', sheetName: 'Al Noor Medical Network' },
  sameNameOtherPayer: { azureId: '17783', sheetName: 'Al Noor Medical Network' },
  reuseAfterExpiry: { azureId: '17784', sheetName: 'Al Shifa Network' },
  missingEnglish: { azureId: '17785', key: 'nameEn', label: 'English' },
  missingArabic: { azureId: '17786', key: 'nameAr', label: 'Arabic' },
  labelBothLanguages: { azureId: '17787' },
  // QA lead, 2026-10-27: a System Administrator's network is seen by every user; a Payer Admin's
  // network, created for the payer chosen in the payer dropdown, only by that payer's users.
  creatorVisibility: {
    azureId: '17788',
    byAdmin: () => networkEffectiveToday({ nameEn: named('Admin Visible Network') }),
    byPayerAdmin: () => networkEffectiveToday({ nameEn: named('Payer Admin Network') }),
    /** The payer the administrator switches to for the last step - the suite's scope payer (SCOPE_PAYER). */
    adminWorkingPayer: () => env.scopePayer,
  },
  codeOnlyAtApproval: { azureId: '17790' },
  registrationRole: { azureId: '17791' },
  draftThenSubmit: { azureId: '17792', editedArabicDescription: () => `وصف محدث ${arabicOfLength(6)}` },
} as const;

/** The approval cell's state words the flows assert on. */
export const APPROVAL_CELL = {
  draft: /Draft/,
  pending: /Pending Approval/,
  rejected: /Rejected/,
} as const;

/** Status codes a server refusal of an unauthorised create may carry. */
export const DENIED_STATUSES = [401, 403] as const;

/** Text that must never appear in a rendered label (mojibake / replacement characters). */
export const MOJIBAKE = /�|Ø|Ù/;
