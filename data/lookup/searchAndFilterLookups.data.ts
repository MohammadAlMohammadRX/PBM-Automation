/**
 * US 20853 "Search and Filter Lookups" (lookup folder 01, 14 cases, 21104-21117).
 *
 * The Lookup Register (System Settings > Lookups, `lookup-list`) is read-only:
 * 57 predefined lists, columns Code / English Name / Arabic Name / Actions
 * (View only), 10 rows a page, default order GetLookups `sortBy: "CreatedOn desc"`
 * (reports/lookup/Lookup-Foundation-Notes.md). Nothing in this folder changes data.
 *
 * Literal readings / decisions (Lookup-Writers-Brief.md, lead decisions):
 *  - The cases' example "GENDER" / "Gender" / "الجنس" (21105, 21106, 21108, 21111)
 *    is an EXAMPLE (decision 1): the register holds the list `gender`
 *    (lower-case), so GENDER_CODE is used literally and its English / Arabic
 *    names are READ from GetLookups at run time (never typed from the case).
 *  - "Matching" (search and Advance Search) is read as "contains, ignoring
 *    case"; every row shown must contain the term, and the expected list must
 *    be among them.
 *  - 21108's data "Code GENDER + English Name Gender" narrows to the same single
 *    row with or without the Code filter, so removing the Code chip would show
 *    no change. TWO_FILTERS uses real values where the English-only result is
 *    LARGER than the combined one, so "the list updates" is observable.
 *  - 21110 "Attempt to sort by any column header": the register's sort is the
 *    Sort By menu (the headers carry no sort); Predefined must be absent from
 *    the columns, the Advance Search fields and the Sort By options.
 *  - 21113 (decision 6): User A = a suite role WITHOUT any Lookups.* right
 *    (NO_LOOKUP_RIGHTS); User B = a suite role holding only the view rights
 *    (VIEW_LOOKUP_RIGHTS). The administrator's own register is the baseline.
 *    "Not accessible or denied" = the register table never renders for User A
 *    (the menu entry's presence is reported in the evidence).
 *  - 21115: "No lookups found." asserted literally (decision 2).
 *  - 21116 (decision 3): 57 asserted against the rows counted across every
 *    page AND GetLookups `totalRows`; "no Add, Edit or Delete" = no add button
 *    on the register and every row's only action is View.
 *  - 21117 (decision 10, exploratory) is the scripted sequence EXPLORATORY_TERMS.
 *  - 21104 precondition "lookups with different creation dates": BLOCKED at run
 *    time when every list carries the same createdOn (order not observable).
 */
export const CASES = {
  newestFirst: { azureId: '21104' },
  advancedSearch: { azureId: '21105' },
  quickSearch: { azureId: '21106' },
  everyList: { azureId: '21107' },
  removeOneChip: { azureId: '21108' },
  clearAll: { azureId: '21109' },
  noPredefined: { azureId: '21110' },
  chipShown: { azureId: '21111' },
  uniqueCodes: { azureId: '21112' },
  permission: { azureId: '21113' },
  viewList: { azureId: '21114' },
  noResults: { azureId: '21115' },
  fiftySeven: { azureId: '21116' },
  exploratory: { azureId: '21117' },
} as const;

/** The register's real list standing for the cases' "GENDER" example (decision 1). */
export const GENDER_CODE = 'gender';

/** The list 21114 opens with View: the suite's home list (decision: home list userDeactivationReason). */
export const HOME_LIST = 'userDeactivationReason';
/** The second list the brief names (unused here; kept with the home list as the brief asks). */
export const SECOND_LIST = 'roleDeactivationReason';

/** The default order (GetLookups `sortBy`, seen live) and the sort trigger's default label (21104). */
export const DEFAULT_SORT = 'CreatedOn desc';
export const DEFAULT_SORT_LABEL = 'Newest';

/** The register's columns as the header ids carry them, in screen order (Actions last). */
export const REGISTER_COLUMNS = ['code', 'englishname', 'arabicname', 'actions'] as const;
/** The data columns' header texts (21107). */
export const REGISTER_HEADERS = ['Code', 'English Name', 'Arabic Name'] as const;
/** The only row action the register may offer (21116). */
export const ONLY_ROW_ACTION = 'view';

/** The Advance Search fields the AC names (21105) - their drawer labels. */
export const ADVANCED_LABELS = { code: 'Code', englishName: 'English Name', arabicName: 'Arabic Name' } as const;

/** What must appear nowhere: as a column, an Advance Search field or a Sort By option (21110). */
export const PREDEFINED = /predefined|محدد/i;

/** 21108: two filters whose English-only result is larger than the combined one. */
export const TWO_FILTERS = { code: 'user', englishName: 'Deactivation' } as const;

/** 21109: a search term and an Advance Search filter applied before Clear. */
export const CLEAR_SETUP = { search: 'Reason', code: 'Deactivation' } as const;

/** 21115 (the case's own example) and its literal empty state. */
export const NO_MATCH_TERM = 'zzzznotfound';
export const EMPTY_STATE = 'No lookups found.';

/** 21116 / AC: the number of predefined lists. */
export const PREDEFINED_LIST_COUNT = 57;

/** 21117: the terms of the scripted exploratory sequence. */
export const EXPLORATORY_TERMS = { search: 'Reason', code: 'Deactivation', englishName: 'User' } as const;

/** 21113 (decision 6): a role with no Lookups.* right; a role with only the view-lookups rights. */
export const NO_LOOKUP_RIGHTS = ['Users.GetUsers'] as const;
export const VIEW_LOOKUP_RIGHTS = ['Lookups.GetLookups', 'Lookups.GetLookup'] as const;

/** BLOCKED reasons decided at run time (decision 7). */
export const BLOCKED = {
  sameCreationDates: 'every lookup list in the register carries the same Created On (GetLookups createdOn), so "newest first" cannot be observed - precondition "Multiple lookups exist with different creation dates" is not met',
} as const;
