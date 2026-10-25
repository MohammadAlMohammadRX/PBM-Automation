/**
 * Test data for US 14321 "View network version history and revert to a
 * previous version".
 *
 * Verified on the live tab (2026-10-21): rows "v{n} · {Change} · {Status} ·
 * Requested By/On · Reviewed By/On · View"; the View drawer ("Version
 * Details") shows the version's name, Arabic name, type, dates, descriptions,
 * approval and business status, requester, reviewer and reason - NO facility
 * membership. No Revert action was seen on any network probed; the cases ask
 * for it per the sheet and fail when it is missing.
 *
 * Histories are built through the API by `networkWithVersions(n)`: v1 is the
 * create, each further version one published edit whose English description
 * reads `Version {n} of an automated network`.
 */

export const CASE = {
  listsPublished: '18276',
  revertEarlier: '18277',
  blockCurrent: '18278',
  blockUnpublished: '18279',
  decisionTable: '18280',
  facilitySnapshot: '18281',
  singleVersion: '18282',
  adminOnly: '18283',
  largeHistory: '18284',
  metadata: '18286',
  revertOldest: '18285',
} as const;

/** The label a version row carries. */
export const v = (n: number): string => `v${n}`;

/** The description `networkWithVersions` writes into version n (n >= 2). */
export const versionDescription = (n: number): string => `Version ${n} of an automated network`;

/** Statuses of versions that were published at some point. */
export const PUBLISHED_STATES = /^(Published|Superseded|Archived)$/;

/** A row's requested/reviewed timestamp. */
export const VERSION_TIME_PATTERN = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;

/** A row's version label. */
export const VERSION_LABEL_PATTERN = /^v\d+$/;

/** The change type a revert should add to the history. */
export const REVERT_CHANGE = /revert/i;

/** What a blocked revert should say. */
export const MESSAGE = {
  nothingToRevert: /nothing to revert|already (the )?(current|live)/i,
  onlyPublished: /publish/i,
  notFound: /not found/i,
} as const;

/** An id no version has. */
export const NONEXISTENT_VERSION_ID = '00000000-0000-4000-8000-000000000099';

/** History sizes per case. */
export const SIZE = { three: 3, five: 5, two: 2, large: 11 } as const;

/** Versions 18284 opens out of chronological order. */
export const OUT_OF_ORDER = [7, 2, 10, 4] as const;
