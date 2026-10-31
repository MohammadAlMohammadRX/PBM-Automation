import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { stamped } from './defineTerminology.data';
import { textOfLength } from '../../utils/TerminologyProvisioning';

/**
 * US 15159 "Mark a Terminology as Externally Subscribed" (terminology folder 13).
 *
 * The Edit drawer's Subscribed checkbox reveals a required "Subscription
 * Reference" input (verified 2026-10-29: maxlength 200, "This field is
 * required."). The sheet's 255-character limit is kept as the expectation.
 * The catalogue view is the Cards view, whose cards show "Subscribed Yes/No".
 */

export const REFERENCE_MAX = 255;

export const CASES = {
  markSubscribed: { azureId: '20196', name: () => stamped('ICD-10 Diagnosis Codes'), reference: 'WHO-ICD10-2026' },
  referenceRequired: { azureId: '20197', required: /required/i },
  referenceLength: { azureId: '20198', atMax: () => textOfLength(REFERENCE_MAX, 'REF-'), overMax: () => textOfLength(REFERENCE_MAX + 1, 'REF-') },
  decisionTable: {
    azureId: '20199',
    valid: 'SRC-REF-VALID',
    ignored: 'SRC-REF-IGNORED',
  },
  toggle: { azureId: '20200', first: 'SRC-REF-001', second: 'SRC-REF-002' },
  catalogue: { azureId: '20201', subscribed: () => stamped('SNOMED CT'), reference: 'IHTSDO-2026', plain: () => stamped('Internal Codes'), yes: /^yes$/i, no: /^no$/i },
  noPermission: { azureId: '20202', granted: TERMINOLOGY_VIEW_ONLY, reference: 'NO-PERM-REF' },
  malicious: { azureId: '20203', reference: "<script>alert(1)</script>'; DROP TABLE Terminology;--" },
  rapidToggles: { azureId: '20204', references: ['REF-A', 'REF-B', 'REF-C'] },
  audit: { azureId: '20205', reference: 'AUDIT-REF-01', actor: /careconnect/i },
  whitespace: { azureId: '20206', blank: '   ', valid: 'LOINC-2026-v3' },
  immediate: { azureId: '20207', reference: 'INTEGRATION-REF-01' },
} as const;
