import { NETWORK_EXPORT_FILE, NETWORK_LIFECYCLE, uniqueArabic, type NetworkBlockedCase } from './network.data';
import { networkStamp } from '../../utils/NetworkProvisioning';
import type { ParsedCsv } from '../../utils/CsvUtils';

/**
 * Test data for US 14303 "Include Arabic details and owning payer when
 * exporting the network list".
 *
 * Every case runs with the UI switched to ARABIC, as the sheet's
 * preconditions say, and switches back to English at teardown.
 *
 * COLUMNS ARE ADDRESSED BY POSITION, not header text: the header row may be
 * translated in the Arabic UI, and the English export (verified 2026-10-21)
 * writes, in order: Network Code, Network Name (English), Network Name
 * (Arabic), Network Type, Payer Code, Description (English), Description
 * (Arabic), Effective Date, Expiry Date. So the owning payer is exported as a
 * CODE; the cases that expect the payer's NAME assert that separately and
 * report it if it is not.
 */

export const COL = {
  code: 0,
  nameEn: 1,
  nameAr: 2,
  type: 3,
  payer: 4,
  descriptionEn: 5,
  descriptionAr: 6,
  effectiveDate: 7,
  expiryDate: 8,
} as const;

/** One exported cell by column position. */
export const cellAt = (file: ParsedCsv, row: Record<string, string>, column: number): string =>
  row[file.headers[column]] ?? '';

/** The exported row for a Network Code, or undefined. */
export const rowFor = (file: ParsedCsv, code: string): Record<string, string> | undefined =>
  file.rows.find((row) => cellAt(file, row, COL.code) === code);

export const SCOPE = { allNetworks: 'all', filteredResults: 'selected' } as const;
export const EXPORT_FILE = NETWORK_EXPORT_FILE;
export const UTF8_BOM = 'efbbbf';
export const XLSX_SIGNATURE = 'PK';

/** The columns the sheet lists for the exported file (18068), as words a header should carry. */
export const SHEET_HEADER_WORDS = [
  'Network Name (English)',
  'Network Name (Arabic)',
  'Description (English)',
  'Description (Arabic)',
  'Owning Payer',
  'Network Type',
  'Status',
  'Approval Status',
] as const;

/** Arabic content for the case's own networks. */
export const ARABIC = {
  name: () => uniqueArabic('شبكة الدواء'),
  description: 'وصف الشبكة',
  /** Diacritics, which only a correct UTF-8 round trip keeps. */
  diacriticName: () => uniqueArabic('شَبَكَةُ الصَّيْدَلِيَّاتِ التَّجْرِيبِيَّة'),
  /** Mixed scripts belong in the ENGLISH description: the Arabic fields accept Arabic only. */
  mixedText: 'Network شبكة 123',
} as const;

export const FILTER_A = NETWORK_LIFECYCLE.active;
export const FILTER_B = NETWORK_LIFECYCLE.inactive;
export const NO_MATCH_TERM = `NONEXISTENT999 ${networkStamp()}`;

/**
 * Bug 20021 (network bug report 29 Oct 2026, bug 25): the export writes the
 * owning payer as a payer CODE column ("PAY-003569"); the QA lead's expected
 * result is that the payer column does not appear in the export at all. A
 * column counts as a payer column by its header or by holding payer codes.
 */
export const PAYER_COLUMN_BUG = { type: 'issue', description: 'Azure bug 20021: Network list exported writes the payer code' } as const;
export const PAYER_HEADER = /payer|الدافع|جهة الدفع|الجهة الدافعة/i;
export const PAYER_CODE = /^PAY(-D)?-\d{3,}$/;

/** The headers of the columns that carry the owning payer: by name, or by holding payer codes. */
export const payerColumns = (file: ParsedCsv): string[] =>
  file.headers.filter((header) => PAYER_HEADER.test(header) || file.rows.some((row) => PAYER_CODE.test((row[header] ?? '').trim())));

export const CASES = {
  csvColumns: { azureId: '18057' },
  excelColumns: { azureId: '18059' },
  scopePrompt: { azureId: '18058', filter: NETWORK_LIFECYCLE.active },
  allIgnoresFilter: { azureId: '18060', filter: NETWORK_LIFECYCLE.active },
  filteredOnly: { azureId: '18061' },
  encoding: { azureId: '18062' },
  missingArabic: { azureId: '18063' },
  zeroResults: { azureId: '18065' },
  withAndWithoutPayer: { azureId: '18064' },
  noPermission: { azureId: '18066' },
  naming: { azureId: '18068' },
  currentState: { azureId: '18069' },
  excelRtl: { azureId: '18070' },
} as const;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '18067',
    title: 'should export every one of 5,000+ networks completely and accurately when Export All is run on a large dataset',
    reason:
      'Needs a register of 5,000+ networks across several payers. This environment holds under 800, and seeding '
      + 'thousands of networks into the shared QA register is not acceptable. Runnable against a performance '
      + 'environment seeded with 5,000+ networks.',
  },
];
