import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { approvePending, readNetwork, submitNetwork, type NetworkRecord } from './NetworkProvisioning';

/**
 * Builds a network's HISTORY through the application's own API - published
 * edits, facility membership changes, staged drafts - for the stories that
 * start from "a network with N published versions" or "a network whose audit
 * history holds Update / Facility Assigned events".
 *
 * Same maker-checker path the screen takes (verified 2026-10-21): UpdateNetwork
 * (PUT, with the record's concurrencyStamp) or Assign/Unassign stages a draft,
 * SubmitNetworkForApproval sends it, and the approval request is approved by
 * name. Nothing here is a shortcut past the workflow the stories describe.
 */

/** Fields an edit may change. */
export interface NetworkEdit {
  descriptionEn?: string;
  descriptionAr?: string;
  networkNameEn?: string;
  networkNameAr?: string;
  expiryDate?: string;
}

/** One row of GetNetworkVersions, as the server answers it. */
export interface NetworkVersionRecord {
  id: string;
  networkId: string;
  version: number;
  versionStatusCode: string;
  versionStatusEn: string;
  changeType: string;
  [key: string]: unknown;
}

type Answer = { status: number; text: string; validationErrors: string[] };

const must = (what: string, res: Answer): void => {
  if (res.status >= 300) throw new Error(`${what} answered ${res.status} ${res.text.slice(0, 300)}`);
};

/** The UpdateNetwork body for a record with `edit` applied. */
function updateBody(record: NetworkRecord, edit: NetworkEdit): Record<string, unknown> {
  return {
    networkNameEn: edit.networkNameEn ?? record.networkNameEn,
    networkNameAr: edit.networkNameAr ?? record.networkNameAr,
    networkTypeId: record.networkTypeId,
    payerId: record.payerId,
    descriptionEn: edit.descriptionEn ?? record.descriptionEn,
    descriptionAr: edit.descriptionAr ?? record.descriptionAr,
    effectiveDate: record.effectiveDate,
    expiryDate: edit.expiryDate ?? record.expiryDate,
    id: record.id,
    concurrencyStamp: record.concurrencyStamp,
    confirmRevertToDraft: true,
  };
}

/** Saves an edit as a DRAFT (not submitted) and returns the server's answer. */
export async function stageNetworkEdit(page: Page, id: string, edit: NetworkEdit): Promise<Answer> {
  const record = await readNetwork(page, id);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.networkUpdate, updateBody(record, edit));
}

/** Edits, submits and approves - one more PUBLISHED version. */
export async function publishNetworkEdit(page: Page, id: string, edit: NetworkEdit = {}): Promise<void> {
  const record = await readNetwork(page, id);
  const change = { descriptionEn: `Edited by an automated case ${Date.now().toString(36)}`, ...edit };
  must('UpdateNetwork', await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.networkUpdate, updateBody(record, change)));
  await submitNetwork(page, id, record.networkNameEn);
  await approvePending(page, change.networkNameEn ?? record.networkNameEn);
  Logger.step(`[fixture] Published an edit of "${record.networkNameEn}"`);
}

/** Assigns and/or unassigns facilities, submits and approves. */
export async function publishFacilityChange(
  page: Page,
  id: string,
  change: { assign?: readonly string[]; unassign?: readonly string[] },
): Promise<void> {
  const record = await readNetwork(page, id);
  if (change.assign && change.assign.length > 0) {
    must('AssignFacilitiesToNetwork', await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.networkAssignFacilities, {
      networkId: id,
      facilityIds: change.assign,
      confirmRevertToDraft: true,
    }));
  }
  for (const facilityId of change.unassign ?? []) {
    must('UnassignFacilityFromNetwork', await NetworkUtils.requestAsSession(
      page,
      'DELETE',
      `${ApiEndpoints.networkUnassignFacility}/${id}/${facilityId}`,
    ));
  }
  await submitNetwork(page, id, record.networkNameEn);
  await approvePending(page, record.networkNameEn);
  Logger.step(`[fixture] Published a facility change on "${record.networkNameEn}"`);
}

/** Every version of a network, as GetNetworkVersions answers it. */
export async function readNetworkVersions(page: Page, networkId: string): Promise<NetworkVersionRecord[]> {
  const res = await NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.networkVersions, { networkId });
  if (res.status !== 200) throw new Error(`GetNetworkVersions answered ${res.status} ${res.text.slice(0, 200)}`);
  return (JSON.parse(res.text) as { payload: NetworkVersionRecord[] }).payload;
}

/**
 * Asks the server to revert a network to a version id. The request shape is
 * `{ networkId, versionId }` - the network counterpart of RevertPayer's; the
 * answer is returned whole so a case can assert on a refusal.
 */
export async function requestNetworkRevert(page: Page, networkId: string, versionId: string): Promise<Answer> {
  return NetworkUtils.requestAsSession(page, 'POST', ApiEndpoints.networkRevert, { networkId, versionId });
}
