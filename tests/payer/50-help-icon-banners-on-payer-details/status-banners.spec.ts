import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { REJECTION_DIALOG_REASONS } from '../../../data/payers/rejectionReason.data';
import {
  BANNER_BY_STATE,
  BANNER_KEYWORDS,
} from '../../../data/payers/statusBanners.data';

/**
 * User story: Help Icon (What-To-Do-Next) Banners on Payer Details (View) Mode.
 *
 * A draft, a pending and a rejected payer each show a status banner telling the
 * user what to do next; an approved/active payer shows none. The banner is read
 * by its id and its content matched on intent keywords - see statusBanners.data.
 *
 * THE REJECTED BANNER'S REASON is the case to watch: the reason is known to be
 * recorded where the maker cannot see it, so a rejected banner that omits the
 * reviewer's reason is that same finding appearing here.
 */
test.describe('Status banners on payer details', () => {
  // Azure test case 15765
  test('15765: should show a draft banner with next-step guidance for a Draft payer', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open a Draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.openDetails(draftPayer.nameEn);
    });

    await steps.step('A banner is shown, and it is the draft banner', async () => {
      const detail = payerManagementPage.detail();
      expect(await detail.hasStatusBanner(), 'a Draft payer should show a status banner').toBe(true);
      expect(
        await detail.getStatusBannerId(),
        'the banner shown should be the draft one',
      ).toBe(BANNER_BY_STATE.draft);
    });

    await steps.step('And it tells the user to send the draft for approval', async () => {
      const text = await payerManagementPage.detail().getStatusBannerText();
      for (const keyword of BANNER_KEYWORDS.draft) {
        expect(text, `the draft banner should guide the next step; it read "${text}"`).toMatch(
          keyword,
        );
      }
    });
  });

  // Azure test case 15766
  test('15766: should show an awaiting-approval banner for a Pending payer', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a payer for approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
    });

    await steps.step('Its detail shows the pending banner', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      expect(await detail.hasStatusBanner(), 'a pending payer should show a banner').toBe(true);
      expect(await detail.getStatusBannerId()).toBe(BANNER_BY_STATE.pending);
    });

    await steps.step('And it says the record is awaiting review', async () => {
      const text = await payerManagementPage.detail().getStatusBannerText();
      for (const keyword of BANNER_KEYWORDS.pending) {
        expect(text, `the pending banner should explain the wait; it read "${text}"`).toMatch(
          keyword,
        );
      }
    });
  });

  // Azure test case 15767
  test('15767: should show a rejected banner, and carry the reviewer reason within it', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    const reason = REJECTION_DIALOG_REASONS[0];

    await steps.critical('Navigate to the module and reject a submitted payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      await approvalManagementPage.reject(draftPayer.nameEn, reason);
    });

    await steps.step('Its detail shows the rejected banner', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      expect(await detail.hasStatusBanner(), 'a rejected payer should show a banner').toBe(true);
      expect(await detail.getStatusBannerId()).toBe(BANNER_BY_STATE.rejected);
    });

    await steps.step('And the banner guides an edit-and-resubmit', async () => {
      const text = await payerManagementPage.detail().getStatusBannerText();
      for (const keyword of BANNER_KEYWORDS.rejected) {
        expect(text, `the rejected banner should guide the next step; it read "${text}"`).toMatch(
          keyword,
        );
      }
    });

    await steps.step('And it carries the reviewer\'s reason', async () => {
      // The finding to watch: the reason is recorded where the maker cannot see
      // it elsewhere, so a banner without it repeats that gap - a rejected user
      // told to "edit and resubmit" but not told WHY.
      const text = await payerManagementPage.detail().getStatusBannerText();
      expect(
        text.includes(reason),
        `the rejected banner should name the reason "${reason}"; it read "${text}"`,
      ).toBe(true);
    });
  });

  // Azure test case 15768
  test('15768: should show no status banner for an approved, active payer', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open an active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.openDetails(publishedPayer.nameEn);
    });

    await steps.step('No draft, pending or rejected banner is present', async () => {
      // Banners are for the states that need an action; an approved live payer
      // needs none, so showing one would be noise on every settled record.
      const detail = payerManagementPage.detail();
      expect(
        await detail.hasStatusBanner(),
        `an approved active payer should show no status banner; it showed `
          + `"${await detail.getStatusBannerId()}"`,
      ).toBe(false);
    });
  });

  // Azure test case 15769
  test('15769: should map each lifecycle state to the right banner behaviour', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    const observed: { state: string; bannerId: string }[] = [];

    await steps.critical('Navigate to the Payer Management module', () => payerManagementPage.open());

    await steps.step('A Draft payer shows the draft banner', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      observed.push({ state: 'draft', bannerId: await detail.getStatusBannerId() });
    });

    await steps.step('The same payer, once pending, shows the pending banner', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      observed.push({ state: 'pending', bannerId: await detail.getStatusBannerId() });
    });

    await steps.step('An approved active payer shows none', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      observed.push({ state: 'approved', bannerId: await detail.getStatusBannerId() });
    });

    await steps.step('Each state mapped to its defined banner', async () => {
      const summary = observed.map((o) => `${o.state}=${o.bannerId || '(none)'}`).join('; ');
      expect(observed.find((o) => o.state === 'draft')?.bannerId, summary).toBe(BANNER_BY_STATE.draft);
      expect(observed.find((o) => o.state === 'pending')?.bannerId, summary).toBe(
        BANNER_BY_STATE.pending,
      );
      expect(
        observed.find((o) => o.state === 'approved')?.bannerId,
        `an approved payer should carry no banner; ${summary}`,
      ).toBe('');
    });
  });

  // Azure test case 15770
  test('15770: should update the banner as the payer transitions between states', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    test.slow();

    let draftBanner = '';

    await steps.critical('Navigate to the module and open a Draft payer', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      draftBanner = await detail.getStatusBannerId();
      expect(draftBanner, 'the draft banner should be showing to start').toBe(BANNER_BY_STATE.draft);
    });

    await steps.step('Submitting it changes the banner to the pending one', async () => {
      // The banner must follow the state, not cache the last one shown - a stale
      // banner would tell a submitted payer it is still an editable draft.
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      const now = await detail.getStatusBannerId();
      expect(
        now,
        `the banner should have moved from draft to pending; it is "${now}"`,
      ).toBe(BANNER_BY_STATE.pending);
    });
  });

  // Azure test case 15774
  test('15774: should keep the banner behaviour after a reload', async ({
    page,
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open a Draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.openDetails(draftPayer.nameEn);
    });

    await steps.step('The draft banner is still there after a reload', async () => {
      // Persistence and refresh-tolerance in one: a banner held only in client
      // state would vanish on a fresh load.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await payerManagementPage.waitForPageReady();
      const detail = payerManagementPage.detail();
      expect(await detail.hasStatusBanner(), 'the banner should survive a reload').toBe(true);
      expect(await detail.getStatusBannerId()).toBe(BANNER_BY_STATE.draft);
    });
  });
});

/** Access control - the banner-bearing detail page behind View permission. */
test.describe('Status banners - View permission', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15775
  test('15775: should keep the banner-bearing detail page behind View permission', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // The restricted account is BUILT, not waited for: the administrator takes
    // View Payer Details off the shared "Payer Admin" role, this case signs in
    // as that account, and the permission goes back when the case ends.
    await shapeRole({ without: ['viewPayerDetails'] });

    await steps.critical('Sign in as a user without View Payer Details', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    // The banner lives on the detail page, so the detail page is what has to be
    // unreachable - whether the row withholds the route or the page itself
    // refuses. Both are a refusal; neither may be a rendered banner.
    await steps.step('The detail page, and therefore its banner, is not reachable', async () => {
      const payerName = NON_ADMIN_PROFILE.scopedPayers[0];
      const availability = await payerManagementPage.getRowActionAvailability(payerName, 'view');
      if (availability !== 'available') return;

      // NOT "no banner": the banner-bearing states (draft, pending, rejected) are
      // outside this account's scope, so an absent banner would be the record's
      // state talking, not the permission. The tabbed record itself is what has to
      // be unreachable, and that holds whatever state the payer is in.
      const detail = await payerManagementPage.openDetails(payerName);
      expect(
        (await detail.getTabOrder()).length,
        'a role without View Payer Details should not be shown the record that carries the banner',
      ).toBe(0);
    });
  });
});
