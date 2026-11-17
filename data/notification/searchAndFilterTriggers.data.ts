/**
 * US 20985 "Search and Filter Triggers" (notification folder 08, 9 cases) - Writer A.
 *
 * How it works in this build (foundation probe b01-b05, 2026-11-11): the search
 * box is server side (Enter, body `searchText`, shown as a `search` chip); the
 * filter drawer "Trigger Configuration" has Name (text), Module, Action,
 * Recipient, Predefined [Yes, No] and Active [Yes, No]; applied filters show as
 * chips "Predefined: Yes", "Active: Yes"; the toolbar's "Clear" button
 * (`nc-triggers-search-clear-button`) is Clear All. Empty list: "No records to
 * display.".
 *
 * SAFETY: triggers are only read, plus the suite's own triggers made for the
 * case on free actions (TC example names "Order Confirmation Email", "Order
 * Cancellation SMS", "Payment Failure Alert" = examples, lead decision 2,
 * carried in the suite names and shortened to the 50-character limit - the word
 * "Order" always survives).
 *
 * Literal readings / decisions:
 * - 21395 "search executes as text is entered" - the box searches on Enter in
 *   this build; the case is about the RESULT, so the search is typed + Enter.
 * - 21396 "no results found message" - the live empty-state text "No records to
 *   display." (the TC quotes no wording).
 * - 21399 the Name chip: the TC expects a chip showing the value; asserted as a
 *   chip CONTAINING the filtered name (the label in front, e.g. "Name:", is free).
 * - 21403 "lock badge" = the row's Predefined badge; count = GetTriggers isPredefined.
 * - 21404 / 21408 TC value "Active" = the live option "Yes"; the chip text is the
 *   live "Active: Yes" (the TC's "Active" chip).
 * - 21407 "full, unfiltered list" = GetTriggers totalRows with no criteria, and no
 *   chip left.
 * - 21409 "user without Administrator role (Viewer)" = the second user holding ONLY
 *   a suite role with a viewer's rights and NO TriggersConfiguration.GetTriggers
 *   (VIEWER_RIGHTS). Baseline first: careconnect has the search box and the filter
 *   button. "Disabled, hidden or denied" = no usable search box and no filter
 *   button, OR GetTriggers refused (401/403).
 */
export const CASES = {
  searchPart: { azureId: 21395, term: 'Order', labels: ['Order Confirmation Email', 'Order Cancellation SMS', 'Payment Failure Alert'] },
  searchNoMatch: { azureId: 21396, term: 'Zyxqq' },
  searchLong: { azureId: 21398, length: 255 },
  filterName: { azureId: 21399, label: 'Payment Failure Alert' },
  filterPredefined: { azureId: 21403 },
  filterActive: { azureId: 21404 },
  clearAll: { azureId: 21407 },
  searchAndFilter: { azureId: 21408, term: 'Order', activeLabel: 'Order Confirmation Email', inactiveLabel: 'Order Cancellation SMS' },
  noPermission: { azureId: 21409 },
} as const;

export const FILTER_FIELDS = ['name', 'moduleid', 'actionid', 'recipientid', 'ispredefined', 'isactive'];
export const YES = 'Yes';

export const CHIP = {
  predefinedYes: 'Predefined: Yes',
  activeYes: 'Active: Yes',
} as const;

export const EMPTY_TEXT = 'No records to display.';
export const ACTIVE_MARK = '✓';

/** A 255-character alphanumeric search text (TC data). */
export const LONG_TEXT = 'Abc123'.repeat(43).slice(0, 255);

/** A viewer: no TriggersConfiguration.GetTriggers (GetTrigger only), plus what the Notification Center page reads. */
export const VIEWER_RIGHTS = [
  'TriggersConfiguration',
  'TriggersConfiguration.GetTrigger',
  'NotificationDefinition.GetDefinitions',
  'NotificationDefinition.GetDefinition',
  'SystemSettings',
  'SystemSettings.GetSystemSettings',
] as const;

export const DENIED_STATUSES = [401, 403];

/** GetTriggers body keys that are not criteria (paging + sort). */
export const LIST_KEYS = ['pageNumber', 'rowsPerPage', 'sortBy'];
