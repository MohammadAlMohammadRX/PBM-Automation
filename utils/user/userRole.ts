import { test as base, expect } from '../../fixtures';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import type { SuiteSession, SuiteSessionSpec } from '../../fixtures/userModule.fixture';
import { currentPermissions, updateSuiteRoleRights, USER_RIGHTS } from '../UserProvisioning';
import { Logger } from '../Logger';

/**
 * The ONE restricted-role helper of the User Management suite (every folder
 * that needs an account with or without a Users / Invitations / Settings right
 * imports `test` from THIS file - no per-writer copies).
 *
 * UNLIKE the earlier modules it does NOT reshape the shared "Payer Admin"
 * role: the foundation proved on 2026-11-08 that the suite can create its own
 * role ("QA Automation Role <stamp>") with exactly the rights a case needs,
 * create a user holding it, give that user a password through the reset flow,
 * and sign it in - and that a role edit reaches the signed-in user AT ONCE
 * (GetCurrentUserRolesAndPermissions, same session). So the shape is built
 * from scratch per case and thrown away at teardown; nothing shared is touched.
 *
 * Rights are permission KEYS (`Users.DeleteUser`, `Invitations.CreateInvitation`,
 * `SystemSettings.UpdatePasswordPolicy` ...; USER_RIGHTS in UserProvisioning).
 * `full` = every key in USER_RIGHTS. The screen gates are verified: without
 * Users.CreateUser there is no Add User; without Update / Toggle / Delete the
 * row offers only View.
 *
 * Evidence, never a verdict: a withheld right the account is still told it
 * holds is annotated `permission-not-propagated`, a granted one it is not told
 * it holds `permission-not-granted`; `requireShapeApplied` BLOCKS the case then.
 */

/** What a case needs the account to hold / lack. */
export interface UserRoleShape {
  /** Start from every user-module right (true) or from none (false, default). */
  full?: boolean;
  /** Rights to add. */
  with?: readonly string[];
  /** Rights to remove (from `full`, or from `with`). */
  without?: readonly string[];
  /** Payer names - makes the role payer-scoped and assigns these payers. */
  payers?: readonly string[];
  /** Role ids the role may assign (Add User / Add Invitation role lists). */
  assignableRoleIds?: string[];
}

/** The signed-in account with its shape and the evidence of what it holds. */
export interface UserRoleSession extends SuiteSession {
  rights: string[];
  /** Withheld rights the account is STILL told it holds. */
  stillHeld: string[];
  /** Granted rights the account is NOT told it holds. */
  notGranted: string[];
}

export interface UserRoleControl {
  /** Builds the role + user for `shape` and signs it in (second window). */
  signIn: (shape: UserRoleShape) => Promise<UserRoleSession>;
  /** Changes the rights of a session's role (they reach the signed-in user at once); returns the new evidence. */
  reshape: (session: UserRoleSession, shape: UserRoleShape) => Promise<UserRoleSession>;
}

export interface UserRoleFixtures {
  userRole: UserRoleControl;
  /** BLOCKS the case when the role shape did not reach the signed-in account (with the evidence). */
  requireShapeApplied: (session: UserRoleSession) => void;
}

/** The rights a shape resolves to. */
export function rightsOf(shape: UserRoleShape): string[] {
  const base = shape.full ? [...USER_RIGHTS] : [];
  const set = new Set<string>([...base, ...(shape.with ?? [])]);
  for (const r of shape.without ?? []) set.delete(r);
  return [...set];
}

export const test = base.extend<UserRoleFixtures>({
  userRole: async ({ suiteSession, page }, use, testInfo) => {
    const evidence = async (session: SuiteSession, rights: string[], shape: UserRoleShape): Promise<UserRoleSession> => {
      const held = await currentPermissions(session.page).catch(() => [] as string[]);
      const stillHeld = (shape.without ?? []).filter((r) => held.includes(r));
      const notGranted = rights.filter((r) => held.length > 0 && !held.includes(r));
      if (stillHeld.length) testInfo.annotations.push({ type: 'permission-not-propagated', description: `withheld but still held: ${stillHeld.join(', ')}` });
      if (notGranted.length) testInfo.annotations.push({ type: 'permission-not-granted', description: `granted but not held: ${notGranted.join(', ')}` });
      return { ...session, rights, stillHeld, notGranted };
    };

    await use({
      signIn: async (shape) => {
        const rights = rightsOf(shape);
        Logger.step(`[userRole] Suite role with ${rights.length} rights${shape.payers?.length ? ` scoped to ${shape.payers.join(', ')}` : ''}`);
        const spec: SuiteSessionSpec = { rights, payers: shape.payers, assignableRoleIds: shape.assignableRoleIds };
        return evidence(await suiteSession(spec), rights, shape);
      },
      reshape: async (session, shape) => {
        const rights = rightsOf(shape);
        const res = await updateSuiteRoleRights(page, session.role.id, rights);
        if (res.status >= 300) blockedByPrecondition(testInfo, `the suite role "${session.role.name}" reshaped`, new Error(`UpdateRole answered ${res.status} ${res.text.slice(0, 200)}`));
        await session.page.reload();
        return evidence(session, rights, shape);
      },
    });
  },

  requireShapeApplied: async ({}, use, testInfo) => {
    await use((session) => {
      const gaps = [
        ...session.stillHeld.map((r) => `permission-not-propagated: ${r} withheld but still held`),
        ...session.notGranted.map((r) => `permission-not-granted: ${r} granted but not held`),
      ];
      if (gaps.length === 0) return;
      blockedByPrecondition(testInfo, 'a suite account whose role shape has taken effect', new Error(gaps.join('; ')));
    });
  },
});

export { expect };
