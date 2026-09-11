import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { PayerFormDialog } from '../pages/payer/PayerFormDialog';
import { Logger } from '../utils/Logger';

/**
 * A SECOND, independent view of the payer list, for the concurrent-edit cases.
 *
 * WHY A SECOND TAB AND NOT A SECOND LOGIN. The story is written as User A and
 * User B, and the obvious implementation is two browser contexts. That does not
 * work here, and it is worth recording why so nobody spends the afternoon on it
 * again: a second context built from the saved session lands on the login page,
 * because the application's refresh token ROTATES - the first session consumes
 * it, and the second is left holding a token the server has already retired.
 * The environment exposes one set of credentials, so logging the second session
 * in separately would rotate the token out from under the first.
 *
 * A second tab of the SAME context reproduces the condition under test exactly.
 * The conflict is raised server-side by comparing the submitted record's version
 * to the stored one; it neither knows nor cares which tab sent the request. Two
 * tabs holding the same record therefore produce a genuine stale copy, which is
 * the whole mechanism.
 *
 * What this CANNOT cover is two different ROLES - a single account has one role
 * - so that case reports BLOCKED and names the account it needs, rather than
 * being quietly approximated by two tabs and reported as a pass.
 *
 * The tab is closed on teardown. Leaving it open would leak a page per test and,
 * worse, leave a drawer holding an unsaved edit on a shared environment.
 */

export interface StaleSession {
  /** The second tab itself, for reading messages and asserting drawer state. */
  page: Page;
  /** The payer list in the second tab. */
  payerPage: PayerManagementPage;
  /**
   * The approvals queue in the second tab.
   *
   * Added for the PayerCode uniqueness story, whose concurrency case needs two
   * approvals dispatched without either waiting for the other - one session
   * cannot do that to itself, because its own approve() awaits the decision
   * before returning.
   */
  approvalPage: ApprovalManagementPage;
  /**
   * Opens a payer for edit in the second tab, giving a copy of the record as it
   * stands NOW. Whatever the first session saves afterwards makes this copy
   * stale, which is the precondition every case in this story needs.
   */
  openEditForm(payerName: string): Promise<PayerFormDialog>;
}

export interface ConcurrentEditFixtures {
  staleSession: StaleSession;
}

export const test = base.extend<ConcurrentEditFixtures>({
  staleSession: async ({ context }, use) => {
    const page = await context.newPage();
    const payerPage = new PayerManagementPage(page);

    const session: StaleSession = {
      page,
      payerPage,
      approvalPage: new ApprovalManagementPage(page),
      async openEditForm(payerName: string): Promise<PayerFormDialog> {
        Logger.step(`[fixture] Second session opening "${payerName}" for edit`);

        // ANY OPEN DRAWER IS DISCARDED FIRST, and this is the important part.
        // When this tab is re-opened it is usually still holding the rejected
        // edit, and that form is DIRTY - the application's unsaved-changes guard
        // then blocks the navigation, which surfaces as `net::ERR_ABORTED` and
        // looks for all the world like the server dropping the connection. It
        // took a while to see that it was the app protecting unsaved work.
        // Discarding is also what a real user would have to do.
        const openDrawer = new PayerFormDialog(page);
        if (await openDrawer.isOpen()) {
          Logger.step('[fixture] Discarding the stale session\'s unsaved form first');
          await openDrawer.closeAndDiscard();
        }

        // Settled BEFORE navigating. This tab has usually just submitted a save
        // that was rejected, and navigating while that request is still in
        // flight aborts the navigation itself - the same error from a different
        // cause, which is why both are handled.
        await payerPage.waitForPageReady();

        // Retried ONCE, and only on that abort. Waiting for the page to settle
        // narrows the window but does not close it: Chromium can still abort a
        // goto that overlaps the tail of a fetch this tab started. The retry is
        // deliberately narrow - any other navigation failure propagates, so a
        // genuinely unreachable application still fails loudly instead of being
        // swallowed by a catch-all.
        try {
          await payerPage.open();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('ERR_ABORTED')) throw error;
          Logger.warn('[fixture] Second session navigation aborted mid-flight - retrying once');
          await payerPage.waitForPageReady();
          await payerPage.open();
        }

        return payerPage.openEditForm(payerName);
      },
    };

    await use(session);

    // Close without saving. A drawer left open on a shared environment holds a
    // lock on nothing but does hold an unsaved edit, and the next test's list
    // read would see this tab's view preference rather than its own.
    await page.close();
  },
});
