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
