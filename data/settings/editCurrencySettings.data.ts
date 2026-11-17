/**
 * US 20867 "Edit Currency Settings" (settings folder 04, 20 cases 21026-21045).
 *
 * How it works in this build (reports/settings/Settings-Foundation-Notes.md):
 * System Settings > Settings > General shows a Currency section ("Currency"
 * "SAR — Saudi Riyal", "Exchange rate (SAR per 1 USD)" "1 USD = 3.75 SAR").
 * Edit opens the "Edit Setting" drawer: a Currency select (SAR / USD), the
 * rate box with the hint under it, and a converter (amount 100, swap, result
 * "SAR 100.00 = USD 26.67"). Switching the currency (or changing the rate
 * while USD is in use) opens the `pbm-dialog` confirmation "Change the system
 * currency?" with an example (item idx-0) and five affected screens (idx-1..5),
 * an acknowledgement checkbox, Cancel and "Change currency". Save sends only
 * the changed keys (PUT UpsertSystemSettings).
 *
 * SAFETY - currency and rate are GLOBAL. Every test takes `settingsGuard`
 * (snapshot + restore + read-back). Only 21030 (precondition through the API)
 * and 21042 (the round trip the case asks for) SAVE USD; every other case that
 * opens the confirmation presses Cancel. Rate saves (21028, 21038, and 21034 /
 * 21035 / 21041 if the app lets the value through) are put back by the guard.
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - 21026 / 21027 "on a new installation": lead decision 1 - the value shown is
 *   compared with NEW_INSTALL_DEFAULTS; equal -> asserted and PASS, different ->
 *   BLOCKED (BLOCK_WHEN_NOT_DEFAULT) naming both values.
 * - The case writes "SAR - Saudi Riyal"; the screen writes "SAR — Saudi Riyal".
 *   Dashes are normalised (lead decision 4), so they compare equal.
 * - 21032 compares each affected screen literally. The case writes
 *   "Formulary pricing (base, public, supplier, net prices, flat rebates)"; the
 *   dialog writes "Formulary pricing — base, public, supplier and net prices,
 *   flat rebates". The separator (parentheses vs a dash) is normalised as
 *   punctuation; the WORDS are not: "supplier, net prices" vs "supplier and net
 *   prices" and "out-of-pocket maximum, sublimit" vs "out-of-pocket maximum and
 *   sublimit" are wording differences, so 21032 is expected to FAIL on those
 *   two lines until the lead decides otherwise (AFFECTED_SCREENS is the one
 *   place to change).
 * - 21029 / 21030 assert "naming the new currency / rate" (the message carries
 *   "1 USD = <rate> SAR", compared as a number), "an example" (item idx-0 starts
 *   with "Example:") and "the list of affected screens" (five lines); the exact
 *   wording of the list is 21032's job.
 * - 21033 step 4 expects the Currency field to show the original SAR after
 *   Cancel. The foundation saw USD still picked in the drawer after Cancel, so
 *   this step is expected to FAIL (finding) - asserted as the case states it.
 * - 21036 "the converter recalculates immediately": the stored rate already is
 *   3.75, so typing 3.75 alone changes nothing visible. The step first types
 *   PROBE_RATE (result "SAR 100.00 = USD 25.00") to show the converter follows
 *   the unsaved box, then types 3.75.
 * - 21037 step 4 "accepts a USD amount": SWAP_AMOUNT is typed in the amount box
 *   after the swap and the SAR equivalent is asserted.
 * - 21039: the select offers no EUR, so step 2 also asserts that only SAR and
 *   USD are offered, and step 3 submits EUR straight to the server
 *   (`upsertSettings`) and expects the 422 "Currency must be SAR or USD.".
 * - 21040 "flagged as required": the case quotes no message. The field counts
 *   as flagged when it is marked invalid (aria-invalid / ng-invalid) or the
 *   drawer / toast says "required"; the save must be blocked (no PUT or a
 *   refused PUT) and the stored rate unchanged.
 * - 21041 accepts either reading the case offers: the box refuses the fifth
 *   decimal, or the value is rounded to four decimals before saving. It fails
 *   only when 3.75123 is sent or stored as entered.
 * - 21042 reads a stored formulary price period through the API (GetPriceHistory)
 *   before the switch and after switching back, and compares the SAR amounts.
 *   It never modifies a formulary; FORM-0023 is skipped. It also reads the
 *   trade card's displayed net price: it must change while USD is in use and
 *   come back identical after the switch back.
 * - 21044: the restricted side is a SUITE user whose suite role holds only the
 *   view right; baseline first - the administrator is offered Edit.
 */
export const CASES = {
  defaultCurrency: { azureId: '21026' },
  defaultRate: { azureId: '21027' },
  rateWithoutConfirmation: { azureId: '21028', rate: '3.80' },
  confirmSwitchToUsd: { azureId: '21029' },
  confirmRateWhileUsd: { azureId: '21030', rate: '3.90' },
  acknowledgeGatesConfirm: { azureId: '21031' },
  affectedScreens: { azureId: '21032' },
  cancelSavesNothing: { azureId: '21033' },
  negativeRate: { azureId: '21034', rate: '-1' },
  zeroRate: { azureId: '21035', rate: '0' },
  converterSarToUsd: { azureId: '21036', rate: '3.75', result: 'SAR 100.00 = USD 26.67', startAmount: '100', startPattern: /^SAR 100\.00 = / },
  converterSwap: { azureId: '21037', before: 'SAR 100.00 = USD 26.67', reversed: /^USD [\d.,]+ = SAR [\d.,]+$/, swapAmount: '10', after: 'USD 10.00 = SAR 37.50' },
  smallestRate: { azureId: '21038', rate: '0.0001' },
  otherCurrencyRefused: { azureId: '21039', code: 'EUR', key: 'Currency.Code', message: 'Currency must be SAR or USD.' },
  emptyRate: { azureId: '21040' },
  fiveDecimals: { azureId: '21041', rate: '3.75123', maxDecimals: 4 },
  storedPricesUnchanged: { azureId: '21042' },
  overviewRate: { azureId: '21043', shown: '1 USD = 3.75 SAR' },
  nonAdminCannotEdit: { azureId: '21044', rights: ['SystemSettings.GetSystemSettings'] },
  rateHint: { azureId: '21045', hint: 'Used to show SAR prices in USD. Prices are always stored in SAR.' },
} as const;

/** The message of a rate of zero or below (AC + 21034 / 21035, English only - the cases quote no Arabic). */
export const RATE_MESSAGE = 'The exchange rate must be a number greater than zero.';

/** The success toast's summary. */
export const SAVED_TOAST = 'Setting updated';

/** The currency select's options as the SCREEN writes them (for picking). */
export const CURRENCY_OPTION = {
  SAR: 'SAR — Saudi Riyal',
  USD: 'USD — US Dollar',
} as const;

/** The stored Currency.Code values. */
export const CURRENCY_CODE = { SAR: 'SAR', USD: 'USD' } as const;

/** The same options as the CASES write them (compared with dashes normalised). */
export const CURRENCY_AS_CASE = {
  SAR: 'SAR - Saudi Riyal',
  USD: 'USD - US Dollar',
} as const;

/** The read view's / drawer's labels. */
export const LABEL = {
  rate: 'Exchange rate (SAR per 1 USD)',
} as const;

/**
 * Lead decision 1: the story's new-installation defaults and the rule for an
 * environment that is not a new installation (BLOCKED when the value differs).
 */
export const NEW_INSTALL_DEFAULTS = {
  currency: CURRENCY_AS_CASE.SAR,
  rate: '3.75',
} as const;
export const BLOCK_WHEN_NOT_DEFAULT = true;

/** BLOCKED reason when a default case meets a value other than the new-installation default. */
export const notDefaultReason = (what: string, shown: string, expected: string): string =>
  `needs a new installation: this environment's ${what} is "${shown}", the new-installation default is "${expected}"`;

/** 21036: a rate typed first so the recalculation is visible (100 / 4 = 25.00). */
export const PROBE_RATE = { rate: '4', result: 'SAR 100.00 = USD 25.00' } as const;

/** 21032: the five affected screens exactly as the case lists them. */
export const AFFECTED_SCREENS = [
  'Formulary pricing (base, public, supplier, net prices, flat rebates)',
  'Benefit configurations (copayments, deductibles, out-of-pocket maximums, sublimits)',
  'Member accumulators (deductible and out-of-pocket amounts met)',
  'Policies (policy-level deductible, out-of-pocket maximum, sublimit)',
  'Dashboard (payer and member responsibility totals)',
] as const;

/** The confirmation's example line starts with this. */
export const EXAMPLE_PREFIX = 'Example:';

/** The acknowledgement the case quotes (21031). */
export const ACKNOWLEDGEMENT = 'I have checked the exchange rate and understand that all prices will change currency.';

/** 21042: never read prices from (let alone touch) the Plans suite's formulary. */
export const PROTECTED_FORMULARY_CODE = 'FORM-0023';

/** 21042 BLOCKED reason when no formulary in the register carries a stored price. */
export const NO_STORED_PRICE =
  'no formulary in the register (FORM-0023 excluded) has a trade with a stored price period to read, so "the stored SAR amount is identical" cannot be checked';

/** 21030 BLOCKED reason when the USD precondition cannot be set. */
export const usdPreconditionReason = (status: number, text: string): string =>
  `the precondition "USD in use" could not be set through UpsertSystemSettings: ${status} ${text.slice(0, 200)}`;
