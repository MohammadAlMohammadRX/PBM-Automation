import type { Page } from '@playwright/test';
import { NetworkUtils } from '../NetworkUtils';
import { env } from '../../constants/EnvironmentConfig';
import { ACCESS_TOKEN_KEY } from '../../data/payers/lifecycleGuardrails.data';
import { RandomDataUtils } from '../RandomDataUtils';
import { toArabicToken } from '../../data/payers/payer.data';
import { waitForImport } from '../MemberProvisioning';
import type { ParsedCsv } from '../CsvUtils';
import type { ImportFile } from '../../pages/payer/PayerImportDrawer';
import { PAYER_IMPORT_HEADERS, PAYER_EXPORT_CODE_HEADER } from '../../data/payers/bulkImportExport.data';

/** One payer row of an import file, by meaning (every field optional - a default valid value fills the rest). */
export interface PayerImportRow {
  code?: string;
  nameEn?: string;
  nameAr?: string;
  type?: string;
  email?: string;
  dialCode?: string;
  phone?: string;
  licence?: string;
  country?: string;
  city?: string;
  effective?: string;
  expiry?: string;
}

const two = (n: number): string => String(n).padStart(2, '0');

/** DD/MM/YYYY, `days` from today - the format the import accepts (verified 2026-11-24). */
export function importDate(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * A valid new payer row: unique English name, Arabic-letters-only Arabic name,
 * unique email and licence, Private, +966, Saudi Arabia / Riyadh, effective in
 * 2 days for a year. `index` keeps rows of one file apart.
 */
export function validPayerRow(tag: string, index = 1, over: PayerImportRow = {}): Required<PayerImportRow> {
  const suffix = `${tag}${index}`;
  return {
    code: '',
    nameEn: `Import Payer ${suffix}`,
    nameAr: `جهة استيراد ${toArabicToken(suffix)}`,
    type: 'Private',
    email: `import.payer.${suffix.toLowerCase()}@example.com`,
    dialCode: '+966',
    phone: `5${String(10_000_000 + Math.floor(Math.random() * 89_999_999)).slice(0, 8)}`,
    licence: `LIC-IMP-${suffix}`,
    country: 'Saudi Arabia',
    city: 'Riyadh',
    effective: importDate(2),
    expiry: importDate(365),
    ...over,
  };
}

/** A short unique tag for one case's rows. */
export const importTag = (): string => RandomDataUtils.uniqueSuffix().replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();

const field = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function cells(row: PayerImportRow, withCode: boolean): string[] {
  const r = row as Required<PayerImportRow>;
  const values = [r.nameEn, r.nameAr, r.type, r.email, r.dialCode, r.phone, r.licence, r.country, r.city, r.effective, r.expiry];
  return withCode ? [r.code ?? '', ...values] : values;
}

/**
 * A CSV import file. Without `withCode` it carries the template's 11 columns
 * (new records); with it, the export's "Payer Code" first (the drawer: "Fill
 * the Code of an existing record to update it").
 */
export function payerCsv(name: string, rows: readonly PayerImportRow[], withCode = false, padTo?: number): ImportFile {
  const headers = withCode ? [PAYER_EXPORT_CODE_HEADER, ...PAYER_IMPORT_HEADERS] : [...PAYER_IMPORT_HEADERS];
  const body = `﻿${[headers.map(field).join(','), ...rows.map((row) => cells(row, withCode).map(field).join(','))].join('\r\n')}\r\n`;
  let buffer = Buffer.from(body, 'utf8');
  // Padding with blank lines brings a file to an exact size without adding records.
  if (padTo !== undefined && padTo > buffer.length) {
    const pad = Buffer.alloc(padTo - buffer.length, '\n');
    buffer = Buffer.concat([buffer, pad]);
  }
  return { name, mimeType: 'text/csv', buffer };
}

/** A payer as GetPayers lists it. */
export interface ListedPayer {
  payerNameEn: string;
  payerCode?: string | null;
  phoneNumber?: string | null;
  licenseNumber?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

/** The payers GetPayers finds for a search text (empty on any failure). */
export async function findPayers(page: Page, text: string): Promise<ListedPayer[]> {
  const res = await NetworkUtils.postAsSession(page, '/api/Payers/GetPayers', { pageNumber: 1, rowsPerPage: 50, searchText: text });
  if (res.status >= 300) return [];
  try {
    return (JSON.parse(res.text) as { payload?: { payers?: { items?: ListedPayer[] } } }).payload?.payers?.items ?? [];
  } catch {
    return [];
  }
}

/** Sends ImportPayers directly as the page's session (multipart `file`, what the drawer sends) - the "invoke it directly" check. */
export async function postPayerImport(page: Page, file: ImportFile): Promise<{ status: number; text: string }> {
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const res = await page.request.fetch(`${env.baseUrl}/api/Payers/ImportPayers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
    multipart: { file },
    failOnStatusCode: false,
  });
  return { status: res.status(), text: await res.text().catch(() => '') };
}

/**
 * The operation id of the latest upload of `fileName` (GetPayerImportHistory), '' when none. The fallback when
 * ImportPayers' answer body cannot be read - a 25 MB request (16433, 24 Nov 2026) left its response body
 * unavailable to the browser, so the id came back empty and every status poll was refused with 500.
 */
export async function latestOperationOf(page: Page, fileName: string): Promise<string> {
  const res = await NetworkUtils.postAsSession(page, '/api/Payers/GetPayerImportHistory', { pageNumber: 1, rowsPerPage: 20 });
  if (res.status >= 300) return '';
  try {
    const payload = (JSON.parse(res.text) as { payload?: unknown }).payload as { items?: Record<string, unknown>[] } | Record<string, unknown>[] | undefined;
    const items = (Array.isArray(payload) ? payload : payload?.items ?? []) as Record<string, unknown>[];
    const hit = items.find((i) => String(i.fileName ?? i.FileName ?? '') === fileName);
    return hit ? String(hit.operationId ?? hit.id ?? '') : '';
  } catch {
    return '';
  }
}

/** Waits for a payer import operation to finish and returns its final state (status, totals). */
export async function waitForPayerImport(page: Page, operationId: string, timeoutMs = 180_000): Promise<Record<string, unknown>> {
  return waitForImport(page, operationId, timeoutMs);
}

/** "Succeeded: 3 Failed: 2" -> { succeeded: 3, failed: 2 } (NaN when not shown). */
export function summaryCounts(summary: string): { succeeded: number; failed: number } {
  const n = (label: string): number => Number((summary.match(new RegExp(`${label}:\\s*(\\d+)`, 'i')) ?? ['', 'NaN'])[1]);
  return { succeeded: n('Succeeded'), failed: n('Failed') };
}

/** The result file's error text for the row carrying `text` in any cell ('' when none). */
export function resultReasonFor(parsed: ParsedCsv | null, text: string): string {
  if (!parsed) return '';
  const errorHeader = parsed.headers.find((h) => /error|reason|message/i.test(h)) ?? '';
  const row = parsed.rows.find((r) => Object.values(r).some((v) => v.includes(text)));
  return row && errorHeader ? (row[errorHeader] ?? '').trim() : '';
}
