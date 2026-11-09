import { randomInt } from 'crypto';
import { inspect } from 'util';
import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { env } from '../constants/EnvironmentConfig';
import { answerReasons, answerText } from './MemberProvisioning';

export { answerReasons, answerText };

/**
 * Users, roles and invitations for the User Management suite (Feature 12972),
 * built through the application's own API - the same calls the screens make,
 * their bodies CAPTURED from the Add / Edit User drawer, Role Administration and
 * the Add New Invitation drawer on 2026-11-08
 * (reports/user/User-Foundation-Notes.md).
 *
 * SUITE NAMING (never touch anything else): users are "QA Automation User<stamp>"
 * (English first "QA", last "Automation User<stamp>", stamp = English letters),
 * Arabic "كيو اختبار <letters>", e-mail `qa.automation.<stamp>@example.com`;
 * roles "QA Automation Role <stamp>"; invitations go to
 * `qa.automation.inv.<stamp>@example.com`. Every writer checks ownership first
 * (assertSuiteUser / assertSuiteRole / assertSuiteInvitation) - the suite never
 * edits, deactivates, deletes, resets or locks an account it did not create.
 *
 * NO PASSWORD ON CREATE: the system issues one (masked "**********" in the
 * e-mail log). A suite user gets a password the suite KNOWS through the reset
 * flow: ForgotPassword answers the reset `code` itself (payload.code - a
 * finding, but it is what makes sign-in testable), ResetPassword sets a
 * generated, policy-compliant password. Passwords live in a `SuiteSecret`
 * (prints as "********", never serialised) and are never logged.
 *
 * E-MAIL: example.com is refused by the SMTP server ("Recipient address
 * reserved by RFC 2606") - nothing is delivered, but every attempt is in
 * System Settings > Notification Center audit (TriggersAudit) with subject and
 * body: First Activation, Forget Password (reset link), Invitation
 * (`/accept-invitation?token=`).
 */

// ---- naming --------------------------------------------------------------------------

export const SUITE_USER_FIRST_NAME = 'QA';
/** The display-name prefix of every suite user ("QA Automation User<stamp>"). */
export const SUITE_USER_PREFIX = 'QA Automation';
export const SUITE_USER_ARABIC_FIRST = 'كيو';
export const SUITE_ROLE_PREFIX = 'QA Automation Role';
/** Every suite e-mail (users AND invitations) starts with this. */
export const SUITE_EMAIL_PREFIX = 'qa.automation.';
export const SUITE_EMAIL_DOMAIN = 'example.com';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
let stampCounter = 0;

/** A unique stamp of English LETTERS only (the English-name rule): the time plus a counter and a random part, base 26. */
export function userStamp(): string {
  let n = Date.now() * 100 + (stampCounter++ % 100);
  let out = '';
  while (n > 0) {
    out = LETTERS[n % 26] + out;
    n = Math.floor(n / 26);
  }
  return `${out}${LETTERS[randomInt(26)]}${LETTERS[randomInt(26)]}`;
}

/** A unique token of Arabic LETTERS only. */
export function arabicToken(): string {
  let n = Date.now() * 1000 + randomInt(1000);
  let out = '';
  while (n > 0) {
    out = ARABIC_LETTERS[n % 28] + out;
    n = Math.floor(n / 28);
  }
  return out;
}

export const suiteUserLastName = (stamp = userStamp()): string => `Automation User${stamp}`;
/** "QA Automation User<stamp>" - the list's Name cell (first + last; the second name is blank). */
export const suiteUserDisplayName = (lastName: string): string => `${SUITE_USER_FIRST_NAME} ${lastName}`;
export const suiteUserEmail = (stamp = userStamp()): string => `${SUITE_EMAIL_PREFIX}${stamp}@${SUITE_EMAIL_DOMAIN}`;
export const suiteInvitationEmail = (stamp = userStamp()): string => `${SUITE_EMAIL_PREFIX}inv.${stamp}@${SUITE_EMAIL_DOMAIN}`;
export const suiteRoleName = (stamp = userStamp()): string => `${SUITE_ROLE_PREFIX} ${stamp}`;
/** A Saudi mobile number as the drawer takes it: 9 digits starting with 5 (the "+966" prefix is shown before the box). */
export const suiteMobileNumber = (): string => `5${String(Date.now()).slice(-6)}${String(randomInt(100)).padStart(2, '0')}`;

/** The search key that reveals a suite user's row: its LAST name ("Automation User<stamp>" - the search matches names, document ID and e-mail). */
export const userSearchKey = (displayNameOrLastName: string): string => displayNameOrLastName.replace(/^QA\s+/, '');

// ---- seeded lookup ids (stable GUIDs, verified 2026-11-08) ---------------------------

/** Lookup item ids the drawer sends. Seeded / predefined, so constant across runs. */
export const USER_LOOKUP = {
  identityType: {
    nationalId: 'c3c3c3c3-0003-0003-0003-000000000001',
    iqama: 'c3c3c3c3-0003-0003-0003-000000000002',
    passport: 'c3c3c3c3-0003-0003-0003-000000000003',
    gccId: 'c3c3c3c3-0003-0003-0003-000000000004',
  },
  nationality: {
    saudi: 'b2b2b2b2-0002-0002-0002-000000000001',
    emirati: 'b2b2b2b2-0002-0002-0002-000000000002',
    bahraini: 'b2b2b2b2-0002-0002-0002-000000000003',
    qatari: 'b2b2b2b2-0002-0002-0002-000000000004',
    kuwaiti: 'b2b2b2b2-0002-0002-0002-000000000005',
    omani: 'b2b2b2b2-0002-0002-0002-000000000006',
  },
  gender: { male: 'e208f7dc-4ef8-4902-bc78-087bd8ff9399', female: 'e765fddf-02cc-4f5b-93a6-84e28acc87d9', other: '2d1e3a57-44db-4a0a-b587-714dfebdbc64' },
  preferredLanguage: { ar: 'd4d4d4d4-0004-0004-0004-000000000001', en: 'd4d4d4d4-0004-0004-0004-000000000002' },
  preferredContactMethod: { email: 'e5e5e5e5-0005-0005-0005-000000000001', sms: 'e5e5e5e5-0005-0005-0005-000000000002', both: 'e5e5e5e5-0005-0005-0005-000000000003' },
  countryDialCode: { '+966': 'a1a1a1a1-0001-0001-0001-000000000001', '+971': 'a1a1a1a1-0001-0001-0001-000000000002', '+973': 'a1a1a1a1-0001-0001-0001-000000000003' },
  /** Lookup `userDeactivationReason` (a stray "test" item exists too). */
  deactivationReason: {
    leftOrganisation: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0202',
    roleChanged: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0203',
    extendedLeave: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0204',
    securityIncident: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0205',
    policyViolation: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0206',
    prolongedInactivity: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0207',
    other: '1de47a01-4b2c-4d3e-9a8b-1a2b3c4d0208',
  },
} as const;

export type IdentityTypeCode = keyof typeof USER_LOOKUP.identityType;
export type NationalityCode = keyof typeof USER_LOOKUP.nationality;
export type DeactivationReasonCode = keyof typeof USER_LOOKUP.deactivationReason;

/** The live Users permission keys (role catalogue) and their catalogue ids - see USER_RIGHT_ID. */
export const USER_RIGHTS = [
  'Users.GetUsers', 'Users.GetUser', 'Users.GetUsersDashboard', 'Users.CreateUser', 'Users.UpdateUser', 'Users.DeleteUser',
  'Users.ToggleUserActivation', 'Users.ExportUsers', 'Users.CheckDocumentIdExists', 'Users.GetUserPermissions',
  'Users.GrantOrRevokeUserPermissions', 'Users.AuditLogs',
  'Invitations.GetInvitations', 'Invitations.CreateInvitation', 'Invitations.DeleteInvitation', 'Invitations.ExportInvitations',
  'Invitations.ResendInvitation', 'Invitations.SetInvitationStatus', 'Invitations.GetInvitationApprovals',
  'Invitations.GetInvitationApprovalDetail', 'Invitations.GetInvitationApprovalsCount', 'Invitations.ApproveInvitation', 'Invitations.RejectInvitation',
  'SystemSettings.GetSystemSettings', 'SystemSettings.UpdatePasswordPolicy', 'SystemSettings.UpsertSystemSettings',
  'Roles.GetRoles', 'Payers.GetPayersDropdown', 'Lookups.GetLookups',
] as const;

export type UserRightKey = (typeof USER_RIGHTS)[number];

/**
 * Catalogue ids of the rights above (GetRolePermissions, 2026-11-08). A
 * suite role is created with `selectedPermissionIds` = these ids; ids are
 * resolved live by `permissionIds()` when a key is missing here.
 */
export const USER_RIGHT_ID: Partial<Record<string, string>> = {
  'Users.GetUsers': '646f1709-6669-4f58-aec3-76949ec3a760',
  'Users.GetUser': '8c80cdd4-b85b-45a8-a002-8b5006b3117b',
  'Users.GetUsersDashboard': 'c65d068a-1ab3-4269-ad07-ea4070f190fc',
  'Users.CreateUser': '8c37f308-42d4-4e87-b4a8-a5cb2df538e8',
  'Users.UpdateUser': '8b3ac789-a73e-4190-8c84-785f5650ffed',
  'Users.DeleteUser': 'b0f027fc-9b32-440f-865c-7b328ad462b1',
  'Users.ToggleUserActivation': '2cae6d02-e520-4856-9407-d81ec6e9d52f',
  'Users.ExportUsers': 'e65b9efd-3e51-4572-9850-91a3be6cfc55',
  'Users.CheckDocumentIdExists': 'bace47e0-adc8-4782-99b9-12b3307860b8',
  'Users.GetUserPermissions': 'f9bb837d-c5a2-4c92-99db-764065bab2e7',
  'Users.GrantOrRevokeUserPermissions': 'd380058d-474a-48b9-b707-27ac883570b5',
  'Users.AuditLogs': '36a6f545-dfc3-414c-bb2a-43d6ce7062bb',
  'Invitations.GetInvitations': '30bd3c42-0f97-40bb-a9dc-bb249918fef4',
  'Invitations.CreateInvitation': 'dcc13f06-dcbe-4505-b09d-c106bf3928f5',
  'Invitations.DeleteInvitation': 'dd490f59-16b7-4038-8f76-f5c2c7fe00d2',
  'Invitations.ExportInvitations': 'e6e527d9-8a04-4777-83f2-7cea4e0c948b',
  'Invitations.ResendInvitation': '72f6dcb7-e77a-42aa-9357-e36a699c080e',
  'Invitations.SetInvitationStatus': '0068ee56-302b-48b4-b9b3-d72deaea2f95',
  'Invitations.GetInvitationApprovals': '6b299403-a03d-45b7-8c6a-a04aa46fed96',
  'Invitations.GetInvitationApprovalDetail': 'da9eaf08-6a67-428a-bf15-49e6e1539247',
  'Invitations.GetInvitationApprovalsCount': '55eab17c-2f07-4260-b3b6-72cc0eb98288',
  'Invitations.ApproveInvitation': '9ad56164-da5c-464a-a923-ee2de441b6b2',
  'Invitations.RejectInvitation': '03493412-9651-4bc4-8311-bebd5ed08211',
  'SystemSettings.GetSystemSettings': '3d9b59d4-198a-4ac6-baf1-537c0e820b04',
  'SystemSettings.UpdatePasswordPolicy': 'c2f09256-bfdc-4c49-8b66-2c9540507455',
  'SystemSettings.UpsertSystemSettings': 'a9db9fb4-ba9a-4f79-bf45-6f161d377a53',
  'Roles.GetRoles': 'bcba789a-b883-46f5-acba-c8db223f7e0d',
  'Payers.GetPayersDropdown': '255c520b-41a9-4a89-a760-a02925f624b5',
  'Lookups.GetLookups': 'e3e43c58-c8f8-4f31-bbed-9e120a9a4478',
};

// ---- answers ---------------------------------------------------------------------------

export type UserAnswer = { status: number; text: string; validationErrors?: string[] };

const payloadOf = <T>(res: UserAnswer): T | null => {
  try {
    return ((JSON.parse(res.text) as { payload?: T }).payload ?? null) as T | null;
  } catch {
    return null;
  }
};

const fail = (what: string, res: UserAnswer): never => {
  throw new Error(`${what} answered ${res.status} ${answerText(res).slice(0, 400)}`);
};

/**
 * An unauthenticated call (ForgotPassword / ResetPassword / Login) - no token,
 * and the BODY IS NEVER LOGGED (it carries a password or a reset code).
 */
async function anonymous(page: Page, method: 'POST' | 'GET', path: string, data?: unknown): Promise<UserAnswer> {
  const response = await page.request.fetch(`${env.baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { data: data as Record<string, unknown> }),
    failOnStatusCode: false,
  });
  const text = await response.text();
  Logger.step(`${method} ${path} (anonymous) returned ${response.status()}`);
  // RAW on purpose (resetCodeOf reads the code from it): every EXPORTED caller scrubs before returning.
  return { status: response.status(), text };
}

/** Removes every token / code value from an answer's text (sign-in, ChangePassword and refresh answers carry new tokens). */
export function scrubTokens(text: string): string {
  return text
    .replace(/("(accessToken|refreshToken|browserToken|code|token)":")[^"]*"/gi, '$1<redacted>"')
    .replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]{4,}){0,2}/g, '<jwt>');
}

// ---- secrets ---------------------------------------------------------------------------

/**
 * A password held in memory only. Printing, string-concatenating or
 * JSON-serialising it yields "********" - only `reveal()` gives the value, and
 * only page objects that TYPE it call that. Never log `reveal()`.
 */
export class SuiteSecret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  get length(): number {
    return this.#value.length;
  }

  toString(): string {
    return '********';
  }

  toJSON(): string {
    return '********';
  }

  [inspect.custom](): string {
    return 'SuiteSecret(********)';
  }
}

// ---- password policy -------------------------------------------------------------------

export interface PasswordPolicy {
  requiredLength: number;
  maximumLength: number;
  requiredUniqueChars: number;
  requireNonAlphanumeric: boolean;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireDigit: boolean;
  requireChangeForNewUsers: boolean;
  passwordHistoryCount: number;
  expiryDays: number;
  concurrencyStamp?: string;
}

/** The values found on 2026-11-08 - the restore target if a snapshot is ever lost. */
export const PASSWORD_POLICY_BASELINE: Omit<PasswordPolicy, 'concurrencyStamp'> = {
  requiredLength: 8,
  maximumLength: 16,
  requiredUniqueChars: 7,
  requireNonAlphanumeric: true,
  requireLowercase: true,
  requireUppercase: true,
  requireDigit: true,
  requireChangeForNewUsers: true,
  passwordHistoryCount: 5,
  expiryDays: 90,
};

const POLICY_KEYS = Object.keys(PASSWORD_POLICY_BASELINE) as (keyof typeof PASSWORD_POLICY_BASELINE)[];

export async function readPasswordPolicy(page: Page): Promise<PasswordPolicy> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.passwordPolicyGet);
  const policy = payloadOf<PasswordPolicy>(res);
  if (!policy) fail('GetPasswordPolicy', res);
  return policy as PasswordPolicy;
}

/** PUT UpdatePasswordPolicy with `changes` over the CURRENT policy (fresh concurrencyStamp). Returns the answer - the caller restores. */
export async function requestUpdatePasswordPolicy(page: Page, changes: Partial<PasswordPolicy>): Promise<UserAnswer> {
  const current = await readPasswordPolicy(page);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.passwordPolicyUpdate, { ...current, ...changes, concurrencyStamp: current.concurrencyStamp });
}

/** Whether two policies hold the same rule values (the stamp ignored). */
export function samePolicy(a: Partial<PasswordPolicy>, b: Partial<PasswordPolicy>): boolean {
  return POLICY_KEYS.every((k) => a[k] === b[k]);
}

/** Writes `target` back and READS IT BACK; throws (loudly) when the read-back differs. */
export async function restorePasswordPolicy(page: Page, target: Partial<PasswordPolicy>): Promise<PasswordPolicy> {
  const wanted = Object.fromEntries(POLICY_KEYS.map((k) => [k, target[k]])) as Omit<PasswordPolicy, 'concurrencyStamp'>;
  const current = await readPasswordPolicy(page);
  if (!samePolicy(current, wanted)) {
    const res = await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.passwordPolicyUpdate, { ...wanted, concurrencyStamp: current.concurrencyStamp });
    if (res.status >= 300) fail('UpdatePasswordPolicy (restore)', res);
  }
  const back = await readPasswordPolicy(page);
  if (!samePolicy(back, wanted)) {
    throw new Error(`the password policy was NOT restored - read back ${JSON.stringify(back)}, wanted ${JSON.stringify(wanted)}. Restore it by hand (System Settings > Settings > Password Policy).`);
  }
  return back;
}

/**
 * A random password that meets `policy` (length min..max, the required classes,
 * the distinct-character count). Wrapped in a SuiteSecret - never logged.
 */
export function generatePassword(policy: Partial<PasswordPolicy> = PASSWORD_POLICY_BASELINE, length?: number): SuiteSecret {
  const min = Math.max(policy.requiredLength ?? 8, policy.requiredUniqueChars ?? 1, 8);
  const max = Math.max(min, policy.maximumLength ?? 16);
  const size = Math.min(max, Math.max(min, length ?? Math.min(max, 12)));
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*?';
  const pool = [upper, lower, digits, symbols];
  const used = new Set<string>();
  const pick = (set: string): string => {
    for (let i = 0; i < 50; i += 1) {
      const c = set[randomInt(set.length)];
      if (!used.has(c)) {
        used.add(c);
        return c;
      }
    }
    return set[randomInt(set.length)];
  };
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < size) chars.push(pick(pool[chars.length % pool.length]));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return new SuiteSecret(chars.join(''));
}

// ---- users -----------------------------------------------------------------------------

/** One role on a user, as the drawer sends it. */
export interface RoleAssignment {
  roleId: string;
  payerIds: string[];
}

/** The Add User drawer's body (POST CreateUser) - captured 2026-11-08. */
export interface UserBody {
  email: string;
  documentId: string;
  phoneNumber: string;
  isSuperAdmin: false;
  isSuspended: false;
  isStatic: false;
  arabicFirstName: string;
  arabicSecondName: string;
  arabicLastName: string;
  englishFirstName: string;
  englishSecondName: string;
  englishLastName: string;
  countryDialCodeId: string | null;
  genderId: string | null;
  nationalityId: string | null;
  identityTypeId: string | null;
  preferredLanguageId: string | null;
  preferredContactMethodId: string | null;
  isActive: boolean;
  /** `YYYY-MM-DD`. */
  dob: string | null;
  /** `YYYY/MM/DD` or null. */
  hijriDob: string | null;
  /** ISO date-time. */
  accountDeactivationDate: string | null;
  assignedRoles: RoleAssignment[];
}

/** GetUser's answer (the fields the suite reads). */
export interface UserRecord {
  id: string;
  userName: string;
  email: string;
  phoneNumber: string;
  emailConfirmed: boolean;
  isSuperAdmin: boolean;
  isSuspended: boolean;
  isStatic: boolean;
  isActive: boolean;
  englishFirstName: string;
  englishSecondName: string;
  englishLastName: string;
  fullEnglishName: string;
  arabicFirstName: string;
  arabicSecondName: string;
  arabicLastName: string;
  fullArabicName: string;
  countryDialCodeId: string | null;
  genderId: string | null;
  nationalityId: string | null;
  identityTypeId: string | null;
  preferredLanguageId: string | null;
  preferredContactMethodId: string | null;
  dob: string | null;
  hijriDob: string | null;
  accountDeactivationDate: string | null;
  lastLoginDate: string | null;
  concurrencyStamp: string;
  createdByName?: string;
  modifiedByName?: string | null;
  assignedRoles: { id: string; name: string; hasAssignedPayers: boolean; assignedPayers: { id: string; name?: string; payerNameEn?: string }[] }[];
}

/** One GetUsers row. */
export type UserListItem = Omit<UserRecord, 'concurrencyStamp' | 'assignedRoles' | 'dob' | 'hijriDob'> & { createdOn: string; modifiedOn: string | null };

/** The states `provisionSuiteUser` can build. */
export type UserState =
  /** Active, a password the suite does NOT know (system-issued). */
  | 'Active'
  /** Created with Is Active unticked (never activated, no password, emailConfirmed false). */
  | 'InactiveAtCreate'
  /** Created active, then deactivated (reason Other + details). */
  | 'Deactivated';

/** What a case may override on a suite user. */
export interface SuiteUserSpec {
  lastName?: string;
  englishSecondName?: string;
  arabicSecondName?: string;
  arabicLastName?: string;
  email?: string;
  nationality?: NationalityCode;
  identityType?: IdentityTypeCode;
  documentId?: string;
  /** `YYYY-MM-DD` (the Hijri date is converted by the app). */
  dob?: string;
  gender?: keyof typeof USER_LOOKUP.gender;
  phoneNumber?: string;
  dialCode?: keyof typeof USER_LOOKUP.countryDialCode;
  language?: keyof typeof USER_LOOKUP.preferredLanguage;
  contactMethod?: keyof typeof USER_LOOKUP.preferredContactMethod;
  /** Days from today (default 365). */
  deactivationInDays?: number;
  /** Role assignments; default: ONE suite role the fixture made (callers pass it). */
  roles?: RoleAssignment[];
}

/** A suite user as built. */
export interface ProvisionedUser {
  id: string;
  email: string;
  documentId: string;
  lastName: string;
  /** "QA Automation User<stamp>" - the list / profile name. */
  displayNameEn: string;
  isActive: boolean;
  roles: RoleAssignment[];
  record: UserRecord;
}

/** A document ID valid for its identity type (National ID 1xxxxxxxxx, Iqama 2xxxxxxxxx, GCC 12 digits, Passport letters + digits). */
export function userDocumentIdFor(type: IdentityTypeCode = 'nationalId'): string {
  const tail = `${String(Date.now()).slice(-6)}${String(randomInt(1000)).padStart(3, '0')}`;
  switch (type) {
    case 'iqama':
      return `2${tail}`;
    case 'gccId':
      return `9${tail}${randomInt(10)}${randomInt(10)}`;
    case 'passport':
      return `QA${tail}`;
    default:
      return `1${tail}`;
  }
}

export async function userDocumentIdExists(page: Page, documentId: string, excludeUserId?: string): Promise<boolean> {
  const query = `?documentId=${encodeURIComponent(documentId)}${excludeUserId ? `&excludeUserId=${encodeURIComponent(excludeUserId)}` : ''}`;
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.userCheckDocumentId}${query}`);
  return payloadOf<boolean>(res) === true;
}

/** A document ID valid for `type` that no user holds (checked through CheckDocumentIdExists). */
export async function uniqueUserDocumentId(page: Page, type: IdentityTypeCode = 'nationalId'): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const candidate = userDocumentIdFor(type);
    if (!(await userDocumentIdExists(page, candidate))) return candidate;
  }
  throw new Error(`no free ${type} document ID after 5 tries`);
}

/** The Hijri date (`YYYY/MM/DD`) the application gives a Gregorian `YYYY-MM-DD`. */
export async function hijriOf(page: Page, gregorian: string): Promise<string> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.hijriFromGregorian}?gregorianDate=${gregorian.slice(0, 10)}`);
  const hijri = payloadOf<{ hijri: string }>(res)?.hijri;
  if (!hijri) fail(`ConvertToHijri ${gregorian}`, res);
  return hijri as string;
}

/** `YYYY-MM-DD` of today (Riyadh, UTC+3) shifted by `days` and `years`. */
export function riyadhDate(days = 0, years = 0): string {
  const d = new Date(Date.now() + 3 * 3_600_000);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** `DD/MM/YYYY` (the drawer's date pickers) of a `YYYY-MM-DD`. */
export const userDayText = (isoDay: string): string => `${isoDay.slice(8, 10)}/${isoDay.slice(5, 7)}/${isoDay.slice(0, 4)}`;

/** The full CreateUser body for a suite user (Saudi, National ID, male, English, e-mail contact, deactivation in a year). */
export async function userBody(page: Page, spec: SuiteUserSpec = {}, isActive = true): Promise<UserBody> {
  const stamp = userStamp();
  const lastName = spec.lastName ?? suiteUserLastName(stamp);
  const identityType = spec.identityType ?? 'nationalId';
  const dob = spec.dob ?? '1990-05-15';
  return {
    email: spec.email ?? suiteUserEmail(stamp),
    documentId: spec.documentId ?? (await uniqueUserDocumentId(page, identityType)),
    phoneNumber: spec.phoneNumber ?? suiteMobileNumber(),
    isSuperAdmin: false,
    isSuspended: false,
    isStatic: false,
    arabicFirstName: SUITE_USER_ARABIC_FIRST,
    arabicSecondName: spec.arabicSecondName ?? '',
    arabicLastName: spec.arabicLastName ?? `اختبار ${arabicToken()}`,
    englishFirstName: SUITE_USER_FIRST_NAME,
    englishSecondName: spec.englishSecondName ?? '',
    englishLastName: lastName,
    countryDialCodeId: USER_LOOKUP.countryDialCode[spec.dialCode ?? '+966'],
    genderId: USER_LOOKUP.gender[spec.gender ?? 'male'],
    nationalityId: USER_LOOKUP.nationality[spec.nationality ?? 'saudi'],
    identityTypeId: USER_LOOKUP.identityType[identityType],
    preferredLanguageId: USER_LOOKUP.preferredLanguage[spec.language ?? 'en'],
    preferredContactMethodId: USER_LOOKUP.preferredContactMethod[spec.contactMethod ?? 'email'],
    isActive,
    dob,
    hijriDob: await hijriOf(page, dob),
    accountDeactivationDate: new Date(Date.now() + (spec.deactivationInDays ?? 365) * 86_400_000).toISOString(),
    assignedRoles: spec.roles ?? [],
  };
}

/** POST CreateUser with any body (validation cases send broken ones). */
export async function requestCreateUser(page: Page, body: Partial<UserBody> & Record<string, unknown>): Promise<UserAnswer> {
  return NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.userCreate, body);
}

export async function readUserOrNull(page: Page, id: string): Promise<UserRecord | null> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.userGet, { id });
  if (res.status === 404) return null;
  return payloadOf<UserRecord>(res);
}

export async function readUser(page: Page, id: string): Promise<UserRecord> {
  const record = await readUserOrNull(page, id);
  if (!record) throw new Error(`GetUser ${id} found no user`);
  return record;
}

/** POST GetUsers with `criteria` (pageNumber / rowsPerPage / sortBy / searchText / isActive / name / documentId / nationalityId / identityTypeId / mobileNumber / genderId). */
export async function listUsers(page: Page, criteria: Record<string, unknown> = {}, rowsPerPage = 100): Promise<{ items: UserListItem[]; totalRows: number }> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.userList, { pageNumber: 1, rowsPerPage, sortBy: 'CreatedOn desc', ...criteria });
  const users = payloadOf<{ users: { items: UserListItem[]; totalRows: number } }>(res)?.users;
  if (!users) fail('GetUsers', res);
  return users as { items: UserListItem[]; totalRows: number };
}

export interface UserDashboard {
  total: number;
  active: number;
  inactive: number;
  pendingApproval: number;
}

export async function readUserDashboard(page: Page): Promise<UserDashboard> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.userDashboard, {});
  const d = payloadOf<UserDashboard>(res);
  if (!d) fail('GetUsersDashboard', res);
  return d as UserDashboard;
}

export async function findUserByEmail(page: Page, email: string): Promise<UserListItem | null> {
  return (await listUsers(page, { searchText: email }, 10)).items.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/** Whether a user (record or row) is one the suite made: "QA" + "Automation User..." AND a qa.automation.* e-mail. */
export function isSuiteUser(user: Pick<UserRecord, 'email' | 'englishLastName'> | null | undefined): boolean {
  return !!user && user.email.toLowerCase().startsWith(SUITE_EMAIL_PREFIX) && /^Automation User/.test(user.englishLastName ?? '');
}

/** Throws unless `id` is a suite user - every writer calls it first. */
export async function assertSuiteUser(page: Page, id: string): Promise<UserRecord> {
  const record = await readUser(page, id);
  if (!isSuiteUser(record)) throw new Error(`refusing to change user ${record.userName} (${record.email}): not a suite user`);
  return record;
}

/** Builds a suite user in `state` (CreateUser, then ToggleUserActivation for Deactivated). */
export async function provisionSuiteUser(page: Page, state: UserState, spec: SuiteUserSpec = {}): Promise<ProvisionedUser> {
  const body = await userBody(page, spec, state !== 'InactiveAtCreate');
  const res = await requestCreateUser(page, body as unknown as Record<string, unknown>);
  const id = payloadOf<{ id: string }>(res)?.id;
  if (res.status >= 300 || !id) fail(`CreateUser "${body.englishLastName}"`, res);
  if (state === 'Deactivated') await deactivateUser(page, id as string, 'other', 'Deactivated by the automation suite.');
  const record = await readUser(page, id as string);
  Logger.step(`[provision] Suite user "${record.fullEnglishName}" (${record.email}) ${state}`);
  return {
    id: id as string,
    email: body.email,
    documentId: body.documentId,
    lastName: body.englishLastName,
    displayNameEn: suiteUserDisplayName(body.englishLastName),
    isActive: record.isActive,
    roles: body.assignedRoles,
    record,
  };
}

/** The Edit drawer's body for `record` plus `changes` (PUT UpdateUser: + id, userName = documentId, concurrencyStamp). */
export function updateBodyOf(record: UserRecord, changes: Partial<UserBody> = {}): Record<string, unknown> {
  const base: UserBody = {
    email: record.email,
    documentId: record.userName,
    phoneNumber: record.phoneNumber,
    isSuperAdmin: false,
    isSuspended: false,
    isStatic: false,
    arabicFirstName: record.arabicFirstName,
    arabicSecondName: record.arabicSecondName ?? '',
    arabicLastName: record.arabicLastName,
    englishFirstName: record.englishFirstName,
    englishSecondName: record.englishSecondName ?? '',
    englishLastName: record.englishLastName,
    countryDialCodeId: record.countryDialCodeId,
    genderId: record.genderId,
    nationalityId: record.nationalityId,
    identityTypeId: record.identityTypeId,
    preferredLanguageId: record.preferredLanguageId,
    preferredContactMethodId: record.preferredContactMethodId,
    isActive: record.isActive,
    dob: record.dob,
    hijriDob: record.hijriDob,
    accountDeactivationDate: record.accountDeactivationDate,
    assignedRoles: record.assignedRoles.map((r) => ({ roleId: r.id, payerIds: r.assignedPayers.map((p) => p.id) })),
  };
  const merged = { ...base, ...changes };
  return { ...merged, id: record.id, userName: merged.documentId, concurrencyStamp: record.concurrencyStamp };
}

/** PUT UpdateUser on a SUITE user with `changes` (reads the record first for the stamp). */
export async function updateSuiteUser(page: Page, id: string, changes: Partial<UserBody>): Promise<UserAnswer> {
  const record = await assertSuiteUser(page, id);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.userUpdate, updateBodyOf(record, changes));
}

/** POST ToggleUserActivation (suite users only). */
export async function setUserActive(page: Page, id: string, isActive: boolean, reason?: DeactivationReasonCode, details?: string | null): Promise<UserAnswer> {
  await assertSuiteUser(page, id);
  return NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.userToggleActivation, {
    id,
    isActive,
    inactivationReasonId: isActive ? null : (reason ? USER_LOOKUP.deactivationReason[reason] : null),
    inactivationDetails: isActive ? null : (details ?? null),
  });
}

export async function deactivateUser(page: Page, id: string, reason: DeactivationReasonCode = 'other', details = 'Deactivated by the automation suite.'): Promise<UserAnswer> {
  const res = await setUserActive(page, id, false, reason, details);
  if (res.status >= 300) fail(`deactivate user ${id}`, res);
  return res;
}

export async function activateUser(page: Page, id: string): Promise<UserAnswer> {
  const res = await setUserActive(page, id, true);
  if (res.status >= 300) fail(`activate user ${id}`, res);
  return res;
}

/** DELETE DeleteUser?id= (suite users only). A soft-looking delete: GetUser then 404 and the document ID is free again. */
export async function deleteSuiteUser(page: Page, id: string): Promise<UserAnswer> {
  await assertSuiteUser(page, id);
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.userDelete}?id=${encodeURIComponent(id)}`);
}

/** Teardown: deletes a suite user (deactivates it when the delete is refused). Never touches another account. */
export async function discardSuiteUser(page: Page, id: string): Promise<'gone' | 'inactivated' | 'left'> {
  const record = await readUserOrNull(page, id).catch(() => null);
  if (!record) return 'gone';
  if (!isSuiteUser(record)) {
    Logger.step(`[fixture] NOT discarding user ${record.userName} (${record.email}) - not a suite user`);
    return 'left';
  }
  const res = await NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.userDelete}?id=${encodeURIComponent(id)}`).catch(() => null);
  if (res && res.status < 300) {
    Logger.step(`[fixture] Deleted suite user "${record.fullEnglishName}"`);
    return 'gone';
  }
  Logger.warn(`[fixture] Suite user "${record.fullEnglishName}" could not be deleted (${res ? answerText(res).slice(0, 160) : 'no answer'})`);
  if (record.isActive) {
    const off = await setUserActive(page, id, false, 'other', 'Left by the automation suite: it could not be deleted.').catch(() => null);
    if (off && off.status < 300) return 'inactivated';
  }
  return 'left';
}

// ---- roles -----------------------------------------------------------------------------

export interface RoleSummary {
  id: string;
  name: string;
  arabicName: string;
  isActive: boolean;
  hasAssignedPayers: boolean;
  canApproveOwnRequests: boolean;
  isStatic: boolean;
  isPredefined: boolean;
}

export async function listRoles(page: Page): Promise<RoleSummary[]> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleList, { rowsPerPage: 1000 });
  return payloadOf<{ roles: { items: RoleSummary[] } }>(res)?.roles.items ?? [];
}

/** The roles the SIGNED-IN user may assign (the answer includes inactive roles). */
export async function listAssignableRoles(page: Page): Promise<RoleSummary[]> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleAssignable, { rowsPerPage: 1000 });
  return payloadOf<{ roles: { items: RoleSummary[] } }>(res)?.roles.items ?? [];
}

export async function roleByName(page: Page, name: string): Promise<RoleSummary | null> {
  return (await listRoles(page)).find((r) => r.name === name) ?? null;
}

type PermissionNode = { id: string; key: string; englishName: string; permissions?: PermissionNode[] };

/** Every catalogue permission key -> id (GetRolePermissions of any role; the catalogue is shared). */
export async function permissionCatalogue(page: Page, anyRoleId: string): Promise<Map<string, string>> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.rolePermissions, { roleId: anyRoleId, loadingOnDemand: false });
  const tree = payloadOf<{ requestedPermissions: PermissionNode[] }>(res)?.requestedPermissions ?? [];
  const out = new Map<string, string>();
  const walk = (n: PermissionNode): void => {
    out.set(n.key, n.id);
    for (const c of n.permissions ?? []) walk(c);
  };
  tree.forEach(walk);
  return out;
}

/** Catalogue ids of `keys` (the table above; the live catalogue for any other key). */
export async function permissionIds(page: Page, keys: readonly string[], anyRoleId?: string): Promise<string[]> {
  const missing = keys.filter((k) => !USER_RIGHT_ID[k]);
  let live = new Map<string, string>();
  if (missing.length) {
    const seed = anyRoleId ?? (await listRoles(page))[0]?.id;
    if (seed) live = await permissionCatalogue(page, seed);
  }
  return keys.map((k) => {
    const id = USER_RIGHT_ID[k] ?? live.get(k);
    if (!id) throw new Error(`the permission catalogue has no "${k}"`);
    return id;
  });
}

/** What a suite role is built with. */
export interface SuiteRoleSpec {
  /** Permission KEYS, e.g. ['Users.GetUsers', 'Users.CreateUser']. */
  rights: readonly string[];
  /** "Has Assigned Payers?" (payer-scoped). */
  hasAssignedPayers?: boolean;
  isActive?: boolean;
  /** Role ids that may ASSIGN this role (the API's meaning of `assignableRoleIds`; to let a session assign roles use `letRoleAssign`). */
  assignableRoleIds?: string[];
  name?: string;
}

export interface ProvisionedRole {
  id: string;
  name: string;
  hasAssignedPayers: boolean;
  rights: string[];
}

/** POST CreateRole -> a suite role "QA Automation Role <stamp>" with exactly `rights`. */
export async function createSuiteRole(page: Page, spec: SuiteRoleSpec): Promise<ProvisionedRole> {
  const name = spec.name ?? suiteRoleName();
  if (!name.startsWith(SUITE_ROLE_PREFIX)) throw new Error(`"${name}" is not a suite role name`);
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleCreate, {
    name,
    arabicName: `دور اختبار ${arabicToken()}`,
    englishDescription: 'Created by the automation suite',
    arabicDescription: '',
    isActive: spec.isActive ?? true,
    hasAssignedPayers: spec.hasAssignedPayers ?? false,
    canApproveOwnRequests: false,
    selectedPermissionIds: await permissionIds(page, spec.rights),
    assignableRoleIds: spec.assignableRoleIds ?? [],
  });
  const id = payloadOf<{ id: string }>(res)?.id;
  if (res.status >= 300 || !id) fail(`CreateRole "${name}"`, res);
  Logger.step(`[provision] Suite role "${name}" (${spec.rights.length} rights${spec.hasAssignedPayers ? ', payer-scoped' : ''})`);
  return { id: id as string, name, hasAssignedPayers: !!spec.hasAssignedPayers, rights: [...spec.rights] };
}

/** PUT UpdateRole on a SUITE role: replaces its rights (GetRole for the stamp first). */
export async function updateSuiteRoleRights(page: Page, roleId: string, rights: readonly string[]): Promise<UserAnswer> {
  const g = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleGet, { id: roleId });
  const role = payloadOf<Record<string, unknown> & { name: string; concurrencyStamp: string; assignableRoleIds?: string[] }>(g);
  if (!role) fail(`GetRole ${roleId}`, g);
  if (!String(role?.name).startsWith(SUITE_ROLE_PREFIX)) throw new Error(`refusing to change role "${role?.name}": not a suite role`);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.roleUpdateIdentity, {
    id: roleId,
    name: role?.name,
    arabicName: role?.arabicName,
    englishDescription: role?.englishDescription ?? '',
    arabicDescription: role?.arabicDescription ?? '',
    isActive: role?.isActive ?? true,
    hasAssignedPayers: role?.hasAssignedPayers ?? false,
    canApproveOwnRequests: false,
    concurrencyStamp: role?.concurrencyStamp,
    selectedPermissionIds: await permissionIds(page, rights),
    assignableRoleIds: role?.assignableRoleIds ?? [],
  });
}

/**
 * Lets the users of `assignerRoleId` assign each of `targetRoleIds` (all SUITE roles).
 *
 * A role's `assignableRoleIds` lists the roles that may ASSIGN IT - not the roles
 * it may assign (verified live 2026-11-08: the shared "Payer Admin" account's
 * GetAssignableRoles answered "Formulary and policy roles" and "System
 * Administration", the two roles whose `assignableRoleIds` name Payer Admin,
 * and not the two ids on Payer Admin's own list; a suite session whose own role
 * listed two suite roles got [] until those two roles named the session's role).
 * So the TARGET roles are updated (GetRole + PUT UpdateRole, rights unchanged).
 */
export async function letRoleAssign(page: Page, assignerRoleId: string, targetRoleIds: readonly string[]): Promise<void> {
  for (const targetId of targetRoleIds) {
    const g = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.roleGet, { id: targetId });
    const role = payloadOf<Record<string, unknown> & { name: string; concurrencyStamp: string; selectedPermissionIds?: string[]; assignableRoleIds?: string[] }>(g);
    if (!role) fail(`GetRole ${targetId}`, g);
    if (!String(role?.name).startsWith(SUITE_ROLE_PREFIX)) throw new Error(`refusing to change role "${role?.name}": not a suite role`);
    const assigners = [...new Set([...(role?.assignableRoleIds ?? []), assignerRoleId])];
    const res = await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.roleUpdateIdentity, {
      id: targetId,
      name: role?.name,
      arabicName: role?.arabicName,
      englishDescription: role?.englishDescription ?? '',
      arabicDescription: role?.arabicDescription ?? '',
      isActive: role?.isActive ?? true,
      hasAssignedPayers: role?.hasAssignedPayers ?? false,
      canApproveOwnRequests: false,
      concurrencyStamp: role?.concurrencyStamp,
      selectedPermissionIds: role?.selectedPermissionIds ?? [],
      assignableRoleIds: assigners,
    });
    if (res.status >= 300) fail(`UpdateRole (assignable by ${assignerRoleId}) on "${role?.name}"`, res);
    Logger.step(`[provision] Suite role "${role?.name}" may now be assigned by role ${assignerRoleId}`);
  }
}

/** Teardown: deletes a suite role (DELETE DeleteRole?id=). Users holding it must be gone first. */
export async function discardSuiteRole(page: Page, id: string): Promise<'gone' | 'left'> {
  const role = (await listRoles(page).catch(() => [] as RoleSummary[])).find((r) => r.id === id);
  if (!role) return 'gone';
  if (!role.name.startsWith(SUITE_ROLE_PREFIX)) {
    Logger.step(`[fixture] NOT deleting role "${role.name}" - not a suite role`);
    return 'left';
  }
  const res = await NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.roleDelete}?id=${encodeURIComponent(id)}`).catch(() => null);
  if (res && res.status < 300) {
    Logger.step(`[fixture] Deleted suite role "${role.name}"`);
    return 'gone';
  }
  Logger.warn(`[fixture] Suite role "${role.name}" could not be deleted (${res ? answerText(res).slice(0, 160) : 'no answer'})`);
  return 'left';
}

// ---- payers ----------------------------------------------------------------------------

/** The payer dropdown (GET Payers/GetPayersDropdown): `{ id, payerNameEn, payerNameAr, statusId }`. */
export async function payerDropdown(page: Page): Promise<{ id: string; payerNameEn: string; payerNameAr: string; statusId?: string }[]> {
  type Row = { id: string; payerNameEn: string; payerNameAr: string; statusId?: string };
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.payerDropdown);
  const p = payloadOf<Row[]>(res);
  if (p) return p;
  try {
    const raw = JSON.parse(res.text) as unknown;
    return Array.isArray(raw) ? (raw as Row[]) : [];
  } catch {
    return [];
  }
}

export async function payerIdByName(page: Page, name: string): Promise<string> {
  const p = (await payerDropdown(page)).find((x) => x.payerNameEn === name);
  if (!p) throw new Error(`no payer "${name}" in the payer dropdown`);
  return p.id;
}

// ---- invitations -----------------------------------------------------------------------

export interface InvitationItem {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  payerId: string | null;
  /** Pending | Paused | Completed | Expired | PendingApproval | Rejected ... */
  status: string;
  statusName: string;
  expiresOn: string;
  acceptedOn: string | null;
  createdOn: string;
  modifiedOn: string | null;
}

/** The Status filter's request values (GetInvitations `status`, an enum NUMBER): Pending = 0 (verified); the rest follow the dropdown order (unverified). */
export const INVITATION_STATUS_VALUE = { Pending: 0, Active: 1, Paused: 2, Completed: 3, Expired: 4, 'Pending Approval': 5, Rejected: 6 } as const;

export async function listInvitations(page: Page, criteria: Record<string, unknown> = {}, rowsPerPage = 100): Promise<{ items: InvitationItem[]; totalRows: number }> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.invitationList, { pageNumber: 1, rowsPerPage, sortBy: 'CreatedOn desc', ...criteria });
  const inv = payloadOf<{ invitations: { items: InvitationItem[]; totalRows: number } }>(res)?.invitations;
  if (!inv) fail('GetInvitations', res);
  return inv as { items: InvitationItem[]; totalRows: number };
}

export async function findInvitationByEmail(page: Page, email: string): Promise<InvitationItem | null> {
  return (await listInvitations(page, { searchText: email }, 20)).items.find((i) => i.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/** POST CreateInvitation `{ email, roleId, payerId, expiryDays: 5 }` (the drawer sends one call per e-mail chip). */
export async function requestCreateInvitation(page: Page, body: { email: string; roleId: string; payerId?: string | null; expiryDays?: number }): Promise<UserAnswer> {
  return NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.invitationCreate, { payerId: null, expiryDays: 5, ...body });
}

export interface ProvisionedInvitation {
  id: string;
  email: string;
  roleId: string;
  payerId: string | null;
  item: InvitationItem;
}

export async function createSuiteInvitation(page: Page, roleId: string, payerId: string | null = null, email = suiteInvitationEmail()): Promise<ProvisionedInvitation> {
  if (!email.startsWith(SUITE_EMAIL_PREFIX)) throw new Error(`"${email}" is not a suite e-mail`);
  const res = await requestCreateInvitation(page, { email, roleId, payerId });
  const id = payloadOf<{ id: string }>(res)?.id;
  if (res.status >= 300 || !id) fail(`CreateInvitation ${email}`, res);
  const item = await findInvitationByEmail(page, email);
  if (!item) throw new Error(`invitation ${email} was created (${id}) but is not listed`);
  Logger.step(`[provision] Suite invitation ${email} (${item.statusName})`);
  return { id: id as string, email, roleId, payerId, item };
}

/** Teardown: deletes a suite invitation (DELETE DeleteInvitation/{id}). */
export async function discardSuiteInvitation(page: Page, id: string, email: string): Promise<'gone' | 'left'> {
  if (!email.toLowerCase().startsWith(SUITE_EMAIL_PREFIX)) {
    Logger.step(`[fixture] NOT deleting invitation ${email} - not a suite address`);
    return 'left';
  }
  const res = await NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.invitationDelete}/${encodeURIComponent(id)}`).catch(() => null);
  if (res && (res.status < 300 || res.status === 404)) return 'gone';
  Logger.warn(`[fixture] Suite invitation ${email} could not be deleted (${res ? answerText(res).slice(0, 160) : 'no answer'})`);
  return 'left';
}

// ---- passwords, sign-in ----------------------------------------------------------------

/** POST Account/ForgotPassword `{ email }` anonymously. The answer's payload carries `code` (null for an unknown address) - never log it. */
export async function requestForgotPassword(page: Page, email: string): Promise<UserAnswer & { codePresent: boolean; displayConfirmPasswordLink: boolean | null }> {
  const res = await anonymous(page, 'POST', ApiEndpoints.accountForgotPassword, { email });
  const p = payloadOf<{ code: string | null; displayConfirmPasswordLink?: boolean }>(res);
  // The code itself is NOT returned to the caller's logs: only whether it was there.
  return { status: res.status, text: scrubTokens(res.text), codePresent: !!p?.code, displayConfirmPasswordLink: p?.displayConfirmPasswordLink ?? null };
}

/** The reset code for a SUITE address, from ForgotPassword's own answer (the same code the e-mailed link carries). */
async function resetCodeOf(page: Page, email: string): Promise<SuiteSecret> {
  if (!email.toLowerCase().startsWith(SUITE_EMAIL_PREFIX)) throw new Error(`refusing to reset ${email}: not a suite address`);
  const res = await anonymous(page, 'POST', ApiEndpoints.accountForgotPassword, { email });
  const code = payloadOf<{ code: string | null }>(res)?.code;
  if (!code) throw new Error(`ForgotPassword for ${email} answered ${res.status} without a reset code (no confirmed e-mail / no password yet?)`);
  return new SuiteSecret(code);
}

/** A fresh reset code (a SuiteSecret) for a suite address - for cases that drive the reset page themselves (`resetPasswordPage.openWithCode`). */
export async function suiteResetCode(page: Page, email: string): Promise<SuiteSecret> {
  return resetCodeOf(page, email);
}

/** POST Account/ResetPassword anonymously - every field explicit (validation cases send broken ones). */
export async function requestResetPassword(page: Page, body: { email: string; code: SuiteSecret | string; password: SuiteSecret | string; confirmPassword: SuiteSecret | string }): Promise<UserAnswer> {
  const reveal = (v: SuiteSecret | string): string => (v instanceof SuiteSecret ? v.reveal() : v);
  const res = await anonymous(page, 'POST', ApiEndpoints.accountResetPassword, { email: body.email, code: reveal(body.code), password: reveal(body.password), confirmPassword: reveal(body.confirmPassword) });
  return { status: res.status, text: scrubTokens(res.text) };
}

/**
 * Gives a SUITE user a password the suite knows: ForgotPassword (its answer
 * carries the code) + ResetPassword. Works for any suite user with a confirmed
 * e-mail and a password (created ACTIVE, or activated once); it also clears a
 * pending forced change. Returns the password as a SuiteSecret.
 */
export async function establishSuitePassword(page: Page, email: string, policy?: Partial<PasswordPolicy>): Promise<SuiteSecret> {
  const code = await resetCodeOf(page, email);
  const password = generatePassword(policy ?? PASSWORD_POLICY_BASELINE);
  const res = await requestResetPassword(page, { email, code, password, confirmPassword: password });
  if (res.status >= 300) fail(`ResetPassword for ${email}`, res);
  Logger.step(`[provision] A known password was set for ${email} through the reset flow`);
  return password;
}

/** POST Account/Login anonymously (no browser) - the sign-in checks without a page. Wrong-password attempts: SUITE users only. */
export async function requestSignIn(page: Page, username: string, password: SuiteSecret | string): Promise<UserAnswer & { message: string; lockoutUntil: string | null; requiresTwoFactor: boolean | null }> {
  const res = await anonymous(page, 'POST', ApiEndpoints.accountLogin, { email: username, password: password instanceof SuiteSecret ? password.reveal() : password });
  let message = '';
  let lockoutUntil: string | null = null;
  let requiresTwoFactor: boolean | null = null;
  try {
    const body = JSON.parse(res.text) as { successMessage?: string; ErrorMessage?: string; errorMessage?: string; payload?: { lockoutUntil?: string | null; requiresTwoFactor?: boolean } };
    message = String(body.ErrorMessage ?? body.errorMessage ?? body.successMessage ?? '');
    lockoutUntil = body.payload?.lockoutUntil ?? null;
    requiresTwoFactor = body.payload?.requiresTwoFactor ?? null;
  } catch {
    /* not JSON */
  }
  // Tokens never leave this function.
  return { status: res.status, text: res.status < 300 ? '<signed in>' : scrubTokens(res.text), message, lockoutUntil, requiresTwoFactor };
}

/** POST Manage/ChangePassword as the page's signed-in user. */
export async function requestChangePassword(page: Page, oldPassword: SuiteSecret | string, newPassword: SuiteSecret | string, confirmPassword: SuiteSecret | string = newPassword): Promise<UserAnswer> {
  const reveal = (v: SuiteSecret | string): string => (v instanceof SuiteSecret ? v.reveal() : v);
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.manageChangePassword, { oldPassword: reveal(oldPassword), newPassword: reveal(newPassword), confirmPassword: reveal(confirmPassword) });
  return { ...res, text: scrubTokens(res.text) };
}

/** The permission keys the page's signed-in account is told it holds. */
export async function currentPermissions(page: Page): Promise<string[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.manageCurrentPermissions);
  return payloadOf<{ permissions: string[] }>(res)?.permissions ?? [];
}

// ---- the e-mail log (Notification Center audit) ------------------------------------------

export interface TriggerExecution {
  id: string;
  triggerName: string | null;
  /** firstActivation | forgetPassword | invitation | ... */
  actionCode: string;
  channel: string;
  recipientName: string;
  recipientAddress: string;
  /** Sent | Retrying | Failed. */
  status: string;
  createdOn: string;
  subject?: string;
  /** HTML. */
  body?: string;
  errorMessage?: string | null;
}

/** The e-mails the platform tried to send to a SUITE address (newest first). */
export async function emailsTo(page: Page, address: string, pages = 3): Promise<TriggerExecution[]> {
  if (!address.toLowerCase().startsWith(SUITE_EMAIL_PREFIX)) throw new Error(`refusing to read the e-mails of ${address}: not a suite address`);
  const out: TriggerExecution[] = [];
  for (let n = 1; n <= pages; n += 1) {
    const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.triggerExecutions, { pageNumber: n, rowsPerPage: 50 });
    const items = payloadOf<{ items: TriggerExecution[] }>(res)?.items ?? [];
    out.push(...items.filter((i) => i.recipientAddress?.toLowerCase() === address.toLowerCase()));
    if (items.length < 50) break;
  }
  return out;
}

/** One e-mail with its subject and HTML body. */
export async function readEmail(page: Page, id: string): Promise<TriggerExecution> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.triggerExecution, { id });
  const e = payloadOf<TriggerExecution>(res);
  if (!e) fail(`GetTriggerExecution ${id}`, res);
  if (!(e as TriggerExecution).recipientAddress.toLowerCase().startsWith(SUITE_EMAIL_PREFIX)) throw new Error('refusing to read an e-mail that was not sent to a suite address');
  return e as TriggerExecution;
}

/** Waits (polling) for an e-mail of `actionCode` to a suite address, created after `since` (ISO). */
export async function waitForEmail(page: Page, address: string, actionCode: string, since?: string, timeoutMs = 60_000): Promise<TriggerExecution> {
  const deadline = Date.now() + timeoutMs;
  const after = since ? Date.parse(since) - 5_000 : 0;
  while (Date.now() < deadline) {
    const hit = (await emailsTo(page, address, 1)).find((e) => e.actionCode === actionCode && Date.parse(e.createdOn) >= after);
    // The log row appears FIRST ("Processing", subject null, body ""); the subject and body are filled a
    // few seconds later (probe 2026-11-08) - returning the bare row made 20546 / 20767 / 20785 read nothing.
    if (hit) {
      const mail = await readEmail(page, hit.id);
      if ((mail.body ?? '') !== '' && (mail.subject ?? '') !== '') return mail;
    }
    await page.waitForTimeout(3_000);
  }
  throw new Error(`no "${actionCode}" e-mail to ${address} within ${timeoutMs / 1000} s`);
}

/** The links of an e-mail body as `{ path, params }` - the VALUES of `code` / `token` are never returned. */
export function emailLinks(body: string): { href: string; host: string; path: string; params: string[] }[] {
  return [...body.matchAll(/href="([^"]+)"/g)].map((m) => {
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'));
      return { href: `${u.origin}${u.pathname}`, host: u.host, path: u.pathname, params: [...u.searchParams.keys()] };
    } catch {
      return { href: '', host: '', path: '', params: [] };
    }
  });
}

/** The reset code inside a Forget Password e-mail body (a SuiteSecret), for the cases that must use the e-mailed link itself. */
export function resetCodeFromEmail(body: string): SuiteSecret | null {
  for (const m of body.matchAll(/href="([^"]+)"/g)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'));
      const code = u.searchParams.get('code');
      if (u.pathname.endsWith('/reset-password') && code) return new SuiteSecret(code);
    } catch {
      /* skip */
    }
  }
  return null;
}
