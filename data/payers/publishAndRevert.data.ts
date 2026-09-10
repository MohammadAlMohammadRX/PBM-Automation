/**
 * Test data for "Guard Publishing and Reverting a Payer Version".
 *
 * WHAT THIS APPLICATION OFFERS, and it is narrower than the sheet assumes.
 *
 *   PUBLISHING IS NOT A SEPARATE ACTION. A version becomes live by being
 *   APPROVED in the approvals queue - there is no "Publish" control anywhere in
 *   the payer module, and the version-history row's only action is View. So the
 *   sheet's "attempt to publish a Draft / a Rejected / an already-Published
 *   version" cannot be attempted through the interface at all: the only route
 *   to live is approval, and the queue only ever holds versions that are
 *   pending. That is a stronger guarantee than the checks the sheet asks for -
 *   the invalid transitions have no entry point - and each case asserts the
 *   absence rather than pretending to have tried.
 *
 *   REVERTING IS NOT OFFERED EITHER. The version rows carry View and nothing
 *   else, so "select v2 and choose Revert" has no control to use. Where the
 *   sheet expects a revert to succeed, the case fails and names what the row
 *   offered; where it expects one to be refused, the refusal holds by absence.
 *
 * These are read at runtime rather than hard-coded: `getEntryActions` reports
 * what each row offers, so the day a Publish or Revert action appears these
 * cases start exercising it instead of reporting it missing.
 */

/** The actions the sheet expects a version row to offer. */
export const EXPECTED_ROW_ACTIONS = {
  publish: 'publish',
  revert: 'revert',
} as const;

/** The action the rows actually carry. */
export const OBSERVED_ROW_ACTION = 'view';

/** Version statuses, as the history and the approval cell render them. */
export const VERSION_STATUS = {
  draft: 'Draft',
  pending: 'Pending Approval',
  published: 'Published',
  rejected: 'Rejected',
  superseded: 'Superseded',
} as const;

/**
 * The only route from pending to live, and the one the positive cases drive.
 *
 * Approval. Everything else the sheet describes as "publishing" is this
 * operation seen from the reviewer's side.
 */
export const PUBLISH_ROUTE = 'approval' as const;

/** The field an edit moves to create each new version. */
export const EDITED_FIELD = {
  label: 'License Number',
  first: 'LIC-PUBLISH-1',
  second: 'LIC-PUBLISH-2',
} as const;

/** A version identifier that belongs to no payer, for the lookup cases. */
export const UNKNOWN_VERSION_LABEL = 'v999';

/**
 * The version states an approval-only lifecycle legitimately produces.
 *
 * VERIFIED, and it corrects an assumption these cases were first written on:
 * approving a second version leaves the first listed as "Superseded", not
 * removed. A history reading "Published, Superseded" is a payer that has been
 * approved twice, which is precisely what the multi-version cases build - so an
 * assertion that every entry must read "Published" fails on a correct record.
 *
 * "Draft" is deliberately NOT here: a draft version is listed too (the history
 * shows a payer's own in-flight version), but no case in this story should ever
 * create one and then find it published, so the cases that assert against this
 * set are asserting that nothing went live that should not have.
 */
export const APPROVED_LIFECYCLE_STATUSES = [
  VERSION_STATUS.published,
  VERSION_STATUS.superseded,
] as const;

/** Statuses from which a publish must NOT be possible. */
export const UNPUBLISHABLE_STATUSES = [
  VERSION_STATUS.draft,
  VERSION_STATUS.rejected,
  VERSION_STATUS.published,
] as const;

/** The account the self-approval case needs. */
export const REVIEWER_ROLE_REQUIREMENT = {
  role: 'a separate reviewer/approver account',
  reason:
    'The case exists to prove a submitter cannot approve their own version. This environment '
    + 'exposes one set of credentials, and the administrator both submits and approves - which '
    + 'is itself the finding the case reports, but proving the reviewer half needs a second '
    + 'account.',
} as const;
