import { FACILITY_FORM } from './facilityIds';

/**
 * Writer A's extra ids for the Facility folders 01-04 (2026-11-04), on top of
 * constants/facility/facilityIds.ts (the foundation's, not edited).
 */

/**
 * Error slots the form does NOT render today: phone, mobile, longitude and
 * latitude have no validation on screen (Facility-Foundation-Notes, "Client
 * messages"), so no `-error` element was ever seen for them. The ids follow the
 * drawer's own convention (`{root}-{field}-error`, as for the e-mail and the
 * licence fields) so that, once the application validates them, cases 17607 /
 * 17608 read the message where it will appear. Until then they read ''.
 */
export const FACILITY_FORM_EXPECTED_ERROR = {
  phone: `${FACILITY_FORM.root}-phone-number-error`,
  mobile: `${FACILITY_FORM.root}-mobile-number-error`,
  longitude: `${FACILITY_FORM.root}-longitude-error`,
  latitude: `${FACILITY_FORM.root}-latitude-error`,
} as const;

export type FacilityExpectedErrorField = keyof typeof FACILITY_FORM_EXPECTED_ERROR;
