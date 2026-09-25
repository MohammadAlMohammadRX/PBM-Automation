import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
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
  // Azure test case 14966
  test('14966: should show an empty-state message when the payer has no linked policies', async ({
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

  // Azure test case 14962
  test('14962: should read the payer\'s policies from the policy records when the tab is opened', async ({
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


  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 14970
  test('14970: should withhold the Linked Policies tab from an unauthorised role', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without the Linked Policies permission', async () => {
      session = await shapedNonAdmin({ without: ['viewLinkedPolicies'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The Linked Policies tab is withheld from this role', async () => {
      const detail = await session.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      const tabs = await detail.getTabOrder();

      // AND THE DATA BEHIND IT. A withheld tab is only half the claim: what the
      // permission protects is the content, so if the tab IS offered the case
      // opens it and reports how much of that content the role was served.
      // "the tab was offered and rendered N rows" is a defect a developer can
      // act on; "a tab id was in a list" is not.
      if (tabs.includes('policies')) {
        const section = await detail.getLinkedPoliciesSection().catch(() => ({ ids: [], text: '' }));
        expect(
          section.text.trim(),
          `the Linked Policies tab was offered to a role without the permission, and it `
            + `rendered: "${section.text.replace(/\s+/g, ' ').trim().slice(0, 160)}"`,
        ).toBe('');
      }
      expect(
        tabs,
        `a role without the permission should not be offered the tab; offered: ${tabs.join(', ')}`,
      ).not.toContain('policies');
    });
  });
  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-001 = 14954,  TC-002 = 14967,  TC-005 = 14959
    //   TC-006 = 14955,  TC-007 = 14958,  TC-008 = 14978
    //   TC-009 = 14963,  TC-013 = 14974
    test(`${azureOrCase('54', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
