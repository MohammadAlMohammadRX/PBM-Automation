import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FormularyManagementPage } from '../pages/formulary/FormularyManagementPage';
import { FormularyDetailPage } from '../pages/formulary/FormularyDetailPage';
import { FormularyFormDrawer } from '../pages/formulary/FormularyFormDrawer';
import { FormularyTiersTab } from '../pages/formulary/FormularyTiersTab';
import { FormularyTierDrawer } from '../pages/formulary/FormularyTierDrawer';
import { FormularyTradesTab } from '../pages/formulary/FormularyTradesTab';
import { FormularyAddTradeDrawer } from '../pages/formulary/FormularyAddTradeDrawer';
import { FormularyPriceHistoryDrawer } from '../pages/formulary/FormularyPriceHistoryDrawer';
import { BenefitConfigDrawer } from '../pages/formulary/BenefitConfigDrawer';
import { FormularyVersionHistoryTab } from '../pages/formulary/FormularyVersionHistoryTab';
import { FormularyAuditTab } from '../pages/formulary/FormularyAuditTab';
import { FormularyCloneDrawer } from '../pages/formulary/FormularyCloneDrawer';
import { FormularyImportDialog } from '../pages/formulary/FormularyImportDialog';
import { FormularyDeactivateDrawer } from '../pages/formulary/FormularyDeactivateDrawer';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { blockedByPrecondition } from './testStatus.fixture';
import { env } from '../constants/EnvironmentConfig';
import { FORMULARY_CLONE, FORMULARY_DEACTIVATE, FORMULARY_IMPORT } from '../constants/ElementIds';
import { Logger } from '../utils/Logger';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';
import {
  SUITE_FORMULARY_PREFIX,
  discardSuiteFormulary,
  findFormularyByName,
  provisionSuiteFormulary,
  type FormularyState,
  type ProvisionedFormulary,
  type SuiteFormularySpec,
} from '../utils/FormularyProvisioning';

/** A second window of the SAME administrator session - for the concurrent-edit cases. */
export interface FormularySecondWindow {
  page: Page;
  formularies: FormularyManagementPage;
  detail: FormularyDetailPage;
}

export interface FormularyModuleFixtures {
  /** The list (`/formulary-pricing`). The detail screen is `formularyDetailPage` (planFormularyState.fixture, the same class). */
  formularyManagementPage: FormularyManagementPage;
  /**
   * The drawers, tabs and dialogs, as fixtures: each wraps the page only (no
   * state), so a case opens one through its screen and drives it here.
   */
  formularyFormDrawer: FormularyFormDrawer;
  formularyTiersTab: FormularyTiersTab;
  formularyTierDrawer: FormularyTierDrawer;
  formularyTradesTab: FormularyTradesTab;
  formularyAddTradeDrawer: FormularyAddTradeDrawer;
  formularyPriceHistoryDrawer: FormularyPriceHistoryDrawer;
  benefitConfigDrawer: BenefitConfigDrawer;
  formularyVersionHistoryTab: FormularyVersionHistoryTab;
  formularyAuditTab: FormularyAuditTab;
  /** The detail screen's Clone drawer (`formulary-clone-dialog`). */
  formularyCloneDrawer: FormularyCloneDrawer;
  /** The list's Import drawer; the Tiers / Trades tabs open theirs through FormularyTiersTab / FormularyTradesTab.openImport. */
  formularyImportDialog: FormularyImportDialog;
  /** The detail screen's Deactivate drawer; the list's is reached through FormularyManagementPage.openDeactivateDrawer. */
  formularyDeactivateDrawer: FormularyDeactivateDrawer;
  /** The shared confirmation dialog (`#pbm-dialog`) - Send for Approval, Delete, Suspend, Activate, Reject. */
  formularyConfirmDialog: ConfirmDialog;
  /** The approvals hub's Formulary tab (`approvals-formulary-*`). */
  formularyApprovalsPage: ApprovalManagementPage;
  /**
   * Builds a suite formulary ("QA Automation Formulary ...", payer "Al sharq")
   * in `state` - with tiers, trades (MED-001..003), a rebate, extra price
   * periods and benefit configurations as `spec` asks (utils/FormularyProvisioning
   * provisionSuiteFormulary) - and discards it at teardown, whatever state the
   * case left it in. BLOCKED, with the server's answer, when the application
   * refuses a step. Live states (Active, Inactive, PendingChange, DraftChange)
   * take about three minutes: see promoteToActive.
   */
  formularyIn: (state: FormularyState, spec?: SuiteFormularySpec) => Promise<ProvisionedFormulary>;
  /** Registers a formulary the CASE creates (through the screen), by name, so it is discarded at teardown. Suite names only. */
  discardFormularyNamed: (name: string) => void;
  /** Registers a formulary the case creates, by id (a clone, an imported one), for teardown. */
  discardFormularyId: (id: string) => void;
  /** A second window of the administrator session, closed at teardown. */
  formularySecondWindow: () => Promise<FormularySecondWindow>;
}

export const test = base.extend<FormularyModuleFixtures>({
  formularyManagementPage: async ({ page }, use) => {
    await use(new FormularyManagementPage(page));
  },

  formularyFormDrawer: async ({ page }, use) => {
    await use(new FormularyFormDrawer(page));
  },

  formularyTiersTab: async ({ page }, use) => {
    await use(new FormularyTiersTab(page));
  },

  formularyTierDrawer: async ({ page }, use) => {
    await use(new FormularyTierDrawer(page));
  },

  formularyTradesTab: async ({ page }, use) => {
    await use(new FormularyTradesTab(page));
  },

  formularyAddTradeDrawer: async ({ page }, use) => {
    await use(new FormularyAddTradeDrawer(page));
  },

  formularyPriceHistoryDrawer: async ({ page }, use) => {
    await use(new FormularyPriceHistoryDrawer(page));
  },

  benefitConfigDrawer: async ({ page }, use) => {
    await use(new BenefitConfigDrawer(page));
  },

  formularyVersionHistoryTab: async ({ page }, use) => {
    await use(new FormularyVersionHistoryTab(page));
  },

  formularyAuditTab: async ({ page }, use) => {
    await use(new FormularyAuditTab(page));
  },

  formularyCloneDrawer: async ({ page }, use) => {
    await use(new FormularyCloneDrawer(page, FORMULARY_CLONE.root));
  },

  formularyImportDialog: async ({ page }, use) => {
    await use(new FormularyImportDialog(page, FORMULARY_IMPORT.list));
  },

  formularyDeactivateDrawer: async ({ page }, use) => {
    await use(new FormularyDeactivateDrawer(page, FORMULARY_DEACTIVATE.detail));
  },

  formularyConfirmDialog: async ({ page }, use) => {
    await use(new ConfirmDialog(page));
  },

  formularyApprovalsPage: async ({ page }, use) => {
    await use(new ApprovalManagementPage(page, 'formulary'));
  },

  formularyIn: async ({ page }, use, testInfo) => {
    const built: string[] = [];
    await use(async (state, spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        // Registered BEFORE it is finished, so a step refused half-way still discards what was built.
        const nameEn = spec.nameEn ?? `${SUITE_FORMULARY_PREFIX} ${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
        const formulary = await provisionSuiteFormulary(page, state, { ...spec, nameEn }).catch(async (error: unknown) => {
          const partial = await findFormularyByName(page, nameEn).catch(() => null);
          if (partial) built.push(partial.id);
          throw error;
        });
        built.push(formulary.id);
        return formulary;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a formulary in state ${state} ${JSON.stringify(spec).slice(0, 160)}`, error);
      }
    });
    for (const id of [...built].reverse()) await discardSuiteFormulary(page, id);
  },

  discardFormularyNamed: async ({ page }, use) => {
    const names: string[] = [];
    await use((name) => {
      if (!name.startsWith(SUITE_FORMULARY_PREFIX)) throw new Error(`"${name}" is not a suite formulary name (prefix "${SUITE_FORMULARY_PREFIX}")`);
      names.push(name);
    });
    for (const name of names) {
      const found = await findFormularyByName(page, name).catch(() => null);
      if (found) {
        Logger.step(`[fixture] Discarding the case's formulary "${name}"`);
        await discardSuiteFormulary(page, found.id);
      }
    }
  },

  discardFormularyId: async ({ page }, use) => {
    const ids: string[] = [];
    await use((id) => ids.push(id));
    for (const id of ids.reverse()) await discardSuiteFormulary(page, id);
  },

  formularySecondWindow: async ({ page }, use, testInfo) => {
    const opened: Page[] = [];
    await use(async () => {
      const second = await page.context().newPage();
      opened.push(second);
      ScreenshotUtils.registerSession(testInfo, second);
      return { page: second, formularies: new FormularyManagementPage(second), detail: new FormularyDetailPage(second) };
    });
    for (const second of opened) await second.close().catch(() => undefined);
  },
});
