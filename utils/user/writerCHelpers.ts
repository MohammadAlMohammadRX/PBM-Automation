import type { Page, Route } from '@playwright/test';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { DIALOG_ACTION, buttonSelector } from '../../constants/ElementIds';
import { USER_DEACTIVATE } from '../../constants/user/userIds';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { payerDropdown, readUserOrNull, type UserRecord } from '../UserProvisioning';

/**
 * Writer C's helpers for the User Management folders 04 (assign roles and
 * payers), 08 (delete user) and 10 (activate / deactivate) -
 * reports/user/User-Writers-Brief.md: the foundation is not edited, what it
 * lacks lives here.
 *
 * WHAT THE FOUNDATION LACKED (added here):
 * - Picking real payers BY NAME for the Assign Payers picker (the fixtures take
 *   names; the cases need two or three distinct ones). Payers are only REFERENCED
 *   on suite users - no payer is changed.
 * - Rapid repeated clicks on a confirm button (double-submission cases 20585,
 *   20623): the clicks are fired synchronously inside the page so the guard
 *   under test is really raced.
 * - A failing back end for one endpoint (20586): the request is aborted in the
 *   browser, nothing reaches the server.
 * - A suite user's role -> payer map, read through GetUser.
 * - A user's audit trail (System Settings > Audit Logs, entity ApplicationUser),
 *   counting Active -> Inactive transitions (20623).
 */

/** Payers preferred for the picker (known to the earlier modules); any other unique name follows. */
export const PREFERRED_PAYERS = ['Al sharq', 'NUPCO'] as const;

/** A payer as the picker shows it. */
export interface NamedPayer {
  id: string;
  name: string;
}

/**
 * `count` distinct payers (unique, plain English names so the picker's search
 * finds exactly one), the preferred ones first, none of `exclude`. Throws when
 * the dropdown has fewer - callers turn that into BLOCKED.
 */
export async function pickPayers(page: Page, count: number, exclude: readonly string[] = []): Promise<NamedPayer[]> {
  const all = await payerDropdown(page);
  const tally = new Map<string, number>();
  for (const p of all) tally.set(p.payerNameEn, (tally.get(p.payerNameEn) ?? 0) + 1);
  const usable = all.filter((p) => p.payerNameEn && tally.get(p.payerNameEn) === 1 && /^[A-Za-z][A-Za-z0-9 ]{2,40}$/.test(p.payerNameEn) && !exclude.includes(p.payerNameEn));
  const preferred = PREFERRED_PAYERS.map((n) => usable.find((p) => p.payerNameEn === n)).filter((p): p is (typeof usable)[number] => !!p);
  const rest = usable.filter((p) => !PREFERRED_PAYERS.includes(p.payerNameEn as (typeof PREFERRED_PAYERS)[number])).sort((a, b) => a.payerNameEn.localeCompare(b.payerNameEn));
  const chosen = [...preferred, ...rest].slice(0, count).map((p) => ({ id: p.id, name: p.payerNameEn }));
  if (chosen.length < count) throw new Error(`the payer dropdown offers only ${chosen.length} usable payers (${count} needed)`);
  Logger.step(`[writerC] Payers for the case: ${chosen.map((p) => p.name).join(', ')}`);
  return chosen;
}

/** A user's roles as GetUser reads them: role name -> its payer ids (sorted). */
export async function rolesOnRecord(page: Page, userId: string): Promise<Record<string, string[]>> {
  const record = await readUserOrNull(page, userId);
  const out: Record<string, string[]> = {};
  for (const r of record?.assignedRoles ?? []) out[r.name] = r.assignedPayers.map((p) => p.id).sort();
  return out;
}

/** The record (or null) - a raw read for fields the typed record does not name (inactivation reason). */
export async function rawUser(page: Page, userId: string): Promise<(UserRecord & Record<string, unknown>) | null> {
  return (await readUserOrNull(page, userId)) as (UserRecord & Record<string, unknown>) | null;
}

/** Clicks a p-button `times` times in ONE synchronous burst inside the page (a real double-submit race). */
export async function burstClick(page: Page, id: string, times: number): Promise<void> {
  await page.locator(buttonSelector(id)).first().evaluate((button, n) => {
    for (let i = 0; i < n; i += 1) (button as HTMLButtonElement).click();
  }, times);
}

/** The shared dialog's confirm button id and the Deactivate drawer's confirm button id. */
export const CONFIRM_IDS = { dialog: DIALOG_ACTION.confirm, deactivate: USER_DEACTIVATE.confirm } as const;

/** Write requests (non-GET) to `fragment` while `action` runs (kept counting `settleMs` after). */
export async function countWrites(page: Page, fragment: string, action: () => Promise<void>, settleMs = 3_000): Promise<number> {
  return NetworkUtils.countRequestsDuring(page, fragment, action, settleMs);
}

/**
 * Makes `fragment` unreachable for this page (the browser aborts the request -
 * the server never sees it). Returns the function that restores it.
 */
export async function makeUnreachable(page: Page, fragment: string): Promise<() => Promise<void>> {
  const matcher = (url: URL): boolean => url.pathname.includes(fragment);
  const handler = async (route: Route): Promise<void> => route.abort('connectionrefused');
  await page.route(matcher, handler);
  Logger.step(`[writerC] "${fragment}" made unreachable for this window`);
  return async () => {
    await page.unroute(matcher, handler).catch(() => undefined);
  };
}

/** One System Settings > Audit Logs entry (GetAuditLogs). */
interface AuditEntry {
  id: string;
  actionType?: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  createdOn?: string;
}

/** How many audit entries of the user (entity ApplicationUser) since `fromUtc` flip IsActive true -> false; null when the trail cannot be read. */
export async function deactivationEntriesSince(page: Page, userId: string, fromUtc: string): Promise<{ count: number | null; entries: number; note: string }> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.auditLogList, {
    entityType: 'ApplicationUser', entityId: userId, actionType: null, fromUtc, pageNumber: 1, rowsPerPage: 100,
  });
  if (res.status !== 200) return { count: null, entries: 0, note: `GetAuditLogs answered ${res.status} ${res.text.slice(0, 160)}` };
  let items: AuditEntry[] = [];
  try {
    items = ((JSON.parse(res.text) as { payload?: { items?: AuditEntry[] } }).payload?.items) ?? [];
  } catch {
    return { count: null, entries: 0, note: 'GetAuditLogs answered no JSON' };
  }
  const flag = (json: string | null | undefined): unknown => {
    try {
      const o = JSON.parse(json ?? '{}') as Record<string, unknown>;
      return o.IsActive ?? o.isActive;
    } catch {
      return undefined;
    }
  };
  const count = items.filter((e) => flag(e.beforeJson) === true && flag(e.afterJson) === false).length;
  return { count, entries: items.length, note: `${items.length} entries since ${fromUtc}` };
}

/** Types into the Deactivate drawer's Details box with real key presses (so its maxlength applies as it does for a person). */
export async function typeDeactivationDetails(page: Page, text: string): Promise<void> {
  const box = page.locator(`#${USER_DEACTIVATE.details}`);
  await box.click();
  await box.press('ControlOrMeta+a');
  await box.press('Delete');
  await box.pressSequentially(text);
}

/** The Deactivate drawer's checklist controls (20626): the reason select and details box shown, the two buttons' labels. */
export async function deactivateDrawerControls(page: Page): Promise<{ reasonSelect: boolean; detailsInput: boolean; confirm: string; cancel: string }> {
  const shown = async (id: string): Promise<boolean> => page.locator(`#${id}`).isVisible().catch(() => false);
  const label = async (id: string): Promise<string> => (await page.locator(buttonSelector(id)).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  return {
    reasonSelect: await shown(USER_DEACTIVATE.reason),
    detailsInput: await shown(USER_DEACTIVATE.details),
    confirm: await label(USER_DEACTIVATE.confirm),
    cancel: await label(USER_DEACTIVATE.cancel),
  };
}

/** Clicks the page well outside a right-hand drawer (its mask), then gives the drawer time to react. */
export async function clickOutsideDrawer(page: Page): Promise<void> {
  await page.mouse.click(12, 320);
  await page.waitForTimeout(600);
}
