import { terminologyShape } from '../accounts/payerAdminRole.data';
import { IS_ACTIVE_FIELD } from './terminology.data';
import { textOfLength, type TerminologyFieldSpec } from '../../utils/TerminologyProvisioning';

/**
 * US 15154 "Correct and Reimport Failed Upload Rows" (terminology folder 09).
 *
 * Failed rows are produced by a real import (fixture `completedImport`) into a
 * terminology whose Code is required, unique, ALPHANUMERIC and at most 20
 * characters and whose Description is required (max 255). The Upload Errors
 * tab lists each failed row with a per-cell error and a "Fix & save this row"
 * action (verified 2026-10-29). The sheet's corrected code "TERM-VALID-01"
 * contains hyphens, which the alphanumeric restriction forbids; its
 * alphanumeric form is used.
 */

export const DESCRIPTION_MAX = 255;

export const ERROR_FIELDS: TerminologyFieldSpec[] = [
  { name: 'Code', type: 'text', restriction: 'alphaNumeric', maxLength: 20, required: true, unique: true },
  { name: 'Description', type: 'text', restriction: 'none', maxLength: DESCRIPTION_MAX, required: true },
];

export const HEADERS = ['Code', 'Description', IS_ACTIVE_FIELD];

/** The four failing rows of the 20-row file (US 15154 case 675), with the cause of each. */
export const FAILING_ROWS = {
  invalidCode: ['BAD-CODE-1', 'Hyphens are not alphanumeric', 'true'],
  missingCode: ['', 'Mandatory code left empty', 'true'],
  missingDescription: ['MISSINGDESC1', '', 'true'],
  tooLongCode: ['CODETOOLONGFORLIMIT21', 'Code over 20 characters', 'true'],
} as const;

/** `count` valid rows. */
export const validRows = (count: number): string[][] =>
  Array.from({ length: count }, (_, i) => [`VALIDROW${i + 1}`, `Valid row ${i + 1}`, 'true']);

/** The 20-row file: 16 valid rows and the four failing ones. */
export const twentyRowFile = (): string[][] => [...validRows(16), ...Object.values(FAILING_ROWS).map((r) => [...r])];

export const CASES = {
  allListed: { azureId: '20151', failing: Object.values(FAILING_ROWS).map((r) => r[0] || r[1]) },
  cellErrors: { azureId: '20152', missing: /required/i, format: /alphanumeric|letters|digits|format|only|characters/i },
  correctOne: { azureId: '20153', corrected: 'TERMVALID01' },
  movesToSuccess: { azureId: '20154', corrected: 'TERMVALID02' },
  unchanged: { azureId: '20155' },
  partialBatch: { azureId: '20156', corrections: ['TERMVALID03', 'TERMVALID04'] },
  emptyMandatory: { azureId: '20157', required: /required/i },
  overLength: { azureId: '20158', description: () => textOfLength(DESCRIPTION_MAX + 1, 'Description '), error: /exceed|maximum|characters|long/i },
  persistence: { azureId: '20159' },
  noPermission: { azureId: '20160', granted: terminologyShape([], ['viewTerminologyErrors']) },
} as const;
