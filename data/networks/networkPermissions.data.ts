import { NETWORK_PERMISSION, type NetworkPermissionKey } from '../accounts/payerAdminRole.data';
import type { NetworkAccessAction } from '../../pages/network/NetworkManagementPage';

/**
 * Permission sets for the network permission stories (US 14140, US 14315).
 *
 * The environment has ONE non-administrator account, the shared "Payer Admin"
 * role. A case that needs "a role holding only X" shapes that role for the
 * case (fixture `shapedNonAdmin`): every network permission is taken off
 * except the ones kept, and the role is put back in teardown. Keys are the
 * NETWORK_PERMISSION map (catalogue labels verified 2026-10-21).
 *
 * NOTE (2026-09-21, still true at writing): role edits do not reach a user's
 * effective permissions in this build. The fixture records that as a
 * `permission-not-propagated` annotation; the case still asserts what the
 * story requires, so a control left on offer is a reported failure.
 */

export const ALL_NETWORK_PERMISSIONS = Object.keys(NETWORK_PERMISSION) as NetworkPermissionKey[];

/** Every network permission except `keep` - "a role holding only these". */
export const allNetworkPermissionsExcept = (...keep: NetworkPermissionKey[]): NetworkPermissionKey[] =>
  ALL_NETWORK_PERMISSIONS.filter((key) => !keep.includes(key));

/**
 * The shape for "a role holding only these network permissions": everything
 * else taken off, and `keep` explicitly granted. Granting matters - a case that
 * shapes the role twice (EditOnly, then ActivateOnly) would otherwise inherit
 * the first shape's removals, since shaping only touches what it names.
 */
export const onlyNetworkPermissions = (
  ...keep: NetworkPermissionKey[]
): { without: NetworkPermissionKey[]; with: NetworkPermissionKey[] } => ({
  without: allNetworkPermissionsExcept(...keep),
  with: keep,
});

/** Every action readActionAccess reports. */
export const ALL_ACCESS_ACTIONS: readonly NetworkAccessAction[] = [
  'viewList',
  'viewDetails',
  'dashboard',
  'export',
  'create',
  'edit',
  'delete',
  'activate',
  'inactivate',
  'versionHistory',
  'revert',
  'auditLog',
  'assignFacilities',
];

/** The story 14315 "seven network actions", each with the permission that grants it. */
export const SEVEN_ACTIONS: ReadonlyArray<{ action: NetworkAccessAction; permission: NetworkPermissionKey; label: string }> = [
  { action: 'viewDetails', permission: 'viewNetworkDetails', label: 'View Network Details' },
  { action: 'dashboard', permission: 'viewNetworksDashboard', label: 'View Network Dashboard' },
  { action: 'export', permission: 'exportNetworks', label: 'Export Networks' },
  { action: 'inactivate', permission: 'inactivateNetwork', label: 'Inactivate Network' },
  { action: 'versionHistory', permission: 'viewNetworkVersions', label: 'View Version History' },
  { action: 'revert', permission: 'revertNetworkVersion', label: 'Request Version Revert' },
  { action: 'auditLog', permission: 'viewNetworkAuditTrail', label: 'View Audit Logs' },
];

/** The seven actions other than `granted`. */
export const sevenActionsExcept = (...granted: NetworkAccessAction[]): NetworkAccessAction[] =>
  SEVEN_ACTIONS.map((entry) => entry.action).filter((action) => !granted.includes(action));

/**
 * Picks `actions` out of an access read - so a case can compare exactly the
 * actions it is about.
 */
export const pick = (
  access: Record<NetworkAccessAction, boolean>,
  actions: readonly NetworkAccessAction[],
): Partial<Record<NetworkAccessAction, boolean>> =>
  Object.fromEntries(actions.map((action) => [action, access[action]]));

/** `{ action: value }` for every action - the expected side of a comparison. */
export const every = (
  actions: readonly NetworkAccessAction[],
  value: boolean,
): Partial<Record<NetworkAccessAction, boolean>> => Object.fromEntries(actions.map((action) => [action, value]));

/**
 * The actions a baseline session (the administrator, holding every right) was
 * actually OFFERED - an absence only proves a refusal for a control that is on
 * offer to someone who holds the right (convention of 2026-09-21).
 */
export const offeredIn = (
  baseline: Record<NetworkAccessAction, boolean>,
  actions: readonly NetworkAccessAction[],
): NetworkAccessAction[] => actions.filter((action) => baseline[action]);

/** Status answers that mean "refused for authorisation". */
export const AUTHORISATION_REFUSALS = [401, 403] as const;
