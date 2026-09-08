import { test, expect } from '../../../fixtures';
import { ELIGIBLE_STATUS } from '../../../data/payers/payerSelection.data';

/**
 * User story: Return Only Active Payers with Status in Cross-Module Payer
 * Selection.
 * Eligibility as a payer's status changes, plus the two boundary/anomaly cases.
 *
 * The transition tests drive the application's real maker-checker lifecycle end
 * to end - create a draft, submit it, approve it - rather than editing a status
 * directly, because that is the only way a payer's status actually changes in
 * this product. That makes them the longest tests in the story, and it is also
 * what makes them meaningful: the dropdown is checked before AND after the
 * transition, so the assertion is about the transition itself and not about a
 * payer that happened to be eligible all along.
 */
test.describe('Cross-Module Payer Selection - Status transitions', () => {
  test('TC-005: should offer a payer once it transitions into Active', async ({
    payerManagementPage,
    approvalManagementPage,
    planManagementPage,
    draftPayer,
    steps,
  }) => {
    // `draftPayer` provisions the "not yet Active" starting state and removes
    // the record afterwards, so the test neither builds its precondition
    // through the UI in the test body nor leaves data behind.

    await steps.critical('The new registration is not yet Active', async () => {
      await payerManagementPage.open();
      // Searched for first: `expectResultsInclude` reads the rows currently
      // rendered, and on a 35-page list a new record is not among them.
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectResultsInclude(draftPayer.nameEn);
      const status = await payerManagementPage.getLifecycleStatus(draftPayer.nameEn);
      expect(
        status,
        'a payer whose first version has never been published must not be Active',
      ).not.toBe(ELIGIBLE_STATUS);
    });

    await steps.critical('The dropdown does not offer it while it is not Active', async () => {
      await planManagementPage.openList();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectNotEmpty();
      await dropdown.expectExcludesPayer(draftPayer.nameEn);
      await dropdown.close();
    });

    await steps.critical('Submit the registration for approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
    });

    await steps.critical('Approve the registration', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.approve(draftPayer.nameEn);
    });

    await steps.critical('The payer is now Active', async () => {
      await payerManagementPage.open();
      // The fixture's effective date is today, so approval publishes it Active
      // immediately - which is the state this case needs.
      await payerManagementPage.expectLifecycleStatus(draftPayer.nameEn, ELIGIBLE_STATUS);
    });

    await steps.step('The dropdown now offers the payer', async () => {
      await planManagementPage.openList();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectOffersPayer(draftPayer.nameEn);
    });
  });

  test('TC-004: should stop offering a payer once it leaves Active', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    planManagementPage,
    publishedPayer,
    steps,
  }) => {
    // `publishedPayer` is live and Active (its effective date is back-dated by
    // the fixture), which is exactly the starting state this case needs.
    await steps.critical('The payer starts out Active', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectLifecycleStatus(publishedPayer.nameEn, ELIGIBLE_STATUS);
    });

    await steps.critical('The dropdown offers it while it is Active', async () => {
      await planManagementPage.openList();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectOffersPayer(publishedPayer.nameEn);
      await dropdown.close();
    });

    // Inactivation is a maker-checker change like any other: the row action
    // only STAGES it, so the status does not move until a checker approves.
    // Doing only the first half here would leave the payer Active and the
    // assertion below would fail for the wrong reason.
    //
    // Note the drawer, not the shared confirmation dialog - inactivation has
    // its own (`payer-inactivate-dialog`), with a reason and an impact preview.
    await steps.critical('Stage an inactivation and have it approved', async () => {
      await payerManagementPage.open();
      await payerManagementPage.findAndInactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.inactivateWithFirstReason();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.critical('The payer is no longer Active', async () => {
      await payerManagementPage.open();
      const status = await payerManagementPage.getLifecycleStatus(publishedPayer.nameEn);
      expect(status, 'the approved inactivation should have moved the payer off Active').not.toBe(
        ELIGIBLE_STATUS,
      );
    });

    await steps.step('The dropdown no longer offers the payer', async () => {
      await planManagementPage.openList();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectNotEmpty();
      await dropdown.expectExcludesPayer(publishedPayer.nameEn);
    });
  });

  test('TC-006: should handle the zero-Active-payers boundary gracefully', async ({
    steps,
  }) => {
    // The precondition is "ALL payer records in the system have a status other
    // than Active". The environment holds 255 Active payers across 350 records,
    // shared with other testers and with the rest of this suite. Reaching the
    // boundary would mean inactivating every one of them - an irreversible,
    // environment-wide change that no test may make, and one that would break
    // every other case in this story.
    //
    // BLOCKED rather than FAIL: the boundary was never reached, so nothing was
    // observed about how the dropdown behaves there.
    steps.blocked(
      'this case requires an environment in which NO payer is Active. The shared test '
        + 'environment holds 255 Active payers, and inactivating them all is an irreversible '
        + 'change that would invalidate the rest of the suite. To unblock: run this case '
        + 'against a dedicated dataset seeded with only Pending/Inactive/Expired payers.',
    );
  });

  test('TC-009: should exclude payers whose status is null or missing', async ({ steps }) => {
    // Status is set by the application on every state transition and is
    // mandatory in the data model, so a null-status payer cannot be produced
    // through the UI. Note the related observation recorded in
    // payer-selection.spec.ts: the dropdown returns 219 payers against a
    // reported 255 Active, so a status-classification defect may well exist -
    // but this case cannot be the thing that proves it.
    steps.blocked(
      'this case needs a payer whose status is null or missing. Status is assigned by the '
        + 'application on every lifecycle transition and cannot be cleared through the UI, so '
        + 'the data anomaly cannot be created. To unblock: seed one payer with statusId = '
        + 'null and confirm the expected treatment with the product owner.',
    );
  });

  test('TC-010: should serve the dropdown to a consuming-module user without payer admin rights', async ({
    steps,
  }) => {
    // Deliberately BLOCKED rather than silently run as the administrator. The
    // whole point of the case is that a user WITHOUT payer-management rights
    // can still use the dropdown, and running it as an admin would assert
    // nothing while reporting a pass - the most misleading outcome available.
    steps.blocked(
      'this case needs a user with access to a consuming module but no Payer Management '
        + 'rights. NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env, and '
        + 'running it as the administrator would prove nothing about the restricted role.',
    );
  });
});
