/**
 * US 20984 "Activate and Deactivate Trigger" (notification folder 07, 4 cases) - Writer A.
 *
 * How it works in this build (foundation probe e11-e13, 2026-11-11): a custom
 * row's Activate / Deactivate opens `pbm-dialog` "Activate trigger" /
 * "Deactivate trigger" with "Are you sure you want to activate <name>?", No /
 * Yes; Yes sends ToggleTriggerActivation { id, isActive } (answer "Trigger
 * configuration deactivated successfully.") and the probe saw the toast
 * "Saved successfully.". The AC quotes "Deactivated successfully." - asserted
 * as written (lead decision 3), so the probe's toast would stay a FINDING.
 *
 * SAFETY: every trigger toggled is a suite trigger on a free action
 * (TC examples "Order Confirmation Email" / "Payment Failure Alert" = examples,
 * lead decision 2 - carried in the suite name, shortened to 50 characters).
 * "Active" suite triggers live only for the test (teardown deletes them).
 *
 * Literal readings / decisions:
 * - "status changes to Inactive / remains Active" = the row's Active cell
 *   ("✗" / "✓"), its toggle label (Activate / Deactivate) and GetTrigger isActive.
 * - "no success message is shown" = no toast within a few seconds of No.
 * - The dialog message is asserted exactly: "Are you sure you want to deactivate
 *   <the trigger's own name>?" (21379, 21381, 21392) / "...activate <name>?" (21383).
 * - "stops sending notifications" (21379 expected result) is the subject of
 *   21386 / 21387 (not in this round).
 */
export const CASES = {
  deactivateConfirm: { azureId: 21379, label: 'Order Confirmation Email' },
  deactivateDecline: { azureId: 21381, label: 'Order Confirmation Email' },
  activateDecline: { azureId: 21383 },
  dialogNamesTrigger: { azureId: 21392, label: 'Payment Failure Alert', otherLabel: 'Order Confirmation Email' },
} as const;

export const MESSAGE = {
  deactivateTitle: 'Deactivate trigger',
  activateTitle: 'Activate trigger',
  deactivateQuestion: (name: string): string => `Are you sure you want to deactivate ${name}?`,
  activateQuestion: (name: string): string => `Are you sure you want to activate ${name}?`,
  deactivated: 'Deactivated successfully.',
  activateLabel: 'Activate',
  deactivateLabel: 'Deactivate',
} as const;

export const ACTIVE_MARK = '✓';
export const INACTIVE_MARK = '✗';
