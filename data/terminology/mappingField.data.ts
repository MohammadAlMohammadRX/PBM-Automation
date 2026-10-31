import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { stamped } from './defineTerminology.data';
import type { TerminologyFieldSpec } from '../../utils/TerminologyProvisioning';

/**
 * US 15155 "Define a Mapping Field Between Terminologies" (terminology folder 10).
 *
 * The geographic chain of the sheet (Country > City > District > Street,
 * Region) is provisioned per case under those names, stamped per run, so the
 * shared predefined Country / City / District / Street are never edited. Each
 * level has a unique key field and a non-unique text field. The mapping field is
 * configured through the Edit drawer's field builder - the action under test.
 */

export const MAPPING_FIELD_NAME = 'Parent Reference';

/** A terminology of the chain: a unique key and a non-unique description. */
export const levelFields = (key: string): TerminologyFieldSpec[] => [
  { name: key, type: 'text', restriction: 'none', maxLength: 20, required: true, unique: true },
  { name: 'Description', type: 'text', restriction: 'none', maxLength: 255 },
];

export const CASES = {
  link: { azureId: '20161', country: () => stamped('Country'), city: () => stamped('City'), key: 'Country Code' },
  noTerminology: { azureId: '20162', district: () => stamped('District'), field: 'Code', error: /terminology/i },
  noField: { azureId: '20163', district: () => stamped('District'), city: () => stamped('City'), error: /field/i },
  notUnique: { azureId: '20165', district: () => stamped('District'), city: () => stamped('City'), field: 'Description', error: /unique/i },
  inactiveTarget: { azureId: '20164', country: () => stamped('Country'), city: () => stamped('City'), value: 'SA', cityCode: 'RUH' },
  activeTarget: { azureId: '20166', country: () => stamped('Country'), city: () => stamped('City'), values: ['SA', 'AE', 'JO'] },
  chain: {
    azureId: '20167',
    levels: [
      { name: () => stamped('Country'), key: 'Country Code', value: 'SA' },
      { name: () => stamped('City'), key: 'City Code', value: 'RUH' },
      { name: () => stamped('District'), key: 'District Code', value: 'OLAYA' },
      { name: () => stamped('Street'), key: 'Street Code', value: 'TAHLIA' },
    ],
  },
  singleUnique: { azureId: '20168', region: () => stamped('Region'), key: 'Region Code', host: () => stamped('Province') },
  tracksStatus: { azureId: '20169', country: () => stamped('Country'), city: () => stamped('City'), value: 'SA' },
  selfMapping: { azureId: '20170', city: () => stamped('City'), key: 'City Code', error: /itself|self|same terminology|circular/i },
  rapidSwitch: { azureId: '20171', district: () => stamped('District'), street: () => stamped('Street'), unique: 'ID', notUnique: 'Name', warning: /unique/i, switches: ['Name', 'ID', 'Name', 'ID'] },
  guidance: { azureId: '20172', required: /\*|required/i },
  noPermission: { azureId: '20174', granted: TERMINOLOGY_VIEW_ONLY },
} as const;
