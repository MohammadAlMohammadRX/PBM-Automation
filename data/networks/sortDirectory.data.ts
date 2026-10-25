import { NETWORK_COLUMN, NETWORK_SORT_FIELD, type NetworkSortColumn } from '../../constants/ElementIds';
import { NETWORK_DEFAULT_SORT, NETWORK_LIFECYCLE, NETWORK_SORT_OPTIONS } from './network.data';
import { networkStamp } from '../../utils/NetworkProvisioning';

/**
 * Test data for US 14123 "Sort network directory by columns".
 *
 * The Sort By menu (verified 2026-10-21) offers 16 options: A-Z / Z-A for
 * Network Name, Network Code, Network Type, Status, Effective Date and Expiry
 * Date, plus Created On and Last Modified both ways. Choosing one re-requests
 * the list with `sortBy` = "<Field> asc|desc" (e.g. "NetworkNameEn asc"); the
 * default is "CreatedOn desc".
 *
 * Each column case asserts BOTH the request and the rendered order of the
 * first page - the request says what was asked, the page says what the user
 * sees. Type and Status sort by their lookup ids server-side
 * (`networktypeid`, `statusid`), so a label order that is not alphabetical is
 * a finding the cases will surface.
 */

export const DEFAULT_SORT = NETWORK_DEFAULT_SORT;
export const SORT_OPTIONS = [...NETWORK_SORT_OPTIONS];

/** How a column's cells compare: as text or as DD/MM/YYYY HH:mm dates. */
export type CellKind = 'text' | 'date';

export interface ColumnSortCase {
  azureId: string;
  column: NetworkSortColumn;
  /** The list cell key the rendered order is read from. */
  cell: string;
  kind: CellKind;
}

export const COLUMN_CASES: ColumnSortCase[] = [
  { azureId: '17794', column: 'name', cell: NETWORK_COLUMN.networkName, kind: 'text' },
  { azureId: '17796', column: 'code', cell: NETWORK_COLUMN.code, kind: 'text' },
  { azureId: '17795', column: 'type', cell: NETWORK_COLUMN.networkType, kind: 'text' },
  { azureId: '17797', column: 'status', cell: NETWORK_COLUMN.status, kind: 'text' },
  { azureId: '17798', column: 'effectiveDate', cell: NETWORK_COLUMN.effectiveDate, kind: 'date' },
  { azureId: '17799', column: 'expiryDate', cell: NETWORK_COLUMN.expiryDate, kind: 'date' },
];

/**
 * The sortBy a column/direction should request, compared case-insensitively:
 * the menu option id carries the model field in lower case
 * (`network-list-sort-option-networknameen-asc`) and the request the same
 * field in Pascal case ("NetworkNameEn asc").
 */
export const expectedSortBy = (column: NetworkSortColumn, direction: 'asc' | 'desc'): string =>
  `${NETWORK_SORT_FIELD[column]} ${direction}`;

/** Human words for each column, for titles. */
export const COLUMN_WORDS: Record<NetworkSortColumn, string> = {
  name: 'Network Name',
  code: 'Network Code',
  type: 'Network Type',
  status: 'Status',
  effectiveDate: 'Effective Date',
  expiryDate: 'Expiry Date',
  createdOn: 'creation date',
  modifiedOn: 'last modified date',
};

/** "DD/MM/YYYY HH:mm" -> a sortable "YYYYMMDDHHmm" key ('' stays ''). */
export const dateKey = (cell: string): string => {
  const m = cell.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?/);
  return m ? `${m[3]}${m[2]}${m[1]}${m[4] ?? '00'}${m[5] ?? '00'}` : cell;
};

/** Cell values turned into comparable keys for their kind. */
export const sortKeys = (values: string[], kind: CellKind): string[] =>
  values.map((value) => ({ text: value, date: dateKey(value) })[kind]);

/** Created-on stamps from list items, as sortable strings. */
export const createdOnKeys = (items: Record<string, unknown>[]): string[] => items.map((item) => String(item.createdOn ?? ''));

export const CASES = {
  defaultOrder: { azureId: '17793' },
  creation: { azureId: '17803' },
  emptyList: { azureId: '17800', term: `NOSUCHNETWORK ${networkStamp()}` },
  ties: { azureId: '17801' },
  bilingual: { azureId: '17802' },
  sequential: {
    azureId: '17804',
    path: [
      { column: 'name', direction: 'asc', label: 'Network Name (A-Z)' },
      { column: 'status', direction: 'desc', label: 'Status (Z-A)' },
      { column: 'effectiveDate', direction: 'asc', label: 'Effective Date (A-Z)' },
    ],
  },
  adminReview: { azureId: '17806' },
  withFilter: { azureId: '17805', status: NETWORK_LIFECYCLE.active, allStatuses: 'All Statuses' },
  exploratory: { azureId: '17809', keyboardSteps: 1 },
  checklist: { azureId: '17807' },
} as const;

/** Options the acceptance criteria require (17807), matched by substring. */
export const REQUIRED_OPTIONS = [
  'Network Name (A-Z)', 'Network Name (Z-A)',
  'Network Code (A-Z)', 'Network Code (Z-A)',
  'Network Type (A-Z)', 'Network Type (Z-A)',
  'Status (A-Z)', 'Status (Z-A)',
  'Effective Date (A-Z)', 'Effective Date (Z-A)',
  'Expiry Date (A-Z)', 'Expiry Date (Z-A)',
  'Newest to Oldest', 'Oldest to Newest',
] as const;
