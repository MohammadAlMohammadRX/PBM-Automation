import type { Page } from '@playwright/test';
import { NetworkInactivateDialog } from '../network/NetworkInactivateDialog';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { TOAST } from '../../constants/ElementIds';
import { FACILITY_INACTIVATE, type FacilityInactivateHost } from '../../constants/facility/facilityIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';

/**
 * The Inactivate facility drawer - the shared deactivate component, under the
 * LIST's `facility-deactivate-drawer` or the DETAIL's
 * `facility-detail-deactivate-drawer` (verified live 2026-11-04): title
 * "Inactivate facility", warning "Deactivate {name}? It stays on record but can
 * no longer be selected for networks or referrals. Its licence status and the
 * networks it belongs to are not changed.", Deactivation Reason* (Licence
 * Revoked, Contract Ended, Facility Closed, Relocated, Accreditation Lost,
 * Quality of Care Concern, Other; empty -> "This field is required."),
 * Details (max 500; required for Other: 'Details are required when the reason
 * is "Other".'), Cancel / Inactivate. Confirming sends SetFacilityActive
 * `{ id, isActive: false, inactivationReasonId, inactivationDetails }` and
 * applies AT ONCE (no approval): toast "Facility inactivated / The facility
 * has been inactivated.".
 */
export class FacilityInactivateDrawer extends NetworkInactivateDialog {
  constructor(private readonly facilityPage: Page, host: FacilityInactivateHost = 'detail') {
    super(facilityPage, FACILITY_INACTIVATE[host]);
  }

  /** Chooses a reason (or the first), types details, confirms; returns SetFacilityActive's answer and the messages shown. */
  async inactivate(details = 'Inactivated by the automation suite.', reason?: string): Promise<{ status: number; text: string; messages: string[] }> {
    if (reason) await this.selectReason(reason);
    else await this.selectFirstReason();
    if (details) await this.fillDetails(details);
    const answer = await NetworkUtils.captureResponse(this.facilityPage, ApiEndpoints.facilitySetActive, () => this.confirm());
    const messages = await WaitUtils.settleMessages(async () => (await this.facilityPage.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.trim()).filter((t) => t !== ''));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages };
  }
}
