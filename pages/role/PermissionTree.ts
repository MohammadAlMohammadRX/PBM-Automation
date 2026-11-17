import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ROLE_FORM_IDS, permissionToggleId } from '../../constants/role/roleIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import { readPermissionCatalogue, type PermissionCatalogue } from '../../utils/role/roleApi';

/**
 * The permission tree of the role drawer - step 2 "Privileges" of Add / Edit and the lower half of View.
 *
 * DOM (2026-11-14): a FLAT list of `.role-dialog__node` rows in pre-order; depth = `padding-inline-start`
 * / 28px; a branch row carries `role-dialog__node--branch` + a chevron `role-form-drawer-permission-toggle-<key>`
 * (aria-expanded). Every checkbox carries the SAME duplicated id, and leaves carry no id at all - so a node is
 * found by its catalogue key: a branch through its toggle id, a leaf by its label inside its parent branch's
 * block. Labels are the catalogue's englishName (arabicName in the Arabic UI) - mostly the raw key part
 * ("CancelAnnouncement"), some friendly ("View Audit Logs", "Approve/Reject").
 *
 * STATE of a row's checkbox: `checked`, `partial` or `unchecked` - since the 2026-11-14 21:30 UTC build read from
 * the native input of `pbm-checkbox` (checked / aria-checked="mixed"); each input now has its own id
 * `role-form-drawer-permission-checkbox-<key lower-cased, "." as "-">` and labels are friendly names (the
 * catalogue's englishName still matches them).
 * A BRANCH's checkbox shows its DESCENDANTS (not its own permission): a role holding Roles.GetRoles alone
 * shows "GetRoles (0/6)" unchecked and "Roles (1/9)". Heading counts "(x/y)": y = every node below the
 * heading (sub-branches count), x = the selected ones among them.
 *
 * Clicks go to the checkbox INPUT (the box underneath is covered by it). Clicking a heading when partial or
 * empty ticks every node below it; clicking a full heading clears it. Collapsed children are removed from the
 * DOM - `expandAll()` (or a search) before reading. View Role renders every checkbox disabled.
 */

export type NodeState = 'checked' | 'partial' | 'unchecked';

export interface TreeRow {
  /** Position among the rendered rows (changes with search / collapse). */
  index: number;
  depth: number;
  /** The label without the "(x/y)" count. */
  label: string;
  count: { selected: number; total: number } | null;
  isBranch: boolean;
  /** The chevron id (branches only). */
  toggleId: string;
  expanded: boolean | null;
  state: NodeState;
  disabled: boolean;
}

const NODE = '.role-dialog__node';

export class PermissionTree {
  private catalogue: PermissionCatalogue | null = null;

  constructor(private readonly page: Page, catalogue?: PermissionCatalogue) {
    this.catalogue = catalogue ?? null;
  }

  private root(): Locator {
    return this.page.locator(`#${ROLE_FORM_IDS.root}`);
  }

  /** Every rendered tree row. locator-exception: tree rows carry no id; scoped to the role drawer. */
  private rows(): Locator {
    return this.root().locator(NODE); // locator-exception: tree rows have no id (see class comment)
  }

  /** The permission catalogue (GetRolePermissions through THIS page's session), cached. */
  async loadCatalogue(): Promise<PermissionCatalogue> {
    if (!this.catalogue) this.catalogue = await readPermissionCatalogue(this.page);
    return this.catalogue;
  }

  searchInput(): Locator {
    return this.page.locator(`#${ROLE_FORM_IDS.permissionSearch}`);
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.searchInput(), 'the permission tree should render its search box').toBeVisible({ timeout: Timeouts.default });
    await expect(this.rows().first(), 'the permission tree should render its rows').toBeVisible({ timeout: Timeouts.default });
  }

  /** Types into the tree search (client side - no request) and waits for the rows to settle. */
  async search(text: string): Promise<void> {
    Logger.step(`[tree] Searching "${text}"`);
    await this.searchInput().fill(text);
    await this.settle();
  }

  async clearSearch(): Promise<void> {
    await this.search('');
  }

  async expandAll(): Promise<void> {
    await this.page.locator(`#${ROLE_FORM_IDS.expandAll}`).click();
    await this.settle();
  }

  async collapseAll(): Promise<void> {
    await this.page.locator(`#${ROLE_FORM_IDS.collapseAll}`).click();
    await this.settle();
  }

  /** Waits until the rendered row count stops changing (filter / expand animations). */
  private async settle(): Promise<void> {
    let last = -1;
    await expect
      .poll(async () => {
        const now = await this.rows().count();
        const stable = now === last;
        last = now;
        return stable;
      }, { timeout: Timeouts.default, intervals: [150, 250, 400] })
      .toBe(true);
  }

  /** Every rendered row, top to bottom. */
  async readRows(): Promise<TreeRow[]> {
    return this.rows().evaluateAll((els) =>
      els.map((el, index) => {
        const e = el as HTMLElement;
        const labelEl = e.querySelector('label');
        const raw = (labelEl?.textContent ?? e.innerText ?? '').replace(/\s+/g, ' ').trim();
        const m = raw.match(/^(.*?)\s*\((\d+)\/(\d+)\)$/);
        const toggle = e.querySelector('button[id^="role-form-drawer-permission-toggle-"]');
        // Build of 2026-11-14 21:30 UTC: PrimeNG p-checkbox replaced by pbm-checkbox - the state lives on the
        // native input (checked; aria-checked="mixed" for a partial branch). The p-checkbox branch is kept for
        // the older build.
        const box = e.querySelector('p-checkbox');
        const input = e.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        const mixed = input?.getAttribute('aria-checked') === 'mixed' || !!input?.indeterminate;
        const checked = box ? box.getAttribute('data-p-checked') === 'true' : !!input?.checked && !mixed;
        const partial = !checked && (!!box?.querySelector('[data-p-icon="minus"]') || mixed);
        return {
          index,
          depth: Math.round((parseFloat(e.style.paddingInlineStart || '0') || 0) / 28),
          label: m ? m[1] : raw,
          count: m ? { selected: Number(m[2]), total: Number(m[3]) } : null,
          isBranch: e.classList.contains('role-dialog__node--branch'),
          toggleId: toggle?.id ?? '',
          expanded: toggle ? toggle.getAttribute('aria-expanded') === 'true' : null,
          state: (checked ? 'checked' : partial ? 'partial' : 'unchecked') as 'checked' | 'partial' | 'unchecked',
          disabled: !!input?.disabled || box?.getAttribute('data-p-disabled') === 'true',
        };
      }));
  }

  /** The top-level headings ("Announcement", "Approval Management", ... "Users") with their counts. */
  async readHeadings(): Promise<TreeRow[]> {
    return (await this.readRows()).filter((r) => r.depth === 0);
  }

  /** Row index of a catalogue key (branch by toggle id, leaf by label inside its parent's block). -1 when not rendered. */
  async indexOf(key: string): Promise<number> {
    return (await this.indicesOf([key]))[key] ?? -1;
  }

  /** Row indexes of many keys in ONE pass over the DOM (-1 = not rendered). */
  async indicesOf(keys: readonly string[]): Promise<Record<string, number>> {
    const cat = await this.loadCatalogue();
    const specs = keys.map((key) => {
      const node = cat.byKey.get(key);
      if (!node) throw new Error(`the permission catalogue has no "${key}"`);
      const parent = node.parentId ? cat.byId.get(node.parentId) : undefined;
      return {
        key,
        ownToggle: node.hasChildren || (node.permissions?.length ?? 0) > 0 ? permissionToggleId(key) : '',
        parentToggle: parent && cat.byKey.has(parent.key) ? permissionToggleId(parent.key) : '',
        labels: [node.englishName, node.arabicName].filter(Boolean),
      };
    });
    return this.rows().evaluateAll((els, list) => {
      const depthOf = (e: Element): number => Math.round((parseFloat((e as HTMLElement).style.paddingInlineStart || '0') || 0) / 28);
      const labelOf = (e: Element): string => (e.querySelector('label')?.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/\s*\(\d+\/\d+\)$/, '');
      const toggleIndex = new Map<string, number>();
      els.forEach((e, i) => {
        const t = e.querySelector('button[id^="role-form-drawer-permission-toggle-"]');
        if (t) toggleIndex.set(t.id, i);
      });
      const out: Record<string, number> = {};
      for (const a of list) {
        if (a.ownToggle && toggleIndex.has(a.ownToggle)) {
          out[a.key] = toggleIndex.get(a.ownToggle) as number;
          continue;
        }
        const start = a.parentToggle ? (toggleIndex.get(a.parentToggle) ?? -1) : -1;
        if (start < 0) {
          out[a.key] = a.parentToggle ? -1 : els.findIndex((e) => depthOf(e) === 0 && a.labels.includes(labelOf(e)));
          continue;
        }
        const d0 = depthOf(els[start]);
        let found = -1;
        for (let i = start + 1; i < els.length && depthOf(els[i]) > d0; i += 1) {
          if (a.labels.includes(labelOf(els[i]))) {
            found = i;
            break;
          }
        }
        out[a.key] = found;
      }
      return out;
    }, specs);
  }

  /** The row of a catalogue key. locator-exception: rows have no id; resolved by key -> position (indexOf). */
  async rowOf(key: string): Promise<Locator> {
    const i = await this.indexOf(key);
    if (i < 0) throw new Error(`the tree does not render "${key}" (collapsed, filtered out, or not in this tree)`);
    return this.rows().nth(i); // locator-exception: rows have no id; position resolved from the catalogue key just now
  }

  async isRendered(key: string): Promise<boolean> {
    return (await this.indexOf(key)) >= 0;
  }

  async rowInfo(key: string): Promise<TreeRow> {
    const i = await this.indexOf(key);
    if (i < 0) throw new Error(`the tree does not render "${key}"`);
    return (await this.readRows())[i];
  }

  async stateOf(key: string): Promise<NodeState> {
    return (await this.rowInfo(key)).state;
  }

  /** "(x/y)" of a heading / branch key. */
  async countOf(key: string): Promise<{ selected: number; total: number }> {
    const info = await this.rowInfo(key);
    if (!info.count) throw new Error(`"${key}" is a leaf - it shows no count`);
    return info.count;
  }

  /** Clicks a node's checkbox once (no state assumption). */
  async click(key: string): Promise<void> {
    const row = await this.rowOf(key);
    await row.locator('input[type="checkbox"]').first().click();
  }

  /**
   * Ticks / clears a node and waits for the state to follow. For a LEAF the target is checked / unchecked;
   * for a BRANCH or heading, `on` = every node below ticked (checked), off = none (unchecked).
   */
  async set(key: string, on: boolean): Promise<void> {
    const want: NodeState = on ? 'checked' : 'unchecked';
    if ((await this.stateOf(key)) === want) return;
    Logger.step(`[tree] ${on ? 'Ticking' : 'Clearing'} "${key}"`);
    // ONE click: partial / empty -> all ticked, full -> cleared. A partial heading being cleared therefore
    // needs a second click once the first has settled on "checked".
    const before = await this.stateOf(key);
    await this.click(key);
    if (!on && before === 'partial') {
      await expect.poll(() => this.stateOf(key), { timeout: Timeouts.default }).toBe('checked');
      await this.click(key);
    }
    await expect.poll(() => this.stateOf(key), { timeout: Timeouts.default, message: `"${key}" should end ${want}` }).toBe(want);
  }

  async tick(key: string): Promise<void> {
    await this.set(key, true);
  }

  async untick(key: string): Promise<void> {
    await this.set(key, false);
  }

  /** Expands / collapses ONE branch with its chevron. */
  async setExpanded(key: string, expanded: boolean): Promise<void> {
    const toggle = this.page.locator(`#${permissionToggleId(key)}`);
    if ((await toggle.getAttribute('aria-expanded')) !== String(expanded)) await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', String(expanded), { timeout: Timeouts.default });
    await this.settle();
  }

  /** The labels of every rendered row (counts stripped). */
  async labels(): Promise<string[]> {
    return (await this.readRows()).map((r) => r.label);
  }

  /**
   * Every catalogue key with its rendered row (expand all first): `{ key -> row }`, keys not rendered left out.
   * Use it to compare the whole tree with GetRolePermissions in one pass.
   */
  async rowsByKey(): Promise<Map<string, TreeRow>> {
    const cat = await this.loadCatalogue();
    const idx = await this.indicesOf([...cat.byKey.keys()]);
    const rows = await this.readRows();
    const out = new Map<string, TreeRow>();
    for (const [key, i] of Object.entries(idx)) if (i >= 0 && rows[i]) out.set(key, rows[i]);
    return out;
  }

  /** Keys whose row shows CHECKED (leaves = ticked; branches = everything below ticked). */
  async checkedKeys(): Promise<string[]> {
    return [...(await this.rowsByKey()).entries()].filter(([, r]) => r.state === 'checked').map(([k]) => k);
  }

  /** The tree's own message (no id): "Select at least one privilege." / "No privileges match the search.". */
  message(text: string | RegExp): Locator {
    return this.root().getByText(text); // locator-exception: the tree messages carry no id; scoped to the drawer
  }
}
