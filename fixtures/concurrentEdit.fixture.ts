import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LoginPage } from '../pages/auth/LoginPage';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { PayerFormDialog } from '../pages/payer/PayerFormDialog';
import { PayerInactivateDialog } from '../pages/payer/PayerInactivateDialog';
import { DEFAULT_VIEWPORT } from '../constants/BrowserConfig';
import { env } from '../constants/EnvironmentConfig';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';

/**
 * A SECOND WINDOW, signed in separately, for the concurrent-edit cases.
 *
 * TWO SESSIONS, NOT TWO TABS - and this was corrected on 19 September 2026.
 * This fixture used to open a second TAB of the same browser context, on the
 * stated grounds that a second login could not work: the application's refresh
 * token was believed to ROTATE, so the second sign-in would retire the first
 * one's token and strand it on /login.
 *
 * MEASURED, and it is not so. Two contexts, each signing in from scratch with
 * the same account, both hold a working session at the same time: after the
 * second signed in, the first still listed payers and still searched. What the
 * old note most likely hit was building the second context FROM THE SAVED
 * SESSION - reusing a stored token - rather than logging it in fresh.
 *
 * WHY IT MATTERS RATHER THAN BEING TIDIER. Two tabs share one context, one
 * cookie jar and one token, so the "other user" was only ever a second view of
 * the same session. The story is written as User A and User B holding the
 * record at once, and the conflict it describes is a session-level one. Two
 * genuine windows reproduce that; two tabs approximated it.
 *
 * WHAT THIS STILL CANNOT COVER is two different ROLES, because the environment
 * exposes one administrator credential. A case needing a second ROLE reports
 * BLOCKED and names the account it wants, rather than being approximated here.
 *
 * The window is closed on teardown - an open drawer on a shared environment
 * holds an unsaved edit, and a leaked context leaks a browser window with it.
 */

export interface StaleSession {
  /** The second window's page, for reading messages and asserting drawer state. */
  page: Page;
  /** The payer list in the second window. */
  payerPage: PayerManagementPage;
  /**
   * The approvals queue in the second window.
   *
   * Added for the PayerCode uniqueness story, whose concurrency case needs two
   * approvals dispatched without either waiting for the other - one session
   * cannot do that to itself, because its own approve() awaits the decision
   * before returning.
   */
  approvalPage: ApprovalManagementPage;
  /**
   * The Inactivate drawer in the second window.
   *
   * Added for the impact-analysis story, whose concurrency case has two
   * administrators inactivate the same payer at once: the second session must
   * be able to drive its own drawer, not the first window's.
   */
  inactivateDialog: PayerInactivateDialog;
  /**
   * Opens a payer for edit in the second window, giving a copy of the record as
   * it stands NOW. Whatever the first session saves afterwards makes this copy
   * stale, which is the precondition every case in this story needs.
   */
  openEditForm(payerName: string): Promise<PayerFormDialog>;
}

export interface ConcurrentEditFixtures {
  staleSession: StaleSession;
}

export const test = base.extend<ConcurrentEditFixtures>({
  staleSession: async ({ browser }, use, testInfo) => {
    // Explicitly EMPTY storage rather than the saved session: this window signs
    // in for itself, which is what makes it a second session rather than a
    // second view of the first one.
    // The suite's own window size, not the browser default: some screens render
    // a different layout at 1280x720 (Role Administration swaps cards for a
    // table), and a context that quietly differs finds nothing.
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: DEFAULT_VIEWPORT,
    });
    const page = await context.newPage();
    const payerPage = new PayerManagementPage(page);

    try {
      Logger.step('[fixture] Signing the second window in as the same administrator');
      const login = new LoginPage(page);
      await login.open();
      await login.loginAndWaitForDashboard(env.adminUsername, env.adminPassword);
    } catch (error) {
      await context.close();
      blockedByPrecondition(testInfo, 'a second signed-in session', error);
    }

    const session: StaleSession = {
      page,
      payerPage,
      approvalPage: new ApprovalManagementPage(page),
      inactivateDialog: new PayerInactivateDialog(page),
      async openEditForm(payerName: string): Promise<PayerFormDialog> {
        Logger.step(`[fixture] Second session opening "${payerName}" for edit`);

        // ANY OPEN DRAWER IS DISCARDED FIRST, and this is the important part.
        // When this window is re-used it is usually still holding the rejected
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

        // Settled BEFORE navigating. This window has usually just submitted a
        // save that was rejected, and navigating while that request is still in
        // flight aborts the navigation itself - the same error from a different
        // cause, which is why both are handled.
        await payerPage.waitForPageReady();

        // Retried ONCE, and only on that abort. Waiting for the page to settle
        // narrows the window but does not close it: Chromium can still abort a
        // goto that overlaps the tail of a fetch this window started. The retry
        // is deliberately narrow - any other navigation failure propagates, so a
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

    // The whole window goes, not just the page: this context owns its own
    // session, and leaving it open would leak a signed-in browser per test.
    await context.close();
  },
});
