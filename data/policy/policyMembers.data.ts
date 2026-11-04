import type { PolicyBlockedCase } from '../../utils/policy/writerCHelpers';
import { fullAccessWithout } from './policyPermissionCases.data';

/**
 * US 15178 "View Policy - Members" (policy folder 11).
 *
 * The tab (live 2026-11-03): "Members n / limit", Export, Import, Add Member
 * (drawer: member picker by name or document id from 2 characters + the
 * relationship Spouse / Child / Parent / Other), the search box with its
 * advanced search (Member Number, Name, Document ID, Relationship) and the
 * table Member Number, Name, Relationship, Document ID, State, Actions (View
 * Accumulator, Remove). A GROUP policy takes members only once Active, so the
 * cases work on INDIVIDUAL policies (members in any state); the one case that
 * needs an Active policy (19564 S3) claims a seed.
 *
 * Literal readings and disagreements:
 * - 19559 / 19568 / 19575 expect "Status" and "Approval Status" columns: the
 *   table has one "State" column - asserted as the case words it.
 * - 19561 (TC vs AC): the case expects an enrolled member NOT to be selectable
 *   again; the AC allows duplicate members. The case is asserted (the picker
 *   lists enrolled members; the server answers 409 "already enrolled").
 * - 19562 / 19563 / 19564 (TC vs AC): the cases block enrolment on Expired and
 *   Inactive policies (AC: "Allow member enrolment while all policy status",
 *   and also "Block assignment changes on expired or Inactivate policies").
 *   The cases are asserted. Expired is not reachable on demand - an existing
 *   Expired policy with members is looked at READ-ONLY (availability only).
 * - 19571: the Benefit Period select lists PERIODS ("dd/mm/yyyy – dd/mm/yyyy");
 *   the member is enrolled on policy A and B (same payer, different expiry
 *   dates) and C (another payer, its own expiry), and the options are matched
 *   on each policy's end date.
 * - 19574: "Payer A / Payer B" = "Al sharq" and the Payer Admin's NUPCO.
 * - 19575: "the approving reviewer" = the administrator; S4 reads the hub's
 *   Review panel for the members (the AC "Show enrolled members to the
 *   approving reviewer").
 * - 19577: "a user without member-management permission" = the Payer Admin with
 *   AddPolicyMember / RemovePolicyMember withheld; "the Insurance Coordinator"
 *   = the administrator. Its policy belongs to a payer in the Payer Admin's scope.
 */
export const CASES = {
  enrolByName: { azureId: '19559', relationship: 'Spouse' },
  enrolByDocumentId: { azureId: '19560', relationship: 'Child' },
  noDuplicate: { azureId: '19561' },
  expiredReadOnly: { azureId: '19562', message: /expired/i },
  inactiveReadOnly: { azureId: '19563', message: /inactive/i },
  enrolAnyStatus: { azureId: '19564', relationship: 'Spouse' },
  relationships: { azureId: '19565', options: ['Spouse', 'Child', 'Parent', 'Other'], first: 'Parent', second: 'Other' },
  eachFilter: { azureId: '19566', members: 3, extraRelationship: 'Child' },
  combinedFilters: { azureId: '19567', members: 2, extraRelationship: 'Child' },
  columns: { azureId: '19568', headers: ['Member Number', 'Document ID', 'Name', 'Relationship', 'Status', 'Approval Status'] },
  removeFromDraft: { azureId: '19569' },
  periodSamePayer: { azureId: '19571', expiryA: 60, expiryB: 90, expiryC: 75, otherPayer: 'NUPCO' },
  noSublimitsConsumed: { azureId: '19573' },
  anyPayer: { azureId: '19574', otherPayer: 'NUPCO' },
  reviewerSeesMembers: { azureId: '19575', members: 2 },
  authorizedOnly: { azureId: '19577', shape: fullAccessWithout('addMember', 'removeMember') },
} as const;

/** The section title the accumulator's sublimits live under. */
export const SUBLIMITS_SECTION = 'Sublimits and trade sub-caps';

export const BLOCKED_CASES: PolicyBlockedCase[] = [
  {
    azureId: '19570',
    title: 'should open the member benefit accumulator with complete, correctly structured benefit data',
    reason:
      'Needs an enrolled member WITH ACCUMULATOR DATA (deductible / out-of-pocket / sublimit amounts consumed by processed '
      + 'claims) so the Individual, Policy-Level Benefit and Sublimit sections render "with values". The environment has no '
      + 'claims processing the suite can drive, so no member accrues usage. Runnable once a claims simulator or seeded '
      + 'member utilisation is available.',
  },
  {
    azureId: '19572',
    title: 'should show sublimit consumption and hide the empty-state message once a payer-paid amount exists',
    reason:
      'Needs a member with a PAYER-PAID amount (SAR 500) recorded against a sublimit. Amounts are recorded only by claims '
      + 'adjudication, which the test environment does not expose to the suite. Runnable once member utilisation can be '
      + 'seeded (claims simulator).',
  },
  {
    azureId: '19576',
    title: 'should render accumulator values correctly across periods for zero, very large and boundary amounts',
    reason:
      'Needs a member with a "varied and large accumulator transaction history" (zero, very large and boundary amounts '
      + 'across several benefit periods). Utilisation comes only from processed claims, which the suite cannot produce. '
      + 'Runnable once member utilisation can be seeded.',
  },
];
