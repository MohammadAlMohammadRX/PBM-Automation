import type { NetworkBlockedCase } from '../networks/network.data';
import type { RolePermissionKey } from '../accounts/payerAdminRole.data';
import { PLAN_COLUMN, PLAN_SORT_FIELD, type PlanSortColumn } from '../../constants/ElementIds';
import { isBlank } from '../../utils/SortUtils';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { PLAN_LIFECYCLE, PLAN_MESSAGE, planNamedAr } from './plan.data';

/**
 * Test data for US 14161 "Sort plan directory by attribute" (plan folder 12;
 * network twin: tests/network/06 + data/networks/sortDirectory.data.ts).
 *
 * The Sort By menu's options are `plan-list-sort-option-{field}-{asc|desc}`;
 * choosing one re-requests the list with `sortBy` = "<Field> asc|desc",
 * compared case-insensitively with PLAN_SORT_FIELD. The default is
 * "CreatedOn desc" (Newest to Oldest). In Arabic, Plan Name sorts by the
 * Arabic name (`plannamear`).
 *
 * Each sort is checked twice: the `sortBy` requested and the order rendered.
 * Plan Type and Expiry Date are not table columns, so their order is read from
 * the rows the list request answered (`planTypeId` -> label, `expiryDate`).
 */

export type PlanBlockedCase = NetworkBlockedCase;
export type Direction = 'asc' | 'desc';

export const DEFAULT_SORT = 'createdon desc';
export const ARABIC_NAME_SORT_FIELD = 'plannamear';

/** The sortBy a column/direction should request (lower case). */
export const expectedSortBy = (column: PlanSortColumn, direction: Direction): string => `${PLAN_SORT_FIELD[column]} ${direction}`;

/** Human words for each column, as the menu names it. */
export const COLUMN_WORDS: Record<PlanSortColumn, string> = {
  name: 'Plan Name',
  code: 'Plan Code',
  type: 'Plan Type',
  status: 'Status',
  effectiveDate: 'Effective Date',
  expiryDate: 'Expiry Date',
  createdOn: 'creation date',
  modifiedOn: 'last modified date',
};

/** Both directions, and how a step names each. */
export const DIRECTIONS: Direction[] = ['asc', 'desc'];
export const DIRECTION_WORDS: Record<Direction, string> = { asc: 'ascending (A to Z)', desc: 'descending (Z to A)' };

/** The attributes the menu must sort by both ways. */
export const SORTABLE_COLUMNS: PlanSortColumn[] = ['name', 'code', 'type', 'status', 'effectiveDate', 'expiryDate'];

/** The options the acceptance criteria require (19124), matched by substring. */
export const REQUIRED_OPTIONS = [
  ...SORTABLE_COLUMNS.map((column) => COLUMN_WORDS[column]),
  'Newest to Oldest',
  'Oldest to Newest',
];

/** Each attribute's options: two per column (asc / desc). */
export const OPTIONS_PER_COLUMN = 2;

/** The default option the menu marks (19111). */
export const DEFAULT_OPTION = 'Newest to Oldest';

/** "DD/MM/YYYY HH:mm" -> a sortable "YYYYMMDDHHmm" key ('' stays ''). */
export const dateKey = (cell: string): string => {
  const m = cell.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?/);
  return m ? `${m[3]}${m[2]}${m[1]}${m[4] ?? '00'}${m[5] ?? '00'}` : cell;
};

/** True when every blank value sits together at the start or at the end. */
export const blanksAtOneEnd = (values: string[]): boolean => {
  const shape = values.map((value) => (isBlank(value) ? 'B' : 'S')).join('');
  return /^B*S*$/.test(shape) || /^S*B*$/.test(shape);
};

/** Item fields read for the attributes that are not table columns. */
export const ITEM_FIELD = { type: 'planTypeId', expiryDate: 'expiryDate', createdOn: 'createdOn' } as const;

/** What a restricted role is stripped of to lose the directory (19125). */
export const DIRECTORY_PERMISSIONS: RolePermissionKey[] = ['viewPlansDashboard', 'viewPlanDetails'];

/** Every sort the KPI case (19121) walks through, each with its expected direction. */
export const ALL_SORTS: { column: PlanSortColumn; direction: Direction }[] = [
  { column: 'name', direction: 'asc' },
  { column: 'code', direction: 'asc' },
  { column: 'type', direction: 'asc' },
  { column: 'status', direction: 'asc' },
  { column: 'effectiveDate', direction: 'asc' },
  { column: 'expiryDate', direction: 'asc' },
  { column: 'createdOn', direction: 'desc' },
];

const TWO_YEARS = 2 * 365 * 24 * 60;
const THREE_YEARS = 3 * 365 * 24 * 60;
const FOUR_YEARS = 4 * 365 * 24 * 60;

/** Three drafts: A and B share an effective date, C starts a year later (19118). */
export const tieDataset = (): { prefix: string; plans: { name: string; effectiveInMinutes: number; expiryInMinutes: number }[]; tied: string[] } => {
  const prefix = `Tie ${networkStamp()}`;
  const plans = [
    { name: `${prefix} A`, effectiveInMinutes: TWO_YEARS, expiryInMinutes: FOUR_YEARS },
    { name: `${prefix} B`, effectiveInMinutes: TWO_YEARS, expiryInMinutes: FOUR_YEARS },
    { name: `${prefix} C`, effectiveInMinutes: THREE_YEARS, expiryInMinutes: FOUR_YEARS },
  ];
  return { prefix, plans, tied: [plans[0].name, plans[1].name] };
};

/** Mixed numeric / special-character / bilingual names sharing one stamp (19126). */
export const mixedNameDataset = (): { stamp: string; plans: { nameEn: string; nameAr?: string }[] } => {
  const stamp = networkStamp();
  return {
    stamp,
    plans: [
      { nameEn: `123 Plan ${stamp}` },
      { nameEn: `Plan@Gold ${stamp}` },
      // The sheet's 'خطة مختلطة Mixed' mixes scripts in one name; English names refuse
      // Arabic letters (US 14162), so the Arabic half is the plan's Arabic name.
      { nameEn: `Mixed ${stamp}`, nameAr: planNamedAr('خطة مختلطة') },
    ],
  };
};

export const CASES = {
  defaultOrder: { azureId: '19111' },
  nameAsc: { azureId: '19113', column: 'name' as PlanSortColumn, cell: PLAN_COLUMN.name },
  nameDescArabic: { azureId: '19114', column: 'name' as PlanSortColumn, cell: PLAN_COLUMN.name },
  code: { azureId: '19115', column: 'code' as PlanSortColumn, cell: PLAN_COLUMN.code },
  type: { azureId: '19116', column: 'type' as PlanSortColumn },
  status: { azureId: '19117', column: 'status' as PlanSortColumn, cell: PLAN_COLUMN.status },
  effectiveTies: { azureId: '19118', column: 'effectiveDate' as PlanSortColumn, cell: PLAN_COLUMN.effectiveDate },
  expiryDesc: { azureId: '19119', column: 'expiryDate' as PlanSortColumn },
  persistsThroughFilter: { azureId: '19120', column: 'code' as PlanSortColumn, cell: PLAN_COLUMN.code, status: PLAN_LIFECYCLE.active },
  kpisUnchanged: { azureId: '19121', sorts: ALL_SORTS },
  successive: {
    azureId: '19122',
    byName: { column: 'name' as PlanSortColumn, direction: 'asc' as Direction, cell: PLAN_COLUMN.name },
    byStatus: { column: 'status' as PlanSortColumn, direction: 'desc' as Direction, cell: PLAN_COLUMN.status },
    newest: { column: 'createdOn' as PlanSortColumn, direction: 'desc' as Direction },
  },
  emptyDirectory: { azureId: '19123', term: (): string => `NOSUCHPLAN ${networkStamp()}`, empty: PLAN_MESSAGE.noPlansFound, column: 'status' as PlanSortColumn },
  options: { azureId: '19124' },
  authorized: { azureId: '19125', permissions: DIRECTORY_PERMISSIONS, column: 'status' as PlanSortColumn, cell: PLAN_COLUMN.status },
  mixedNames: { azureId: '19126', column: 'name' as PlanSortColumn, cell: PLAN_COLUMN.name },
} as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [];
