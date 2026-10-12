import { test, expect } from '../../../fixtures';
import { findPayer } from '../../../utils/PayerFinder';
import { Logger } from '../../../utils/Logger';
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
  // Azure test case 15513
  test('15513: should move the payer to its post-rejection state and record the reason', async ({
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
      // Let the decision land before leaving - the race that left 15516's
      // rejection undone in batch 5 (2026-10-11).
      await approvalManagementPage.waitForDecisionProcessed(draftPayer.nameEn);
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
      // POLLED, not read once (changed 2026-10-11, note N-066). The history
      // panel fills in after the tab opens; reading it immediately reported
      // "(nothing)" for a panel that had not loaded yet. Keep re-reading until
      // the entries arrive, then judge them.
      let entries: string[] = [];
      await expect
        .poll(async () => {
          entries = await detail.getAuditEntryTexts();
          return entries.some((entry) => entry.includes(reason));
        }, {
          timeout: 60_000,
          message: `the history should show the rejection reason "${reason}"`,
        })
        .toBe(true)
        .catch(() => {
          throw new Error(
            `the history should show the rejection reason "${reason}" within 60 s; after waiting it `
            + `showed: ${entries.slice(0, 4).join(' | ') || '(nothing - the history panel stayed empty)'}`,
          );
        });
    });
  });

  // Azure test case 15515
  test('15515: should offer no reject action on a request that has already been decided', async ({
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

  // Azure test case 15516
  //
  // ON AN ESTABLISHED PAYER (changed 2026-10-11, QA-lead note N-067). Run on a
  // brand-new v0 registration, the rejection left an audit trail with no
  // entries at all ("observed []"). The QA lead asked for a payer that already
  // has at least three versions, so the request rejected here is an UPDATE to
  // a live payer. One of the SUITE'S OWN payers is used - the case edits and
  // rejects a change on it, so never a real record or a reference payer.
  test('15516: should state the requirement clearly and record who rejected what', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    const reason = REJECTION_DIALOG_REASONS[2];
    const draftPayer = { nameEn: '' };

    await steps.critical('Navigate to the module and submit a change to a payer with 3+ versions', async () => {
      // BUILT TO v3 (2026-10-11). The clean-up sweeps remove the suite's
      // older payers, so a found v3 payer was gone by batch 4 (BLOCKED). The
      // suite's own published payer (v1) is taken through two approved edits
      // to v3, then the change this case rejects is submitted on top - an
      // UPDATE to an established, active payer, as note N-067 asks.
      draftPayer.nameEn = publishedPayer.nameEn;
      for (const [round, phone] of [[2, '512345681'], [3, '512345682']] as const) {
        await payerManagementPage.open();
        await payerManagementPage.search(draftPayer.nameEn);
        await payerManagementPage.saveTextFieldEdit(draftPayer.nameEn, 'Phone Number', phone);
        await payerManagementPage.open();
        await payerManagementPage.sendForApproval(draftPayer.nameEn);
        await approvalManagementPage.open();
        await approvalManagementPage.approve(draftPayer.nameEn);
        Logger.step(`[case] "${draftPayer.nameEn}" approved at v${round}`);
      }
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.saveTextFieldEdit(draftPayer.nameEn, 'Phone Number', '512345680');
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
      // LET THE DECISION LAND before leaving the page (2026-10-11). Batch 5
      // navigated away 0.8 s after confirming, and v4 stayed "Pending Approval"
      // with no reviewer - leaving cancels the in-flight reject, which is why
      // approve()/reject() wait for the request to leave the queue.
      await approvalManagementPage.waitForDecisionProcessed(draftPayer.nameEn);
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

  // Azure test case 15517
  test('15517: should withhold the Reject action from a user who is not a reviewer', async ({
    requireNonAdmin,
    loginPage,
    approvalManagementPage,
    steps,
  }) => {
    // BLOCKED (not FAIL) when the configured non-admin account cannot serve this
    // case - see data/accounts/nonAdminAccount.data.ts for what it holds.
    requireNonAdmin({ lacking: ['approvePayer'] });

    await steps.critical('Open the approval queue as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      // openHub, not open: a role without the payer approval permission is not
      // offered the Payer queue at all (VERIFIED as the Payer Admin), and
      // open() asserts that queue's table.
      await approvalManagementPage.openHub();
    });

    await steps.step('The decision actions are withheld from this role', () =>
      approvalManagementPage.expectApprovalActionsDenied());
  });
});
