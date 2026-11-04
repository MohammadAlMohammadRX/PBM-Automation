import type { PolicyShape } from './policyPermissions.data';
import { POLICY_SCOPED_PAYER } from '../../utils/policy/writerBHelpers';

/**
 * US 15175 "View Policy - Documentation" (policy folder 08) - the application's
 * "endorsements".
 *
 * The Documentation tab in this build (verified live 2026-11-03): CARDS, not a
 * table - title, type tag, state badge, description, effective date / created
 * on / user, and a delete icon (prompt "Delete Documentation"). No Edit, no
 * separate Status / Approval Status, no attachment link seen. Add drawer: Title*
 * (no maxlength), Document Type* (Rider Addition, Coverage Change, Member Change,
 * Premium Adjustment, Other), Effective Date (date only, defaults to today),
 * Description* (maxlength 2000), one attachment (.pdf, .doc, .docx, image/*,
 * 10 MB; uploaded when chosen). On a published policy a document is STAGED
 * (Draft Attachment) and goes through Send for Approval; a live one shows no badge.
 *
 * Literal readings and TC-vs-AC notes:
 * - The cases speak of a "table" with columns; they are asserted on the cards
 *   (the information each column names must be on the entry) - the missing
 *   Status, Approval Status, attachment link and Edit are findings.
 * - Entries are added to a Draft (v0) policy unless the case is about approval
 *   (19522: an approved policy, where the entry is staged and approved / rejected).
 * - 19511: the description textarea carries maxlength 2000, so a 2,001st
 *   character cannot be typed; the case's intent - a 2,001-character
 *   description is never saved - is asserted, with either the validation
 *   message or the field holding at most 2,000 characters.
 * - 19512: the title has NO maxlength; a 251-character title must be refused
 *   with a message, or held to 250, and never saved.
 * - 19513: the sheet's effective date 2026-11-01 is behind the run date; today is
 *   used (the drawer's default). rider.pdf is a 2 MB PDF.
 * - 19516 "leaving Effective Date blank": live the drawer defaulted the date to
 *   today and raised no error (probe 45) - asserted as the case states.
 * - 19518: "a working download link" is the card's link AND the stored file
 *   answering GET /api/FileUpload/Download/{guid}. sample.jpg is sent as a PNG
 *   image (an image type all the same).
 * - 19519 / 19520: the drawer's file error ("The attachment must be a PDF, Word
 *   document, or image." / "The attachment must not exceed 10 MB.") carries no
 *   id; PolicyDocumentDrawer reads it as the drawer's id-less field error
 *   (2026-11-04 triage - the run looked only for an id and found nothing).
 * - 19520: 10 MB = 10,485,760 bytes.
 * - 19522 "version number" is the policy's (the documents carry none).
 * - 19524: no Edit is offered on an entry - the case is asserted and fails there.
 * - 19528 "different browser window sizes": 1366x768 and 1920x1080, then a reload.
 * - 19529 "Viewer": the Payer Admin role (which lacks GetPolicyEndorsements by
 *   default) given GetPolicyEndorsements and withheld CreatePolicyEndorsement /
 *   DeletePolicyEndorsement, on a Draft of that account's payer.
 */
export const CASES = {
  descriptionLength: { azureId: '19511', max: 2000 },
  titleLength: { azureId: '19512', max: 250 },
  addEntry: { azureId: '19513', title: 'Rider Update Q1', type: 'Rider Addition', description: 'Added new rider coverage', file: 'rider.pdf', bytes: 2 * 1024 * 1024 },
  allTypes: { azureId: '19515' },
  requiredFields: { azureId: '19516', fields: ['title', 'type', 'effectiveDate', 'description'] as const },
  uniqueTitle: { azureId: '19517', title: 'Coverage Review 2026' },
  attachmentTypes: { azureId: '19518' },
  unsupportedType: { azureId: '19519' },
  attachmentSize: { azureId: '19520', limit: 10 * 1024 * 1024 },
  approvalProgress: { azureId: '19522' },
  listColumns: { azureId: '19523' },
  editEntry: { azureId: '19524', description: 'Revised rider terms', effectiveInDays: 7 },
  deleteEntry: { azureId: '19525', title: 'Temporary Note' },
  download: { azureId: '19526', file: 'rider.pdf' },
  removeAttachment: { azureId: '19527', file: 'removed-before-save.pdf' },
  noAttachment: { azureId: '19528', viewports: [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }] as const },
  viewerAccess: {
    azureId: '19529',
    payerName: POLICY_SCOPED_PAYER,
    shape: { with: ['documents'], without: ['addDocument', 'deleteDocument'] } satisfies PolicyShape,
  },
} as const;

/** A max-length message. */
export const TOO_LONG = /maximum|too long|exceed|at most|characters|2000|2,000|250/i;

/** A duplicate-title refusal. */
export const DUPLICATE_TITLE = /unique|already exists|duplicate|same title/i;

/** A file-size refusal. */
export const TOO_LARGE = /10 ?MB|too large|exceed|size/i;

/** An approval status as the case names them. */
export const APPROVAL_STATE = { draft: /Draft/, pending: /Pending/, approved: /Approved/, rejected: /Rejected/ } as const;

/** A permissions refusal. */
export const DENIED = /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied|unauthori[sz]ed/i;

/** A description that tells an automation entry apart. */
export const DESCRIPTION = 'Recorded by the automation suite.';
