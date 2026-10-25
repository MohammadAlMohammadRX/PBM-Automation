import type { Dialog, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { env } from '../constants/EnvironmentConfig';
import { Timeouts } from '../constants/Timeouts';
import { Logger } from '../utils/Logger';
import { WaitUtils } from '../utils/WaitUtils';
import { GLOBAL, LOGIN, PAYER_SCOPE_DIALOG, TOAST, buttonSelector } from '../constants/ElementIds';
import { AppRoutes } from '../constants/AppRoutes';
import { AUTH_STORAGE_STATE_PATH } from '../constants/Paths';
import * as fs from 'fs';
import { PayerScopeDialog } from './components/PayerScopeDialog';

/**
 * Base class for every Page Object in the framework.
 * Holds only genuinely shared behaviour: navigation, readiness waits,
 * unexpected-dialog handling, and toast/notification helpers. Page-specific
 * locators and actions belong in the concrete Page Object, never here.
 */
export abstract class BasePage {
  protected readonly page: Page;

  protected constructor(page: Page) {
    this.page = page;
    this.attachUnexpectedDialogHandler();
  }

  /**
   * Auto-handles native browser dialogs (alert/confirm/prompt) that the
   * application might unexpectedly trigger, so a stray dialog never hangs a
   * test run. PBM's own confirmation modals are custom components (not
   * native dialogs) and are handled explicitly in the relevant Page Object.
   */
  private attachUnexpectedDialogHandler(): void {
    this.page.on('dialog', async (dialog: Dialog) => {
      // A beforeunload prompt is ACCEPTED; everything else is dismissed.
      //
      // Dismissing beforeunload means "stay on this page", which CANCELS the
      // navigation that triggered it - and Playwright then rejects that
      // navigation with `net::ERR_ABORTED`. That is how a case ended up failing
      // on a page.goto after the drawer it had been working in was left dirty
      // by a refused save: the test asked to leave, the handler said stay, and
      // the error named the navigation rather than the drawer behind it.
      //
      // A test that navigates has decided to leave, so accepting is what it
      // meant. Dismissal stays the default for every other dialog type, where
      // the safe answer is "no".
      if (dialog.type() === 'beforeunload') {
        Logger.warn('Leaving a page with unsaved changes - accepting the browser prompt');
        await dialog.accept().catch(() => undefined);
        return;
      }
      Logger.warn(`Unexpected native dialog appeared: [${dialog.type()}] ${dialog.message()}`);
      await dialog.dismiss().catch(() => undefined);
    });
  }

  /** Navigates to a path relative to BASE_URL and waits for the page to settle. */
  async goto(relativePath: string): Promise<void> {
    const url = new URL(relativePath, env.baseUrl).toString();
    Logger.navigation(url);
    await this.page.goto(url, { timeout: Timeouts.navigation, waitUntil: 'domcontentloaded' });
    await this.recoverIfSignedOut(relativePath, url);
    await this.waitForPageReady();
    await this.answerPayerScopeGate();
  }

  /**
   * Answers the "Select a Payer" gate if this screen raised one.
   *
   * HERE, NOT IN EACH MODULE, since 2026-10-04. The gate covers "payer,
   * network, plan, policy, formulary and member screens", but only
   * PayerManagementPage ever answered it - so every story working in a
   * CONSUMING module met a modal nobody dismissed, and the page underneath
   * never rendered. That cost 37 failures in one run (folders 09, 21, 32, 39,
   * 40), each reading as a missing control rather than an unanswered dialog.
   *
   * The build of 2026-10-04 lifted the gate on the PAYER module only - "All
   * Payers" is its default scope now - which is why this looks like a new
   * problem and is in fact the same gate, newly visible everywhere else.
   *
   * Costs one DOM query per navigation for an account that never sees it, and
   * never throws: a gate that cannot be answered is the caller's problem to
   * report against its own assertion, not a navigation failure.
   */
  protected async answerPayerScopeGate(): Promise<void> {
    await new PayerScopeDialog(this.page).chooseIfShowingNow().catch(() => null);
  }

  /**
   * Re-authenticates and retries the navigation if the app bounced us to the
   * login screen.
   *
   * The saved session is created once by the "setup" project, and a long serial
   * run outlives it. Without this, the moment it expires EVERY remaining test
   * fails - not quickly, but after burning its full budget looking for a table
   * that is not there, and then again on each retry. One expiry turned into
   * dozens of failures and hours of wall time.
   *
   * The sign-in is inlined rather than delegated to LoginPage, because
   * LoginPage extends this class and importing it here would be circular. The
   * refreshed session is written back to the shared storage-state file so the
   * tests that follow start authenticated instead of each rediscovering this.
   */
  private async recoverIfSignedOut(relativePath: string, targetUrl: string): Promise<void> {
    // Navigating to the login screen on purpose is not a signed-out state.
    if (relativePath.includes(AppRoutes.login)) return;
    // The bounce to /login is CLIENT-SIDE and lands after domcontentloaded, so
    // the URL read at that instant still names the target route. VERIFIED: an
    // expired session an hour into a run passed the URL check here, then every
    // navigation burnt its full budget waiting for a list on the login screen.
    // Wait for whichever renders first - the authenticated header or the login
    // form - and only then decide.
    //
    // THE PAYER GATE COUNTS AS SIGNED IN (2026-10-24). While "Select a Payer" is
    // up the app does not render its header at all, so on every gated screen
    // (networks, plans, policies...) this race used to wait out the whole
    // navigation timeout - 45 s per page - before the gate was answered. In the
    // 2026-10-24 network run that made each list load take ~50 s, longer than
    // the 30 s the list-request captures allow, and failed every case that
    // reads the list's own request. The gate only ever shows to a signed-in
    // session, so seeing it settles the question.
    const landed = await Promise.race([
      this.byId(GLOBAL.headerTitle).waitFor({ state: 'attached', timeout: Timeouts.navigation }).then(() => 'app'),
      this.byId(PAYER_SCOPE_DIALOG.select).waitFor({ state: 'visible', timeout: Timeouts.navigation }).then(() => 'app'),
      this.byId(LOGIN.email).waitFor({ state: 'visible', timeout: Timeouts.navigation }).then(() => 'login'),
    ]).catch(() => 'unknown');
    if (landed !== 'login' && !/\/login\b/.test(this.page.url())) return;

    Logger.warn('Session expired - signing in again and retrying the navigation');
    await this.page.locator(`#${LOGIN.email}`).fill(env.adminUsername);
    await this.page.locator(`#${LOGIN.password}`).fill(env.adminPassword);

    // Same reasoning as LoginPage.login(): re-click only if the first click never
    // reached the server, so a slow sign-in is never double-submitted.
    const loginRequested = this.page
      .waitForRequest((request) => request.url().includes('/Account/Login'), {
        timeout: Timeouts.default,
      })
      .then(() => true)
      .catch(() => false);
    await this.btn(LOGIN.submit).click();
    if (!(await loginRequested)) {
      await this.btn(LOGIN.submit).click();
    }

    await this.page.waitForURL(/dashboard/, { timeout: Timeouts.navigation });
    await this.saveRefreshedSession();
    Logger.info('Session refreshed - resuming');

    await this.page.goto(targetUrl, {
      timeout: Timeouts.navigation,
      waitUntil: 'domcontentloaded',
    });
  }

  /**
   * Publishes the refreshed session so later tests start authenticated instead
   * of each rediscovering the expiry.
   *
   * Written to a worker-private temp file and then renamed into place, because
   * with more than one worker two of them can recover at the same moment and a
   * direct write would leave the shared file half-written - which would break
   * EVERY test that loads it, a far worse failure than the expiry itself.
   * `fs.renameSync` replaces the destination atomically on both Windows and
   * POSIX, so a reader sees either the old file or the new one, never a torn
   * one.
   */
  private async saveRefreshedSession(): Promise<void> {
    const temporaryPath = `${AUTH_STORAGE_STATE_PATH}.${process.pid}.tmp`;
    try {
      await this.page.context().storageState({ path: temporaryPath });
      fs.renameSync(temporaryPath, AUTH_STORAGE_STATE_PATH);
    } catch {
      // A failed refresh is not fatal - this test already has a live session in
      // its own context; only the head start for later tests is lost.
      try {
        fs.unlinkSync(temporaryPath);
      } catch {
        /* nothing to clean up */
      }
    }
  }

  /** Waits for the DOM to be ready and any loading indicator to disappear. */
  async waitForPageReady(): Promise<void> {
    await WaitUtils.waitForDomReady(this.page);
    await WaitUtils.waitForLoadingToFinish(this.page);
  }

  /** Reloads the current page and waits for it to settle. */
  async reload(): Promise<void> {
    await this.page.reload({ timeout: Timeouts.navigation, waitUntil: 'domcontentloaded' });
    await this.waitForPageReady();
  }

  /**
   * Browser Back, then a wait for the destination to settle.
   *
   * Exists for the robustness cases, which ask what the application does when
   * the user leaves a screen by the browser's own controls rather than by its
   * navigation - a route this suite otherwise never takes. Resolves even when
   * there is nowhere to go back to, so a case can say what it found instead of
   * failing on the navigation itself.
   */
  async goBack(): Promise<void> {
    await this.page
      .goBack({ timeout: Timeouts.navigation, waitUntil: 'domcontentloaded' })
      .catch(() => null);
    await this.waitForPageReady();
  }

  /** Browser Forward, the counterpart of `goBack`. */
  async goForward(): Promise<void> {
    await this.page
      .goForward({ timeout: Timeouts.navigation, waitUntil: 'domcontentloaded' })
      .catch(() => null);
    await this.waitForPageReady();
  }

  // ---- ID-based locator helpers -------------------------------------------
  // Three helpers, because the same id convention lands on three different DOM
  // shapes. See constants/ElementIds.ts for the full reasoning.

  /**
   * A button by id. Resolves to the inner `<button>` of a `pbm-button` host,
   * which is what makes Playwright wait out the app's global busy state instead
   * of silently clicking a disabled control - see `buttonSelector`.
   */
  protected btn(id: string): Locator {
    return this.page.locator(buttonSelector(id)).first();
  }

  /** Any element by id: input, container, or a `pbm-select` combobox. */
  // MOVED HERE from PayerManagementPage on 2026-10-11: the scope selector sits
  // in the top bar of every gated module (Payer, Network, Plans ...), and the
  // network stories need to switch it too.
  /**
   * Puts `payerName` in scope, so the module will show it.
   *
   * Answers false when the switcher does not offer that payer - a partial term,
   * a payer code, or a name that genuinely is not in the register - so the
   * caller can tell "not in scope" from "not there".
   */
  async scopeTo(payerName: string): Promise<boolean> {
    const select = this.byId(GLOBAL.payerScopeSelect);
    if ((await select.count()) === 0) return false;

    // OPEN, AND CONFIRM IT OPENED (2026-10-11). Right after the gate is
    // answered the top bar re-renders, and a click in that moment opens
    // nothing - VERIFIED on the Policies module: no overlay, no options. So
    // the click is repeated until the overlay is actually on screen.
    const openOverlay = this.page.locator('[data-pc-section="overlay"]').filter({ visible: true });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await select.click().catch(() => undefined);
      const opened = await openOverlay
        .first()
        .waitFor({ state: 'visible', timeout: 2_500 })
        .then(() => true)
        .catch(() => false);
      if (opened) break;
    }

    // NARROW BEFORE PICKING. The switcher carries every payer in the register -
    // 1216 of them when this was written - so letting Playwright scan the whole
    // option list costs seconds on every call, and the provisioning fixtures
    // call it repeatedly. Typing into the overlay's own filter cuts the list to
    // one or two rows first. The filter is optional: if the control has none,
    // the pick below still works, just slower.
    // locator-exception: the overlay's filter box and its option rows are
    // PrimeNG internals with no ids; addressed by role, scoped to the open
    // overlay.
    //
    // THE OVERLAY'S OWN SEARCHBOX (2026-10-11). The filter is an
    // input[role="searchbox"] inside the open overlay, and it searches on the
    // server (GetMyPayers?searchText=...); the list itself loads ten payers a
    // page. The old lookup - the last visible role="textbox" - found the
    // PAGE's search box instead, typed the payer's name into the list search,
    // and never reached a payer past the first ten (14799; the network
    // provisioning behind 58/59/73).
    const overlay = this.page.locator('[data-pc-section="overlay"]').filter({ visible: true }).last();
    const filter = overlay.getByRole('searchbox'); // locator-exception: PrimeNG's overlay filter has no id; scoped to the open overlay
    if ((await filter.count()) > 0) await filter.fill(payerName);

    const option = this.page
      .getByRole('option', { name: payerName, exact: true })
      .filter({ visible: true })
      .first();
    // The filtered list settles asynchronously, so wait for the option rather
    // than counting straight away - counting won the race and reported "not
    // offered" for a payer that was about to appear.
    const offered = await option
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    if (!offered) {
      await this.page.keyboard.press('Escape');
      return false;
    }

    Logger.step(`Putting "${payerName}" in scope`);
    await option.click();
    await this.waitForPageReady();
    return true;
  }
  protected byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  /**
   * Picks an option from an open `pbm-select` overlay.
   *
   * Option elements get PrimeNG-generated, render-order-dependent ids
   * (`pn_id_30_0`) which are explicitly not usable as selectors, so the option
   * label is the only stable handle the app offers. This is the single place in
   * the framework that cannot be id-based.
   *
   * Overlays are portalled to <body> and a closed one can linger, so only the
   * overlay actually on screen is clickable.
   */
  protected async chooseOption(optionText: string): Promise<void> {
    await this.page
      .getByRole('option', { name: optionText, exact: true })
      .filter({ visible: true })
      .first()
      .click();
  }

  /** The list table of a screen namespace, e.g. `payer-list-table-el`. */
  protected tableFor(screen: string): Locator {
    return this.byId(`${screen}-table-el`);
  }

  /**
   * Every list module offers a "Table view" / "Cards view" toggle and REMEMBERS
   * the last choice for the signed-in user. All list assertions read the table,
   * so this waits out the loading spinner and keeps switching to Table view
   * until the table is actually rendered.
   *
   * The toggle lives in the GLOBAL breadcrumb bar, not on the list screen, and
   * it now carries an id - which removes the old fallback-to-first-tab hack that
   * existed only because the Arabic UI rendered the tabs icon-only with no
   * accessible name. The id is the same in both languages.
   *
   * `screen` names the id namespace whose table is being waited for; the two
   * view containers are never in the DOM together.
   */
  protected async ensureTableView(screen: string): Promise<void> {
    const table = this.tableFor(screen);
    const tableToggle = this.btn(GLOBAL.viewToggleTable);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      // The screen's own first-load row, by id, rather than a progressbar role.
      await this.byId(`${screen}-table-loading`)
        .waitFor({ state: 'hidden', timeout: Timeouts.loadingIndicator })
        .catch(() => undefined);

      // Ask the TOGGLE which view is active, rather than inferring it from
      // whether the table has appeared yet.
      //
      // This matters for both correctness and speed. Inferring from the table
      // forces a choice between two bad options: sampling with `isVisible()`
      // answers "no table" while it is still mounting and toggles straight back
      // to Cards, while waiting for the table pays a full timeout on every
      // navigation - and the list lands in Cards view EVERY time, so that cost
      // was paid on every single `open()`. The toggle exposes `aria-selected`,
      // which is authoritative and immediate.
      const ready = await tableToggle
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);

      if (ready) {
        if ((await tableToggle.getAttribute('aria-selected')) === 'true') {
          // Already the active view - wait for the table rather than sampling
          // with isVisible(), which reports the current frame and ignores its
          // own timeout, so a table still mounting reads as "not there".
          const rendered = await table
            .waitFor({ state: 'visible', timeout: Timeouts.short })
            .then(() => true)
            .catch(() => false);
          if (rendered) return;
          // The toggle claims Table but no table exists: the view preference was
          // re-applied underneath us. Click it again rather than trusting it.
          Logger.step('Toggle reports Table view but no table is rendered - switching again');
          await tableToggle.click();
        } else {
          Logger.step('Switching list to Table view');
          await tableToggle.click();
        }
        // The two view containers are never in the DOM together, so the table
        // appearing IS the completion signal for the swap.
        const swapped = await table
          .waitFor({ state: 'visible', timeout: Timeouts.default })
          .then(() => true)
          .catch(() => false);
        if (swapped) return;
        continue;
      }

      await this.reload();
    }
    await expect(table).toBeVisible({ timeout: Timeouts.default });
  }

  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  async getPageTitle(): Promise<string> {
    return this.page.title();
  }

  /** Asserts the current URL matches (contains) the expected relative path. */
  async verifyUrlContains(expectedPathFragment: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(expectedPathFragment), { timeout: Timeouts.navigation });
  }

  /**
   * The toast showing now.
   *
   * The id replaces the old `.p-toast-message` class match. It is still scoped
   * to the toast itself rather than any `role="alert"` element, because the
   * wizard renders a permanent informational banner with that role ("Initial
   * status will be set to Pending...") which would otherwise mask the message
   * under test.
   *
   * `.first()` is kept deliberately: toasts STACK, and PrimeNG gives every one
   * of them the same id, so this locator can legitimately match more than one
   * element. Assertions that must not match a leftover toast should use
   * `toastWithText` instead.
   */
  protected toastLocator(): Locator {
    return this.byId(TOAST.root).first();
  }

  /**
   * The toast carrying particular text - use this when a previous action's toast
   * may still be on screen, since both share the `pbm-toast` id and a plain
   * match would resolve to whichever came first.
   */
  protected toastWithText(text: string | RegExp): Locator {
    return this.byId(TOAST.root).filter({ hasText: text }).first();
  }

  async getToastMessage(timeout: number = Timeouts.toast): Promise<string> {
    const toast = this.toastLocator();
    await toast.waitFor({ state: 'visible', timeout });
    return (await toast.innerText()).trim();
  }

  /**
   * Whether a toast is on screen, WAITING up to `timeout` for one to appear.
   *
   * `Locator.isVisible()` accepts a timeout option and ignores it - it is a
   * single instantaneous read - so this asked "is a toast up right now?" while
   * pretending to ask "does one appear?". Called straight after an action, that
   * answers before the toast has animated in, and a caller reporting "no
   * feedback was shown" would have been reporting its own impatience.
   */
  async isToastVisible(timeout: number = Timeouts.short): Promise<boolean> {
    return this.toastLocator()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Gives the application a fair chance to say something - see
   * WaitUtils.settleMessages, which owns the reasoning and is shared with the
   * form drawer, which is not a BasePage.
   */
  protected async settleMessages(
    snapshot: () => Promise<string[]>,
    timeout: number = Timeouts.short,
  ): Promise<string[]> {
    return WaitUtils.settleMessages(snapshot, timeout);
  }
}
