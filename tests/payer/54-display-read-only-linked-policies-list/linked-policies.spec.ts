import { test, expect } from '../../../fixtures';
import { Timeouts } from '../../../constants/Timeouts';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import type { PayerDetailPage } from '../../../pages/payer/PayerDetailPage';
import {
  BLOCKED_CASES,
  EMPTY_STATE_PATTERN,
  FORBIDDEN_CONTROL_PATTERN,
  POLICY_REQUEST_PATTERN,
} from '../../../data/payers/linkedPolicies.data';

/**
 * User story: Display Read-Only Linked Policies List.
 *
 * Three cases reach a payer that owns no policies - which is every payer this
 * suite can create. VERIFIED: for such a payer the tab renders a search bar and
 * nothing else, and issues no request. So the empty-state and data-source cases
 * are expected to FAIL against that, and the read-only case passes. Every case
 * that needs a payer WITH policies is BLOCKED on one - see BLOCKED_CASES.
 */
test.describe('Linked Policies tab', () => {
  test('TC-003: should show an empty-state message when the payer has no linked policies', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let section!: { ids: string[]; text: string };

    await steps.critical('Navigate to the module and open a payer with no policies', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      section = await detail.getLinkedPoliciesSection();
      expect(section.ids.length, 'the Linked Policies section should have mounted').toBeGreaterThan(0);
    });

    await steps.step('The section tells the user there are no policies', async () => {
      // A blank panel leaves the reader unable to tell "no policies" from
      // "not loaded" - which is the defect the sheet's empty state guards.
      expect(
        EMPTY_STATE_PATTERN.test(section.text),
        `a payer with no policies should see an empty-state message; the section read `
          + `"${section.text || '(nothing beyond the search bar)'}" and carried: ${section.ids.join(', ')}`,
      ).toBe(true);
    });
  });

  test('TC-010: should read the payer\'s policies from the policy records when the tab is opened', async ({
    page,
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let detail!: PayerDetailPage;

    await steps.critical('Navigate to the module and open a payer', async () => {
      await payerManagementPage.open();
      detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('Opening the tab asks the server for the payer\'s policies', async () => {
      // "Reads directly from true payer-owned policy data" has an observable
      // half even with no policies: the tab must ASK for them. A tab that
      // renders without a request cannot be reading anything.
      const url = await NetworkUtils.captureRequestUrl(
        page,
        POLICY_REQUEST_PATTERN,
        () => detail.openLinkedPolicies(),
        Timeouts.short,
      );
      expect(
        url,
        'the Linked Policies tab should fetch the payer\'s policies from the policy records; '
          + 'no request naming policies was made when the tab opened',
      ).not.toBeNull();
    });
  });

  test('TC-015: should offer no add, edit or delete control when the Linked Policies tab is viewed', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let section!: { ids: string[]; text: string };

    await steps.critical('Navigate to the module and open the Linked Policies tab', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      section = await detail.getLinkedPoliciesSection();
      expect(section.ids.length, 'the Linked Policies section should have mounted').toBeGreaterThan(0);
    });

    await steps.step('The section is strictly read-only', async () => {
      const offending = section.ids.filter((id) => FORBIDDEN_CONTROL_PATTERN.test(id));
      expect(
        offending,
        `the Linked Policies tab must not offer any add/edit/delete control; it carries: ${offending.join(', ')}`,
      ).toEqual([]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
