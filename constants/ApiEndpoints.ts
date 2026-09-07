/**
 * Application HTTP endpoints the framework needs to name.
 *
 * A test should assert against the UI, not against the API - so this file is
 * deliberately small and exists for the three cases where the endpoint IS the
 * thing under test or the only way to reach it:
 *
 *   1. WAITING for a list to re-query, instead of guessing with a timeout
 *      (PayerManagementPage already did this with a private constant; the sort
 *      story's `withListRefresh` is the pattern).
 *   2. FAILING one specific request to prove the UI degrades gracefully, rather
 *      than blanket-failing every request and learning nothing about which
 *      screen reported the error.
 *   3. INSPECTING a shared interface's payload, which one acceptance criterion
 *      asks for in as many words ("inspect the returned payload structure").
 *
 * Every path below was observed in the live application's own network traffic.
 */
export const ApiEndpoints = {
  /** The payer list itself (POST, paged + filtered). */
  payerList: '/api/Payers/GetPayers',

  /**
   * The five dashboard metric counts (POST). Returns
   * `{ total, active, pending, inactive, expired }` - one independently
   * calculated number per counter, which is what the metrics story is about.
   */
  payerDashboard: '/api/Payers/GetPayersDashboard',

  /**
   * The SHARED cross-module payer selection interface (GET) - the one every
   * consuming module's payer dropdown is built from. Returns
   * `[{ id, payerNameEn, payerNameAr, statusId }]`.
   */
  payerDropdown: '/api/Payers/GetPayersDropdown',

  /**
   * The payer Status lookup (GET). Maps a status `code` to the `id` the payer
   * records carry, so a test can name the status it means ("active") instead of
   * hard-coding the GUID the dropdown payload reports.
   */
  payerStatusLookup: '/api/Lookups/Items/payerStatus',

  /**
   * The Version History tab's own feed (POST), fired when the tab is activated.
   *
   * Distinct from `payerList`, and the distinction matters: failing the list
   * endpoint to test the history tab breaks the navigation that reaches the
   * detail screen in the first place and leaves the tab's own error handling
   * unexercised. This is the endpoint to fail for that case.
   */
  payerVersions: '/api/Payers/GetPayerVersions',

  /** The Audit History tab's feed (POST), fired when that tab is activated. */
  payerAuditTrail: '/api/Payers/GetPayerAuditTrail',
} as const;

export type ApiEndpointKey = keyof typeof ApiEndpoints;
