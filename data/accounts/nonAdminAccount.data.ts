import { env } from '../../constants/EnvironmentConfig';

/**
 * The account configured as NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD.
 *
 * VERIFIED 2026-09-12 by signing in as it: a "Payer Admin" scoped to two
 * payers (Al Dawaa PAY-000017, NUPCO PAY-000002). It sees exactly those two on
 * the payer list while the register holds ~950; a direct link or API call to
 * any other payer answers 404 and the toast "Unable to load the requested
 * payer."; it is turned away from System Settings, Audit Logs and Role
 * Administration ("Access Restricted"); and its approvals hub carries the
 * Network, Policy, Formulary and Registrations tabs but no Payer tab.
 *
 * The role is DEFINED as: full control over its assigned payers (view, edit,
 * inactivate/activate, submit, assign networks, export, history, audit); NO
 * payer creation; NO payer deletion; NO approval rights. What the interface
 * OFFERS is a separate question - the Add Payer and Delete controls do render
 * for it - and that gap is precisely what the access-control cases report.
 *
 * `holds` records the DEFINITION, not the rendering, so a case that needs the
 * account to lack a right it holds is BLOCKED (its precondition is unmet)
 * rather than run against the wrong role and reported as a false failure.
 */
export type NonAdminRight =
  | 'createPayer'
  | 'deletePayer'
  | 'approvePayer'
  | 'systemSettings'
  | 'viewPayerList'
  | 'viewPayerDetails'
  | 'editPayer'
  | 'changePayerStatus'
  | 'sendForApproval'
  | 'exportPayers'
  | 'assignNetwork'
  | 'viewVersionHistory'
  | 'viewAuditHistory'
  | 'revertVersion'
  | 'advancedSearch'
  | 'networkLifecycle';

export const NON_ADMIN_PROFILE = {
  role: 'Payer Admin',
  /** The payers the account is assigned to, by English name and by code. */
  scopedPayers: ['Al Dawaa', 'NUPCO'],
  scopedPayerCodes: ['PAY-000017', 'PAY-000002'],
  holds: {
    createPayer: false,
    deletePayer: false,
    approvePayer: false,
    systemSettings: false,
    viewPayerList: true,
    viewPayerDetails: true,
    editPayer: true,
    changePayerStatus: true,
    sendForApproval: true,
    exportPayers: true,
    assignNetwork: true,
    viewVersionHistory: true,
    viewAuditHistory: true,
    revertVersion: true,
    advancedSearch: true,
    networkLifecycle: true,
  } as Readonly<Record<NonAdminRight, boolean>>,
} as const;

const RIGHT_LABEL: Readonly<Record<NonAdminRight, string>> = {
  createPayer: 'Create Payer',
  deletePayer: 'Delete Payer',
  approvePayer: 'Approval Management · Payer',
  systemSettings: 'System Settings',
  viewPayerList: 'View Payer List',
  viewPayerDetails: 'View Payer Details',
  editPayer: 'Edit Payer',
  changePayerStatus: 'Inactivate/Activate Payer',
  sendForApproval: 'Send for Approval',
  exportPayers: 'Export Payers',
  assignNetwork: 'Assign Network',
  viewVersionHistory: 'View Version History',
  viewAuditHistory: 'View Payer Audit History',
  revertVersion: 'Revert Version',
  advancedSearch: 'Advanced Search',
  networkLifecycle: 'Network Activate/Inactivate',
};

const NOT_CONFIGURED =
  'NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env, so a non-administrator '
  + 'session cannot be established.';

/** What a case needs of the non-admin account: rights it must LACK, rights it must HOLD. */
export interface NonAdminRequirement {
  lacking?: readonly NonAdminRight[];
  holding?: readonly NonAdminRight[];
}

const labels = (rights: readonly NonAdminRight[]): string => rights.map((right) => RIGHT_LABEL[right]).join(', ');

/**
 * Why the configured non-admin account cannot serve a case, or null when it can.
 *
 * Null means: the account is configured and its definition matches what the
 * case needs. Otherwise the returned text is the BLOCKED reason, naming the
 * role and the mismatch so the report says what account WOULD unblock it.
 */
export function nonAdminUnfit(requirement: NonAdminRequirement = {}): string | null {
  if (!env.nonAdminUsername || !env.nonAdminPassword) return NOT_CONFIGURED;
  const held = (requirement.lacking ?? []).filter((right) => NON_ADMIN_PROFILE.holds[right]);
  const missing = (requirement.holding ?? []).filter((right) => !NON_ADMIN_PROFILE.holds[right]);
  if (held.length === 0 && missing.length === 0) return null;

  const clauses: string[] = [];
  if (held.length > 0) {
    clauses.push(`HOLDS ${labels(held)}, so the refusal this case proves cannot be observed from it`);
  }
  if (missing.length > 0) {
    clauses.push(`LACKS ${labels(missing)}, which this case needs the account to exercise`);
  }
  const wanted = [
    held.length > 0 ? `without ${labels(held)}` : '',
    missing.length > 0 ? `holding ${labels(missing)}` : '',
  ].filter((part) => part !== '').join(' and ');
  return `The configured non-admin account (${NON_ADMIN_PROFILE.role}) ${clauses.join('; ')}. `
    + `Point NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD at an account ${wanted} and re-run.`;
}

/**
 * The BLOCKED reason for a data-driven case the configured account cannot
 * serve. Falls through to a loud instruction if the account DOES fit - which
 * means the case has been unblocked and should be automated, not listed.
 */
export const nonAdminBlockReason = (requirement: NonAdminRequirement): string =>
  nonAdminUnfit(requirement)
  ?? `The configured non-admin account (${NON_ADMIN_PROFILE.role}) now fits this case - move it out of BLOCKED_CASES and automate it.`;

/** Wording the application uses when it turns a session away from a screen. */
export const ACCESS_RESTRICTED = /access restricted|does not have permission/i;

/** The toast for a payer outside the session's scope - phrased as Not Found. */
export const OUT_OF_SCOPE_TOAST = /unable to load the requested payer/i;

/** Wording that would make the refusal a Forbidden rather than a Not Found. */
export const FORBIDDEN_WORDING = /forbidden|not authori[sz]ed|access denied|no permission/i;

/** The status the API answers for a payer outside the session's scope. */
export const OUT_OF_SCOPE_STATUS = 404;

/** The list renders "no payer" as a dash. */
export const NO_OWNER_CELL = /^[-—–]$/;
