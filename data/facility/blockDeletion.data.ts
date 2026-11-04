import { fullAccessWithout } from './facilityPermissions.data';
import type { FacilityBlockedCase } from '../../utils/facility/writerCHelpers';

/**
 * US 15141 "Block deletion a facility" (facility folder 09).
 *
 * How deletion works in this build (Facility-Foundation-Notes.md, "Delete"):
 * Delete (row / card / detail) -> `#pbm-dialog` "Delete Facility / Do you want
 * to delete {name}?" (No = `cancel`, Yes = `confirm`, the X closes it). Yes ->
 * DELETE DeleteFacility/{id} -> toast "Facility deleted / The facility has been
 * deleted." A SOFT delete: gone from the list, GetFacility 404, name and e-mail
 * free again. Refused with 409 while the facility is in a network ("This
 * facility cannot be deleted because it is assigned to one or more networks.
 * Remove it from those networks first.") or a draft / pending network version.
 * No approval workflow.
 *
 * Literal readings:
 * - "OK" in 17612 / 17620 is the dialog's affirmative button ("Yes").
 * - 17612 "permanently removed": the delete is soft - the case is asserted as
 *   the user sees it: gone from the list and no longer openable (GetFacility 404).
 * - 17615 "linked to a network or notification configuration": the network
 *   membership is the dependency the suite can produce - the long-lived anchor
 *   "QA Automation Facility Network Anchor" in its own approved network (writers
 *   brief: every fresh facility+network pair is a permanent leftover). No
 *   notification configuration exists for facilities.
 * - 17616 "a role that lacks facility deletion permission": the Payer Admin role
 *   shaped with every Facilities right but DeleteFacility (`facilityRole`).
 * - 17618: Esc first, then (a second opening) the X - both are named by the case.
 * - 17619 "every facility record shown in the list": every row of the list's
 *   first page plus the suite's own Active and Inactive facilities.
 */
export const CASES = {
  confirmPrompt: { azureId: '17611' },
  deleteUnlinked: { azureId: '17612' },
  declineKeeps: { azureId: '17613' },
  networkDependency: { azureId: '17615' },
  noDeletePermission: { azureId: '17616', shape: fullAccessWithout('delete') },
  dismissDialog: { azureId: '17618' },
  deleteOnEveryRow: { azureId: '17619' },
  othersUnaffected: { azureId: '17620', labelA: 'Delete A', labelB: 'Delete B' },
} as const;

/** The confirmation's title ("Delete Facility") and message ("Do you want to delete {name}?"). */
export const DELETE_PROMPT = { title: /delete/i, message: /delete/i };

/** The success toast ("Facility deleted / The facility has been deleted."). */
export const DELETED_TOAST = /deleted/i;

/** The dependency refusal - it names the network membership. */
export const NETWORK_BLOCK = /cannot be deleted because .*network/i;

export const BLOCKED_CASES: FacilityBlockedCase[] = [
  {
    azureId: '17614',
    title: 'should refuse to delete a facility that has an existing transaction and keep the record',
    reason:
      'Needs a facility with at least one linked TRANSACTION (claim / authorization recorded against it). The test environment has '
      + 'no claims or transaction feed the suite can drive and no facility carries transactions, so the "cannot be deleted while it '
      + 'has transactions" rule cannot be exercised (Facility-Build-Brief: 17614 BLOCKED).',
  },
  {
    azureId: '17617',
    title: 'should still protect a facility with exactly one linked transaction from deletion',
    reason:
      'Needs a facility with EXACTLY ONE linked transaction (the boundary of the transaction rule). The environment has no claims or '
      + 'transaction data the suite can create, so the boundary cannot be built (Facility-Build-Brief: 17617 BLOCKED).',
  },
];
