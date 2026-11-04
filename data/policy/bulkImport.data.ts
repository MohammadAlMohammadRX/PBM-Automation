import { SERVER_MESSAGE } from './policy.data';
import { SUITE_POLICY_PREFIX, policyStamp } from '../../utils/PolicyProvisioning';

/**
 * US 15176 "Policy Bulk Import" (policy folder 09).
 *
 * The shared bulk-import component (as Formulary's), verified live 2026-11-03 only as far
 * as the drawers and the Upload history: the list's Import takes POLICIES
 * (`policy-list-bulk-import`, ImportPolicies, "NoEdit"); a policy's Members and Network
 * Assignment tabs take MEMBERS and NETWORK ASSIGNMENTS (`policy-detail-bulk-import`,
 * ImportPolicyMembers / ImportPolicyNetworks, add-only, for that policy). Adding the file
 * starts the import; it runs as a bulk operation (GetBulkOperationsStatus) and lands in
 * Upload history (File, Record type, Total, Succeeded, Failed, Status, failed-rows
 * download as CSV / Excel). There is no Documentation import (the story lists one; no case
 * here asks for it).
 *
 * FILES ARE BUILT AT RUN TIME from the screens' own templates (Export > Export Template on
 * the list, the tab's Export Template for members / networks), rows written BY MEANING
 * (utils/policy/writerAHelpers policyImportRow / memberImportRow / networkImportRow): the
 * probe uploaded nothing, so the template headers were never read. Every policy a file
 * creates is a suite-named draft, registered for teardown.
 *
 * Where the case's test data cannot be used as written:
 *  - 19530 / 19538: 20 rows as the sheet says; 19536's "500 rows" is 30 (each valid row
 *    is a policy to discard afterwards) - the lifecycle is what the case checks.
 *  - 19531 (members_valid.xlsx, 15 rows): the members of an Individual draft of the case.
 *  - 19533: the drawer states "up to 25 MB" where the story (and the case) say 5 MB; the
 *    5 MB file is one padding row (an oversized name that can only fail) so the import
 *    creates nothing. 19543's "close to 5 MB" file is padded the same way.
 *  - 19534's "missing required column" is a row missing a required VALUE (the Arabic
 *    name): a file without a template column is refused as a whole, not row by row.
 *  - 19540's "same Policy Number": a policy import creates policies (no number column
 *    to repeat), so the duplicate is the same English name twice - the case's own
 *    expected text quotes that server message.
 *  - 19542's "Viewer" is the Payer Admin without the two import rights.
 *  - 19543's member-limit violations need a MEMBERS file and a policy import cannot carry
 *    them: its file mixes valid, invalid, duplicate and an oversized row.
 */

/** `QA Automation Policy <label> <stamp> 1..n`. */
export const batchNames = (label: string, count: number): string[] => {
  const stamp = policyStamp();
  return Array.from({ length: count }, (_, i) => `${SUITE_POLICY_PREFIX} ${label} ${stamp} ${i + 1}`);
};

/** One megabyte as the drawer counts it. */
export const MB = 1024 * 1024;

/** What the import says, by meaning. */
export const IMPORT_MESSAGE = {
  wrongType: /csv|excel|xlsx|format|file type|not supported|unsupported|allowed/i,
  tooLarge: /size|too large|exceed|5\s?MB|maximum/i,
  invalidDate: /date/i,
  unknownType: /type/i,
  missingRequired: /required|arabic|name|missing/i,
  unknownPlan: /plan/i,
  expiryBeforeEffective: /expiry|after|before|period/i,
  unknownMember: /not found|unknown|invalid|does not exist|no member|member/i,
  // The import result writes the sentence without its full stop ("This policy has reached its member limit", 2026-11-04).
  memberLimit: new RegExp(SERVER_MESSAGE.memberLimitReached.replace(/\.$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  duplicate: /duplicate|already exists|overlapping|appears more than once/i,
  empty: /no data rows|no rows|empty|no importable|nothing to import/i,
  inFlight: /upload|process|pending|queued|running|in progress/i,
  denied: /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied|unauthori[sz]ed/i,
} as const;

/** An invalid policy row: what is wrong with it and the reason its error must name. */
export interface InvalidRow {
  kind: string;
  label: string;
  reason: RegExp;
  type?: string;
  nameAr?: string;
  planCode?: string;
  /** Written as is (an unparseable date). */
  effective?: string;
  effectiveDays?: number;
  expiryDays?: number;
}

/** The invalid rows of 19534, each with the reason its error must name. */
export const INVALID_ROWS: readonly InvalidRow[] = [
  { kind: 'invalid date format', label: 'Bad Date', effective: 'not-a-date', reason: IMPORT_MESSAGE.invalidDate },
  { kind: 'unrecognised policy type', label: 'Bad Type', type: 'Platinum', reason: IMPORT_MESSAGE.unknownType },
  { kind: 'missing required value', label: 'No Arabic', nameAr: '', reason: IMPORT_MESSAGE.missingRequired },
  { kind: 'unknown plan', label: 'Bad Plan', planCode: 'PLN-9999', reason: IMPORT_MESSAGE.unknownPlan },
  { kind: 'expiry before effective', label: 'Bad Period', effectiveDays: 30, expiryDays: 10, reason: IMPORT_MESSAGE.expiryBeforeEffective },
];

export const CASES = {
  validCsv: { azureId: '19530', rows: 20 },
  excelMembers: { azureId: '19531', rows: 15 },
  unsupported: { azureId: '19532', fileName: 'data.txt' },
  sizeLimit: { azureId: '19533', limitBytes: 5 * MB },
  invalidRows: { azureId: '19534', valid: 10 },
  memberLimit: { azureId: '19535', limit: 10, current: 8, rows: 5, added: 2 },
  lifecycle: { azureId: '19536', rows: 30, final: /^Completed$/ },
  /** Limit 3: three valid members, one unknown member code, two more valid members beyond the limit. */
  mixedOutcome: { azureId: '19537', limit: 3, unknownCode: 'MBR-0000000', beyondLimit: 2 },
  errorFile: { azureId: '19538', valid: 17, invalid: 3 },
  empty: { azureId: '19539' },
  duplicates: { azureId: '19540' },
  allTypes: { azureId: '19541', members: 2 },
  noRights: { azureId: '19542' },
  nearLimit: { azureId: '19543', bytes: Math.round(4.8 * MB), valid: 5 },
} as const;
