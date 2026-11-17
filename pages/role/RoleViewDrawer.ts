import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ROLE_FORM_IDS } from '../../constants/role/roleIds';
import { buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import type { PermissionCatalogue } from '../../utils/role/roleApi';
import { PermissionTree } from './PermissionTree';

/**
 * View Role - the SAME `role-form-drawer` with the title "View Role": one read-only page (no stepper),
 * label/value rows "Role Name", "اسم الدور", "Allowed To Assign By" (names comma-separated, "—" when none),
 * "Has Assigned Payers?" / "Can a user approve their own requests?" (Yes / No) - descriptions and Is Active
 * are NOT shown - then the permission tree with every checkbox DISABLED, Expand all / Collapse all / search.
 * Footer: Cancel only (`role-form-drawer-cancel-button`) + X. No Save, no Next.
 *
 * The value rows carry no ids (`.role-dialog__view-row` > `.role-dialog__view-label` / `-value`): read with
 * `values()`, scoped to the drawer.
 */
export class RoleViewDrawer {
  readonly tree: PermissionTree;

  constructor(private readonly page: Page, catalogue?: PermissionCatalogue) {
    this.tree = new PermissionTree(page, catalogue);
  }

  titleLocator(): Locator {
    return this.page.locator(`#${ROLE_FORM_IDS.title}`);
  }

  async waitOpen(): Promise<void> {
    await expect(this.titleLocator(), 'View Role should open').toBeVisible({ timeout: Timeouts.default });
    await this.tree.waitForLoaded();
  }

  async title(): Promise<string> {
    return (await this.titleLocator().innerText()).trim();
  }

  /** label -> value of every read-only row, in screen order. locator-exception: the rows carry no id. */
  async values(): Promise<Record<string, string>> {
    const pairs = await this.page
      .locator(`#${ROLE_FORM_IDS.root}`)
      .locator('.role-dialog__view-row') // locator-exception: View Role rows carry no id; scoped to the drawer
      .evaluateAll((rows) =>
        rows.map((r) => [
          (r.querySelector('.role-dialog__view-label')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          (r.querySelector('.role-dialog__view-value')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        ]));
    return Object.fromEntries(pairs);
  }

  /** Inputs / textareas / enabled checkboxes in the drawer (expected: only the tree search box). */
  async editableControls(): Promise<string[]> {
    return this.page.locator(`#${ROLE_FORM_IDS.root}`).locator('input:not([disabled]), textarea:not([disabled])').evaluateAll((els) =>
      els.map((e) => `${e.tagName.toLowerCase()}#${e.id}[${(e as HTMLInputElement).type}]`));
  }

  /** Ids of the footer / header buttons (no tree chevrons). */
  async buttonIds(): Promise<string[]> {
    return this.page.locator(`#${ROLE_FORM_IDS.root}`).locator('button[id], p-button[id]').evaluateAll((els) =>
      els.map((e) => e.id).filter((id) => !id.startsWith('role-form-drawer-permission-toggle-')));
  }

  async close(how: 'x' | 'cancel' = 'cancel'): Promise<void> {
    const target = how === 'x' ? this.page.locator(`#${ROLE_FORM_IDS.close}`) : this.page.locator(buttonSelector(ROLE_FORM_IDS.cancelButton)).first();
    await target.click();
    await expect(this.titleLocator(), 'View Role should close').toBeHidden({ timeout: Timeouts.default });
  }
}
