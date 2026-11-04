import { fullAccessWithout } from './facilityPermissions.data';

/**
 * US 15143 "Edit facility" (facility folder 11).
 *
 * The edit form is the Add drawer in edit mode (Facility-Foundation-Notes.md):
 * row Edit or the detail's Edit opens "Edit Facility" (`facility-form-drawer`)
 * loaded through GetFacility - step 1 Basic Information (names, type, the
 * read-only Authority Code, provider type, national code, Is Active), step 2
 * Contact & License. Save sends PUT UpdateFacility -> "Facility updated / The
 * facility has been updated." No approval. Closing a dirty drawer raises
 * "Unsaved Changes" (Keep Editing / Discard Changes).
 *
 * Literal readings and TC-vs-AC notes:
 * - "Submit" is the drawer's Save; on step 1 (no Save rendered) Next is what
 *   submits the step, and a step-1 error stops there (utils/facility/writerCHelpers.submitForm).
 * - "redirected to the edit form" (AC 1, 17622): the drawer opening over the list.
 * - 17621 "address fields": Building Name (the address section's first field).
 * - 17623 "Clinic456" in the Arabic name: refused on screen ("Arabic letters
 *   only." - Latin letters) - the record keeps its Arabic name.
 * - 17624 "an invalid value in a mandatory field": the License Number cleared
 *   (step 2, "This field is required." on Save); "navigate away" = closing the
 *   drawer and discarding.
 * - 17626 corrected e-mail: "test@facility.com" made unique per run
 *   ("test.<stamp>@facility.com") - the e-mail is unique across facilities and
 *   a duplicate answers a raw 500 (foundation).
 * - 17627: both English AND Arabic names set to Facility B's (409 "... is
 *   already taken." is the uniqueness error).
 * - 17628: the facility starts on the literal 01/06/2026; the expiry is moved
 *   to 01/05/2026 (on screen: "End date must be after start date.").
 * - 17629 "a role that lacks facility edit permission": the Payer Admin role
 *   shaped with every Facilities right but UpdateFacility (`facilityRole`).
 * - 17631: the Facility Code is NOT on the form (foundation) - the steps that
 *   expect it pre-populated and read-only fail; that is the finding.
 */
export const CASES = {
  validUpdate: { azureId: '17621', phone: '+971501234567', buildingName: 'Tower 2' },
  opensEditForm: { azureId: '17622' },
  invalidArabic: { azureId: '17623', nameAr: 'Clinic456' },
  leaveAfterError: { azureId: '17624' },
  mandatoryCleared: { azureId: '17625' },
  correctAndResubmit: { azureId: '17626', invalidEmail: 'test@@wrong', correctedEmail: (stamp: string): string => `test.${stamp}@facility.com` },
  duplicateNames: { azureId: '17627', labelA: 'Edit Facility A', labelB: 'Edit Facility B' },
  expiryBeforeStart: { azureId: '17628', licenseStartDate: '2026-06-01', newExpiry: '01/05/2026' },
  noEditPermission: { azureId: '17629', shape: fullAccessWithout('edit') },
  authorityCode: { azureId: '17630', from: 'Clinic', to: 'Hospital', codeBefore: '1', codeAfter: '2' },
  codeReadOnly: { azureId: '17631', buildingName: 'QA Code Check Building' },
  unsavedDiscarded: { azureId: '17632', original: 'QA Original Building', temporary: 'Temp Building' },
} as const;

/** The update toast ("Facility updated / The facility has been updated."). */
export const UPDATED_TOAST = /updated/i;

/** A required-field message. */
export const REQUIRED = /required/i;

/** The Arabic-name message ("Arabic letters only." / "Arabic name must contain only Arabic characters."). */
export const ARABIC_ONLY = /arabic/i;

/** The e-mail format message ("Enter a valid email address."). */
export const EMAIL_INVALID = /valid email|email/i;

/** The uniqueness refusal ("Facility English name '...' is already taken."). */
export const NOT_UNIQUE = /already taken|already exists|unique|duplicate/i;

/** The date-order message ("End date must be after start date." / "... on or after the license start date."). */
export const EXPIRY_AFTER_START = /after|later|before/i;
