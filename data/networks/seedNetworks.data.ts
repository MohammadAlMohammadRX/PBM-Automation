/**
 * Data for the network pool the payer fixtures draw on.
 *
 * WHY THIS EXISTS. Since 2026-09-27 the application refuses to approve a payer
 * that has no assigned network - the server says so outright:
 *
 *   "A payer must have at least one assigned network before this change can
 *    be approved."
 *
 * Every provisioning fixture ends in an approval, so without a network to
 * assign, `publishedPayer` / `inactivePayer` / `secondPublishedPayer` /
 * `publishPayer` all fail and roughly 260 provisionings across the suite fail
 * with them. A network cannot be shared: one payer, one network.
 *
 * SEEDED THROUGH THE API, not the interface. The wizard costs about 40 seconds
 * per network plus a facility assignment; the two endpoints below do the same
 * work in about 0.4 seconds, which is the difference between two minutes and
 * nine hours for a pool of 300. Both were observed in the application's own
 * traffic (2026-09-28) rather than guessed.
 */

/** Creating a network. Observed payload, field for field. */
export const CREATE_NETWORK_ENDPOINT = '/api/Networks/CreateNetwork';

/** Attaching facilities. `confirmRevertToDraft` is sent false by the drawer. */
export const ASSIGN_FACILITIES_ENDPOINT = '/api/Networks/AssignFacilitiesToNetwork';

/**
 * Sending a finished draft for approval, payload { networkId }.
 *
 * A CREATED NETWORK IS NOT AN ASSIGNABLE ONE. CreateNetwork answers "saved as
 * a draft - send it for approval when you are ready", and a draft never reaches
 * the payer's Assign Network drawer. The first pool of 307 was built without
 * these last two steps, so every one of them was invisible to the fixtures -
 * which is why the 2026-09-30 run still failed with "holds no network" on 14
 * of 26 create-payer cases.
 */
export const SUBMIT_NETWORK_ENDPOINT = '/api/Networks/SubmitNetworkForApproval';

/**
 * Approving the submitted request, payload { id } - the APPROVAL REQUEST's id,
 * not the network's.
 *
 * Two traps, both paid for. The parameter is `id`: sending `requestId` is
 * rejected 400 "Invalid Input". And the queue row's `entityId` is the
 * network's VERSION id, which never equals the network id - so a request is
 * matched to its network by `entityNameEn`, not by entityId.
 */
export const APPROVE_REQUEST_ENDPOINT = '/api/Approvals/ApproveRequest';

/** The approvals queue, used to turn a submitted network into a request id. */
export const GET_APPROVALS_ENDPOINT = '/api/Approvals/GetApprovals';

/** The network register, used to read the pool back and bucket it by state. */
export const GET_NETWORKS_ENDPOINT = '/api/Networks/GetNetworks';

/**
 * The network type the seeded pool uses.
 *
 * The lookup offers HMO / PPO / EPO / POS; the pool pins HMO because the type
 * is irrelevant to what the payer fixtures need and a fixed value keeps the
 * seeded records uniform.
 */
export const HMO_NETWORK_TYPE_ID = '9a2b7c30-4e6f-4c1d-be3a-1a2b3c4d7102';

/**
 * The facility every seeded network shares (see the note on the id below).
 *
 * One facility may serve many networks, confirmed with the QA lead, so the
 * whole pool shares it. If the environment ever gains more, nothing here has
 * to change: the seeder only needs one.
 */
// FCL-000025 "QA Automation Pharmacy A" since 2026-10-24: FCL-000007's licence
// lapsed on 2026-10-22, and a network holding an expired pharmacy can be neither
// approved (409) nor made Active.
export const SHARED_FACILITY_ID = '1ccb483e-f36b-1410-8e0a-00abe6b0babb';

/**
 * How many networks to seed by default.
 *
 * A full run provisions a payer about 260 times and a network cannot be
 * reused, so the pool needs to cover that with headroom. Override with
 * SEED_NETWORK_COUNT when seeding for a subset.
 */
export const DEFAULT_POOL_SIZE = 300;

/**
 * The prefix every seeded network carries.
 *
 * Also listed in PROTECTED_NAME_PREFIXES so no case deletes or inactivates one
 * while another test is depending on the pool.
 */
export const SEED_PREFIX = 'NETWORK-SEED';

/**
 * Where a network sits in the create cycle, as its row reports it.
 *
 * `linkedFacilitiesCount` IS NOT A FACILITY CHECK ON A DRAFT. The column
 * reports the PUBLISHED version, so a draft with its facility properly
 * attached still reads 0 - which is what sent the first investigation hunting
 * a broken AssignFacilitiesToNetwork that was in fact answering
 * `assignedCount: 1` and doing its job. The count only becomes readable after
 * approval. Bucket on `isPendingCreate` and `versionStatusCode` instead.
 */
export const NETWORK_VERSION_DRAFT = 'draft';
export const NETWORK_VERSION_PENDING = 'pendingApproval';

/** The fields of a network row this seeder reads. */
export interface NetworkRow {
  id: string;
  networkNameEn: string;
  linkedFacilitiesCount: number;
  isPendingCreate: boolean;
  versionStatusCode: string | null;
  payerId: string | null;
}

/** A network a payer can actually be given: approved, facilitied, unclaimed. */
export const isUsableNetwork = (row: NetworkRow): boolean =>
  !row.isPendingCreate
  && row.versionStatusCode === null
  && !row.payerId
  && Number(row.linkedFacilitiesCount) > 0;
