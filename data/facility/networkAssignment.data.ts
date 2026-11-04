import type { FacilityShape } from '../../utils/facility/writerBHelpers';

/**
 * US 15136 "View Facility - Network Assignment tab" (facility folder 05).
 *
 * The tab (verified 2026-11-04): a READ-ONLY table - Code, Network Name (a link
 * to the network), Status, Assigned On (DD/MM/YYYY) - fed by GetFacilityNetworks,
 * 10 rows a page. Only APPROVED memberships are listed. There is NO network-type
 * column, although the story's AC ("Display each network's code, type and
 * current status") and 17470 / 17481 ask for one - those steps assert the type
 * and fail: that is the finding.
 *
 * Facilities: a network cannot drop its last facility nor be deleted with one,
 * so the cases reuse the suite's long-lived NETWORK ANCHORS
 * (utils/facility/writerBHelpers findOrCreateNetworkAnchor): the single pair
 * "QA Automation Facility Network Anchor" (exactly one network) and
 * "QA Automation Facility Network Anchor Multi" (several networks of types
 * HMO / PPO / EPO / POS). A facility in NO network is always a fresh one.
 *
 * Literal readings / decisions:
 * - 17470 "NET-A / NET-B, Regional / National, Active / Inactive": the multi
 *   anchor's networks (distinct codes and types; their statuses are what the
 *   network suite's lifecycle gives them). Each row is compared with the
 *   network's OWN master data (GetNetwork: code, type label, status label).
 * - 17471 "3 networks": the multi anchor (at least 3).
 * - 17472 "50 memberships (e.g.)": 50 permanent networks would be left in the
 *   shared environment for one case, so "many" is MANY_MEMBERSHIPS = 11 - one
 *   more than the tab's page of 10, which is the boundary the case is about
 *   ("scrollable or paginated as needed, with no data missing"). Decision item.
 * - 17474: the multi anchor holds one network named "Automation Network
 *   National Regional Integrated Health Network Consortium Extended <stamp>"
 *   (the case's name behind the suite's network prefix).
 * - 17475: the network status lookup has no "Suspended", and Active / Inactive
 *   cannot be produced on demand (the network lifecycle job runs once a day) ->
 *   BLOCKED naming the missing statuses (brief).
 * - 17477 "Facility A, B, C": A = the single anchor (1 network), B = the multi
 *   anchor, C = a fresh facility (none).
 * - 17479 "without network view permission": the Payer Admin shaped with the
 *   list and view rights but WITHOUT Facilities.GetFacilityNetworks (the tab's
 *   right); the administrator is the baseline (the tab is offered to it).
 * - 17480 "join dates 2023 / 2024 / 2026": a join date cannot be back-dated;
 *   every membership's Assigned On is compared with the date the facility was
 *   actually added (GetFacilityNetworks assignedOn, Riyadh day).
 * - 17481 "type Regional -> National" in the data, "status active -> inactive"
 *   in the steps: the steps are automated (status); the multi anchor's network
 *   is inactivated through the Network module's own calls (stage, submit,
 *   approve) and re-activated afterwards. It must be ACTIVE first - an anchor
 *   network is Future until the daily network lifecycle job (09:40 UTC) has
 *   run once after it was made -> BLOCKED until then.
 */
export const CASES = {
  codeTypeStatus: { azureId: '17470', minNetworks: 2 },
  listMemberships: { azureId: '17471', minNetworks: 3 },
  noneOneMany: { azureId: '17472' },
  longName: { azureId: '17474' },
  everyStatus: { azureId: '17475', statuses: ['Active', 'Inactive', 'Suspended', 'Pending'] },
  readOnly: { azureId: '17476' },
  switchFacilities: { azureId: '17477', minNetworks: 3 },
  emptyState: { azureId: '17478' },
  noPermission: { azureId: '17479', shape: { with: ['list', 'view'], without: ['networks'] } satisfies FacilityShape },
  joinDate: { azureId: '17480', minNetworks: 3 },
  syncWithNetwork: { azureId: '17481' },
} as const;

/** 17472's "many": one more than the tab's page of 10 rows. */
export const MANY_MEMBERSHIPS = 11;

/** The empty state the tab shows ("This facility is not assigned to any network."). */
export const NO_NETWORKS = /no network|not assigned to any network|no networks/i;

/** A denied / hidden tab message, when the screen says anything. */
export const DENIED = /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied|unauthori[sz]ed|no access/i;

/** The Assigned On shape. */
export const JOIN_DATE = /^\d{2}\/\d{2}\/\d{4}$/;
