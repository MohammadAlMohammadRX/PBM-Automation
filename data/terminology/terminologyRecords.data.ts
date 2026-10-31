import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { textOfLength, type TerminologyFieldSpec } from '../../utils/TerminologyProvisioning';

/**
 * US 15152 "Add, Edit, and Delete Terminology Records" (terminology folder 07).
 *
 * Each case provisions an unlocked terminology with a required, unique "Code"
 * (max 255) and an optional "Description" - the sheet's record shape. The
 * alphanumeric case gives Code the Alphanumeric restriction. A record "used by
 * another terminology's mapping" is a record of X selected by a record of Y.
 */

export const CODE_MAX = 255;

export const RECORD_FIELDS: TerminologyFieldSpec[] = [
  { name: 'Code', type: 'text', restriction: 'none', maxLength: CODE_MAX, required: true, unique: true },
  { name: 'Description', type: 'text', restriction: 'none', maxLength: 255 },
];

export const ALPHANUMERIC_FIELDS: TerminologyFieldSpec[] = [
  { name: 'Code', type: 'text', restriction: 'alphaNumeric', maxLength: CODE_MAX, required: true, unique: true },
  { name: 'Description', type: 'text', restriction: 'none', maxLength: 255 },
];

export const CASES = {
  add: { azureId: '20125', code: 'TERM-NEW-001', description: 'Valid new record' },
  emptyMandatory: { azureId: '20126', description: 'Missing mandatory code' },
  duplicate: { azureId: '20128', code: 'TERM-001', original: 'Original record', duplicate: 'Duplicate attempt' },
  minimumLength: { azureId: '20127', code: 'A', description: 'Minimum-length code' },
  overMaximum: { azureId: '20129', code: () => textOfLength(CODE_MAX + 1, 'CODE'), description: 'Over-length code' },
  edit: { azureId: '20130', code: 'TERM-EDIT-1', before: 'Old description', after: 'Updated description' },
  deleteReferenced: { azureId: '20131', code: 'TERM-REF-A', referrer: 'TERM-REF-Y' },
  deleteUnreferenced: { azureId: '20132', code: 'TERM-FREE-B' },
  invalidFormat: { azureId: '20133', code: '<<>>%%', description: 'Invalid format' },
  noPermission: { azureId: '20134', granted: TERMINOLOGY_VIEW_ONLY, code: 'TERM-RO-1' },
  rapidEdits: { azureId: '20135', code: 'TERM-RAPID-1', first: 'First concurrent edit', second: 'Second concurrent edit' },
} as const;
