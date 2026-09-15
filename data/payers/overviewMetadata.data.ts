/**
 * Test data for "Show Created-Modified Metadata on Payer Overview".
 *
 * The Overview tab carries four audit fields - Created By, Created At, Modified
 * By, Modified At - each already mapped to an id in PAYER_DETAIL_FIELD, so
 * PayerDetailPage.getFieldValue reads every one of them by label with no new
 * locator.
 *
 * WHAT IS ASSERTED, AND WHY IT IS RELATIONSHIPS RATHER THAN EXACT VALUES. The
 * sheet writes literal expectations - "Created By shows qa.admin@neorx.co",
 * timestamps to the minute in UTC+3. This environment has one shared account
 * whose display name is not the login (the audit trail renders it "CareConnect"
 * rather than the configured ADMIN_USERNAME), and its clock is the server's,
 * not the tester's. Pinning a literal username or a wall-clock minute would test
 * this environment's fixtures, not the feature. So the cases assert the
 * invariants the feature exists to guarantee:
 *
 *   - Created By / Created At are populated for every payer.
 *   - Created By and Created At NEVER change once set, however many edits follow.
 *   - Modified By / Modified At advance with each edit, Modified At moving
 *     forward in time.
 *
 * A build that let an edit rewrite Created By, or left Modified At frozen, or
 * blanked the fields, breaks one of those - which is what the sheet's literal
 * cases were really guarding.
 *
 * TWO CASES ARE BLOCKED, and named so: the deleted-user case (TC-969) cannot be
 * set up without deleting a user account, which this suite must not do to a
 * shared environment; and the RBAC case (TC-971) needs the non-admin account
 * that is not configured.
 */

/** The four audit fields, by the label PayerDetailPage.getFieldValue takes. */
export const METADATA_FIELDS = {
  createdBy: 'Created By',
  createdAt: 'Created At',
  modifiedBy: 'Modified By',
  modifiedAt: 'Modified At',
} as const;

/** The two that must never change once a payer exists. */
export const IMMUTABLE_FIELDS = [METADATA_FIELDS.createdBy, METADATA_FIELDS.createdAt] as const;

/** The two that must move on when the payer is edited. */
export const MUTABLE_FIELDS = [METADATA_FIELDS.modifiedBy, METADATA_FIELDS.modifiedAt] as const;

/** The field an edit moves, purely to provoke a Modified-metadata update. */
export const EDIT_TRIGGER = {
  label: 'License Number',
  first: 'LIC-META-1',
  second: 'LIC-META-2',
  kind: 'text' as const,
};

/** How many sequential edits the multi-edit case performs. */
export const SEQUENTIAL_EDITS = 2;

/**
 * A value that would mean the field is blank or erroring rather than populated.
 * The sheet rejects a blank or broken metadata field explicitly.
 */
export const BLANK_MARKERS = ['', '-', '—', '–', 'N/A', 'null', 'undefined'] as const;

/** The account the RBAC case needs. */
export const METADATA_ROLE_REQUIREMENT = {
  role: 'a payer role without overview-metadata rights',
  reason:
    'The case proves the audit metadata is withheld from a role that may not see it. The shared '
    + 'administrator session sees everything, so running it as the administrator asserts nothing.',
} as const;

/**
 * What a Modified field shows for a payer whose edits have not (yet) been
 * approved.
 *
 * VERIFIED: this app renders an em dash there. That is the sheet's own allowed
 * "clear indicator" for an unmodified record (TC-967), not a blank defect - and
 * it follows from the maker-checker model, where an edit stages a draft and the
 * published record's Modified stamp does not move until the change is approved.
 * So the Modified fields accept EITHER a populated value or one of these
 * indicators; the Created fields must always be populated.
 */
export const UNMODIFIED_INDICATORS = ['-', '—', '–'] as const;
