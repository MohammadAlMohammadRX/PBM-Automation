import type { BrowserContext, Page } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { RoleAdministrationPage } from '../../pages/system/RoleAdministrationPage';
import type { RolePermissionsStep } from '../../pages/system/RolePermissionsStep';
import { ConfirmDialog } from '../../pages/components/ConfirmDialog';
import { FormularyManagementPage } from '../../pages/formulary/FormularyManagementPage';
import { FormularyDetailPage } from '../../pages/formulary/FormularyDetailPage';
import { FormularyTiersTab } from '../../pages/formulary/FormularyTiersTab';
import { FormularyTradesTab } from '../../pages/formulary/FormularyTradesTab';
import { FormularyVersionHistoryTab } from '../../pages/formulary/FormularyVersionHistoryTab';
import { FormularyAuditTab } from '../../pages/formulary/FormularyAuditTab';
import type { FormularyFormDrawer } from '../../pages/formulary/FormularyFormDrawer';
import { ApprovalManagementPage } from '../../pages/approval/ApprovalManagementPage';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { Timeouts } from '../../constants/Timeouts';
import { FORMULARY_FORM_DRAWER, FORMULARY_FORM_ERROR, TOAST, buttonSelector, type FormularyFormField } from '../../constants/ElementIds';
import { FORMULARY_ROW_EDIT } from '../../constants/formulary/writerCIds';
import { PAYER_ADMIN_ROLE } from '../../data/accounts/payerAdminRole.data';
import { ACCESS_TOKEN_KEY } from '../../data/payers/lifecycleGuardrails.data';
import { env } from '../../constants/EnvironmentConfig';
import {
  ALL_FORMULARY_RIGHTS,
  BENEFIT_RIGHTS,
  FORMULARY_RIGHT,
  type FormularyRight,
  type FormularyShape,
} from '../../data/formulary/formularyPermissions.data';
import { readEffectivePermissions } from '../EffectivePermissions';
import { WaitUtils } from '../WaitUtils';
import { Logger } from '../Logger';
import { buildXlsx } from '../XlsxUtils';
import {
  formularyDateText,
  formularyStatusIds,
  listFormularyRegister,
  type FormularyListItem,
} from '../FormularyProvisioning';

/**
 * Writer C's helpers for the formulary folders 06, 13, 14, 17, 19, 20 and 22
 * (reports/formulary/Formulary-Writers-Brief.md: shared fixtures and page
 * objects of the other writers are not edited - what is missing lives here).
 *
 * The main piece is the `formularyRole` fixture. The shared role-shaping
 * fixture (fixtures/shapedNonAdmin.fixture.ts) can only toggle the rights
 * data/accounts/payerAdminRole.data.ts names, and that file has no formulary
 * section. This fixture shapes the SAME "Payer Admin" role by catalogue label
 * (data/formulary/formularyPermissions.data.ts), restores it afterwards exactly
 * as shapedNonAdmin does (newest change first), and signs the account in
 * through shapedNonAdmin({}) so the scope gate, viewport and screenshots are
 * handled the shared way. Specs that use it import `test` from this file.
 */

/** The Payer Admin account, shaped for a formulary case, signed in. */
export interface FormularySession {
  page: Page;
  formularies: FormularyManagementPage;
  detail: FormularyDetailPage;
  tiers: FormularyTiersTab;
  trades: FormularyTradesTab;
  versions: FormularyVersionHistoryTab;
  audit: FormularyAuditTab;
  approvals: ApprovalManagementPage;
  /** Catalogue labels the case asked to withhold / grant. */
  removed: string[];
  granted: string[];
  /** Withheld rights the account is STILL told it holds (GetCurrentUserRolesAndPermissions) - evidence, never acted on. */
  stillHeld: string[];
}

/** What a case can do with the Payer Admin role. */
export interface FormularyRoleControl {
  /** Shapes the role (grants first, then withholds), saves, and signs a FRESH Payer Admin session in. */
  signIn: (shape: FormularyShape) => Promise<FormularySession>;
  /** Shapes the role without signing anyone in. */
  reshape: (shape: FormularyShape) => Promise<{ removed: string[]; granted: string[] }>;
  /** Opens the Payer Admin role's permission catalogue in the fixture's administrator window. */
  openCatalogue: () => Promise<RolePermissionsStep>;
  /** Ticks / unticks one label in the open catalogue (recorded, so a saved toggle is restored at teardown). */
  toggle: (label: string) => Promise<boolean>;
  /** Saves the open catalogue (asserts "Role updated"). */
  save: () => Promise<void>;
  /** Closes the open catalogue WITHOUT saving (unsaved toggles are dropped). */
  closeCatalogue: () => Promise<void>;
}

export interface WriterCFixtures {
  formularyRole: FormularyRoleControl;
  /**
   * BLOCKS the case unless the shaped account can still list formularies - the
   * Terminology trap: withholding one child right may leave the GetFormularies
   * parent partly ticked and take the list right with it.
   */
  requireFormularyListAccess: (session: FormularySession) => Promise<void>;
}

/** The effective-permission code of a right (`Formularies.GetFormulary`, `BenefitConfigs.AddBenefitConfig`). */
const codeOf = (right: FormularyRight): string => `${BENEFIT_RIGHTS.includes(right) ? 'BenefitConfigs' : 'Formularies'}.${FORMULARY_RIGHT[right]}`;

export const test = base.extend<WriterCFixtures>({
  formularyRole: async ({ browser, shapedNonAdmin }, use, testInfo) => {
    let adminContext: BrowserContext | null = null;
    let roles: RoleAdministrationPage | null = null;
    let catalogue: RolePermissionsStep | null = null;
    /** Labels changed AND saved, with the state they had before - undone newest first at teardown. */
    const changed: Array<{ label: string; original: boolean }> = [];
    /** Labels toggled in the open catalogue, not yet saved. */
    let unsaved: Array<{ label: string; original: boolean }> = [];

    const adminRoles = async (): Promise<RoleAdministrationPage> => {
      if (roles === null) {
        adminContext = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
        roles = new RoleAdministrationPage(await adminContext.newPage());
      }
      return roles;
    };

    /**
     * Every formulary right's state BEFORE the case touched the role, read once
     * on the first opening. The restore replays it (parents first, then each
     * leaf), so a parent toggled on and off again cannot take with it children
     * the role held before the case - which undoing the toggles alone would do.
     * A label the catalogue lacks is simply not in the snapshot.
     */
    let snapshot: Map<string, boolean> | null = null;
    const takeSnapshot = async (step: RolePermissionsStep): Promise<void> => {
      if (snapshot !== null) return;
      snapshot = new Map();
      for (const right of ALL_FORMULARY_RIGHTS) {
        const label = FORMULARY_RIGHT[right];
        const checked = await step.isPermissionChecked(label).catch(() => null);
        if (checked !== null) snapshot.set(label, checked);
      }
    };

    const openCatalogue = async (): Promise<RolePermissionsStep> => {
      catalogue = await (await adminRoles()).openPermissionCatalogue(PAYER_ADMIN_ROLE);
      unsaved = [];
      await takeSnapshot(catalogue);
      return catalogue;
    };

    const toggle = async (label: string): Promise<boolean> => {
      const step = catalogue ?? (await openCatalogue());
      const original = await step.isPermissionChecked(label);
      const now = await step.togglePermission(label);
      unsaved.push({ label, original });
      return now;
    };

    const save = async (): Promise<void> => {
      await (await adminRoles()).saveRole();
      // Only the FIRST recorded original of a label matters for the restore.
      for (const entry of unsaved) if (!changed.some((c) => c.label === entry.label)) changed.push(entry);
      unsaved = [];
      catalogue = null;
    };

    const closeCatalogue = async (): Promise<void> => {
      if (catalogue !== null) await (await adminRoles()).closeDrawer().catch(() => undefined);
      unsaved = [];
      catalogue = null;
    };

    /** Sets each label to its wanted state; saves when anything moved. Returns the labels that moved. */
    const setLabels = async (entries: ReadonlyArray<{ label: string; wanted: boolean }>): Promise<string[]> => {
      if (entries.length === 0) return [];
      const step = await openCatalogue();
      const touched: string[] = [];
      for (const { label, wanted } of entries) {
        if ((await step.isPermissionChecked(label)) === wanted) continue;
        await toggle(label);
        touched.push(label);
      }
      if (touched.length === 0) await closeCatalogue();
      else await save();
      return touched;
    };

    const reshape = async (shape: FormularyShape): Promise<{ removed: string[]; granted: string[] }> => {
      // GRANTS FIRST: a granted parent (GetFormularies) ticks every child, so a
      // withheld child is unticked only after it (as shapedNonAdmin does).
      const wanted = [
        ...(shape.with ?? []).map((right) => ({ label: FORMULARY_RIGHT[right], wanted: true })),
        ...(shape.without ?? []).map((right) => ({ label: FORMULARY_RIGHT[right], wanted: false })),
      ];
      testInfo.setTimeout(testInfo.timeout + 120_000);
      try {
        Logger.step(`[formularyRole] Shaping "${PAYER_ADMIN_ROLE}": ${wanted.map((w) => `${w.wanted ? '+' : '-'}${w.label}`).join(', ')}`);
        await setLabels(wanted);
      } catch (error) {
        blockedByPrecondition(testInfo, `the "${PAYER_ADMIN_ROLE}" role shaped with formulary rights ${JSON.stringify(shape)}`, error);
      }
      return {
        removed: (shape.without ?? []).map((right) => FORMULARY_RIGHT[right]),
        granted: (shape.with ?? []).map((right) => FORMULARY_RIGHT[right]),
      };
    };

    const signIn = async (shape: FormularyShape): Promise<FormularySession> => {
      const { removed, granted } = await reshape(shape);
      const shaped = await shapedNonAdmin({});
      const page = shaped.page;
      // Evidence, not a verdict (see utils/EffectivePermissions.ts): a withheld
      // right the account is still told it holds is the propagation defect.
      const effective = await readEffectivePermissions(page).catch(() => [] as string[]);
      const stillHeld = (shape.without ?? []).filter((r) => !FORMULARY_RIGHT[r].includes(' ')).map(codeOf).filter((code) => effective.includes(code));
      if (stillHeld.length > 0) {
        const note = `the role no longer holds ${stillHeld.join(', ')}, yet the signed-in Payer Admin is still told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-propagated', description: note });
      }
      // The other direction (2026-11-02, 18869): a right granted to the role the
      // account is NOT told it holds. Evidence as well, never acted on.
      const notGranted = (shape.with ?? []).filter((r) => !FORMULARY_RIGHT[r].includes(' ')).map(codeOf)
        .filter((code) => effective.length > 0 && !effective.includes(code));
      if (notGranted.length > 0) {
        const note = `the role holds ${notGranted.join(', ')}, yet the signed-in Payer Admin is not told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-granted', description: note });
      }
      return {
        page,
        formularies: new FormularyManagementPage(page),
        detail: new FormularyDetailPage(page),
        tiers: new FormularyTiersTab(page),
        trades: new FormularyTradesTab(page),
        versions: new FormularyVersionHistoryTab(page),
        audit: new FormularyAuditTab(page),
        approvals: new ApprovalManagementPage(page, 'formulary'),
        removed,
        granted,
        stillHeld,
      };
    };

    await use({ signIn, reshape, openCatalogue, toggle, save, closeCatalogue });

    // ---- teardown: the shared role back exactly as it was found -------------
    if (catalogue !== null) await closeCatalogue();
    if (changed.length > 0) {
      Logger.step(`[formularyRole] Restoring "${PAYER_ADMIN_ROLE}": ${changed.map((c) => c.label).join(', ')}`);
      // Not swallowed: a role left wrong would mislead every later case.
      // The snapshot first (parents before leaves, ALL_FORMULARY_RIGHTS order),
      // then any other label the case toggled, newest change first.
      const known = snapshot ?? new Map<string, boolean>();
      await setLabels([
        ...[...known.entries()].map(([label, original]) => ({ label, wanted: original })),
        ...[...changed].reverse().filter((c) => !known.has(c.label)).map((c) => ({ label: c.label, wanted: c.original })),
      ]);
    }
    if (adminContext !== null) await (adminContext as BrowserContext).close();
  },

  requireFormularyListAccess: async ({}, use, testInfo) => {
    await use(async (session) => {
      if (await session.formularies.canListFormularies()) return;
      blockedByPrecondition(
        testInfo,
        'a restricted Payer Admin role that can still list formularies',
        new Error('the shaped account is refused GetFormularies - in this catalogue the list right is the parent of every '
          + 'formulary right, so withholding one of them takes the list away, and a role that may view formularies but '
          + 'lacks this one right cannot be built'),
      );
    });
  },
});

export { expect };

// ---- screen helpers ---------------------------------------------------------------

/** Whether a (possibly restricted) session is shown the formulary in the list - a refused list counts as not shown. */
export async function isListedFor(session: FormularySession, name: string): Promise<boolean> {
  await session.formularies.openExpectingDenial();
  if (!(await session.formularies.isListRendered())) return false;
  return session.formularies.isListed(name).catch(() => false);
}

/** 'absent' | 'disabled' | 'available' for any button by id. */
export async function controlAvailability(page: Page, id: string): Promise<'absent' | 'disabled' | 'available'> {
  const button = page.locator(buttonSelector(id)).first();
  const shown = await button.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  if (!shown) return 'absent';
  return (await button.isEnabled()) ? 'available' : 'disabled';
}

/** A list row's Edit action (`formulary-list-table-row-{id}-edit`) - the row must be on screen. */
export async function listRowEditState(page: Page, formularyId: string): Promise<'absent' | 'disabled' | 'available'> {
  return controlAvailability(page, `${FORMULARY_ROW_EDIT.rowPrefix}${formularyId}-${FORMULARY_ROW_EDIT.suffix}`);
}

/** Clicks a list row's Edit action. */
export async function clickListRowEdit(page: Page, formularyId: string): Promise<void> {
  await page.locator(buttonSelector(`${FORMULARY_ROW_EDIT.rowPrefix}${formularyId}-${FORMULARY_ROW_EDIT.suffix}`)).first().click();
}

/** Toasts on screen, settled. */
export async function readToasts(page: Page): Promise<string[]> {
  return WaitUtils.settleMessages(async () => (await page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.trim()).filter((t) => t !== ''));
}

/**
 * Clicks a drawer's Save and confirms the prompt(s) it raises ("Return to
 * draft?" on a formulary awaiting approval) - the tier / price / benefit
 * drawers do not answer that prompt themselves. Returns the request's answer
 * (-1 when none was sent), the prompt's title and the toasts.
 */
export async function saveConfirmingPrompts(page: Page, saveButtonId: string, endpoint: RegExp): Promise<{ status: number; text: string; prompt: string; messages: string[] }> {
  const answered = page.waitForResponse((r) => endpoint.test(new URL(r.url()).pathname), { timeout: Timeouts.default }).catch(() => null);
  await page.locator(buttonSelector(saveButtonId)).first().click();
  const dialog = new ConfirmDialog(page);
  let prompt = '';
  if (await dialog.isVisible()) {
    prompt = await dialog.getTitle().catch(() => '');
    await dialog.confirmWithFollowUps().catch(() => undefined);
  }
  const response = await answered;
  return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', prompt, messages: await readToasts(page) };
}

/** Closes the formulary drawer with its X and reads the discard prompt it raises (then discards). '' title when none appeared. */
export async function closeFormDrawerReadingPrompt(page: Page): Promise<{ title: string; message: string }> {
  await page.locator(`#${FORMULARY_FORM_DRAWER.close}`).click();
  const dialog = new ConfirmDialog(page);
  if (!(await dialog.isVisible())) return { title: '', message: '' };
  const out = { title: await dialog.getTitle().catch(() => ''), message: await dialog.getMessage().catch(() => '') };
  await dialog.discardChanges();
  return out;
}

/**
 * Saves the Edit drawer from wherever it is: Next first when on step 1 (a
 * refused Next is a refused save - nothing is sent, status -1), then Save.
 * Returns the answer, the messages and the field errors on screen.
 */
export async function attemptEditSave(drawer: FormularyFormDrawer): Promise<{ status: number; text: string; messages: string[]; errors: Partial<Record<FormularyFormField, string>> }> {
  if ((await drawer.currentStep()) === 1 && !(await drawer.next())) {
    return { status: -1, text: '', messages: await drawer.getMessages(), errors: await drawer.getFieldErrors() };
  }
  const answer = await drawer.attemptSave();
  return { ...answer, errors: await drawer.getFieldErrors() };
}

/** Every field error id of the formulary drawer (for a "which field was flagged" message). */
export const FORM_ERROR_FIELDS = Object.keys(FORMULARY_FORM_ERROR) as FormularyFormField[];

/**
 * What a session is offered for a formulary's request in the approvals hub:
 * whether the hub offers it the Formulary tab at all, and whether Approve /
 * Reject are usable on the request. Never throws - a session refused the hub
 * is offered nothing.
 */
export async function decisionOfferedTo(approvals: ApprovalManagementPage, formularyName: string): Promise<{ tab: boolean; approve: boolean; reject: boolean }> {
  await approvals.openHub().catch(() => undefined);
  const tab = (await approvals.getOfferedTabs().catch(() => [] as string[])).includes('formulary');
  if (!tab) return { tab, approve: false, reject: false };
  await approvals.openTab('formulary');
  const offered = await approvals.getDecisionAvailability(formularyName).catch(() => ({ inQueue: false, approve: false, reject: false }));
  return { tab, approve: offered.approve, reject: offered.reject };
}

// ---- data helpers -----------------------------------------------------------------

/**
 * An EXPIRED formulary from the register, read-only, or null. Expired cannot be
 * produced on demand (the lifecycle job is daily), so the cases that only LOOK
 * at an Expired formulary use one that exists; they never change it.
 */
export async function findExpiredFormulary(page: Page): Promise<FormularyListItem | null> {
  // ON THE APP FIRST: a case calls this before navigating, and a page still on
  // about:blank cannot read the token - the callers' catch read that as "no
  // Expired formulary" while 26 existed (18648, 2026-11-02; see utils/PayerFinder.ts).
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const expired = (await formularyStatusIds(page)).expired;
  if (expired === undefined) return null;
  const { items } = await listFormularyRegister(page, {}, 500);
  return items.find((f) => f.effectiveStatusId === expired) ?? null;
}

/** Whether the catalogue lists one of `candidates` as a row of its own (a parent node counts - its "(n/m)" counter is ignored). */
export async function catalogueOffers(step: RolePermissionsStep, candidates: readonly string[]): Promise<string> {
  const labels = (await step.getAllLabels()).map((l) => l.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim());
  return candidates.find((c) => labels.includes(c)) ?? '';
}

/**
 * Posts an import file straight to an import endpoint as the page's signed-in
 * user (multipart `file` + `formularyId`) - the "upload through any exposed
 * entry point" of the import-permission cases. The field names follow the
 * other modules' imports and are UNVERIFIED for formularies; the answer is
 * returned as is, so the case asserts a refusal, not a shape.
 */
export async function importAsSession(page: Page, endpoint: string, file: { name: string; mimeType: string; buffer: Buffer }, formularyId?: string): Promise<{ status: number; text: string }> {
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const response = await page.request.fetch(`${env.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    multipart: { file, ...(formularyId === undefined ? {} : { formularyId }) },
    failOnStatusCode: false,
  });
  return { status: response.status(), text: await response.text().catch(() => '') };
}

/** A Tiers import workbook in the export's own columns (Foundation notes: the tiers CSV headers). */
export function tierImportFile(rows: ReadonlyArray<readonly string[]>): { name: string; mimeType: string; buffer: Buffer } {
  const headers = ['Tier Name (English) *', 'Tier Name (Arabic) *', 'Default Coverage %', 'Tier Order *', 'Description (English)', 'Description (Arabic)'];
  return { name: 'formulary-tiers-import.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buildXlsx(headers, rows) };
}

/**
 * An audit timeline time ("19/10/2026 06:20 PM" or "19/10/2026 18:20") as
 * epoch milliseconds, NaN when it does not read as one.
 */
export function auditTime(when: string): number {
  const m = when.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return Number.NaN;
  let hours = Number(m[4]);
  if (m[7]) hours = (hours % 12) + (/PM/i.test(m[7]) ? 12 : 0);
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hours, Number(m[5]), Number(m[6] ?? 0)).getTime();
}

/**
 * Re-reads the detail's version badge (reloading) until it matches `expected`
 * or the propagation budget runs out, and returns the last reading - the
 * caller asserts it, so the failure names what the badge actually said.
 */
export async function waitForVersionBadge(detail: FormularyDetailPage, expected: RegExp): Promise<string> {
  const deadline = Date.now() + Timeouts.queuePropagation;
  let badge = '';
  do {
    await detail.reload();
    await detail.waitForLoaded().catch(() => undefined);
    badge = await detail.getVersionBadge().catch(() => '');
    if (expected.test(badge)) return badge;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  } while (Date.now() < deadline);
  return badge;
}
