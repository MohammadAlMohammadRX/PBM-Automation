import type { Page } from '@playwright/test';
import { setCheckbox } from '../components/PrimeControls';
import { PolicyFormDrawer, type PolicyCoverage, type PolicySaveAnswer } from './PolicyFormDrawer';
import { Timeouts } from '../../constants/Timeouts';
import { POLICY_FORM } from '../../constants/ElementIds';

/** The "What to bring across" check boxes. */
export type CloneContent = 'includeMembers' | 'includeNetworks' | 'includeDocumentation';

/**
 * The Clone Policy drawer (`policy-clone-drawer`) - the policy form under its
 * clone namespace, verified live 2026-11-03.
 *
 * Step 1: "Cloning a policy: This creates a NEW policy from "<source>" ...", the
 * name pre-filled "<source> (Clone)", type and plan pre-selected, the payer a
 * read-only tag, the holder, and "What to bring across" - Enrolled members (n),
 * Assigned networks (n), Documentation with attachments (n), all ticked by
 * default (unpublished source: "only its details will be cloned"). Step 2: the
 * coverage fields pre-filled, the effective / expiry dates BLANK, "The selected
 * plan is in force for ... The period below has to overlap it.", Back / Save.
 * Save sends ClonePolicy (GetPolicyForClone fills the drawer when it opens).
 */
export class PolicyCloneDrawer extends PolicyFormDrawer {
  /** The detail's clone drawer by default; the LIST clones in its own form drawer (`policy-form-drawer` in clone mode). */
  constructor(page: Page, namespace: string = POLICY_FORM.clone) {
    super(page, namespace);
  }

  protected saveEndpoint(): RegExp {
    return /\/ClonePolicy$/;
  }

  /** The source message of step 1. */
  async getSourceMessage(): Promise<string> {
    return (await this.byId(POLICY_FORM.cloneSourceMessage).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The hint under the check boxes ("These are copied now, onto the new draft ..."). */
  async getTimingHint(): Promise<string> {
    return (await this.byId(POLICY_FORM.cloneTimingHint).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Every `-blocked-` / `-hint` text under the contents (none / left-out / unpublished). */
  async getContentHints(): Promise<string[]> {
    const hints = await this.page.locator(`[id^="${this.namespace}-clone-"][id$="-hint"], [id^="${this.namespace}-"][id*="blocked"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
    return hints.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
  }

  /** Step 2's plan-period hint. */
  async getPlanPeriodHint(): Promise<string> {
    return (await this.byId(POLICY_FORM.clonePlanPeriodHint).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  private box(content: CloneContent) {
    return this.byId(POLICY_FORM[content]);
  }

  async isIncluded(content: CloneContent): Promise<boolean> {
    return this.box(content).isChecked();
  }

  async isIncludeEnabled(content: CloneContent): Promise<boolean> {
    return this.box(content).isEnabled();
  }

  async setIncluded(content: CloneContent, value: boolean): Promise<void> {
    await setCheckbox(this.box(content), value);
  }

  /** The label beside a box ("Enrolled members (3)"). */
  async getIncludeLabel(content: CloneContent): Promise<string> {
    const id = this.id(POLICY_FORM[content]);
    return (await this.page.locator(`label[for="${id}"]`).innerText().catch(() => '')).trim();
  }

  /** Names (optional), Next, the period, Save - returns ClonePolicy's answer. */
  async clone(coverage: PolicyCoverage, names: { nameEn?: string; nameAr?: string } = {}): Promise<PolicySaveAnswer> {
    if (names.nameEn !== undefined) await this.type('nameEn', names.nameEn);
    if (names.nameAr !== undefined) await this.type('nameAr', names.nameAr);
    if (!(await this.next())) return { status: -1, text: '', messages: await this.getMessages(), body: null };
    await this.fillCoverage(coverage);
    return this.attemptSave();
  }
}
