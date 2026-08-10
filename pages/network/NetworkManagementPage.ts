import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { NetworkCreateDialog } from './NetworkCreateDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { Logger } from '../../utils/Logger';
import type { NetworkData } from '../../data/common/types';

/**
 * Page Object for Network Management (/network-management).
 * Verified against the live app: search box, "Add Network" button, data
 * table with columns Network Name / Network Code / Payer / Network Type /
 * Status / Effective Date / Expiry Date / Facilities / Linked Policies /
 * Approval Status / Actions, and the same row-action set as Payer Management.
 */
export class NetworkManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, 'Add Network');
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.networkManagement);
  }

  async startCreateNetwork(network: NetworkData): Promise<NetworkCreateDialog> {
    Logger.step(`Creating network "${network.nameEn}"`);
    await this.clickAdd();
    const dialog = new NetworkCreateDialog(this.page);
    await dialog.verifyStepHeadingVisible('Add New Network');
    await dialog.fillBasicInfo(network);
    return dialog;
  }

  async searchNetwork(term: string): Promise<void> {
    await this.search(term);
  }

  async deleteNetwork(networkName: string): Promise<void> {
    await this.deleteRow(networkName);
  }

  async editNetwork(networkName: string): Promise<void> {
    await this.editRow(networkName);
  }

  async verifyNetworkDetails(networkName: string, expected: Partial<Record<string, string>>): Promise<void> {
    await this.waitForRowVisible(networkName);
    for (const [column, expectedValue] of Object.entries(expected)) {
      const actual = await this.getRowCellValue(networkName, column);
      expect(actual, `Column "${column}" for network "${networkName}"`).toBe(expectedValue);
    }
  }
}
