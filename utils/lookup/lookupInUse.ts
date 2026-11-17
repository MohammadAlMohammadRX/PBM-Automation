import type { Page } from '@playwright/test';
import { SUITE_ITEM_PREFIX, type LookupItem } from './lookupApi';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { env } from '../../constants/EnvironmentConfig';
import { UserProfilePage } from '../../pages/user/UserProfilePage';
import {
  USER_LOOKUP,
  answerText,
  assertSuiteUser,
  createSuiteRole,
  discardSuiteRole,
  discardSuiteUser,
  findUserByEmail,
  readUser,
  readUserOrNull,
  requestCreateUser,
  setUserActive,
  suiteUserDisplayName,
  updateSuiteUser,
  userBody,
  type UserBody,
} from '../UserProvisioning';

/**
 * Making a SUITE lookup item "in use" (a suite record holds it) - for the cases
 * where edit / delete must be refused, and where a record must keep showing a
 * retired value (21123, 21169, 21176, 21184, 21185, 21210 ...). Writer D,
 * 2026-11-09. Used through the `linkLookupItem` fixture, which BLOCKS the case
 * with the reason when this throws, and calls `dispose` at teardown BEFORE
 * `suiteLookupItems` deletes the item.
 *
 * The record is always a SUITE USER ("QA Automation User<stamp>",
 * qa.automation.*@example.com) holding a fresh SUITE ROLE (Users.GetUsers),
 * both built through the User module's own API (utils/UserProvisioning, the
 * calls the Add User drawer and Role Administration make). Which user field
 * holds the item depends on the list - CONSUMERS below:
 *
 * - `userDeactivationReason` (the home list; lead default): the user is created
 *   active, then deactivated with the item as its reason - POST
 *   ToggleUserActivation `{ id, isActive: false, inactivationReasonId: <item>,
 *   inactivationDetails }`, the call the Deactivate User drawer sends
 *   (pages/user/UserDeactivateDrawer). CAVEAT (read from the code and notes,
 *   not run): the reason is written but NEVER read back - GetUser's answer has
 *   no reason field (reports/user/probe: no `inactivationReason*` key in any
 *   GetUser answer) and the profile has no reason row (Roles & Status = Roles,
 *   Status, Last Login; bundle i18n `users.profile`). So `openRecord` opens a
 *   profile that shows the user Inactive but NOT the held value. Whether the
 *   server counts this reference as "in use" (refuses DeleteLookupItem /
 *   UpdateLookupItem) cannot be told from the code either: the screens have no
 *   in-use logic at all (the bundle's lookup service only calls
 *   Create/Update/DeleteLookupItem), so any refusal is server-side.
 * - `gender` (the record-display consumer, used where a case must SEE the held
 *   value): the user is created with the item as its Gender (CreateUser
 *   `genderId`), read back through GetUser (`genderId` must equal the item),
 *   and the profile shows it (Personal Information > Gender -
 *   `LINK_RECORD_FIELD`).
 *
 * `dispose` first DETACHES the item from the user (re-activation clears the
 * reason / UpdateUser puts Gender back to Male), then deletes the user and the
 * role - the user delete may be soft (GetUser 404, document ID freed), and a
 * soft-deleted row still pointing at the item would keep it undeletable.
 * Nothing but the suite's own user, role and item is ever touched; the item
 * must be a suite item (code `QA-AUTO-...`).
 */
export interface LookupItemLink {
  /** What holds the value, for messages ("suite user QA Automation User... deactivated with reason ..."). */
  description: string;
  /** Opens the record that holds the value (for "the record still shows the value"). */
  openRecord: () => Promise<void>;
  /** Removes the link (and the suite record) - called by the fixture before the item is deleted. */
  dispose: () => Promise<void>;
}

/** Where the opened record (the user profile) shows the held value - only for the lists whose value the profile displays. */
export const LINK_RECORD_FIELD: Readonly<Record<string, { section: 'personal' | 'contact'; label: string }>> = {
  gender: { section: 'personal', label: 'Gender' },
};

/** The rights of the throw-away role the linked user holds. */
const LINK_ROLE_RIGHTS = ['Users.GetUsers'] as const;
const DEACTIVATION_DETAILS = 'Held by the automation suite: a lookup item in use.';

type Consumer = (page: Page, item: LookupItem) => Promise<LookupItemLink>;

/** A suite user built for the link, with its own suite role. */
interface LinkUser {
  id: string;
  roleId: string;
  name: string;
  email: string;
}

async function onApp(page: Page): Promise<void> {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
}

/** Deletes the link user (refusing anything that is not a suite user) and then its role; throws with what was left. */
async function removeLinkUser(page: Page, user: LinkUser): Promise<void> {
  const left: string[] = [];
  const outcome = await discardSuiteUser(page, user.id).catch((e: unknown) => `left (${String(e).slice(0, 120)})`);
  if (outcome !== 'gone') left.push(`suite user ${user.name} (${user.id}): ${outcome}`);
  const role = await discardSuiteRole(page, user.roleId).catch(() => 'left');
  if (role !== 'gone') left.push(`suite role ${user.roleId}`);
  if (left.length) throw new Error(`could not remove ${left.join('; ')}`);
  Logger.step(`[linkLookupItem] Removed suite user ${user.name} and its role`);
}

/** CreateUser for a suite user holding a fresh suite role, with `overrides` on the drawer's body. Cleans up after itself when refused. */
async function createLinkUser(page: Page, overrides: Partial<UserBody>): Promise<LinkUser> {
  const role = await createSuiteRole(page, { rights: LINK_ROLE_RIGHTS });
  const body: UserBody = { ...(await userBody(page, { roles: [{ roleId: role.id, payerIds: [] }] }, true)), ...overrides };
  const res = await requestCreateUser(page, body as unknown as Record<string, unknown>);
  let id: string | undefined;
  try {
    id = (JSON.parse(res.text) as { payload?: { id?: string } }).payload?.id;
  } catch {
    id = undefined;
  }
  if (res.status >= 300 || !id) {
    const partial = await findUserByEmail(page, body.email).catch(() => null);
    if (partial) await discardSuiteUser(page, partial.id).catch(() => undefined);
    await discardSuiteRole(page, role.id).catch(() => undefined);
    throw new Error(`CreateUser for the record answered ${res.status}: ${answerText(res).slice(0, 300)}`);
  }
  return { id, roleId: role.id, name: suiteUserDisplayName(body.englishLastName), email: body.email };
}

/** Runs `step`; when it throws, removes the link user first so nothing is left behind, then rethrows. */
async function orRemove<T>(page: Page, user: LinkUser, step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    await removeLinkUser(page, user).catch((e: unknown) => Logger.warn(`[linkLookupItem] cleanup after a failed link: ${String(e)}`));
    throw error;
  }
}

/** userDeactivationReason: a suite user deactivated with the item as its reason (ToggleUserActivation, as the Deactivate drawer sends it). */
const deactivatedUser: Consumer = async (page, item) => {
  const user = await createLinkUser(page, {});
  await orRemove(page, user, async () => {
    await assertSuiteUser(page, user.id);
    const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.userToggleActivation, {
      id: user.id,
      isActive: false,
      inactivationReasonId: item.id,
      inactivationDetails: DEACTIVATION_DETAILS,
    });
    if (res.status >= 300) throw new Error(`ToggleUserActivation with reason ${item.code} answered ${res.status}: ${answerText(res).slice(0, 300)}`);
    const record = await readUser(page, user.id);
    if (record.isActive) throw new Error(`ToggleUserActivation answered ${res.status} but suite user ${user.name} is still active`);
  });
  const description = `suite user ${user.name} (${user.id}) deactivated with reason ${item.code} "${item.englishName}"`;
  Logger.step(`[linkLookupItem] ${description}`);
  return {
    description,
    openRecord: async () => {
      await new UserProfilePage(page).open(user.id);
    },
    dispose: async () => {
      await onApp(page);
      const record = await readUserOrNull(page, user.id).catch(() => null);
      if (record && !record.isActive) {
        // Activation sends inactivationReasonId null: the user no longer holds the item.
        const on = await setUserActive(page, user.id, true).catch((e: unknown) => ({ status: 0, text: String(e) }));
        if (on.status === 0 || on.status >= 300) Logger.warn(`[linkLookupItem] re-activating ${user.name} to release ${item.code} answered ${on.status}: ${on.text.slice(0, 160)}`);
      }
      await removeLinkUser(page, user);
    },
  };
};

/** gender: a suite user whose Gender is the item (CreateUser genderId); the profile shows it. */
const userWithGender: Consumer = async (page, item) => {
  const user = await createLinkUser(page, { genderId: item.id });
  await orRemove(page, user, async () => {
    const record = await readUser(page, user.id);
    if (record.genderId !== item.id) throw new Error(`CreateUser kept genderId ${record.genderId}, not the suite item ${item.id} (${item.code})`);
  });
  const description = `suite user ${user.name} (${user.id}) with Gender ${item.code} "${item.englishName}"`;
  Logger.step(`[linkLookupItem] ${description}`);
  return {
    description,
    openRecord: async () => {
      await new UserProfilePage(page).open(user.id);
    },
    dispose: async () => {
      await onApp(page);
      const record = await readUserOrNull(page, user.id).catch(() => null);
      if (record && record.genderId === item.id) {
        const back = await updateSuiteUser(page, user.id, { genderId: USER_LOOKUP.gender.male }).catch((e: unknown) => ({ status: 0, text: String(e) }));
        if (back.status === 0 || back.status >= 300) Logger.warn(`[linkLookupItem] moving ${user.name} off ${item.code} answered ${back.status}: ${back.text.slice(0, 160)}`);
      }
      await removeLinkUser(page, user);
    },
  };
};

/** The consumers the suite can create and remove, by list code. */
const CONSUMERS: Readonly<Record<string, Consumer>> = {
  userDeactivationReason: deactivatedUser,
  gender: userWithGender,
};

/** The list codes `linkLookupItemToRecord` can link (any other list -> the case is BLOCKED with this list). */
export const LINKABLE_LISTS = Object.keys(CONSUMERS);

export async function linkLookupItemToRecord(page: Page, listCode: string, item: LookupItem): Promise<LookupItemLink> {
  if (!item.code.startsWith(SUITE_ITEM_PREFIX)) throw new Error(`refusing to link ${item.code}: only suite items (${SUITE_ITEM_PREFIX}...) are put in use`);
  const consumer = CONSUMERS[listCode];
  if (!consumer) throw new Error(`no suite record can hold an item of "${listCode}" (linkable lists: ${LINKABLE_LISTS.join(', ')})`);
  await onApp(page);
  return consumer(page, item);
}
