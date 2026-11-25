/**
 * Test data for "Bulk Import and Export Payer Records" (Azure US 16218).
 *
 * HISTORY. Until the build of 14 Nov 2026 the payer list had no import at all
 * (probed 2026-09-27: no file input, toolbar = Add + Export), so 16430 asserted
 * its presence and FAILED and ten cases were BLOCKED behind it. Retired
 * 2026-11-24: the list now has Import (`payer-list-import-trigger`), the shared
 * bulk drawer, Upload history and Export > Export Template.
 *
 * HOW THE IMPORT WORKS (verified live 2026-11-24, constants/payer/payerImportIds.ts):
 *   - adding a file STARTS the import (POST ImportPayers) - no preview, no
 *     Upload button; the drawer closes and the bottom "Upload complete" panel
 *     reports "<file> Payers Succeeded: n Failed: n";
 *   - Upload history lists File, Uploaded by/on, Total, Succeeded, Failed,
 *     Status ("Completed", "Completed with errors", "Failed") and a result file
 *     (CSV / Excel) holding the FAILED rows with an "Error" column first
 *     ("Payer Name (English): is required");
 *   - new rows become Draft payers ("Not Live", "v0 · Draft", code PAY-D-nnnn);
 *     a row carrying the Payer Code of an existing record updates it ("a change
 *     awaiting approval is withdrawn and goes back to draft");
 *   - a .txt is refused before upload ("Only .xlsx or .csv files are allowed.");
 *     an unreadable .xlsx is answered 400 "The file could not be read. Make sure
 *     it is a valid Excel or CSV file.";
 *   - a header-only file runs as an operation with 0 / 0 / 0 and status Failed.
 *
 * THE TEMPLATE has no Payer Code column; the export puts "Payer Code" first.
 */

/** Export > Export Template's columns, in order (Payers_Template.csv / .xlsx, read 2026-11-24). */
export const PAYER_IMPORT_HEADERS = [
  'Payer Name (English) *',
  'Payer Name (Arabic) *',
  'Payer Type *',
  'Email *',
  'Dial Code *',
  'Phone Number *',
  'License Number *',
  'Country *',
  'City *',
  'Effective Date *',
  'Expiry Date *',
] as const;

/** The export's extra first column - the key an update row is matched on. */
export const PAYER_EXPORT_CODE_HEADER = 'Payer Code';

/** What the drawer's drop hint documents as its limit: "Excel (.xlsx) or CSV (.csv), up to 25 MB." */
export const DOCUMENTED_LIMIT = /up to\s*25\s*MB/i;

/**
 * The file-size boundary (16433). The drawer documents 25 MB and no record
 * count, so the boundary is the size: a file of 25,000,000 bytes is within 25 MB
 * however a megabyte is counted, one of 25 MiB + 1 byte beyond it either way.
 */
export const AT_LIMIT_BYTES = 25_000_000;
export const OVER_LIMIT_BYTES = 25 * 1024 * 1024 + 1;
/** Valid records in the at-limit file (the rest of it is blank-line padding). */
export const AT_LIMIT_RECORDS = 3;

/** 16430: five new records. */
export const NEW_RECORDS = 5;

/** 16434: three valid rows and two invalid ones (a blank English name, an invalid email). */
export const MIXED = { valid: 3, invalid: 2, badEmail: 'not-an-email' } as const;

/** 16437: the invalid date the case names. */
export const INVALID_EFFECTIVE_DATE = '31-02-2026';

/** 16432: the phone an update row writes. */
export const UPDATED_PHONE = '598765432';

/** 16439: the two phones the duplicate-code rows carry. */
export const DUPLICATE_PHONES = ['511111111', '522222222'] as const;

/** 16442: rows of the "very large" file (all with a blank English name, so nothing is created). */
export const LARGE_FILE_ROWS = 2_000;

/** Reasons a result file / message must carry, by what the case names. */
export const REASON = {
  /** 16435: "Mandatory field "Payer Name" is required". */
  nameRequired: /payer name.*required|required.*payer name/i,
  /** 16437: "Invalid format for field "Effective Date"". */
  dateFormat: /effective date/i,
  invalid: /invalid|format|not a valid|must be/i,
  email: /email/i,
  /** 16439: "Duplicate Payer ID within file" - the app says "Payer Code: This code is already used in row 2 of the file". */
  duplicate: /duplicat|more than once|repeated|already (appears|in the file|used in row)/i,
  /** 16440: "No records found to import". */
  noRecords: /no (records|rows|data)|empty|nothing to import|does not contain any/i,
  /** 16441. */
  unsupported: /only \.xlsx or \.csv|not supported|unsupported|could not be read|not a valid|invalid file/i,
  /** 16433: "maximum record limit exceeded" / the size limit. */
  limit: /25\s*MB|too large|exceeds|maximum|limit/i,
} as const;

/** The list's approval-status reading of an unapproved import ("v0 · Draft"). */
export const DRAFT = /draft/i;
/** An approved import ("v1 · Approved"), and the lifecycle states an approved payer may show. */
export const APPROVED = 'Approved';
export const LIVE_STATES = ['Active', 'Future'] as const;
