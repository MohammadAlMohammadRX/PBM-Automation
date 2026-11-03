import { SUITE_FORMULARY_PREFIX } from '../../utils/FormularyProvisioning';
import { textOfLength } from './formulary.data';
import { fullAccessWithout, SCOPED_PAYER, TIER_WRITE_RIGHTS, TRADE_WRITE_RIGHTS } from './formularyPermissions.data';
import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 15196 "Edit Formulary" (formulary folder 06).
 *
 * A formulary's own details are edited through Edit Metadata (detail header)
 * or a list row's Edit - the story allows both, but only while the formulary
 * is a v0 draft. Tiers, trades, price history and benefit configurations stay
 * editable on a published formulary, through the approval gate.
 *
 * Literal readings (noted per the brief):
 * - 18646 / 18648 / 18649 "the list Edit action": the live list row offers View
 *   / Clone / Send for Approval / Deactivate / Delete (2026-11-02) - the Edit
 *   control is looked for under the row's own id namespace
 *   (constants/formulary/writerCIds FORMULARY_ROW_EDIT); its absence on a
 *   draft is the finding.
 * - 18648: Expired cannot be produced on demand - an EXISTING Expired formulary
 *   is only looked at (read-only); with none in the register the case is BLOCKED.
 * - 18650 / 18652 "the change is submitted for approval": every change to a
 *   published formulary is staged in its draft first (Send for Approval sends
 *   it), so "routed through the approval gate" is read as: staged, not live -
 *   the formulary carries a draft or pending version afterwards.
 * - 18651 "the original data remains unchanged pending approval": on a never
 *   published (v0) formulary there is no live data to keep; nothing has taken
 *   effect while it is still Not Live with no published version. After the
 *   approval the new data is the published data.
 * - 18654: the rejected edit is a staged change on an ACTIVE formulary
 *   (fixture state PendingChange), so "reverts to its original data and status"
 *   can be observed: still Active with the published values, and the
 *   rejection recorded with its reason.
 * - 18658: "a user without edit permission" is the Payer Admin role shaped
 *   without UpdateFormulary and the tier / trade write rights.
 * - 18659 "two administrators": two windows of the one administrator session
 *   (there is one administrator account); the second save carries a stale form.
 * - 18660 "navigate away": closing the Edit drawer with its X.
 */
export const CASES = {
  listEdit: { azureId: '18646', description: 'Edited from the list by the automation suite.' },
  detailEdit: { azureId: '18647', description: 'Edited from the view page by the automation suite.' },
  editOnlyInDraft: { azureId: '18648' },
  publishedListEdit: { azureId: '18649' },
  publishedBenefitEdit: { azureId: '18650', copayment: 22 },
  noEffectUntilApproved: { azureId: '18651', description: 'Pending metadata edit by the automation suite.' },
  publishedPriceEdit: { azureId: '18652', supplierPrice: 14 },
  draftToApproved: { azureId: '18653', description: 'Edited before submission by the automation suite.' },
  rejectedEdit: { azureId: '18654' },
  requiredOnEdit: { azureId: '18655' },
  // "Consistent with create-time rules": the create limit is 255 (18590/18591).
  // The field sets no maxlength, so 100 (the case's "e.g.") tested the wrong limit (2026-11-02).
  nameLengthOnEdit: { azureId: '18656', maxFallback: 255 },
  invalidFormatOnEdit: { azureId: '18657', invalidDate: '31/02/2026 25:99' },
  editPermission: {
    azureId: '18658',
    payerName: SCOPED_PAYER,
    shape: fullAccessWithout('edit', ...TIER_WRITE_RIGHTS, ...TRADE_WRITE_RIGHTS, 'benefitAdd', 'benefitUpdate', 'benefitDelete'),
  },
  concurrentEdit: { azureId: '18659', first: 'Concurrent edit A by the automation suite.', second: 'Concurrent edit B by the automation suite.' },
  unsavedEdit: { azureId: '18660', unsaved: 'Unsaved edit that must be discarded.' },
  benefitThroughApproval: { azureId: '18661', copayment: 27 },
} as const;

/** A suite name of exactly `length` characters (keeps the prefix, so teardown still owns it). */
export const suiteNameOfLength = (length: number): string => `${SUITE_FORMULARY_PREFIX} ${textOfLength(Math.max(length - SUITE_FORMULARY_PREFIX.length - 1, 1), 'N')}`.slice(0, length);

/** The discard prompt the story quotes. */
export const UNSAVED_PROMPT = { title: /Unsaved Changes/i, message: /You have unsaved changes\. If you leave now, your edits will be lost\./i } as const;

/** A concurrency refusal or warning. */
export const CONFLICT = /modified|changed by another|concurren|stale|refresh|conflict|updated by|out of date|someone else/i;

/** "Unable to load" etc. for a format error. */
export const INVALID_FORMAT = /invalid|format|valid date|required/i;

/** Labels of the lifecycle states 18648 checks (beyond Draft). */
export const NOT_DRAFT_STATES = ['Future', 'PendingApproval', 'Inactive'] as const;

export const BLOCKED_CASES: FormularyBlockedCase[] = [];
