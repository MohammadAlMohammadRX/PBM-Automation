/**
 * US 20413 "View User Profile" (user folder 07), 13 cases.
 *
 * How the cases map onto the live screens (2026-11-08, User-Foundation-Notes.md):
 *  - View (row action) opens `/users-management/users-administration/profile/{id}`:
 *    a header card (initials, gender, full English name, document ID, status),
 *    a summary strip (Nationality, Document ID, Mobile Number, Age), and four
 *    collapsible sections Personal Information, Contact Information, Roles &
 *    Status, Record Information (values carry no ids - read as label -> value).
 *    Edit Profile (breadcrumb) opens the Edit drawer on step 1.
 *  - The users viewed are SUITE users built per case ("Jane Doe", "John Smith",
 *    "Mark Lee" ... are replaced by them). "Select a user from the list" = reveal
 *    its row (search by last name); the list has no row selection / highlight.
 *  - Permission cases (20565, 20573; decision 7): the restricted account is a
 *    suite user whose suite role holds Users.GetUsers + Users.GetUsersDashboard
 *    but NOT Users.GetUser ("View User"); baseline first - the administrator is
 *    offered View / opens the profile. "access is denied or the user is
 *    redirected" is asserted literally (a redirect away from the profile URL or
 *    a denial message).
 *  - 20569: the AC says "An Edit Profile button & change password are available
 *    on the page"; there is NO Change Password control on 2026-11-08 (finding,
 *    asserted literally).
 *  - 20570: "Locked" cannot be produced - the platform never locks an account
 *    (foundation (d): 10 wrong passwords, still signs in, lockoutUntil null), so
 *    the Locked part is BLOCKED after the Active and Inactive parts ran.
 *  - 20571: no maximum name length is defined anywhere (the drawer boxes have no
 *    maxlength; the server accepted a 51-character last name), so the suite user
 *    is built with a 50-character English last name (NAME_MAX_LENGTH) and the
 *    full name must show unshortened in the header card and Personal Information
 *    ("First Name" shows the FULL English name).
 *  - 20575: "deleted by another session" = the suite user is deleted through the
 *    API while the admin's list still shows its row; View on that stale row must
 *    say the record is no longer available (2026-11-08: an empty page with "No
 *    users found." - asserted literally against NO_LONGER_AVAILABLE).
 *  - 20576: the list shows no role column (the AC of 20412 lists none), so
 *    "name, status, role" is compared as: the row's name, document ID,
 *    nationality, identity type, mobile number and status against the profile,
 *    and the profile's Roles against the roles the user holds (GetUser).
 */
export const CASES = {
  viewProfile: { azureId: '20564' },
  noViewPermission: { azureId: '20565' },
  summaryCard: { azureId: '20566' },
  fourSections: { azureId: '20567' },
  editProfile: { azureId: '20568' },
  changePassword: { azureId: '20569' },
  statusStates: { azureId: '20570' },
  maxLengthName: { azureId: '20571' },
  afterReactivation: { azureId: '20572' },
  directLinkDenied: { azureId: '20573' },
  navigateAwayAndBack: { azureId: '20574' },
  deletedUser: { azureId: '20575' },
  matchesList: { azureId: '20576' },
} as const;

/** The four sections, in page order (USER_PROFILE.section order). */
export const SECTION_LABELS = ['Personal Information', 'Contact Information', 'Roles & Status', 'Record Information'] as const;

/** The rights of the account WITHOUT "View User" (Users.GetUser). */
export const NO_VIEW_RIGHTS = ['Users.GetUsers', 'Users.GetUsersDashboard'] as const;

/** 20571: the English last name length used as "the maximum" (no maximum is defined - see above). */
export const NAME_MAX_LENGTH = 50;

/** 20573: a denial message (when the page does not redirect). */
export const ACCESS_DENIED = /access denied|not authori[sz]ed|unauthori[sz]ed|forbidden|permission|not allowed/i;

/** 20575: the message for a record that is gone. */
export const NO_LONGER_AVAILABLE = /no longer (available|exists)|not (be )?found|does not exist|has been (deleted|removed)|unable to load user/i;

/** 20570: the Locked part. */
export const LOCKED_USER_BLOCKED =
  'a LOCKED user: the platform never locks an account (foundation (d) - 10 consecutive wrong passwords on a suite user, the correct one still signs in, '
  + 'lockoutUntil always null; no lockout threshold / duration setting exists), so a "Locked" status cannot be produced';

/** 20568: the Edit drawer's title. */
export const EDIT_TITLE = 'Edit User';

/** 20574: the module visited in between. */
export const OTHER_MODULE = '/dashboard';
