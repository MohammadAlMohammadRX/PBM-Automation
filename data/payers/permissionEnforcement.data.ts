import { NON_ADMIN_PROFILE, nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';
import type { RowAction } from '../../constants/ElementIds';
import type { PayerPermissionKey } from '../accounts/payerAdminRole.data';

/**
 * Test data for "Add Inactivate, View Details and Approval Permissions".
 *
 * The permission CATALOGUE is reachable: Role Administration lists the payer
 * permissions the bilingual-names story enumerated (`PAYER_PERMISSIONS`), and
 * the administrator can open a role and toggle them - which is the
 * checklist case and the assemble-a-custom-role case here.
 *
 * ENFORCEMENT is reachable only as far as the second account reaches. The
 * configured non-admin account (a Payer Admin - see nonAdminAccount.data)
 * HOLDS view, export and audit rights and LACKS the payer approval permission,
 * so the granted halves of those and the withheld half of approval are real
 * cases. Every other "with / without permission X" case still needs an
 * account holding exactly that permission set, and is listed in BLOCKED_CASES
 * with the mismatch stated.
 */

/** The accounts the enforcement cases need, by the permission under test. */
export const ENFORCEMENT_ROLE_REQUIREMENT = {
  role: 'accounts holding, and lacking, each individual payer permission',
  reason:
    'Each case proves one permission independently grants or withholds one action. The shared '
    + 'administrator holds every permission, so it can show the granted half only - which asserts nothing about the gate.',
} as const;

/** The scoped payer the granted-permission cases exercise as the non-admin. */
export const GRANTED_CASE_PAYER = {
  name: NON_ADMIN_PROFILE.scopedPayers[0],
  code: NON_ADMIN_PROFILE.scopedPayerCodes[0],
} as const;

/** The approvals-hub tab the account without Approval Management · Payer must not see. */
export const PAYER_APPROVALS_TAB = 'payer';

const MUTATES_SCOPED_PAYER =
  `The granted half would change one of the ${NON_ADMIN_PROFILE.role}'s two assigned payers (shared, live `
  + 'records) and the change could only be completed by an approver the account is not. Needs a '
  + 'disposable payer assigned to a non-admin account.';

const needsOtherAccount = (detail: string): string => `${detail} ${ENFORCEMENT_ROLE_REQUIREMENT.reason}`;

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  { id: '001', title: 'should let a user with Inactivate Payer inactivate an active payer', reason: MUTATES_SCOPED_PAYER },
  { id: '003', title: 'should let a user with Activate Payer reactivate an inactive payer', reason: MUTATES_SCOPED_PAYER },
  { id: '009', title: 'should let a user with View Dashboard open the payer dashboard', reason: needsOtherAccount('The analytics dashboard turns the configured non-admin account away ("Access Restricted"), so the granted half needs an account holding View Dashboard.') },
  { id: '011', title: 'should let a user with Manage Network Links change network links', reason: MUTATES_SCOPED_PAYER },
  { id: '012', title: 'should let a user with Approval Management · Payer act as checker on approval requests', reason: needsOtherAccount('The only checker here is the shared administrator, whose approvals every workflow case already exercises; the case needs a SECOND account holding the permission.') },
];

/**
 * TC-014's decision table - one row per permission withdrawn from the role.
 *
 * Each row claims more than its sibling single-permission cases do: that the
 * withdrawn right takes away ITS action and NOTHING ELSE. A role that lost
 * Export but also lost Inactivate would pass 15784 and fail here, which is the
 * point of having a table at all.
 *
 * Only controls with a single, unambiguous refusal are used as the withheld
 * side. View Payer Details is not, because its refusal may be the route or the
 * page (see 15781), so it appears only as a control that must stay offered.
 *
 * Converted from BLOCKED on 2026-10-06, with TC-018 and TC-020: the QA lead
 * confirmed the scenario - edit the Payer Admin role, untick the right, sign
 * in as the non-admin, and the control appearing is a bug - and shapedNonAdmin
 * already builds exactly that.
 */
export type DecisionControl = RowAction | 'export';

export interface DecisionRow {
  without: PayerPermissionKey;
  withheld: DecisionControl;
  stillOffered: readonly DecisionControl[];
}

export const PERMISSION_DECISION_TABLE: readonly DecisionRow[] = [
  { without: 'inactivatePayer', withheld: 'inactivate', stillOffered: ['view', 'edit', 'export'] },
  { without: 'exportPayers', withheld: 'export', stillOffered: ['view', 'edit', 'inactivate'] },
  { without: 'editPayer', withheld: 'edit', stillOffered: ['view', 'inactivate', 'export'] },
];
