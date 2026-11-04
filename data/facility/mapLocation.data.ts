import type { FacilityShape } from '../../utils/facility/writerBHelpers';

/**
 * US 15137 "Facility map location control" (facility folder 06).
 *
 * The control (verified 2026-11-04): step 2 "Contact & License" of the Add /
 * Edit drawer shows "Pick location on map" (Leaflet, OpenStreetMap tiles,
 * centre 24.7136 / 46.6753 = Riyadh, zoom 6). A click sets Latitude AND
 * Longitude (6 decimals); the marker is draggable; the view recentres on the
 * marker at zoom >= 13. Typing coordinates moves the marker. The Overview shows
 * Longitude / Latitude and a read-only map when both are set. Saving WITHOUT a
 * location is allowed (no prompt), and there is no range check on the
 * coordinates (latitude 91 / longitude 181 are kept) - 17485 / 17487 assert
 * the case and fail: those are the findings.
 *
 * Literal readings / decisions:
 * - 17482 "the captured values match the clicked map location": the click is
 *   made up and to the right of the map's own centre (Riyadh), so the captured
 *   latitude must be north of 24.7136 and the longitude east of 46.6753, within
 *   the map's view, written to 6 decimals.
 * - 17485 "near +90 / near +/-180": the map is zoomed fully out and clicked a
 *   few pixels inside its top edge, then (zoomed out again - a click recentres)
 *   a few pixels inside its right edge. "Near" = within NEAR_EDGE degrees, and a
 *   displayed value beyond the valid range (|lat| > 90, |lon| > 180) is an error.
 *   Web-Mercator maps end at about 85.05 degrees; whether that counts as "near
 *   +90" is the case's own boundary (NEAR_EDGE = 10).
 * - 17486 "urban vs remote": the map's centre (Riyadh city centre) and a point
 *   far to its south-west in the Empty Quarter, both checked the same way.
 * - 17488 "maximum zoom": zoomed in until Leaflet disables "+"; the click is a
 *   few pixels off the centre, so the captured point must lie within
 *   MAX_ZOOM_TOLERANCE degrees of the view's centre, with >= 6 decimals.
 * - 17490 "three rapid clicks": three clicks one after the other, each read as
 *   soon as the inputs change; only one marker and the LAST click's values.
 * - 17491 "a landmark": the click target is the view's centre after zooming in,
 *   panning and zooming out; "anchored" = after zooming back out the inputs
 *   still hold the clicked values and the marker is still inside the map.
 * - 17492 / 17494: a suite facility saved with LOCATION (6 decimals); the
 *   Contact & License step is the EDIT drawer's step 2.
 * - 17496 "a user without facility edit permission": the Payer Admin shaped
 *   with list + view but WITHOUT UpdateFacility. The Contact & License step
 *   exists only inside the Edit drawer, so for this user "the step" is the
 *   facility's own record (the location shown read-only on the Overview);
 *   "attempt to change the location" = the Edit action and an UpdateFacility
 *   with new coordinates sent from that session. Baseline: the administrator is
 *   offered Edit.
 */
export const CASES = {
  placeByClick: { azureId: '17482', click: { dx: 40, dy: -25 } },
  updateByClick: { azureId: '17483', click: { dx: 60, dy: 30 } },
  shownOnOverview: { azureId: '17484', latitude: 24.774265, longitude: 46.738586 },
  extremeEdges: { azureId: '17485' },
  anyRegion: { azureId: '17486', remote: { dx: -150, dy: 110 } },
  saveWithoutLocation: { azureId: '17487', label: 'NoLocation' },
  maxZoomPrecision: { azureId: '17488', click: { dx: 6, dy: 4 } },
  saveCombinations: { azureId: '17489', label: 'MapCombo', click: { dx: -35, dy: 20 }, changedBuilding: 'Building edited without moving the map' },
  rapidClicks: { azureId: '17490', clicks: [{ dx: -60, dy: -20 }, { dx: 50, dy: 25 }, { dx: 20, dy: -40 }] },
  zoomPanThenClick: { azureId: '17491', pan: { dx: 80, dy: 40 } },
  consistentDisplay: { azureId: '17492', latitude: 24.713551, longitude: 46.675296 },
  navigateAway: { azureId: '17494', latitude: 21.485811, longitude: 39.192505 },
  noEditPermission: { azureId: '17496', shape: { with: ['list', 'view'], without: ['edit'] } satisfies FacilityShape, newLatitude: 26.4207, newLongitude: 50.0888 },
} as const;

/** The map's own centre (Riyadh) - the drawer's starting view on Add. */
export const MAP_CENTRE = { latitude: 24.7136, longitude: 46.6753 } as const;

/** The decimals a map click writes. */
export const CLICK_DECIMALS = 6;

/** "Near" the poles / the antimeridian, in degrees (17485). */
export const NEAR_EDGE = 10;

/** How far (degrees) a click a few pixels off-centre may land at maximum zoom (17488). */
export const MAX_ZOOM_TOLERANCE = 0.001;

/** A message asking for the location (17487). */
export const LOCATION_REQUIRED = /location|map|latitude|longitude/i;

/** The Overview labels of the coordinates. */
export const COORDINATE_LABELS = { latitude: 'Latitude', longitude: 'Longitude' } as const;
