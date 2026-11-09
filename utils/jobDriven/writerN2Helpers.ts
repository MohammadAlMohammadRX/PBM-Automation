import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { env } from '../../constants/EnvironmentConfig';
import { NOTIFICATION_CENTER, NOTIFICATION_CENTER_ROUTE, PRIORITY_ID_FRAGMENT } from '../../constants/jobDriven/writerN2Ids';
import { SETTINGS_JOBS, buttonSelector } from '../../constants/ElementIds';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import {
  DISPOSABLE_NETWORK_PREFIX,
  approvePending,
  deleteNetworkById,
  provisionNetwork,
  readNetwork,
  submitNetwork,
  type ProvisionedNetwork,
} from '../NetworkProvisioning';
import {
  cronToRiyadhPicker,
  jobIdFragment,
  waitUntilInstant,
  type JobAnswer,
  type JobClock,
  type JobKey,
  type JobMove,
} from '../JobClock';
import { approvedNetworkAt, networkSnapshot, waitForNetworkStatus, type LifecycleSnapshot } from './lifecycle';
import {
  AUDIENCE_TYPE,
  NOTIFICATION_ACTION,
  NOTIFICATION_API,
  NOTIFICATION_MODULE,
  SUITE_DEFINITION_PREFIX,
  actionVariables,
  createDefinition,
  deleteSuiteDefinition,
  listDefinitions,
  readDefinition,
  readInbox,
  type InboxNotification,
} from './notifications';
import { findJobSeeds, type ClaimedJobSeed } from './jobSeeds';
import { CREATE_NETWORK_ENDPOINT, HMO_NETWORK_TYPE_ID } from '../../data/networks/seedNetworks.data';

/**
 * Writer N2 helpers (2026-11-08) - the network status job's schedule (US 14310)
 * and the Expired / Inactive network notifications (US 14323).
 *
 * Built on the foundation (utils/JobClock.ts, utils/jobDriven/*): the job is
 * moved ONLY through the admin's `jobClock` fixture, which restores every moved
 * key in teardown; a screen save of the schedule is preceded by
 * `rememberJob` so the fixture also restores what the screen changed.
 */

export const NETWORK_JOB: JobKey = 'Jobs.NetworkLifecycleCron';

type Answer = { status: number; text: string; validationErrors: string[] };

const minutesUntil = (at: Date): number => (at.getTime() - Date.now()) / 60_000;

// ---- the schedule screen (System Settings > Settings > General) -------------------------

/**
 * Makes the jobClock remember a job's CURRENT value (an unchanged save) so its
 * teardown puts it back even when the case changes it through the screen or a
 * direct request rather than through `moveTo` / `set`. Returns that value.
 */
export async function rememberJob(clock: JobClock, key: JobKey = NETWORK_JOB): Promise<string> {
  const current = await clock.read(key);
  const answer = await clock.set(key, current);
  if (answer.status >= 300) throw new Error(`re-saving ${key}="${current}" answered ${answer.status} ${answer.text.slice(0, 200)}`);
  return current;
}

/** "02:00" (Riyadh, 24 h) -> the picker's text "02:00 AM". */
export function pickerText(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`"${hhmm}" is not HH:mm`);
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The read view's line for a daily Riyadh time ("Every day at 2:00 am (Riyadh)"), as a pattern tolerant of the leading zero. */
export function readViewPattern(hhmm: string): RegExp {
  const [hm, ampm] = pickerText(hhmm).split(' ');
  const [h, m] = hm.split(':');
  return new RegExp(`every day at 0?${Number(h)}:${m}\\s*${ampm}`, 'i');
}

/** The description the read view labels the network job with (Foundation-Notes). */
export const NETWORK_JOB_LABEL = 'Medical network status update schedule';

/**
 * The network job's time picker for what SettingsPage does not cover: typing
 * into it (the control ignores typing) and whether it is editable. The drawer
 * is opened by SettingsPage; ids from SETTINGS_JOBS.
 */
export class JobTimeField extends BasePage {
  constructor(page: Page, private readonly key: JobKey = NETWORK_JOB) {
    super(page);
  }

  private async input(): Promise<Locator> {
    const host = this.byId(SETTINGS_JOBS.time(jobIdFragment(this.key)));
    await expect(host, `the ${this.key} time picker should be shown`).toBeVisible({ timeout: Timeouts.default });
    const tag = await host.evaluate((e) => e.tagName).catch(() => '');
    return tag === 'INPUT' ? host : host.locator('input').first();
  }

  /** Whether the picker can be changed (shown and enabled; it is read-only to typing by design). */
  async isEditable(): Promise<boolean> {
    return (await this.input()).isEnabled().catch(() => false);
  }

  /** Types into the picker (what an administrator typing "25:99" does) and reports what it then shows. */
  async typeTime(text: string): Promise<string> {
    const input = await this.input();
    await input.click();
    await input.press('Control+A').catch(() => undefined);
    await input.pressSequentially(text, { delay: 30 }).catch(() => undefined);
    await this.page.keyboard.press('Escape');
    return (await input.inputValue()).trim();
  }
}

/** What the screen should show for a stored daily CRON. */
export const shownFor = (cron: string): string => cronToRiyadhPicker(cron);

// ---- firing the network job around the case's own networks ----------------------------

/** A suite network approved to go live `effectiveInMinutes` from now (reads Future until the job runs). */
export async function approvedNetworkSoon(page: Page, effectiveInMinutes: number, expiryInMinutes?: number): Promise<ProvisionedNetwork> {
  const effectiveAt = new Date(Date.now() + effectiveInMinutes * 60_000);
  return approvedNetworkAt(page, {
    effectiveAt,
    ...(expiryInMinutes === undefined ? {} : { expiryAt: new Date(Date.now() + expiryInMinutes * 60_000) }),
  });
}

/** Moves the network job to fire in the first whole minute at or after `notBefore` (+ a small margin). */
export async function fireNetworkJobAfter(clock: JobClock, notBefore: Date): Promise<JobMove> {
  const at = new Date(Math.max(notBefore.getTime() + 60_000, Date.now() + 100_000));
  return clock.moveTo(NETWORK_JOB, minutesUntil(at) + 0.02);
}

/** What `expiredByJob` produced. */
export interface ExpiredByJob {
  network: ProvisionedNetwork;
  activeAfterF1: LifecycleSnapshot;
  expiredAfterF2: LifecycleSnapshot;
  /** When F2 fired (the Expired transition). */
  f2: Date;
  reachedActive: boolean;
  reachedExpired: boolean;
}

/**
 * A FRESH suite network taken Future -> Active -> Expired by two short moves
 * of the network job (F1 after its effective time, F2 after its expiry), each
 * restored as soon as it fired. For the notification cases whose template must
 * be configured BEFORE the Expired transition (a seed expired before the case
 * ran). ~8 minutes. The job applies an expiry only to a record it made Active
 * first (Foundation-Notes), hence two firings.
 */
export async function expiredByJob(page: Page, clock: JobClock): Promise<ExpiredByJob> {
  const t0 = Date.now();
  const effectiveAt = new Date(t0 + 150_000);
  const expiryAt = new Date(t0 + 330_000);
  const network = await approvedNetworkAt(page, { effectiveAt, expiryAt });
  const m1 = await fireNetworkJobAfter(clock, effectiveAt);
  await waitUntilInstant(page, m1.firesAt, 0);
  const active = await waitForNetworkStatus(page, network.id, 'Active', { timeoutMs: 3 * 60_000 });
  await clock.restore(NETWORK_JOB);
  const m2 = await fireNetworkJobAfter(clock, expiryAt);
  await waitUntilInstant(page, m2.firesAt, 0);
  const expired = await waitForNetworkStatus(page, network.id, 'Expired', { timeoutMs: 3 * 60_000 });
  await clock.restore(NETWORK_JOB);
  return { network, activeAfterF1: active.value, expiredAfterF2: expired.value, f2: m2.firesAt, reachedActive: active.ok, reachedExpired: expired.ok };
}

// ---- the shared "skip" firing (18145 / 18148 / 18150) ---------------------------------

/** One firing over a mix of the case's own networks: eligible, unapproved, draft, and no effective date. */
export interface SkipRun {
  move: JobMove;
  /** Approved, effective before the firing - the job should make them Active. */
  eligible: ProvisionedNetwork[];
  /** Submitted, never approved, effective before the firing - an unmet activation precondition. */
  unapproved: ProvisionedNetwork;
  /** A draft whose effective time passed - never submitted. */
  draft: ProvisionedNetwork;
  /** The create answer for a network with NO effective date, and its id when the application accepted it. */
  missingEffective: { answer: Answer; id: string | null };
  /** Snapshots before the firing and after it (by network id). */
  before: Record<string, LifecycleSnapshot | null>;
  after: Record<string, LifecycleSnapshot | null>;
  /** The network job's value right after the firing was restored. */
  restored: boolean;
}

let skipRunMemo: Promise<SkipRun> | null = null;

const snapOrNull = (page: Page, id: string): Promise<LifecycleSnapshot | null> => networkSnapshot(page, id).catch(() => null);

/** POST CreateNetwork with `effectiveDate: null` (the precondition of 18148). */
async function createWithoutEffectiveDate(page: Page): Promise<{ answer: Answer; id: string | null }> {
  const stamp = Date.now().toString(36);
  const answer = await NetworkUtils.postAsSession(page, CREATE_NETWORK_ENDPOINT, {
    networkNameEn: `${DISPOSABLE_NETWORK_PREFIX} NoEffective ${stamp}`,
    networkNameAr: `شبكة بدون تاريخ ${stamp}`,
    networkTypeId: HMO_NETWORK_TYPE_ID,
    descriptionEn: 'Created by an automated case without an effective date.',
    descriptionAr: 'وصف',
    effectiveDate: null,
    expiryDate: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  });
  let id: string | null = null;
  if (answer.status < 300) {
    try {
      id = String((JSON.parse(answer.text) as { payload?: { id?: string } }).payload?.id ?? '') || null;
    } catch {
      id = null;
    }
  }
  Logger.step(`[N2] CreateNetwork without an effective date answered ${answer.status}${id ? ` (id ${id})` : ''}`);
  return { answer, id };
}

async function buildSkipRun(page: Page, clock: JobClock): Promise<SkipRun> {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
  const effectiveAt = new Date(Date.now() + 150_000);
  const eligible = [
    await approvedNetworkAt(page, { effectiveAt }),
    await approvedNetworkAt(page, { effectiveAt }),
  ];
  const unapproved = await provisionNetwork(page, { effectiveInMinutes: minutesUntil(effectiveAt), submitOnly: true });
  const draft = await provisionNetwork(page, { effectiveInMinutes: minutesUntil(effectiveAt), draftOnly: true });
  const missingEffective = await createWithoutEffectiveDate(page);
  const ids = [...eligible.map((n) => n.id), unapproved.id, draft.id, ...(missingEffective.id ? [missingEffective.id] : [])];
  const before: Record<string, LifecycleSnapshot | null> = {};
  for (const id of ids) before[id] = await snapOrNull(page, id);

  const move = await fireNetworkJobAfter(clock, effectiveAt);
  await waitUntilInstant(page, move.firesAt, 0);
  for (const n of eligible) await waitForNetworkStatus(page, n.id, 'Active', { timeoutMs: 3 * 60_000 });
  // The skipped records are read once more after the eligible ones moved - the same run has finished with them.
  await page.waitForTimeout(15_000);
  const restored = await clock.restore(NETWORK_JOB);
  const after: Record<string, LifecycleSnapshot | null> = {};
  for (const id of ids) after[id] = await snapOrNull(page, id);

  for (const id of [draft.id, ...(missingEffective.id ? [missingEffective.id] : [])]) {
    const record = await readNetwork(page, id).catch(() => null);
    if (record?.isPendingCreate) await deleteNetworkById(page, id).catch(() => undefined);
  }
  return { move, eligible, unapproved, draft, missingEffective, before, after, restored };
}

/**
 * The ONE firing the 18145 / 18148 / 18150 cases share (first caller builds
 * and fires; the others reuse the result in the same worker). The first
 * caller's jobClock restores the job in its teardown as well.
 */
export function sharedSkipRun(page: Page, clock: JobClock): Promise<SkipRun> {
  if (!skipRunMemo) {
    skipRunMemo = buildSkipRun(page, clock).catch((error: unknown) => {
      skipRunMemo = null;
      throw error;
    });
  }
  return skipRunMemo;
}

/** System audit log rows since an instant (POST GetAuditLogs) - where a job run would leave a trace. */
export async function auditRowsSince(page: Page, since: Date, criteria: Record<string, unknown> = {}, rows = 200): Promise<Record<string, unknown>[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogList, { pageNumber: 1, rowsPerPage: rows, ...criteria });
  if (res.status >= 300) return [];
  const payload = (JSON.parse(res.text) as { payload?: unknown }).payload as Record<string, unknown> | undefined;
  const items = (Array.isArray((payload as { items?: unknown })?.items)
    ? (payload as { items: Record<string, unknown>[] }).items
    : (Object.values(payload ?? {}).find((v) => v && typeof v === 'object' && Array.isArray((v as { items?: unknown }).items)) as { items: Record<string, unknown>[] } | undefined)?.items) ?? [];
  return items.filter((r) => {
    const at = Date.parse(String(r.occurredAtUtc ?? r.createdOn ?? r.timestamp ?? ''));
    return Number.isNaN(at) || at >= since.getTime() - 60_000;
  });
}

/** The job-run record a lifecycle job execution log would hold (none exists in this build - Foundation-Notes). */
export async function findJobRunLog(page: Page, since: Date): Promise<Record<string, unknown> | null> {
  const rows = await auditRowsSince(page, since);
  return rows.find((r) => /job|lifecycle/i.test(`${String(r.entityType ?? '')} ${String(r.actionType ?? '')}`) && !/SystemSetting/i.test(String(r.entityType ?? ''))) ?? null;
}

// ---- notification definitions (the bilingual templates) --------------------------------

export type NetworkEvent = 'expired' | 'inactive';

const ACTION_OF: Record<NetworkEvent, string> = {
  expired: NOTIFICATION_ACTION.networkExpired,
  inactive: NOTIFICATION_ACTION.networkInactive,
};

/** A recipient as a definition's audience entry. */
export type Audience = { audienceTypeId: string; referenceId: string; referenceName: string };

/** The administrator the probe saw as "CareConnect Admin User" - the fallback when the candidates cannot be read. */
const ADMIN_USER_FALLBACK: Audience = {
  audienceTypeId: AUDIENCE_TYPE.users,
  referenceId: '04f76ef7-9af5-4a9f-95bd-1a37ce34b44e',
  referenceName: 'CareConnect Admin User',
};

const firstString = (o: Record<string, unknown>, keys: string[]): string =>
  keys.map((k) => o[k]).find((v) => typeof v === 'string' && v.length > 0) as string | undefined ?? '';

/** Audience candidates (POST GetAudienceCandidates `{ typeCode }`). */
async function audienceCandidates(page: Page, typeCode: 'users' | 'roles'): Promise<{ id: string; name: string; raw: Record<string, unknown> }[]> {
  const res = await NetworkUtils.postAsSession(page, NOTIFICATION_API.audienceCandidates, { typeCode });
  if (res.status >= 300) return [];
  const payload = (JSON.parse(res.text) as { payload?: unknown }).payload;
  const items = (Array.isArray(payload) ? payload : ((payload as { items?: unknown[] } | undefined)?.items ?? [])) as Record<string, unknown>[];
  return items.map((raw) => ({
    id: firstString(raw, ['id', 'referenceId', 'userId', 'roleId', 'value']),
    name: firstString(raw, ['name', 'referenceName', 'displayName', 'fullName', 'userName', 'label', 'englishName']),
    raw,
  }));
}

/** The signed-in administrator as a "users" audience entry. */
export async function adminAudience(page: Page): Promise<Audience> {
  const users = await audienceCandidates(page, 'users').catch(() => []);
  const wanted = env.adminUsername.toLowerCase();
  const match = users.find((u) => wanted && JSON.stringify(u.raw).toLowerCase().includes(wanted))
    ?? users.find((u) => u.id === ADMIN_USER_FALLBACK.referenceId);
  return match?.id ? { audienceTypeId: AUDIENCE_TYPE.users, referenceId: match.id, referenceName: match.name || match.id } : ADMIN_USER_FALLBACK;
}

/** The ids of the definitions this worker created (deleted by `cleanupDefinitions`). */
const createdDefinitions = new Set<string>();

/** What a suite definition for a network event is made of. */
export interface NetworkDefinitionSpec {
  english: string;
  arabic: string;
  audiences?: Audience[];
  isActive?: boolean;
}

/** A suite definition for "Expired - Network" / "Inactive - Network" (registered for cleanup). */
export interface SuiteDefinition {
  id: string;
  name: string;
  event: NetworkEvent;
  answer: Answer;
  spec: NetworkDefinitionSpec;
}

/** Creates a suite definition (the Definitions drawer's own call) - the answer is returned, never asserted here. */
export async function createNetworkDefinition(page: Page, event: NetworkEvent, spec: NetworkDefinitionSpec): Promise<SuiteDefinition> {
  const audiences = spec.audiences ?? [await adminAudience(page)];
  const { answer, id, name } = await createDefinition(page, {
    name: `${SUITE_DEFINITION_PREFIX} N2 ${event} ${Date.now().toString(36)}`,
    moduleId: NOTIFICATION_MODULE.networkManagement,
    actionId: ACTION_OF[event],
    englishMessageTemplate: spec.english,
    arabicMessageTemplate: spec.arabic,
    isActive: spec.isActive ?? true,
    audiences,
  });
  if (id) createdDefinitions.add(id);
  return { id, name, event, answer, spec: { ...spec, audiences } };
}

/**
 * Updates a suite definition's templates (PUT UpdateDefinition - the drawer's
 * Save on an existing definition) with the definition's `concurrencyStamp`.
 */
export async function updateDefinitionTemplates(page: Page, def: SuiteDefinition, english: string, arabic: string): Promise<Answer> {
  const current = await readDefinition(page, def.id);
  return NetworkUtils.requestAsSession(page, 'PUT', NOTIFICATION_API.updateDefinition, {
    id: def.id,
    concurrencyStamp: current?.concurrencyStamp ?? null,
    name: def.name,
    description: current?.description ?? null,
    isActive: true,
    englishMessageTemplate: english,
    arabicMessageTemplate: arabic,
    notesTemplate: current?.notesTemplate ?? null,
    moduleNameId: NOTIFICATION_MODULE.networkManagement,
    moduleActionId: ACTION_OF[def.event],
    audiences: (def.spec.audiences ?? []).map((a) => ({ ...a, appliesToAllFacilities: true, facilities: [] })),
    variableDefinitions: await actionVariables(page, ACTION_OF[def.event]),
  });
}

/** Deletes every suite definition this worker created (afterEach). */
export async function cleanupDefinitions(page: Page): Promise<void> {
  for (const id of [...createdDefinitions]) {
    await deleteSuiteDefinition(page, id).catch((e: Error) => Logger.warn(`[N2] could not delete definition ${id}: ${e.message.slice(0, 200)}`));
    createdDefinitions.delete(id);
  }
}

/** Active definitions for a network event that the suite did NOT create (team configuration). */
export async function foreignDefinitionsFor(page: Page, event: NetworkEvent): Promise<{ id: string; name: string }[]> {
  const label = event === 'expired' ? /expired\s*-\s*network/i : /inactive\s*-\s*network/i;
  return (await listDefinitions(page)).filter((d) => d.isActive && label.test(d.moduleActionEn ?? '') && !d.name.startsWith(SUITE_DEFINITION_PREFIX));
}

// ---- reading notifications ----------------------------------------------------------------

/** The notifications about one record created at or after `since` (optionally of given definition names). */
export async function notificationsFor(page: Page, entityId: string, since: Date, types?: string[]): Promise<InboxNotification[]> {
  return (await readInbox(page, 200))
    .filter((n) => n.relatedEntityId === entityId && Date.parse(n.createdOn) >= since.getTime() - 60_000)
    .filter((n) => !types || types.includes(n.type))
    .sort((a, b) => Date.parse(a.createdOn) - Date.parse(b.createdOn));
}

/** Polls the inbox until a notification about `entityId` (of `types`) arrives; null after the timeout. */
export async function waitForNotification(
  page: Page,
  entityId: string,
  since: Date,
  options: { types?: string[]; timeoutMs?: number } = {},
): Promise<InboxNotification | null> {
  const deadline = Date.now() + (options.timeoutMs ?? 2 * 60_000);
  for (;;) {
    const found = (await notificationsFor(page, entityId, since, options.types).catch(() => []))[0];
    if (found) return found;
    if (Date.now() > deadline) return null;
    await page.waitForTimeout(8_000);
  }
}

/** The priority a notification carries (any field named like "priority"), or null when it has none. */
export function priorityOf(n: InboxNotification | null): string | null {
  if (!n) return null;
  const raw = n as unknown as Record<string, unknown>;
  const key = Object.keys(raw).find((k) => /priority|importance|severity/i.test(k));
  return key ? String(raw[key]) : null;
}

/** A message rendered from a template: no `{{Variable}}` left, and the network's name in it. */
export function renderedFor(message: string, networkName: string): boolean {
  return !/\{\{\s*\w+\s*\}\}/.test(message) && message.includes(networkName);
}

/** Arabic letters present. */
export const hasArabic = (s: string): boolean => /[؀-ۿ]/.test(s);

/**
 * The seed run's Expired notification about `seed`. BLOCKED when the seed run
 * produced NO Expired notification for ANY of the day's expiring seeds - the
 * precondition "a template configured for the Network Expired event" did not
 * hold during the seeder's expiry firing (F2), so nothing about delivery was
 * observed. Null (the case fails) when other seeds were notified but this one
 * was not.
 */
export async function seedExpiredNotification(page: Page, testInfo: TestInfo, seed: ClaimedJobSeed): Promise<InboxNotification | null> {
  const since = seed.firings?.f2 ? new Date(Date.parse(seed.firings.f2) - 60_000) : new Date(Date.now() - 24 * 60 * 60_000);
  const own = (await notificationsFor(page, seed.id, since))[0] ?? null;
  if (own) return own;
  const expiring: ClaimedJobSeed[] = [];
  for (const purpose of ['ExpireAfterExpiry', 'InactiveThenExpire', 'ExpiredThenExtend'] as const) expiring.push(...(await findJobSeeds(page, purpose).catch(() => [])));
  for (const other of expiring) {
    if ((await notificationsFor(page, other.id, since)).length > 0) return null;
  }
  return blockedByPrecondition(
    testInfo,
    'an active "Expired - Network" notification definition while the network job seeder expired its networks',
    new Error(
      `none of today's ${expiring.length} expiring network seeds has a notification in the administrator's inbox: no Expired - Network `
        + 'definition was active at the seeder\'s F2 firing (none existed on 2026-11-08). Create one (audience: the administrator) before '
        + '`npm run seed:network-jobs`, or have the seeder create and delete it around F2',
    ),
  );
}

// ---- Active suite networks to inactivate ---------------------------------------------------

/** Fresh networks made Active by the last pool firing, not yet handed to a case (per worker). */
const activePool: { id: string; name: string }[] = [];

/** How many fresh networks one pool firing makes Active (the Inactive cases of folder 44 take one each). */
export const ACTIVE_POOL_SIZE = 5;

/**
 * A FRESH, Active suite network the case may inactivate - PROVISIONED, never
 * found in the register ("provision, don't find": long-lived anchors such as the
 * Facility suite's "Automation Network Facility Anchor ..." must not be touched).
 *
 * Approval never makes a network Active (the job does, Foundation-Notes), so the
 * first caller builds a pool of ACTIVE_POOL_SIZE approved networks (default suite
 * pharmacy, effective ~2 min ahead), moves the network job once through the
 * administrator's jobClock, waits for them to go Active and restores the job;
 * later callers take the next one. BLOCKED when none turns Active.
 */
export async function activeSuiteNetwork(page: Page, clock: JobClock, testInfo: TestInfo): Promise<{ id: string; name: string }> {
  try {
    if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
    if (activePool.length === 0) {
      const effectiveAt = new Date(Date.now() + 150_000);
      const built: ProvisionedNetwork[] = [];
      for (let i = 0; i < ACTIVE_POOL_SIZE; i += 1) built.push(await approvedNetworkAt(page, { effectiveAt }));
      const move = await fireNetworkJobAfter(clock, effectiveAt);
      await waitUntilInstant(page, move.firesAt, 0);
      for (const n of built) {
        const active = await waitForNetworkStatus(page, n.id, 'Active', { timeoutMs: 3 * 60_000 });
        if (active.ok) activePool.push({ id: n.id, name: n.name });
      }
      await clock.restore(NETWORK_JOB);
      Logger.step(`[N2] ${activePool.length} of ${built.length} fresh suite networks made Active by the job at ${move.firesAt.toISOString()}`);
    }
    const network = activePool.shift();
    if (!network) throw new Error('none of the freshly provisioned networks turned Active at the moved network job');
    const now = await networkSnapshot(page, network.id);
    if (now.status !== 'Active') throw new Error(`the fresh network "${network.name}" reads ${now.status}, not Active`);
    Logger.step(`[N2] Using the fresh Active suite network "${network.name}"`);
    return network;
  } catch (error) {
    return blockedByPrecondition(testInfo, 'a fresh Active suite network (provisioned, made Active by the network job)', error);
  }
}

/** Reactivates a SUITE network: SetNetworkActive `{ id }` -> submit -> approve. Returns the staging answer. */
export async function reactivateSuiteNetwork(page: Page, network: { id: string; name: string }): Promise<Answer> {
  if (!network.name.startsWith(DISPOSABLE_NETWORK_PREFIX)) throw new Error(`refusing to activate "${network.name}": not a suite network`);
  const staged = await NetworkUtils.postAsSession(page, ApiEndpoints.networkSetActive, { id: network.id });
  if (staged.status < 300) {
    await submitNetwork(page, network.id, network.name);
    await approvePending(page, network.name);
  }
  Logger.step(`[N2] Reactivated suite network "${network.name}" (staging answered ${staged.status})`);
  return staged;
}

/**
 * Saves a SUITE network's edit form UNCHANGED (PUT UpdateNetwork with its own
 * values) and, when that stages a version, sends it for approval and approves
 * it - "re-open the record and click Save again".
 */
export async function resaveUnchanged(page: Page, network: { id: string; name: string }): Promise<Answer> {
  if (!network.name.startsWith(DISPOSABLE_NETWORK_PREFIX)) throw new Error(`refusing to edit "${network.name}": not a suite network`);
  const r = await readNetwork(page, network.id);
  const answer = await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.networkUpdate, {
    networkNameEn: r.networkNameEn,
    networkNameAr: r.networkNameAr,
    networkTypeId: r.networkTypeId,
    payerId: r.payerId,
    descriptionEn: r.descriptionEn,
    descriptionAr: r.descriptionAr,
    effectiveDate: r.effectiveDate,
    expiryDate: r.expiryDate,
    id: r.id,
    concurrencyStamp: r.concurrencyStamp,
    confirmRevertToDraft: true,
  });
  if (answer.status < 300 && (await readNetwork(page, network.id)).hasDraft) {
    await submitNetwork(page, network.id, network.name);
    await approvePending(page, network.name);
  }
  return answer;
}

// ---- the Notification Center screen ------------------------------------------------------

/** System Settings > Notification Center > Definitions. */
export class NotificationDefinitionsScreen extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async openDefinitions(): Promise<void> {
    await this.goto(NOTIFICATION_CENTER_ROUTE);
    await this.byId(NOTIFICATION_CENTER.definitionsTab).click();
    await expect(this.byId(NOTIFICATION_CENTER.addDefinition), 'the Definitions tab should offer "Add"').toBeVisible({ timeout: Timeouts.default });
  }

  /** Searches the definitions list (the id sits on the input or its wrapper). */
  async search(term: string): Promise<void> {
    const host = this.byId(NOTIFICATION_CENTER.search);
    const tag = await host.evaluate((e) => e.tagName).catch(() => '');
    const input = tag === 'INPUT' ? host : host.locator('input').first();
    await input.fill(term);
    await this.waitForPageReady();
  }

  /** Whether a definition's row is listed (any element whose id starts with its row prefix). */
  async isListed(definitionId: string): Promise<boolean> {
    return this.page
      .locator(`[id^="${NOTIFICATION_CENTER.rowPrefix}${definitionId}"]`)
      .first()
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
  }

  /** Opens the "Add" drawer and reports which of its controls are shown. */
  async openAddDrawer(): Promise<{ name: boolean; module: boolean; action: boolean; priority: boolean }> {
    // The id sits on the <p-button> host; its inner <button> starts DISABLED
    // while the page loads, and a click on the host then does nothing (18304,
    // 2026-11-08) - so wait for the inner button to be usable and click it.
    const add = this.page.locator(buttonSelector(NOTIFICATION_CENTER.addDefinition)).first();
    await expect(add, '"Create" should become usable').toBeEnabled({ timeout: Timeouts.default });
    await add.click();
    await expect(this.byId(NOTIFICATION_CENTER.nameInput), 'the definition drawer should open').toBeVisible({ timeout: Timeouts.default });
    return {
      name: await this.byId(NOTIFICATION_CENTER.nameInput).isVisible(),
      module: await this.byId(NOTIFICATION_CENTER.moduleSelect).isVisible().catch(() => false),
      action: await this.byId(NOTIFICATION_CENTER.actionSelect).isVisible().catch(() => false),
      priority: (await this.page.locator(`[id^="${NOTIFICATION_CENTER.drawer}"][id*="${PRIORITY_ID_FRAGMENT}"]`).count()) > 0,
    };
  }

  async closeDrawer(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.byId(NOTIFICATION_CENTER.nameInput).waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  }
}

/** The module actions GetOptions offers (for "the event-type selector offers Network Expired / Inactive"). */
export async function notificationActionOptions(page: Page): Promise<string> {
  const res = await NetworkUtils.postAsSession(page, NOTIFICATION_API.options, {});
  return res.status < 300 ? res.text : '';
}

export type { JobAnswer };
