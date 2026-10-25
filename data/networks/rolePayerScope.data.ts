import { RandomDataUtils } from '../../utils/RandomDataUtils';
import { uniqueArabic, type NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14322 "Restrict role payer assignments to a defined scope".
 *
 * WHAT THE APPLICATION ACTUALLY HAS (from the framework's own mapping):
 *  - a ROLE carries a "Has Assigned Payers" switch
 *    (`role-form-drawer-has-assigned-payers-checkbox`) - whether users holding
 *    it are scoped to payers - and no payer list of its own;
 *  - the payers themselves are assigned per USER, on step 3 of the user drawer
 *    (Role + assigned Payers), which this framework has no page object for;
 *  - the only administrator, "careconnect", has `allowAllPayers: true`
 *    (GetMyPayers, 2026-10-21: 266 payers) - so NO payer is outside its scope.
 *
 * So the scope-restriction cases need an administrator whose own payer scope
 * is limited, and the assignment cases need a disposable user; both are named
 * as BLOCKED reasons below. The two cases the environment supports run for
 * real: a non-administrator refused role configuration, and the switch's final
 * state after rapid toggling on a role the case creates and deletes.
 */

const SCOPED_ADMIN =
  'an administrator account whose OWN payer scope is limited (e.g. to two payers). The only administrator '
  + '("careconnect") answers GetMyPayers with allowAllPayers=true over all 266 payers, so no payer is outside its '
  + 'scope and the scope filter cannot be observed.';

const PER_USER =
  'a disposable test USER to assign payers to. In this build payers are assigned per user (user drawer step 3: '
  + 'Role + assigned Payers), not on the role - the role only carries a "Has Assigned Payers" switch - and the only '
  + 'users are shared real accounts whose payer assignments must not be changed. Needs a seeded test user (and a '
  + 'Users page object) to make this runnable.';

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '18287',
    title: 'should save an in-scope payer to the role when the administrator assigns a payer within their scope',
    reason: `Needs ${SCOPED_ADMIN} Also needs ${PER_USER}`,
  },
  {
    azureId: '18288',
    title: 'should block selecting a payer outside the administrator\'s scope when it is searched for or forced',
    reason: `Needs ${SCOPED_ADMIN}`,
  },
  {
    azureId: '18289',
    title: 'should block saving with a validation message when payer scope is required and no payer is assigned',
    reason: `Needs ${PER_USER}`,
  },
  {
    azureId: '18290',
    title: 'should save the role when exactly one in-scope payer is assigned',
    reason: `Needs ${PER_USER}`,
  },
  {
    azureId: '18291',
    title: 'should block payer assignment for a role that accepts none and allow it for a role that requires it',
    reason: `Needs ${PER_USER} (the payer picker appears on the user drawer according to the role's switch).`,
  },
  {
    azureId: '18292',
    title: 'should clear prior payer assignments when a role is changed to not accept payer assignments',
    reason: `Needs ${PER_USER} (the prior assignment that must be cleared lives on a user).`,
  },
  {
    azureId: '18294',
    title: 'should not create a duplicate entry when the same payer is assigned to the role again',
    reason: `Needs ${PER_USER}`,
  },
  {
    azureId: '18296',
    title: 'should keep an assignment that falls outside a later-reduced scope without silent data loss',
    reason: `Needs ${SCOPED_ADMIN} - and a way to reduce that administrator's scope afterwards. Also needs ${PER_USER}`,
  },
  {
    azureId: '18297',
    title: 'should list only the administrator\'s in-scope payers when payer assignments are opened',
    reason: `Needs ${SCOPED_ADMIN}`,
  },
];

/** 18293 - a non-administrator must not reach role configuration. */
export const NON_ADMIN_DENIED = {
  azureId: '18293',
  /** What a refused session lands on (verified for the Payer Admin, 2026-09-12). */
  refusal: /Access Restricted|dashboard/i,
  /** A minimal role body - the point is the refusal, not the payload. */
  attemptedBody: { id: '00000000-0000-0000-0000-000000000000', hasAssignedPayers: true },
  authorisationRefusals: [401, 403] as const,
} as const;

/** 18298 - rapid toggling of "Has Assigned Payers" on a role the case owns. */
export const RAPID_TOGGLE = {
  azureId: '18298',
  role: () => ({
    nameEn: `Automation Role ${RandomDataUtils.uniqueSuffix()}`,
    nameAr: uniqueArabic('دور'),
  }),
  /** One harmless read permission, so the new role is savable. */
  permission: 'GetNetworksDropdown',
  startsWith: false,
  /** An odd number of clicks: the final state is the opposite of the start. */
  toggles: 7,
  finalState: true,
} as const;
