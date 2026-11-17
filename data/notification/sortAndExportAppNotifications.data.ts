import { NOTIFICATION_ACTION, NOTIFICATION_MODULE } from '../../utils/notification/notificationApi';

/**
 * US 20998 "Sort and Export App Notifications" (notification folder 14, 12 cases) - Writer A.
 *
 * How it works in this build (foundation probe b30/b31, live 13/14, 2026-11-11):
 * the App Notification tab sorts by Newest (default, `sortBy: "CreatedOn desc"`),
 * Oldest, Name, Module, Action, Active, Last Modified (+ a direction button);
 * Export offers "Selected Export" and "Export All Data", both an .xlsx
 * `NotificationDefinitions_<stamp>.xlsx` with Name, Module, Action, Audiences
 * (a count), Active.
 *
 * SAFETY: definitions are only read, plus the suite's own App Notifications
 * ("QA Automation Notification ...", made through `suiteDefinitions`, deleted at
 * teardown) on Network Management actions no live definition uses, audience
 * careconnect only. They are INACTIVE, except the one 21552 needs active.
 *
 * Literal readings / decisions:
 * - TC sort labels vs live: "Active status" = "Active", "Date created (Newest /
 *   Oldest)" = "Newest" / "Oldest" (SORT_LABELS).
 * - "Ordered" = page 1 of the column in the direction the request carries
 *   (`sortBy: "<field> asc|desc"`), case-insensitive; "grouped" (Module, Active) =
 *   every value forms one contiguous run as well.
 * - 21548 / 21553: two suite definitions created ~2 s apart stand for "created on
 *   different dates"; 21553's "oldest first" = page 1 equals GetDefinitions
 *   "CreatedOn asc" and the older suite record precedes the newer one there.
 * - 21554 / 21555: the "search" is a tag shared by two suite definitions only.
 *   AC says "triggers" for this list - read as App Notifications.
 * - 21559: either a headers-only .xlsx or an information message counts, never an
 *   error message (ERROR_WORDS) or a server error.
 * - 21561 (exploratory, scripted): filter Module = Network Management, sort by
 *   Name, then Selected Export (must equal the same GetDefinitions query, in
 *   order, and start with the rows on screen) and Export All Data (= every
 *   definition).
 * - NAME_COMPARISON (21561, rerun 2026-11-12): names in the export are compared with GetDefinitions and
 *   the screen with whitespace collapsed and trimmed (`normalise`). A colleague's live definition is
 *   stored as "Active network " (trailing space) and the export writes "Active network"; the TC asks
 *   that the content and order match, not the raw whitespace.
 */
export const CASES = {
  newestDefault: { azureId: 21548 },
  sortName: { azureId: 21549 },
  sortModule: { azureId: 21550 },
  sortAction: { azureId: 21551 },
  sortActive: { azureId: 21552 },
  sortOldest: { azureId: 21553 },
  selectedExport: { azureId: 21554 },
  exportAll: { azureId: 21555 },
  excelFormat: { azureId: 21556 },
  exportControl: { azureId: 21558 },
  emptySelectedExport: { azureId: 21559 },
  exploratory: { azureId: 21561, filter: { modulenameid: 'Network Management' }, sortKey: 'name' },
} as const;

/** The suite definitions' module / actions (Network Management; no live definition on them on 2026-11-11). */
export const SUITE_DEFINITION = {
  moduleId: NOTIFICATION_MODULE.networkManagement,
  olderAction: NOTIFICATION_ACTION.networkInactive,
  newerAction: NOTIFICATION_ACTION.networkExpired,
} as const;

export const SORT_KEY = { newest: 'newest', oldest: 'oldest', name: 'name', module: 'modulename', action: 'moduleaction', active: 'isactive' } as const;
export const SORT_LABELS = ['Newest', 'Oldest', 'Name', 'Module', 'Action', 'Active'];
export const DEFAULT_SORT = { label: 'Newest', sortBy: 'CreatedOn desc' } as const;
export const OLDEST_SORT_BY = 'CreatedOn asc';

export const EXPORT_LABELS = ['Selected Export', 'Export All Data'];
export const EXPORT_HEADERS = ['Name', 'Module', 'Action', 'Audiences', 'Active'];
export const ERROR_WORDS = /error|fail|wrong|exception/i;
export const NO_MATCH_PREFIX = 'zzznomatch';
/** Gap between the two suite definitions (distinct CreatedOn). */
export const CREATED_APART_MS = 2_000;
/** GetDefinitions body keys that are not criteria (paging + sort). */
export const LIST_KEYS = ['pageNumber', 'rowsPerPage', 'sortBy'];
