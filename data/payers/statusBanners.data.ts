import { PAYER_DETAIL_BANNER } from '../../constants/ElementIds';

/**
 * Test data for "Help Icon (What-To-Do-Next) Banners on Payer Details (View)".
 *
 * VERIFIED live: a draft payer's detail screen carries #payer-detail-draft-hint
 * reading "This payer is a draft. It is not live yet - keep editing it, then
 * send it for approval." A pending payer carries #payer-detail-pending-hint. The
 * rejected banner follows the same {state}-hint convention.
 *
 * The banner content is matched by INTENT KEYWORDS rather than exact copy: the
 * point of each banner is what it tells the user to do next, and pinning the
 * exact sentence would fail on a harmless wording change while missing a banner
 * that said the wrong thing. Each state's keywords are the words that banner
 * must contain to be doing its job.
 *
 * THE REJECTED BANNER'S REASON is the one to watch: the require-a-reason story
 * found the reviewer's reason is recorded where the maker cannot see it, so a
 * rejected banner that omits the reason is the same finding surfacing here.
 */

/** Which banner id belongs to which lifecycle state. */
export const BANNER_BY_STATE = {
  draft: PAYER_DETAIL_BANNER.draft,
  pending: PAYER_DETAIL_BANNER.pending,
  rejected: PAYER_DETAIL_BANNER.rejected,
} as const;

/** The words each banner must contain to be giving the right next step. */
export const BANNER_KEYWORDS = {
  draft: [/draft/i, /(send|submit).*(approval)|approval/i],
  pending: [/(await|pending|review|approval)/i],
  rejected: [/(reject|edit|resubmit|again)/i],
} as const;

/** The states that MUST show a banner, and the one that must not. */
export const BANNER_STATES = ['draft', 'pending', 'rejected'] as const;
export const NO_BANNER_STATE = 'approved/active';

/** The account the view-permission case needs. */
export const BANNER_ROLE_REQUIREMENT = {
  role: 'a user without View Payer Details permission',
  reason:
    'The case proves a user who cannot view the detail page cannot see its banner. The shared '
    + 'administrator can open every payer, so it cannot show the withheld half.',
} as const;
