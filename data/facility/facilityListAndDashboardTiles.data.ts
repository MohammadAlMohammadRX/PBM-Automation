import type { FacilityKpiKey } from '../../constants/facility/facilityIds';
import type { FacilityShape } from '../../utils/facility/writerAHelpers';

/**
 * US 15131 "Facility list and dashboard tiles" (facility folder 01), 14 cases.
 *
 * How the cases map onto the live list (2026-11-04, Facility-Foundation-Notes.md):
 *  - Five tiles: Total Facilities, Active Facilities, Future Facilities, Inactive
 *    Facilities, Expired Licences. The AC says "Pending"; 17495's step 2 says "Future"
 *    - the case is asserted, a "pending|future" label passes (decision item: the AC
 *    and the case disagree on the label).
 *  - The tiles count the DISPLAYED status (effectiveStatusId): they are compared with
 *    the register (GetFacilities, every row) counted by that status. The register is
 *    shared, so the cases' "5 Active, 2 Pending, 1 Inactive, 1 Expired" cannot be set;
 *    each case builds one suite facility per status it names and compares the tiles
 *    with the register at its real size.
 *  - "List View" (17499) and "Table View" (17500) are the same table: the module has
 *    Table / Cards. The view choice is REMEMBERED per user (module-wide), and every
 *    case opening the list through `openTable` leaves it on Table; 17499 opens the
 *    module without touching the toggle and reads what it opened in (decision item:
 *    a first-ever visit cannot be reproduced for the shared administrator). 17500
 *    starts from Cards so that choosing Table is a real switch.
 *  - Inactivate from the list opens a DRAWER (reason + details), Activate and Delete
 *    the shared confirmation dialog - each is the case's "confirmation prompt".
 *  - 17505 expects the prompt to warn the delete is IRREVERSIBLE; the dialog reads
 *    "Do you want to delete {name}?" (the finding). The delete is SOFT (IsDeleted) -
 *    "permanently removed" is checked as gone from the list and GetFacility 404.
 *  - 17506 / (17610): the "read-only" role is the Payer Admin shaped through the
 *    `facilityRole` fixture (utils/facility/writerAHelpers.ts): GetFacilities granted
 *    (the Payer Admin lacks it, so it cannot open the list otherwise), DeleteFacility
 *    withheld. The direct request is DELETE DeleteFacility/{id} as that account.
 *  - 17507 (no facility exists): the register is never empty, so the list's and the
 *    dashboard's OWN answers are emptied in the browser (simulateEmptyRegister).
 *  - 17508 changes the status by Inactivate (the case's own example) and reads the
 *    row and the tiles WITHOUT a reload ("without needing a manual refresh").
 *  - 17509: the Overview shows licence dates raw (YYYY-MM-DD) where the row shows
 *    DD/MM/YYYY - the expiry is compared as a DAY (the format is 17546's finding);
 *    the licence number is read off the header strip (no id).
 */

/** A tile the cases expect and the label that carries it. */
export interface CaseTile {
  key: FacilityKpiKey;
  name: string;
  label: RegExp;
}

export const CASE_TILES: readonly CaseTile[] = [
  { key: 'total', name: 'Total', label: /total/i },
  { key: 'active', name: 'Active', label: /^active/i },
  { key: 'pending', name: 'Future', label: /future|pending/i },
  { key: 'inactive', name: 'Inactive', label: /^inactive/i },
  { key: 'expired', name: 'Expired Licences', label: /expired/i },
];

/** 17504's columns (case wording -> header pattern). */
export const LIST_COLUMNS: ReadonlyArray<[string, RegExp]> = [
  ['Facility Name', /^facility name$/i],
  ['Facility Type', /^facility type$/i],
  ['Code', /^code$/i],
  ['License Number', /^licen[cs]e (number|no\.?)$/i],
  ['License Expiry Date', /^licen[cs]e expiry( date)?$/i],
  ['Status', /^status$/i],
  ['Actions', /^actions$/i],
];

/** The row actions per status (17501). */
export const ACTIONS_ACTIVE = { offered: ['view', 'edit', 'inactivate', 'delete'], absent: ['activate'] } as const;
export const ACTIONS_INACTIVE = { offered: ['view', 'edit', 'activate', 'delete'], absent: ['inactivate'] } as const;

/** What 17505's prompt must say. */
export const IRREVERSIBLE_WARNING = /irreversib|cannot be undone|can ?not be reversed|permanent/i;

/** The empty-state message (17507). */
export const EMPTY_LIST = /no (results|facilities)/i;

export const CASES = {
  accurateTiles: { azureId: '17495' },
  expiredApartFromInactive: { azureId: '17497' },
  cardView: { azureId: '17498' },
  defaultListView: { azureId: '17499' },
  tableView: { azureId: '17500' },
  actionsByStatus: { azureId: '17501' },
  inactivate: { azureId: '17502', details: 'Inactivated by case 17502 of the automation suite.' },
  activate: { azureId: '17503' },
  columns: { azureId: '17504' },
  delete: { azureId: '17505' },
  /** The "Read-only / Viewer" role: the Payer Admin given the list, without DeleteFacility. */
  deleteDenied: { azureId: '17506', shape: { with: ['list'], without: ['delete'] } as FacilityShape },
  zeroTiles: { azureId: '17507' },
  tilesAfterChange: { azureId: '17508', details: 'Inactivated by case 17508 of the automation suite.', settleMs: 15_000 },
  viewOpensRow: { azureId: '17509' },
} as const;
