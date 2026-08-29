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
    await expect(this.root()).toBeHidden({ timeout: Timeouts.default });
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
