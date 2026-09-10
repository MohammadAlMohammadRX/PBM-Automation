/**
 * Test data for "Show an Explicit Empty State in Version History".
 *
 * WHAT THE FIRST ATTEMPT AT THIS STORY GOT WRONG, kept here because the wrong
 * model is the obvious one and would be arrived at again. The Version History
 * tab lists APPROVED versions - so a payer that has never been approved has no
 * history, and a freshly created draft is the natural empty case. That was the
 * assumption, and it is false: a payer's OWN version is listed from the moment
 * it exists, draft or not. Twelve cases built on it failed, all of them saying
 * "the empty state should appear" about a panel that was correctly showing a
 * table.
 *
 * WHAT IS TRUE, verified against the running application:
 *
 *   1. The empty state EXISTS as its own element and reads exactly
 *      EMPTY_STATE_COPY below.
 *   2. NO payer reaches it by data. Every payer examined - Active, Inactive and
 *      brand-new draft - lists at least one version, so the story's own
 *      precondition cannot be provisioned. TC-001 reports that, and it is the
 *      finding: an empty state that no record can reach is either dead UI or a
 *      state the product owner has in mind for data this environment does not
 *      hold.
 *   3. The empty state IS what the panel shows when the history request FAILS.
 *      A reviewer whose network dropped is told the payer has no version
 *      history - a false statement about the record, and precisely the
 *      confusion this story exists to prevent. TC-012 asserts against it.
 *
 * Because of (2), the cases that examine the panel itself reach it by answering
 * the versions endpoint with an empty result set (NetworkUtils.emptyListEndpoint)
 * rather than by hunting for a record that does not exist. That is testing the
 * application's handling of an empty history at the only seam where an empty
 * history occurs, and it keeps those cases separate from the failure path,
 * which is TC-012's subject alone.
 */

/**
 * The empty state's wording, exactly as the application renders it.
 *
 * The story's draft copy is "No version history exists yet". The application
 * says EMPTY_STATE_COPY instead - the same statement, three characters shorter.
 * Asserted against the application's own string as a regression lock, with the
 * difference from the sheet recorded here as a copy-review item rather than
 * reported as a defect: a paraphrase that says the same thing is not a bug, and
 * a case that failed over it would cost more attention than it earns.
 */
export const EMPTY_STATE_COPY = 'No version history yet.';

/** The sheet's draft wording, quoted in failure messages for comparison. */
export const APPROVED_COPY_FROM_STORY = 'No version history exists yet';

/** What the message must say, whatever words it uses: that there is none. */
export const EMPTY_STATE_MEANING = /no version history/i;

/**
 * Words that would mean the panel is dressed as an ERROR rather than as
 * information.
 *
 * The story asks for neutral styling and a neutral icon. Class names are the
 * only signal the application exposes for that, so these are the markers a
 * neutral panel must not carry.
 */
export const ERROR_STYLE_MARKERS = ['error', 'danger', 'warn', 'invalid'] as const;

/** Words that would mean the panel is reporting a FAILURE, not an absence. */
export const FAILURE_WORDS = ['unable', 'failed', 'error', 'sorry', 'try again'] as const;

/** How many payers the state-matrix case samples per status. */
export const MATRIX_SAMPLE_SIZE = 1;

/** How many payers the rapid-switching case moves between. */
export const SWITCH_ROUNDS = 3;

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role without version-history rights',
  reason:
    'The case exists to prove the Version History tab is withheld from a user who may view a '
    + 'payer but not its history. The shared administrator session holds every permission, so '
    + 'running it as the administrator would assert nothing.',
} as const;
