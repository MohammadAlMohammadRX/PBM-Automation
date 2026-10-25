import { NETWORK_MESSAGE, pickerDateTime, pickerMinutesFromNow } from './network.data';
import { MESSAGE, englishOfLength } from './networkForm.data';

/**
 * Test data for US 14125 "Edit existing network details".
 *
 * Every edit is a maker-checker change: Save stages a draft ("Saved as
 * draft"), Send for Approval routes it, and only an approval publishes it.
 * The network edited is the case's own (`networkIn`), never "NET-1001" or a
 * shared record. The edit form carries NO Network Code field - the sheet's
 * "code shown read-only in the form" is asserted against the drawer's text.
 */
export const EDIT = {
  prepopulated: { azureId: '17864' },
  effectiveToday: { azureId: '17865', newEffective: () => pickerMinutesFromNow(10) },
  effectivePast: { azureId: '17866', newEffective: () => pickerDateTime(-50) },
  unchangedPast: { azureId: '17869', description: () => `Edited description ${englishOfLength(6)}` },
  sameDayExpiry: { azureId: '17867' },
  expiredEditable: { azureId: '17868', description: () => `Edited while expired ${englishOfLength(6)}` },
  draftPrivate: { azureId: '17870', description: () => `Private draft change ${englishOfLength(6)}` },
  sendForApproval: { azureId: '17871', description: () => `Change for review ${englishOfLength(6)}` },
  approvePublishes: { azureId: '17875', description: () => `Approved change ${englishOfLength(6)}` },
  rejectKeepsLive: { azureId: '17872', description: () => `Rejected change ${englishOfLength(6)}` },
  concurrency: { azureId: '17873', sessionB: () => `Saved first by B ${englishOfLength(6)}`, sessionA: () => `Stale save by A ${englishOfLength(6)}` },
  roles: { azureId: '17874' },
  clearedRequired: { azureId: '17876' },
  checklist: { azureId: '17877' },
  acrossStatuses: { azureId: '17879', description: () => `Explored edit ${englishOfLength(6)}` },
} as const;

/** The registration rules the edit form must enforce the same way (17877). */
export const EDIT_CHECKLIST = [
  { rule: 'a required English name', key: 'nameEn' as const, value: '', clear: true, message: new RegExp(NETWORK_MESSAGE.required) },
  { rule: 'a required Arabic name', key: 'nameAr' as const, value: '', clear: true, message: new RegExp(NETWORK_MESSAGE.required) },
  { rule: 'Arabic-only Arabic name', key: 'nameAr' as const, value: 'Latin Name', clear: false, message: MESSAGE.arabicOnly },
  { rule: 'no past effective date', key: 'effectiveDate' as const, value: pickerDateTime(-30), clear: false, message: new RegExp(NETWORK_MESSAGE.effectiveInPast) },
  { rule: 'expiry after effective', key: 'expiryDate' as const, value: pickerDateTime(-400), clear: false, message: MESSAGE.expiryInPast },
] as const;

/** The description every edited network starts with (passed to networkIn). */
export const ORIGINAL_DESCRIPTION = 'Original description before the edit.';

/** The same calendar day as a `DD/MM/YYYY HH:mm` value, at 23:59 - a same-day expiry. */
export const sameDayLate = (dateTime: string): string => `${dateTime.slice(0, 10)} 23:59`;

/** A concurrency refusal: HTTP 409 and a message about the record having changed. */
export const CONFLICT = { status: 409, message: /modified|changed|conflict|reload|refresh/i } as const;

/** Status codes for a refused edit by a role without the right. */
export const DENIED_STATUSES = [401, 403] as const;
