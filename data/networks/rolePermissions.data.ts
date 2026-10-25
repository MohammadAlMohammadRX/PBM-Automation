import { ALL_NETWORK_PERMISSIONS, onlyNetworkPermissions } from './networkPermissions.data';
import { buildNetwork } from './network.data';
import type { NetworkAccessAction } from '../../pages/network/NetworkManagementPage';

/**
 * Test data for US 14140 "Control access with role-based permissions".
 *
 * The sheet's test roles (CreateOnly, EditOnly, ActivateOnly, DeleteOnly,
 * NoAccess, NetworkReviewer) are built by SHAPING the one non-administrator
 * role the environment has ("Payer Admin") for the length of a case - see
 * networkPermissions.data.ts. The sheet's NET-300..NET-307 are networks each
 * case provisions for itself (fixture `networkIn`), never shared records.
 */

export const CREATE_ONLY = {
  azureId: '17996',
  role: onlyNetworkPermissions('createNetwork'),
  /** The network the shaped user creates; discarded at teardown. */
  network: () => buildNetwork(),
} as const;

export const DECISION_TABLE = {
  azureId: '17997',
  editOnly: onlyNetworkPermissions('editNetwork'),
  activateOnly: onlyNetworkPermissions('activateNetwork'),
  deleteOnly: onlyNetworkPermissions('deleteNetwork'),
  editedDescription: 'Edited by the EditOnly role in an automated permission case.',
} as const;

export const WITHOUT_DELETE = { azureId: '17998', role: { without: ['deleteNetwork' as const] } } as const;

export const NO_ACCESS = {
  azureId: '17999',
  role: { without: ALL_NETWORK_PERMISSIONS },
  /** Everything a session can do on a network beyond seeing the list. */
  actions: [
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
  ] as NetworkAccessAction[],
} as const;

export const EDIT_WITHOUT_STATUS = {
  azureId: '18000',
  role: { without: ['activateNetwork' as const, 'inactivateNetwork' as const], with: ['editNetwork' as const] },
  editedDescription: 'Edited while the status permissions are withheld.',
} as const;

export const NETWORK_REVIEWER = {
  azureId: '18001',
  role: onlyNetworkPermissions('viewNetworkVersions', 'viewNetworkAuditTrail'),
  /** The catalogue labels the shaped role must report as granted. */
  granted: ['GetNetworkVersions', 'GetNetworkAuditTrail'],
} as const;

export const API_BYPASS = {
  azureId: '18002',
  role: { without: ['editNetwork' as const] },
  attemptedName: 'Renamed through the API without Edit permission',
} as const;

/** 18003 - two shaped roles and the controls each must (and must not) get. */
export const EXPLORATORY_MATRIX = {
  azureId: '18003',
  roles: [
    {
      label: 'edit-only',
      role: onlyNetworkPermissions('editNetwork'),
      granted: ['edit'] as NetworkAccessAction[],
      withheld: ['create', 'delete', 'activate', 'inactivate', 'export', 'revert', 'assignFacilities'] as NetworkAccessAction[],
    },
    {
      label: 'facility-membership-only',
      role: onlyNetworkPermissions(
        'viewNetworkDetails',
        'viewNetworkFacilities',
        'viewAssignableFacilities',
        'assignFacilities',
        'unassignFacility',
      ),
      granted: ['assignFacilities'] as NetworkAccessAction[],
      withheld: ['create', 'edit', 'delete', 'activate', 'inactivate', 'export', 'revert'] as NetworkAccessAction[],
    },
  ],
} as const;

/** 18004 - the Networks group of the permission catalogue. */
export const CATALOGUE_CHECKLIST = {
  azureId: '18004',
  group: 'Networks',
  required: [
    { requirement: 'Create Network', label: 'CreateNetwork' },
    { requirement: 'Edit Network', label: 'UpdateNetwork' },
    { requirement: 'Activate Network', label: 'SetNetworkActive' },
    { requirement: 'Inactivate Network', label: 'InactivateNetwork' },
    { requirement: 'Delete Network', label: 'DeleteNetwork' },
    { requirement: 'View Version History', label: 'GetNetworkVersions' },
    { requirement: 'Revert Version', label: 'RevertNetworkVersion' },
    { requirement: 'View Network Audit History', label: 'GetNetworkAuditTrail' },
    { requirement: 'Assign facilities (membership)', label: 'AssignFacilitiesToNetwork' },
    { requirement: 'Unassign facilities (membership)', label: 'UnassignFacilityFromNetwork' },
  ],
  /** No policy link/unlink permission may remain under Network Management. */
  obsolete: /(un)?link.*polic|polic.*(un)?link/i,
} as const;

export const VIEW_NOT_REVERT = {
  azureId: '18005',
  role: { without: ['revertNetworkVersion' as const], with: ['viewNetworkVersions' as const, 'viewNetworkDetails' as const] },
  /** An Inactive network carries v1 (Create) and v2 (status change). */
  minimumVersions: 2,
  previousVersion: 'v1',
} as const;

export const FACILITY_MEMBERSHIP_ONLY = {
  azureId: '18006',
  role: onlyNetworkPermissions(
    'viewNetworkDetails',
    'viewNetworkFacilities',
    'viewAssignableFacilities',
    'assignFacilities',
    'unassignFacility',
  ),
  /** The pool label reads "FCL-000009 — Nathealth"; the code is the part before the dash. */
  codeOf: (option: string): string => option.split('—')[0].trim(),
} as const;
