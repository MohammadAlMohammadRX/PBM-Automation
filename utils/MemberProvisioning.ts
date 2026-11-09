import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { env } from '../constants/EnvironmentConfig';
import { ACCESS_TOKEN_KEY } from '../data/payers/lifecycleGuardrails.data';
import {
  POLICY_SUITE_PAYER,
  addPolicyMember,
  discardSuitePolicy,
  provisionSuitePolicy,
  readPolicy,
  readPolicyMembers,
  requestApprovePolicy,
  submitPolicy,
  waitForPolicy,
  type DiscardOutcome,
  type PolicyMember,
  type ProvisionedPolicy,
  type RelationshipCode,
  type SuitePolicySpec,
} from './PolicyProvisioning';

/**
 * Members for the Member suite (Feature 14375), built through the application's
 * own API - the same calls the Member screens make, their bodies CAPTURED from
 * the Add / Edit wizard on 2026-11-05 (reports/member/Member-Foundation-Notes.md).
 *
 * Every member the suite creates is named `QA Automation Member<stamp>` (English
 * first "QA", second "Automation", last "Member<stamp>") with an Arabic name of
 * Arabic LETTERS only (`كيو اختبار <letters>`: the server refuses digits and Latin
 * - "Arabic name must contain only Arabic characters."), a unique e-mail and a
 * document ID valid for its identity type that no member holds (checked through
 * CheckDocumentIdExists before use). Nothing here changes a member without the
 * suite name: every writer checks it first (assertSuiteOwned).
 *
 * NO APPROVAL WORKFLOW (verified 2026-11-05): create, edit, activate, deactivate
 * and delete take effect at once.
 *
 * DELETE is SOFT (the audit records an UPDATE; GetMember answers 404 "Unable to
 * load member."). A member whose only enrolment is in a DRAFT policy IS deleted
 * (2026-11-05); see the notes for an approved enrolment. A member the delete
 * refuses is INACTIVATED at teardown instead.
 */

/** The English first and second names of every suite member. */
export const SUITE_MEMBER_FIRST_NAME = 'QA';
export const SUITE_MEMBER_SECOND_NAME = 'Automation';
/** The display-name prefix of every suite member ("QA Automation Member<stamp>"). */
export const SUITE_MEMBER_PREFIX = `${SUITE_MEMBER_FIRST_NAME} ${SUITE_MEMBER_SECOND_NAME}`;
/** The Arabic first / second names of every suite member (letters only). */
export const SUITE_MEMBER_ARABIC_FIRST = 'كيو';
export const SUITE_MEMBER_ARABIC_SECOND = 'اختبار';

export type MemberAnswer = { status: number; text: string; validationErrors?: string[] };
type Answer = MemberAnswer;

const fail = (name: string, what: string, res: Answer): never => {
  throw new Error(`could not provision member "${name}": ${what} answered ${res.status} ${answerText(res).slice(0, 400)}`);
};

const payloadOrNull = <T>(res: Answer): T | null => {
  try {
    return (JSON.parse(res.text) as { payload: T }).payload ?? null;
  } catch {
    return null;
  }
};

/** Every message an answer carries (success message, error, validation reasons) as one string. */
export function answerText(res: Answer): string {
  try {
    const body = JSON.parse(res.text) as Record<string, unknown>;
    const parts = [body.successMessage, body.ErrorMessage, body.errorMessage]
      .filter((v) => typeof v === 'string' && v !== '') as string[];
    const errors = (body.ValidationErrors ?? body.validationErrors ?? []) as { Reason?: string; reason?: string }[];
    for (const e of errors) parts.push(String(e.Reason ?? e.reason ?? ''));
    return parts.join(' | ') || res.text.slice(0, 400);
  } catch {
    return res.text.slice(0, 400);
  }
}

/** The validation reasons of an error answer ("Arabic name must contain only Arabic characters."), else its ErrorMessage. */
export function answerReasons(res: Answer): string[] {
  try {
    const body = JSON.parse(res.text) as { ValidationErrors?: { Reason?: string }[]; ErrorMessage?: string };
    const reasons = (body.ValidationErrors ?? []).map((e) => String(e.Reason ?? ''));
    return reasons.length ? reasons : [String(body.ErrorMessage ?? '')].filter((r) => r !== '');
  } catch {
    return [];
  }
}

// ---- names, dates, document IDs -------------------------------------------------------

let stampCounter = 0;

/** A unique stamp for suite names and e-mails. */
export const memberStamp = (): string => `${Date.now().toString(36)}${(stampCounter++ % 36).toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36)}`;

/** A fresh English last name: `Member<stamp>` (letters and digits only - the English-letters rule). */
export const suiteMemberLastName = (stamp = memberStamp()): string => `Member${stamp}`;

/** The display name a suite member gets: `QA Automation Member<stamp>` (no third name). */
export const suiteMemberDisplayName = (lastName: string): string => `${SUITE_MEMBER_PREFIX} ${lastName}`;

/** The 28 Arabic letters - the alphabet of every suite Arabic name. */
const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

/** A unique token of Arabic LETTERS only: the current time plus a random part in base 28. */
export function arabicLettersToken(): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  let out = '';
  while (n > 0) {
    out = ARABIC_LETTERS[n % 28] + out;
    n = Math.floor(n / 28);
  }
  return out;
}

/** A unique suite e-mail. */
export const suiteMemberEmail = (stamp = memberStamp()): string => `qa.member.${stamp}@example.com`;

/** A Saudi mobile number as the form takes it: 9 digits starting with 5 (the +966 prefix is the dial code). */
export const suiteMobileNumber = (): string => `5${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`;

/**
 * `YYYY-MM-DD` of the day `days` from today IN RIYADH (UTC+3) - the
 * application's calendar (dates of birth are date-only).
 */
export function riyadhDay(days = 0): string {
  const d = new Date(Date.now() + 3 * 3_600_000);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` of today (Riyadh) `years` years ago - a birthday TODAY (19888). 29 Feb falls back to 28 Feb. */
export function birthdayToday(years: number): string {
  const [y, m, d] = riyadhDay(0).split('-').map(Number);
  const day = m === 2 && d === 29 ? 28 : d;
  return `${y - years}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `DD/MM/YYYY` - how the wizard's Date of Birth picker takes a date and the view shows it. */
export function memberDayText(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * The identity types the lookup offers (2026-11-05: ONLY these four - there is
 * no border / visitor / pilgrim / company type, whatever the AC lists) and the
 * document-ID rule the wizard and the server apply to each:
 *   nationalId  10 digits starting 1   ("Must be 10 digits starting with 1 (Saudi National ID).")
 *   iqama       10 digits starting 2   ("Must be 10 digits starting with 2 (Iqama / Residence Permit).")
 *   passport    letters and digits     ("Letters and numbers only, no special characters.")
 *   gccId       8 to 15 digits         ("Must be 8 to 15 digits.")
 */
export type IdentityTypeCode = 'nationalId' | 'iqama' | 'passport' | 'gccId';

/** A document ID shaped for the identity type (unique by time + random; uniqueness is checked by uniqueDocumentId). */
export function documentIdFor(type: IdentityTypeCode = 'nationalId'): string {
  const tail = `${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  switch (type) {
    case 'iqama': return `2${tail}`;
    case 'passport': return `QA${tail}`;
    case 'gccId': return `7${tail}${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`;
    default: return `1${tail}`;
  }
}

/** Whether a member (deleted ones aside) already holds the document ID (CheckDocumentIdExists). */
export async function documentIdExists(page: Page, documentId: string, excludeMemberId?: string): Promise<boolean> {
  const query = `?documentId=${encodeURIComponent(documentId)}${excludeMemberId ? `&excludeMemberId=${excludeMemberId}` : ''}`;
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.memberCheckDocumentId}${query}`);
  return payloadOrNull<boolean>(res) === true;
}

/** Whether a member already holds the e-mail (CheckEmailExists) - the SCREEN refuses it; the server accepts a duplicate. */
export async function emailExists(page: Page, email: string, excludeMemberId?: string): Promise<boolean> {
  const query = `?email=${encodeURIComponent(email)}${excludeMemberId ? `&excludeMemberId=${excludeMemberId}` : ''}`;
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.memberCheckEmail}${query}`);
  return payloadOrNull<boolean>(res) === true;
}

/** A document ID for the type that no member holds (tries up to 5 times). */
export async function uniqueDocumentId(page: Page, type: IdentityTypeCode = 'nationalId'): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const candidate = documentIdFor(type);
    if (!(await documentIdExists(page, candidate))) return candidate;
  }
  throw new Error(`no free ${type} document ID after 5 tries`);
}

/** The Hijri date (`YYYY/MM/DD`) the application gives a Gregorian date (GET HijriDates/ConvertToHijri). */
export async function toHijri(page: Page, gregorian: string): Promise<string> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.hijriFromGregorian}?gregorianDate=${gregorian.slice(0, 10)}`);
  const hijri = payloadOrNull<{ hijri: string }>(res)?.hijri;
  if (!hijri) throw new Error(`ConvertToHijri ${gregorian} answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return hijri;
}

/** The Gregorian date (`YYYY-MM-DD`) of a Hijri date `YYYY/MM/DD` (GET HijriDates/ConvertToGregorian). */
export async function toGregorian(page: Page, hijri: string): Promise<string> {
  const [hijriYear, hijriMonth, hijriDay] = hijri.split('/').map(Number);
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.hijriToGregorian}?hijriYear=${hijriYear}&hijriMonth=${hijriMonth}&hijriDay=${hijriDay}`);
  const day = payloadOrNull<{ gregorianDate: string }>(res)?.gregorianDate;
  if (!day) throw new Error(`ConvertToGregorian ${hijri} answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return day.slice(0, 10);
}

// ---- lookups ------------------------------------------------------------------------

export type LookupItem = { id: string; code: string; englishName: string; arabicName?: string; index?: number };

const lookupCache = new Map<string, LookupItem[]>();

/** A lookup's items (GET /api/Lookups/Items/{name}), cached for the run. */
export async function lookupItems(page: Page, name: string): Promise<LookupItem[]> {
  const cached = lookupCache.get(name);
  if (cached) return cached;
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.lookupItems}/${name}`);
  const items = res.status < 300 ? (payloadOrNull<LookupItem[]>(res) ?? []) : [];
  if (items.length) lookupCache.set(name, items);
  return items;
}

/**
 * A lookup item's id by its code. Codes (2026-11-05): identityType nationalId /
 * iqama / passport / gccId; nationality saudi, emirati, bahraini, qatari,
 * kuwaiti, omani, jordanian ... (and a stray "Test"); gender male / female /
 * Other; patientStatus alive / deceased; maritalStatus single / married /
 * divorced / widowed; preferredContactMethod email / sms / both;
 * preferredLanguage ar / en; bloodGroup aPlus ... oMinus; countryDialCode
 * "+966" ...; memberRelationship self / spouse / child / parent / other;
 * memberDeactivationReason coverageEnded, employmentEnded, relocatedAbroad,
 * duplicateRecord, memberRequest, suspectedFraud, other.
 */
export async function lookupId(page: Page, name: string, code: string): Promise<string> {
  const item = (await lookupItems(page, name)).find((i) => i.code === code);
  if (!item) throw new Error(`the ${name} lookup has no "${code}"`);
  return item.id;
}

/** A lookup item's English label by its id ('' when unknown). */
export async function lookupLabel(page: Page, name: string, id: string | null): Promise<string> {
  if (!id) return '';
  return (await lookupItems(page, name)).find((i) => i.id === id)?.englishName ?? '';
}

/** The address countries (GET Terminologies/GetCountriesDropdown): Jordan, Saudi Arabia, United Arab Emirates on 2026-11-05. */
export async function addressCountries(page: Page): Promise<{ id: string; nameEn: string; nameAr: string; alpha3: string }[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.countriesDropdown);
  return res.status < 300 ? (payloadOrNull<{ id: string; nameEn: string; nameAr: string; alpha3: string }[]>(res) ?? []) : [];
}

/** The Inactivate drawer's reasons (memberDeactivationReason). */
export async function deactivationReasons(page: Page): Promise<LookupItem[]> {
  return lookupItems(page, 'memberDeactivationReason');
}

// ---- the record ---------------------------------------------------------------------

/** One emergency contact as the wizard sends it (Edit adds the contact's `id`). */
export interface EmergencyContactBody {
  id?: string;
  relationshipId: string | null;
  name: string;
  phoneNumber: string;
}

/** What CreateMember / UpdateMember take - captured from the wizard (2026-11-05). Blank optionals are '' (text) or null (ids). */
export interface MemberBody {
  arabicFirstName: string;
  arabicSecondName: string;
  arabicThirdName: string;
  arabicLastName: string;
  englishFirstName: string;
  englishSecondName: string;
  englishThirdName: string;
  englishLastName: string;
  eHealthId: string;
  documentId: string;
  identityTypeId: string | null;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
  /** `YYYY/MM/DD` - must be the same day as dateOfBirth (422 otherwise). */
  hijriDateOfBirth: string;
  nationalityId: string | null;
  genderId: string | null;
  placeOfBirthCountryId: string | null;
  occupation: string;
  maritalStatusId: string | null;
  /** Member Status (Alive / Deceased). */
  patientStatusId: string | null;
  isSpecialNeeds: boolean;
  isActive: boolean;
  insuranceNumber: string;
  /** Set by the wizard from the nationality (no dial-code control on the form). */
  countryDialCodeId: string | null;
  mobileNumber: string;
  email: string;
  preferredContactMethodId: string | null;
  preferredLanguageId: string | null;
  bloodGroupId: string | null;
  isVip: boolean;
  addressCountryId: string | null;
  cityId: string | null;
  districtId: string | null;
  streetId: string | null;
  buildingNumber: string;
  postalCode: string;
  additionalNumber: string;
  emergencyContacts: EmergencyContactBody[];
}

/** A benefit policy as GetMember lists it (`benefitPolicies`) - the PBM Accumulator Dashboard tab's data. */
export interface MemberBenefitPolicy {
  /** The POLICY-member id: the accumulator page is `/financial-benefits/accumulator/{policyMemberId}`. */
  policyMemberId: string;
  memberCode: string;
  policyId: string;
  policyNumber: string;
  policyNameEn: string;
  planNameEn: string;
  payerNameEn: string;
  relationshipNameEn: string;
  policyEffective: string;
  policyExpiry: string;
  policyStatusEn: string;
  deductibleAmount: number;
  coinsurancePercent: number;
  outOfPocketMaximum: number;
  sublimitAmount: number;
  termsOverridden: boolean;
  coverageOrder: number | null;
  isInForce: boolean;
  accumulators: {
    benefitPeriod: string;
    benefitPeriodStart: string;
    benefitPeriodEnd: string;
    renewsOn: string | null;
    termsOverridden: boolean;
    hasRow: boolean;
    individualDeductibleMet: number;
    individualOOPMMet: number;
    deductibleRemaining: number | null;
    outOfPocketRemaining: number | null;
    policySublimitConsumed: number;
    tradeSublimitCount: number;
    lastPostedOnUtc: string | null;
    lastPostedReference: string | null;
  } | null;
  [key: string]: unknown;
}

/** GetMember's payload (the view page). */
export interface MemberRecord extends Omit<MemberBody, 'emergencyContacts'> {
  id: string;
  memberCode: string;
  displayNameEn: string;
  displayNameAr: string;
  age: number;
  nationalityNameEn: string;
  identityTypeNameEn: string;
  genderNameEn: string;
  patientStatusNameEn: string;
  countryDialCodeNameEn: string | null;
  emergencyContacts: (EmergencyContactBody & { id: string; relationshipNameEn?: string; createdOn?: string; createdByName?: string | null; modifiedOn?: string | null; modifiedByName?: string | null })[];
  benefitPolicies: MemberBenefitPolicy[];
  policyHolders: { id: string; nameEn: string; nameAr: string }[];
  createdBy: string;
  createdOn: string;
  modifiedBy: string | null;
  modifiedOn: string | null;
  createdByName: string | null;
  modifiedByName: string | null;
  concurrencyStamp: string;
  [key: string]: unknown;
}

/** One list row as GetMembers answers it. */
export interface MemberListItem {
  id: string;
  memberCode: string;
  displayNameEn: string;
  displayNameAr: string;
  englishFirstName: string;
  englishSecondName: string;
  englishThirdName: string;
  englishLastName: string;
  documentId: string;
  mobileNumber: string;
  email: string;
  dateOfBirth: string;
  age: number;
  nationalityId: string;
  nationalityNameEn: string;
  genderId: string;
  genderNameEn: string;
  identityTypeId: string;
  identityTypeNameEn: string;
  patientStatusId: string;
  patientStatusNameEn: string;
  isActive: boolean;
  isSpecialNeeds: boolean;
  isVip: boolean;
}

/** The KPI tiles' answer. */
export interface MemberDashboard {
  total: number;
  active: number;
  inactive: number;
  specialNeeds: number;
}

/** One audit entry (GetAuditLogs, `entityType: "Member"`); GetAuditLogById adds beforeJson / afterJson. */
export interface MemberAuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  /** UPDATE for every user write (edit, (de)activate, delete); CREATE is written under another entity id (see readMemberAuditTrail). */
  actionType: string;
  actorUserId: string | null;
  actorLabel: string;
  occurredAtUtc: string;
  beforeJson?: string | null;
  afterJson?: string | null;
}

/** Whether a display name / record is one the suite created. */
export function isSuiteMember(record: { displayNameEn?: string; englishFirstName?: string; englishSecondName?: string }): boolean {
  if (record.englishFirstName !== undefined && record.englishSecondName !== undefined) {
    return record.englishFirstName === SUITE_MEMBER_FIRST_NAME && record.englishSecondName === SUITE_MEMBER_SECOND_NAME;
  }
  return String(record.displayNameEn ?? '').startsWith(`${SUITE_MEMBER_PREFIX} `);
}

/** Throws unless the record is one the suite created ("QA" / "Automation"). */
export function assertSuiteOwned(record: { displayNameEn?: string; englishFirstName?: string; englishSecondName?: string; id?: string }): void {
  if (!isSuiteMember(record)) {
    throw new Error(`refusing to change member ${record.id ?? '?'} "${record.displayNameEn ?? ''}": not a "${SUITE_MEMBER_PREFIX}" member`);
  }
}

export async function readMemberOrNull(page: Page, id: string): Promise<MemberRecord | null> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.memberGet, { id });
  return res.status === 200 ? payloadOrNull<MemberRecord>(res) : null;
}

export async function readMember(page: Page, id: string): Promise<MemberRecord> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.memberGet, { id });
  if (res.status !== 200) throw new Error(`GetMember ${id} answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<MemberRecord>(res) as MemberRecord;
}

/** GetMemberForEdit - the wizard's Edit load: the body fields + `id, memberCode, concurrencyStamp, policyHolderIds`. */
export async function readMemberForEdit(page: Page, id: string): Promise<MemberBody & { id: string; memberCode: string; concurrencyStamp: string; policyHolderIds: string[] }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.memberGetForEdit, { id });
  if (res.status !== 200) throw new Error(`GetMemberForEdit ${id} answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull(res) as MemberBody & { id: string; memberCode: string; concurrencyStamp: string; policyHolderIds: string[] };
}

/**
 * The register (GetMembers) with any list criteria: `searchText, isActive
 * (true / false / null), nationalityId, sortBy` ("CreatedOn desc" default).
 * `payerId` sends the X-Selected-Payer-Id header the payer scope select sets.
 */
export async function listMemberRegister(page: Page, criteria: Record<string, unknown> = {}, rows = 100): Promise<{ items: MemberListItem[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.memberList, { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', isActive: null, ...criteria });
  if (res.status !== 200) throw new Error(`GetMembers answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<{ members: { items: MemberListItem[]; totalRows: number } }>(res)?.members ?? { items: [], totalRows: 0 };
}

/** The KPI tiles (GetMembersDashboard `{ payerId? }`) - all payers when `payerId` is omitted. */
/**
 * The member tiles' numbers. A payer scope is sent the way the SCREEN sends it -
 * the `X-Selected-Payer-Id` header (the breadcrumb payer select). A `{ payerId }`
 * BODY answers different, unrelated numbers (2026-11-05: Al sharq 9 by body vs
 * 20 by header, AAA 0 vs 11, while the scoped list held 20 / 11), so it is never
 * used.
 */
export async function readMemberDashboard(page: Page, payerId?: string): Promise<MemberDashboard> {
  if (!payerId) {
    const res = await NetworkUtils.postAsSession(page, ApiEndpoints.memberDashboard, {});
    if (res.status !== 200) throw new Error(`GetMembersDashboard answered ${res.status} ${answerText(res).slice(0, 200)}`);
    return payloadOrNull<MemberDashboard>(res) as MemberDashboard;
  }
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const res = await page.request.fetch(`${env.baseUrl}${ApiEndpoints.memberDashboard}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Selected-Payer-Id': payerId },
    data: {},
    failOnStatusCode: false,
  });
  const text = await res.text();
  if (res.status() !== 200) throw new Error(`GetMembersDashboard (payer ${payerId}) answered ${res.status()} ${text.slice(0, 200)}`);
  return (JSON.parse(text) as { payload: MemberDashboard }).payload;
}

/**
 * The keyword that finds a member by name: its LAST name (the display name's
 * last word). The list's keyword search (2026-11-05) matches the first name,
 * the last name, the member code, the document ID and the mobile number
 * (partially) - NOT the full display name, the second name, the e-mail, the
 * nationality or the status ("QA Automation Member..." and "Automation" find nothing).
 */
export const memberSearchKey = (displayNameEn: string): string => displayNameEn.replace(/\s+/g, ' ').trim().split(' ').pop() ?? displayNameEn;

/** A member by its exact English display name (a keyword search on its last name), or null. */
export async function findMemberByName(page: Page, displayNameEn: string): Promise<MemberListItem | null> {
  const { items } = await listMemberRegister(page, { searchText: memberSearchKey(displayNameEn) }, 50);
  return items.find((i) => i.displayNameEn.replace(/\s+/g, ' ') === displayNameEn.replace(/\s+/g, ' ')) ?? null;
}

/** A member by its document ID (a keyword search), or null. */
export async function findMemberByDocumentId(page: Page, documentId: string): Promise<MemberListItem | null> {
  const { items } = await listMemberRegister(page, { searchText: documentId }, 50);
  return items.find((i) => i.documentId === documentId) ?? null;
}

/** Every suite member in the register (first name "QA" - the keyword search does not match the full prefix). */
export async function listSuiteMembers(page: Page): Promise<MemberListItem[]> {
  return (await listMemberRegister(page, { searchText: SUITE_MEMBER_FIRST_NAME }, 500)).items.filter((i) => isSuiteMember(i));
}

/**
 * A member's audit trail as System Settings > Audit Logs reads it
 * (GetAuditLogs, `entityType: "Member"`; there is NO audit tab on the member's
 * view page). NOTE (2026-11-05): the CREATE entry is written under a DIFFERENT
 * entity id than the member's (as Facility), so it never appears here; edit,
 * activate, deactivate and delete are all UPDATE entries.
 */
export async function readMemberAuditTrail(
  page: Page,
  memberId: string,
  filter: { actionType?: string | null; fromUtc?: string; toUtc?: string; searchText?: string } = {},
  rows = 100,
): Promise<{ items: MemberAuditEntry[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogList, {
    entityType: 'Member', entityId: memberId, actionType: filter.actionType ?? null, ...filter, pageNumber: 1, rowsPerPage: rows,
  });
  if (res.status !== 200) throw new Error(`GetAuditLogs answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<{ items: MemberAuditEntry[]; totalRows: number }>(res) ?? { items: [], totalRows: 0 };
}

/** One audit entry with its before / after JSON. */
export async function readAuditEntry(page: Page, auditId: string): Promise<MemberAuditEntry> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogById, { id: auditId });
  if (res.status !== 200) throw new Error(`GetAuditLogById answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<MemberAuditEntry>(res) as MemberAuditEntry;
}

/** The fields an UPDATE entry changed, `{ Field: [before, after] }` (raw PascalCase names: IsActive, InactivationReasonId, Occupation ...). */
export function auditChanges(entry: MemberAuditEntry): Record<string, [unknown, unknown]> {
  const before = JSON.parse(entry.beforeJson ?? '{}') as Record<string, unknown>;
  const after = JSON.parse(entry.afterJson ?? '{}') as Record<string, unknown>;
  const out: Record<string, [unknown, unknown]> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = [before[key], after[key]];
  }
  return out;
}

// ---- writing ------------------------------------------------------------------------

/** What a case asks of a suite member. Everything is optional; codes are lookup codes. */
export interface SuiteMemberSpec {
  /** Default `Member<stamp>`; the first / second names are always "QA" / "Automation". */
  lastName?: string;
  thirdName?: string;
  /** Default `<letters>` (Arabic letters only). */
  arabicLastName?: string;
  arabicThirdName?: string;
  /** Default 'saudi'. */
  nationality?: string;
  /** Default nationalId for a Saudi, iqama otherwise. */
  identityType?: IdentityTypeCode;
  /** Default a fresh unique ID for the identity type. */
  documentId?: string;
  /** `YYYY-MM-DD`, default 1990-05-15 (Hijri 1410/10/20); the Hijri date is converted by the application. */
  dateOfBirth?: string;
  /** Default 'male'. */
  gender?: 'male' | 'female';
  /** Default 'alive'. */
  memberStatus?: 'alive' | 'deceased';
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed' | null;
  placeOfBirthCountry?: string | null;
  occupation?: string;
  eHealthId?: string;
  insuranceNumber?: string;
  /** Default true. */
  active?: boolean;
  specialNeeds?: boolean;
  vip?: boolean;
  mobileNumber?: string;
  email?: string;
  /** Default 'email'. */
  contactMethod?: 'email' | 'sms' | 'both';
  /** Default 'en'. */
  language?: 'en' | 'ar';
  bloodGroup?: string | null;
  /** The address country by English name, default "Saudi Arabia". */
  addressCountry?: string;
  buildingNumber?: string;
  postalCode?: string;
  additionalNumber?: string;
  /** Emergency contacts: name, relationship code, phone. */
  contacts?: { name: string; relationship?: RelationshipCode; phoneNumber: string }[];
}

/** A create body for `spec` (lookups resolved, document ID unique). */
export async function memberBody(page: Page, spec: SuiteMemberSpec = {}): Promise<MemberBody> {
  const stamp = memberStamp();
  const nationality = spec.nationality ?? 'saudi';
  const identityType: IdentityTypeCode = spec.identityType ?? (nationality === 'saudi' ? 'nationalId' : 'iqama');
  const dateOfBirth = spec.dateOfBirth ?? '1990-05-15';
  const nationalityItem = (await lookupItems(page, 'nationality')).find((i) => i.code === nationality);
  if (!nationalityItem) throw new Error(`the nationality lookup has no "${nationality}"`);
  // The wizard sets the dial code from the nationality (same lookup index); +966 otherwise.
  const dial = (await lookupItems(page, 'countryDialCode')).find((i) => i.index === nationalityItem.index) ?? (await lookupItems(page, 'countryDialCode')).find((i) => i.code === '+966');
  const country = (await addressCountries(page)).find((c) => c.nameEn === (spec.addressCountry ?? 'Saudi Arabia'));
  const contacts: EmergencyContactBody[] = [];
  for (const c of spec.contacts ?? []) contacts.push({ relationshipId: await lookupId(page, 'memberRelationship', c.relationship ?? 'parent'), name: c.name, phoneNumber: c.phoneNumber });
  return {
    arabicFirstName: SUITE_MEMBER_ARABIC_FIRST,
    arabicSecondName: SUITE_MEMBER_ARABIC_SECOND,
    arabicThirdName: spec.arabicThirdName ?? '',
    arabicLastName: spec.arabicLastName ?? arabicLettersToken(),
    englishFirstName: SUITE_MEMBER_FIRST_NAME,
    englishSecondName: SUITE_MEMBER_SECOND_NAME,
    englishThirdName: spec.thirdName ?? '',
    englishLastName: spec.lastName ?? suiteMemberLastName(stamp),
    eHealthId: spec.eHealthId ?? '',
    documentId: spec.documentId ?? (await uniqueDocumentId(page, identityType)),
    identityTypeId: await lookupId(page, 'identityType', identityType),
    dateOfBirth,
    hijriDateOfBirth: await toHijri(page, dateOfBirth),
    nationalityId: nationalityItem.id,
    genderId: await lookupId(page, 'gender', spec.gender ?? 'male'),
    placeOfBirthCountryId: spec.placeOfBirthCountry ? ((await addressCountries(page)).find((c) => c.nameEn === spec.placeOfBirthCountry)?.id ?? null) : null,
    occupation: spec.occupation ?? '',
    maritalStatusId: spec.maritalStatus ? await lookupId(page, 'maritalStatus', spec.maritalStatus) : null,
    patientStatusId: await lookupId(page, 'patientStatus', spec.memberStatus ?? 'alive'),
    isSpecialNeeds: spec.specialNeeds ?? false,
    isActive: spec.active ?? true,
    insuranceNumber: spec.insuranceNumber ?? '',
    countryDialCodeId: dial?.id ?? null,
    mobileNumber: spec.mobileNumber ?? suiteMobileNumber(),
    email: spec.email ?? suiteMemberEmail(stamp),
    preferredContactMethodId: await lookupId(page, 'preferredContactMethod', spec.contactMethod ?? 'email'),
    preferredLanguageId: await lookupId(page, 'preferredLanguage', spec.language ?? 'en'),
    bloodGroupId: spec.bloodGroup ? await lookupId(page, 'bloodGroup', spec.bloodGroup) : null,
    isVip: spec.vip ?? false,
    addressCountryId: country?.id ?? null,
    cityId: null,
    districtId: null,
    streetId: null,
    buildingNumber: spec.buildingNumber ?? '',
    postalCode: spec.postalCode ?? '',
    additionalNumber: spec.additionalNumber ?? '',
    emergencyContacts: contacts,
  };
}

/** POST CreateMember with a raw body - for the validation cases (answer returned, nothing thrown). */
export async function requestCreateMember(page: Page, body: Partial<MemberBody>): Promise<MemberAnswer & { id: string | null; memberCode: string | null }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.memberCreate, body);
  const payload = res.status < 300 ? payloadOrNull<{ id: string; memberCode: string }>(res) : null;
  return { ...res, id: payload?.id ?? null, memberCode: payload?.memberCode ?? null };
}

/** What createSuiteMember built. */
export interface ProvisionedMember {
  id: string;
  /** MBR-000000nn. */
  code: string;
  /** "QA Automation Member<stamp>". */
  displayNameEn: string;
  displayNameAr: string;
  lastName: string;
  documentId: string;
  email: string;
  mobileNumber: string;
  isActive: boolean;
  isSpecialNeeds: boolean;
  record: MemberRecord;
}

async function provisioned(page: Page, id: string): Promise<ProvisionedMember> {
  const record = await readMember(page, id);
  return {
    id,
    code: record.memberCode,
    displayNameEn: record.displayNameEn,
    displayNameAr: record.displayNameAr,
    lastName: record.englishLastName,
    documentId: record.documentId,
    email: record.email,
    mobileNumber: record.mobileNumber,
    isActive: record.isActive,
    isSpecialNeeds: record.isSpecialNeeds,
    record,
  };
}

/** Creates one suite member as `spec` asks. Throws with the server's answer when refused. */
export async function createSuiteMember(page: Page, spec: SuiteMemberSpec = {}): Promise<ProvisionedMember> {
  const body = await memberBody(page, spec);
  assertSuiteOwned(body);
  const res = await requestCreateMember(page, body);
  const name = suiteMemberDisplayName(body.englishLastName);
  if (res.status >= 300 || !res.id) fail(name, 'CreateMember', res);
  Logger.step(`[fixture] Created member "${name}" (${res.memberCode})`);
  return provisioned(page, res.id as string);
}

/**
 * PUT UpdateMember with `changes` over the member's current values (read
 * through GetMemberForEdit first, so its concurrencyStamp is fresh unless
 * `concurrencyStamp` is given - a stale one answers 409 "Oops! It seems that
 * while you were making changes, someone else might have modified ...").
 * Answer returned, nothing thrown.
 */
export async function updateMemberFields(
  page: Page,
  id: string,
  changes: Partial<MemberBody>,
  options: { concurrencyStamp?: string } = {},
): Promise<MemberAnswer> {
  const current = await readMemberForEdit(page, id);
  assertSuiteOwned(current);
  const { memberCode: _code, policyHolderIds: _holders, ...fields } = current;
  const body = { ...fields, ...changes, id, concurrencyStamp: options.concurrencyStamp ?? current.concurrencyStamp };
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.memberUpdate, body);
}

/**
 * SetMemberActive. Activate: `{ id, isActive: true, inactivationReasonId: null,
 * inactivationDetails: null }`. Deactivate needs a reason (422 "Invalid
 * inactivation reason." without) and details when it is Other (422 'Details are
 * required when the reason is "Other".'). Applied at once.
 */
export async function setMemberActive(
  page: Page,
  id: string,
  isActive: boolean,
  options: { reasonCode?: string; details?: string | null } = {},
): Promise<MemberAnswer> {
  const record = await readMember(page, id);
  assertSuiteOwned(record);
  if (isActive) return NetworkUtils.postAsSession(page, ApiEndpoints.memberSetActive, { id, isActive: true, inactivationReasonId: null, inactivationDetails: null });
  const reasons = await deactivationReasons(page);
  const reason = reasons.find((r) => r.code === (options.reasonCode ?? 'other')) ?? reasons[0];
  const details = options.details === undefined ? 'Deactivated by the automation suite.' : options.details;
  return NetworkUtils.postAsSession(page, ApiEndpoints.memberSetActive, { id, isActive: false, inactivationReasonId: reason?.id ?? null, inactivationDetails: details });
}

export const activateMember = (page: Page, id: string): Promise<MemberAnswer> => setMemberActive(page, id, true);
export const deactivateMember = (page: Page, id: string, reasonCode = 'other', details: string | null = 'Deactivated by the automation suite.'): Promise<MemberAnswer> =>
  setMemberActive(page, id, false, { reasonCode, details });

/** DELETE DeleteMember/{id} (suite members only). 200 "Member has been deleted successfully." / refused while enrolled. */
export async function deleteMember(page: Page, id: string): Promise<MemberAnswer> {
  const record = await readMemberOrNull(page, id);
  if (record) assertSuiteOwned(record);
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.memberDelete}/${id}`);
}

/** Reads a binary answer with the session token (exports, the import template, result files). */
async function fetchFile(page: Page, method: 'POST' | 'GET', path: string, data?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; filename: string; bytes: Buffer; text: string }> {
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const res = await page.request.fetch(`${env.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    ...(data === undefined ? {} : { data: data as Record<string, unknown> }),
    failOnStatusCode: false,
  });
  const disposition = res.headers()['content-disposition'] ?? '';
  const filename = (disposition.match(/filename="?([^";]+)"?/) ?? [])[1] ?? '';
  const bytes = await res.body();
  return { status: res.status(), filename, bytes, text: bytes.toString('utf8').slice(0, 2000) };
}

/**
 * ExportMembers - the list's export through the shared bulk service: the list
 * query + `scope` ("All" | "Filtered" | "CurrentPage") + `format` ("Csv" |
 * "Excel"). Answers the file's name and bytes.
 */
export async function exportMembers(
  page: Page,
  criteria: Record<string, unknown> = {},
  options: { scope?: 'All' | 'Filtered' | 'CurrentPage'; format?: 'Csv' | 'Excel'; payerId?: string } = {},
): Promise<{ status: number; filename: string; bytes: Buffer; text: string }> {
  return fetchFile(page, 'POST', ApiEndpoints.memberExport, {
    pageNumber: 1, rowsPerPage: 10, sortBy: 'CreatedOn desc', isActive: null, ...criteria, scope: options.scope ?? 'All', format: options.format ?? 'Csv',
  }, options.payerId ? { 'X-Selected-Payer-Id': options.payerId } : {});
}

/**
 * The import template's columns, in order (Members_Template.csv, 2026-11-05);
 * " *" marks a required column. An export has the same columns preceded by
 * "Member Code" (fill it to UPDATE that member on import). Values are the
 * LABELS the screens show ("Saudi (SAU)", "National ID", "Male", "Alive",
 * "Yes" / "No", "+966", "Email", "English", "Saudi Arabia"); dates `YYYY-MM-DD`,
 * Hijri `YYYY/MM/DD`. An Excel file has a second page, Emergency Contacts,
 * linked by "Document ID"; a CSV holds the Members page only.
 */
export const MEMBER_IMPORT_COLUMNS = [
  'First Name (English) *', 'Second Name (English) *', 'Third Name (English)', 'Last Name (English) *',
  'First Name (Arabic) *', 'Second Name (Arabic) *', 'Third Name (Arabic)', 'Last Name (Arabic) *',
  'eHealth ID', 'Nationality *', 'Identity Type *', 'Document ID *', 'Date of Birth *', 'Hijri Date of Birth',
  'Gender *', 'Place of Birth', 'Occupation', 'Marital Status', 'Member Status *', 'Active', 'Special Needs',
  'Insurance Number', 'Dial Code', 'Mobile Number *', 'Email *', 'Preferred Contact Method *', 'Preferred Language *',
  'Blood Group', 'VIP', 'Country *', 'City', 'District', 'Street', 'Building Number', 'Postal Code', 'Additional Number',
] as const;

export type MemberImportColumn = (typeof MEMBER_IMPORT_COLUMNS)[number];

/** One import row for a fresh suite member (unique document ID, e-mail, names) - override any column. */
export async function suiteImportRow(page: Page, overrides: Partial<Record<MemberImportColumn | 'Member Code', string>> = {}): Promise<Record<string, string>> {
  const stamp = memberStamp();
  const dateOfBirth = '1991-03-10';
  return {
    'First Name (English) *': SUITE_MEMBER_FIRST_NAME,
    'Second Name (English) *': SUITE_MEMBER_SECOND_NAME,
    'Third Name (English)': '',
    'Last Name (English) *': `MemberImp${stamp}`,
    'First Name (Arabic) *': SUITE_MEMBER_ARABIC_FIRST,
    'Second Name (Arabic) *': SUITE_MEMBER_ARABIC_SECOND,
    'Third Name (Arabic)': '',
    'Last Name (Arabic) *': arabicLettersToken(),
    'eHealth ID': '',
    'Nationality *': 'Saudi (SAU)',
    'Identity Type *': 'National ID',
    'Document ID *': await uniqueDocumentId(page, 'nationalId'),
    'Date of Birth *': dateOfBirth,
    'Hijri Date of Birth': await toHijri(page, dateOfBirth),
    'Gender *': 'Male',
    'Place of Birth': '',
    Occupation: '',
    'Marital Status': '',
    'Member Status *': 'Alive',
    Active: 'Yes',
    'Special Needs': 'No',
    'Insurance Number': '',
    'Dial Code': '+966',
    'Mobile Number *': suiteMobileNumber(),
    'Email *': suiteMemberEmail(`imp${stamp}`),
    'Preferred Contact Method *': 'Email',
    'Preferred Language *': 'English',
    'Blood Group': '',
    VIP: 'No',
    'Country *': 'Saudi Arabia',
    City: '',
    District: '',
    Street: '',
    'Building Number': '',
    'Postal Code': '',
    'Additional Number': '',
    ...overrides,
  };
}

/** A members CSV (UTF-8 with BOM, the template's header) from rows keyed by column; "Member Code" is prepended when any row has one. */
export function buildMemberImportCsv(rows: Record<string, string>[]): Buffer {
  const columns: string[] = rows.some((r) => r['Member Code'] !== undefined) ? ['Member Code', ...MEMBER_IMPORT_COLUMNS] : [...MEMBER_IMPORT_COLUMNS];
  const cell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c] ?? '')).join(','))];
  return Buffer.from(`﻿${lines.join('\n')}\n`, 'utf8');
}

/** The import template (POST GetMemberImportTemplate `{ entity: "Member", format }`) - `Members_Template.xlsx` / `.csv`. */
export async function downloadMemberImportTemplate(page: Page, format: 'Csv' | 'Excel' = 'Excel'): Promise<{ status: number; filename: string; bytes: Buffer; text: string }> {
  return fetchFile(page, 'POST', ApiEndpoints.memberImportTemplate, { entity: 'Member', format });
}

/** One Upload history row (GetMemberImportHistory). */
export interface MemberImportRun {
  id: string;
  entity: string;
  fileName: string;
  fileType: string;
  uploadedBy: string;
  uploadedOn: string;
  totalRows: number;
  succeededRows: number;
  failedRows: number;
  createdRows: number;
  updatedRows: number;
  unchangedRows: number;
  /** Queued / Running / Completed / CompletedWithErrors / Failed. */
  status: string;
  errorMessage: string | null;
  hasResultFile: boolean;
  canDownloadResult: boolean;
}

export async function readImportHistory(page: Page, rows = 20): Promise<{ items: MemberImportRun[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.memberImportHistory, { pageNumber: 1, rowsPerPage: rows });
  if (res.status !== 200) throw new Error(`GetMemberImportHistory answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<{ items: MemberImportRun[]; totalRows: number }>(res) ?? { items: [], totalRows: 0 };
}

/**
 * Starts an import through the API - multipart POST ImportMembers with `file`
 * (what the drawer sends) - and returns the answer (the bulk operation).
 */
export async function startMemberImport(page: Page, file: { name: string; mimeType: string; buffer: Buffer }): Promise<{ status: number; text: string; operationId: string | null }> {
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const res = await page.request.fetch(`${env.baseUrl}${ApiEndpoints.memberImport}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file },
    failOnStatusCode: false,
  });
  const text = await res.text();
  let operationId: string | null = null;
  try {
    const payload = (JSON.parse(text) as { payload?: Record<string, unknown> }).payload ?? {};
    operationId = String(payload.operationId ?? payload.OperationId ?? payload.id ?? '') || null;
  } catch { /* not JSON */ }
  return { status: res.status(), text, operationId };
}

/** Polls the bulk operation until it reaches a final state (Completed / CompletedWithErrors / Failed) and returns it. */
export async function waitForImport(page: Page, operationId: string, timeoutMs = 120_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const res = await NetworkUtils.postAsSession(page, ApiEndpoints.bulkOperationsStatus, { ids: [operationId] });
    const items = payloadOrNull<Record<string, unknown>[]>(res) ?? [];
    last = items[0] ?? {};
    if (['Completed', 'CompletedWithErrors', 'Failed'].includes(String(last.status ?? last.Status ?? ''))) return last;
    await page.waitForTimeout(2_000);
  }
  throw new Error(`import ${operationId} not finished after ${Math.round(timeoutMs / 1000)} s (${JSON.stringify(last).slice(0, 200)})`);
}

/** A finished import's result file (POST DownloadMemberImportResult `{ operationId, format }`) - the error file. */
export async function downloadImportResult(page: Page, operationId: string, format: 'Csv' | 'Excel' = 'Csv'): Promise<{ status: number; filename: string; bytes: Buffer; text: string }> {
  return fetchFile(page, 'POST', ApiEndpoints.memberImportResult, { operationId, format });
}

// ---- coverage ordering (COB) ------------------------------------------------------------

/** One Coverage Ordering entry (GetMemberCobTimeline). NOTE: `id` is the EMPTY GUID for every entry (2026-11-05). */
export interface CobEntry {
  id: string;
  memberId: string;
  policyId: string;
  policyNumber: string;
  policyNameEn: string;
  policyStatusId: string;
  payerNameEn: string;
  /** 1 = Primary, 2 = Secondary, 3 = Tertiary, n = "Order n". */
  coverageOrder: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  policyEffectiveDate: string;
  policyExpiryDate: string;
  deductibleAmount: number;
  coinsurancePercent: number;
  outOfPocketMaximum: number;
  sublimitAmount: number;
  /** true = the current ordering; false = History. */
  isCurrent: boolean;
  [key: string]: unknown;
}

export async function readCobTimeline(page: Page, memberId: string): Promise<CobEntry[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.cobTimeline, { memberId });
  if (res.status !== 200) throw new Error(`GetMemberCobTimeline answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<{ entries: CobEntry[] }>(res)?.entries ?? [];
}

/** The current ordering's policy ids, primary first. */
export async function currentCobOrder(page: Page, memberId: string): Promise<string[]> {
  return (await readCobTimeline(page, memberId)).filter((e) => e.isCurrent).sort((a, b) => a.coverageOrder - b.coverageOrder).map((e) => e.policyId);
}

/** PUT ReorderMemberCoverage `{ memberId, policyIds }` (primary first) - what a drop on the COB tab sends. Answer returned. */
export async function reorderCoverage(page: Page, memberId: string, policyIds: string[]): Promise<MemberAnswer> {
  const record = await readMember(page, memberId);
  assertSuiteOwned(record);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.cobReorder, { memberId, policyIds });
}

// ---- accumulators ------------------------------------------------------------------------

/** The Member Benefit Accumulator (POST GetMemberAccumulator `{ policyMemberId }`). */
export async function readMemberAccumulator(page: Page, policyMemberId: string): Promise<Record<string, unknown> | null> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.memberAccumulator, { policyMemberId });
  return res.status === 200 ? payloadOrNull<Record<string, unknown>>(res) : null;
}

/** One Reset history row (GetResetJobHistory): `kind` "Manual" for Reset now; the scheduled job's kind is unverified (none ran on 2026-11-05). */
export interface ResetRun {
  id: string;
  runAtUtc: string;
  benefitYear: string;
  recordsCreated: number;
  status: string;
  kind: string;
  policyId: string;
  policyNumber: string;
  policyNameEn: string;
  closedPeriodKey: string;
  periodStart: string;
  periodEnd: string;
  membersCount: number;
  deductibleUsed: number;
  outOfPocketUsed: number;
  sublimitUsed: number;
  [key: string]: unknown;
}

export async function readResetHistory(page: Page, criteria: Record<string, unknown> = {}, rows = 50): Promise<{ items: ResetRun[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyResetHistory, { pageNumber: 1, rowsPerPage: rows, ...criteria });
  if (res.status !== 200) throw new Error(`GetResetJobHistory answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<{ history: { items: ResetRun[]; totalRows: number } }>(res)?.history ?? { items: [], totalRows: 0 };
}

// ---- scheduled jobs (System Settings > Settings > General) --------------------------------

/*
 * Moved to the shared utils/JobClock.ts (2026-11-08) - every suite moves jobs
 * through one helper now. Re-exported so the Member suite's imports keep working.
 */
export { cronInMinutes, readJobCron, writeJobCron, type JobKey } from './JobClock';

// ---- states -------------------------------------------------------------------------

/**
 * The states a case can ask for (all set at create, verified 2026-11-05):
 *   Active               Active, no flags
 *   Inactive             created Active, then Deactivated (reason Other + details) - carries the inactivation fields
 *   InactiveAtCreate     created with Member Active Status unticked
 *   SpecialNeeds         Active + Special Needs
 *   InactiveSpecialNeeds Inactive + Special Needs (the Special Needs tile counts the flag, not the status)
 *   Vip                  Active + VIP
 *   Deceased             Member Status "Deceased"
 *   WithContacts         Active + two emergency contacts
 *   Complete             every optional field filled (third names, E-Health ID, occupation, marital status, place of birth, insurance number, blood group, VIP, address numbers, a contact)
 */
export type MemberState = 'Active' | 'Inactive' | 'InactiveAtCreate' | 'SpecialNeeds' | 'InactiveSpecialNeeds' | 'Vip' | 'Deceased' | 'WithContacts' | 'Complete';

const STATE_SPEC: Record<MemberState, SuiteMemberSpec> = {
  Active: {},
  Inactive: {},
  InactiveAtCreate: { active: false },
  SpecialNeeds: { specialNeeds: true },
  InactiveSpecialNeeds: { specialNeeds: true },
  Vip: { vip: true },
  Deceased: { memberStatus: 'deceased' },
  WithContacts: { contacts: [{ name: 'QA Contact One', relationship: 'parent', phoneNumber: '512345671' }, { name: 'QA Contact Two', relationship: 'spouse', phoneNumber: '512345672' }] },
  Complete: {
    thirdName: 'Suite', arabicThirdName: 'جناح', eHealthId: 'EH-QA-0001', occupation: 'Engineer', maritalStatus: 'married', placeOfBirthCountry: 'Saudi Arabia',
    insuranceNumber: 'INS-QA-0001', bloodGroup: 'oPlus', vip: true, buildingNumber: '1234', postalCode: '12345', additionalNumber: '6789',
    contacts: [{ name: 'QA Contact One', relationship: 'parent', phoneNumber: '512345671' }],
  },
};

/** Builds a suite member in `state` (the case's `spec` overrides the state's defaults). Throws with the server's answer. */
export async function provisionSuiteMember(page: Page, state: MemberState, spec: SuiteMemberSpec = {}): Promise<ProvisionedMember> {
  const member = await createSuiteMember(page, { ...STATE_SPEC[state], ...spec });
  if (state === 'Inactive' || state === 'InactiveSpecialNeeds') {
    const res = await deactivateMember(page, member.id, 'other', 'Deactivated by the automation suite for its own case.');
    if (res.status >= 300) fail(member.displayNameEn, 'SetMemberActive(false)', res);
    return provisioned(page, member.id);
  }
  return member;
}

// ---- enrolment in a suite policy ---------------------------------------------------------

/** What enrolSuiteMember built: the suite policy and the member's row on it. */
export interface MemberEnrolment {
  policy: ProvisionedPolicy;
  /** The GetPolicyMembers row (its `id` is the policyMemberId the accumulator page takes). */
  policyMember: PolicyMember;
  policyMemberId: string;
}

/**
 * Enrols a SUITE member in a NEW suite policy (utils/PolicyProvisioning -
 * "QA Automation Policy ...", INDIVIDUAL, payer "Al sharq", the suite plan and
 * the payer's active network): the policy is created as a draft with NO picked
 * members, the member is added (relationship `spouse` by default - `self` is REFUSED on an Individual policy: 400 "The selected member relationship is invalid."), then - unless
 * `approve` is false - the policy is sent and approved (v1, status Future):
 * only an APPROVED enrolment shows on the member's PBM Accumulator Dashboard
 * and Coverage Ordering tabs. ~10-20 s.
 *
 * Teardown (discardEnrolment): an approved Individual policy can never lose
 * its last member nor be deleted, so it is RETIRED (inactivated + approved)
 * and the member, still enrolled, is DEACTIVATED (it cannot be deleted).
 */
export async function enrolSuiteMember(
  page: Page,
  memberId: string,
  options: { approve?: boolean; relationship?: RelationshipCode; policy?: SuitePolicySpec } = {},
): Promise<MemberEnrolment> {
  const member = await readMember(page, memberId);
  assertSuiteOwned(member);
  const draft = await provisionSuitePolicy(page, 'Draft', { payerName: POLICY_SUITE_PAYER, ...options.policy, type: 'individual', members: 0 });
  const added = await addPolicyMember(page, draft.id, memberId, { relationship: options.relationship ?? 'spouse' });
  if (added.status >= 300) fail(member.displayNameEn, `AddPolicyMember on ${draft.nameEn}`, added);
  if (options.approve !== false) {
    const submitted = await submitPolicy(page, draft.id);
    if (submitted.status >= 300) fail(member.displayNameEn, `submit ${draft.nameEn}`, submitted);
    const approved = await requestApprovePolicy(page, draft.nameEn);
    if (approved.status >= 300) fail(member.displayNameEn, `approve ${draft.nameEn}`, approved);
    await waitForPolicy(page, draft.id, (p) => !p.isPendingCreate && p.currentVersion >= 1, 'approved (v1)');
  }
  const row = (await readPolicyMembers(page, draft.id)).find((m) => m.memberId === memberId);
  if (!row) throw new Error(`policy ${draft.nameEn} does not list member ${member.memberCode} after the enrolment`);
  Logger.step(`[fixture] Member ${member.memberCode} enrolled in ${draft.nameEn}${options.approve === false ? ' (draft)' : ' (approved)'}`);
  // The draft's number (POL-D-nnnn) becomes POL-YYYY-nnnn on approval - report the current one.
  const current = options.approve === false ? null : await readPolicy(page, draft.id).catch(() => null);
  const policy: ProvisionedPolicy = current ? { ...draft, policyNumber: current.policyNumber, state: 'Future' } : draft;
  return { policy, policyMember: row, policyMemberId: row.id };
}

/** Discards an enrolment's policy (deleted when still a draft; retired when published). */
export async function discardEnrolment(page: Page, enrolment: MemberEnrolment): Promise<DiscardOutcome> {
  return discardSuitePolicy(page, enrolment.policy.id);
}

// ---- teardown -----------------------------------------------------------------------

/**
 * Removes a suite member: DELETE (soft - gone from the register, GetMember 404).
 * When the delete is refused (a policy enrolment) the member is DEACTIVATED
 * instead, if it is active. Never touches a member without the suite name.
 */
export async function discardSuiteMember(page: Page, id: string): Promise<'gone' | 'inactivated' | 'left'> {
  const record = await readMemberOrNull(page, id).catch(() => null);
  if (!record) return 'gone';
  if (!isSuiteMember(record)) {
    Logger.step(`[fixture] NOT discarding member ${record.memberCode} "${record.displayNameEn}" - not a suite member`);
    return 'left';
  }
  const deleted = await deleteMember(page, id).catch(() => null);
  if (deleted && deleted.status < 300) {
    Logger.step(`[fixture] Deleted member ${record.memberCode} "${record.displayNameEn}"`);
    return 'gone';
  }
  Logger.step(`[fixture] Member ${record.memberCode} could not be deleted (${deleted ? answerText(deleted).slice(0, 160) : 'no answer'})`);
  if (record.isActive) {
    const res = await deactivateMember(page, id, 'other', 'Left by the automation suite: it cannot be deleted while it holds a policy enrolment.').catch(() => null);
    if (res && res.status < 300) return 'inactivated';
  }
  return 'left';
}
