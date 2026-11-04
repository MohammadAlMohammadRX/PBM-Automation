import type { BrowserContext, Page } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { RoleAdministrationPage } from '../../pages/system/RoleAdministrationPage';
import type { RolePermissionsStep } from '../../pages/system/RolePermissionsStep';
import { FacilityManagementPage, type FacilityListAnswer } from '../../pages/facility/FacilityManagementPage';
import { FacilityDetailPage } from '../../pages/facility/FacilityDetailPage';
import type { FacilityBasicInfo, FacilityContactInfo, FacilityFormDrawer, FacilitySaveAnswer } from '../../pages/facility/FacilityFormDrawer';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { Timeouts } from '../../constants/Timeouts';
import { GLOBAL, buttonSelector } from '../../constants/ElementIds';
import { FACILITY_DETAIL, FACILITY_LIST, type FacilityKpiKey } from '../../constants/facility/facilityIds';
import { FACILITY_FORM_EXPECTED_ERROR, type FacilityExpectedErrorField } from '../../constants/facility/writerAIds';
import { PAYER_ADMIN_ROLE } from '../../data/accounts/payerAdminRole.data';
import { readEffectivePermissions } from '../EffectivePermissions';
import { parseCsv, type ParsedCsv } from '../CsvUtils';
import { parseXlsx } from '../XlsxUtils';
import { Logger } from '../Logger';
import {
  FACILITY_STATUS_LABEL,
  facilityDayText,
  facilityStamp,
  facilityStatusCodes,
  facilityTypeId,
  listFacilityRegister,
  providerTypeId,
  riyadhDay,
  suiteFacilityArabicName,
  suiteFacilityEmail,
  suiteFacilityName,
  type FacilityListItem,
  type FacilityStatusCode,
  type FacilityTypeCode,
  type ProviderTypeCode,
} from '../FacilityProvisioning';

/**
 * Writer A's helpers for the Facility folders 01 (list and tiles), 02 (create),
 * 03 (search and filter) and 04 (sort and export), 2026-11-04.
 *
 * Also the ROLE FIXTURE the two permission cases of these folders need (17506
 * no Delete, 17610 no Create): the foundation has no facility role helper
 * (Facility-Foundation-Notes "Permission story ... build utils/facility/facilityRole.ts"
 * - Writer C's), so this file carries its own, built exactly as
 * utils/policy/policyRole.ts: the Facilities rights are toggled by catalogue
 * LABEL on the shared "Payer Admin" role (GRANTS first - GetFacilities is the
 * parent of every facility right, the Payer Admin does not hold it on
 * 2026-11-04), the role restored at teardown from a snapshot (parents first),
 * and the account signed in through shapedNonAdmin({}). Evidence, never a
 * verdict: `permission-not-propagated` / `permission-not-granted` annotations.
 */

// ---- the role fixture ------------------------------------------------------------------

/**
 * The Facilities rights of the role catalogue (labels = the key without
 * "Facilities.", read 2026-11-04 by the foundation). `Facilities.AuditLogs`
 * ("View Audit Logs") is left out: the label is shared with other sections.
 */
export const FACILITY_RIGHT = {
  /** The LIST right and parent of every other one. */
  list: 'GetFacilities',
  view: 'GetFacility',
  create: 'CreateFacility',
  edit: 'UpdateFacility',
  delete: 'DeleteFacility',
  setActive: 'SetFacilityActive',
  export: 'ExportFacilities',
  dashboard: 'GetFacilitiesDashboard',
  dropdown: 'GetFacilitiesDropdown',
  networks: 'GetFacilityNetworks',
} as const;

export type FacilityRight = keyof typeof FACILITY_RIGHT;

/** Parents first, so restoring an unticked parent clears its children before they are visited. */
const ALL_FACILITY_RIGHTS: readonly FacilityRight[] = [
  'list',
  ...(Object.keys(FACILITY_RIGHT) as FacilityRight[]).filter((k) => k !== 'list'),
];

/** The effective-permission code (`Facilities.DeleteFacility`). */
export const facilityRightCode = (right: FacilityRight): string => `Facilities.${FACILITY_RIGHT[right]}`;

/** What a case asks of the Payer Admin role: rights to tick (first), then to untick. */
export interface FacilityShape {
  with?: readonly FacilityRight[];
  without?: readonly FacilityRight[];
}

/** The Payer Admin account, shaped for a facility case, signed in. */
export interface FacilitySession {
  page: Page;
  facilities: FacilityManagementPage;
  detail: FacilityDetailPage;
  removed: string[];
  granted: string[];
  /** Withheld rights the account is STILL told it holds. */
  stillHeld: string[];
}

export interface FacilityRoleControl {
  signIn: (shape: FacilityShape) => Promise<FacilitySession>;
  openCatalogue: () => Promise<RolePermissionsStep>;
}

export interface FacilityRoleFixtures {
  facilityRole: FacilityRoleControl;
  /** BLOCKS the case unless the shaped account can list facilities (GetFacilities). */
  requireFacilityListAccess: (session: FacilitySession) => Promise<void>;
}

export const test = base.extend<FacilityRoleFixtures>({
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
        Logger.step(`[facilityRole A] Shaping "${PAYER_ADMIN_ROLE}": ${wanted.map((w) => `${w.wanted ? '+' : '-'}${w.label}`).join(', ')}`);
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
        removed: (shape.without ?? []).map((r) => FACILITY_RIGHT[r]),
        granted: (shape.with ?? []).map((r) => FACILITY_RIGHT[r]),
        stillHeld,
      };
    };

    await use({ signIn, openCatalogue });

    // ---- teardown: the shared role back exactly as it was found ----
    if (touched && snapshot !== null) {
      Logger.step(`[facilityRole A] Restoring "${PAYER_ADMIN_ROLE}"`);
      await setLabels([...(snapshot as Map<string, boolean>).entries()].map(([label, original]) => ({ label, wanted: original })));
    }
    if (adminContext !== null) await (adminContext as BrowserContext).close();
  },

  requireFacilityListAccess: async ({}, use, testInfo) => {
    await use(async (session) => {
      if (await session.facilities.canListFacilities()) return;
      blockedByPrecondition(
        testInfo,
        'a shaped Payer Admin that can list facilities (Facilities.GetFacilities)',
        new Error(`the shaped account is refused GetFacilities${session.granted.length ? ` although the role was given ${session.granted.join(', ')}` : ''} - `
          + 'GetFacilities is the parent of every facility right, so a role that may see the list but lacks one right cannot be shown to this account'),
      );
    });
  },
});

export { expect };

// ---- the Add drawer -----------------------------------------------------------------------

/** A facility the form can save: a fresh suite name, Arabic letters only, unique e-mail, licence -10 / +365 days. */
export interface FacilityFormData {
  basic: FacilityBasicInfo;
  contact: FacilityContactInfo;
}

export function validFacilityForm(label: string, overrides: { basic?: FacilityBasicInfo; contact?: FacilityContactInfo } = {}): FacilityFormData {
  const stamp = facilityStamp();
  return {
    basic: { nameEn: suiteFacilityName(label), nameAr: suiteFacilityArabicName(), type: 'Pharmacy', providerType: 'Both', ...overrides.basic },
    contact: {
      email: suiteFacilityEmail(stamp),
      licenseNo: `QA-LIC-${stamp}`.toUpperCase(),
      licenseStart: facilityDayText(riyadhDay(-10)),
      licenseExpiry: facilityDayText(riyadhDay(365)),
      ...overrides.contact,
    },
  };
}

/**
 * The drawer's Save from wherever it stands: on step 1 it is Next (which
 * validates step 1 - nothing is sent when it does not move on), on step 2 the
 * Save itself. -1 = refused on screen.
 */
export async function submitForm(drawer: FacilityFormDrawer): Promise<FacilitySaveAnswer> {
  if ((await drawer.currentStep()) === 1) {
    const moved = await drawer.next();
    if (!moved) return { status: -1, text: '', messages: await drawer.getMessages(), body: null };
  }
  return drawer.attemptSave();
}

/** Opens Add, fills both steps and saves; returns the save's answer and the drawer. */
export async function createThroughForm(list: FacilityManagementPage, data: FacilityFormData): Promise<{ answer: FacilitySaveAnswer; drawer: FacilityFormDrawer }> {
  const drawer = await list.openAddForm();
  await drawer.fillBasic(data.basic);
  expect(await drawer.next(), `step 1 should validate: ${(await drawer.getMessages()).join(' | ')}`).toBe(true);
  await drawer.fillContact(data.contact);
  return { answer: await submitForm(drawer), drawer };
}

/** Whether a save answer is a success. */
export const saved = (answer: { status: number }): boolean => answer.status >= 200 && answer.status < 300;

/** The text a refused / accepted save carried, for messages. */
export const said = (answer: FacilitySaveAnswer): string => `${answer.status} ${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`.trim();

/** An error slot the form does not render today (phone, mobile, coordinates) - '' while absent. */
export async function readExpectedError(page: Page, field: FacilityExpectedErrorField): Promise<string> {
  const slot = page.locator(`#${FACILITY_FORM_EXPECTED_ERROR[field]}`);
  return (await slot.isVisible().catch(() => false)) ? (await slot.innerText()).trim() : '';
}

// ---- the list ---------------------------------------------------------------------------

/** Opens the module WITHOUT choosing a view, and waits for whichever view it opened in. */
export async function openAsIs(list: FacilityManagementPage, page: Page): Promise<void> {
  await list.open();
  await page.locator(buttonSelector(GLOBAL.viewToggleTable)).first().waitFor({ state: 'visible', timeout: Timeouts.default });
  await page.locator(`#${FACILITY_LIST.table}, #${FACILITY_LIST.cards}`).first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
  await list.waitForPageReady();
  // The table shell renders before its rows arrive (17499 counted 0 rows, smoke 2026-11-04):
  // in Table view, wait for the rows the list answered.
  if ((await list.readView()) === 'table') await list.readNames().catch(() => undefined);
}

/** The keyword box's value. */
export async function readSearchBox(page: Page): Promise<string> {
  return page.locator(`#${FACILITY_LIST.searchInput}`).inputValue().catch(() => '');
}

/** Clicks "Clear" when a search or filter is applied (it only shows then); returns the list it answered, or null. */
export async function clearListFilters(list: FacilityManagementPage, page: Page): Promise<FacilityListAnswer | null> {
  const clear = page.locator(buttonSelector(FACILITY_LIST.searchClearAll)).first();
  if (!(await clear.isVisible().catch(() => false))) return null;
  return list.clearAllFilters();
}

/** Every KPI tile's settled number by key. */
export function tileNumbers(kpis: Record<FacilityKpiKey, { label: string; value: string }>): Record<FacilityKpiKey, number> {
  return Object.fromEntries(Object.entries(kpis).map(([key, tile]) => [key, Number(tile.value.replace(/[^\d-]/g, '') || NaN)])) as Record<FacilityKpiKey, number>;
}

/** The register's counts by DISPLAYED status (effectiveStatusId) - what the tiles should show. */
export async function countByStatus(page: Page): Promise<Record<FacilityKpiKey, number> & { items: FacilityListItem[] }> {
  const { items, totalRows } = await listFacilityRegister(page, {}, 1000);
  const codes = await facilityStatusCodes(page);
  const count = (code: FacilityStatusCode) => items.filter((i) => codes[i.effectiveStatusId] === code).length;
  return { total: totalRows, active: count('active'), pending: count('pending'), inactive: count('inactive'), expired: count('expired'), items };
}

/** id -> displayed label of every facility status ("Future", "Active", "Inactive", "Expired"). */
export async function statusLabelById(page: Page): Promise<Record<string, string>> {
  const codes = await facilityStatusCodes(page);
  return Object.fromEntries(Object.entries(codes).map(([id, code]) => [id, FACILITY_STATUS_LABEL[code] ?? code]));
}

/** The type labels the screens show, per code. */
export const TYPE_LABEL: Record<FacilityTypeCode, string> = { clinic: 'Clinic', hospital: 'Hospital', pharmacy: 'Pharmacy' };
export const PROVIDER_LABEL: Record<ProviderTypeCode, string> = { both: 'Both', integrationProvider: 'Integration Provider', providerPortal: 'Provider Portal' };

/** id -> label of the facility types. */
export async function typeLabelById(page: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const code of Object.keys(TYPE_LABEL) as FacilityTypeCode[]) out[await facilityTypeId(page, code)] = TYPE_LABEL[code];
  return out;
}

/** id -> label of the provider types. */
export async function providerLabelById(page: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const code of Object.keys(PROVIDER_LABEL) as ProviderTypeCode[]) out[await providerTypeId(page, code)] = PROVIDER_LABEL[code];
  return out;
}

/** The whole register (GetFacilities, one page of up to 1000). */
export async function wholeRegister(page: Page, criteria: Record<string, unknown> = {}): Promise<FacilityListItem[]> {
  return (await listFacilityRegister(page, criteria, 1000)).items;
}

/** A token shared by a case's facilities, so one keyword search lists exactly them. */
export const groupToken = (label: string): string => `${label}${facilityStamp()}`;

// ---- sort -------------------------------------------------------------------------------

/** The ids of the Sort By menu's options, as rendered (`facility-list-sort-option-{field}-{dir}`). */
export async function readSortOptionIds(page: Page): Promise<string[]> {
  await page.locator(buttonSelector(FACILITY_LIST.sortTrigger)).first().click();
  const options = page.locator(`[id^="${FACILITY_LIST.sortOptionPrefix}"]`);
  await options.first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  const ids = await options.evaluateAll((els) => els.map((el) => (el as HTMLElement).id));
  await page.keyboard.press('Escape');
  return ids;
}

/** Picks a Sort By option by its id and returns the list it answered. */
export async function sortByOptionId(list: FacilityManagementPage, page: Page, optionId: string): Promise<FacilityListAnswer> {
  await page.locator(buttonSelector(FACILITY_LIST.sortTrigger)).first().click();
  return list.captureList(() => page.locator(`#${optionId}`).click());
}

export function isOrdered<T>(values: readonly T[], compare: (a: T, b: T) => number): boolean {
  return values.every((value, i) => i === 0 || compare(values[i - 1], value) <= 0);
}

/** Case-insensitive text order (the database's CI collation). */
export const compareText = (a: string, b: string): number => a.localeCompare(b, 'en', { sensitivity: 'base' });

/**
 * A day as a number: `DD/MM/YYYY` (table), `YYYY-MM-DD[...]` (API, cards,
 * Overview, CSV) or an Excel serial day. NaN when it is none of them.
 */
export function dayValue(text: string): number {
  const value = text.trim();
  const shown = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (shown) return Date.UTC(Number(shown[3]), Number(shown[2]) - 1, Number(shown[1]));
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  if (/^\d{5}(\.\d+)?$/.test(value)) return Date.UTC(1899, 11, 30) + Math.floor(Number(value)) * 86_400_000;
  return NaN;
}

// ---- export -----------------------------------------------------------------------------

/** Parses an exported file of either format into `{ headers, rows }`. */
export function parseExport(format: 'csv' | 'excel', bytes: Buffer): ParsedCsv {
  return format === 'csv' ? parseCsv(bytes.toString('utf8')) : parseXlsx(bytes);
}

/** The header matching `pattern` ('' when none). */
export const headerOf = (headers: readonly string[], pattern: RegExp): string => headers.find((h) => pattern.test(h.trim())) ?? '';

/** A column's values in file order ([] when the column is missing). */
export function columnOf(parsed: ParsedCsv, pattern: RegExp): string[] {
  const header = headerOf(parsed.headers, pattern);
  return header === '' ? [] : parsed.rows.map((row) => (row[header] ?? '').trim());
}

/** The export row of a facility code. */
export function exportRowOf(parsed: ParsedCsv, codePattern: RegExp, code: string): Record<string, string> | undefined {
  const header = headerOf(parsed.headers, codePattern);
  return parsed.rows.find((row) => (row[header] ?? '').trim() === code);
}

// ---- detail -----------------------------------------------------------------------------

/** Whether the Overview's Facility Code is cut off on screen (its text wider than its box). */
export async function isCodeTruncated(page: Page): Promise<boolean> {
  return page.locator(`#${FACILITY_DETAIL.overview.facilityCode}`).last()
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth)
    .catch(() => false);
}
