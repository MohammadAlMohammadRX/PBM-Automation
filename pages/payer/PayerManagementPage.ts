import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PayerFormDialog } from './PayerFormDialog';
import { PayerDetailPage } from './PayerDetailPage';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import type { MandatoryFieldSpec, PayerData } from '../../data/payers/payerTypes';

/** Columns exposed by the payer list table (verified against the live app). */
const COLUMN = {
  code: 'Code',
  status: 'Status',
  approvalStatus: 'Approval Status',
} as const;

/**
 * Page Object for the Payer Management module (`/payer-management`).
 *
 * Reuses ListPageBase for search/table/row-actions/pagination and adds only
 * payer-specific orchestration: creating via the wizard, sending a draft for
 * approval, and reading the Code / Status / Approval Status columns.
 */
export class PayerManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, 'Add Payer');
  }

  private confirmDialog(): ConfirmDialog {
    return new ConfirmDialog(this.page);
  }

  form(): PayerFormDialog {
    return new PayerFormDialog(this.page);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.payerManagement);
    // Under sustained load the list intermittently gets stuck on its "Loading"
    // spinner; a reload unsticks the SPA fetch. Try once, then self-heal.
    if (!(await this.listRendered())) {
      await this.reload();
      await expect(this.page.getByRole('table')).toBeVisible({ timeout: Timeouts.default });
    }
  }

  /** Waits out the "Loading" spinner (scoped by name so the dashboard's
   *  permanent progress bars are never matched) and reports whether the table
   *  rendered. */
  private async listRendered(): Promise<boolean> {
    await this.page
      .getByRole('progressbar', { name: 'Loading' })
      .waitFor({ state: 'hidden', timeout: Timeouts.loadingIndicator })
      .catch(() => undefined);
    return this.page
      .getByRole('table')
      .isVisible({ timeout: Timeouts.default })
      .catch(() => false);
  }

  /** Navigates to the module WITHOUT asserting the table renders - used by the
   *  RBAC test, where a non-admin may be denied the page or its controls. */
  async navigate(): Promise<void> {
    await this.goto(AppRoutes.payerManagement);
  }

  /** Opens the "Add New Payer" wizard and returns its Page Object. */
  async openCreateForm(): Promise<PayerFormDialog> {
    await this.clickAdd();
    const form = this.form();
    await form.waitForOpen();
    return form;
  }

  /** Full create happy path: fills all steps with valid data and saves. */
  async createDraftPayer(data: PayerData): Promise<void> {
    const form = await this.openCreateForm();
    await form.createPayer(data);
    await form.waitForClosed();
    await this.waitForPageReady();
  }

  /**
   * Drives the wizard as far as the given mandatory field's step, filling every
   * other field with valid data but leaving that one blank, then triggers the
   * step's validation. Returns the still-open form so the test can assert the
   * required-field error. Branching lives here (Page Object), not in the spec.
   */
  async attemptCreateOmitting(data: PayerData, field: MandatoryFieldSpec): Promise<PayerFormDialog> {
    const form = await this.openCreateForm();

    await form.fillBasicInformation(data, field.step === 'Basic Information' ? field.label : undefined);
    if (field.step === 'Basic Information') {
      await form.clickNext();
      return form;
    }

    await form.clickNext();
    await form.fillContactInformation(
      data,
      field.step === 'Contact Information' ? field.label : undefined,
    );
    if (field.step === 'Contact Information') {
      await form.clickNext();
      return form;
    }

    await form.clickNext();
    await form.fillEffectivePeriod(data, field.label);
    await form.save();
    return form;
  }

  /** Opens a payer's read-only detail view via the "View" row action. */
  async openDetails(payerName: string): Promise<PayerDetailPage> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await this.viewRow(payerName);
    const detail = new PayerDetailPage(this.page);
    await detail.waitForLoaded();
    return detail;
  }

  /** Opens a payer in the Edit wizard via the "Edit" row action. */
  async openEditForm(payerName: string): Promise<PayerFormDialog> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await this.editRow(payerName);
    const form = this.form();
    await form.waitForOpen();
    return form;
  }

  // ---- RBAC (TC-012) --------------------------------------------------------

  /** True when the current user is offered the "Create New Payer" action. */
  async isCreateActionAvailable(): Promise<boolean> {
    return this.addButtonInternal()
      .isVisible({ timeout: Timeouts.short })
      .catch(() => false);
  }

  async expectCreateActionDenied(): Promise<void> {
    await expect(this.addButtonInternal()).toHaveCount(0, { timeout: Timeouts.default });
  }

  private addButtonInternal() {
    return this.page.getByRole('button', { name: 'Add Payer', exact: true });
  }

  // ---- Duplicate detection (TC-015) ----------------------------------------

  /**
   * Asserts the app surfaces a potential-duplicate warning (a toast, dialog, or
   * inline flag mentioning "duplicate"). Per the user story, a duplicate must
   * not be accepted silently. If the app shows nothing, this fails - which is
   * the intended signal that duplicate detection is missing (file a defect).
   */
  async expectDuplicateWarning(): Promise<void> {
    await expect(this.page.getByText(/duplicate/i).first()).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /** Sends a draft row for approval and confirms the modal. */
  async sendForApproval(payerName: string): Promise<void> {
    Logger.step(`Sending "${payerName}" for approval`);
    await this.search(payerName);
    await this.sendRowForApproval(payerName);
    await this.confirmDialog().confirm('Send for Approval');
    await this.waitForPageReady();
  }

  // ---- Column reads (each searches first so the row is unambiguous) ---------

  async getApprovalStatus(payerName: string): Promise<string> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    return this.getRowCellValue(payerName, COLUMN.approvalStatus);
  }

  async getPayerCode(payerName: string): Promise<string> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    return this.getRowCellValue(payerName, COLUMN.code);
  }

  async getLifecycleStatus(payerName: string): Promise<string> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    return this.getRowCellValue(payerName, COLUMN.status);
  }

  private codeCell(payerName: string): Locator {
    return this.rowByText(payerName).getByRole('cell').nth(2);
  }

  private lifecycleStatusCell(payerName: string): Locator {
    // Column order: Name,Type,Code,Networks,Members,License,Email,Phone,Status,...
    return this.rowByText(payerName).getByRole('cell').nth(8);
  }

  async expectLifecycleStatus(payerName: string, status: string): Promise<void> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await expect(this.lifecycleStatusCell(payerName)).toHaveText(status, { timeout: Timeouts.default });
  }

  async expectApprovalStatusContains(payerName: string, expected: string): Promise<void> {
    await this.search(payerName);
    await expect(this.rowByText(payerName)).toContainText(expected, { timeout: Timeouts.default });
  }

  async expectNoPayerCode(payerName: string): Promise<void> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await expect(this.codeCell(payerName)).toHaveText(/^(—|-|\s*)$/, { timeout: Timeouts.default });
  }

  async expectPayerCodeAssigned(payerName: string): Promise<void> {
    await this.search(payerName);
    await this.waitForRowVisible(payerName);
    await expect(this.codeCell(payerName)).toHaveText(/PAY-\d+/, { timeout: Timeouts.default });
  }

  /**
   * Combined post-decision assertion using a SINGLE search, then asserting the
   * approval status and PayerCode presence against that one filtered row. This
   * avoids the race of two back-to-back searches re-filtering the same table.
   */
  async expectApprovalOutcome(
    payerName: string,
    approvalStatus: string,
    expectPayerCode: boolean,
  ): Promise<void> {
    await this.search(payerName);
    const row = this.rowByText(payerName);
    await expect(row).toContainText(approvalStatus, { timeout: Timeouts.default });
    if (expectPayerCode) {
      await expect(this.codeCell(payerName)).toHaveText(/PAY-\d+/, { timeout: Timeouts.default });
    } else {
      await expect(this.codeCell(payerName)).toHaveText(/^(—|-|\s*)$/, { timeout: Timeouts.default });
    }
  }

  /** Single-search assertion that an approved payer has a PayerCode and the
   *  expected lifecycle status (Active/Pending) derived from its Effective Date. */
  async expectPublishedWithStatus(payerName: string, lifecycleStatus: string): Promise<void> {
    await this.search(payerName);
    await expect(this.rowByText(payerName)).toBeVisible({ timeout: Timeouts.default });
    await expect(this.codeCell(payerName)).toHaveText(/PAY-\d+/, { timeout: Timeouts.default });
    await expect(this.lifecycleStatusCell(payerName)).toHaveText(lifecycleStatus, {
      timeout: Timeouts.default,
    });
  }

  async expectRowNotVisible(payerName: string): Promise<void> {
    await this.search(payerName);
    await expect(this.rowByText(payerName)).toHaveCount(0, { timeout: Timeouts.default });
  }

  /** Asserts the payer's row displays each of the given values (data persistence). */
  async expectRowShowsDetails(payerName: string, values: string[]): Promise<void> {
    await this.search(payerName);
    const row = this.rowByText(payerName);
    for (const value of values) {
      await expect(row).toContainText(value, { timeout: Timeouts.default });
    }
  }

  /** Leaves the module for the dashboard, then returns to Payer Management. */
  async navigateAwayAndReturn(): Promise<void> {
    await this.goto(AppRoutes.dashboard);
    await this.open();
  }

  /** Best-effort teardown used by the cleanup fixture. */
  async deletePayer(payerName: string): Promise<void> {
    Logger.cleanup(`Deleting payer "${payerName}"`);
    await this.search(payerName);
    // Nothing to clean up if the record was never created (e.g. a failed-save test).
    if (!(await this.isRowVisible(payerName))) {
      return;
    }
    await this.deleteRow(payerName);
    // The "Delete Payer" dialog confirms with Yes / No.
    await this.confirmDialog().confirm('Yes');
    await this.waitForPageReady();
  }
}
