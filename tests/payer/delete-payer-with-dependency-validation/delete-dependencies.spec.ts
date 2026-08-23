import { test } from '../../../fixtures';
import {
  DELETE_MESSAGES,
  DEPENDENCY_PAYER_NAME,
  DEPENDENCY_PAYER_NAME_AR,
} from '../../../data/payers/deletePayer.data';

/**
 * User story: Delete Payer with/without Dependency Validation.
 * Dependency checking - a payer carrying dependencies must never be deleted.
 *
 * NOTE: the payer-to-dependency link cannot be created through the UI (the Add
 * Network form exposes no Payer field), so these tests act on the pre-seeded QA
 * payer named by DEPENDENCY_PAYER_NAME.
 *
 * TC-008 (zero-versus-one dependency boundary) was withdrawn at the product
 * owner's request; those paths are covered by TC-001 and TC-002.
 */
test.describe('Delete Payer with/without Dependency Validation - Dependency checks', () => {
  test('TC-002: should block the deletion and show the dependency error when the payer is linked to a network', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const versionBefore = await payerManagementPage.getVersionLabel(DEPENDENCY_PAYER_NAME);

    await payerManagementPage.deleteAndConfirm(DEPENDENCY_PAYER_NAME);

    // Blocked immediately, with the message defined by the user story.
    await payerManagementPage.expectToastContains(DELETE_MESSAGES.dependencyBlockedEn);
    // The payer record itself is untouched.
    await payerManagementPage.expectApprovalStatusContains(DEPENDENCY_PAYER_NAME, versionBefore);
  });

  test('TC-003: should display the dependency error in Arabic right-to-left when the UI language is Arabic', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    await payerManagementPage.language().switchTo('ar');
    await payerManagementPage.language().expectRightToLeft();

    // Addressed by its Arabic name: the list renders Arabic names in this locale.
    await payerManagementPage.deleteAndConfirm(DEPENDENCY_PAYER_NAME_AR, 'ar');

    // Exact Arabic wording required by the user story, rendered RTL.
    await payerManagementPage.expectToastContains(DELETE_MESSAGES.dependencyBlockedAr);
    await payerManagementPage.language().expectRightToLeft();

    await payerManagementPage.language().switchTo('en');
  });
});
