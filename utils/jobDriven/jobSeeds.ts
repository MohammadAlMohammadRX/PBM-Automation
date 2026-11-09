import * as fs from 'fs';
import * as path from 'path';
import type { Page, TestInfo } from '@playwright/test';
import { Logger } from '../Logger';
import { DISPOSABLE_NETWORK_PREFIX, listNetworks, networkStamp } from '../NetworkProvisioning';
import { DISPOSABLE_PLAN_PREFIX, listPlans, provisionPlan } from '../PlanProvisioning';
import { provisionNetwork } from '../NetworkProvisioning';
import { approvePending } from '../NetworkProvisioning';
import { riyadhDate, waitUntilInstant, type JobClock, type JobKey } from '../JobClock';
import {
  inactivateSuiteNetwork,
  inactivateSuitePlan,
  networkSnapshot,
  planSnapshot,
  type LifecycleSnapshot,
} from './lifecycle';
import {
  AUDIENCE_TYPE,
  NOTIFICATION_ACTION,
  NOTIFICATION_MODULE,
  createDefinition,
  deleteSuiteDefinition,
  inboxSince,
  listDefinitions,
} from './notifications';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';

/**
 * SEED-THEN-CHECK for the job-driven Network / Plans cases (2026-11-08).
 *
 * The lifecycle jobs are daily. Instead of every case moving a job, ONE seed
 * run per suite (`npm run seed:network-jobs` / `npm run seed:plan-jobs`, the
 * same Riyadh day as the test run) builds every record the cases need, moves
 * the job (twice: F1 activates, F2 expires - an expiry is only applied to a
 * record the job made Active first), waits (bounded) for the records to
 * change, restores the job and writes a manifest with each record's state
 * BEFORE and AFTER. Cases then CLAIM a seed of their purpose (`findJobSeed`)
 * and assert what the job did. No seed -> BLOCKED naming the seed command.
 *
 * Seed names: `<suite prefix> JobSeed <Purpose> <yyyymmdd>x<stamp>`
 * ("Automation Network JobSeed ActivateOnEffective 20261108xmw7...").
 * The manifest: reports/job-seeds/<yyyy-mm-dd>-<suite>.json (git-ignored).
 */

export type JobSeedSuite = 'network' | 'plan';

/** What one purpose is built as, and the status the job should leave it in. */
export interface PurposeRecipe {
  suite: JobSeedSuite;
  /** 'soon' = effective before F1 (the job activates it); 'tomorrow' = still in the future after the run. */
  effective: 'soon' | 'tomorrow';
  /** 'soon' = expiry between F1 and F2 (the job expires it at F2); 'tomorrow' / 'year' = not due. */
  /** 'laterToday' = 23:59 Riyadh today (skipped when the seed run ends too close to midnight). */
  expiry: 'soon' | 'laterToday' | 'tomorrow' | 'year';
  /** How far the record is taken: approved (default), only submitted, or a draft. */
  stage?: 'approved' | 'submitted' | 'draft';
  /** Inactivated (approved) between F1 and F2. */
  inactivate?: boolean;
  /** The displayed status the job run is EXPECTED to leave (the seeder records the actual). */
  expected: 'Future' | 'Active' | 'Inactive' | 'Expired';
  /** What the purpose is for. */
  use: string;
  /** Default number made. */
  count: number;
}

export const JOB_SEED_PURPOSES = {
  // ---- network (Jobs.NetworkLifecycleCron) ----
  ActivateOnEffective: { suite: 'network', effective: 'soon', expiry: 'year', expected: 'Active', count: 3, use: 'US 14129 - approved Future network whose effective time passed; F1 makes it Active (17838 17839 17841 17843 17844 17845 17846)' },
  FutureEffective: { suite: 'network', effective: 'tomorrow', expiry: 'year', expected: 'Future', count: 1, use: 'US 14129 / 14310 - effective tomorrow; the job leaves it Future (17842, 18145)' },
  ExpireAfterExpiry: { suite: 'network', effective: 'soon', expiry: 'soon', expected: 'Expired', count: 3, use: 'US 14130 / 14323 - Active at F1, expiry passes, F2 makes it Expired (17890 17893 17894 17896 17899 17901 17903, 18300 18308)' },
  ActiveExpiryTomorrow: { suite: 'network', effective: 'soon', expiry: 'tomorrow', expected: 'Active', count: 1, use: 'US 14130 - expiry tomorrow; stays Active (17892, 17893)' },
  ActiveExpiryLaterToday: { suite: 'network', effective: 'soon', expiry: 'laterToday', expected: 'Active', count: 1, use: 'US 14130 - expiry later TODAY (23:59 Riyadh); the job leaves it Active on its expiry day (17894 boundary, 17896)' },
  InactiveThenExpire: { suite: 'network', effective: 'soon', expiry: 'soon', inactivate: true, expected: 'Expired', count: 3, use: 'US 14308 - Inactive (approved) when its expiry passes; F2 makes it Expired (18112 18114 18120 18121 18124)' },
  InactiveFutureExpiry: { suite: 'network', effective: 'soon', expiry: 'year', inactivate: true, expected: 'Inactive', count: 1, use: 'US 14308 - Inactive with a future expiry; stays Inactive (18115, 18116)' },
  InactiveExpiryLaterToday: { suite: 'network', effective: 'soon', expiry: 'laterToday', inactivate: true, expected: 'Inactive', count: 1, use: 'US 14308 - Inactive, expiry later TODAY; stays Inactive (18113)' },
  ExpiredThenExtend: { suite: 'network', effective: 'soon', expiry: 'soon', expected: 'Expired', count: 2, use: 'US 14309 / 14130 - Expired after F2, EXCLUSIVE: the case extends its expiry (18131, 17895)' },
  // ---- plan (Jobs.PlanLifecycleCron) ----
  PlanActivateOnEffective: { suite: 'plan', effective: 'soon', expiry: 'year', expected: 'Active', count: 2, use: 'US 14338 - approved Future plan whose effective time passed; F1 makes it Active (19300 19301 19303 19306 19308 19310)' },
  PlanFutureEffective: { suite: 'plan', effective: 'tomorrow', expiry: 'year', expected: 'Future', count: 1, use: 'US 14338 - effective tomorrow; stays Future (19299 19302 19307)' },
  PlanUnapproved: { suite: 'plan', effective: 'soon', expiry: 'year', stage: 'submitted', expected: 'Future', count: 1, use: 'US 14338 - submitted, never approved; the job must not make it Active (19305)' },
  PlanDraft: { suite: 'plan', effective: 'soon', expiry: 'soon', stage: 'draft', expected: 'Future', count: 1, use: 'US 14156 - a draft whose dates passed; left unchanged (19087)' },
  PlanVersionExpire: { suite: 'plan', effective: 'soon', expiry: 'soon', expected: 'Expired', count: 3, use: 'US 14156 - Active at F1, expiry passes, F2 makes it Expired (19084 19086 19089-19092 19094-19097)' },
  PlanActiveExpiryTomorrow: { suite: 'plan', effective: 'soon', expiry: 'tomorrow', expected: 'Active', count: 1, use: 'US 14156 - expiry tomorrow; stays Active (19085)' },
  PlanActiveExpiryLaterToday: { suite: 'plan', effective: 'soon', expiry: 'laterToday', expected: 'Active', count: 1, use: 'US 14156 - expiry later TODAY; stays Active on its expiry day (19085)' },
  InactivePlanExpire: { suite: 'plan', effective: 'soon', expiry: 'soon', inactivate: true, expected: 'Expired', count: 2, use: 'US 14330 - Inactive (approved) when its expiry passes; F2 makes it Expired (19255 19257 19258 19261 19262)' },
  InactivePlanFutureExpiry: { suite: 'plan', effective: 'soon', expiry: 'year', inactivate: true, expected: 'Inactive', count: 1, use: 'US 14156 / 14330 - Inactive with a future expiry; untouched (19088, 19256)' },
  InactivePlanExpiryLaterToday: { suite: 'plan', effective: 'soon', expiry: 'laterToday', inactivate: true, expected: 'Inactive', count: 1, use: 'US 14330 - Inactive, expiry later TODAY; does not expire on that day (19256)' },
} as const satisfies Record<string, PurposeRecipe>;

export type JobSeedPurpose = keyof typeof JOB_SEED_PURPOSES;

/** A purpose's recipe, widened (the table is 'as const'). */
export function recipeOf(purpose: JobSeedPurpose): PurposeRecipe {
  return JOB_SEED_PURPOSES[purpose];
}

/** One seeded record, as the manifest stores it. */
export interface JobSeedRecord {
  purpose: JobSeedPurpose;
  suite: JobSeedSuite;
  id: string;
  name: string;
  /** Riyadh date the seed (and its job run) was made, YYYY-MM-DD. */
  madeOn: string;
  expected: string;
  /** Right after it was built (before F1). */
  before: LifecycleSnapshot | null;
  /** After F1 (activation run). */
  afterF1: LifecycleSnapshot | null;
  /** After the inactivation (only `inactivate` purposes). */
  afterInactivation: LifecycleSnapshot | null;
  /** After F2 (expiry run) - the final state the cases assert. */
  after: LifecycleSnapshot | null;
  /** Whether `after.status` equals `expected`. */
  reachedExpected: boolean;
  /**
   * The admin's in-app notifications about this record raised during the run by
   * the seeder's OWN definitions ("Expired - <module>" / "Inactive - <module>")
   * and the environment's "Active network " one - matched by relatedEntityId.
   */
  notifications?: SeedNotification[];
}

/** One in-app notification captured during a seed run. */
export interface SeedNotification {
  /** 'expired' / 'inactive' for the seeder's definitions, else the definition name. */
  kind: string;
  type: string;
  englishMessage: string;
  arabicMessage: string;
  createdOn: string;
  relatedEntityType: string | null;
}

/** The manifest a seed run writes. */
export interface JobSeedManifest {
  suite: JobSeedSuite;
  madeOn: string;
  jobKey: JobKey;
  /** The job's value before the run (restored after). */
  originalCron: string;
  /** The two firings (UTC ISO). */
  firings: { f1: string; f2: string };
  /** The window during which the expiring seeds' expiry passed (UTC ISO). */
  expiryAt: string;
  restored: boolean;
  /** The seeder's own notification definitions (created before the inactivations, deleted after F2). */
  definitions: { kind: 'expired' | 'inactive'; name: string; id: string; created: number; deleted: number | null }[];
  /** Whether at least one Expired notification reached the admin's inbox. */
  expiredNotificationDelivered: boolean;
  records: JobSeedRecord[];
}

/** What a seed run is asked for. */
export interface JobSeedPlan {
  suite: JobSeedSuite;
  /** The jobClock (fixture) - the run moves the job through it; the fixture restores it. */
  clock: JobClock;
  /** Per-purpose counts; default each purpose's `count` (0 skips a purpose). */
  counts?: Partial<Record<JobSeedPurpose, number>>;
}

export const JOB_SEED_DIR = path.join('reports', 'job-seeds');
export const SEED_COMMAND: Record<JobSeedSuite, string> = {
  network: 'npm run seed:network-jobs',
  plan: 'npm run seed:plan-jobs',
};

const JOB_OF: Record<JobSeedSuite, JobKey> = { network: 'Jobs.NetworkLifecycleCron', plan: 'Jobs.PlanLifecycleCron' };
const PREFIX_OF: Record<JobSeedSuite, string> = { network: DISPOSABLE_NETWORK_PREFIX, plan: DISPOSABLE_PLAN_PREFIX };

/** The name prefix of a purpose's seeds. */
export function jobSeedPrefix(purpose: JobSeedPurpose): string {
  const recipe: PurposeRecipe = JOB_SEED_PURPOSES[purpose];
  return `${PREFIX_OF[recipe.suite]} JobSeed ${purpose} `;
}

const manifestPath = (suite: JobSeedSuite, day = riyadhDate()): string => path.join(JOB_SEED_DIR, `${day}-${suite}.json`);
const claimsPath = (day = riyadhDate()): string => path.join(JOB_SEED_DIR, `${day}-claims.json`);

const snap = (suite: JobSeedSuite, page: Page, id: string): Promise<LifecycleSnapshot | null> =>
  (suite === 'network' ? networkSnapshot(page, id) : planSnapshot(page, id)).catch(() => null);

/**
 * Builds every seed of `plan.suite`, fires its lifecycle job twice through
 * `plan.clock` (F1 activation, then inactivations, then F2 after the expiries),
 * waits (bounded) for the records, restores the job and writes the manifest.
 * Never throws for a record that did not reach its expected state - that is a
 * finding the cases report; throws only when nothing could be built.
 */
export async function seedJobRecords(page: Page, plan: JobSeedPlan): Promise<JobSeedManifest> {
  const { suite, clock } = plan;
  const jobKey = JOB_OF[suite];
  const madeOn = riyadhDate();
  const day = madeOn.replace(/-/g, '');
  const purposes = (Object.keys(JOB_SEED_PURPOSES) as JobSeedPurpose[]).filter((p) => JOB_SEED_PURPOSES[p].suite === suite);
  const originalCron = await clock.read(jobKey);
  const leftovers = await deleteSeedDefinitions(page);
  if (leftovers) Logger.warn(`[seed] deleted ${leftovers} leftover seeder notification definition(s) from an earlier run`);

  const t0 = Date.now();
  // Effective far enough ahead for every record to be created first (the create
  // refuses a past effective time): 2 min + ~20 s per record. F1 a minute after;
  // inactivations right after F1; expiries 6 min after F1; F2 a minute after them.
  const total = purposes.reduce((n, p) => n + (plan.counts?.[p] ?? recipeOf(p).count), 0);
  const effectiveAt = new Date(t0 + 2 * 60_000 + total * (suite === 'plan' ? 25_000 : 15_000));
  const tomorrow = new Date(t0 + 26 * 60 * 60_000);
  const year = new Date(t0 + 365 * 86_400_000);
  // 23:59 Riyadh today = 20:59 UTC on the Riyadh calendar day.
  const laterToday = new Date(`${riyadhDate(t0)}T20:59:00.000Z`);
  const f1 = new Date(effectiveAt.getTime() + 60_000);
  f1.setUTCSeconds(0, 0);
  f1.setTime(f1.getTime() + 60_000);
  const expiryAt = new Date(f1.getTime() + 6 * 60_000);
  const mins = (at: Date): number => (at.getTime() - Date.now()) / 60_000;

  const records: JobSeedRecord[] = [];
  for (const purpose of purposes) {
    const recipe: PurposeRecipe = JOB_SEED_PURPOSES[purpose];
    const count = plan.counts?.[purpose] ?? recipe.count;
    for (let i = 0; i < count; i += 1) {
      const name = `${jobSeedPrefix(purpose)}${day}x${networkStamp()}`;
      const effective = recipe.effective === 'soon' ? effectiveAt : tomorrow;
      const expiry = recipe.expiry === 'soon' ? expiryAt : recipe.expiry === 'laterToday' ? laterToday : recipe.expiry === 'tomorrow' ? new Date(tomorrow.getTime() + 60 * 60_000) : year;
      if (recipe.expiry === 'laterToday' && laterToday.getTime() < expiryAt.getTime() + 30 * 60_000) {
        Logger.warn(`[seed] ${purpose} skipped: too close to midnight Riyadh for an expiry later today - seed before 23:00 Riyadh`);
        continue;
      }
      try {
        const stage = recipe.stage ?? 'approved';
        const built = suite === 'network'
          ? await provisionNetwork(page, { nameEn: name, effectiveInMinutes: mins(effective), expiryInMinutes: mins(expiry), draftOnly: stage === 'draft', submitOnly: stage === 'submitted' })
          : await provisionPlan(page, { nameEn: name, effectiveInMinutes: mins(effective), expiryInMinutes: mins(expiry), draftOnly: stage === 'draft', submitOnly: true });
        if (suite === 'plan' && stage === 'approved') await approvePending(page, name);
        records.push({ purpose, suite, id: built.id, name, madeOn, expected: recipe.expected, before: await snap(suite, page, built.id), afterF1: null, afterInactivation: null, after: null, reachedExpected: false });
        Logger.step(`[seed] ${purpose} "${name}" built`);
      } catch (error) {
        Logger.warn(`[seed] ${purpose} could not be built: ${(error as Error).message.slice(0, 300)}`);
      }
    }
  }
  if (records.length === 0) throw new Error(`no ${suite} job seed could be built`);
  if (Date.now() > f1.getTime() - 30_000) throw new Error(`building the seeds took too long: F1 (${f1.toISOString()}) is already due - re-run with fewer seeds`);

  // ---- F1: the activation run
  const m1 = await clock.moveTo(jobKey, mins(f1) + 0.01);
  await waitUntilInstant(page, m1.firesAt, 0);
  const activating = records.filter((r) => recipeOf(r.purpose).effective === 'soon' && (recipeOf(r.purpose).stage ?? 'approved') === 'approved');
  const f1Deadline = Date.now() + 4 * 60_000;
  while (Date.now() < f1Deadline) {
    for (const r of activating) if (r.afterF1?.status !== 'Active') r.afterF1 = await snap(suite, page, r.id);
    if (activating.every((r) => r.afterF1?.status === 'Active')) break;
    await page.waitForTimeout(5_000);
  }
  for (const r of records) if (!activating.includes(r)) r.afterF1 = await snap(suite, page, r.id);
  // Back to the original between the runs, so a crash leaves the job normal.
  await clock.restore(jobKey);

  // ---- the seeder's OWN Expired / Inactive notification definitions (audience: the
  // admin user), so the notification cases find what the run raised. Deleted after F2.
  const ADMIN_USER = { audienceTypeId: AUDIENCE_TYPE.users, referenceId: '04f76ef7-9af5-4a9f-95bd-1a37ce34b44e', referenceName: 'CareConnect Admin User' };
  const module = suite === 'network' ? NOTIFICATION_MODULE.networkManagement : NOTIFICATION_MODULE.planManagement;
  const variable = suite === 'network' ? '{{NetworkName}}' : '{{PlanName}}';
  const definitions: JobSeedManifest['definitions'] = [];
  const notifSince = new Date(t0); // from the start, so the activation notifications ("Active network ") are captured too
  for (const kind of ['expired', 'inactive'] as const) {
    const actionId = suite === 'network'
      ? (kind === 'expired' ? NOTIFICATION_ACTION.networkExpired : NOTIFICATION_ACTION.networkInactive)
      : (kind === 'expired' ? NOTIFICATION_ACTION.planExpired : NOTIFICATION_ACTION.planInactive);
    const made = await createDefinition(page, {
      name: `QA Automation Notification JobSeed ${suite} ${kind} ${day}x${networkStamp()}`,
      moduleId: module,
      actionId,
      englishMessageTemplate: `QA job seed - ${suite} ${kind}: ${variable}`,
      arabicMessageTemplate: `بذرة الأتمتة ${variable}`,
      audiences: [ADMIN_USER],
    }).catch((e: Error) => ({ answer: { status: 0, text: e.message, validationErrors: [] }, id: '', name: '' }));
    definitions.push({ kind, name: made.name, id: made.id, created: made.answer.status, deleted: null });
  }

  // ---- inactivations
  for (const r of records.filter((x) => recipeOf(x.purpose).inactivate)) {
    try {
      if (suite === 'network') await inactivateSuiteNetwork(page, { id: r.id, name: r.name }, 'Inactivated by the job seeder.');
      else await inactivateSuitePlan(page, { id: r.id, name: r.name }, 'Inactivated by the job seeder.');
    } catch (error) {
      Logger.warn(`[seed] ${r.purpose} "${r.name}" could not be inactivated: ${(error as Error).message.slice(0, 300)}`);
    }
    r.afterInactivation = await snap(suite, page, r.id);
  }

  // ---- F2: the expiry run, a minute after the expiries passed
  const f2 = new Date(Math.max(expiryAt.getTime() + 60_000, Date.now() + 100_000));
  await waitUntilInstant(page, new Date(f2.getTime() - 100_000), 0);
  const m2 = await clock.moveTo(jobKey, mins(f2) + 0.01);
  await waitUntilInstant(page, m2.firesAt, 0);
  const expiring = records.filter((r) => r.expected === 'Expired');
  const f2Deadline = Date.now() + 4 * 60_000;
  while (Date.now() < f2Deadline) {
    for (const r of expiring) if (r.after?.status !== 'Expired') r.after = await snap(suite, page, r.id);
    if (expiring.every((r) => r.after?.status === 'Expired')) break;
    await page.waitForTimeout(5_000);
  }
  const restored = await clock.restore(jobKey);
  await page.waitForTimeout(10_000);
  const inbox = await inboxSince(page, notifSince, undefined, 200).catch(() => []);
  const kindOf = (type: string): string => definitions.find((d) => d.name === type)?.kind ?? type;
  for (const r of records) {
    r.notifications = inbox.filter((n) => n.relatedEntityId === r.id).map((n) => ({
      kind: kindOf(n.type), type: n.type, englishMessage: n.englishMessage, arabicMessage: n.arabicMessage, createdOn: n.createdOn, relatedEntityType: n.relatedEntityType,
    }));
  }
  for (const d of definitions) {
    if (d.id) d.deleted = (await deleteSuiteDefinition(page, d.id).catch(() => null))?.status ?? null;
  }
  for (const r of records) {
    if (!expiring.includes(r)) r.after = await snap(suite, page, r.id);
    r.reachedExpected = r.after?.status === r.expected;
    Logger.step(`[seed] ${r.purpose} "${r.name}": ${r.before?.status} -> F1 ${r.afterF1?.status} -> ${r.after?.status} (expected ${r.expected})`);
  }

  const manifest: JobSeedManifest = {
    suite,
    madeOn,
    jobKey,
    originalCron,
    firings: { f1: m1.firesAt.toISOString(), f2: m2.firesAt.toISOString() },
    expiryAt: expiryAt.toISOString(),
    restored,
    definitions,
    expiredNotificationDelivered: records.some((r) => (r.notifications ?? []).some((n) => n.kind === 'expired')),
    records,
  };
  fs.mkdirSync(JOB_SEED_DIR, { recursive: true });
  const file = manifestPath(suite, madeOn);
  const previous: JobSeedManifest | null = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as JobSeedManifest) : null;
  // A second run the same day ADDS its records (claims look at all of them).
  const merged = previous ? { ...manifest, records: [...previous.records, ...records] } : manifest;
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  Logger.info(`[seed] manifest ${file}: ${records.length} ${suite} seeds, ${records.filter((r) => r.reachedExpected).length} reached their expected state`);
  return manifest;
}

/** The manifest of a suite's seed run on `day` (default today, Riyadh), or null. */
export function readJobSeedManifest(suite: JobSeedSuite, day = riyadhDate()): JobSeedManifest | null {
  const file = manifestPath(suite, day);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as JobSeedManifest) : null;
}

/** What a claim hands the case. */
export interface ClaimedJobSeed extends JobSeedRecord {
  /** The record's state NOW (re-read at claim time). */
  now: LifecycleSnapshot | null;
  /** The firings of the run that made it (from the manifest). */
  firings: { f1: string; f2: string } | null;
  expiryAt: string | null;
}

const readClaims = (): string[] => {
  const file = claimsPath();
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as string[]) : [];
};

/**
 * A seed of `purpose` made TODAY (Riyadh), with its before / after states and
 * its state now - or null when there is none. Read-only by default (several
 * cases may assert on the same seed); `exclusive: true` hands out a seed no
 * other case has claimed today (for a case that CHANGES it, e.g. extends its
 * expiry) and records the claim in reports/job-seeds/<day>-claims.json.
 * `index` picks the n-th seed (for cases that want different records).
 */
export async function findJobSeed(
  page: Page,
  purpose: JobSeedPurpose,
  options: { exclusive?: boolean; index?: number } = {},
): Promise<ClaimedJobSeed | null> {
  const recipe: PurposeRecipe = JOB_SEED_PURPOSES[purpose];
  const suite = recipe.suite;
  const today = riyadhDate();
  const day = today.replace(/-/g, '');
  const manifest = readJobSeedManifest(suite, today);
  let candidates: JobSeedRecord[] = (manifest?.records ?? []).filter((r) => r.purpose === purpose);
  if (candidates.length === 0) {
    // No local manifest (another machine ran the seeder): fall back to the register.
    const prefix = `${jobSeedPrefix(purpose)}${day}x`;
    const rows = suite === 'network' ? await listNetworks(page, { searchText: prefix.trim() }, 100) : await listPlans(page, { searchText: prefix.trim() });
    candidates = rows
      .filter((r) => String(r[suite === 'network' ? 'networkNameEn' : 'planNameEn'] ?? '').startsWith(prefix))
      .map((r) => ({ purpose, suite, id: String(r.id), name: String(r[suite === 'network' ? 'networkNameEn' : 'planNameEn']), madeOn: today, expected: recipe.expected, before: null, afterF1: null, afterInactivation: null, after: null, reachedExpected: false }));
  }
  if (options.exclusive) {
    const claimed = new Set(readClaims());
    candidates = candidates.filter((r) => !claimed.has(r.id));
  }
  const chosen = candidates[options.index ?? 0];
  if (!chosen) return null;
  if (options.exclusive) {
    fs.mkdirSync(JOB_SEED_DIR, { recursive: true });
    fs.writeFileSync(claimsPath(), JSON.stringify([...readClaims(), chosen.id], null, 2));
  }
  return { ...chosen, now: await snap(suite, page, chosen.id), firings: manifest?.firings ?? null, expiryAt: manifest?.expiryAt ?? null };
}

/** All of today's seeds of a purpose (for the "every eligible record in one run" cases). */
export async function findJobSeeds(page: Page, purpose: JobSeedPurpose): Promise<ClaimedJobSeed[]> {
  const out: ClaimedJobSeed[] = [];
  for (let i = 0; ; i += 1) {
    const seed = await findJobSeed(page, purpose, { index: i });
    if (!seed) break;
    out.push(seed);
  }
  return out;
}

/** findJobSeed, or BLOCKED naming the seed command (data-driven BLOCKED, never a failure). */
export async function requireJobSeed(
  page: Page,
  testInfo: TestInfo,
  purpose: JobSeedPurpose,
  options: { exclusive?: boolean; index?: number } = {},
): Promise<ClaimedJobSeed> {
  const seed = await findJobSeed(page, purpose, options).catch(() => null);
  if (seed) return seed;
  const recipe: PurposeRecipe = JOB_SEED_PURPOSES[purpose];
  return blockedByPrecondition(
    testInfo,
    `a "${purpose}" job seed made today (${recipe.use})`,
    new Error(`no unclaimed ${purpose} seed made on ${riyadhDate()} (Riyadh) - run \`${SEED_COMMAND[recipe.suite]}\` first (it moves ${JOB_OF[recipe.suite]} once and restores it)`),
  );
}

/** Name prefix of the seeder's own notification definitions. */
export const SEED_DEFINITION_PREFIX = 'QA Automation Notification JobSeed';

/**
 * Deletes every leftover seeder definition (a crashed seed run would leave an
 * ACTIVE definition notifying the admin about every expiry). Called by the seed
 * specs in `finally` and at the start of each run. Only suite definitions.
 */
export async function deleteSeedDefinitions(page: Page): Promise<number> {
  let n = 0;
  for (const d of await listDefinitions(page).catch(() => [])) {
    if (!d.name.startsWith(SEED_DEFINITION_PREFIX)) continue;
    await deleteSuiteDefinition(page, d.id).catch(() => null);
    n += 1;
  }
  return n;
}
