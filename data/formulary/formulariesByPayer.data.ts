import type { FormularyBlockedCase } from './formulary.data';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import { FORMULARY_SUITE_PAYER, SUITE_FORMULARY_PREFIX, formularyStamp } from '../../utils/FormularyProvisioning';

/**
 * US 15215 "Formulary list - Formularies by Payer" (formulary folder 18).
 *
 * WHO IS WHO. The payer-scoped user is the configured non-admin account
 * ("Payer Admin", assigned "Al Dawaa 2" and "NUPCO"), its role SHAPED per case
 * with the Formularies rights the case grants or withholds
 * (writerAHelpers.formularySession - catalogue labels unverified, see there).
 * It works under "All My Payers" unless a case names one payer. The sheet's
 * single-payer "Payer A" user is mapped onto it where the rule does not depend
 * on HOW MANY payers are assigned (only assigned payers' formularies, search,
 * direct links, permissions); the cases about a user with no payer or about
 * changing a user's assignment are BLOCKED below, as the Plans suite's are
 * (data/plans/restrictPlanVisibilityToAssignedPayers.data.ts).
 *
 * Out-of-scope formularies ("Payer B" / "Payer C" of the sheet when outside the
 * assignment) are the suite payer's ("Al sharq"); in-scope ones are built for
 * the account's payers. All are the case's own drafts (formularyIn).
 */

export const SCOPE = {
  assigned: [...NON_ADMIN_PROFILE.scopedPayers] as string[],
  payerA: NON_ADMIN_PROFILE.scopedPayers[0],
  payerB: NON_ADMIN_PROFILE.scopedPayers[1],
  outside: FORMULARY_SUITE_PAYER,
  allMine: 'All My Payers',
  allPayers: 'All Payers',
} as const;

/** A term several formularies' names share (the sheet's "similar names"): `QA Automation Formulary Shared <stamp>`. */
export const sharedTerm = (): string => `${SUITE_FORMULARY_PREFIX} Shared ${formularyStamp()}`;

/** What an out-of-scope record may be answered with - not found, or restricted. */
export const OUT_OF_SCOPE = /not found|unable to load|does not exist|no longer|restricted|not authori[sz]ed|permission|access denied|forbidden/i;
export const DENIED = /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied/i;

export const CASES = {
  onlyAssigned: { azureId: '18828' },
  otherPayerHidden: { azureId: '18829' },
  adminSeesAll: { azureId: '18830' },
  severalPayers: { azureId: '18831' },
  viewNotEdit: { azureId: '18833' },
  approveSeparate: { azureId: '18835', change: 'Changed by a payer-scoped editor.' },
  deleteSeparate: { azureId: '18836' },
  directLink: { azureId: '18838' },
  searchRestricted: { azureId: '18839', status: 'Not Live' },
  mixedPermissions: { azureId: '18840' },
} as const;

const PER_USER =
  'a disposable test USER whose payer assignment the case may set, plus a Users page object. Payers are assigned per '
  + 'user (user drawer: Role + assigned Payers) and the framework has no page object for that drawer; the only '
  + 'payer-scoped account is the shared "Payer Admin" (Al Dawaa 2, NUPCO), whose assignments must not be changed.';

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18832',
    title: 'should show an empty list with a no-formularies message to a payer-scoped user with no payer assigned',
    reason: `Needs a payer-scoped account with ZERO payers assigned. The only one configured is assigned two (Al Dawaa 2, NUPCO). Needs ${PER_USER}`,
  },
  {
    azureId: '18834',
    title: 'should stop showing a payer\'s formularies once that payer is removed from the user\'s assignment',
    reason: `Needs ${PER_USER} (starting with "Payer A", then the assignment removed by an administrator).`,
  },
  {
    azureId: '18837',
    title: 'should start showing a payer\'s formularies once that payer is added to the user\'s assignment',
    reason: `Needs ${PER_USER} (starting with "Payer A" only, then "Payer B" added by an administrator).`,
  },
];
