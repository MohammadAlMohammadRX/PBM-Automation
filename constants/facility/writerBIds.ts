import { FACILITY_DETAIL, FACILITY_FORM, FACILITY_NETWORKS } from './facilityIds';

/**
 * Ids Writer B's facility folders (05, 06, 07, 08, 13) need beyond
 * constants/facility/facilityIds.ts. Read off the live screens / probe dumps on
 * 2026-11-04 (reports/facility/probe/foundation-2026-11-04).
 */

/** The left-hand navigation entry "Facility Mgmt" (`app-nav-{route}-link`, as the build brief records). */
export const FACILITY_NAV_LINK = 'app-nav-facility-management-link';

/** The Network Assignment tab's pager buttons (the list pager's convention: `{screen}-table-pager-next|prev`). */
export const FACILITY_NETWORKS_PAGER = {
  next: `${FACILITY_NETWORKS.pager}-next`,
  prev: `${FACILITY_NETWORKS.pager}-prev`,
} as const;

/** One Network Assignment row (`facility-detail-networks-table-row-{networkId}`). */
export const facilityNetworkRowId = (networkId: string): string => `${FACILITY_NETWORKS.screen}-row-${networkId}`;

/** The roots the Leaflet maps live under (the map itself carries no id - see utils/facility/writerBHelpers.ts). */
export const FACILITY_MAP_HOST = {
  /** "Pick location on map" on the drawer's step 2. */
  drawer: FACILITY_FORM.root,
  /** The read-only map of the Overview's Geo-coordinates section. */
  overview: FACILITY_DETAIL.root,
} as const;
