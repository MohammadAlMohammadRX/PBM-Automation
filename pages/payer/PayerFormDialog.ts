import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { EntityWizardDialog } from '../components/EntityWizardDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Timeouts } from '../../constants/Timeouts';
import { PAYER_FORM_FIELD, PAYER_FORM_STEPS, SCREEN } from '../../constants/ElementIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Logger } from '../../utils/Logger';
import { NetworkUtils } from '../../utils/NetworkUtils';
import {
  CITY_AR,
  CONTACT_METHOD_AR,
  LANGUAGE_AR,
  PAYER_TYPE_AR,
  type PayerData,
} from '../../data/payers/payerTypes';
import { PAYER_NAME_AR_LABEL } from '../../data/payers/payer.data';

/** A named field-filling action, so steps can be filled with one field omitted. */
type FieldFillers = Record<string, () => Promise<void>>;

/** The wizard's steps, in order. */
export const WIZARD_STEPS = PAYER_FORM_STEPS;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * The multi-step "Add New Payer" / "Edit Payer" side-panel wizard.
 *
 * Every locator comes from the `payer-form-drawer` id namespace (see
 * PAYER_FORM_FIELD for the label -> id map). Steps: Basic Information ->
 * Contact Information -> Effective Period; the final action is "Save" (Send for
 * Approval is a separate list-row action).
 *
 * The drawer and all of its select panels and date-picker calendars are
 * portalled to <body>, outside the payer list, so everything is queried from
 * the document root.
 */
export class PayerFormDialog extends EntityWizardDialog {
  constructor(page: Page) {
    super(page, SCREEN.payerForm, PAYER_FORM_FIELD);
  }

  /**
   * Waits until an EDIT drawer has actually been filled with the record.
   *
   * The drawer mounts with empty inputs and is patched when the payer's data
   * arrives, so `waitForOpen()` - which waits for the title - returns while
   * every field is still blank. A case that then read a field got '' and
   * reported the form as not pre-populated, failing in 0.2 seconds against a
   * form that populated correctly a moment later.
   *
   * Payer Name is the signal because every payer has one; it is also the first
   * step's first field, so it is present whichever step the drawer opens on.
   */
  async waitForPopulated(): Promise<void> {
    await expect(
      this.field('Payer Name'),
      'the edit drawer should be populated with the record it opened',
    ).not.toHaveValue('', { timeout: Timeouts.default });
  }

  /**
   * Reads a field's value, reporting whether it could be read at all.
   *
   * For the question "did the refused save keep the user's typing?", which has
   * three answers and not two: the value is there, the value is gone, or the
   * field cannot be reached. VERIFIED that the third is what actually happens
   * after a 409 - the drawer stays open, but the wizard's steps stop responding
   * and the edited field never becomes readable, so a plain read spends its
   * full 15-second budget and fails the step with "locator.inputValue: Timeout"
   * instead of reporting what the user is left looking at.
   *
   * A case calling this can therefore state the finding: the edit is neither
   * kept nor discarded - it is stranded in a drawer that no longer works.
   */
  async readFieldIfReachable(
    label: string,
  ): Promise<{ reachable: boolean; value: string; reason: string }> {
    try {
      const value = await this.getFieldValue(label);
      return { reachable: true, value, reason: '' };
    } catch (error) {
      return {
        reachable: false,
        value: '',
        reason: (error instanceof Error ? error.message : String(error)).split('\n')[0],
      };
    }
  }

  // ---- Per-step field fillers (single source of truth, keyed by label) ------

  private basicFillers(data: PayerData): FieldFillers {
    return {
      'Payer Name': () => this.fillTextField('Payer Name', data.nameEn),
      [PAYER_NAME_AR_LABEL]: () => this.fillTextField(PAYER_NAME_AR_LABEL, data.nameAr),
      'Payer Type': () => this.selectDropdownOption('Payer Type', data.type),
    };
  }

  private contactFillers(data: PayerData): FieldFillers {
    return {
      'Email Address': () => this.fillTextField('Email Address', data.email),
      // The +966 dial code is its own select, left at its default, so this field
      // takes only the subscriber number.
      'Phone Number': () => this.fillTextField('Phone Number', data.phone),
      'License Number': () => this.fillTextField('License Number', data.licenseNumber),
      // Country is NOT filled: it is a new field on this step and it arrives
      // preset to "Saudi Arabia", so the wizard advances without it. Setting it
      // from test data belongs with the rest of the business-change work.
      City: () => this.selectDropdownOption('City', data.city),
    };
  }

  private async runFillers(fillers: FieldFillers, exceptLabel?: string): Promise<void> {
    for (const [label, fill] of Object.entries(fillers)) {
      if (label !== exceptLabel) {
        await fill();
      }
    }
  }

  // ---- Step 1: Basic Information -------------------------------------------

  async fillBasicInformation(data: PayerData, exceptLabel?: string): Promise<void> {
    Logger.step('Filling Basic Information');
    await this.runFillers(this.basicFillers(data), exceptLabel);
  }

  // ---- Step 2: Contact Information ------------------------------------------

  /**
   * Fills step 1 using the option text the ARABIC interface renders.
   *
   * `fillBasicInformation` cannot be reused for this. The field IDS are the same
   * in both languages - which is what makes almost every locator in this
   * framework language-independent - but the dropdown's OPTION TEXT is
   * translated, so asking for "Private" in the Arabic form waits out a full
   * action timeout on an option that is not there. That is exactly how the
   * bilingual validation-message check first failed, on a form that was working
   * perfectly.
   *
   * Only step 1 needs this: it is the only step whose options a test has to name
   * before the field under test becomes reachable.
   */
  async fillBasicInformationInArabic(data: PayerData): Promise<void> {
    Logger.step('Filling Basic Information (Arabic interface)');
    await this.fillTextField('Payer Name', data.nameEn);
    await this.fillTextField(PAYER_NAME_AR_LABEL, data.nameAr);
    await this.selectDropdownOption('Payer Type', PAYER_TYPE_AR[data.type]);
  }

  /**
   * Fills step 2 using the option text the ARABIC interface renders.
   *
   * The counterpart to `fillBasicInformationInArabic`, and needed for the same
   * reason: City, Preferred Language and Preferred Contact Method all translate
   * their options, so the English values would each wait out an action timeout.
   * Country is left at its default - the application pre-selects Saudi Arabia,
   * and changing it re-scopes the City list, which would invalidate the city
   * chosen here.
   */
  async fillContactInformationInArabic(data: PayerData): Promise<void> {
    Logger.step('Filling Contact Information (Arabic interface)');
    await this.fillTextField('Email Address', data.email);
    await this.fillTextField('Phone Number', data.phone);
    await this.fillTextField('License Number', data.licenseNumber);
    // Country is left at its preset value here for the same reason as in the
    // English filler above.
    await this.selectDropdownOption('City', CITY_AR[data.city]);
  }

  /** Creates a payer end to end through the ARABIC interface. */
  async createPayerInArabic(data: PayerData): Promise<void> {
    await this.waitForOpen();
    await this.fillBasicInformationInArabic(data);
    await this.clickNext();
    await this.fillContactInformationInArabic(data);
    await this.clickNext();
    await this.fillEffectivePeriod(data);
    await this.save();
  }

  async fillContactInformation(data: PayerData, exceptLabel?: string): Promise<void> {
    Logger.step('Filling Contact Information');
    await this.runFillers(this.contactFillers(data), exceptLabel);
  }

  // ---- Step 3: Effective Period --------------------------------------------

  /**
   * Fills the effective period. Opening one PrimeNG datepicker can clear its
   * sibling, so both dates are written twice - unconditionally, because the
   * first field's text still reads correctly after its model has been reset, so
   * a display-only check would wrongly skip the second pass and leave the form
   * invalid.
   */
  async fillEffectivePeriod(data: PayerData, exceptLabel?: string): Promise<void> {
    Logger.step('Filling Effective Period');
    const targets = [
      { label: 'Effective Date', value: data.effectiveDate },
      { label: 'Expiry Date', value: data.expiryDate },
    ].filter((target) => target.label !== exceptLabel);

    for (const target of targets) {
      await this.fillDateField(target.label, target.value);
    }
    for (const target of targets) {
      await this.fillDateField(target.label, target.value);
    }
  }

  // ---- Submission / validation ---------------------------------------------

  /** Clicks the final "Save" action (persists the payer as a private Draft). */
  async save(): Promise<void> {
    await this.clickSubmit('Save');
  }

  /**
   * The dial code shown beside the subscriber number.
   *
   * Its own control rather than part of the Phone Number field, which is why it
   * is read separately - and why the creation-validation story can find it
   * pre-selected as `+966` while the sheet expects it blank.
   */
  async getDialCode(): Promise<string> {
    await this.goToStepContaining('Phone Number');
    const dialCode = this.page.locator(`#${SCREEN.payerForm}-dial-code-select`);
    await expect(dialCode).toBeVisible({ timeout: Timeouts.default });
    return (await dialCode.innerText()).trim();
  }

  private saveButton(): Locator {
    return this.submitButton();
  }

  /**
   * Waits for the wizard footer to finish rendering after a step transition.
   * Every step exposes exactly one of "Next" (steps 1-2) or "Save" (last step),
   * so waiting for either avoids racing the Angular step change.
   */
  private async waitForStepReady(): Promise<void> {
    await expect(this.saveButton().or(this.nextButton()).first()).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /** The 1-based stepper position of a step title. */
  private stepNumber(stepTitle: WizardStep): 1 | 2 | 3 {
    return (WIZARD_STEPS.indexOf(stepTitle) + 1) as 1 | 2 | 3;
  }

  /**
   * Jumps straight to a wizard step using its stepper bullet. In edit mode all
   * steps are already valid, so the stepper is navigable directly - far more
   * stable than chaining "Next" clicks through intermediate steps.
   */
  async goToStep(stepTitle: WizardStep): Promise<void> {
    Logger.step(`Jumping to wizard step "${stepTitle}"`);
    // Through the animation: the stepper rides the drawer panel, so a bullet is
    // unclickable while the panel is moving. See clickThroughAnimation.
    await this.clickThroughAnimation(
      this.stepBullet(this.stepNumber(stepTitle)),
      `the stepper bullet for "${stepTitle}"`,
    );
    await this.waitForStepReady();
  }

  /** The wizard step currently on screen. */
  async activeStepTitle(): Promise<string> {
    return (await this.stepLabel(await this.activeStepNumber()).innerText()).trim();
  }

  /** Asserts the wizard is still on the given step - i.e. it refused to advance. */
  async expectActiveStep(stepTitle: WizardStep): Promise<void> {
    await expect
      .poll(() => this.activeStepNumber(), { timeout: Timeouts.default })
      .toBe(this.stepNumber(stepTitle));
  }

  /**
   * Attempts to advance to the next step. Validation is enforced per field, so
   * an invalid or empty required field must keep the wizard on the same step.
   */
  async attemptNext(): Promise<void> {
    await this.waitForStepReady();
    if (await this.nextButton().isVisible().catch(() => false)) {
      await this.nextButton().click();
    }
  }

  /**
   * Navigates the wizard until the given field is on screen.
   *
   * The field map knows which step owns each field, so this jumps straight there
   * instead of walking every step looking for it. The jump occasionally does not
   * land while the app is under load, so it is retried.
   */
  async goToStepContaining(label: string): Promise<void> {
    const target = this.field(label);
    if (await target.isVisible().catch(() => false)) return;

    const step = WIZARD_STEPS[this.fieldSpec(label).step - 1];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.goToStep(step);
      if (await target.isVisible().catch(() => false)) return;
    }
    await expect(target).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Saves the wizard from wherever it currently is. "Save" only exists on the
   * final step, so the stepper is used to jump there directly.
   */
  /**
   * Attempts the save and reports whether the application sent anything.
   *
   * This replaced a getSaveAvailability() that read the Save button's
   * presence on the final step. That answer could not be trusted: jumping to
   * the last step from a read-only probe does not reliably move this wizard,
   * so an untouched form and a dirty one both came back "absent" - which
   * would have reported a working save as broken.
   *
   * What the callers actually want to know is whether a save HAPPENS, so that
   * is what this returns: null when no update request left the browser, and
   * the response when one did. A wizard that offers no Save, one whose Save is
   * disabled, and one that swallows the click are the same answer to "was
   * anything submitted" - which is the question the no-change stories ask.
   */
  async attemptSave(): Promise<{ status: number; body: unknown; text: string } | null> {
    return NetworkUtils.captureResponse(
      this.page,
      ApiEndpoints.payerUpdate,
      async () => {
        await this.saveFromAnyStep().catch(() => undefined);
      },
      Timeouts.short,
    );
  }

  /**
   * Clicks Save several times as fast as the browser will dispatch them.
   *
   * The duplicate-save case. The clicks are fired WITHOUT awaiting the
   * form's reaction, because awaiting between them is the pause that lets the
   * application disable the button - and a test that paused would pass without
   * ever exercising the race.
   */
  async saveRepeatedly(times: number): Promise<void> {
    if ((await this.saveButton().count()) === 0) {
      await this.goToStep('Effective Period');
    }
    await expect(this.saveButton()).toBeVisible({ timeout: Timeouts.default });
    Logger.step(`Clicking Save ${times} times in rapid succession`);
    await Promise.all(
      Array.from({ length: times }, () =>
        this.saveButton().click({ force: true, noWaitAfter: true }),
      ),
    );
  }

  /**
   * Confirms the withdrawal warning and leaves the drawer settled.
   *
   * Pressing Continue lets the save through, but the drawer does not
   * reliably close behind it - and while it is open the application treats
   * it as dirty, so the very next navigation is ABORTED by the
   * unsaved-changes guard (`net::ERR_ABORTED`). That failure surfaces one
   * step later as a broken goto, which points at the navigation instead of
   * at the drawer. So the drawer is closed here, discarding whatever the
   * form still holds: the save has already reached the server, and the
   * caller asserts the outcome on the record rather than in the form.
   */
  async confirmWithdrawal(): Promise<void> {
    await new ConfirmDialog(this.page).confirm('Continue');
    const closed = await this.waitForClosed()
      .then(() => true)
      .catch(() => false);
    if (!closed) {
      Logger.step('The drawer stayed open after the withdrawal - discarding it so navigation is not aborted'
      );
      await this.closeAndDiscard().catch(() => undefined);
    }
  }

  /**
   * Clicks Save and reports whether a confirmation dialog was raised.
   *
   * Editing a payer that is awaiting approval raises "Return this payer to
   * draft?" before saving; editing a draft does not. A caller that always
   * expected the dialog would hang on the draft path, and one that never
   * expected it would leave the dialog open - which then aborts the next
   * navigation, because the drawer is still dirty. So the answer is returned
   * and the caller decides.
   */
  async saveAndReportDialog(): Promise<boolean> {
    await this.saveFromAnyStep();
    return new ConfirmDialog(this.page).isVisible();
  }

  async saveFromAnyStep(): Promise<void> {
    // Save is rendered ONLY on the final step; steps 1 and 2 offer Next. Counted
    // rather than probed with isVisible(), which samples the current frame and
    // ignores its own timeout - so a Save button that simply had not rendered yet
    // read as "not on this step" and sent the wizard navigating needlessly.
    if ((await this.saveButton().count()) === 0) {
      await this.goToStep('Effective Period');
    }
    await expect(this.saveButton()).toBeVisible({ timeout: Timeouts.default });
    await this.saveButton().click();
  }

  /** Fills every step with valid data and saves - the create happy path. */
  async createPayer(data: PayerData): Promise<void> {
    await this.waitForOpen();
    await this.fillBasicInformation(data);
    await this.clickNext();
    await this.fillContactInformation(data);
    await this.clickNext();
    await this.fillEffectivePeriod(data);
    await this.save();
  }

  // ---- Concurrent-edit conflict detection ----------------------------------

  /**
   * Saves and reports what the server actually said.
   *
   * The concurrent-edit story cannot be tested through the interface alone, and
   * this is why: when a stale save is rejected the application shows NOTHING -
   * no toast, no inline error - and simply leaves the drawer open. That is
   * pixel-for-pixel what a save that never fired looks like, so a UI-only test
   * cannot distinguish "the record was protected" from "the click was lost" or
   * from "the write went through". Reading the response is the only way to make
   * the protection assertable.
   *
   * The message the user should have seen is asserted SEPARATELY, by
   * `expectConflictReported` - so the two halves of the story fail
   * independently and the report says which one broke.
   */
  async saveAndCaptureOutcome(): Promise<{ status: number; body: unknown; text: string } | null> {
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.payerUpdate, () =>
      this.saveFromAnyStep(),
    );
  }

  /**
   * Saves a NEW payer and reports what the server said.
   *
   * The create counterpart of `saveAndCaptureOutcome`, and a separate method
   * rather than a parameter because the two hit different endpoints -
   * CreatePayer against UpdatePayer - and a capture waiting on the wrong one
   * reports "no response" for a request that plainly happened.
   *
   * Needed for the same reason as the update version: a name over 255
   * characters is refused with 422 while the interface shows nothing, so the
   * response is the only evidence that the record was not created.
   */
  async saveNewAndCaptureOutcome(): Promise<
    { status: number; body: unknown; text: string } | null
  > {
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.payerCreate, () =>
      this.saveFromAnyStep(),
    );
  }

  /**
   * Asserts a captured save outcome is the CONCURRENCY conflict, not merely a 409.
   *
   * WHY THE STATUS ALONE IS NOT ENOUGH, learned the hard way. The application
   * answers 409 for more than one reason: a stale save gets "This payer has been
   * modified since it was loaded", and a duplicate email gets "Email '...' is
   * already taken". Three of these cases originally asserted only the status,
   * and when a hard-coded test address collided they went on passing - reporting
   * that concurrency was correctly detected on a save that had been refused for
   * something else entirely.
   *
   * Every conflict assertion in the story now goes through here, so the reason
   * cannot be forgotten at a single call site.
   */
  expectStaleSaveRejected(
    outcome: { status: number; text: string } | null,
    expected: { status: number; reason: string },
  ): void {
    expect(outcome, 'the stale save should have reached the server').not.toBeNull();
    expect(outcome!.status, `the save should be refused with ${expected.status}`).toBe(
      expected.status,
    );
    expect(
      outcome!.text,
      'the rejection should be the CONCURRENCY conflict. A 409 carrying any other reason - a '
        + 'duplicate email, say - means this case was refused for something other than the '
        + 'rule under test.',
    ).toContain(expected.reason);
  }

  /**
   * Asserts the user was told the record changed underneath them.
   *
   * Two moves on purpose, in this order: first that ANY message appeared, then
   * that it says the right thing. Today the first assertion is the one that
   * fails, which keeps the reported defect independent of the exact wording the
   * application might eventually use - see CONFLICT_MESSAGE_PATTERNS.
   */
  async expectConflictReported(pattern: RegExp): Promise<void> {
    // Waited for, not snapshotted. This assertion is the one that declares the
    // application silent, so it must not be able to fail because it looked too
    // early - see WaitUtils.settleMessages.
    const messages = await this.waitForVisibleMessages();
    expect(
      messages,
      'A rejected save must tell the user something - the application currently shows no '
        + 'toast, no inline error and no dialog, leaving the drawer open as though the click '
        + 'never landed.',
    ).not.toEqual([]);
    expect(
      messages.some((message) => pattern.test(message)),
      `One of the visible messages should say the record changed and ask for a refresh. `
        + `Saw: ${JSON.stringify(messages)}`,
    ).toBe(true);
  }
}
