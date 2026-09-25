import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { PRIMARY_REASON } from '../../../data/payers/inactivationDecisions.data';
import {
  BLOCKED_CASES,
  CONCURRENT_CHANGE_HINT,
  IMPACT_FAILURE_HINT,
} from '../../../data/payers/downstreamImpact.data';

/**
 * User story: Trigger Downstream Impact Analysis on Status Change.
 *
 * The preview's presence, categories, zero state and cancel are the
 * impact-preview story (folder 52). This story's own ground is the analysis as
 * a GATE: the change must not proceed when the analysis cannot run, and two
 * administrators must not both stage it blind. Every case that needs the
 * analysis to find something is BLOCKED on a payer with active policies.
 */
test.describe('Downstream impact analysis as a gate', () => {
  // Azure test case 15048
  test('15048: should block the status change when the impact analysis service fails', async ({
    page,
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    let hadImpact = true;

    await steps.critical('Navigate to the module and open the Inactivate drawer with the impact service down', async () => {
      await NetworkUtils.failEndpoint(page, ApiEndpoints.payerImpactPreview);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.waitForOpen();
      hadImpact = await payerInactivateDialog.hasImpactSection();
    });

    await steps.step('The drawer refuses to proceed and tells the user why', async () => {
      // An unassessed change is the thing this story exists to prevent. Any of
      // three refusals satisfies it: Confirm gated, the drawer holding, or a
      // message naming the failed analysis. None of them is a defect here.
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      const outcome = await payerInactivateDialog.attemptConfirm();
      const stillOpen = await payerInactivateDialog.remainsOpen();
      const messages = [
        ...(await payerInactivateDialog.getValidationMessages()),
        ...(await payerManagementPage.waitForVisibleMessages()),
      ];
      const informed = messages.some((message) => IMPACT_FAILURE_HINT.test(message));
      expect(
        outcome.wasGated || stillOpen || informed,
        `with the impact analysis unavailable the change must not proceed unassessed; the impact `
          + `section was ${hadImpact ? 'shown' : 'DROPPED from the drawer'}, Confirm was `
          + `${outcome.wasGated ? 'disabled' : 'enabled'}, the drawer ${stillOpen ? 'stayed open' : 'closed'} `
          + `and the screen showed: ${messages.join(' | ') || '(nothing)'}`,
      ).toBe(true);
    });

    await steps.step('The payer\'s status is unchanged and nothing was staged', async () => {
      await NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerImpactPreview);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      const label = await payerManagementPage.getVersionLabel(publishedPayer.nameEn);
      expect(
        label,
        `no change should have been staged while the analysis was down; the row reads "${label}"`,
      ).not.toMatch(/Draft|Pending/i);
    });
  });

  test('TC-008: should inform the second administrator when two sessions change the same payer\'s status at once', async ({
    payerManagementPage,
    payerInactivateDialog,
    staleSession,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and open the Inactivate drawer in the first session', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.getImpactSummaryText();
    });

    await steps.step('A second administrator stages the same inactivation first', async () => {
      await staleSession.payerPage.open();
      await staleSession.payerPage.search(publishedPayer.nameEn);
      await staleSession.payerPage.waitForRowVisible(publishedPayer.nameEn);
      await staleSession.payerPage.inactivateRow(publishedPayer.nameEn);
      await staleSession.inactivateDialog.selectReason(PRIMARY_REASON);
      await staleSession.inactivateDialog.confirm();
      await staleSession.payerPage.open();
      await staleSession.payerPage.search(publishedPayer.nameEn);
      const label = await staleSession.payerPage.getVersionLabel(publishedPayer.nameEn);
      expect(label, `the second session should have staged a draft; the row reads "${label}"`).toMatch(
        /Draft|Pending/i,
      );
    });

    await steps.step('The first session is told about the concurrent change when it confirms', async () => {
      // The first administrator reviewed an impact summary that is now stale
      // and is about to stage a second, competing change. The sheet expects
      // them to be told; a silent duplicate is the defect.
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.attemptConfirm();
      const stillOpen = await payerInactivateDialog.remainsOpen();
      const messages = [
        ...(await payerInactivateDialog.getValidationMessages()),
        ...(await payerManagementPage.waitForVisibleMessages()),
      ];
      const informed = messages.some((message) => CONCURRENT_CHANGE_HINT.test(message));
      expect(
        informed || stillOpen,
        `the first administrator should be told another change is already staged; the drawer `
          + `${stillOpen ? 'stayed open' : 'closed'} and the screen showed: `
          + `${messages.join(' | ') || '(nothing)'}`,
      ).toBe(true);
    });

    await steps.step('The payer carries a single staged change', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      const label = await payerManagementPage.getVersionLabel(publishedPayer.nameEn);
      expect(label, `one staged change should remain; the row reads "${label}"`).toMatch(/Draft|Pending/i);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-001 = 15029,  TC-003 = 15039,  TC-004 = 15040
    //   TC-006 = 15032,  TC-009 = 15052
    test(`${azureOrCase('56', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
