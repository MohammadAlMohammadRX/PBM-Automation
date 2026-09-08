import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ROLE_FORM } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * The role drawer's "Privileges" step - the application's permission catalogue.
 *
 * WHY THIS IS THE ONE PAGE OBJECT IN THE FRAMEWORK THAT LOCATES BY TEXT.
 *
 * locator-exception: every checkbox in this tree carries the SAME id. VERIFIED
 * on the live drawer - 26+ elements all read
 * `role-form-drawer-arabic-description-checkbox`, which is an unrelated field's
 * id copy-pasted down the whole tree. So `#role-form-drawer-...-checkbox` is a
 * strict-mode violation and cannot name a single permission; there is no
 * per-permission id to use instead.
 *
 * Locating by the visible label is not a compromise here, it is the subject:
 * this story is about what each permission is CALLED in English and Arabic, so
 * the label is the thing under test either way. Every lookup below is still
 * scoped to `#role-form-drawer`, so it cannot drift onto another screen, and
 * the duplicate id is reported as a defect rather than quietly tolerated.
 *
 * The rows are `.role-dialog__node`, with `--branch` marking a group heading
 * ("Payers (21/21)") as opposed to a single permission.
 */
export class RolePermissionsStep {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private host(): Locator {
    return this.page.locator(`#${ROLE_FORM.root}`);
  }

  /** locator-exception: see the class comment - the tree exposes no usable ids. */
  private nodes(): Locator {
    // locator-exception: every checkbox in this tree shares one id (see the class comment), so the row itself is the only addressable unit.
    return this.host().locator('.role-dialog__node');
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.page.locator(`#${ROLE_FORM.permissionSearch}`)).toBeVisible({
      timeout: Timeouts.default,
    });
    // The search box renders before the tree does, so a test that read the
    // catalogue here would see an empty list and report "no permissions".
    await expect(this.nodes().first()).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Filters the catalogue.
   *
   * Worth doing before reading a group: the full tree is ~330 rows across every
   * module, and several permission names are PREFIXES of others
   * (`GetPayer` / `GetPayerNetworks`), so narrowing first and then matching
   * exactly is what keeps "is GetPayer present" from being answered by
   * GetPayerAuditTrail.
   */
  async searchPermissions(term: string): Promise<void> {
    Logger.step(`Filtering the permission catalogue to "${term}"`);
    await this.page.locator(`#${ROLE_FORM.permissionSearch}`).fill(term);
    // The tree re-renders in place; wait for it to settle on a stable row count
    // rather than sleeping.
    let previous = -1;
    await expect
      .poll(
        async () => {
          const count = await this.nodes().count();
          const settled = count === previous;
          previous = count;
          return settled ? 'settled' : 'changing';
        },
        { timeout: Timeouts.default, intervals: [300, 500, 500, 700] },
      )
      .toBe('settled');
  }

  /** Every row's first line of text, groups and permissions alike. */
  async getAllLabels(): Promise<string[]> {
    return this.nodes().evaluateAll((rows) =>
      rows
        .map((row) => ((row as HTMLElement).innerText || '').trim().split('\n')[0].trim())
        .filter((text) => text !== ''),
    );
  }

  /** Group headings only - the rows carrying an `(n/m)` counter. */
  async getGroupLabels(): Promise<string[]> {
    const all = await this.getAllLabels();
    return all.filter((label) => /\(\d+\/\d+\)$/.test(label));
  }

  /**
   * Individual permission labels - every row that is not a group heading.
   *
   * Groups are identified by their `(n/m)` counter rather than by the
   * `--branch` class: the counter is what actually distinguishes
   * "Payers (21/21)" from a permission, and the class is not applied
   * consistently to nested groups such as "GetPayers (19/19)".
   */
  async getPermissionLabels(): Promise<string[]> {
    const all = await this.getAllLabels();
    return all.filter((label) => !/\(\d+\/\d+\)$/.test(label));
  }

  /** Whether a permission with exactly this label is listed. */
  async hasPermissionLabelled(label: string): Promise<boolean> {
    const labels = await this.getPermissionLabels();
    return labels.includes(label);
  }

  /**
   * Asserts a permission is listed under exactly this name.
   *
   * The message says what a failure MEANS, because "View Payer Details is
   * missing" on its own does not distinguish an absent permission from one
   * displayed under its raw code name - and here it is always the latter.
   */
  async expectPermissionLabelled(label: string): Promise<void> {
    await expect
      .poll(async () => (await this.getPermissionLabels()).includes(label), {
        timeout: Timeouts.default,
        message:
          `The catalogue should offer a permission named "${label}". `
          + 'If this fails, the permission exists but is displayed under its raw code name.',
      })
      .toBe(true);
  }

  /** Asserts no permission is listed under this name - the inverse check. */
  async expectPermissionNotLabelled(label: string): Promise<void> {
    await expect
      .poll(async () => (await this.getPermissionLabels()).includes(label), {
        timeout: Timeouts.short,
        message: `No permission should be displayed as "${label}".`,
      })
      .toBe(false);
  }

  /**
   * Asserts every listed label is human-readable rather than a raw key.
   *
   * Three separate failure modes, all of which the localization criteria ask
   * about: an unresolved translation key (`status.withdrawn`), an empty cell,
   * and the literal string "undefined" that a missing lookup leaves behind.
   */
  async expectNoRawTranslationKeys(): Promise<void> {
    const labels = await this.getPermissionLabels();
    expect(labels.length).toBeGreaterThan(0);
    const suspicious = labels.filter(
      (label) =>
        label === ''
        || /^undefined$/i.test(label)
        || /^[a-z][a-zA-Z]*(\.[a-zA-Z]+)+$/.test(label),
    );
    expect(suspicious, 'No permission label should be a raw key, blank or "undefined"').toEqual([]);
  }

  /**
   * The row whose OWN label is exactly `label`.
   *
   * locator-exception: see the class comment - the tree exposes no per-row ids.
   *
   * Matched on the row's own first line rather than with `hasText`, and that
   * distinction is the whole method. The tree NESTS, so a group row contains
   * every descendant's text: `filter({ hasText: 'View Audit Logs' }).first()`
   * returns the `Payers` GROUP, not the permission. Clicking that toggles the
   * entire group, and the assertion on the single permission then disagrees with
   * what was actually clicked - which is exactly how the toggle check first
   * failed, on a tree that was behaving correctly.
   */
  private async rowFor(label: string): Promise<Locator> {
    const index = await this.nodes().evaluateAll(
      (rows, wanted) =>
        rows.findIndex(
          (row) => ((row as HTMLElement).innerText || '').trim().split('\n')[0].trim() === wanted,
        ),
      label,
    );
    if (index < 0) {
      throw new Error(
        `[RolePermissionsStep] No permission row is labelled exactly "${label}". `
          + `Labels present: ${JSON.stringify(await this.getPermissionLabels())}`,
      );
    }
    return this.nodes().nth(index);
  }

  async isPermissionChecked(label: string): Promise<boolean> {
    const input = (await this.rowFor(label)).locator('input.p-checkbox-input').first();
    return input.isChecked();
  }

  /** Ticks or unticks one permission and asserts the new state took. */
  async togglePermission(label: string): Promise<boolean> {
    const before = await this.isPermissionChecked(label);
    Logger.step(`Toggling permission "${label}" (was ${before ? 'checked' : 'unchecked'})`);
    // The INPUT is driven, not its wrapper. The row nests
    // pbm-checkbox > span.pbm-checkbox > p-checkbox > input, and a click on any
    // of the outer three lands on a decorative element: the control does not
    // change state, and the assertion below then reports the application as
    // ignoring a toggle it never received. `force` because PrimeNG covers the
    // real input with its own styled box, so Playwright sees it as obscured.
    // locator-exception: the tree's checkboxes all carry the same id - see the class comment.
    await (await this.rowFor(label))
      .locator('input.p-checkbox-input')
      .first()
      .click({ force: true });
    const after = !before;
    await expect
      .poll(async () => this.isPermissionChecked(label), {
        timeout: Timeouts.default,
        message: `Toggling "${label}" should leave it ${after ? 'checked' : 'unchecked'}.`,
      })
      .toBe(after);
    return after;
  }

  /**
   * Asserts no label is visually truncated.
   *
   * `scrollWidth > clientWidth` is the DOM's own statement that the text does
   * not fit its box, which makes "truncated or overlapped" something a test can
   * decide. A screenshot comparison would answer the same question less
   * reliably and would need a baseline per language.
   */
  async expectNoTruncatedLabels(): Promise<void> {
    const overflowing = await this.nodes().evaluateAll((rows) =>
      rows
        .filter((row) => {
          const element = row as HTMLElement;
          return element.scrollWidth > element.clientWidth + 1;
        })
        .map((row) => ((row as HTMLElement).innerText || '').trim().split('\n')[0]),
    );
    expect(overflowing, 'No permission label should overflow its row').toEqual([]);
  }
}
