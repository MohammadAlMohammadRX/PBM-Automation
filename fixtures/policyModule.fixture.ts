import { test as base } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { PolicyManagementPage } from '../pages/policy/PolicyManagementPage';
import { PolicyDetailPage } from '../pages/policy/PolicyDetailPage';
import { PolicyFormDrawer } from '../pages/policy/PolicyFormDrawer';
import { PolicyCloneDrawer } from '../pages/policy/PolicyCloneDrawer';
import { PolicyMembersTab } from '../pages/policy/PolicyMembersTab';
import { PolicyMemberDrawer } from '../pages/policy/PolicyMemberDrawer';
import { PolicyNetworksTab } from '../pages/policy/PolicyNetworksTab';
import { PolicyDocumentsTab } from '../pages/policy/PolicyDocumentsTab';
import { PolicyDocumentDrawer } from '../pages/policy/PolicyDocumentDrawer';
import { PolicyVersionHistoryTab } from '../pages/policy/PolicyVersionHistoryTab';
import { PolicyAuditTab } from '../pages/policy/PolicyAuditTab';
import { PolicyInactivateDrawer } from '../pages/policy/PolicyInactivateDrawer';
import { PolicyImportDialog } from '../pages/policy/PolicyImportDialog';
import { PolicyBenefitResetsPage, PolicyResetDrawer } from '../pages/policy/PolicyBenefitResetsPage';
import { MemberAccumulatorPage } from '../pages/policy/MemberAccumulatorPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { blockedByPrecondition } from './testStatus.fixture';
import { env } from '../constants/EnvironmentConfig';
import { AUTH_STORAGE_STATE_PATH } from '../constants/Paths';
import { DEFAULT_VIEWPORT } from '../constants/BrowserConfig';
import { POLICY_FORM, POLICY_IMPORT } from '../constants/ElementIds';
import { Logger } from '../utils/Logger';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';
import {
  SUITE_POLICY_PREFIX,
  discardSuitePolicy,
  findPolicyByName,
  provisionSuitePolicy,
  type PolicyState,
  type ProvisionedPolicy,
  type SuitePolicySpec,
} from '../utils/PolicyProvisioning';

/** A second window on a policy screen - the concurrent-edit cases. */
export interface PolicySecondWindow {
  page: Page;
  policies: PolicyManagementPage;
  detail: PolicyDetailPage;
  form: PolicyFormDrawer;
}

export interface PolicyModuleFixtures {
  /**
   * The detail screen. The LIST is `policyManagementPage` (auth.fixture - the
   * same class, extended for this module).
   */
  policyDetailPage: PolicyDetailPage;
  /** The Add / Edit drawer (`policy-form-drawer`); the list's Clone also opens in it (PolicyManagementPage.openCloneDrawer). */
  policyFormDrawer: PolicyFormDrawer;
  /** The detail's Clone drawer (`policy-clone-drawer`). */
  policyCloneDrawer: PolicyCloneDrawer;
  policyMembersTab: PolicyMembersTab;
  policyMemberDrawer: PolicyMemberDrawer;
  policyNetworksTab: PolicyNetworksTab;
  policyDocumentsTab: PolicyDocumentsTab;
  policyDocumentDrawer: PolicyDocumentDrawer;
  policyVersionHistoryTab: PolicyVersionHistoryTab;
  policyAuditTab: PolicyAuditTab;
  policyInactivateDrawer: PolicyInactivateDrawer;
  /** The list's Import drawer; the Members / Network tabs open theirs through their tab objects. */
  policyImportDialog: PolicyImportDialog;
  /** The shared confirmation dialog (`#pbm-dialog`) - Send for Approval, Delete, Remove, Activate, Reject. */
  policyConfirmDialog: ConfirmDialog;
  /** The approvals hub's Policy tab (`approvals-policy-*`). */
  policyApprovalsPage: ApprovalManagementPage;
  /** System Settings > Policy Benefit Resets. */
  policyBenefitResetsPage: PolicyBenefitResetsPage;
  policyResetDrawer: PolicyResetDrawer;
  /** A member's Member Benefit Accumulator page. */
  memberAccumulatorPage: MemberAccumulatorPage;
  /**
   * Builds a suite policy ("QA Automation Policy ...", payer "Al sharq", on the
   * suite plan) in `state` - with members, a network and documents as `spec`
   * asks (utils/PolicyProvisioning provisionSuitePolicy) - and DISCARDS it at
   * teardown whatever the case did to it. BLOCKED, with the server's answer,
   * when the application refuses a step. 'Active' claims an Active seed
   * (`npm run seed:policy` the day before) and is BLOCKED when none is left.
   */
  policyIn: (state: PolicyState, spec?: SuitePolicySpec) => Promise<ProvisionedPolicy>;
  /** Registers a policy the CASE creates through the screen, by name, for teardown. Suite names only. */
  discardPolicyNamed: (name: string) => void;
  /** Registers a policy the case creates, by id (a clone, an imported one), for teardown. */
  discardPolicyId: (id: string) => void;
  /** A second TAB of the administrator session (same context), closed at teardown. */
  policySecondWindow: () => Promise<PolicySecondWindow>;
  /** A second, separate browser CONTEXT signed in as the administrator (its own storage), closed at teardown. */
  policySecondSession: () => Promise<PolicySecondWindow>;
}

export const test = base.extend<PolicyModuleFixtures>({
  policyDetailPage: async ({ page }, use) => {
    await use(new PolicyDetailPage(page));
  },

  policyFormDrawer: async ({ page }, use) => {
    await use(new PolicyFormDrawer(page, POLICY_FORM.add));
  },

  policyCloneDrawer: async ({ page }, use) => {
    await use(new PolicyCloneDrawer(page, POLICY_FORM.clone));
  },

  policyMembersTab: async ({ page }, use) => {
    await use(new PolicyMembersTab(page));
  },

  policyMemberDrawer: async ({ page }, use) => {
    await use(new PolicyMemberDrawer(page));
  },

  policyNetworksTab: async ({ page }, use) => {
    await use(new PolicyNetworksTab(page));
  },

  policyDocumentsTab: async ({ page }, use) => {
    await use(new PolicyDocumentsTab(page));
  },

  policyDocumentDrawer: async ({ page }, use) => {
    await use(new PolicyDocumentDrawer(page));
  },

  policyVersionHistoryTab: async ({ page }, use) => {
    await use(new PolicyVersionHistoryTab(page));
  },

  policyAuditTab: async ({ page }, use) => {
    await use(new PolicyAuditTab(page));
  },

  policyInactivateDrawer: async ({ page }, use) => {
    await use(new PolicyInactivateDrawer(page));
  },

  policyImportDialog: async ({ page }, use) => {
    await use(new PolicyImportDialog(page, POLICY_IMPORT.list));
  },

  policyConfirmDialog: async ({ page }, use) => {
    await use(new ConfirmDialog(page));
  },

  policyApprovalsPage: async ({ page }, use) => {
    await use(new ApprovalManagementPage(page, 'policy'));
  },

  policyBenefitResetsPage: async ({ page }, use) => {
    await use(new PolicyBenefitResetsPage(page));
  },

  policyResetDrawer: async ({ page }, use) => {
    await use(new PolicyResetDrawer(page));
  },

  memberAccumulatorPage: async ({ page }, use) => {
    await use(new MemberAccumulatorPage(page));
  },

  policyIn: async ({ page }, use, testInfo) => {
    const built: string[] = [];
    await use(async (state, spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        // Registered BEFORE it is finished, so a step refused half-way still discards what was built.
        const nameEn = spec.nameEn ?? `${SUITE_POLICY_PREFIX} ${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
        const policy = await provisionSuitePolicy(page, state, { ...spec, nameEn }).catch(async (error: unknown) => {
          const partial = await findPolicyByName(page, nameEn).catch(() => null);
          if (partial) built.push(partial.id);
          throw error;
        });
        built.push(policy.id);
        return policy;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a policy in state ${state} ${JSON.stringify(spec).slice(0, 160)}`, error);
      }
    });
    for (const id of [...built].reverse()) await discardSuitePolicy(page, id);
  },

  discardPolicyNamed: async ({ page }, use) => {
    const names: string[] = [];
    await use((name) => {
      if (!name.startsWith(SUITE_POLICY_PREFIX)) throw new Error(`"${name}" is not a suite policy name (prefix "${SUITE_POLICY_PREFIX}")`);
      names.push(name);
    });
    for (const name of names) {
      const found = await findPolicyByName(page, name).catch(() => null);
      if (found) {
        Logger.step(`[fixture] Discarding the case's policy "${name}"`);
        await discardSuitePolicy(page, found.id);
      }
    }
  },

  discardPolicyId: async ({ page }, use) => {
    const ids: string[] = [];
    await use((id) => ids.push(id));
    for (const id of ids.reverse()) await discardSuitePolicy(page, id);
  },

  policySecondWindow: async ({ page }, use, testInfo) => {
    const opened: Page[] = [];
    await use(async () => {
      const second = await page.context().newPage();
      opened.push(second);
      ScreenshotUtils.registerSession(testInfo, second);
      return { page: second, policies: new PolicyManagementPage(second), detail: new PolicyDetailPage(second), form: new PolicyFormDrawer(second, POLICY_FORM.add) };
    });
    for (const second of opened) await second.close().catch(() => undefined);
  },

  policySecondSession: async ({ browser }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({ storageState: AUTH_STORAGE_STATE_PATH, viewport: DEFAULT_VIEWPORT });
      contexts.push(context);
      const second = await context.newPage();
      ScreenshotUtils.registerSession(testInfo, second);
      await second.goto(env.baseUrl);
      return { page: second, policies: new PolicyManagementPage(second), detail: new PolicyDetailPage(second), form: new PolicyFormDrawer(second, POLICY_FORM.add) };
    });
    for (const context of contexts) await context.close().catch(() => undefined);
  },
});
