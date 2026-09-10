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
import { PolicyManagementPage } from '../pages/policy/PolicyManagementPage';
import { NetworkInactivateDialog } from '../pages/network/NetworkInactivateDialog';
import { LanguageSwitcher } from '../pages/components/LanguageSwitcher';
import { ExportMenu } from '../pages/components/ExportMenu';
import { Toast } from '../pages/components/Toast';
import { RoleAdministrationPage } from '../pages/system/RoleAdministrationPage';

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
  /** The Policies module - see PolicyManagementPage. */
  policyManagementPage: PolicyManagementPage;
  /** The Network tab of the approvals hub - see ApprovalScope. */
  networkApprovalsPage: ApprovalManagementPage;
  /** The Inactivate Network drawer - see NetworkInactivateDialog. */
  networkInactivateDialog: NetworkInactivateDialog;

  /**
   * The bilingual UI toggle. Already used by the payer pages internally; it is
   * exposed as a fixture because the localized-name story drives the language
   * itself rather than a module.
   */
  languageSwitcher: LanguageSwitcher;

  /**
   * The list export control - trigger, scope menu and format dialog.
   *
   * Registered as its own fixture rather than reached through the payer list,
   * because exporting is a THREE-part flow across two hosts (a toolbar menu and
   * the shared dialog) and it produces a download rather than a screen. Folding
   * that into the list Page Object would put file handling in a class whose
   * every other method is about rows.
   */
  exportMenu: ExportMenu;

  /**
   * Role Administration, which owns the permission catalogue.
   *
   * A payer story needs it because payer permissions are DEFINED on a role, so
   * what a payer permission is called in Arabic is a question only this screen
   * can answer.
   */
  roleAdministrationPage: RoleAdministrationPage;

  /**
   * The toast notification.
   *
   * BasePage already offers a contains-match for the common case. This is
   * registered separately because the creation-toast story asks about exact
   * wording in both languages, auto-dismiss timing, manual dismissal and the
   * ABSENCE of a toast - none of which a contains-match can answer.
   */
  toast: Toast;
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
  policyManagementPage: async ({ page }, use) => {
    await use(new PolicyManagementPage(page));
  },

  networkInactivateDialog: async ({ page }, use) => {
    await use(new NetworkInactivateDialog(page));
  },

  networkApprovalsPage: async ({ page }, use) => {
    await use(new ApprovalManagementPage(page, 'network'));
  },

  networkManagementPage: async ({ page }, use) => {
    await use(new NetworkManagementPage(page));
  },
  languageSwitcher: async ({ page }, use) => {
    await use(new LanguageSwitcher(page));
  },
  exportMenu: async ({ page }, use) => {
    await use(new ExportMenu(page));
  },
  roleAdministrationPage: async ({ page }, use) => {
    await use(new RoleAdministrationPage(page));
  },
  toast: async ({ page }, use) => {
    await use(new Toast(page));
  },
});
