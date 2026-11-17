import { test, expect } from '../../../fixtures';
import { CASES, CURRENCY_AS_CASE, RATE_MESSAGE, SAVED_TOAST } from '../../../data/settings/editCurrencySettings.data';
import { upsertSettings } from '../../../utils/settings/systemSettingsApi';
import {
  clearRateLikeAUser,
  currencyOptions,
  currencySectionShown,
  decimalsOf,
  describeOutcome,
  messageShown,
  normText,
  rateFlaggedRequired,
  rateShown,
  saveBlocked,
  sentRate,
} from '../../../utils/settings/writerCHelpers';

/**
 * User story 20867: Edit Currency Settings - the rate and currency values the
 * screen and the server must refuse (-1, 0, empty, five decimals, EUR) and the
 * smallest rate they must accept (0.0001). "Nothing saved" is read back from
 * the server (`settingsGuard.current()`). The foundation saw a typed 0 sent as
 * 0.0001 - when the box clamps a refused value and Save stores it, the case
 * FAILS with what was sent, and `settingsGuard` puts the rate back.
 */
test.describe('US 20867 - Edit Currency Settings', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  for (const d of [CASES.negativeRate, CASES.zeroRate]) {
    test(`TC-${d.azureId}: should refuse the rate with "${RATE_MESSAGE}" and save nothing when ${d.rate} is entered`, async ({ page, steps, settingsGuard, settingsHub }) => {
      await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the exchange rate', async () => {
        await settingsHub.open();
        expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
      });

      await steps.critical('Open the Currency Settings panel - the panel loads', async () => {
        await settingsHub.openEdit();
        await expect(settingsHub.control('rateInput'), 'the Exchange rate field').toBeVisible();
      });

      await steps.step(`Enter ${d.rate} in the Exchange rate field and select Save - the save is blocked and "${RATE_MESSAGE}" is shown`, async () => {
        await settingsHub.setRate(d.rate);
        const typed = await rateShown(settingsHub);
        const outcome = await settingsHub.saveAndCapture();
        const stored = (await settingsGuard.current())['Currency.UsdToSarRate'];
        expect({ blocked: saveBlocked(outcome), message: await messageShown(page, outcome, RATE_MESSAGE), stored }, `box read "${typed}"; ${describeOutcome(outcome)}`)
          .toEqual({ blocked: true, message: true, stored: settingsGuard.original['Currency.UsdToSarRate'] });
      });
    });
  }

  test(`TC-${CASES.smallestRate.azureId}: should save the rate when the smallest valid value ${CASES.smallestRate.rate} is entered`, async ({ steps, settingsGuard, settingsHub }) => {
    const d = CASES.smallestRate;

    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the panel loads', async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('rateInput'), 'the Exchange rate field').toBeVisible();
    });

    await steps.step(`Enter ${d.rate} in the Exchange rate field and select Save - the value is accepted and "${SAVED_TOAST}" is shown`, async () => {
      await settingsHub.setRate(d.rate);
      const outcome = await settingsHub.saveAndCapture();
      expect({ status: outcome.status, toast: outcome.toast.includes(SAVED_TOAST), sent: sentRate(outcome) === null ? null : Number(sentRate(outcome)) }, describeOutcome(outcome))
        .toEqual({ status: 200, toast: true, sent: Number(d.rate) });
      expect(Number((await settingsGuard.current())['Currency.UsdToSarRate']), 'the stored rate').toBe(Number(d.rate));
    });
  });

  test(`TC-${CASES.otherCurrencyRefused.azureId}: should refuse "${CASES.otherCurrencyRefused.message}" when a currency other than SAR or USD is submitted`, async ({ page, steps, settingsGuard, settingsHub }) => {
    const d = CASES.otherCurrencyRefused;

    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the currency selection control', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.step('Open the Currency Settings panel - the panel loads and the Currency select offers only SAR and USD', async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('currencySelect'), 'the Currency field').toBeVisible();
      expect(await currencyOptions(settingsHub, page), 'the Currency options').toEqual([normText(CURRENCY_AS_CASE.SAR), normText(CURRENCY_AS_CASE.USD)]);
    });

    await steps.step(`Submit a currency value of "${d.code}" outside the SAR/USD options and select Save - the save is blocked and "${d.message}" is shown`, async () => {
      // The screen offers no EUR, so the value goes to the server as a save would send it.
      const answer = await upsertSettings(page, [{ key: d.key, value: d.code }]);
      const stored = (await settingsGuard.current())['Currency.Code'];
      expect({ refused: answer.status >= 400, message: answer.errors.some((e) => e.endsWith(d.message)), stored }, `server answered ${answer.status}: ${answer.errors.join('; ') || answer.text.slice(0, 200)}`)
        .toEqual({ refused: true, message: true, stored: settingsGuard.original['Currency.Code'] });
    });
  });

  test(`TC-${CASES.emptyRate.azureId}: should block the save and flag the field as required when the exchange rate is empty`, async ({ page, steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the panel loads', async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('rateInput'), 'the Exchange rate field').toBeVisible();
    });

    await steps.step('Clear the Exchange rate field and select Save - the save is blocked and the field is flagged as required', async () => {
      const left = await clearRateLikeAUser(settingsHub, page);
      expect(left, 'the Exchange rate field after select-all + Delete').toBe('');
      const outcome = await settingsHub.saveAndCapture();
      const required = await rateFlaggedRequired(settingsHub, page, outcome);
      const stored = (await settingsGuard.current())['Currency.UsdToSarRate'];
      expect({ blocked: saveBlocked(outcome), flagged: required.flagged, stored }, `${required.detail}; ${describeOutcome(outcome)}`)
        .toEqual({ blocked: true, flagged: true, stored: settingsGuard.original['Currency.UsdToSarRate'] });
    });
  });

  test(`TC-${CASES.fiveDecimals.azureId}: should not accept the rate as entered when it has more than four decimal places`, async ({ steps, settingsGuard, settingsHub }) => {
    const d = CASES.fiveDecimals;

    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the panel loads', async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('rateInput'), 'the Exchange rate field').toBeVisible();
    });

    await steps.step(`Enter ${d.rate} in the Exchange rate field and select Save - the field rejects the extra decimal places or rounds the value to four decimals before saving`, async () => {
      await settingsHub.setRate(d.rate);
      const typed = await rateShown(settingsHub);
      const outcome = await settingsHub.saveAndCapture();
      const sent = sentRate(outcome);
      const stored = (await settingsGuard.current())['Currency.UsdToSarRate'];
      expect({ sentWithin: decimalsOf(sent ?? '') <= d.maxDecimals, storedWithin: decimalsOf(stored) <= d.maxDecimals, storedAsEntered: stored === d.rate }, `box read "${typed}"; stored "${stored}"; ${describeOutcome(outcome)}`)
        .toEqual({ sentWithin: true, storedWithin: true, storedAsEntered: false });
    });
  });
});
