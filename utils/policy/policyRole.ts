import type { BrowserContext, Page } from '@playwright/test';
import { test as base, expect } from '../../fixtures';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import { RoleAdministrationPage } from '../../pages/system/RoleAdministrationPage';
import type { RolePermissionsStep } from '../../pages/system/RolePermissionsStep';
import { PolicyManagementPage } from '../../pages/policy/PolicyManagementPage';
import { PolicyDetailPage } from '../../pages/policy/PolicyDetailPage';
import { PolicyMembersTab } from '../../pages/policy/PolicyMembersTab';
import { PolicyNetworksTab } from '../../pages/policy/PolicyNetworksTab';
import { PolicyDocumentsTab } from '../../pages/policy/PolicyDocumentsTab';
import { PolicyVersionHistoryTab } from '../../pages/policy/PolicyVersionHistoryTab';
import { PolicyAuditTab } from '../../pages/policy/PolicyAuditTab';
import { PolicyBenefitResetsPage } from '../../pages/policy/PolicyBenefitResetsPage';
import { ApprovalManagementPage } from '../../pages/approval/ApprovalManagementPage';
import { AUTH_STORAGE_STATE_PATH } from '../../constants/Paths';
import { DEFAULT_VIEWPORT } from '../../constants/BrowserConfig';
import { PAYER_ADMIN_ROLE } from '../../data/accounts/payerAdminRole.data';
import { ALL_POLICY_RIGHTS, POLICY_RIGHT, policyRightCode, type PolicyShape } from '../../data/policy/policyPermissions.data';
import { readEffectivePermissions } from '../EffectivePermissions';
import { Logger } from '../Logger';

/**
 * The permission story's fixtures (US 15189, policy folder 18), built as the
 * Formulary suite's `formularyRole` (utils/formulary/writerCHelpers.ts): the
 * shared shaping fixture (fixtures/shapedNonAdmin.fixture.ts) only knows the
 * keys of data/accounts/payerAdminRole.data.ts, which has no policy section, so
 * the policy rights are toggled by catalogue LABEL (data/policy/policyPermissions.data.ts)
 * on the SAME "Payer Admin" role, restored exactly at teardown (a snapshot of
 * every policy right, parents first), and the account signed in through
 * shapedNonAdmin({}). Specs that need it import `test` from THIS file.
 *
 * Evidence, never a verdict: a withheld right the signed-in account is still
 * told it holds is annotated `permission-not-propagated`, a granted one it is
 * not told it holds `permission-not-granted` (utils/EffectivePermissions.ts).
 */

/** The Payer Admin account, shaped for a policy case, signed in. */
export interface PolicySession {
  page: Page;
  policies: PolicyManagementPage;
  detail: PolicyDetailPage;
  members: PolicyMembersTab;
  networks: PolicyNetworksTab;
  documents: PolicyDocumentsTab;
  versions: PolicyVersionHistoryTab;
  audit: PolicyAuditTab;
  resets: PolicyBenefitResetsPage;
  approvals: ApprovalManagementPage;
  removed: string[];
  granted: string[];
  /** Withheld rights the account is STILL told it holds. */
  stillHeld: string[];
}

export interface PolicyRoleControl {
  /** Shapes the role (grants first, then withholds), saves, and signs a FRESH Payer Admin session in. */
  signIn: (shape: PolicyShape) => Promise<PolicySession>;
  /** Shapes the role without signing anyone in. */
  reshape: (shape: PolicyShape) => Promise<{ removed: string[]; granted: string[] }>;
  /** Opens the Payer Admin role's permission catalogue in the fixture's administrator window. */
  openCatalogue: () => Promise<RolePermissionsStep>;
}

export interface PolicyRoleFixtures {
  policyRole: PolicyRoleControl;
  /** BLOCKS the case unless the shaped account can still list policies (the parent-right trap). */
  requirePolicyListAccess: (session: PolicySession) => Promise<void>;
}

export const test = base.extend<PolicyRoleFixtures>({
  policyRole: async ({ browser, shapedNonAdmin }, use, testInfo) => {
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
        for (const right of ALL_POLICY_RIGHTS) {
          const label = POLICY_RIGHT[right];
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

    const reshape = async (shape: PolicyShape): Promise<{ removed: string[]; granted: string[] }> => {
      // GRANTS FIRST: a granted parent (GetPolicies) ticks every child.
      const wanted = [
        ...(shape.with ?? []).map((right) => ({ label: POLICY_RIGHT[right], wanted: true })),
        ...(shape.without ?? []).map((right) => ({ label: POLICY_RIGHT[right], wanted: false })),
      ];
      testInfo.setTimeout(testInfo.timeout + 120_000);
      try {
        Logger.step(`[policyRole] Shaping "${PAYER_ADMIN_ROLE}": ${wanted.map((w) => `${w.wanted ? '+' : '-'}${w.label}`).join(', ')}`);
        await setLabels(wanted);
      } catch (error) {
        blockedByPrecondition(testInfo, `the "${PAYER_ADMIN_ROLE}" role shaped with policy rights ${JSON.stringify(shape)}`, error);
      }
      return { removed: (shape.without ?? []).map((r) => POLICY_RIGHT[r]), granted: (shape.with ?? []).map((r) => POLICY_RIGHT[r]) };
    };

    const signIn = async (shape: PolicyShape): Promise<PolicySession> => {
      const { removed, granted } = await reshape(shape);
      const shaped = await shapedNonAdmin({});
      const page = shaped.page;
      const effective = await readEffectivePermissions(page).catch(() => [] as string[]);
      const stillHeld = (shape.without ?? []).map(policyRightCode).filter((code) => code !== '' && effective.includes(code));
      if (stillHeld.length > 0) {
        const note = `the role no longer holds ${stillHeld.join(', ')}, yet the signed-in Payer Admin is still told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-propagated', description: note });
      }
      const notGranted = (shape.with ?? []).map(policyRightCode).filter((code) => code !== '' && effective.length > 0 && !effective.includes(code));
      if (notGranted.length > 0) {
        const note = `the role holds ${notGranted.join(', ')}, yet the signed-in Payer Admin is not told it does`;
        Logger.warn(note);
        testInfo.annotations.push({ type: 'permission-not-granted', description: note });
      }
      return {
        page,
        policies: new PolicyManagementPage(page),
        detail: new PolicyDetailPage(page),
        members: new PolicyMembersTab(page),
        networks: new PolicyNetworksTab(page),
        documents: new PolicyDocumentsTab(page),
        versions: new PolicyVersionHistoryTab(page),
        audit: new PolicyAuditTab(page),
        resets: new PolicyBenefitResetsPage(page),
        approvals: new ApprovalManagementPage(page, 'policy'),
        removed,
        granted,
        stillHeld,
      };
    };

    await use({ signIn, reshape, openCatalogue });

    // ---- teardown: the shared role back exactly as it was found (not swallowed) ----
    if (touched && snapshot !== null) {
      Logger.step(`[policyRole] Restoring "${PAYER_ADMIN_ROLE}"`);
      await setLabels([...(snapshot as Map<string, boolean>).entries()].map(([label, original]) => ({ label, wanted: original })));
    }
    if (adminContext !== null) await (adminContext as BrowserContext).close();
  },

  requirePolicyListAccess: async ({}, use, testInfo) => {
    await use(async (session) => {
      if (await session.policies.canListPolicies()) return;
      blockedByPrecondition(
        testInfo,
        'a restricted Payer Admin role that can still list policies',
        new Error('the shaped account is refused GetPolicies - in this catalogue GetPolicies is the parent of every policy right, '
          + 'so withholding one of them can take the list away, and a role that may view policies but lacks this one right cannot be built'),
      );
    });
  },
});

export { expect };
