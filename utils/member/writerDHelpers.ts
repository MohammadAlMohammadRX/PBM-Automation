import type { Page } from '@playwright/test';
import type { MemberJobClock } from '../../fixtures/memberModule.fixture';
import type { MemberDetailPage } from '../../pages/member/MemberDetailPage';
import { chooseSelectOption } from '../../pages/components/PrimeControls';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { MEMBER_ACCUMULATOR } from '../../constants/ElementIds';
import { env } from '../../constants/EnvironmentConfig';
import { AUDIT_LOG_ROW, DASHBOARD_ID_PREFIX } from '../../constants/member/writerDIds';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import {
  SUITE_POLICY_PREFIX,
  discardSuitePolicy,
  policyStamp,
  policyStatusCode,
  readPolicy,
  type SuitePolicySpec,
} from '../PolicyProvisioning';
import {
  auditChanges,
  discardEnrolment,
  discardSuiteMember,
  enrolSuiteMember,
  isSuiteMember,
  listMemberRegister,
  memberStamp,
  provisionSuiteMember,
  readAuditEntry,
  readMember,
  readMemberAuditTrail,
  readMemberOrNull,
  readResetHistory,
  riyadhDay,
  type MemberAuditEntry,
  type MemberEnrolment,
  type MemberRecord,
  type ResetRun,
} from '../MemberProvisioning';

/**
 * Writer D's helpers for the member folders 12 (audit history), 13
 * (permissions), 14 (PBM Accumulator Dashboard tab) and 15 (Member Benefit
 * Accumulator / year-start reset) - reports/member/Member-Writers-Brief.md: the
 * foundation is not edited, what it lacks lives here.
 *
 * WHAT THE FOUNDATION LACKED (added here):
 * - The member's audit trail CLASSIFIED (create / update / activate /
 *   deactivate / delete, from the before / after JSON - the server writes
 *   every user action as UPDATE), read page by page, and the CREATE entry the
 *   server files under ANOTHER entity id found by its content.
 * - SHARED SUITE ANCHORS (`findOrBuildAnchor`): the PBM Accumulator Dashboard
 *   cases share ONE suite member enrolled in three approved suite policies, and
 *   the year-start cases ONE member in one policy taken through the policy
 *   lifecycle job and the annual reset job. Every `memberEnrolled` leaves a
 *   deactivated member + retired policies behind, and a failed test restarts
 *   the worker (a beforeAll would rebuild after every finding), so an anchor is
 *   FOUND by its name (`<prefix><YYYYMMDD>...`, built today) and reused by every
 *   case and every re-run of the day; anchors of earlier days are RETIRED
 *   (policies retired, member deactivated - what memberEnrolled's teardown
 *   leaves) the next time an anchor is asked for.
 * - The two scheduled jobs moved through `memberJobClock` (always restored by
 *   the fixture; restored here as soon as the wait ends), every wait bounded.
 */

// ---- formatting -----------------------------------------------------------------------------

/** Today (Riyadh) as `YYYYMMDD` - the anchors' day tag. */
export const dayTag = (): string => riyadhDay(0).replace(/-/g, '');

/** A policy term as the dashboard prints it: 0 -> "None", else "SAR 1,000.00". */
export function sarText(value: number | null | undefined): string {
  if (!value) return 'None';
  return `SAR ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A coinsurance term as the dashboard prints it: 0 -> "None", else "20%". */
export const percentText = (value: number | null | undefined): string => (value ? `${value}%` : 'None');

/** Milliseconds of a server time: the API's ISO strings carry no zone and are UTC. */
export function utcTime(value: string | Date): number {
  if (value instanceof Date) return value.getTime();
  return Date.parse(!value.includes('T') || /([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

/** `DD/MM/YYYY` of an instant in Riyadh - the dashboard's and the accumulator page's dates. */
export function riyadhDateText(value: string | Date | null | undefined): string {
  const time = value ? utcTime(value) : NaN;
  // A text no screen shows, so a missing date never matches.
  if (Number.isNaN(time)) return '(no date)';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(time));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

/** A direct request refused for want of the right (401 / 403, or a 4xx naming the permission). */
export const refused = (answer: { status: number; text: string }): boolean => answer.status === 401 || answer.status === 403
  || (answer.status >= 400 && /permission|not authori[sz]ed|forbidden|access (is )?denied/i.test(answer.text));

/** A request as the session's user (the "bypass the screen" checks). */
export async function asSession(page: Page, method: 'POST' | 'PUT' | 'DELETE' | 'GET', path: string, data?: unknown): Promise<{ status: number; text: string }> {
  const res = await NetworkUtils.requestAsSession(page, method, path, data);
  return { status: res.status, text: res.text };
}

// ---- audit trail ----------------------------------------------------------------------------

/** What an audit entry did to the member, read from its before / after JSON. */
export type AuditKind = 'create' | 'update' | 'activate' | 'deactivate' | 'delete';

/** One entry of a member's trail with its changes and what it did. */
export interface AuditLine {
  entry: MemberAuditEntry;
  changes: Record<string, [unknown, unknown]>;
  kind: AuditKind;
}

/** Classifies an entry: the server labels every user action UPDATE, so the changed fields tell what it was. */
export function auditKindOf(entry: MemberAuditEntry, changes: Record<string, [unknown, unknown]>): AuditKind {
  if (/create/i.test(entry.actionType)) return 'create';
  if (/delete/i.test(entry.actionType)) return 'delete';
  const deleted = changes.IsDeleted ?? changes.isDeleted;
  if (deleted && deleted[1] === true) return 'delete';
  const active = changes.IsActive ?? changes.isActive;
  if (active && active[1] === false) return 'deactivate';
  if (active && active[1] === true) return 'activate';
  return 'update';
}

/** The member's own trail (GetAuditLogs `{ entityType: "Member", entityId }`), oldest first, every entry read with its before / after. */
export async function memberTrail(page: Page, memberId: string): Promise<AuditLine[]> {
  const { items } = await readMemberAuditTrail(page, memberId, {}, 200);
  const out: AuditLine[] = [];
  for (const item of items) {
    const entry = await readAuditEntry(page, item.id).catch(() => item);
    const changes = entry.beforeJson !== undefined || entry.afterJson !== undefined ? auditChanges(entry) : {};
    out.push({ entry, changes, kind: auditKindOf(entry, changes) });
  }
  return out.sort((a, b) => Date.parse(a.entry.occurredAtUtc) - Date.parse(b.entry.occurredAtUtc));
}

/** The trail read PAGE BY PAGE as a paged view reads it (`rowsPerPage` a page), with the server's total. */
export async function memberTrailPages(page: Page, memberId: string, rowsPerPage = 10, maxPages = 30): Promise<{ pages: MemberAuditEntry[][]; totalRows: number }> {
  const pages: MemberAuditEntry[][] = [];
  let totalRows = 0;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogList, {
      entityType: 'Member', entityId: memberId, actionType: null, pageNumber, rowsPerPage,
    });
    if (res.status !== 200) throw new Error(`GetAuditLogs page ${pageNumber} answered ${res.status} ${res.text.slice(0, 200)}`);
    const payload = (JSON.parse(res.text) as { payload?: { items?: MemberAuditEntry[]; totalRows?: number } }).payload ?? {};
    totalRows = payload.totalRows ?? totalRows;
    const items = payload.items ?? [];
    if (items.length === 0) break;
    pages.push(items);
    if (pages.flat().length >= totalRows) break;
  }
  return { pages, totalRows };
}

/**
 * The member's CREATE entry wherever the server filed it: the foundation found
 * it written under ANOTHER (random) entity id, so it is looked for among the
 * recent "Member" CREATE entries by the member's code / document ID in its
 * after JSON. null when none mentions the member.
 */
export async function findCreateEntryAnywhere(page: Page, member: { memberCode: string; documentId: string }): Promise<MemberAuditEntry | null> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogList, { entityType: 'Member', actionType: 'CREATE', pageNumber: 1, rowsPerPage: 25 });
  if (res.status !== 200) return null;
  const items = (JSON.parse(res.text) as { payload?: { items?: MemberAuditEntry[] } }).payload?.items ?? [];
  for (const item of items) {
    const entry = await readAuditEntry(page, item.id).catch(() => null);
    if (entry && `${entry.afterJson ?? ''}`.includes(member.documentId)) return entry;
    if (entry && `${entry.afterJson ?? ''}`.includes(member.memberCode)) return entry;
  }
  return null;
}

/** The labels of any tab on the member's view page that offers an audit history (none on 2026-11-05). */
export async function auditTabLabels(detail: MemberDetailPage): Promise<string[]> {
  return (await detail.readTabLabels()).filter((label) => /audit|history/i.test(label));
}

/** The action buttons of one Audit Logs row (by audit entry id) - "View Details" only on 2026-11-05. */
export async function auditRowActionLabels(page: Page, auditId: string): Promise<string[]> {
  return (await page.locator(`#${AUDIT_LOG_ROW.prefix}${auditId}-${AUDIT_LOG_ROW.actions}`).locator('button').allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
}

// ---- shared suite anchors (one enrolled member per purpose and day) --------------------------------

/** One policy of an anchor, by its tag. */
export interface AnchorPolicy {
  tag: string;
  policyId: string;
  policyNumber: string;
  policyNameEn: string;
  policyMemberId: string;
}

/** A shared suite member and its approved suite policies, in tag order. */
export interface SuiteAnchor {
  member: MemberRecord;
  policies: AnchorPolicy[];
  /** true when THIS call built it (false = found, built earlier today). */
  built: boolean;
}

/** What an anchor is made of. */
export interface AnchorSpec {
  /** The member's last-name prefix ("MemberDash"); the day tag and a stamp follow it. */
  prefix: string;
  /** The policies, in order: each is a NEW Individual "Al sharq" suite policy named `QA Automation Policy <tag> <stamp>`. */
  policies: ReadonlyArray<{ tag: string; spec: SuitePolicySpec }>;
  /** Runs once after a build (e.g. fixing the coverage order). */
  afterBuild?: (anchor: SuiteAnchor) => Promise<void>;
}

const hasTag = (name: string, tag: string): boolean => name.includes(` ${tag} `);

function anchorPolicies(record: MemberRecord, tags: readonly string[]): AnchorPolicy[] | null {
  const out: AnchorPolicy[] = [];
  for (const tag of tags) {
    const p = record.benefitPolicies.find((b) => hasTag(b.policyNameEn, tag) && !/inactive|retired|terminated/i.test(b.policyStatusEn));
    if (!p) return null;
    out.push({ tag, policyId: p.policyId, policyNumber: p.policyNumber, policyNameEn: p.policyNameEn, policyMemberId: p.policyMemberId });
  }
  return out;
}

/** Retires a suite anchor: its suite policies retired (or deleted), the member deactivated (deleted when nothing holds it). Never throws. */
export async function retireAnchor(page: Page, memberId: string): Promise<void> {
  const record = await readMemberOrNull(page, memberId).catch(() => null);
  if (!record || !isSuiteMember(record)) return;
  for (const p of record.benefitPolicies) {
    if (!p.policyNameEn.startsWith(SUITE_POLICY_PREFIX)) continue;
    const outcome = await discardSuitePolicy(page, p.policyId).catch(() => 'left');
    Logger.step(`[anchor] ${record.memberCode}: policy ${p.policyNumber} ${outcome}`);
  }
  Logger.step(`[anchor] ${record.memberCode} "${record.displayNameEn}": ${await discardSuiteMember(page, memberId)}`);
}

/**
 * The anchor built TODAY under `spec.prefix` (complete: active member, every
 * tagged policy approved and listed), or a new one. Anchors of earlier days and
 * incomplete ones are retired first. Throws with the application's answer when
 * a build step is refused (the caller BLOCKS).
 */
export async function findOrBuildAnchor(page: Page, spec: AnchorSpec): Promise<SuiteAnchor> {
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl);
  const todays = `${spec.prefix}${dayTag()}`;
  const tags = spec.policies.map((p) => p.tag);
  let found: SuiteAnchor | null = null;
  const candidates = (await listMemberRegister(page, { searchText: spec.prefix }, 100)).items
    .filter((m) => isSuiteMember(m) && m.englishLastName.startsWith(spec.prefix) && m.isActive);
  for (const candidate of candidates) {
    const record = candidate.englishLastName.startsWith(todays) ? await readMemberOrNull(page, candidate.id) : null;
    const policies = record ? anchorPolicies(record, tags) : null;
    if (record && policies && found === null) {
      found = { member: record, policies, built: false };
      Logger.step(`[anchor] Reusing ${record.memberCode} "${record.displayNameEn}" (${policies.map((p) => p.policyNumber).join(', ')})`);
      continue;
    }
    Logger.step(`[anchor] Retiring the earlier or incomplete anchor "${candidate.displayNameEn}"`);
    await retireAnchor(page, candidate.id);
  }
  if (found) return found;

  const member = await provisionSuiteMember(page, 'Active', { lastName: `${todays}x${memberStamp()}` });
  const enrolments: MemberEnrolment[] = [];
  try {
    for (const policy of spec.policies) {
      enrolments.push(await enrolSuiteMember(page, member.id, { policy: { ...policy.spec, nameEn: `${SUITE_POLICY_PREFIX} ${policy.tag} ${policyStamp()}` } }));
    }
    const record = await readMember(page, member.id);
    const policies = anchorPolicies(record, tags);
    if (!policies) throw new Error(`the anchor ${record.memberCode} does not list its ${tags.length} approved policies (${record.benefitPolicies.map((b) => b.policyNameEn).join(', ')})`);
    const anchor: SuiteAnchor = { member: record, policies, built: true };
    if (spec.afterBuild) await spec.afterBuild(anchor);
    Logger.step(`[anchor] Built ${record.memberCode} "${record.displayNameEn}" (${policies.map((p) => p.policyNumber).join(', ')})`);
    return { ...anchor, member: await readMember(page, member.id) };
  } catch (error) {
    for (const enrolment of enrolments.reverse()) await discardEnrolment(page, enrolment).catch(() => 'left');
    await discardSuiteMember(page, member.id);
    throw error;
  }
}

// ---- in force, scheduled jobs ---------------------------------------------------------------

/** Polls GetMember until every listed policy is in force (`isInForce`), at most `timeoutMs`. Returns the last state per policy id. */
export async function waitUntilPoliciesInForce(page: Page, memberId: string, policyIds: readonly string[], timeoutMs: number): Promise<Record<string, boolean>> {
  const deadline = Date.now() + timeoutMs;
  let state: Record<string, boolean> = {};
  for (;;) {
    const record = await readMember(page, memberId);
    state = Object.fromEntries(policyIds.map((id) => [id, record.benefitPolicies.find((b) => b.policyId === id)?.isInForce === true]));
    if (Object.values(state).every(Boolean) || Date.now() > deadline) return state;
    await page.waitForTimeout(15_000);
  }
}

/**
 * Makes an approved suite policy ACTIVE: only the daily policy lifecycle job
 * turns Future into Active, so the ADMINISTRATOR moves `Jobs.PolicyLifecycleCron`
 * to fire just after the policy's effective time (memberJobClock), waits - at
 * most the firing delay + `graceMin` minutes - and puts the job back at once.
 * Throws when the policy is still not Active (the caller BLOCKS: a precondition).
 */
export async function ensurePolicyActive(page: Page, policyId: string, clock: MemberJobClock, graceMin = 6): Promise<{ moved: boolean; cron: string }> {
  if ((await policyStatusCode(page, policyId)) === 'active') return { moved: false, cron: '' };
  const policy = await readPolicy(page, policyId);
  const fireIn = Math.max(2, Math.ceil((Date.parse(policy.effectiveDate) - Date.now()) / 60_000) + 1);
  const { cron } = await clock.moveTo('Jobs.PolicyLifecycleCron', fireIn);
  const deadline = Date.now() + (fireIn + graceMin) * 60_000;
  let status = '';
  try {
    while (Date.now() < deadline) {
      status = await policyStatusCode(page, policyId);
      if (status === 'active') break;
      await page.waitForTimeout(15_000);
    }
  } finally {
    await clock.restore('Jobs.PolicyLifecycleCron');
  }
  if (status !== 'active') {
    throw new Error(`policy ${policy.policyNumber} (effective ${policy.effectiveDate}) still reads "${status}" ${fireIn + graceMin} min after the policy lifecycle job was moved to "${cron}"`);
  }
  return { moved: true, cron };
}

/** The reset history rows of one policy (GetResetJobHistory, newest first). */
export async function resetRowsOf(page: Page, policy: { policyId: string; policyNumber: string }): Promise<ResetRun[]> {
  return (await readResetHistory(page, {}, 200)).items.filter((r) => r.policyId === policy.policyId || r.policyNumber === policy.policyNumber);
}

/** A row the SCHEDULED job wrote (any kind but the "Manual" of Reset now). */
export const isScheduledRow = (row: ResetRun): boolean => !/manual/i.test(String(row.kind ?? ''));

/** What ensureYearStartReset saw. */
export interface YearStartReset {
  /** The policy's scheduled reset rows (empty = the job left no history row). */
  rows: ResetRun[];
  /** true when THIS call moved the job (the moment of the reset was watched). */
  moved: boolean;
  cron: string;
  /** When the job was asked to fire, ISO. */
  firesAt: string;
}

/**
 * The year-start reset of the anchor's policy by the SCHEDULED job: when the
 * reset history holds no scheduled row for the policy yet, the ADMINISTRATOR
 * moves `Jobs.AccumulatorAnnualResetCron` ~2 minutes ahead (memberJobClock),
 * calls `observe` every ~10 s while waiting (at most `waitMin` minutes after the
 * firing time), and puts the job back. An empty `rows` is the application's
 * answer (the job left no row) - the case asserts it, it is not a BLOCK.
 */
export async function ensureYearStartReset(
  page: Page,
  policy: { policyId: string; policyNumber: string },
  clock: MemberJobClock,
  observe?: () => Promise<void>,
  waitMin = 6,
): Promise<YearStartReset> {
  const existing = (await resetRowsOf(page, policy)).filter(isScheduledRow);
  if (existing.length > 0) return { rows: existing, moved: false, cron: '', firesAt: '' };
  const fireIn = 2;
  const { cron } = await clock.moveTo('Jobs.AccumulatorAnnualResetCron', fireIn);
  const firesAt = new Date(Date.now() + fireIn * 60_000).toISOString();
  const deadline = Date.now() + (fireIn + waitMin) * 60_000;
  let rows: ResetRun[] = [];
  try {
    while (Date.now() < deadline) {
      if (observe) await observe().catch((e: unknown) => Logger.warn(`[reset] observing failed: ${String(e instanceof Error ? e.message : e).slice(0, 200)}`));
      rows = (await resetRowsOf(page, policy)).filter(isScheduledRow);
      if (rows.length > 0) {
        if (observe) await observe().catch(() => undefined);
        break;
      }
      await page.waitForTimeout(10_000);
    }
  } finally {
    await clock.restore('Jobs.AccumulatorAnnualResetCron');
  }
  Logger.step(`[reset] ${policy.policyNumber}: ${rows.length} scheduled reset row(s) after moving the job to "${cron}"`);
  return { rows, moved: true, cron, firesAt };
}

// ---- accumulator page, dashboard --------------------------------------------------------------

/** Picks a Benefit Period on the Member Benefit Accumulator page (by its label). */
export async function chooseBenefitPeriod(page: Page, label: string): Promise<void> {
  await chooseSelectOption(page, page.locator(`#${MEMBER_ACCUMULATOR.periodSelect}`), label);
  await page.waitForTimeout(500);
}

/** The editable controls and the button labels inside the PBM Accumulator Dashboard tab (its elements carry the `member-detail-dashboard` prefix). */
export async function dashboardControls(page: Page): Promise<{ editable: number; buttons: string[] }> {
  return page.evaluate((prefix) => {
    const roots = Array.from(document.querySelectorAll(`[id^="${prefix}"]`));
    const top = roots.filter((el) => !roots.some((other) => other !== el && other.contains(el)));
    let editable = 0;
    const buttons: string[] = [];
    for (const root of top) {
      editable += root.matches('input, textarea, select, [contenteditable="true"]') ? 1 : 0;
      editable += root.querySelectorAll('input, textarea, select, [contenteditable="true"]').length;
      for (const b of Array.from(root.querySelectorAll('button'))) buttons.push((b as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
      if (root.tagName === 'BUTTON') buttons.push((root as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
    }
    return { editable, buttons: buttons.filter((t) => t !== '') };
  }, DASHBOARD_ID_PREFIX);
}

/** The editable controls and buttons inside the Member Benefit Accumulator page (`member-accumulator`), Back excluded. */
export async function accumulatorPageControls(page: Page): Promise<{ editable: number; buttons: string[] }> {
  return page.evaluate((rootId) => {
    const root = document.getElementById(rootId);
    if (!root) return { editable: 0, buttons: [] };
    const editable = Array.from(root.querySelectorAll('input, textarea, [contenteditable="true"]')).filter((el) => !(el as HTMLElement).closest('[role="combobox"], p-select, .p-select')).length;
    const buttons = Array.from(root.querySelectorAll('button')).map((b) => (b as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
    return { editable, buttons };
  }, MEMBER_ACCUMULATOR.root);
}
