import { FIELD_DEFAULTS } from './payerCreationFields.data';

/** The value the pre-selection puts in the field before the user chooses. */
export const PRE_SELECTED_COUNTRY = FIELD_DEFAULTS.country;

/** A country that no catalogue contains, for the invalid-value case. */
export const UNLISTED_COUNTRY = 'Atlantis';

/** The partial text the search case types, and what it should narrow to. */
export const COUNTRY_SEARCH = {
  query: 'Jor',
  expected: 'Jordan',
} as const;

/** What a failed catalogue load must not look like. */
export const OUTAGE_EXPECTATION = {
  /**
   * An empty dropdown with no explanation is the failure mode this case is
   * written against: the user cannot tell "no countries exist" from "the list
   * could not be loaded", and the payer they save carries an unvalidated value.
   */
  forbidden: 'a silently empty list',
} as const;

/** The account the catalogue-permission case needs. */
export const CATALOGUE_ROLE_REQUIREMENT = {
  role: 'a System Administrator without Terminology Management catalogue-edit rights',
  reason:
    'The case exists to prove a payer administrator can SELECT a country but cannot MODIFY '
    + 'the central catalogue. The shared administrator session holds every permission, so '
    + 'running it as the administrator would assert nothing.',
} as const;
