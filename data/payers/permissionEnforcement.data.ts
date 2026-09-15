import { NON_ADMIN_PROFILE, nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';

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
  { id: '002', title: 'should refuse inactivation to a user without Inactivate Payer', reason: nonAdminBlockReason({ lacking: ['changePayerStatus'] }) },
  { id: '003', title: 'should let a user with Activate Payer reactivate an inactive payer', reason: MUTATES_SCOPED_PAYER },
  { id: '004', title: 'should refuse reactivation to a user without Activate Payer', reason: nonAdminBlockReason({ lacking: ['changePayerStatus'] }) },
  { id: '006', title: 'should deny payer details to a user without View Payer Details', reason: nonAdminBlockReason({ lacking: ['viewPayerDetails'] }) },
  { id: '008', title: 'should refuse the export to a user without Export Payer List', reason: nonAdminBlockReason({ lacking: ['exportPayers'] }) },
  { id: '009', title: 'should let a user with View Dashboard open the payer dashboard', reason: needsOtherAccount('The analytics dashboard turns the configured non-admin account away ("Access Restricted"), so the granted half needs an account holding View Dashboard.') },
  { id: '011', title: 'should let a user with Manage Network Links change network links', reason: MUTATES_SCOPED_PAYER },
  { id: '012', title: 'should let a user with Approval Management · Payer act as checker on approval requests', reason: needsOtherAccount('The only checker here is the shared administrator, whose approvals every workflow case already exercises; the case needs a SECOND account holding the permission.') },
  { id: '014', title: 'should expose exactly the actions each permission combination grants', reason: needsOtherAccount('The decision table needs a role per combination.') },
  { id: '016', title: 'should give no payer module access to a role with zero payer permissions', reason: nonAdminBlockReason({ lacking: ['viewPayerList'] }) },
  { id: '018', title: 'should apply a permission change to an active session', reason: needsOtherAccount('The case also changes the role of a logged-in test user mid-session, which would alter the shared non-admin account for every later case.') },
  { id: '019', title: 'should block a direct API inactivation from a user without Inactivate Payer', reason: nonAdminBlockReason({ lacking: ['changePayerStatus'] }) },
  { id: '020', title: 'should gate the two directions of the Active/Inactive transition independently', reason: needsOtherAccount('It needs an account with Activate but not Inactivate.') },
];
