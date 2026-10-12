import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NetworkInactivateDialog } from './NetworkInactivateDialog';
import { PayerSelectionDropdown } from '../components/PayerSelectionDropdown';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { CONSUMING_SCREEN, NETWORK_COLUMN } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import { findPayers, isEffectiveNow, type PayerShape } from '../../utils/PayerFinder';
import { env } from '../../constants/EnvironmentConfig';
import { GET_NETWORKS_ENDPOINT } from '../../data/networks/seedNetworks.data';

/** A network the list shows as owned by a payer, with what else its row says. */
/** The fields of a GetNetworks row the owned-network lookup selects on. */
interface NetworkRegisterRow {
  networkNameEn: string;
  payerNameEn: string | null;
  isActive: boolean;
  versionStatusCode: string | null;
}

export interface OwnedNetwork {
  network: string;
  payer: string;
  /** The Facilities cell as rendered on the Network list. */
  facilities: string;
  status: string;
}

/**
 * The Networks module (`/network-management`).
 *
 * It arrived in this suite as the SECOND consumer of the shared payer selection
 * interface - proof that the Active-only rule lives in the interface rather
 * than being re-implemented per module - and was deliberately kept thin.
 *
 * The network-activation story needs more than that, because of where the
 * capability actually lives. The sheet describes activating and deactivating a
 * network from inside the payer's Networks tab; that tab offers a single
 * Unassign action and nothing else. A network's status is changed HERE, from
 * its own module, by row actions that mirror the payer list's exactly:
 *
 *   Inactive  activate   ENABLED   · inactivate ABSENT
 *   Active    inactivate ENABLED   · activate   ABSENT
 *   Expired   activate   DISABLED, titled "Cannot reactivate: the network has
 *                        expired. Update its expiry date to reactivate it."
 *   Not Live  neither - an unapproved draft has no status to change
 *
 * And like every other change in the application it is maker-checker: the
 * confirmation dialog says so ("The change is saved as a draft - send it for
 * approval when you are ready"), the row keeps its status, and its approval
 * cell moves to Draft until a checker approves.
 */
export class NetworkManagementPage extends ListPageBase {
  constructor(page: Page) {
    super(page, CONSUMING_SCREEN.networkList);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.networkManagement);
  }

  /** Opens the module and guarantees its table is on screen. */
  async openList(): Promise<void> {
    await this.open();
    await this.ensureTableView(this.screen);
    await expect(this.tableFor(this.screen)).toBeVisible({ timeout: Timeouts.default });
  }

  /** The Networks list's own "filter by payer" dropdown. */
  payerFilter(): PayerSelectionDropdown {
    return new PayerSelectionDropdown(this.page, 'networkListFilter');
  }

  // ---- Status lifecycle -----------------------------------------------------

  /**
   * The name of a network whose row DISPLAYS `status`, or null if none is on
   * any of the first `maxPages` pages.
   *
   * Read as (name, status) PAIRS in one pass - see ListPageBase.getRowPairs for
   * why reading the two columns separately pairs a name with another row's
   * status. Returns null rather than throwing: "the environment holds no
   * network in that state" is a missing precondition for the caller to report
   * as BLOCKED, not a failure of the list.
   */
  async findNetworkWithStatus(
    status: string,
    options: { settled?: boolean } = {},
    maxPages = 4,
  ): Promise<string | null> {
    await this.openList();
    for (let page = 1; page <= maxPages; page += 1) {
      await this.expectRowsRendered();
      const pairs = await this.getRowPairs(NETWORK_COLUMN.networkName, NETWORK_COLUMN.status);
      const approvals = await this.readColumn(NETWORK_COLUMN.approvalStatus);
      const match = pairs.find((pair, index) => {
        if (pair.status.trim() !== status) return false;
        if (pair.name.trim() === '') return false;
        // A network carrying a pending change is NOT usable as a flip
        // candidate. The Status column shows the PUBLISHED status while the
        // server validates against the staged one, so a network reading Active
        // with a deactivation already staged refuses a second deactivation with
        // "Only an active network can be inactivated." - a message that makes no
        // sense against what is on screen. Only settled rows are safe to flip.
        if (options.settled === true) return (approvals[index] ?? '').includes('Published');
        return true;
      });
      if (match) {
        Logger.step(`Found network "${match.name}" with status ${status}`);
        return match.name.trim();
      }
      // Walked with the pager's Next rather than by page number: the pager
      // collapses beyond seven pages, so a numbered button may not exist, and
      // "is there a next page" is exactly what its enabled state answers.
      const more = await this.hasNextPage();
      if (!more) break;
      await this.goToNextPage();
    }
    return null;
  }

  /**
   * Networks whose Payer column names an owner, with the facility count and
   * status the list shows for each, read off up to `maxPages` pages.
   *
   * DISCOVERY, not provisioning. The facility-count and network-removal stories
   * need "a payer with a linked network", and the list's Payer column is the
   * one place that relationship is visible from the network side. Read in one
   * pass per page - see ListPageBase.getRowPairs for why separate column reads
   * can pair a network with another row's payer. Stops at the first page that
   * brings the total to `minimum`, so a caller wanting one candidate does not
   * walk all thirteen pages.
   */
  async findOwnedNetworks(minimum = 1, maxPages = 13): Promise<OwnedNetwork[]> {
    const found = await this.scanOwnedNetworks(minimum, maxPages);
    if (found.length > 0) return found;

    // THE SCOPE DECIDES WHAT THIS LIST HOLDS (2026-10-11). The Network module
    // shows one payer at a time and its gate offers no "All Payers", so the
    // gate's first payer was taken - "AAA", which owns no network - and every
    // linked-network story blocked on "no owning payer on any row". Switch to
    // a payer that owns networks and look again.
    //
    // The SUITE'S OWN payers only: these stories stage and approve removals,
    // so they must never act on a real record or on the QA lead's reference
    // payers. Two or more networks preferred (QA-lead note N-046), one accepted.
    //
    // LIVE payers only, and TRY several (2026-10-11). The selector lists only
    // payers whose effective date has arrived; the first pick was effective
    // from 2027, the selector did not offer it, and the switch gave up after
    // that one attempt. Candidates are tried in turn, 2+ networks first.
    //
    // LOCATED BY THE API, CONFIRMED ON SCREEN (2026-10-11). Even in the right
    // scope the list opens on the newest networks - ~600 unowned seed networks
    // - and a payer's own network sits far past the pages a scan reads. So the
    // Networks API names which network each live suite payer owns, and the
    // list is SEARCHED for that network: only a row the screen itself shows
    // with that owner is returned.
    const ours = (p: PayerShape) => /^Automation Payer /.test(p.payerNameEn) && !p.versionStatusCode && isEffectiveNow(p);
    const live = new Map((await findPayers(this.page, ours, 'a live suite payer', [])).map((p) => [p.payerNameEn, p]));
    const owned = (await this.readNetworkRegister())
      .filter((n) => n.payerNameEn && live.has(n.payerNameEn) && n.isActive && !n.versionStatusCode);
    // 2+ networks first (QA-lead note N-046), one accepted.
    const perOwner = new Map<string, number>();
    for (const n of owned) perOwner.set(n.payerNameEn!, (perOwner.get(n.payerNameEn!) ?? 0) + 1);
    owned.sort((a, b) => (perOwner.get(b.payerNameEn!) ?? 0) - (perOwner.get(a.payerNameEn!) ?? 0));

    const confirmed: OwnedNetwork[] = [];
    let scope = '';
    for (const candidate of owned.slice(0, 8)) {
      if (candidate.payerNameEn !== scope) {
        if (!(await this.scopeTo(candidate.payerNameEn!))) continue;
        scope = candidate.payerNameEn!;
        await this.openList();
      }
      await this.search(candidate.networkNameEn);
      const rows = await this.readOwnershipOnPage().catch(() => [] as OwnedNetwork[]);
      confirmed.push(...rows.filter((row) => row.network === candidate.networkNameEn && row.payer === candidate.payerNameEn));
      if (confirmed.length >= minimum) break;
    }
    Logger.step(
      `Owned networks located by the API and confirmed on the list: ${confirmed.length}`
      + (confirmed.length > 0 ? ` (first: "${confirmed[0].network}" -> "${confirmed[0].payer}")` : ''),
    );
    return confirmed.length > 0 ? confirmed : found;
  }

  /**
   * One network's row as the Network list shows it, with `payerName` in scope -
   * found by SEARCHING the list, not by paging it (2026-10-11): the list opens
   * on ~600 newer seed networks, so a payer's network lies past any page scan.
   * Null when the list does not show it.
   */
  async findNetworkRow(networkName: string, payerName?: string): Promise<OwnedNetwork | null> {
    if (payerName !== undefined) await this.openListFor(payerName);
    else await this.openList();
    await this.searchUntilApplied(networkName);
    const rows = await this.readOwnershipOnPage().catch(() => [] as OwnedNetwork[]);
    return rows.find((row) => row.network.trim() === networkName.trim()) ?? null;
  }

  /**
   * Opens the list with `payerName` in the top-bar scope (2026-10-11). The
   * Network module shows one payer at a time, and the gate takes the first
   * payer offered ("23") - under which a network linked to another payer is
   * simply not listed: batch 5 searched for the case's own network and got
   * "No networks found." (15671, 15807).
   */
  async openListFor(payerName: string): Promise<void> {
    await this.openList();
    if (await this.scopeTo(payerName).catch(() => false)) await this.openList();
  }

  /**
   * Searches, and repeats the search until the list has actually applied it -
   * every row matches the term, or the list says nothing matched. VERIFIED in
   * batch 5 (14661): right after a scope switch the term sat in the box while
   * the unfiltered list stayed on screen, and the row was read from that.
   */
  async searchUntilApplied(term: string): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.search(term);
      const names = await this.rows()
        .evaluateAll((rows, key) => rows.map((row) =>
          ((row.querySelector(`[id$="-cell-${key}"]`) as HTMLElement | null)?.innerText ?? '').trim()), NETWORK_COLUMN.networkName)
        .catch(() => [] as string[]);
      if (names.every((name) => name.toLowerCase().includes(term.toLowerCase()))) return;
      await this.page.waitForTimeout(1_000);
    }
  }

  /** Every network in the register with its owner, from the Networks API (locating only). */
  private async readNetworkRegister(): Promise<NetworkRegisterRow[]> {
    if (!/^https?:/.test(this.page.url())) await this.page.goto(env.baseUrl);
    const response = await NetworkUtils.postAsSession(this.page, GET_NETWORKS_ENDPOINT, { pageNumber: 1, rowsPerPage: 1000 });
    try {
      const body = JSON.parse(response.text) as { payload?: { networks?: { items?: NetworkRegisterRow[] } } };
      return body.payload?.networks?.items ?? [];
    } catch {
      return [];
    }
  }

  private async scanOwnedNetworks(minimum: number, maxPages: number): Promise<OwnedNetwork[]> {
    await this.openList();
    const found: OwnedNetwork[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const rows = await this.readOwnershipOnPage();
      // The list renders "no payer" as a dash; anything else is an owner.
      found.push(...rows.filter((row) => row.payer !== '' && !/^[-—–]$/.test(row.payer)));
      if (found.length >= minimum) break;
      if (!(await this.hasNextPage())) break;
      await this.goToNextPage();
    }
    Logger.step(
      `Owned networks found: ${found.length}`
      + (found.length > 0 ? ` (first: "${found[0].network}" -> "${found[0].payer}")` : ''),
    );
    return found;
  }

  /**
   * Every network the list shows this session, owned or not, read off up to
   * `maxPages` pages - the scope story's view of the network side.
   *
   * Unlike `findOwnedNetworks` this keeps the unowned rows (Payer "—"): a scoped
   * user is meant to see unassigned networks alongside their own payers', and
   * NOT the networks of payers outside their scope, so the caller needs both
   * halves of the column.
   */
  async listNetworkOwnership(maxPages = 13): Promise<OwnedNetwork[]> {
    await this.openList();
    const seen: OwnedNetwork[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      seen.push(...(await this.readOwnershipOnPage()));
      if (!(await this.hasNextPage())) break;
      // The pager re-renders as a page finishes loading, and VERIFIED its Next
      // control can read enabled a moment before it is replaced by a disabled
      // one - so a click that finds it disabled ends the walk rather than
      // waiting out its budget and failing the read.
      const moved = await this.nextPageButton()
        .click({ timeout: Timeouts.short })
        .then(() => true)
        .catch(() => false);
      if (!moved) break;
      await this.waitForPageReady();
    }
    Logger.step(`Networks listed for this session: ${seen.length}`);
    return seen;
  }

  /** One page of the list as network/payer/facilities/status, read in a single pass. */
  private async readOwnershipOnPage(): Promise<OwnedNetwork[]> {
    await this.expectRowsRendered();
    return this.rows().evaluateAll(
      (elements, keys) =>
        elements.map((row) => {
          const read = (key: string): string => {
            const cell = row.querySelector(`[id$="-cell-${key}"]`);
            return cell ? (cell as HTMLElement).innerText.trim() : '';
          };
          return {
            network: read(keys.name),
            payer: read(keys.payer),
            facilities: read(keys.facilities),
            status: read(keys.status),
          };
        }),
      {
        name: NETWORK_COLUMN.networkName,
        payer: NETWORK_COLUMN.payer,
        facilities: NETWORK_COLUMN.facilities,
        status: NETWORK_COLUMN.status,
      },
    );
  }

  /** The network id behind a row, read from the row's own element id. */
  async getNetworkId(networkName: string): Promise<string> {
    const rowId = await this.rowId(networkName);
    const id = rowId.replace(`${this.screen}-table-row-`, '');
    expect(id, `could not read a network id out of the row id "${rowId}"`).not.toBe(rowId);
    return id;
  }

  /** The shared confirmation dialog, for the flows that need to read it. */
  dialog(): ConfirmDialog {
    return new ConfirmDialog(this.page);
  }

  /**
   * Starts an activation and returns the prompt.
   *
   * Returns the dialog rather than confirming it: the story asks what the
   * prompt SAYS - it names the network and states the approval caveat - and
   * several cases must read it and then cancel without staging anything.
   */
  async openActivationPrompt(networkName: string): Promise<ConfirmDialog> {
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    await this.activateRow(networkName);
    const dialog = this.dialog();
    await dialog.waitForVisible();
    return dialog;
  }

  /**
   * The deactivation counterpart of `openActivationPrompt` - which opens a
   * DRAWER, not the shared dialog.
   *
   * The asymmetry is the application's, not this class's: activating raises
   * `#pbm-dialog`, while inactivating opens `network-inactivate-dialog` and
   * asks for a reason for the audit history. Driving deactivation through the
   * shared dialog waits out a full timeout on a dialog that is never coming.
   */
  async openDeactivationDrawer(networkName: string): Promise<NetworkInactivateDialog> {
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    await this.inactivateRow(networkName);
    const drawer = new NetworkInactivateDialog(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /**
   * Opens whichever confirmation a direction uses, reads its wording, and
   * confirms it.
   *
   * One method for both directions because the two surfaces have nothing in
   * common - a dialog with a message, and a drawer with a required reason - and
   * a spec that had to branch on which is which would be describing the
   * application's internals rather than the behaviour under test. The wording
   * is RETURNED so the case can still assert what the user was told.
   */
  async stageStatusChange(
    networkName: string,
    direction: 'activate' | 'inactivate',
  ): Promise<{ title: string; explanation: string }> {
    if (direction === 'activate') {
      const prompt = await this.openActivationPrompt(networkName);
      const wording = { title: await prompt.getTitle(), explanation: await prompt.getMessage() };
      await prompt.confirm(direction);
      return wording;
    }
    const drawer = await this.openDeactivationDrawer(networkName);
    const wording = {
      title: await drawer.getTitleText(),
      explanation: await drawer.getExplanation(),
    };
    await drawer.inactivateWithFirstReason('Deactivated by an automated regression test.');
    return wording;
  }

  /**
   * Opens a direction's confirmation and DISMISSES it, reporting its wording.
   *
   * The read-only counterpart, for the cases that must prove the control was
   * available without consuming the network's state.
   */
  async cancelStatusChange(
    networkName: string,
    direction: 'activate' | 'inactivate',
  ): Promise<{ title: string; explanation: string }> {
    if (direction === 'activate') {
      const prompt = await this.openActivationPrompt(networkName);
      const wording = { title: await prompt.getTitle(), explanation: await prompt.getMessage() };
      await prompt.cancel();
      return wording;
    }
    const drawer = await this.openDeactivationDrawer(networkName);
    const wording = {
      title: await drawer.getTitleText(),
      explanation: await drawer.getExplanation(),
    };
    await drawer.cancel();
    return wording;
  }

  /**
   * Sends a staged change for approval and confirms the modal.
   *
   * The row action alone is not enough: it raises the shared confirmation
   * dialog, and leaving that dialog unanswered submits nothing. Verified the
   * hard way - a status change staged and "submitted" without confirming never
   * reached the approvals queue, and the failure surfaced two steps later as
   * "the queue never returned it", which points at the queue rather than at the
   * missing click. The payer list's own `sendForApproval` carries the same note
   * for the same reason.
   */
  async submitForApproval(networkName: string): Promise<void> {
    Logger.step(`Sending "${networkName}" for approval`);
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    await this.sendRowForApproval(networkName);
    await this.dialog().confirm('Send for Approval');
    await this.waitForPageReady();
  }

  /**
   * Stages a status change and sends it for approval in one go.
   *
   * Kept here rather than in each spec because every status case needs it and
   * the sequence is easy to get subtly wrong: the row's Send for Approval
   * action only appears once the draft exists, so the list has to be re-read
   * between the two steps.
   */
  async stageAndSubmit(networkName: string, direction: 'activate' | 'inactivate'): Promise<void> {
    await this.stageStatusChange(networkName, direction);
    await this.openList();
    await this.submitForApproval(networkName);
  }

  /**
   * Sends a status change DIRECTLY, bypassing the row action.
   *
   * Two cases need it, and the sheet names a direct request as the way to reach
   * both: repeating an activation the UI no longer offers, and sending the
   * request with its id left out. Note the payload is `{ id }` alone - there is
   * no status FIELD, because activation and deactivation are separate
   * endpoints, which is why "submit an invalid status value" cannot be
   * expressed against this interface at all.
   */
  async submitStatusRequest(
    direction: 'activate' | 'inactivate',
    id: string | null,
  ): Promise<{ status: number; text: string; validationErrors: string[] }> {
    const path = direction === 'activate'
      ? ApiEndpoints.networkSetActive
      : ApiEndpoints.networkSetInactive;
    return NetworkUtils.postAsSession(this.page, path, id === null ? {} : { id });
  }
}
