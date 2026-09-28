/**
 * Test data for "Bulk Import and Export Payer Records" (Azure US 16218).
 *
 * THE STORY IS HALF BUILT, and the halves need telling apart.
 *
 * EXPORT EXISTS. The payer list carries `payer-list-export` and
 * `payer-list-export-trigger`, and the export story (folder 70) already
 * exercises scopes, formats, filenames, column sets and the permission guard.
 * So this story's export cases are written against the real control and reuse
 * folder 70's data rather than restating it.
 *
 * IMPORT DOES NOT EXIST. Probed live on 2026-09-27 against the payer module:
 * no element id anywhere on the list matches import, upload, bulk or template,
 * and the page carries ZERO file inputs. The toolbar offers one action -
 * `payer-list-add-button` - and the breadcrumb offers the payer switcher and
 * the view toggles. There is nothing to upload a file to.
 *
 * So the import cases follow the shape the Clone story uses: ONE case asserts
 * the feature is offered and FAILS, which is the finding, and the rest report
 * BLOCKED behind it. Eleven failures all restating "there is no Bulk Import"
 * would bury the one fact a developer needs under ten copies of itself.
 */

/** What the payer list toolbar and breadcrumb offered when probed. */
export const TOOLBAR_ACTIONS_OBSERVED = [
  'payer-list-add-button',
  'payer-list-export',
  'payer-list-export-trigger',
] as const;

/**
 * The single reason the ten dependent import cases give.
 *
 * One constant so they cannot drift into ten differently-worded versions of
 * one fact, and so one edit retires them all when the feature lands.
 */
export const NEEDS_BULK_IMPORT =
  'This case needs the Bulk Import feature, and the application does not offer one. Probed live '
  + 'on 2026-09-27: no element id on the payer list matches import, upload, bulk or template, the '
  + 'page carries no file input at all, and the toolbar offers only '
  + `${TOOLBAR_ACTIONS_OBSERVED.join(', ')}. The absence itself is reported as a FAILURE by `
  + 'TC-169, which is the finding for the dev team; this case is blocked behind it rather than '
  + 'restating it. Build Bulk Import, add its ids to constants/ElementIds.ts, and this case can '
  + 'be written against it.';

/**
 * Why the export/import column comparison cannot be made either.
 *
 * TC-182 compares the exported file's columns against the BULK IMPORT
 * TEMPLATE. The export half is real and folder 70 already reads its headers;
 * the template does not exist, so there is nothing to compare them to. That is
 * a different blocker from "there is no import screen", and it says so.
 */
export const NEEDS_IMPORT_TEMPLATE =
  'This case compares the exported columns against the Bulk Import template. The export exists '
  + 'and its headers are already read by the export story (folder 70), but no import template '
  + 'exists to compare them against - there is no Bulk Import feature at all. Publish the '
  + 'template, or build the import, and the comparison can be made.';
