import type { Page } from '@playwright/test';
import { NetworkInactivateDialog } from '../network/NetworkInactivateDialog';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { POLICY_INACTIVATE, TOAST } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';

/**
 * The Inactivate Policy drawer (`policy-inactivate-dialog`) - the network / plan
 * inactivation component under the policy's ids, verified live 2026-11-03:
 * "Needs approval: ... Switching this saves a draft ...", Inactivation Reason
 * (required: Contract Suspended, Payment Issue, Policy Holder Request,
 * Compliance Issue, Other), Details (optional, max 500, "Optional context for
 * the audit trail…"), Cancel / Inactivate. Confirming sends InactivatePolicy
 * `{ id, inactivationReasonId, inactivationDetails, confirmRevertToDraft }` and
 * STAGES the inactivation ("Saved as draft").
 */
export class PolicyInactivateDrawer extends NetworkInactivateDialog {
  constructor(private readonly policyPage: Page) {
    super(policyPage, POLICY_INACTIVATE);
  }

  /** Chooses a reason (or the first), types details, confirms; returns InactivatePolicy's answer and the messages shown. */
  async inactivate(details = 'Inactivated by the automation suite.', reason?: string): Promise<{ status: number; text: string; messages: string[] }> {
    if (reason) await this.selectReason(reason);
    else await this.selectFirstReason();
    if (details) await this.fillDetails(details);
    const answer = await NetworkUtils.captureResponse(this.policyPage, ApiEndpoints.policyInactivate, () => this.confirm());
    const messages = await WaitUtils.settleMessages(async () => (await this.policyPage.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages };
  }
}
