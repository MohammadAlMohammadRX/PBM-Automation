import { stamped } from './defineTerminology.data';
import { textOfLength } from '../../utils/TerminologyProvisioning';

/**
 * US 15148 "Search and Filter Terminology list" (terminology folder 06).
 *
 * The keyword search box and the Advanced Search drawer's Subscribed / Locked /
 * Active criteria (checkboxes, verified 2026-10-29). The sheet's
 * "ICD-10 Diagnosis Codes" and the "laboratory" description are provisioned per
 * run so each case has a known match.
 */

export const SEARCH_MAX_LENGTH = 100;

/** A keyword of the search box's maximum length. */
export const longestKeyword = (): string => textOfLength(SEARCH_MAX_LENGTH, 'Search');

export const CASES = {
  byName: { azureId: '20112', name: () => stamped('ICD-10 Diagnosis Codes'), keyword: 'ICD-10' },
  byDescription: { azureId: '20113', name: () => stamped('Pathology Panel'), description: 'Reference codes used by the laboratory information system.', keyword: 'laboratory' },
  noMatch: { azureId: '20114', keyword: 'zzznonexistent', empty: /no terminolog|no records|no data|no results|nothing/i },
  activeOnly: { azureId: '20115' },
  inactiveOnly: { azureId: '20116' },
  subscription: { azureId: '20117', reference: 'SUB-REF-SEARCH' },
  combined: { azureId: '20118', name: () => stamped('Code Set Combined'), keyword: 'Code', reference: 'SUB-REF-COMBINED' },
  boundaries: { azureId: '20119', single: 'A' },
  specialCharacters: { azureId: '20120', keywords: ["'; DROP TABLE--", '<script>alert(1)</script>', '%%%'] },
  clear: { azureId: '20121', keyword: 'Code' },
  caseInsensitive: { azureId: '20122', name: () => stamped('ICD-10 Diagnosis Codes'), keyword: 'icd-10' },
  controls: { azureId: '20123', placeholder: /search/i, criteria: [/name/i, /subscribed/i, /locked/i, /active/i] },
  exploratory: { azureId: '20124', partial: ['C', 'Co', 'Cod'], final: 'Code' },
} as const;
