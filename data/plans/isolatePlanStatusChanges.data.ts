import type { NetworkBlockedCase } from '../networks/network.data';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import type { PlanPermissionKey } from '../accounts/payerAdminRole.data';

/**
 * Test data for US 16775 "Keep activation and deactivation changes isolated to
 * the plan itself" (folder 30-keep-activation-and-deactivation-changes-isolated-to-the-plan).
 *
 * WHAT CAN BE OBSERVED (2026-10-27):
 *  - the LINKED FORMULARY's own status, from the Formulary register
 *    (PlanFormularyTab.readFormularyStatusViaApi over utils/FormularyProvisioning) -
 *    there is no Formulary Page Object yet, so the sheet's "open it in the
 *    Formulary module" reads the register the module is built on;
 *  - the plan's LINKED POLICIES, on the Policies module (PolicyManagementPage,
 *    Plan column) - but only for policies that exist: the framework cannot
 *    create one, so every case whose precondition is a policy linked to the
 *    plan is BLOCKED below, naming that missing resource.
 *
 * Plans are the case's own (`planIn`, payer "Al sharq", formulary FORM-0023).
 * A status change is maker-checker: activating / inactivating stages a draft,
 * which is sent for approval and approved before the plan reads its new status.
 * The sheet's "Read-Only Viewer" is the Payer Admin shaped without the plan
 * status permissions, on a plan of one of its own payers.
 */

export type PlanBlockedCase = NetworkBlockedCase;

export const CASE = {
  activateKeepsFormulary: '19321',
  deactivateKeepsFormulary: '19322',
  activateWithInactiveFormulary: '19327',
  deactivateWithoutPolicies: '19328',
  noPlanAdminRights: '19331',
} as const;

/** Lookup codes the API answers statuses in. */
export const STATUS_CODE = { active: 'active', inactive: 'inactive' } as const;

/** What a staged status change answers on screen (saved as a draft / submitted). */
export const STAGED_TOAST = /saved as a draft|submitted for approval|success/i;

/** The details a case's inactivation carries. */
export const INACTIVATION_DETAILS = 'Inactivated by the plan status isolation case (US 16775).';

/** The permissions the sheet's Read-Only Viewer lacks (inferred labels - data/accounts/payerAdminRole.data.ts). */
export const STATUS_PERMISSIONS: readonly PlanPermissionKey[] = ['inactivatePlan', 'activatePlan'];

/** What the server answers a role without the right. */
export const AUTHORISATION_REFUSALS = [401, 403] as const;

/** The payer of the plan the shaped non-admin works on: one of its own. */
export const SCOPED_PAYER = NON_ADMIN_PROFILE.scopedPayers[0];

/** How long an approved status change may take to show on the plan. */
export const STATUS_WAIT_MS = 3 * 60_000;

/** A case builds an Active or Inactive plan (up to ~4 minutes) and runs one approval round trip. */
export const ISOLATION_CASE_TIMEOUT_MS = 20 * 60_000;

/** 19327 also mints and deactivates a formulary; 19331 also shapes the role twice. */
export const LONG_CASE_TIMEOUT_MS = 30 * 60_000;

const POLICY_LINKED_PLAN =
  'a POLICY LINKED TO A PLAN THE SUITE OWNS. Policies reference a plan (the Policies list carries a Plan column), '
  + 'but the framework cannot create one: constants/ApiEndpoints.ts has no Create Policy endpoint, '
  + 'pages/policy/PolicyManagementPage.ts only reads the list, and no utils/ provisioning exists for policies. The '
  + 'suite must not activate or deactivate a team plan that real policies hang off. Runnable once a policy can be '
  + 'provisioned on a case-owned plan (or one is seeded on an "Automation Plan ..." plan).';

const FORMULARY_AUDIT =
  'It also reads the linked formulary\'s own History / Audit Trail, for which no Formulary Page Object exists yet.';

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '19323',
    title: 'should leave a linked Active policy Active when the plan is activated',
    reason: `Needs ${POLICY_LINKED_PLAN} (one Active policy on an Inactive plan).`,
  },
  {
    azureId: '19324',
    title: 'should leave a linked Active policy Active when the plan is deactivated',
    reason: `Needs ${POLICY_LINKED_PLAN} (one Active policy on an Active plan).`,
  },
  {
    azureId: '19325',
    title: 'should update only the plan\'s status, history and audit trail when the plan is deactivated',
    reason: `Needs ${POLICY_LINKED_PLAN} (one policy, whose own history must stay unchanged). ${FORMULARY_AUDIT}`,
  },
  {
    azureId: '19326',
    title: 'should leave each linked policy\'s own status untouched when a plan linked to an Active and an Inactive policy is deactivated',
    reason: `Needs ${POLICY_LINKED_PLAN} (two policies on one plan: one Active, one Inactive).`,
  },
  {
    azureId: '19329',
    title: 'should update only the plan and leave every policy Active when a plan linked to the maximum number of policies is deactivated',
    reason: `Needs ${POLICY_LINKED_PLAN} (the maximum supported number - e.g. 100 - of Active policies on one plan).`,
  },
  {
    azureId: '19330',
    title: 'should refuse a redundant activation without side effects when the plan is already Active',
    reason: `Needs ${POLICY_LINKED_PLAN} (one Active policy, whose status the redundant activation must not touch).`,
  },
  {
    azureId: '19332',
    title: 'should leave the linked formulary and policy unchanged when the plan\'s status is toggled rapidly several times',
    reason: `Needs ${POLICY_LINKED_PLAN} (one Active policy, checked after every toggle).`,
  },
  {
    azureId: '19333',
    title: 'should keep the status change isolated to the plan when it is made through an integration call',
    reason:
      `Needs ${POLICY_LINKED_PLAN} Also needs the integration/API channel the sheet names - an external system `
      + 'credential for plan status updates; only the screens\' own session API is known to the framework.',
  },
  {
    azureId: '19334',
    title: 'should add an audit entry only to the plan\'s trail when the plan is deactivated',
    reason: `Needs ${POLICY_LINKED_PLAN} (one policy with its own prior audit history). ${FORMULARY_AUDIT}`,
  },
  {
    azureId: '19335',
    title: 'should leave the linked formulary and all three linked policies Active when the plan is deactivated',
    reason: `Needs ${POLICY_LINKED_PLAN} (three Active policies on one Active plan).`,
  },
];
