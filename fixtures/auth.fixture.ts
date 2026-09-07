import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/auth/LoginPage';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { PayerMetricsPanel } from '../pages/payer/PayerMetricsPanel';
import { PayerCardsView } from '../pages/payer/PayerCardsView';
import { PayerInactivateDialog } from '../pages/payer/PayerInactivateDialog';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { LookupManagementPage } from '../pages/settings/LookupManagementPage';
import { PlanManagementPage } from '../pages/plan/PlanManagementPage';
import { NetworkManagementPage } from '../pages/network/NetworkManagementPage';
import { LanguageSwitcher } from '../pages/components/LanguageSwitcher';

/**
 * Page-Object fixture registry.
 *
 * Specs request a ready-made Page Object by name (e.g. `payerManagementPage`)
 * instead of constructing `new PayerManagementPage(page)` themselves. Every
 * project already starts authenticated via the "setup" project + saved
 * storageState (see playwright.config.ts and tests/setup/auth.setup.ts), so
 * these Page Objects assume an already-logged-in session.
 *
 * Register each new Page Object here as its module is added.
 */
export interface PageObjectFixtures {
  loginPage: LoginPage;
  payerManagementPage: PayerManagementPage;
  approvalManagementPage: ApprovalManagementPage;
  lookupManagementPage: LookupManagementPage;

  /** The payer list's five-counter dashboard band. */
  payerMetrics: PayerMetricsPanel;

  /**
   * The dedicated Inactivate Payer drawer.
   *
   * NOT the shared confirmation dialog - inactivation has its own drawer with a
   * reason, a details field and an impact preview. See PayerInactivateDialog.
   */
  payerInactivateDialog: PayerInactivateDialog;
  /** The payer list's cards view - only the localized-name story reads it. */
  payerCards: PayerCardsView;

  /**
   * Consumers of the shared payer selection interface. Registered here rather
   * than constructed in the spec so the cross-module story never reaches for
   * `new`, and so a second consumer costs one line to add.
   */
  planManagementPage: PlanManagementPage;
  networkManagementPage: NetworkManagementPage;

  /**
   * The bilingual UI toggle. Already used by the payer pages internally; it is
   * exposed as a fixture because the localized-name story drives the language
   * itself rather than a module.
   */
  languageSwitcher: LanguageSwitcher;
}

export const test = base.extend<PageObjectFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  payerManagementPage: async ({ page }, use) => {
    await use(new PayerManagementPage(page));
  },
  approvalManagementPage: async ({ page }, use) => {
    await use(new ApprovalManagementPage(page));
  },
  lookupManagementPage: async ({ page }, use) => {
    await use(new LookupManagementPage(page));
  },
  payerMetrics: async ({ page }, use) => {
    await use(new PayerMetricsPanel(page));
  },
  payerInactivateDialog: async ({ page }, use) => {
    await use(new PayerInactivateDialog(page));
  },
  payerCards: async ({ page }, use) => {
    await use(new PayerCardsView(page));
  },
  planManagementPage: async ({ page }, use) => {
    await use(new PlanManagementPage(page));
  },
  networkManagementPage: async ({ page }, use) => {
    await use(new NetworkManagementPage(page));
  },
  languageSwitcher: async ({ page }, use) => {
    await use(new LanguageSwitcher(page));
  },
});
