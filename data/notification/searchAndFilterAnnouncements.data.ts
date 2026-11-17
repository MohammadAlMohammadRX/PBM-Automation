/**
 * US 21011 "Search and Filter Announcements" (notification folder 23-search-
 * and-filter-announcements, 16 cases; 21714 waits for the BA).
 *
 * How it works in this build (foundation notes + probes b50-b53, live 22-25):
 * Announcements tab = list `nc-announcements-*`: search (server side, Enter,
 * `searchText`, chip `search`), filter drawer (Name, Status [Scheduled,
 * Published, Cancelled], Publish at, Audiences [Users, Roles]; chips "Status:
 * Scheduled", "Audiences: Users"), sort menu (newest, oldest, name, status,
 * publishat, modifiedon) + direction, Export -> "Selected Export" / "Export All
 * Data" (.xlsx "Announcements_<stamp>.xlsx": Name, Status, Publish At (UTC!),
 * Published On, Audiences (a count), Recipients), 10 rows a page, empty state
 * "No records to display.". Columns Name / Status / Publish at / Audiences /
 * Actions; the Audiences cell prints the audience TYPES ("Users", "Roles",
 * "Users Roles"). "Next job MM:SS" in the toolbar. Row actions: Scheduled =
 * View / Edit / Delete, Published = View / Cancel, Cancelled = View / Edit /
 * Reschedule.
 *
 * SAFETY: suite announcements only. Scheduled seeds (deleted at teardown) are
 * preferred; a Published one is made only where the case needs one (21720,
 * 21721) and for 21715 / 21716 only when the shared list holds no Published
 * announcement at all. 21722 (read only) reuses the newest Cancelled suite
 * announcement already listed (REUSE_CANCELLED). The Roles audience of 21718 is
 * an EMPTY suite role.
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - TC example values are examples: 'Holiday' (21711) becomes a unique run word
 *   carried by two suite names (a third suite name lacks it); 'zzznotfound'
 *   (21710, 21724) gets a run stamp appended so it can never match.
 * - 21712 / AC "Publish At": the live header reads "Publish at" - the header
 *   names are compared case-insensitively (HEADERS_CASE_SENSITIVE = false).
 * - "filter options for Name, Status and Published at are shown" (21709) = the
 *   filter drawer shows the name, status and publishat fields.
 * - "Navigate to the module" opens the Notification Center (its first tab);
 *   "Open the Announcements list" clicks the Announcements tab.
 * - 21715 "contains only the announcements that matched" = the file's names are
 *   exactly GetAnnouncements' names for the same criteria (all pages) and every
 *   Status is the filtered one. 21716 "every announcement in the system" = the
 *   file holds as many rows as the unfiltered GetAnnouncements total and more
 *   than the filtered one, including other statuses.
 * - 21718 "as chips": the cell prints the type word; asserted as the cell text.
 * - 21719: the countdown is read twice a second for up to COUNTDOWN.maxSeconds;
 *   it must fall and reach 00:0x (or restart after reaching it). A Scheduled
 *   suite announcement due in a few minutes is the TC's precondition (deleted at
 *   teardown before it publishes).
 * - 21721 "without manual refresh" = no navigation / reload in between (a page
 *   marker survives) and the row's status cell turns Published by itself.
 * - 21725: combination 1 = Status Scheduled + search the run word + sort Publish
 *   at oldest first; combination 2 (after clearing every chip) = Audiences Users
 *   + search the run word + sort Name ascending. Each time the Selected Export's
 *   names (in order) and statuses equal the screen's.
 */
export const CASES = {
  statusFilterChip: { azureId: '21709' },
  noMatchSearch: { azureId: '21710' },
  searchByName: { azureId: '21711' },
  columns: { azureId: '21712' },
  removeChip: { azureId: '21713' },
  selectedExport: { azureId: '21715' },
  exportAll: { azureId: '21716' },
  exportColumns: { azureId: '21717' },
  audienceChips: { azureId: '21718' },
  nextJobCountdown: { azureId: '21719' },
  publishedActions: { azureId: '21720' },
  autoRefresh: { azureId: '21721' },
  cancelledActions: { azureId: '21722' },
  scheduledActions: { azureId: '21723' },
  emptyExport: { azureId: '21724' },
  combined: { azureId: '21725' },
} as const;

export const REUSE_CANCELLED = true;

/** Filter / status values as the screen offers them. */
export const STATUS = {
  scheduled: 'Scheduled',
  published: 'Published',
  cancelled: 'Cancelled',
} as const;

export const AUDIENCE = {
  users: 'Users',
  roles: 'Roles',
} as const;

/** Chip text for a filter (probe b51). */
export const CHIP = {
  status: (value: string): string => `Status: ${value}`,
} as const;

/** Filter drawer fields the TC names (21709). */
export const FILTER_FIELDS = ['name', 'status', 'publishat'] as const;

/** The list's column keys and the headers the AC / TC name, in order. */
export const COLUMN_KEYS = ['name', 'status', 'publishat', 'audiences', 'actions'] as const;
export const HEADERS = ['Name', 'Status', 'Publish At', 'Audiences', 'Actions'] as const;
export const HEADERS_CASE_SENSITIVE = false;

/** The export's columns the TC / AC name (21717, 21724). */
export const EXPORT_HEADERS = ['Name', 'Status', 'Publish At', 'Published On', 'Audiences'] as const;

/** Row actions per status (`-table-row-<id>-<action>`), sorted. */
export const ACTIONS = {
  published: ['cancel', 'view'],
  cancelled: ['edit', 'reschedule', 'view'],
  scheduled: ['delete', 'edit', 'view'],
} as const;

export const EMPTY_STATE = 'No records to display.';

/** The TC's no-match text; a run stamp is appended. */
export const NO_MATCH = 'zzznotfound';

/** 21711: the TC's example word (the run word replaces it). */
export const SEARCH_EXAMPLE = 'Holiday';

/** 21719: how long the countdown is watched, and the floor that counts as "reached 00:00". */
export const COUNTDOWN = {
  maxSeconds: 75,
  floorSeconds: 2,
  /** The precondition's Scheduled announcement is due this many minutes ahead (deleted before it publishes). */
  dueMinutes: 6,
} as const;

/** 21721: the Scheduled announcement is due this many minutes ahead; the list is watched this long after it. */
export const AUTO_REFRESH = {
  dueMinutes: 2,
  watchAfterSeconds: 150,
} as const;

/** 21725: the three seeds' days ahead (names get A / B / C so name order and publish order differ). */
export const COMBINED_SEEDS = [
  { label: 'C', days: 2 },
  { label: 'A', days: 4 },
  { label: 'B', days: 3 },
] as const;

/** The rights of the empty suite role used as a Roles audience (21718). */
export const ROLE_AUDIENCE_RIGHTS = ['Announcement.GetAnnouncements'] as const;

export const XLSX = /\.xlsx$/i;
