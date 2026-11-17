import type { HolderModule } from '../../constants/role/writerDIds';

/**
 * US 21286 "Predefined Role Module Access" (Role Management folder 07, 13 cases 22054-22066; Writer D).
 *
 * WHO. Every "sign in as a user holding <predefined role>" is maalmohammad through `roleHolder` - ONE holder at a
 * time: Organization Administrator (its own role), or Payer Administrator / Payer Officer with payers. The fixture
 * restores Organization Administrator and reads it back at teardown. 22063 signs the holder in three times (one per
 * role, as the TC's three steps). 22065 runs as careconnect on suite users (no sign-in).
 *
 * PAYERS ("Payer A / B / C"). Lead decision 2 replaces them:
 *  - cases that WRITE under the payer (22055 users, 22058, 22065) use EXISTING ACTIVE SUITE PAYERS
 *    (`suitePayers.existing`, "Automation Payer ...") - only as a scope, never edited;
 *  - cases that need the payer to OWN records in Networks / Plans / Policies / Formularies / Members (22056, 22059,
 *    22061, 22062, 22063, 22066) use the active payer that owns records in the most of those modules
 *    (`scopeDataFor`, suite payers first on a tie). The policy / formulary records of the earlier modules were made
 *    under colleagues' payers (Al sharq, NUPCO), so such a payer may be chosen: it is still only READ (the holder
 *    opens its records; nothing is saved). "Payer B" records = one record of any other payer per module.
 *  - "Member-500", "PA-100 / PB-200", "jdoe@test.com", "PayerAdmin_01" -> found / stamped suite values.
 *
 * LEAD DEFAULTS APPLIED:
 *  - Decision 11, "full access / full functionality" = the module's list renders with Add and Export offered
 *    (FULL_ACCESS). Row View / Edit are not asserted: their ids differ per module and some sit in row menus.
 *    The AC narrows Payer Officer on Network Mgmt to view + export (no Add) - PO_NETWORK_ACCESS (AC, the TC is silent).
 *  - Decision 1: where the AC and the TCs differ the TC wins (22061 "full access to Facility Management": the Payer
 *    Officer catalogue holds no Facilities right on 2026-11-14 - the step fails as the finding).
 *  - 22057 "Integration Portal" = the side menu's Integration Portal (`app-nav-engine-portal-link`, the API Clients /
 *    PBM Engine screens); careconnect sees it (baseline).
 *  - 22060 "welcome card": no text is quoted; the home page must read WELCOME_TEXT and receive no successful
 *    Dashboard API answer (no widgets / analytics loaded).
 *  - 22063 "editable": coverage order = the holder holds COVERAGE_EDIT_RIGHT and its COB tab is shown; benefit
 *    accumulator = the holder can read it (GetMemberAccumulator) and holds ACCUMULATOR_EDIT_RIGHT, the only write
 *    right on accumulators (the catalogue has no other "edit accumulator" right - the assessment's open question).
 *  - 22064 "manual reset": probed with a NON-EXISTENT policy id (RESET_PROBE_POLICY_ID), so nothing can be reset
 *    whatever the server decides; a refusal is 401 / 403, a 404 / 400 means the session WAS allowed to try (finding).
 *  - 22058 TC order "Activate then inactivate": the user is active once created, so it is inactivated and activated
 *    again (both directions exercised). The reassignment target is Payer Officer on a second suite payer the Payer
 *    Administrator also holds (a PA cannot assign a payer outside its scope).
 *  - 22058 / 22065 Add User through the screen; the holder's writes on the user after that are made AS THE HOLDER'S
 *    SESSION (API) after asserting the row action is offered on its screen - the server's answer is what proves the
 *    right. When the holder's Add is refused, careconnect makes the user so the later steps still run.
 */

export const CASES = {
  orgAdminEveryPayer: { azureId: '22054' },
  payerAdminScoped: { azureId: '22055' },
  payerOfficerScoped: { azureId: '22056' },
  orgAdminAllModules: { azureId: '22057' },
  payerAdminManagesUsers: { azureId: '22058' },
  payerAdminModules: { azureId: '22059' },
  payerOfficerWelcome: { azureId: '22060' },
  payerOfficerModules: { azureId: '22061' },
  payerOfficerNoAudit: { azureId: '22062' },
  memberAccessAllRoles: { azureId: '22063' },
  benefitResetsRefused: { azureId: '22064' },
  payerScopedNeedsPayer: { azureId: '22065' },
  noScopeBypass: { azureId: '22066' },
} as const;

/** What "full functionality" means on a list screen (decision 11). */
export interface ModuleExpectation {
  module: HolderModule;
  shown: boolean;
  add: boolean;
  export: boolean;
}
const full = (module: HolderModule): ModuleExpectation => ({ module, shown: true, add: true, export: true });

/** 22057: the eight business modules the Organization Administrator opens. */
export const ORG_ADMIN_MODULES: readonly HolderModule[] = ['users', 'invitations', 'networks', 'plans', 'policies', 'formularies', 'members', 'facilities'];
export const ORG_ADMIN_ACCESS: readonly ModuleExpectation[] = ORG_ADMIN_MODULES.map(full);

/** 22059: the Payer Administrator's eight modules (TC: "full functionality (add, edit, view)"). */
export const PAYER_ADMIN_MODULES: readonly HolderModule[] = ['users', 'invitations', 'networks', 'plans', 'policies', 'formularies', 'members', 'facilities'];
export const PAYER_ADMIN_ACCESS: readonly ModuleExpectation[] = PAYER_ADMIN_MODULES.map(full);

/** AC: "Payer Officer has view, export ... on Network Mgmt, without Add, Edit, Clone, Delete ...". */
export const PO_NETWORK_ACCESS: ModuleExpectation = { module: 'networks', shown: true, add: false, export: true };

/** 22061 / 22062: the Payer Officer's six modules; denied: Users, Invitations. */
export const PAYER_OFFICER_MODULES: readonly HolderModule[] = ['facilities', 'networks', 'plans', 'policies', 'formularies', 'members'];
export const PAYER_OFFICER_ACCESS: readonly ModuleExpectation[] = PAYER_OFFICER_MODULES.map((m) => (m === 'networks' ? PO_NETWORK_ACCESS : full(m)));
export const PAYER_OFFICER_DENIED: readonly HolderModule[] = ['users', 'invitations'];

/** Modules whose records a payer-scoped holder must see only for its payer (22059 step 4). */
export const PAYER_SCOPED_LISTS: readonly HolderModule[] = ['users', 'invitations', 'networks', 'plans', 'policies', 'formularies', 'members'];

/** 22066: the screens probed with another payer's record id. */
export const BYPASS_MODULES: readonly HolderModule[] = ['users', 'networks', 'members'];

/** 22060: the home page's welcome card (no text quoted - decision 3: assert the behaviour). */
export const WELCOME_TEXT = /welcome/i;

/** 22063. */
export const COVERAGE_EDIT_RIGHT = 'Cob.ReorderMemberCoverage';
export const ACCUMULATOR_EDIT_RIGHT = 'MemberAccumulators.ResetPolicyBenefits';
/** 22063 "full data ... and editable" on one member: its view opens, the COB tab shows, both reads answer 200, both write rights held. */
export const FULL_MEMBER_ACCESS = { opened: true, coverageTab: true, coverageRead: 200, accumulatorRead: 200, coverageEditable: true, accumulatorEditable: true } as const;

/** 22064: a policy id no policy has - the reset probe can change nothing. */
export const RESET_PROBE_POLICY_ID = '00000000-0000-0000-0000-000000000000';
export const RESET_PROBE_REASON = 'Authorization probe by the automation suite (non-existent policy).';

/** 22058: the role the Payer Administrator gives the new user and re-assigns it to. */
export const PA_ASSIGNS_ROLE = 'Payer Officer';
/** 22058: the change made in Edit. */
export const EDITED_SECOND_NAME = 'Edited';

/** 22065: the role whose card needs payers; the TC quotes no message - the refusal must name a payer. */
export const PAYER_SCOPED_ROLE = 'Payer Administrator';
export const NEEDS_PAYER_TEXT = /payer/i;
