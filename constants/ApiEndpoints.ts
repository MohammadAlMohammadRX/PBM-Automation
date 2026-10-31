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

  // ---- Network module (observed in the live traffic, 2026-10-21) ----------

  /** The list (POST) `{pageNumber, rowsPerPage, sortBy, searchText?, ...}`; envelope `payload.networks`. */
  networkList: '/api/Networks/GetNetworks',
  /** The KPI band (POST `{}`) -> `{ total, active, pending, inactive, expired }`. */
  networkDashboard: '/api/Networks/GetNetworksDashboard',
  /** One network (POST `{ id }`) - carries `concurrencyStamp`, `versionStatusCode`, `hasDraft`. */
  networkGet: '/api/Networks/GetNetwork',
  networkCreate: '/api/Networks/CreateNetwork',
  /**
   * Saving an edit (PUT). The payload carries `concurrencyStamp` and
   * `confirmRevertToDraft`; an unchanged save answers 200 with
   * `payload.noChanges: true` and the toast "No changes to submit".
   */
  networkUpdate: '/api/Networks/UpdateNetwork',
  /** DELETE `/{id}` - a never-approved draft answers "The draft network has been discarded." */
  networkDelete: '/api/Networks/DeleteNetwork',
  networkSubmit: '/api/Networks/SubmitNetworkForApproval',
  networkAssignFacilities: '/api/Networks/AssignFacilitiesToNetwork',
  /** DELETE `/{networkId}/{facilityId}` - stages a removal as a draft. */
  networkUnassignFacility: '/api/Networks/UnassignFacilityFromNetwork',
  /** The Assign Facilities drawer's pool (POST `{ networkId }`). */
  networkAssignableFacilities: '/api/Networks/GetAssignableFacilities',
  networkFacilities: '/api/Networks/GetNetworkFacilities',
  networkPolicies: '/api/Networks/GetNetworkPolicies',
  networkVersions: '/api/Networks/GetNetworkVersions',
  networkRevert: '/api/Networks/RevertNetworkVersion',
  /** POST `{ networkId, actionType, pageNumber, rowsPerPage }`. */
  networkAuditTrail: '/api/Networks/GetNetworkAuditTrail',
  /** The network status lookup - resolves status codes to ids at run time. */
  networkStatusLookup: '/api/Lookups/Items/networkStatus',
  networkTypeLookup: '/api/Lookups/Items/networkType',
  networkInactivationReasonLookup: '/api/Lookups/Items/networkInactivationReason',
  // ---- Plans module (observed in the live traffic, 2026-10-27) -------------

  /** The list (POST) `{pageNumber, rowsPerPage, sortBy, searchText?, ...}`; envelope `payload.plans`. */
  planList: '/api/Plans/GetPlans',
  /** The KPI band (POST `{}`) -> `{ total, active, pending, inactive, expired }`. */
  planDashboard: '/api/Plans/GetPlansDashboard',
  /** One plan (POST `{ id }`) - carries `statusId`, `effectiveStatusId`, `formularyId`, `concurrencyStamp`. */
  planGet: '/api/Plans/GetPlan',
  /** POST - answers "The plan has been saved as a draft..." with `payload.id`. */
  planCreate: '/api/Plans/CreatePlan',
  /** Saving an edit (PUT), like networkUpdate. */
  planUpdate: '/api/Plans/UpdatePlan',
  /** DELETE `/{id}`. */
  planDelete: '/api/Plans/DeletePlan',
  /** POST `{ planId }`. */
  planSubmit: '/api/Plans/SubmitPlanForApproval',
  /**
   * POST `{ planId, formularyId }`. The formulary must be APPROVED (a draft one
   * answers 404 "Unable to load the requested formulary") and of the plan's payer.
   * A plan cannot be approved without one (409, 2026-10-27).
   */
  planAssignFormulary: '/api/Plans/AssignFormularyToPlan',
  planSetActive: '/api/Plans/SetPlanActive',
  // ---- plan folder 29/30 additions (2026-10-27) ----
  /** POST `{ id, inactivationReasonId, inactivationDetails }` - stages a plan's inactivation (fixtures/planModule.fixture.ts). */
  planInactivate: '/api/Plans/InactivatePlan',
  planRevert: '/api/Plans/RevertPlanVersion',
  planClone: '/api/Plans/ClonePlan',
  /** POST `{ planId }`. */
  planVersions: '/api/Plans/GetPlanVersions',
  /** POST `{ planId, actionType, pageNumber, rowsPerPage }`. */
  planAuditTrail: '/api/Plans/GetPlanAuditTrail',
  /** POST `{ id }` - the current and published formulary of a plan. */
  planFormularyAssignment: '/api/Plans/GetPlanFormularyAssignment',
  /** POST `{ planId }` - every formulary the plan has had, per version. */
  planFormularyHistory: '/api/Plans/GetPlanFormularyHistory',
  planStatusLookup: '/api/Lookups/Items/planStatus',
  planTypeLookup: '/api/Lookups/Items/planType',
  planInactivationReasonLookup: '/api/Lookups/Items/planInactivationReason',

  // ---- Formulary module (2026-10-27) - only what the plan suite needs -----

  /** GET - every formulary with its `payerId` and `statusId`. */
  formularyDropdown: '/api/Formularies/GetFormulariesDropdown',
  formularyGet: '/api/Formularies/GetFormulary',
  formularyCreate: '/api/Formularies/CreateFormulary',
  /** POST `{ formularyId, tierNameEn, tierNameAr, tierOrder, defaultCoveragePercentage }` -> payload = tier id. */
  formularyCreateTier: '/api/Formularies/CreateTier',
  /** POST `{ formularyId, tradeId, tierId, coveragePercentage, effectiveFrom, effectiveTo, ... }`. */
  formularyAddTrade: '/api/Formularies/AddFormularyTrade',
  /** POST `{ formularyId }`. A formulary needs at least one trade to be approved (409). */
  formularySubmit: '/api/Formularies/SubmitFormularyForApproval',
  formularyStatusLookup: '/api/Lookups/Items/formularyStatus',

  // ---- plan folder 27 additions (2026-10-27) ----
  // Read off the application's own formulary service (main bundle, 2026-10-27),
  // not yet observed in live traffic.
  /**
   * PUT `{ id, concurrencyStamp, formularyNameEn, formularyNameAr, payerId, descriptionEn,
   * descriptionAr, effectiveDate, expiryDate, confirmRevertToDraft }`. May answer
   * `requiresDraftConfirmation` / `noChanges`.
   */
  formularyUpdate: '/api/Formularies/UpdateFormulary',
  /** DELETE `/DeleteFormulary/{id}` (`?confirmRevertToDraft=true` to withdraw a pending request). */
  formularyDelete: '/api/Formularies/DeleteFormulary',
  /** POST `{ id, isActive, inactivationReasonId?, inactivationDetails?, confirmRevertToDraft }` - stages a status change. */
  formularySetActive: '/api/Formularies/SetFormularyActive',
  /** Inferred 2026-10-27 from the plan / network lookups, not yet verified live. */
  formularyInactivationReasonLookup: '/api/Lookups/Items/formularyInactivationReason',

  /** Rejecting an approval request (POST). */
  approvalReject: '/api/Approvals/RejectRequest',
  approvalApprove: '/api/Approvals/ApproveRequest',
  approvalList: '/api/Approvals/GetApprovals',
  /** The signed-in user's notification inbox (POST `{pageNumber, rowsPerPage, unreadOnly}`). */
  myNotifications: '/api/Notifications/GetMyNotifications',

  // ---- story 43 additions ----
  /**
   * Saving a role (PUT). NOT observed in traffic - named after the catalogue's
   * own "UpdateRole" permission (Roles group). Only the access-denied case
   * sends it, to prove a non-administrator is refused server-side.
   */
  roleUpdate: '/api/Roles/UpdateRole',

  // ---- Terminology module (2026-10-29) - every path observed in the live traffic ----
  /** POST `{pageNumber, rowsPerPage, sortBy, ...criteria}` -> `payload.terminologies.{items, totalRows}`. */
  terminologyList: '/api/Terminologies/GetTerminologies',
  /** POST `{}` - the ACTIVE terminologies other screens offer (the Mapping Identifier picker). */
  terminologyDropdown: '/api/Terminologies/GetTerminologiesDropdown',
  /** POST `{ id }` -> fields, flags and the concurrencyStamp. */
  terminologyDetail: '/api/Terminologies/GetTerminology',
  /** POST `{ name, description, isSubscribed, subscriptionReference, isActive, isLocked, fields[] }` -> `{ id }`. */
  terminologyCreate: '/api/Terminologies/CreateTerminology',
  /** PUT - the create body plus `id` and `concurrencyStamp`; the automatic Is Active field is left out. */
  terminologyUpdate: '/api/Terminologies/UpdateTerminology',
  /** DELETE `/DeleteTerminology/{id}` - 409 while the terminology holds records. */
  terminologyDelete: '/api/Terminologies/DeleteTerminology',
  /** POST `{ id, isActive, inactivationReasonId, inactivationDetails }` - takes effect at once, no approval. */
  terminologySetActive: '/api/Terminologies/SetTerminologyActive',
  /** POST `{ id, isLocked }`. */
  terminologySetLocked: '/api/Terminologies/SetTerminologyLocked',
  /** POST `{ terminologyId, pageNumber, rowsPerPage, sortBy, filters }` -> `payload.{fields, rows[{rowId, cells, display}]}`. */
  terminologyData: '/api/Terminologies/GetTerminologyData',
  /** POST `{ terminologyId, rowId|null, cells: {fieldId: value} }` -> `{ rowId }`; field errors in ValidationErrors. */
  terminologyUpsertRow: '/api/Terminologies/UpsertTerminologyRow',
  /** POST `{ terminologyId, rowId }`. */
  terminologyDeleteRow: '/api/Terminologies/DeleteTerminologyRow',
  /** POST `{ terminologyId, pageNumber, rowsPerPage, sortBy }` -> `payload.rows[{rowId, cells[{fieldName, value, error}]}]`. */
  terminologyErrors: '/api/Terminologies/GetTerminologyErrors',
  /** POST `{ terminologyId, rowId }` - drops one failed upload row. */
  terminologyDeleteErrorRow: '/api/Terminologies/DeleteTerminologyErrorRow',
  /** POST `{ fieldId, includeRowIds }` - the values a mapping field offers. */
  terminologyMappedValues: '/api/Terminologies/GetMappedFieldValues',
  /** POST multipart `file` + `terminologyId` -> `{ jobId, status }`. */
  terminologyUpload: '/api/Terminologies/UploadTerminologyImport',
  /** POST `{ terminologyId, includeCompleted }` -> `{ status, totalRows, processedRows, succeededRows, failedRows }` or null. */
  terminologyImportJob: '/api/Terminologies/GetActiveTerminologyImportJob',
  /** POST - the list export (`format` 1 CSV / 2 Excel). */
  terminologyExport: '/api/Terminologies/ExportTerminologies',
  terminologyFieldTypeLookup: '/api/Lookups/Items/terminologyFieldType',
  terminologyFieldRestrictionLookup: '/api/Lookups/Items/terminologyFieldRestriction',
  terminologyDeactivationReasonLookup: '/api/Lookups/Items/terminologyDeactivationReason',
  /** POST `{ rowsPerPage }` - the Lookup module's lists, the List field's sources. */
  lookupList: '/api/Lookups/GetLookups',
  /** POST `{ entityType, entityId, actionType, pageNumber, rowsPerPage }` - an entity's audit trail (the terminology Audit History tab). */
  auditLogList: '/api/AuditLogs/GetAuditLogs',
} as const;

export type ApiEndpointKey = keyof typeof ApiEndpoints;
