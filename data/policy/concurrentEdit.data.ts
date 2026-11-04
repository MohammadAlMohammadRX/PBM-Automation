import type { PolicyBlockedCase } from '../../utils/policy/writerCHelpers';

/**
 * US 15186 "Alert user to concurrent policy edit conflict" (policy folder 15),
 * AUTOMATED with two browser sessions (user decision 2026-11-03).
 *
 * "User A" is the test's own administrator window; "User B" is a second,
 * separate browser CONTEXT signed in as the administrator (`policySecondSession`,
 * own storage) and "User C" (19627) a second TAB of the first session
 * (`policySecondWindow`) - each loads the policy on its own, which is what the
 * concurrency stamp is about. Only a v0 policy (Draft) offers Edit; the field
 * changed is the Grace Period (step 2 - the names are read-only in Edit).
 *
 * Live 2026-11-03: a stale save answers 409 "This policy has been modified since
 * it was loaded. Reload it and try again." and the window shows the toast "The
 * policy was not saved" with that sentence; the drawer stays open and NO reload
 * prompt / Reload control appears - the "prompt to reload" / "Select Reload"
 * steps (19619, 19621, 19625, 19624) assert one.
 *
 * Literal readings:
 * - 19620 "after reloading the policy post-conflict": the user reloads the
 *   screen and reopens Edit (the case's precondition), then re-applies.
 * - 19623 "in immediate succession": both Save clicks are fired together.
 */
export const CASES = {
  warned: { azureId: '19618', userB: '20', userA: '10' },
  reloadPrompt: { azureId: '19619', userB: '21', userA: '11' },
  saveAfterReload: { azureId: '19620', userB: '22', userA: '12' },
  noOverwrite: { azureId: '19621', userB: '23', userA: '13' },
  singleEditor: { azureId: '19622', value: '14' },
  sameSecond: { azureId: '19623', userA: '15', userB: '25' },
  reloadDiscardsLocal: { azureId: '19625', userB: '26', userA: '16' },
  clearMessage: { azureId: '19626', userB: '27', userA: '17' },
  threeEditors: { azureId: '19627', userA: '18', userB: '28', userC: '38' },
} as const;

/** The server's conflict sentence (409). */
export const CONFLICT_SENTENCE = 'This policy has been modified since it was loaded. Reload it and try again.';
/** The toast title shown with it. */
export const NOT_SAVED_TITLE = 'The policy was not saved';
/** What a clear conflict notice says: someone changed the policy since it was opened, and to reload. */
export const MODIFIED_SINCE_OPENED = /modified since it was (loaded|opened)|changed by another|another user/i;
export const ADVISES_RELOAD = /reload|refresh/i;

export const BLOCKED_CASES: PolicyBlockedCase[] = [
  {
    azureId: '19624',
    title: 'should detect the conflict the same way whichever two administrator accounts are involved',
    reason:
      'Needs THREE distinct policy-administrator accounts with full edit rights, paired (Admin1, Admin2) and (Admin1, Admin3). '
      + 'The suite has two accounts: the administrator and the Payer Admin, and the Payer Admin does not see the suite payer\'s '
      + 'policies. Two windows of the same account cannot stand in for different accounts in a case about account pairs. '
      + 'Runnable once two more policy-administrator accounts are provided to the suite.',
  },
];
