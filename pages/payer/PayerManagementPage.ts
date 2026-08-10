import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { PayerCreateDialog } from './PayerCreateDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { Logger } from '../../utils/Logger';
import type { PayerData } from '../../data/common/types';

/**
 * Page Object for Payer Management (/payer-management).
 * Verified against the live app: search box, "Add Payer" button, data table
 * with columns Payer Name / Payer Type / Code / Networks / Members /
 * License Number / Email Address / Phone Number / Status / Approval Status /
 * Actions, and row actions View / Edit / Send for Approval / Inactivate / Delete.
 *
 * List/search/table behaviour is inherited from ListPageBase - this class
 * only adds what's specific to Payers (the create wizard).
 */
export class PayerManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, 'Add Payer');
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.payerManagement);
  }

  /**
   * Opens the create wizard, fills step 1 (Basic Info) and advances.
   * Only step 1 is automated end-to-end today - see PayerCreateDialog for
   * how to extend this once further steps are needed by the team.
   */
  async startCreatePayer(payer: PayerData): Promise<PayerCreateDialog> {
    Logger.step(`Creating payer "${payer.nameEn}"`);
    await this.clickAdd();
    const dialog = new PayerCreateDialog(this.page);
    await dialog.verifyStepHeadingVisible('Add New Payer');
    await dialog.fillBasicInfo(payer);
    return dialog;
  }

  async searchPayer(term: string): Promise<void> {
    await this.search(term);
  }

  async deletePayer(payerName: string): Promise<void> {
    await this.deleteRow(payerName);
  }

  async editPayer(payerName: string): Promise<void> {
    await this.editRow(payerName);
  }

  async verifyPayerDetails(payerName: string, expected: Partial<Record<string, string>>): Promise<void> {
    await this.waitForRowVisible(payerName);
    for (const [column, expectedValue] of Object.entries(expected)) {
      const actual = await this.getRowCellValue(payerName, column);
      expect(actual, `Column "${column}" for payer "${payerName}"`).toBe(expectedValue);
    }
  }

  async verifyPayerStatus(payerName: string, expectedStatus: string): Promise<void> {
    await this.verifyPayerDetails(payerName, { Status: expectedStatus });
  }
}
