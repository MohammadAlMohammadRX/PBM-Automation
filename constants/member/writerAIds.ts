import { MEMBER_CARD, MEMBER_COLUMN, MEMBER_IMPORT, MEMBER_LIST } from './memberIds';

/**
 * Writer A's id patterns for the member list folders (01-04, 06, 16), built
 * from the foundation ids (constants/member/memberIds.ts) - prefix / suffix
 * matches for record-keyed elements, in screen order.
 */
export const WRITER_A_IDS = {
  /** A table row's member-code cell: `member-list-table-row-{memberId}-cell-membercode` (screen order = the list order). */
  rowCodeCellPrefix: `${MEMBER_LIST.screen}-table-row-`,
  rowCodeCellSuffix: `-cell-${MEMBER_COLUMN.memberCode}`,
  /** A card's title: `member-card-{memberId}-title` (screen order = the cards order). */
  cardTitlePrefix: MEMBER_CARD.prefix,
  cardTitleSuffix: `-${MEMBER_CARD.title}`,
  /** One KPI tile's value: `{tile}-value`. */
  kpiValueSuffix: '-value',
  /** The toolbar holding the keyword search, the quick filters, Sort, Export, Import, Add. */
  toolbar: MEMBER_LIST.toolbar,
  /** The Upload history drawer of the member import. */
  importHistory: MEMBER_IMPORT.history,
} as const;
