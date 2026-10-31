import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';

/**
 * Driving PrimeNG selects and checkboxes inside drawers (2026-10-30).
 *
 * Two traps, both seen on the Terminology drawers:
 * - A select's options are rendered in an overlay at the end of <body>, with
 *   no `aria-controls` link back to the combobox. Reading "every visible
 *   option" picked up a still-open neighbour overlay (the type list was read as
 *   the restriction list). The overlay's options carry the host `p-select`'s
 *   generated id as a prefix (`pn_id_28_0`, `pn_id_28_1`, ...), so they are
 *   addressed through that id.
 * - The real checkbox input sits under PrimeNG's styled box and, inside a
 *   scrolling drawer, Playwright reports it "outside of the viewport" even
 *   with force. The input is clicked in the page instead, then its state is
 *   asserted.
 */

/** The options of the overlay belonging to `combobox` (a select's `[role=combobox]` element). */
async function optionsOf(page: Page, combobox: Locator): Promise<Locator> {
  const host = await combobox.locator('xpath=ancestor-or-self::p-select[1]').getAttribute('id');
  return page.locator(`[id^=${host}_][role=option]`);
}

/**
 * Opens a select and waits for its own options. No Escape here: inside a
 * drawer, Escape closes the DRAWER (seen 2026-10-30), and with the options
 * addressed through the host id a neighbour's open overlay no longer matters.
 */
export async function openSelect(page: Page, combobox: Locator): Promise<Locator> {
  await combobox.click();
  const options = await optionsOf(page, combobox);
  await options.first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  return options;
}

/** Closes a select's overlay by toggling the select, never with Escape (see openSelect). */
export async function closeSelect(page: Page, combobox: Locator): Promise<void> {
  const options = await optionsOf(page, combobox);
  if (await options.first().isVisible().catch(() => false)) await combobox.click();
  await options.first().waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
}

/** The labels a select offers, without choosing one. */
export async function readSelectOptions(page: Page, combobox: Locator): Promise<string[]> {
  const options = await openSelect(page, combobox);
  const labels = (await options.allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  await closeSelect(page, combobox);
  return labels;
}

/**
 * The labels a form marks as required. The application draws the red "*" with
 * CSS (a `::before` on the label), so it is not in the label's text - reading
 * innerText reported "no mandatory marker" on a form that showed one
 * (2026-10-30). A label counts when its text or its ::before / ::after carries
 * the asterisk.
 */
export async function requiredLabels(container: Locator): Promise<string[]> {
  return container.locator('label').evaluateAll((labels) =>
    labels
      .filter((label) => {
        const before = getComputedStyle(label, '::before').content;
        const after = getComputedStyle(label, '::after').content;
        return /\*/.test(`${(label as HTMLElement).innerText} ${before} ${after}`) || label.querySelector('[class*="required"]') !== null;
      })
      .map((label) => (label as HTMLElement).innerText.replace(/\*/g, '').trim()));
}

/** Chooses `label` in a select and confirms the select shows it. */
export async function chooseSelectOption(page: Page, combobox: Locator, label: string): Promise<void> {
  const options = await openSelect(page, combobox);
  const exact = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  await options.filter({ hasText: exact }).first().click();
  await expect(combobox, `the select should show "${label}"`).toContainText(label, { timeout: Timeouts.default });
}

/** Sets a checkbox input to `value` and asserts it took. */
export async function setCheckbox(checkbox: Locator, value: boolean): Promise<void> {
  if ((await checkbox.isChecked()) !== value) await checkbox.evaluate((input) => (input as HTMLInputElement).click());
  await expect(checkbox, `the checkbox should be ${value ? 'ticked' : 'cleared'}`).toBeChecked({ checked: value, timeout: Timeouts.default });
}
