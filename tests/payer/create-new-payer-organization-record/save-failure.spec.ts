import { test } from '../../../fixtures';
import { NetworkUtils } from '../../../utils/NetworkUtils';

/**
 * User story: Create New Payer Organization Record.
 * Graceful handling of a save-time backend failure (fault injection).
 *
 * Playwright aborts the mutating save request to simulate a connectivity/
 * backend error, then the test asserts no partial or duplicate Draft was
 * created - i.e. no PayerCode reserved or orphaned record left behind.
 */
test.describe('Create New Payer Organization Record - Save failure handling', () => {
  test('TC-020: should not create a partial or corrupt payer record when the save request fails', async ({
    page,
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    // If, despite the injected failure, a record somehow persists, clean it up.
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();

    // Fault injection: fail every mutating (non-GET) request so the save cannot
    // complete, while leaving read traffic (the list, lookups) working.
    await NetworkUtils.failMutatingRequests(page);

    const form = await payerManagementPage.openCreateForm();
    await form.fillBasicInformation(uniquePayer);
    await form.clickNext();
    await form.fillContactInformation(uniquePayer);
    await form.clickNext();
    await form.fillEffectivePeriod(uniquePayer);
    await form.save();

    // Restore the network, close the wizard (discarding), and confirm the failed
    // save left no partial/duplicate record behind - no page navigation needed.
    await NetworkUtils.restore(page);
    await form.closeAndDiscard();
    await payerManagementPage.expectRowNotVisible(uniquePayer.nameEn);
  });
});
