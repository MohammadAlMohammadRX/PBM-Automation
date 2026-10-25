import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { RolePermissionsStep } from './RolePermissionsStep';
import { AppRoutes } from '../../constants/AppRoutes';
import { ROLE_FORM, ROLE_LIST, ROLE_ROW_FIELD, TOAST, buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import { ROLE_SAVED } from '../../data/accounts/payerAdminRole.data';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { NetworkUtils } from '../../utils/NetworkUtils';

/**
 * Role Administration - the screen that owns the permission catalogue.
 *
 * Reached from the payer stories rather than being a payer screen itself: payer
 * permissions are DEFINED on a role, so "what is this payer permission called
 * in Arabic" is a question only this screen can answer.
 *
 * A TABLE, since on or before 20 September 2026. This screen used to render
 * role CARDS (`role-card-{id}-name`) and was rebuilt into a table with the same
 * id convention every other list in the application uses:
 * `role-list-table-row-{guid}` for the row, `-cell-name` for the name and
 * `-edit` for the action. So a role is addressed by NAME, resolved to its GUID,
 * and acted on through its row.
 *
 * It still does not extend ListPageBase: that base carries pager, column and
 * view-toggle behaviour this screen does not offer, and inheriting it would hand
 * callers methods that can only time out.
 */
export class RoleAdministrationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Opens the screen and asserts the role cards rendered.
   *
   * Asserting the cards rather than the container: the container mounts before
   * the roles arrive, so a test that read the role names here would get an
   * empty list and report "no roles exist" - the same trap the payer list's
   * `waitForRowsRendered` exists for.
   */
  async open(): Promise<void> {
    Logger.step('Opening Role Administration');
    await this.goto(AppRoutes.roleAdministration);
    await expect(this.page.locator(`#${ROLE_LIST.root}`)).toBeVisible({
      timeout: Timeouts.default,
    });
    await expect(this.roleNames().first()).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Navigates WITHOUT asserting the screen rendered.
   *
   * The RBAC cases need a navigation that is allowed to be refused, exactly as
   * BasePage-derived payer screens do. `open()` would turn a correct
   * access-denied into a test error.
   */
  async navigate(): Promise<void> {
    await this.goto(AppRoutes.roleAdministration);
  }

  /** Every role's NAME cell - the handle a caller has for a role. */
  private roleNames(): Locator {
    return this.page.locator(
      `[id^="${ROLE_LIST.rowPrefix}"][id$="-${ROLE_ROW_FIELD.name}"]`,
    );
  }

  /** Every role currently listed. */
  async getRoleNames(): Promise<string[]> {
    return this.roleNames().evaluateAll((elements) =>
      elements.map((element) => ((element as HTMLElement).innerText || '').trim()),
    );
  }

  async expectRolesListed(): Promise<void> {
    await expect
      .poll(async () => (await this.getRoleNames()).length, {
        timeout: Timeouts.default,
        message: 'Role Administration should list at least one role.',
      })
      .toBeGreaterThan(0);
  }

  /**
   * Resolves a role name to the GUID its card ids are built from.
   *
   * Reads the id off the matched card rather than pairing name and id in two
   * passes - the two-pass version can pair a name with another card's id if the
   * list re-renders between the reads, which is the same defect the payer list's
   * `getRowPairs` was written to avoid.
   */
  private async roleIdOf(roleName: string): Promise<string> {
    const cell = this.roleNames().filter({ hasText: roleName }).first();
    await expect(cell, `Role Administration should list a role named "${roleName}"`)
      .toBeVisible({ timeout: Timeouts.default });
    const id = await cell.getAttribute('id');
    if (!id) throw new Error(`[RoleAdministration] The name cell for "${roleName}" carries no id.`);
    return id
      .replace(new RegExp(`^${ROLE_LIST.rowPrefix}`), '')
      .replace(new RegExp(`-${ROLE_ROW_FIELD.name}$`), '');
  }

  /** Whether the role list offers the action to create a new role. */
  async isCreateActionAvailable(): Promise<boolean> {
    return this.page
      .locator(buttonSelector(ROLE_LIST.addButton))
      .isVisible({ timeout: Timeouts.short })
      .catch(() => false);
  }

  /**
   * Opens a role's edit drawer at step 1.
   *
   * Edit rather than View on purpose: the permission tree is interactive only in
   * the edit drawer, and the assign/remove checks need to toggle it.
   */
  async openEditDrawer(roleName: string): Promise<void> {
    const id = await this.roleIdOf(roleName);
    Logger.step(`Opening the edit drawer for role "${roleName}"`);
    await this.page.locator(buttonSelector(`${ROLE_LIST.rowPrefix}${id}-${ROLE_ROW_FIELD.edit}`)).click();
    await expect(this.page.locator(`#${ROLE_FORM.title}`)).toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /**
   * Opens a role's Privileges step - the permission catalogue - and asserts it
   * loaded.
   *
   * Advances with the footer's Next rather than by clicking the stepper bullet:
   * VERIFIED that clicking `role-form-drawer-stepper-step-2` leaves the drawer
   * on step 1, so a test built on the bullet reads Role Information and reports
   * that the catalogue is empty.
   */
  /**
   * Opens the FIRST listed role's permission catalogue, whatever it is called.
   *
   * This is what the bilingual cases use, and by name rather than by choice:
   * role names are themselves translated ("Admin 2" renders as "الادمن2"), so a
   * role resolved by its English name cannot be found again after the interface
   * switches to Arabic. Addressing the card by position sidesteps that - and
   * these cases do not care WHICH role they read, only that its permission tree
   * is the shared catalogue.
   *
   * Navigates first, because the language switch requires the drawer to be
   * closed and the role cards therefore need re-fetching.
   */
  async openFirstRolePermissionCatalogue(): Promise<RolePermissionsStep> {
    await this.open();
    const cell = this.roleNames().first();
    await expect(cell).toBeVisible({ timeout: Timeouts.default });
    const cellId = await cell.getAttribute('id');
    if (!cellId) throw new Error('[RoleAdministration] The first role row carries no id.');
    const id = cellId
      .replace(new RegExp(`^${ROLE_LIST.rowPrefix}`), '')
      .replace(new RegExp(`-${ROLE_ROW_FIELD.name}$`), '');

    Logger.step('Opening the permission catalogue of the first listed role');
    await this.page.locator(buttonSelector(`${ROLE_LIST.rowPrefix}${id}-${ROLE_ROW_FIELD.edit}`)).click();
    await expect(this.page.locator(`#${ROLE_FORM.title}`)).toBeVisible({
      timeout: Timeouts.default,
    });
    await this.page.locator(buttonSelector(ROLE_FORM.nextButton)).click();
    const privileges = new RolePermissionsStep(this.page);
    await privileges.waitForLoaded();
    return privileges;
  }

  async openPermissionCatalogue(roleName: string): Promise<RolePermissionsStep> {
    // Navigates first, on purpose. The bilingual cases switch language between
    // reads, and the header's language toggle cannot be clicked while this
    // drawer is open - its overlay swallows the click. So they close the drawer,
    // switch, and come back here, at which point the role cards need to be
    // re-fetched before a card can be addressed again.
    await this.open();
    await this.openEditDrawer(roleName);
    await this.page.locator(buttonSelector(ROLE_FORM.nextButton)).click();
    const privileges = new RolePermissionsStep(this.page);
    await privileges.waitForLoaded();
    return privileges;
  }

  /**
   * Whether this role may approve requests its own members submitted.
   *
   * A property of the ROLE, not a permission in the tree, which is why it is
   * read here: the maker-checker rule that a submitter cannot decide on their
   * own request is configured by this switch.
   */
  async canApproveOwnRequests(): Promise<boolean> {
    const checkbox = this.page.locator(`#${ROLE_FORM.canApproveOwnRequests}`);
    await expect(checkbox).toBeAttached({ timeout: Timeouts.default });
    return checkbox.isChecked();
  }

  async expectSelfApprovalDisabled(roleName: string): Promise<void> {
    await expect
      .poll(async () => this.canApproveOwnRequests(), {
        timeout: Timeouts.default,
        message:
          `Role "${roleName}" should not be allowed to approve its own requests - `
          + 'the maker-checker rule depends on this switch being off.',
      })
      .toBe(false);
  }

  /** Closes the drawer without saving, so the catalogue is only ever read. */
  async closeDrawer(): Promise<void> {
    await this.page.locator(`#${ROLE_FORM.close}`).click();
    await expect(this.page.locator(`#${ROLE_FORM.title}`)).toBeHidden({
      timeout: Timeouts.default,
    });
  }

  /**
   * Saves the role and waits for the application to confirm it.
   *
   * Confirmation is not optional here. A role change is the precondition of
   * whatever runs next, and a save that silently failed would hand the next
   * case an account with the WRONG rights - which would then report a
   * permission defect that does not exist. So the toast is awaited rather than
   * assumed, and a missing one fails here, where the cause is visible.
   *
   * VERIFIED: saving the Privileges step raises "Role updated" and takes effect
   * immediately - a role edit is not a maker-checker change and needs no
   * approval.
   */
  async saveRole(): Promise<void> {
    Logger.step('Saving the role');
    await this.page
      .locator(`#${ROLE_FORM.root}`)
      // locator-exception: the drawer's Save button is the one control here with no id; scoped to the drawer.
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await expect(
      this.page.locator(`#${TOAST.summary}`),
      'saving a role should be confirmed - without it the next case would run on unknown rights',
    ).toContainText(ROLE_SAVED, { timeout: Timeouts.toast });
    await expect(this.page.locator(`#${ROLE_FORM.title}`)).toBeHidden({
      timeout: Timeouts.default,
    });
  }

  // ---- story 21 / 36 / 43 additions (network module, 2026-10-21) -------------

  /**
   * Opens Role Administration and reports whether this session was admitted,
   * without asserting - the access-denied case needs the answer, not a
   * failure. A refused session is redirected to the dashboard ("Access
   * Restricted", verified for the Payer Admin 2026-09-12).
   *
   * locator-exception: the refusal banner carries no id, so the landing
   * screen's text is read whole for the caller to match the wording.
   */
  async openAndReportAccess(): Promise<{ reachable: boolean; url: string; text: string }> {
    Logger.step('Opening Role Administration to see whether this session is admitted');
    await this.goto(AppRoutes.roleAdministration);
    const reachable = await this.page
      .locator(`#${ROLE_LIST.root}`)
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
    const text = (await this.page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return { reachable, url: this.page.url(), text };
  }

  /** Closes the role drawer, discarding unsaved changes when the guard asks. */
  async closeDrawerDiscarding(): Promise<void> {
    await this.page.locator(`#${ROLE_FORM.close}`).click();
    const guard = new ConfirmDialog(this.page);
    if (await guard.isDiscardPromptVisible()) await guard.discardChanges();
    await expect(this.page.locator(`#${ROLE_FORM.title}`)).toBeHidden({ timeout: Timeouts.default });
  }

  /** Whether the open role drawer's "Has Assigned Payers" switch is on. */
  async readHasAssignedPayers(): Promise<boolean> {
    const checkbox = this.page.locator(`#${ROLE_FORM.hasAssignedPayers}`);
    await expect(checkbox).toBeAttached({ timeout: Timeouts.default });
    return checkbox.isChecked();
  }

  /** Clicks the "Has Assigned Payers" switch `times` times without pausing. */
  async toggleHasAssignedPayers(times = 1): Promise<void> {
    const checkbox = this.page.locator(`#${ROLE_FORM.hasAssignedPayers}`);
    for (let i = 0; i < times; i += 1) await checkbox.click({ force: true });
  }

  /** Sets the "Has Assigned Payers" switch on the open drawer. */
  async setHasAssignedPayers(on: boolean): Promise<void> {
    if ((await this.readHasAssignedPayers()) !== on) await this.toggleHasAssignedPayers(1);
    await expect.poll(() => this.readHasAssignedPayers(), { timeout: Timeouts.short }).toBe(on);
  }

  /**
   * Creates a disposable role through the Add drawer and asserts it is listed.
   *
   * Used only by cases that must SAVE a role's configuration: a role the case
   * owns can be changed and deleted afterwards, where a shared role cannot.
   * One harmless read permission is ticked because a role with no privileges
   * may not be savable - the case is about the role's flags, not its rights.
   */
  async createDisposableRole(nameEn: string, nameAr: string, hasAssignedPayers: boolean, permission: string): Promise<void> {
    Logger.step(`Creating disposable role "${nameEn}"`);
    await this.open();
    await this.page.locator(buttonSelector(ROLE_LIST.addButton)).first().click();
    await expect(this.page.locator(`#${ROLE_FORM.title}`)).toBeVisible({ timeout: Timeouts.default });
    await this.page.locator(`#${ROLE_FORM.englishName}`).fill(nameEn);
    await this.page.locator(`#${ROLE_FORM.arabicName}`).fill(nameAr);
    await this.setHasAssignedPayers(hasAssignedPayers);
    await this.page.locator(buttonSelector(ROLE_FORM.nextButton)).click();
    const privileges = new RolePermissionsStep(this.page);
    await privileges.waitForLoaded();
    await privileges.togglePermission(permission);
    await this.page.locator(`#${ROLE_FORM.root}`).getByRole('button', { name: 'Save', exact: true }).click(); // locator-exception: the drawer's Save button has no id; scoped to the drawer.
    await expect(this.page.locator(`#${ROLE_FORM.title}`), 'the new role should save and close its drawer').toBeHidden({
      timeout: Timeouts.default,
    });
    await this.open();
    await expect.poll(async () => (await this.getRoleNames()).includes(nameEn), { timeout: Timeouts.default }).toBe(true);
  }

  /** Deletes a role by name, confirming the prompt, and asserts it left the list. */
  async deleteRole(roleName: string): Promise<void> {
    Logger.step(`Deleting role "${roleName}"`);
    await this.open();
    const id = await this.roleIdOf(roleName);
    await this.page.locator(buttonSelector(`${ROLE_LIST.rowPrefix}${id}-${ROLE_ROW_FIELD.delete}`)).click();
    await new ConfirmDialog(this.page).confirm();
    await expect.poll(async () => (await this.getRoleNames()).includes(roleName), { timeout: Timeouts.default }).toBe(false);
  }

  /**
   * Sends a role update straight to the server as this session, for the case
   * proving a non-administrator is refused server-side and not only on screen.
   */
  async attemptRoleUpdateViaApi(body: Record<string, unknown>): Promise<{ status: number; text: string }> {
    return NetworkUtils.requestAsSession(this.page, 'PUT', ApiEndpoints.roleUpdate, body);
  }
}
