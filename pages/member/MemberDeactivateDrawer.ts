import type { Page } from '@playwright/test';
import { NetworkInactivateDialog } from '../network/NetworkInactivateDialog';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { TOAST } from '../../constants/ElementIds';
import { MEMBER_DEACTIVATE, type MemberDeactivateHost } from '../../constants/member/memberIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';

/**
 * The Deactivate Member drawer - the shared deactivate component (as
 * Facility's), under the LIST's `member-deactivate-drawer` or the DETAIL's
 * `member-detail-deactivate-drawer` (verified live 2026-11-05): title
 * "Deactivate Member", warning "Deactivate {name}? They will no longer be
 * available for new enrollments. Existing enrolments are not changed — each
 * policy keeps its own status.", Deactivation Reason* (lookup
 * memberDeactivationReason: Coverage Ended, Employment Ended, Relocated
 * Abroad, Duplicate Record, Member Request, Suspected Fraud, Other), Details
 * (required for Other: 'Details are required when the reason is "Other".'),
 * Cancel / Deactivate. Confirming sends SetMemberActive `{ id, isActive: false,
 * inactivationReasonId, inactivationDetails }` and applies AT ONCE: toast
 * "Member deactivated / The member has been deactivated.".
 */
export class MemberDeactivateDrawer extends NetworkInactivateDialog {
  constructor(private readonly memberPage: Page, host: MemberDeactivateHost = 'detail') {
    super(memberPage, MEMBER_DEACTIVATE[host]);
  }

  /** Chooses a reason (or the first), types details, confirms; returns SetMemberActive's answer and the messages shown. */
  async deactivate(details = 'Deactivated by the automation suite.', reason?: string): Promise<{ status: number; text: string; messages: string[] }> {
    if (reason) await this.selectReason(reason);
    else await this.selectFirstReason();
    if (details) await this.fillDetails(details);
    const answer = await NetworkUtils.captureResponse(this.memberPage, ApiEndpoints.memberSetActive, () => this.confirm());
    const messages = await WaitUtils.settleMessages(async () => (await this.memberPage.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages };
  }
}
