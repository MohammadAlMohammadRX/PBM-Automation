import type { Page, Response, Route } from '@playwright/test';
import { Timeouts } from '../constants/Timeouts';
import { Logger } from './Logger';

/**
 * Network fault-injection and response-inspection helpers.
 *
 * Keeps route-handler branching out of spec files so tests stay declarative,
 * and gives the resilience cases a way to fail ONE endpoint rather than all of
 * them - which matters for correctness, not just tidiness: blanket-failing
 * every request tells you nothing about which screen reported the error,
 * because the whole shell fails to load with it.
 */
export class NetworkUtils {
  /**
   * Fails every mutating (non-GET) request with an HTTP 500 while leaving read
   * traffic intact, simulating a backend error during a save. A 500 response
   * (rather than a severed connection) lets the SPA surface its own error and
   * stay interactive. Pair with `restore()` once the failure window is over.
   */
  static async failMutatingRequests(page: Page): Promise<void> {
    Logger.step('Injecting HTTP 500 failure for all mutating requests');
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.continue();
      } else {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected server error for resilience test.' }),
        });
      }
    });
  }

  /**
   * Route predicates and handlers installed per page, so an endpoint can later
   * be restored.
   *
   * This registry is not incidental bookkeeping - it is REQUIRED for correctness.
   * `page.unroute(predicate, handler)` removes a handler by IDENTITY, so calling
   * it with a freshly built closure removes nothing and the endpoint stays
   * broken. Without this, the "and then it recovers" half of every resilience
   * case would silently keep failing, and the test would report the recovery as
   * a defect.
   */
  private static readonly installed = new Map<
    Page,
    Map<string, { predicate: (url: URL) => boolean; handler: (route: Route) => Promise<void> }>
  >();

  private static matcher(urlFragment: string): (url: URL) => boolean {
    return (url: URL) => url.pathname.includes(urlFragment) || url.href.includes(urlFragment);
  }

  private static remember(
    page: Page,
    urlFragment: string,
    predicate: (url: URL) => boolean,
    handler: (route: Route) => Promise<void>,
  ): void {
    if (!NetworkUtils.installed.has(page)) NetworkUtils.installed.set(page, new Map());
    NetworkUtils.installed.get(page)!.set(urlFragment, { predicate, handler });
  }

  /**
   * Fails ONE endpoint with an HTTP 500, leaving every other request alone.
   *
   * This is what the "graceful degradation" cases need: the page still loads,
   * the shell still renders, and the only thing broken is the data the screen
   * under test depends on - so whatever the screen then shows is genuinely its
   * own error handling rather than a blank page that never booted.
   *
   * `urlFragment` is matched as a SUBSTRING of the request URL, so an endpoint
   * constant from constants/ApiEndpoints.ts can be passed straight in. Note
   * that substring matching is inclusive by design: failing
   * `/api/Payers/GetPayers` also fails `/api/Payers/GetPayersDashboard`, which
   * is what "the payer data service is unavailable" actually means.
   */
  static async failEndpoint(page: Page, urlFragment: string, status = 500): Promise<void> {
    Logger.step(`Injecting HTTP ${status} for requests matching "${urlFragment}"`);
    const predicate = NetworkUtils.matcher(urlFragment);
    const handler = async (route: Route): Promise<void> => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          Title: 'Injected failure',
          Status: status,
          ErrorMessage: `Injected ${status} for ${urlFragment} (resilience test).`,
        }),
      });
    };
    NetworkUtils.remember(page, urlFragment, predicate, handler);
    await page.route(predicate, handler);
  }

  /**
   * Aborts one endpoint outright, as an unreachable service rather than an
   * erroring one. Some clients distinguish the two, and "the service is down"
   * is what several cases describe.
   */
  static async abortEndpoint(page: Page, urlFragment: string): Promise<void> {
    Logger.step(`Aborting requests matching "${urlFragment}"`);
    const predicate = NetworkUtils.matcher(urlFragment);
    const handler = async (route: Route): Promise<void> => {
      await route.abort('failed');
    };
    NetworkUtils.remember(page, urlFragment, predicate, handler);
    await page.route(predicate, handler);
  }

  /**
   * Restores ONE endpoint previously failed or aborted, so a test can prove the
   * screen recovers once the service is back - the second half of every
   * resilience case, and something `restore()` cannot do because it tears down
   * every route at once.
   *
   * Removes the handler by the identity recorded when it was installed; see
   * `installed` for why anything else is a no-op.
   */
  static async restoreEndpoint(page: Page, urlFragment: string): Promise<void> {
    Logger.step(`Restoring requests matching "${urlFragment}"`);
    const entry = NetworkUtils.installed.get(page)?.get(urlFragment);
    if (!entry) {
      Logger.warn(`No injected failure recorded for "${urlFragment}" - nothing to restore`);
      return;
    }
    await page.unroute(entry.predicate, entry.handler);
    NetworkUtils.installed.get(page)!.delete(urlFragment);
  }

  /** Removes any route interception previously installed by this util. */
  static async restore(page: Page): Promise<void> {
    await page.unroute('**/*');
    NetworkUtils.installed.delete(page);
  }

  /**
   * Runs `action` and returns the JSON body of the first response matching
   * `urlFragment`.
   *
   * One acceptance criterion asks, in as many words, to "inspect the returned
   * payload structure" of the shared payer selection interface - so reading the
   * response IS the test, not a shortcut around the UI. The listener is armed
   * before the action so a fast response cannot be missed.
   *
   * Returns `null` when nothing matched within the timeout, which the caller
   * reports as a failure rather than treating as an empty payload.
   */
  static async captureJsonResponse<T = unknown>(
    page: Page,
    urlFragment: string,
    action: () => Promise<void>,
    timeout: number = Timeouts.default,
  ): Promise<T | null> {
    const waiting = page
      .waitForResponse(
        (response: Response) => response.url().includes(urlFragment) && response.ok(),
        { timeout },
      )
      .catch(() => null);

    await action();

    const response = await waiting;
    if (!response) {
      Logger.warn(`No successful response captured for "${urlFragment}"`);
      return null;
    }
    return (await response.json().catch(() => null)) as T | null;
  }
}
