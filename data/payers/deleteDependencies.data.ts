/**
 * Test data for "Validate a Payer Deletion Against Its Dependencies".
 *
 * The messages and the delete prompt itself already live in
 * `deletePayer.data.ts`, which the delete story built; this file adds only what
 * that story did not need - the per-dependency-type expectations and the
 * pending-deletion state - and re-uses the rest.
 *
 * THE REFUSAL IS ONE LUMPED SENTENCE. Verified on a payer holding a single
 * linked network:
 *
 *   "Payer cannot be deleted because it is linked to existing networks,
 *    facilities, or authorization rules."
 *
 * Two things follow, and they shape most of this story:
 *
 *   IT NAMES ALL THREE TYPES REGARDLESS. A payer blocked by one network gets
 *   the same sentence as a payer blocked by all three, so the message cannot
 *   tell a reviewer which dependency to go and clear. The sheet asks for the
 *   specific blocker to be identified; it never is.
 *
 *   PLANS ARE NOT IN THE SENTENCE AT ALL. The sheet's first blocking case is a
 *   payer linked to Plans, and the application's own refusal does not mention
 *   plans - so either plans do not block a deletion, or they do and the message
 *   is wrong about what it checked.
 */

/** The dependency types the sheet expects to be named individually. */
export const DEPENDENCY_TYPES = ['Plans', 'Networks', 'Facilities', 'Authorization Rules'] as const;

export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/**
 * Which types the application's refusal actually mentions.
 *
 * Read off the live message. Plans is absent, which is the finding TC-014
 * reports; the other three appear in every refusal whether they apply or not.
 */
export const TYPES_NAMED_IN_MESSAGE: readonly DependencyType[] = [
  'Networks',
  'Facilities',
  'Authorization Rules',
];

/**
 * The state a payer reaches when its deletion IS accepted.
 *
 * A live payer's deletion is maker-checker, so "deleted" means "a Delete change
 * is staged and awaiting approval" - the record stays in the module, its
 * approval cell moves to a draft, and the queue gains a Delete request.
 */
export const PENDING_DELETION = {
  approvalCell: 'Draft',
  submittedCell: 'Pending Approval',
} as const;

/**
 * How a dependency-holding payer is found.
 *
 * The payer list exposes a Networks count column, so a network-blocked payer
 * can be discovered rather than named. Facilities and authorization rules have
 * no such column and no module view keyed by payer, so a payer holding one
 * cannot be identified from the interface at all - which is why those cases
 * report BLOCKED rather than guessing at a record.
 */
export const DISCOVERY = {
  networksColumn: 'linkednetworkscount',
  undiscoverable: ['Facilities', 'Authorization Rules'] as const,
  undiscoverableReason:
    'The payer module exposes no Facilities or Authorization Rules count, and neither module '
    + 'lists its records by payer, so a payer holding one cannot be identified. The refusal '
    + 'message names all three types in every case, so even a blocked deletion could not be '
    + 'attributed to a specific type. Seed a payer with a known facility or authorization-rule '
    + 'link, then re-run these cases.',
} as const;

/**
 * Why the plan-dependency case is not run against a live record.
 *
 * The only payers holding an active plan in this environment are NUPCO and Al
 * Dawaa - real records, not this suite's. Confirming a deletion on one stages a
 * Delete change that a person would then have to withdraw by hand, and the
 * refusal message would not name plans anyway. TC-002 reports that rather than
 * mutating a shared payer to learn it.
 */
export const PLAN_DEPENDENCY_BLOCKER = {
  reason:
    'The case needs a payer holding an active PLAN whose deletion can safely be attempted. The '
    + 'only such payers here are NUPCO and Al Dawaa, both real records: confirming a deletion '
    + 'on either stages a Delete change that would need manual withdrawal. What the case would '
    + 'assert - that the refusal names Plans - is already reported by TC-014, which shows the '
    + 'message never mentions plans at all. Create a disposable payer with a linked plan to run '
    + 'this case for real.',
} as const;

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role without delete rights',
  reason:
    'The case exists to prove the Delete action is withheld from a user who may view a payer '
    + 'but not remove it. The shared administrator session holds every permission, so running '
    + 'it as the administrator would assert nothing.',
} as const;
