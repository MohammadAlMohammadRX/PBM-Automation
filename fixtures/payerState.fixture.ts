import { test as base } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { buildUniquePayer } from '../data/payers/payer.data';
import type { PayerData } from '../data/payers/payerTypes';
import { DateUtils } from '../utils/DateUtils';
import { Logger } from '../utils/Logger';

/**
 * Payer-state fixtures.
 *
 * Several user stories start from a payer that is already in a particular
 * state ("a draft exists", "a live/published payer exists"). Rather than each
 * spec re-walking the UI to build that state, these fixtures provision it once
 * and hand the spec the resulting record - which is what the "preconditions via
 * fixtures" rule asks for. Every fixture builds its own unique payer, so tests
 * stay independent.
 */
export interface PayerStateFixtures {
  /** A payer saved as a private Draft (v0, never approved). */
  draftPayer: PayerData;
  /** A payer taken all the way through approval - live/published at v1. */
  publishedPayer: PayerData;
}

async function createDraft(page: PayerManagementPage, data: PayerData): Promise<void> {
  await page.open();
  await page.createDraftPayer(data);
}

export const test = base.extend<PayerStateFixtures>({
  draftPayer: async ({ page }, use) => {
    const payerPage = new PayerManagementPage(page);
    const data = buildUniquePayer();
    Logger.step(`[fixture] Provisioning draft payer "${data.nameEn}"`);
    await createDraft(payerPage, data);

    await use(data);

    // Teardown: remove the record if the test left it behind.
    await payerPage.open().catch(() => undefined);
    await payerPage.deletePayer(data.nameEn).catch(() => undefined);
  },

  publishedPayer: async ({ page }, use) => {
    const payerPage = new PayerManagementPage(page);
    const approvalPage = new ApprovalManagementPage(page);
    // Effective in the past so the approved payer is immediately live/Active.
    const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(30) });

    Logger.step(`[fixture] Provisioning published payer "${data.nameEn}"`);
    await createDraft(payerPage, data);
    await payerPage.sendForApproval(data.nameEn);
    await approvalPage.open();
    await approvalPage.approve(data.nameEn);

    await use(data);

    await payerPage.open().catch(() => undefined);
    await payerPage.deletePayer(data.nameEn).catch(() => undefined);
  },
});
