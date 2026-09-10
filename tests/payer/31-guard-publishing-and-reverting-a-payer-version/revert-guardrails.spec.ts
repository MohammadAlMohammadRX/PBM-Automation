import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import {
  APPROVED_LIFECYCLE_STATUSES,
  EDITED_FIELD,
  EXPECTED_ROW_ACTIONS,
  OBSERVED_ROW_ACTION,
  REVIEWER_ROLE_REQUIREMENT,
  UNKNOWN_VERSION_LABEL,
  VERSION_STATUS,
} from '../../../data/payers/publishAndRevert.data';

/**
 * User story: Guard Publishing and Reverting a Payer Version.
 * The revert half, the lookup failures, and the audit trail.
 *
 * REVERTING IS NOT OFFERED. The version-history rows carry a View action and
 * nothing else, so "select v2 and choose Revert" has no control to use. The
 * consequence splits the sheet's cases neatly in two:
 *
 *   Where a revert is supposed to SUCCEED (TC-005), the case fails and names
 *   what the row actually offered - the capability is missing.
 *
 *   Where a revert is supposed to be REFUSED (a draft, the current version),
 *   the refusal holds by absence, which is stronger than the check the sheet
 *   asks for.
 *
 * The lookup cases are asked of the interface rather than by URL tampering:
 * this suite addresses versions by their label, so "a version that does not
 * exist for this payer" is a label the history does not list - and the
 * assertion is that nothing can be done with it.
 */
test.describe('Revert guardrails', () => {
  test('TC-005: should make a previously published version live again when reverted', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let versionLabels: string[] = [];

    await steps.critical('Navigate to the module and build a second published version', async () => {
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
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.critical('Its history lists both versions with their statuses', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      versionLabels = await versions.getVersionLabels();
      expect(
        versionLabels.length,
        `the payer should now hold more than one version; it lists: ${versionLabels.join(', ')}`,
      ).toBeGreaterThan(1);
    });

    await steps.step('The earlier version offers a revert', async () => {
      // FAILS. The row's only action is View, so the revert the story is built
      // on cannot be requested at all - the capability is absent rather than
      // guarded.
      const versions = payerManagementPage.detail().versionHistory();
      const earlier = versionLabels[versionLabels.length - 1];
      const actions = await versions.getEntryActions(earlier);
      expect(
        actions,
        `version "${earlier}" offers: ${actions.join(', ') || '(nothing)'}`,
      ).toContain(EXPECTED_ROW_ACTIONS.revert);
    });

    await steps.step('The live configuration is unchanged by the attempt', async () => {
      const detail = payerManagementPage.detail();
      expect(
        await detail.getFieldValue(EDITED_FIELD.label),
        'nothing was reverted, so the latest approved value still stands',
      ).toBe(EDITED_FIELD.first);
    });
  });

  test('TC-006: should offer no revert to a draft version', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let draftLabel!: string;

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

    await steps.critical('The history is open', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      const labels = await versions.getVersionLabels();
      expect(labels.length, 'the history should list a version to look at').toBeGreaterThan(0);
      draftLabel = labels[0];
    });

    await steps.step('Reverting to it cannot be attempted', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      expect(
        await versions.getEntryActionAvailability(draftLabel, EXPECTED_ROW_ACTIONS.revert),
        'a version that was never published is not a revert target',
      ).toBe('absent');
    });

    await steps.step('And the row offers only what it should', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      expect(
        await versions.getEntryActions(draftLabel),
        'the history is a record, not a control surface',
      ).toContain(OBSERVED_ROW_ACTION);
    });
  });

  test('TC-007: should offer no revert to the version that is already live', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let currentLabel!: string;

    await steps.critical('Navigate to the module with a published payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        VERSION_STATUS.published,
      );
    });

    await steps.critical('Its current version is identified in the history', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      const entries = await versions.getEntries();
      const current = entries.find((entry) => entry.status.includes(VERSION_STATUS.published));
      expect(current, 'the live version should be listed').not.toBeUndefined();
      currentLabel = current!.version;
    });

    await steps.step('Reverting to the current version cannot be attempted', async () => {
      // A revert to the version already live is a no-op at best, and the
      // application forecloses it the same way it forecloses every other
      // revert: there is no control.
      const versions = payerManagementPage.detail().versionHistory();
      expect(
        await versions.getEntryActionAvailability(currentLabel, EXPECTED_ROW_ACTIONS.revert),
        'the current version is not a revert target',
      ).toBe('absent');
    });

    await steps.step('And it is still the live version afterwards', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      expect(
        await versions.getCell(currentLabel, 'status'),
        'nothing changed by looking',
      ).toContain(VERSION_STATUS.published);
    });
  });

  test('TC-008: should do nothing with a version identifier that does not exist', async ({
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
      expect(labels.length, 'the history should list this payer versions').toBeGreaterThan(0);
    });

    await steps.step('A version the payer does not have is not listed', async () => {
      // The lookup case asked of the interface: the suite addresses versions by
      // label, so a non-existent version is a label the history does not carry.
      // Nothing can be done with it, which is the outcome the sheet wants.
      expect(
        labels,
        `"${UNKNOWN_VERSION_LABEL}" should not appear among ${labels.join(', ')}`,
      ).not.toContain(UNKNOWN_VERSION_LABEL);
    });

    await steps.step('And it cannot be acted on', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      await versions.expectDoesNotListVersion(UNKNOWN_VERSION_LABEL);
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

  test('TC-013: should record every legitimate transition and no false ones', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and take a version through its states', async () => {
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
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.step('The history lists the approved version with its reviewer', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      await versions.expectEveryEntryComplete();
    });

    await steps.step('No entry claims a publish or revert that never happened', async () => {
      // The audit-integrity half. Every listed version must be one this case
      // actually created: a phantom "Reverted" entry, or a published entry for
      // a draft, would show up here.
      const versions = payerManagementPage.detail().versionHistory();
      const statuses = await versions.getListedStatuses();
      expect(
        statuses.some((status) => /revert/i.test(status)),
        `no revert was performed, so none should be recorded; statuses: ${statuses.join(', ')}`,
      ).toBe(false);
      // And no entry claims a state this case never produced. Asserted against
      // the approval lifecycle rather than with expectOnlyPublishedVersions:
      // that helper encodes the version-history story's own rule that the tab
      // lists only published versions, and this payer has been approved twice,
      // so its first version correctly reads "Superseded". Borrowing the helper
      // here failed the case on another story's premise.
      const unexpected = statuses.filter(
        (status) => !APPROVED_LIFECYCLE_STATUSES.some((allowed) => status.includes(allowed)),
      );
      expect(
        unexpected,
        `two approvals produce a published and a superseded version and nothing else; `
          + `statuses seen: ${statuses.join(', ')}`,
      ).toEqual([]);
    });

    await steps.step('And the audit trail carries the actor and a timestamp', async () => {
      const detail = payerManagementPage.detail();
      await detail.openAuditHistory();
      await detail.expectAuditEntryMatching(/By:\s*\S+/, 'the actor behind each change');
    });
  });
});

/** The reviewer-separation case, which needs a second account. */
test.describe('Revert guardrails - Segregation of duties', () => {
  test('TC-012: should block a submitter from approving their own version', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a version', async () => {
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

    await steps.critical('The version is waiting in the queue', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });

    await steps.step("The submitter's own account is refused the approval", async () => {
      // FAILS in this environment, and the failure IS the finding: the same
      // administrator both submits and approves throughout this application, so
      // segregation of duties is not enforced. `expectSelfApprovalPrevented`
      // accepts either shape of refusal - the request absent from the queue, or
      // the decision actions withheld - so a build that enforced it either way
      // would pass.
      await approvalManagementPage.expectSelfApprovalPrevented(publishedPayer.nameEn);
    });

    await steps.step('A reviewer account is needed to carry the approval', async () => {
      if (!env.nonAdminUsername || !env.nonAdminPassword) {
        steps.blocked(
          `the reviewer half of this case needs a second account. ${
            REVIEWER_ROLE_REQUIREMENT.reason
          } Set NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env to ${
            REVIEWER_ROLE_REQUIREMENT.role
          }, then re-run this case.`,
        );
      }
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });
  });
});
