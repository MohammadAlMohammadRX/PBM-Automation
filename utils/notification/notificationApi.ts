import type { Page } from '@playwright/test';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { env } from '../../constants/EnvironmentConfig';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import type { JobKey } from '../JobClock';
import {
  AUDIENCE_TYPE,
  NOTIFICATION_ACTION,
  NOTIFICATION_API,
  NOTIFICATION_MODULE,
  SUITE_DEFINITION_PREFIX,
  actionVariables,
  audienceCandidates,
  createDefinition,
  deleteSuiteDefinition,
  findDefinitionByName,
  listDefinitions,
  readDefinition,
  type DefinitionSpec,
  type DefinitionVariable,
  type InboxNotification,
} from '../jobDriven/notifications';

/**
 * Notification Center Management through the API (Feature 20980, foundation
 * 2026-11-11). Every endpoint below was read from the application bundle and
 * the live traffic of the foundation probe (reports/notification/probe/
 * foundation-2026-11-11/api.json); the request BODIES are the screens' own.
 *
 *   NotificationCenter   POST GetOptions {}                       -> modules/actions (app notifications), trigger modules/actions/recipients, channels, languages, audienceTypes, smsMaxMessageLength
 *                        POST GetActionVariables { actionId }     -> the action's variables (triggers AND definitions)
 *   TriggersConfiguration POST GetTriggers { pageNumber, rowsPerPage, sortBy, searchText?, <filters> } -> { items, totalRows }
 *                        POST GetTrigger { id } | POST CreateTrigger <body> | PUT UpdateTrigger <body + id + concurrencyStamp>
 *                        DELETE DeleteTrigger/{id} | POST ToggleTriggerActivation { id, isActive } | download ExportTriggers
 *   NotificationDefinition (see utils/jobDriven/notifications.ts - reused, not duplicated) + PUT UpdateDefinition, POST ToggleDefinitionActivation
 *   Announcement         POST GetAnnouncements | POST GetAnnouncement { id } | POST CreateAnnouncement | PUT UpdateAnnouncement
 *                        PUT RescheduleAnnouncement { id, publishAt } | PUT CancelAnnouncement/{id} {} | DELETE DeleteAnnouncement/{id}
 *                        POST GetAudienceCandidates { typeCode: 'users' | 'roles' } | download ExportAnnouncements
 *   MyAnnouncements      POST GetMyAnnouncements { pageNumber, rowsPerPage, status: all|unread|read|archived, searchText? }
 *                        POST GetMyAnnouncement { announcementId } | POST MarkAsRead { id } | POST MarkAllAsRead {} | POST ArchiveForMe { id } | GET GetUnreadCount
 *   Notifications        POST GetMyNotifications (same body) | POST MarkAsRead { id } | POST MarkAllAsRead {} | POST ArchiveForMe { id } | GET GetUnreadCount
 *   AppNotificationsAudit POST GetNotifications | POST GetNotification { id }
 *   TriggersAudit        POST GetTriggerExecutions | POST GetTriggerExecution { id }
 *   AnnouncementsAudit   POST GetAnnouncements | POST GetAnnouncement { id }
 *   Approvals            POST GetApprovalDetail { id } | POST ApproveRequest { id } | POST RejectRequest { id, rejectionReasonId, rejectionDetails }
 *
 * Every helper takes the Page whose session it speaks for - the admin's
 * `page` or the second user's `secondUser.page` - so "user B's inbox" is
 * `myNotifications(secondUser.page)`.
 */

export {
  AUDIENCE_TYPE,
  NOTIFICATION_ACTION,
  NOTIFICATION_MODULE,
  SUITE_DEFINITION_PREFIX,
  actionVariables,
  audienceCandidates,
  createDefinition,
  deleteSuiteDefinition,
  findDefinitionByName,
  listDefinitions,
  readDefinition,
};
export type { DefinitionSpec, DefinitionVariable, InboxNotification };

/** Name prefixes of the records the suite creates - and the ONLY records it may edit, toggle, cancel or delete. */
export const SUITE_TRIGGER_PREFIX = 'QA Automation Trigger';
export const SUITE_ANNOUNCEMENT_PREFIX = 'QA Automation Announcement';

export const NC_API = {
  ...NOTIFICATION_API,
  actionVariablesNc: '/api/NotificationCenter/GetActionVariables',
  triggers: '/api/TriggersConfiguration/GetTriggers',
  trigger: '/api/TriggersConfiguration/GetTrigger',
  createTrigger: '/api/TriggersConfiguration/CreateTrigger',
  updateTrigger: '/api/TriggersConfiguration/UpdateTrigger',
  deleteTrigger: '/api/TriggersConfiguration/DeleteTrigger',
  toggleTrigger: '/api/TriggersConfiguration/ToggleTriggerActivation',
  exportTriggers: '/api/TriggersConfiguration/ExportTriggers',
  exportDefinitions: '/api/NotificationDefinition/ExportDefinitions',
  announcements: '/api/Announcement/GetAnnouncements',
  announcement: '/api/Announcement/GetAnnouncement',
  createAnnouncement: '/api/Announcement/CreateAnnouncement',
  updateAnnouncement: '/api/Announcement/UpdateAnnouncement',
  rescheduleAnnouncement: '/api/Announcement/RescheduleAnnouncement',
  cancelAnnouncement: '/api/Announcement/CancelAnnouncement',
  deleteAnnouncement: '/api/Announcement/DeleteAnnouncement',
  exportAnnouncements: '/api/Announcement/ExportAnnouncements',
  announcementAudienceCandidates: '/api/Announcement/GetAudienceCandidates',
  myAnnouncements: '/api/MyAnnouncements/GetMyAnnouncements',
  myAnnouncement: '/api/MyAnnouncements/GetMyAnnouncement',
  announcementMarkRead: '/api/MyAnnouncements/MarkAsRead',
  announcementMarkAllRead: '/api/MyAnnouncements/MarkAllAsRead',
  announcementArchive: '/api/MyAnnouncements/ArchiveForMe',
  announcementUnreadCount: '/api/MyAnnouncements/GetUnreadCount',
  myNotifications: '/api/Notifications/GetMyNotifications',
  notificationMarkRead: '/api/Notifications/MarkAsRead',
  notificationMarkAllRead: '/api/Notifications/MarkAllAsRead',
  notificationArchive: '/api/Notifications/ArchiveForMe',
  notificationUnreadCount: '/api/Notifications/GetUnreadCount',
  triggerExecution: '/api/TriggersAudit/GetTriggerExecution',
  announcementsAudit: '/api/AnnouncementsAudit/GetAnnouncements',
  announcementAudit: '/api/AnnouncementsAudit/GetAnnouncement',
  approvalDetail: '/api/Approvals/GetApprovalDetail',
  approve: '/api/Approvals/ApproveRequest',
  reject: '/api/Approvals/RejectRequest',
  approvals: '/api/Approvals/GetApprovals',
} as const;

/** The scheduled job behind each entity's status notifications (move it with the `jobClock` fixture). */
export const LIFECYCLE_JOB: Readonly<Record<'payer' | 'network' | 'plan' | 'policy' | 'formulary', JobKey>> = {
  payer: 'Jobs.PayerLifecycleCron',
  network: 'Jobs.NetworkLifecycleCron',
  plan: 'Jobs.PlanLifecycleCron',
  policy: 'Jobs.PolicyLifecycleCron',
  formulary: 'Jobs.FormularyLifecycleCron',
};

export interface NcAnswer {
  status: number;
  text: string;
  /** Reasons of a 4xx ValidationErrors list, or the answer's message. */
  errors: string[];
}

let counter = 0;
/** A short unique stamp for suite names (base 36, ~9 characters). */
export const ncStamp = (): string => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function onApp(page: Page): Promise<void> {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
}

function errorsOf(res: { status: number; text: string; validationErrors?: string[] }): string[] {
  if (res.validationErrors?.length) return res.validationErrors;
  if (res.status < 400) return [];
  try {
    const body = JSON.parse(res.text) as { message?: string; Message?: string; detail?: string; title?: string; errorMessage?: string };
    return [body.message ?? body.Message ?? body.detail ?? body.errorMessage ?? body.title ?? ''].filter(Boolean);
  } catch {
    return [res.text.slice(0, 200)];
  }
}

async function call(page: Page, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<NcAnswer> {
  await onApp(page);
  const res = await NetworkUtils.requestAsSession(page, method, path, body);
  return { status: res.status, text: res.text, errors: errorsOf(res) };
}

export function payloadOf<T>(answer: { text: string }): T | null {
  try {
    return (JSON.parse(answer.text) as { payload?: T }).payload ?? null;
  } catch {
    return null;
  }
}

/** The answer's success / error message (`successMessage`, else the first error). */
export function messageOf(answer: NcAnswer): string {
  try {
    const body = JSON.parse(answer.text) as { successMessage?: string };
    if (answer.status < 300 && body.successMessage) return body.successMessage;
  } catch {
    /* not JSON */
  }
  return answer.errors[0] ?? '';
}

/** A created record's id from the answer: payload is the id itself or `{ id }`. */
function idOf(answer: NcAnswer): string {
  const p = payloadOf<unknown>(answer);
  if (typeof p === 'string') return p;
  return String((p as { id?: string } | null)?.id ?? '');
}

// ---- options -------------------------------------------------------------------------

export interface NcOption {
  id: string;
  code: string;
  englishName: string;
  arabicName: string;
  parentItemId: string | null;
}

export interface NcOptions {
  modules: NcOption[];
  actions: NcOption[];
  recipientTypes: NcOption[];
  audienceTypes: NcOption[];
  conditions: NcOption[];
  triggerModules: NcOption[];
  triggerActions: NcOption[];
  triggerRecipientTypes: NcOption[];
  appliedForSpecific: NcOption[];
  channels: NcOption[];
  languages: NcOption[];
  predefinedVariables: string[];
  smsMaxMessageLength: number;
}

/** POST NotificationCenter/GetOptions - every select's choices (stable seed GUIDs). */
export async function ncOptions(page: Page): Promise<NcOptions> {
  const answer = await call(page, 'POST', NC_API.options, {});
  const p = payloadOf<NcOptions>(answer);
  if (!p) throw new Error(`GetOptions answered ${answer.status}: ${answer.text.slice(0, 200)}`);
  return p;
}

/** Channel / language ids (GetOptions `channels` / `languages`). */
export const CHANNEL = {
  inApp: 'd0000005-0000-4000-8000-000000000001',
  sms: 'd0000005-0000-4000-8000-000000000002',
  email: 'd0000005-0000-4000-8000-000000000003',
} as const;
export const LANGUAGE = {
  en: 'd0000009-0000-4000-8000-000000000001',
  ar: 'd0000009-0000-4000-8000-000000000002',
} as const;

/** Trigger modules (GetOptions `triggerModules`). */
export const TRIGGER_MODULE = {
  userManagement: 'd0000010-0000-4000-8000-000000000001',
  approvalManagement: 'd0000010-0000-4000-8000-000000000010',
  memberManagement: 'd0000010-0000-4000-8000-000000000020',
  pbmEngine: 'd0000010-0000-4000-8000-000000000030',
} as const;

/** Trigger recipients (GetOptions `triggerRecipientTypes`) - decided by the module, read-only in the drawer. */
export const TRIGGER_RECIPIENT = {
  user: 'd0000012-0000-4000-8000-000000000001',
  member: 'd0000012-0000-4000-8000-000000000003',
  external: 'd0000012-0000-4000-8000-000000000004',
} as const;

/** User / Approval Management notify a user, Member Management a member, PBM Engine an external contact. */
export const TRIGGER_RECIPIENT_BY_MODULE: Readonly<Record<string, string>> = {
  [TRIGGER_MODULE.userManagement]: TRIGGER_RECIPIENT.user,
  [TRIGGER_MODULE.approvalManagement]: TRIGGER_RECIPIENT.user,
  [TRIGGER_MODULE.memberManagement]: TRIGGER_RECIPIENT.member,
  [TRIGGER_MODULE.pbmEngine]: TRIGGER_RECIPIENT.external,
};

/** The predefined triggers (stable ids; Edit only - never delete or deactivate). */
export const PREDEFINED_TRIGGER = {
  invitation: 'd0000013-0000-4000-8000-000000000001',
  forgetPassword: 'd0000013-0000-4000-8000-000000000002',
  firstActivation: 'd0000013-0000-4000-8000-000000000003',
  twoFactor: 'd0000013-0000-4000-8000-000000000004',
  apiClientCredentials: 'd0000013-0000-4000-8000-000000000005',
  systemJobFailed: 'd0000013-0000-4000-8000-000000000006',
} as const;

// ---- triggers ------------------------------------------------------------------------

export interface TriggerRow {
  id: string;
  name: string;
  moduleEn: string;
  moduleAr: string;
  actionEn: string;
  actionAr: string;
  recipientEn: string;
  recipientAr: string;
  isActive: boolean;
  isPredefined: boolean;
  blockForSpecificsCount: number;
}

export interface TriggerTemplateBody {
  id?: string;
  subject: string | null;
  body: string;
  isDefault: boolean;
  targets: unknown[];
}

export interface TriggerTemplate {
  id?: string;
  channelId: string;
  languageId: string;
  bodies: TriggerTemplateBody[];
}

/** GetTrigger's answer - also the shape UpdateTrigger takes back. */
export interface TriggerRecord {
  id: string;
  name: string;
  moduleId: string;
  actionId: string;
  recipientId: string;
  isActive: boolean;
  isPredefined: boolean;
  concurrencyStamp: string;
  templates: TriggerTemplate[];
  blockForSpecifics: unknown[];
  variableDefinitions: DefinitionVariable[];
}

/** POST GetTriggers - the list's own body (`{ pageNumber, rowsPerPage, sortBy: 'CreatedOn desc' }` + searchText / filters). */
export async function listTriggers(page: Page, criteria: Record<string, unknown> = {}, rows = 200): Promise<{ items: TriggerRow[]; totalRows: number }> {
  const answer = await call(page, 'POST', NC_API.triggers, { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', ...criteria });
  const p = payloadOf<{ items?: TriggerRow[]; totalRows?: number }>(answer);
  return { items: p?.items ?? [], totalRows: p?.totalRows ?? 0 };
}

export async function readTrigger(page: Page, id: string): Promise<TriggerRecord | null> {
  const answer = await call(page, 'POST', NC_API.trigger, { id });
  return answer.status < 300 ? payloadOf<TriggerRecord>(answer) : null;
}

export async function findTriggerByName(page: Page, name: string): Promise<TriggerRow | null> {
  return (await listTriggers(page, { searchText: name })).items.find((t) => t.name === name) ?? null;
}

/** What a suite trigger is made of (the Add drawer's fields). */
export interface TriggerSpec {
  /** Default `QA Automation Trigger <stamp>` (the screen allows 50 characters). */
  name?: string;
  moduleId: string;
  actionId: string;
  /** Default false: a suite trigger never sends unless the case needs it to. */
  isActive?: boolean;
  /**
   * Templates; default ONE English SMS template whose body names every
   * REQUIRED variable of the action (the drawer refuses a body without them:
   * "This message body does not use the required variable(s) ...").
   */
  templates?: TriggerTemplate[];
}

/** The body the Add Trigger drawer sends (POST CreateTrigger) for `spec`. */
export async function triggerBody(page: Page, spec: TriggerSpec): Promise<Record<string, unknown>> {
  const variables = await actionVariablesNc(page, spec.actionId);
  const required = variables.filter((v) => v.isRequired).map((v) => `{{${v.name}}}`).join(' ');
  const templates = spec.templates ?? [
    { channelId: CHANNEL.sms, languageId: LANGUAGE.en, bodies: [{ subject: null, body: `QA automation message ${required}`.trim(), isDefault: true, targets: [] }] },
  ];
  return {
    name: spec.name ?? `${SUITE_TRIGGER_PREFIX} ${ncStamp()}`,
    moduleId: spec.moduleId,
    actionId: spec.actionId,
    recipientId: TRIGGER_RECIPIENT_BY_MODULE[spec.moduleId] ?? TRIGGER_RECIPIENT.user,
    isActive: spec.isActive ?? false,
    templates,
    blockForSpecifics: [],
    variableDefinitions: variables,
  };
}

/** POST NotificationCenter/GetActionVariables `{ actionId }` - trigger AND definition actions. */
export async function actionVariablesNc(page: Page, actionId: string): Promise<DefinitionVariable[]> {
  const answer = await call(page, 'POST', NC_API.actionVariablesNc, { actionId });
  const p = payloadOf<DefinitionVariable[]>(answer);
  return p ?? (await actionVariables(page, actionId));
}

/** POST CreateTrigger with any body (validation cases send broken ones). */
export async function requestCreateTrigger(page: Page, body: Record<string, unknown>): Promise<NcAnswer & { id: string }> {
  const answer = await call(page, 'POST', NC_API.createTrigger, body);
  let id = answer.status < 300 ? idOf(answer) : '';
  if (answer.status < 300 && !id && typeof body.name === 'string') id = (await findTriggerByName(page, body.name))?.id ?? '';
  Logger.step(`[nc] CreateTrigger "${String(body.name)}" answered ${answer.status}${id ? ` (id ${id})` : ''}`);
  return { ...answer, id };
}

/** PUT UpdateTrigger: GetTrigger + `changes` (suite triggers only unless `allowPredefined` - a predefined edit MUST be put back by the case). */
export async function updateTrigger(page: Page, id: string, changes: Partial<TriggerRecord>, allowPredefined = false): Promise<NcAnswer> {
  const record = await readTrigger(page, id);
  if (!record) throw new Error(`GetTrigger ${id} found nothing`);
  if (!allowPredefined && !record.name.startsWith(SUITE_TRIGGER_PREFIX)) throw new Error(`refusing to update trigger "${record.name}": not a suite trigger`);
  return call(page, 'PUT', NC_API.updateTrigger, { ...record, ...changes, id, concurrencyStamp: record.concurrencyStamp });
}

/** POST ToggleTriggerActivation (suite triggers only). */
export async function setTriggerActive(page: Page, id: string, isActive: boolean): Promise<NcAnswer> {
  const record = await readTrigger(page, id);
  if (!record?.name.startsWith(SUITE_TRIGGER_PREFIX)) throw new Error(`refusing to toggle trigger "${record?.name ?? id}": not a suite trigger`);
  return call(page, 'POST', NC_API.toggleTrigger, { id, isActive });
}

/** DELETE DeleteTrigger/{id} - suite triggers only (prefix and not predefined checked). */
export async function deleteSuiteTrigger(page: Page, id: string): Promise<NcAnswer | null> {
  const record = await readTrigger(page, id);
  if (!record) return null;
  if (!record.name.startsWith(SUITE_TRIGGER_PREFIX) || record.isPredefined) throw new Error(`refusing to delete trigger "${record.name}": not a suite trigger`);
  const answer = await call(page, 'DELETE', `${NC_API.deleteTrigger}/${id}`);
  Logger.step(`[nc] DeleteTrigger "${record.name}" answered ${answer.status}`);
  return answer;
}

/**
 * Trigger actions that NO trigger uses yet (a suite trigger on one of them
 * cannot clash with "A trigger for this action and recipient already exists.").
 * Read from GetOptions + every trigger's GetTrigger.
 */
export async function freeTriggerActions(page: Page): Promise<NcOption[]> {
  const options = await ncOptions(page);
  const used = new Set<string>();
  for (const t of (await listTriggers(page)).items) {
    const record = await readTrigger(page, t.id);
    if (record) used.add(record.actionId);
  }
  return options.triggerActions.filter((a) => !used.has(a.id));
}

// ---- definitions (reused helpers live in utils/jobDriven/notifications.ts) -----------

/** PUT UpdateDefinition: GetDefinition + `changes` (suite definitions only). */
export async function updateSuiteDefinition(page: Page, id: string, changes: Record<string, unknown>): Promise<NcAnswer> {
  const record = await readDefinition(page, id);
  if (!record) throw new Error(`GetDefinition ${id} found nothing`);
  if (!String(record.name ?? '').startsWith(SUITE_DEFINITION_PREFIX)) throw new Error(`refusing to update definition "${String(record.name)}": not a suite definition`);
  return call(page, 'PUT', NC_API.updateDefinition, { ...record, ...changes, id, concurrencyStamp: record.concurrencyStamp });
}

/** POST ToggleDefinitionActivation (suite definitions only). */
export async function setDefinitionActive(page: Page, id: string, isActive: boolean): Promise<NcAnswer> {
  const record = await readDefinition(page, id);
  if (!String(record?.name ?? '').startsWith(SUITE_DEFINITION_PREFIX)) throw new Error(`refusing to toggle definition "${String(record?.name ?? id)}": not a suite definition`);
  return call(page, 'POST', NC_API.toggleDefinition, { id, isActive });
}

// ---- announcements -------------------------------------------------------------------

export type AnnouncementStatus = 'Scheduled' | 'Published' | 'Cancelled';

export interface AnnouncementAudience {
  id?: string;
  audienceTypeId: string;
  referenceId: string;
  referenceName: string;
}

export interface AnnouncementRow {
  id: string;
  name: string;
  status: AnnouncementStatus | string;
  publishAt: string;
  publishedOn: string | null;
  [k: string]: unknown;
}

export interface AnnouncementRecord extends AnnouncementRow {
  englishMessage: string;
  arabicMessage: string;
  concurrencyStamp: string;
  audiences: AnnouncementAudience[];
}

export async function listAnnouncements(page: Page, criteria: Record<string, unknown> = {}, rows = 200): Promise<{ items: AnnouncementRow[]; totalRows: number }> {
  const answer = await call(page, 'POST', NC_API.announcements, { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', ...criteria });
  const p = payloadOf<{ items?: AnnouncementRow[]; totalRows?: number }>(answer);
  return { items: p?.items ?? [], totalRows: p?.totalRows ?? 0 };
}

export async function readAnnouncement(page: Page, id: string): Promise<AnnouncementRecord | null> {
  const answer = await call(page, 'POST', NC_API.announcement, { id });
  return answer.status < 300 ? payloadOf<AnnouncementRecord>(answer) : null;
}

/** POST Announcement/GetAudienceCandidates `{ typeCode }` -> `[{ id, nameEn, nameAr }]`. */
export async function announcementCandidates(page: Page, typeCode: 'users' | 'roles'): Promise<{ id: string; nameEn: string; nameAr: string }[]> {
  return payloadOf<{ id: string; nameEn: string; nameAr: string }[]>(await call(page, 'POST', NC_API.announcementAudienceCandidates, { typeCode })) ?? [];
}

export interface AnnouncementSpec {
  /** Default `QA Automation Announcement <stamp>`. */
  name?: string;
  englishMessage?: string;
  arabicMessage?: string;
  /** Default now (published by the next job run, about a minute). A Date or ISO string. */
  publishAt?: Date | string;
  /** Users / roles; default none - the caller names them (only careconnect, maalmohammad or a suite role). */
  audiences: AnnouncementAudience[];
}

/** The body the Create drawer sends (POST CreateAnnouncement). */
export function announcementBody(spec: AnnouncementSpec): Record<string, unknown> {
  const stamp = ncStamp();
  const publishAt = spec.publishAt === undefined ? new Date() : spec.publishAt;
  return {
    name: spec.name ?? `${SUITE_ANNOUNCEMENT_PREFIX} ${stamp}`,
    englishMessage: spec.englishMessage ?? `QA automation announcement ${stamp}`,
    arabicMessage: spec.arabicMessage ?? 'إعلان اختبار آلي',
    publishAt: typeof publishAt === 'string' ? publishAt : publishAt.toISOString(),
    audiences: spec.audiences,
  };
}

/** POST CreateAnnouncement with any body; answers the new id ('' when refused). */
export async function requestCreateAnnouncement(page: Page, body: Record<string, unknown>): Promise<NcAnswer & { id: string }> {
  const answer = await call(page, 'POST', NC_API.createAnnouncement, body);
  const id = answer.status < 300 ? idOf(answer) : '';
  Logger.step(`[nc] CreateAnnouncement "${String(body.name)}" answered ${answer.status}${id ? ` (id ${id})` : ''}`);
  return { ...answer, id };
}

function assertSuiteAnnouncement(record: AnnouncementRecord | null, what: string): asserts record is AnnouncementRecord {
  if (!record) throw new Error(`${what}: the announcement was not found`);
  if (!record.name.startsWith(SUITE_ANNOUNCEMENT_PREFIX)) throw new Error(`refusing to ${what} announcement "${record.name}": not a suite announcement`);
}

/** PUT UpdateAnnouncement: GetAnnouncement + `changes` (suite announcements only). */
export async function updateSuiteAnnouncement(page: Page, id: string, changes: Partial<AnnouncementRecord>): Promise<NcAnswer> {
  const record = await readAnnouncement(page, id);
  assertSuiteAnnouncement(record, 'update');
  return call(page, 'PUT', NC_API.updateAnnouncement, {
    id,
    name: record.name,
    englishMessage: record.englishMessage,
    arabicMessage: record.arabicMessage,
    publishAt: record.publishAt,
    audiences: record.audiences.map((a) => ({ audienceTypeId: a.audienceTypeId, referenceId: a.referenceId, referenceName: a.referenceName })),
    concurrencyStamp: record.concurrencyStamp,
    ...changes,
  });
}

/** PUT CancelAnnouncement/{id} (suite announcements only; a Published one cannot be deleted - it is cancelled). */
export async function cancelSuiteAnnouncement(page: Page, id: string): Promise<NcAnswer> {
  assertSuiteAnnouncement(await readAnnouncement(page, id), 'cancel');
  return call(page, 'PUT', `${NC_API.cancelAnnouncement}/${id}`, {});
}

/** PUT RescheduleAnnouncement `{ id, publishAt }` (suite announcements only; the drawer of a Cancelled one). */
export async function rescheduleSuiteAnnouncement(page: Page, id: string, publishAt: Date | string): Promise<NcAnswer> {
  const record = await readAnnouncement(page, id);
  assertSuiteAnnouncement(record, 'reschedule');
  return call(page, 'PUT', NC_API.rescheduleAnnouncement, {
    id,
    publishAt: typeof publishAt === 'string' ? publishAt : publishAt.toISOString(),
    concurrencyStamp: record.concurrencyStamp,
  });
}

/** DELETE DeleteAnnouncement/{id} (suite announcements only; Scheduled ones). */
export async function deleteSuiteAnnouncement(page: Page, id: string): Promise<NcAnswer> {
  assertSuiteAnnouncement(await readAnnouncement(page, id), 'delete');
  return call(page, 'DELETE', `${NC_API.deleteAnnouncement}/${id}`);
}

/**
 * Removes a suite announcement the only way its status allows: Scheduled ->
 * deleted; Published -> cancelled (it stays listed as Cancelled); Cancelled ->
 * already inert. Answers what happened.
 */
export async function discardSuiteAnnouncement(page: Page, id: string): Promise<'deleted' | 'cancelled' | 'already-cancelled' | 'gone' | 'left'> {
  const record = await readAnnouncement(page, id);
  if (!record) return 'gone';
  if (!record.name.startsWith(SUITE_ANNOUNCEMENT_PREFIX)) return 'left';
  if (/cancel/i.test(record.status)) return 'already-cancelled';
  if (/schedul/i.test(record.status)) {
    const del = await call(page, 'DELETE', `${NC_API.deleteAnnouncement}/${id}`);
    if (del.status < 300) return 'deleted';
  }
  const cancel = await call(page, 'PUT', `${NC_API.cancelAnnouncement}/${id}`, {});
  if (cancel.status < 300) return 'cancelled';
  return 'left';
}

// ---- the signed-in user's inboxes (pass the Page of the user you mean) --------------

export type InboxTab = 'all' | 'unread' | 'read' | 'archived';

export interface InboxAnnouncement {
  /** The inbox item id (MarkAsRead / ArchiveForMe take this). */
  id: string;
  announcementId: string;
  name: string;
  englishMessage: string;
  arabicMessage: string;
  isSeen: boolean;
  isArchived: boolean;
  createdOn: string;
}

/** POST GetMyNotifications as the bell asks it (`status` tab, `searchText`). */
export async function myNotifications(page: Page, opts: { status?: InboxTab; search?: string; pageNumber?: number; rows?: number } = {}): Promise<{ items: InboxNotification[]; totalRows: number }> {
  const answer = await call(page, 'POST', NC_API.myNotifications, { pageNumber: opts.pageNumber ?? 1, rowsPerPage: opts.rows ?? 20, status: opts.status ?? 'all', searchText: opts.search?.trim() || undefined });
  const p = payloadOf<{ notifications?: { items?: InboxNotification[]; totalRows?: number } }>(answer);
  return { items: p?.notifications?.items ?? [], totalRows: p?.notifications?.totalRows ?? 0 };
}

/** POST GetMyAnnouncements as the bell asks it. */
export async function myAnnouncements(page: Page, opts: { status?: InboxTab; search?: string; pageNumber?: number; rows?: number } = {}): Promise<{ items: InboxAnnouncement[]; totalRows: number }> {
  const answer = await call(page, 'POST', NC_API.myAnnouncements, { pageNumber: opts.pageNumber ?? 1, rowsPerPage: opts.rows ?? 20, status: opts.status ?? 'all', searchText: opts.search?.trim() || undefined });
  const p = payloadOf<{ announcements?: { items?: InboxAnnouncement[]; totalRows?: number } }>(answer);
  return { items: p?.announcements?.items ?? [], totalRows: p?.announcements?.totalRows ?? 0 };
}

/** POST GetMyAnnouncement `{ announcementId }` - what the detail page reads. */
export async function myAnnouncement(page: Page, announcementId: string): Promise<NcAnswer> {
  return call(page, 'POST', NC_API.myAnnouncement, { announcementId });
}

export async function notificationUnreadCount(page: Page): Promise<number> {
  return Number(payloadOf<number>(await call(page, 'GET', NC_API.notificationUnreadCount)) ?? 0);
}

export async function announcementUnreadCount(page: Page): Promise<number> {
  return Number(payloadOf<number>(await call(page, 'GET', NC_API.announcementUnreadCount)) ?? 0);
}

/** Inbox actions - `id` is the INBOX ITEM id (InboxNotification.id / InboxAnnouncement.id). */
export const inboxAction = {
  markNotificationRead: (page: Page, id: string): Promise<NcAnswer> => call(page, 'POST', NC_API.notificationMarkRead, { id }),
  markAllNotificationsRead: (page: Page): Promise<NcAnswer> => call(page, 'POST', NC_API.notificationMarkAllRead, {}),
  archiveNotification: (page: Page, id: string): Promise<NcAnswer> => call(page, 'POST', NC_API.notificationArchive, { id }),
  markAnnouncementRead: (page: Page, id: string): Promise<NcAnswer> => call(page, 'POST', NC_API.announcementMarkRead, { id }),
  markAllAnnouncementsRead: (page: Page): Promise<NcAnswer> => call(page, 'POST', NC_API.announcementMarkAllRead, {}),
  archiveAnnouncement: (page: Page, id: string): Promise<NcAnswer> => call(page, 'POST', NC_API.announcementArchive, { id }),
};

/** Polls `read` until `match` finds an item or `timeoutMs` passes; null when it never arrives. */
export async function waitForInboxItem<T>(read: () => Promise<{ items: T[] }>, match: (item: T) => boolean, timeoutMs = 120_000, everyMs = 5_000): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const hit = (await read()).items.find(match);
    if (hit) return hit;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

// ---- audits --------------------------------------------------------------------------

export async function appNotificationsAuditList(page: Page, criteria: Record<string, unknown> = {}, rows = 50): Promise<{ items: Record<string, unknown>[]; totalRows: number }> {
  const p = payloadOf<{ items?: Record<string, unknown>[]; totalRows?: number }>(await call(page, 'POST', NC_API.appNotificationsAudit, { pageNumber: 1, rowsPerPage: rows, ...criteria }));
  return { items: p?.items ?? [], totalRows: p?.totalRows ?? 0 };
}

export async function appNotificationAuditDetail(page: Page, id: string): Promise<Record<string, unknown> | null> {
  return payloadOf<Record<string, unknown>>(await call(page, 'POST', NC_API.appNotificationAudit, { id }));
}

export async function triggerExecutionsList(page: Page, criteria: Record<string, unknown> = {}, rows = 50): Promise<{ items: Record<string, unknown>[]; totalRows: number }> {
  const p = payloadOf<{ items?: Record<string, unknown>[]; totalRows?: number }>(await call(page, 'POST', NC_API.triggerExecutions, { pageNumber: 1, rowsPerPage: rows, ...criteria }));
  return { items: p?.items ?? [], totalRows: p?.totalRows ?? 0 };
}

export async function triggerExecutionDetail(page: Page, id: string): Promise<Record<string, unknown> | null> {
  return payloadOf<Record<string, unknown>>(await call(page, 'POST', NC_API.triggerExecution, { id }));
}

export async function announcementsAuditList(page: Page, criteria: Record<string, unknown> = {}, rows = 50): Promise<{ items: Record<string, unknown>[]; totalRows: number }> {
  const p = payloadOf<{ items?: Record<string, unknown>[]; totalRows?: number }>(await call(page, 'POST', NC_API.announcementsAudit, { pageNumber: 1, rowsPerPage: rows, ...criteria }));
  return { items: p?.items ?? [], totalRows: p?.totalRows ?? 0 };
}

export async function announcementAuditDetail(page: Page, id: string): Promise<Record<string, unknown> | null> {
  return payloadOf<Record<string, unknown>>(await call(page, 'POST', NC_API.announcementAudit, { id }));
}

// ---- approvals -----------------------------------------------------------------------

/** POST GetApprovalDetail `{ id }` (the approval REQUEST id = a "Need to Approve" notification's relatedEntityId). */
export async function approvalDetail(page: Page, requestId: string): Promise<Record<string, unknown> | null> {
  return payloadOf<Record<string, unknown>>(await call(page, 'POST', NC_API.approvalDetail, { id: requestId }));
}

export async function approveRequest(page: Page, requestId: string): Promise<NcAnswer> {
  return call(page, 'POST', NC_API.approve, { id: requestId });
}

export async function rejectRequest(page: Page, requestId: string, rejectionReasonId: string, rejectionDetails?: string): Promise<NcAnswer> {
  return call(page, 'POST', NC_API.reject, { id: requestId, rejectionReasonId, rejectionDetails: rejectionDetails?.trim() || null });
}

/** The Reject dialog's reasons (lookup approvalRejectionReason): `[{ id, englishName, arabicName }]`. */
export async function rejectionReasons(page: Page): Promise<{ id: string; englishName: string; arabicName: string; isActive: boolean }[]> {
  return payloadOf<{ id: string; englishName: string; arabicName: string; isActive: boolean }[]>(await call(page, 'GET', ApiEndpoints.approvalRejectionReasonLookup)) ?? [];
}

// ---- users ---------------------------------------------------------------------------

/** A user's id by e-mail (GetUsers search) - '' when not found. */
export async function userIdByEmail(page: Page, email: string): Promise<string> {
  const answer = await call(page, 'POST', ApiEndpoints.userList, { pageNumber: 1, rowsPerPage: 50, searchText: email.split('@')[0] });
  const items = payloadOf<{ users?: { items?: { id: string; email: string }[] } }>(answer)?.users?.items ?? [];
  return items.find((u) => u.email.toLowerCase() === email.toLowerCase())?.id ?? '';
}

/** The audience entry for one USER (both definitions and announcements take this shape). */
export function userAudience(id: string, name: string): AnnouncementAudience {
  return { audienceTypeId: AUDIENCE_TYPE.users, referenceId: id, referenceName: name };
}

/** The audience entry for one ROLE. */
export function roleAudience(id: string, name: string): AnnouncementAudience {
  return { audienceTypeId: AUDIENCE_TYPE.roles, referenceId: id, referenceName: name };
}
