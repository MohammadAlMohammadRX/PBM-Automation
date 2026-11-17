/**
 * Role Management - Writer F ids (folders 15 Enforce Payer-Scoped Role Access, 16 Configure Approval
 * Management Permissions). Ids NOT in constants/ElementIds.ts or constants/role/roleIds.ts.
 *
 * Read off the probes of earlier modules (reports/policy/probe/51-54 approvals ids, 2026-11-03) - the
 * Approval Management hub is one component per module tab, every id folds in the tab key
 * (`approvals-<tab>-...`). The Registrations tab key is `invitation` (`approvals-hub-tab-invitation`);
 * its table ids are ASSUMED to follow the same pattern (not probed - only used behind the registration gate).
 */

/** Approval hub tab keys, in the hub's order. `invitation` = the "Registrations" tab. */
export const APPROVAL_TAB_KEYS = ['payer', 'network', 'plan', 'policy', 'formulary', 'invitation'] as const;
export type ApprovalTabKey = (typeof APPROVAL_TAB_KEYS)[number];

export const WRITER_F_IDS = {
  /** The hub's tab strip and its tabs (`approvals-hub-tab-<tab>`, count badge `-count`). */
  hubTabs: 'approvals-hub-tabs',
  hubTab: (tab: ApprovalTabKey): string => `approvals-hub-tab-${tab}`,
  hubTabCount: (tab: ApprovalTabKey): string => `approvals-hub-tab-${tab}-count`,
  /** One tab's section (`approvals-<tab>`). */
  tabSection: (tab: ApprovalTabKey): string => `approvals-${tab}`,
  /** Bulk buttons above the list (p-button hosts). */
  approveAll: (tab: ApprovalTabKey): string => `approvals-${tab}-approve-all-button`,
  rejectAll: (tab: ApprovalTabKey): string => `approvals-${tab}-reject-all-button`,
  /** Table rows `approvals-<tab>-table-row-<approvalId>`; cells `-cell-<key>`; actions `-review|-reject|-approve`. */
  rowPrefix: (tab: ApprovalTabKey): string => `approvals-${tab}-table-row-`,
  /** The Review drawer and its footer buttons. */
  reviewDrawer: (tab: ApprovalTabKey): string => `approvals-${tab}-review-drawer`,
  reviewDrawerTitle: (tab: ApprovalTabKey): string => `approvals-${tab}-review-drawer-title`,
  reviewDrawerBody: (tab: ApprovalTabKey): string => `approvals-${tab}-review-drawer-body`,
  reviewDrawerApprove: (tab: ApprovalTabKey): string => `approvals-${tab}-review-drawer-approve-button`,
  reviewDrawerReject: (tab: ApprovalTabKey): string => `approvals-${tab}-review-drawer-reject-button`,
  reviewDrawerClose: (tab: ApprovalTabKey): string => `approvals-${tab}-review-drawer-close-button`,
  /** The left menu entry of Approval Management (where a pending-count badge would sit). */
  navApprovals: 'app-nav-approval-management',
  navApprovalsLink: 'app-nav-approval-management-link',
  /** The Integration Portal menu entry (careconnect 2026-11-15: "Integration Portal" with an external-link icon). */
  navEnginePortalLink: 'app-nav-engine-portal-link',
  /** The Payer Mgmt menu entry (verified - writerDIds) and the Dashboard entry (CONVENTION `app-nav-<route>-link`). */
  navPayersLink: 'app-nav-payer-management-link',
  navDashboardLink: 'app-nav-dashboard-link',
  /** The top-bar payer scope select (same as GLOBAL.payerScopeSelect). */
  payerScopeSelect: 'app-breadcrumb-payer-select',
  /** The shared confirm dialog's "affected records" list and its items (`pbm-dialog-item-<change type>`). */
  dialogItems: 'pbm-dialog-items',
  dialogItemPrefix: 'pbm-dialog-item-',
  dialogRoot: 'pbm-dialog',
} as const;

/**
 * List screens of the payer-related modules: route + the list call the screen sends on load (matched on
 * the URL's last segment, so the module's own `X-Selected-Payer-Id` header rides along as the screen
 * sends it).
 */
export const PAYER_SCREENS = {
  payers: { route: '/payer-management', call: /\/api\/Payers\/GetPayers$/, label: 'Payer Management' },
  networks: { route: '/network-management', call: /\/api\/Networks\/GetNetworks$/, label: 'Network Management' },
  plans: { route: '/plans-management', call: /\/api\/Plans\/GetPlans$/, label: 'Plans Management' },
  policies: { route: '/policy-management', call: /\/api\/Policies\/GetPolicies$/, label: 'Policy Management' },
  formularies: { route: '/formulary-pricing', call: /\/api\/Formularies\/GetFormularies$/, label: 'Formulary Management' },
  members: { route: '/member-management', call: /\/api\/Members\/GetMembers$/, label: 'Member Management' },
  users: { route: '/users-management/users-administration', call: /\/api\/identity\/Users\/GetUsers$/, label: 'Users Administration' },
  invitations: { route: '/users-management/invitations', call: /\/api\/identity\/Invitations\/GetInvitations$/, label: 'Invitations' },
  dashboard: { route: '/dashboard', call: /\/api\/Dashboard\//, label: 'Dashboard' },
  enginePortal: { route: '/engine-portal', call: /\/api\/(Engine|IntegrationClients)\//, label: 'Integration Portal' },
} as const;
export type PayerScreenKey = keyof typeof PAYER_SCREENS;
