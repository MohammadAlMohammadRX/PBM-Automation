import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { PAYER_INACTIVATE_DIALOG, buttonSelector } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * The Inactivate Payer drawer.
 *
 * A component of its own because inactivation does NOT use the application's
 * shared confirmation dialog, contrary to what ConfirmDialog's own notes claim
 * about every confirmation in the app. Verified live: the row action opens
 * `payer-inactivate-dialog`, a right-hand drawer with its own reason select,
 * details field, impact summary and cancel/confirm buttons. `#pbm-dialog` never
 * renders for it, so driving this through ConfirmDialog waits out a full
 * timeout on a dialog that is not coming - which is exactly how the
 * status-transition test failed before this existed.
 *
 * Scope note: this covers only what the cross-module story needs - stage an
 * inactivation so the payer's status can change. The impact preview and the
 * reason/details validation are their own user stories, and their assertions
 * belong with them, not here.
 */
export class PayerInactivateDialog {
  constructor(private readonly page: Page) {}

  private root(): Locator {
    return this.page.locator(`#${PAYER_INACTIVATE_DIALOG.root}`);
  }

  /**
   * The drawer's TITLE is the readiness signal, not its root.
   *
   * Same trap as the version drawer: the host is a `p-drawer` wrapper that can
   * report no box of its own, while the panel it renders is a child. The title
   * appears exactly when the drawer does.
   */
  private title(): Locator {
    return this.page.locator(`#${PAYER_INACTIVATE_DIALOG.title}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.title()).toBeVisible({ timeout: Timeouts.default });
  }

  /** The impact preview the drawer shows before the change is staged. */
  impactSummary(): Locator {
    return this.page.locator(`#${PAYER_INACTIVATE_DIALOG.impactSummary}`);
  }

  /**
   * The drawer's warning paragraph - the sentence that explains the cascade.
   *
   * Read as text rather than asserted here: the cascade story checks three
   * separate claims inside one paragraph (the cascade, the restoration, the
   * draft caveat), and a case that fails should be able to show what the
   * paragraph actually said.
   */
  async getWarningText(): Promise<string> {
    await this.waitForOpen();
    const warning = this.page.locator(`#${PAYER_INACTIVATE_DIALOG.warning}`);
    await expect(warning, 'the drawer should explain what inactivation does').toBeVisible({
      timeout: Timeouts.default,
    });
    return (await warning.innerText()).trim();
  }

  /**
   * The impact preview, once it has finished counting.
   *
   * The drawer renders "Checking impact..." first and replaces it with the
   * counts a moment later, so reading immediately returns the placeholder -
   * which is indistinguishable from a payer that genuinely has nothing to
   * cascade. This waits for the placeholder to go.
   */
  async getImpactSummaryText(): Promise<string> {
    await this.waitForOpen();
    const summary = this.impactSummary();
    await expect(summary, 'the drawer should preview the impact').toBeVisible({
      timeout: Timeouts.default,
    });
    await expect
      .poll(async () => (await summary.innerText()).trim(), {
        timeout: Timeouts.default,
        message: 'the impact preview should finish counting rather than stay on its placeholder',
      })
      .toMatch(/\d/);
    return (await summary.innerText()).trim();
  }

  /**
   * Picks the first inactivation reason offered.
   *
   * The reason is a required GATE here rather than the thing under test, and
   * the options come from the configurable `payerInactivationReason` lookup -
   * which an administrator can rename or reorder at any time. Naming one would
   * make this fail for a reason unrelated to what it checks.
   */
  async selectFirstReason(): Promise<void> {
    const select = this.page.locator(`#${PAYER_INACTIVATE_DIALOG.reasonSelect}`);
    if ((await select.count()) === 0) return;
    await select.click();
    const option = this.page.getByRole('option').filter({ visible: true }).first();
    await expect(option).toBeVisible({ timeout: Timeouts.default });
    await option.click();
  }

  /** Fills the free-text details field, when the drawer offers one. */
  async fillDetails(text: string): Promise<void> {
    const input = this.page.locator(`#${PAYER_INACTIVATE_DIALOG.detailsInput}`);
    if ((await input.count()) === 0) return;
    await input.fill(text);
  }

  /**
   * Confirms the inactivation.
   *
   * This only STAGES the change - inactivation is maker-checker like every
   * other payer edit, so the payer keeps its current status until a checker
   * approves. A caller that needs the status to actually move must send the
   * record for approval and have it approved.
   */
  async confirm(): Promise<void> {
    Logger.step('Confirming the payer inactivation');
    await this.page.locator(buttonSelector(PAYER_INACTIVATE_DIALOG.confirm)).first().click();
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(PAYER_INACTIVATE_DIALOG.cancel)).first().click();
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  // ---- Guardrail and validation surface -------------------------------------
  //
  // Everything below exists for the activation/inactivation guardrail story,
  // which asks harder questions of this drawer than "stage a change": what the
  // reason list offers, whether Confirm is gated, what the details field caps
  // at, and what happens when Confirm is pressed with no reason. The staging
  // helper above deliberately stays free of those assertions.

  /** Whether the drawer is on screen right now, without waiting for it. */
  async isOpen(): Promise<boolean> {
    return this.title()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /** Asserts the drawer is still open - the "confirm was blocked" check. */
  async expectStillOpen(): Promise<void> {
    await expect(
      this.title(),
      'the inactivation drawer should still be open',
    ).toBeVisible({ timeout: Timeouts.short });
  }

  private confirmButton(): Locator {
    return this.page.locator(buttonSelector(PAYER_INACTIVATE_DIALOG.confirm)).first();
  }

  private detailsField(): Locator {
    return this.page.locator(`#${PAYER_INACTIVATE_DIALOG.detailsInput}`);
  }

  private reasonControl(): Locator {
    return this.page.locator(`#${PAYER_INACTIVATE_DIALOG.reasonSelect}`);
  }

  /**
   * Asserts the drawer offers both inputs the story names: a reason dropdown
   * and a details field.
   *
   * Also asserts the reason control is a DROPDOWN rather than a free-text box,
   * which is the mechanism that keeps an unmanaged reason from being entered
   * through the UI at all.
   */
  async expectReasonAndDetailsOffered(): Promise<void> {
    await this.waitForOpen();
    await expect(
      this.reasonControl(),
      'the drawer should offer a reason dropdown',
    ).toBeVisible({ timeout: Timeouts.default });
    await expect(
      this.detailsField(),
      'the drawer should offer a details field',
    ).toBeVisible({ timeout: Timeouts.default });
    // A `p-select` renders a div, not an input. If this were a text box the
    // managed list would not be the only way in.
    const tag = await this.reasonControl().evaluate((element) => element.tagName.toLowerCase());
    expect(tag, 'the reason control should not be a free-text input').not.toBe('input');
  }

  /** Every reason the managed list currently offers, in the order shown. */
  async getReasonOptions(): Promise<string[]> {
    await this.reasonControl().click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    const labels = (await options.allInnerTexts()).map((text) => text.trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  /** Picks a reason by its exact label. */
  async selectReason(reason: string): Promise<void> {
    await this.reasonControl().click();
    const option = this.page.getByRole('option', { name: reason, exact: true }).first();
    await expect(option, `the reason "${reason}" should be offered`).toBeVisible({
      timeout: Timeouts.default,
    });
    await option.click();
  }

  async expectConfirmDisabled(): Promise<void> {
    await expect(
      this.confirmButton(),
      'Confirm should be gated until the drawer has what it needs',
    ).toBeDisabled({ timeout: Timeouts.default });
  }

  async expectConfirmEnabled(): Promise<void> {
    await expect(
      this.confirmButton(),
      'Confirm should become available once a reason is chosen',
    ).toBeEnabled({ timeout: Timeouts.default });
  }

  /**
   * Types into the details field and returns what the field KEPT.
   *
   * Returns rather than asserts because the two length cases want opposite
   * things from the same action: exactly 500 must survive intact, and 501 must
   * not. The field carries `maxlength="500"`, so over-long text is truncated on
   * entry - which is why the caller reads the length back instead of trusting
   * what it typed.
   */
  async enterDetails(text: string): Promise<string> {
    await this.detailsField().fill(text);
    return this.detailsField().inputValue();
  }

  /** The details field's own cap, as the application declares it. */
  async getDetailsMaxLength(): Promise<number> {
    const value = await this.detailsField().getAttribute('maxlength');
    return value === null ? Number.NaN : Number(value);
  }

  /**
   * Every validation message the drawer is showing, in DOM order.
   *
   * Read across all of the drawer's `-error` elements rather than one named
   * field: the drawer is small, and a case that asks 'was the user told
   * anything at all?' should not have to guess which element the application
   * chose to put the answer in.
   */
  async getValidationMessages(): Promise<string[]> {
    const texts = await this.page
      .locator(`[id^="${PAYER_INACTIVATE_DIALOG.root}"][id$="-error"]`)
      .allInnerTexts();
    return texts.map((text) => text.trim()).filter((text) => text.length > 0);
  }

  /** Asserts the details field shows no validation error - the empty-is-fine check. */
  async expectNoDetailsError(): Promise<void> {
    expect(
      await this.getValidationMessages(),
      'an empty details field should raise no validation error',
    ).toEqual([]);
  }

  /**
   * Presses Confirm even when the button is gated, and reports whether the
   * drawer stayed open.
   *
   * `force` is deliberate: the case exists to prove the confirm is REFUSED, and
   * a disabled button is one legitimate way to refuse it. Without `force`
   * Playwright would wait out the actionability timeout and fail with "element
   * is not enabled", which reads like a broken locator and hides the fact that
   * the guardrail worked.
   */
  async attemptConfirm(): Promise<{ wasGated: boolean; stillOpen: boolean }> {
    const wasGated = await this.confirmButton().isDisabled();
    await this.confirmButton().scrollIntoViewIfNeeded();
    await this.confirmButton().click({ force: true });
    return { wasGated, stillOpen: await this.isOpen() };
  }

  /** The required-reason message, or an empty string when none is shown. */
  async getReasonError(): Promise<string> {
    return this.page
      .locator(`#${PAYER_INACTIVATE_DIALOG.reasonError}`)
      .innerText()
      .then((text) => text.trim())
      .catch(() => '');
  }

  /**
   * Clicks Confirm several times as fast as the browser will dispatch them.
   *
   * The duplicate-submission case. Clicks are fired without awaiting the
   * drawer's reaction, because awaiting between them is precisely the pause
   * that lets the application disable the button and makes the test pass
   * without ever exercising the race.
   */
  async confirmRepeatedly(times: number): Promise<void> {
    Logger.step(`Clicking Confirm ${times} times in rapid succession`);
    const button = this.confirmButton();
    await button.scrollIntoViewIfNeeded();
    await Promise.all(
      Array.from({ length: times }, () => button.click({ force: true, noWaitAfter: true })),
    );
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  /**
   * The whole staging flow: reason, details, confirm.
   *
   * Kept here rather than in the spec so the test reads as one intent, and so
   * the next story that needs to inactivate a payer reuses this instead of
   * re-deriving the drawer's requirements.
   */
  async inactivateWithFirstReason(details = 'Staged by automated test'): Promise<void> {
    await this.waitForOpen();
    await this.selectFirstReason();
    await this.fillDetails(details);
    await this.confirm();
  }
}
