import type { PolicyBlockedCase } from '../../constants/policy/writerAIds';
import { SUITE_POLICY_PREFIX, policyStamp } from '../../utils/PolicyProvisioning';

/**
 * US 18433 "Clone Policy" (policy folder 21).
 *
 * The detail's Clone opens the Clone Policy drawer (`policy-clone-drawer`, verified live
 * 2026-11-03): "Cloning a policy: This creates a NEW policy from "<source>" ...", the
 * name pre-filled "<source> (Clone)", "What to bring across" (members / networks /
 * documentation, ticked by default), then the period (blank dates) and Save (ClonePolicy).
 * The clone is a v0 Draft ("Not Live", "v0 · Draft") numbered POL-D-nnnn until its
 * approval gives it POL-YYYY-nnnn. The cases' "clone confirmation / preview" is that
 * drawer; "confirm" is Save with the period filled. Each clone is named by the case
 * (`QA Automation Policy Clone <stamp>`) and registered for teardown.
 *
 * TC vs TC: 19707 expects the clone to carry a TEMPORARY code until approval and a
 * permanent one after; 19708's step "details shown with no policy code" is read the same
 * way (no permanent POL-YYYY code yet) - a decision item, both cannot hold literally.
 *
 * The sources are the case's own policies: a published (Future) one with members (an
 * Individual policy - a Group takes members only once Active), its network and a document
 * with a PDF attached; a Draft for "unapproved"; a Rejected one without network, member or
 * documentation (20454). 19712's "Viewer" is the Payer Admin without ClonePolicy /
 * GetPolicyForClone, on a policy of NUPCO (one of its payers) so it can open it. 19716's
 * deleted source is a never-approved draft the case discards (a hard delete), then clones
 * by its stale id.
 */

/** A clone's name: `QA Automation Policy Clone <stamp>`. */
export const cloneName = (): string => `${SUITE_POLICY_PREFIX} Clone ${policyStamp()}`;

/** What the screen or server may say about a source that no longer exists. */
export const NOT_FOUND = /not found|does not exist|no longer exists|could not be found|unable to load|was deleted/i;

/** What the clone shows while unapproved (19706). */
export const UNAPPROVED = { status: 'Not Live', version: 'v0 · Draft' } as const;

export const CASES = {
  carryOver: { azureId: '19705', members: 2, documents: 1 },
  unapproved: { azureId: '19706' },
  codeOnApproval: { azureId: '19707' },
  uniqueCode: { azureId: '19708' },
  nonAdmin: { azureId: '19712' },
  zeroMembers: { azureId: '19713' },
  documentsCopied: { azureId: '19715', title: 'Automation Clone Terms', fileName: 'policy-terms.pdf' },
  deletedSource: { azureId: '19716' },
  unapprovedSource: { azureId: '19717' },
  rejectedSource: { azureId: '20454' },
} as const;

const NETWORK_STATES =
  'A network assignment turns Expired or Inactive only through the NETWORK: its own expiry (the network lifecycle job, '
  + 'once a day - a just-approved network stays Future for minutes and cannot be assigned) or an approved inactivation of '
  + 'the network. The only active networks of the suite payer "Al sharq" are shared (NET-001093 is not suite-owned; the '
  + 'suite network NET-001133 serves every policy case), so none may be inactivated, and an expired or inactive network '
  + 'cannot be assigned to a policy ("Only active networks can be assigned to a policy."). Runnable with a disposable '
  + 'Active network of the suite payer that the case may inactivate (or one seeded to expire), assigned to the source first.';

export const BLOCKED_CASES: PolicyBlockedCase[] = [
  {
    azureId: '19709',
    title: 'should leave an expired network assignment of the source out of the clone',
    reason: `Needs a source policy holding an EXPIRED network assignment. ${NETWORK_STATES}`,
  },
  {
    azureId: '19710',
    title: 'should leave an inactive network assignment of the source out of the clone',
    reason: `Needs a source policy holding an INACTIVE network assignment. ${NETWORK_STATES}`,
  },
  {
    azureId: '19711',
    title: 'should carry only the active network assignments of a source with active, expired and inactive ones into the clone',
    reason: `Needs a source policy with active, expired AND inactive network assignments at once. ${NETWORK_STATES}`,
  },
  {
    azureId: '19714',
    title: 'should create a valid clone with no network assignment when every assignment of the source is expired or inactive',
    reason: `Needs a source policy whose every network assignment is expired or inactive. ${NETWORK_STATES}`,
  },
];
