/**
 * US 20418 "Create Invitation" (user folder 12), 21 cases.
 *
 * How the cases map onto the live drawer (2026-11-08, User-Foundation-Notes.md):
 *  - Users Mgmt > Invitations > Add Invitation opens "Add New Invitation":
 *    Role Name (select), Payer (select, disabled + "Select" until a payer-scoped
 *    role is chosen), Email Address (+ button or Enter -> chips), Import Email
 *    from Excel (Browse Files; .xlsx / .xls / .csv with an "Email" column),
 *    Cancel / Save. Save sends one CreateInvitation per chip
 *    (`{ email, roleId, payerId, expiryDays: 5 }`).
 *  - Every role a case selects is a SUITE role ("QA Automation Role <stamp>",
 *    payer-scoped = "Has Assigned Payers?") and every address a SUITE address
 *    (`qa.automation.inv.<stamp>@example.com`, colleague@example.com in the
 *    cases' test data); each address is registered for teardown BEFORE Save, and
 *    teardown deletes every invitation to it. The payer is `PAYER` (the suite's
 *    scoped payer, decision 8).
 *  - Literal expectations that differ from the app today (findings, the cases
 *    fail): the confirmation reads "...is now active." (case / AC: "...is now
 *    active pending."); the e-mail box has no maxlength; the Role list offers
 *    the INACTIVE "role without payer" (20650 runs on a restricted suite
 *    account, see below); the duplicate / registered-user message is checked on
 *    screen as the case words it.
 *  - "Pending (قيد الانتظار)": the suite runs the English UI - the list shows
 *    "Pending"; the Arabic label is not checked.
 *  - 20640 / 20641 (257 / 256 characters): a valid-FORMAT suite address of
 *    exactly that length (64-character local part, labels of <= 63) - whether
 *    the app's own format rule allows 256 is what 20641 shows.
 *  - 20649 "already registered user": a suite user (Active) - its address is
 *    invited to a suite role; the case expects the duplicate message.
 *  - 20650 "administrator whose permissions allow assigning only a subset of
 *    roles" (decision 7): a suite account holding Invitations.GetInvitations /
 *    CreateInvitation whose suite role may assign ONE suite role (permitted)
 *    and not another (not permitted). An empty Role list = the account was not
 *    given its assignable role -> BLOCKED with the evidence.
 *  - 20651 "administrator associated with a specific set of payers"
 *    (decision 8): a payer-scoped suite session on `PAYER`, allowed to assign a
 *    payer-scoped suite role. Its GetAssignableRoles answered [] in the
 *    foundation probe: when the role is not offered, the steps that need it are
 *    BLOCKED with that evidence.
 *  - 20653 / 20654: registering through the invitation link and approving the
 *    registration are story 20422 (MANUAL) - the registration part is BLOCKED;
 *    20653's first step (the suite invitation listed Pending) is asserted.
 *  - 20656 exploratory: 5 addresses imported from a CSV, 2 typed (one a
 *    duplicate of an imported one), the role switched from payer-scoped to not.
 */
export const CASES = {
  payerScoped: { azureId: '20637' },
  notPayerScoped: { azureId: '20638' },
  severalEmails: { azureId: '20639' },
  emailTooLong: { azureId: '20640', length: 257 },
  emailAtMax: { azureId: '20641', length: 256 },
  importFile: { azureId: '20642', count: 3 },
  importNoEmailColumn: { azureId: '20643' },
  importUnreadable: { azureId: '20644' },
  roleRequired: { azureId: '20645' },
  emailRequired: { azureId: '20646' },
  invalidEmail: { azureId: '20647', email: 'colleague@' },
  duplicatePending: { azureId: '20648' },
  registeredUser: { azureId: '20649' },
  permittedRolesOnly: { azureId: '20650', rights: ['Invitations.GetInvitations', 'Invitations.CreateInvitation'] },
  // + the payer / role / lookup reads the drawer's Payer Name list needs (fix1 run 2026-11-08: without
  // Payers.GetPayersDropdown the scoped inviter's Payer list was EMPTY, not limited to its payer).
  ownPayersOnly: { azureId: '20651', rights: ['Invitations.GetInvitations', 'Invitations.CreateInvitation', 'Payers.GetPayersDropdown', 'Roles.GetRoles', 'Lookups.GetLookups'], otherPayer: 'Al Dawaa' },
  oneInvitationPerEmail: { azureId: '20652', count: 3 },
  pendingApprovalAfterRegistration: { azureId: '20653' },
  payerRequired: { azureId: '20655' },
  importTypedAndRoleSwitch: { azureId: '20656', imported: 5 },
  drawerChecklist: { azureId: '20657' },
} as const;

/** The suite's payer for payer-scoped invitations (decision 8). */
export const PAYER = 'Al sharq';

export const MESSAGE = {
  created: 'The invitation has been created and is now active pending.',
  required: 'This field is required.',
  invalidEmail: 'Enter a valid email address.',
  duplicate: 'An active invitation already exists for this email address and role.',
  imported: (n: number): string => `${n} email(s) added from the file.`,
  noEmailColumn: 'No email addresses were found in an "Email" column.',
  unreadable: 'Could not read the file. Please check the format and try again.',
} as const;

/** The drawer's labels (20657's checklist). */
export const DRAWER_LABELS = ['Add New Invitation', 'Role Name', 'Payer', 'Email Address', 'Import Email from Excel', 'Browse Files', 'Save'] as const;

/** Five days, in hours. */
export const VALIDITY_HOURS = 120;
/** The tolerance on it (creation and expiry are stamped together). */
export const VALIDITY_TOLERANCE_HOURS = 0.05;

/** Cases whose whole behaviour needs a resource the suite cannot produce - one BLOCKED test each. */
export const BLOCKED_CASES: ReadonlyArray<{ azureId: string; title: string; reason: string }> = [
  {
    azureId: '20654',
    title: 'should mark an invitation Approved when a reviewer approves the colleague\'s registration',
    reason: 'an invitation in Pending Approval (a registration completed through the invitation link) - registering via an invitation is story 20422, '
      + 'MANUAL (user, 2026-11-08), so no suite invitation can reach Pending Approval and no registration can be approved; other teams\' records are never used',
  },
];

/** 20653's registration step. */
export const REGISTRATION_BLOCKED = 'completing the registration through the invitation link - story 20422 "Register via Invitation Link" is MANUAL (user, 2026-11-08); '
  + 'the invitation token is only in the e-mail log and the registration is not automated';
