/**
 * Test data for "Strengthen Guardrails and Messaging for Payer Activation,
 * Inactivation and Reactivation".
 *
 * HOW THE GUARDRAILS ARE ACTUALLY ENFORCED. Read off the live application, one
 * payer per status, by listing each row's lifecycle buttons and their enabled
 * state - because "the button is there" and "the button can be used" turned out
 * to be different answers:
 *
 *   Active    inactivate ENABLED   · activate ABSENT
 *   Inactive  activate   ENABLED   · inactivate ABSENT
 *   Expired   activate   DISABLED  · inactivate ABSENT
 *
 * So the application refuses an invalid transition in one of two ways: it omits
 * the action, or it renders it disabled. Neither produces the pop-up message
 * the sheet describes, and for the two "already in that state" cases nothing
 * carries a message at all - there is no control left to attach one to.
 *
 * THE EXPIRED CASE DOES CARRY A MESSAGE, and it is exactly the message the
 * story asks for. The disabled Activate button holds it in its `title`:
 *
 *   EN  "Cannot reactivate: the payer has expired. Update its expiry date to
 *        reactivate it."
 *   AR  "لا يمكن إعادة التفعيل: انتهت صلاحية جهة التغطية. حدّث تاريخ انتهائها
 *        لإعادة تفعيلها."
 *
 * Both were read from the live UI in their own language, so the bilingual
 * requirement is genuinely met for the expiry guardrail.
 *
 * THERE IS NO SEPARATE "REACTIVATE" CONTROL. The Activate action serves that
 * role, and its confirmation dialog says so in as many words ("Do you want to
 * reactivate this payer?"). The reactivation cases therefore drive the same
 * control as the activation ones; they are kept as separate cases because the
 * sheet asks for both, and a future build that splits them apart would then
 * fail here rather than silently drop a case.
 *
 * INACTIVATION IS MAKER-CHECKER. Confirming the drawer stages a DRAFT - the
 * row keeps its current status and reads "v1 · Draft" - and the status only
 * moves once the change is sent for approval and approved. Verified end to end:
 * Active -> inactivate -> submit -> approve -> Inactive / "v2 · Published". The
 * sheet expects the status to change on Confirm, so any case that must observe
 * the new status carries the approval round trip and says why.
 */

/** The managed reason list, in the order the dropdown offers it. */
export const INACTIVATION_REASONS = [
  'Contract Ended',
  'Regulatory Action',
  'Payer Request',
  'Compliance Issue',
  'Other',
] as const;

/** The same list as the Arabic UI renders it, in the same order. */
export const INACTIVATION_REASONS_AR = [
  'انتهاء العقد',
  'إجراء تنظيمي',
  'طلب جهة التغطية',
  'مشكلة امتثال',
  'أخرى',
] as const;

export type InactivationReason = (typeof INACTIVATION_REASONS)[number];

/** The details field's cap, as the application declares it (`maxlength`). */
export const DETAILS_MAX_LENGTH = 500;

/** One character past the cap - the over-length case. */
export const DETAILS_OVER_LENGTH = DETAILS_MAX_LENGTH + 1;

/**
 * The expiry guardrail message, in both languages, exactly as rendered.
 *
 * Held here rather than asserted as a substring because this story is about the
 * MESSAGING as much as the guardrail: a truncated or half-translated string
 * would satisfy a "contains" check and fail the requirement.
 */
export const EXPIRY_GUARDRAIL_MESSAGE = {
  en: 'Cannot reactivate: the payer has expired. Update its expiry date to reactivate it.',
  ar: 'لا يمكن إعادة التفعيل: انتهت صلاحية جهة التغطية. حدّث تاريخ انتهائها لإعادة تفعيلها.',
} as const;

/**
 * Lifecycle status text is NOT redefined here.
 *
 * `LIFECYCLE_STATUS` in statusTransition.data.ts already carries every status in
 * both languages, and it is the same badge these cases read. Duplicating it
 * would create two places for one fact - and the Arabic strings are exactly
 * where a silent drift would go unnoticed.
 */

/** The activation confirmation dialog, as the live app words it. */
export const ACTIVATION_DIALOG = {
  title: 'Activate Payer',
  /** The sentence that shows Activate and Reactivate are one and the same. */
  reactivationPhrase: 'Do you want to reactivate this payer?',
  /** The maker-checker caveat the same dialog carries. */
  approvalPhrase: 'send it for approval when you are ready',
} as const;

/** The drawer's own staged-change toast, which is the "success confirmation". */
export const STAGED_TOAST = {
  summary: 'Saved as draft',
  detail: 'Your changes were saved as a draft. Send the record for approval when you are ready.',
} as const;

/**
 * An invalid transition the sheet expects to be refused with a message.
 *
 * `refusedBy` records HOW the application refuses it, which is the part a
 * presence-only check gets wrong; `carriesMessage` says whether that refusal
 * comes with the bilingual explanation the story requires.
 */
export interface InvalidTransition {
  caseId: string;
  /** The status the payer must display for this case to mean anything. */
  status: 'Active' | 'Inactive' | 'Expired';
  action: 'activate' | 'inactivate';
  refusedBy: 'absent' | 'disabled';
  carriesMessage: boolean;
  /** Set where the application's behaviour departs from the sheet. */
  divergence?: string;
}

export const INVALID_TRANSITIONS: readonly InvalidTransition[] = [
  {
    caseId: 'TC-002',
    status: 'Inactive',
    action: 'inactivate',
    refusedBy: 'absent',
    carriesMessage: false,
    divergence:
      'The sheet expects a bilingual message stating that only an active payer can be '
      + 'inactivated. The row omits the Inactivate action entirely, so the transition is '
      + 'impossible but unexplained - there is no control left to carry a message.',
  },
  {
    caseId: 'TC-004',
    status: 'Active',
    action: 'activate',
    refusedBy: 'absent',
    carriesMessage: false,
    divergence:
      'The sheet expects a bilingual message stating that only an inactive payer can be '
      + 'activated. The row omits the Activate action entirely.',
  },
  {
    caseId: 'TC-005',
    status: 'Expired',
    action: 'activate',
    refusedBy: 'disabled',
    carriesMessage: true,
  },
  {
    caseId: 'TC-006',
    status: 'Expired',
    action: 'inactivate',
    refusedBy: 'absent',
    carriesMessage: false,
    divergence:
      'The sheet expects a message telling the user to extend the expiry date before an '
      + 'expired payer can be deactivated. The row omits Inactivate on an expired payer, so '
      + 'the refusal is silent. The expiry guidance exists only on the disabled Activate '
      + 'action.',
  },
  {
    caseId: 'TC-007',
    status: 'Expired',
    // Reactivation is the same control as activation - see the file comment.
    action: 'activate',
    refusedBy: 'disabled',
    carriesMessage: true,
  },
];

/** Builds a details string of an exact character length. */
export function detailsOfLength(length: number): string {
  const stem = 'Inactivated by an automated regression test. ';
  return stem.repeat(Math.ceil(length / stem.length)).slice(0, length);
}

/** How many times the double-submission case clicks Confirm. */
export const RAPID_CONFIRM_CLICKS = 3;

/**
 * How many `InactivatePayer` calls a single confirmed inactivation should make.
 *
 * The sheet's words are "only a single inactivation request is processed".
 * VERIFIED: three rapid clicks put TWO requests on the wire - the button is not
 * disabled on the first click - although the end state stayed correct (one
 * queued approval request, one draft version). The case asserts both halves
 * separately so the missing click guard is reported without pretending the
 * record was corrupted.
 */
export const EXPECTED_INACTIVATION_REQUESTS = 1;

/**
 * What the server does with a reason that is not on the managed list.
 *
 * The UI restricts the reason to a dropdown, so this can only be reached by
 * sending the request directly - which the sheet explicitly allows ("via API
 * call or manipulated request if UI restricts to dropdown"). Both variants were
 * sent against a payer created by this suite:
 *
 *   a well-formed GUID that is not a managed reason -> 409, with
 *   `ValidationErrors: [{ Name: "Id", Reason: "Invalid inactivation reason." }]`
 *
 *   a value that is not a GUID at all -> 500 "Operation Failed", carrying a
 *   raw .NET ArgumentNullException and a source-file stack trace in the
 *   response body.
 *
 * The first is the rejection the story wants, minus the Arabic; the second is a
 * defect in its own right, and the leaked stack trace is worse than the missing
 * translation.
 */
export const UNMANAGED_REASON = {
  /** Well-formed, but not a reason the lookup knows. */
  unknownId: '00000000-0000-0000-0000-000000000999',
  /** Not a GUID at all. */
  malformedId: 'Not A Managed Reason',
  expectedRejection: { status: 409, reason: 'Invalid inactivation reason.' },
  malformedRejection: { status: 500 },
  /** Substrings that must NOT appear in an error the client is shown. */
  leakMarkers: ['StackTrace', 'System.', '/src/'] as const,
} as const;

/** localStorage key holding the bearer token the API calls need. */
export const ACCESS_TOKEN_KEY = 'pbm.access_token';

/**
 * The account the restricted-role case needs.
 *
 * Named so the BLOCKED annotation says what to provision rather than just that
 * something is missing.
 */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role without activation rights',
  reason:
    'The case exists to prove the lifecycle controls are withheld from a user who may view '
    + 'payers but not change their status. The shared administrator session holds every '
    + 'permission, so running it as the administrator would assert nothing.',
} as const;
