import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PolicyTabTable } from './PolicyTabTable';
import { PolicyMemberDrawer } from './PolicyMemberDrawer';
import { PolicyImportDialog } from './PolicyImportDialog';
import { MemberAccumulatorPage } from './MemberAccumulatorPage';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { POLICY_IMPORT, POLICY_MEMBERS, POLICY_MEMBER_COLUMN, buttonSelector, type PolicyMemberColumn } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import { readPolicyMembers, type PolicyMember } from '../../utils/PolicyProvisioning';

/**
 * The Members tab (verified live 2026-11-03): "Members  n / limit" (or "n /
 * Unlimited"), Export, Import, Add Member, the search box ("Search by member
 * number, name or document ID") with its advanced search (Member Number, Name,
 * Document ID, Relationship incl. Self), and the table: Member Number, Name,
 * Relationship, Document ID, State (Enrolled, Draft Enrollment, Pending
 * Enrollment, Draft Removal, Pending Removal), Actions (View Accumulator,
 * Remove - neither shown on a row awaiting removal).
 *
 * Add Member is DISABLED on a Group policy that is not Active ("Members can be
 * added once the group policy is active."); on an Individual draft it works.
 * Rows are `policy-detail-members-table-row-{policyMemberId}`.
 */
export class PolicyMembersTab extends PolicyTabTable<PolicyMemberColumn> {
  constructor(page: Page) {
    super(page, 'members', POLICY_MEMBERS, POLICY_MEMBER_COLUMN, /\/GetPolicyMembers$/);
  }

  /** A row by the member's number (MBR-...). */
  rowOf(memberCode: string): Locator {
    return this.rowWhere('number', memberCode);
  }

  /** The tab panel's text above the table (count chip, "Members can be added once ..."). */
  async getPanelHeaderText(): Promise<string> {
    // locator-exception: the count chip and the group hint carry no id; read from the tab panel that holds the Add button.
    const panel = this.page.locator('.policy-detail__panel').filter({ has: this.page.locator(`#${POLICY_MEMBERS.addButton}`) }).first();
    return (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The count chip: "0 / 10" with a limit, "0 · Unlimited" without one (live 2026-11-03); '' when not found. */
  async readCountChip(): Promise<string> {
    // "0 / 10" with a limit, "0 · Unlimited" without one (live 2026-11-03).
    const match = (await this.getPanelHeaderText()).match(/Members\s+(\d+\s*[/·]\s*(?:\d+|Unlimited))/);
    return match ? match[1].replace(/\s+/g, ' ') : '';
  }

  async getAddAvailability(): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.page.locator(buttonSelector(POLICY_MEMBERS.addButton)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async openAdd(): Promise<PolicyMemberDrawer> {
    await this.page.locator(buttonSelector(POLICY_MEMBERS.addButton)).first().click();
    const drawer = new PolicyMemberDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** The state badge of a member's row ("Enrolled", "Draft Removal" ...). */
  async readState(memberCode: string): Promise<string> {
    return (await this.rowOf(memberCode).locator(`[id="${POLICY_MEMBERS.stateBadge}"]`).innerText().catch(() => '')).trim();
  }

  /** Which row actions a member's row offers ('absent' | 'disabled' | 'available'). */
  async getRowActionAvailability(memberCode: string, action: 'viewAccumulator' | 'remove'): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.rowOf(memberCode).locator(buttonSelector(POLICY_MEMBERS[action])).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /** Clicks Remove on a member's row and leaves "Delete Member" open. */
  async requestRemove(memberCode: string): Promise<ConfirmDialog> {
    await this.rowOf(memberCode).locator(buttonSelector(POLICY_MEMBERS.remove)).first().click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Remove + confirm; returns RemovePolicyMember's answer (a published policy stages the removal). */
  async removeMember(memberCode: string): Promise<{ status: number; text: string; messages: string[] }> {
    Logger.step(`Removing member ${memberCode}`);
    const dialog = await this.requestRemove(memberCode);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.policyRemoveMember, async () => { await dialog.confirmWithFollowUps(); });
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  /** View Accumulator on a member's row -> the Member Benefit Accumulator page. */
  async openAccumulator(memberCode: string): Promise<MemberAccumulatorPage> {
    await this.rowOf(memberCode).locator(buttonSelector(POLICY_MEMBERS.viewAccumulator)).first().click();
    const page = new MemberAccumulatorPage(this.page);
    await page.waitForLoaded();
    return page;
  }

  /** The Members tab's Import drawer (`policy-detail-bulk-import`). */
  async openImport(): Promise<PolicyImportDialog> {
    const dialog = new PolicyImportDialog(this.page, POLICY_IMPORT.detail);
    await dialog.closeIfOpen();
    await this.page.locator(buttonSelector(POLICY_MEMBERS.importTrigger)).first().click();
    await dialog.waitForOpen();
    return dialog;
  }

  async isImportOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(POLICY_MEMBERS.importTrigger)).first().isVisible().catch(() => false);
  }

  /** Waits until a member's row shows `state`. */
  async expectState(memberCode: string, state: string | RegExp): Promise<void> {
    await expect(this.rowOf(memberCode).locator(`[id$="-cell-${POLICY_MEMBER_COLUMN.state}"]`), `${memberCode} should read ${String(state)}`).toHaveText(state, { timeout: Timeouts.default });
  }

  async fetchMembers(policyId: string): Promise<PolicyMember[]> {
    return readPolicyMembers(this.page, policyId);
  }
}
