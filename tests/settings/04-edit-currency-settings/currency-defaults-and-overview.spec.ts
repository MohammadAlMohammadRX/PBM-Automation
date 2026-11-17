import { test, expect } from '../../../fixtures';
import { CASES, LABEL, NEW_INSTALL_DEFAULTS } from '../../../data/settings/editCurrencySettings.data';
import { blockUnlessDefault, currencySectionShown, currencyShown, normText, overviewCurrency, rateHint, rateShown } from '../../../utils/settings/writerCHelpers';

/**
 * User story 20867: Edit Currency Settings - what the screen shows without
 * changing anything: the new-installation defaults (lead decision 1: equal ->
 * PASS, different -> BLOCKED), the overview's rate statement and the hint
 * under the rate box. Read only; `settingsGuard` still snapshots and verifies.
 */
test.describe('US 20867 - Edit Currency Settings', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test(`TC-${CASES.defaultCurrency.azureId}: should show SAR - Saudi Riyal as the selected currency when the installation is new`, async ({ steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the selected currency and the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section with the exchange rate').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the panel shows the Currency and Exchange rate fields', async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('currencySelect'), 'the Currency field').toBeVisible();
      await expect(settingsHub.control('rateInput'), 'the Exchange rate field').toBeVisible();
    });

    await steps.step(`Observe the Currency drop-down value - "${NEW_INSTALL_DEFAULTS.currency}" is shown as the selected currency`, async () => {
      const shown = await currencyShown(settingsHub);
      blockUnlessDefault(steps, 'currency', shown, NEW_INSTALL_DEFAULTS.currency);
      expect(shown, 'the selected currency').toBe(normText(NEW_INSTALL_DEFAULTS.currency));
    });
  });

  test(`TC-${CASES.defaultRate.azureId}: should show the exchange rate 3.75 when the installation is new`, async ({ steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the selected currency and the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section with the exchange rate').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the panel shows the Currency and Exchange rate fields', async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('currencySelect'), 'the Currency field').toBeVisible();
      await expect(settingsHub.control('rateInput'), 'the Exchange rate field').toBeVisible();
    });

    await steps.step(`Observe the Exchange rate field value - "${NEW_INSTALL_DEFAULTS.rate}" is shown as the default rate`, async () => {
      const shown = await rateShown(settingsHub);
      blockUnlessDefault(steps, 'exchange rate', shown, NEW_INSTALL_DEFAULTS.rate);
      expect(shown, 'the Exchange rate field').toBe(NEW_INSTALL_DEFAULTS.rate);
    });
  });

  test(`TC-${CASES.overviewRate.azureId}: should read the saved rate as "${CASES.overviewRate.shown}" when the overview is shown`, async ({ page, steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows its overview summary', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.step('Open the Currency Settings overview summary - the overview is displayed', async () => {
      expect({ currency: await overviewCurrency(page), rateLabelShown: (await settingsHub.readViewValue(LABEL.rate)) !== '' }, 'the Currency overview')
        .toEqual({ currency: expect.stringMatching(/\S/), rateLabelShown: true });
    });

    await steps.step(`Observe the exchange rate line - the overview shows "${CASES.overviewRate.shown}"`, async () => {
      expect(await settingsHub.readViewValue(LABEL.rate), `the overview's rate (stored Currency.UsdToSarRate "${settingsGuard.original['Currency.UsdToSarRate']}")`).toBe(CASES.overviewRate.shown);
    });
  });

  test(`TC-${CASES.rateHint.azureId}: should show the hint explaining the rate when the Currency Settings panel is open`, async ({ page, steps, settingsGuard, settingsHub }) => {
    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the panel loads', async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('rateInput'), 'the Exchange rate field').toBeVisible();
    });

    await steps.step(`Locate the text beneath the Exchange rate field - the hint reads "${CASES.rateHint.hint}"`, async () => {
      expect(await rateHint(page), 'the line under the Exchange rate field').toBe(CASES.rateHint.hint);
    });
  });
});
