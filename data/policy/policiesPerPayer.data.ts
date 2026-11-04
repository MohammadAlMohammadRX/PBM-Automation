import type { PolicyBlockedCase } from '../../constants/policy/writerAIds';
import { SUITE_POLICY_PREFIX, policyStamp } from '../../utils/PolicyProvisioning';

/**
 * US 15188 "Policy List - Policies per payer" (policy folder 17).
 *
 * WHO IS WHO (as the Formulary 18 / Plans suites map it). The payer-scoped user is the
 * configured non-admin "Payer Admin" (utils/policy/policyRole signIn({}) - its role is not
 * reshaped), assigned "Al Dawaa 2" (INACTIVE since 2026-11-02) and "NUPCO" (active). The
 * sheet's "Payer A" is NUPCO; a single-payer user is that account with NUPCO put in the
 * top-bar payer scope; "Payer A and Payer B" is the account under "All My Payers". The
 * out-of-scope "Payer B" / "Payer C" is the suite payer "Al sharq". In-scope policies are
 * the case's own drafts built for NUPCO (no network: only the draft is needed);
 * out-of-scope ones are the case's own suite drafts.
 *
 * Scope is read where the screen applies it: the list's own GetPolicies answer, its search,
 * its export. The administrator meets no payer gate ("All Payers").
 *
 * EXPORT (2026-11-04): the Payer Admin role holds no ExportPolicies right - its Export menu
 * offers only Export Template - so the export cases (19644, 19651, 19653, 19654) sign it in
 * WITH that right granted (restored at teardown) and are BLOCKED when Export All Data is still
 * not offered. 19651's "filtered status" export is Selected Export (scope "Filtered").
 *
 * 19652 ("Payer A deactivated by an administrator"): the suite never deactivates a payer it
 * did not create; the account's "Al Dawaa 2" IS already inactive, so the case reads its state
 * (BLOCKED if it is active again) and checks the list under it. When the top-bar scope no
 * longer offers the inactive payer, the account's remaining scope (All My Payers) must still
 * expose no policy outside its assignment.
 */

/** A term several policies' names share (the sheet's "similar names"). */
export const sharedTerm = (): string => `${SUITE_POLICY_PREFIX} Shared ${policyStamp()}`;

/** What a refused direct link may say. */
export const OUT_OF_SCOPE = /not found|unable to load|does not exist|no longer|restricted|not authori[sz]ed|permission|access denied|forbidden/i;

export const CASES = {
  onlyPayerA: { azureId: '19642' },
  searchScoped: { azureId: '19643' },
  exportScoped: { azureId: '19644' },
  multiplePayers: { azureId: '19646' },
  adminAll: { azureId: '19647' },
  directLink: { azureId: '19648' },
  noLeak: { azureId: '19650' },
  exportFilterScope: { azureId: '19651', status: 'Active' },
  payerDeactivated: { azureId: '19652' },
  consistentViews: { azureId: '19653', rounds: 2, type: 'Group', allTypes: 'All Types' },
  identicalRule: { azureId: '19654' },
} as const;

const PER_USER =
  'a disposable payer-scoped test USER whose payer assignment the case may set. Payers are assigned per user (the user drawer: '
  + 'Role + assigned Payers) and the framework has no page object for it; the only payer-scoped account is the shared '
  + '"Payer Admin" (Al Dawaa 2, NUPCO), whose assignments must not be changed - other suites and people rely on it.';

export const BLOCKED_CASES: PolicyBlockedCase[] = [
  {
    azureId: '19645',
    title: 'should show an empty policy list with a message to a user with no payer assigned',
    reason: `Needs a payer-scoped account with ZERO payers assigned. The only one configured is assigned two (Al Dawaa 2, NUPCO). Needs ${PER_USER}`,
  },
  {
    azureId: '19649',
    title: 'should hide a payer\'s policies from a user as soon as that payer\'s assignment is removed',
    reason: `Needs ${PER_USER} (scoped to Payer A, then the assignment removed by an administrator and the list reloaded).`,
  },
];
