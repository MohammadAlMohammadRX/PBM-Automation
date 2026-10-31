import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { stamped } from './defineTerminology.data';

/**
 * US 15146 "Activate or Deactivate a Terminology" (terminology folder 04).
 *
 * Deactivation opens a drawer with a reason; activation is a plain
 * confirmation; both take effect at once with no approval (verified
 * 2026-10-29). The sheet's named terminologies (ICD-10, SNOMED, LOINC, RxNorm,
 * HCPCS, CPT ...) are provisioned under those names, stamped per run. "The
 * dependent module" is the Mapping Identifier picker (see terminology.data.ts),
 * and "in use by the Prescription module" is a mapping from another
 * terminology - the one dependency this environment can create.
 */

export const CASES = {
  activate: { azureId: '20089', name: () => stamped('ICD-10 Diagnosis Codes') },
  deactivate: { azureId: '20090', name: () => stamped('SNOMED CT Clinical Terms') },
  noApproval: { azureId: '20091', name: () => stamped('LOINC Lab Codes'), pending: /pending|approval/i },
  deactivateInUse: { azureId: '20092', name: () => stamped('RxNorm Medication Codes'), inUse: /in use/i },
  activateInUse: { azureId: '20093', name: () => stamped('RxNorm Medication Codes') },
  onlyActiveOffered: { azureId: '20094' },
  inactiveExcluded: { azureId: '20095', name: () => stamped('Deprecated Local Codes') },
  noPermission: { azureId: '20096', granted: TERMINOLOGY_VIEW_ONLY },
  toggleBack: { azureId: '20097', name: () => stamped('HCPCS Procedure Codes') },
  stale: { azureId: '20098' },
  checklist: {
    azureId: '20099',
    deactivateTitle: /deactivate/i,
    activateTitle: /activate/i,
    confirmLabel: /^(deactivate|activate|confirm|yes)$/i,
    cancelLabel: /^(cancel|no)$/i,
  },
  exploratory: { azureId: '20100', name: () => stamped('CPT Procedure Codes'), sequence: ['Inactive', 'Active', 'Inactive', 'Active'] as const },
} as const;
