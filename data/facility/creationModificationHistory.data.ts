import type { FacilityShape } from '../../utils/facility/writerBHelpers';

/**
 * US 15138 "View facility creation and modification history" (facility folder 07).
 *
 * The Overview's Record section (verified 2026-11-04): Created On
 * (`04/11/2026 03:25 PM`, Riyadh), Created By ("CareConnect Admin User"),
 * Modified On / Modified By - "—" until the FIRST edit, then the editor (an
 * activate / inactivate sets them too). GetFacility carries createdOn /
 * createdByName / modifiedOn / modifiedByName, which the cases treat as "the
 * original creation record".
 *
 * Literal readings / decisions:
 * - 17536 / 17537 "FAC-1001 by jsmith / FAC-1002 by agarcia": the case's own
 *   suite facility; the expected names are the ones the record holds (the
 *   administrator), and the times must agree with the record to the minute.
 * - 17539 "logged in as a different user than the creator (mwong)": the
 *   facility is created by the administrator; the editor and reader is the
 *   Payer Admin, shaped with list + view + edit (fixture `facilityRole`).
 *   When that role edit does not reach the signed-in account (seen on Policy,
 *   2026-11-04) the case is BLOCKED by requireFacilityListAccess, with the
 *   permission-not-granted evidence.
 * - 17540 "edit multiple times": three edits through the Edit drawer.
 * - 17541 "viewer_no_access": the Payer Admin shaped WITHOUT GetFacilities (the
 *   parent of every facility right). Baseline: the administrator opens the record.
 * - 17542 "Created On equals Modified On on first save": asserted as the case
 *   states; the application shows "—" until the first edit (finding).
 * - 17543 "created by Admin / Network Admin / Compliance Officer users": only
 *   the administrator and the Payer Admin accounts exist in this environment -
 *   no Network Administrator or Compliance Officer user -> BLOCKED naming them.
 * - 17544 "a deactivated last editor": no disposable user can be created and
 *   deactivated safely -> BLOCKED (brief).
 * - 17545 "two quick edits": two Edit-drawer saves back to back.
 * - 17546 "a facility created several months ago": the OLDEST facility in the
 *   register is only looked at (read-only); BLOCKED when none is older than
 *   OLD_FACILITY_DAYS days.
 */
export const CASES = {
  createdOnBy: { azureId: '17536' },
  modifiedOnBy: { azureId: '17537', building: 'Building edited once by the suite' },
  editorAfterSave: { azureId: '17539', shape: { with: ['list', 'view', 'edit'] } satisfies FacilityShape, building: 'Edited by the Payer Admin' },
  creationNeverChanges: { azureId: '17540', edits: ['First edit by the suite', 'Second edit by the suite', 'Third edit by the suite'] },
  noAccess: { azureId: '17541', shape: { without: ['list'] } satisfies FacilityShape },
  firstSave: { azureId: '17542', label: 'Sunrise Pharmacy' },
  creatorByRole: {
    azureId: '17543',
    creators: ['Admin', 'Network Administrator', 'Compliance Officer'],
    /** The accounts this environment holds (constants/EnvironmentConfig): the administrator and the Payer Admin. */
    available: ['Admin'],
  },
  deactivatedEditor: { azureId: '17544' },
  rapidEdits: { azureId: '17545', edits: ['Quick edit one', 'Quick edit two'] },
  dateFormats: { azureId: '17546', building: 'Modified just now by the suite' },
} as const;

/** "Several months ago" = at least this many days before today. */
export const OLD_FACILITY_DAYS = 60;

/** What a denied screen says. */
export const DENIED = /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied|unauthori[sz]ed|no access|access restricted/i;

/** 17544's reason. */
export const NO_DEACTIVATED_EDITOR = 'a facility last modified by a user whose account has since been DEACTIVATED cannot be produced: the environment holds two accounts '
  + '(the administrator and the Payer Admin), neither may be deactivated, and no disposable user can be created and deactivated safely (Facility build brief).';

/** The empty Record value before the first edit. */
export const EMPTY_VALUE = '—';
