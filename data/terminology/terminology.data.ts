import type { NetworkBlockedCase } from '../networks/network.data';
import type { TerminologyFieldSpec } from '../../utils/TerminologyProvisioning';
import type { UploadFile } from '../../pages/terminology/TerminologyImportDialog';
import { buildXlsx } from '../../utils/XlsxUtils';

/**
 * Shared test data for the Terminology Management module (Feature 15145,
 * sheet `test_cases_pushed_2026-10-29 Terminology.csv`, 238 cases in 19 stories).
 *
 * Roles. The sheet speaks of a System Administrator, a Reference Data
 * Administrator, a Compliance Officer and a privileged user; this environment
 * has ONE account holding every terminology right (the administrator,
 * `careconnect`), and it plays all four. The restricted roles ("Viewer",
 * "Data Entry user", "without the permission") are the Payer Admin account,
 * which holds NO terminology permission, shaped per case by GRANTING the rights
 * the case says it keeps (fixtures/shapedNonAdmin.fixture.ts).
 *
 * "Another module that consumes terminologies". The consumer in reach is the
 * Mapping Identifier picker of the field builder - it lists the terminologies
 * other screens may use (GetTerminologiesDropdown, active ones only) - and, for
 * VALUES, a mapping field's record drawer (GetMappedFieldValues). Cases that name
 * the Prescription module or a policy record use these instead.
 */

export type TerminologyBlockedCase = NetworkBlockedCase;

/** The six predefined categories (US 17436). */
export const PREDEFINED_TERMINOLOGIES = ['Street', 'District', 'City', 'Country', 'Policy Holder', 'Trades'] as const;

/** Status and lock labels as the list renders them. */
export const TERMINOLOGY_STATUS = { active: 'Active', inactive: 'Inactive' } as const;
export const LOCKED_LABEL = 'Locked';

/** Row action labels. */
export const ACTION_LABEL = {
  activate: 'Activate',
  inactivate: 'Inactivate',
  lock: 'Lock',
  unlock: 'Unlock',
} as const;

/** The automatic field every terminology carries (US 15151). */
export const IS_ACTIVE_FIELD = 'Is Active';

/** Field type labels the builder offers. */
export const FIELD_TYPE = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Boolean',
  list: 'List',
  mapping: 'Mapping Identifier',
} as const;

/** What the application's messages must say, by meaning (the wording is not fixed by the sheet). */
export const MESSAGE = {
  required: /required/i,
  unique: /unique|already exists|duplicate/i,
  maxLength: /exceed|maximum|at most|longer than|too long|characters/i,
  locked: /locked/i,
  predefined: /predefined|protected|system/i,
  holdsData: /data|record|in use|used|referenced|depend/i,
  mapped: /mapp|referenced|in use|used/i,
  reserved: /reserved/i,
  denied: /permission|not authori[sz]ed|access denied|forbidden|not allowed/i,
  notFound: /not found|no longer|does not exist|unable to load|deleted/i,
  format: /format|invalid|must not contain|only|characters/i,
  inactive: /inactive|not active|deactivated|unavailable/i,
  noData: /no data|no rows|no records|empty|nothing/i,
  unsupported: /not supported|unsupported|xlsx|excel|file type|format/i,
  importRunning: /running|in progress|processing|already/i,
} as const;

/** Raw technical detail a user-facing message must not expose. */
export const TECHNICAL_DETAIL = /stack ?trace|exception|at PBM\.|\.cs:|sql|null reference|\bline \d+/i;

/** Success toasts, verified 2026-10-29. */
export const TOAST_TEXT = {
  created: /terminology created/i,
  saved: /saved|updated/i,
  deleted: /deleted/i,
  deactivated: /deactivated/i,
  activated: /activated/i,
  locked: /locked/i,
  unlocked: /unlocked/i,
  recordSaved: /record saved/i,
  recordDeleted: /record deleted/i,
} as const;

/** A unique, required text "Code" field - the default record key. */
export const CODE_FIELD: TerminologyFieldSpec = { name: 'Code', type: 'text', restriction: 'none', maxLength: 50, required: true, unique: true };
/** An optional text "Description" field. */
export const DESCRIPTION_FIELD: TerminologyFieldSpec = { name: 'Description', type: 'text', restriction: 'none', maxLength: 255 };

/** The upload template's header of a terminology's own field set. */
export const uploadHeaders = (fieldNames: readonly string[]): string[] => [...fieldNames, IS_ACTIVE_FIELD];

/** `count` upload rows with codes `{prefix}-1..count`, active. */
export const codeRows = (prefix: string, count: number, extra: readonly string[] = []): string[][] =>
  Array.from({ length: count }, (_, i) => [`${prefix}-${i + 1}`, ...extra, 'true']);

/** The sheet's free-text placeholders a case may type, by meaning. */
export const SAFE_TEXT = {
  description: 'Built by an automated terminology case.',
  editedDescription: 'Updated description',
} as const;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** An Excel file for the Upload Data drawer, built from a header and rows. */
export const xlsxUpload = (headers: readonly string[], rows: ReadonlyArray<readonly string[]>, name = 'terminology-upload.xlsx'): UploadFile => ({
  name,
  mimeType: XLSX_MIME,
  buffer: buildXlsx(headers, rows),
});

/** A record label used in a case, unique per run. */
export const recordCode = (label: string): string => `${label}-${Date.now().toString(36).toUpperCase()}`;
