import { test } from '../../../fixtures';
import { DELETE_MESSAGES } from '../../../data/payers/deletePayer.data';

/**
 * User story: Delete Payer with/without Dependency Validation.
 * Dependency checking - a payer carrying dependencies must never be deleted.
 *
 * A payer's dependencies are its linked NETWORKS and its POLICIES; either one,
 * or both, blocks deletion. These cases act on a payer that ALREADY carries a
 * network, located by reading the list's Networks column.
 *
 * They previously built the dependency themselves - assign a network, send for
 * approval, approve - which was slow, permanently consumed one of a finite pool
 * of assignable networks, and left behind a payer that cleanup could never
 * remove, since a payer with a dependency cannot be deleted. Acting on an
 * existing record removes all three problems, and destroys nothing: the
 * deletion under test is precisely the one the application refuses.
 *
 * The subject is addressed by ROW ID throughout. Payer names are not unique -
 * the data holds two records named "Al Dawaa", one a draft with no networks -
 * so acting by name targets whichever the search happens to return first.
 *
 * Finding the subject is `critical`: if no payer with a network could be located,
 * the deletion under test was never attempted, so the assertions below would
 * report a failure about the application that was never observed.
 *
 * TC-008 (zero-versus-one dependency boundary) was withdrawn at the product
 * owner's request; those paths are covered by TC-001 and TC-002.
 */
test.describe('Delete Payer with/without Dependency Validation - Dependency checks', () => {
  test('TC-002: should block the deletion and show the dependency error when the payer is linked to a network', async ({
    payerManagementPage,
    steps,
  }) => {
    let subject!: Awaited<ReturnType<typeof payerManagementPage.findPayerWithNetworkDependency>>;
    let versionBefore = '';

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Subject chosen for the property under test, not by name.
    await steps.critical('Find a payer that carries at least one network', async () => {
      subject = await payerManagementPage.findPayerWithNetworkDependency();
      versionBefore = await payerManagementPage.getVersionLabelOfRow(subject.rowId);
    });

    await steps.critical('Attempt to delete that payer and confirm the prompt', () =>
      payerManagementPage.deleteRowAndConfirm(subject.rowId));

    // Blocked immediately, with the message defined by the user story.
    await steps.step('The dependency error defined by the user story is shown', () =>
      payerManagementPage.expectToastContains(DELETE_MESSAGES.dependencyBlockedEn));

    // The payer record itself is untouched - same version, still listed.
    await steps.step('The payer is untouched - same version, still listed', () =>
      payerManagementPage.expectRowVersionUnchanged(subject.rowId, versionBefore));
  });

  test('TC-003: should display the dependency error in Arabic right-to-left when the UI language is Arabic', async ({
    payerManagementPage,
    steps,
  }) => {
    let subject!: Awaited<ReturnType<typeof payerManagementPage.findPayerWithNetworkDependency>>;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // The UI language is restored in `finally`: it is stored with the session, so
    // leaving it in Arabic would change the language for every later test.
    try {
      await steps.critical('Switch the UI language to Arabic', () =>
        payerManagementPage.language().switchTo('ar'));

      await steps.step('The page is rendered right-to-left', () =>
        payerManagementPage.language().expectRightToLeft());

      // Re-open the list in Arabic and find the subject the same way. The Networks
      // column is addressed by its column key, so the search does not depend on
      // the language, and the row id it returns is language-independent too.
      await steps.critical('Reopen the list in Arabic and find a payer with a network', async () => {
        await payerManagementPage.open();
        subject = await payerManagementPage.findPayerWithNetworkDependency();
      });

      await steps.critical('Attempt to delete that payer and confirm the prompt', () =>
        payerManagementPage.deleteRowAndConfirm(subject.rowId));

      // Exact Arabic wording required by the user story, rendered RTL.
      await steps.step('The dependency error is shown in the exact Arabic wording', () =>
        payerManagementPage.expectToastContains(DELETE_MESSAGES.dependencyBlockedAr));

      await steps.step('The message is rendered right-to-left', () =>
        payerManagementPage.language().expectRightToLeft());
    } finally {
      await payerManagementPage.language().switchTo('en');
    }
  });
});
