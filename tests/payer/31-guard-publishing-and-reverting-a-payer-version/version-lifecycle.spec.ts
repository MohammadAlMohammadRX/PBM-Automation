import { test, expect } from '../../../fixtures';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  EDITED_FIELD,
  EXPECTED_ROW_ACTIONS,
  UNKNOWN_VERSION_LABEL,
  VERSION_STATUS,
} from '../../../data/payers/publishAndRevert.data';

/**
 * User story: Guard Publishing and Reverting a Payer Version.
 * The lifecycle, the failure path, and the stale-approval case.
 *
 * These four are the ones that check the workflow holds together rather than
 * that a single control is guarded: a version walking Draft to Pending to
 * Rejected and on to Published; an approval that fails mid-apply; and an
 * approval attempted on a request that is no longer there.
 */
test.describe('Version lifecycle', () => {
  test('TC-009: should do nothing with a revert to a version this payer does not have', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let labels: string[] = [];

    await steps.critical('Navigate to the module and open the version history', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      labels = await versions.getVersionLabels();
      expect(labels.length, "the payer's own versions should be listed").toBeGreaterThan(0);
    });

    await steps.step('The version it does not have is not offered as a revert target', async () => {
      // The revert counterpart of the publish lookup case. Versions are
      // addressed by the label the history renders, so a version belonging to
      // no payer is a label that is not there - and there is no revert control
      // on any row in any case.
      const versions = payerManagementPage.detail().versionHistory();
      await versions.expectDoesNotListVersion(UNKNOWN_VERSION_LABEL);
    });

    await steps.step('And no revert can be requested for the versions it does have', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      for (const label of labels) {
        expect(
          await versions.getEntryActionAvailability(label, EXPECTED_ROW_ACTIONS.revert),
          `version "${label}" should offer no revert`,
        ).toBe('absent');
      }
    });

    await steps.step('The payer is unaffected', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.published,
      );
    });
  });

  test('TC-010: should leave the version pending when the approval fails to apply', async ({
    page,
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // Two complete submit-and-approve cycles plus a fault injection: the
    // discovery step alone drives one, and the broken-endpoint step drove
    // another in 69 seconds. The default 120s budget expired with the retry
    // step still to run, which reported as an assertion failure on a case that
    // had not finished executing.
    test.slow();

    let approvalEndpoint = '';

    await steps.critical('Navigate to the module and submit a version for approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.first,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.pending,
      );
    });

    await steps.critical('The approval endpoint is discovered and made to fail', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      // DISCOVERED rather than named: this framework does not carry the
      // approvals decision path, and failing a guessed one would break nothing
      // - which looks exactly like an approval that cannot fail. The first
      // approve attempt is watched to learn the URL, and that URL is broken for
      // the retry.
      approvalEndpoint = (await NetworkUtils.captureRequestUrl(page, /approv/i, () =>
        approvalManagementPage.approve(publishedPayer.nameEn).catch(() => undefined))) ?? '';
      expect(
        approvalEndpoint,
        'approving should have called an approvals endpoint',
      ).not.toBe('');
    });

    await steps.step('A second submission is attempted with the endpoint broken', async () => {
      await NetworkUtils.failEndpoint(page, approvalEndpoint);
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.second,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn).catch(() => undefined);
      await NetworkUtils.restore(page);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      // The version must not be lost and must not be live: a failure between
      // "approved" and "applied" is the one place a maker-checker workflow can
      // drop a change silently.
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.pending,
      );
    });

    await steps.step('The request is still in the queue, not consumed by the failure', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });

    await steps.step('And retrying once the endpoint recovers makes it live', async () => {
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.published,
      );
    });
  });

  test('TC-011: should walk a version from draft to rejected and a second one to published', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // Two versions taken through the full lifecycle - draft, submit, reject,
    // then draft, submit, approve - which is more round trips than the default
    // budget covers.
    test.slow();

    await steps.critical('Navigate to the module and create a draft version', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.first,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.draft,
      );
    });

    await steps.step('Submitting it moves it to Pending Approval', async () => {
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.pending,
      );
    });

    await steps.step('Rejecting it leaves the live version standing, the rejection recorded', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.reject(publishedPayer.nameEn, 'Change Not Required');

      // VERIFIED, and not what this step first asserted. The list's approval
      // cell does NOT read "Rejected" for a payer that already had a published
      // version: it goes back to showing the live one ("v1 - Published"),
      // because the rejected version is no longer the payer's current version.
      // Asserting "Rejected" there failed against correct behaviour - and the
      // behaviour is the better guarantee, so it is what is asserted now: the
      // rejected change did not become live, and the rejection is on the
      // record where a reviewer can see it.
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.published,
      );
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      expect(
        await versions.getListedStatuses(),
        'the rejected version should be listed as rejected',
      ).toEqual(expect.arrayContaining([expect.stringContaining(VERSION_STATUS.rejected)]));
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });

    await steps.step('A second draft can be created, submitted and approved', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.second,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.step('And it becomes the live version, the rejection behind it', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.published,
      );
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        await detail.getFieldValue(EDITED_FIELD.label),
        'the live value should be the one that was approved, not the rejected one',
      ).toBe(EDITED_FIELD.second);
    });
  });

  test('TC-014: should refuse an approval for a request that is no longer there', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a version for approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.first,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });

    await steps.critical('The pending version is withdrawn behind the reviewer', async () => {
      // Withdrawn the way the application allows: an edit to a pending payer
      // returns it to draft and takes the request out of the queue. That is the
      // sheet's "withdraw or simulate its removal", performed for real.
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.second, 'text');
      expect(await form.saveAndReportDialog(), 'the withdrawal warning should appear').toBe(true);
      await payerManagementPage.form().confirmWithdrawal();
    });

    await steps.step('The request is gone from the queue', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });

    await steps.step('It cannot be approved, and nothing goes live', async () => {
      // With the row gone there is no approve action to reach - the stale link
      // the sheet describes has nothing behind it. What matters is the outcome:
      // no live change was made from a request that had been withdrawn.
      expect(
        await approvalManagementPage.countQueuedRequests(publishedPayer.nameEn),
        'a withdrawn request should not be decidable',
      ).toBe(0);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.draft,
      );
    });

    await steps.step("And the payer's live configuration is untouched", async () => {
      // The newest version must not be a published one: the request was
      // withdrawn, so whatever it carried never went live. Read from the top of
      // the history, which runs newest-first.
      //
      // NOT expectOnlyPublishedVersions - the tab lists a payer's own draft
      // version, so demanding that every entry be published fails here on a
      // record that is behaving exactly as this case requires.
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      const entries = await versions.getEntries();
      expect(entries.length, 'the payer should still list its versions').toBeGreaterThan(0);
      expect(
        entries[0].status,
        `the withdrawn version must not be live; the newest entry reads "${entries[0].status}"`,
      ).toContain(VERSION_STATUS.draft);
    });
  });
});
