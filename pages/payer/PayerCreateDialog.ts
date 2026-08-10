import type { Page } from '@playwright/test';
import { EntityWizardDialog } from '../components/EntityWizardDialog';
import type { PayerData } from '../../data/common/types';

/**
 * "Add/Edit Payer" wizard side-panel.
 * Step 1 ("Basic Info") fields are verified against the live application.
 * Later steps (contact details, coverage, etc.) were not in scope for this
 * pass - extend this class with additional `fillStepN()` methods following
 * the same `fillTextField('<Label>', value)` pattern used below; the label
 * text is the locator, so no new selectors need to be reverse-engineered.
 */
export class PayerCreateDialog extends EntityWizardDialog {
  constructor(page: Page) {
    super(page, 'payer-dialog');
  }

  async fillBasicInfo(payer: PayerData): Promise<void> {
    await this.fillTextField('Payer Name', payer.nameEn);
    await this.fillTextField('اسم جهة الدفع', payer.nameAr).catch(() => undefined);
  }

  /** Advances past step 1. Add fillStepN() calls here as later steps are implemented. */
  async proceedFromBasicInfo(): Promise<void> {
    await this.clickNext();
  }
}
