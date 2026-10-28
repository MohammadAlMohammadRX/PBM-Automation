import type { Page } from '@playwright/test';
import { NetworkInactivateDialog } from '../network/NetworkInactivateDialog';
import { PLAN_INACTIVATE } from '../../constants/ElementIds';

/**
 * The "Inactivate Plan" drawer (`plan-inactivate-dialog`), verified 2026-10-27:
 * a Reason select (Contract Ended / Payer Request / Regulatory Action / Replaced
 * by New Plan / Other), optional Details, the "Needs approval" notice, Cancel and
 * Inactivate. Saving calls POST /api/Plans/InactivatePlan and stages a draft that
 * is sent for approval like any other plan change.
 *
 * It is the network drawer's component under the plan namespace, so the
 * behaviour is NetworkInactivateDialog's with the plan ids.
 */
export class PlanInactivateDialog extends NetworkInactivateDialog {
  constructor(page: Page) {
    super(page, PLAN_INACTIVATE);
  }
}
