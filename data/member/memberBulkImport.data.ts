import type { MemberShape } from './memberPermissions.data';

/**
 * US 17727 "Member Bulk import" (member folder 16), 14 cases.
 *
 * How the cases map onto the live screen (2026-11-05, Member-Foundation-Notes.md):
 *  - "Bulk Import Members" is the list's Import button -> the shared bulk import
 *    drawer (`member-list-bulk-import`). There is NO Upload button: ADDING the
 *    file starts the import (POST ImportMembers -> a bulk operation, "Pending"),
 *    the member screens lock while it runs, and BulkOperations/
 *    GetBulkOperationsStatus reports Completed / CompletedWithErrors / Failed
 *    with total / succeeded / failed / created / updated / unchanged rows. The
 *    case's "summary screen" is the drawer's Upload history (File, Total,
 *    Succeeded, Failed, Status, result downloads); the created / updated split
 *    exists only in the operation (19931 asks the SCREEN for it - asserted).
 *  - The "error file" is the history row's result download
 *    (DownloadMemberImportResult): an "Error" column first ("<Column>: <reason>;
 *    ...") + the row's values; only FAILED rows are in it (19933 asks for every
 *    row's Success / Failed - asserted).
 *  - Files are the template's CSV (`buildMemberImportCsv`, labels as values);
 *    rows are fresh suite members ("QA" / "Automation" / `MemberImp<stamp>`,
 *    unique document ID / e-mail). Row numbers in the cases are DATA rows,
 *    1-based. Rows are told apart in the error file by their Document ID.
 *  - Updates (19929, 19931) fill "Member Code" with the case's own members'
 *    codes and keep their names / document ID / e-mail / date of birth, changing
 *    the mobile number and the building number ("address, phone number").
 *  - 19936 "blank Member Name" = the English LAST name left blank (the first /
 *    second names stay "QA" / "Automation" so a wrongly created row is still a
 *    suite member and is removed); "blank Date of Birth" blanks the Hijri date
 *    too.
 *  - 19938 duplicate identifier: two NEW rows share one Document ID (the case's
 *    "e.g. National ID or Member ID" - a Member Code that exists nowhere would be
 *    refused for another reason).
 *  - 19939 "read-only viewer" = the Payer Admin shaped WITHOUT "Import members"
 *    (Members.BulkImport) and "View member upload history and results"; the
 *    administrator's Import button is the baseline. There is no import route to
 *    navigate to: "direct access" is the ImportMembers request itself.
 *  - 19940 files: a PDF and a harmless "script.exe" (bytes "MZ" + text), both
 *    added to the drop zone (setInputFiles bypasses the picker's filter).
 *  - 19941 "2000 rows": a moderate 30-row file (decision on volume: keep it
 *    modest) so the Pending -> Running -> Completed states can be observed.
 *  - 19942: row 3 born 2030-01-01 (future), row 6 born 1890-01-01 (136 years);
 *    their Hijri dates are left blank (1890 has no Hijri equivalent in range).
 *  - Every member an import creates is removed at teardown (`importCleanup`,
 *    by document ID); the case's own pre-existing members by `memberIn`.
 */
export const CASES = {
  updateExisting: { azureId: '19929', rows: 5 },
  addNew: { azureId: '19930', rows: 10 },
  mixed: { azureId: '19931', added: 6, updated: 4 },
  invalidData: { azureId: '19932', rows: 9, badDateRow: 7, badDate: '31-13-2023', badGenderRow: 9, badGender: 'X9' },
  distinguishRows: { azureId: '19933', valid: 7, invalid: 3 },
  errorFile: { azureId: '19934', valid: 4, invalid: 2 },
  emptyFile: { azureId: '19935', message: /no (member )?(records|rows|data)|empty/i },
  missingMandatory: { azureId: '19936', rows: 6, blankNameRow: 3, blankDobRow: 5 },
  badFormats: { azureId: '19937', rows: 5, badEmailRow: 2, badEmail: 'john.doe.example.com', badPhoneRow: 4, badPhone: 'ABCD1234' },
  duplicateInFile: { azureId: '19938', rows: 8, firstRow: 2, secondRow: 8 },
  notAuthorised: { azureId: '19939', shape: { without: ['import', 'importHistory'] } satisfies MemberShape },
  unsupportedType: { azureId: '19940', typeMessage: /\.?csv|\.?xlsx|excel|supported|allowed/i },
  stateFlow: { azureId: '19941', rows: 30, secondRows: 2 },
  ageRules: { azureId: '19942', rows: 6, futureRow: 3, futureDob: '2030-01-01', oldRow: 6, oldDob: '1890-01-01' },
} as const;

/** Error-file wording patterns per field. */
export const ERROR_TEXT = {
  dateOfBirth: /date of birth/i,
  gender: /gender/i,
  required: /required/i,
  lastName: /last name \(english\)|name/i,
  email: /e-?mail/i,
  phone: /mobile|phone/i,
  invalid: /invalid|format|valid/i,
  duplicate: /duplicate|already|same|another/i,
  future: /future/i,
  age: /age|maximum|exceed|old|range/i,
} as const;

/** The changes an update row makes (19929, 19931). */
export const UPDATE_CHANGES = { buildingNumber: '4321' } as const;
