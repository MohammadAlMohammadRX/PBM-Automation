import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { stamped } from './defineTerminology.data';
import type { TerminologyBlockedCase } from './terminology.data';

/**
 * US 15160 "Enforce Deletion Blockers for Terminologies and Records (Items)"
 * (terminology folder 14).
 *
 * A terminology "holding data" / "with transactions" is one holding records; one
 * "referenced by a mapping field in another module" is the target of another
 * terminology's mapping field - the dependencies this environment can create.
 * The list renders Delete DISABLED (with a tooltip) for a terminology holding
 * records (verified 2026-10-29), so the cases accept either refusal on screen
 * and always check the server's own answer to a direct request as well.
 */

export const CONFIRM_TEXT = /delete|are you sure/i;

export const CASES = {
  unused: { azureId: '20208', name: () => stamped('Unused Test Category') },
  holdsData: { azureId: '20209', name: () => stamped('Diagnosis Codes'), records: [{ Code: 'D1' }, { Code: 'D2' }, { Code: 'D3' }] },
  mapped: { azureId: '20210', name: () => stamped('Unit of Measure'), referrer: () => stamped('Product Mapping') },
  decisionTable: { azureId: '20211' },
  zeroVersusOne: { azureId: '20212', record: { Code: 'ONE-TRANSACTION' } },
  confirmInUse: { azureId: '20213', record: { Code: 'USED-1' }, question: /are you sure|do you want to delete/i },
  becomesUsed: { azureId: '20214', record: { Code: 'NEW-TRANSACTION' } },
  endToEnd: { azureId: '20215', records: [{ Code: 'E2E-1' }] },
  noPermission: { azureId: '20216', granted: TERMINOLOGY_VIEW_ONLY },
  otherPath: { azureId: '20217' },
  noSideEffects: { azureId: '20219', record: { Code: 'KEEP-1' }, blockedEntry: /delete|blocked|failed|rejected/i },
  friendlyMessage: { azureId: '20220', record: { Code: 'FRIENDLY-1' } },
  equivalence: { azureId: '20221', count: 3 },
} as const;

export const BLOCKED_CASES: TerminologyBlockedCase[] = [
  {
    azureId: '20218',
    title: 'should end in a consistent state with no orphaned data when a record is deleted while another user creates a transaction against it',
    reason:
      'Needs a SECOND user creating a transaction that references the record in a dependent module, timed to land '
      + 'inside the deletion request. Terminology records are not referenced by any transactional module this '
      + 'environment exposes (only by other terminologies\' mapping fields), and the suite cannot hold the delete '
      + 'request open while another session commits. Runnable with a dependent module that consumes terminology '
      + 'values and a hook that pauses DeleteTerminology server-side.',
  },
];
