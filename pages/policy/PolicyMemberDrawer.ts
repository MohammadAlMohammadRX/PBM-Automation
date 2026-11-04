import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { POLICY_MEMBER_DRAWER, TOAST, buttonSelector } from '../../constants/ElementIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** One result of the member picker. */
export interface PickerResult {
  name: string;
  documentId: string;
}

/** What Save answered (status -1 = nothing sent) with the body sent and the messages shown. */
export interface MemberSaveAnswer {
  status: number;
  text: string;
  body: Record<string, unknown> | null;
  messages: string[];
}

/**
 * The Add Member drawer (`policy-member-form-drawer`), verified live 2026-11-03.
 *
 * Member: a search box ("Search by name or document ID…", results from TWO
 * characters - GetPolicyMemberCandidates `?policyId&searchText`) listing every
 * member of the system with initials, name and document id; enrolled members
 * are NOT left out. Picking one shows "Selected Policy Holder <name> Document
 * ID: <id> Change". Relationship: Spouse, Child, Parent, Other (required).
 * Errors "Select a member." / "This field is required.". Save sends
 * AddPolicyMember `{ policyId, memberId, relationshipId, confirmRevertToDraft }`;
 * on a PENDING policy "Return this policy to draft?" is raised first.
 *
 * The picker's results carry NO id (`li[role=option].patient-picker__result`):
 * they are read inside the drawer (locator-exception below).
 */
export class PolicyMemberDrawer {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private drawer(): Locator {
    return this.page.locator(`#${POLICY_MEMBER_DRAWER.root}`).first();
  }

  /** locator-exception: the picker's result rows carry no id; read inside the drawer. */
  private results(): Locator {
    return this.drawer().locator('li[role="option"]');
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(POLICY_MEMBER_DRAWER.title), 'the Add Member drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(POLICY_MEMBER_DRAWER.title).isVisible();
  }

  async getText(): Promise<string> {
    return (await this.drawer().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Types into the picker and waits for its answer; returns the results shown. */
  async search(term: string): Promise<PickerResult[]> {
    Logger.step(`Member picker: searching "${term}"`);
    const input = this.byId(POLICY_MEMBER_DRAWER.search);
    const answered = term.length >= 2
      ? this.page.waitForResponse((r) => /GetPolicyMemberCandidates/.test(r.url()), { timeout: Timeouts.default }).catch(() => null)
      : Promise.resolve(null);
    await input.click();
    await input.fill('');
    await input.pressSequentially(term, { delay: 60 });
    await answered;
    await this.page.waitForTimeout(300);
    return this.readResults();
  }

  async readResults(): Promise<PickerResult[]> {
    return this.results().evaluateAll((items) => items.map((li) => {
      const name = (li.querySelector('[class*="result-name"]') as HTMLElement | null)?.innerText.trim() ?? '';
      const documentId = (li.querySelector('[class*="result-meta"]') as HTMLElement | null)?.innerText.trim() ?? '';
      return { name, documentId };
    }));
  }

  /** The picker's message when it shows no results ("Type at least 2 characters to search.", "No members found."). */
  async getPickerMessage(): Promise<string> {
    const text = await this.getText();
    const match = text.match(/(Type at least 2 characters to search\.|No members found\.|Searching…)/);
    return match ? match[1] : '';
  }

  /** Picks the result whose name or document id contains `text` (the first result when omitted). */
  async pick(text?: string): Promise<void> {
    const target = text ? this.results().filter({ hasText: text }).first() : this.results().first();
    await target.click();
    await expect(this.drawer(), 'the picked member should show as selected').toContainText(/Selected/, { timeout: Timeouts.default });
  }

  async chooseRelationship(label: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(POLICY_MEMBER_DRAWER.relationship), label);
  }

  async getRelationshipOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(POLICY_MEMBER_DRAWER.relationship));
  }

  /** "Select a member." / "This field is required." */
  async getErrors(): Promise<{ member: string; relationship: string }> {
    const read = (id: string) => this.byId(id).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    return { member: await read(POLICY_MEMBER_DRAWER.memberError), relationship: await read(POLICY_MEMBER_DRAWER.relationshipError) };
  }

  /** Clicks Save (confirming a "Return to draft?" prompt) and reports AddPolicyMember's answer. */
  async attemptSave(confirmRevert = true): Promise<MemberSaveAnswer> {
    const answered = this.page.waitForResponse((r) => /\/AddPolicyMember$/.test(new URL(r.url()).pathname), { timeout: Timeouts.default }).catch(() => null);
    await this.page.locator(buttonSelector(POLICY_MEMBER_DRAWER.save)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) {
      if (confirmRevert) await dialog.confirmWithFollowUps().catch(() => undefined);
      else await dialog.cancel().catch(() => undefined);
    }
    const response = await answered;
    let body: Record<string, unknown> | null = null;
    try { body = response ? (response.request().postDataJSON() as Record<string, unknown>) : null; } catch { body = null; }
    const messages = await WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${POLICY_MEMBER_DRAWER.root}-"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
    });
    return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', body, messages };
  }

  /** Search + pick + relationship + Save. */
  async addMember(term: string, relationship = 'Spouse', pickText?: string): Promise<MemberSaveAnswer> {
    await this.search(term);
    await this.pick(pickText);
    await this.chooseRelationship(relationship);
    return this.attemptSave();
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(POLICY_MEMBER_DRAWER.cancel)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) await dialog.discardChanges();
    await expect(this.byId(POLICY_MEMBER_DRAWER.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
