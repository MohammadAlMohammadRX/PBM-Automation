import type { Page } from '@playwright/test';
import type { DrawerSaveOutcome, SettingsHubPage } from '../../pages/settings/SettingsHubPage';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { FormularyDetailPage } from '../../pages/formulary/FormularyDetailPage';
import { FormularyTradesTab } from '../../pages/formulary/FormularyTradesTab';
import { PBM_DIALOG, SETTINGS_DRAWER, SETTINGS_HUB } from '../../constants/settings/settingsIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { listFormularyRegister, readPriceHistory, readTrades, type PricePeriod } from '../FormularyProvisioning';
import { Logger } from '../Logger';
import {
  BLOCK_WHEN_NOT_DEFAULT,
  EXAMPLE_PREFIX,
  LABEL,
  PROTECTED_FORMULARY_CODE,
  notDefaultReason,
} from '../../data/settings/editCurrencySettings.data';

/**
 * Writer C helpers - System Setting Management, folder 04 "Edit Currency
 * Settings" (US 20867). Readers and small actions on top of the lead's
 * SettingsHubPage; nothing here asserts, each returns what the screen / server
 * showed so the spec asserts what ITS case expects.
 */

// ---------------------------------------------------------------- text

/** Whitespace collapsed and every dash normalised to "-" (lead decision 4: an em dash is not a finding). */
export function normText(text: string): string {
  return text.replace(/[‒–—―−]/g, '-').replace(/\s+/g, ' ').trim();
}

/** "Formulary pricing (base, ...)" -> "Formulary pricing - base, ..." - the case's separator as the dialog's, words untouched. */
export function asDialogLine(caseText: string): string {
  return normText(caseText.replace(/^(.*?)\s*\((.*)\)\s*$/, '$1 - $2'));
}

/** Decimal places of a rate as typed / sent / stored ("3.7512" -> 4, "3" -> 0). */
export function decimalsOf(value: string): number {
  const at = value.trim().indexOf('.');
  return at < 0 ? 0 : value.trim().length - at - 1;
}

/** The number "1 USD = <n> SAR" names in a text, or null. */
export function rateNamedIn(text: string): number | null {
  const m = normText(text).match(/1 USD = ([\d.,]+) SAR/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

// ---------------------------------------------------------------- read view

/** The read view's lines (the outlet's text, one trimmed line each). */
async function outletLines(page: Page): Promise<string[]> {
  return (await page.locator(`#${SETTINGS_HUB.outlet}`).innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * The read view's Currency VALUE. "Currency" is both the section heading and
 * the field label, so `readViewValue('Currency')` would answer "Currency"; the
 * value is the line just before the rate label instead.
 *
 * locator-exception: the read view's values carry no ids (foundation notes); the outlet's lines are read.
 */
export async function overviewCurrency(page: Page): Promise<string> {
  const lines = await outletLines(page);
  const at = lines.indexOf(LABEL.rate);
  return at > 0 ? lines[at - 1] : '';
}

/** Whether the read view shows the Currency section (its rate label and a value under it). */
export async function currencySectionShown(hub: SettingsHubPage): Promise<boolean> {
  return (await hub.readViewValue(LABEL.rate)) !== '';
}

// ---------------------------------------------------------------- drawer

/** The Currency select's shown text, normalised ("SAR - Saudi Riyal"). */
export async function currencyShown(hub: SettingsHubPage): Promise<string> {
  return normText(await hub.control('currencySelect').innerText());
}

/** The rate box's value as shown. */
export async function rateShown(hub: SettingsHubPage): Promise<string> {
  return hub.control('rateInput').inputValue();
}

/**
 * The line under the rate label inside the drawer - the hint (the rate box has
 * no text of its own, so the next text line is the hint).
 *
 * locator-exception: the hint carries no id (foundation ids dump); the drawer's text lines are read.
 */
export async function rateHint(page: Page): Promise<string> {
  const lines = (await page.locator(`#${SETTINGS_DRAWER.drawer}`).innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
  const at = lines.indexOf(LABEL.rate);
  return at >= 0 ? lines[at + 1] ?? '' : '';
}

/** The drawer's text, whitespace collapsed ('' when it is closed). */
export async function drawerText(page: Page): Promise<string> {
  return normText(await page.locator(`#${SETTINGS_DRAWER.drawer}`).innerText({ timeout: 1_000 }).catch(() => ''));
}

/**
 * The options the Currency select offers (opens it, reads, closes with Escape).
 *
 * locator-exception: PrimeNG option ids are render-order dependent; the open overlay's options are read by role.
 */
export async function currencyOptions(hub: SettingsHubPage, page: Page): Promise<string[]> {
  const control = hub.control('currencySelect');
  await control.scrollIntoViewIfNeeded();
  await control.click();
  const options = page.getByRole('option').filter({ visible: true });
  await options.first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  const texts = (await options.allInnerTexts()).map(normText);
  await page.keyboard.press('Escape');
  return texts;
}

/** Empties the rate box the way a user would: click, select all, Delete. */
export async function clearRateLikeAUser(hub: SettingsHubPage, page: Page): Promise<string> {
  const box = hub.control('rateInput');
  await box.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  return box.inputValue();
}

/** Whether the save outcome shows `message` - in the toast or anywhere in the drawer (a field error). */
export async function messageShown(page: Page, outcome: DrawerSaveOutcome, message: string): Promise<boolean> {
  return normText(outcome.toast).includes(normText(message)) || (await drawerText(page)).includes(normText(message));
}

/** "The save is blocked": no request left, or the server refused it. */
export function saveBlocked(outcome: DrawerSaveOutcome): boolean {
  return outcome.status === null || outcome.status >= 400;
}

/** A one-line account of what a Save produced - for failure messages. */
export function describeOutcome(outcome: DrawerSaveOutcome): string {
  return `answer ${outcome.status ?? 'no request'}; sent ${JSON.stringify(outcome.sent)}; toast "${outcome.toast}"; server "${outcome.answer.slice(0, 200)}"; `
    + `confirmation ${outcome.confirmationOpened ? 'opened' : 'not opened'}; drawer ${outcome.drawerOpen ? 'open' : 'closed'}`;
}

/** The rate value the drawer SENT, or null when no rate went out. */
export function sentRate(outcome: DrawerSaveOutcome): string | null {
  return outcome.sent?.settings.find((s) => s.key === 'Currency.UsdToSarRate')?.value ?? null;
}

/**
 * 21040: whether the emptied rate box is flagged as required - marked invalid
 * (aria-invalid / ng-invalid on the box) or "required" said in the drawer / toast.
 */
export async function rateFlaggedRequired(hub: SettingsHubPage, page: Page, outcome: DrawerSaveOutcome): Promise<{ flagged: boolean; detail: string }> {
  const box = hub.control('rateInput');
  const ariaInvalid = (await box.getAttribute('aria-invalid').catch(() => null)) === 'true';
  const invalidClass = /\bng-invalid\b|\bp-invalid\b/.test((await box.getAttribute('class').catch(() => '')) ?? '');
  const text = await drawerText(page);
  const saysRequired = /required/i.test(text) || /required/i.test(outcome.toast);
  return {
    flagged: ariaInvalid || invalidClass || saysRequired,
    detail: `aria-invalid ${ariaInvalid}, invalid class ${invalidClass}, "required" shown ${saysRequired}`,
  };
}

// ---------------------------------------------------------------- confirmation (pbm-dialog)

/** The confirmation's parts, normalised. `items[0]` is the example, the rest are the affected screens. */
export async function confirmationFacts(hub: SettingsHubPage): Promise<{ title: string; message: string; example: string; screens: string[] }> {
  const items = (await hub.dialogItems()).map(normText);
  return {
    title: normText(await hub.dialog('title').innerText().catch(() => '')),
    message: normText(await hub.dialog('message').innerText().catch(() => '')),
    example: items[0] ?? '',
    screens: items.slice(1),
  };
}

/** Whether the example line is an example ("Example: ..."). */
export function isExample(line: string): boolean {
  return line.startsWith(EXAMPLE_PREFIX);
}

/** Presses Cancel in the confirmation and reports whether the dialog closed and the drawer stayed open. */
export async function cancelConfirmation(hub: SettingsHubPage): Promise<{ dialogClosed: boolean; drawerOpen: boolean }> {
  await hub.dialog('cancel').click();
  const dialogClosed = await hub.dialog('title').waitFor({ state: 'hidden', timeout: Timeouts.short }).then(() => true).catch(() => false);
  return { dialogClosed, drawerOpen: await hub.isDrawerOpen() };
}

/** The inner `<button>` of the confirmation's "Change currency" (the id sits on the p-button host). */
export function confirmButton(hub: SettingsHubPage) {
  return hub.dialog('confirm').locator('button');
}

/**
 * 21031 step 3: tries "Change currency" with the acknowledgement unticked (a
 * forced click on the disabled button) and reports whether a save request
 * left and whether the dialog is still up.
 */
export async function tryConfirmUnticked(hub: SettingsHubPage, page: Page): Promise<{ requestSent: boolean; dialogOpen: boolean }> {
  let requestSent = false;
  const onRequest = (r: { url(): string; method(): string }) => {
    if (r.url().includes(ApiEndpoints.systemSettingsUpsert) && r.method() === 'PUT') requestSent = true;
  };
  page.on('request', onRequest);
  await confirmButton(hub).click({ force: true, timeout: Timeouts.short }).catch(() => undefined);
  await page.waitForTimeout(1_500); // a request that the click would send leaves at once; this is the window it is watched for
  page.off('request', onRequest);
  return { requestSent, dialogOpen: await hub.dialog('title').isVisible() };
}

/** Picks `option` in the drawer, presses Save, and answers the confirmation when it opens. */
export async function switchCurrency(hub: SettingsHubPage, option: string): Promise<DrawerSaveOutcome> {
  await hub.openEdit();
  await hub.pick('currencySelect', option);
  const first = await hub.saveAndCapture();
  return first.confirmationOpened ? hub.confirmCurrencyChange() : first;
}

// ---------------------------------------------------------------- defaults (lead decision 1)

/**
 * Lead decision 1: equal to the new-installation default -> the caller asserts
 * it; different -> BLOCKED (when BLOCK_WHEN_NOT_DEFAULT) naming both values.
 */
export function blockUnlessDefault(steps: TestSteps, what: string, shown: string, expected: string): void {
  if (BLOCK_WHEN_NOT_DEFAULT && normText(shown) !== normText(expected)) steps.blocked(notDefaultReason(what, shown, expected));
}

// ---------------------------------------------------------------- permission (21044)

/**
 * Opens the hub in a restricted session and reports what it offers: whether
 * the Currency section shows, whether Edit is offered (waited for briefly, so
 * a slow render is not read as "absent"), and whether a drawer is open.
 */
export async function restrictedEditAccess(hub: SettingsHubPage, page: Page): Promise<{ url: string; sectionShown: boolean; editShown: boolean; drawerOpen: boolean }> {
  await hub.open();
  await hub.waitForPageReady();
  await page.locator(`#${SETTINGS_HUB.tabs}`).waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  const editShown = await hub.editButton().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  return {
    url: page.url(),
    sectionShown: await currencySectionShown(hub),
    editShown,
    drawerOpen: await hub.isDrawerOpen(500),
  };
}

// ---------------------------------------------------------------- stored prices (21042)

/** A stored price period of an existing formulary trade - read only, never changed. */
export interface StoredPriceRef {
  formularyId: string;
  formularyCode: string | null;
  formularyName: string;
  formularyTradeId: string;
  tradeCode: string;
  periodId: string;
}

/** The SAR amounts of a price period that 21042 compares. */
export type StoredAmounts = Pick<PricePeriod, 'baseCost' | 'publicPrice' | 'supplierPrice' | 'discountPercentage' | 'vatPercentage' | 'netPrice' | 'rebateValue'>;

/**
 * Finds an existing formulary trade with a stored price period (current one
 * preferred), skipping FORM-0023. Reads only. Null when none exists.
 */
export async function findStoredPrice(page: Page): Promise<StoredPriceRef | null> {
  const { items } = await listFormularyRegister(page, {}, 100);
  const candidates = items.filter((f) => f.tradeCount > 0 && f.formularyCode !== PROTECTED_FORMULARY_CODE);
  for (const f of candidates.slice(0, 15)) {
    const trades = (await readTrades(page, f.id).catch(() => [])).filter((t) => t.currentNetPrice !== null);
    for (const t of trades.slice(0, 3)) {
      const periods = await readPriceHistory(page, t.id).catch(() => [] as PricePeriod[]);
      const period = periods.find((p) => p.periodStatus === 'current' && !p.isDraft) ?? periods.find((p) => !p.isDraft);
      if (period) {
        Logger.step(`[21042] Reading the stored price of trade ${t.tradeCode} on formulary "${f.formularyNameEn}" (${f.formularyCode ?? f.id}) - read only`);
        return { formularyId: f.id, formularyCode: f.formularyCode, formularyName: f.formularyNameEn, formularyTradeId: t.id, tradeCode: t.tradeCode, periodId: period.id };
      }
    }
  }
  return null;
}

/** The stored SAR amounts of the referenced period (fresh GetPriceHistory), or null when it is gone. */
export async function readStoredAmounts(page: Page, ref: StoredPriceRef): Promise<StoredAmounts | null> {
  const period = (await readPriceHistory(page, ref.formularyTradeId)).find((p) => p.id === ref.periodId);
  if (!period) return null;
  const { baseCost, publicPrice, supplierPrice, discountPercentage, vatPercentage, netPrice, rebateValue } = period;
  return { baseCost, publicPrice, supplierPrice, discountPercentage, vatPercentage, netPrice, rebateValue };
}

/** The net price the trade's card DISPLAYS on the formulary's Trades & Pricing tab (read only). */
export async function displayedNetPrice(page: Page, ref: StoredPriceRef): Promise<string> {
  await new FormularyDetailPage(page).open(ref.formularyId);
  const tab = new FormularyTradesTab(page);
  await tab.open();
  await tab.search(ref.tradeCode);
  return normText((await tab.readCard(ref.formularyTradeId)).netPrice);
}

/** Checks the acknowledgement box in the confirmation. */
export async function tickAcknowledgement(hub: SettingsHubPage): Promise<void> {
  await hub.dialog('acknowledge').check();
}

/** The confirmation dialog's whole text, normalised ('' when it is not shown). */
export async function dialogText(page: Page): Promise<string> {
  return normText(await page.locator(`#${PBM_DIALOG.dialog}`).innerText().catch(() => ''));
}

/** Declares the test BLOCKED with `reason` unless `ok` (keeps the `if` out of the specs). */
export function blockUnless(steps: TestSteps, ok: boolean, reason: string): void {
  if (!ok) steps.blocked(reason);
}
