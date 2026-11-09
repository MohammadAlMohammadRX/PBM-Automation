import type { Locator, Page } from '@playwright/test';
import { DIALOG, TOAST, buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { WaitUtils } from '../../utils/WaitUtils';
import { parseCsv } from '../../utils/CsvUtils';
import { parseXlsx, type ParsedXlsx } from '../../utils/XlsxUtils';

/**
 * Small helpers shared by the User Management page objects (2026-11-08). Ids
 * only; the shared `#pbm-dialog` and toast hosts are the ones in ElementIds.
 */

/** The toast summary / detail texts showing now (settled). */
export async function toastMessages(page: Page, timeout: number = Timeouts.short): Promise<string[]> {
  return WaitUtils.settleMessages(async () => (await page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== ''), timeout);
}

/** Every visible field error inside a container whose id starts with `prefix` (`{prefix}*-error`). */
export async function fieldErrors(page: Page, prefix: string): Promise<string[]> {
  return (await page.locator(`[id^="${prefix}"][id$="-error"]`).allInnerTexts().catch(() => [] as string[]))
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
}

/** A p-button host's inner button (the host click is a silent no-op). */
export function hostButton(page: Page, id: string): Locator {
  return page.locator(buttonSelector(id)).first();
}

/** The shared dialog's title + message (empty strings when closed). */
export async function readDialog(page: Page): Promise<{ visible: boolean; title: string; message: string; actions: string[] }> {
  const root = page.locator(`#${DIALOG.root}`);
  const visible = await root.isVisible().catch(() => false);
  if (!visible) return { visible, title: '', message: '', actions: [] };
  return {
    visible,
    title: (await page.locator(`#${DIALOG.title}`).innerText().catch(() => '')).trim(),
    message: (await page.locator(`#${DIALOG.message}`).innerText().catch(() => '')).trim(),
    actions: (await page.locator(`[id^="pbm-dialog-action-"]`).allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter(Boolean),
  };
}

/** Clicks the shared dialog's action `pbm-dialog-action-{key}` (confirm, cancel, stay, discard, csv, excel, login ...). */
export async function clickDialogAction(page: Page, key: string): Promise<void> {
  await hostButton(page, `pbm-dialog-action-${key}`).click({ timeout: Timeouts.default });
}

/** A KPI tile's value once it stops changing (tiles count up from 0). */
export async function settledNumber(value: Locator): Promise<number> {
  await value.waitFor({ state: 'visible', timeout: Timeouts.default });
  let last = (await value.innerText()).trim();
  for (let i = 0; i < 20; i += 1) {
    await value.page().waitForTimeout(300);
    const now = (await value.innerText()).trim();
    if (now === last) break;
    last = now;
  }
  return Number(last.replace(/[^\d-]/g, '') || NaN);
}

/** What an export produced: the request body sent, the file and its parsed rows. */
export interface UserExportResult {
  request: Record<string, unknown>;
  filename: string;
  bytes: Buffer;
  parsed: ParsedXlsx;
}

/**
 * Runs `start` (which ends by clicking CSV / Excel in the format dialog) and
 * returns the request body (matching `endpoint`) and the downloaded file,
 * parsed (CSV or the first sheet of the workbook).
 */
export async function captureExport(page: Page, endpoint: string, start: () => Promise<void>): Promise<UserExportResult> {
  const request = page.waitForRequest((r) => r.url().includes(endpoint), { timeout: Timeouts.default }).catch(() => null);
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await start();
  const sent = await request;
  const file = await download;
  const path = await file.path();
  const bytes = path ? (await import('fs')).readFileSync(path) : Buffer.alloc(0);
  const filename = file.suggestedFilename();
  const parsed: ParsedXlsx = /\.csv$/i.test(filename)
    ? { ...parseCsv(bytes.toString('utf8').replace(/^﻿/, '')), rightToLeft: false }
    : parseXlsx(bytes);
  return { request: (sent?.postDataJSON() as Record<string, unknown> | null) ?? {}, filename, bytes, parsed };
}
