import { ALL_NETWORK_PERMISSIONS, SEVEN_ACTIONS, onlyNetworkPermissions } from './networkPermissions.data';
import type { NetworkAccessAction } from '../../pages/network/NetworkManagementPage';
import { NETWORK_PERMISSION, PAYER_ADMIN_ROLE, type NetworkPermissionKey } from '../accounts/payerAdminRole.data';

/**
 * Test data for US 14315 "Grant permissions individually for each network
 * action (User & Role)".
 *
 * The story's seven actions and the catalogue permission behind each (Role
 * Administration > Networks, verified 2026-10-21):
 *   View Network Details    -> GetNetwork
 *   View Network Dashboard  -> GetNetworksDashboard
 *   Export Networks         -> ExportNetworks
 *   Inactivate Network      -> InactivateNetwork
 *   View Version History    -> GetNetworkVersions
 *   Request Version Revert  -> RevertNetworkVersion
 *   View Audit Logs         -> GetNetworkAuditTrail (the Networks group's own
 *                              "View Audit Logs" entry repeats in every
 *                              module group, so it cannot be named alone)
 *
 * "A role with no network permissions" is the shared Payer Admin role shaped
 * for the case (fixture `shapedNonAdmin`), restored in teardown.
 */

const permissionOf = (action: NetworkAccessAction): NetworkPermissionKey =>
  SEVEN_ACTIONS.find((entry) => entry.action === action)!.permission;

/** One "grant only this action" case. */
export interface OnlyActionCase {
  azureId: string;
  title: string;
  granted: NetworkAccessAction[];
  role: { without: NetworkPermissionKey[]; with: NetworkPermissionKey[] };
}

const only = (azureId: string, title: string, ...granted: NetworkAccessAction[]): OnlyActionCase => ({
  azureId,
  title,
  granted,
  role: onlyNetworkPermissions(...granted.map(permissionOf)),
});

/** The pure "only X" cases - X works, the other six are denied. */
export const ONLY_ACTION_CASES: readonly OnlyActionCase[] = [
  only('18192', 'should allow only viewing network details when only View Network Details is granted', 'viewDetails'),
  only('18193', 'should allow only the network dashboard when only View Network Dashboard is granted', 'dashboard'),
  only('18195', 'should allow only viewing version history and not revert when only View Version History is granted', 'versionHistory'),
  only('18198', 'should allow only the network audit log when only View Audit Logs is granted', 'auditLog'),
];

export const EXPORT_ONLY = only('18194', 'should allow only exporting networks when only Export Networks is granted', 'export');

export const INACTIVATE_ONLY = only('18197', 'should allow only inactivating a network when only Inactivate Network is granted', 'inactivate');

export const REVERT_ONLY = {
  ...only('18196', 'should submit a revert request without view-history rights when only Request Version Revert is granted', 'revert'),
  /** An Inactive network carries v1 (Create) and v2 (status change) - v1 is a prior version. */
  priorVersion: 'v1',
};

export const REVOKE_EXPORT = {
  azureId: '18201',
  granted: { with: [permissionOf('export')] },
  revoked: { without: [permissionOf('export')] },
} as const;

export const ZERO_PERMISSIONS = {
  azureId: '18202',
  role: { without: ALL_NETWORK_PERMISSIONS },
} as const;

export const ALL_SEVEN = {
  azureId: '18199',
  role: { with: SEVEN_ACTIONS.map((entry) => entry.permission) },
} as const;

export const DETAILS_AND_EXPORT = only(
  '18200',
  'should allow only the selected details and export actions when that partial combination is granted',
  'viewDetails',
  'export',
);

export const INACTIVATE_BYPASS = {
  azureId: '18203',
  role: { without: [permissionOf('inactivate')] },
} as const;

export const MID_SESSION_REVOKE = {
  azureId: '18204',
  granted: { with: [permissionOf('auditLog'), permissionOf('viewDetails')] },
  revoked: { without: [permissionOf('auditLog')] },
} as const;

export const CATALOGUE_SEVEN = {
  azureId: '18205',
  /** The role whose catalogue is inspected - toggled and put back, closed WITHOUT saving. */
  role: PAYER_ADMIN_ROLE,
  entries: SEVEN_ACTIONS.map((entry) => ({ requirement: entry.label, label: NETWORK_PERMISSION[entry.permission] })),
} as const;
