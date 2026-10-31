import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { CODE_FIELD, IS_ACTIVE_FIELD } from './terminology.data';
import { stamped } from './defineTerminology.data';
import type { TerminologyFieldSpec } from '../../utils/TerminologyProvisioning';

/**
 * US 15151 "Retire Values Using the Automatic Active Field" (terminology folder 03).
 *
 * A value's Is Active is the record drawer's checkbox; the Data tab shows it as
 * "Yes" / "No". The screen that consumes a terminology's ACTIVE values is a
 * mapping field's record drawer in another terminology (GetMappedFieldValues):
 * the parent terminology's values are offered there.
 */

/** How the Data tab shows Is Active. */
export const IS_ACTIVE_SHOWN = { active: /^(yes|true)$/i, inactive: /^(no|false)$/i } as const;

/** A child terminology's mapping field onto a parent's Code. */
export const mappingTo = (terminologyId: string, fieldId: string, name = 'Parent'): TerminologyFieldSpec => ({
  name,
  type: 'mappingIdentifier',
  restriction: 'single',
  mapsTo: { terminologyId, fieldId },
});

/** Field mixes for the consistency case (Text, Number, Date, List-free, Mapping added at run time). */
export const FIELD_MIXES: TerminologyFieldSpec[][] = [
  [CODE_FIELD],
  [CODE_FIELD, { name: 'Weight', type: 'number' }, { name: 'Effective Date', type: 'date', restriction: 'dateOnly' }],
  [CODE_FIELD, { name: 'Flag', type: 'boolean' }, { name: 'Notes', type: 'text', restriction: 'englishOnly', maxLength: 100 }],
];

export const CASES = {
  automatic: { azureId: '20080', name: () => stamped('Claim Status'), description: 'Statuses applicable to claim processing', field: 'Status Code' },
  reserved: { azureId: '20081', name: () => stamped('Reserved Name'), description: 'Reserved field name check.', field: IS_ACTIVE_FIELD },
  deactivate: { azureId: '20082', code: 'ACTIVE-VALUE-1' },
  reactivate: { azureId: '20083', code: 'RETIRED-VALUE-1' },
  notOffered: { azureId: '20084', active: 'OFFERED-1', retired: 'RETIRED-1' },
  isActiveNotDeletable: { azureId: '20088' },
  consistent: { azureId: '20087', type: /^Boolean$/i },
  referenced: { azureId: '20086', parentCode: 'REF-PARENT-1', childCode: 'REF-CHILD-1' },
  noPermission: { azureId: '20085', granted: TERMINOLOGY_VIEW_ONLY, code: 'NOPERM-1' },
} as const;
