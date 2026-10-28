import * as fs from 'fs';
import * as path from 'path';
import type { Page, TestInfo } from '@playwright/test';
import { env } from '../constants/EnvironmentConfig';
import { CommonUtils } from './CommonUtils';
import { DateUtils } from './DateUtils';
import { Logger } from './Logger';
import { UiEventRecorder, type UiEvent } from './UiEventRecorder';

/**
 * Handles capturing and storing screenshots for FAILED tests only, outside
 * the project directory (per framework requirements).
 *
 * Directory layout:
 *   <FAILED_SCREENSHOTS_PATH>/<run-date_run-time>/<TestName>_<Browser>.png
 *
 * If FAILED_SCREENSHOTS_PATH is not configured, falls back to a folder one
 * level ABOVE the project root so screenshots never land inside the repo.
 */
/** A failed step in plain words, printed onto its screenshot. */
export interface StepExplanation {
  expected: string;
  actual: string;
  /** The id of the element the step was checking, outlined when on the page. */
  elementId?: string;
}

export class ScreenshotUtils {
  private static runFolderName: string | undefined;

  /** Other windows a test works in (a second user's session), newest last, per test. */
  private static readonly sessions = new WeakMap<TestInfo, Page[]>();

  /**
   * Registers a window the test works in besides its default page - the
   * non-administrator and shaped-role sessions. Without it, a case that ran
   * entirely as the second user was photographed through the default page,
   * which had never left about:blank: 17758 and 17773 had plain white
   * screenshots (found 2026-10-27).
   */
  static registerSession(testInfo: TestInfo, page: Page): void {
    this.sessions.set(testInfo, [...(this.sessions.get(testInfo) ?? []), page]);
    // Its messages are recorded too, so a step that failed in this window
    // reports what it showed (see UiEventRecorder).
    void UiEventRecorder.watch(testInfo, page);
  }

  /**
   * The window to photograph: the default page while it shows the application,
   * otherwise the newest registered session that is still open.
   */
  private static targetFor(testInfo: TestInfo, page: Page): Page {
    const unused = page.isClosed() || page.url() === 'about:blank';
    if (!unused) return page;
    const open = (this.sessions.get(testInfo) ?? []).filter((session) => !session.isClosed());
    return open[open.length - 1] ?? page;
  }

  /**
   * Also photographs every OTHER open session window, next to the main shot
   * (`<file>-user-N.png`). With an administrator and a second user both on
   * screen, the failing step may have been in either window - 17788's step 3
   * ran in the Payer Admin's window while the image showed the administrator's
   * (2026-10-27). Never fatal.
   */
  private static async captureOtherSessions(testInfo: TestInfo, shown: Page, destination: string, label: string): Promise<void> {
    const others = (this.sessions.get(testInfo) ?? []).filter((session) => session !== shown && !session.isClosed());
    for (const [index, session] of others.entries()) {
      try {
        const file = destination.replace(/\.png$/, `-user-${index + 1}.png`);
        await this.settle(session);
        const buffer = await session.screenshot({ fullPage: true, path: file });
        await testInfo.attach(`${label}-user-${index + 1}`, { body: buffer, contentType: 'image/png' });
        Logger.info(`Second user's window: ${file}`);
      } catch (error) {
        Logger.error('Could not capture the second user\'s window', error);
      }
    }
  }

  /**
   * Lets the screen finish drawing before the shot. Audit and list checks fail
   * while a reload is still in flight, so the image showed a blank page or
   * "Loading..." instead of the screen that was checked (17820, 17836, 17926).
   * Bounded, and never fatal: a screen that will not settle is still captured.
   */
  private static async settle(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await page
      .waitForFunction(() => !/^\s*Loading\.\.\.\s*$/m.test(document.body?.innerText ?? ''), undefined, { timeout: 5_000 })
      .catch(() => undefined);
  }

  /**
   * The test title as a filename part, capped. Windows refuses paths over 260
   * characters, and the long titles of the plan cases plus the step name went
   * past it: 19076's step screenshots failed with ENOENT (2026-10-27). The
   * case id leads the title, so the cap keeps it.
   */
  private static fileTitle(testInfo: TestInfo): string {
    return CommonUtils.sanitizeForFilename(testInfo.title).slice(0, 80);
  }

  private static getRunRoot(): string {
    const configured = env.failedScreenshotsPath;
    const root = configured && configured.trim() !== ''
      ? configured
      : path.resolve(process.cwd(), '..', 'PBM-Automation-Artifacts', 'FailedScreenshots');
    return CommonUtils.toAbsolutePath(root);
  }

  /** One timestamped subfolder per test execution/run, computed once and cached. */
  private static getRunFolder(): string {
    if (!this.runFolderName) {
      this.runFolderName = DateUtils.timestampForFilename();
    }
    const runFolder = path.join(this.getRunRoot(), this.runFolderName);
    CommonUtils.ensureDirectoryExists(runFolder);
    return runFolder;
  }

  /**
   * Captures the screen AT THE MOMENT A STEP FAILED.
   *
   * Far more useful than the end-of-test screenshot: by teardown the drawer has
   * closed, the toast has expired and the list has re-rendered, so that image
   * frequently shows a perfectly healthy screen. This one shows the state that
   * actually produced the failure.
   *
   * The step number and name are in the filename so an image can be matched to
   * its step without opening the report.
   */
  static async captureStepFailure(
    page: Page,
    testInfo: TestInfo,
    stepIndex: number,
    stepName: string,
    explain?: StepExplanation,
  ): Promise<string | undefined> {
    const target = this.targetFor(testInfo, page);
    if (target.isClosed()) return undefined;
    try {
      const browserName = testInfo.project.name;
      const safeTitle = this.fileTitle(testInfo);
      const safeStep = CommonUtils.sanitizeForFilename(stepName).slice(0, 60);
      const filename = `${safeTitle}_step-${String(stepIndex).padStart(2, '0')}_${safeStep}_${browserName}.png`;
      const destination = path.join(this.getRunFolder(), filename);

      await this.settle(target);
      const marked = explain ? await this.markFailure(target, stepIndex, stepName, explain) : false;
      const buffer = await target.screenshot({ fullPage: true, path: destination });
      if (marked) await this.unmarkFailure(target);
      await testInfo.attach(`step-${stepIndex}-failed`, {
        body: buffer,
        contentType: 'image/png',
      });

      Logger.info(`Step ${stepIndex} failure screenshot: ${destination}`);
      await this.captureOtherSessions(testInfo, target, destination, `step-${stepIndex}-failed`);
      return destination;
    } catch (error) {
      Logger.error(`Could not capture a screenshot for step ${stepIndex}`, error);
      return undefined;
    }
  }

  /**
   * Writes the failure ONTO the screen before it is photographed, so the image
   * explains itself to any reader (QA lead, 2026-10-28: "very clear screenshot"):
   * a red banner at the bottom - "Step N failed: <step>", Expected, Actual - and
   * a red outline round the element the step was checking, scrolled into view,
   * when that element is on the page. Removed again straight after the shot.
   * Never fatal: a page that refuses the overlay is photographed as it is.
   */
  private static async markFailure(target: Page, stepIndex: number, stepName: string, explain: StepExplanation): Promise<boolean> {
    return target
      .evaluate(({ title, expected, actual, elementId }) => {
        const banner = document.createElement('div');
        banner.id = '__pbm-failure-banner';
        banner.setAttribute('style', [
          'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483647', 'background:#b91c1c', 'color:#fff',
          'font:500 15px/1.5 "Segoe UI",Arial,sans-serif', 'padding:12px 18px', 'box-shadow:0 -2px 10px rgba(0,0,0,.35)',
          'white-space:pre-wrap', 'direction:ltr', 'text-align:left', 'max-height:40vh', 'overflow:hidden',
        ].join(';'));
        const line = (label: string, text: string, bold = false) => {
          const row = document.createElement('div');
          const tag = document.createElement('b');
          tag.textContent = label;
          row.appendChild(tag);
          row.appendChild(document.createTextNode(text));
          if (bold) row.style.fontSize = '16px';
          banner.appendChild(row);
        };
        line('', title, true);
        line('Expected: ', expected);
        line('Actual: ', actual);
        document.body.appendChild(banner);
        const element = elementId ? document.getElementById(elementId) : null;
        if (element) {
          element.setAttribute('data-pbm-outline', element.style.outline || '');
          element.style.outline = '4px solid #dc2626';
          element.style.outlineOffset = '2px';
          element.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
      }, { title: `Step ${stepIndex} failed: ${stepName}`, ...explain, elementId: explain.elementId ?? '' })
      .then(() => true)
      .catch(() => false);
  }

  private static async unmarkFailure(target: Page): Promise<void> {
    await target
      .evaluate(() => {
        document.getElementById('__pbm-failure-banner')?.remove();
        for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-pbm-outline]'))) {
          element.style.outline = element.getAttribute('data-pbm-outline') ?? '';
          element.style.outlineOffset = '';
          element.removeAttribute('data-pbm-outline');
        }
      })
      .catch(() => undefined);
  }

  /**
   * Saves the pictures UiEventRecorder took AT THE MOMENT a message appeared
   * during a failed step (`<step file>_msg-N.png`), next to the step's own
   * screenshot. The step screenshot shows the screen once the check gave up;
   * these show the toast or error the user actually saw, before it expired.
   * Returns the paths written. Never fatal.
   */
  static async captureStepMessages(
    testInfo: TestInfo,
    stepIndex: number,
    stepName: string,
    events: UiEvent[],
  ): Promise<string[]> {
    const written: string[] = [];
    const safeTitle = this.fileTitle(testInfo);
    const safeStep = CommonUtils.sanitizeForFilename(stepName).slice(0, 60);
    let count = 0;
    for (const event of events.filter((e) => e.shot)) {
      try {
        const buffer = await event.shot;
        if (!buffer) continue;
        count += 1;
        const filename = `${safeTitle}_step-${String(stepIndex).padStart(2, '0')}_${safeStep}_msg-${count}.png`;
        const destination = path.join(this.getRunFolder(), filename);
        await fs.promises.writeFile(destination, buffer);
        await testInfo.attach(`step-${stepIndex}-message-${count} [${event.kind}] ${event.text.slice(0, 60)}`, {
          body: buffer,
          contentType: 'image/png',
        });
        written.push(destination);
      } catch (error) {
        Logger.error(`Could not save a message screenshot for step ${stepIndex}`, error);
      }
    }
    return written;
  }

  /**
   * Captures a full-page screenshot for a failed test and returns the
   * absolute path written. Also attaches the file to the Playwright HTML
   * report via testInfo.attach so it's visible there too.
   */
  static async captureFailureScreenshot(page: Page, testInfo: TestInfo): Promise<string | undefined> {
    try {
      const browserName = testInfo.project.name;
      const safeTitle = this.fileTitle(testInfo);
      const filename = `${safeTitle}_${browserName}.png`;
      const destination = path.join(this.getRunFolder(), filename);

      const target = this.targetFor(testInfo, page);
      await this.settle(target);
      const buffer = await target.screenshot({ fullPage: true, path: destination });
      await testInfo.attach(`failure-screenshot-${browserName}`, {
        body: buffer,
        contentType: 'image/png',
      });

      Logger.info(`Failure screenshot saved: ${destination}`);
      return destination;
    } catch (error) {
      Logger.error('Failed to capture failure screenshot', error);
      return undefined;
    }
  }
}
