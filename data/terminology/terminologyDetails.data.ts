import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { IS_ACTIVE_FIELD } from './terminology.data';
import type { TerminologyFieldSpec } from '../../utils/TerminologyProvisioning';

/**
 * US 17435 "View Terminology Details" (terminology folder 18).
 *
 * The sheet's details page has an Overview tab showing a terminology's Arabic
 * Name, English Name, City and Actions. The live page (2026-10-29) has Data,
 * Fields, Upload Errors and Audit History tabs and no such attributes on a
 * terminology; the cases provision a terminology whose fields are Arabic Name /
 * English Name / City with one record holding the sheet's values, and expect
 * the Overview tab the sheet describes.
 */

export const OVERVIEW_FIELDS: TerminologyFieldSpec[] = [
  { name: 'Arabic Name', type: 'text', restriction: 'none', maxLength: 100 },
  { name: 'English Name', type: 'text', restriction: 'none', maxLength: 100, required: true, unique: true },
  { name: 'City', type: 'text', restriction: 'none', maxLength: 100 },
];

export const SHEET_TABS = [/overview/i, /fields/i, /upload errors/i, /audit history/i];
export const OVERVIEW_LABELS = [/arabic name/i, /english name/i, /city/i, /actions/i];

export const CASES = {
  overview: { azureId: '20260', record: { 'Arabic Name': 'مصطلح', 'English Name': 'Term', City: 'Riyadh' } },
  fields: {
    azureId: '20259',
    fields: [
      { name: 'Code', type: 'text', required: true, unique: true },
      { name: 'Description', type: 'text' },
      { name: 'Category', type: 'text' },
    ] as TerminologyFieldSpec[],
    expected: ['Code', 'Description', 'Category', IS_ACTIVE_FIELD],
  },
  uploadErrors: { azureId: '20262', headers: ['Code', IS_ACTIVE_FIELD], rows: [['', 'true'], ['', 'false']] },
  auditHistory: { azureId: '20261', before: 'Before the change', after: 'After the change' },
  blankArabic: { azureId: '20263', record: { 'Arabic Name': '', 'English Name': 'No Arabic Name', City: 'Riyadh' } },
  blankEnglish: { azureId: '20264', record: { 'Arabic Name': 'بدون اسم', 'English Name': '', City: 'Riyadh' } },
  tabContext: { azureId: '20265', tabs: ['schema', 'errors', 'audit', 'data'] as const },
  noUploadErrors: { azureId: '20266', empty: /no (upload )?errors|no records|no results|no data|nothing/i },
  actionsByPermission: { azureId: '20267', granted: TERMINOLOGY_VIEW_ONLY },
  deleted: { azureId: '20268' },
  fieldConstraints: {
    azureId: '20269',
    fields: [
      { name: 'Code', type: 'text', required: true, unique: true },
      { name: 'Description', type: 'text', required: false },
      { name: 'Effective Date', type: 'date', restriction: 'dateOnly', required: true },
    ] as TerminologyFieldSpec[],
    expected: [
      { name: 'Code', type: /^Text$/i, required: /^Yes$/i },
      { name: 'Description', type: /^Text$/i, required: /^No$/i },
      { name: 'Effective Date', type: /^Date$/i, required: /^Yes$/i, restriction: /Date Only/i },
    ],
  },
  consistency: { azureId: '20270' },
  city: { azureId: '20274', cities: ['Jeddah', 'Dammam'] },
} as const;
