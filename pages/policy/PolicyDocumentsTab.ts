import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PolicyDetailPage } from './PolicyDetailPage';
import { PolicyDocumentDrawer } from './PolicyDocumentDrawer';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { POLICY_DOCUMENTS, TOAST, buttonSelector } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { readPolicyDocuments, type PolicyDocument } from '../../utils/PolicyProvisioning';

/** One documentation card as shown. */
export interface DocumentCard {
  title: string;
  type: string;
  /** "On policy", "Draft Attachment", "Pending Attachment", "Draft Removal", "Pending Removal". */
  state: string;
  description: string;
  /** The meta line: effective date, created on, user. */
  meta: string;
  hasAttachmentLink: boolean;
  deleteOffered: boolean;
}

/**
 * The Documentation tab (the application's "endorsements"), verified live
 * 2026-11-03: "Documentation" + Add Documentation, then a LIST of cards - title,
 * type tag (Rider Addition ...), state badge, description, effective date,
 * created on, user, and a delete icon ("Delete documentation" -> the "Delete
 * Documentation" prompt). There is NO table, NO Edit and NO Status / Approval
 * Status column (story 15175 expects all three - findings). A card awaiting
 * removal shows no delete icon. Empty: "No documentation recorded yet."
 *
 * The cards carry no id (`li.policy-detail__endorsement`); they are found inside
 * the tab panel by title (locator-exception below).
 */
export class PolicyDocumentsTab {
  private readonly detail: PolicyDetailPage;

  constructor(private readonly page: Page) {
    this.detail = new PolicyDetailPage(page);
  }

  /** locator-exception: the documentation cards carry no id; they are the list items of the tab panel holding Add Documentation. */
  private panel(): Locator {
    return this.page.locator('.policy-detail__panel').filter({ has: this.page.locator(`#${POLICY_DOCUMENTS.addButton}`) }).first(); // locator-exception: the panel and its cards carry no id; anchored on the Add Documentation button's id.
  }

  /** locator-exception: see panel(). */
  private cards(): Locator {
    return this.panel().locator('li');
  }

  /** locator-exception: see panel(). */
  card(title: string): Locator {
    return this.cards().filter({ has: this.page.locator('[class*="endorsement-title"]', { hasText: new RegExp(`^\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }) }).first();
  }

  async open(): Promise<void> {
    await this.detail.openTab('documents');
    await expect(this.panel(), 'the Documentation tab should render').toBeVisible({ timeout: Timeouts.default });
    // The panel reads "Loading…" until GetPolicyEndorsements answers.
    await expect(this.panel(), 'the documentation should load').not.toContainText('Loading…', { timeout: Timeouts.default });
  }

  async getPanelText(): Promise<string> {
    return (await this.panel().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async countCards(): Promise<number> {
    await this.detail.waitForPageReady();
    return this.cards().count();
  }

  /** Every card, top to bottom (newest first live). */
  async readCards(): Promise<DocumentCard[]> {
    await this.detail.waitForPageReady();
    return this.cards().evaluateAll((items, ids) => items.map((li) => {
      const text = (sel: string): string => ((li.querySelector(sel) as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
      return {
        title: text('[class*="endorsement-title"]'),
        type: text('[class*="endorsement-type"]'),
        state: text(`[id="${ids.state}"]`),
        description: text('[class*="endorsement-desc"]'),
        meta: text('[class*="endorsement-meta"]'),
        hasAttachmentLink: !!li.querySelector('a[href]'),
        deleteOffered: !!li.querySelector(`[id="${ids.del}"]`),
      };
    }), { state: POLICY_DOCUMENTS.stateBadge, del: POLICY_DOCUMENTS.delete });
  }

  async readCard(title: string): Promise<DocumentCard | undefined> {
    return (await this.readCards()).find((c) => c.title === title);
  }

  async getAddAvailability(): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.page.locator(buttonSelector(POLICY_DOCUMENTS.addButton)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async openAdd(): Promise<PolicyDocumentDrawer> {
    await this.page.locator(buttonSelector(POLICY_DOCUMENTS.addButton)).first().click();
    const drawer = new PolicyDocumentDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Whether a card offers Edit (none does live - kept so the Edit cases can say so). */
  async isEditOffered(title: string): Promise<boolean> {
    // locator-exception: an Edit control would carry no id we know of; any button labelled Edit inside the card counts.
    return (await this.card(title).locator('button, p-button').filter({ hasText: /^\s*Edit\s*$/ }).count()) > 0;
  }

  async requestDelete(title: string): Promise<ConfirmDialog> {
    await this.card(title).locator(`[id="${POLICY_DOCUMENTS.delete}"]`).first().click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Delete + confirm; returns DeletePolicyEndorsement's answer (staged on a published policy). */
  async deleteDocument(title: string): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestDelete(title);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.policyDeleteDocument, async () => { await dialog.confirmWithFollowUps(); });
    const messages = await WaitUtils.settleMessages(async () => (await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== ''));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages };
  }

  async fetchDocuments(policyId: string): Promise<PolicyDocument[]> {
    return readPolicyDocuments(this.page, policyId);
  }
}
