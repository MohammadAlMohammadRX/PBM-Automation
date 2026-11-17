import { PREDEFINED_ROLES } from './common.data';

/**
 * US 21284 - Restrict Who Can Assign Each Role (folder 05, writer E, 14 cases).
 *
 * WHO IS WHO (brief "Accounts"): the System Administrator of the cases = careconnect (the suite's admin `page`,
 * role "Admin", never listed). Every other account ("sign in as Organization Administrator / Payer Administrator /
 * Payer Officer", "a user holding role X") is the ONE role holder maalmohammad, given exactly that role by
 * `roleHolder.become()` one after another (never two at the same time) and restored at teardown.
 *
 * HOW A DROP-DOWN IS READ
 *  - "the role dropdown on the Add User form" = Users Administration > Add User, steps 1 and 2 filled with a valid
 *    suite user (never saved, Discard Changes), step 3 "Add New User Roles" -> the Role select's options.
 *  - "the role dropdown on the Invitation form" = Invitations > Add Invitation > Role Name options.
 *  - The EXPECTED set is computed live (assessment): every ACTIVE listed role whose "Allowed To Assign By"
 *    (GetRole assignableRoleIds) names one of the holder's roles - other teams' roles naming the predefined roles
 *    count too. For the System Administrator: every active listed role (GetRoles).
 *
 * LEAD DEFAULTS APPLIED (decision -> case)
 *  - 2, TC example values: "Claims Auditor" (22028), "Reviewer Plus" (22033) and the unnamed custom roles become
 *    suite roles "QA Automation Role <stamp> <label>"; Payer X / Payer Y become two EXISTING suite payers
 *    (suitePayers.existing - used only as a scope, never edited).
 *  - 1, TC over AC: 22037's title says "across the system" while its step names only the User form - the step
 *    asserts the User form AND the Invitation form (the title and the AC both name the invitation form).
 *  - 3, literal texts: the predefined role names are asserted exactly as the cases quote them.
 *  - 8: nothing in this folder needs data the run cannot produce; no step is BLOCKED by design.
 *  - 22041 (needs details): "a custom role with additional Allowed To Assign By permissions" is read the way the
 *    product stores it - Allowed To Assign By sits on the TARGET role. The holder holds Organization
 *    Administrator + suite role H; suite role T names ONLY H. Expected = the union of what OA may assign and what
 *    H may assign (T included), no duplicates.
 *  - Roles assignable by Payer Administrator are made payer-scoped ("Has Assigned Payers?" ticked) so a Payer
 *    Administrator assigns them inside its own payers (AC "limited to its own payers").
 */

const PA = PREDEFINED_ROLES.payerAdministrator.en;
const OA = PREDEFINED_ROLES.organizationAdministrator.en;
const PO = PREDEFINED_ROLES.payerOfficer.en;

/** The predefined role names, as the cases quote them. */
export const ROLE_NAMES = { organizationAdministrator: OA, payerAdministrator: PA, payerOfficer: PO } as const;

/** Rights every suite role of this folder carries (the folder is about who may ASSIGN it, not what it allows). */
export const SUITE_ROLE_RIGHTS = ['Roles.GetRoles'] as const;

/** The right the holder needs to create a user at all - the 22036 refusal is only meaningful when it is held. */
export const CREATE_USER_RIGHT = 'Users.CreateUser';

/**
 * 22036 sends CreateUser from the Payer Administrator's own session with the Organization Administrator role.
 * The target is a NEW SUITE user (QA Automation User..., qa.automation.*@example.com) - not a predefined role, not
 * the System Administrator account - so the attempt is allowed. If the server wrongly accepts it, the user is
 * adopted and deleted at teardown. Switch to `allowed: false` to block the step instead.
 */
export const DIRECT_CREATE_GATE = {
  allowed: true,
  reason: 'the direct CreateUser attempt (a new suite user given the Organization Administrator role) is switched off in data/role/restrictWhoCanAssignEachRole.data.ts',
} as const;

/** The reason the Deactivate drawer is given in 22037 (no Details needed). */
export const DEACTIVATION_REASON = 'No Longer Required';

export const CASES = {
  createWithPayerAdministrator: {
    azureId: '22028',
    /** TC "Claims Auditor" -> suite role label. */
    label: 'claims auditor',
    allowedToAssignBy: [PA],
  },
  organizationAdministratorRole: { azureId: '22029', roleUnderTest: OA },
  payerOfficerRole: { azureId: '22030', roleUnderTest: PO },
  payerAdministratorRole: { azureId: '22031', roleUnderTest: PA },
  systemAdministratorSeesAll: { azureId: '22032', labels: ['custom one', 'custom two'] },
  organizationAdministratorExactSet: {
    azureId: '22033',
    /** TC "Reviewer Plus" -> suite role naming OA; a second suite role naming only PA proves the exclusion. */
    namingLabel: 'reviewer plus',
    notNamingLabel: 'not for oa',
    namingAllowedBy: [OA],
    notNamingAllowedBy: [PA],
  },
  payerAdministratorOwnPayers: { azureId: '22034', label: 'pa scoped', allowedToAssignBy: [PA] },
  payerOfficerNoAccess: { azureId: '22035' },
  directRequestRefused: { azureId: '22036', unauthorizedRole: OA },
  deactivatedRoleHidden: { azureId: '22037', label: 'to deactivate', allowedToAssignBy: [OA] },
  exactlyOneAssigner: { azureId: '22038', label: 'one assigner', allowedToAssignBy: [PA], otherHolderRole: OA },
  invitationMatchesUserForm: { azureId: '22039' },
  payerAdministratorCreatesPayerOfficer: { azureId: '22040', roleToAssign: PO },
  multiRoleUnion: {
    azureId: '22041',
    /** H - held by the holder next to Organization Administrator. */
    heldLabel: 'held h',
    /** T - names ONLY H in Allowed To Assign By. */
    targetLabel: 'target t',
  },
} as const;
