import type { NetworkBlockedCase } from '../networks/network.data';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import type { RolePermissionKey } from '../accounts/payerAdminRole.data';
import type { RowAction } from '../../constants/ElementIds';
import { PLAN_APPROVAL_CELL, PLAN_LIFECYCLE } from './plan.data';

/**
 * Test data for US 14168 "Display row actions per plan and approval status"
 * (folder 16-display-row-actions-per-plan-and-approval-status).
 *
 * Live rows (2026-10-27): Draft = View, Edit, Clone, Send for Approval,
 * Inactivate, Delete; Pending Approval = View, Edit, Clone, Inactivate, Delete;
 * Active = View, Clone, Inactivate, Delete; Inactive = View, Clone, Activate,
 * Delete. No Approve / Reject / Recall is offered on a row. The story asks for
 * more than that (Delete for Draft only, Approve / Reject / Recall while a change
 * is pending) - the cases assert the story, so those differences fail.
 */

export type PlanBlockedCase = NetworkBlockedCase;

export const CASE = {
  viewAlways: '19169',
  editBeforePublish: '19170',
  editDisabledOnPublish: '19171',
  expiredLocked: '19172',
  sendForApproval: '19173',
  decisionRoles: '19174',
  nonApprover: '19175',
  deactivateGated: '19176',
  expiredNoLifecycle: '19177',
  deleteDraftOnly: '19178',
  deleteBlockedByLinks: '19179',
  deleteLiveGated: '19180',
  permissionTooltips: '19181',
  lifecycleActions: '19182',
} as const;

/** 19169 / 19178 - the plan states the sheet lists, as fixture states. */
export const VIEW_STATES = ['Draft', 'PendingApproval', 'Active', 'Expired'] as const;
export const NON_DRAFT_STATES = ['PendingApproval', 'Active', 'Expired'] as const;

/** Status / approval values the rows display. */
export const STATUS = PLAN_LIFECYCLE;
export const APPROVAL = PLAN_APPROVAL_CELL;

/** 19172 / 19177 - the lifecycle actions an Expired plan must not offer. */
export const EXPIRED_LOCKED_ACTIONS: readonly RowAction[] = ['edit', 'activate', 'inactivate'];
export const LIFECYCLE_ACTIONS: readonly RowAction[] = ['activate', 'inactivate'];

/** 19176 - the sheet's reason ("Policy renewal pending" is not on the lookup) and details. */
export const DEACTIVATION = {
  reason: 'Payer Request',
  details: 'Policy renewal pending',
} as const;

/** 19173 - the details of the change staged on the published plan (a Draft change). */
export const STAGED_CHANGE_DETAILS = 'Draft change staged for US 14168 (Send for Approval).';

/** 19179 - what a refused deletion should explain (a linked formulary). */
export const LINKED_DELETE_MESSAGE = /linked|formular|assigned|cannot be deleted|in use/i;

/**
 * 19175 / 19181 - plans for these cases belong to a payer IN the
 * non-administrator's scope (submitted / drafted without a formulary), so what
 * the account is offered can only come from its role.
 */
export const SCOPED_PAYER = NON_ADMIN_PROFILE.scopedPayers[0];

/** 19181 - a view-only role: every plan right that changes something is taken off. */
export const VIEW_ONLY_WITHOUT: readonly RolePermissionKey[] = [
  'createPlan', 'editPlan', 'deletePlan', 'clonePlan', 'submitPlan', 'inactivatePlan', 'activatePlan', 'assignPlanFormulary',
];
export const VIEW_ONLY_WITH: readonly RolePermissionKey[] = ['viewPlanDetails'];

/** 19181 - the row actions a Draft row offers an administrator, checked on the view-only row. */
export const RESTRICTED_ROW_ACTIONS: readonly RowAction[] = ['edit', 'submit-for-approval', 'inactivate', 'delete'];

/** 19182 - row actions per lifecycle stage. */
export const LIFECYCLE_STAGES = {
  draft: { available: ['view', 'edit', 'submit-for-approval', 'delete'] as RowAction[] },
  pending: { unavailable: ['edit', 'delete'] as RowAction[] },
  active: { available: ['view', 'inactivate'] as RowAction[], unavailable: ['edit', 'delete'] as RowAction[] },
  expired: { available: ['view'] as RowAction[], unavailable: ['edit', 'activate', 'inactivate', 'delete'] as RowAction[] },
} as const;

/** 19182 - a plan going live a minute after creation and expiring this many minutes later. */
export const SHORT_LIVED = { effectiveInMinutes: 1, expiryInMinutes: 14 } as const;

/** 19182 - how long the lifecycle job may take to expire it. */
export const EXPIRY_WAIT_MS = 18 * 60_000;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: CASE.decisionRoles,
    title: 'should show Recall only to the submitter and Approve / Reject only to an approver when a change is pending',
    reason:
      'Needs three accounts that can all see one pending plan change: its submitter, a SECOND designated approver who '
      + 'did not submit it, and a general user. This environment has one approver (the administrator, who is also every '
      + 'submitter) and one non-administrator (Payer Admin, not a plan approver, scoped to "Al Dawaa 2" / "NUPCO" - '
      + 'neither owns an Active formulary, so no change of theirs can be approved). Unblocked by a second plan-approver '
      + 'account in the suite payer\'s scope.',
  },
  {
    azureId: CASE.deleteLiveGated,
    title: 'should submit the deletion for approval when a previously live plan without linked entities is deleted',
    reason:
      'Needs a plan that has gone live and has NO linked entity. A plan cannot be approved without an assigned formulary '
      + '(409, "A plan must have an assigned formulary before this change can be approved."), and removing the formulary '
      + 'from a live plan is itself a change that cannot be approved for the same reason - so every live plan in this '
      + 'environment is linked to its formulary. Unblocked when a published plan can be detached from its formulary.',
  },
];
