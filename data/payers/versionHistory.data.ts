/**
 * Test data for the user story: Add Version History Tab to Payer Details.
 *
 * Verified against the live application:
 *   - The tab exists (`payer-detail-tab-versions`) and renders a table with
 *     columns Version, Change, Status, Requested By, Requested On, Reviewed By,
 *     Reviewed On, Actions.
 *   - TWO divergences from the acceptance criteria were found, and the specs
 *     assert the CRITERIA rather than the current behaviour, so each is
 *     reported as a defect instead of being written off as expected:
 *
 *     1. TAB ORDER. The criteria require Version History to be the FIFTH tab,
 *        after Audit History. Live order is Overview, Linked Networks, Linked
 *        Policies, Version History, Audit History - Version History is fourth
 *        and Audit History fifth.
 *
 *     2. UNAPPROVED ENTRIES ARE LISTED. The criteria require only approved
 *        (published) changes. Live, the tab also lists entries whose status is
 *        "Pending Approval" (observed: "v2 · Update · Pending Approval"
 *        alongside "v1 · Create · Published").
 */

/** One row of the Version History tab. */
export interface VersionEntry {
  version: string;
  changeType: string;
  status: string;
  requestedBy: string;
  requestedOn: string;
  reviewedBy: string;
  reviewedOn: string;
}

/**
 * Fields every entry must carry, whatever its status. The reviewer columns are
 * deliberately absent: a version still awaiting review has no reviewer, so
 * requiring one everywhere would report a defect that is not one. They are
 * checked separately, and only for published entries.
 */
export const REQUIRED_VERSION_FIELDS = [
  'version',
  'changeType',
  'status',
  'requestedBy',
  'requestedOn',
] as const satisfies readonly (keyof VersionEntry)[];

/** Status text that means a version IS an approved, published change. */
export const PUBLISHED_STATUSES = ['Published', 'منشور'] as const;

/**
 * Status text that means a version is NOT an approved change and therefore
 * must not appear in Version History at all.
 */
export const UNAPPROVED_STATUSES = [
  'Pending Approval',
  'Pending',
  'Rejected',
  'Draft',
  'Withdrawn',
  'Discarded',
] as const;

/**
 * The tab strip the acceptance criteria specify, in the required left-to-right
 * order, as the element-id suffixes the strip's buttons carry.
 *
 * `PAYER_DETAIL_TAB` in constants/ElementIds.ts holds the ids themselves; this
 * is the ORDER they must appear in, which is a requirement rather than a
 * locator - hence its home here.
 */
export const REQUIRED_TAB_ORDER = [
  'overview',
  'networks',
  'policies',
  'audit',
  'versions',
] as const;

/** Tab captions per language, for the checklist case's failure messages. */
export const TAB_LABELS: Record<'en' | 'ar', Record<string, string>> = {
  en: {
    overview: 'Overview',
    networks: 'Linked Networks',
    policies: 'Linked Policies',
    audit: 'Audit History',
    versions: 'Version History',
  },
  ar: {
    overview: 'نظرة عامة',
    networks: 'الشبكات المرتبطة',
    policies: 'السياسات المرتبطة',
    audit: 'سجل التغييرات',
    versions: 'سجل الإصدارات',
  },
};

/** How many tabs the criteria require. */
export const REQUIRED_TAB_COUNT = 5;

/**
 * The version a freshly published payer carries, and the version its first
 * edit stages. Both are derived from the maker-checker model rather than
 * hard-coded per test: a payer is created at v0 (never published), reaches v1
 * on its first approval, and stages v2 when edited.
 */
export const VERSION_LABEL = {
  initialDraft: 'v0',
  firstPublished: 'v1',
  firstEdit: 'v2',
} as const;

/** Change types the tab reports, as the live application words them. */
export const CHANGE_TYPE = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
} as const;
