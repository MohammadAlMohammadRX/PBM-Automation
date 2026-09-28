/**
 * Test data for "Enforce Unique Active Payer Names" (Azure US 16220).
 *
 * THE SHEET DESCRIBES A FLOW THIS APPLICATION DOES NOT HAVE, and the cases are
 * written against the one it does. Every case in the sheet says "set status to
 * Active and click Save/Activate", as though a maker chooses the status. In PBM
 * a maker chooses nothing of the kind: a payer is saved as a DRAFT, sent for
 * approval, and the lifecycle status is DERIVED at approval from the effective
 * date - the initial-status-derivation story (folder 43) asserts the creation
 * form offers no editable Status field at all.
 *
 * So "activation" here means the approval that publishes a payer and derives
 * Active, which is the only moment a payer can become Active. That is also the
 * only moment at which a uniqueness rule could be enforced, and it is exactly
 * where the PayerCode uniqueness rule already lives (folder 41). The cases
 * assert the rule at that moment.
 *
 * WHAT THIS MEANS FOR A FAILURE: a case that fails because the approval was
 * accepted is reporting that two Active payers now share a name - the defect
 * the story exists to prevent. A case that fails because the form refused
 * something earlier is reporting the rule enforced in the wrong place, which is
 * worth knowing but is not the same defect. The messages say which.
 */

/** The statuses that, per the sheet, do NOT reserve a name. */
export const NON_RESERVING_STATUSES = ['Expired', 'Inactive', 'Deleted'] as const;

/**
 * Name variants that must be treated as THE SAME name as an existing Active
 * payer, and the one that must not.
 *
 * The first two are the boundary the rule turns on: a uniqueness check that
 * compares raw strings lets "ACME " and "acme" both through, and the register
 * ends up with three Active payers that are the same payer to every human
 * reading it. The third is the control - without it, a rule that refused
 * everything would pass the first two.
 */
export interface NameVariant {
  key: string;
  /** Built from the existing Active payer's name. */
  build: (existing: string) => string;
  /** Whether the approval must be REFUSED for this variant. */
  refused: boolean;
  why: string;
}

export const NAME_VARIANTS: readonly NameVariant[] = [
  {
    key: 'trailing-space',
    build: (existing) => `${existing} `,
    refused: true,
    why: 'A trailing space is not a different payer; the value should be trimmed before comparison.',
  },
  {
    key: 'upper-case',
    build: (existing) => existing.toUpperCase(),
    refused: true,
    why: 'Names are compared case-insensitively, or "ACME" and "Acme" both go Active.',
  },
  {
    key: 'one-character-different',
    build: (existing) => `${existing}s`,
    refused: false,
    why:
      'THE CONTROL. A genuinely different name must still be allowed - without this row a rule '
      + 'that refused every registration would satisfy the two above.',
  },
];

/** How many times the duplicate-submission case clicks Save. */
export const RAPID_SUBMIT_CLICKS = 3;

/**
 * The reason the statuses this suite cannot produce are reported BLOCKED.
 *
 * Expired is unreachable for the reason the lifecycle stories already record:
 * the wizard refuses an expiry earlier than today, so a payer created here
 * never expires, and the expired payers that exist are shared records this
 * suite will not mutate.
 */
export const NEEDS_EXPIRED_PAYER =
  'This case needs a payer in the EXPIRED state holding the name under test. The wizard refuses '
  + 'an expiry date earlier than today, so a payer created here can never be expired, and the '
  + 'expired payers that do exist are shared records whose name this case would have to reuse - '
  + 'taking their state away from every other case that samples an Expired payer. Remedy: run '
  + '"npm run seed:status" and re-run once the seeded rows have lapsed, or provide one disposable '
  + 'expired payer.';

/**
 * What a refusal should say.
 *
 * Asserted as a SHAPE rather than an exact string: the wording has not been
 * seen, because the rule may not be built yet. A case that demanded an exact
 * sentence would fail on punctuation and report a defect that is not there.
 */
export const DUPLICATE_NAME_MESSAGE = {
  /** The refusal must mention the name, so the reader knows which record clashed. */
  mustMentionName: true,
  /** And must not be a bare code or a stack trace. */
  minimumLength: 10,
} as const;
