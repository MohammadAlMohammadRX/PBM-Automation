import { test, expect } from '../../../fixtures';
import {
  ACKNOWLEDGEMENT,
  AFFECTED_SCREENS,
  CASES,
  CURRENCY_AS_CASE,
  CURRENCY_CODE,
  CURRENCY_OPTION,
  SAVED_TOAST,
  usdPreconditionReason,
} from '../../../data/settings/editCurrencySettings.data';
import {
  asDialogLine,
  blockUnless,
  cancelConfirmation,
  confirmButton,
  confirmationFacts,
  currencySectionShown,
  currencyShown,
  describeOutcome,
  dialogText,
  isExample,
  normText,
  rateNamedIn,
  rateShown,
  tickAcknowledgement,
  tryConfirmUnticked,
} from '../../../utils/settings/writerCHelpers';

/**
 * User story 20867: Edit Currency Settings - when the confirmation opens and
 * what it says. 21028 saves a rate while SAR is in use (no confirmation; the
 * guard puts the rate back). 21030 sets USD through the API first (the
 * precondition "USD in use") and presses Cancel. Every other case presses
 * Cancel in the confirmation - nothing switches the currency through the
 * drawer here. `settingsGuard` restores and reads back at teardown.
 */
test.describe('US 20867 - Edit Currency Settings', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test(`TC-${CASES.rateWithoutConfirmation.azureId}: should save a new rate without a confirmation when SAR is in use`, async ({ steps, settingsGuard, settingsHub }) => {
    const d = CASES.rateWithoutConfirmation;

    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the selected currency and the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the panel shows Currency as SAR', async () => {
      await settingsHub.openEdit();
      await expect.poll(() => currencyShown(settingsHub), { message: 'the Currency field' }).toBe(normText(CURRENCY_AS_CASE.SAR));
    });

    await steps.step(`Change the Exchange rate field to ${d.rate} - the field accepts the new value`, async () => {
      await settingsHub.setRate(d.rate);
      expect(Number(await rateShown(settingsHub)), 'the Exchange rate field').toBe(Number(d.rate));
    });

    await steps.step(`Select Save - "${SAVED_TOAST}" is shown immediately with no confirmation dialog`, async () => {
      const outcome = await settingsHub.saveAndCapture();
      expect({ confirmation: outcome.confirmationOpened, status: outcome.status, toast: outcome.toast.includes(SAVED_TOAST) }, describeOutcome(outcome))
        .toEqual({ confirmation: false, status: 200, toast: true });
      expect(Number((await settingsGuard.current())['Currency.UsdToSarRate']), 'the stored rate').toBe(Number(d.rate));
    });
  });

  test(`TC-${CASES.confirmSwitchToUsd.azureId}: should ask for confirmation when the currency is switched to USD`, async ({ steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the selected currency and the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the panel shows Currency as SAR', async () => {
      await settingsHub.openEdit();
      await expect.poll(() => currencyShown(settingsHub), { message: 'the Currency field' }).toBe(normText(CURRENCY_AS_CASE.SAR));
    });

    await steps.critical(`Change the Currency drop-down to "${CURRENCY_AS_CASE.USD}" - USD is selected in the drop-down`, async () => {
      await settingsHub.pick('currencySelect', CURRENCY_OPTION.USD);
      await expect.poll(() => currencyShown(settingsHub), { message: 'the Currency field' }).toBe(normText(CURRENCY_AS_CASE.USD));
    });

    await steps.step('Select Save - a confirmation dialog opens naming the new currency and rate, with an example and the list of affected screens', async () => {
      const rate = Number(await rateShown(settingsHub));
      const outcome = await settingsHub.saveAndCapture();
      expect({ confirmation: outcome.confirmationOpened, request: outcome.status }, describeOutcome(outcome)).toEqual({ confirmation: true, request: null });
      const facts = await confirmationFacts(settingsHub);
      expect({ namesUsd: facts.message.includes('USD'), rate: rateNamedIn(facts.message), example: isExample(facts.example), screens: facts.screens.length }, `the confirmation: ${JSON.stringify(facts)}`)
        .toEqual({ namesUsd: true, rate, example: true, screens: AFFECTED_SCREENS.length });
      expect((await settingsGuard.current())['Currency.Code'], 'the stored currency while the confirmation is open').toBe(settingsGuard.original['Currency.Code']);
    });
    await cancelConfirmation(settingsHub);
  });

  test(`TC-${CASES.confirmRateWhileUsd.azureId}: should ask for confirmation when the rate is changed while USD is in use`, async ({ steps, settingsGuard, settingsHub }) => {
    const d = CASES.confirmRateWhileUsd;
    const set = await settingsGuard.set({ 'Currency.Code': CURRENCY_CODE.USD });
    blockUnless(steps, set.status < 300, usdPreconditionReason(set.status, set.errors.join('; ') || set.text));

    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the selected currency and the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the panel shows Currency as USD', async () => {
      await settingsHub.openEdit();
      await expect.poll(() => currencyShown(settingsHub), { message: 'the Currency field' }).toBe(normText(CURRENCY_AS_CASE.USD));
    });

    await steps.step(`Change the Exchange rate field to ${d.rate} - the field accepts the new value`, async () => {
      await settingsHub.setRate(d.rate);
      expect(Number(await rateShown(settingsHub)), 'the Exchange rate field').toBe(Number(d.rate));
    });

    await steps.step('Select Save - a confirmation dialog opens naming the new rate, with an example and the list of affected screens', async () => {
      const outcome = await settingsHub.saveAndCapture();
      expect({ confirmation: outcome.confirmationOpened, request: outcome.status }, describeOutcome(outcome)).toEqual({ confirmation: true, request: null });
      const facts = await confirmationFacts(settingsHub);
      expect({ rate: rateNamedIn(facts.message), example: isExample(facts.example), screens: facts.screens.length }, `the confirmation: ${JSON.stringify(facts)}`)
        .toEqual({ rate: Number(d.rate), example: true, screens: AFFECTED_SCREENS.length });
    });
    await cancelConfirmation(settingsHub);
  });

  test(`TC-${CASES.acknowledgeGatesConfirm.azureId}: should keep Change currency disabled when the acknowledgement is not ticked`, async ({ page, steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the selected currency and the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel and trigger the confirmation dialog by changing Currency to USD - the dialog opens with the Change currency button', async () => {
      await settingsHub.openEdit();
      await settingsHub.pick('currencySelect', CURRENCY_OPTION.USD);
      const outcome = await settingsHub.saveAndCapture();
      expect(outcome.confirmationOpened, describeOutcome(outcome)).toBe(true);
      await expect(confirmButton(settingsHub), 'the Change currency button').toBeVisible();
    });

    await steps.step(`Leave the checkbox "${ACKNOWLEDGEMENT}" unticked and try to select Change currency - the button stays disabled and the change is not applied`, async () => {
      expect(await dialogText(page), 'the acknowledgement offered').toContain(normText(ACKNOWLEDGEMENT));
      await expect(settingsHub.dialog('acknowledge'), 'the acknowledgement checkbox').not.toBeChecked();
      await expect(confirmButton(settingsHub), 'Change currency with the box unticked').toBeDisabled();
      const tried = await tryConfirmUnticked(settingsHub, page);
      expect({ ...tried, stored: (await settingsGuard.current())['Currency.Code'] }, 'after trying Change currency')
        .toEqual({ requestSent: false, dialogOpen: true, stored: settingsGuard.original['Currency.Code'] });
    });

    await steps.step('Tick the checkbox - the Change currency button becomes enabled', async () => {
      await tickAcknowledgement(settingsHub);
      await expect(settingsHub.dialog('acknowledge'), 'the acknowledgement checkbox').toBeChecked();
      await expect(confirmButton(settingsHub), 'Change currency with the box ticked').toBeEnabled();
    });
    await cancelConfirmation(settingsHub);
  });

  test(`TC-${CASES.affectedScreens.azureId}: should list every affected screen when the currency change confirmation opens`, async ({ steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the selected currency and the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel and change Currency to USD - the confirmation dialog opens', async () => {
      await settingsHub.openEdit();
      await settingsHub.pick('currencySelect', CURRENCY_OPTION.USD);
      const outcome = await settingsHub.saveAndCapture();
      expect(outcome.confirmationOpened, describeOutcome(outcome)).toBe(true);
    });

    await steps.step('Review the list of affected screens shown in the dialog - the five affected-screen categories are listed exactly as specified', async () => {
      const facts = await confirmationFacts(settingsHub);
      expect(facts.screens, 'the affected screens (dashes normalised, the case\'s parentheses read as the dialog\'s separator)').toEqual(AFFECTED_SCREENS.map(asDialogLine));
      expect((await settingsGuard.current())['Currency.Code'], 'the stored currency while the confirmation is open').toBe(settingsGuard.original['Currency.Code']);
    });
    await cancelConfirmation(settingsHub);
  });

  test(`TC-${CASES.cancelSavesNothing.azureId}: should save nothing and keep the panel open when the confirmation is cancelled`, async ({ steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the selected currency and the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel and change Currency to USD - the confirmation dialog opens', async () => {
      await settingsHub.openEdit();
      await settingsHub.pick('currencySelect', CURRENCY_OPTION.USD);
      const outcome = await settingsHub.saveAndCapture();
      expect(outcome.confirmationOpened, describeOutcome(outcome)).toBe(true);
    });

    await steps.critical('Select Cancel in the confirmation dialog - the dialog closes and the panel stays open', async () => {
      expect(await cancelConfirmation(settingsHub), 'after Cancel').toEqual({ dialogClosed: true, drawerOpen: true });
    });

    await steps.step(`Observe the Currency field - it still shows the original value (SAR) and no "${SAVED_TOAST}" message appears`, async () => {
      const toast = await settingsHub.readToast(2_000);
      expect({ field: await currencyShown(settingsHub), savedToast: toast.includes(SAVED_TOAST), stored: (await settingsGuard.current())['Currency.Code'] }, `after Cancel (toast "${toast}")`)
        .toEqual({ field: normText(CURRENCY_AS_CASE.SAR), savedToast: false, stored: settingsGuard.original['Currency.Code'] });
    });
  });
});
