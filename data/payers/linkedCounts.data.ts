/**
 * Test data for "Display Linked Networks Count on Payer List" and "Display
 * Linked Members Count on Payer List".
 *
 * One file for both, because the two stories are the same story about two
 * columns: the count is read from the payer row, a zero is expected to read as
 * a dash rather than "0", a non-zero is expected to be clickable through to the
 * records behind it, and the number is expected to agree with those records.
 * Splitting it would duplicate every constant.
 *
 * WHAT COULD NOT BE PROVISIONED, and why the cases are written to discover
 * rather than to seed. Both sheets ask for payers with counts to order - 3
 * networks, 1 network, 0 networks, 500 networks, members overlapping across
 * policies. None of that can be created from here:
 *
 *   NETWORKS  linking one needs a network that belongs to no payer, and the
 *             network-assignment story reports there are none free in this
 *             environment - every network is owned, and a payer holding one
 *             cannot be deleted to release it.
 *   MEMBERS   enrolling and terminating members is the Member Management
 *             module, which this framework does not cover at all.
 *
 * So `linkedCounts` reads the live list and classifies what it finds, and a
 * case whose class is absent reports BLOCKED naming the counts that were
 * present. That says something true about the environment; a seeded number
 * would have said nothing about the application.
 *
 * THE COUNTS THAT EXIST TODAY. Every automation-created payer shows a dash in
 * both columns, because nothing is linked to them - so the zero-presentation
 * cases run, and the one/many cases depend on the pre-existing payers the
 * environment came with.
 */

/**
 * How a zero count is required to read.
 *
 * The sheets accept either a dash or the word "None", and explicitly reject a
 * raw "0" and a blank cell - the point being that a reader should not have to
 * decide whether an empty cell means "none" or "not loaded". Matched as a
 * pattern so either wording passes.
 */
export const ZERO_COUNT_PRESENTATION = /^(-|—|–|none|لا يوجد)$/i;

/** What a zero count must NOT read as. */
export const ZERO_COUNT_FORBIDDEN = {
  raw: '0',
  blank: '',
} as const;

/** The columns these stories read, by the key the list uses. */
export const COUNT_COLUMNS = {
  networks: 'networks',
  members: 'members',
} as const;

/**
 * The rule the clickability case checks, as a table.
 *
 * A non-zero count is a route into the records behind it; a zero count has
 * nothing to show. The sheet allows a zero count to be either inert or to open
 * an empty view - what it does not allow is an error - so the case asserts the
 * outcome rather than the mechanism.
 */
export const CLICKABILITY_RULE = [
  { label: 'a non-zero count', expectNavigates: true },
  { label: 'a zero count', expectNavigates: false },
] as const;

/** The tab a Linked Networks count should lead to. */
export const NETWORKS_DESTINATION = 'Linked Networks';

/** The account the restricted-access cases need. */
export const COUNT_ROLE_REQUIREMENT = {
  role: 'a payer role without Network or Member module access',
  reason:
    'These cases exist to prove the aggregate count stays visible to a user who may not open '
    + 'the records behind it. The shared administrator session can open everything, so running '
    + 'them as the administrator would assert nothing.',
} as const;
