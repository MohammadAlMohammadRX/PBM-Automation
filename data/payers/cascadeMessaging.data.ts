/**
 * Test data for "Explain Inactivation and Reactivation Effects Before They Are
 * Applied" - the confirmation messaging around a payer's status change and the
 * cascade it carries.
 *
 * EVERY STRING HERE WAS READ OFF THE LIVE APPLICATION, in the drawer and the
 * dialog it describes, because this story is about wording rather than
 * behaviour.
 *
 * THE INACTIVATION DRAWER (`payer-inactivate-dialog`) says:
 *
 *   "Inactivating this payer will also inactivate its active plans and
 *    policies. They are restored if the payer is reactivated. The change is
 *    saved as a draft - send it for approval when you are ready, and it takes
 *    effect once a reviewer approves it."
 *
 * which covers all three things the sheet asks the dialog to state: the
 * cascade, the restoration, and the draft-pending-approval caveat. It also
 * shows a live impact preview - "0 active plan(s), 0 active policy(ies), 0
 * member(s)" - which the sheet does not ask for at all.
 *
 * THE REACTIVATION DIALOG (the shared `#pbm-dialog`) says:
 *
 *   "Do you want to reactivate this payer? Its cascaded plans and policies will
 *    be restored. The change is saved as a draft - send it for approval when
 *    you are ready, and it takes effect once a reviewer approves it."
 *
 * TWO STRUCTURAL FACTS THE SHEET GETS WRONG, both verified:
 *
 *   THE ACTIONS ARE NOT ON THE DETAIL SCREEN. The sheet has the user open a
 *   payer and click Inactivate there; the detail screen carries no lifecycle
 *   action at all - only tabs. Both actions are row actions in the payer list.
 *   That is a route difference, not a capability gap, so the cases act from the
 *   row and say so once here rather than failing fifteen times over.
 *
 *   THERE IS NO SEPARATE REACTIVATE ACTION. Activate serves that role and its
 *   own dialog calls it reactivation.
 */

/** The inactivation drawer's warning, exactly as rendered. */
export const INACTIVATION_WARNING = {
  cascade: 'Inactivating this payer will also inactivate its active plans and policies.',
  restoration: 'They are restored if the payer is reactivated.',
  draftCaveat: 'The change is saved as a draft',
  approvalCaveat: 'it takes effect once a reviewer approves it',
} as const;

/** The reactivation dialog's message, exactly as rendered. */
export const REACTIVATION_MESSAGE = {
  question: 'Do you want to reactivate this payer?',
  restoration: 'Its cascaded plans and policies will be restored.',
  draftCaveat: 'The change is saved as a draft',
  approvalCaveat: 'it takes effect once a reviewer approves it',
} as const;

/** The reactivation dialog's title. */
export const REACTIVATION_TITLE = 'Activate Payer';

/**
 * The impact preview the drawer renders above the reason field.
 *
 * Matched as a shape rather than a string: the counts are whatever the payer
 * actually holds, and the point is that all three categories are named and
 * counted - which is how the zero-cascade case shows the explanation is given
 * even when there is nothing to cascade.
 */
export const IMPACT_SUMMARY_PATTERN = /(\d+)\s+active plan\(s\).*?(\d+)\s+active polic(?:y|ies)\(?i?e?s?\)?.*?(\d+)\s+member\(s\)/s;

/** The success confirmation both directions produce. */
export const SUCCESS_TOAST = {
  summary: 'Saved as draft',
  detail: 'Your changes were saved as a draft. Send the record for approval when you are ready.',
} as const;

/** The approval-status text a payer shows once its change is submitted. */
export const PENDING_APPROVAL_LABEL = 'Pending Approval';

/** The controls a confirmation must offer, by their logical action key. */
export const REQUIRED_DIALOG_ACTIONS = ['confirm', 'cancel'] as const;

/**
 * What the server does with an inactivation aimed at an already-inactive payer.
 *
 * The row withholds the action, so this can only be sent directly - the sheet's
 * own "force an inactivate request via a stale page state". Asserted on the
 * rejection being a HANDLED one that says what is wrong, rather than on an
 * exact message: the endpoint's other rejection (an unmanaged reason) reports
 * `[{ Name: "Id", Reason: "Invalid inactivation reason." }]`, so this one's
 * wording cannot be predicted from it.
 */
export const STALE_INACTIVATION = {
  /** A well-formed reason id is needed, or the reason check answers first. */
  reasonSource: 'the first option of the managed reason list',
  unacceptableStatuses: [200, 500] as const,
  leakMarkers: ['StackTrace', 'System.', '/src/'] as const,
} as const;

/** How many times the robustness case clicks a confirm control. */
export const RAPID_CLICKS = 3;

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role without status-change rights',
  reason:
    'The case exists to prove the lifecycle controls are withheld from a user who may view '
    + 'payers but not inactivate or reactivate them. The shared administrator session holds '
    + 'every permission, so running it as the administrator would assert nothing.',
} as const;
