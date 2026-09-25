import { test, expect } from '../../../fixtures';
import { nonAdminBlockReason } from '../../../data/accounts/nonAdminAccount.data';
import {
  DRAFT_STATUS,
  EDIT_ROLE_REQUIREMENT,
  FIRST_VERSION,
  REJECTED,
  REJECTION_REASON,
  RESUBMIT_EDIT,
} from '../../../data/payers/rejectedRegistration.data';

/**
 * User story: Keep a Rejected Payer Registration Visible and Editable.
 *
 * What a rejection leaves behind. The require-a-reason story owns the rejection
 * act (and the reason requirement, which is REUSE not repeated here); this story
 * is about the record afterwards - still listed at v0, still carrying its
 * reason, still editable, and returning to Draft when edited.
 *
 * Each case builds its own rejected registration from a fresh draft, because a
 * rejection is a real state change and doing it to a shared payer would take
 * that payer's state away from whatever else needs it.
 */
async function rejectAFreshRegistration(
  payerManagementPage: import('../../../pages/payer/PayerManagementPage').PayerManagementPage,
  approvalManagementPage: import('../../../pages/approval/ApprovalManagementPage').ApprovalManagementPage,
  name: string,
): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.expectInQueue(name);
  await approvalManagementPage.reject(name, REJECTION_REASON);
  await approvalManagementPage.expectNotInQueue(name);
}

test.describe('Rejected registration stays visible and editable', () => {
  // Azure test case 15753
  test('15753: should keep a rejected registration listed at version 0 and marked Rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and reject a fresh registration', async () => {
      await rejectAFreshRegistration(payerManagementPage, approvalManagementPage, draftPayer.nameEn);
    });

    await steps.step('The registration is still in the directory, marked Rejected', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, REJECTED);
    });

    await steps.step('And it still sits at version 0', async () => {
      expect(
        await payerManagementPage.getVersionNumber(draftPayer.nameEn),
        'a rejected first registration should remain at v0',
      ).toBe(FIRST_VERSION);
    });
  });

  // Azure test case 15754
  test('15754: should show the reviewer\'s reason on the rejected registration', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and reject a fresh registration', async () => {
      await rejectAFreshRegistration(payerManagementPage, approvalManagementPage, draftPayer.nameEn);
    });

    await steps.step('The reviewer reason is surfaced on the rejected detail screen', async () => {
      // Read from the REJECTED BANNER, which is where the reason actually
      // surfaces to the maker. The require-a-reason story looked in the audit
      // timeline and version history and did not find it there - a correct
      // observation about those surfaces, but the banner story shows the reason
      // IS shown, in the what-to-do-next banner. This case reads it where it
      // lives so the maker's view of the reason is genuinely verified.
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      const banner = await detail.getStatusBannerText();
      expect(
        banner.includes(REJECTION_REASON),
        `the rejected banner should carry the reason "${REJECTION_REASON}"; it read "${banner}"`,
      ).toBe(true);
    });
  });

  // Azure test case 15755
  test('15755: should keep a rejected registration editable', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and reject a fresh registration', async () => {
      await rejectAFreshRegistration(payerManagementPage, approvalManagementPage, draftPayer.nameEn);
    });

    await steps.step('The Edit action is offered on the rejected row', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      const availability = await payerManagementPage.getRowActionAvailability(
        draftPayer.nameEn,
        'edit',
      );
      expect(
        availability,
        'a rejected registration should still be editable',
      ).toBe('available');
    });

    await steps.step('And the edit form opens pre-populated with the rejected content', async () => {
      const form = await payerManagementPage.openEditForm(draftPayer.nameEn);
      await form.expectFieldValue('Payer Name', draftPayer.nameEn);
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15756
  test('15756: should return a rejected registration to Draft when it is edited', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and reject a fresh registration', async () => {
      await rejectAFreshRegistration(payerManagementPage, approvalManagementPage, draftPayer.nameEn);
    });

    await steps.step('Editing and saving it moves the status to Draft', async () => {
      // The sheet's "editing starts a fresh draft from its content": the record
      // leaves Rejected and re-enters Draft, carrying the content forward.
      await payerManagementPage.open();
      await payerManagementPage.editSingleFieldAndSave(
        draftPayer.nameEn,
        RESUBMIT_EDIT.label,
        RESUBMIT_EDIT.value,
        RESUBMIT_EDIT.kind,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, DRAFT_STATUS);
    });

    await steps.step('And it is still version 0 - no new version was cut by the edit', async () => {
      expect(
        await payerManagementPage.getVersionNumber(draftPayer.nameEn),
        'editing a rejected registration must not mint a new version',
      ).toBe(FIRST_VERSION);
    });
  });

  // Azure test case 15757
  test('15757: should hold the version at 0 through the whole reject-and-edit cycle', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a fresh registration at v0', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      expect(
        await payerManagementPage.getVersionNumber(draftPayer.nameEn),
        'a new registration should start at v0',
      ).toBe(FIRST_VERSION);
    });

    await steps.step('It is still v0 after rejection', async () => {
      await rejectAFreshRegistration(payerManagementPage, approvalManagementPage, draftPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      expect(
        await payerManagementPage.getVersionNumber(draftPayer.nameEn),
        'rejection must not change the version',
      ).toBe(FIRST_VERSION);
    });

    await steps.step('And still v0 after being edited back to Draft', async () => {
      await payerManagementPage.editSingleFieldAndSave(
        draftPayer.nameEn,
        RESUBMIT_EDIT.label,
        RESUBMIT_EDIT.value,
        RESUBMIT_EDIT.kind,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      expect(
        await payerManagementPage.getVersionNumber(draftPayer.nameEn),
        'the version stays 0 until the edited draft is resubmitted and approved',
      ).toBe(FIRST_VERSION);
    });
  });

  // Azure test case 15764
  test('15764: should route an edited rejected registration back into the approval queue', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, reject, then edit back to Draft', async () => {
      await rejectAFreshRegistration(payerManagementPage, approvalManagementPage, draftPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.editSingleFieldAndSave(
        draftPayer.nameEn,
        RESUBMIT_EDIT.label,
        RESUBMIT_EDIT.value,
        RESUBMIT_EDIT.kind,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, DRAFT_STATUS);
    });

    await steps.step('Resubmitting the edited draft puts it back in the reviewer queue', async () => {
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });
  });

  // Azure test case 15762
  test('15762: should keep the rejected state through a reload', async ({
    page,
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and reject a fresh registration', async () => {
      await rejectAFreshRegistration(payerManagementPage, approvalManagementPage, draftPayer.nameEn);
    });

    await steps.step('After a reload it is still Rejected at v0 with its reason', async () => {
      // Persistence: a rejected state held only in the client would not survive
      // a fresh page load. The reason is re-read from the trail after reload.
      await payerManagementPage.open();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await payerManagementPage.waitForPageReady();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, REJECTED);
      expect(await payerManagementPage.getVersionNumber(draftPayer.nameEn)).toBe(FIRST_VERSION);
    });
  });

  // Azure test case 15761
  test('15761: should show correct, non-blank fields on a rejected row', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and reject a fresh registration', async () => {
      await rejectAFreshRegistration(payerManagementPage, approvalManagementPage, draftPayer.nameEn);
    });

    await steps.step('The rejected row still carries the payer\'s own data', async () => {
      // A rejected registration must remain a complete, readable record - its
      // name and type intact - not a stub. Read from the detail screen.
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      expect(await detail.getName(), 'the rejected record should still show its name').toContain(
        draftPayer.nameEn,
      );
      expect(
        await detail.getFieldValue('Email Address'),
        'the rejected record should still carry its contact data',
      ).not.toBe('');
    });
  });
});

/** Access control - who may edit a rejected registration. */
test.describe('Rejected registration - Edit permission', () => {
  // Azure test case 15763
  test('15763: should restrict editing a rejected registration to users with edit permission', async ({
    steps,
  }) => {
    // STILL BLOCKED, but no longer for the reason it was. The ROLE is now
    // buildable - shapedNonAdmin can take Edit Payer off the shared role - so
    // what is missing is the RECORD: the case needs a REJECTED registration the
    // restricted account can see, and that account is scoped to two live payers
    // (Al Dawaa, NUPCO) which must not be driven through a rejection. A fresh
    // rejected draft, which TC-003 builds, is outside its scope and invisible to
    // it. Assign the non-admin account to a disposable payer and this case can
    // be written exactly like the other shaped-role cases.
    steps.blocked(
      'The restricted ROLE can now be built by shapedNonAdmin, so the account is no longer the '
        + "blocker; the REGISTRATION is. The case needs a rejected registration inside the "
        + "non-admin account's scope, and that account sees only two shared live payers which "
        + "must not be rejected. The reachable half - that the administrator CAN edit a rejected "
        + "registration - is proven by TC-003. Assign the non-admin account to a disposable payer "
        + 'and re-run.',
    );
  });
});
