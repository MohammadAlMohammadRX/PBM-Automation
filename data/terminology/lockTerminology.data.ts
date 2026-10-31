import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { stamped } from './defineTerminology.data';

/**
 * US 15158 "Lock a Terminology to Prevent Changes" (terminology folder 12).
 *
 * The Compliance Officer of the sheet is the administrator account (the only
 * one holding SetTerminologyLocked). Lock / Unlock is offered on the list row
 * and the card - the detail screen offers no lock control (verified
 * 2026-10-29), which the lock-from-detail step reports. The sheet's "Country",
 * "LegacyRegion" and "NewCountry" are provisioned per run.
 */

export const LOCKED_TEXT = /locked/i;

export const CASES = {
  lock: { azureId: '20185', name: () => stamped('Country'), records: [{ Code: 'SA' }] },
  definitionLocked: { azureId: '20186', name: () => stamped('Country'), changed: 'Changed while locked' },
  recordsLocked: { azureId: '20187', name: () => stamped('Country'), code: 'SA', added: 'AE', edited: 'Edited while locked' },
  listIndicator: { azureId: '20188', name: () => stamped('Country') },
  detailIndicator: { azureId: '20189', name: () => stamped('Country') },
  unlock: { azureId: '20190', name: () => stamped('Country'), changed: 'Changed after unlocking' },
  noPermission: { azureId: '20191', name: () => stamped('Country'), granted: TERMINOLOGY_VIEW_ONLY },
  duringImport: { azureId: '20192', name: () => stamped('Country'), explained: /import|lock/i },
  alreadyLocked: { azureId: '20193', name: () => stamped('Country') },
  activeAndInactive: { azureId: '20194', active: () => stamped('Country'), inactive: () => stamped('LegacyRegion') },
  zeroAndPopulated: { azureId: '20195', empty: () => stamped('NewCountry'), populated: () => stamped('Country'), records: [{ Code: 'SA' }, { Code: 'AE' }] },
} as const;
