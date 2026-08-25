import { test } from '../../../fixtures';
import { DELETE_MESSAGES } from '../../../data/payers/deletePayer.data';

/**
 * User story: Delete Payer with/without Dependency Validation.
 * Dependency checking - a payer carrying dependencies must never be deleted.
 *
 * These two cases build their own dependency instead of trusting seeded data.
 * From the payer's detail page, Linked Networks -> "Assign Network" submits the
 * link for approval; only once a reviewer approves it does the dependency exist.
 * The precondition is then PROVEN by reading the list's Networks column before
 * the deletion is attempted.
 *
 * This replaces an earlier version that acted on a pre-seeded payer named
 * "Al Dawaa". Two payers share that name and the first match had zero linked
 * networks, so the test was deleting a payer with no dependency at all and its
 * "deletion was not blocked" result was meaningless.
 *
 * TC-008 (zero-versus-one dependency boundary) was withdrawn at the product
 * owner's request; those paths are covered by TC-001 and TC-002.
 */
test.describe('Delete Payer with/without Dependency Validation - Dependency checks', () => {
  test('TC-002: should block the deletion and show the dependency error when the payer is linked to a network', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    // Give the live payer a real network dependency, through approval.
    const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
    await detail.assignNetwork();

    await payerManagementPage.open();
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    await approvalManagementPage.open();
    await approvalManagementPage.approve(publishedPayer.nameEn);

    // Precondition proven rather than assumed: the payer now carries 1 network.
    await payerManagementPage.open();
    await payerManagementPage.expectNetworkCount(publishedPayer.nameEn, 1);
    const versionBefore = await payerManagementPage.getVersionLabel(publishedPayer.nameEn);

    await payerManagementPage.deleteAndConfirm(publishedPayer.nameEn);

    // Blocked immediately, with the message defined by the user story.
    await payerManagementPage.expectToastContains(DELETE_MESSAGES.dependencyBlockedEn);
    // The payer record itself is untouched.
    await payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, versionBefore);
  });

  test('TC-003: should display the dependency error in Arabic right-to-left when the UI language is Arabic', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
  }) => {
    // Same dependency, built in English before switching language.
    const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
    await detail.assignNetwork();

    await payerManagementPage.open();
    await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    await approvalManagementPage.open();
    await approvalManagementPage.approve(publishedPayer.nameEn);

    await payerManagementPage.open();
    await payerManagementPage.expectNetworkCount(publishedPayer.nameEn, 1);

    await payerManagementPage.language().switchTo('ar');
    await payerManagementPage.language().expectRightToLeft();

    // Addressed by its Arabic name: the list renders Arabic names in this locale.
    await payerManagementPage.deleteAndConfirm(publishedPayer.nameAr, 'ar');

    // Exact Arabic wording required by the user story, rendered RTL.
    await payerManagementPage.expectToastContains(DELETE_MESSAGES.dependencyBlockedAr);
    await payerManagementPage.language().expectRightToLeft();

    await payerManagementPage.language().switchTo('en');
  });
});
