import type { Browser, Page, Request, TestInfo } from '@playwright/test';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import type { MemberDetailPage } from '../../pages/member/MemberDetailPage';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { env } from '../../constants/EnvironmentConfig';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { DIALOG, TOAST, buttonSelector } from '../../constants/ElementIds';
import { MEMBER_COB, MEMBER_DETAIL } from '../../constants/member/memberIds';
import { NetworkUtils } from '../NetworkUtils';
import { WaitUtils } from '../WaitUtils';
import { Logger } from '../Logger';
import type { SuitePolicySpec } from '../PolicyProvisioning';
import {
  deactivationReasons,
  discardEnrolment,
  discardSuiteMember,
  enrolSuiteMember,
  findMemberByName,
  memberStamp,
  provisionSuiteMember,
  readAuditEntry,
  readCobTimeline,
  suiteMemberDisplayName,
  suiteMemberLastName,
  type CobEntry,
  type MemberAuditEntry,
  type MemberEnrolment,
  type MemberRecord,
  type MemberState,
  type ProvisionedMember,
  type SuiteMemberSpec,
} from '../MemberProvisioning';
import type { MemberSession } from './memberRole';

/**
 * Writer C's helpers for the member folders 08 (view), 09 (Coverage Ordering
 * tab), 10 (delete) and 11 (activate / deactivate) -
 * reports/member/Member-Writers-Brief.md: the foundation is not edited, what it
 * lacks lives here.
 *
 * WHAT THE FOUNDATION LACKED (added here):
 * - `SharedEnrolment` - ONE enrolled suite member shared by the cases of a
 *   describe (built in `beforeAll`, discarded in `afterAll`). `memberEnrolled`
 *   is test-scoped, and every approved enrolment leaves a deactivated member and
 *   retired policies behind, so the read-only / state-chain cases share one.
 *   NOT `mode: 'serial'`: a finding is a failing test, and serial mode would skip
 *   every later case of the group. Playwright restarts the worker after a failed
 *   test, so `beforeAll` then builds a fresh member for the remaining cases - each
 *   case therefore establishes its own precondition from whatever state the
 *   shared member is in (and BLOCKS when a precondition cannot hold).
 * - COB mouse sequences the page object does not offer (drop outside the list,
 *   rapid drags, a reload mid-drag) for the exploratory 19902.
 * - The CREATE audit entry of a member (written under ANOTHER entity id - found
 *   in Audit Logs by its document ID) for the Record Information case 19877.
 * - Read-only probes of the view page (editable controls, save / submit buttons).
 * - The Edit wizard's address cascade (city / district / street) - the
 *   provisioning body leaves them null.
 */

/** The id every COB entry carries until the member's first reorder (2026-11-05). */
export const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

// ---- the shared enrolled member ------------------------------------------------------------

/** What a shared member is built with. */
export interface SharedEnrolmentSpec {
  /** For the logs and the BLOCKED reason. */
  label: string;
  state?: MemberState;
  member?: SuiteMemberSpec;
  /** How many NEW suite policies (Individual, "Al sharq", approved -> Future). */
  policies: number;
  /** Per-policy terms (default effective in 3 + i minutes, 90 days long). */
  policySpecs?: SuitePolicySpec[];
}

export interface SharedEnrolled {
  member: ProvisionedMember;
  /** In enrolment order (the shared build first, then what the cases added). */
  enrolments: MemberEnrolment[];
}

/**
 * One suite member enrolled in its own approved suite policies, shared by the
 * cases of a describe:
 *
 *   const shared = new SharedEnrolment({ label: 'COB three policies', policies: 3 });
 *   test.beforeAll(async ({ browser }, testInfo) => shared.build(browser, testInfo));
 *   test.afterAll(async ({ browser }) => shared.discard(browser));
 *   ... const { member, enrolments } = shared.require(test.info());
 *
 * Teardown is the fixture's: the policies are retired (an approved Individual
 * policy cannot be deleted) and the member deactivated (the approved enrolment
 * blocks its delete). A build the application refuses BLOCKS every case of the
 * group with the server's answer.
 */
export class SharedEnrolment {
  private memberId: string | null = null;
  private member: ProvisionedMember | null = null;
  private readonly enrolments: MemberEnrolment[] = [];
  private failure: unknown = null;

  constructor(private readonly spec: SharedEnrolmentSpec) {}

  private static async adminPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
    const context = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();
    await page.goto(env.baseUrl);
    return { page, close: () => context.close() };
  }

  /** beforeAll: builds the member and its policies (~15 s a policy). Never throws - a refusal is kept for `require`. */
  async build(browser: Browser, testInfo: TestInfo): Promise<void> {
    testInfo.setTimeout(Math.max(testInfo.timeout, 180_000 + this.spec.policies * 60_000));
    const { page, close } = await SharedEnrolment.adminPage(browser);
    const lastName = this.spec.member?.lastName ?? suiteMemberLastName(memberStamp());
    try {
      const member = await provisionSuiteMember(page, this.spec.state ?? 'Active', { ...this.spec.member, lastName }).catch(async (error: unknown) => {
        const partial = await findMemberByName(page, suiteMemberDisplayName(lastName)).catch(() => null);
        if (partial) this.memberId = partial.id;
        throw error;
      });
      this.memberId = member.id;
      for (let i = 0; i < this.spec.policies; i += 1) {
        const policy: SuitePolicySpec = { effectiveInMinutes: 3 + i, expiryInDays: 90, ...(this.spec.policySpecs?.[i] ?? {}) };
        this.enrolments.push(await enrolSuiteMember(page, member.id, { policy }));
      }
      this.member = member;
      Logger.step(`[shared] "${this.spec.label}": ${member.code} in ${this.enrolments.map((e) => e.policy.policyNumber).join(', ')}`);
    } catch (error) {
      this.failure = error;
      Logger.warn(`[shared] "${this.spec.label}" could not be built: ${String(error instanceof Error ? error.message : error).slice(0, 300)}`);
    } finally {
      await close();
    }
  }

  /** The shared member, or BLOCKED with the reason it could not be built. */
  require(testInfo: TestInfo): SharedEnrolled {
    if (this.member === null) {
      return blockedByPrecondition(
        testInfo,
        `the shared suite member "${this.spec.label}" enrolled in ${this.spec.policies} approved suite polic${this.spec.policies === 1 ? 'y' : 'ies'}`,
        this.failure ?? new Error('it was not built (beforeAll did not run)'),
      );
    }
    return { member: this.member, enrolments: [...this.enrolments] };
  }

  /** Enrols the shared member in one more NEW approved suite policy (discarded with the rest). */
  async enrol(page: Page, policy: SuitePolicySpec): Promise<MemberEnrolment> {
    if (this.member === null) throw new Error(`the shared member "${this.spec.label}" was not built`);
    const enrolment = await enrolSuiteMember(page, this.member.id, { policy: { expiryInDays: 90, ...policy } });
    this.enrolments.push(enrolment);
    return enrolment;
  }

  /** afterAll: retires the policies and deactivates / deletes the member. */
  async discard(browser: Browser): Promise<void> {
    if (this.memberId === null && this.enrolments.length === 0) return;
    const { page, close } = await SharedEnrolment.adminPage(browser);
    try {
      for (const enrolment of [...this.enrolments].reverse()) {
        const outcome = await discardEnrolment(page, enrolment).catch(() => 'left');
        Logger.step(`[shared] Policy ${enrolment.policy.nameEn}: ${outcome}`);
      }
      if (this.memberId !== null) Logger.step(`[shared] Member ${this.memberId}: ${await discardSuiteMember(page, this.memberId)}`);
    } finally {
      this.memberId = null;
      this.member = null;
      this.enrolments.length = 0;
      await close();
    }
  }
}

// ---- coverage ordering -----------------------------------------------------------------------

/** The current ordering (GetMemberCobTimeline, `isCurrent`), primary first. */
export async function currentEntries(page: Page, memberId: string): Promise<CobEntry[]> {
  return (await readCobTimeline(page, memberId)).filter((e) => e.isCurrent).sort((a, b) => a.coverageOrder - b.coverageOrder);
}

/** Whether an ordering was ever applied (entries carry real ids only after the first reorder). */
export const hasManualOrdering = (entries: CobEntry[]): boolean => entries.some((e) => e.id !== EMPTY_GUID);

/** A date-time as the COB rows and the dashboard show it: `DD/MM/YYYY HH:mm`, Riyadh time. */
export function riyadhDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 3 * 3_600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`;
}

/** An amount as the screens show it ("SAR 1,000.00"). */
export const money = (amount: number): string => `SAR ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A policy-level term as the screens show it: "None" for 0, else the amount. */
export const policyTerm = (amount: number): string => (amount === 0 ? 'None' : money(amount));

/** locator-exception: every COB entry's ids collide (the empty GUID) - the handles are reached by the id SUFFIX and position (as MemberCobTab). */
const cobHandles = (page: Page) => page.locator(`[id^="${MEMBER_COB.prefix}-entry-"][id$="-${MEMBER_COB.entry.dragHandle}"]`);

/** Collects every ReorderMemberCoverage request sent until `stop()`. */
export function watchReorders(page: Page): { stop: () => Request[] } {
  return collectRequests(page, /\/ReorderMemberCoverage$/);
}

/** Collects every request whose path matches `path` until `stop()` ("nothing was deleted" over several actions). */
export function collectRequests(page: Page, path: RegExp): { stop: () => Request[] } {
  const seen: Request[] = [];
  const listener = (r: Request): void => {
    if (path.test(new URL(r.url()).pathname)) seen.push(r);
  };
  page.on('request', listener);
  return {
    stop: () => {
      page.off('request', listener);
      return [...seen];
    },
  };
}

/** Picks up the row at `index` by its handle and drops it far OUTSIDE the list. */
export async function dropOutsideList(page: Page, index: number): Promise<void> {
  const box = await cobHandles(page).nth(index).boundingBox();
  if (!box) throw new Error(`COB row ${index + 1} has no drag handle on screen`);
  Logger.step(`COB: dropping row ${index + 1} outside the list`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 10, { steps: 5 });
  await page.mouse.move(box.x + 900, Math.max(5, box.y - 500), { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(1_000);
}

/** Several drags back to back with no wait between them (the "rapid reordering"). */
export async function rapidDrags(page: Page, moves: ReadonlyArray<readonly [number, number]>): Promise<void> {
  for (const [from, to] of moves) {
    const a = await cobHandles(page).nth(from).boundingBox();
    const b = await cobHandles(page).nth(to).boundingBox();
    if (!a || !b) continue;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + (to > from ? 30 : -30), { steps: 6 });
    await page.mouse.up();
  }
  await page.waitForTimeout(2_000);
}

/** Starts dragging the row at `index` and reloads the page while the mouse is still down. */
export async function reloadMidDrag(page: Page, index: number): Promise<void> {
  const box = await cobHandles(page).nth(index).boundingBox();
  if (!box) throw new Error(`COB row ${index + 1} has no drag handle on screen`);
  Logger.step(`COB: reloading the page while row ${index + 1} is being dragged`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 8 });
  await page.reload();
  await page.mouse.up().catch(() => undefined);
}

/** The policy numbers of the current ordering through the API, primary first. */
export async function currentPolicyNumbers(page: Page, memberId: string): Promise<string[]> {
  return (await currentEntries(page, memberId)).map((e) => e.policyNumber);
}

// ---- the view page -----------------------------------------------------------------------------

/**
 * The form controls on the view page that a user could type into or change
 * (visible, enabled, not read-only), by id (or tag when the control has none).
 * locator-exception: a control the view page should NOT have carries no id to look for - every input under the page's root is collected.
 */
export async function editableControls(page: Page): Promise<string[]> {
  return page.locator(`#${MEMBER_DETAIL.root}`).locator('input, textarea, select, [contenteditable="true"]').evaluateAll((els) => els // locator-exception: see above.
    .filter((e) => {
      const el = e as HTMLInputElement;
      const style = window.getComputedStyle(el);
      const shown = el.offsetParent !== null && style.visibility !== 'hidden' && el.type !== 'hidden';
      return shown && !el.disabled && !el.readOnly && !el.hasAttribute('readonly') && el.getAttribute('aria-disabled') !== 'true';
    })
    .map((e) => e.id || e.tagName.toLowerCase()));
}

/** Visible buttons on the view page that save or submit (by id or label). */
export async function saveActions(page: Page): Promise<string[]> {
  return page.locator(`#${MEMBER_DETAIL.root}`).locator('button').evaluateAll((els) => els // locator-exception: a save / submit button the view should NOT have carries no id to look for.
    .filter((e) => (e as HTMLElement).offsetParent !== null && /save|submit/i.test(`${e.id} ${(e as HTMLElement).innerText}`))
    .map((e) => e.id || (e as HTMLElement).innerText.trim()));
}

/** Whether the shared confirmation dialog is on screen NOW (no wait). */
export async function dialogShown(page: Page): Promise<boolean> {
  return page.locator(`#${DIALOG.root}`).isVisible().catch(() => false);
}

/** Clicks the shared dialog's close icon (the X). */
export async function closeDialogWithIcon(page: Page): Promise<void> {
  await page.locator(buttonSelector(DIALOG.close)).first().click();
}

/** Toasts on screen, settled. */
export async function readToasts(page: Page, timeout: number = Timeouts.short): Promise<string[]> {
  return WaitUtils.settleMessages(async () => (await page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== ''), timeout);
}

/** Resolves with the first request whose path matches `path` within `timeout`, or null ("nothing was sent"). */
export function watchRequest(page: Page, path: RegExp, timeout: number = Timeouts.short): Promise<Request | null> {
  return page.waitForRequest((r) => path.test(new URL(r.url()).pathname), { timeout }).catch(() => null);
}

/**
 * Saves a full address (City -> District -> Street, the first option of each
 * after the city) through the view page's Edit wizard - the provisioning body
 * leaves the cascade empty. Returns the labels chosen.
 */
export async function saveFullAddress(detail: MemberDetailPage): Promise<{ city: string; district: string; street: string }> {
  const drawer = await detail.openEditDrawer();
  await drawer.ensureStep(3);
  const usable = (options: string[]): string[] => options.map((o) => o.trim()).filter((o) => o !== '' && !/^select/i.test(o));
  const city = usable(await drawer.getOptions('city'))[0] ?? '';
  if (city === '') throw new Error('the Edit wizard offers no City for the member\'s country');
  await drawer.choose('city', city);
  const district = usable(await drawer.getOptions('district'))[0] ?? '';
  if (district !== '') await drawer.choose('district', district);
  const street = district === '' ? '' : (usable(await drawer.getOptions('street'))[0] ?? '');
  if (street !== '') await drawer.choose('street', street);
  await drawer.save();
  return { city, district, street };
}

// ---- audit -------------------------------------------------------------------------------------

/**
 * A member's CREATE entry in System Settings > Audit Logs. The entry is written
 * under ANOTHER (random) entity id (foundation notes, "Audit"), so it is found
 * among the Member CREATE entries around the creation time by its after-image
 * carrying the member's document ID. null when none does.
 */
export async function memberCreateEntry(page: Page, record: Pick<MemberRecord, 'createdOn' | 'documentId'>): Promise<MemberAuditEntry | null> {
  const at = Date.parse(record.createdOn);
  // A wide window: createdOn may come without an offset.
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogList, {
    entityType: 'Member', actionType: 'CREATE', fromUtc: new Date(at - 4 * 3_600_000).toISOString(), toUtc: new Date(at + 4 * 3_600_000).toISOString(), pageNumber: 1, rowsPerPage: 200,
  });
  if (res.status !== 200) throw new Error(`GetAuditLogs (Member CREATE) answered ${res.status} ${res.text.slice(0, 200)}`);
  let items: MemberAuditEntry[] = [];
  try {
    items = ((JSON.parse(res.text) as { payload?: { items?: MemberAuditEntry[] } }).payload?.items) ?? [];
  } catch {
    items = [];
  }
  for (const item of items) {
    const full = await readAuditEntry(page, item.id).catch(() => null);
    if (full && `${full.afterJson ?? ''}`.includes(record.documentId)) return full;
  }
  return null;
}

/** Whether an UPDATE entry's after-image marks the record deleted (IsDeleted / DeletedOn / DeletedBy). */
export function marksDeleted(entry: MemberAuditEntry): boolean {
  try {
    const after = JSON.parse(entry.afterJson ?? '{}') as Record<string, unknown>;
    return after.IsDeleted === true || (after.DeletedOn !== undefined && after.DeletedOn !== null) || (after.DeletedBy !== undefined && after.DeletedBy !== null);
  } catch {
    return false;
  }
}

// ---- restricted user ---------------------------------------------------------------------------

/** A direct request refused for want of the right (401 / 403, or a 4xx naming the permission). */
export const refused = (answer: { status: number; text: string }): boolean => answer.status === 401 || answer.status === 403
  || (answer.status >= 400 && /permission|not authori[sz]ed|forbidden|access (is )?denied/i.test(answer.text));

/** Sends a request as a session's user (the "bypass the screen" checks). */
export async function asSession(page: Page, method: 'POST' | 'PUT' | 'DELETE' | 'GET', path: string, data?: unknown): Promise<{ status: number; text: string }> {
  const res = await NetworkUtils.requestAsSession(page, method, path, data);
  return { status: res.status, text: res.text };
}

/**
 * BLOCKS the case unless the shaped account can see the suite member at all
 * (members belong to payers only through enrolments, and the Payer Admin is
 * payer-scoped): a member outside its scope says nothing about the right the
 * case withholds.
 */
export async function requireMemberShown(session: MemberSession, member: Pick<ProvisionedMember, 'id' | 'lastName' | 'code'>, testInfo: TestInfo): Promise<void> {
  const listed = await session.members.fetchRegister({ searchText: member.lastName }, 20)
    .then((r) => r.items.some((i) => i.id === member.id)).catch(() => false);
  if (!listed) {
    blockedByPrecondition(
      testInfo,
      `a suite member (${member.code}) inside the shaped Payer Admin's payer scope`,
      new Error('GetMembers as the Payer Admin does not list the suite member - members belong to payers only through policy enrolments, so the account cannot see it and the withheld right cannot be observed on it'),
    );
  }
}

/** A deactivation reason id (the first offered) - for the direct "bypass the screen" attempt. */
export async function anyDeactivationReasonId(page: Page): Promise<string | null> {
  return (await deactivationReasons(page))[0]?.id ?? null;
}

/** The body SetMemberActive takes for a deactivation. */
export const deactivateBody = (id: string, reasonId: string | null): Record<string, unknown> => ({ id, isActive: false, inactivationReasonId: reasonId, inactivationDetails: 'Attempted by the automation suite as a restricted user.' });
