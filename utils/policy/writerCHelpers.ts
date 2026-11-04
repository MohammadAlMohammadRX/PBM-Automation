import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import { test as policyRoleTest, expect, type PolicySession } from './policyRole';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { RoleAdministrationPage } from '../../pages/system/RoleAdministrationPage';
import type { RolePermissionsStep } from '../../pages/system/RolePermissionsStep';
import { ConfirmDialog } from '../../pages/components/ConfirmDialog';
import { openSelect } from '../../pages/components/PrimeControls';
import type { ApprovalManagementPage } from '../../pages/approval/ApprovalManagementPage';
import type { PolicyFormDrawer, PolicySaveAnswer } from '../../pages/policy/PolicyFormDrawer';
import type { PolicyDetailPage } from '../../pages/policy/PolicyDetailPage';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { env } from '../../constants/EnvironmentConfig';
import { POLICY_NETWORKS, POLICY_RESET, TOAST, buttonSelector, type PolicyDetailTab } from '../../constants/ElementIds';
import { CONFLICT_RELOAD, RESETS_NAV, RESET_HISTORY } from '../../constants/policy/writerCIds';
import { PAYER_ADMIN_ROLE } from '../../data/accounts/payerAdminRole.data';
import { NON_ADMIN_PROFILE } from '../../data/accounts/nonAdminAccount.data';
import { readEffectivePermissions } from '../EffectivePermissions';
import { NetworkUtils } from '../NetworkUtils';
import { WaitUtils } from '../WaitUtils';
import { Logger } from '../Logger';
import { buildXlsx } from '../XlsxUtils';
import { listNetworks, networkStatusIds, payerIdByName } from '../NetworkProvisioning';
import {
  assignableNetworks,
  listPolicyRegister,
  memberCandidates,
  policiesInForce,
  policyDayText,
  policyStatusIds,
  readPolicy,
  readPolicyMembers,
  type MemberCandidate,
  type PolicyInForce,
  type PolicyListItem,
  type PolicyRecord,
  type PolicyUploadFile,
  type ProvisionedPolicy,
} from '../PolicyProvisioning';

/**
 * Writer C's helpers for the policy folders 10, 11, 15, 18, 19, 20 and 22
 * (reports/policy/Policy-Writers-Brief.md: the shared fixtures and page objects
 * are not edited - what is missing lives here, taking the page object or Page).
 *
 * `test` extends the permission story's `policyRole` (utils/policy/policyRole.ts)
 * with `policyApprovalRight`, which withholds the Payer Admin role's "Policy
 * Approvals" group (Approval Management > Policy Approvals: Approve/Reject,
 * Approve/Reject all - held by that role on 2026-11-03) for the approval
 * workflow cases that need a user WITHOUT the approval permission, and restores
 * it at teardown. Specs that need either fixture import `test` from here.
 */

/** A case the environment cannot run, reported BLOCKED with its reason (data-driven). */
export interface PolicyBlockedCase {
  azureId: string;
  title: string;
  reason: string;
}

/** The payer of the Payer Admin's scope the permission cases build their policies for (the active one, as the Formulary suite). */
export const SCOPED_POLICY_PAYER = NON_ADMIN_PROFILE.scopedPayers[1];

/** The catalogue group of the policy approval rights, under Approval Management. */
export const POLICY_APPROVALS_GROUP = 'Policy Approvals';

export interface PolicyApprovalRightControl {
  /** Unticks the "Policy Approvals" group of the Payer Admin role (call BEFORE signing the account in). */
  withhold: () => Promise<void>;
}

export interface WriterCFixtures {
  policyApprovalRight: PolicyApprovalRightControl;
}

export const test = policyRoleTest.extend<WriterCFixtures>({
  // Depends on policyRole so it is torn down FIRST: its restore opens a fresh
  // catalogue, and policyRole's own restore opens another one afterwards, so
  // neither save overwrites the other with a stale drawer.
  policyApprovalRight: async ({ browser, policyRole }, use, testInfo) => {
    void policyRole;
    let context: BrowserContext | null = null;
    let wasChecked: boolean | null = null;

    const catalogue = async (): Promise<{ roles: RoleAdministrationPage; step: RolePermissionsStep }> => {
      if (context === null) context = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
      const roles = new RoleAdministrationPage(await (context as BrowserContext).newPage());
      return { roles, step: await roles.openPermissionCatalogue(PAYER_ADMIN_ROLE) };
    };

    const withhold = async (): Promise<void> => {
      testInfo.setTimeout(testInfo.timeout + 120_000);
      try {
        const { roles, step } = await catalogue();
        wasChecked = await step.isPermissionChecked(POLICY_APPROVALS_GROUP);
        Logger.step(`[policyApprovalRight] "${POLICY_APPROVALS_GROUP}" was ${wasChecked ? 'held' : 'not held'} by "${PAYER_ADMIN_ROLE}"`);
        if (wasChecked) {
          await step.togglePermission(POLICY_APPROVALS_GROUP);
          await roles.saveRole();
        } else await roles.closeDrawer().catch(() => undefined);
      } catch (error) {
        blockedByPrecondition(testInfo, `the "${PAYER_ADMIN_ROLE}" role without its "${POLICY_APPROVALS_GROUP}" rights`, error);
      }
    };

    await use({ withhold });

    if (wasChecked === true) {
      Logger.step(`[policyApprovalRight] Restoring "${POLICY_APPROVALS_GROUP}" on "${PAYER_ADMIN_ROLE}"`);
      const { roles, step } = await catalogue();
      if (!(await step.isPermissionChecked(POLICY_APPROVALS_GROUP))) {
        await step.togglePermission(POLICY_APPROVALS_GROUP);
        await roles.saveRole();
      } else await roles.closeDrawer().catch(() => undefined);
    }
    if (context !== null) await (context as BrowserContext).close();
  },
});

export { expect };
export type { PolicySession };

// ---- answers and controls ----------------------------------------------------------

/** A direct request refused for want of the right (401 / 403, or a 4xx naming the permission). */
export const refused = (answer: { status: number; text: string }): boolean => answer.status === 401 || answer.status === 403
  || (answer.status >= 400 && /permission|not authori[sz]ed|forbidden|access (is )?denied/i.test(answer.text));

/** 'absent' | 'disabled' | 'available' for any button by id. */
export async function controlAvailability(page: Page, id: string): Promise<'absent' | 'disabled' | 'available'> {
  const button = page.locator(buttonSelector(id)).first();
  const shown = await button.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  if (!shown) return 'absent';
  return (await button.isEnabled()) ? 'available' : 'disabled';
}

/** The same for a button inside one table row. */
export async function rowControlAvailability(row: Locator, id: string): Promise<'absent' | 'disabled' | 'available'> {
  const button = row.locator(buttonSelector(id)).first();
  if ((await button.count()) === 0 || !(await button.isVisible().catch(() => false))) return 'absent';
  return (await button.isEnabled()) ? 'available' : 'disabled';
}

/** The tooltip (title) of a button inside a row, '' when none. */
export async function rowControlTitle(row: Locator, id: string): Promise<string> {
  const button = row.locator(buttonSelector(id)).first();
  if ((await button.count()) === 0) return '';
  return (await button.getAttribute('title').catch(() => null)) ?? (await row.locator(`#${id}`).first().getAttribute('title').catch(() => null)) ?? '';
}

/** Toasts on screen, settled. */
export async function readToasts(page: Page, timeout: number = Timeouts.short): Promise<string[]> {
  return WaitUtils.settleMessages(async () => (await page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== ''), timeout);
}

/** BLOCKS the case when a precondition the environment owes it is missing (never a finding). */
export function blockUnless(testInfo: TestInfo, held: boolean, precondition: string, why: string): void {
  if (!held) blockedByPrecondition(testInfo, precondition, new Error(why));
}

// ---- data the environment holds -------------------------------------------------------

/**
 * An EXPIRED policy of the register, READ-ONLY, or null. Expired cannot be made
 * on demand (the daily lifecycle job), so the cases that only LOOK at an
 * expired policy's tabs use one that exists - never clicking anything that
 * changes it. `need` asks for live members and / or assigned networks.
 */
export async function findExpiredPolicy(page: Page, need: { members?: boolean; networks?: boolean } = {}): Promise<PolicyRecord | null> {
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const expired = (await policyStatusIds(page)).expired;
  if (expired === undefined) return null;
  const { items } = await listPolicyRegister(page, {}, 500);
  const candidates = items.filter((p: PolicyListItem) => p.effectiveStatusId === expired && !p.isPendingCreate && (!need.members || p.memberCount > 0));
  for (const candidate of candidates.slice(0, 40)) {
    const record = await readPolicy(page, candidate.id).catch(() => null);
    if (!record) continue;
    if (need.networks && !(record.networkCount > 0)) continue;
    if (need.members && (await readPolicyMembers(page, candidate.id).catch(() => [])).length === 0) continue;
    return record;
  }
  return null;
}

/** The ACTIVE networks of a payer the assign select offers that the policy does not hold yet. */
export async function unassignedActiveNetworks(page: Page, payerId: string, held: ReadonlyArray<{ networkId: string }>): Promise<{ id: string; networkNameEn: string }[]> {
  const taken = new Set(held.map((n) => n.networkId));
  return (await assignableNetworks(page, payerId)).filter((n) => !taken.has(n.id));
}

/** A FUTURE (approved, not yet effective) network of the payer, or null - the select is expected to offer it (19544). */
export async function futureNetworkOf(page: Page, payerId: string): Promise<{ id: string; name: string } | null> {
  const pending = (await networkStatusIds(page)).pending;
  const rows = await listNetworks(page, {}, 1000);
  const row = rows.find((r) => r.payerId === payerId && (r.effectiveStatusId ?? r.statusId) === pending && r.isPendingCreate !== true);
  return row ? { id: String(row.id), name: String(row.networkNameEn) } : null;
}

/** An ACTIVE network of ANOTHER payer (the "NW-999 not assigned to the payer" of 19551), or null. */
export async function activeNetworkOfAnotherPayer(page: Page, payerId: string): Promise<{ id: string; name: string } | null> {
  const active = (await networkStatusIds(page)).active;
  const rows = await listNetworks(page, {}, 1000);
  const row = rows.find((r) => r.payerId !== payerId && r.payerId !== null && (r.effectiveStatusId ?? r.statusId) === active && r.isActive !== false);
  return row ? { id: String(row.id), name: String(row.networkNameEn) } : null;
}

/** The first payer of `names` whose assign select offers NO network (19552), or null. */
export async function payerWithoutNetworks(page: Page, names: readonly string[]): Promise<string | null> {
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  for (const name of names) {
    const id = await payerIdByName(page, name).catch(() => null);
    if (id !== null && (await assignableNetworks(page, id)).length === 0) return name;
  }
  return null;
}

/** Members the picker offers that the policy does not hold yet (each with a distinct name and document id). */
export async function freeCandidates(page: Page, policyId: string, count: number): Promise<MemberCandidate[]> {
  const held = new Set((await readPolicyMembers(page, policyId)).map((m) => m.memberId));
  const seenNames = new Set<string>();
  const out: MemberCandidate[] = [];
  for (const candidate of await memberCandidates(page, policyId, 'a')) {
    if (held.has(candidate.id) || !candidate.documentId || seenNames.has(candidate.displayNameEn)) continue;
    seenNames.add(candidate.displayNameEn);
    out.push(candidate);
    if (out.length === count) break;
  }
  return out;
}

// ---- tabs ------------------------------------------------------------------------------

/** Clicks the "Clear" control of a detail tab's search, or each applied chip's remove button, and waits for the list call. */
export async function clearTabFilters(page: Page, ids: { chips: string; clear: string }, listEndpoint: RegExp): Promise<void> {
  const answered = (): Promise<unknown> => page.waitForResponse((r) => listEndpoint.test(new URL(r.url()).pathname), { timeout: Timeouts.short }).catch(() => null);
  const clear = page.locator(buttonSelector(ids.clear)).first();
  if (await clear.isVisible().catch(() => false)) {
    const waiting = answered();
    await clear.click();
    await waiting;
    return;
  }
  for (let i = 0; i < 6; i += 1) {
    const remove = page.locator(`[id^="${ids.chips}-chip-"][id$="-remove"]`).first();
    if (!(await remove.isVisible().catch(() => false))) break;
    const waiting = answered();
    await remove.click();
    await waiting;
  }
}

/** Opens the network select WITHOUT assigning, picks an option by (part of) its label, and returns what the select then shows. */
export async function chooseNetworkOption(page: Page, label: string): Promise<string> {
  const select = page.locator(`#${POLICY_NETWORKS.select}`);
  const options = await openSelect(page, select);
  await options.filter({ hasText: label }).first().click();
  await expect(select, `the network select should show "${label}"`).toContainText(label.slice(0, 30), { timeout: Timeouts.default });
  return (await select.innerText()).replace(/\s+/g, ' ').trim();
}

/**
 * Whether the tab's "add a network" control can be used: the select rendered
 * and not disabled. (The Assign button itself stays disabled until a network
 * is chosen, so its state alone cannot tell a permission from an empty choice.)
 */
export async function networkSelectUsable(page: Page): Promise<boolean> {
  const select = page.locator(`#${POLICY_NETWORKS.select}`);
  if (!(await select.isVisible().catch(() => false))) return false;
  const disabled = await select.evaluate((el) => el.getAttribute('aria-disabled') === 'true' || !!el.closest('.p-disabled, [disabled]')).catch(() => false);
  return !disabled && (await page.locator(buttonSelector(POLICY_NETWORKS.assign)).first().isVisible().catch(() => false));
}

/** Clicks Assign with whatever the select holds (confirming a "Return to draft?" prompt); returns AssignPolicyNetwork's answer. */
export async function clickAssign(page: Page): Promise<{ status: number; text: string; messages: string[] }> {
  const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.policyAssignNetwork, async () => {
    await page.locator(buttonSelector(POLICY_NETWORKS.assign)).first().click();
    const dialog = new ConfirmDialog(page);
    if (await dialog.isVisible()) await dialog.confirmWithFollowUps().catch(() => undefined);
  });
  return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await readToasts(page) };
}

/**
 * Whether a detail tab is denied to a session: not offered, or offered but its
 * data refused (401 / 403) or an access message shown when it is selected.
 */
export async function tabDenied(session: PolicySession, tab: PolicyDetailTab, dataEndpoint: RegExp): Promise<{ denied: boolean; how: string }> {
  if (!(await session.detail.hasTab(tab))) return { denied: true, how: 'the tab is not offered' };
  const answered = session.page.waitForResponse((r) => dataEndpoint.test(new URL(r.url()).pathname), { timeout: Timeouts.default }).catch(() => null);
  await session.detail.openTab(tab);
  const response = await answered;
  const text = await session.detail.getScreenText().catch(() => '');
  if (response && (response.status() === 401 || response.status() === 403)) return { denied: true, how: `the tab's data answered ${response.status()}` };
  if (/access denied|not authori[sz]ed|no permission|do not have permission/i.test(text)) return { denied: true, how: 'an access message was shown' };
  return { denied: false, how: `the tab opened and its data answered ${response?.status() ?? 'nothing'}` };
}

// ---- approvals ---------------------------------------------------------------------------

/**
 * What a session is offered for a policy's request in the approvals hub:
 * whether the hub offers it the Policy tab at all, and whether Approve /
 * Reject are usable on the request. Never throws.
 */
export async function decisionOfferedTo(approvals: ApprovalManagementPage, policyName: string): Promise<{ tab: boolean; inQueue: boolean; approve: boolean; reject: boolean }> {
  await approvals.openHub().catch(() => undefined);
  const tab = (await approvals.getOfferedTabs().catch(() => [] as string[])).includes('policy');
  if (!tab) return { tab, inQueue: false, approve: false, reject: false };
  await approvals.openTab('policy').catch(() => undefined);
  const offered = await approvals.getDecisionAvailability(policyName).catch(() => ({ inQueue: false, approve: false, reject: false }));
  return { tab, ...offered };
}

/** The open confirmation dialog's whole text (title, message, field errors) plus the toasts - for a refused Reject. */
export async function dialogAndToastText(page: Page): Promise<string> {
  const dialog = (await page.locator('#pbm-dialog').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  return `${dialog} | ${(await readToasts(page)).join(' | ')}`;
}

/** The approval-ish permission codes a signed-in account is told it holds (evidence for the withheld "Policy Approvals" group). */
export async function heldApprovalCodes(page: Page): Promise<string[]> {
  return (await readEffectivePermissions(page).catch(() => [] as string[])).filter((code) => /approv/i.test(code) && /polic/i.test(code));
}

// ---- concurrent edit (US 15186) --------------------------------------------------------------

/** Opens a policy's Edit drawer in one window (detail + drawer of that window). */
export async function openEditIn(window: { detail: PolicyDetailPage }, policyId: string): Promise<PolicyFormDrawer> {
  await window.detail.open(policyId);
  return window.detail.openEditDrawer();
}

/** Moves the Edit drawer to step 2 (Coverage Period) when it is on step 1, then types the grace period. */
export async function typeGracePeriod(drawer: PolicyFormDrawer, value: string): Promise<void> {
  if ((await drawer.currentStep()) === 1) expect(await drawer.next(), 'the Edit drawer should move to Coverage Period').toBe(true);
  await drawer.type('gracePeriod', value);
}

/** The grace period the Edit drawer shows (moving to step 2 first). */
export async function readGracePeriod(drawer: PolicyFormDrawer): Promise<string> {
  if ((await drawer.currentStep()) === 1) await drawer.next();
  return drawer.getValue('gracePeriod');
}

/** A save answered 409 with the concurrency sentence. */
export const isConflict = (answer: PolicySaveAnswer, sentence: string): boolean => answer.status === 409 && `${answer.text} ${answer.messages.join(' ')}`.includes(sentence);

/** Whether a conflict offered a way to reload: a dialog mentioning reload, or a control whose id mentions it. */
export async function reloadPrompt(page: Page): Promise<{ shown: boolean; text: string }> {
  const dialog = new ConfirmDialog(page);
  if (await dialog.isVisible()) {
    const text = `${await dialog.getTitle().catch(() => '')} ${await dialog.getMessage().catch(() => '')}`.trim();
    if (/reload|refresh/i.test(text)) return { shown: true, text };
  }
  const control = page.locator(`button[id*="${CONFLICT_RELOAD.idFragment}"], [id*="${CONFLICT_RELOAD.idFragment}"] > button`).filter({ visible: true }).first();
  if (await control.isVisible().catch(() => false)) return { shown: true, text: (await control.innerText().catch(() => '')).trim() };
  return { shown: false, text: (await readToasts(page)).join(' | ') };
}

/** Clicks the offered Reload control; returns false when none is offered. */
export async function clickReload(page: Page): Promise<boolean> {
  const control = page.locator(`button[id*="${CONFLICT_RELOAD.idFragment}"], [id*="${CONFLICT_RELOAD.idFragment}"] > button`).filter({ visible: true }).first();
  if (await control.isVisible().catch(() => false)) {
    await control.click();
    await WaitUtils.settleMessages(async () => [], Timeouts.short).catch(() => undefined);
    return true;
  }
  const dialog = new ConfirmDialog(page);
  if (await dialog.isVisible() && /reload|refresh/i.test(`${await dialog.getTitle().catch(() => '')} ${await dialog.getMessage().catch(() => '')}`)) {
    await dialog.confirm();
    return true;
  }
  return false;
}

// ---- policy benefit resets (US 18366) ---------------------------------------------------------

/**
 * Waits until a policy is listed in Policies in force (a FUTURE policy whose
 * effective time has passed is - Foundation notes) and returns the row. Throws
 * with what was seen when it never shows.
 */
export async function waitUntilInForce(page: Page, policy: ProvisionedPolicy, timeoutMs = 5 * 60_000): Promise<PolicyInForce> {
  const effective = Date.parse(policy.effectiveDate);
  if (effective > Date.now()) await page.waitForTimeout(Math.min(effective - Date.now() + 5_000, timeoutMs));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = (await policiesInForce(page, policy.policyNumber)).find((p) => p.policyId === policy.id);
    if (row) return row;
    await page.waitForTimeout(10_000);
  }
  throw new Error(`policy ${policy.policyNumber} (effective ${policy.effectiveDate}) is not listed in Policies in force after its effective time`);
}

/** Types into the Policies in force search WITHOUT pressing Enter ("filters as text is typed"); Enter when nothing was asked. Returns whether a search answered as typed. */
export async function typeInForceSearch(page: Page, input: string, term: string): Promise<boolean> {
  const box = page.locator(`#${input}`);
  const answered = page.waitForResponse((r) => /GetPolicyBenefitYears$/.test(r.url()) && (r.request().postData() ?? '').includes(JSON.stringify(term).slice(1, -1)), { timeout: Timeouts.short })
    .then(() => true).catch(() => false);
  await box.click();
  await box.fill('');
  await box.pressSequentially(term, { delay: 40 });
  if (await answered) return true;
  const onEnter = page.waitForResponse((r) => /GetPolicyBenefitYears$/.test(r.url()), { timeout: Timeouts.default }).catch(() => null);
  await box.press('Enter');
  await onEnter;
  return false;
}

/** One Reset history row. */
export interface ResetHistoryRow {
  rowId: string;
  text: string;
  kind: string;
  status: string;
}

/** Searches the Reset history tab (the tab must be open) and waits for its feed. */
export async function searchResetHistory(page: Page, term: string): Promise<void> {
  const box = page.locator(`#${RESET_HISTORY.search}`);
  const answered = page.waitForResponse((r) => new URL(r.url()).pathname === ApiEndpoints.policyResetHistory, { timeout: Timeouts.default }).catch(() => null);
  await box.fill(term);
  await box.press('Enter');
  await answered;
  await WaitUtils.settleMessages(async () => [], 500).catch(() => undefined);
}

export async function readResetHistory(page: Page): Promise<ResetHistoryRow[]> {
  const prefix = RESET_HISTORY.rowPrefix;
  return page.locator(`tr[id^="${prefix}"]`).evaluateAll((trs, ids) => trs
    .filter((tr) => !/-(kind|status)-badge$/.test(tr.id))
    .map((tr) => {
      const read = (suffix: string): string => ((document.getElementById(`${tr.id}-${suffix}`) as HTMLElement | null)?.innerText ?? '').trim();
      return { rowId: tr.id, text: (tr as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), kind: read(ids.kind), status: read(ids.status) };
    }), { kind: RESET_HISTORY.kindBadge, status: RESET_HISTORY.statusBadge });
}

/** The Reset history tab's header labels (the visible table of the screen - the tab's table carries no id). */
export async function readResetHistoryHeaders(page: Page): Promise<string[]> {
  return (await page.locator(`#${RESET_HISTORY.container}`).locator('th').filter({ visible: true }).allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
}

/**
 * The Reset history tab's whole text (its empty state carries no id): the
 * screen's root section, read once the tab's search box is shown and its
 * GetResetJobHistory answer has rendered a row or the empty state.
 */
export async function readResetHistoryText(page: Page): Promise<string> {
  const root = page.locator(`#${RESET_HISTORY.container}`);
  await page.locator(`#${RESET_HISTORY.search}`).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
  await expect.poll(async () => {
    const rows = await page.locator(`tr[id^="${RESET_HISTORY.rowPrefix}"]`).count();
    const text = await root.innerText().catch(() => '');
    return rows > 0 || text.includes(RESET_HISTORY_EMPTY);
  }, { timeout: Timeouts.default }).toBe(true).catch(() => undefined);
  return (await root.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
}

/** The Reset history tab's empty-state sentence (bundle i18n `fin.resetJob.empty`). */
const RESET_HISTORY_EMPTY = 'No resets have been recorded yet.';

/**
 * Whether the app's menu offers Policy Benefit Resets (any rendered link to its route).
 * Expands the collapsed menu groups first (2026-11-04): System Settings renders its
 * links only while expanded, so the administrator's own baseline read "not offered"
 * on 2026-11-03 and 19675 was BLOCKED.
 */
export async function resetsMenuOffered(page: Page): Promise<boolean> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  const byIdLink = page.locator(`[id^="${RESETS_NAV.idPrefix}"][id*="${RESETS_NAV.idFragment}"]`);
  const byHref = page.locator(`a[href*="${RESETS_NAV.route}"]`); // locator-exception: the menu entry's id was not probed; its link target is the route itself.
  const offered = async (): Promise<boolean> => (await byIdLink.count()) + (await byHref.count()) > 0;
  if (await offered()) return true;
  const toggles = page.locator(`button[id^="${RESETS_NAV.idPrefix}"][id$="${RESETS_NAV.toggleSuffix}"]`);
  for (let i = 0, n = await toggles.count(); i < n; i += 1) {
    const toggle = toggles.nth(i); // locator-exception: every menu group toggle is expanded in turn; their number varies with the role.
    const open = await toggle.evaluate((el, cls) => el.classList.contains(cls), RESETS_NAV.openClass).catch(() => true);
    if (!open && (await toggle.isVisible().catch(() => false))) await toggle.click().catch(() => undefined);
  }
  await page.waitForTimeout(300);
  return offered();
}

/** The Reset drawer's reason as typed (its maxlength trims a longer one). */
export async function resetReasonValue(page: Page): Promise<string> {
  return page.locator(`#${POLICY_RESET.reason}`).inputValue();
}

/** A term field's value in the Reset drawer. */
export async function resetTermValue(page: Page, term: 'deductible' | 'coinsurance' | 'outOfPocket' | 'sublimit'): Promise<string> {
  return page.locator(`#${POLICY_RESET[term]}`).inputValue();
}

/** The Reset drawer's field errors and toasts, settled. */
export async function resetDrawerMessages(page: Page): Promise<string[]> {
  return WaitUtils.settleMessages(async () => {
    const own = await page.locator(`[id^="${POLICY_RESET.root}-"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
    const toast = await page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    return [...own, ...toast].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
  });
}

/** Today as the screens print it (DD/MM/YYYY). */
export const todayText = (): string => policyDayText(new Date());

// ---- files -------------------------------------------------------------------------------

/** A PDF of exactly `bytes` bytes (a valid header and trailer, padded inside a comment). */
export function pdfOfSize(bytes: number, name: string): PolicyUploadFile {
  const head = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%');
  const tail = Buffer.from('\ntrailer<<>>\n%%EOF\n');
  const pad = Buffer.alloc(Math.max(0, bytes - head.length - tail.length), 0x20);
  return { name, mimeType: 'application/pdf', buffer: Buffer.concat([head, pad, tail]) };
}

/** A small Word file (.docx bytes need not be a real document - the type is what is refused). */
export function docxFile(name = 'contract.docx'): PolicyUploadFile {
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK\u0003\u0004 automation docx placeholder') };
}

/**
 * A policies import workbook built from the list's own Export Template headers:
 * each header gets the value of the first rule whose pattern it matches, ''
 * otherwise. The template's columns were NOT probed (Foundation notes, "Not
 * exercised: imports") - the case asserts the import's outcome, so a wrong
 * guess shows as the import's own error.
 */
export function policyImportFile(headers: readonly string[], rules: ReadonlyArray<readonly [RegExp, string]>): PolicyUploadFile {
  const row = headers.map((header) => rules.find(([pattern]) => pattern.test(header))?.[1] ?? '');
  return { name: 'policies-import.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buildXlsx(headers, [row]) };
}

/** Sends a request as a session's user (the "trigger it directly" steps). */
export async function asSession(page: Page, method: 'POST' | 'PUT' | 'DELETE' | 'GET', path: string, data?: unknown): Promise<{ status: number; text: string }> {
  const res = await NetworkUtils.requestAsSession(page, method, path, data);
  return { status: res.status, text: res.text };
}
