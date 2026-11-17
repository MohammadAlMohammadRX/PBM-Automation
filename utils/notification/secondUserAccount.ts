import type { Page } from '@playwright/test';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { env } from '../../constants/EnvironmentConfig';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  USER_LOOKUP,
  findUserByEmail,
  listRoles,
  readUser,
  updateBodyOf,
  type RoleAssignment,
  type UserAnswer,
  type UserRecord,
} from '../UserProvisioning';

/**
 * The SECOND USER of the notification suite (user's decision 2026-11-11):
 * maalmohammad@neorx.co = NON_ADMIN_* in .env - Organization Administrator,
 * may NOT approve its own requests, small inbox, exempt from two-factor.
 *
 * The user allows ANY change to this account for the tests (roles, rights,
 * language), provided every change is put back and READ BACK. These helpers
 * are called from the ADMIN page (careconnect, role Admin) - they refuse any
 * other account, so they can never touch a colleague's user.
 *
 * UpdateUser is the Edit User drawer's own call (PUT identity/Users/UpdateUser,
 * the whole record + id + userName + concurrencyStamp; see updateBodyOf).
 */

/** The role the second user must ALWAYS end a test with. */
export const SECOND_USER_HOME_ROLE = 'Organization Administrator';

export interface SecondUserSnapshot {
  id: string;
  email: string;
  /** Role assignments as UpdateUser takes them. */
  roles: RoleAssignment[];
  /** Names, for messages. */
  roleNames: string[];
  preferredLanguageId: string | null;
}

/** The second user's record, read through the admin page. Throws for any other account. */
export async function readSecondUser(adminPage: Page): Promise<UserRecord> {
  const row = await findUserByEmail(adminPage, env.nonAdminUsername);
  if (!row) throw new Error(`the second user "${env.nonAdminUsername}" was not found (GetUsers)`);
  const record = await readUser(adminPage, row.id);
  if (record.email.toLowerCase() !== env.nonAdminUsername.toLowerCase()) throw new Error('refusing: the record read is not the second user');
  return record;
}

export function snapshotOf(record: UserRecord): SecondUserSnapshot {
  return {
    id: record.id,
    email: record.email,
    roles: record.assignedRoles.map((r) => ({ roleId: r.id, payerIds: r.assignedPayers.map((p) => p.id) })),
    roleNames: record.assignedRoles.map((r) => r.name),
    preferredLanguageId: record.preferredLanguageId,
  };
}

/** PUT UpdateUser on the SECOND USER only, with `changes` over its current record. */
export async function updateSecondUser(adminPage: Page, changes: { assignedRoles?: RoleAssignment[]; preferredLanguageId?: string | null }): Promise<UserAnswer> {
  const record = await readSecondUser(adminPage);
  const res = await NetworkUtils.requestAsSession(adminPage, 'PUT', ApiEndpoints.userUpdate, updateBodyOf(record, changes));
  Logger.step(`[secondUser] UpdateUser (${Object.keys(changes).join(', ')}) answered ${res.status}`);
  return res;
}

/** Same role set (ids and payer scopes), order ignored. */
export function sameRoles(a: RoleAssignment[], b: RoleAssignment[]): boolean {
  const key = (r: RoleAssignment): string => `${r.roleId}:${[...r.payerIds].sort().join(',')}`;
  return JSON.stringify(a.map(key).sort()) === JSON.stringify(b.map(key).sort());
}

/**
 * The state the second user must be put back to: the snapshot - and the
 * home role ALWAYS among its roles (a snapshot taken after an earlier broken
 * run that lost it is repaired, loudly).
 */
export async function restoreTarget(adminPage: Page, snapshot: SecondUserSnapshot): Promise<SecondUserSnapshot> {
  const home = (await listRoles(adminPage)).find((r) => r.name === SECOND_USER_HOME_ROLE);
  if (!home) throw new Error(`role "${SECOND_USER_HOME_ROLE}" not found - cannot guarantee the second user's home role`);
  if (snapshot.roles.some((r) => r.roleId === home.id)) return snapshot;
  Logger.warn(`[secondUser] The snapshot lacked "${SECOND_USER_HOME_ROLE}" (an earlier run left it) - it is put back as well`);
  return { ...snapshot, roles: [...snapshot.roles, { roleId: home.id, payerIds: [] }], roleNames: [...snapshot.roleNames, SECOND_USER_HOME_ROLE] };
}

/**
 * Restores roles + preferred language and READS THEM BACK. Throws a
 * "NOT RESTORED" error naming what is still wrong.
 */
export async function restoreSecondUser(adminPage: Page, snapshot: SecondUserSnapshot): Promise<void> {
  const target = await restoreTarget(adminPage, snapshot);
  const now = snapshotOf(await readSecondUser(adminPage));
  if (sameRoles(now.roles, target.roles) && now.preferredLanguageId === target.preferredLanguageId) return;
  const res = await updateSecondUser(adminPage, { assignedRoles: target.roles, preferredLanguageId: target.preferredLanguageId });
  if (res.status >= 300) throw new Error(`NOT RESTORED - UpdateUser answered ${res.status}: ${res.text.slice(0, 200)}`);
  const after = snapshotOf(await readSecondUser(adminPage));
  const problems: string[] = [];
  if (!sameRoles(after.roles, target.roles)) problems.push(`roles should be [${target.roleNames.join(', ')}] (now [${after.roleNames.join(', ')}])`);
  if (after.preferredLanguageId !== target.preferredLanguageId) problems.push(`preferred language should be ${target.preferredLanguageId} (now ${after.preferredLanguageId})`);
  if (problems.length) throw new Error(`NOT RESTORED - put the second user (${env.nonAdminUsername}) back by hand: ${problems.join('; ')}`);
  Logger.step(`[secondUser] Restored and read back: roles [${after.roleNames.join(', ')}], language ${after.preferredLanguageId}`);
}

/** The preferred-language lookup ids (user record). */
export const PREFERRED_LANGUAGE = USER_LOOKUP.preferredLanguage;
