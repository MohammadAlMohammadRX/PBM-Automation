/**
 * US 21288 "Create Role" (role folder 09, 17 cases, 22077-22093) - Writer B.
 *
 * How the screen behaves (reports/role/Role-Foundation-Notes.md, 2026-11-14): Add Role opens `role-form-drawer`
 * "Add New Role" on step 1 "Role Information"; Next with empty required fields shows "This field is required."
 * under English name / Arabic name / Allowed To Assign By and NO toast; names maxlength 100, descriptions 250;
 * step 2 "Privileges" = banner with both names, search, Expand all / Collapse all, the tree; Save with nothing
 * ticked shows "Select at least one privilege."; success toast "Role created" / "The new role has been created
 * and is ready to be assigned."; duplicate English name -> 409 "Role name '<name>' is already taken.".
 *
 * SAFETY: every role saved through the screen carries the suite prefix ("QA Automation Role <stamp> ...") and is
 * caught by `suiteRoles.watch()` + teardown; nothing here touches a predefined or foreign role.
 *
 * Lead decisions applied (brief "Lead decisions"; ONE constant each, the user may overrule):
 * - (2) TC example values are examples: "Claims Auditor", "Support Agent", "Network Officer", "Finance Reviewer",
 *   "Draft Role", "Billing Officer" become the LABEL of a stamped suite name; the Arabic examples are kept as the
 *   stem of the Arabic name + an Arabic token (unique per run). "View Claims" -> the real leaf privilege
 *   `Roles.ExportRoles` (`SAMPLE_PRIVILEGE`); Allowed To Assign By "System Administrator" -> Organization
 *   Administrator (`ASSIGNER` - the System Administrator is not an option, the list offers listed roles only);
 *   "Payer A" -> the first existing suite payer.
 * - (1) TC over AC: 22086 expects "This field is required." when moving on from step 1 (the AC says on Save) -
 *   asserted at Next. 22088 expects a payer picker INSIDE Add Role (the AC says the payer is chosen when the role
 *   is assigned to a user) - asserted in the drawer (fails today: no picker; probe 2026-11-14).
 * - (3) Literal texts: 22079 / 22084 assert "Missing information - Please fill in all required fields before
 *   continuing." (the foundation saw only the field errors - finding); 22077 / 22085 the "Role created" toast;
 *   22078 "Role name '<name>' is already taken.". Where the TC quotes no text (22081, 22082, 22083, 22087, 22088,
 *   22089) the behaviour is asserted and the failure message carries what the screen showed.
 * - (10) 22080 "the Arabic-equivalent message": the duplicate Arabic name is entered with the UI switched to
 *   Arabic; no Arabic wording was ever captured, so the toast must name the duplicate Arabic name AND be worded
 *   in Arabic (`ARABIC_LETTERS`), the save refused and no second role made.
 * - 22089 (lead decision 2 / assessment): the "test user" is the role holder maalmohammad; the request it submits
 *   is a disposable network ("Automation Network ...", effective in two days, withdrawn after the test); the role
 *   made through Add Role holds the Networks, Approvals and Approval Management modules (so a hidden Approve proves
 *   the self-approval rule, not a missing right) with "Can a user approve their own requests?" left unticked.
 */
import { PREDEFINED_ROLES, ROLE_LIMITS, ROLE_MESSAGES } from './common.data';

export const STORY = { id: '21288', title: 'Create Role' } as const;

/** Replaces the TC's "System Administrator" in Allowed To Assign By (lead decision 2). */
export const ASSIGNER = PREDEFINED_ROLES.organizationAdministrator;

/** Replaces the TC's "View Claims" (lead decision 2): a LEAF privilege of the Roles module. */
export const SAMPLE_PRIVILEGE = 'Roles.ExportRoles';

/** Texts the cases (or the AC) quote. Dashes / whitespace are normalised before comparing (lead decision 3). */
export const QUOTES = {
  missingInformation: 'Missing information - Please fill in all required fields before continuing.',
  created: `${ROLE_MESSAGES.createdSummary} - ${ROLE_MESSAGES.createdDetail}`,
  fieldRequired: ROLE_MESSAGES.fieldRequired,
  selectAtLeastOnePrivilege: ROLE_MESSAGES.selectAtLeastOnePrivilege,
  nameTaken: ROLE_MESSAGES.nameTaken,
  unsavedTitle: ROLE_MESSAGES.unsavedTitle,
} as const;

/** Arabic letters - "worded in Arabic" (22080). */
export const ARABIC_LETTERS = /[؀-ۿ]/;

export const LIMITS = ROLE_LIMITS;

export const CASES = {
  createSuccess: {
    azureId: '22077',
    label: 'Claims Auditor',
    arabicStem: 'مدقق المطالبات',
    descriptionEn: 'Audits claims for the automation suite',
    descriptionAr: 'يراجع المطالبات',
  },
  duplicateEnglish: { azureId: '22078', label: 'Network Officer' },
  missingArabicName: { azureId: '22079', label: 'Finance Reviewer', arabicStem: 'مراجع مالي' },
  duplicateArabic: { azureId: '22080', arabicStem: 'ضابط الشبكة', label: 'Network Officer Arabic' },
  englishNameLength: { azureId: '22081', arabicStem: 'دور طويل' },
  arabicInEnglishName: { azureId: '22082', typed: 'مدير', arabicStem: 'دور لغة' },
  englishInArabicName: { azureId: '22083', typed: 'Manager', label: 'Language Rule' },
  bothNamesEmpty: { azureId: '22084', descriptionEn: 'Names left blank on purpose' },
  noDescriptions: { azureId: '22085', label: 'Support Agent', arabicStem: 'وكيل الدعم' },
  allowedToAssignByRequired: { azureId: '22086', label: 'Assigner Rule' },
  descriptionLength: { azureId: '22087', label: 'Description Rule' },
  hasAssignedPayers: { azureId: '22088', label: 'Payer Scoped' },
  selfApprovalDisabled: {
    azureId: '22089',
    label: 'Finance Reviewer Self Approval',
    arabicStem: 'مراجع الموافقات',
    /** Module headings ticked in the tree: submit a network + see / decide network approvals. */
    modules: ['Networks', 'Approvals', 'ApprovalManagement'],
    /** Rights the holder's session must hold so a missing Approve proves the self-approval rule. */
    approvalRights: ['ApprovalManagement.Network.ApproveReject', 'Approvals.ApproveRequest', 'Approvals.RejectRequest'],
  },
  noPrivilege: { azureId: '22090', label: 'No Privilege' },
  treeControls: {
    azureId: '22091',
    label: 'Tree Controls',
    keyword: 'Member',
    keywordPattern: /member/i,
  },
  wizardBackAndForth: {
    azureId: '22092',
    label: 'Draft Role',
    arabicStem: 'دور مسودة',
    descriptionEn: 'Draft role first pass',
    changedDescriptionEn: 'Draft role second pass',
    privileges: ['Roles.ExportRoles', 'Roles.CreateRole'],
  },
  banner: { azureId: '22093', label: 'Billing Officer', arabicStem: 'موظف الفواتير' },
} as const;
