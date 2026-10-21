import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { Timeouts } from '../../../constants/Timeouts';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import type { PayerDetailPage } from '../../../pages/payer/PayerDetailPage';
import { findPayer, findPayers } from '../../../utils/PayerFinder';
import { REFERENCE_PAYERS } from '../../../data/payers/referencePayers.data';
import {
  BLOCKED_CASES,
  EMPTY_STATE_PATTERN,
  FORBIDDEN_CONTROL_PATTERN,
  POLICY_REQUEST_PATTERN,
} from '../../../data/payers/linkedPolicies.data';

/**
 * User story: Display Read-Only Linked Policies List.
 *
 * Since 2026-10-11 14975 and 14962 run on a payer that OWNS policies (payer
 * number 2). The empty-state case still uses a fresh suite payer, which owns
 * none. The rest stay BLOCKED, each naming what it is still missing - see
 * BLOCKED_CASES.
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
    steps,
  }) => {
    let subject = '';

    await steps.critical('Navigate to the module and find a payer that owns policies', async () => {
      // A PAYER WITH POLICIES since 2026-10-11 (QA-lead note). On a fresh
      // suite payer there is nothing to read, so a missing request proved
      // little; payer number 2 owns two policies, so the tab has data to fetch.
      const found = await findPayer(
        page,
        (p) => Number(p.linkedPoliciesCount) > 0,
        'a payer that owns at least one policy',
        [REFERENCE_PAYERS.payerNumber2.name],
      );
      if (!found) steps.blocked('no payer in the register owns a policy');
      subject = found!.payerNameEn;
      await payerManagementPage.open();
      await payerManagementPage.search(subject);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('Opening the payer and its tab asks the server for the payer\'s policies', async () => {
      // "Reads directly from true payer-owned policy data": the screen must ASK
      // the policy records for this payer's policies. LISTENED FROM THE PAYER'S
      // OPENING (2026-10-11): VERIFIED the page asks GetPayerLinkedPolicies
      // {payerId} as the detail loads - it feeds the tab's "(2)" count - and the
      // tab adds no request of its own; listening only from the tab click
      // reported "no request" for a page that had made it.
      let detail!: PayerDetailPage;
      const url = await NetworkUtils.captureRequestUrl(
        page,
        POLICY_REQUEST_PATTERN,
        async () => {
          detail = await payerManagementPage.openDetails(subject);
          await detail.openLinkedPolicies();
        },
        Timeouts.default,
      );
      expect(
        url,
        `opening "${subject}" and its Linked Policies tab should fetch the payer's policies from the `
          + 'policy records (GetPayerLinkedPolicies); no such request was made',
      ).not.toBeNull();
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
  // Azure test case 14973
  test('14973: should refuse a direct call for a payer\'s policies from a role without the right', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without the linked-policies permission', async () => {
      session = await shapedNonAdmin({ without: ['viewLinkedPolicies'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    // The TAB being hidden is a separate case. This one goes round it: the
    // policies are payer-scoped data, so the endpoint itself has to refuse a
    // session that may not read them - otherwise hiding the tab protects
    // nothing that a URL cannot reach.
    await steps.step('The endpoint refuses the request rather than returning the policies', async () => {
      const payerId = await session.payers.getPayerId(NON_ADMIN_PROFILE.scopedPayers[0]);
      const response = await NetworkUtils.postAsSession(
        session.page,
        ApiEndpoints.payerLinkedPolicies,
        { payerId },
      );
      expect(
        response.status,
        'a role without the linked-policies right must be refused by the endpoint, not only by '
          + `the tab; the server answered ${response.status}`,
      ).toBe(403);
    });
  });

  // Azure test case 14975
  test('14975: should show every required column populated on every linked policy row', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    let rows: Array<Record<string, string>> = [];
    let subject = '';

    await steps.critical('Navigate to the module and open a payer that owns policies', async () => {
      // Runs since 2026-10-11: payers now own policies (payer number 2 has two),
      // so the rows' content can be read instead of reported BLOCKED.
      const found = await findPayer(
        page,
        (p) => Number(p.linkedPoliciesCount) > 0,
        'a payer that owns at least one policy',
        [REFERENCE_PAYERS.payerNumber2.name],
      );
      if (!found) steps.blocked('no payer in the register owns a policy');
      subject = found!.payerNameEn;
      await payerManagementPage.open();
      await payerManagementPage.search(subject);
      const detail = await payerManagementPage.openDetails(subject);
      rows = await detail.getLinkedPolicyRows();
      expect(rows.length, `"${subject}" should list at least one linked policy`).toBeGreaterThan(0);
    });

    await steps.step('Every column of every policy row carries a value', async () => {
      // The case checks that no cell is blank. WHICH columns are required is
      // the open question on 14954, so every rendered column is held to it.
      const blanks = rows.flatMap((row, i) =>
        Object.entries(row)
          .filter(([, value]) => value === '' || /^[-–—]$|^N\/A$/i.test(value))
          .map(([column, value]) => `row ${i + 1} "${column}" = "${value}"`));
      expect(
        blanks,
        `every linked-policy cell on "${subject}" should be populated; columns read: `
          + `${Object.keys(rows[0] ?? {}).join(', ')}`,
      ).toEqual([]);
    });
  });

  // Azure test case 14958
  //
  // PRECONDITION UPDATED 2026-10-18 (QA lead): the sheet wants a payer holding
  // exactly (page size - 1) = 19 policies, which no payer has (the most is 6).
  // Any payer with at least one policy is under the page size, so the claim -
  // everything on one page, no pagination controls - is tested on the payer
  // holding the most, found through GetPayers across all pages.
  test('14958: should not paginate when the payer holds fewer policies than one page', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    let detail!: PayerDetailPage;
    let subject = '';
    let held = 0;
    let rows: Array<Record<string, string>> = [];

    await steps.critical('Navigate to the module and open a payer with at least one policy', async () => {
      const holders = await findPayers(page, (p) => Number(p.linkedPoliciesCount) > 0, 'a payer that owns at least one policy');
      if (holders.length === 0) steps.blocked('no payer in the register owns a policy');
      const most = [...holders].sort((a, b) => Number(b.linkedPoliciesCount) - Number(a.linkedPoliciesCount))[0];
      subject = most.payerNameEn;
      held = Number(most.linkedPoliciesCount);
      await payerManagementPage.open();
      await payerManagementPage.search(subject);
      detail = await payerManagementPage.openDetails(subject);
    });

    await steps.step('Opening the Linked Policies tab shows every policy on a single page', async () => {
      rows = await detail.getLinkedPolicyRows();
      expect(rows.length, `"${subject}" holds ${held} polic${held === 1 ? 'y' : 'ies'}; all should be on the first page`).toBe(held);
    });

    await steps.step('No pagination controls are rendered', async () => {
      const paginator = await detail.getLinkedPoliciesPaginator();
      expect(
        paginator.visible,
        `"${subject}" lists ${rows.length} polic${rows.length === 1 ? 'y' : 'ies'} - fewer than one page - yet the tab `
          + `renders pagination controls reading "${paginator.text}"`,
      ).toBe(false);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-006 = 14955
    //   TC-009 = 14963
    test(`${azureOrCase('54', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
