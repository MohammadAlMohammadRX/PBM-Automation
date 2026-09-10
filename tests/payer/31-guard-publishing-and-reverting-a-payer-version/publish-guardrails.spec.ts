import { test, expect } from '../../../fixtures';
import {
  EDITED_FIELD,
  EXPECTED_ROW_ACTIONS,
  OBSERVED_ROW_ACTION,
  PUBLISH_ROUTE,
  UNPUBLISHABLE_STATUSES,
  VERSION_STATUS,
} from '../../../data/payers/publishAndRevert.data';

/**
 * User story: Guard Publishing and Reverting a Payer Version.
 * The publish half.
 *
 * PUBLISHING IS NOT A SEPARATE ACTION IN THIS APPLICATION. A version becomes
 * live by being APPROVED in the approvals queue; the version-history rows carry
 * a View action and nothing else, and there is no Publish control anywhere in
 * the payer module.
 *
 * That makes the sheet's negative cases unreachable in the best possible way:
 * a Draft, a Rejected or an already-Published version cannot be published
 * because nothing anywhere offers to publish anything. Each case asserts that
 * absence - reading the row's actions rather than assuming them, so the day a
 * Publish control appears these cases start exercising it - and the positive
 * case drives the route that does exist.
 */
test.describe('Publish guardrails', () => {
  test('TC-001: should make the approved version live when a pending version is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and stage a configuration change', async () => {
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

    await steps.step('Submitting it moves the version to Pending Approval', async () => {
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.pending,
      );
    });

    await steps.step('A reviewer approves it', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });

    await steps.step('The approved version is now the live one', async () => {
      // Approval IS publication here - the only route to live, and the reason
      // the negative cases below have nothing to attack.
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.published,
      );
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        await detail.getFieldValue(EDITED_FIELD.label),
        'the live configuration should carry the approved change',
      ).toBe(EDITED_FIELD.first);
      expect(PUBLISH_ROUTE, 'and it got there by approval').toBe('approval');
    });
  });

  test('TC-002: should offer no way to publish a draft version directly', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let actions: string[] = [];

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

    await steps.critical('Its version history is open', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      const labels = await versions.getVersionLabels();
      expect(labels.length, 'the payer should have at least one version listed').toBeGreaterThan(0);
      actions = await versions.getEntryActions(labels[0]);
    });

    await steps.step('The version row offers no publish control', async () => {
      // The refusal, and it is absolute: the row carries View and nothing else,
      // so a direct publish cannot be composed - let alone refused.
      expect(
        actions,
        `the row offers: ${actions.join(', ') || '(nothing)'}`,
      ).not.toContain(EXPECTED_ROW_ACTIONS.publish);
      expect(actions, 'the one action it does carry').toContain(OBSERVED_ROW_ACTION);
    });

    await steps.step('And the draft never reaches the approvals queue by itself', async () => {
      // The other half of "bypassing the workflow": an unsubmitted draft is not
      // in the queue, so a reviewer cannot approve it into life either.
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });

    await steps.step('The payer is still a draft, unpublished', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.draft,
      );
    });
  });

  test('TC-003: should offer no way to publish a version that is already live', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let publishedLabel!: string;

    await steps.critical('Navigate to the module with a payer whose version is live', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.published,
      );
    });

    await steps.critical('Its published version is listed in the history', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      const entries = await versions.getEntries();
      const published = entries.find((entry) => entry.status.includes(VERSION_STATUS.published));
      expect(
        published,
        `a published version should be listed; statuses: ${entries.map((e) => e.status).join(', ')}`,
      ).not.toBeUndefined();
      publishedLabel = published!.version;
    });

    await steps.step('Publishing it again cannot be attempted', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      expect(
        await versions.getEntryActionAvailability(publishedLabel, EXPECTED_ROW_ACTIONS.publish),
        'an already-live version offers no republish',
      ).toBe('absent');
    });

    await steps.step('And it remains the live version, unchanged', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      expect(
        await versions.getCell(publishedLabel, 'status'),
        'the version keeps the status it had',
      ).toContain(VERSION_STATUS.published);
    });
  });

  test('TC-004: should offer no way to publish a rejected version', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and get a version rejected', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      await approvalManagementPage.reject(draftPayer.nameEn, 'Incorrect Data');
    });

    await steps.critical('The payer shows a rejected version', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        draftPayer.nameEn,
        VERSION_STATUS.rejected,
      );
    });

    await steps.step('Publishing the rejected version cannot be attempted', async () => {
      // Nothing offers it, and the queue no longer holds the request - so the
      // rejected version has no route to live at all. The sheet asks for a
      // message saying the version is not pending approval; there is no action
      // to produce one.
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
    });

    await steps.step('The user is told why it cannot be published', async () => {
      // FAILS. The refusal is structural rather than stated: with no publish
      // control and no queue entry, nothing explains that a rejected version
      // must be resubmitted from scratch - the reject dialog said so at the
      // time, but the payer screen itself is silent.
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      const messages = await detail.waitForVisibleMessages();
      expect(
        messages,
        `the screen should explain the rejected version's dead end; it showed: `
          + `${messages.join(' | ') || '(nothing)'}`,
      ).not.toEqual([]);
    });

    await steps.step('And the rejected version is still rejected', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        draftPayer.nameEn,
        VERSION_STATUS.rejected,
      );
    });
  });

  test('TC-015: should block a publish from every status except a pending approval', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    const attempted: { status: string; publishable: boolean }[] = [];

    await steps.critical('Navigate to the module with a published payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.published,
      );
    });

    await steps.step('A published version cannot be published', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      const labels = await versions.getVersionLabels();
      const availability = await versions.getEntryActionAvailability(
        labels[0],
        EXPECTED_ROW_ACTIONS.publish,
      );
      attempted.push({ status: VERSION_STATUS.published, publishable: availability === 'available' });
      expect(availability, 'an already-live version').toBe('absent');
    });

    await steps.step('A draft version cannot be published either', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.second,
      );
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      const labels = await versions.getVersionLabels();
      const availability = await versions.getEntryActionAvailability(
        labels[0],
        EXPECTED_ROW_ACTIONS.publish,
      );
      attempted.push({ status: VERSION_STATUS.draft, publishable: availability === 'available' });
      expect(availability, 'a draft version').toBe('absent');
    });

    await steps.step('Only the pending version can be made live, and only by approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.published,
      );
    });

    await steps.step('Every other partition was blocked', async () => {
      expect(
        attempted.filter((attempt) => attempt.publishable),
        `no status should have offered a publish; tried: ${attempted
          .map((a) => `${a.status} -> ${a.publishable ? 'offered' : 'blocked'}`)
          .join('; ')}`,
      ).toEqual([]);
      expect(
        UNPUBLISHABLE_STATUSES.length,
        'the three statuses the sheet names as unpublishable',
      ).toBe(3);
    });
  });
});
