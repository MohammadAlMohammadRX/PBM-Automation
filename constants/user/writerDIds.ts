/**
 * Ids Writer D's invitation folders (11 sort / export, 12 create, 13 search /
 * filter) need on top of `constants/user/userIds.ts`. Every one was read from
 * the foundation's id dumps (`reports/user/probe/foundation-2026-11-08/`,
 * 2026-11-08) unless marked otherwise.
 */

/** The Add New Invitation drawer's field errors (the Payer one from p8-inv-payer-role.ids.txt; role / e-mail as INVITATION_FORM). */
export const INVITATION_FIELD_ERROR = {
  role: 'invitation-form-drawer-role-id-error',
  payer: 'invitation-form-drawer-payer-id-error',
  emails: 'invitation-form-drawer-emails-error',
} as const;

export type InvitationErrorField = keyof typeof INVITATION_FIELD_ERROR;

/** Approval Management on its Registrations tab (p6-inv-approvals.ids.txt). */
export const APPROVALS_REGISTRATIONS = {
  tab: 'approvals-hub-tab-invitation',
  table: 'approvals-invitation-table',
} as const;
