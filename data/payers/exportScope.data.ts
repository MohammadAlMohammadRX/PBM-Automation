/**
 * Test data for "Ask Which Rows to Export When a Filter Is Applied".
 *
 * THE PROMPT EXISTS BUT OFFERS DIFFERENT CHOICES THAN THE SHEET DESCRIBES, and
 * that is this story's headline. The export control opens a menu with exactly
 * two items, verified on the live list:
 *
 *   "Selected Export"   - the rows TICKED in the table
 *   "Export All Data"   - the whole register, ignoring the current filter
 *
 * and only after choosing one does a second dialog ask for a FORMAT (CSV or
 * Excel).
 *
 * So there is no "Export Filtered" anywhere: the scope choice is selection
 * versus everything, not filter versus everything. Three consequences, each
 * asserted by its own case rather than assumed:
 *
 *   The menu appears whether or not a filter is applied - the sheet expects an
 *   unfiltered export to start immediately with no prompt.
 *
 *   A filtered list cannot be exported as such. The nearest thing is ticking
 *   the filtered rows and choosing Selected Export, which is a different
 *   operation with a different meaning: it follows the ticks, not the filter.
 *
 *   "Export All Data" does what the sheet wants of it - it ignores the filter -
 *   and that case passes.
 */

/** The two scopes the menu offers, by their logical id suffix. */
export const OFFERED_SCOPES = ['selected', 'all'] as const;

/** The scope the sheet asks for and the application does not offer. */
export const MISSING_SCOPE = 'filtered' as const;

/** The formats the second dialog offers. */
export const OFFERED_FORMATS = ['csv', 'excel'] as const;

/** The filename the export suggests, as a pattern. */
export const EXPORT_FILENAME = /^PayerList_\d{8}_\d{6}\.csv$/;

/**
 * The filter the scope cases apply.
 *
 * Status is used rather than the sheet's "State = TX": this register has no
 * State column, and Status is the filter every other story in the suite drives,
 * so the same helper serves.
 */
export const SCOPE_FILTER = {
  status: 'Active',
  /** A filter that matches nothing, for the empty-export case. */
  noMatchSearch: 'ZZZ-Nonexistent-Payer',
} as const;

/**
 * The column an exported file must carry for the scope to be checkable.
 *
 * The assertion for "did this file respect the filter" is a status column with
 * one distinct value; without it the file's contents say nothing about scope.
 */
export const STATUS_COLUMN_CANDIDATES = ['Status', 'status', 'Payer Status'] as const;

/** How many rows a "no matches" export may contain, header aside. */
export const EMPTY_EXPORT_MAX_ROWS = 0;

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role without export rights',
  reason:
    'The case exists to prove the Export control is withheld from a user who may view the '
    + 'register but not extract it. The shared administrator session holds every permission, so '
    + 'running it as the administrator would assert nothing.',
} as const;
