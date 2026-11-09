import type { Page, TestInfo } from '@playwright/test';
import { env } from '../../constants/EnvironmentConfig';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { nextFiring } from '../JobClock';
import {
  findJobSeeds,
  readJobSeedManifest,
  requireJobSeed,
  SEED_COMMAND,
  type ClaimedJobSeed,
  type JobSeedPurpose,
} from './jobSeeds';
import { planAuditTrail, type AuditEntry, type LifecycleSnapshot } from './lifecycle';
import {
  AUDIENCE_TYPE,
  NOTIFICATION_ACTION,
  NOTIFICATION_API,
  NOTIFICATION_MODULE,
  actionVariables,
  createDefinition,
  deleteSuiteDefinition,
  inboxSince,
  type InboxNotification,
} from './notifications';
import { PERMANENT_PLAN_CODE, PLAN_LIFECYCLE } from '../../data/plans/plan.data';
import { GET_APPROVALS_ENDPOINT } from '../../data/networks/seedNetworks.data';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';

/**
 * Writer P helpers (2026-11-08) - what the job-driven Plans cases (US 14156,
 * 14330, 14338) and the two plan notification cases (18963, 19361) need on top
 * of the foundation (utils/jobDriven/jobSeeds.ts, lifecycle.ts,
 * notifications.ts). No case here moves a job: it CLAIMS a seed made today by
 * `npm run seed:plan-jobs` and asserts what the job did to it.
 */

// ---- seeds -------------------------------------------------------------------------

/** Makes sure the page is on the application (the API helpers read its token). */
export async function ensureOnApp(page: Page): Promise<void> {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
}

/** A plan seed of `purpose` made today, or BLOCKED naming `npm run seed:plan-jobs`. */
export async function claimPlanSeed(
  page: Page,
  testInfo: TestInfo,
  purpose: JobSeedPurpose,
  options: { exclusive?: boolean; index?: number } = {},
): Promise<ClaimedJobSeed> {
  await ensureOnApp(page);
  return requireJobSeed(page, testInfo, purpose, options);
}

/** An instant the API wrote (with or without a zone suffix - read as UTC) as epoch ms. */
export function utcMs(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}

/** The UTC calendar date (YYYY-MM-DD) of an API instant. */
export function utcDay(value: string | null | undefined): string {
  const ms = utcMs(value);
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10);
}

/** The state a seed was in just before the expiry run: after its inactivation, else after F1. */
export const stateBeforeExpiryRun = (seed: ClaimedJobSeed): LifecycleSnapshot | null => seed.afterInactivation ?? seed.afterF1;

/** The seed's expiry instant, ms. */
export const expiryOf = (seed: ClaimedJobSeed): number => utcMs((seed.now ?? seed.after ?? seed.before)?.expiryDate);

/** The seed's effective instant, ms. */
export const effectiveOf = (seed: ClaimedJobSeed): number => utcMs((seed.now ?? seed.after ?? seed.before)?.effectiveDate);

/** A lifecycle snapshot label (Future / Active / Inactive / Expired) as the list badge shows it. */
export function badgeOf(snapshotStatus: string | null | undefined): string {
  if (snapshotStatus === 'Future') return PLAN_LIFECYCLE.pending;
  return String(snapshotStatus ?? '');
}

/** When the seed's final (expiry) run was observed - the `after` snapshot's read time, in ms. */
export function expiryRunObservedAt(seed: ClaimedJobSeed): number {
  return utcMs(seed.after?.readAt);
}

/**
 * A later run of the plan job that processed the seed AGAIN after the run that
 * produced its final state - another seed run the same day (its F1 / F2 fire
 * the job for every plan) or the daily run at the job's normal time. null when
 * none has happened yet.
 */
export function laterPlanJobRun(seed: ClaimedJobSeed): Date | null {
  const observed = expiryRunObservedAt(seed);
  if (Number.isNaN(observed)) return null;
  const manifest = readJobSeedManifest('plan');
  const later = [manifest?.firings.f1, manifest?.firings.f2]
    .map((iso) => utcMs(iso))
    .filter((ms) => !Number.isNaN(ms) && ms > observed + 30_000 && ms < Date.now() - 60_000)
    .sort((a, b) => a - b)[0];
  if (later !== undefined) return new Date(later);
  const daily = manifest?.originalCron ? nextFiring(manifest.originalCron, new Date(observed)) : null;
  if (daily && daily.getTime() < Date.now() - 2 * 60_000) return daily;
  return null;
}

/** The first seed of `purpose` the plan job processed again after its expiry run, with that run - or null. */
export async function reprocessedPlanSeed(page: Page, purpose: JobSeedPurpose): Promise<{ seed: ClaimedJobSeed; rerunAt: Date } | null> {
  await ensureOnApp(page);
  for (const seed of await findJobSeeds(page, purpose)) {
    const rerunAt = laterPlanJobRun(seed);
    if (rerunAt) return { seed, rerunAt };
  }
  return null;
}

/**
 * A seed of `purpose` the plan job processed AGAIN after its expiry run, or
 * BLOCKED (no seed today -> the seed command; no second run yet -> how to get one).
 */
export async function requireReprocessedPlanSeed(page: Page, testInfo: TestInfo, purpose: JobSeedPurpose): Promise<{ seed: ClaimedJobSeed; rerunAt: Date }> {
  await claimPlanSeed(page, testInfo, purpose);
  const found = await reprocessedPlanSeed(page, purpose);
  if (found) return found;
  return blockedByPrecondition(testInfo, `a "${purpose}" plan seed processed by a second plan-job run`, new Error(noSecondRunReason(purpose)));
}

/** Why a "run the job again" case cannot run yet. */
export function noSecondRunReason(purpose: JobSeedPurpose): string {
  return `no "${purpose}" plan seed made today has been through a SECOND run of Jobs.PlanLifecycleCron after the run that `
    + `expired it - run \`${SEED_COMMAND.plan}\` a second time today (its two firings re-process this run's Expired seeds) `
    + 'or run the case after the daily plan job (00:15 Riyadh)';
}

// ---- audit -------------------------------------------------------------------------

/** "System" in any casing - the actor of a job-made change. */
export const isSystemActor = (label: unknown): boolean => /^\s*system\s*$/i.test(String(label ?? ''));

/**
 * A status transition entry (actionType STATUS_CHANGE - the job's activation /
 * expiry rows, verified 2026-11-08); the plan feed also carries PlanVersion
 * UPDATE / SUBMITTED_FOR_APPROVAL / APPROVED rows.
 */
export const isStatusChange = (e: AuditEntry): boolean => /status/i.test(String(e.actionType ?? ''));

/** The plan's audit entries (GetPlanAuditTrail) recorded at or after `sinceMs`, newest first. */
export async function planAuditSince(page: Page, planId: string, sinceMs: number): Promise<AuditEntry[]> {
  await ensureOnApp(page);
  return (await planAuditTrail(page, planId, 100)).filter((e) => utcMs(e.occurredAtUtc) >= sinceMs - 1_000);
}

/** The plan's audit entries recorded between two instants (inclusive), newest first. */
export async function planAuditBetween(page: Page, planId: string, fromMs: number, toMs: number): Promise<AuditEntry[]> {
  await ensureOnApp(page);
  return (await planAuditTrail(page, planId, 100)).filter((e) => {
    const at = utcMs(e.occurredAtUtc);
    return at >= fromMs - 1_000 && at <= toMs + 1_000;
  });
}

/** An entry as one line, for messages. */
export const describeEntry = (e: AuditEntry): string => `${String(e.actionType ?? '?')} by ${String(e.actorLabel ?? '?')} at ${String(e.occurredAtUtc ?? '?')}`;

// ---- status derivation (US 14338) ------------------------------------------------------

/**
 * The status label the plan list SHOULD show for a plan, derived from its
 * underlying data at instant `at` (the last job run): never approved ->
 * "Not Live" (the app's Draft label); expiry passed -> Expired; effective date
 * ahead -> Pending; inactivated -> Inactive; otherwise Active. The suite payer
 * ("Al sharq") is Active throughout.
 */
export function derivedPlanLabel(s: LifecycleSnapshot, at: number): string {
  if (!s.code || !PERMANENT_PLAN_CODE.test(s.code)) return PLAN_LIFECYCLE.notLive;
  if (utcMs(s.expiryDate) <= at) return PLAN_LIFECYCLE.expired;
  if (utcMs(s.effectiveDate) > at) return PLAN_LIFECYCLE.pending;
  if (!s.isActive) return PLAN_LIFECYCLE.inactive;
  return PLAN_LIFECYCLE.active;
}

// ---- notifications (18963, 19361) --------------------------------------------------------

const asRecords = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.items)) return v.items as Record<string, unknown>[];
    const nested = Object.values(v).find((x) => Array.isArray(x));
    if (nested) return nested as Record<string, unknown>[];
  }
  return [];
};

/**
 * The audience entry for one user, found by display name among the Notification
 * Center's user candidates (POST GetAudienceCandidates `{ typeCode: 'users' }`).
 * Throws when the user is not offered.
 */
export async function userAudience(page: Page, displayName: string): Promise<{ audienceTypeId: string; referenceId: string; referenceName: string }> {
  await ensureOnApp(page);
  const res = await NetworkUtils.postAsSession(page, NOTIFICATION_API.audienceCandidates, { typeCode: 'users' });
  if (res.status >= 300) throw new Error(`GetAudienceCandidates answered ${res.status} ${res.text.slice(0, 200)}`);
  const rows = asRecords((JSON.parse(res.text) as { payload?: unknown }).payload);
  // GetAudienceCandidates answers `{ id, nameEn, nameAr }` (foundation notes); the
  // admin's id is the one the network seeder addressed successfully on 2026-11-08.
  const nameOf = (r: Record<string, unknown>): string =>
    String(r.nameEn ?? r.name ?? r.referenceName ?? r.fullName ?? r.displayName ?? r.englishName ?? r.userName ?? '');
  const ADMIN_ID = '04f76ef7-9af5-4a9f-95bd-1a37ce34b44e';
  const match = rows.find((r) => nameOf(r).trim() === displayName)
    ?? (/admin/i.test(displayName) ? rows.find((r) => String(r.id ?? '') === ADMIN_ID) : undefined);
  const id = match ? String(match.id ?? match.referenceId ?? match.userId ?? '') : '';
  if (!id) throw new Error(`the Notification Center offers no user "${displayName}" as an audience (${rows.length} candidates)`);
  return { audienceTypeId: AUDIENCE_TYPE.users, referenceId: id, referenceName: displayName };
}

/** A suite notification definition the case created (deleted in its cleanup). */
export interface SuiteDefinition {
  id: string;
  name: string;
  createdAt: Date;
}

/**
 * Creates an ACTIVE suite definition ("QA Automation Notification ...") for the
 * plan module's "needs approval" action, addressed to `reviewerName`, with every
 * variable the action offers in its templates. Throws when it is refused.
 */
export async function createPlanApprovalDefinition(page: Page, reviewerName: string): Promise<SuiteDefinition> {
  await ensureOnApp(page);
  const audience = await userAudience(page, reviewerName);
  const vars = (await actionVariables(page, NOTIFICATION_ACTION.planNeedApprove)).map((v) => `{{${v.name}}}`).join(' ');
  const created = await createDefinition(page, {
    // "Need to Approve - Plan" (…0220) sits under Approval Management in GetOptions,
    // not Plan Management: the app saved the mismatched pair but never fired it (2026-11-08).
    moduleId: NOTIFICATION_MODULE.approvalManagement,
    actionId: NOTIFICATION_ACTION.planNeedApprove,
    englishMessageTemplate: `A plan change awaits your approval: ${vars}`.trim(),
    arabicMessageTemplate: `تغيير خطة بانتظار موافقتك: ${vars}`.trim(),
    description: 'Created by an automated plan notification case; deleted after it.',
    isActive: true,
    audiences: [audience],
  });
  if (created.answer.status >= 300 || !created.id) {
    throw new Error(`CreateDefinition answered ${created.answer.status} ${created.answer.text.slice(0, 200)}`);
  }
  return { id: created.id, name: created.name, createdAt: new Date() };
}

/** createPlanApprovalDefinition, or BLOCKED naming what refused it. */
export async function requirePlanApprovalDefinition(page: Page, testInfo: TestInfo, reviewerName: string): Promise<SuiteDefinition> {
  try {
    return await createPlanApprovalDefinition(page, reviewerName);
  } catch (error) {
    return blockedByPrecondition(testInfo, `an active notification definition for "plan needs approval" addressed to "${reviewerName}"`, error);
  }
}

/** Deletes a suite definition (best effort; the helper refuses a non-suite one). */
export async function removeSuiteDefinition(page: Page, definition: SuiteDefinition): Promise<void> {
  await deleteSuiteDefinition(page, definition.id).catch((e: Error) => Logger.warn(`[notif] could not delete "${definition.name}": ${e.message}`));
}

/**
 * The signed-in user's notifications from `definition` created at or after
 * `since` that concern `plan` - by its id (relatedEntityId) or its name in
 * either message.
 */
export async function planNotifications(
  page: Page,
  definition: SuiteDefinition,
  since: Date,
  plan: { id: string; name: string },
): Promise<InboxNotification[]> {
  await ensureOnApp(page);
  const items = await inboxSince(page, since, definition.name, 200);
  // A "Need to Approve - Plan" notification points at the plan's APPROVAL
  // REQUEST (relatedEntityType "ApprovalRequest"), not the plan, and its
  // {{PlanName}} renders blank (2026-11-08) - so the plan's own requests count too.
  const requests = items.some((n) => n.relatedEntityType === 'ApprovalRequest') ? await approvalRequestIds(page, plan.name) : new Set<string>();
  return items.filter((n) =>
    n.relatedEntityId === plan.id
    || (n.relatedEntityId !== null && requests.has(n.relatedEntityId))
    || `${n.englishMessage} ${n.arabicMessage}`.includes(plan.name));
}

/** Every approval request (any status: pending, withdrawn, decided) raised for the entity named `name`. */
export async function approvalRequestIds(page: Page, name: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
    const res = await NetworkUtils.postAsSession(page, GET_APPROVALS_ENDPOINT, { pageNumber, rowsPerPage: 200 });
    if (res.status >= 300) break;
    const body = JSON.parse(res.text) as { payload?: Record<string, { items?: Record<string, unknown>[] }> };
    const rows = Object.values(body.payload ?? {}).find((v) => Array.isArray(v?.items))?.items ?? [];
    for (const r of rows) if (String(r.entityNameEn ?? '') === name) ids.add(String(r.id));
    if (rows.length < 200) break;
  }
  return ids;
}

/** The notifications above that are still LISTED for the user (not archived). */
export const stillListed = (items: InboxNotification[]): InboxNotification[] => items.filter((n) => !n.isArchived);
