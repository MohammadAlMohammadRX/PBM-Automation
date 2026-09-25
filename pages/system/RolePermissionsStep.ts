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

  /**
   * The permissions listed UNDER one top-level group, read from the tree
   * itself rather than through the search box.
   *
   * WHY NOT SEARCH. Filtering to "Payer" answers a different question: the term
   * also matches rows in OTHER modules - "Payer Approvals" lives under Approval
   * Management - so a name found after searching is not evidence that the
   * PAYERS group offers it. Reading the section directly is what the story
   * actually asks about, and it is stricter.
   *
   * HOW A SECTION IS BOUNDED. The tree renders flat and marks nesting with
   * indentation, so a top-level group is a row indented by nothing and its
   * section runs to the next such row. Indentation is read as
   * `padding-inline-start`, which is the left edge in English and the RIGHT
   * edge in Arabic - measuring `padding-left` finds every Arabic row at zero
   * and collapses the whole section to its heading.
   *
   * Group headings - the rows carrying an (n/m) counter, including nested ones
   * such as "GetPayers (19/19)" - are dropped, leaving the permissions.
   *
   * locator-exception: see the class comment - the tree exposes no per-row ids.
   */
  async getGroupPermissions(groupLabels: string | readonly string[]): Promise<string[]> {
    const candidates = typeof groupLabels === 'string' ? [groupLabels] : [...groupLabels];
    const label = await this.scrollGroupIntoView(candidates);
    return this.nodes().evaluateAll((rows, wanted) => {
      const read = (row: Element): { text: string; indent: number } => {
        const el = row as HTMLElement;
        const style = window.getComputedStyle(el);
        const inline = style.getPropertyValue('padding-inline-start')
          || (style.direction === 'rtl' ? style.paddingRight : style.paddingLeft);
        return {
          text: (el.innerText || '').trim().split('\n')[0].trim(),
          indent: parseInt(inline, 10) || 0,
        };
      };
      const all = rows.map(read);
      const isGroup = (text: string): boolean => /\(\d+\/\d+\)\s*$/.test(text);
      const start = all.findIndex((r) => r.indent === 0 && isGroup(r.text)
        && r.text.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim() === wanted);
      if (start < 0) return [];
      let end = all.length;
      for (let i = start + 1; i < all.length; i += 1) {
        if (all[i].indent === 0) { end = i; break; }
      }
      return all
        .slice(start + 1, end)
        .map((r) => r.text)
        .filter((text) => text !== '' && !isGroup(text));
    }, label);
  }

  /**
   * Brings a group heading on screen, so the section is read the way a person
   * reaches it - by scrolling the catalogue rather than filtering it.
   *
   * locator-exception: see the class comment - the tree exposes no per-row ids.
   */
  async scrollGroupIntoView(groupLabels: string | readonly string[]): Promise<string> {
    const candidates = typeof groupLabels === 'string' ? [groupLabels] : [...groupLabels];
    for (const label of candidates) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
      const heading = this.nodes()
        .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*\\(\\d+/\\d+\\)`) })
        .first();
      const present = await heading
        .waitFor({ state: 'visible', timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      // Tried in turn rather than asserted: a heading is translated in one
      // language and not the other, so "absent" here means "not under THIS
      // spelling", which is only a failure once every spelling has missed.
      if (!present) continue;
      await heading.scrollIntoViewIfNeeded();
      return label;
    }
    throw new Error(
      `[RolePermissions] The catalogue lists no group headed ${candidates.join(' or ')}.`,
    );
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
  /**
   * The first of several candidate labels that the catalogue actually shows,
   * or an empty string when none does.
   *
   * For the cases that ask whether a permission EXISTS rather than what it is
   * called: the bilingual-names story established that most payer permissions
   * are still displayed under their raw codes, so an existence check has to
   * accept the intended name or the code.
   */
  async resolveLabel(candidates: readonly string[]): Promise<string> {
    for (const candidate of candidates) {
      if (await this.hasPermissionLabelled(candidate)) return candidate;
    }
    return '';
  }

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
