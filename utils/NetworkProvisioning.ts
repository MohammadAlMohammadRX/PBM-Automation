import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { DateUtils } from './DateUtils';
import { Logger } from './Logger';
import { toArabicToken } from '../data/payers/payer.data';
import {
  APPROVE_REQUEST_ENDPOINT,
  ASSIGN_FACILITIES_ENDPOINT,
  CREATE_NETWORK_ENDPOINT,
  GET_APPROVALS_ENDPOINT,
  HMO_NETWORK_TYPE_ID,
  SHARED_FACILITY_ID,
  SUBMIT_NETWORK_ENDPOINT,
} from '../data/networks/seedNetworks.data';

/** Name prefix of the networks a case creates for itself - NOT a protected seed prefix. */
export const DISPOSABLE_NETWORK_PREFIX = 'Automation Network';

/**
 * Creates one network for a single case, approved and Active, and returns its name.
 *
 * WHY (2026-10-19). The network-status cases used to pick the first network in
 * the wanted status from the list. That is almost always a NETWORK-SEED pool
 * network, which ProtectedData refuses to inactivate, so the cases reported
 * BLOCKED or FAILED on the suite's own guard. Real team networks must not be
 * flipped either. A network the case creates for itself has neither problem.
 *
 * Same calls as the network seeder (tests/seed/seed-networks.spec.ts): create,
 * attach the shared facility BEFORE submission, submit, approve. The approval is
 * looked up by NAME because the queue row's entityId is the network's version
 * id - see APPROVE_REQUEST_ENDPOINT.
 *
 * Needs a signed-in page on the application (postAsSession reads its token).
 */
export async function provisionDisposableNetwork(page: Page): Promise<string> {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;
  const name = `${DISPOSABLE_NETWORK_PREFIX} ${stamp}`;
  const fail = (what: string, res: { status: number; text: string }): never => {
    throw new Error(`could not provision "${name}": ${what} answered ${res.status} ${res.text.slice(0, 400)}`);
  };

  const created = await NetworkUtils.postAsSession(page, CREATE_NETWORK_ENDPOINT, {
    networkNameEn: name,
    networkNameAr: `شبكة ${toArabicToken(stamp)}`,
    networkTypeId: HMO_NETWORK_TYPE_ID,
    descriptionEn: 'Created by an automated case for its own use.',
    descriptionAr: `وصف ${toArabicToken(stamp)}`,
    // A MOMENT AHEAD, with its time (2026-10-19): since the date+time build
    // "today" at 00:00 is refused as "Effective date and time cannot be in the
    // past". The network starts Pending and the lifecycle job (every minute
    // here) makes it Active; the fixture waits for that.
    effectiveDate: new Date(Date.now() + 60_000).toISOString(),
    expiryDate: DateUtils.toIsoDate(DateUtils.futureDate(365)),
  });
  if (created.status >= 300) fail('create', created);
  const id = String((JSON.parse(created.text) as { payload?: { id?: string } }).payload?.id ?? '');
  if (!id) throw new Error(`could not provision "${name}": created but no id came back`);

  const attached = await NetworkUtils.postAsSession(page, ASSIGN_FACILITIES_ENDPOINT, {
    networkId: id,
    facilityIds: [SHARED_FACILITY_ID],
    confirmRevertToDraft: false,
  });
  if (attached.status >= 300) fail('attach facility', attached);

  const submitted = await NetworkUtils.postAsSession(page, SUBMIT_NETWORK_ENDPOINT, { networkId: id });
  if (submitted.status >= 300) fail('submit', submitted);

  let requestId = '';
  // Paged the way the seeder reads the queue (200 rows a page, up to 10 pages),
  // retried briefly because the request can take a moment to be listed.
  for (let attempt = 1; attempt <= 5 && !requestId; attempt += 1) {
    for (let pageNumber = 1; pageNumber <= 10 && !requestId; pageNumber += 1) {
      const res = await NetworkUtils.postAsSession(page, GET_APPROVALS_ENDPOINT, { pageNumber, rowsPerPage: 200 });
      const body = JSON.parse(res.text) as { payload: Record<string, { items?: Record<string, unknown>[] }> };
      const rows = Object.values(body.payload).find((v) => Array.isArray(v?.items))?.items ?? [];
      const row = rows.find((r) => String(r.entityNameEn ?? '') === name && String(r.status) === 'Pending');
      if (row) requestId = String(row.id);
      if (rows.length < 200) break;
    }
    if (!requestId) await page.waitForTimeout(1_000);
  }
  if (!requestId) throw new Error(`could not provision "${name}": its approval request never appeared in the queue`);

  const approved = await NetworkUtils.postAsSession(page, APPROVE_REQUEST_ENDPOINT, { id: requestId });
  if (approved.status >= 300) fail('approve', approved);

  Logger.step(`[fixture] Provisioned disposable network "${name}" (approved; Active once its effective time passes)`);
  return name;
}
