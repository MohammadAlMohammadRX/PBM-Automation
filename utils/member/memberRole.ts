import type { BrowserContext, Page } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { RoleAdministrationPage } from '../../pages/system/RoleAdministrationPage';
import type { RolePermissionsStep } from '../../pages/system/RolePermissionsStep';
import { MemberManagementPage } from '../../pages/member/MemberManagementPage';
import { MemberDetailPage } from '../../pages/member/MemberDetailPage';
import { MemberCobTab } from '../../pages/member/MemberCobTab';
import { MemberAccumulatorDashboardTab } from '../../pages/member/MemberAccumulatorDashboardTab';
import { MemberImportDrawer } from '../../pages/member/MemberImportDrawer';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { PAYER_ADMIN_ROLE } from '../../data/accounts/payerAdminRole.data';
import { ALL_MEMBER_RIGHTS, MEMBER_RIGHT, memberRightCode, type MemberShape } from '../../data/member/memberPermissions.data';
import { readEffectivePermissions } from '../EffectivePermissions';
import { Logger } from '../Logger';

/**
 * The ONE restricted-user helper of the member suite (every folder that needs a
 * user with or without a member right imports `test` from THIS file - no
 * per-writer copies). Built as the Policy suite's `policyRole`
 * (utils/policy/policyRole.ts): the member rights are toggled by catalogue LABEL
 * (data/member/memberPermissions.data.ts) on the SAME "Payer Admin" role,
 * restored exactly at teardown (a snapshot of every member right, parents
 * first), and the account signed in through shapedNonAdmin({}).
 *
 * Evidence, never a verdict: a withheld right the signed-in account is still
 * told it holds is annotated `permission-not-propagated`, a granted one it is
 * not told it holds `permission-not-granted` (utils/EffectivePermissions.ts).
 * In Policy and Facility (2026-11-04) role edits did not reach the signed-in
 * Payer Admin - a case that needs the shape to have taken effect calls
 * `requireShapeApplied`, which BLOCKS it with that evidence.
 */

/** The Payer Admin account, shaped for a member case, signed in. */
export interface MemberSession {
  page: Page;
  members: MemberManagementPage;
  detail: MemberDetailPage;
  cob: MemberCobTab;
  accumulator: MemberAccumulatorDashboardTab;
  importDrawer: MemberImportDrawer;
  removed: string[];
  granted: string[];
  /** Withheld rights the account is STILL told it holds. */
  stillHeld: string[];
  /** Granted rights the account is NOT told it holds. */
  notGranted: string[];
}

export interface MemberRoleControl {
  /** Shapes the role (grants first, then withholds), saves, and signs a FRESH Payer Admin session in. */
  signIn: (shape: MemberShape) => Promise<MemberSession>;
  /** Shapes the role without signing anyone in. */
  reshape: (shape: MemberShape) => Promise<{ removed: string[]; granted: string[] }>;
  /** Opens the Payer Admin role's permission catalogue in the fixture's administrator window. */
  openCatalogue: () => Promise<RolePermissionsStep>;
}

export interface MemberRoleFixtures {
  memberRole: MemberRoleControl;
  /** BLOCKS the case unless the shaped account can still list members (the parent-right trap). */
  requireMemberListAccess: (session: MemberSession) => Promise<void>;
  /** BLOCKS the case when the role edit did not reach the signed-in account (with the evidence). */
  requireShapeApplied: (session: MemberSession) => void;
}

export const test = base.extend<MemberRoleFixtures>({
  memberRole: async ({ browser, shapedNonAdmin }, use, testInfo) => {
    let adminContext: BrowserContext | null = null;
    let roles: RoleAdministrationPage | null = null;
    let snapshot: Map<string, boolean> | null = null;
    let touched = false;

    const adminRoles = async (): Promise<RoleAdministrationPage> => {
      if (roles === null) {
        adminContext = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
        roles = new RoleAdministrationPage(await adminContext.newPage());
      }
      return roles;
    };

    const openCatalogue = async (): Promise<RolePermissionsStep> => {
      const step = await (await adminRoles()).openPermissionCatalogue(PAYER_ADMIN_ROLE);
      if (snapshot === null) {
        snapshot = new Map();
        for (const right of ALL_MEMBER_RIGHTS) {
          const label = MEMBER_RIGHT[right];
          const checked = await step.isPermissionChecked(label).catch(() => null);
          if (checked !== null) snapshot.set(label, checked);
        }
      }
      return step;
    };

    /** Sets each label to its wanted state; saves when anything moved. */
    const setLabels = async (entries: ReadonlyArray<{ label: string; wanted: boolean }>): Promise<string[]> => {
      if (entries.length === 0) return [];
      const step = await openCatalogue();
      const moved: string[] = [];
      for (const { label, wanted } of entries) {
        if ((await step.isPermissionChecked(label)) === wanted) continue;
        await step.togglePermission(label);
        moved.push(label);
      }
      if (moved.length === 0) await (await adminRoles()).closeDrawer().catch(() => undefined);
      else {
        await (await adminRoles()).saveRole();
        touched = true;
      }
      return moved;
    };

    const reshape = async (shape: MemberShape): Promise<{ removed: string[]; granted: string[] }> => {
      // GRANTS FIRST: a granted parent (GetMembers) ticks every child.
      const wanted = [
        ...(shape.with ?? []).map((right) => ({ label: MEMBER_RIGHT[right], wanted: true })),
        ...(shape.without ?? []).map((right) => ({ label: MEMBER_RIGHT[right], wanted: false })),
      ];
      testInfo.setTimeout(testInfo.timeout + 120_000);
      try {
        Logger.step(`[memberRole] Shaping "${PAYER_ADMIN_ROLE}": ${wanted.map((w) => `${w.wanted ? '+' : '-'}${w.label}`).join(', ')}`);
        await setLabels(wanted);
      } catch (error) {
        blockedByPrecondition(testInfo, `the "${PAYER_ADMIN_ROLE}" role shaped with member rights ${JSON.stringify(shape)}`, error);
      }
      return { removed: (shape.without ?? []).map((r) => MEMBER_RIGHT[r]), granted: (shape.with ?? []).map((r) => MEMBER_RIGHT[r]) };
    };

    const signIn = async (shape: MemberShape): Promise<MemberSession> => {
      const { removed, granted } = await reshape(shape);
      const shaped = await shapedNonAdmin({});
      const page = shaped.page;
      const effective = await readEffectivePermissions(page).catch(() => [] as string[]);
      const stillHeld = (shape.without ?? []).map(memberRightCode).filter((code) => effective.includes(code));
      if (stillHeld.length > 0) {
        const note = `the role no longer holds ${stillHeld.join(', ')}, yet the signed-in Payer Admin is still told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-propagated', description: note });
      }
      const notGranted = (shape.with ?? []).map(memberRightCode).filter((code) => effective.length > 0 && !effective.includes(code));
      if (notGranted.length > 0) {
        const note = `the role holds ${notGranted.join(', ')}, yet the signed-in Payer Admin is not told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-granted', description: note });
      }
      return {
        page,
        members: new MemberManagementPage(page),
        detail: new MemberDetailPage(page),
        cob: new MemberCobTab(page),
        accumulator: new MemberAccumulatorDashboardTab(page),
        importDrawer: new MemberImportDrawer(page),
        removed,
        granted,
        stillHeld,
        notGranted,
      };
    };

    await use({ signIn, reshape, openCatalogue });

    // ---- teardown: the shared role back exactly as it was found (not swallowed) ----
    if (touched && snapshot !== null) {
      Logger.step(`[memberRole] Restoring "${PAYER_ADMIN_ROLE}"`);
      await setLabels([...(snapshot as Map<string, boolean>).entries()].map(([label, original]) => ({ label, wanted: original })));
    }
    if (adminContext !== null) await (adminContext as BrowserContext).close();
  },

  requireMemberListAccess: async ({}, use, testInfo) => {
    await use(async (session) => {
      if (await session.members.canListMembers()) return;
      blockedByPrecondition(
        testInfo,
        'a shaped Payer Admin that can still list members',
        new Error('the shaped account is refused GetMembers - in this catalogue GetMembers is the parent of every member right, '
          + 'so withholding one of them can take the list away, and a role that may view members but lacks this one right cannot be built'),
      );
    });
  },

  requireShapeApplied: async ({}, use, testInfo) => {
    await use((session) => {
      const gaps = [
        ...session.stillHeld.map((code) => `permission-not-propagated: ${code} withheld but still held`),
        ...session.notGranted.map((code) => `permission-not-granted: ${code} granted but not held`),
      ];
      if (gaps.length === 0) return;
      blockedByPrecondition(testInfo, 'a shaped Payer Admin whose role change has taken effect', new Error(gaps.join('; ')));
    });
  },
});

export { expect };
