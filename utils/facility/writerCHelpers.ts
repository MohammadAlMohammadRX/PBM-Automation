import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { RoleAdministrationPage } from '../../pages/system/RoleAdministrationPage';
import { FacilityManagementPage } from '../../pages/facility/FacilityManagementPage';
import { FacilityDetailPage } from '../../pages/facility/FacilityDetailPage';
import { FacilityAuditTab } from '../../pages/facility/FacilityAuditTab';
import type { FacilityFormDrawer, FacilitySaveAnswer } from '../../pages/facility/FacilityFormDrawer';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { Timeouts } from '../../constants/Timeouts';
import { DIALOG, ROLE_FORM, TOAST, buttonSelector } from '../../constants/ElementIds';
import { FACILITY_AUDIT, FACILITY_FORM } from '../../constants/facility/facilityIds';
import { PAYER_ADMIN_ROLE } from '../../data/accounts/payerAdminRole.data';
import { ALL_FACILITY_RIGHTS, FACILITY_RIGHT, type FacilityRight, type FacilityShape } from '../../data/facility/facilityPermissions.data';
import { readEffectivePermissions } from '../EffectivePermissions';
import { NetworkUtils } from '../NetworkUtils';
import { WaitUtils } from '../WaitUtils';
import { Logger } from '../Logger';
import { auditChanges, readAuditEntry, readFacilityAuditTrail, type FacilityAuditEntry } from '../FacilityProvisioning';
import { anchorOrBlocked, type NetworkAnchor } from './writerBHelpers';

/**
 * Writer C's helpers for the facility folders 09 (block deletion), 10 (audit
 * history), 11 (edit) and 12 (permissions) - reports/facility/Facility-Writers-Brief.md:
 * the foundation is not edited, what it lacks lives here.
 *
 * WHAT THE FOUNDATION LACKED (added here):
 * - `facilityRole` - the permission fixture the foundation notes asked for
 *   (utils/facility/facilityRole.ts was not written; the writers brief keeps
 *   each writer to its own helper file). Built as the Policy suite's
 *   `policyRole`: the "Payer Admin" role is shaped by catalogue label
 *   (data/facility/facilityPermissions.data.ts), grants first, restored exactly
 *   at teardown from a snapshot, and the account signed in through
 *   shapedNonAdmin({}). The facility "View Audit Logs" row shares its label with
 *   every section, so rows are found INSIDE their section here (the shared
 *   RolePermissionsStep matches a label anywhere in the tree).
 * - `networkAnchorOrBlock` - Writer B's long-lived anchor (utils/facility/writerBHelpers.ts
 *   `anchorOrBlocked`, "QA Automation Facility Network Anchor") for the "facility
 *   in a network" cases, so both writers reuse one facility + network pair.
 * - `submitForm` - the drawer's attemptSave clicks Save, which step 1 does not
 *   render; a step-1 error must be read off Next instead.
 *
 * Specs that need `facilityRole` import `test` from THIS file.
 */

/** A case the environment cannot run, reported BLOCKED with its reason (data-driven). */
export interface FacilityBlockedCase {
  azureId: string;
  title: string;
  reason: string;
}

// ---- permission fixture ------------------------------------------------------------------

/** The Payer Admin account, shaped for a facility case, signed in. */
export interface FacilitySession {
  page: Page;
  facilities: FacilityManagementPage;
  detail: FacilityDetailPage;
  audit: FacilityAuditTab;
  removed: string[];
  granted: string[];
  /** Withheld rights the account is STILL told it holds (`permission-not-propagated`). */
  stillHeld: string[];
  /** Granted rights the account is NOT told it holds (`permission-not-granted`). */
  notGranted: string[];
}

export interface FacilityRoleControl {
  /** Shapes the role (grants first, then withholds), saves, and signs a FRESH Payer Admin session in. */
  signIn: (shape: FacilityShape) => Promise<FacilitySession>;
  /** Shapes the role without signing anyone in (the "administrator revokes mid-session" step). */
  reshape: (shape: FacilityShape) => Promise<{ removed: string[]; granted: string[] }>;
}

export interface FacilityRoleFixtures {
  facilityRole: FacilityRoleControl;
  /**
   * Makes sure the shaped account can list facilities. BLOCKS the case when the
   * shaping took the list away (the parent-right trap - such a role cannot be
   * built); FAILS it (throws) when the role was granted the list but the account
   * is not told it holds it - the propagation finding the brief keeps a finding.
   */
  requireFacilityListAccess: (session: FacilitySession) => Promise<void>;
}

/**
 * The catalogue rows (the role drawer's privileges tree).
 * locator-exception: every checkbox in the tree shares one id (pages/system/RolePermissionsStep.ts); the row is the only addressable unit.
 */
function catalogueRows(page: Page): Locator {
  return page.locator(`#${ROLE_FORM.root}`).locator('.role-dialog__node'); // locator-exception: the privileges tree rows carry no ids (RolePermissionsStep class comment).
}

/**
 * The row of one right: its exact label (a parent reads "Label (n/m)"),
 * searched inside its top-level section when the label is shared.
 */
async function rightRow(page: Page, right: FacilityRight): Promise<Locator> {
  const row = FACILITY_RIGHT[right] as { label: string; section?: string };
  const rows = catalogueRows(page);
  await expect(rows.first(), 'the permission catalogue should render').toBeVisible({ timeout: Timeouts.default });
  const index = await rows.evaluateAll((els, wanted) => {
    const all = els.map((el) => {
      const e = el as HTMLElement;
      const style = window.getComputedStyle(e);
      const inline = style.getPropertyValue('padding-inline-start') || (style.direction === 'rtl' ? style.paddingRight : style.paddingLeft);
      return { text: (e.innerText || '').trim().split('\n')[0].trim(), indent: parseInt(inline, 10) || 0 };
    });
    const matches = (text: string): boolean => text === wanted.label || (text.startsWith(`${wanted.label} (`) && /\(\d+\/\d+\)$/.test(text));
    let start = 0;
    let end = all.length;
    if (wanted.section !== '') {
      const head = all.findIndex((r) => r.indent === 0 && r.text.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim() === wanted.section);
      if (head < 0) return -1;
      start = head + 1;
      for (let i = start; i < all.length; i += 1) {
        if (all[i].indent === 0) { end = i; break; }
      }
    }
    for (let i = start; i < end; i += 1) if (matches(all[i].text)) return i;
    return -1;
  }, { label: row.label, section: row.section ?? '' });
  if (index < 0) {
    throw new Error(`[facilityRole] This build's permission catalogue has no "${row.label}" permission${row.section ? ` under "${row.section}"` : ''}, `
      + 'so a role with or without it cannot be built - the right is not separately grantable.');
  }
  return rows.nth(index);
}

async function rightChecked(page: Page, right: FacilityRight): Promise<boolean> {
  return (await rightRow(page, right)).locator('input.p-checkbox-input').first().isChecked();
}

async function toggleRight(page: Page, right: FacilityRight): Promise<void> {
  const before = await rightChecked(page, right);
  Logger.step(`[facilityRole] Toggling "${FACILITY_RIGHT[right].label}" (was ${before ? 'checked' : 'unchecked'})`);
  // The INPUT, forced: PrimeNG covers it with its own box (RolePermissionsStep.togglePermission).
  await (await rightRow(page, right)).locator('input.p-checkbox-input').first().click({ force: true });
  await expect.poll(() => rightChecked(page, right), { timeout: Timeouts.default, message: `"${FACILITY_RIGHT[right].label}" should read ${before ? 'unchecked' : 'checked'}` }).toBe(!before);
}

export const test = base.extend<FacilityRoleFixtures>({
  facilityRole: async ({ browser, shapedNonAdmin }, use, testInfo) => {
    const state: { context: BrowserContext | null; page: Page | null; roles: RoleAdministrationPage | null; snapshot: Map<FacilityRight, boolean> | null; touched: boolean } = {
      context: null, page: null, roles: null, snapshot: null, touched: false,
    };

    const openCatalogue = async (): Promise<Page> => {
      if (state.roles === null || state.page === null) {
        const context = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
        const adminPage = await context.newPage();
        state.context = context;
        state.page = adminPage;
        state.roles = new RoleAdministrationPage(adminPage);
      }
      const page = state.page as Page;
      await (state.roles as RoleAdministrationPage).openPermissionCatalogue(PAYER_ADMIN_ROLE);
      if (state.snapshot === null) {
        const snapshot = new Map<FacilityRight, boolean>();
        for (const right of ALL_FACILITY_RIGHTS) {
          const checked = await rightChecked(page, right).catch(() => null);
          if (checked !== null) snapshot.set(right, checked);
        }
        state.snapshot = snapshot;
        Logger.step(`[facilityRole] "${PAYER_ADMIN_ROLE}" found holding: ${[...snapshot.entries()].filter(([, v]) => v).map(([k]) => FACILITY_RIGHT[k].label).join(', ') || 'no facility right'}`);
      }
      return page;
    };

    /** Sets each right to its wanted state (in the order given); saves when anything moved. */
    const setRights = async (entries: ReadonlyArray<{ right: FacilityRight; wanted: boolean }>): Promise<FacilityRight[]> => {
      if (entries.length === 0) return [];
      const page = await openCatalogue();
      const moved: FacilityRight[] = [];
      for (const { right, wanted } of entries) {
        if ((await rightChecked(page, right)) === wanted) continue;
        await toggleRight(page, right);
        moved.push(right);
      }
      const roles = state.roles as RoleAdministrationPage;
      if (moved.length === 0) await roles.closeDrawer().catch(() => undefined);
      else {
        await roles.saveRole();
        state.touched = true;
      }
      return moved;
    };

    const reshape = async (shape: FacilityShape): Promise<{ removed: string[]; granted: string[] }> => {
      // GRANTS FIRST: a granted parent (GetFacilities) ticks every child.
      const wanted = [
        ...(shape.with ?? []).map((right) => ({ right, wanted: true })),
        ...(shape.without ?? []).map((right) => ({ right, wanted: false })),
      ];
      testInfo.setTimeout(testInfo.timeout + 120_000);
      try {
        Logger.step(`[facilityRole] Shaping "${PAYER_ADMIN_ROLE}": ${wanted.map((w) => `${w.wanted ? '+' : '-'}${FACILITY_RIGHT[w.right].label}`).join(', ')}`);
        await setRights(wanted);
      } catch (error) {
        blockedByPrecondition(testInfo, `the "${PAYER_ADMIN_ROLE}" role shaped with facility rights ${JSON.stringify(shape)}`, error);
      }
      return { removed: (shape.without ?? []).map((r) => FACILITY_RIGHT[r].label), granted: (shape.with ?? []).map((r) => FACILITY_RIGHT[r].label) };
    };

    const signIn = async (shape: FacilityShape): Promise<FacilitySession> => {
      const { removed, granted } = await reshape(shape);
      const shaped = await shapedNonAdmin({});
      const page = shaped.page;
      const effective = await readEffectivePermissions(page).catch(() => [] as string[]);
      const stillHeld = (shape.without ?? []).map((r) => FACILITY_RIGHT[r].code).filter((code) => effective.includes(code));
      if (stillHeld.length > 0) {
        const note = `the role no longer holds ${stillHeld.join(', ')}, yet the signed-in Payer Admin is still told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-propagated', description: note });
      }
      const notGranted = effective.length === 0 ? [] : (shape.with ?? []).map((r) => FACILITY_RIGHT[r].code).filter((code) => !effective.includes(code));
      if (notGranted.length > 0) {
        const note = `the role holds ${notGranted.join(', ')}, yet the signed-in Payer Admin is not told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-granted', description: note });
      }
      return {
        page,
        facilities: new FacilityManagementPage(page),
        detail: new FacilityDetailPage(page),
        audit: new FacilityAuditTab(page),
        removed,
        granted,
        stillHeld,
        notGranted,
      };
    };

    await use({ signIn, reshape });

    // ---- teardown: the shared role back exactly as it was found (parents first; not swallowed) ----
    if (state.touched && state.snapshot !== null) {
      Logger.step(`[facilityRole] Restoring "${PAYER_ADMIN_ROLE}"`);
      const snapshot = state.snapshot;
      await setRights(ALL_FACILITY_RIGHTS.filter((r) => snapshot.has(r)).map((right) => ({ right, wanted: snapshot.get(right) as boolean })));
    }
    if (state.context !== null) await state.context.close();
  },

  requireFacilityListAccess: async ({}, use, testInfo) => {
    await use(async (session) => {
      if (await session.facilities.canListFacilities()) return;
      // Same gate as writers A / B (smoke 2026-11-04): the list right granted to the role but
      // never reaching the account is the case's PRECONDITION failing, so it BLOCKS; the
      // permission-not-granted annotation from signIn keeps the evidence of the app finding.
      if (session.notGranted.includes(FACILITY_RIGHT.list.code)) {
        blockedByPrecondition(
          testInfo,
          'a shaped Payer Admin that can list facilities',
          new Error(`permission-not-granted: the "${PAYER_ADMIN_ROLE}" role was granted ${FACILITY_RIGHT.list.label} (the facility list), `
            + 'yet the signed-in account is not told it holds it and is refused the list - the role change did not reach the account'),
        );
      }
      blockedByPrecondition(
        testInfo,
        'a restricted Payer Admin role that can still list facilities',
        new Error('the shaped account is refused GetFacilities - GetFacilities is the parent of every facility right, so withholding '
          + 'one of them can take the list away, and a role that may list facilities but lacks this one right cannot be built'),
      );
    });
  },
});

export { expect };

// ---- answers, messages, controls ---------------------------------------------------------

/** A direct request refused for want of the right (401 / 403, or a 4xx naming the permission). */
export const refused = (answer: { status: number; text: string }): boolean => answer.status === 401 || answer.status === 403
  || (answer.status >= 400 && /permission|not authori[sz]ed|forbidden|access (is )?denied/i.test(answer.text));

/** Sends a request as a session's user (the "bypass the screen" checks). */
export async function asSession(page: Page, method: 'POST' | 'PUT' | 'DELETE' | 'GET', path: string, data?: unknown): Promise<{ status: number; text: string }> {
  const res = await NetworkUtils.requestAsSession(page, method, path, data);
  return { status: res.status, text: res.text };
}

/** Toasts on screen, settled. */
export async function readToasts(page: Page, timeout: number = Timeouts.short): Promise<string[]> {
  return WaitUtils.settleMessages(async () => (await page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== ''), timeout);
}

/** Waits until no toast is on screen ("wait for the error message to disappear"); returns whether they went. */
export async function waitForToastsGone(page: Page, timeout = 20_000): Promise<boolean> {
  return expect.poll(async () => page.locator(`#${TOAST.summary}`).filter({ visible: true }).count(), { timeout })
    .toBe(0).then(() => true).catch(() => false);
}

/** Whether the shared confirmation dialog is on screen NOW (no wait). */
export async function dialogShown(page: Page): Promise<boolean> {
  return page.locator(`#${DIALOG.root}`).isVisible().catch(() => false);
}

/** Clicks the shared dialog's close icon (the X). */
export async function closeDialogWithIcon(page: Page): Promise<void> {
  await page.locator(buttonSelector(DIALOG.close)).first().click();
}

/** Resolves with the first DeleteFacility request sent within `timeout`, or null - "nothing was deleted". */
export function watchDeleteRequest(page: Page, timeout: number = Timeouts.short): Promise<string | null> {
  return page.waitForRequest((r) => /\/DeleteFacility\//.test(new URL(r.url()).pathname), { timeout }).then((r) => r.url()).catch(() => null);
}

/** Resolves with the first UpdateFacility request sent within `timeout`, or null. */
export function watchUpdateRequest(page: Page, timeout: number = Timeouts.short): Promise<string | null> {
  return page.waitForRequest((r) => /\/UpdateFacility$/.test(new URL(r.url()).pathname), { timeout }).then((r) => r.url()).catch(() => null);
}

/** BLOCKS the case when a precondition the environment owes it is missing (never a finding). */
export function blockUnless(testInfo: TestInfo, held: boolean, precondition: string, why: string): void {
  if (!held) blockedByPrecondition(testInfo, precondition, new Error(why));
}

// ---- the Add / Edit drawer -----------------------------------------------------------------

/**
 * "Click Submit" on the drawer, whatever step it shows: Save when it is
 * rendered; otherwise Next first (step 1 has no Save) - a step-1 error then
 * stops there and is answered as refused client-side (status -1) with the
 * messages shown.
 */
export async function submitForm(page: Page, drawer: FacilityFormDrawer): Promise<FacilitySaveAnswer> {
  const saveShown = await page.locator(buttonSelector(FACILITY_FORM.save)).first().isVisible().catch(() => false);
  if (!saveShown && (await drawer.currentStep()) === 1) {
    const moved = await drawer.next();
    if (!moved) return { status: -1, text: '', messages: await drawer.getMessages(), body: null };
  }
  return drawer.attemptSave();
}

/** Moves the drawer to step 2 (Contact & License) when it shows step 1. */
export async function toContactStep(drawer: FacilityFormDrawer): Promise<void> {
  if ((await drawer.currentStep()) === 1) expect(await drawer.next(), 'the drawer should move to Contact & License').toBe(true);
}

/** Moves the drawer back to step 1 (Basic Information) when it shows step 2. */
export async function toBasicStep(drawer: FacilityFormDrawer): Promise<void> {
  if ((await drawer.currentStep()) === 2) await drawer.back();
}

/**
 * Where the Facility Code shows on the open drawer: whether the drawer text
 * holds it, and whether an input holding it is rendered and read-only.
 */
export async function codeOnForm(page: Page, code: string): Promise<{ inText: boolean; input: boolean; readOnly: boolean }> {
  const text = (await page.locator(`#${FACILITY_FORM.root}`).innerText().catch(() => '')).replace(/\s+/g, ' ');
  const field = await page.locator(`#${FACILITY_FORM.root} input`).evaluateAll((inputs, wanted) => { // locator-exception: the Facility Code has no field id of its own; any drawer input holding the code is looked for.
    const el = inputs.find((i) => (i as HTMLInputElement).value.trim() === wanted) as HTMLInputElement | undefined;
    return el ? { input: true, readOnly: el.readOnly || el.disabled || el.hasAttribute('readonly') } : { input: false, readOnly: false };
  }, code);
  return { inText: text.includes(code), ...field };
}

// ---- audit -------------------------------------------------------------------------------

/** Fields an entry carries for a status / delete change rather than an edit of the facility's data. */
const NON_EDIT_FIELD = /^(isactive|inactivationreasonid|inactivationdetails|inactivatedon|inactivatedby|isdeleted|deletedon|deletedby|modifiedon|modifiedby|concurrencystamp|statusid|effectivestatusid)$/i;

/** One trail entry with the fields it changed (GetAuditLogById). */
export interface FacilityAuditChange {
  entry: FacilityAuditEntry;
  changes: Record<string, [unknown, unknown]>;
  /** True when a facility data field changed (not only the status / delete bookkeeping). */
  isEdit: boolean;
}

/** The facility's trail as its tab reads it, each entry with its changes. */
export async function auditTrailWithChanges(page: Page, facilityId: string, filter: { actionType?: string | null; fromUtc?: string; toUtc?: string } = {}): Promise<FacilityAuditChange[]> {
  const { items } = await readFacilityAuditTrail(page, facilityId, filter);
  const out: FacilityAuditChange[] = [];
  for (const entry of items) {
    const full = await readAuditEntry(page, entry.id).catch(() => entry);
    const changes = auditChanges(full);
    out.push({ entry: full, changes, isEdit: Object.keys(changes).some((field) => !NON_EDIT_FIELD.test(field)) });
  }
  return out;
}

/**
 * Clears the Audit History tab's applied filters ON SCREEN - the chips'
 * clear-all, else each chip's remove - waiting for the trail to reload. Answers
 * how it was done; 'none' when the tab offered no clearing control (no reload
 * is done, unlike AuditHistoryTab.clearFilters, so "without a page reload" can
 * be asserted).
 */
export async function clearAuditFilters(page: Page): Promise<'clear-all' | 'chips' | 'none'> {
  const reloaded = (): Promise<unknown> => page.waitForResponse((r) => /\/GetAuditLogs$/.test(new URL(r.url()).pathname), { timeout: Timeouts.default }).catch(() => null);
  const clearAll = page.locator(`#${FACILITY_AUDIT.chips} [id$="clear-all"]`).first();
  if (await clearAll.isVisible().catch(() => false)) {
    const waiting = reloaded();
    await clearAll.click();
    await waiting;
    return 'clear-all';
  }
  let removed = false;
  for (let i = 0; i < 6; i += 1) {
    const remove = page.locator(`[id^="${FACILITY_AUDIT.chips}-chip-"][id$="-remove"]`).first();
    if (!(await remove.isVisible().catch(() => false))) break;
    const waiting = reloaded();
    await remove.click();
    await waiting;
    removed = true;
  }
  return removed ? 'chips' : 'none';
}

/** Whether a detail tab is on screen AND usable (not disabled). */
export async function tabUsable(page: Page, tabId: string): Promise<boolean> {
  const tab = page.locator(`#${tabId}`);
  if (!(await tab.isVisible().catch(() => false))) return false;
  return tab.evaluate((el) => !(el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled') || !!el.closest('[disabled], .p-disabled'))).catch(() => false);
}

/** The Riyadh day `YYYY-MM-DD` as the tab's filter sends it (`fromUtc` / `toUtc`). */
export function riyadhDayUtcRange(day: string): { fromUtc: string; toUtc: string } {
  const start = new Date(`${day}T00:00:00.000+03:00`);
  const end = new Date(`${day}T23:59:59.999+03:00`);
  return { fromUtc: start.toISOString(), toUtc: end.toISOString() };
}

// ---- the long-lived network anchor -----------------------------------------------------------

/**
 * The suite's ONE long-lived facility held by its own approved network -
 * Writer B's anchor (utils/facility/writerBHelpers.ts `anchorOrBlocked`,
 * "QA Automation Facility Network Anchor"), reused so both writers share one
 * facility + network pair (writers brief: every fresh pair is a permanent
 * leftover). BLOCKED, with the application's answer, when it cannot be found or
 * built. The anchor is FULLY populated for Writer B's Overview cases: a case
 * that edits it must put the value back.
 */
export async function networkAnchorOrBlock(page: Page, testInfo: TestInfo): Promise<NetworkAnchor> {
  return anchorOrBlocked(page, testInfo, { kind: 'single' });
}

export type { NetworkAnchor };
