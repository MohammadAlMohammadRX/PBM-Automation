import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';

/** A facility as the Facility module's directory describes it. */
export interface DirectoryFacility {
  id: string;
  code: string;
  nameEn: string;
  /** The facility type's English label (lookup `facilityType`), '' when unresolved. */
  type: string;
  /** The facility's own status label (lookup `facilityStatus`), '' when unresolved. */
  status: string;
}

/**
 * The Facility module's register, read through the API the module itself uses.
 *
 * locator-exception (API): the endpoint follows the module's permission names
 * ("Facilities > GetFacilities", seen in the role catalogue 2026-10-21) and was
 * NOT observed in traffic - the network stories had no reason to open the
 * Facility module. So the response is parsed defensively, and a refusal is
 * thrown with the server's answer: the facility-eligibility cases then report
 * BLOCKED naming it, rather than guessing a facility's type.
 */
export const FACILITY_LIST_ENDPOINT = '/api/Facilities/GetFacilities';
const TYPE_LOOKUP = '/api/Lookups/Items/facilityType';
const STATUS_LOOKUP = '/api/Lookups/Items/facilityStatus';

async function lookupLabels(page: Page, path: string): Promise<Record<string, string>> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', path);
  if (res.status !== 200) return {};
  const items = (JSON.parse(res.text) as { payload?: { id: string; englishName: string }[] }).payload ?? [];
  return Object.fromEntries(items.map((i) => [i.id, i.englishName]));
}

/** The first array of objects carrying a `facilityCode`, wherever the envelope puts it. */
function findFacilityItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'facilityCode' in value[0]) {
      return value as Record<string, unknown>[];
    }
    return [];
  }
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      const found = findFacilityItems(child);
      if (found.length > 0) return found;
    }
  }
  return [];
}

/** Every facility in the directory, with its type and status resolved. Throws when unreadable. */
export async function readFacilityDirectory(page: Page): Promise<DirectoryFacility[]> {
  const res = await NetworkUtils.postAsSession(page, FACILITY_LIST_ENDPOINT, { pageNumber: 1, rowsPerPage: 500 });
  if (res.status !== 200) {
    throw new Error(`the facility directory (${FACILITY_LIST_ENDPOINT}) answered ${res.status} ${res.text.slice(0, 200)}`);
  }
  const items = findFacilityItems(JSON.parse(res.text));
  if (items.length === 0) throw new Error(`the facility directory answered no facilities: ${res.text.slice(0, 200)}`);
  const types = await lookupLabels(page, TYPE_LOOKUP);
  const statuses = await lookupLabels(page, STATUS_LOOKUP);
  return items.map((item) => {
    const typeId = String(item.facilityTypeId ?? item.typeId ?? '');
    // The displayed status first, as for networks (see waitForNetworkStatusCode).
    const statusId = String(item.effectiveStatusId ?? item.facilityStatusId ?? item.statusId ?? '');
    return {
      id: String(item.id ?? item.facilityId ?? ''),
      code: String(item.facilityCode ?? ''),
      nameEn: String(item.facilityNameEn ?? item.nameEn ?? ''),
      type: types[typeId] ?? String(item.facilityTypeEn ?? item.facilityType ?? ''),
      status: statuses[statusId] ?? String(item.facilityStatusEn ?? item.status ?? ''),
    };
  });
}

/** Whether a directory facility is a pharmacy, by its type label. */
export const isPharmacy = (facility: DirectoryFacility): boolean => /pharm/i.test(facility.type);

/** Whether a directory facility is Active, by its status label. */
export const isActiveFacility = (facility: DirectoryFacility): boolean => /^active$/i.test(facility.status);
