/**
 * Reading an exported CSV back.
 *
 * The licence-number story asks for one thing that cannot be checked on screen:
 * that the EXPORTED file carries the licence number and that it matches the
 * record it came from. That means parsing a real download.
 *
 * Deliberately a tiny parser rather than a dependency. The payer export is a
 * plain comma-separated file whose only awkward features are a UTF-8 BOM and
 * quoted fields containing commas, both handled below. Adding a CSV library to
 * the framework for one export column would be a larger change than the story
 * warrants.
 *
 * Rows are returned KEYED BY HEADER NAME. Addressing an export column by
 * position is how an assertion ends up reading Status because a column was
 * inserted upstream - the same failure mode the id-based table locators exist
 * to prevent.
 */

/** One exported row, keyed by its column header. */
export type CsvRow = Record<string, string>;

export interface ParsedCsv {
  /** Column headers, in file order, with the BOM stripped. */
  headers: string[];
  rows: CsvRow[];
}

/**
 * Splits one CSV line, honouring double-quoted fields.
 *
 * Payer names legitimately contain commas, and a naive `split(',')` shifts
 * every later column on that row - which would show up as a licence number
 * that "does not match" when the file is perfectly correct.
 */
function splitLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      // A doubled quote inside a quoted field is a literal quote.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

/**
 * Parses CSV text into headers plus header-keyed rows.
 *
 * The BOM strip is not cosmetic: the payer export begins with one, so without
 * it the first header reads `\uFEFFPayer Code` and every lookup of "Payer Code"
 * returns undefined - a failure that looks like a missing column.
 */
export function parseCsv(text: string): ParsedCsv {
  const withoutBom = text.replace(/^\uFEFF/, '');
  const lines = withoutBom.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const fields = splitLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = fields[index] ?? '';
    });
    return row;
  });

  return { headers, rows };
}

/** Every value in one column, by header name. */
export function columnValues(csv: ParsedCsv, header: string): string[] {
  return csv.rows.map((row) => row[header] ?? '');
}

/**
 * The one row whose `header` column equals `value`.
 *
 * Returns undefined rather than throwing so the caller can assert on the
 * absence - "the oversized licence number is not in the export" is itself an
 * expected result.
 */
export function findRow(csv: ParsedCsv, header: string, value: string): CsvRow | undefined {
  return csv.rows.find((row) => (row[header] ?? '') === value);
}
