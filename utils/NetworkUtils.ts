import type { Page, Response, Route } from '@playwright/test';
import { Timeouts } from '../constants/Timeouts';
import { Logger } from './Logger';
import { expect } from '@playwright/test';
import { env } from '../constants/EnvironmentConfig';
import { ACCESS_TOKEN_KEY } from '../data/payers/lifecycleGuardrails.data';

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
   * Answers ONE endpoint with a genuinely EMPTY result set, leaving the
   * response otherwise exactly as the server sent it.
   *
   * Written for the version-history empty state, where it is the only way to
   * reach the state at all: every payer in this environment lists at least its
   * own version, so "a payer with no history" cannot be provisioned as data.
   * That is reported by its own case; this lets the remaining cases still
   * examine the panel the story is about - its wording, its icon, its layout,
   * and whether it resolves or spins.
   *
   * Deliberately NOT a hand-written body. The real response is fetched and only
   * its lists are emptied (and its totals zeroed), so the envelope the client
   * unwraps - success flag, message, paging - stays authentic. A fabricated
   * payload would test the stub's shape rather than the application's handling
   * of an empty one, and would rot the moment the contract changed.
   *
   * This is the counterpart to `failEndpoint`, and keeping them separate is the
   * point: "there is nothing" and "I could not load it" are different answers,
   * and a panel that renders them identically is a defect.
   */
  static async emptyListEndpoint(page: Page, urlFragment: string): Promise<void> {
    Logger.step(`Answering requests matching "${urlFragment}" with an empty result set`);
    const predicate = NetworkUtils.matcher(urlFragment);
    const handler = async (route: Route): Promise<void> => {
      const response = await route.fetch().catch(() => null);
      if (response === null) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], totalCount: 0 }),
        });
        return;
      }
      const body = await response.json().catch(() => null);
      // The status is kept but the ENCODING headers are dropped. The server
      // answers gzipped; the replacement body is not, so passing the original
      // `content-encoding` and `content-length` through would hand the browser
      // a payload it cannot decode - a broken response, which is not what this
      // helper is for.
      const headers = { ...response.headers() };
      delete headers['content-encoding'];
      delete headers['content-length'];
      await route.fulfill({
        status: response.status(),
        headers,
        contentType: 'application/json',
        body: JSON.stringify(
          body === null ? { data: [], totalCount: 0 } : NetworkUtils.emptied(body),
        ),
      });
    };
    NetworkUtils.remember(page, urlFragment, predicate, handler);
    await page.route(predicate, handler);
  }

  /**
   * Empties every list inside a response payload and zeroes every count beside
   * it, at any depth - the envelope may wrap its items one or two levels down
   * and this must not depend on which.
   */
  private static emptied(value: unknown): unknown {
    if (Array.isArray(value)) return [];
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => {
        if (Array.isArray(inner)) return [key, []];
        if (typeof inner === 'number' && /count|total|records/i.test(key)) return [key, 0];
        return [key, NetworkUtils.emptied(inner)];
      }),
    );
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

  /**
   * Removes every route interception previously installed by this util.
   *
   * Each remembered handler is unrouted BY ITS OWN PREDICATE. `unroute('**\/*')`
   * alone does not remove them: Playwright matches an unroute against the
   * pattern the route was registered with, and `failEndpoint`, `abortEndpoint`
   * and `emptyListEndpoint` all register a predicate FUNCTION rather than a
   * glob. So the blanket call silently left them installed, and a case that
   * broke an endpoint, restored it, and then retried was still talking to the
   * broken endpoint - which reported as "the retry did not work" when the
   * retry had never been given a working service to talk to.
   *
   * The glob call is kept afterwards for `failMutatingRequests`, which really
   * does register `'**\/*'`.
   */
  static async restore(page: Page): Promise<void> {
    const entries = NetworkUtils.installed.get(page);
    if (entries) {
      for (const { predicate, handler } of entries.values()) {
        await page.unroute(predicate, handler).catch(() => undefined);
      }
    }
    await page.unroute('**/*').catch(() => undefined);
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

  /**
   * Captures a response WHATEVER its status, with the status alongside the body.
   *
   * `captureJsonResponse` above deliberately waits for a SUCCESSFUL response,
   * because its job is to inspect a payload the application uses. That makes it
   * the wrong tool when the failure IS the expected result: a stale payer save
   * is rejected with 409, `response.ok()` is false, so the predicate never
   * matches and the helper reports "no response captured" for a request that
   * plainly happened.
   *
   * That distinction matters more than it looks. Without a captured status
   * there is no way to tell "the save was correctly blocked" from "the save
   * silently succeeded" - the interface shows the same thing in both cases,
   * which is exactly the defect the concurrent-edit story reports. So this
   * helper is what makes the passing half of that story assertable.
   */
  static async captureResponse(
    page: Page,
    urlFragment: string,
    action: () => Promise<void>,
    timeout: number = Timeouts.default,
  ): Promise<{ status: number; body: unknown; text: string } | null> {
    const waiting = page
      .waitForResponse((response: Response) => response.url().includes(urlFragment), { timeout })
      .catch(() => null);

    await action();

    const response = await waiting;
    if (!response) {
      Logger.warn(`No response at all captured for "${urlFragment}"`);
      return null;
    }
    const text = await response.text().catch(() => '');
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // Not every error response is JSON; the raw text is still returned so a
      // caller can assert on it rather than losing the evidence entirely.
      body = null;
    }
    Logger.step(`Captured ${response.status()} from "${urlFragment}"`);
    return { status: response.status(), body, text };
  }
  /**
   * The URL of the first request matching `pattern` while `action` runs.
   *
   * For the fault-injection cases whose endpoint this framework does not
   * name. Rather than guess at a path - and fail an endpoint that is never
   * called, which looks exactly like a feature that cannot fail - a case can
   * perform the operation once, learn the URL, and then break that.
   */
  static async captureRequestUrl(
    page: Page,
    pattern: RegExp,
    action: () => Promise<void>,
    timeout: number = Timeouts.default,
  ): Promise<string | null> {
    const waiting = page
      .waitForRequest((request) => pattern.test(request.url()), { timeout })
      .then((request) => request.url())
      .catch(() => null);
    await action();
    const url = await waiting;
    if (url === null) {
      Logger.warn(`No request matching ${pattern} was captured`);
      return null;
    }
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    Logger.step(`Captured request URL "${path}"`);
    return path;
  }

  /**
   * How many times one endpoint is called while `action` runs.
   *
   * `captureResponse` above answers "what did the server say"; this answers "how
   * many times was it asked", which is a different question and the only one
   * that can settle a double-submission case. Three rapid clicks on a Confirm
   * button that leaves the end state intact look identical to one click from
   * the interface - the duplicate is visible only on the wire.
   *
   * Counts REQUESTS, not responses, and keeps counting for `settleMs` after the
   * action returns: a duplicate fired a few milliseconds behind the first is
   * exactly what this is looking for, and it would be missed by stopping the
   * moment the click resolved.
   */
  static async countRequestsDuring(
    page: Page,
    urlFragment: string,
    action: () => Promise<void>,
    settleMs = 3_000,
  ): Promise<number> {
    let count = 0;
    const listener = (request: { url(): string; method(): string }): void => {
      if (request.url().includes(urlFragment) && request.method() !== 'GET') count += 1;
    };
    page.on('request', listener);
    try {
      await action();
      await page.waitForTimeout(settleMs);
    } finally {
      page.off('request', listener);
    }
    Logger.step(`"${urlFragment}" was called ${count} time(s)`);
    return count;
  }

  /**
   * The request BODY one endpoint was called with while `action` ran.
   *
   * The other capture helpers read responses, which answer what the server
   * said. This answers what it was TOLD - needed where the requirement is about
   * the data reaching the server rather than the outcome: an inactivation's
   * 500-character details field is written to the record and the interface
   * offers nowhere to read it back, so the submitted payload is the only
   * evidence that the text survived intact.
   */
  static async captureRequestBody(
    page: Page,
    urlFragment: string,
    action: () => Promise<void>,
    timeout: number = Timeouts.default,
  ): Promise<string | null> {
    const waiting = page
      .waitForRequest(
        (request) => request.url().includes(urlFragment) && request.method() !== 'GET',
        { timeout },
      )
      .catch(() => null);

    await action();

    const request = await waiting;
    if (!request) {
      Logger.warn(`No request captured for "${urlFragment}"`);
      return null;
    }
    return request.postData();
  }


  /**
   * POSTs to the application API as the SIGNED-IN user.
   *
   * A test asserts against the interface, not the API - but three cases in this
   * suite ask for something the interface cannot express (a reason outside a
   * dropdown, a repeated call the button prevents, a request with a field left
   * out), and the sheets name a direct request as the way to reach them.
   *
   * The bearer token is read from the page's own localStorage rather than by
   * signing in again. The request MUST arrive with the same identity as the UI
   * session: without it every call comes back 401, which is indistinguishable
   * from the validation rejection these cases are looking for. That is not
   * hypothetical - the first attempt at this used the context cookies alone and
   * got exactly that.
   */
  static async postAsSession(
    page: Page,
    path: string,
    data: unknown,
  ): Promise<{ status: number; text: string; validationErrors: string[] }> {
    const token = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ACCESS_TOKEN_KEY,
    );
    expect(
      token,
      `no "${ACCESS_TOKEN_KEY}" in localStorage - the request would be unauthenticated, and a `
        + '401 would be indistinguishable from the rejection under test',
    ).not.toBeNull();

    const response = await page.request.post(`${env.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: data as Record<string, unknown>,
      failOnStatusCode: false,
    });
    const text = await response.text();
    Logger.step(`POST ${path} returned ${response.status()}`);

    // Field-level problems come back in `ValidationErrors`, each a
    // { Name, Reason } pair. Flattened to the reasons, which is what a case
    // asserts on - the Name is the field the SERVER blames, and it does not
    // always blame the right one.
    const reasons: string[] = [];
    try {
      const body = JSON.parse(text) as { ValidationErrors?: { Reason?: string }[] };
      for (const entry of body.ValidationErrors ?? []) {
        if (entry.Reason !== undefined) reasons.push(entry.Reason);
      }
    } catch {
      // A non-JSON error body is still returned as text to assert on.
    }
    return { status: response.status(), text, validationErrors: reasons };
  }
}
