import type { Page } from '@playwright/test';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { ApiEndpoints } from '../../constants/ApiEndpoints';

/**
 * In-app notifications and their templates (System Settings > Notification
 * Center), verified live 2026-11-08 - what US 14323 (network Expired / Inactive
 * notifications) and the plan / approval notification cases need.
 *
 * HOW NOTIFICATIONS WORK HERE. Nothing is notified unless a NOTIFICATION
 * DEFINITION (the Notification Center's "Definitions" tab = the bilingual
 * template) exists and is active for the module action. Each definition holds
 * an English and an Arabic message template with `{{Variables}}`, an optional
 * notes template, and an audience (users / roles / permissions). When the
 * action happens the application creates ONE notification carrying both texts
 * for every audience member (GetMyNotifications `{ englishMessage,
 * arabicMessage, type: <definition name>, relatedEntityType, relatedEntityId }`;
 * the bell shows the text of the CURRENT UI language) and logs an e-mail
 * attempt per recipient (TriggersAudit, status "Failed" in this environment).
 * On 2026-11-08 no definition existed for "Expired - Network" or
 * "Inactive - Network", so the suite creates its own and deletes it after.
 */

/** Module / action ids of GetOptions (stable seed GUIDs). */
export const NOTIFICATION_MODULE = {
  approvalManagement: 'd0000001-0000-4000-8000-000000000110',
  payerManagement: 'd0000001-0000-4000-8000-000000000111',
  networkManagement: 'd0000001-0000-4000-8000-000000000112',
  planManagement: 'd0000001-0000-4000-8000-000000000113',
  policyManagement: 'd0000001-0000-4000-8000-000000000114',
  formularyManagement: 'd0000001-0000-4000-8000-000000000101',
} as const;

export const NOTIFICATION_ACTION = {
  networkNeedApprove: 'd0000002-0000-4000-8000-000000000210',
  networkApproved: 'd0000002-0000-4000-8000-000000000211',
  networkRejected: 'd0000002-0000-4000-8000-000000000212',
  networkActive: 'd0000002-0000-4000-8000-000000000213',
  networkExpired: 'd0000002-0000-4000-8000-000000000214',
  networkInactive: 'd0000002-0000-4000-8000-000000000216',
  networkExpiringSoon: 'd0000002-0000-4000-8000-000000000217',
  planNeedApprove: 'd0000002-0000-4000-8000-000000000220',
  planApproved: 'd0000002-0000-4000-8000-000000000221',
  planRejected: 'd0000002-0000-4000-8000-000000000222',
  planActive: 'd0000002-0000-4000-8000-000000000223',
  planExpired: 'd0000002-0000-4000-8000-000000000224',
  planInactive: 'd0000002-0000-4000-8000-000000000226',
  planExpiringSoon: 'd0000002-0000-4000-8000-000000000227',
} as const;

/** Audience type ids (GetOptions `audienceTypes`). */
export const AUDIENCE_TYPE = {
  users: 'd0000004-0000-4000-8000-000000000001',
  roles: 'd0000004-0000-4000-8000-000000000002',
  permissions: 'd0000004-0000-4000-8000-000000000003',
} as const;

/** The name prefix of the definitions the suite creates (and deletes). */
export const SUITE_DEFINITION_PREFIX = 'QA Automation Notification';

export const NOTIFICATION_API = {
  options: '/api/NotificationCenter/GetOptions',
  definitions: '/api/NotificationDefinition/GetDefinitions',
  definition: '/api/NotificationDefinition/GetDefinition',
  createDefinition: '/api/NotificationDefinition/CreateDefinition',
  updateDefinition: '/api/NotificationDefinition/UpdateDefinition',
  deleteDefinition: '/api/NotificationDefinition/DeleteDefinition',
  toggleDefinition: '/api/NotificationDefinition/ToggleDefinitionActivation',
  actionVariables: '/api/NotificationDefinition/GetActionVariables',
  audienceCandidates: '/api/NotificationDefinition/GetAudienceCandidates',
  appNotificationsAudit: '/api/AppNotificationsAudit/GetNotifications',
  appNotificationAudit: '/api/AppNotificationsAudit/GetNotification',
  triggerExecutions: '/api/TriggersAudit/GetTriggerExecutions',
  unreadCount: '/api/Notifications/GetUnreadCount',
} as const;

type Answer = { status: number; text: string; validationErrors: string[] };

const payload = <T>(res: Answer): T | null => {
  try {
    return (JSON.parse(res.text) as { payload?: T }).payload ?? null;
  } catch {
    return null;
  }
};

/** One notification of the signed-in user's inbox (GetMyNotifications). */
export interface InboxNotification {
  id: string;
  notificationId: string;
  /** The DEFINITION's name. */
  type: string;
  englishMessage: string;
  arabicMessage: string;
  notes: string | null;
  isSeen: boolean;
  isArchived: boolean;
  createdOn: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}

/** The signed-in user's latest notifications (POST GetMyNotifications `{ pageNumber, rowsPerPage, unreadOnly }`). */
export async function readInbox(page: Page, rows = 50): Promise<InboxNotification[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.myNotifications, { pageNumber: 1, rowsPerPage: rows, unreadOnly: false });
  return payload<{ notifications?: { items?: InboxNotification[] } }>(res)?.notifications?.items ?? [];
}

/** The inbox notifications created at or after `since` whose type (definition name) is `type`. */
export async function inboxSince(page: Page, since: Date, type?: string, rows = 100): Promise<InboxNotification[]> {
  return (await readInbox(page, rows)).filter((n) => new Date(n.createdOn).getTime() >= since.getTime() - 1_000 && (!type || n.type === type));
}

/** A variable a definition may use (GetActionVariables `{ actionId }`). */
export interface DefinitionVariable {
  id?: string;
  name: string;
  description?: string;
  isRequired: boolean;
  isSensitive: boolean;
  sensitiveDataType: string;
  maskingMode: string;
  maskKeepFirst: number;
  maskKeepLast: number;
  maskChar: string;
  sampleValue: string;
  useAsDefault: boolean;
}

export async function actionVariables(page: Page, actionId: string): Promise<DefinitionVariable[]> {
  return payload<DefinitionVariable[]>(await NetworkUtils.postAsSession(page, NOTIFICATION_API.actionVariables, { actionId })) ?? [];
}

/** What a suite definition is made of. */
export interface DefinitionSpec {
  /** Default `QA Automation Notification <stamp>`. */
  name?: string;
  moduleId: string;
  actionId: string;
  englishMessageTemplate: string;
  arabicMessageTemplate: string;
  notesTemplate?: string | null;
  description?: string | null;
  isActive?: boolean;
  /** Audience entries; default: the user `adminUserId`. */
  audiences: { audienceTypeId: string; referenceId: string; referenceName: string }[];
}

/**
 * Creates a notification definition (POST CreateDefinition - the body the
 * Definitions drawer sends) with the action's own variable list, and returns
 * the server's answer and the new id ('' when refused).
 */
export async function createDefinition(page: Page, spec: DefinitionSpec): Promise<{ answer: Answer; id: string; name: string }> {
  const name = spec.name ?? `${SUITE_DEFINITION_PREFIX} ${Date.now().toString(36)}`;
  const answer = await NetworkUtils.postAsSession(page, NOTIFICATION_API.createDefinition, {
    name,
    description: spec.description ?? null,
    isActive: spec.isActive ?? true,
    englishMessageTemplate: spec.englishMessageTemplate,
    arabicMessageTemplate: spec.arabicMessageTemplate,
    notesTemplate: spec.notesTemplate ?? null,
    moduleNameId: spec.moduleId,
    moduleActionId: spec.actionId,
    audiences: spec.audiences.map((a) => ({ ...a, appliesToAllFacilities: true, facilities: [] })),
    variableDefinitions: await actionVariables(page, spec.actionId),
  });
  let id = '';
  if (answer.status < 300) {
    const p = payload<unknown>(answer);
    id = typeof p === 'string' ? p : String((p as { id?: string } | null)?.id ?? '');
    if (!id) id = (await findDefinitionByName(page, name))?.id ?? '';
  }
  Logger.step(`[notif] CreateDefinition "${name}" answered ${answer.status}${id ? ` (id ${id})` : ''}`);
  return { answer, id, name };
}

/** The definitions list rows (POST GetDefinitions). */
export async function listDefinitions(page: Page, rows = 200): Promise<{ id: string; name: string; moduleActionEn: string; isActive: boolean }[]> {
  return payload<{ items?: { id: string; name: string; moduleActionEn: string; isActive: boolean }[] }>(
    await NetworkUtils.postAsSession(page, NOTIFICATION_API.definitions, { pageNumber: 1, rowsPerPage: rows }),
  )?.items ?? [];
}

export async function findDefinitionByName(page: Page, name: string): Promise<{ id: string; name: string } | null> {
  return (await listDefinitions(page)).find((d) => d.name === name) ?? null;
}

/** One definition in full (POST GetDefinition `{ id }`) - carries `concurrencyStamp`. */
export async function readDefinition(page: Page, id: string): Promise<Record<string, unknown> | null> {
  return payload<Record<string, unknown>>(await NetworkUtils.postAsSession(page, NOTIFICATION_API.definition, { id }));
}

/** DELETE DeleteDefinition/{id} - only for SUITE definitions (name prefix checked). */
export async function deleteSuiteDefinition(page: Page, id: string): Promise<Answer | null> {
  const def = await readDefinition(page, id);
  if (!def) return null;
  if (!String(def.name ?? '').startsWith(SUITE_DEFINITION_PREFIX)) throw new Error(`refusing to delete definition "${String(def.name)}": not a suite definition`);
  const res = await NetworkUtils.requestAsSession(page, 'DELETE', `${NOTIFICATION_API.deleteDefinition}/${id}`);
  Logger.step(`[notif] DeleteDefinition "${String(def.name)}" answered ${res.status}`);
  return res;
}

/** The delivery log rows (POST TriggersAudit/GetTriggerExecutions) - one per recipient and channel (e-mail attempts). */
export async function triggerExecutions(page: Page, rows = 50): Promise<Record<string, unknown>[]> {
  return payload<{ items?: Record<string, unknown>[] }>(await NetworkUtils.postAsSession(page, NOTIFICATION_API.triggerExecutions, { pageNumber: 1, rowsPerPage: rows }))?.items ?? [];
}

/** The admin-wide in-app notification log (POST AppNotificationsAudit/GetNotifications) - one row per notification with recipientCount. */
export async function appNotificationsAudit(page: Page, rows = 50): Promise<Record<string, unknown>[]> {
  return payload<{ items?: Record<string, unknown>[] }>(await NetworkUtils.postAsSession(page, NOTIFICATION_API.appNotificationsAudit, { pageNumber: 1, rowsPerPage: rows }))?.items ?? [];
}

/** Who a definition may target (POST GetAudienceCandidates `{ typeCode: 'users' | 'roles' }`) -> `[{ id, nameEn, nameAr }]`. */
export async function audienceCandidates(page: Page, typeCode: 'users' | 'roles' | 'permissions'): Promise<{ id: string; nameEn: string; nameAr: string }[]> {
  return payload<{ id: string; nameEn: string; nameAr: string }[]>(await NetworkUtils.postAsSession(page, NOTIFICATION_API.audienceCandidates, { typeCode })) ?? [];
}
