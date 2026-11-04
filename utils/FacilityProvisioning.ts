import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { env } from '../constants/EnvironmentConfig';
import { ACCESS_TOKEN_KEY } from '../data/payers/lifecycleGuardrails.data';
import { networkStamp, provisionNetwork, readNetwork, type ProvisionedNetwork } from './NetworkProvisioning';

/**
 * Facilities for the Facility suite (Feature 15130), built through the
 * application's own API - the same calls the Facility screens make, their
 * bodies CAPTURED from the screens on 2026-11-04
 * (reports/facility/Facility-Foundation-Notes.md).
 *
 * Every facility the suite creates is named `QA Automation Facility ...` with
 * an Arabic name of Arabic LETTERS only (no digits: the server refuses them -
 * "Arabic name must contain only Arabic characters." - although the form
 * accepts digits) and a unique e-mail (a duplicate e-mail is a raw 500:
 * unique index IX_Facilities_Email). Nothing here changes a facility without
 * the suite prefix: every writer checks the name first (assertSuiteOwned).
 *
 * NO APPROVAL WORKFLOW (verified 2026-11-04): create, edit, activate,
 * inactivate and delete take effect at once; the approvals hub holds no
 * facility requests.
 *
 * STATUS (verified 2026-11-04): computed AT SAVE from the licence dates
 * (stored `statusId`: pending = "Future" before the start date, active,
 * expired after the expiry date; expiry = today is still Active), and the
 * displayed `effectiveStatusId` is Inactive whenever `isActive` is false -
 * except Expired, which wins over everything. Dates passing are picked up by a
 * DAILY facility job at ~00:00 Riyadh (modifiedOn 00:00:07, modifiedBy null,
 * audit STATUS_CHANGE by "System") that is NOT in System Settings. So
 * the suite builds each state by choosing past / today / future licence dates.
 */

export const SUITE_FACILITY_PREFIX = 'QA Automation Facility';

export type FacilityAnswer = { status: number; text: string; validationErrors?: string[] };
type Answer = FacilityAnswer;

const fail = (name: string, what: string, res: Answer): never => {
  throw new Error(`could not provision facility "${name}": ${what} answered ${res.status} ${answerText(res).slice(0, 400)}`);
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

/** The validation reasons of an error answer ("Facility English name '...' is already taken."). */
export function answerReasons(res: Answer): string[] {
  try {
    const body = JSON.parse(res.text) as { ValidationErrors?: { Reason?: string }[]; ErrorMessage?: string };
    const reasons = (body.ValidationErrors ?? []).map((e) => String(e.Reason ?? ''));
    return reasons.length ? reasons : [String(body.ErrorMessage ?? '')].filter((r) => r !== '');
  } catch {
    return [];
  }
}

// ---- names, dates -------------------------------------------------------------------

/** A unique stamp for suite names and e-mails. */
export const facilityStamp = (): string => networkStamp();

/** A fresh suite name: `QA Automation Facility <label> <stamp>`. */
export const suiteFacilityName = (label = ''): string => `${SUITE_FACILITY_PREFIX}${label ? ` ${label}` : ''} ${facilityStamp()}`;

/** The 28 Arabic letters - the alphabet of every suite Arabic name. */
const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

/**
 * A unique token of Arabic LETTERS only (no digits, no Latin): the current
 * time plus a random part written in base 28 with the Arabic alphabet.
 */
export function arabicLettersToken(): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  let out = '';
  while (n > 0) {
    out = ARABIC_LETTERS[n % 28] + out;
    n = Math.floor(n / 28);
  }
  return out;
}

/** A unique Arabic suite name of Arabic letters and spaces only: `منشأة <token>` (accepted by form and server). */
export const suiteFacilityArabicName = (): string => `منشأة ${arabicLettersToken()}`;

/** A unique suite e-mail (the e-mail is unique across facilities). */
export const suiteFacilityEmail = (stamp = facilityStamp()): string => `qa.facility.${stamp}@example.com`;

/**
 * `YYYY-MM-DD` of the day `days` from today IN RIYADH (UTC+3) - the
 * application's calendar: licence dates are date-only, compared with the
 * Riyadh date at save and by the midnight job.
 */
export function riyadhDay(days = 0): string {
  const d = new Date(Date.now() + 3 * 3_600_000);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `DD/MM/YYYY` - how the form's date pickers take a date and the list shows it. */
export function facilityDayText(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ---- lookups ------------------------------------------------------------------------

type LookupItem = { id: string; code: string; englishName: string; arabicName?: string };

async function lookupItems(page: Page, path: string): Promise<LookupItem[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', path);
  return res.status < 300 ? (payloadOrNull<LookupItem[]>(res) ?? []) : [];
}

export type FacilityTypeCode = 'clinic' | 'hospital' | 'pharmacy';
export type ProviderTypeCode = 'both' | 'integrationProvider' | 'providerPortal';
/** `pending` is labelled "Future". */
export type FacilityStatusCode = 'pending' | 'active' | 'inactive' | 'expired';

/** The Authority Code the form derives from the type. */
export const AUTHORITY_CODE: Record<FacilityTypeCode, string> = { clinic: '1', hospital: '2', pharmacy: '3' };

/** The status labels the screens show per code. */
export const FACILITY_STATUS_LABEL: Record<FacilityStatusCode, string> = { pending: 'Future', active: 'Active', inactive: 'Inactive', expired: 'Expired' };

export async function facilityTypeId(page: Page, code: FacilityTypeCode = 'pharmacy'): Promise<string> {
  const item = (await lookupItems(page, ApiEndpoints.facilityTypeLookup)).find((i) => i.code === code);
  if (!item) throw new Error(`the facilityType lookup has no "${code}"`);
  return item.id;
}

export async function providerTypeId(page: Page, code: ProviderTypeCode = 'both'): Promise<string> {
  const item = (await lookupItems(page, ApiEndpoints.providerTypeLookup)).find((i) => i.code === code);
  if (!item) throw new Error(`the providerType lookup has no "${code}"`);
  return item.id;
}

/** The facilityStatus lookup, code -> id. */
export async function facilityStatusIds(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries((await lookupItems(page, ApiEndpoints.facilityStatusLookup)).map((i) => [i.code, i.id]));
}

/** The facilityStatus lookup, id -> code. */
export async function facilityStatusCodes(page: Page): Promise<Record<string, FacilityStatusCode>> {
  return Object.fromEntries((await lookupItems(page, ApiEndpoints.facilityStatusLookup)).map((i) => [i.id, i.code as FacilityStatusCode]));
}

/** The Inactivate drawer's reasons (Licence Revoked, Contract Ended, Facility Closed, Relocated, Accreditation Lost, Quality of Care Concern, Other). */
export async function deactivationReasons(page: Page): Promise<LookupItem[]> {
  return lookupItems(page, ApiEndpoints.facilityDeactivationReasonLookup);
}

// ---- the record ---------------------------------------------------------------------

/** What CreateFacility / UpdateFacility take - captured from the form (2026-11-04). */
export interface FacilityBody {
  facilityNameEn: string;
  facilityNameAr: string;
  typeId: string | null;
  providerTypeId: string | null;
  email: string;
  phoneNumber: string | null;
  mobileNumber: string | null;
  licenseNo: string;
  /** `YYYY-MM-DD`. */
  licenseStartDate: string | null;
  licenseExpiryDate: string | null;
  buildingName: string | null;
  zipCode: string | null;
  additionalAddressEnglish: string | null;
  additionalAddressArabic: string | null;
  unitNumber: string | null;
  longitude: number | null;
  latitude: number | null;
  nationalCode: string | null;
  isActive: boolean;
}

/** GetFacility's payload. */
export interface FacilityRecord extends FacilityBody {
  id: string;
  facilityCode: string;
  authorityCode: string;
  /** The status from the licence dates (pending / active / expired). */
  statusId: string;
  /** The DISPLAYED status: inactive whenever isActive is false (expired wins). */
  effectiveStatusId: string;
  username: string | null;
  concurrencyStamp: string;
  createdByName: string | null;
  modifiedByName: string | null;
  createdOn: string;
  createdBy: string;
  modifiedOn: string | null;
  modifiedBy: string | null;
  deletedBy: string | null;
  deletedOn: string | null;
  [key: string]: unknown;
}

/** One list row as GetFacilities answers it. */
export interface FacilityListItem {
  id: string;
  facilityCode: string;
  facilityNameEn: string;
  facilityNameAr: string;
  typeId: string;
  statusId: string;
  isActive: boolean;
  effectiveStatusId: string;
  providerTypeId: string;
  email: string;
  phoneNumber: string | null;
  mobileNumber: string | null;
  licenseNo: string;
  licenseStartDate: string;
  licenseExpiryDate: string;
}

/** The KPI tiles' answer (`pending` = the "Future Facilities" tile). */
export interface FacilityDashboard {
  total: number;
  active: number;
  pending: number;
  inactive: number;
  expired: number;
}

/** One row of the Network Assignment tab (GetFacilityNetworks) - no network type is returned. */
export interface FacilityNetworkItem {
  id: string;
  networkCode: string;
  networkNameEn: string;
  networkNameAr: string;
  statusId: string;
  assignedOn: string;
}

/** One audit entry (GetAuditLogs); GetAuditLogById adds beforeJson / afterJson. */
export interface FacilityAuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  /** CREATE, UPDATE, STATUS_CHANGE (the job), DELETE (offered by the filter, never written: a delete is an UPDATE of IsDeleted). */
  actionType: string;
  actorUserId: string | null;
  actorLabel: string;
  occurredAtUtc: string;
  beforeJson?: string | null;
  afterJson?: string | null;
}

/** Throws unless the record is one the suite created (name prefix). */
export function assertSuiteOwned(record: { facilityNameEn?: string; id?: string }): void {
  if (!String(record.facilityNameEn ?? '').startsWith(SUITE_FACILITY_PREFIX)) {
    throw new Error(`refusing to change facility ${record.id ?? '?'} "${record.facilityNameEn ?? ''}": not a "${SUITE_FACILITY_PREFIX}" facility`);
  }
}

export async function readFacilityOrNull(page: Page, id: string): Promise<FacilityRecord | null> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.facilityGet, { id });
  return res.status === 200 ? payloadOrNull<FacilityRecord>(res) : null;
}

export async function readFacility(page: Page, id: string): Promise<FacilityRecord> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.facilityGet, { id });
  if (res.status !== 200) throw new Error(`GetFacility ${id} answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<FacilityRecord>(res) as FacilityRecord;
}

/** The register (GetFacilities) with any list criteria: `searchText, typeId, statusId, providerTypeId, sortBy`. */
export async function listFacilityRegister(page: Page, criteria: Record<string, unknown> = {}, rows = 100): Promise<{ items: FacilityListItem[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.facilityList, { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', ...criteria });
  if (res.status !== 200) throw new Error(`GetFacilities answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<{ facilities: { items: FacilityListItem[]; totalRows: number } }>(res)?.facilities ?? { items: [], totalRows: 0 };
}

export async function readFacilityDashboard(page: Page): Promise<FacilityDashboard> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.facilityDashboard, {});
  if (res.status !== 200) throw new Error(`GetFacilitiesDashboard answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<FacilityDashboard>(res) as FacilityDashboard;
}

/** A facility by its exact English name (a keyword search), or null. */
export async function findFacilityByName(page: Page, nameEn: string): Promise<FacilityListItem | null> {
  const { items } = await listFacilityRegister(page, { searchText: nameEn }, 50);
  return items.find((i) => i.facilityNameEn === nameEn) ?? null;
}

/** Every suite facility in the register. */
export async function listSuiteFacilities(page: Page): Promise<FacilityListItem[]> {
  return (await listFacilityRegister(page, { searchText: SUITE_FACILITY_PREFIX }, 500)).items.filter((i) => i.facilityNameEn.startsWith(SUITE_FACILITY_PREFIX));
}

/** The DISPLAYED status code of a facility (effectiveStatusId), or null when it is gone. */
export async function facilityStatusCode(page: Page, id: string): Promise<FacilityStatusCode | null> {
  const record = await readFacilityOrNull(page, id);
  if (!record) return null;
  return (await facilityStatusCodes(page))[record.effectiveStatusId] ?? null;
}

/** The licence-date status code (statusId) - "Future / Active / Expired" before the Is Active switch is applied. */
export async function facilityLicenceCode(page: Page, id: string): Promise<FacilityStatusCode | null> {
  const record = await readFacilityOrNull(page, id);
  if (!record) return null;
  return (await facilityStatusCodes(page))[record.statusId] ?? null;
}

export async function readFacilityNetworks(page: Page, facilityId: string, rows = 50): Promise<{ items: FacilityNetworkItem[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.facilityNetworks, { facilityId, pageNumber: 1, rowsPerPage: rows });
  if (res.status !== 200) throw new Error(`GetFacilityNetworks answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<{ networks: { items: FacilityNetworkItem[]; totalRows: number } }>(res)?.networks ?? { items: [], totalRows: 0 };
}

/**
 * A facility's audit trail as its Audit History tab reads it (GetAuditLogs,
 * `entityType: "Facility"`). NOTE (2026-11-04): the CREATE entry is written
 * under a different entity id than the facility's, so it never appears here.
 */
export async function readFacilityAuditTrail(
  page: Page,
  facilityId: string,
  filter: { actionType?: string | null; fromUtc?: string; toUtc?: string; searchText?: string } = {},
  rows = 100,
): Promise<{ items: FacilityAuditEntry[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogList, {
    entityType: 'Facility', entityId: facilityId, actionType: filter.actionType ?? null, ...filter, pageNumber: 1, rowsPerPage: rows,
  });
  if (res.status !== 200) throw new Error(`GetAuditLogs answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<{ items: FacilityAuditEntry[]; totalRows: number }>(res) ?? { items: [], totalRows: 0 };
}

/** One audit entry with its before / after JSON. */
export async function readAuditEntry(page: Page, auditId: string): Promise<FacilityAuditEntry> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogById, { id: auditId });
  if (res.status !== 200) throw new Error(`GetAuditLogById answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<FacilityAuditEntry>(res) as FacilityAuditEntry;
}

/** The fields an UPDATE entry changed, `{ field: [before, after] }`. */
export function auditChanges(entry: FacilityAuditEntry): Record<string, [unknown, unknown]> {
  const before = JSON.parse(entry.beforeJson ?? '{}') as Record<string, unknown>;
  const after = JSON.parse(entry.afterJson ?? '{}') as Record<string, unknown>;
  const out: Record<string, [unknown, unknown]> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = [before[key], after[key]];
  }
  return out;
}

// ---- writing ------------------------------------------------------------------------

/** What a case asks of a suite facility. Everything is optional. */
export interface SuiteFacilitySpec {
  /** Default `QA Automation Facility <stamp>`; must keep the suite prefix. */
  nameEn?: string;
  /** Default `منشأة <Arabic letters>`. */
  nameAr?: string;
  type?: FacilityTypeCode;
  providerType?: ProviderTypeCode;
  /** The Is Active switch (default true). */
  active?: boolean;
  /** Licence start, days from today (Riyadh). Default -10. */
  startInDays?: number;
  /** Licence expiry, days from today (Riyadh). Default +365. */
  expiryInDays?: number;
  /** Exact dates (`YYYY-MM-DD`) - override the offsets. */
  licenseStartDate?: string;
  licenseExpiryDate?: string;
  licenseNo?: string;
  email?: string;
  phoneNumber?: string | null;
  mobileNumber?: string | null;
  buildingName?: string | null;
  zipCode?: string | null;
  unitNumber?: string | null;
  additionalAddressEnglish?: string | null;
  additionalAddressArabic?: string | null;
  nationalCode?: string | null;
  /** Default 24.7136 / 46.6753 (Riyadh, the map's own centre); null leaves them empty. */
  latitude?: number | null;
  longitude?: number | null;
}

/** A create body for `spec` (lookups resolved). */
export async function facilityBody(page: Page, spec: SuiteFacilitySpec = {}): Promise<FacilityBody> {
  const stamp = facilityStamp();
  return {
    facilityNameEn: spec.nameEn ?? `${SUITE_FACILITY_PREFIX} ${stamp}`,
    facilityNameAr: spec.nameAr ?? suiteFacilityArabicName(),
    typeId: await facilityTypeId(page, spec.type ?? 'pharmacy'),
    providerTypeId: await providerTypeId(page, spec.providerType ?? 'both'),
    email: spec.email ?? suiteFacilityEmail(stamp),
    phoneNumber: spec.phoneNumber ?? null,
    mobileNumber: spec.mobileNumber ?? null,
    licenseNo: spec.licenseNo ?? `QA-LIC-${stamp}`.toUpperCase(),
    licenseStartDate: spec.licenseStartDate ?? riyadhDay(spec.startInDays ?? -10),
    licenseExpiryDate: spec.licenseExpiryDate ?? riyadhDay(spec.expiryInDays ?? 365),
    buildingName: spec.buildingName ?? null,
    zipCode: spec.zipCode ?? null,
    additionalAddressEnglish: spec.additionalAddressEnglish ?? null,
    additionalAddressArabic: spec.additionalAddressArabic ?? null,
    unitNumber: spec.unitNumber ?? null,
    longitude: spec.longitude === undefined ? 46.6753 : spec.longitude,
    latitude: spec.latitude === undefined ? 24.7136 : spec.latitude,
    nationalCode: spec.nationalCode ?? null,
    isActive: spec.active ?? true,
  };
}

/** POST CreateFacility with a raw body - for the validation cases (answer returned, nothing thrown). */
export async function requestCreateFacility(page: Page, body: Partial<FacilityBody>): Promise<FacilityAnswer & { id: string | null; facilityCode: string | null }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.facilityCreate, body);
  const payload = res.status < 300 ? payloadOrNull<{ id: string; facilityCode: string }>(res) : null;
  return { ...res, id: payload?.id ?? null, facilityCode: payload?.facilityCode ?? null };
}

/** What createSuiteFacility built. */
export interface ProvisionedFacility {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  email: string;
  licenseNo: string;
  licenseStartDate: string;
  licenseExpiryDate: string;
  type: FacilityTypeCode;
  isActive: boolean;
  /** The DISPLAYED status right after the save. */
  status: FacilityStatusCode;
  /** The licence-date status (statusId). */
  licenceStatus: FacilityStatusCode;
  record: FacilityRecord;
}

async function provisioned(page: Page, id: string, type: FacilityTypeCode): Promise<ProvisionedFacility> {
  const record = await readFacility(page, id);
  const codes = await facilityStatusCodes(page);
  return {
    id,
    code: record.facilityCode,
    nameEn: record.facilityNameEn,
    nameAr: record.facilityNameAr,
    email: record.email,
    licenseNo: record.licenseNo,
    licenseStartDate: String(record.licenseStartDate),
    licenseExpiryDate: String(record.licenseExpiryDate),
    type,
    isActive: record.isActive,
    status: codes[record.effectiveStatusId],
    licenceStatus: codes[record.statusId],
    record,
  };
}

/** Creates one suite facility as `spec` asks. Throws with the server's answer when refused. */
export async function createSuiteFacility(page: Page, spec: SuiteFacilitySpec = {}): Promise<ProvisionedFacility> {
  const body = await facilityBody(page, spec);
  assertSuiteOwned(body);
  const res = await requestCreateFacility(page, body);
  if (res.status >= 300 || !res.id) fail(body.facilityNameEn, 'CreateFacility', res);
  Logger.step(`[fixture] Created facility "${body.facilityNameEn}" (${res.facilityCode})`);
  return provisioned(page, res.id as string, spec.type ?? 'pharmacy');
}

/**
 * PUT UpdateFacility with `changes` over the facility's current values (read
 * first, so its concurrencyStamp is fresh unless `concurrencyStamp` is given -
 * a stale one answers 409 "Oops! It seems that while you were making changes,
 * someone else might have modified ..."). Answer returned, nothing thrown.
 */
export async function updateFacilityFields(
  page: Page,
  id: string,
  changes: Partial<FacilityBody>,
  options: { concurrencyStamp?: string } = {},
): Promise<FacilityAnswer> {
  const current = await readFacility(page, id);
  assertSuiteOwned(current);
  const body: FacilityBody & { id: string; concurrencyStamp: string } = {
    facilityNameEn: current.facilityNameEn,
    facilityNameAr: current.facilityNameAr,
    typeId: current.typeId,
    providerTypeId: current.providerTypeId,
    email: current.email,
    phoneNumber: current.phoneNumber,
    mobileNumber: current.mobileNumber,
    licenseNo: current.licenseNo,
    licenseStartDate: current.licenseStartDate,
    licenseExpiryDate: current.licenseExpiryDate,
    buildingName: current.buildingName,
    zipCode: current.zipCode,
    additionalAddressEnglish: current.additionalAddressEnglish,
    additionalAddressArabic: current.additionalAddressArabic,
    unitNumber: current.unitNumber,
    longitude: current.longitude,
    latitude: current.latitude,
    nationalCode: current.nationalCode,
    isActive: current.isActive,
    ...changes,
    id,
    concurrencyStamp: options.concurrencyStamp ?? current.concurrencyStamp,
  };
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.facilityUpdate, body);
}

/** Moves the licence dates by day offsets (e.g. extend an expired licence: `{ expiryInDays: 365 }`). */
export async function setLicenceDates(page: Page, id: string, dates: { startInDays?: number; expiryInDays?: number }): Promise<FacilityAnswer> {
  return updateFacilityFields(page, id, {
    ...(dates.startInDays !== undefined ? { licenseStartDate: riyadhDay(dates.startInDays) } : {}),
    ...(dates.expiryInDays !== undefined ? { licenseExpiryDate: riyadhDay(dates.expiryInDays) } : {}),
  });
}

/**
 * SetFacilityActive. Activate: `{ id, isActive: true }` (an expired licence ->
 * 409 "Cannot reactivate an expired facility."). Inactivate needs a reason
 * (422 "Invalid inactivation reason." without) and details when it is Other
 * (422 'Details are required when the reason is "Other".'). Applied at once.
 */
export async function setFacilityActive(
  page: Page,
  id: string,
  isActive: boolean,
  options: { reasonCode?: string; details?: string | null } = {},
): Promise<FacilityAnswer> {
  const record = await readFacility(page, id);
  assertSuiteOwned(record);
  if (isActive) return NetworkUtils.postAsSession(page, ApiEndpoints.facilitySetActive, { id, isActive: true });
  const reasons = await deactivationReasons(page);
  const reason = reasons.find((r) => r.code === (options.reasonCode ?? 'other')) ?? reasons[0];
  const details = options.details === undefined ? 'Inactivated by the automation suite.' : options.details;
  return NetworkUtils.postAsSession(page, ApiEndpoints.facilitySetActive, { id, isActive: false, inactivationReasonId: reason?.id ?? null, inactivationDetails: details });
}

export const activateFacility = (page: Page, id: string): Promise<FacilityAnswer> => setFacilityActive(page, id, true);
export const inactivateFacility = (page: Page, id: string, reasonCode = 'other', details: string | null = 'Inactivated by the automation suite.'): Promise<FacilityAnswer> =>
  setFacilityActive(page, id, false, { reasonCode, details });

/** DELETE DeleteFacility/{id} (suite facilities only). 200 "Facility has been deleted successfully." / 409 while in a network. */
export async function deleteFacility(page: Page, id: string): Promise<FacilityAnswer> {
  const record = await readFacilityOrNull(page, id);
  if (record) assertSuiteOwned(record);
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.facilityDelete}/${id}`);
}

/**
 * ExportFacilities with the list query + `format` (1 CSV, 2 Excel), read
 * through the session token. Answers the file's name and bytes - the export
 * covers the WHOLE matching set whatever `rowsPerPage` says.
 */
export async function exportFacilities(page: Page, criteria: Record<string, unknown> = {}, format: 'csv' | 'excel' = 'csv'): Promise<{ status: number; filename: string; bytes: Buffer }> {
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const res = await page.request.fetch(`${env.baseUrl}${ApiEndpoints.facilityExport}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { pageNumber: 1, rowsPerPage: 10, sortBy: 'CreatedOn desc', ...criteria, format: format === 'csv' ? 1 : 2 },
    failOnStatusCode: false,
  });
  const disposition = res.headers()['content-disposition'] ?? '';
  const filename = (disposition.match(/filename="?([^";]+)"?/) ?? [])[1] ?? '';
  return { status: res.status(), filename, bytes: await res.body() };
}

// ---- states -------------------------------------------------------------------------

/**
 * The states a case can ask for, and how each is built (all verified at save
 * 2026-11-04, see the notes' status table):
 *   Active          start -10, expiry +365, Is Active on      -> Active
 *   Future          start +10, expiry +365, on                -> Future   (stored pending)
 *   FutureInactive  start +10, expiry +365, OFF               -> Inactive (stored pending)
 *   Inactive        start -10, expiry +365, OFF               -> Inactive (stored active)
 *   InactiveWithReason  Active, then Inactivate (reason, details) -> Inactive, with inactivation fields
 *   ExpiresToday    start -30, expiry TODAY, on               -> Active   (Expired after the midnight job)
 *   Expired         start -30, expiry YESTERDAY, on           -> Expired  (the save accepts a past expiry)
 *   ExpiredInactive start -30, expiry yesterday, OFF          -> Expired  (Activate refused: 409)
 *   StartsToday     start TODAY, expiry +365, on              -> Active
 */
export type FacilityState =
  | 'Active'
  | 'Future'
  | 'FutureInactive'
  | 'Inactive'
  | 'InactiveWithReason'
  | 'ExpiresToday'
  | 'Expired'
  | 'ExpiredInactive'
  | 'StartsToday';

const STATE_SPEC: Record<FacilityState, { spec: SuiteFacilitySpec; expect: FacilityStatusCode }> = {
  Active: { spec: { startInDays: -10, expiryInDays: 365, active: true }, expect: 'active' },
  Future: { spec: { startInDays: 10, expiryInDays: 365, active: true }, expect: 'pending' },
  FutureInactive: { spec: { startInDays: 10, expiryInDays: 365, active: false }, expect: 'inactive' },
  Inactive: { spec: { startInDays: -10, expiryInDays: 365, active: false }, expect: 'inactive' },
  InactiveWithReason: { spec: { startInDays: -10, expiryInDays: 365, active: true }, expect: 'inactive' },
  ExpiresToday: { spec: { startInDays: -30, expiryInDays: 0, active: true }, expect: 'active' },
  Expired: { spec: { startInDays: -30, expiryInDays: -1, active: true }, expect: 'expired' },
  ExpiredInactive: { spec: { startInDays: -30, expiryInDays: -1, active: false }, expect: 'expired' },
  StartsToday: { spec: { startInDays: 0, expiryInDays: 365, active: true }, expect: 'active' },
};

/** The status a state reads right after it is built. */
export const expectedStatusOf = (state: FacilityState): FacilityStatusCode => STATE_SPEC[state].expect;

/**
 * Builds a suite facility in `state` (the case's `spec` overrides the state's
 * defaults, but not its dates unless given) and checks the displayed status
 * is the expected one - throwing (BLOCKED by the fixture) when it is not.
 */
export async function provisionSuiteFacility(page: Page, state: FacilityState, spec: SuiteFacilitySpec = {}): Promise<ProvisionedFacility> {
  const plan = STATE_SPEC[state];
  let facility = await createSuiteFacility(page, { ...plan.spec, ...spec });
  if (state === 'InactiveWithReason') {
    const res = await inactivateFacility(page, facility.id, 'other', 'Inactivated by the automation suite for its own case.');
    if (res.status >= 300) fail(facility.nameEn, 'SetFacilityActive(false)', res);
    facility = await provisioned(page, facility.id, facility.type);
  }
  const datesChanged = spec.startInDays !== undefined || spec.expiryInDays !== undefined || spec.licenseStartDate !== undefined
    || spec.licenseExpiryDate !== undefined || spec.active !== undefined;
  if (!datesChanged && facility.status !== plan.expect) {
    throw new Error(`facility "${facility.nameEn}" was built for ${state} but reads "${FACILITY_STATUS_LABEL[facility.status] ?? facility.status}", not "${FACILITY_STATUS_LABEL[plan.expect]}"`);
  }
  return facility;
}

// ---- networks -----------------------------------------------------------------------

/** What assignToSuiteNetwork built. */
export interface FacilityNetworkAssignment {
  network: ProvisionedNetwork;
  networkCode: string;
  facilityId: string;
}

/**
 * Puts a suite facility in a DISPOSABLE network (utils/NetworkProvisioning -
 * `Automation Network <stamp>`, HMO, no owner payer, effective in a minute):
 * create the draft with the facility, submit, approve. Only then does the
 * facility's Network Assignment tab list it (a DRAFT or pending network is not
 * listed): Code, Network Name, Status ("Future" until the network lifecycle job
 * - Jobs.NetworkLifecycleCron "40 9 * * *" UTC - makes it Active), Assigned On
 * (the assignment's time, DD/MM/YYYY).
 *
 * The facility must be an ACTIVE PHARMACY: the network's Assign Facilities pool
 * offers nothing else.
 *
 * NO WAY BACK (2026-11-04): a network must keep at least one facility (an
 * unassignment of the last one cannot be approved - 409 "A network must have
 * at least one assigned facility before this change can be approved.") and
 * cannot be deleted while it has facilities (409 "Cannot delete a network that
 * has assigned facilities ..."), and the facility cannot be deleted while
 * assigned (409 "This facility cannot be deleted because it is assigned to one
 * or more networks ..."). So the facility and the network stay in the
 * environment; discardSuiteFacility INACTIVATES such a facility.
 *
 * `extraFacilityIds` adds more suite facilities to the same network (the
 * "many memberships" cases build several networks instead).
 */
export async function assignToSuiteNetwork(page: Page, facility: ProvisionedFacility, options: { networkName?: string; extraFacilityCodes?: string[] } = {}): Promise<FacilityNetworkAssignment> {
  assertSuiteOwned({ facilityNameEn: facility.nameEn, id: facility.id });
  const network = await provisionNetwork(page, {
    ...(options.networkName ? { nameEn: options.networkName } : {}),
    facilityCodes: [facility.code, ...(options.extraFacilityCodes ?? [])],
    descriptionEn: 'Created by the Facility suite to hold its own facility.',
  });
  const record = await readNetwork(page, network.id);
  Logger.step(`[fixture] Facility ${facility.code} assigned to ${record.networkCode} "${network.name}"`);
  return { network, networkCode: String(record.networkCode ?? ''), facilityId: facility.id };
}

/** Polls GetFacilityNetworks until the facility lists `networkId` (the assignment shows once approved). */
export async function waitForFacilityNetwork(page: Page, facilityId: string, networkId: string, timeoutMs = 60_000): Promise<FacilityNetworkItem> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = (await readFacilityNetworks(page, facilityId)).items.find((n) => n.id === networkId);
    if (found) return found;
    await page.waitForTimeout(2_000);
  }
  throw new Error(`facility ${facilityId} does not list network ${networkId} after ${Math.round(timeoutMs / 1000)} s`);
}

// ---- teardown -----------------------------------------------------------------------

/**
 * Removes a suite facility: DELETE (a soft delete - gone from the register,
 * GetFacility 404, the name and e-mail free again). When the delete is refused
 * (in a network) the facility is INACTIVATED instead, if it is active.
 * Never touches a facility without the suite prefix.
 */
export async function discardSuiteFacility(page: Page, id: string): Promise<'gone' | 'inactivated' | 'left'> {
  const record = await readFacilityOrNull(page, id).catch(() => null);
  if (!record) return 'gone';
  if (!record.facilityNameEn.startsWith(SUITE_FACILITY_PREFIX)) {
    Logger.step(`[fixture] NOT discarding facility ${record.facilityCode} "${record.facilityNameEn}" - not a suite facility`);
    return 'left';
  }
  const deleted = await deleteFacility(page, id).catch(() => null);
  if (deleted && deleted.status < 300) {
    Logger.step(`[fixture] Deleted facility ${record.facilityCode} "${record.facilityNameEn}"`);
    return 'gone';
  }
  Logger.step(`[fixture] Facility ${record.facilityCode} could not be deleted (${deleted ? answerText(deleted).slice(0, 160) : 'no answer'})`);
  if (record.isActive) {
    const res = await inactivateFacility(page, id, 'other', 'Left by the automation suite: it cannot be deleted while it is in a network.').catch(() => null);
    if (res && res.status < 300) return 'inactivated';
  }
  return 'left';
}
