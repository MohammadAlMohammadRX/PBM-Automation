import { test, expect } from '../../../fixtures';
import { CASES, PROBE_RATE } from '../../../data/settings/editCurrencySettings.data';
import { currencySectionShown } from '../../../utils/settings/writerCHelpers';

/**
 * User story 20867: Edit Currency Settings - the converter in the drawer
 * (amount box starting at 100, swap button, result line). It works on the
 * UNSAVED rate in the box; nothing is saved. `settingsGuard` still snapshots
 * and verifies.
 */
test.describe('US 20867 - Edit Currency Settings', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test(`TC-${CASES.converterSarToUsd.azureId}: should show "${CASES.converterSarToUsd.result}" when the unsaved rate 3.75 is in the panel`, async ({ steps, settingsGuard, settingsHub }) => {
    const d = CASES.converterSarToUsd;
    const result = settingsHub.control('converterResult');

    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the exchange rate', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical('Open the Currency Settings panel - the converter shows a starting amount of SAR 100.00', async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('converterAmount'), 'the converter amount').toHaveValue(d.startAmount);
      await expect(result, 'the converter result').toHaveText(d.startPattern);
    });

    await steps.step(`Enter an unsaved exchange rate of ${d.rate} in the rate field - the converter recalculates immediately`, async () => {
      await settingsHub.setRate(PROBE_RATE.rate);
      await expect(result, `the converter with the unsaved rate ${PROBE_RATE.rate}`).toHaveText(PROBE_RATE.result);
      await settingsHub.setRate(d.rate);
      await expect(result, `the converter with the unsaved rate ${d.rate}`).not.toHaveText(PROBE_RATE.result);
    });

    await steps.step(`Observe the converter result - the converter shows "${d.result}"`, async () => {
      await expect(result, 'the converter result').toHaveText(d.result);
    });
  });

  test(`TC-${CASES.converterSwap.azureId}: should reverse the conversion direction when Swap currencies is selected`, async ({ steps, settingsGuard, settingsHub }) => {
    const d = CASES.converterSwap;
    const result = settingsHub.control('converterResult');

    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the converter tool and its swap control', async () => {
      await settingsHub.open();
      expect(await currencySectionShown(settingsHub), 'the Currency section').toBe(true);
    });

    await steps.critical(`Open the Currency Settings panel - the converter shows ${d.before}`, async () => {
      await settingsHub.openEdit();
      await expect(settingsHub.control('converterSwap'), 'the Swap currencies button').toBeVisible();
      await expect(result, 'the converter result').toHaveText(d.before);
    });

    await steps.step('Select the Swap currencies button - the converter fields reverse direction', async () => {
      await settingsHub.control('converterSwap').click();
      await expect(result, 'the converter result after the swap').toHaveText(d.reversed);
    });

    await steps.step('Observe the converter inputs and outputs - the converter accepts a USD amount and shows the equivalent SAR value', async () => {
      await settingsHub.setConverterAmount(d.swapAmount);
      await expect(result, `the converter after typing ${d.swapAmount} USD`).toHaveText(d.after);
    });
  });
});
