import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { FIELD_TYPE } from './terminology.data';
import type { TerminologyFieldControl } from '../../constants/ElementIds';
import type { TerminologyFieldSpec } from '../../utils/TerminologyProvisioning';
import { textOfLength } from '../../utils/TerminologyProvisioning';

/**
 * US 15150 "Define a New Terminology and Its Rules" (terminology folder 02).
 *
 * Names are made unique per run (the sheet's fixed names would collide on a
 * re-run): each keeps the sheet's wording and adds a stamp. The sheet's
 * "Specialty" terminology does not exist here; the duplicate-name case
 * provisions one and re-uses its name.
 *
 * Restriction labels as the builder spells them (verified 2026-10-29): Text ->
 * None / English Letters Only / Arabic Letters Only / Alphanumeric; Number ->
 * "Number Only"; Date -> Date & Time / Date Only / Time Only; Boolean ->
 * "Boolean"; List and Mapping Identifier -> Single Select / Multi Select. The
 * sheet's expectations (Float / Integer, no restriction for Boolean) are kept.
 */

/** The builder controls that appear or vanish with the field type (name, type and the three flags always show). */
export const DEPENDENT_CONTROLS: TerminologyFieldControl[] = ['restriction', 'maxLength', 'listSource', 'mappingTerminology', 'mappingField'];

/** The dependent controls the sheet expects for each type (US 15150 cases 591-596). */
export const CONTROLS_BY_TYPE: Record<string, TerminologyFieldControl[]> = {
  [FIELD_TYPE.text]: ['restriction', 'maxLength'],
  [FIELD_TYPE.number]: ['restriction', 'maxLength'],
  [FIELD_TYPE.date]: ['restriction'],
  [FIELD_TYPE.boolean]: [],
  [FIELD_TYPE.list]: ['restriction', 'listSource'],
  [FIELD_TYPE.mapping]: ['restriction', 'mappingTerminology', 'mappingField'],
};

/** `label` plus a run stamp - the sheet's names, unique per run. */
export const stamped = (label: string): string => `${label} ${Date.now().toString(36)}`;

export const CASES = {
  create: {
    azureId: '20061',
    name: () => stamped('Diagnosis Category'),
    description: 'List of diagnosis categories used across clinical modules',
    field: { name: 'Category Code', type: FIELD_TYPE.text, restriction: 'Alphanumeric' },
  },
  blankName: { azureId: '20062', description: 'Terminology saved without a name.' },
  duplicateName: { azureId: '20063', existing: () => stamped('Specialty'), description: 'Duplicate-name check.' },
  nameAtMax: { azureId: '20064', name: () => `${stamped('Max')} ${textOfLength(100)}`.slice(0, 100), length: 100, description: 'Name at the 100-character limit.' },
  nameOverMax: { azureId: '20065', name: () => `${stamped('Over')} ${textOfLength(101)}`.slice(0, 101), limit: 100, description: 'Name one character over the limit.' },
  descriptionAtMax: { azureId: '20066', name: () => stamped('Description Max'), description: textOfLength(250, 'Description '), length: 250 },
  descriptionInvalid: { azureId: '20067', name: () => stamped('Description Over'), description: textOfLength(251, 'Description '), limit: 250 },
  noField: { azureId: '20068', name: () => stamped('Payer Type'), description: 'Classification of payer organisations', fieldError: /field/i },
  text: {
    azureId: '20069',
    restrictions: [/^None$/i, /^Alphanumeric$/i, /English/i, /Arabic/i],
    choose: 'English Letters Only',
    maxLength: 50,
  },
  number: { azureId: '20070', restrictions: [/Float/i, /Integer/i], choose: 'Integer', maxLength: 10 },
  date: { azureId: '20071', restrictions: [/Date Only/i, /Time Only/i, /Date (and|&) Time/i], choose: 'Date & Time' },
  list: { azureId: '20072', restrictions: [/Single Select/i, /Multi Select/i], choose: 'Single Select' },
  mapping: {
    azureId: '20073',
    restrictions: [/Single Select/i, /Multi Select/i],
    choose: 'Single Select',
    target: { name: () => stamped('Specialty'), field: 'Specialty Code' },
  },
  boolean: { azureId: '20074', name: () => stamped('Boolean Field'), description: 'A terminology with a yes / no field.', field: 'Is Billable' },
  flags: { azureId: '20075', name: () => stamped('Field Flags'), description: 'Required / Unique / Show in Table combinations.', field: 'Flag Field', yes: /^yes$/i, no: /^no$/i },
  integerParity: {
    azureId: '20076',
    field: { name: 'Quantity', type: 'number', restriction: 'numbersOnly', maxLength: 10 } as TerminologyFieldSpec,
    code: 'QTY-1',
    invalid: '12.5',
  },
  typeChange: { azureId: '20077', from: FIELD_TYPE.list, to: FIELD_TYPE.text },
  rapidSwitch: { azureId: '20078', order: [FIELD_TYPE.text, FIELD_TYPE.number, FIELD_TYPE.date, FIELD_TYPE.boolean, FIELD_TYPE.list, FIELD_TYPE.mapping, FIELD_TYPE.text] },
  noCreatePermission: { azureId: '20079', granted: TERMINOLOGY_VIEW_ONLY, withheld: ['createTerminology'] as const, name: () => stamped('Unauthorised Terminology') },
} as const;
