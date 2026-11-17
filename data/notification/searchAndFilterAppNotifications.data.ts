/**
 * US 20999 "Search and Filter App Notifications" (notification folder 15, 13 cases 21562-21574).
 *
 * How it works in this build (reports/notification/Notification-Foundation-Notes.md): the App
 * Notification tab's search is server side (Enter -> GetDefinitions `searchText`, plus a `search`
 * chip); the filter drawer ("Advanced Search") has name (text), modulenameid, moduleactionid and
 * isactive (Yes / No) and every applied filter shows a chip `nc-definitions-filter-chips-chip-<key>`
 * ("Module: Payer Management", "Action: Need to Approve - Payer", "Active: Yes" - probe b30).
 * Default sort Newest (CreatedOn desc), so a suite record created by the case is on page 1.
 *
 * SAFETY: every record the cases need is a suite definition made through `suiteDefinitions`
 * (INACTIVE unless the case needs an active one, audience careconnect); teardown deletes them.
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - TC example names ("Policy Expiry Reminder") become suite names that carry them
 *   ("QA Automation Notification Policy Expiry Reminder <stamp>").
 * - "Only notifications whose name contains the typed text": every row name on screen contains the
 *   text (case-insensitive) AND the screen rows are exactly the answer's items.
 * - 21564 / 21565 / 21570: the suite makes its own definitions on two actions / modules so the
 *   filter has something to include and something to exclude.
 * - 21571 "exactly Name, Module, Action and Active": the DATA columns are compared exactly; the
 *   row-actions column (header "Actions", no data) is not counted as a list column
 *   (COUNT_ACTIONS_COLUMN - set true to make it a finding).
 * - 21572: "treated as plain text" = GetDefinitions answers 200, no error toast, and every row
 *   returned contains the literal text (normally none).
 * - 21573 "exactly 11 app notifications exist" is reproduced inside a search: 11 suite definitions
 *   share one stamp and the search for it must page as 10 + 1 (other people's definitions exist).
 * - Active cells read "✓" / "✗" on this screen (probe 12-tab-definitions) - Yes / No in the filter.
 */

export const STORY = { id: '20999', title: 'Search and Filter App Notifications' } as const;

export const CASES = {
  partialName: { azureId: '21562' },
  noMatch: { azureId: '21563' },
  byAction: { azureId: '21564' },
  byModule: { azureId: '21565' },
  inactiveOnly: { azureId: '21566' },
  activeOnly: { azureId: '21567' },
  chipShown: { azureId: '21568' },
  chipRemoved: { azureId: '21569' },
  combined: { azureId: '21570' },
  columns: { azureId: '21571' },
  specialCharacters: { azureId: '21572' },
  tenPerPage: { azureId: '21573' },
  exploratory: { azureId: '21574' },
} as const;

/** 21562: the TC's name and its search part. */
export const EXPIRY_NAME_LABEL = 'Policy Expiry Reminder';
export const SEARCH_PART = 'Expiry';

export const NO_MATCH_TEXT = 'zzznomatch';
export const SPECIAL_TEXT = "%' OR 1=1 --";
export const EMPTY_TEXT = 'No records to display.';

/** Filter drawer keys (`nc-definitions-advanced-search-field-<key>-input`) and chip keys. */
export const FILTER_KEY = { name: 'name', module: 'modulenameid', action: 'moduleactionid', active: 'isactive' } as const;
export const YES = 'Yes';
export const NO = 'No';

/** Labels as the screen lists them. */
export const MODULE_LABEL = {
  payer: 'Payer Management',
  network: 'Network Management',
  plan: 'Plan Management',
} as const;
export const ACTION_LABEL = {
  networkInactive: 'Inactive - Network',
  planInactive: 'Inactive - Plan',
  payerInactive: 'Inactive - Payer',
} as const;

/** "Module: Plan Management" - the chip text of an applied filter. */
export const CHIP_TEXT = (label: string, value: string): string => `${label}: ${value}`;
export const CHIP_LABEL = { module: 'Module', action: 'Action', active: 'Active' } as const;

/** The list's data columns, in order (21571). */
export const COLUMN_HEADERS = ['Name', 'Module', 'Action', 'Active'] as const;
/** Whether the row-actions column ("Actions") counts as a list column in 21571. */
export const COUNT_ACTIONS_COLUMN = false;
export const ACTIONS_COLUMN_KEY = 'actions';

export const ROWS_PER_PAGE = 10;
/** 21573 / 21574: how many suite definitions share the stamp. */
export const PAGE_TEST_COUNT = 11;
/** 21574: of the 12 records, the Network ones (first `EXPLORE_ACTIVE_NETWORK` active) and one Plan one (active). */
export const EXPLORE_NETWORK_COUNT = 11;
export const EXPLORE_ACTIVE_NETWORK = 6;

export const ACTIVE_MARK = '✓';
export const INACTIVE_MARK = '✗';
