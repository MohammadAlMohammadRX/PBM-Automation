import type { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import type { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import type { PayerDetailPage } from '../pages/payer/PayerDetailPage';
import { parseOptionLabel } from '../data/payers/manageLinkedNetworks.data';

/** A network as the Assign drawer offered it. */
export interface OfferedNetwork {
  code: string;
  name: string;
  label: string;
}

/**
 * The steps the network-assignment and reservation cases share (2026-10-13).
 *
 * Every case works on the SUITE'S OWN payers (publishedPayer and friends) and
 * picks networks from the live pool - never a real payer, never a network the
 * protected-data guard reserves for other stories. Networks are identified by
 * CODE: names are not unique in this register.
 */
export class NetworkAssignmentFlow {
  constructor(
    private readonly payers: PayerManagementPage,
    private readonly approvals: ApprovalManagementPage,
  ) {}

  /** Opens a payer's details fresh. */
  async detailOf(payer: string): Promise<PayerDetailPage> {
    await this.payers.open();
    await this.payers.search(payer);
    return this.payers.openDetails(payer);
  }

  /** The networks the payer's Assign drawer offers, by code; the drawer is closed again. */
  async offeredTo(payer: string): Promise<OfferedNetwork[]> {
    const drawer = await (await this.detailOf(payer)).openAssignNetwork();
    const labels = await drawer.listAvailableNetworks();
    await drawer.cancel();
    return labels.map((label) => ({ ...parseOptionLabel(label), label }));
  }

  /** Stages (Draft Assignment) one network on the payer - `code` if given, else the first offered. */
  async stage(payer: string, code?: string): Promise<OfferedNetwork> {
    const drawer = await (await this.detailOf(payer)).openAssignNetwork();
    const label = await drawer.selectNetwork(code);
    await drawer.assign();
    return { ...parseOptionLabel(label), label };
  }

  /** Sends the payer's staged change for approval. */
  async submit(payer: string): Promise<void> {
    await this.payers.open();
    await this.payers.submitStagedChange(payer);
  }

  /** Decides the payer's pending request. */
  async decide(payer: string, decision: 'Approve' | 'Reject'): Promise<void> {
    await this.approvals.open();
    await this.approvals.applyDecision(payer, decision);
  }

  /** The assignment state the payer's tab shows for a network ('' when it is not listed). */
  async stateOf(payer: string, code: string): Promise<string> {
    const detail = await this.detailOf(payer);
    const row = (await detail.getLinkedNetworkRows()).find((r) => r.code.trim() === code);
    return row ? row.assignmentState.trim() : '';
  }

  /** The codes the payer's tab lists. */
  async linkedCodes(payer: string): Promise<string[]> {
    const detail = await this.detailOf(payer);
    return (await detail.getLinkedNetworkRows()).map((r) => r.code.trim());
  }
}
