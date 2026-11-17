import type { Page } from '@playwright/test';
import { NetworkUtils } from '../NetworkUtils';
import { env } from '../../constants/EnvironmentConfig';

/**
 * Lookups through the API (2026-11-09). Seen live:
 *
 *   POST /api/Lookups/GetLookups { pageNumber, rowsPerPage, sortBy: "CreatedOn desc", searchText? }
 *        -> payload { currentPage, totalPages, totalRows (57), items: [{ id, code, predefined, englishName, arabicName, createdOn, modifiedOn }] }
 *   GET  /api/Lookups/Items/<list code>
 *        -> payload [{ id, lookupId, code, englishName, arabicName, isActive, index, predefined, parentItemId }]  (inactive items included)
 *
 * From the app bundle (shapes NOT yet seen on the wire - the first writer/run
 * that sees them corrects this comment):
 *   POST   /api/Lookups/CreateLookupItem   body: the drawer's item (lookupId, code, englishName, arabicName, index, isActive)
 *   PUT    /api/Lookups/UpdateLookupItem   body: the item with its id
 *   DELETE /api/Lookups/DeleteLookupItem/<item id>
 *   GET    /api/Lookups/GetLookup/<lookup id>
 *   download /api/Lookups/ExportLookups (register) and /api/Lookups/ExportLookupItems { code, format, codes }
 * Permission keys: Lookups.GetLookups, GetLookup, CreateLookupItem, UpdateLookupItem,
 * DeleteLookupItem, ExportLookups, ExportLookupItems (+ CreateLookup/UpdateLookup/DeleteLookup, AuditLogs).
 */

export interface LookupRow {
  id: string;
  code: string;
  predefined: boolean;
  englishName: string;
  arabicName: string;
  createdOn: string;
  modifiedOn: string | null;
}

export interface LookupItem {
  id: string;
  lookupId: string;
  code: string;
  englishName: string;
  arabicName: string;
  isActive: boolean;
  index: number;
  predefined: boolean;
  parentItemId: string | null;
}

export interface LookupAnswer {
  status: number;
  text: string;
  errors: string[];
}

/** Suite items are recognisable: their code starts with this (and their English name with "QA Automation"). */
export const SUITE_ITEM_PREFIX = 'QA-AUTO-';

async function onApp(page: Page): Promise<void> {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
}

function errorsOf(text: string, fallback: string[]): string[] {
  try {
    const body = JSON.parse(text) as { ValidationErrors?: { Name?: string; Reason?: string }[]; validationErrors?: Record<string, string[]> };
    if (Array.isArray(body.ValidationErrors)) return body.ValidationErrors.map((e) => `${e.Name ?? ''}: ${e.Reason ?? ''}`);
    if (body.validationErrors && typeof body.validationErrors === 'object') return Object.entries(body.validationErrors).map(([k, v]) => `${k}: ${[v].flat().join(' ')}`);
  } catch {
    /* not JSON */
  }
  return fallback;
}

/** Every list of the register (all pages). */
export async function readAllLookups(page: Page, searchText?: string): Promise<{ totalRows: number; items: LookupRow[] }> {
  await onApp(page);
  const res = await NetworkUtils.requestAsSession(page, 'POST', '/api/Lookups/GetLookups', { pageNumber: 1, rowsPerPage: 1000, sortBy: 'CreatedOn desc', ...(searchText ? { searchText } : {}) });
  if (res.status !== 200) throw new Error(`GetLookups answered ${res.status}: ${res.text.slice(0, 200)}`);
  const payload = (JSON.parse(res.text) as { payload: { totalRows: number; items: LookupRow[] } }).payload;
  return { totalRows: payload.totalRows, items: payload.items };
}

/** The list's register row (id, names) by its code. */
export async function lookupByCode(page: Page, code: string): Promise<LookupRow> {
  const { items } = await readAllLookups(page, code);
  const row = items.find((r) => r.code === code);
  if (!row) throw new Error(`no lookup list with code "${code}"`);
  return row;
}

/** Every item of a list, inactive ones included. */
export async function readLookupItems(page: Page, listCode: string): Promise<LookupItem[]> {
  await onApp(page);
  const res = await NetworkUtils.requestAsSession(page, 'GET', `/api/Lookups/Items/${encodeURIComponent(listCode)}`);
  if (res.status !== 200) throw new Error(`Items/${listCode} answered ${res.status}: ${res.text.slice(0, 200)}`);
  return (JSON.parse(res.text) as { payload: LookupItem[] }).payload ?? [];
}

export async function createLookupItem(
  page: Page,
  item: { lookupId: string; code: string; englishName: string; arabicName: string; index?: number; isActive?: boolean },
): Promise<LookupAnswer> {
  await onApp(page);
  const res = await NetworkUtils.requestAsSession(page, 'POST', '/api/Lookups/CreateLookupItem', { index: 0, isActive: true, ...item });
  return { status: res.status, text: res.text, errors: res.status >= 400 ? errorsOf(res.text, res.validationErrors) : [] };
}

export async function updateLookupItem(page: Page, item: LookupItem): Promise<LookupAnswer> {
  await onApp(page);
  const res = await NetworkUtils.requestAsSession(page, 'PUT', '/api/Lookups/UpdateLookupItem', item);
  return { status: res.status, text: res.text, errors: res.status >= 400 ? errorsOf(res.text, res.validationErrors) : [] };
}

export async function deleteLookupItem(page: Page, itemId: string): Promise<LookupAnswer> {
  await onApp(page);
  const res = await NetworkUtils.requestAsSession(page, 'DELETE', `/api/Lookups/DeleteLookupItem/${itemId}`);
  return { status: res.status, text: res.text, errors: res.status >= 400 ? errorsOf(res.text, res.validationErrors) : [] };
}
