import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import {
  REJECT_DIALOG,
  REJECTED_STATUS,
  REJECTION_DIALOG_REASONS,
  RESTRICTED_ROLE_REQUIREMENT,
} from '../../../data/payers/rejectionReason.data';

/**
 * User story: Require a Reason When Rejecting a Request.
 * What a rejection leaves behind, and who may raise one.
 *
 * These are the cases that look past the dialog: the payer's own state
 * afterwards, whether the reason is visible in its history, whether a decided
 * request can be decided twice, and whether the action is available to a user
 * who is not a reviewer.
 */
test.describe('Require a reason when rejecting - Outcome', () => {
  test('TC-006: should move the payer to its post-rejection state and record the reason', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    const reason = REJECTION_DIALOG_REASONS[0];

    await steps.critical('Navigate to the module and submit a request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.critical('A valid reason is entered', async () => {
      const dialog = await approvalManagementPage.openRejectDialog(draftPayer.nameEn);
      await dialog.selectReasonIfPresent(reason);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeEnabled('the reason should release Reject');
    });

    await steps.step('Submitting the rejection transitions the payer', async () => {
      await payerManagementPage.dialog().confirm('Reject');
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, REJECTED_STATUS);
    });

    await steps.step('The reason is visible in the payer history', async () => {
      // The version history has no reason column - version, change type,
      // status, requested by/on, reviewed by/on - so the audit timeline is
      // where a reason could be shown. If neither carries it, the reviewer's
      // reason is recorded somewhere the maker cannot see, which is what this
      // step reports.
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      await detail.openAuditHistory();
      const entries = await detail.getAuditEntryTexts();
      expect(
        entries.some((entry) => entry.includes(reason)),
        `the history should show the rejection reason "${reason}"; it showed: `
          + `${entries.slice(0, 4).join(' | ') || '(nothing)'}`,
      ).toBe(true);
    });
  });

  test('TC-008: should offer no reject action on a request that has already been decided', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.critical('The request is rejected', async () => {
      await approvalManagementPage.reject(draftPayer.nameEn, REJECTION_DIALOG_REASONS[4]);
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, REJECTED_STATUS);
    });

    await steps.step('The finalized request no longer appears with active decisions', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
    });

    await steps.step('And the payer offers no route back into a decision', async () => {
      // The stale-page half of the sheet's case: whatever a reviewer had open,
      // the record now carries a rejected version and the queue holds nothing
      // for it, so there is no reject action to reach.
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      expect(
        await payerManagementPage.getApprovalStatus(draftPayer.nameEn),
        'the version is finalized as rejected',
      ).toContain(REJECTED_STATUS);
      expect(
        await approvalManagementPage.countQueuedRequests(draftPayer.nameEn),
        'and no request remains to be decided again',
      ).toBe(0);
    });
  });

  test('TC-009: should state the requirement clearly and record who rejected what', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    const reason = REJECTION_DIALOG_REASONS[2];

    await steps.critical('Navigate to the module and submit a request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.step('The dialog states the requirement against its checklist', async () => {
      const dialog = await approvalManagementPage.openRejectDialog(draftPayer.nameEn);
      // Clear wording, the field it wants, and a blocked submission - the
      // sheet's three criteria, one assertion each.
      expect(await dialog.getTitle(), 'clear wording').toBe(REJECT_DIALOG.title);
      expect(
        await dialog.getReasonOptions(),
        'it identifies the field by offering its values',
      ).toEqual(expect.arrayContaining([reason]));
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled(
        'and it blocks the submission until the field is answered',
      );
    });

    await steps.step('The rejection is recorded with its reason', async () => {
      const dialog = payerManagementPage.dialog();
      await dialog.selectReasonIfPresent(reason);
      // The confirm needs the acknowledgement as well as the reason.
      await dialog.acknowledgeIfPresent();
      await dialog.confirm('Reject');
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, REJECTED_STATUS);
    });

    await steps.step('The audit log names the reviewer and the decision', async () => {
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      await detail.openAuditHistory();
      // The reviewer and a timestamp are what the timeline does carry ("By:
      // CareConnect", "09/09/2026 01:18 PM"), so those are asserted; the reason
      // itself is TC-006's subject.
      await detail.expectAuditEntryMatching(
        /By:\s*\S+/,
        'the reviewer who made the decision',
      );
    });

    await steps.step("The maker can see the outcome on the payer's own version", async () => {
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      expect(
        await versions.getListedStatuses(),
        'the rejected version should be visible to the maker',
      ).toEqual(expect.arrayContaining([expect.stringContaining(REJECTED_STATUS)]));
    });
  });
});

/** Access control, signed out of the shared administrator session. */
test.describe('Require a reason when rejecting - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-010: should withhold the Reject action from a user who is not a reviewer', async ({
    loginPage,
    approvalManagementPage,
    steps,
  }) => {
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. ${
          RESTRICTED_ROLE_REQUIREMENT.reason
        } Set them to an account holding ${RESTRICTED_ROLE_REQUIREMENT.role}, then re-run this `
          + 'case.',
      );
    }

    await steps.critical('Open the approval queue as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await approvalManagementPage.open();
    });

    await steps.step('The decision actions are withheld from this role', () =>
      approvalManagementPage.expectApprovalActionsDenied());
  });
});
