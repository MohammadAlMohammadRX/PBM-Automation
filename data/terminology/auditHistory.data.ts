import { TERMINOLOGY_VIEW_ONLY, terminologyShape } from '../accounts/payerAdminRole.data';
import type { TerminologyBlockedCase } from './terminology.data';
import type { TerminologyChange } from '../../utils/TerminologyProvisioning';

/**
 * US 15162 "Review Terminology Audit History" (terminology folder 16).
 *
 * The Compliance Officer is the administrator account. Each case gives its
 * terminology a known history through the API (fixture
 * `terminologyWithHistory`) and reads the Audit History tab - a timeline of
 * "Terminology Updated  <date time>  By <actor>" entries, each opening an
 * "Audit Entry" drawer with Field / Before / After rows (verified 2026-10-29).
 * The sheet names the detail tabs "Overview, Fields, Upload Errors, Audit
 * History"; the screen's are Data, Fields, Upload Errors, Audit History.
 */

export const DETAIL_TABS = [/overview/i, /fields/i, /upload errors/i, /audit history/i];
export const TIMESTAMP = /\d{2}\/\d{2}\/\d{4}/;
export const ADMIN_ACTOR = /careconnect/i;

/** "29/10/2026 07:05 PM" -> epoch ms, for ordering the timeline. */
export function auditTime(text: string): number {
  const [d, m, y, hh, mm, ampm] = text.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) ?(AM|PM)?/i)?.slice(1) ?? [];
  const hours = (Number(hh) % 12) + (/pm/i.test(ampm ?? '') ? 12 : 0);
  return Date.UTC(Number(y), Number(m) - 1, Number(d), hours, Number(mm));
}

export const CASES = {
  definitionChange: { azureId: '20234', history: [{ description: 'Definition changed once' }] as TerminologyChange[] },
  fieldChanges: {
    azureId: '20235',
    history: [{ addField: { name: 'Audit Field', type: 'text' } }, { dropField: 'Audit Field' }] as TerminologyChange[],
    field: 'Audit Field',
  },
  recordChanges: {
    azureId: '20236',
    history: [{ addRecord: { Code: 'AUDIT-REC-1' } }, { updateRecord: 0, cells: { Code: 'AUDIT-REC-1B' } }, { deleteRecord: 0 }] as TerminologyChange[],
    identifier: /AUDIT-REC-1/,
    actions: [/creat|add|insert/i, /updat|edit/i, /delet|remov/i],
  },
  noAuditPermission: { azureId: '20237', granted: TERMINOLOGY_VIEW_ONLY },
  oldAndNew: { azureId: '20239', history: [{ description: 'Draft' }, { description: 'Approved' }] as TerminologyChange[], before: 'Draft', after: 'Approved' },
  whoAndWhen: { azureId: '20240', granted: terminologyShape(['updateTerminology']), adminChange: 'Changed by user A', otherChange: 'Changed by user B' },
  chronological: {
    azureId: '20242',
    history: [{ addField: { name: 'Added Field', type: 'text' } }, { description: 'Updated once' }, { description: 'Updated again' }] as TerminologyChange[],
    minimum: 4,
  },
  anyStatus: { azureId: '20241', history: [{ description: 'Changed before deactivation' }, { deactivate: true }] as TerminologyChange[] },
  newTerminology: { azureId: '20243', empty: /no (history|entries|records|audit)|nothing/i, created: /creat/i },
  heavyHistory: { azureId: '20244', history: [{ lockToggles: 300 }] as TerminologyChange[], minimum: 300 },
  deletedTraceable: {
    azureId: '20245',
    history: [{ addRecord: { Code: 'DELETED-REC-1' } }, { deleteRecord: 0 }] as TerminologyChange[],
    deletion: /delet|remov/i,
    editControls: /\b(edit|delete|remove)\b/i,
  },
} as const;

export const BLOCKED_CASES: TerminologyBlockedCase[] = [
  {
    azureId: '20238',
    title: 'should not reveal terminology details when the user holds only the Audit History permission',
    reason:
      'Needs an account holding the Terminologies section\'s "View Audit Logs" permission WITHOUT the view rights. '
      + 'Every section of the role catalogue has a permission labelled "View Audit Logs", and the role-shaping step '
      + 'finds permissions by label, so it would toggle the Payers one instead (the section-scoped lookup does not '
      + 'exist yet). Runnable with a dedicated audit-only account, or once the shaping step can address a permission '
      + 'within its section.',
  },
];
