import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { RoleAdministrationPage } from '../../pages/system/RoleAdministrationPage';
import type { RolePermissionsStep } from '../../pages/system/RolePermissionsStep';
import { FacilityManagementPage } from '../../pages/facility/FacilityManagementPage';
import { FacilityDetailPage } from '../../pages/facility/FacilityDetailPage';
import { FacilityFormDrawer } from '../../pages/facility/FacilityFormDrawer';
import { FacilityNetworksTab, type FacilityNetworkRow } from '../../pages/facility/FacilityNetworksTab';
import { FacilityAuditTab } from '../../pages/facility/FacilityAuditTab';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { Timeouts } from '../../constants/Timeouts';
import { buttonSelector } from '../../constants/ElementIds';
import { FACILITY_DETAIL, FACILITY_NETWORKS } from '../../constants/facility/facilityIds';
import { env } from '../../constants/EnvironmentConfig';
import { FACILITY_MAP_HOST, FACILITY_NETWORKS_PAGER, facilityNetworkRowId } from '../../constants/facility/writerBIds';
import { PAYER_ADMIN_ROLE } from '../../data/accounts/payerAdminRole.data';
import { readEffectivePermissions } from '../EffectivePermissions';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import {
  DISPOSABLE_NETWORK_PREFIX,
  approvePending,
  networkStamp,
  networkStatusLabels,
  provisionNetwork,
  readNetwork,
  submitNetwork,
  waitForNetworkStatusCode,
  type NetworkRecord,
} from '../NetworkProvisioning';
import {
  SUITE_FACILITY_PREFIX,
  activateFacility,
  answerText,
  createSuiteFacility,
  facilityStatusCodes,
  findFacilityByName,
  listFacilityRegister,
  readFacility,
  readFacilityNetworks,
  riyadhDay,
  setLicenceDates,
  updateFacilityFields,
  waitForFacilityNetwork,
  type FacilityListItem,
  type FacilityNetworkItem,
  type FacilityRecord,
  type FacilityTypeCode,
  type ProvisionedFacility,
  type SuiteFacilitySpec,
} from '../FacilityProvisioning';

/**
 * Writer B's helpers for the facility folders 05 (Network Assignment tab), 06
 * (map location), 07 (created / modified), 08 (licence dates vs activation)
 * and 13 (Overview). The foundation (fixtures/facilityModule.fixture.ts,
 * utils/FacilityProvisioning.ts, pages/facility/*) is not edited
 * (reports/facility/Facility-Writers-Brief.md): what it lacks lives here.
 *
 *  - the long-lived NETWORK ANCHOR (find-or-create, exported for Writer C);
 *  - the date-arrival SEEDS (`npm run seed:facility`) and their claim helper;
 *  - the Leaflet map reads (the map carries no ids);
 *  - a `facilityRole` fixture shaping the Payer Admin role with Facilities.*
 *    rights (no facility role helper existed when these folders were written);
 *  - small readers (all Network Assignment pages, Overview date-times).
 */

// ---- small readers -----------------------------------------------------------------------

/** `YYYY-MM-DD` of an instant on the Riyadh calendar (UTC+3). */
export function riyadhDayOf(iso: string): string {
  return new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * The instant an Overview date-time names - "04/11/2026 03:25 PM", Riyadh time
 * - as epoch ms, or NaN when the text is not in that shape.
 */
export function overviewDateTimeMs(text: string): number {
  const m = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return Number.NaN;
  const [, dd, mm, yyyy, hh, min, ampm] = m;
  let hour = Number(hh) % 12;
  if (ampm.toUpperCase() === 'PM') hour += 12;
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour - 3, Number(min));
}

/** Minutes between an Overview date-time and a stored instant (Infinity when either cannot be read). */
export function minutesApart(overviewText: string, iso: string | null | undefined): number {
  const shown = overviewDateTimeMs(overviewText);
  const stored = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(shown) || Number.isNaN(stored)) return Number.POSITIVE_INFINITY;
  return Math.abs(shown - Math.floor(stored / 60_000) * 60_000) / 60_000;
}

/** The Overview's date-time shape ("04/11/2026 03:25 PM"). */
export const OVERVIEW_DATE_TIME = /^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} (AM|PM)$/;

/** A licence date as shown anywhere (raw `YYYY-MM-DD` on the Overview, `DD/MM/YYYY` in the table) -> `YYYY-MM-DD`. */
export function asIsoDay(shown: string): string {
  const t = shown.trim();
  const dmy = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return t.slice(0, 10);
}

/** How many decimals a coordinate is written with. */
export const decimalsOf = (value: string): number => (value.trim().split('.')[1] ?? '').length;

/** A coordinate as a number (NaN when blank). */
export const coordinate = (value: string): number => (value.trim() === '' || value.trim() === '—' ? Number.NaN : Number(value.replace(/,/g, '')));

/** A facility's displayed status label (effectiveStatusId) read through the API. */
export async function facilityStatusLabelOf(page: Page, id: string): Promise<string> {
  const record = await readFacility(page, id);
  const code = (await facilityStatusCodes(page))[record.effectiveStatusId];
  return { pending: 'Future', active: 'Active', inactive: 'Inactive', expired: 'Expired' }[code] ?? code ?? '';
}

/** The ProvisionedFacility description of an existing suite facility (anchor, claimed seed). */
export async function describeFacility(page: Page, id: string, type: FacilityTypeCode = 'pharmacy'): Promise<ProvisionedFacility> {
  const record = await readFacility(page, id);
  const codes = await facilityStatusCodes(page);
  return {
    id,
    code: record.facilityCode,
    nameEn: record.facilityNameEn,
    nameAr: record.facilityNameAr,
    email: record.email,
    licenseNo: record.licenseNo,
    licenseStartDate: String(record.licenseStartDate).slice(0, 10),
    licenseExpiryDate: String(record.licenseExpiryDate).slice(0, 10),
    type,
    isActive: record.isActive,
    status: codes[record.effectiveStatusId],
    licenceStatus: codes[record.statusId],
    record,
  };
}

// ---- Network Assignment tab --------------------------------------------------------------

/** A Network Assignment row with its whole text (every cell) - for "the type is shown" checks. */
export type NetworkRowWithText = FacilityNetworkRow & { text: string };

/** A Network Assignment row's whole text (every cell), '' when it is not on the current page. */
export async function networkRowText(page: Page, networkId: string): Promise<string> {
  return (await page.locator(`#${facilityNetworkRowId(networkId)}`).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
}

/** Clicks the tab's Next page; false when there is no further page. */
async function nextNetworkPage(page: Page): Promise<boolean> {
  const next = page.locator(buttonSelector(FACILITY_NETWORKS_PAGER.next)).first();
  if (!(await next.isVisible().catch(() => false)) || !(await next.isEnabled().catch(() => false))) return false;
  const answered = page.waitForResponse((r) => /\/GetFacilityNetworks$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
  await next.click();
  await answered;
  await page.waitForTimeout(300);
  return true;
}

/** Every row of the facility's Network Assignment tab, page after page (10 a page), with each row's text. */
export async function readAllNetworkRows(page: Page, tab: FacilityNetworksTab, maxPages = 20): Promise<NetworkRowWithText[]> {
  const out: NetworkRowWithText[] = [];
  for (let n = 0; n < maxPages; n += 1) {
    for (const row of await tab.readRows()) out.push({ ...row, text: await networkRowText(page, row.id) });
    if (n + 1 >= maxPages || !(await nextNetworkPage(page))) break;
  }
  return out;
}

/** Pages the (freshly opened) tab forward until the network's row is on screen; false when it never shows. */
export async function showNetworkRow(page: Page, tab: FacilityNetworksTab, networkId: string, maxPages = 20): Promise<boolean> {
  for (let n = 0; n < maxPages; n += 1) {
    if ((await tab.readRows()).some((r) => r.id === networkId)) return true;
    if (!(await nextNetworkPage(page))) return false;
  }
  return false;
}

/** Whether the Network Assignment table breaks the page sideways (the document scrolls, or the table runs past the window). */
export async function networkTableOverflows(page: Page): Promise<boolean> {
  return page.locator(`#${FACILITY_NETWORKS_TABLE}`).evaluate((table) => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1 || table.getBoundingClientRect().right > window.innerWidth + 1;
  }).catch(() => true);
}

const FACILITY_NETWORKS_TABLE = FACILITY_NETWORKS.table;

/** Inputs, selects and textareas inside the Network Assignment tab (an editable field would be one). */
export async function networkTabFieldCount(page: Page): Promise<number> {
  return page.locator(`#${FACILITY_DETAIL.root} [id^="facility-detail-networks"] input, #${FACILITY_DETAIL.root} [id^="facility-detail-networks"] select, #${FACILITY_DETAIL.root} [id^="facility-detail-networks"] textarea`).count();
}

/** The network type lookup, id -> label (HMO, PPO, EPO, POS). */
export async function networkTypeLabels(page: Page): Promise<Record<string, string>> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.networkTypeLookup);
  if (res.status !== 200) return {};
  const items = (JSON.parse(res.text) as { payload?: { id: string; englishName: string }[] }).payload ?? [];
  return Object.fromEntries(items.map((i) => [i.id, i.englishName]));
}

/** The status label the network's own master data carries (effectiveStatusId, else statusId). */
export async function networkMasterStatus(page: Page, networkId: string): Promise<string> {
  const record = await readNetwork(page, networkId);
  return (await networkStatusLabels(page))[record.effectiveStatusId ?? record.statusId] ?? '';
}

// ---- the long-lived NETWORK ANCHOR -------------------------------------------------------

/**
 * WHY AN ANCHOR (2026-11-04, Facility-Writers-Brief). A network cannot drop its
 * last facility nor be deleted while it holds one, and a facility cannot be
 * deleted while a network holds it - so every fresh facility + network pair is
 * a permanent leftover. The suite therefore keeps ONE long-lived pair and reuses
 * it: the suite facility `QA Automation Facility Network Anchor` (an ACTIVE
 * PHARMACY - the network pool offers nothing else) in the suite's own approved
 * network `Automation Network Facility Anchor <stamp>`. Both are found by the
 * suite's own names and created only when missing. Nothing the suite did not
 * create is ever touched.
 *
 * The "many memberships" cases (17470, 17471, 17472, 17474, 17477) need ONE
 * facility in several networks, which the single pair cannot be: they use a
 * second long-lived facility `QA Automation Facility Network Anchor Multi`
 * whose networks are created once (types HMO / PPO / EPO / POS in turn) and
 * reused. Writer C imports `networkAnchor` for its "facility in a network" cases.
 */
export const NETWORK_ANCHOR_NAME = `${SUITE_FACILITY_PREFIX} Network Anchor`;
export const NETWORK_ANCHOR_MULTI_NAME = `${SUITE_FACILITY_PREFIX} Network Anchor Multi`;
/** The anchor networks' name prefixes (all carry the disposable-network prefix "Automation Network"). */
export const ANCHOR_NETWORK_PREFIX = `${DISPOSABLE_NETWORK_PREFIX} Facility Anchor`;
export const ANCHOR_MULTI_NETWORK_PREFIX = `${DISPOSABLE_NETWORK_PREFIX} Facility Anchor Multi`;
/** 17474's long network name, kept behind the suite prefix (the case's test data). */
export const ANCHOR_LONG_NETWORK_PREFIX = `${DISPOSABLE_NETWORK_PREFIX} National Regional Integrated Health Network Consortium Extended`;

const ANCHOR_NETWORK_TYPES = ['HMO', 'PPO', 'EPO', 'POS'] as const;

/**
 * The anchor facility's record - FULLY populated (every optional field set), so
 * the Overview cases can use it as "a complete facility". Licence valid for
 * five years.
 */
export const ANCHOR_FACILITY_SPEC: SuiteFacilitySpec = {
  type: 'pharmacy',
  providerType: 'both',
  active: true,
  startInDays: -10,
  expiryInDays: 1825,
  nationalCode: 'NC-ANCHOR-01',
  phoneNumber: '+966112345678',
  mobileNumber: '+966501234567',
  buildingName: 'Anchor Medical Building',
  zipCode: '12345',
  unitNumber: '7',
  additionalAddressEnglish: 'King Fahd Road, Al Olaya District, Riyadh',
  additionalAddressArabic: 'طريق الملك فهد حي العليا الرياض',
  latitude: 24.713552,
  longitude: 46.675296,
};

/** One of an anchor's networks, as its tab and the network itself describe it. */
export interface AnchorNetwork {
  id: string;
  code: string;
  name: string;
  typeId: string;
  /** The GetFacilityNetworks row (statusId, assignedOn). */
  listed: FacilityNetworkItem;
  record: NetworkRecord;
}

export interface NetworkAnchor {
  facility: ProvisionedFacility;
  networks: AnchorNetwork[];
}

export interface NetworkAnchorOptions {
  /** 'single' (default): the one pair. 'multi': the facility held by several networks. */
  kind?: 'single' | 'multi';
  /** 'multi' only: the least number of networks it must hold (default 3). */
  networks?: number;
  /** 'multi' only: make sure one of its networks carries 17474's long name. */
  longName?: boolean;
}

/** Brings an anchor facility back to an Active, valid-licence pharmacy (it may have been inactivated by a teardown). */
async function reviveAnchor(page: Page, id: string): Promise<void> {
  let record = await readFacility(page, id);
  if (String(record.licenseExpiryDate).slice(0, 10) <= riyadhDay(0)) {
    Logger.step(`[anchor] Renewing the licence of ${record.facilityCode}`);
    const res = await setLicenceDates(page, id, { expiryInDays: 1825 });
    if (res.status >= 300) throw new Error(`could not renew the anchor's licence: ${res.status} ${answerText(res).slice(0, 200)}`);
    record = await readFacility(page, id);
  }
  if (!record.isActive) {
    Logger.step(`[anchor] Activating ${record.facilityCode} again`);
    const res = await activateFacility(page, id);
    if (res.status >= 300) throw new Error(`could not activate the anchor: ${res.status} ${answerText(res).slice(0, 200)}`);
  }
}

/**
 * Finds - or creates once - the long-lived anchor and makes sure it holds the
 * networks asked for. Throws with the server's answer when the application
 * refuses a step (callers turn that into BLOCKED). ~1 s when everything exists;
 * ~10 s per network it has to create.
 */
export async function findOrCreateNetworkAnchor(page: Page, options: NetworkAnchorOptions = {}): Promise<NetworkAnchor> {
  const kind = options.kind ?? 'single';
  const name = kind === 'multi' ? NETWORK_ANCHOR_MULTI_NAME : NETWORK_ANCHOR_NAME;
  const prefix = kind === 'multi' ? ANCHOR_MULTI_NETWORK_PREFIX : ANCHOR_NETWORK_PREFIX;
  const wanted = kind === 'multi' ? Math.max(1, options.networks ?? 3) : 1;

  const found = await findFacilityByName(page, name);
  let id: string;
  if (found) {
    id = found.id;
    await reviveAnchor(page, id);
  } else {
    Logger.step(`[anchor] Creating the long-lived facility "${name}"`);
    id = (await createSuiteFacility(page, { ...ANCHOR_FACILITY_SPEC, nameEn: name })).id;
  }
  const facility = await describeFacility(page, id);

  const suiteNetworks = async (): Promise<FacilityNetworkItem[]> =>
    (await readFacilityNetworks(page, id, 100)).items.filter((n) => n.networkNameEn.startsWith(DISPOSABLE_NETWORK_PREFIX));
  let listed = await suiteNetworks();

  const create = async (networkName: string, type: string): Promise<void> => {
    Logger.step(`[anchor] Placing ${facility.code} in its own network "${networkName}" (${type})`);
    const network = await provisionNetwork(page, {
      nameEn: networkName,
      type,
      facilityCodes: [facility.code],
      descriptionEn: 'Long-lived network of the Facility suite: holds its anchor facility. Do not edit.',
    });
    await waitForFacilityNetwork(page, id, network.id);
  };

  if (kind === 'multi' && options.longName && !listed.some((n) => n.networkNameEn.startsWith(ANCHOR_LONG_NETWORK_PREFIX))) {
    await create(`${ANCHOR_LONG_NETWORK_PREFIX} ${networkStamp()}`, ANCHOR_NETWORK_TYPES[listed.length % ANCHOR_NETWORK_TYPES.length]);
    listed = await suiteNetworks();
  }
  while (listed.length < wanted) {
    await create(`${prefix} ${networkStamp()}`, ANCHOR_NETWORK_TYPES[listed.length % ANCHOR_NETWORK_TYPES.length]);
    listed = await suiteNetworks();
  }

  const networks: AnchorNetwork[] = [];
  for (const item of listed) {
    const record = await readNetwork(page, item.id);
    networks.push({ id: item.id, code: item.networkCode, name: item.networkNameEn, typeId: record.networkTypeId, listed: item, record });
  }
  return { facility, networks };
}

/** The single long-lived pair - the export Writer C uses for "a facility in a network". */
export const networkAnchor = (page: Page): Promise<NetworkAnchor> => findOrCreateNetworkAnchor(page, { kind: 'single' });

/**
 * Saves the anchor's record again with EVERY optional field filled (the
 * English additional address carries a fresh stamp, so the save is a real
 * change and leaves an UPDATE entry on its Audit History tab). Returns the
 * record as stored. Suite-owned only (updateFacilityFields checks the name).
 */
export async function refreshAnchorRecord(page: Page, anchor: NetworkAnchor): Promise<FacilityRecord> {
  const s = ANCHOR_FACILITY_SPEC;
  const res = await updateFacilityFields(page, anchor.facility.id, {
    nationalCode: s.nationalCode ?? null,
    phoneNumber: s.phoneNumber ?? null,
    mobileNumber: s.mobileNumber ?? null,
    buildingName: s.buildingName ?? null,
    zipCode: s.zipCode ?? null,
    unitNumber: s.unitNumber ?? null,
    additionalAddressEnglish: `${s.additionalAddressEnglish} (${networkStamp()})`,
    additionalAddressArabic: s.additionalAddressArabic ?? null,
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
  });
  if (res.status >= 300) throw new Error(`could not refresh the anchor's record: ${res.status} ${answerText(res).slice(0, 200)}`);
  return readFacility(page, anchor.facility.id);
}

/** The anchor for a case, or BLOCKED (with the application's answer) when it cannot be found or built. */
export async function anchorOrBlocked(page: Page, testInfo: TestInfo, options: NetworkAnchorOptions = {}): Promise<NetworkAnchor> {
  try {
    if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
    return await findOrCreateNetworkAnchor(page, options);
  } catch (error) {
    return blockedByPrecondition(testInfo, `the suite's long-lived network anchor (${options.kind ?? 'single'}${options.networks ? `, ${options.networks} networks` : ''})`, error);
  }
}

/**
 * Inactivates (or re-activates) one of the SUITE's anchor networks the way the
 * Network module does it: SetNetworkInactive (reason + details) / SetNetworkActive
 * stages the change, Submit for Approval, approve - then waits for the status.
 * Refuses a network without the disposable prefix.
 */
export async function setSuiteNetworkActive(page: Page, network: { id: string; name: string }, active: boolean): Promise<void> {
  if (!network.name.startsWith(DISPOSABLE_NETWORK_PREFIX)) throw new Error(`refusing to change network "${network.name}": not a suite network`);
  let staged: { status: number; text: string };
  if (active) {
    staged = await NetworkUtils.postAsSession(page, ApiEndpoints.networkSetActive, { id: network.id });
  } else {
    const reasons = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.networkInactivationReasonLookup);
    const reasonId = reasons.status === 200 ? ((JSON.parse(reasons.text) as { payload?: { id: string }[] }).payload ?? [])[0]?.id : undefined;
    staged = await NetworkUtils.postAsSession(page, ApiEndpoints.networkSetInactive, {
      id: network.id,
      inactivationReasonId: reasonId ?? null,
      inactivationDetails: 'Inactivated by the Facility suite (17481) and re-activated by the same case.',
    });
  }
  if (staged.status >= 300) throw new Error(`${active ? 'SetNetworkActive' : 'SetNetworkInactive'} answered ${staged.status} ${staged.text.slice(0, 300)}`);
  await submitNetwork(page, network.id, network.name);
  await approvePending(page, network.name);
  await waitForNetworkStatusCode(page, network.id, active ? 'active' : 'inactive', 3 * 60_000);
}

// ---- date-arrival SEEDS (npm run seed:facility) ------------------------------------------

/**
 * WHY SEEDS (2026-11-04). A facility's status is computed at save and moved by
 * a facility job at ~00:00 Riyadh that is NOT in System Settings, so "the start
 * date ARRIVES" / "the end of the expiry day PASSES" cannot be produced while a
 * case runs. `npm run seed:facility` makes, the day BEFORE a run, suite
 * facilities named `QA Automation Facility Seed <purpose> <stamp>`; on the run
 * day a case claims one made on an EARLIER Riyadh day and checks what the
 * nightly job did (BLOCKED, naming the seeder, when none is available). The
 * case's teardown discards the claimed seed.
 *
 *   StartArrives   start = TOMORROW, expiry +365, Is Active OFF  (17548, 17554: the start date arrives, not activated)
 *   ExpiryPasses   start -30, expiry = TODAY, Is Active ON        (17552: Active on its expiry day, Expired once that day ended)
 *   ExpiryArrives  start -30, expiry = TOMORROW, Is Active ON     (17552: on the run day its expiry is TODAY after a midnight run)
 */
export const SEED_FACILITY_PREFIX = `${SUITE_FACILITY_PREFIX} Seed`;

export type FacilitySeedPurpose = 'StartArrives' | 'ExpiryPasses' | 'ExpiryArrives';

const SEED_SPEC: Record<FacilitySeedPurpose, SuiteFacilitySpec> = {
  StartArrives: { startInDays: 1, expiryInDays: 365, active: false },
  ExpiryPasses: { startInDays: -30, expiryInDays: 0, active: true },
  ExpiryArrives: { startInDays: -30, expiryInDays: 1, active: true },
};

/** Default number of seeds per purpose (`SEED_FACILITY_<PURPOSE>` overrides). */
export const SEED_DEFAULT_COUNT: Record<FacilitySeedPurpose, number> = { StartArrives: 3, ExpiryPasses: 2, ExpiryArrives: 2 };

/** Creates `count` seeds of one purpose; returns their names. */
export async function seedFacilityDates(page: Page, purpose: FacilitySeedPurpose, count: number): Promise<string[]> {
  const names: string[] = [];
  for (let n = 0; n < count; n += 1) {
    const nameEn = `${SEED_FACILITY_PREFIX} ${purpose} ${networkStamp()}`;
    await createSuiteFacility(page, { ...SEED_SPEC[purpose], nameEn });
    names.push(nameEn);
  }
  return names;
}

/** A seed with the dates a claim filters on (all `YYYY-MM-DD`, Riyadh). */
export interface FacilitySeed {
  item: FacilityListItem;
  record: FacilityRecord;
  purpose: FacilitySeedPurpose;
  createdDay: string;
  start: string;
  expiry: string;
}

/** The seeds of a purpose still in the register, oldest licence start first, then oldest first. */
export async function listFacilitySeeds(page: Page, purpose: FacilitySeedPurpose): Promise<FacilitySeed[]> {
  const prefix = `${SEED_FACILITY_PREFIX} ${purpose} `;
  const { items } = await listFacilityRegister(page, { searchText: prefix.trim() }, 200);
  const out: FacilitySeed[] = [];
  for (const item of items.filter((i) => i.facilityNameEn.startsWith(prefix))) {
    const record = await readFacility(page, item.id).catch(() => null);
    if (!record) continue;
    out.push({
      item,
      record,
      purpose,
      createdDay: riyadhDayOf(record.createdOn),
      start: String(record.licenseStartDate).slice(0, 10),
      expiry: String(record.licenseExpiryDate).slice(0, 10),
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || Date.parse(a.record.createdOn) - Date.parse(b.record.createdOn));
}

/**
 * Claims the first seed of the purposes given that `accept` takes, or null.
 * The caller registers it for teardown (`discardFacilityId`) - a claimed seed is
 * used up - and turns null into a BLOCKED naming `npm run seed:facility`.
 */
export async function claimFacilitySeed(
  page: Page,
  purposes: FacilitySeedPurpose | readonly FacilitySeedPurpose[],
  accept: (seed: FacilitySeed) => boolean,
): Promise<{ seed: FacilitySeed; facility: ProvisionedFacility } | null> {
  for (const purpose of typeof purposes === 'string' ? [purposes] : purposes) {
    const seed = (await listFacilitySeeds(page, purpose)).find(accept);
    if (seed) {
      Logger.step(`[seed] Claiming "${seed.item.facilityNameEn}" (${seed.item.facilityCode}; made ${seed.createdDay}, start ${seed.start}, expiry ${seed.expiry})`);
      return { seed, facility: await describeFacility(page, seed.item.id) };
    }
  }
  return null;
}

/** The BLOCKED reason when no seed fits. */
export const noSeedReason = (what: string): string =>
  `no facility seed ${what} is available: the facility status job runs only at ~00:00 Riyadh and cannot be scheduled in System Settings, `
  + 'so the date must arrive overnight - run `npm run seed:facility` the day before (seeds made on an EARLIER Riyadh day are claimed)';

// ---- the Leaflet maps (no ids) -----------------------------------------------------------

/** The map canvas under a host (`drawer` step 2 / `overview` Geo-coordinates). */
function mapCanvas(page: Page, host: keyof typeof FACILITY_MAP_HOST): Locator {
  return page.locator(`#${FACILITY_MAP_HOST[host]} .pbm-map__canvas`).first(); // locator-exception: the Leaflet map host carries no id; it is the only map under its id-scoped root.
}

/** The markers drawn on a map now (Leaflet's marker icons). */
export async function mapMarkerCount(page: Page, host: keyof typeof FACILITY_MAP_HOST): Promise<number> {
  return page.locator(`#${FACILITY_MAP_HOST[host]} .leaflet-marker-icon`).filter({ visible: true }).count(); // locator-exception: Leaflet's marker icons carry no id; counted under the id-scoped root.
}

/** Whether a map renders under the host. */
export async function isMapShown(page: Page, host: keyof typeof FACILITY_MAP_HOST): Promise<boolean> {
  return mapCanvas(page, host).isVisible().catch(() => false);
}

/** The drawer map's size (for clicks near its edges with FacilityFormDrawer.clickMap offsets). */
export async function drawerMapSize(page: Page): Promise<{ width: number; height: number }> {
  const canvas = mapCanvas(page, 'drawer');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('the facility map is not on screen (step 2 "Pick location on map")');
  return { width: box.width, height: box.height };
}

/** Whether the (first) marker sits inside the drawer map's visible area. */
export async function isMarkerInsideMap(page: Page): Promise<boolean> {
  const canvas = await mapCanvas(page, 'drawer').boundingBox();
  const marker = await page.locator(`#${FACILITY_MAP_HOST.drawer} .leaflet-marker-icon`).first().boundingBox().catch(() => null); // locator-exception: Leaflet's marker icon carries no id; reached under the drawer's id.
  if (!canvas || !marker) return false;
  const x = marker.x + marker.width / 2;
  const y = marker.y + marker.height;
  return x >= canvas.x && x <= canvas.x + canvas.width && y >= canvas.y && y <= canvas.y + canvas.height;
}

/** Zooms the drawer map out until its zoom-out control is disabled (Leaflet's minimum zoom), at most `max` clicks. */
export async function zoomDrawerMapOutFully(drawer: FacilityFormDrawer, page: Page, max = 20): Promise<void> {
  const control = page.locator(`#${FACILITY_MAP_HOST.drawer} .leaflet-control-zoom-out`).first(); // locator-exception: Leaflet's zoom button carries no id; reached under the drawer's id.
  for (let i = 0; i < max; i += 1) {
    if (((await control.getAttribute('class').catch(() => '')) ?? '').includes('leaflet-disabled')) return;
    await drawer.zoomMap('out', 1);
  }
}

/** Zooms the drawer map in until its zoom-in control is disabled (Leaflet's maximum zoom). */
export async function zoomDrawerMapInFully(drawer: FacilityFormDrawer, page: Page, max = 25): Promise<void> {
  const control = page.locator(`#${FACILITY_MAP_HOST.drawer} .leaflet-control-zoom-in`).first(); // locator-exception: Leaflet's zoom button carries no id; reached under the drawer's id.
  for (let i = 0; i < max; i += 1) {
    if (((await control.getAttribute('class').catch(() => '')) ?? '').includes('leaflet-disabled')) return;
    await drawer.zoomMap('in', 1);
  }
}

// ---- Overview layout ---------------------------------------------------------------------

/** Pairs of Overview values whose boxes overlap on screen (a broken layout), as "a / b". */
export async function overlappingOverviewValues(page: Page): Promise<string[]> {
  const ids = Object.values(FACILITY_DETAIL.overview);
  return page.locator(ids.map((id) => `#${id}`).join(', ')).evaluateAll((els) => {
    const boxes = els
      .map((el) => ({ id: el.id, r: (el as HTMLElement).getBoundingClientRect() }))
      .filter((b) => b.r.width > 0 && b.r.height > 0);
    const out: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].r;
        const b = boxes[j].r;
        const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        if (overlap) out.push(`${boxes[i].id} / ${boxes[j].id}`);
      }
    }
    return out;
  });
}

/** Whether an Overview value spills out of the page sideways (horizontal overflow of the document or the value). */
export async function overviewOverflows(page: Page, field: keyof typeof FACILITY_DETAIL.overview): Promise<boolean> {
  return page.locator(`#${FACILITY_DETAIL.overview[field]}`).last().evaluate((el) => {
    const doc = document.documentElement;
    const rect = el.getBoundingClientRect();
    return doc.scrollWidth > doc.clientWidth + 1 || rect.right > window.innerWidth + 1;
  }).catch(() => true);
}

/** The computed text direction of an Overview value ('rtl' / 'ltr'). */
export async function overviewDirection(page: Page, field: keyof typeof FACILITY_DETAIL.overview): Promise<string> {
  return page.locator(`#${FACILITY_DETAIL.overview[field]}`).last().evaluate((el) => window.getComputedStyle(el).direction).catch(() => '');
}

/** The computed text direction of the header's English name. */
export async function headerNameDirection(page: Page): Promise<string> {
  return page.locator(`#${FACILITY_DETAIL.name}`).evaluate((el) => window.getComputedStyle(el).direction).catch(() => '');
}

// ---- the facilityRole fixture (Payer Admin shaped with Facilities.* rights) ----------------

/**
 * The Facilities rights of the role catalogue (`/identity/Roles/GetRolePermissions`,
 * section "Facilities", foundation notes 2026-11-04). Catalogue LABEL = the key
 * without "Facilities.". `GetFacilities` is the LIST right and the PARENT of every
 * other one (the terminology trap: granting it ticks every child). The section's
 * "View Audit Logs" (Facilities.AuditLogs) shares its label with every other
 * section, so it cannot be targeted and is not listed. On 2026-11-04 the Payer
 * Admin role held only UpdateFacility, GetFacilityNetworks, SetFacilityActive,
 * GetFacilitiesDashboard, GetFacilitiesDropdown (and no AuditLogs.* right).
 */
export const FACILITY_RIGHT = {
  list: 'GetFacilities',
  view: 'GetFacility',
  create: 'CreateFacility',
  edit: 'UpdateFacility',
  delete: 'DeleteFacility',
  export: 'ExportFacilities',
  dashboard: 'GetFacilitiesDashboard',
  dropdown: 'GetFacilitiesDropdown',
  networks: 'GetFacilityNetworks',
  setActive: 'SetFacilityActive',
} as const;

export type FacilityRight = keyof typeof FACILITY_RIGHT;

/** A shape: rights ticked first, then rights unticked. */
export interface FacilityShape {
  with?: readonly FacilityRight[];
  without?: readonly FacilityRight[];
}

/** Every right, the parent first. */
const ALL_FACILITY_RIGHTS: readonly FacilityRight[] = Object.keys(FACILITY_RIGHT) as FacilityRight[];

/** The effective-permission code of a right (`Facilities.GetFacility`). */
export const facilityRightCode = (right: FacilityRight): string => `Facilities.${FACILITY_RIGHT[right]}`;

/** The Payer Admin account, shaped for a facility case, signed in. */
export interface FacilitySession {
  page: Page;
  facilities: FacilityManagementPage;
  detail: FacilityDetailPage;
  drawer: FacilityFormDrawer;
  networks: FacilityNetworksTab;
  audit: FacilityAuditTab;
  removed: string[];
  granted: string[];
  /** Withheld rights the account is STILL told it holds. */
  stillHeld: string[];
}

export interface FacilityRoleControl {
  /** Shapes the role (grants first, then withholds), saves, and signs a fresh Payer Admin session in. */
  signIn: (shape: FacilityShape) => Promise<FacilitySession>;
}

export interface FacilityRoleFixtures {
  facilityRole: FacilityRoleControl;
  /** BLOCKS the case unless the shaped account can list facilities (role edits were seen not to reach the account - Policy 2026-11-04). */
  requireFacilityListAccess: (session: FacilitySession) => Promise<void>;
}

/**
 * `test` with the `facilityRole` fixture - built as utils/policy/policyRole.ts:
 * the rights are toggled by catalogue LABEL on the SAME "Payer Admin" role,
 * restored exactly at teardown (a snapshot, parent first), and the account is
 * signed in through shapedNonAdmin({}). Evidence, never a verdict: a withheld
 * right the account is still told it holds is annotated
 * `permission-not-propagated`, a granted one it is not told it holds
 * `permission-not-granted`.
 */
export const facilityRoleTest = base.extend<FacilityRoleFixtures>({
  facilityRole: async ({ browser, shapedNonAdmin }, use, testInfo) => {
    let adminContext: BrowserContext | null = null;
    let roles: RoleAdministrationPage | null = null;
    let snapshot: Map<string, boolean> | null = null;
    let touched = false;

    const adminRoles = async (): Promise<RoleAdministrationPage> => {
      if (roles === null) {
        adminContext = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
        roles = new RoleAdministrationPage(await adminContext.newPage());
      }
      return roles;
    };

    const openCatalogue = async (): Promise<RolePermissionsStep> => {
      const step = await (await adminRoles()).openPermissionCatalogue(PAYER_ADMIN_ROLE);
      if (snapshot === null) {
        snapshot = new Map();
        for (const right of ALL_FACILITY_RIGHTS) {
          const label = FACILITY_RIGHT[right];
          const checked = await step.isPermissionChecked(label).catch(() => null);
          if (checked !== null) snapshot.set(label, checked);
        }
      }
      return step;
    };

    const setLabels = async (entries: ReadonlyArray<{ label: string; wanted: boolean }>): Promise<void> => {
      if (entries.length === 0) return;
      const step = await openCatalogue();
      let moved = 0;
      for (const { label, wanted } of entries) {
        if ((await step.isPermissionChecked(label)) === wanted) continue;
        await step.togglePermission(label);
        moved += 1;
      }
      if (moved === 0) await (await adminRoles()).closeDrawer().catch(() => undefined);
      else {
        await (await adminRoles()).saveRole();
        touched = true;
      }
    };

    const signIn = async (shape: FacilityShape): Promise<FacilitySession> => {
      const wanted = [
        ...(shape.with ?? []).map((right) => ({ label: FACILITY_RIGHT[right], wanted: true })),
        ...(shape.without ?? []).map((right) => ({ label: FACILITY_RIGHT[right], wanted: false })),
      ];
      testInfo.setTimeout(testInfo.timeout + 120_000);
      try {
        Logger.step(`[facilityRole] Shaping "${PAYER_ADMIN_ROLE}": ${wanted.map((w) => `${w.wanted ? '+' : '-'}${w.label}`).join(', ')}`);
        await setLabels(wanted);
      } catch (error) {
        blockedByPrecondition(testInfo, `the "${PAYER_ADMIN_ROLE}" role shaped with facility rights ${JSON.stringify(shape)}`, error);
      }
      const shaped = await shapedNonAdmin({});
      const page = shaped.page;
      const effective = await readEffectivePermissions(page).catch(() => [] as string[]);
      const stillHeld = (shape.without ?? []).map(facilityRightCode).filter((code) => effective.includes(code));
      if (stillHeld.length > 0) {
        const note = `the role no longer holds ${stillHeld.join(', ')}, yet the signed-in Payer Admin is still told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-propagated', description: note });
      }
      const notGranted = (shape.with ?? []).map(facilityRightCode).filter((code) => effective.length > 0 && !effective.includes(code));
      if (notGranted.length > 0) {
        const note = `the role holds ${notGranted.join(', ')}, yet the signed-in Payer Admin is not told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-granted', description: note });
      }
      return {
        page,
        facilities: new FacilityManagementPage(page),
        detail: new FacilityDetailPage(page),
        drawer: new FacilityFormDrawer(page),
        networks: new FacilityNetworksTab(page),
        audit: new FacilityAuditTab(page),
        removed: (shape.without ?? []).map((r) => FACILITY_RIGHT[r]),
        granted: (shape.with ?? []).map((r) => FACILITY_RIGHT[r]),
        stillHeld,
      };
    };

    await use({ signIn });

    // ---- teardown: the shared role back exactly as it was found (parent first) ----
    if (touched && snapshot !== null) {
      Logger.step(`[facilityRole] Restoring "${PAYER_ADMIN_ROLE}"`);
      await setLabels([...(snapshot as Map<string, boolean>).entries()].map(([label, original]) => ({ label, wanted: original })));
    }
    if (adminContext !== null) await (adminContext as BrowserContext).close();
  },

  requireFacilityListAccess: async ({}, use, testInfo) => {
    await use(async (session) => {
      if (await session.facilities.canListFacilities()) return;
      blockedByPrecondition(
        testInfo,
        'a shaped Payer Admin that can list facilities',
        new Error('the shaped account is refused GetFacilities - the role was given Facilities.GetFacilities (the parent of every facility right) '
          + 'but the signed-in account does not hold it (see the permission-not-granted evidence), so no facility screen can be reached'),
      );
    });
  },
});

export { expect };

/** A write sent from a shaped session straight to the API (the refusal half of a permission case). */
export async function sessionRequest(session: FacilitySession, method: 'POST' | 'PUT', path: string, body: unknown): Promise<{ status: number; text: string }> {
  return method === 'PUT' ? NetworkUtils.requestAsSession(session.page, 'PUT', path, body) : NetworkUtils.postAsSession(session.page, path, body);
}
