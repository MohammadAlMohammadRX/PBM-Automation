import type { Page } from '@playwright/test';
import { IdentityListPage } from './IdentityListPage';
import { InvitationFormDrawer } from './InvitationFormDrawer';
import { clickDialogAction, readDialog, toastMessages } from './userCommon';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  INVITATION_ADVANCED_SEARCH,
  INVITATION_ADVANCED_SELECTS,
  INVITATION_CARD,
  INVITATION_COLUMN,
  INVITATION_LIST,
  INVITATION_ROW_ACTION,
  INVITATION_SORT_OPTION,
  type InvitationRowAction,
  type InvitationSortOption,
} from '../../constants/user/userIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import type { InvitationItem } from '../../utils/UserProvisioning';

export type InvitationRowValues = Record<keyof typeof INVITATION_COLUMN, string>;

/**
 * Invitations (`/users-management/invitations`, verified 2026-11-08): toolbar
 * search, Filters (Advance Search: Email, Role, Payer, Expiration, Status -
 * Pending / Active / Paused / Completed / Expired / Pending Approval /
 * Rejected; the request carries `status` as an enum NUMBER, Pending = 0),
 * "Approvals List (N)" (-> /approval-management?tab=invitation), Sort By (Newest
 * default, Oldest, Email, Role, Expiration, Status, Last Modified), Export
 * (Selected / All -> CSV / Excel, `Invitations_YYYYMMDD_HHmmss`: Email, Role
 * Name, Status, Payer Id, Expires On, Accepted On, Created On), Add Invitation;
 * table Email / Role / Payer / Expiration (DD/MM/YYYY HH:mm) / Status / Actions
 * (Pending: Pause, Resend, Delete; others: Resend, Delete - Completed ones
 * disabled); cards (`invitation-card-{id}`). Statuses shown: Pending,
 * Completed (not "Approved"), Rejected, Expired.
 */
export class InvitationListPage extends IdentityListPage<InvitationItem> {
  constructor(page: Page) {
    super(page, {
      screen: INVITATION_LIST.screen,
      route: AppRoutes.invitations,
      listCall: 'GetInvitations',
      payloadKey: 'invitations',
      exportCall: ApiEndpoints.invitationExport,
      advancedField: INVITATION_ADVANCED_SEARCH.field,
      advancedSelects: INVITATION_ADVANCED_SELECTS,
      cardPrefix: INVITATION_CARD.prefix,
      placeholderClass: 'inv-list__placeholder',
    });
  }

  protected firstColumn(): string {
    return INVITATION_COLUMN.email;
  }

  async readRowById(id: string): Promise<InvitationRowValues> {
    const out = {} as InvitationRowValues;
    for (const [key, column] of Object.entries(INVITATION_COLUMN) as [keyof typeof INVITATION_COLUMN, string][]) {
      out[key] = (await this.byId(`${this.screen}-table-row-${id}-cell-${column}`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    }
    return out;
  }

  async readRows(): Promise<Array<InvitationRowValues & { id: string }>> {
    return this.readRowsOnScreen(INVITATION_COLUMN) as unknown as Promise<Array<InvitationRowValues & { id: string }>>;
  }

  /** Searches for the e-mail and waits for its row. */
  async revealRow(email: string): Promise<void> {
    if (await this.rowByText(email).isVisible().catch(() => false)) return;
    await this.searchFor(email);
    await this.waitForRowVisible(email);
  }

  async sortByOption(option: InvitationSortOption): Promise<{ request: Record<string, unknown>; answer: { items: InvitationItem[]; totalRows: number } }> {
    return this.sortBy(INVITATION_SORT_OPTION[option]);
  }

  async getActionState(id: string, action: InvitationRowAction): Promise<{ availability: 'absent' | 'disabled' | 'available'; label: string }> {
    return this.getRowActionState(id, INVITATION_ROW_ACTION[action]);
  }

  /** "Approvals List (N)" - its label (with the count). */
  async readApprovalsButton(): Promise<string> {
    return (await this.byId(INVITATION_LIST.approvalsButton).innerText().catch(() => '')).trim();
  }

  /** "Approvals List (N)" -> the URL it opened. */
  async openApprovals(): Promise<string> {
    await this.btn(INVITATION_LIST.approvalsButton).click();
    await this.page.waitForURL(/approval-management/, { timeout: Timeouts.navigation });
    return this.page.url();
  }

  async isAddOffered(): Promise<boolean> {
    return this.byId(INVITATION_LIST.addButton).isVisible().catch(() => false);
  }

  /** Add Invitation -> the drawer. */
  async openAddForm(): Promise<InvitationFormDrawer> {
    await this.btn(INVITATION_LIST.addButton).click();
    const drawer = new InvitationFormDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Row Delete -> the dialog (left open). */
  async requestDelete(id: string): Promise<{ title: string; message: string; actions: string[] }> {
    await this.clickIdentityRowAction(id, INVITATION_ROW_ACTION.delete);
    await this.page.locator('#pbm-dialog').waitFor({ state: 'visible', timeout: Timeouts.default });
    const d = await readDialog(this.page);
    return { title: d.title, message: d.message, actions: d.actions };
  }

  /** Row Delete + confirm -> DeleteInvitation's answer and the toasts. */
  async deleteInvitation(id: string): Promise<{ status: number; text: string; messages: string[] }> {
    await this.requestDelete(id);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.invitationDelete, () => clickDialogAction(this.page, 'confirm'));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await toastMessages(this.page) };
  }
}
