/**
 * US 21299 "Enforce Payer-Scoped Role Access" (role folder 15, 16 cases 22154-22169) - Writer F.
 *
 * WHO IS WHO. "The user" with a payer-scoped role is the role holder maalmohammad (`roleHolder`): it gets a
 * suite role ("QA Automation Role ...", Has Assigned Payers? ticked) holding the rights of the modules the
 * case reads (whole modules, see the *_MODULES constants) and EXACTLY the payers the case names; it signs in
 * fresh (no two-factor code - foundation 2026-11-14) and its original roles are put back at teardown.
 * "System Administrator" = careconnect (the suite's own session). Step 1 of every case ("Navigate to the Role
 * Management module") is done by careconnect: Role Administration lists the case's role and View Role shows
 * "Has Assigned Payers?" as the case needs it (lead decision 4/11 - the role is the precondition).
 *
 * PAYERS (decision 2 - example payers replaced). "Payer A / Payer B" are EXISTING suite payers
 * (`suitePayers.existing`, "Automation Payer ...", read only - only ever used as the holder's scope or as
 * a network's owner on a request that is rejected at teardown). Cases that need RECORDS of a payer in
 * several modules (plans, policies, formularies, members, dashboard figures) use DATA_PAYERS instead -
 * payers that carry the suite's plans / policies / formularies (Plans / Policy / Formulary suites):
 * also read only, used as a scope only.
 *
 * LIST CHECKS. "Only X records are listed" = the list answer the SCREEN itself asked for while loading
 * (the call it sends, with its own `X-Selected-Payer-Id` header) AND the same list read whole through the
 * holder's session (500 rows): every record's payerId is one of the assigned payers. "The list is
 * displayed" = the screen stayed on its route and its list call answered 200.
 *
 * Decisions / open points (each in ONE constant below so the user can overrule):
 *  - 22155 ALL_PAYERS_NETWORKS_ARE_LINKED (assessment possibleFinding): a network with no owner ("All
 *    Payers") is visible to every user by design (Network module). The TC says "only Networks linked to
 *    Payer A" - the TC wins (decision 1): an owner-less network in the list FAILS the step (finding). Set
 *    true to count "All Payers" networks as linked.
 *  - 22156 "member balance" (assessment: screen not named): the Member Benefit Accumulator of a policy
 *    member (`/financial-benefits/accumulator/<policyMemberId>`, GetMemberAccumulator). Members are tied to
 *    a payer through their policies: member A = a live member of a policy of DATA_PAYERS[0], member B = one
 *    of a policy of another payer that is not also enrolled under A. "Not reachable" = the direct link
 *    shows no data of B and GetMember / GetMemberAccumulator through the holder are refused (DENIED).
 *  - 22159 dashboard (assessment: widgets/oracle not given): every /api/Dashboard/* call the holder's
 *    dashboard makes is replayed by careconnect with the top-bar payer set to A (`X-Selected-Payer-Id`);
 *    the holder's figures must equal careconnect's figures for A.
 *  - 22160 (PARTIAL): Authorizations / Rebate Accruals / API Clients are read through their list calls
 *    (ENGINE_API - paths follow the permission keys Engine.GetAuthorizations, Engine.GetRebateAccruals,
 *    IntegrationClients.GetIntegrationClients; the last two NOT verified live). A section is BLOCKED at run
 *    time when careconnect itself sees no records of two different payers there (no claims are posted in
 *    this environment, accruals come from a job) - decision 8.
 *  - 22161 "a module not covered" = the Integration Portal: no menu entry, its route does not show the
 *    portal (redirected / denied) and GetAuthorizations through the holder is refused.
 *  - 22162 / 22163 / 22165 the defaults: since 2026-09 a scoped session meets the "Select a Payer" gate at
 *    sign-in. The gate is answered with the default the AC names (SCOPE_LABEL) and the top-bar select is
 *    read afterwards; `lastSignIn.payerChosen` is recorded. "Sign out" (22165) = the user menu's Logout,
 *    then a fresh sign-in.
 *  - 22164 / 22166 / 22167 run as careconnect ("User has access to multiple payers"); the top-bar choice
 *    lives in the tab's session storage, so nothing is left behind.
 *  - 22168 "denied or not found" (assessment): GetPayer through the holder answers non-2xx (or no data) AND
 *    the detail page shows nothing of payer B.
 *  - 22169 (assessment question): a payer-scoped role with ZERO payers is given to the holder through
 *    UpdateUser; if the application refuses that assignment the case is BLOCKED by the fixture with the
 *    server's answer (the precondition cannot be built). Otherwise Payers / Plans / Members must be empty.
 *    Live 2026-11-15: refused - UpdateUser 400 "Role '<name>' requires at least one assigned payer." (an app
 *    rule that makes the precondition impossible; the TC's outcome "no records" is not contradicted) - BLOCKED.
 *  - 22154 / 22162 / 22168 OWN_PENDING_PAYERS_ARE_IN_SCOPE (triage 2026-11-15): the holder's payer list also
 *    holds "test time" (PAY-D-0643) - a payer the maalmohammad ACCOUNT itself created on 2026-11-11 (not the
 *    suite) that still waits for its first approval. The TC says only Payer A and Payer B are listed (decision
 *    1): false = it FAILS the step and the failure names it as the holder's own pending payer. Set true if the
 *    product owner rules that a user always sees the payers it submitted itself.
 *  - 22159 DASHBOARD_SESSION_FIELDS (triage 2026-11-15): GetDashboard answers session facts, not figures
 *    (`serverTimeUtc` changes on every call; `payerScopeLocked` / `allowedPayerIds` describe WHO asks - the holder
 *    locked to A, the administrator not). They are left out of the comparison; every other field must match.
 *  - 22160 / 22161 / 22166 the Integration Portal (triage 2026-11-15): since the 2026-11 build `/engine-portal`
 *    is a separate app with its OWN sign-in ("Sign in to the Integration Portal" - Partner account / PBM staff),
 *    for careconnect and the holder alike. The suite does not sign in there (its form was never probed), so
 *    "the portal is reached" = the PBM side menu offers the Integration Portal entry AND its route shows the
 *    portal (its sign-in or its landing page, PORTAL_TEXT); the sections are read through the holder's session.
 *    "Not covered" (22161) = no menu entry on the PBM screens AND GetAuthorizations refused.
 *  - 22158 "resend on a Payer B invitation via direct reference" = ResendInvitation through the holder's
 *    session on careconnect's invitation for payer B - must be refused (it would only e-mail an
 *    example.com address).
 */
export const CASES = {
  payersOnly: { azureId: '22154' },
  modulesScoped: { azureId: '22155' },
  membersScoped: { azureId: '22156' },
  approvalsScoped: { azureId: '22157' },
  usersInvitationsScoped: { azureId: '22158' },
  dashboardScoped: { azureId: '22159' },
  integrationPortalScoped: { azureId: '22160' },
  unscopedRole: { azureId: '22161' },
  defaultAllMyPayers: { azureId: '22162' },
  defaultAllPayers: { azureId: '22163' },
  singlePayerFilter: { azureId: '22164' },
  filterPersists: { azureId: '22165' },
  adminAllPayers: { azureId: '22166' },
  repeatedSwitching: { azureId: '22167' },
  directLinkDenied: { azureId: '22168' },
  zeroPayers: { azureId: '22169' },
} as const;

/** The top-bar payer select's two aggregate entries (AC: regular users / users with assigned payers). */
export const SCOPE_LABEL = { allPayers: 'All Payers', allMyPayers: 'All My Payers' } as const;

/** View Role labels read for step 1. */
export const VIEW_LABEL = { hasAssignedPayers: /Has Assigned Payers/i } as const;
export const YES_NO = { yes: 'Yes', no: 'No' } as const;

/** Payers that carry suite plans / policies / formularies / members (Plans, Policy and Formulary suites) - scope only, read only. */
export const DATA_PAYERS = ['Al sharq', 'NUPCO'] as const;

/** Rights of the holder's role per case (whole modules; the permission catalogue keys). */
export const PAYERS_MODULES = ['Payers'] as const;
export const RECORD_MODULES = ['Payers', 'Networks', 'Plans', 'Policies', 'Formularies'] as const;
export const MEMBER_MODULES = ['Members', 'MemberAccumulators', 'Policies'] as const;
export const USER_MODULES = ['Users', 'Invitations'] as const;
export const DASHBOARD_MODULES = ['Dashboard'] as const;
export const PORTAL_MODULES = ['Engine', 'IntegrationClients'] as const;
/** 22161: "permissions limited to Payers, Plans only" (TC test data). */
export const UNSCOPED_MODULES = ['Payers', 'Plans'] as const;
/** 22169: Payers, Plans and Members. */
export const ZERO_PAYER_MODULES = ['Payers', 'Plans', 'Members'] as const;
/** 22157: the Network tab of Approval Management + the general view rights. */
export const APPROVAL_VIEW_RIGHTS = ['ApprovalManagement.Network', 'Approvals.GetApprovals', 'Approvals.GetApprovalDetail'] as const;
/** 22165: the regular (not payer-scoped) holder - its own predefined role, not scoped. */
export const REGULAR_ROLE = 'Organization Administrator' as const;
/** 22158: the role the suite users / invitations of payer A and B hold. */
export const SCOPED_USER_ROLE = 'Payer Officer' as const;

/** See the header: false = an owner-less ("All Payers") network in a Payer-A-scoped list fails the step. */
export const ALL_PAYERS_NETWORKS_ARE_LINKED = false;

/** See the header: false = a payer the holder submitted itself (pending its first approval) in its list fails the step. */
export const OWN_PENDING_PAYERS_ARE_IN_SCOPE = false;

/** See the header (22159): GetDashboard fields that describe the session, not figures. */
export const DASHBOARD_SESSION_FIELDS = ['serverTimeUtc', 'payerScopeLocked', 'allowedPayerIds'] as const;

/** See the header: what the Integration Portal's route shows (its own sign-in, or its landing page). */
export const PORTAL_TEXT = /Integration Portal/i;

/** Integration Portal list calls (22160 / 22161 / 22166). */
export const ENGINE_API = {
  authorizations: '/api/Engine/GetAuthorizations',
  rebateAccruals: '/api/Engine/GetRebateAccruals',
  apiClients: '/api/IntegrationClients/GetIntegrationClients',
} as const;
export const ENGINE_SECTIONS = ['authorizations', 'rebateAccruals', 'apiClients'] as const;

/** What counts as "refused / not found" for a direct read through a session. */
export const isDenied = (a: { status: number; text: string }): boolean => a.status >= 400 || a.status === 204 || /"payload"\s*:\s*null/.test(a.text);

/** Routes of single records (direct links). */
export const DETAIL_ROUTE = {
  payer: (id: string): string => `/payer-management/${id}`,
  accumulator: (policyMemberId: string): string => `/financial-benefits/accumulator/${policyMemberId}`,
} as const;

/** 22167: how many quick switches per module before the answer that is checked. */
export const QUICK_SWITCHES = 2;
/** 22167: the modules the payer filter is switched on (the TC: Payers, Plans, Policies, Members). */
export const SWITCH_MODULES = ['payers', 'plans', 'policies', 'members'] as const;
/** 22166: the modules whose records of two different payers are opened by careconnect. */
export const ADMIN_MODULES = ['payers', 'networks', 'plans', 'members'] as const;
