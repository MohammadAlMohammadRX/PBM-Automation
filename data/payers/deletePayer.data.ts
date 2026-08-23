/**
 * Test data for the user story: Delete Payer with/without Dependency Validation.
 *
 * Messages below are the EXPECTED texts from the user story. Where the live
 * application currently words a message differently, the assertion is kept
 * faithful to the specification so the difference is reported as a defect
 * rather than silently absorbed into the test.
 */

/** Row-action / dialog labels, per UI language. */
export const DELETE_UI = {
  en: {
    deleteAction: 'Delete',
    dialogTitle: 'Delete Payer',
    confirm: 'Yes',
    cancel: 'No',
  },
  ar: {
    deleteAction: 'حذف',
    dialogTitle: 'حذف جهة التغطية',
    confirm: 'نعم',
    cancel: 'لا',
  },
} as const;

/**
 * Expected user-facing messages for the delete flow, per UI language.
 * Captured from the live application so the bilingual test asserts the real
 * localized text rather than merely "some Arabic characters".
 */
export const DELETE_TOASTS = {
  en: {
    draftDiscarded: 'Draft discarded',
    stagedAsDraft: 'Saved as draft',
  },
  ar: {
    draftDiscarded: 'تم إلغاء المسودة',
    stagedAsDraft: 'تم الحفظ كمسودة',
  },
} as const;

/** Expected user-facing messages for the delete flow. */
export const DELETE_MESSAGES = {
  /** Shown when a never-approved draft is discarded outright. */
  draftDiscarded: 'Draft discarded',
  /** Shown when a live payer's deletion is staged for approval. */
  stagedAsDraft: 'Saved as draft',
  /**
   * Dependency-block error required by the user story (TC-002). The live app
   * currently returns a narrower wording ("...linked to existing plans."), so
   * this assertion is expected to surface that gap.
   */
  dependencyBlockedEn:
    'Payer cannot be deleted because it is linked to existing networks, facilities, or authorization rules.',
  /** Arabic dependency-block error required by the user story (TC-003). */
  dependencyBlockedAr:
    'لا يمكن حذف الدافع لأنه مرتبط بشبكات أو منشآت أو قواعد تفويض قائمة',
} as const;

/**
 * A payer that already carries at least one dependency (linked plan / member /
 * network) and therefore must not be deletable.
 *
 * ASSUMPTION: the payer↔dependency link cannot be created through the UI (the
 * "Add Network" form exposes no Payer field), so the dependency-blocking tests
 * rely on this pre-seeded QA record. Override via .env when the QA data set
 * changes, so the specs never hardcode environment data themselves.
 */
export const DEPENDENCY_PAYER_NAME =
  process.env.DEPENDENCY_PAYER_NAME ?? 'Al Dawaa';

/**
 * The same payer's Arabic name. When the UI language is Arabic the Payer Name
 * column renders the Arabic name, so a row cannot be located by its English
 * name - the Arabic tests must address the record by this value.
 */
export const DEPENDENCY_PAYER_NAME_AR =
  process.env.DEPENDENCY_PAYER_NAME_AR ?? 'الدواء';

/** An id that does not resolve to any payer - kept for direct-URL checks. */
export const STALE_PAYER_ID = '00000000-0000-0000-0000-000000009999';

/** Approval-queue change type raised by a staged deletion. */
export const DELETE_CHANGE_TYPE = 'Delete';

/** Rejection reason used when a staged deletion is rejected. */
export const DELETE_REJECTION_REASON = 'Change Not Required';

// TC-008 (zero-versus-one dependency boundary) was withdrawn from the suite at
// the product owner's request - the zero and one dependency paths are already
// covered by TC-001 and TC-002 respectively.
