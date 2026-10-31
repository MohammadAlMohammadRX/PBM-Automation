import AdmZip from 'adm-zip';
import type { ParsedCsv } from './CsvUtils';

/**
 * Reading an exported .xlsx back - the Excel counterpart of CsvUtils.
 *
 * Added 2026-10-21 for the network export stories, which ask what the EXCEL
 * file holds (its rows, its Arabic text, whether the sheet reads right-to-left)
 * and not only that it downloaded. A workbook is a zip of XML parts; adm-zip is
 * already a dev dependency, so the first sheet is read directly rather than
 * adding a spreadsheet library for two columns of assertions.
 *
 * Returned in the same shape as parseCsv - headers plus rows keyed by header -
 * so a case can compare the two formats cell for cell.
 */
export interface ParsedXlsx extends ParsedCsv {
  /** Whether the first sheet's view is set right-to-left (`<sheetView rightToLeft="1">`). */
  rightToLeft: boolean;
}

const decode = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');

/** Every `<t>` run inside a shared-string / inline-string item, joined. */
const textOf = (xml: string): string =>
  decode([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

/** "C12" -> 2 (zero-based column index). */
function columnIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/) ?? ['A'])[0];
  return [...letters].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

/**
 * Drops namespace prefixes from tag names. The application's export is written
 * by the OpenXML SDK, which prefixes every element (`<x:row>`, `<x:c>`,
 * `<x:si>`), so prefix-free patterns found no rows at all and every Excel case
 * read an empty workbook (17762, 17763, 17767, 17769 - found 2026-10-27).
 */
const unprefixed = (xml: string): string => xml.replace(/<(\/?)[A-Za-z][\w.-]*:/g, '<$1');

/** Parses the first worksheet of an .xlsx file. */
export function parseXlsx(bytes: Buffer): ParsedXlsx {
  const zip = new AdmZip(bytes);
  const read = (name: string): string => unprefixed(zip.getEntry(name)?.getData().toString('utf8') ?? '');

  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const sheetName = zip
    .getEntries()
    .map((entry) => entry.entryName)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0] ?? 'xl/worksheets/sheet1.xml';
  const sheet = read(sheetName);

  const grid: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const inner = cell[2] ?? '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) ?? ['', 'A1'])[1];
      const type = (attrs.match(/\bt="([^"]+)"/) ?? ['', ''])[1];
      const raw = (inner.match(/<v>([\s\S]*?)<\/v>/) ?? ['', ''])[1];
      const value = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? textOf(inner) : decode(raw);
      cells[columnIndex(ref)] = value;
    }
    grid.push(Array.from(cells, (value) => value ?? ''));
  }

  const headers = (grid[0] ?? []).map((h) => h.trim());
  const rows = grid.slice(1)
    .filter((cells) => cells.some((value) => value.trim() !== ''))
    .map((cells) => Object.fromEntries(headers.map((header, i) => [header, (cells[i] ?? '').trim()])));
  return { headers, rows, rightToLeft: /<sheetView\b[^>]*rightToLeft="(1|true)"/.test(sheet) };
}

// ---- terminology folders 08 / 09 / 11 additions (2026-10-29) ----

const encode = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 0 -> "A", 27 -> "AB". */
function columnRef(index: number): string {
  let n = index + 1;
  let ref = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    ref = String.fromCharCode(65 + rem) + ref;
    n = Math.floor((n - 1) / 26);
  }
  return ref;
}

/**
 * Writes a one-sheet .xlsx - the inverse of parseXlsx, for the upload stories.
 *
 * The Terminology import accepts Excel only, and its cases need files the
 * template cannot give (a wrong column set, a duplicate code, an invalid date).
 * Every cell is an inline string, so no shared-string table is needed and the
 * values arrive exactly as written - the same thing a person typing into Excel
 * and saving produces for text cells.
 */
export function buildXlsx(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): Buffer {
  const cell = (value: string, col: number, row: number): string =>
    `<c r="${columnRef(col)}${row}" t="inlineStr"><is><t xml:space="preserve">${encode(value)}</t></is></c>`;
  const sheetRows = [headers, ...rows]
    .map((values, r) => `<row r="${r + 1}">${values.map((v, c) => cell(v, c, r + 1)).join('')}</row>`)
    .join('');
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '</Types>',
  ));
  zip.addFile('_rels/.rels', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>',
  ));
  zip.addFile('xl/workbook.xml', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
  ));
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '</Relationships>',
  ));
  zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${sheetRows}</sheetData></worksheet>`,
  ));
  return zip.toBuffer();
}
