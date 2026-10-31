import { ALL_TERMINOLOGY_PERMISSIONS, TERMINOLOGY_VIEW_ONLY, terminologyShape } from '../accounts/payerAdminRole.data';
import type { TerminologyBlockedCase } from './terminology.data';

/**
 * US 15163 "Control Access to Terminology Functions by Permission"
 * (terminology folder 17).
 *
 * The permission matrix is built on the Payer Admin account (it holds no
 * terminology right by default) by granting: View = the read leaves, Edit =
 * View + UpdateTerminology, Delete = View + DeleteTerminology. The default
 * Administrator is the `careconnect` account. There is no Compliance Officer
 * role in this environment.
 */

export const VIEW = TERMINOLOGY_VIEW_ONLY;
export const VIEW_EDIT = terminologyShape(['updateTerminology']);
export const VIEW_DELETE = terminologyShape(['deleteTerminology']);

/** The Administrator's matrix entry: View, Edit, Delete, Audit History. */
export const ADMIN_MATRIX = { list: ['view', 'edit', 'delete'] as const, detail: ['edit', 'delete'] as const };

export const CASES = {
  viewOnly: { azureId: '20246', granted: VIEW },
  viewOnlyEdit: { azureId: '20247', granted: VIEW, change: 'Edited by a view-only user' },
  editAllowed: { azureId: '20248', granted: VIEW_EDIT, change: 'Edited by a user with edit permission' },
  noAccess: { azureId: '20249', withdrawn: ALL_TERMINOLOGY_PERMISSIONS },
  deleteAllowed: { azureId: '20250', granted: VIEW_DELETE },
  editNotDelete: { azureId: '20251', granted: VIEW_EDIT },
  adminMatrix: { azureId: '20252' },
  payerIndependent: { azureId: '20253', granted: VIEW },
  minimal: { azureId: '20255', granted: VIEW },
  revoked: { azureId: '20256', granted: VIEW_EDIT, withdrawn: ['updateTerminology'] as const },
  bypass: { azureId: '20258', granted: VIEW, change: 'Replayed edit' },
  exploratory: { azureId: '20257', change: 'Exploratory change' },
} as const;

export const BLOCKED_CASES: TerminologyBlockedCase[] = [
  {
    azureId: '20254',
    title: 'should offer exactly View and Audit History when the user holds the default Compliance Officer role',
    reason:
      'Needs a user assigned the default "Compliance Officer" role of the indicative role matrix. No such role exists '
      + 'in this environment (Role Administration lists Admin and Payer Admin roles only), and the Audit History '
      + 'permission of the Terminologies section cannot be granted on its own (its label is shared by every '
      + 'section). Runnable once the Compliance Officer role and an account holding it are provisioned.',
  },
];
