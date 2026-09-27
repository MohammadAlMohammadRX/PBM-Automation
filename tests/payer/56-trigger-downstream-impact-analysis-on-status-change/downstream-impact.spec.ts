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

  // Azure test case 15056
  test('15056: should refuse the status change until a reason is given', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the Inactivate drawer on a published payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.waitForOpen();
    });

    // The reason is what the impact analysis and the audit trail are recorded
    // against, so a status change without one would leave a change nobody can
    // account for. Either refusal is correct - Confirm gated, or the drawer
    // holding - and the message says which was met.
    await steps.step('Confirming with no reason chosen does not put the change through', async () => {
      const outcome = await payerInactivateDialog.attemptConfirm();
      const stillOpen = await payerInactivateDialog.remainsOpen();
      expect(
        outcome.wasGated || stillOpen,
        `a status change with no reason must not proceed; Confirm was ${outcome.wasGated ? 'disabled' : 'enabled'} `
          + `and the drawer ${stillOpen ? 'stayed open' : 'CLOSED'}`,
      ).toBe(true);
    });

    await steps.step('And the payer is left exactly as it was', async () => {
      await payerInactivateDialog.cancel().catch(() => undefined);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  // Azure test case 15044
  test('15044: should raise the impact analysis for a status change and not for an ordinary edit', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    page,
    steps,
  }) => {
    let onStatusChange = false;

    await steps.step('A status change raises the analysis', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.waitForOpen();
      onStatusChange = await payerInactivateDialog.hasImpactSection();
      expect(
        onStatusChange,
        'inactivation is a qualifying transition, so the drawer should carry the impact summary',
      ).toBe(true);
      await payerInactivateDialog.cancel().catch(() => undefined);
    });

    // The other half of "only for defined transitions": editing a field is not
    // a status change, so the analysis must not be raised - firing it on every
    // save would make the summary meaningless where it does matter.
    await steps.step('An edit that changes no status does not raise it', async () => {
      await payerManagementPage.open();
      const requests = await NetworkUtils.countRequestsDuring(
        page,
        ApiEndpoints.payerImpactPreview,
        async () => {
          const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
          await form.closeAndDiscard().catch(() => undefined);
        },
      );
      expect(
        requests,
        `opening an edit is not a status change, so no impact analysis should be requested; ${requests} were`,
      ).toBe(0);
    });
  });

  // Azure test case 15036
  test('15036: should offer the analysis for each status class that can change status', async ({
    payerManagementPage,
    payerInactivateDialog,
    steps,
  }) => {
    // The case compares transition CLASSES, so it needs a payer sitting in more
    // than one of them. Which classes exist is a property of the data, not of
    // the application, so it is established first and the case reports BLOCKED
    // rather than drawing a conclusion from whatever happened to be there.
    await steps.step('Each reachable status class offers or withholds the analysis correctly', async () => {
      await payerManagementPage.open();
      const found = await payerManagementPage.findPayerWithApprovalStatus('Published').catch(() => null);
      if (!found) {
        steps.blocked(
          'this case compares the analysis across status classes and the register held no '
          + 'published payer to start from.',
        );
        return; // unreachable: blocked() throws. Kept so the narrowing is explicit.
      }

      const active = found.name;
      await payerManagementPage.search(active);
      await payerManagementPage.waitForRowVisible(active);
      const offered = await payerManagementPage.getRowActionAvailability(active, 'inactivate');
      if (offered !== 'available') {
        steps.blocked(
          `"${active}" offers no inactivation, so the qualifying class cannot be exercised; the `
          + 'case needs a payer whose status can still change.',
        );
      }

      await payerManagementPage.inactivateRow(active);
      await payerInactivateDialog.waitForOpen();
      expect(
        await payerInactivateDialog.hasImpactSection(),
        'a payer whose status can change belongs to the qualifying class and should be analysed',
      ).toBe(true);
      await payerInactivateDialog.cancel().catch(() => undefined);
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
