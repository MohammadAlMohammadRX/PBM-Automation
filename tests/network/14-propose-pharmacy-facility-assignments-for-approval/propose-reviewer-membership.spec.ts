import { test, expect } from '../../../fixtures';
import { BUDGET } from '../../../data/networks/facilities.data';
import { ADDITION_MARK, CASES, MEMBERSHIP } from '../../../data/networks/reviewerProposedMembership.data';

/**
 * User story 14131: Propose pharmacy facility assignments for approval.
 * Case 17912 - the reviewer sees the proposed membership, additions apart from
 * the current members (see reviewerProposedMembership.data.ts).
 */
test.describe('US 14131 - Reviewing a proposed membership', () => {
  test(`TC-${CASES.reviewerSeesMembership.azureId}: should show the reviewer the proposed facilities as additions beside the current membership when the change is reviewed`, async ({
    networkDetailPage,
    networkManagementPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Pending', { facilityCodes: [MEMBERSHIP.existing.code] });
    let review = '';

    await steps.critical('Navigate to the Network Management module - the list shows the network', async () => {
      expect(await networkManagementPage.isListed(network.name), `"${network.name}" should be listed`).toBe(true);
    });

    await steps.critical("The coordinator's proposal of two facilities is listed in the reviewer's pending approvals queue", async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().assign(MEMBERSHIP.proposed.map((f) => f.code)))?.status).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network.name);
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network.name);
    });

    await steps.step('The approval screen shows the proposed facilities, marked as additions', async () => {
      review = await networkApprovalsPage.readReviewText(network.name);
      for (const facility of MEMBERSHIP.proposed) {
        expect(review, `${facility.code} should be shown to the reviewer`).toContain(facility.name);
      }
      expect(review, 'the proposed facilities should be marked as additions').toMatch(ADDITION_MARK);
    });

    await steps.step('The current membership is shown for comparison, apart from the proposed additions', async () => {
      expect(review, 'the current member should be visible').toContain(MEMBERSHIP.existing.name);
    });
  });
});
