/**
 * Writer E (Notification Center folders 01, 02, 11, 12, 13, 21) - the ids the
 * shared constants do not carry yet. Module / action ids are the stable seed
 * GUIDs of POST NotificationCenter/GetOptions (reports/notification/probe/
 * live-2026-11-11/options.json); `NOTIFICATION_ACTION` in
 * utils/jobDriven/notifications.ts only holds the network and plan ones.
 */

/** The entities whose status changes notify (Plan is not in Writer E's stories). */
export type NotifiedEntity = 'payer' | 'network' | 'policy' | 'formulary';

/** The four status actions of each entity. */
export type StatusKind = 'active' | 'inactive' | 'expired' | 'expiringSoon';

/** The approval actions (module Approval Management). */
export type ApprovalKind = 'needApprove' | 'approved' | 'rejected';

/** App-notification modules (GetOptions `modules`). */
export const NC_MODULE = {
  approvalManagement: 'd0000001-0000-4000-8000-000000000110',
  payer: 'd0000001-0000-4000-8000-000000000111',
  network: 'd0000001-0000-4000-8000-000000000112',
  plan: 'd0000001-0000-4000-8000-000000000113',
  policy: 'd0000001-0000-4000-8000-000000000114',
  formulary: 'd0000001-0000-4000-8000-000000000101',
} as const;

/** The status actions per entity - each belongs to the entity's own module. */
export const STATUS_ACTION: Readonly<Record<NotifiedEntity, Readonly<Record<StatusKind, string>>>> = {
  payer: {
    active: 'd0000002-0000-4000-8000-000000000203',
    inactive: 'd0000002-0000-4000-8000-000000000206',
    expired: 'd0000002-0000-4000-8000-000000000204',
    expiringSoon: 'd0000002-0000-4000-8000-000000000207',
  },
  network: {
    active: 'd0000002-0000-4000-8000-000000000213',
    inactive: 'd0000002-0000-4000-8000-000000000216',
    expired: 'd0000002-0000-4000-8000-000000000214',
    expiringSoon: 'd0000002-0000-4000-8000-000000000217',
  },
  policy: {
    active: 'd0000002-0000-4000-8000-000000000233',
    inactive: 'd0000002-0000-4000-8000-000000000236',
    expired: 'd0000002-0000-4000-8000-000000000234',
    expiringSoon: 'd0000002-0000-4000-8000-000000000237',
  },
  formulary: {
    active: 'd0000002-0000-4000-8000-000000000243',
    inactive: 'd0000002-0000-4000-8000-000000000246',
    expired: 'd0000002-0000-4000-8000-000000000244',
    expiringSoon: 'd0000002-0000-4000-8000-000000000247',
  },
};

/** The approval actions per entity (module Approval Management). */
export const APPROVAL_ACTION: Readonly<Record<NotifiedEntity, Readonly<Record<ApprovalKind, string>>>> = {
  payer: {
    needApprove: 'd0000002-0000-4000-8000-000000000200',
    approved: 'd0000002-0000-4000-8000-000000000201',
    rejected: 'd0000002-0000-4000-8000-000000000202',
  },
  network: {
    needApprove: 'd0000002-0000-4000-8000-000000000210',
    approved: 'd0000002-0000-4000-8000-000000000211',
    rejected: 'd0000002-0000-4000-8000-000000000212',
  },
  policy: {
    needApprove: 'd0000002-0000-4000-8000-000000000230',
    approved: 'd0000002-0000-4000-8000-000000000231',
    rejected: 'd0000002-0000-4000-8000-000000000232',
  },
  formulary: {
    needApprove: 'd0000002-0000-4000-8000-000000000101',
    approved: 'd0000002-0000-4000-8000-000000000241',
    rejected: 'd0000002-0000-4000-8000-000000000102',
  },
};

/**
 * Notification Detail parts the shared NOTIFICATION_DETAIL does not list:
 * the Changes rows' "after" cells (scrolled into view so every change counts
 * as viewed) and the Reject drawer's inline errors - both prefix matches.
 */
export const DETAIL_EXTRA = {
  diffAfterCellPrefix: 'notification-detail-diff-row-',
  diffAfterCellSuffix: '-after',
  rejectDrawerPrefix: 'notification-detail-reject-drawer',
  errorSuffix: '-error',
} as const;
