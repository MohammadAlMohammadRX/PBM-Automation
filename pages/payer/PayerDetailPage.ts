import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Timeouts } from '../../constants/Timeouts';

/**
 * Read-only payer detail view (`/payer-management/{id}`), reached via the "View"
 * row action. Verified structure:
 *   div.payer-detail__field
 *     span.payer-detail__field-label   e.g. "Created At"
 *     span.payer-detail__field-value   e.g. "27/07/2026 01:06 PM"
 */
export class PayerDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private field(label: string): Locator {
    return this.page
      .locator('div.payer-detail__field')
      .filter({ has: this.page.locator('span.payer-detail__field-label', { hasText: label }) });
  }

  private fieldValue(label: string): Locator {
    return this.field(label).locator('span.payer-detail__field-value');
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.page.locator('.payer-detail__field').first()).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /** Returns the displayed value of a labelled detail field (e.g. "Created At"). */
  async getFieldValue(label: string): Promise<string> {
    return (await this.fieldValue(label).innerText()).trim();
  }
}
