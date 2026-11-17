import type { Locator, Page } from '@playwright/test';
import { test as pwTest } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import type { NotificationBell, BellRow } from '../../pages/notification/InboxBells';
import type { DefinitionDrawer } from '../../pages/notification/Drawers';
import type { SuiteDefinitions } from '../../fixtures/notificationModule.fixture';
import type { PolicyModuleFixtures } from '../../fixtures/policyModule.fixture';
import { blockedByPrecondition, type TestSteps } from '../../fixtures/testStatus.fixture';
import { env } from '../../constants/EnvironmentConfig';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { NC_DIALOG, NC_TOAST, NOTIFICATION_DETAIL } from '../../constants/notification/notificationIds';
import {
  APPROVAL_ACTION,
  DETAIL_EXTRA,
  NC_MODULE,
  STATUS_ACTION,
  type ApprovalKind,
  type NotifiedEntity,
  type StatusKind,
} from '../../constants/notification/writerEIds';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import {
  riyadhDate,
  riyadhTime,
  utcDate,
  waitFor,
  waitUntilInstant,
  type JobClock,
  type JobMove,
  type WaitForResult,
} from '../JobClock';
import {
  LIFECYCLE_JOB,
  actionVariables,
  listDefinitions,
  myNotifications,
  ncStamp,
  userAudience,
  type AnnouncementAudience,
  type InboxNotification,
} from './notificationApi';
import { readNotificationSettings } from './notificationSettings';
import {
  deleteNetworkById,
  pendingRequestId,
  provisionNetwork,
  readNetwork,
  type ProvisionedNetwork,
} from '../NetworkProvisioning';
import { approvedNetworkAt, inactivateSuiteNetwork, networkSnapshot } from '../jobDriven/lifecycle';
import {
  inactivatePolicy,
  inactivationReasons,
  policyStatusCode,
  publishPolicyChange,
  type ProvisionedPolicy,
} from '../PolicyProvisioning';
import {
  SUITE_FORMULARY_PREFIX,
  approveFormulary,
  deactivationReasons,
  discardSuiteFormulary,
  findFormularyByName,
  provisionSuiteFormulary,
  formularyStatusCode,
  setFormularyActive,
  submitFormulary,
  type FormularyState,
  type ProvisionedFormulary,
  type SuiteFormularySpec,
} from '../FormularyProvisioning';

/**
 * Writer E helpers (Notification Center folders 01 payer status, 02 payer
 * status messages, 11 policy, 12 network, 13 formulary status notifications,
 * 21 Review Notification Approval Request) - 2026-11-11.
 *
 * HOW A STATUS NOTIFICATION IS OBSERVED. Nothing is notified without an ACTIVE
 * App Notification (definition) for the action (foundation notes). Each case
 * saves its OWN suite definition (`suiteDefinitions`, prefix
 * "QA Automation Notification", audience careconnect and/or maalmohammad only)
 * whose messages carry a unique MARKER and every variable of the action as
 * `[Name={{Name}}]` - so a delivered message reads back as name/value pairs
 * (`templateValues`) and is found in the huge careconnect inbox by its marker
 * and its definition name (InboxNotification.type = the definition name).
 * Records are the suite's own (networks "Automation Network ...", policies
 * "QA Automation Policy ...", formularies "QA Automation Formulary ...")
 * moved through their lifecycle by the entity's job (`jobClock`, restored
 * after every firing and again at teardown).
 */

// ---- the entity variable ------------------------------------------------------------

/**
 * The app's name for the {{Entity}} placeholder of each entity (the AC's
 * "{{Entity}} resolves to ..."): PayerName and NetworkName were read from
 * GetActionVariables on 2026-11-11; PolicyNumber / FormularyName follow the
 * AC. `entityVariable` falls back to the action's first REQUIRED variable.
 */
export const ENTITY_VARIABLE: Readonly<Record<NotifiedEntity, string>> = {
  payer: 'PayerName',
  network: 'NetworkName',
  policy: 'PolicyNumber',
  formulary: 'FormularyName',
};

// ---- probe definitions ----------------------------------------------------------------

/** A suite definition whose messages carry a marker and every variable of its action. */
export interface ProbeDefinition {
  id: string;
  name: string;
  /** Unique word in both messages (bell search / inbox search). */
  marker: string;
  actionId: string;
  /** Every variable of the action (GetActionVariables), in the app's order. */
  variables: string[];
  /** The REQUIRED ones. */
  required: string[];
  english: string;
  arabic: string;
}

const ARABIC_PREFIX = 'اختبار';

/** `<marker> [A={{A}}] [B={{B}}]` and the Arabic twin. */
export function probeTemplates(marker: string, variables: readonly string[]): { english: string; arabic: string } {
  const body = variables.map((v) => `[${v}={{${v}}}]`).join(' ');
  return { english: `${marker} ${body}`.trim(), arabic: `${ARABIC_PREFIX} ${marker} ${body}`.trim() };
}

/** The `[Name=value]` pairs of a delivered message. */
export function templateValues(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of message.matchAll(/\[([A-Za-z]+)=([^\]]*)\]/g)) out[m[1]] = m[2].trim();
  return out;
}

/** Whether a message still holds an unresolved `{{Variable}}`. */
export const hasPlaceholder = (message: string): boolean => /\{\{\s*\w+\s*\}\}/.test(message);

/** Arabic letters present. */
export const hasArabic = (s: string): boolean => /[؀-ۿ]/.test(s);

/**
 * Saves an ACTIVE suite definition for `actionId` (BLOCKED by the fixture when
 * refused). Audience: careconnect unless `audiences` names others (only
 * careconnect, maalmohammad or a suite role - never a real role).
 */
export async function probeDefinition(
  page: Page,
  defs: SuiteDefinitions,
  spec: { moduleId: string; actionId: string; label: string; audiences?: AnnouncementAudience[]; isActive?: boolean },
): Promise<ProbeDefinition> {
  const vars = await actionVariables(page, spec.actionId);
  const variables = vars.map((v) => v.name);
  const required = vars.filter((v) => v.isRequired).map((v) => v.name);
  const marker = `QAE${ncStamp()}`;
  const t = probeTemplates(marker, variables);
  const made = await defs.create({
    name: defs.newName(spec.label),
    moduleId: spec.moduleId,
    actionId: spec.actionId,
    englishMessageTemplate: t.english,
    arabicMessageTemplate: t.arabic,
    description: 'Writer E probe definition (deleted at teardown).',
    isActive: spec.isActive ?? true,
    ...(spec.audiences ? { audiences: spec.audiences } : {}),
  });
  Logger.step(`[E] Definition "${made.name}" for action ${spec.actionId}: variables [${variables.join(', ')}]`);
  return { id: made.id, name: made.name, marker, actionId: spec.actionId, variables, required, english: t.english, arabic: t.arabic };
}

/** An ACTIVE suite definition for one entity status action. */
export function statusDefinition(page: Page, defs: SuiteDefinitions, entity: NotifiedEntity, kind: StatusKind, audiences?: AnnouncementAudience[]): Promise<ProbeDefinition> {
  return probeDefinition(page, defs, { moduleId: NC_MODULE[entity], actionId: STATUS_ACTION[entity][kind], label: `E ${entity} ${kind}`, audiences });
}

/** ACTIVE suite definitions for several status actions of one entity. */
export async function statusDefinitions(page: Page, defs: SuiteDefinitions, entity: NotifiedEntity, kinds: readonly StatusKind[]): Promise<Record<StatusKind, ProbeDefinition>> {
  const out = {} as Record<StatusKind, ProbeDefinition>;
  for (const kind of kinds) out[kind] = await statusDefinition(page, defs, entity, kind);
  return out;
}

/** ACTIVE suite definitions for approval actions of one entity (module Approval Management). */
export async function approvalDefinitions(
  page: Page,
  defs: SuiteDefinitions,
  entity: NotifiedEntity,
  kinds: readonly ApprovalKind[],
  audiences: AnnouncementAudience[],
): Promise<Record<ApprovalKind, ProbeDefinition>> {
  const out = {} as Record<ApprovalKind, ProbeDefinition>;
  for (const kind of kinds) {
    out[kind] = await probeDefinition(page, defs, { moduleId: NC_MODULE.approvalManagement, actionId: APPROVAL_ACTION[entity][kind], label: `E ${entity} ${kind}`, audiences });
  }
  return out;
}

/** The variable that stands for {{Entity}} in this definition. */
export function entityVariable(def: ProbeDefinition, entity: NotifiedEntity): string {
  return def.variables.find((v) => v === 'Entity' || v === ENTITY_VARIABLE[entity]) ?? def.required[0] ?? '';
}

/** The definition's variable names with the entity variable written as "Entity", sorted - comparable with the AC's lists. */
export function specNames(def: ProbeDefinition, entity: NotifiedEntity): string[] {
  const ev = entityVariable(def, entity);
  return def.variables.map((v) => (v === ev ? 'Entity' : v)).sort();
}

/** Whether the suite definition is still listed (GetDefinitions). */
export async function definitionListed(page: Page, name: string): Promise<boolean> {
  return (await listDefinitions(page)).some((d) => d.name === name);
}

// ---- the inbox --------------------------------------------------------------------------

/** What a notification is about: the record id, or a name / number its message carries. */
export interface EntityRef {
  id: string;
  names: string[];
}

export const networkRef = (n: { id: string; name: string }): EntityRef => ({ id: n.id, names: [n.name] });
export const policyRef = (p: ProvisionedPolicy): EntityRef => ({ id: p.id, names: [p.policyNumber, p.nameEn].filter(Boolean) });
export const formularyRef = (f: ProvisionedFormulary): EntityRef => ({ id: f.id, names: [f.nameEn, f.code ?? ''].filter(Boolean) });

export function isAbout(n: InboxNotification, ref: EntityRef): boolean {
  if (n.relatedEntityId && n.relatedEntityId === ref.id) return true;
  return ref.names.some((x) => x && (n.englishMessage.includes(x) || n.arabicMessage.includes(x)));
}

/**
 * The signed-in user's notifications raised by `def` (type = its name): the
 * inbox searched for the marker, plus the latest 100 (in case the server-side
 * search does not cover the message text).
 */
export async function definitionNotifications(page: Page, def: ProbeDefinition): Promise<InboxNotification[]> {
  const searched = await myNotifications(page, { search: def.marker, rows: 100 }).catch(() => ({ items: [] as InboxNotification[] }));
  const latest = await myNotifications(page, { rows: 100 }).catch(() => ({ items: [] as InboxNotification[] }));
  const byId = new Map<string, InboxNotification>();
  for (const n of [...searched.items, ...latest.items]) if (n.type === def.name) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) => Date.parse(a.createdOn) - Date.parse(b.createdOn));
}

/** The definition's notifications about one record. */
export async function notificationsAbout(page: Page, def: ProbeDefinition, ref: EntityRef): Promise<InboxNotification[]> {
  return (await definitionNotifications(page, def)).filter((n) => isAbout(n, ref));
}

/** Polls until the definition notified about `ref`; null after `timeoutMs`. */
export async function waitForNotificationAbout(page: Page, def: ProbeDefinition, ref: EntityRef, timeoutMs = 150_000): Promise<InboxNotification | null> {
  const found = await waitFor(page, () => notificationsAbout(page, def, ref), (list) => list.length > 0, {
    timeoutMs,
    intervalMs: 5_000,
    describe: `a "${def.name}" notification about ${ref.names[0] ?? ref.id}`,
  });
  return found.ok ? found.value[0] : null;
}

/**
 * Watches for `watchMs` and answers every notification of `def` about `ref`
 * that arrived (the "nothing is sent" cases - a full window, not one read).
 */
export async function notificationsDuring(page: Page, def: ProbeDefinition, ref: EntityRef, watchMs = 75_000): Promise<InboxNotification[]> {
  const result = await waitFor(page, () => notificationsAbout(page, def, ref), (list) => list.length > 0, { timeoutMs: watchMs, intervalMs: 10_000 });
  return result.value ?? [];
}

/** Watches several definitions at once for `watchMs`; answers "<definition>: <message>" for every notification about `ref`. */
export async function anyNotificationsAbout(page: Page, defs: readonly ProbeDefinition[], ref: EntityRef, watchMs = 75_000): Promise<string[]> {
  const read = async (): Promise<string[]> => {
    const out: string[] = [];
    for (const def of defs) out.push(...(await notificationsAbout(page, def, ref)).map((n) => `${def.name}: ${n.englishMessage}`));
    return out;
  };
  return (await waitFor(page, read, (list) => list.length > 0, { timeoutMs: watchMs, intervalMs: 10_000 })).value ?? [];
}

/** A notification for a failure message: its English text quoted, or "no notification arrived". */
export const describeNotification = (n: InboxNotification | null | undefined): string => (n ? `"${n.englishMessage}"` : 'no notification arrived');

/** The definition's `[Name=value]` pairs in a notification (English text). */
export const valuesOf = (n: InboxNotification | null): Record<string, string> => templateValues(n?.englishMessage ?? '');

/** Opens the bell, searches for the definition's marker and answers its row (null when not listed). */
export async function bellRowFor(bell: NotificationBell, def: ProbeDefinition): Promise<BellRow | null> {
  await bell.open();
  await bell.search(def.marker);
  return (await bell.readRows()).find((r) => r.type === def.name || r.text.includes(def.marker)) ?? null;
}

/** The bell row of one inbox item, read from the open drawer (null when not shown). */
export async function bellRowOfItem(bell: NotificationBell, itemId: string): Promise<BellRow | null> {
  return (await bell.readRows()).find((r) => r.id === itemId) ?? null;
}

/** The badge text the bell shows for `n` unread ("9+" above nine; '' for none). */
export const badgeFor = (n: number): string => (n <= 0 ? '' : n > 9 ? '9+' : String(n));

// ---- settings / time --------------------------------------------------------------------

const DAY = 86_400_000;

/** The global "Reminder before" (days) - read, never changed by Writer E. */
export async function reminderDays(page: Page): Promise<number> {
  const raw = (await readNotificationSettings(page))['NotifiConfig.ExpiryReminderBeforeDays'];
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 1) throw new Error(`NotifiConfig.ExpiryReminderBeforeDays reads "${String(raw)}"`);
  return days;
}

/** The instant the Riyadh calendar day `days` after the Riyadh day of `from` starts. */
function riyadhDayStart(from: number, days: number): number {
  return Date.parse(`${riyadhDate(from)}T00:00:00+03:00`) + days * DAY;
}

/**
 * An expiry on the Riyadh calendar day `days` days ahead and at most `days`
 * whole days ahead - INSIDE a `days`-day window whether the app counts calendar
 * days, whole days or started days. Normally `days` days minus 30 minutes; in
 * the first half hour of a Riyadh day that would fall on the day before, so it
 * is then the first second of the target day (full run 2026-11-11: dates built
 * near midnight landed one calendar day off).
 */
export const inWindowExpiry = (days: number, from = Date.now()): Date =>
  new Date(Math.max(from + days * DAY - 30 * 60_000, riyadhDayStart(from, days) + 1_000));

/**
 * An expiry on the Riyadh calendar day `days` days ahead and at least `days`
 * whole days ahead - OUTSIDE a (days-1)-day window under every counting.
 * Normally `days` days plus 30 minutes; in the last half hour of a Riyadh day
 * that would spill into the next day (21946, 2026-11-11: "expected 8, found 9"),
 * so it is then the last second of the target day.
 */
export const outOfWindowExpiry = (days: number, from = Date.now()): Date =>
  new Date(Math.min(from + days * DAY + 30 * 60_000, riyadhDayStart(from, days + 1) - 1_000));

/** Riyadh calendar days from `earlier` to `later`. */
export function riyadhDayDiff(later: Date | string, earlier: Date | string): number {
  const d = (x: Date | string): number => Date.parse(`${riyadhDate(x)}T00:00:00Z`);
  return Math.round((d(later) - d(earlier)) / DAY);
}

/** The ways a date may be written in a message (Riyadh and UTC day; ISO, d/m/y, m/d/y). */
export function dayForms(at: Date | string): string[] {
  const out = new Set<string>();
  for (const iso of [riyadhDate(at), utcDate(at)]) {
    const [y, m, d] = iso.split('-');
    out.add(iso);
    out.add(`${d}/${m}/${y}`);
    out.add(`${m}/${d}/${y}`);
    out.add(`${Number(d)}/${Number(m)}/${y}`);
    out.add(`${y}/${m}/${d}`);
  }
  return [...out];
}

/** Whether `value` names the day of `at`. */
export const sameDay = (value: string | undefined, at: Date | string): boolean => Boolean(value) && dayForms(at).some((f) => (value as string).includes(f));

/** "dd/MM/yyyy HH:mm" in Riyadh time (the Notification Detail's Requested On). */
export function riyadhStamp(at: Date | string): string {
  const [y, m, d] = riyadhDate(at).split('-');
  return `${d}/${m}/${y} ${riyadhTime(at)}`;
}

/** Minutes between a shown "dd/MM/yyyy HH:mm" (Riyadh) and `at`; NaN when it does not parse. */
export function minutesFrom(shown: string, at: Date): number {
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(shown);
  if (!m) return Number.NaN;
  const instant = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+03:00`);
  return Math.abs(instant - at.getTime()) / 60_000;
}

// ---- jobs ----------------------------------------------------------------------------------

/**
 * Moves the entity's lifecycle job to fire in the first whole minute after
 * `notBefore` (and at least ~100 s from now), waits until it has fired (+10 s)
 * and answers the move. The job is NOT restored here - call `restoreJob` once
 * the case has read what it needed (the fixture restores at teardown anyway).
 */
export async function fireJob(page: Page, clock: JobClock, entity: NotifiedEntity, notBefore: Date = new Date(), graceMs = 10_000): Promise<JobMove> {
  // moveTo fires in the minute `now + minutes` falls in (seconds dropped), so the
  // target is rounded UP to a whole minute first - otherwise the firing could
  // land up to 59 s before `notBefore + 60 s` (a few seconds after an effective time).
  const at = Math.ceil(Math.max(notBefore.getTime() + 60_000, Date.now() + 100_000) / 60_000) * 60_000;
  const move = await clock.moveTo(LIFECYCLE_JOB[entity], (at - Date.now()) / 60_000 + 0.05);
  await waitUntilInstant(page, move.firesAt, graceMs);
  return move;
}

export function restoreJob(clock: JobClock, entity: NotifiedEntity): Promise<boolean> {
  return clock.restore(LIFECYCLE_JOB[entity]);
}

/** A record's displayed status as a lower-case code: future / active / inactive / expired / draft. */
export async function statusOf(page: Page, entity: 'network' | 'policy' | 'formulary', id: string): Promise<string> {
  let raw = '';
  if (entity === 'network') raw = (await networkSnapshot(page, id)).status;
  if (entity === 'policy') raw = await policyStatusCode(page, id);
  if (entity === 'formulary') raw = await formularyStatusCode(page, id);
  const code = raw.toLowerCase();
  if (code === 'pending') return 'future';
  if (code === 'notlive') return 'draft';
  return code;
}

/** Polls until the record reads `wanted` (bounded; never throws). */
export function waitForStatus(page: Page, entity: 'network' | 'policy' | 'formulary', id: string, wanted: string, timeoutMs = 3 * 60_000): Promise<WaitForResult<string>> {
  return waitFor(page, () => statusOf(page, entity, id), (s) => s === wanted, { timeoutMs, intervalMs: 5_000, describe: `${entity} ${id} reads ${wanted}` });
}

/**
 * After a firing that made the record Active: waits for `def`'s reminder about
 * `ref`, and when none came, fires the job again (up to `extraFirings` times,
 * restored after each) and waits again. Whether "Expiring Soon" goes out in
 * the run that activated a record or only in a later run was never observed,
 * so both are given a chance.
 */
export async function awaitReminder(
  page: Page,
  clock: JobClock,
  entity: NotifiedEntity,
  def: ProbeDefinition,
  ref: EntityRef,
  options: { extraFirings?: number; waitMs?: number } = {},
): Promise<{ notification: InboxNotification | null; extraFirings: Date[] }> {
  const waitMs = options.waitMs ?? 75_000;
  const extraFirings: Date[] = [];
  let n = await waitForNotificationAbout(page, def, ref, waitMs);
  for (let i = 0; !n && i < (options.extraFirings ?? 1); i += 1) {
    const move = await fireJob(page, clock, entity, new Date());
    extraFirings.push(move.firesAt);
    n = await waitForNotificationAbout(page, def, ref, waitMs);
    await restoreJob(clock, entity);
  }
  return { notification: n, extraFirings };
}

/** Fires the job after `notBefore`, waits until every record reads `wanted`, restores the job. Answers the firing and each record's last status. */
export async function fireAndAwait(
  page: Page,
  clock: JobClock,
  entity: 'network' | 'policy' | 'formulary',
  ids: readonly string[],
  wanted: string,
  notBefore: Date,
): Promise<{ firedAt: Date; statuses: Record<string, string>; ok: boolean }> {
  const move = await fireJob(page, clock, entity, notBefore);
  const statuses: Record<string, string> = {};
  for (const id of ids) statuses[id] = (await waitForStatus(page, entity, id, wanted)).value ?? '';
  await restoreJob(clock, entity);
  return { firedAt: move.firesAt, statuses, ok: ids.every((id) => statuses[id] === wanted) };
}

// ---- building records ----------------------------------------------------------------------

type PolicyIn = PolicyModuleFixtures['policyIn'];

/** An APPROVED suite network going live at `times.effectiveAt` (default 150 s from now) - Future until the network job runs. */
export async function networkGoingLive(page: Page, times: { effectiveAt?: Date; expiryAt?: Date } = {}): Promise<{ network: ProvisionedNetwork; effectiveAt: Date; expiryAt: Date | null }> {
  const effectiveAt = times.effectiveAt ?? new Date(Date.now() + 150_000);
  const network = await approvedNetworkAt(page, { effectiveAt, ...(times.expiryAt ? { expiryAt: times.expiryAt } : {}) });
  return { network, effectiveAt, expiryAt: times.expiryAt ?? null };
}

/** An APPROVED (Future) suite policy going live at `times.effectiveAt` (default 150 s from now), grace 0, expiring at `times.expiryAt`. */
export async function policyGoingLive(policyIn: PolicyIn, times: { expiryAt: Date; effectiveAt?: Date }): Promise<{ policy: ProvisionedPolicy; effectiveAt: Date }> {
  const effectiveAt = times.effectiveAt ?? new Date(Date.now() + 150_000);
  const policy = await policyIn('Future', { effectiveDate: effectiveAt.toISOString(), expiryDate: times.expiryAt.toISOString(), gracePeriodDays: 0 });
  return { policy, effectiveAt };
}

/** A never-submitted (Draft, "Not Live") suite policy whose dates would otherwise qualify for the job. */
export function draftPolicyGoingLive(policyIn: PolicyIn, times: { expiryAt: Date; effectiveAt: Date }): Promise<ProvisionedPolicy> {
  return policyIn('Draft', { effectiveDate: times.effectiveAt.toISOString(), expiryDate: times.expiryAt.toISOString(), gracePeriodDays: 0 });
}

/** A future instant `ms` from now. */
export const inMs = (ms: number): Date => new Date(Date.now() + ms);

/** A transport failure (the request never got an answer) - worth one more try, unlike a refusal. */
const TRANSPORT_ERROR = /socket hang up|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|EPIPE|EAI_AGAIN|Timeout \d+ms exceeded|timed out/i;

/** Suite formularies built by `suiteFormulary` (half-built ones too) - discarded by `discardSuiteFormularies` (afterEach). */
const builtFormularies: string[] = [];

/**
 * Builds a suite formulary in `state` (what the `formularyIn` fixture does)
 * but retries ONCE, under a new name, when an attempt dies on a transport
 * error (rerun1 2026-11-12, 21946: "apiRequestContext.fetch: socket hang up"
 * while provisioning - not an environment block). A refusal by the server, or
 * a second failure, is BLOCKED exactly as the fixture does it. Every attempt's
 * formulary (even half built) is kept for `discardSuiteFormularies`.
 */
export async function suiteFormulary(page: Page, state: FormularyState, spec: SuiteFormularySpec = {}, attempts = 2): Promise<ProvisionedFormulary> {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
  let cause: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const nameEn = `${SUITE_FORMULARY_PREFIX} ${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    try {
      const formulary = await provisionSuiteFormulary(page, state, { ...spec, nameEn });
      builtFormularies.push(formulary.id);
      return formulary;
    } catch (error) {
      cause = error;
      const partial = await findFormularyByName(page, nameEn).catch(() => null);
      if (partial) builtFormularies.push(partial.id);
      const message = error instanceof Error ? error.message : String(error);
      const transport = TRANSPORT_ERROR.test(message);
      Logger.warn(`[E] Formulary ${state} attempt ${attempt}/${attempts} failed (${transport ? 'transport error - retrying' : 'refused'}): ${message.split('\n')[0]}`);
      if (!transport) break;
    }
  }
  return blockedByPrecondition(pwTest.info(), `a formulary in state ${state} ${JSON.stringify(spec).slice(0, 160)}`, cause);
}

/** afterEach: discards every formulary `suiteFormulary` built, newest first. Never throws. */
export async function discardSuiteFormularies(page: Page): Promise<void> {
  for (const id of builtFormularies.splice(0).reverse()) await discardSuiteFormulary(page, id).catch(() => undefined);
}

/**
 * An APPROVED (Future) suite formulary going live `effectiveInMinutes` from
 * now and expiring at `expiryAt` - the FORMULARY job makes it Active (a first
 * approval always reads Future) and later Expired. Used where the expiry is
 * close: the approval-path Active state stages a benefit configuration two
 * days out, which a formulary expiring sooner cannot hold.
 */
export async function formularyGoingLive(page: Page, expiryAt: Date, effectiveInMinutes = 2): Promise<{ formulary: ProvisionedFormulary; effectiveAt: Date }> {
  const formulary = await suiteFormulary(page, 'Future', { effectiveInMinutes, expiryDate: expiryAt.toISOString() });
  return { formulary, effectiveAt: new Date(formulary.effectiveDate) };
}

/** What `formularyExpiredByJob` observed. */
export interface FormularyExpiryRun {
  /** The formulary read Active after the first formulary-job firing (the precondition of an Expired notification). */
  activated: boolean;
  /** It read Expired after the firing past its expiry (only tried when activated). */
  expired: boolean;
  /** What each firing left, in words (for messages / block reasons). */
  detail: string;
}

/**
 * Takes a Future suite formulary (`formularyGoingLive`) through the formulary
 * job: one firing after its effective time (must make it Active) and, only
 * when it did, one after its expiry (must make it Expired). Full run
 * 2026-11-11: the job left every such formulary Future (21944 / 21945 / 21949),
 * so callers BLOCK the Expired part when `activated` is false - the approval
 * path cannot give an Active formulary that expires within minutes.
 */
export async function formularyExpiredByJob(page: Page, clock: JobClock, formulary: ProvisionedFormulary, effectiveAt: Date, expiryAt: Date): Promise<FormularyExpiryRun> {
  const f1 = await fireAndAwait(page, clock, 'formulary', [formulary.id], 'active', effectiveAt);
  const first = `effective ${effectiveAt.toISOString()}, after the formulary job at ${f1.firedAt.toISOString()} it read "${f1.statuses[formulary.id] || '?'}"`;
  if (!f1.ok) return { activated: false, expired: false, detail: first };
  const f2 = await fireAndAwait(page, clock, 'formulary', [formulary.id], 'expired', expiryAt);
  return { activated: true, expired: f2.ok, detail: `${first}; expiry ${expiryAt.toISOString()}, after the job at ${f2.firedAt.toISOString()} it read "${f2.statuses[formulary.id] || '?'}"` };
}

/** The Expired notification `def` raised about the formulary - null without waiting when the run did not expire it. */
export async function expiredNotification(page: Page, def: ProbeDefinition, formulary: ProvisionedFormulary, run: FormularyExpiryRun): Promise<InboxNotification | null> {
  return run.expired ? waitForNotificationAbout(page, def, formularyRef(formulary)) : null;
}

/** An ACTIVE suite formulary (approval path, ~3 min), optionally expiring at `expiryAt`. */
export function activeFormulary(page: Page, expiryAt?: Date): Promise<ProvisionedFormulary> {
  return suiteFormulary(page, 'Active', { effectiveInMinutes: 2, ...(expiryAt ? { expiryDate: expiryAt.toISOString() } : {}) });
}

// ---- inactivations (approved; they apply at approval) ----------------------------------------

export interface Inactivation {
  /** The reason's English label. */
  reason: string;
  details: string;
  at: Date;
}

type Lookup = { id: string; code?: string; englishName: string };

async function lookupItems(page: Page, path: string): Promise<Lookup[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', path);
  if (res.status >= 300) return [];
  return ((JSON.parse(res.text) as { payload?: Lookup[] }).payload ?? []);
}

/** Inactivates a suite network with the first reason (what inactivateSuiteNetwork sends) and approves it. */
export async function inactivateNetwork(page: Page, network: { id: string; name: string }, details: string): Promise<Inactivation> {
  const reason = (await lookupItems(page, ApiEndpoints.networkInactivationReasonLookup))[0];
  const at = new Date();
  await inactivateSuiteNetwork(page, network, details);
  return { reason: reason?.englishName ?? '', details, at };
}

/** Inactivates a suite policy with the reason matching `reasonLike` (else the first) and approves it. */
export async function inactivatePolicyWith(page: Page, policy: ProvisionedPolicy, reasonLike: RegExp, details: string): Promise<Inactivation> {
  const reasons = await inactivationReasons(page);
  const reason = reasons.find((r) => reasonLike.test(r.englishName)) ?? reasons[0];
  const at = new Date();
  const staged = await inactivatePolicy(page, policy.id, { reasonId: reason?.id ?? null, details });
  if (staged.status >= 300) throw new Error(`InactivatePolicy "${policy.nameEn}" answered ${staged.status} ${staged.text.slice(0, 200)}`);
  await publishPolicyChange(page, policy.id, policy.nameEn);
  return { reason: reason?.englishName ?? '', details, at };
}

/** Deactivates a suite formulary (first reason), sends and approves it. */
export async function deactivateFormulary(page: Page, formulary: ProvisionedFormulary, details: string): Promise<Inactivation> {
  const reason = (await deactivationReasons(page))[0];
  const at = new Date();
  const staged = await setFormularyActive(page, formulary.id, false, { reasonId: reason?.id ?? null, details });
  if (staged.status >= 300) throw new Error(`SetFormularyActive "${formulary.nameEn}" answered ${staged.status} ${staged.text.slice(0, 200)}`);
  const submitted = await submitFormulary(page, formulary.id);
  if (submitted.status >= 300) throw new Error(`SubmitFormularyForApproval "${formulary.nameEn}" answered ${submitted.status} ${submitted.text.slice(0, 200)}`);
  await approveFormulary(page, formulary.nameEn);
  return { reason: reason?.englishName ?? '', details, at };
}

// ---- payer (folder 01) --------------------------------------------------------------------

export interface PayerState {
  id: string;
  name: string;
  /** The displayed status label (payerStatus lookup). */
  status: string;
  isActive: boolean;
}

/** A payer by its exact English name (GetPayers) with its status label - read only. */
export async function payerState(page: Page, name: string): Promise<PayerState> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.payerList, { pageNumber: 1, rowsPerPage: 50, searchText: name });
  if (res.status >= 300) throw new Error(`GetPayers answered ${res.status} ${res.text.slice(0, 200)}`);
  const items = ((JSON.parse(res.text) as { payload?: { payers?: { items?: Record<string, unknown>[] } } }).payload?.payers?.items ?? []);
  const row = items.find((p) => p.payerNameEn === name);
  if (!row) throw new Error(`no payer named "${name}" in GetPayers`);
  const labels = Object.fromEntries((await lookupItems(page, ApiEndpoints.payerStatusLookup)).map((i) => [i.id, i.englishName]));
  const statusId = String(row.effectiveStatusId ?? row.statusId ?? '');
  return { id: String(row.id), name, status: labels[statusId] ?? statusId, isActive: row.isActive === true };
}

/** The payer's Audit History STATUS entries written at or after `since` (GetPayerAuditTrail; throws when refused). */
export async function payerStatusEntriesSince(page: Page, payerId: string, since: Date): Promise<Record<string, unknown>[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.payerAuditTrail, { payerId, actionType: null, pageNumber: 1, rowsPerPage: 50 });
  if (res.status >= 300) throw new Error(`GetPayerAuditTrail answered ${res.status} ${res.text.slice(0, 200)}`);
  const payload = (JSON.parse(res.text) as { payload?: unknown }).payload as Record<string, unknown> | undefined;
  const items = (Array.isArray(payload?.items)
    ? payload?.items
    : (Object.values(payload ?? {}).find((v) => v && typeof v === 'object' && Array.isArray((v as { items?: unknown }).items)) as { items?: unknown[] } | undefined)?.items) as Record<string, unknown>[] | undefined;
  const timeOf = (e: Record<string, unknown>): number => {
    for (const key of ['occurredAtUtc', 'occurredAt', 'createdOn', 'timestamp', 'changedOn']) {
      const v = e[key];
      if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return Date.parse(v);
    }
    return 0;
  };
  return (items ?? []).filter((e) => /status/i.test(String(e.actionType ?? '')) && timeOf(e) >= since.getTime() - 5_000);
}

// ---- approval requests (folder 21) ---------------------------------------------------------

/**
 * The signed-in user's id and the names the screens may show for them: user
 * name, e-mail, national id, and the English / Arabic first name and full
 * name (first + last). GetCurrentUser alone answered only the e-mail among the
 * old keys (21660, 2026-11-11: Requested By showed "CareConnect" - the
 * account's first name, also what the app's own {{RequestedBy}} resolved to);
 * the names come from GetCurrentUserRolesAndPermissions (englishFirstName /
 * englishLastName / arabicFirstName / arabicLastName, probe me.json).
 */
export async function currentUser(page: Page): Promise<{ id: string; names: string[] }> {
  const read = async (path: string): Promise<Record<string, unknown>> => {
    const res = await NetworkUtils.requestAsSession(page, 'GET', path).catch(() => null);
    if (!res || res.status >= 300) return {};
    return ((JSON.parse(res.text) as { payload?: Record<string, unknown> }).payload ?? {});
  };
  const me = { ...(await read(ApiEndpoints.manageCurrentPermissions)), ...(await read(ApiEndpoints.manageCurrentUser)) };
  const str = (k: string): string => (typeof me[k] === 'string' ? (me[k] as string).trim() : '');
  const full = (first: string, last: string): string => `${str(first)} ${str(last)}`.trim();
  const names = [
    ...['userName', 'fullEnglishName', 'fullName', 'englishName', 'displayName', 'email', 'nationalId', 'englishFirstName', 'arabicFirstName'].map(str),
    full('englishFirstName', 'englishLastName'),
    full('arabicFirstName', 'arabicLastName'),
  ].filter((v) => v.length > 0);
  return { id: String(me.id ?? ''), names: [...new Set(names)] };
}

/** The signed-in user of `page` as a Users audience entry (`displayName` as the pickers show it). */
export async function audienceOf(page: Page, displayName: string): Promise<AnnouncementAudience> {
  const me = await currentUser(page);
  if (!me.id) throw new Error('GetCurrentUser answered no id');
  return userAudience(me.id, displayName);
}

/** Whether the inbox item is marked seen (null when it is not in the latest 100). */
export async function itemSeen(page: Page, itemId: string): Promise<boolean | null> {
  const item = (await myNotifications(page, { rows: 100 })).items.find((n) => n.id === itemId);
  return item ? item.isSeen : null;
}

/** One submitted suite network and its approval request. */
export interface Submission {
  network: ProvisionedNetwork;
  requestId: string;
  /** When the submission was sent. */
  at: Date;
}

/** Networks submitted through `submitNetwork` - withdrawn by `discardSubmittedNetworks` while still pending. */
const submitted = new Map<string, string>();

/**
 * Creates a suite network as the signed-in user of `submitterPage` (effective
 * in two days, so an approval never makes it live) and SUBMITS it; the request
 * id is read through the administrator's `adminPage` (GetApprovals). Raises
 * "Need to Approve - Network".
 */
export async function submitNetwork(submitterPage: Page, adminPage: Page): Promise<Submission> {
  const at = new Date();
  const network = await provisionNetwork(submitterPage, { submitOnly: true, effectiveInMinutes: 2 * 24 * 60 });
  submitted.set(network.id, network.name);
  const requestId = await pendingRequestId(adminPage, network.name);
  if (!requestId) throw new Error(`no pending approval request found for the submitted network "${network.name}"`);
  Logger.step(`[E] Submitted "${network.name}" - approval request ${requestId}`);
  return { network, requestId, at };
}

/** afterEach: withdraws (DeleteNetwork) every network `submitNetwork` made that is still pending creation. */
export async function discardSubmittedNetworks(adminPage: Page): Promise<void> {
  for (const [id, name] of [...submitted]) {
    const record = await readNetwork(adminPage, id).catch(() => null);
    if (record?.isPendingCreate) {
      const res = await deleteNetworkById(adminPage, id).catch((e: unknown) => ({ status: 0, text: String(e) }));
      Logger.step(`[E] Withdrew the submitted network "${name}" (${res.status})`);
    }
    submitted.delete(id);
  }
}

/** The inbox notification `def` raised about an approval request (relatedEntityId = request id). */
export async function waitForRequestNotification(page: Page, def: ProbeDefinition, requestId: string, names: string[] = [], timeoutMs = 90_000): Promise<InboxNotification | null> {
  return waitForNotificationAbout(page, def, { id: requestId, names }, timeoutMs);
}

/**
 * The Notification Detail / header parts Writer E reads beyond the shared page
 * object: the real-time pop-up (second toast host), the document language,
 * the Changes rows (scrolled into view so every change counts as viewed - the
 * AC keeps Approve disabled until then) and the Reject drawer's messages.
 */
export class ReviewScreen extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** The real-time "New notification" pop-up (`pbm-toast-notif`). */
  popup(): Locator {
    return this.byId(NC_TOAST.notifRoot).first();
  }

  popupSummary(): Locator {
    return this.byId(NC_TOAST.notifSummary).first();
  }

  popupDetail(): Locator {
    return this.byId(NC_TOAST.notifDetail).first();
  }

  /**
   * Collects the texts of every real-time pop-up shown until one contains
   * `until` (or `timeoutMs` passes). Start it BEFORE the action that raises the
   * notification - the pop-up leaves the screen after a few seconds.
   */
  async collectPopups(until: string, timeoutMs = 150_000): Promise<string[]> {
    const seen: string[] = [];
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const texts = await this.page.locator(`[id="${NC_TOAST.notifRoot}"]`).allInnerTexts().catch(() => [] as string[]);
      for (const t of texts.map((x) => x.replace(/\s+/g, ' ').trim())) if (t && !seen.includes(t)) seen.push(t);
      if (seen.some((s) => s.includes(until))) return seen;
      await this.page.waitForTimeout(300).catch(() => undefined);
    }
    return seen;
  }

  /** The document element (`lang` = the UI language). */
  html(): Locator {
    // locator-exception: the document element has no id; only its lang attribute is read.
    return this.page.locator('html');
  }

  approveButton(): Locator {
    return this.byId(NOTIFICATION_DETAIL.approveButton);
  }

  /** Scrolls every Changes row into view; answers how many there were. */
  async viewAllChanges(): Promise<number> {
    const cells = this.page.locator(`[id^="${DETAIL_EXTRA.diffAfterCellPrefix}"][id$="${DETAIL_EXTRA.diffAfterCellSuffix}"]`);
    const count = await cells.count();
    for (let i = 0; i < count; i += 1) await cells.nth(i).scrollIntoViewIfNeeded().catch(() => undefined); // locator-exception: every Changes row in turn, keyed by id prefix
    return count;
  }

  /**
   * Clicks the Reject drawer's submit only when it is enabled (a disabled one
   * would hang the click); answers whether a RejectRequest left the browser.
   */
  async submitRejectIfEnabled(): Promise<{ disabled: boolean; status: number | null }> {
    const confirm = this.byId(NOTIFICATION_DETAIL.reject.confirm);
    if (!(await confirm.isEnabled().catch(() => false))) return { disabled: true, status: null };
    const answer = this.page.waitForResponse((r) => r.url().includes('/api/Approvals/RejectRequest'), { timeout: 5_000 }).catch(() => null);
    await confirm.click();
    return { disabled: false, status: (await answer)?.status() ?? null };
  }

  /** Every message the Reject drawer shows (its text + inline errors + a toast), whitespace collapsed. */
  async rejectDrawerMessages(): Promise<string> {
    const host = await this.byId(NOTIFICATION_DETAIL.reject.drawer).innerText().catch(() => '');
    const errors = await this.page
      .locator(`[id^="${DETAIL_EXTRA.rejectDrawerPrefix}"][id$="${DETAIL_EXTRA.errorSuffix}"]`)
      .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
      .catch(() => [] as string[]);
    const toast = (await this.isToastVisible(1_500)) ? await this.getToastMessage() : '';
    return [host, ...errors, toast].join(' ').replace(/\s+/g, ' ').trim();
  }

  path(): string {
    return new URL(this.page.url()).pathname;
  }
}

// ---- the definition wizard (folder 02) ------------------------------------------------------

/** What finishing the wizard produced: the messages seen and the save's answer (null = no request). */
export interface WizardFinish {
  reachedAudiences: boolean;
  messages: string;
  saveStatus: number | null;
  drawerOpen: boolean;
}

/**
 * Next from Content; when the Audiences step opens, adds a Users audience with
 * `audienceNames` and clicks Save. Answers every message seen on the way.
 */
export async function finishWizard(drawer: DefinitionDrawer, audienceNames: readonly string[]): Promise<WizardFinish> {
  const nextToast = await drawer.next();
  const reachedAudiences = await drawer.el('addAudience').isVisible().catch(() => false);
  const errors = (await drawer.allErrors()).join(' ');
  if (!reachedAudiences) {
    return { reachedAudiences, messages: `${nextToast} ${errors} ${await drawer.text()}`.replace(/\s+/g, ' ').trim(), saveStatus: null, drawerOpen: await drawer.isOpen() };
  }
  const idx = await drawer.addAudience('Users');
  await drawer.assign(idx, audienceNames);
  const save = await drawer.save();
  const after = save.drawerOpen ? await drawer.text() : '';
  return {
    reachedAudiences,
    messages: `${nextToast} ${errors} ${save.toast} ${save.answer} ${after}`.replace(/\s+/g, ' ').trim(),
    saveStatus: save.status,
    drawerOpen: save.drawerOpen,
  };
}

/** Cancel on the General step (answers an Unsaved Changes prompt with Discard). Returns the prompt's title, or ''. */
export async function cancelWizard(page: Page, drawer: DefinitionDrawer): Promise<string> {
  await drawer.back();
  const title = page.locator(`#${NC_DIALOG.title}`);
  const shown = await title.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
  if (!shown) return '';
  const text = (await title.innerText()).trim();
  await page.locator(`#${NC_DIALOG.action('discard')}`).click();
  return text;
}

/**
 * The inline error under each General-step field ('' when none). Those
 * "This field is required." lines carry NO id (21348 full run 2026-11-11: shown
 * under Action on the screenshot, read as nothing by the id-based allErrors;
 * same as smoke 2 / 21578), so each is read inside the field's own wrapper -
 * the nearest ancestor holding a <small>, and only while it wraps no other field.
 */
export async function generalFieldErrors(drawer: DefinitionDrawer): Promise<{ name: string; module: string; action: string }> {
  const read = async (key: 'name' | 'module' | 'action'): Promise<string> => {
    const host = drawer.el(key);
    if (!(await host.isVisible().catch(() => false))) return '';
    // locator-exception: the error line has no id; it is the <small> inside the field's own wrapper (DOM walk).
    return host.evaluate((el) => {
      let a = el.parentElement;
      while (a && !a.querySelector('small')) a = a.parentElement;
      if (!a) return '';
      const others = Array.from(a.querySelectorAll('[id$="-input"], [id$="-select"]')).filter((o) => o !== el && !el.contains(o) && !o.contains(el));
      if (others.length > 0) return '';
      return Array.from(a.querySelectorAll('small')).map((s) => (s as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
    }).catch(() => '');
  };
  return { name: await read('name'), module: await read('module'), action: await read('action') };
}

/** The General step's Active checkbox input (inside its id'd wrapper). */
export function activeCheckbox(drawer: DefinitionDrawer): Locator {
  return drawer.el('isActive').locator('xpath=descendant-or-self::input').first();
}

/** A message holding every variable of `variables` except `missing`, as `{{Name}}` tags. */
export function messageWithout(prefix: string, variables: readonly string[], missing: string): string {
  return `${prefix} ${variables.filter((v) => v !== missing).map((v) => `{{${v}}}`).join(' ')}`.trim();
}

/** The text direction of a field (`dir` attribute, else the computed CSS direction). */
export async function directionOf(field: Locator): Promise<string> {
  const dir = await field.getAttribute('dir').catch(() => null);
  if (dir) return dir;
  return field.evaluate((el) => getComputedStyle(el).direction).catch(() => '');
}

// ---- outcome bookkeeping ---------------------------------------------------------------------

/**
 * BLOCKED with `reason` - unless an earlier step already FAILED, in which case
 * the finding stays a FAIL and the reason is noted (lead decision 8).
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = pwTest.info();
  if (info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `This step could not be observed either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

/** BLOCKED when `observed` is false (the precondition the run had to produce did not happen). */
export function blockUnless(steps: TestSteps, observed: boolean, reason: string): void {
  if (!observed) blockUnlessAStepFailed(steps, reason);
}

/** What `approvalDefinitions` answers (only the asked kinds are set). */
export type ApprovalDefs = Record<ApprovalKind, ProbeDefinition>;

/** The id of the approval rejection reason labelled `label` (RejectRequest takes it). */
export async function rejectionReasonId(page: Page, label: string): Promise<string> {
  const reason = (await lookupItems(page, ApiEndpoints.approvalRejectionReasonLookup)).find((r) => r.englishName === label);
  if (!reason) throw new Error(`no approval rejection reason "${label}"`);
  return reason.id;
}
