import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { RolePermissionsStep } from './RolePermissionsStep';
import { AppRoutes } from '../../constants/AppRoutes';
import { ROLE_CARD_FIELD, ROLE_FORM, ROLE_LIST, buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * Role Administration - the screen that owns the permission catalogue.
 *
 * Reached from the payer stories rather than being a payer screen itself: payer
 * permissions are DEFINED on a role, so "what is this payer permission called
 * in Arabic" is a question only this screen can answer.
 *
 * CARDS ONLY. Unlike every other list in the application this screen has no
 * table view and no view toggle, so it does not extend ListPageBase - inheriting
 * pager, column and table-view behaviour that does not exist here would offer
 * callers methods that can only time out. The card ids carry the role's GUID
 * (`role-card-{id}-name`), which is why a role is addressed by NAME and resolved
 * to its id, the same approach the payer list uses for rows.
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
    await expect(this.cardNames().first()).toBeVisible({ timeout: Timeouts.default });
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

  private cardNames(): Locator {
    return this.page.locator(`[id^="role-card-"][id$="-${ROLE_CARD_FIELD.name}"]`);
  }

  /** Every role currently listed. */
  async getRoleNames(): Promise<string[]> {
    return this.cardNames().evaluateAll((elements) =>
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
    const card = this.cardNames().filter({ hasText: roleName }).first();
    await expect(card).toBeVisible({ timeout: Timeouts.default });
    const id = await card.getAttribute('id');
    if (!id) throw new Error(`[RoleAdministration] Role card for "${roleName}" carries no id.`);
    return id.replace(/^role-card-/, '').replace(new RegExp(`-${ROLE_CARD_FIELD.name}$`), '');
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
    await this.page.locator(buttonSelector(`role-card-${id}-${ROLE_CARD_FIELD.edit}`)).click();
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
    const card = this.cardNames().first();
    await expect(card).toBeVisible({ timeout: Timeouts.default });
    const cardId = await card.getAttribute('id');
    if (!cardId) throw new Error('[RoleAdministration] The first role card carries no id.');
    const id = cardId
      .replace(/^role-card-/, '')
      .replace(new RegExp(`-${ROLE_CARD_FIELD.name}$`), '');

    Logger.step('Opening the permission catalogue of the first listed role');
    await this.page.locator(buttonSelector(`role-card-${id}-${ROLE_CARD_FIELD.edit}`)).click();
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
}
