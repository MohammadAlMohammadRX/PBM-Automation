import type { FacilityShape } from '../../utils/facility/writerBHelpers';

/**
 * US 17434 "View Facility - Overview" (facility folder 13).
 *
 * The detail (verified 2026-11-04): header (English name, type tag, licence /
 * e-mail / mobile strip), tabs Overview, Network Assignment, Audit History. The
 * Overview sections: Basic Information (Facility Code, اسم المنشأة, Authority
 * Code, Provider Type, Status, National Code), License (start / expiry - RAW
 * `YYYY-MM-DD`), Contact (Phone, Mobile), Address (Building Name, Unit Number,
 * Zip Code, Additional Address English / Arabic), Geo-coordinates (Longitude,
 * Latitude + a read-only map), Record (Created On / By, Modified On / By).
 * Empty values show "—".
 *
 * Literal readings / decisions:
 * - 17574 / 17583 / 17585 "a fully populated facility with data in all three
 *   tabs": the suite's long-lived NETWORK ANCHOR (utils/facility/writerBHelpers),
 *   created fully populated and in a network; each case first saves its record
 *   again with every field filled (a harmless edit that also gives the Audit
 *   History tab an entry - the Create entry is never on the tab, a known finding).
 * - 17575 "مستشفى الأمل": the case's Arabic name plus a unique Arabic-letters
 *   token (suite names must be unique and Arabic letters only).
 * - 17576: A = the single anchor (in a network), B = a fresh facility (none).
 * - 17579: coordinates 90 / 180 and -90 / -180 saved through the API (the form
 *   and server accept them).
 * - 17580 "shortest / longest valid zip": the AC defines no zip length, so the
 *   case's two values (12345 and 123456789) are the short and long ones.
 * - 17581: Building Name "Al-Noor & Partners' Clinic", a 180-character English
 *   additional address, an Arabic additional address with diacritics.
 * - 17583: the AC's field list is the checklist; a field's section is the
 *   section title it follows on the Overview.
 * - 17584 "RestrictedViewer01 (no Audit History permission)": the Payer Admin
 *   shaped with list + view + networks. The audit right (Facilities.AuditLogs,
 *   "View Audit Logs") shares its label with every section and cannot be
 *   targeted; the role holds no AuditLogs.* right either, so the account lacks
 *   the Audit tab's rights by construction. Baseline: the administrator is
 *   offered the Audit History tab.
 * - 17586 "ahmed.ali creates, sara.khan modifies": the administrator creates,
 *   the Payer Admin (which holds UpdateFacility) modifies through the
 *   application's own UpdateFacility call; "consistent with the identity
 *   service" = the names the record carries for those two accounts.
 */
export const CASES = {
  allTabs: { azureId: '17574' },
  bilingualName: { azureId: '17575', nameAr: 'مستشفى الأمل' },
  noNetworkMessage: { azureId: '17576' },
  statusFollowsLifecycle: { azureId: '17577', details: 'Inactivated by the suite to check the Overview status (17577).' },
  expiresToday: { azureId: '17578' },
  extremeCoordinates: { azureId: '17579', north: { latitude: 90, longitude: 180 }, south: { latitude: -90, longitude: -180 } },
  zipCodes: { azureId: '17580', short: '12345', long: '123456789' },
  unusualAddress: {
    azureId: '17581',
    building: "Al-Noor & Partners' Clinic",
    addressEn: 'Building 12, Al-Noor & Partners\' Medical Plaza, King Abdulaziz Road, Al Malaz District, Riyadh 12836 - entrance from the service lane behind the main parking area, 3rd floor - rear',
    addressAr: 'مُجَمَّعُ النُّورِ الطِّبِّيُّ، طَرِيقُ المَلِكِ عَبْدِ العَزِيزِ',
  },
  optionalBlank: { azureId: '17582' },
  fieldChecklist: { azureId: '17583' },
  noAuditPermission: { azureId: '17584', shape: { with: ['list', 'view', 'networks'] } satisfies FacilityShape },
  tabSwitching: { azureId: '17585', rounds: 3 },
  creatorAndEditor: { azureId: '17586', building: 'Modified by the Payer Admin (17586)' },
} as const;

/** What an empty optional value may show (17582) - never "null" / "undefined". */
export const BLANK_VALUES: readonly string[] = ['', '-', '—'];
export const TECHNICAL_PLACEHOLDER = /\bnull\b|\bundefined\b|NaN|\[object/i;

/** The AC's Overview checklist: section -> labels, in order. */
export const OVERVIEW_CHECKLIST: Readonly<Record<string, readonly string[]>> = {
  'Basic Information': ['Facility Code', 'اسم المنشأة', 'Authority Code', 'Provider Type', 'Status', 'National Code'],
  License: ['License Start Date', 'License Expiry Date'],
  Contact: ['Phone Number', 'Mobile Number'],
  Address: ['Building Name', 'Unit Number', 'Zip Code', 'Additional Address (English)', 'Additional Address (Arabic)'],
  'Geo-coordinates': ['Longitude', 'Latitude'],
  Record: ['Created On', 'Created By', 'Modified On', 'Modified By'],
};

/** A denied tab message, when the screen says anything. */
export const DENIED = /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied|unauthori[sz]ed|no access/i;
