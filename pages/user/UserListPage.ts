import type { Page } from '@playwright/test';
import { IdentityListPage, type IdentityListAnswer } from './IdentityListPage';
import { UserFormDrawer } from './UserFormDrawer';
import { UserDeactivateDrawer } from './UserDeactivateDrawer';
import { clickDialogAction, readDialog, settledNumber, toastMessages } from './userCommon';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  USER_ADVANCED_SEARCH,
  USER_ADVANCED_SELECTS,
  USER_CARD,
  USER_COLUMN,
  USER_LIST,
  USER_ROW_ACTION,
  USER_SORT_OPTION,
  type UserKpiFilter,
  type UserKpiKey,
  type UserRowAction,
  type UserSortOption,
} from '../../constants/user/userIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { readUserDashboard, userSearchKey, type UserDashboard, type UserListItem } from '../../utils/UserProvisioning';

/** One table row by column key. */
export type UserRowValues = Record<keyof typeof USER_COLUMN, string>;

/** What a write from the list answered (status -1 when nothing was sent) and the toasts shown. */
export interface UserWriteAnswer {
  status: number;
  text: string;
  messages: string[];
}

/**
 * Users Administration (`/users-management/users-administration`, verified
 * 2026-11-08): tiles Total Users / Active / Inactive (clickable - they filter
 * the list by `isActive`) and Pending Approval (not clickable, caption
 * "Awaiting approval — decided in Approval Management"); keyword search
 * (`searchText`: matches the English / Arabic name parts, document ID and
 * e-mail); Advance Search (Name, Document ID, Nationality, Identity Type,
 * Mobile Number, Status, Gender); Sort By (Newest default `CreatedOn desc`,
 * Oldest, Name `EnglishFirstName asc`, Gender, Nationality, Identity Type,
 * Document ID `UserName`, Mobile Number `PhoneNumber`, Status `IsActive`, Last
 * Modified; the direction button flips asc / desc); Export (Selected / All ->
 * CSV / Excel, `Users_YYYYMMDD_HHmmss`); Add User; table Name / Document ID /
 * Nationality / Identity Type / Mobile Number / Status / Actions (View, Edit,
 * Assign Roles & Payers, Inactivate|Activate, Delete); cards; 10 rows a page.
 */
export class UserListPage extends IdentityListPage<UserListItem> {
  constructor(page: Page) {
    super(page, {
      screen: USER_LIST.screen,
      route: AppRoutes.usersAdministration,
      listCall: 'GetUsers',
      payloadKey: 'users',
      exportCall: ApiEndpoints.userExport,
      advancedField: USER_ADVANCED_SEARCH.field,
      advancedSelects: USER_ADVANCED_SELECTS,
      cardPrefix: USER_CARD.prefix,
    });
  }

  protected firstColumn(): string {
    return USER_COLUMN.name;
  }

  /** Searches by the user's LAST name ("Automation User<stamp>") and waits for the row (no search when it is on screen). */
  async revealRow(displayName: string): Promise<void> {
    if (await this.rowByText(displayName).isVisible().catch(() => false)) return;
    await this.searchFor(userSearchKey(displayName));
    await this.waitForRowVisible(displayName);
  }

  /** Whether a search on the user's last name lists its row. */
  async isListed(displayName: string): Promise<boolean> {
    await this.searchFor(userSearchKey(displayName));
    return this.isRowVisible(displayName);
  }

  /** Searches for `term` and returns whether the row of user `id` is shown. */
  async isListedById(id: string, term: string): Promise<boolean> {
    await this.searchFor(term);
    return this.isRowShownById(id);
  }

  /** One row's values (by user id; reveal it first). */
  async readRowById(id: string): Promise<UserRowValues> {
    const out = {} as UserRowValues;
    for (const [key, column] of Object.entries(USER_COLUMN) as [keyof typeof USER_COLUMN, string][]) {
      out[key] = (await this.byId(`${this.screen}-table-row-${id}-cell-${column}`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    }
    return out;
  }

  async readRows(): Promise<Array<UserRowValues & { id: string }>> {
    return this.readRowsOnScreen(USER_COLUMN) as unknown as Promise<Array<UserRowValues & { id: string }>>;
  }

  async readColumn(column: keyof typeof USER_COLUMN): Promise<string[]> {
    return (await this.readRows()).map((r) => r[column]);
  }

  // ---- KPI tiles ------------------------------------------------------------------------

  async readKpi(kpi: UserKpiKey): Promise<number> {
    return settledNumber(this.byId(`${USER_LIST.kpi[kpi]}-value`));
  }

  /** Every tile: label, settled value, the tile's full text (Pending Approval's caption) and whether it sits in a button. */
  async readKpis(): Promise<Record<UserKpiKey, { label: string; value: number; text: string; clickable: boolean }>> {
    const out = {} as Record<UserKpiKey, { label: string; value: number; text: string; clickable: boolean }>;
    for (const [key, id] of Object.entries(USER_LIST.kpi) as [UserKpiKey, string][]) {
      out[key] = {
        label: (await this.byId(`${id}-label`).innerText().catch(() => '')).trim(),
        value: await settledNumber(this.byId(`${id}-value`)).catch(() => NaN),
        text: (await this.byId(id).innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
        clickable: (await this.byId(`${id}-button`).count()) > 0,
      };
    }
    return out;
  }

  /** The tiles' answer through the API. */
  async fetchDashboard(): Promise<UserDashboard> {
    return readUserDashboard(this.page);
  }

  /** Reloads and returns the GetUsersDashboard answer the reload fetched. */
  async reloadCapturingDashboard(): Promise<UserDashboard | null> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: UserDashboard }>(this.page, /\/GetUsersDashboard$/, () => this.reload());
    await this.waitForRowsRendered().catch(() => undefined);
    return body?.payload ?? null;
  }

  /** Clicks a tile (Total / Active / Inactive) -> the list request (its `isActive`) and answer. */
  async clickKpi(kpi: UserKpiFilter): Promise<{ request: Record<string, unknown>; answer: IdentityListAnswer<UserListItem> }> {
    let request: Record<string, unknown> = {};
    const answer = await this.captureList(async () => {
      request = await this.captureListRequest(() => this.byId(USER_LIST.kpiButton[kpi]).click());
    });
    return { request, answer };
  }

  /** Clicks the Pending Approval tile (it has no button) and reports whether anything navigated or re-queried. */
  async clickPendingApproval(): Promise<{ urlBefore: string; urlAfter: string; listRequested: boolean }> {
    const urlBefore = this.page.url();
    const requested = this.page.waitForRequest((r) => /\/GetUsers$/.test(r.url()), { timeout: Timeouts.short }).then(() => true).catch(() => false);
    await this.byId(USER_LIST.kpi.pendingApproval).click();
    const listRequested = await requested;
    return { urlBefore, urlAfter: this.page.url(), listRequested };
  }

  // ---- sort / row actions ---------------------------------------------------------------

  async sortByOption(option: UserSortOption): Promise<{ request: Record<string, unknown>; answer: IdentityListAnswer<UserListItem> }> {
    return this.sortBy(USER_SORT_OPTION[option]);
  }

  async getActionState(id: string, action: UserRowAction): Promise<{ availability: 'absent' | 'disabled' | 'available'; label: string }> {
    return this.getRowActionState(id, USER_ROW_ACTION[action]);
  }

  async clickAction(id: string, action: UserRowAction): Promise<void> {
    await this.clickIdentityRowAction(id, USER_ROW_ACTION[action]);
  }

  /** Add User -> the drawer on step 1. */
  async openAddForm(): Promise<UserFormDrawer> {
    await this.btn(USER_LIST.addButton).click();
    const drawer = new UserFormDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  async isAddOffered(): Promise<boolean> {
    return this.byId(USER_LIST.addButton).isVisible().catch(() => false);
  }

  /** Row Edit -> the drawer (step 1, loaded). */
  async openEditForm(id: string): Promise<UserFormDrawer> {
    const loaded = this.page.waitForResponse((r) => r.url().endsWith('/Users/GetUser'), { timeout: Timeouts.default }).catch(() => null);
    await this.clickAction(id, 'edit');
    await loaded;
    const drawer = new UserFormDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** Row Assign Roles & Payers -> the same drawer, on step 3. */
  async openAssign(id: string): Promise<UserFormDrawer> {
    const loaded = this.page.waitForResponse((r) => r.url().endsWith('/Users/GetUser'), { timeout: Timeouts.default }).catch(() => null);
    await this.clickAction(id, 'assign');
    await loaded;
    const drawer = new UserFormDrawer(this.page);
    await drawer.waitForOpen();
    await this.page.waitForTimeout(500);
    return drawer;
  }

  /** Row Inactivate -> the Deactivate User drawer. */
  async openDeactivate(id: string): Promise<UserDeactivateDrawer> {
    await this.clickAction(id, 'toggleActivation');
    const drawer = new UserDeactivateDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Row Activate -> the "Activate User?" dialog (left open). */
  async requestActivate(id: string): Promise<{ title: string; message: string; actions: string[] }> {
    await this.clickAction(id, 'toggleActivation');
    await this.page.locator('#pbm-dialog').waitFor({ state: 'visible', timeout: Timeouts.default });
    const d = await readDialog(this.page);
    return { title: d.title, message: d.message, actions: d.actions };
  }

  /** Row Activate + confirm -> ToggleUserActivation's answer and the toasts. */
  async activateUser(id: string): Promise<UserWriteAnswer> {
    await this.requestActivate(id);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.userToggleActivation, () => clickDialogAction(this.page, 'confirm'));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await toastMessages(this.page) };
  }

  /** Row Delete -> the "Delete User" dialog (left open). */
  async requestDelete(id: string): Promise<{ title: string; message: string; actions: string[] }> {
    await this.clickAction(id, 'delete');
    await this.page.locator('#pbm-dialog').waitFor({ state: 'visible', timeout: Timeouts.default });
    const d = await readDialog(this.page);
    return { title: d.title, message: d.message, actions: d.actions };
  }

  /** Row Delete + Yes -> DeleteUser's answer and the toasts. */
  async deleteUser(id: string): Promise<UserWriteAnswer> {
    await this.requestDelete(id);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.userDelete, () => clickDialogAction(this.page, 'confirm'));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await toastMessages(this.page) };
  }

  /** Row View -> the profile page URL. */
  async openProfile(id: string): Promise<string> {
    await this.clickAction(id, 'view');
    await this.page.waitForURL(/\/profile\//, { timeout: Timeouts.navigation });
    return this.page.url();
  }
}
