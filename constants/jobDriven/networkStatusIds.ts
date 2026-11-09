/**
 * The predefined network status lookup items (GET /api/Lookups/Items/networkStatus,
 * read 2026-11-08). An audit entry's before / after JSON carries only these ids,
 * never the names, so the job-driven cases map them back to the shown labels.
 */
export const NETWORK_STATUS_BY_ID: Readonly<Record<string, string>> = {
  '9a2b7c30-4e6f-4c1d-be3a-1a2b3c4d7002': 'Future',
  '9a2b7c30-4e6f-4c1d-be3a-1a2b3c4d7003': 'Active',
  '9a2b7c30-4e6f-4c1d-be3a-1a2b3c4d7004': 'Inactive',
  '9a2b7c30-4e6f-4c1d-be3a-1a2b3c4d7005': 'Expired',
};
