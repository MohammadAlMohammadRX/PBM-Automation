import { test, expect } from '../../../fixtures';
import { CASES, CURRENCY_AS_CASE, CURRENCY_CODE, CURRENCY_OPTION, NO_STORED_PRICE, SAVED_TOAST } from '../../../data/settings/editCurrencySettings.data';
import {
  blockUnless,
  currencySectionShown,
  describeOutcome,
  displayedNetPrice,
  findStoredPrice,
  normText,
  overviewCurrency,
  readStoredAmounts,
  switchCurrency,
  type StoredAmounts,
  type StoredPriceRef,
} from '../../../utils/settings/writerCHelpers';

/**
 * User story 20867: Edit Currency Settings - prices stay stored in riyals.
 * The case SAVES USD (one of the few allowed to) and switches back to SAR
 * through the drawer; `settingsGuard` restores and reads back at teardown in
 * any case, so USD lives only for the length of the test.
 *
 * The price is READ ONLY: an existing formulary trade's stored price period
 * (GetPriceHistory; FORM-0023 is skipped) is read before the switch and after
 * switching back, and its SAR amounts must be identical. Its trade card's
 * displayed net price must change while USD is in use and come back exactly.
 * No formulary is modified.
 */
test.describe('US 20867 - Edit Currency Settings', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.storedPricesUnchanged.azureId}: should keep stored prices identical in riyals when the currency is switched to USD and back`, async ({ page, steps, settingsGuard, settingsHub }) => {
    let price = null as unknown as StoredPriceRef;
    let storedBefore: StoredAmounts | null = null;
    let shownBefore = '';

    await steps.critical('Precondition: a formulary price stored in SAR is read - its stored amounts (API) and the net price its trade card displays', async () => {
      const found = await findStoredPrice(page);
      blockUnless(steps, found !== null, NO_STORED_PRICE);
      price = found as StoredPriceRef;
      storedBefore = await readStoredAmounts(page, price);
      shownBefore = await displayedNetPrice(page, price);
      expect({ stored: storedBefore !== null, shown: shownBefore !== '' }, `trade ${price.tradeCode} on "${price.formularyName}" (${price.formularyCode ?? price.formularyId}): ${JSON.stringify(storedBefore)}, card "${shownBefore}"`)
        .toEqual({ stored: true, shown: true });
    });

    await steps.critical('Navigate to the System Setting Management module - the Platform Currency section shows the currency selection control (SAR in use)', async () => {
      await settingsHub.open();
      expect({ section: await currencySectionShown(settingsHub), currency: normText(await overviewCurrency(page)) }, 'the Currency section')
        .toEqual({ section: true, currency: normText(CURRENCY_AS_CASE.SAR) });
    });

    await steps.step(`Open the Currency Settings panel, change Currency to USD, tick the acknowledgement checkbox and confirm - "${SAVED_TOAST}" is shown and the display switches to USD`, async () => {
      const outcome = await switchCurrency(settingsHub, CURRENCY_OPTION.USD);
      expect({ status: outcome.status, toast: outcome.toast.includes(SAVED_TOAST), stored: (await settingsGuard.current())['Currency.Code'] }, describeOutcome(outcome))
        .toEqual({ status: 200, toast: true, stored: CURRENCY_CODE.USD });
      await settingsHub.open();
      expect(normText(await overviewCurrency(page)), 'the overview currency').toBe(normText(CURRENCY_AS_CASE.USD));
      const shownInUsd = await displayedNetPrice(page, price);
      expect(shownInUsd, `the card's net price while USD is in use (in SAR it read "${shownBefore}")`).not.toBe(shownBefore);
    });

    await steps.step(`Return to the Currency Settings panel, switch Currency back to SAR and confirm - "${SAVED_TOAST}" is shown`, async () => {
      await settingsHub.open();
      const outcome = await switchCurrency(settingsHub, CURRENCY_OPTION.SAR);
      expect({ status: outcome.status, toast: outcome.toast.includes(SAVED_TOAST), stored: (await settingsGuard.current())['Currency.Code'] }, describeOutcome(outcome))
        .toEqual({ status: 200, toast: true, stored: CURRENCY_CODE.SAR });
    });

    await steps.step('Check the formulary price that was originally stored in SAR - the stored SAR amount is identical to its original value', async () => {
      const storedAfter = await readStoredAmounts(page, price);
      expect(storedAfter, `the stored price period ${price.periodId} of trade ${price.tradeCode}`).toEqual(storedBefore);
      expect(await displayedNetPrice(page, price), 'the card\'s net price after switching back').toBe(shownBefore);
    });
  });
});
