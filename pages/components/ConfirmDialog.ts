import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import {
  DIALOG,
  DIALOG_ACTION,
  DISMISSIVE_ACTIONS,
  buttonSelector,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * The application's single shared confirmation modal.
 *
 * ONE dialog serves every confirmation in the app - verified live:
 *   - "Send for approval?"          (Cancel / Send for Approval)
 *   - "Approve this request"        (acknowledgement checkbox required)
 *   - "Reject this request"         (Rejection Reason + acknowledgement)
 *   - "Delete Payer"               (No / Yes)
 *   - "Unsaved Changes"            (Keep Editing / Discard Changes)
 *
 * The QA Manual also documents `pbm-delete-confirm-dialog` and
 * `pbm-unsaved-changes-dialog` as separate elements; neither ever renders.
 *
 * The important consequence for this framework: action buttons are keyed on the
 * dialog's LOGICAL action key, and only `confirm` / `cancel` are ever used
 * (plus `stay` / `discard` on the drawer-close guard). So "Yes", "نعم",
 * "Approve", "Reject" and "Send for Approval" are all the same
 * `pbm-dialog-action-confirm` element. Confirming a dialog no longer depends on
 * knowing the button's translated label - which is what previously forced every
 * bilingual flow to carry a localized label for each action.
 *
 * The `actionLabel` parameters below are kept so the existing call sites and
 * their readable intent survive; they no longer take part in locating.
 */
export class ConfirmDialog {
  constructor(private readonly page: Page) {}

  /** Rendered into <body>, so it is matched at page scope, not within a screen. */
  private root(): Locator {
    return this.page.locator(`#${DIALOG.root}`);
  }

  /**
   * Whether the dialog is on screen right now, without waiting for one.
   *
   * Used where the ABSENCE is the assertion - a cancelled confirmation, a
   * dialog that closed after confirming. `waitForHidden` throws on failure,
   * which is right for a precondition but wrong for a case that wants to
   * report what it found.
   */
  async isVisible(): Promise<boolean> {
    // WAITS, rather than reading the state at this instant. Playwright ignores
    // the timeout passed to `locator.isVisible()`, so the earlier form answered
    // before the dialog could animate in - and a caller that only confirms
    // "if a dialog appeared" therefore skipped the confirmation and left the
    // change unsubmitted. That cost a fixture two runs to find.
    return this.root()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  async waitForVisible(): Promise<void> {
    await expect(this.root()).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Any PrimeNG modal overlay currently ON SCREEN.
   *
   * Matched by its PrimeNG class rather than an id: it is not an application
   * element and has none. It is the thing that physically blocks clicks, so it
   * has to be waited on directly.
   *
   * Filtered to visible masks and asserted by COUNT, not with `toBeHidden()`:
   * more than one mask can be in the DOM at once (a dialog raised over an open
   * drawer), and `toBeHidden()` on a multi-match locator trips Playwright's
   * strict mode instead of answering the question.
   */
  private visibleMasks(): Locator {
    return this.page.locator('.p-dialog-mask').filter({ visible: true });
  }

  /**
   * Waits for the dialog to be fully gone.
   *
   * The inner content disappearing is NOT enough. PrimeNG keeps its modal mask
   * in the DOM a moment longer, and while that mask is there it swallows every
   * click on the page. Verified against the live app: a "Send for Approval"
   * confirm returned as soon as `#pbm-dialog` went hidden, and the very next
   * action - a row Delete - then retried against the invisible mask for 15
   * seconds before timing out, with the button resolved and reported "visible,
   * enabled and stable" the whole time.
   */
  async waitForHidden(): Promise<void> {
    // The message matters as much as the wait. A dialog that stays open after
    // its affirmative action has been clicked is the shape several refusals
    // take in this module - the action is declined server-side and nothing is
    // said, so the user is left looking at the prompt they just answered. Named
    // here, that reads as the finding it is instead of a bare locator timeout
    // in whichever step happened to call confirm().
    await expect(
      this.root(),
      'the dialog should close once its action is confirmed; it is still open, which is how '
        + 'this application shows an action that was declined without explanation',
    ).toBeHidden({ timeout: Timeouts.default });
    await expect(this.visibleMasks()).toHaveCount(0, { timeout: Timeouts.default });
  }

  async getTitle(): Promise<string> {
    return (await this.page.locator(`#${DIALOG.title}`).innerText()).trim();
  }

  async getMessage(): Promise<string> {
    return (await this.page.locator(`#${DIALOG.message}`).innerText()).trim();
  }

  /** The "affected records" list, e.g. the change type being approved. */
  items(): Locator {
    return this.page.locator(`#${DIALOG.items}`);
  }

  private ackCheckbox(): Locator {
    return this.page.locator(`#${DIALOG.acknowledge}`);
  }

  /**
   * Ticks the "I confirm that I have reviewed..." acknowledgement, which the
   * Approve and Reject dialogs require before their confirm button enables.
   *
   * The native checkbox is visually hidden, so it is clicked through its
   * PrimeNG wrapper rather than directly.
   */
  async acknowledgeIfPresent(): Promise<void> {
    const checkbox = this.ackCheckbox();
    if ((await checkbox.count()) === 0) return;
    if (await checkbox.isChecked()) return;
    // The id lands on the hidden input; the clickable surface is its wrapper.
    await checkbox.locator('xpath=..').click();
    await expect(checkbox).toBeChecked({ timeout: Timeouts.default });
  }

  /**
   * Selects a reason when the dialog asks for one (the reviewer's "Rejection
   * Reason"). The select's id sits on its combobox span; the options overlay is
   * portalled to <body>, so it is matched at page scope.
   */
  async selectReasonIfPresent(reason: string): Promise<void> {
    const select = this.page.locator(`#${DIALOG.select}`);
    if ((await select.count()) === 0) return;
    await select.click();
    await this.page
      .getByRole('option', { name: reason, exact: true })
      .filter({ visible: true })
      .first()
      .click();
  }

  /**
   * Selects the first reason the dialog offers, when it asks for one.
   *
   * Used where a reason is a REQUIRED gate rather than the thing under test -
   * an inactivation, for instance, cannot be confirmed without one, but which
   * reason is chosen is immaterial to the behaviour being checked. Taking the
   * first option avoids hard-coding a label from a configurable lookup
   * (`payerInactivationReason`), which an administrator can rename or reorder
   * at any time; a test that named one would then fail for a reason that has
   * nothing to do with what it checks.
   *
   * Where the reason IS the subject - the reviewer's Rejection Reason - use
   * `selectReasonIfPresent` and name it.
   */
  async selectFirstReasonIfPresent(): Promise<void> {
    const select = this.page.locator(`#${DIALOG.select}`);
    if ((await select.count()) === 0) return;
    await select.click();
    const option = this.page.getByRole('option').filter({ visible: true }).first();
    await expect(option).toBeVisible({ timeout: Timeouts.default });
    await option.click();
  }

  /** An action button by its logical key. */
  private action(key: keyof typeof DIALOG_ACTION): Locator {
    return this.page.locator(buttonSelector(DIALOG_ACTION[key])).first();
  }

  /**
   * The dialog's affirmative action, whatever it is called.
   *
   * The affirmative key is NOT the same across dialogs: delete/approve/reject
   * use `confirm`, while Send for Approval uses `submit`. Rather than guess,
   * this reads the action ids actually rendered and takes the one that is not a
   * dismissal. That makes a new dialog with its own verb work without a change
   * here, and it fails with the ids it did find rather than a bare timeout.
   */
  private async affirmativeAction(): Promise<Locator> {
    const ids = await this.page
      .locator(`#${DIALOG.actions} [id^="pbm-dialog-action-"]`)
      .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).id));
    const dismissive = DISMISSIVE_ACTIONS.map((key) => `pbm-dialog-action-${key}`);
    const affirmative = ids.find((id) => !dismissive.includes(id));
    if (!affirmative) {
      throw new Error(
        `[ConfirmDialog] No affirmative action found. Actions present: ${ids.join(', ') || '(none)'}`,
      );
    }
    return this.page.locator(buttonSelector(affirmative)).first();
  }

  /**
   * Confirms the dialog, ticking the acknowledgement first when one is present.
   * `actionLabel` is retained for readability at the call site only - every
   * affirmative action resolves to the same `confirm` id.
   */
  async confirm(actionLabel?: string): Promise<void> {
    Logger.step(`Confirming dialog${actionLabel ? ` action "${actionLabel}"` : ''}`);
    await this.waitForVisible();
    await this.acknowledgeIfPresent();
    await (await this.affirmativeAction()).click();
    await this.waitForHidden();
  }

  /**
   * Clicks the affirmative action several times as fast as the browser will
   * dispatch them.
   *
   * The duplicate-submission case for every dialog-driven action. The clicks
   * are fired WITHOUT awaiting the dialog's reaction, because awaiting between
   * them is exactly the pause that lets the application disable the button and
   * makes the test pass without ever exercising the race.
   */
  async confirmRepeatedly(times: number): Promise<void> {
    Logger.step(`Clicking the affirmative action ${times} times in rapid succession`);
    await this.waitForVisible();
    await this.acknowledgeIfPresent();
    const button = await this.affirmativeAction();
    await button.scrollIntoViewIfNeeded();
    await Promise.all(
      Array.from({ length: times }, () => button.click({ force: true, noWaitAfter: true })),
    );
    await this.waitForHidden();
  }

  /**
   * Whether the affirmative action can be used right now.
   *
   * The reject and approve dialogs GATE it: the reason dropdown and the
   * acknowledgement have to be answered first. A story about "the rejection
   * is blocked until a reason is given" needs to read that gate rather than
   * click into a timeout.
   */
  async isAffirmativeEnabled(): Promise<boolean> {
    const button = await this.affirmativeAction();
    return button.isEnabled().catch(() => false);
  }

  /**
   * Asserts the affirmative action becomes usable, waiting for it.
   *
   * `isAffirmativeEnabled()` is a ONE-SHOT read - `Locator.isEnabled()` takes
   * no timeout and does not retry - so reading it straight after choosing a
   * rejection reason answered before the dialog had re-evaluated its form and
   * reported the button as gated. Three rejection cases failed that way against
   * a dialog that does release the button: `reject()` clicks the very same
   * control successfully, and a click auto-waits for it to be enabled.
   *
   * Use this wherever the expected result is "the control is now available";
   * keep the boolean read for reporting what state something is in.
   */
  async expectAffirmativeEnabled(message: string): Promise<void> {
    await expect(await this.affirmativeAction(), message).toBeEnabled({
      timeout: Timeouts.default,
    });
  }

  /**
   * Asserts the affirmative action is refused, and stays refused.
   *
   * The counterpart above waits for the button to open; this one must not, or
   * it would report a gate that opened a moment later as a gate that held. The
   * assertion is web-first in the opposite direction - it fails as soon as the
   * button becomes enabled within the window.
   */
  async expectAffirmativeDisabled(message: string): Promise<void> {
    await expect(await this.affirmativeAction(), message).toBeDisabled({
      timeout: Timeouts.default,
    });
  }

  /**
   * Every option the dialog's reason dropdown offers, in the order shown.
   *
   * Returned rather than asserted because two stories ask different things of
   * the same list: one needs a named reason to exist, the other needs to know
   * that the list is ALL there is - see `hasFreeTextInput`.
   */
  async getReasonOptions(): Promise<string[]> {
    const select = this.page.locator(`#${DIALOG.select}`);
    if ((await select.count()) === 0) return [];
    await select.click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    const labels = (await options.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
    // Closed by TOGGLING the combobox, not with Escape. Escape inside a PrimeNG
    // dialog is handled by the dialog as well as the overlay, so it dismissed
    // the whole Reject dialog - and the next step's click then timed out
    // against a control that was no longer on screen. Reading the options must
    // leave the dialog exactly as it found it.
    await select.click();
    await expect(options.first()).toBeHidden({ timeout: Timeouts.default });
    // PrimeNG renders a filter row inside the overlay, which comes back as a
    // stray entry; only the labels that match a real option are returned.
    return labels.filter((label) => label.length > 1);
  }

  /**
   * Whether the dialog offers anywhere to TYPE a reason.
   *
   * The rejection story is largely about free text - minimum length, maximum
   * length, whitespace-only, a script tag - and none of it applies if the
   * reason can only be chosen from a managed list. So the absence of a text
   * input is itself the finding, and it has to be read rather than assumed.
   */
  async hasFreeTextInput(): Promise<boolean> {
    // locator-exception: the question is whether ANY typable control exists
    // inside the dialog, so it cannot be asked by id - an id-based check
    // could only confirm the absence of one control this suite happened to
    // name. Scoped to the dialog root, which is an id.
    const typable = this.root().locator('textarea, input[type="text"]:not([role="combobox"])');
    return (await typable.count()) > 0;
  }

  /**
   * Clicks one NAMED action, for the dialogs that offer more than one
   * affirmative choice.
   *
   * `confirm()` above resolves "the action that is not a dismissal", which is
   * exactly right for delete/approve/submit - they offer one. The export format
   * dialog offers TWO ("CSV" and "Excel"), so that rule silently picks whichever
   * the application happened to render first: a test asking for Excel would
   * download CSV and then assert against a file it never requested. Naming the
   * key removes the guess.
   *
   * Deliberately does NOT wait for the dialog to close. Choosing an export
   * format starts a DOWNLOAD, and the caller has to be listening for it before
   * the click - so waiting here would race the caller's own wait.
   */
  async clickAction(key: keyof typeof DIALOG_ACTION): Promise<void> {
    Logger.step(`Choosing dialog action "${key}"`);
    await this.waitForVisible();
    await this.acknowledgeIfPresent();
    await this.action(key).click();
  }

  /**
   * The action keys the open dialog offers, in render order.
   *
   * Exposed so a test can assert WHICH choices a dialog presents rather than
   * only that clicking one works - the export checklist is about the offered
   * formats, not about one of them happening to function.
   */
  async getActionKeys(): Promise<string[]> {
    await this.waitForVisible();
    const ids = await this.page
      .locator(`#${DIALOG.actions} [id^="pbm-dialog-action-"]`)
      .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).id));
    return ids.map((id) => id.replace('pbm-dialog-action-', ''));
  }

  /** Dismisses the dialog via its cancel action. */
  async cancel(_cancelLabel?: string): Promise<void> {
    await this.action('cancel').click();
    await this.waitForHidden();
  }

  /**
   * Discards unsaved changes on the drawer-close guard. This is the ONE dialog
   * that uses different action keys (`stay` / `discard`), because it asks a
   * different question than confirm/cancel.
   */
  async discardChanges(): Promise<void> {
    await this.action('discard').click();
    await this.waitForHidden();
  }

  /** Keeps editing on the drawer-close guard. */
  async keepEditing(): Promise<void> {
    await this.action('stay').click();
    await this.waitForHidden();
  }

  /**
   * Whether the drawer-close guard came up, WAITING for it to appear.
   *
   * `isVisible()` is wrong here and was the bug: it reports the state at the
   * instant it is called and ignores its timeout, so asking right after the
   * drawer's close button is clicked answers "no" while the guard is still
   * animating in. The caller then skipped the discard, the guard stayed on
   * screen, and the drawer never closed - which failed the two tests that close
   * a dirty form, ~1 minute each, with a misleading "drawer still visible".
   *
   * A dirty form is the only case that raises this, so a genuine "no guard"
   * answer costs one short timeout.
   */
  async isDiscardPromptVisible(): Promise<boolean> {
    return this.action('discard')
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }
}
