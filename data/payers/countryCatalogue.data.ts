import { FIELD_DEFAULTS } from './payerCreationFields.data';

/**
 * Test data for "Select Country from the Central Country Catalogue".
 *
 * THE STORY'S PREMISE IS ALREADY CONTRADICTED BY EVIDENCE THIS FRAMEWORK HOLDS,
 * and that is this suite's headline finding rather than a surprise waiting to
 * happen. The story exists to prove the Country field was migrated off a
 * hard-coded three-country list onto the central catalogue in Terminology
 * Management. The creation-validation story verified, live, that the wizard
 * offers EXACTLY THREE countries and that Egypt - which the sheet names as its
 * example of a non-legacy entry - is not among them. See
 * payerCreationFields.data.ts, whose City-cascade case had to substitute a
 * country that exists.
 *
 * So the offered list is asserted against LEGACY_COUNTRIES as a SUPERSET, which
 * is what the story requires, and the failure message names what was actually
 * offered. If the migration lands later, these cases start passing without
 * being touched.
 *
 * NO COUNTRY IS ADDED TO THE CATALOGUE BY THESE TESTS. The sheet's TC-638 adds
 * "Qatar" in Terminology Management and looks for it in the dropdown. That
 * mutates reference data every other payer and every other test shares, in an
 * environment with one set of credentials and no teardown for it - so the case
 * asserts the substantive guarantee instead: the list is FETCHED from a lookup
 * service when the dropdown opens, rather than compiled into the client. A
 * fetched list tracks the catalogue by construction; a hard-coded one cannot.
 *
 * THE FIELD CANNOT BE LEFT BLANK. Country is pre-selected as
 * `FIELD_DEFAULTS.country`, so the sheet's "complete every field except
 * Country" is unreachable through the interface. The mandatory-field case
 * therefore asserts the guarantee that actually holds - a payer can never be
 * submitted without a country - and records that it holds by pre-selection
 * rather than by validation, which is weaker: a user can leave the default in
 * place without ever choosing deliberately.
 */

/** The three countries the field offered before the catalogue migration. */
export const LEGACY_COUNTRIES = ['Saudi Arabia', 'Jordan', 'United Arab Emirates'] as const;

/**
 * A catalogue entry the sheet expects to be selectable, chosen because it is
 * NOT in the legacy set. Verified absent from this environment.
 */
export const NON_LEGACY_COUNTRY = 'Egypt';

/** The value the pre-selection puts in the field before the user chooses. */
export const PRE_SELECTED_COUNTRY = FIELD_DEFAULTS.country;

/** A country that no catalogue contains, for the invalid-value case. */
export const UNLISTED_COUNTRY = 'Atlantis';

/** The partial text the search case types, and what it should narrow to. */
export const COUNTRY_SEARCH = {
  query: 'Jor',
  expected: 'Jordan',
} as const;

/**
 * How the dropdown's own request is recognised.
 *
 * DISCOVERED rather than named. This framework carries one lookup endpoint
 * (`/api/Lookups/Items/payerStatus`), so the country list is very likely
 * `/api/Lookups/Items/...` too - but "very likely" is not a basis for failing a
 * case. The cases watch the requests the dropdown makes when it opens and match
 * them against this pattern, so a different path still satisfies them and the
 * one thing being asserted is that a request happens at all.
 */
export const CATALOGUE_REQUEST_PATTERN = /lookup|countr|terminolog|catalog/i;

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
