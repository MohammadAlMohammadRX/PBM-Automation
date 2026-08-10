import type { Page } from '@playwright/test';
import { EntityWizardDialog } from '../components/EntityWizardDialog';
import type { NetworkData } from '../../data/common/types';

/**
 * "Add/Edit Network" wizard side-panel.
 * Step 1 fields verified against the live application: Network Name (EN/AR)
 * and an optional description. Extend with `fillStepN()` methods for later
 * steps as they are documented, following the same `fillTextField` pattern.
 */
export class NetworkCreateDialog extends EntityWizardDialog {
  constructor(page: Page) {
    super(page, 'network-dialog');
  }

  async fillBasicInfo(network: NetworkData): Promise<void> {
    await this.fillTextField('Network Name', network.nameEn);
  }

  async proceedFromBasicInfo(): Promise<void> {
    await this.clickNext();
  }
}
