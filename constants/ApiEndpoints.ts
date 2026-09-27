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
   * One payer's record (POST, `{ payerId }`). VERIFIED: answers 404 for a payer
   * outside the caller's scope - the scope story's Not-Found-not-Forbidden check.
   */
  payerDetail: '/api/Payers/GetPayer',

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

  /**
   * Saving a payer edit (PUT). Named for reason 3 above - the payload IS the
   * evidence for the concurrent-edit story.
   *
   * The application detects a stale save correctly and rejects it with
   * 409 Conflict Detected, but reports NOTHING in the interface: no toast, no
   * inline error, and the drawer stays open as though the click never landed.
   * So the only way to state 'the save was blocked' as distinct from 'the save
   * silently succeeded' is to read this response. The missing message is then
   * asserted separately, and fails - which is the point.
   */
  payerUpdate: '/api/Payers/UpdatePayer',

  /**
   * Staging an inactivation (POST).
   *
   * Named because the guardrail story has to reach it directly: the reason is
   * a dropdown in the UI, so an UNMANAGED reason - which the sheet asks for
   * explicitly - can only be submitted as a request. Its payload is
   * { id, inactivationReasonId, inactivationDetails }.
   */
  payerInactivate: '/api/Payers/InactivatePayer',

  /**
   * Sending a payer for approval (POST).
   *
   * Named so the submission story can FAIL it - the case that arms a server
   * error and checks the interface reports it rather than claiming success.
   * Failing this one endpoint keeps the navigation that reaches the row
   * working, which a blanket fault injection would not.
   */
  payerSubmit: '/api/Payers/SubmitPayerForApproval',

  /**
   * Activating a network (POST), payload { id }.
   *
   * Named because the network-activation story reaches it directly for the two
   * cases the UI cannot express: repeating the call on an already-active network,
   * and calling it with no id at all. Note there is no status FIELD - activation
   * and deactivation are separate endpoints - so an "invalid status value"
   * cannot be submitted through this interface at all.
   */
  networkSetActive: '/api/Networks/SetNetworkActive',

  /** Deactivating a network (POST), the counterpart of networkSetActive. */
  networkSetInactive: '/api/Networks/SetNetworkInactive',

  /**
   * Creating a payer (POST). Named for the same reason as payerUpdate: the
   * response is the only place some rejections appear.
   *
   * A name longer than 255 characters comes back 422 "Form Validation
   * Failure" while the interface shows nothing at all - no toast, no inline
   * error, the drawer simply stays open. So "the oversized name was refused"
   * and "the save silently succeeded" are indistinguishable on screen, and
   * only the response tells them apart.
   */
  payerCreate: '/api/Payers/CreatePayer',

  /**
   * The Inactivate drawer's impact preview (POST), fired when the drawer opens.
   *
   * Named so the impact-analysis story can fail it on its own. VERIFIED: when
   * this call fails the drawer drops its impact section entirely - no message,
   * no gate on Confirm - which is what the "service unavailable" case reports.
   */
  payerImpactPreview: '/api/Payers/GetPayerImpactPreview',

  /**
   * The Linked Policies tab's feed (POST), and the surface the scope story
   * cares about: a payer's policies are payer-scoped data, so a session that
   * may not read them must be refused here and not only on the tab.
   */
  payerLinkedPolicies: '/api/Payers/GetPayerLinkedPolicies',

  /**
   * The Assign Network drawer's pool of assignable networks (POST), fired when
   * the drawer opens. The list it returns is what the eligibility cases read.
   */
  payerAssignableNetworks: '/api/Payers/GetAssignableNetworks',

  /**
   * Saving System Settings > General (PUT), the lifecycle CRONs included.
   *
   * VERIFIED: an invalid CRON is refused HERE, server-side, with 422 "Form
   * Validation Failure" and a toast "Invalid CRON expression." - the drawer
   * itself validates nothing. So the schedule story reads this response to
   * tell a refused save from an accepted one.
   */
  systemSettingsUpsert: '/api/SystemSettings/UpsertSystemSettings',

  /**
   * Reverting a payer to an earlier version (POST), fired by the Version
   * History row's Revert confirmation.
   *
   * VERIFIED: answers 200 "The revert has been saved as a draft. Send it for
   * approval when you are ready." - the revert is STAGED as a new draft
   * version ("vN · Reverted from vM", change type Revert) and still has to be
   * sent for approval, although the prompt says it "will submit" the version.
   */
  payerRevert: '/api/Payers/RevertPayer',
} as const;

export type ApiEndpointKey = keyof typeof ApiEndpoints;
