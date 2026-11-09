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

  /**
   * Deactivating a network (POST `{ id, inactivationReasonId, inactivationDetails }`), the
   * counterpart of networkSetActive. Renamed by the app: SetNetworkInactive answers 404 since
   * at least 2026-11-04 (Facility 17481); InactivateNetwork takes the same fields.
   */
  networkSetInactive: '/api/Networks/InactivateNetwork',

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
  /** The Reject dialog's reasons (2026-11-02). */
  approvalRejectionReasonLookup: '/api/Lookups/Items/approvalRejectionReason',
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

  // ---- Formulary module (Feature 15190, 2026-11-02) ----
  // Paths read off the application's own formulary / benefit-config services
  // (bundle chunk of 2026-11-02) and request bodies captured from the screens'
  // own calls (reports/formulary/Formulary-Foundation-Notes.md). The plan-suite
  // keys above (formularyDropdown ... formularyInactivationReasonLookup) stay.
  /** POST `{ pageNumber, rowsPerPage, sortBy, searchText?, statusId?, ... }` -> `payload.formularies.{items, totalRows}`. */
  formularyList: '/api/Formularies/GetFormularies',
  /** POST `{}` -> `{ total, active, pending, inactive, expired, pendingApproval }` (the KPI tiles). */
  formularyDashboard: '/api/Formularies/GetFormulariesDashboard',
  /** POST `{ id, effectiveDate, expiryDate }` - what a clone would carry (counts, pricing range). */
  formularyForClone: '/api/Formularies/GetFormularyForClone',
  /** POST `{ sourceFormularyId, formularyNameEn/Ar, descriptionEn/Ar, effectiveDate, expiryDate, includeTiers, includeTrades, includePricing }`. */
  formularyClone: '/api/Formularies/CloneFormulary',
  /** POST `{ formularyId, targetVersion }` - stages the version as a new draft. */
  formularyRevert: '/api/Formularies/RevertFormularyVersion',
  /** GET `/GetFormularyVersions/{id}` -> the versions, newest first. */
  formularyVersions: '/api/Formularies/GetFormularyVersions',
  /** POST `{ formularyId, actionType, pageNumber, rowsPerPage }` -> `payload.{items, totalRows}`. */
  formularyAuditTrail: '/api/Formularies/GetFormularyAuditTrail',
  /** POST `{ formularyId }` -> the tiers (with `tradeCount`, `concurrencyStamp`). */
  formularyTiers: '/api/Formularies/GetTiers',
  /** PUT `{ id, tierNameEn, tierNameAr, tierOrder, descriptionEn, descriptionAr, defaultCoveragePercentage, concurrencyStamp }`. */
  formularyUpdateTier: '/api/Formularies/UpdateTier',
  /** DELETE `/DeleteTier/{id}`. */
  formularyDeleteTier: '/api/Formularies/DeleteTier',
  /** POST `{ formularyId, pageNumber, rowsPerPage, searchText?, tierId?, statusId? }` -> `payload.trades.{items}`, `payload.tradesWithoutPrice`. */
  formularyTrades: '/api/Formularies/GetFormularyTrades',
  /** PUT - a trade's tier / coverage. */
  formularyUpdateTrade: '/api/Formularies/UpdateFormularyTrade',
  /** POST `{ id, suspend }` - Suspend (true) / Activate (false) a formulary trade. */
  formularySetTradeStatus: '/api/Formularies/SetFormularyTradeStatus',
  /** DELETE `/DeleteFormularyTrade/{id}` (the card's Remove). */
  formularyDeleteTrade: '/api/Formularies/DeleteFormularyTrade',
  /** POST `{ formularyTradeId }` -> the price periods (`periodStatus`, `netPrice`, `rebateTypeId`, `isDraft`). */
  formularyPriceHistory: '/api/Formularies/GetPriceHistory',
  /** POST `{ formularyTradeId, effectiveFrom, effectiveTo, baseCost, publicPrice, supplierPrice, discountPercentage, vatPercentage }`. */
  formularyAddPricingPeriod: '/api/Formularies/AddPricingPeriod',
  /** PUT - the add body with `id` and `concurrencyStamp` instead of `formularyTradeId`. */
  formularyUpdatePricingPeriod: '/api/Formularies/UpdatePricingPeriod',
  /** DELETE `/DeletePricingPeriod/{id}`. */
  formularyDeletePricingPeriod: '/api/Formularies/DeletePricingPeriod',
  /** POST `{ pricingPeriodId, rebateTypeId, rebateValue }`. */
  formularyUpsertRebate: '/api/Formularies/UpsertRebate',
  /** POST `{ pricingPeriodId }` - the rebate form saved with "No rebate". */
  formularyDeleteRebate: '/api/Formularies/DeleteRebate',
  formularyImport: '/api/Formularies/ImportFormularies',
  formularyImportTiers: '/api/Formularies/ImportFormularyTiers',
  formularyImportTrades: '/api/Formularies/ImportFormularyTrades',
  formularyImportTemplate: '/api/Formularies/GetFormularyImportTemplate',
  formularyImportHistory: '/api/Formularies/GetFormularyImportHistory',
  formularyImportResult: '/api/Formularies/DownloadFormularyImportResult',
  formularyExport: '/api/Formularies/ExportFormularies',
  formularyExportTiers: '/api/Formularies/ExportFormularyTiers',
  formularyExportTrades: '/api/Formularies/ExportFormularyTrades',
  /**
   * The Deactivate drawer's reasons (2026-11-02). `formularyInactivationReason`
   * (above, inferred for the plan suite) answers an EMPTY list.
   */
  formularyDeactivationReasonLookup: '/api/Lookups/Items/formularyDeactivationReason',
  formularyTradeStatusLookup: '/api/Lookups/Items/formularyTradeStatus',
  rebateTypeLookup: '/api/Lookups/Items/rebateType',
  /** POST `{ searchText }` - the trade catalogue the Add Trade drawer offers. */
  tradesDropdown: '/api/Trades/GetTradesDropdown',

  /** POST `{ formularyTradeId, pageNumber, rowsPerPage }` -> `payload.benefitConfigs.{items}`. */
  benefitConfigList: '/api/BenefitConfigs/GetBenefitConfigs',
  /** POST `{ id }`. */
  benefitConfigGet: '/api/BenefitConfigs/GetBenefitConfig',
  benefitConfigDashboard: '/api/BenefitConfigs/GetBenefitConfigsDashboard',
  /** POST `{ formularyTradeId, benefitConfigNameEn/Ar, benefitConfigDescriptionEn/Ar, copaymentAmount, coinsurancePercentage, deductible, outOfPocketMaximum, maximumCopayAmount, minimumMemberContribution, sublimitAmount, benefitEffectiveDate, benefitEndDate }`. */
  benefitConfigAdd: '/api/BenefitConfigs/AddBenefitConfig',
  /** PUT - the add body with `id` and `concurrencyStamp` instead of `formularyTradeId`. */
  benefitConfigUpdate: '/api/BenefitConfigs/UpdateBenefitConfig',
  /** DELETE `/DeleteBenefitConfig/{id}`. */
  benefitConfigDelete: '/api/BenefitConfigs/DeleteBenefitConfig',
  benefitConfigStatusLookup: '/api/Lookups/Items/benefitConfigStatus',
  sublimitPeriodLookup: '/api/Lookups/Items/sublimitPeriod',

  // ---- Policy module (Feature 15164, 2026-11-03) ----
  // Paths read off the application's policy service (bundle chunk-ZOWZ7Y6N of
  // 2026-11-03); request bodies CAPTURED from the screens' own calls
  // (reports/policy/Policy-Foundation-Notes.md). `payerLinkedPolicies` and
  // `networkPolicies` (above) stay with their suites.
  /** POST `{ pageNumber, rowsPerPage, sortBy, searchText?, statusId?, policyTypeId?, planId?, approvalStatus? }` -> `payload.policies.{items, totalRows}`. */
  policyList: '/api/Policies/GetPolicies',
  /** POST `{}` -> `{ total, draft, pending, active, inGracePeriod, expired, terminated, inactive }` (the KPI tiles). */
  policyDashboard: '/api/Policies/GetPoliciesDashboard',
  /** POST `{ id }` - carries `concurrencyStamp`, `benefitYear`, `hasDraft`, `isPendingCreate`, `versionStatusCode`, counts. */
  policyGet: '/api/Policies/GetPolicy',
  /** POST `{ policyNameEn, policyNameAr, planId, policyHolderId (null = Individual "self"), effectiveDate, expiryDate, gracePeriodDays, maxMembers, deductibleAmount, coinsurancePercent, outOfPocketMaximum, sublimitAmount, policyTypeId }` -> `{ id, policyNumber:null, draft:true }`. */
  policyCreate: '/api/Policies/CreatePolicy',
  /** PUT - the create body (no policyTypeId) + `id, concurrencyStamp, confirmRevertToDraft`. */
  policyUpdate: '/api/Policies/UpdatePolicy',
  /** POST `{ policyId }` - Send for Approval. */
  policySubmit: '/api/Policies/SubmitPolicyForApproval',
  /** POST `{ id }` - the bundle's older "Submit" (not used by the screens seen). */
  policySubmitLegacy: '/api/Policies/SubmitPolicy',
  /** DELETE `/{id}[?confirmRevertToDraft=true]` - a v0 is discarded at once; a published one stages the deletion. */
  policyDelete: '/api/Policies/DeletePolicy',
  /** POST `{ id, isActive:true, confirmRevertToDraft }` - Activate (staged). */
  policySetActive: '/api/Policies/SetPolicyActive',
  /** POST `{ id, inactivationReasonId, inactivationDetails, confirmRevertToDraft }` - Inactivate (staged). */
  policyInactivate: '/api/Policies/InactivatePolicy',
  /** POST `{ id }` -> the source as the clone drawer pre-fills it. */
  policyForClone: '/api/Policies/GetPolicyForClone',
  /** POST - the create body + `sourcePolicyId, includeMembers, includeNetworks, includeDocumentation` (see clonePolicy). */
  policyClone: '/api/Policies/ClonePolicy',
  /** GET `/{id}` -> the versions, newest first. */
  policyVersions: '/api/Policies/GetPolicyVersions',
  /** POST `{ policyId, targetVersion }` - stages the version as a draft. */
  policyRevert: '/api/Policies/RevertPolicyVersion',
  /** POST `{ policyId, actionType, pageNumber, rowsPerPage }` -> `payload.{items, totalRows}`. */
  policyAuditTrail: '/api/Policies/GetPolicyAuditTrail',
  /** POST `{ policyId, pageNumber, rowsPerPage, ... }` -> `payload.members.{items, totalRows}` (`rosterState`). */
  policyMembers: '/api/Policies/GetPolicyMembers',
  /** GET `?policyId=&searchText=` - the Add Member picker's pool (every member of the system, enrolled ones included). */
  policyMemberCandidates: '/api/Policies/GetPolicyMemberCandidates',
  /** POST `{ policyId, memberId, relationshipId, confirmRevertToDraft }`. */
  policyAddMember: '/api/Policies/AddPolicyMember',
  /** DELETE `/{policyId}/{policyMemberId}[?confirmRevertToDraft=true]`. */
  policyRemoveMember: '/api/Policies/RemovePolicyMember',
  /** POST `{ policyId, pageNumber, rowsPerPage }` -> `payload.{networks, totalRows, proposedNetworkIds}`. */
  policyNetworks: '/api/Policies/GetPolicyNetworks',
  /** POST `{ policyId, networkId, confirmRevertToDraft }`. */
  policyAssignNetwork: '/api/Policies/AssignPolicyNetwork',
  /** DELETE `/{policyId}/{networkId}[?confirmRevertToDraft=true]`. */
  policyUnassignNetwork: '/api/Policies/UnassignPolicyNetwork',
  /** POST `{ policyId }` -> `payload.endorsements[]` (`state`). */
  policyDocuments: '/api/Policies/GetPolicyEndorsements',
  /** POST `{ policyId, title, endorsementTypeId, effectiveDate (yyyy-mm-dd), description, attachmentUri, attachmentFileName, attachmentContentType, attachmentSizeBytes, confirmRevertToDraft }`. */
  policyAddDocument: '/api/Policies/CreatePolicyEndorsement',
  /** DELETE `/{policyId}/{endorsementId}[?confirmRevertToDraft=true]`. */
  policyDeleteDocument: '/api/Policies/DeletePolicyEndorsement',
  /** POST multipart `File` + `EntityName` ("PolicyEndorsement") -> `payload.fileUri`. */
  fileUpload: '/api/FileUpload/UploadFile',
  policyImport: '/api/Policies/ImportPolicies',
  policyImportMembers: '/api/Policies/ImportPolicyMembers',
  policyImportNetworks: '/api/Policies/ImportPolicyNetworks',
  policyImportTemplate: '/api/Policies/GetPolicyImportTemplate',
  policyImportHistory: '/api/Policies/GetPolicyImportHistory',
  policyImportResult: '/api/Policies/DownloadPolicyImportResult',
  policyExport: '/api/Policies/ExportPolicies',
  policyExportMembers: '/api/Policies/ExportPolicyMembers',
  policyExportNetworks: '/api/Policies/ExportPolicyNetworks',
  /** GET `?payerId=` - the Network Assignment select's pool: ACTIVE networks of the payer only. */
  networksDropdown: '/api/Networks/GetNetworksDropdown',
  /** GET `?payerId=&effectiveDate=&expiryDate=&includeId=` - the policy form's plans. */
  plansDropdown: '/api/Plans/GetPlansDropdown',
  /** GET `?searchText=&rowsPerPage=` - the Group policy holder select (terminology). */
  policyHoldersDropdown: '/api/Terminologies/GetPolicyHoldersDropdown',
  policyStatusLookup: '/api/Lookups/Items/policyStatus',
  policyTypeLookup: '/api/Lookups/Items/policyType',
  memberRelationshipLookup: '/api/Lookups/Items/memberRelationship',
  policyInactivationReasonLookup: '/api/Lookups/Items/policyInactivationReason',
  policyTerminationReasonLookup: '/api/Lookups/Items/policyTerminationReason',
  /** Rider Addition, Coverage Change, Member Change, Premium Adjustment, Other. */
  endorsementTypeLookup: '/api/Lookups/Items/endorsementType',
  /** POST `{ policyMemberId }` - the Member Benefit Accumulator. */
  memberAccumulator: '/api/MemberAccumulators/GetMemberAccumulator',
  /** POST `{ pageNumber, rowsPerPage, searchText }` -> `payload.policies.{items}` - Policies in force. */
  policyBenefitYears: '/api/MemberAccumulators/GetPolicyBenefitYears',
  /** The Reset history tab's feed. */
  policyResetHistory: '/api/MemberAccumulators/GetResetJobHistory',
  /** POST `{ policyId, reason, attachmentUri/FileName/ContentType/SizeBytes, deductibleAmount, coinsurancePercent, outOfPocketMaximum, sublimitAmount }`. */
  policyResetBenefits: '/api/MemberAccumulators/ResetPolicyBenefits',

  // ---- Facility module (Feature 15130, 2026-11-04) ----
  // Paths read off the application's facility service (bundle chunk-3GAWWUPF,
  // `base="/Facilities"`) and the bodies CAPTURED from the screens' own calls
  // (reports/facility/Facility-Foundation-Notes.md). NO approval workflow: every
  // write below takes effect at once. `FACILITY_LIST_ENDPOINT` of
  // utils/FacilityDirectory.ts (the network suite's reader) is the same list.
  /** POST `{ pageNumber, rowsPerPage, sortBy?, searchText?, typeId?, statusId? (effective status), providerTypeId? }` -> `payload.facilities.{items, totalRows}`. */
  facilityList: '/api/Facilities/GetFacilities',
  /** POST `{}` -> `{ total, active, pending, inactive, expired }` (the KPI tiles; `pending` = Future). */
  facilityDashboard: '/api/Facilities/GetFacilitiesDashboard',
  /** POST `{ id }` -> the facility (404 "The requested facility was not found." once deleted). */
  facilityGet: '/api/Facilities/GetFacility',
  /** POST - the form body (see FacilityProvisioning.FacilityBody) -> `{ id, facilityCode }`, "Facility has been created successfully." */
  facilityCreate: '/api/Facilities/CreateFacility',
  /** PUT - the form body + `id, concurrencyStamp` (stale stamp -> 409). */
  facilityUpdate: '/api/Facilities/UpdateFacility',
  /** DELETE `/{id}` - a SOFT delete (IsDeleted), applied at once; 409 while the facility is in a network (or a pending network version). */
  facilityDelete: '/api/Facilities/DeleteFacility',
  /** POST `{ id, isActive, inactivationReasonId?, inactivationDetails? }` - Activate / Inactivate, applied at once. */
  facilitySetActive: '/api/Facilities/SetFacilityActive',
  /** POST `{ facilityId, pageNumber, rowsPerPage }` -> `payload.networks.{items: {id, networkCode, networkNameEn/Ar, statusId, assignedOn}, totalRows}` (approved assignments only). */
  facilityNetworks: '/api/Facilities/GetFacilityNetworks',
  /** POST - the list query + `format` (1 CSV, 2 Excel); answers the WHOLE matching set as a file. */
  facilityExport: '/api/Facilities/ExportFacilities',
  facilityDropdown: '/api/Facilities/GetFacilitiesDropdown',
  /** The Audit History tab reads auditLogList `{ entityType: "Facility", entityId, actionType, fromUtc?, toUtc?, searchText?, pageNumber, rowsPerPage }`. */
  auditLogById: '/api/AuditLogs/GetAuditLogById',
  /** clinic, hospital, pharmacy. */
  facilityTypeLookup: '/api/Lookups/Items/facilityType',
  /** pending (label "Future"), active, inactive, expired. */
  facilityStatusLookup: '/api/Lookups/Items/facilityStatus',
  /** both, integrationProvider, providerPortal. */
  providerTypeLookup: '/api/Lookups/Items/providerType',
  /** licenceRevoked, contractEnded, facilityClosed, relocated, accreditationLost, qualityOfCareConcern, other. */
  facilityDeactivationReasonLookup: '/api/Lookups/Items/facilityDeactivationReason',

  // ---- Member module (Feature 14375, 2026-11-05) ----
  // Paths read off the application's member service (bundle chunk-HXOODTP3,
  // the COB service in chunk-7RKTX6PS, the bulk config in chunk-OFJQQA5O) and
  // verified in the screens' traffic (reports/member/Member-Foundation-Notes.md).
  // NO approval workflow: every write below takes effect at once. The payer
  // scope select sends the header `X-Selected-Payer-Id` on /api/Members/* calls.
  /** POST `{ pageNumber, rowsPerPage, sortBy, searchText?, isActive (true|false|null), nationalityId? }` -> `payload.members.{currentPage, totalPages, totalRowsPerPage, totalRows, items}`. */
  memberList: '/api/Members/GetMembers',
  /** POST `{ payerId? }` -> `{ total, active, inactive, specialNeeds }`. */
  memberDashboard: '/api/Members/GetMembersDashboard',
  /** POST `{ id }` -> the member + `benefitPolicies` (the PBM Accumulator Dashboard tab) + `emergencyContacts`; 404 "Unable to load member." once deleted. */
  memberGet: '/api/Members/GetMember',
  /** POST `{ id }` -> the wizard's Edit load (body fields + concurrencyStamp, policyHolderIds). */
  memberGetForEdit: '/api/Members/GetMemberForEdit',
  /** POST - the wizard body (see MemberProvisioning.MemberBody) -> `{ id, memberCode }`, "Member has been created successfully." */
  memberCreate: '/api/Members/CreateMember',
  /** PUT - the body + `id, concurrencyStamp` (contacts keep their `id`); stale stamp 409. */
  memberUpdate: '/api/Members/UpdateMember',
  /** DELETE `/{id}` - a SOFT delete, refused while the member holds a policy enrolment. */
  memberDelete: '/api/Members/DeleteMember',
  /** POST `{ id, isActive, inactivationReasonId, inactivationDetails }` (reason required to deactivate; details required for Other). */
  memberSetActive: '/api/Members/SetMemberActive',
  /** GET `?searchText=` - the members picker of other modules (and the engine simulator). */
  memberDropdown: '/api/Members/GetMembersDropdown',
  /** GET `?email=&excludeMemberId=` -> payload true / false (the wizard's on-blur check; the server itself accepts a duplicate e-mail). */
  memberCheckEmail: '/api/Members/CheckEmailExists',
  /** GET `?documentId=&excludeMemberId=` -> payload true / false. */
  memberCheckDocumentId: '/api/Members/CheckDocumentIdExists',
  /** POST - the list query + `scope` ("All" | "Filtered" | "CurrentPage") + `format` ("Csv" | "Excel") -> the file. */
  memberExport: '/api/Members/ExportMembers',
  /** POST `{ entity: "Member", format: "Csv" | "Excel" }` -> Members_Template.xlsx / .csv (GET answers 405). */
  memberImportTemplate: '/api/Members/GetMemberImportTemplate',
  /** POST multipart `file` -> the bulk operation (tracked through bulkOperationsStatus). */
  memberImport: '/api/Members/ImportMembers',
  /** POST `{ pageNumber, rowsPerPage }` -> `payload.{items: {fileName, totalRows, succeededRows, failedRows, createdRows, updatedRows, unchangedRows, status, errorMessage, hasResultFile, canDownloadResult}, totalRows}`. */
  memberImportHistory: '/api/Members/GetMemberImportHistory',
  /** POST `{ operationId, format }` -> the result (error) file of an import. */
  memberImportResult: '/api/Members/DownloadMemberImportResult',
  /** POST `{ ids: [operationId] }` -> the operations' progress (shared bulk service). */
  bulkOperationsStatus: '/api/BulkOperations/GetBulkOperationsStatus',
  /** POST `{ memberId }` -> `payload.entries[]` (current ordering + History; every entry's `id` is the empty GUID). */
  cobTimeline: '/api/Cob/GetMemberCobTimeline',
  /** PUT `{ memberId, policyIds }` (primary first) - what a drop on the Coverage Ordering tab sends. */
  cobReorder: '/api/Cob/ReorderMemberCoverage',
  /** GET `?gregorianDate=YYYY-MM-DD` -> `{ hijriYear, hijriMonth, hijriDay, hijri: "YYYY/MM/DD", gregorianDate }`. */
  hijriFromGregorian: '/api/HijriDates/ConvertToHijri',
  /** GET `?hijriYear=&hijriMonth=&hijriDay=` -> `{ gregorianDate, ... }`. */
  hijriToGregorian: '/api/HijriDates/ConvertToGregorian',
  /** GET `/{lookupName}` - every lookup's items (identityType, nationality, gender, patientStatus, maritalStatus, ...). */
  lookupItems: '/api/Lookups/Items',
  /** GET - the address countries (Jordan, Saudi Arabia, United Arab Emirates on 2026-11-05). */
  countriesDropdown: '/api/Terminologies/GetCountriesDropdown',
  /** GET - every system setting (`{ key, value }`), the Jobs.* CRONs among them. */
  systemSettingsGet: '/api/SystemSettings/GetSystemSettings',
  /** POST `{ pageNumber, rowsPerPage }` - the PBM engine's authorizations (0 on 2026-11-05); posting one needs the partner API. */
  engineAuthorizations: '/api/Engine/GetAuthorizations',

  // ---- User Management module (Feature 12972) - every path observed in the live traffic 2026-11-08 ----
  /** POST `{pageNumber, rowsPerPage, sortBy, searchText?, isActive?, name?, documentId?, nationalityId?, identityTypeId?, mobileNumber?, genderId?}` -> `payload.users.{items, totalRows}`. */
  userList: '/api/identity/Users/GetUsers',
  /** POST `{}` -> `{ total, active, inactive, pendingApproval }`. */
  userDashboard: '/api/identity/Users/GetUsersDashboard',
  /** POST `{ id }` -> the user + `assignedRoles[{id, name, hasAssignedPayers, assignedPayers[]}]` + concurrencyStamp; 404 "Unable to load user." once deleted. */
  userGet: '/api/identity/Users/GetUser',
  /** POST - the drawer body (UserProvisioning.UserBody) -> `{ id }` "User has been created successfully.". NO password field: the system issues one. */
  userCreate: '/api/identity/Users/CreateUser',
  /** PUT - the create body + `id, userName (= documentId), concurrencyStamp` -> "User has been updated successfully." (?). */
  userUpdate: '/api/identity/Users/UpdateUser',
  /** DELETE `?id=` -> "User has been deleted successfully."; GetUser then 404. */
  userDelete: '/api/identity/Users/DeleteUser',
  /** GET `?documentId=&excludeUserId=` -> payload true / false. */
  userCheckDocumentId: '/api/identity/Users/CheckDocumentIdExists',
  /** POST `{ id, isActive, inactivationReasonId, inactivationDetails }` (Activate / Deactivate; the first activation issues the system password + "First Activation" e-mail). */
  userToggleActivation: '/api/identity/Users/ToggleUserActivation',
  /** POST - the list query (filters only for "Filtered results") + `format` 1 = CSV / 2 = Excel -> `Users_YYYYMMDD_HHmmss.csv|xlsx`. */
  userExport: '/api/identity/Users/ExportUsers',
  /** POST `{ rowsPerPage }` - every role (Role Administration). */
  roleList: '/api/identity/Roles/GetRoles',
  /** POST `{ rowsPerPage }` - the roles the signed-in user may assign (includes INACTIVE roles in the answer; the user drawer filters them, the invitation drawer does not). */
  roleAssignable: '/api/identity/Roles/GetAssignableRoles',
  /** POST `{ id }` -> the role + concurrencyStamp + assignableRoleIds. */
  roleGet: '/api/identity/Roles/GetRole',
  /** POST `{ roleId, loadingOnDemand: false }` -> `{ requestedPermissions: [catalogue tree], selectedPermissions: [{id, key}] }`. */
  rolePermissions: '/api/identity/Roles/GetRolePermissions',
  /** POST `{ name, arabicName, englishDescription, arabicDescription, isActive, hasAssignedPayers, canApproveOwnRequests, selectedPermissionIds, assignableRoleIds }` -> `{ id }`. */
  roleCreate: '/api/identity/Roles/CreateRole',
  /** PUT - the create body + `id, concurrencyStamp` (OBSERVED 2026-11-08; the older `roleUpdate` above is a guessed path). A role edit reaches its holders AT ONCE (same session). */
  roleUpdateIdentity: '/api/identity/Roles/UpdateRole',
  /** DELETE `?id=`. */
  roleDelete: '/api/identity/Roles/DeleteRole',
  /** POST `{pageNumber, rowsPerPage, sortBy, searchText?, email?, roleId?, payerId?, status? (enum number)}` -> `payload.invitations.{items, totalRows}`. */
  invitationList: '/api/identity/Invitations/GetInvitations',
  /** POST `{ email, roleId, payerId, expiryDays: 5 }` (one call per e-mail chip) -> `{ id }` "Invitation has been sent successfully."; duplicate -> 409. */
  invitationCreate: '/api/identity/Invitations/CreateInvitation',
  /** POST `{ id, isActive }` - Pause (false) / Resume (true). Story 20420 (MANUAL). */
  invitationSetStatus: '/api/identity/Invitations/SetInvitationStatus',
  /** POST `{ id, expiryDays: 5 }`. Story 20420 (MANUAL). */
  invitationResend: '/api/identity/Invitations/ResendInvitation',
  /** DELETE `/DeleteInvitation/{id}`. */
  invitationDelete: '/api/identity/Invitations/DeleteInvitation',
  /** POST - the list query + `format` (1 CSV / 2 Excel) -> `Invitations_YYYYMMDD_HHmmss.csv|xlsx`. */
  invitationExport: '/api/identity/Invitations/ExportInvitations',
  /** POST `{ pageNumber, rowsPerPage }` - registrations waiting in Approval Management (Registrations tab). */
  invitationApprovals: '/api/identity/Invitations/GetInvitationApprovals',
  /** POST `{ email, password }` -> `payload.{requiresTwoFactor, authResponse{accessToken, refreshToken}, lockoutUntil, ...}`; a refusal answers 500 + ErrorMessage. */
  accountLogin: '/api/Account/Login',
  accountLogout: '/api/Account/Logout',
  /** POST `{ email }` -> "Password reset link was sent. Please check your email." + `payload.code` (the reset code itself, null for an unknown address). */
  accountForgotPassword: '/api/Account/ForgotPassword',
  /** POST `{ email, password, confirmPassword, code }` -> "Your password has been reset". */
  accountResetPassword: '/api/Account/ResetPassword',
  accountRefreshToken: '/api/Account/RefreshToken',
  /** GET - the signed-in user's own record (My Profile). */
  manageCurrentUser: '/api/Manage/GetCurrentUser',
  /** GET -> `{ roles, permissions }` of the signed-in user. */
  manageCurrentPermissions: '/api/Manage/GetCurrentUserRolesAndPermissions',
  /** PUT - one My Profile field at a time. */
  manageUpdateProfile: '/api/Manage/UpdateUserProfile',
  /** POST `{ oldPassword, newPassword, confirmPassword }`; wrong current -> 500 ValidationErrors PasswordMismatch "Incorrect password.". */
  manageChangePassword: '/api/Manage/ChangePassword',
  /** GET -> `{ requiredLength, maximumLength, requiredUniqueChars, requireNonAlphanumeric, requireLowercase, requireUppercase, requireDigit, requireChangeForNewUsers, passwordHistoryCount, expiryDays, concurrencyStamp }`. */
  passwordPolicyGet: '/api/SystemSettings/GetPasswordPolicy',
  /** PUT - the policy + concurrencyStamp -> "Identity settings have been updated successfully."; out of range -> 422. */
  passwordPolicyUpdate: '/api/SystemSettings/UpdatePasswordPolicy',
  /** POST `{}` -> 2FA settings (authenticateBy "None" on 2026-11-08) + user exceptions. */
  twoFactorConfig: '/api/TwoFactorAuthenticationConfiguration/GetConfig',
  /** POST `{ pageNumber, rowsPerPage }` -> every e-mail / SMS the platform tried to send (`recipientAddress`, `triggerName`, `status`). */
  triggerExecutions: '/api/TriggersAudit/GetTriggerExecutions',
  /** POST `{ id }` -> one execution with `subject` and `body` (HTML; the temporary password is masked "**********"). */
  triggerExecution: '/api/TriggersAudit/GetTriggerExecution',
} as const;

export type ApiEndpointKey = keyof typeof ApiEndpoints;
