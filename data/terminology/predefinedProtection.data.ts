import type { TerminologyBlockedCase } from './terminology.data';

/**
 * US 15161 "Protect Predefined Terminologies from Deletion" (terminology folder 15).
 *
 * The register's predefined terminologies are the six platform lists (Street,
 * District, City, Country, Policy Holder, Trades); the sheet's "Gender",
 * "Marital Status", "Record Status", "Blood Type" and "Country Codes" do not
 * exist here, so each case picks a predefined terminology from the register
 * (fixture `predefinedTerminology`) and BLOCKS when none matches. A predefined
 * terminology is never modified: every deletion attempt is refused by design.
 * The list renders its Delete disabled with the tooltip "Predefined
 * terminologies cannot be deleted." (verified 2026-10-29).
 */

export const PREDEFINED_MARKER = /predefined|system|protected/i;

export const CASES = {
  deleteWithheld: { azureId: '20222' },
  noCondition: { azureId: '20223', recordCount: 0 },
  overridesAll: { azureId: '20224' },
  catalogue: { azureId: '20226', count: 3 },
  noOverride: { azureId: '20227', override: /force|override/i },
  directRequest: { azureId: '20228' },
  everyScreen: { azureId: '20229' },
  explained: { azureId: '20230' },
  volumeExtremes: { azureId: '20231' },
  groups: { azureId: '20232', count: 3 },
  acrossModules: { azureId: '20233', name: 'Country' },
} as const;

export const BLOCKED_CASES: TerminologyBlockedCase[] = [
  {
    azureId: '20225',
    title: 'should lose its deletability at once when a non-predefined terminology is flagged as predefined',
    reason:
      'Needs a way to flag an existing terminology as predefined "through the system configuration". The flag '
      + '(isPredefined) is set only by the platform seed: neither the Terminology screens, System Settings nor the '
      + 'CreateTerminology / UpdateTerminology requests accept it (verified 2026-10-29). Runnable once an '
      + 'administrative control or seed hook for the predefined flag exists.',
  },
];
