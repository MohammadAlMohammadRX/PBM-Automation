import { SUITE_FORMULARY_PREFIX, SUITE_TRADES, formularyStamp } from '../../utils/FormularyProvisioning';

/**
 * US 15198 "Formulary Bulk import" (formulary folder 08).
 *
 * The import is the shared bulk component (bundle chunk-VMD4MUM4 / DKMKJIP5,
 * NOT exercised live before this folder): adding a file to the drawer's drop
 * zone POSTs it at once (multipart) - the list's Import to ImportFormularies,
 * the Tiers tab's to ImportFormularyTiers, the Trades tab's to
 * ImportFormularyTrades (Excel only, several pages) - and starts a background
 * operation polled through /api/BulkOperations/GetBulkOperationsStatus
 * (Completed / CompletedWithErrors / Failed, with total / succeeded / failed /
 * created / updated rows). Upload history lists the operations with a result
 * file (DownloadFormularyImportResult). The client refuses a wrong file type
 * and anything over the drop hint's size ("up to 25 MB") without sending it.
 *
 * Files are generated at run time from the screen's own templates (Export >
 * Export Template; the Tiers / Trades tabs' templates). Every formulary row
 * carries a suite name and is registered for discard before upload; tiers and
 * trades go into the case's own Draft formulary (the bundle's rule: the parent
 * must be a draft).
 *
 * Readings (noted per case below):
 *  - 18682: the case's "10 MB" is the sheet's example; the boundary is tested at
 *    the maximum the screen states (drop hint), read at run time.
 *  - 18678: "Uploading" is the drawer's own state while the file is sent; the
 *    operation's first status read straight after must not be final yet.
 *  - 18677 / 18684 / 18685 place the bad row among good ones (the catalogue the
 *    suite uses has three trades, so the sheet's row numbers 3 / 4 / 7 / 9 are
 *    reduced to the second / third row).
 *  - 20292: the list's "Selected Export" after searching the case's formulary
 *    is the "selected formulary data"; the Tiers and Trades tabs' exports are
 *    the tier and trade data of that formulary.
 */

/** A batch of suite names sharing one stamp, so the batch can be found and discarded. */
export const batchNames = (label: string, count: number): string[] => {
  const batch = formularyStamp();
  return Array.from({ length: count }, (_, i) => `${SUITE_FORMULARY_PREFIX} ${label} ${batch} ${i + 1}`);
};

/** The catalogue trades (MED-001 Paracetamol - the sheet's "Panadol 500mg"; MED-002 - its "Zinnat 250mg"). */
export const EXISTING_TRADE = SUITE_TRADES[0];
export const NEW_TRADE = SUITE_TRADES[1];
export const THIRD_TRADE = SUITE_TRADES[2];

/** The drop hint's maximum ("up to 25 MB") in bytes, or NaN. */
export const maxBytesOf = (hint: string): number => {
  const mb = hint.match(/(\d+(?:\.\d+)?)\s*MB/i);
  return mb ? Math.round(Number(mb[1]) * 1024 * 1024) : NaN;
};

/** A non-spreadsheet file the drawer must refuse (report.pdf). */
export const PDF_FILE = {
  name: 'report.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'),
};

/** What the screen and the result file must say. */
export const IMPORT_MESSAGE = {
  /** The sheet's message for a wrong type: "Only .xlsx or .csv files are allowed." */
  wrongType: /\.xlsx[\s\S]*\.csv|xlsx or csv/i,
  tooLarge: /MB|size|too large|exceed/i,
  noRows: /no (data )?rows|no data|empty|nothing to import|no records/i,
  required: /required|missing|empty/i,
  unknownTrade: /not found|unknown|invalid|does not exist|not recogni[sz]ed|XYZ-INVALID/i,
  duplicate: /duplicate|already|more than once|repeated/i,
  approvedLocked: /approved|published|cannot be (edited|changed|updated)|not allowed|already exists|no edit/i,
  /** Anything that would re-run a finished import. */
  reprocess: /re-?process|retry|re-?run|start again|run again/i,
} as const;

export const CASES = {
  validFormularies: { azureId: '18674', rows: 20 },
  tiers: { azureId: '18675', existing: { nameEn: 'Tier 1', order: 1, coverage: 80 }, added: { nameEn: 'Tier 4', order: 4, coverage: 40 }, updatedCoverage: 60 },
  trades: { azureId: '18676', updatedSupplierPrice: 11 },
  invalidRow: { azureId: '18677', badCode: 'XYZ-INVALID' },
  lifecycle: { azureId: '18678', rows: 2, inFlight: /upload|queue|pending|process|running|progress|import has started/i, final: /^(Completed|CompletedWithErrors)$/ },
  mixed: { azureId: '18679', valid: 15, invalid: 5 },
  errorFile: { azureId: '18680', valid: 2, invalid: 5 },
  fileType: { azureId: '18681' },
  fileSize: { azureId: '18682' },
  emptyFile: { azureId: '18683' },
  missingField: { azureId: '18684' },
  duplicateTrade: { azureId: '18685' },
  noPermission: { azureId: '18686' },
  template: {
    azureId: '18687',
    formularyHeaders: [/name.*(english|\(en)/i, /name.*(arabic|\(ar)/i, /payer/i, /effective/i, /expiry/i],
    tierHeaders: [/tier.*name|name/i, /order/i],
    tradeHeaders: [/trade/i],
  },
  /** 10 valid (two with "&" and extra spaces), 20 invalid (blank Arabic name, Arabic in the English name, an expiry before the effective date). */
  exploratory: { azureId: '18688', valid: 10, invalid: 20 },
  approvedUpdate: { azureId: '20047', changedName: 'Changed through bulk import' },
  selectedExport: { azureId: '20292', tiers: 2, trades: 2 },
} as const;
