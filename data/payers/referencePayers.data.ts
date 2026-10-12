/**
 * Payers the QA lead named as reference data (2026-10-11), and what each holds.
 *
 * WHY THEY EXIST. Several stories need a payer with a particular shape - one
 * that owns policies, has exactly one member, holds no network, or has several
 * versions - and the suite's own payers cannot supply it: every payer the suite
 * publishes gets a network (approval requires one since 2026-09-27), none owns
 * a policy (the Policies module is outside this framework), and none has
 * members. Cases that sampled the first page of the list therefore reported
 * "no payer has a member" while these payers existed further down.
 *
 * VERIFIED against GetPayers on 2026-10-11. The QA lead warned they may be
 * deleted or changed, so a case PREFERS the named payer and falls back to any
 * payer with the same shape (utils/PayerFinder.ts) rather than failing on a
 * missing name.
 *
 * READ-ONLY by intent: cases read these payers, they do not edit, inactivate or
 * delete them.
 */
export interface ReferencePayer {
  name: string;
  code: string;
  networks: number;
  policies: number;
  members: number;
  version: number;
  state: string;
}

export const REFERENCE_PAYERS = {
  /** Two networks, two policies, two members, four versions (v0-v3), published. */
  payerNumber2: { name: 'payer number 2', code: 'PAY-002999', networks: 2, policies: 2, members: 2, version: 3, state: 'published' },
  /** One network, two policies, two members, v2 pending approval. */
  payerNumber1: { name: 'payer number 1', code: 'PAY-002997', networks: 1, policies: 2, members: 2, version: 2, state: 'pendingApproval' },
  /** Exactly one network, one policy, one member, v1 published. */
  care: { name: 'Care', code: 'PAY-002998', networks: 1, policies: 1, members: 1, version: 1, state: 'published' },
  /** No network, no policy, no member - a never-approved v0 draft. */
  noNetwork: { name: 'National Health Fund 1791110252437', code: 'PAY-D-0155', networks: 0, policies: 0, members: 0, version: 0, state: 'draft' },
} as const satisfies Record<string, ReferencePayer>;

/** Reference payers in preference order, for a finder that wants "any of them first". */
export const REFERENCE_PAYER_NAMES: readonly string[] = Object.values(REFERENCE_PAYERS).map((p) => p.name);
