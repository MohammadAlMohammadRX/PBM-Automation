/**
 * Writer C - App Notification (definitions) folders 15-19 of the Notification
 * Center Management automation (Feature 20980). Ids and seed GUIDs the lead's
 * shared constants do not carry yet (constants/notification/notificationIds.ts
 * and utils/jobDriven/notifications.ts hold the network / plan actions only).
 *
 * Every GUID below is a GetOptions seed value read live on 2026-11-11
 * (reports/notification/probe/live-2026-11-11/options.json).
 */

/** App-notification modules (GetOptions `modules`). */
export const DEF_MODULE = {
  approvalManagement: 'd0000001-0000-4000-8000-000000000110',
  payerManagement: 'd0000001-0000-4000-8000-000000000111',
  networkManagement: 'd0000001-0000-4000-8000-000000000112',
  planManagement: 'd0000001-0000-4000-8000-000000000113',
  policyManagement: 'd0000001-0000-4000-8000-000000000114',
  formularyManagement: 'd0000001-0000-4000-8000-000000000101',
} as const;

/** App-notification actions the folders use (GetOptions `actions`). "Need to Approve / Approved / Rejected" belong to Approval Management. */
export const DEF_ACTION = {
  payerNeedApprove: 'd0000002-0000-4000-8000-000000000200',
  payerActive: 'd0000002-0000-4000-8000-000000000203',
  payerInactive: 'd0000002-0000-4000-8000-000000000206',
  networkNeedApprove: 'd0000002-0000-4000-8000-000000000210',
  networkApproved: 'd0000002-0000-4000-8000-000000000211',
  networkActive: 'd0000002-0000-4000-8000-000000000213',
  networkInactive: 'd0000002-0000-4000-8000-000000000216',
  networkExpiringSoon: 'd0000002-0000-4000-8000-000000000217',
  planActive: 'd0000002-0000-4000-8000-000000000223',
  planInactive: 'd0000002-0000-4000-8000-000000000226',
  policyInactive: 'd0000002-0000-4000-8000-000000000236',
  policyExpiringSoon: 'd0000002-0000-4000-8000-000000000237',
} as const;

/** API fragments of the App Notification row writes (await THEIR answer). */
export const DEF_WRITE_API = {
  create: '/NotificationDefinition/CreateDefinition',
  update: '/NotificationDefinition/UpdateDefinition',
  toggle: '/NotificationDefinition/ToggleDefinitionActivation',
  delete: '/NotificationDefinition/DeleteDefinition',
  list: '/NotificationDefinition/GetDefinitions',
} as const;

/**
 * Parts of the App Notification drawer (`nc-definitions-form-drawer-<part>`),
 * read off the foundation probe (b32-b42, f01-f05).
 */
export const DEF_DRAWER_PART = {
  name: 'name-input',
  module: 'module-select',
  action: 'action-select',
  description: 'description-input',
  english: 'english-message-input',
  arabic: 'arabic-message-input',
  notes: 'notes-input',
  preview: 'preview-button',
  save: 'save-button',
  next: 'next-button',
  back: 'back-button',
  addAudience: 'add-audience-button',
  /** `<field>-error` under a field (`name-input` -> `name-error`? the probe saw `english-message-error`). */
  errorSuffix: '-error',
  audienceTypeSuffix: '-type-select',
  audiencePrefix: 'audience-idx-',
  sourceItemPrefix: 'assign-picklist-source-item-',
  targetItemPrefix: 'assign-picklist-target-item-',
  insertVariablePrefix: 'insert-variable-',
} as const;
