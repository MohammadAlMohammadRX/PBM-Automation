/**
 * Test data for "Enforce Payer Email Uniqueness Across the Register".
 *
 * WHAT THE RULE ACTUALLY DOES, verified against the live application by seeding
 * a payer and then attempting three variations of its address. The rule itself
 * is in good shape - all three are refused:
 *
 *   exact duplicate            -> HTTP 409 "Conflict Detected"
 *   same address, DIFFERENT CASE -> HTTP 409   (so the check is case-insensitive)
 *   same address, PADDED with spaces -> HTTP 409 (so it trims before comparing)
 *
 * The `ValidationErrors` entry names the address:
 * `Email 'x@example.com' is already taken.`
 *
 * WHAT IS MISSING is the same thing this module keeps getting wrong: the
 * interface shows NOTHING. No toast, no inline error under the Email field, no
 * dialog - the drawer simply stays open, exactly as if Save had not been
 * pressed. Every one of this story's cases expects "a bilingual error message
 * naming the already-used email", and none appears.
 *
 * So each case is written as two separate steps: the save is blocked (passes),
 * and the user is told why (fails). That keeps the working rule reporting green
 * beside the missing feedback, instead of one combined assertion that would
 * report email uniqueness as broken when it is not.
 *
 * This is the FOURTH place the same shape has turned up - alongside the
 * concurrent-edit 409, the over-length name 422, and the Arabic-punctuation
 * 422. It is one underlying defect, not four.
 */

/** The conflict the API raises for a duplicate address, verified live. */
export const DUPLICATE_EMAIL_RESPONSE = {
  status: 409,
  title: 'Conflict Detected',
  /** How the reason names the address - `%s` is the address itself. */
  reasonTemplate: "Email '%s' is already taken.",
} as const;

/** The status a genuinely unique address returns. */
export const UNIQUE_EMAIL_STATUS = 200;

/** Builds the exact reason string the server returns for an address. */
export function duplicateReasonFor(email: string): string {
  return DUPLICATE_EMAIL_RESPONSE.reasonTemplate.replace('%s', email);
}

/**
 * The variations of an existing address that must all be refused.
 *
 * `transform` is applied to the seeded payer's own address, so no case depends
 * on a hard-coded mailbox that may or may not exist in the environment - the
 * duplicate is always created from a record the test made itself.
 */
export interface DuplicateVariant {
  caseId: string;
  label: string;
  transform: (email: string) => string;
  /**
   * Whether the variation is normalised away before the comparison happens.
   *
   * Both are, but at DIFFERENT layers, and the difference is visible:
   *
   *   whitespace is stripped by the FIELD, on input. Typing "  x@y  " leaves
   *   "x@y" in the box, so the padding never reaches the server at all - which
   *   also means the sheet's "the field displays the entered text" is not what
   *   happens.
   *
   *   letter case survives to the server, which compares case-insensitively and
   *   then echoes back what was SUBMITTED:
   *   `Email 'X@EXAMPLE.COM' is already taken.` - not the stored lower-case
   *   form. So a message assertion has to look for the submitted value.
   *
   * `submittedFormOf` below applies both rules, so callers never have to
   * reason about which layer did what.
   */
  normalised: boolean;
}

/**
 * The address as the SERVER receives it, after the field has had its way.
 *
 * The field trims; nothing else is altered client-side. This is the value the
 * duplicate-reason message will name, and the value the Email box will show.
 */
export function submittedFormOf(email: string, variant: DuplicateVariant): string {
  return variant.transform(email).trim();
}

export const DUPLICATE_VARIANTS: readonly DuplicateVariant[] = [
  {
    caseId: 'TC-002',
    label: 'the identical email address',
    transform: (email) => email,
    normalised: false,
  },
  {
    caseId: 'TC-003',
    label: 'the same address in a different letter case',
    transform: (email) => email.toUpperCase(),
    normalised: true,
  },
  {
    caseId: 'TC-007',
    label: 'the same address wrapped in leading and trailing spaces',
    transform: (email) => `  ${email}  `,
    normalised: true,
  },
];

/**
 * What the interface would have to show to satisfy the story.
 *
 * A pattern rather than an exact string: the criterion is that the user is told
 * the address is already taken AND that the message names the address, not that
 * the application uses a particular sentence. UNVERIFIED, and unverifiable -
 * the application emits no such message in either language - so this states
 * what the criterion requires rather than what was observed. The specs assert
 * in two moves, "a message appears at all" then "it names the address", so the
 * reported defect does not depend on guessing the eventual wording.
 */
export const DUPLICATE_MESSAGE_PATTERNS = {
  en: /(already|taken|in use|exists|duplicate)/i,
  ar: /(مستخدم|مسجل|مكرر)/,
} as const;

/**
 * The account the restricted-role case needs.
 *
 * Named so the BLOCKED annotation tells whoever reads the report exactly what
 * to provision, rather than a vague "insufficient permissions".
 */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'Read-only payer viewer',
  reason:
    'Needs an account that can open the payer list but holds neither create nor edit rights, '
    + 'to show the Add and Edit controls are withheld and a direct email change is refused.',
} as const;

/**
 * Why the combined-violation case cannot be performed.
 *
 * The sheet asks for a single pending change that BOTH re-points an email at
 * another payer's address AND stages a deletion, then for both violations to be
 * reported together. The application stages those as two separate actions -
 * an edit is saved through the wizard, a deletion through the row action - and
 * offers no way to submit them as one change, so there is no combined approval
 * to observe. Recorded here so the BLOCKED reason is precise.
 */
export const COMBINED_VIOLATION_BLOCKER = {
  reason:
    'The application stages an edit and a deletion as two independent changes - the wizard '
    + 'saves one, the row action the other - with no path to submit both as a single pending '
    + 'change. So a combined approval carrying an email conflict and a deletion dependency '
    + 'cannot be constructed, and the rule the case describes was never exercised.',
} as const;
