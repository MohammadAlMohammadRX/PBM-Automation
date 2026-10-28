import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { AdvancedSearchDrawer } from '../payer/AdvancedSearchDrawer';
import { NetworkInactivateDialog } from './NetworkInactivateDialog';
import { NetworkFormDialog, type NetworkFieldKey, type SaveOutcome } from './NetworkFormDialog';
import { NetworkDetailPage } from './NetworkDetailPage';
import { ApprovalManagementPage } from '../approval/ApprovalManagementPage';
import { networkTypeId, readNetwork, type NetworkRecord } from '../../utils/NetworkProvisioning';
import { deleteNetworkById, networkIdByName } from '../../utils/NetworkProvisioning';
import { PayerSelectionDropdown } from '../components/PayerSelectionDropdown';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  CONSUMING_SCREEN,
  NETWORK_ADVANCED_SEARCH_FIELD,
  NETWORK_COLUMN,
  NETWORK_EXPORT,
  NETWORK_LIST,
  NETWORK_SORT_FIELD,
  buttonSelector,
  type NetworkKpiKey,
  type NetworkSearchField,
  type NetworkSortColumn,
  type RowAction,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import { findPayers, isEffectiveNow, type PayerShape } from '../../utils/PayerFinder';
import { env } from '../../constants/EnvironmentConfig';
import { GET_NETWORKS_ENDPOINT } from '../../data/networks/seedNetworks.data';
import { GLOBAL, NETWORK_CARDS } from '../../constants/ElementIds';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import type { ParsedXlsx } from '../../utils/XlsxUtils';
import { NETWORK_STATUS_LABEL_AR, NETWORK_TYPE_LABEL_AR } from '../../data/networks/network.data';

/**
 * The list's own request. A RegExp because `GetNetworks` is a prefix of
 * `GetNetworksDashboard`, which the list fires alongside it.
 */
const LIST_URL = /\/api\/Networks\/GetNetworks(\?|$)/;
const DASHBOARD_URL = /\/api\/Networks\/GetNetworksDashboard/;

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
  /** The Network Code cell (NET-...) - unique, unlike the name. */
  code?: string;
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

  /**
   * Searches the list - opening it first when the browser is elsewhere.
   *
   * Every row-level helper (readRow, readCode, delete, row actions) searches
   * before touching a row and assumed the list was already on screen. After a
   * fixture's API provisioning the page sits on the Dashboard, so 18029 and
   * its kind searched a page with no list and failed on "the network list
   * table never appeared" (2026-10-24).
   */
  async search(term: string): Promise<void> {
    const onList = /\/network-management\/?$/.test(new URL(this.page.url(), env.baseUrl).pathname);
    // A search that matched nothing replaces the TABLE with an empty state, so
    // the next search on the same page found no table to type into - 18032's
    // create/delete cycles failed on cycle 2 that way (2026-10-25).
    const tableShown = onList && (await this.tableFor(this.screen).isVisible().catch(() => false));
    if (!tableShown) await this.openList();
    await super.search(term);
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
  async findNetworkRow(networkName: string, payerName?: string, networkCode?: string): Promise<OwnedNetwork | null> {
    if (payerName !== undefined) await this.openListFor(payerName);
    else await this.openList();
    await this.searchUntilApplied(networkName);
    const rows = await this.readOwnershipOnPage().catch(() => [] as OwnedNetwork[]);
    // By CODE when known: two networks can share a name (2026-10-12).
    return rows.find((row) => (networkCode ? row.code?.trim() === networkCode : row.network.trim() === networkName.trim())) ?? null;
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
            code: read(keys.code),
          };
        }),
      {
        name: NETWORK_COLUMN.networkName,
        payer: NETWORK_COLUMN.payer,
        facilities: NETWORK_COLUMN.facilities,
        status: NETWORK_COLUMN.status,
        code: NETWORK_COLUMN.code,
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
    const before = await this.getApprovalCell(networkName);
    await this.sendRowForApproval(networkName);
    await this.dialog().confirm('Send for Approval');
    await this.waitForPageReady();
    // The row refreshes a moment after the confirm. Read at once it still said
    // "v0 · Draft" although the network was already pending (17778, 2026-10-25),
    // so wait for the cell to move on. Not fatal: a refused submission leaves it
    // unchanged, and the case asserts the outcome itself.
    await expect
      .poll(async () => {
        await this.search(networkName);
        return this.getApprovalCell(networkName).catch(() => before);
      }, { timeout: Timeouts.default })
      .not.toBe(before)
      .catch(() => Logger.warn(`The approval cell of "${networkName}" still reads "${before}" after sending`));
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

  // ===========================================================================
  // Added 2026-10-21 for the Network Management module (Feature 14116).
  // Every id is from NETWORK_LIST / NETWORK_EXPORT, read off the live screen.
  // ===========================================================================

  // ---- KPI band ---------------------------------------------------------------

  /** One KPI tile's number. */
  async getKpiValue(kpi: NetworkKpiKey): Promise<number> {
    const value = this.page.locator(`#${NETWORK_LIST.kpi[kpi]}-value`);
    await expect(value, `the ${kpi} KPI tile should render`).toBeVisible({ timeout: Timeouts.default });
    return Number((await value.innerText()).replace(/[^\d]/g, ''));
  }

  /** Every KPI tile, keyed. */
  async readKpis(): Promise<Record<NetworkKpiKey, number>> {
    const out = {} as Record<NetworkKpiKey, number>;
    for (const kpi of Object.keys(NETWORK_LIST.kpi) as NetworkKpiKey[]) out[kpi] = await this.getKpiValue(kpi);
    return out;
  }

  /** The KPI tiles' labels, in band order. */
  async getKpiLabels(): Promise<string[]> {
    const labels: string[] = [];
    for (const kpi of Object.keys(NETWORK_LIST.kpi) as NetworkKpiKey[]) {
      labels.push((await this.page.locator(`#${NETWORK_LIST.kpi[kpi]}-label`).innerText()).trim());
    }
    return labels;
  }

  /** Whether the KPI band is shown to this session. */
  async isKpiBandVisible(): Promise<boolean> {
    return this.page
      .locator(`#${NETWORK_LIST.kpiBand}`)
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * What GetNetworksDashboard answered the LIST'S OWN request, captured while
   * the list reloads. Not a direct call: the direct call is not payer-scoped
   * (verified 2026-10-21 - it answered 786 while the scoped band read 603),
   * so only the application's own request is comparable with the tiles.
   */
  async captureDashboardTotals(): Promise<Record<NetworkKpiKey, number>> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload: Record<NetworkKpiKey, number> }>(
      this.page,
      DASHBOARD_URL,
      () => this.openList(),
    );
    expect(body, 'the list should have fetched GetNetworksDashboard').not.toBeNull();
    return body!.payload;
  }

  // ---- Paging totals ----------------------------------------------------------

  /**
   * The total the list's own request reports (`payload.networks.totalRows`)
   * for the current search/filter/sort, captured by reloading the list.
   */
  async captureListTotal(action: () => Promise<void>): Promise<number> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload?: { networks?: { totalRows?: number } } }>(
      this.page,
      LIST_URL,
      action,
    );
    expect(body, 'the list should have fetched GetNetworks').not.toBeNull();
    return Number(body?.payload?.networks?.totalRows ?? -1);
  }

  /** The request body the list sends while `action` runs (sort, search, filters). */
  async captureListRequest(action: () => Promise<void>): Promise<Record<string, unknown>> {
    const body = await NetworkUtils.captureRequestBody(this.page, LIST_URL, action);
    try {
      return body ? (JSON.parse(body) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /** Number of GetNetworks requests fired while `action` runs (debounce cases). */
  async countListRequests(action: () => Promise<void>, settleMs = 1_500): Promise<number> {
    return NetworkUtils.countRequestsDuring(this.page, LIST_URL, action, settleMs);
  }

  /** Types into the search box key by key WITHOUT waiting for the list - debounce cases. */
  async typeSearchRaw(term: string): Promise<void> {
    const input = this.searchInput();
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    await input.pressSequentially(term, { delay: 50 });
  }

  /** Walks the pager forward until page `pageNumber` is current. */
  async goToPage(pageNumber: number): Promise<void> {
    Logger.step(`Paging the network list to page ${pageNumber}`);
    for (let current = await this.getCurrentPageNumber(); current < pageNumber; current += 1) {
      await this.goToNextPage();
    }
    await this.expectCurrentPage(pageNumber);
  }

  /** The text the table body shows - the empty-state message when there are no rows. */
  async getTableBodyText(): Promise<string> {
    // When nothing matches, the table is REPLACED by an empty-state element
    // with no id of its own ("No networks found.", 2026-10-21), so the read is
    // the list section, which holds either.
    return (await this.page.locator(`#${this.screen}`).innerText()).trim();
  }

  /** The column headers, in order. */
  async getHeaderTexts(): Promise<string[]> {
    return (await this.page.locator(`[id^="${this.screen}-table-th-"]`).allInnerTexts()).map((t) => t.trim());
  }

  // ---- Quick filters ----------------------------------------------------------

  private filterSelect(which: 'type' | 'status'): Locator {
    return this.page.locator(`#${which === 'type' ? NETWORK_LIST.typeFilter : NETWORK_LIST.statusFilter}`);
  }

  /**
   * Opens a quick filter and returns ITS overlay's options. Scoped through the
   * combobox's aria-controls: an overlay closed with Escape can linger, and
   * reading "any visible option" returned the TYPE options for the status
   * filter (found 2026-10-21).
   */
  private async openFilterOverlay(which: 'type' | 'status'): Promise<Locator> {
    const select = this.filterSelect(which);
    await select.click();
    const controls = await select.getAttribute('aria-controls');
    const scoped = controls ? this.page.locator(`[id="${controls}"] [role="option"]`) : null;
    // aria-controls can name an overlay that is no longer the one on screen
    // (pn_id_23_list in 18058/18060/18069, 2026-10-25), so when its options do
    // not show, the visible overlay's are used - only one is open at a time.
    const scopedShown = scoped
      ? await scoped.first().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false)
      : false;
    const options = scopedShown ? scoped! : this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    return options;
  }

  private async closeFilterOverlay(which: 'type' | 'status'): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.filterSelect(which))
      .toHaveAttribute('aria-expanded', 'false', { timeout: Timeouts.short })
      .catch(() => undefined);
  }

  /** The options a quick filter offers, without choosing one. */
  async getFilterOptions(which: 'type' | 'status'): Promise<string[]> {
    const options = await this.openFilterOverlay(which);
    const texts = (await options.allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
    await this.closeFilterOverlay(which);
    return texts;
  }

  /** Chooses a quick-filter option and waits for the list to settle. */
  async applyQuickFilter(which: 'type' | 'status', englishOption: string): Promise<void> {
    // In the interface's language (2026-10-25): the Arabic export story filters
    // an Arabic list, whose options read "نشطة", not "Active" (18058/18060/18069).
    const rtl = await this.page.evaluate(() => document.documentElement.dir === 'rtl');
    const labels = which === 'status' ? NETWORK_STATUS_LABEL_AR : NETWORK_TYPE_LABEL_AR;
    const option = rtl ? (labels[englishOption] ?? englishOption) : englishOption;
    Logger.step(`Filtering networks by ${which} = "${option}"`);
    const options = await this.openFilterOverlay(which);
    const target = options.filter({ hasText: new RegExp(`^\\s*${option}\\s*$`) }).first();
    await expect(target, `the ${which} filter should offer "${option}"`).toBeVisible({ timeout: Timeouts.default });
    // Waits for the list's re-fetch: reading rows straight after the click
    // read the page being replaced (2026-10-21). The option resolved but never
    // read as stable in 18058 / 18060 / 18069 (2026-10-24) - the overlay
    // re-renders while it settles - so a click that cannot land falls back to
    // the option's own click handler.
    await NetworkUtils.captureJsonResponseMatching(this.page, LIST_URL, () =>
      target.click({ timeout: Timeouts.short }).catch(() => target.dispatchEvent('click')),
    );
    await expect(this.filterSelect(which)).toContainText(option, { timeout: Timeouts.short });
    await this.waitForPageReady();
  }

  /** The label a quick filter currently shows ("All Types" by default). */
  async getQuickFilterValue(which: 'type' | 'status'): Promise<string> {
    return (await this.filterSelect(which).innerText()).trim();
  }

  // ---- Advanced search and chips ---------------------------------------------

  /** Opens the list's advanced search drawer. */
  async openAdvancedSearch(): Promise<AdvancedSearchDrawer> {
    await this.page.locator(buttonSelector(NETWORK_LIST.advancedSearchButton)).first().click();
    const drawer = this.advancedSearch();
    await drawer.waitForOpen();
    return drawer;
  }

  /** The list's advanced search drawer, without opening it. */
  advancedSearch(): AdvancedSearchDrawer {
    return new AdvancedSearchDrawer(this.page, this.screen);
  }

  /**
   * Fills and submits the advanced search with the given criteria (by
   * NETWORK_ADVANCED_SEARCH_FIELD key), waiting for the list to settle.
   */
  async advancedSearchFor(criteria: Partial<Record<NetworkSearchField, string>>): Promise<void> {
    const drawer = await this.openAdvancedSearch();
    for (const [key, value] of Object.entries(criteria) as [NetworkSearchField, string][]) {
      const fieldKey = NETWORK_ADVANCED_SEARCH_FIELD[key];
      if (key === 'nameOrCode') await drawer.typeText(fieldKey, value);
      else await drawer.choose(fieldKey, value);
    }
    await drawer.submit();
    await this.waitForPageReady();
  }

  /**
   * The filter chips on screen.
   *
   * locator-exception: the chip component's prefix is not confirmed for this
   * list, so chips are read from any `*-chip*` element inside the list section.
   */
  async getChips(): Promise<string[]> {
    // LEAF chips only (fixed 2026-10-21): the chip container's own id also
    // contains "chip", and reading every match returned the container's text
    // as one more chip ("Automation Network\nActive" beside the two chips).
    return this.leafChips().evaluateAll((nodes) =>
      nodes
        .map((node) => (node as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
        .filter((text) => text !== '' && text.length < 80))
      .catch(() => [] as string[]);
  }

  /** Chip elements whose id names a chip and that hold no other chip. */
  private leafChips(): Locator {
    return this.page
      .locator(`#${this.screen} [id*="chip"]:not([id$="remove"]):not([id*="clear"])`)
      .filter({ hasNot: this.page.locator('[id*="chip"]:not([id$="remove"]):not([id*="clear"])') });
  }

  /** Removes the chip whose text contains `label`. */
  async removeChip(label: string): Promise<void> {
    Logger.step(`Removing the "${label}" filter chip`);
    const chip = this.leafChips().filter({ hasText: label }).first();
    await expect(chip, `a "${label}" chip should be on screen to remove`).toBeVisible({ timeout: Timeouts.default });
    await NetworkUtils.captureJsonResponseMatching(this.page, LIST_URL, () =>
      chip.locator('button, [id$="remove"], .p-chip-remove-icon').first().click(),
    );
    await this.waitForPageReady();
  }

  /**
   * Clears every chip with the chips' "clear all" control.
   *
   * locator-exception: the control's id is not confirmed; it is found inside
   * the list section as an element whose id names "clear", or a button reading
   * "Clear" - scoped to the list's own id.
   */
  async clearAllChips(): Promise<void> {
    const control = this.page
      .locator(`#${this.screen} [id*="chip"][id*="clear"], #${this.screen} [id$="clear-all"]`)
      .or(this.page.locator(`#${this.screen}`).getByRole('button', { name: /clear/i })) // locator-exception: the chips clear-all control has no id (not seen in the 2026-10-21 probes)
      .first();
    await expect(control, 'the chips should offer a Clear All control').toBeVisible({ timeout: Timeouts.default });
    await NetworkUtils.captureJsonResponseMatching(this.page, LIST_URL, () => control.click());
    await this.waitForPageReady();
  }

  // ---- Sort By ---------------------------------------------------------------

  /** Opens the Sort By menu and returns its option labels in order. */
  async getSortOptions(): Promise<string[]> {
    await this.page.locator(buttonSelector(NETWORK_LIST.sortTrigger)).first().click();
    const items = this.page.locator(`[id^="${NETWORK_LIST.sortOptionPrefix}"]`);
    await expect(items.first()).toBeVisible({ timeout: Timeouts.default });
    const labels = (await items.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  /** Whether the Sort By menu is currently open. */
  async isSortMenuOpen(): Promise<boolean> {
    return this.page.locator(`#${NETWORK_LIST.sortMenu}`).isVisible();
  }

  /** Sorts by a column and direction, returning the `sortBy` the list then requested. */
  /**
   * The sort field for a column in the CURRENT language: the Arabic interface
   * sorts Network Name by the Arabic name (`networknamear`), read live
   * 2026-10-25 - 17802 clicked the English option, which Arabic does not offer.
   */
  private async sortField(column: NetworkSortColumn): Promise<string> {
    const rtl = await this.page.evaluate(() => document.documentElement.dir === 'rtl');
    return column === 'name' && rtl ? 'networknamear' : NETWORK_SORT_FIELD[column];
  }

  async sortBy(column: NetworkSortColumn, direction: 'asc' | 'desc'): Promise<string> {
    Logger.step(`Sorting networks by ${column} ${direction}`);
    const request = await this.captureListRequest(async () => {
      await this.page.locator(buttonSelector(NETWORK_LIST.sortTrigger)).first().click();
      await this.page
        .locator(buttonSelector(`${NETWORK_LIST.sortOptionPrefix}${await this.sortField(column)}-${direction}`))
        .first()
        .click();
    });
    await this.waitForPageReady();
    return String(request.sortBy ?? '');
  }

  /** The `sortBy` the list requests on a fresh load - its default order. */
  async captureDefaultSort(): Promise<string> {
    const request = await this.captureListRequest(() => this.open());
    await this.ensureTableView(this.screen);
    return String(request.sortBy ?? '');
  }

  // ---- Export -----------------------------------------------------------------

  /** The list's Export control (two steps: scope menu, then format dialog). */
  exportMenu(): ExportMenu {
    return new ExportMenu(this.page, NETWORK_EXPORT);
  }

  // ---- Create / edit / clone / delete ----------------------------------------

  /** Whether the Add Network action is offered. */
  async isAddOffered(): Promise<boolean> {
    return this.page
      .locator(buttonSelector(NETWORK_LIST.addButton))
      .first()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /** Opens the Add New Network wizard. */
  async openAddForm(): Promise<NetworkFormDialog> {
    Logger.step('Opening the Add New Network wizard');
    await this.page.locator(buttonSelector(NETWORK_LIST.addButton)).first().click();
    const form = new NetworkFormDialog(this.page);
    await form.waitForOpen();
    return form;
  }

  /** Searches for a network and opens its edit drawer, populated. */
  async openEditForm(networkName: string): Promise<NetworkFormDialog> {
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    await this.editRow(networkName);
    const form = new NetworkFormDialog(this.page);
    await form.waitForOpen();
    await form.waitForPopulated();
    return form;
  }

  /** Searches for a network and opens its clone drawer. */
  async openCloneForm(networkName: string): Promise<NetworkFormDialog> {
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    const button = await this.rowActionButton(networkName, 'clone');
    await button.click();
    const form = new NetworkFormDialog(this.page);
    await form.waitForOpen();
    return form;
  }

  /** Searches for a network and starts its deletion, returning the prompt. */
  async openDeletePrompt(networkName: string): Promise<ConfirmDialog> {
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    await this.deleteRow(networkName);
    const dialog = this.dialog();
    await dialog.waitForVisible();
    return dialog;
  }

  /** Deletes a network through the row action, returning DeleteNetwork's answer. */
  async deleteNetwork(networkName: string): Promise<{ status: number; body: unknown; text: string } | null> {
    const dialog = await this.openDeletePrompt(networkName);
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkDelete, () => dialog.confirm());
    await this.waitForPageReady();
    return outcome;
  }

  // ---- Details ----------------------------------------------------------------

  /** Searches for a network and opens its detail screen. */
  async openDetails(networkName: string): Promise<NetworkDetailPage> {
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    await this.viewRow(networkName);
    const detail = new NetworkDetailPage(this.page);
    await detail.waitForLoaded();
    return detail;
  }

  /** A network row's cells, keyed by NETWORK_COLUMN (search first). */
  async readRow(networkName: string): Promise<Record<keyof typeof NETWORK_COLUMN, string>> {
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    const out = {} as Record<keyof typeof NETWORK_COLUMN, string>;
    for (const [key, column] of Object.entries(NETWORK_COLUMN) as [keyof typeof NETWORK_COLUMN, string][]) {
      out[key] = (await this.getCellValue(networkName, column)).trim();
    }
    return out;
  }

  /** The approval cell ("v1 · Published") of a network's row. */
  async getApprovalCell(networkName: string): Promise<string> {
    return (await this.getCellValue(networkName, NETWORK_COLUMN.approvalStatus)).trim();
  }

  /** Polls a network's row until its Status cell reads `status` (reloading each time). */
  async waitForStatus(networkName: string, status: string, timeoutMs: number): Promise<void> {
    await expect
      .poll(async () => {
        await this.openList();
        await this.search(networkName);
        return (await this.getStatusText(networkName).catch(() => '')).trim();
      }, { timeout: timeoutMs, intervals: [10_000], message: `"${networkName}" should come to read ${status}` })
      .toBe(status);
  }

  /** The row actions a network currently offers, by key. */
  async getOfferedRowActions(networkName: string): Promise<RowAction[]> {
    const all: RowAction[] = ['view', 'edit', 'clone', 'delete', 'submit-for-approval', 'inactivate', 'activate'];
    const offered: RowAction[] = [];
    for (const action of all) {
      if ((await this.getRowActionAvailability(networkName, action)) !== 'absent') offered.push(action);
    }
    return offered;
  }

  // ---- story 07 / 08 / 24 / 39 / 40 additions (status lifecycle, go-live) ----

  /**
   * Opens the list in the scope a network is visible in: its owning payer's
   * when it has one (the Network module shows one payer at a time), the
   * default scope otherwise. Keeps the "owned or not" branch out of the specs.
   */
  async openListShowing(payerName?: string): Promise<void> {
    if (payerName === undefined) await this.openList();
    else await this.openListFor(payerName);
  }

  /**
   * Starts an activation, confirms the prompt, and reports what the server and
   * the screen said - for the cases whose subject is a REFUSAL (expired, no
   * facility, inactive payer, duplicate name). `stageStatusChange` assumes
   * success and is the right call for the happy path.
   */
  async attemptActivation(networkName: string): Promise<{ status: number; text: string; toast: string }> {
    const prompt = await this.openActivationPrompt(networkName);
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkSetActive, () => prompt.confirm('activate'));
    const toast = await this.getToastMessage().catch(() => '');
    await this.dialog().cancel().catch(() => undefined);
    return { status: outcome?.status ?? 0, text: outcome?.text ?? '', toast };
  }

  /**
   * Opens the deactivation drawer, fills it as asked and clicks Inactivate,
   * reporting whether the drawer closed (staged) and what the server said.
   * `reason` undefined = leave the reason unselected; '' details = leave blank.
   */
  async attemptInactivation(
    networkName: string,
    reason: string | undefined,
    details: string,
  ): Promise<{ closed: boolean; toast: string; status: number; text: string; detailsHeld: string }> {
    const drawer = await this.openDeactivationDrawer(networkName);
    if (reason !== undefined) await drawer.selectReason(reason);
    const detailsHeld = details === '' ? '' : await drawer.typeDetails(details);
    let attempt = { closed: false, toast: '' };
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkSetInactive, async () => {
      attempt = await drawer.attemptConfirm();
    }, 5_000);
    if (!attempt.closed) await drawer.cancel().catch(() => undefined);
    return { ...attempt, status: outcome?.status ?? 0, text: outcome?.text ?? '', detailsHeld };
  }

  /** The inactivation reasons the drawer offers for a network, without staging anything. */
  async readInactivationReasons(networkName: string): Promise<string[]> {
    const drawer = await this.openDeactivationDrawer(networkName);
    const reasons = await drawer.getReasonOptions();
    await drawer.cancel();
    return reasons;
  }

  /**
   * Sends a staged change for approval and approves it, so the change takes
   * effect - the maker-checker round trip every status case pays.
   */
  async publishStagedChange(networkName: string, payerName?: string): Promise<void> {
    await this.openListShowing(payerName);
    await this.submitForApproval(networkName);
    const approvals = new ApprovalManagementPage(this.page, 'network');
    await approvals.open();
    await approvals.approve(networkName);
    await this.openListShowing(payerName);
  }

  /** Sends a staged change for approval and REJECTS it. */
  async rejectStagedChange(networkName: string, payerName?: string): Promise<void> {
    await this.openListShowing(payerName);
    await this.submitForApproval(networkName);
    const approvals = new ApprovalManagementPage(this.page, 'network');
    await approvals.open();
    await approvals.reject(networkName);
    await this.openListShowing(payerName);
  }

  /** A network's Status cell after a fresh search (in its payer's scope when owned). */
  async readStatus(networkName: string, payerName?: string): Promise<string> {
    await this.openListShowing(payerName);
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    return (await this.getStatusText(networkName)).trim();
  }

  /** The network as GetNetwork answers it - for the fields the UI does not show (inactivation metadata). */
  async readNetworkRecord(networkId: string): Promise<NetworkRecord> {
    return readNetwork(this.page, networkId);
  }

  /** The inactivation reason lookup (`networkInactivationReason`) - ids and labels. */
  async readInactivationReasonLookup(): Promise<{ id: string; code: string; englishName: string }[]> {
    const res = await NetworkUtils.requestAsSession(this.page, 'GET', ApiEndpoints.networkInactivationReasonLookup);
    expect(res.status, 'the inactivation reason lookup should answer').toBe(200);
    return (JSON.parse(res.text) as { payload: { id: string; code: string; englishName: string }[] }).payload;
  }

  /**
   * Sends an inactivation DIRECTLY, with a reason id of the caller's choosing -
   * the sheet's way to submit a reason the dropdown would never offer. Field
   * names follow GetNetwork's (`inactivationReasonId`, `inactivationDetails`).
   */
  async submitInactivationRequest(
    networkId: string,
    reasonId: string,
    details: string,
  ): Promise<{ status: number; text: string; validationErrors: string[] }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.networkSetInactive, {
      id: networkId,
      inactivationReasonId: reasonId,
      inactivationDetails: details,
    });
  }

  /**
   * Takes a never-approved draft live the way the application does it - Send
   * for Approval, then Approve - and reports each answer and the status the
   * detail header ends on. The approval is only attempted when the submission
   * was accepted; the branch lives here so the go-live cases stay linear.
   *
   * Driven from the DETAIL screen, opened by id: a network owned by an
   * inactive payer cannot be brought into the list's scope (the selector
   * offers live payers only), but its detail screen opens.
   */
  async attemptGoLive(
    network: { id: string; name: string },
  ): Promise<{ submitStatus: number; submitText: string; toast: string; approveAnswer: string; queued: boolean; status: string }> {
    const detail = new NetworkDetailPage(this.page);
    await detail.open(network.id);
    await detail.clickAction('submit');
    const submitted = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkSubmit, () =>
      this.dialog().confirm('Send for Approval'),
    );
    const toast = await this.getToastMessage().catch(() => '');
    const approvals = new ApprovalManagementPage(this.page, 'network');
    let approveAnswer = '';
    let queued = false;
    if (submitted !== null && submitted.status < 300) {
      await approvals.open();
      const attempt = await approvals.attemptApprove(network.name);
      approveAnswer = attempt.answer;
      queued = attempt.stillQueued;
    }
    await detail.open(network.id);
    return {
      submitStatus: submitted?.status ?? 0,
      submitText: submitted?.text ?? '',
      toast,
      approveAnswer,
      queued,
      status: await detail.getStatus(),
    };
  }

  // ---- story 05 / 10 / 11 / 22 / 37 / 38 additions (create, edit, validation) ----

  /**
   * Sends CreateNetwork DIRECTLY as this session - the "bypass the screen"
   * half of the registration-permission cases. Type is a label (HMO/PPO/...)
   * resolved through the lookup; dates are ISO strings.
   */
  async createNetworkDirect(body: {
    nameEn: string;
    nameAr: string;
    type: string;
    effectiveIso: string;
    expiryIso: string;
  }): Promise<{ status: number; text: string; validationErrors: string[] }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.networkCreate, {
      networkNameEn: body.nameEn,
      networkNameAr: body.nameAr,
      networkTypeId: await networkTypeId(this.page, body.type),
      descriptionEn: null,
      descriptionAr: null,
      effectiveDate: body.effectiveIso,
      expiryDate: body.expiryIso,
    });
  }

  /**
   * Asserts a network's Status cell keeps reading `status` for `durationMs`,
   * re-reading the list every 20 s. For the "remains Pending" cases, where a
   * single read straight after approval proves nothing about the job.
   */
  async expectStatusUnchangedFor(networkName: string, status: string, durationMs: number): Promise<void> {
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline) {
      const shown = await this.readStatus(networkName);
      expect(shown, `"${networkName}" should still read ${status}`).toBe(status);
      await this.page.waitForTimeout(Math.min(20_000, Math.max(0, deadline - Date.now())));
    }
    expect(await this.readStatus(networkName), `"${networkName}" should still read ${status} at the end`).toBe(status);
  }

  /** A network's Network Code cell after a fresh search. */
  async readCode(networkName: string): Promise<string> {
    return (await this.readRow(networkName)).code;
  }

  // ---- story 21 / 36 additions ----

  /**
   * Which network actions THIS session is actually given on one network - the
   * permission stories' whole question, answered in one read so every case
   * compares the same twelve things. An action counts as granted only when it
   * is offered AND usable: a row action must be enabled, a tab must load its
   * data (a tab rendered over a refused feed is not access), the export
   * control must be on the toolbar, the KPI band must render.
   *
   * Never throws for a refusal: a session denied the list, the record or a tab
   * simply reads `false` for what it was denied.
   */
  async readActionAccess(network: { id: string; name: string }): Promise<Record<NetworkAccessAction, boolean>> {
    Logger.step(`Reading which network actions this session is given on "${network.name}"`);
    const usable = async (action: RowAction) =>
      (await this.getRowActionAvailability(network.name, action).catch(() => 'absent' as const)) === 'available';

    await this.goto(AppRoutes.networkManagement);
    const listShown = await this.tableFor(this.screen)
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
    const dashboard = await this.isKpiBandVisible();
    const create = await this.isAddOffered();
    const exportOffered = await this.exportMenu().isAvailable();
    let rowShown = false;
    if (listShown) {
      await this.search(network.name).catch(() => undefined);
      rowShown = await this.isRowVisible(network.name).catch(() => false);
    }
    const edit = rowShown && (await usable('edit'));
    const del = rowShown && (await usable('delete'));
    const inactivate = rowShown && (await usable('inactivate'));
    const activate = rowShown && (await usable('activate'));

    const detail = new NetworkDetailPage(this.page);
    await detail.openExpectingFailure(network.id);
    const viewDetails = await detail.isLoaded();
    let versionHistory = false;
    let revert = false;
    let auditLog = false;
    let assignFacilities = false;
    if (viewDetails) {
      if (await detail.hasTab('versions')) {
        const rows = await detail.versions().open().then(() => detail.versions().readRows()).catch(() => []);
        versionHistory = rows.length > 0;
        revert = rows.some((row) => row.actions.some((action) => /revert/i.test(action)));
      }
      if (await detail.hasTab('audit')) {
        auditLog = (await detail.audit().open().then(() => detail.audit().readEntries()).catch(() => [])).length > 0;
      }
      if (await detail.hasTab('facilities')) {
        assignFacilities = await detail.facilities().open().then(() => detail.facilities().isAssignOffered()).catch(() => false);
      }
    }
    const access = {
      viewList: listShown,
      viewDetails,
      dashboard,
      export: exportOffered,
      create,
      edit,
      delete: del,
      activate,
      inactivate,
      versionHistory,
      revert,
      auditLog,
      assignFacilities,
    };
    Logger.step(`Access on "${network.name}": ${JSON.stringify(access)}`);
    return access;
  }

  /**
   * Sends an UpdateNetwork straight to the server as this session, bypassing
   * the screen - the "direct API request without the permission" cases. The
   * body is the record as this session can read it (falling back to the id
   * alone when even that is refused) with `patch` applied.
   */
  async attemptUpdateViaApi(networkId: string, patch: Record<string, unknown>): Promise<{ status: number; text: string }> {
    const current = await this.readNetworkRecord(networkId).catch(() => ({ id: networkId }) as Record<string, unknown>);
    return NetworkUtils.requestAsSession(this.page, 'PUT', ApiEndpoints.networkUpdate, {
      ...current,
      ...patch,
      id: networkId,
      confirmRevertToDraft: false,
    });
  }

  /** Discards a never-approved draft by its name (teardown of drafts a session created). */
  async discardDraftNetwork(networkName: string): Promise<void> {
    const id = await networkIdByName(this.page, networkName).catch(() => null);
    if (id === null) return;
    Logger.step(`Discarding draft network "${networkName}"`);
    await deleteNetworkById(this.page, id).catch(() => undefined);
  }

  // ---- story 19 / 33 / 34 additions (optimistic locking, submission) ----

  /**
   * The UpdateNetwork body exactly as the edit drawer sends it (verified in
   * the drawer's own PUT, 2026-10-21): the editable fields, the id, the
   * concurrency stamp and `confirmRevertToDraft: false` - with `patch` applied.
   * `stamp` undefined = the field is OMITTED, null/'' = sent empty.
   */
  private updateBody(record: NetworkRecord, patch: Partial<NetworkRecord>, stamp: string | null | undefined): Record<string, unknown> {
    const merged = { ...record, ...patch };
    return {
      networkNameEn: merged.networkNameEn,
      networkNameAr: merged.networkNameAr,
      networkTypeId: merged.networkTypeId,
      payerId: merged.payerId,
      descriptionEn: merged.descriptionEn,
      descriptionAr: merged.descriptionAr,
      effectiveDate: merged.effectiveDate,
      expiryDate: merged.expiryDate,
      id: record.id,
      ...(stamp === undefined ? {} : { concurrencyStamp: stamp }),
      confirmRevertToDraft: false,
    };
  }

  /**
   * Sends UpdateNetwork DIRECTLY with a stamp of the caller's choosing - the
   * stale / missing / malformed stamp cases. `record` is the network as it was
   * read (by whichever session), `patch` the fields to change.
   */
  async updateWithStamp(
    record: NetworkRecord,
    patch: Partial<NetworkRecord>,
    stamp: string | null | undefined,
  ): Promise<{ status: number; text: string; validationErrors: string[] }> {
    Logger.step(`PUT UpdateNetwork for "${record.networkNameEn}" with stamp ${stamp === undefined ? '(omitted)' : `"${stamp}"`}`);
    return NetworkUtils.requestAsSession(this.page, 'PUT', ApiEndpoints.networkUpdate, this.updateBody(record, patch, stamp));
  }

  /**
   * Fires several UpdateNetwork requests carrying the SAME stamp at once - the
   * lost-update race. Answers come back in the order the patches were given.
   */
  async sendConcurrentUpdates(
    record: NetworkRecord,
    stamp: string,
    patches: Partial<NetworkRecord>[],
  ): Promise<{ status: number; text: string; validationErrors: string[] }[]> {
    Logger.step(`Firing ${patches.length} simultaneous updates for "${record.networkNameEn}"`);
    return Promise.all(patches.map((patch) =>
      NetworkUtils.requestAsSession(this.page, 'PUT', ApiEndpoints.networkUpdate, this.updateBody(record, patch, stamp))));
  }

  /** Fires `times` SubmitNetworkForApproval requests at once - the double-submit race. */
  async submitConcurrently(networkId: string, times: number): Promise<{ status: number; text: string }[]> {
    Logger.step(`Firing ${times} simultaneous submissions for network ${networkId}`);
    return Promise.all(Array.from({ length: times }, () =>
      NetworkUtils.postAsSession(this.page, ApiEndpoints.networkSubmit, { networkId })));
  }

  /**
   * Opens a network's edit drawer, changes one field with real keystrokes and
   * saves, returning what UpdateNetwork answered plus every message shown. The
   * drawer is closed afterwards whichever way the save went.
   */
  async stageEdit(
    networkName: string,
    field: NetworkFieldKey,
    value: string,
  ): Promise<{ outcome: SaveOutcome; messages: string[] }> {
    const form = await this.openEditForm(networkName);
    await form.editField(field, value);
    const report = await form.saveEditAndReport();
    await form.closeAndDiscard();
    return report;
  }

  /** Opens the edit drawer, saves WITHOUT changing anything, and reports the answer. */
  async saveUnchanged(networkName: string): Promise<{ outcome: SaveOutcome; messages: string[] }> {
    const form = await this.openEditForm(networkName);
    const report = await form.saveEditAndReport();
    await form.closeAndDiscard();
    return report;
  }

  /** The edit drawer currently open in this window (opened by openEditForm / reopenEditForm). */
  editForm(): NetworkFormDialog {
    return new NetworkFormDialog(this.page);
  }

  /** Closes any open edit drawer (discarding) and opens the network's edit drawer afresh - a user's "reload". */
  async reopenEditForm(networkName: string): Promise<NetworkFormDialog> {
    const open = new NetworkFormDialog(this.page);
    if (await open.isOpen()) await open.closeAndDiscard();
    await this.openList();
    return this.openEditForm(networkName);
  }

  /** Whether a network's row offers a usable Send for Approval. */
  async isSubmitOffered(networkName: string): Promise<boolean> {
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    return (await this.getRowActionAvailability(networkName, 'submit-for-approval')) === 'available';
  }

  /** Sends a network for approval from its row and returns what SubmitNetworkForApproval answered. */
  async submitAndCapture(networkName: string): Promise<SaveOutcome> {
    await this.search(networkName);
    await this.waitForRowVisible(networkName);
    await this.sendRowForApproval(networkName);
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.networkSubmit, () =>
      this.dialog().confirm('Send for Approval'));
    await this.waitForPageReady();
    return outcome;
  }

  /** Sends SubmitNetworkForApproval directly - for a network whose row offers no such action. */
  async submitViaApi(networkId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.networkSubmit, { networkId });
  }

  /** Polls a row's approval cell until it matches (the cell lags a moment behind a decision). */
  async expectApprovalCell(networkName: string, expected: RegExp): Promise<void> {
    await expect
      .poll(async () => {
        await this.openList();
        await this.search(networkName);
        return this.getApprovalCell(networkName).catch(() => '(row absent)');
      }, { timeout: Timeouts.queuePropagation, intervals: [2_000, 5_000], message: `"${networkName}" approval cell should match ${expected}` })
      .toMatch(expected);
  }

  /**
   * Proposes a change for review: stages a description edit on the network
   * and sends it for approval, asserting both were accepted. The precondition
   * every "a change is pending review" case starts from.
   */
  async proposeChange(networkName: string, description: string): Promise<void> {
    Logger.step(`Proposing a change to "${networkName}" for review`);
    await this.openList();
    const staged = await this.stageEdit(networkName, 'descriptionEn', description);
    expect(staged.outcome?.status ?? 0, `the edit should be staged: ${staged.outcome?.text.slice(0, 200) ?? 'no request'}`).toBeLessThan(300);
    const sent = await this.submitAndCapture(networkName);
    expect(sent?.status ?? 0, `the change should be sent for approval: ${sent?.text.slice(0, 200) ?? 'no request'}`).toBeLessThan(300);
  }

  /**
   * Proposes a FACILITY change for review: assigns the first facility the
   * Assign Facilities drawer offers (staged as a draft) and sends it for
   * approval. Returns the facility's label ("FCL-000009 — Nathealth").
   */
  async proposeFacilityAssignment(network: { id: string; name: string }): Promise<string> {
    Logger.step(`Proposing a facility assignment on "${network.name}" for review`);
    const detail = new NetworkDetailPage(this.page);
    await detail.open(network.id);
    const tab = detail.facilities();
    await tab.open();
    await tab.openAssignDrawer();
    const offered = await tab.getAssignableOptions();
    expect(offered.length, 'the Assign Facilities drawer should offer a facility to add').toBeGreaterThan(0);
    await tab.selectFacilities([offered[0]]);
    const assigned = await tab.confirmAssign();
    expect(assigned?.status ?? 0, `the assignment should be staged: ${assigned?.text.slice(0, 200) ?? 'no request'}`).toBeLessThan(300);
    await this.openList();
    const sent = await this.submitAndCapture(network.name);
    expect(sent?.status ?? 0, 'the facility change should be sent for approval').toBeLessThan(300);
    return offered[0];
  }

  /** Proposes a DELETION for review: deletes (staged as a draft) and sends it for approval. */
  async proposeDeletion(networkName: string): Promise<void> {
    Logger.step(`Proposing the deletion of "${networkName}" for review`);
    await this.openList();
    const deleted = await this.deleteNetwork(networkName);
    expect(deleted?.status ?? 0, `the deletion should be staged: ${deleted?.text.slice(0, 200) ?? 'no request'}`).toBeLessThan(300);
    const sent = await this.submitAndCapture(networkName);
    expect(sent?.status ?? 0, 'the deletion should be sent for approval').toBeLessThan(300);
  }

  /** Whether the list still shows a network after a fresh search. */
  async isListed(networkName: string): Promise<boolean> {
    await this.openList();
    await this.search(networkName);
    return this.isRowVisible(networkName);
  }

  // ---- story 18 / 23 additions (deletion, code retention) ----

  /**
   * The network names the cross-module selection feed (GetNetworksDropdown -
   * what other modules' network pickers read) offers for `term`. Returns the
   * server's status too, so a refused call is reported rather than read as
   * "not offered".
   */
  async readSelectableNetworks(term: string): Promise<{ status: number; names: string[] }> {
    const res = await NetworkUtils.requestAsSession(this.page, 'POST', '/api/Networks/GetNetworksDropdown', {
      pageNumber: 1,
      rowsPerPage: 200,
      searchText: term,
    });
    const names: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.networkNameEn === 'string') names.push(record.networkNameEn);
        Object.values(record).forEach(walk);
      }
    };
    try {
      walk(JSON.parse(res.text));
    } catch {
      // A non-JSON answer leaves names empty; the status says why.
    }
    return { status: res.status, names: [...new Set(names)] };
  }

  // ---- story 02 / 03 / 04 / 06 / 25 / 26 additions (list, KPIs, sort, export) ----

  /**
   * The rows the list's own GetNetworks request answered while `action` ran -
   * for the cases that compare what the server aggregated (facility and policy
   * counts, creation order) with what the table rendered.
   */
  async captureListItems(action: () => Promise<void>): Promise<Record<string, unknown>[]> {
    const body = await NetworkUtils.captureJsonResponseMatching<{ payload?: { networks?: { items?: Record<string, unknown>[] } } }>(
      this.page,
      LIST_URL,
      action,
    );
    expect(body, 'the list should have fetched GetNetworks').not.toBeNull();
    return body?.payload?.networks?.items ?? [];
  }

  /** Reloads the list and returns the rows its request answered. */
  async reloadAndCaptureItems(): Promise<Record<string, unknown>[]> {
    return this.captureListItems(() => this.openList());
  }

  /**
   * Sends a GetNetworks request DIRECTLY with a caller-built body - the
   * "manipulated filter value" case. Answers the raw status and text so the
   * case can tell a handled refusal from an unhandled error.
   */
  async sendListRequest(body: Record<string, unknown>): Promise<{ status: number; text: string }> {
    return NetworkUtils.requestAsSession(this.page, 'POST', GET_NETWORKS_ENDPOINT, body);
  }

  /** The body the list sends for a quick filter, read off its own request. */
  async captureQuickFilterRequest(which: 'type' | 'status', option: string): Promise<Record<string, unknown>> {
    return this.captureListRequest(() => this.applyQuickFilter(which, option));
  }

  /**
   * Sends the list request a quick filter makes, with the filter's value
   * replaced by `value` - the "manipulated request" case. The filter's field
   * name is LEARNED rather than guessed: the list is loaded unfiltered and
   * filtered by `probeOption`, and the key that appears is the one corrupted.
   */
  async sendManipulatedQuickFilter(
    which: 'type' | 'status',
    probeOption: string,
    value: string,
  ): Promise<{ status: number; text: string }> {
    const plain = await this.captureListRequest(() => this.openList());
    const filtered = await this.captureQuickFilterRequest(which, probeOption);
    const keys = Object.keys(filtered).filter((key) => JSON.stringify(filtered[key]) !== JSON.stringify(plain[key]));
    expect(keys.length, `the ${which} filter should add a field to the list request`).toBeGreaterThan(0);
    Logger.step(`Sending GetNetworks with ${keys.join(', ')} = "${value}"`);
    return this.sendListRequest({ ...filtered, ...Object.fromEntries(keys.map((key) => [key, value])) });
  }

  /**
   * Applies a quick filter through the interface while the list's own request
   * is rewritten to carry `value` instead - the manipulated request as the
   * screen experiences it. The field is learned as in sendManipulatedQuickFilter.
   * Returns the status the server answered the rewritten request with, and the
   * list's text read WHILE the rewrite is still in place - the list re-queries
   * once more after the filter applies, and with the rewrite removed first
   * that second, ordinary answer was what got read (17746, 2026-10-27).
   */
  async applyManipulatedQuickFilter(
    which: 'type' | 'status',
    probeOption: string,
    value: string,
  ): Promise<{ answered: number; screen: string }> {
    const plain = await this.captureListRequest(() => this.openList());
    const filtered = await this.captureQuickFilterRequest(which, probeOption);
    const keys = Object.keys(filtered).filter((key) => JSON.stringify(filtered[key]) !== JSON.stringify(plain[key]));
    expect(keys.length, `the ${which} filter should add a field to the list request`).toBeGreaterThan(0);
    await this.openList();
    Logger.step(`Filtering by ${which} with the request rewritten to ${keys.join(', ')} = "${value}"`);
    let answered = 0;
    let screen = '';
    await this.page.route(LIST_URL, async (route) => {
      const body = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
      const response = await route.fetch({ postData: JSON.stringify({ ...body, ...Object.fromEntries(keys.map((key) => [key, value])) }) });
      answered = response.status();
      await route.fulfill({ response });
    });
    try {
      await this.applyQuickFilter(which, probeOption);
      await this.waitForPageReady();
      await this.page.waitForLoadState('networkidle', { timeout: Timeouts.default }).catch(() => undefined);
      screen = await this.getTableBodyText();
    } finally {
      await this.page.unroute(LIST_URL);
    }
    Logger.info(`The manipulated list request was answered with ${answered}`);
    return { answered, screen };
  }

  // -- Sort menu state --

  private sortTriggerButton(): Locator {
    return this.page.locator(buttonSelector(NETWORK_LIST.sortTrigger)).first();
  }

  private sortMenuPanel(): Locator {
    return this.page.locator(`#${NETWORK_LIST.sortMenu}`);
  }

  /** Opens the Sort By menu and asserts it opened. */
  async openSortMenu(): Promise<void> {
    await this.sortTriggerButton().click();
    await expect(this.sortMenuPanel(), 'the Sort By menu should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** The option the menu marks as active (`aria-checked="true"`), '' when none is marked. */
  async getActiveSortOption(): Promise<string> {
    await this.openSortMenu();
    const active = this.page.locator(`[id^="${NETWORK_LIST.sortOptionPrefix}"][aria-checked="true"]`);
    const label = (await active.count()) > 0 ? (await active.first().innerText()).trim() : '';
    await this.page.keyboard.press('Escape');
    return label;
  }

  /** Sorts and returns both the `sortBy` requested and the rows the server answered. */
  async sortByAndCaptureItems(
    column: NetworkSortColumn,
    direction: 'asc' | 'desc',
  ): Promise<{ sortBy: string; items: Record<string, unknown>[] }> {
    let sortBy = '';
    const items = await this.captureListItems(async () => {
      sortBy = await this.sortBy(column, direction);
    });
    return { sortBy, items };
  }

  // -- Payer scope (the top-bar payer quick filter) --

  /** Whether the top-bar payer selector - the module's payer quick filter - is shown. */
  async isPayerScopeSelectorShown(): Promise<boolean> {
    return this.page
      .locator(`#${GLOBAL.payerScopeSelect}`)
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /** The payer the top-bar selector currently shows. */
  async getScopedPayer(): Promise<string> {
    return (await this.page.locator(`#${GLOBAL.payerScopeSelect}`).innerText()).trim();
  }

  // -- Card view --

  /**
   * Card titles. locator-exception: the network cards' ids are inferred from
   * the payer cards' pattern (`{screen}-cards`, `{entity}-card-{id}-title`) -
   * not yet confirmed on the network list.
   */
  private cardTitles(): Locator {
    return this.page.locator(
      `#${NETWORK_CARDS.container} [id^="${NETWORK_CARDS.cardPrefix}"][id$="-${NETWORK_CARDS.titleSuffix}"]`,
    );
  }

  /** Switches the list to Cards view with the breadcrumb toggle and waits for the cards. */
  async switchToCardsView(): Promise<void> {
    Logger.step('Switching the network list to Cards view');
    await this.btn(GLOBAL.viewToggleCards).click();
    await expect(this.page.locator(`#${NETWORK_CARDS.container}`), 'the cards view should render').toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /** Switches back to Table view and waits for the table. */
  async switchToTableView(): Promise<void> {
    await this.ensureTableView(this.screen);
  }

  /** The card titles on screen, in order. */
  async getCardTitles(): Promise<string[]> {
    return (await this.cardTitles().allInnerTexts()).map((t) => t.trim());
  }

  /**
   * The cards view's Load More control.
   * locator-exception: its id is not confirmed; it is a `-load-more` id inside
   * the cards container, or a button reading "Load More".
   */
  private loadMoreButton(): Locator {
    return this.page
      .locator(`#${NETWORK_CARDS.container} [id$="load-more"], [id="${NETWORK_CARDS.container}-load-more"]`)
      .or(this.page.getByRole('button', { name: /load more/i })) // locator-exception: the cards view Load More control was not seen with an id; fallback by label
      .first();
  }

  async isLoadMoreOffered(): Promise<boolean> {
    return this.loadMoreButton()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /** Clicks Load More once and waits for the next batch to arrive. */
  async loadMoreCards(): Promise<void> {
    await this.captureListItems(() => this.loadMoreButton().click());
    await this.waitForPageReady();
  }

  /** Clicks Load More `times` times without waiting in between; returns the list requests fired. */
  async loadMoreRapidly(times: number): Promise<number> {
    Logger.step(`Clicking Load More ${times} times in rapid succession`);
    const button = this.loadMoreButton();
    await expect(button, 'the cards view should offer Load More').toBeVisible({ timeout: Timeouts.default });
    const fired = await this.countListRequests(async () => {
      await Promise.all(Array.from({ length: times }, () => button.click({ noWaitAfter: true }).catch(() => undefined)));
    }, 3_000);
    await this.waitForPageReady();
    return fired;
  }

  // -- Export, language and access --

  /** Exports (scope + format) and returns the file name, bytes and parsed rows. */
  async exportAndParse(
    scope: 'all' | 'selected',
    format: 'csv' | 'excel',
  ): Promise<{ filename: string; bytes: Buffer; parsed: ParsedXlsx }> {
    return this.exportMenu().exportAndParse(scope, format);
  }

  /** Every Network Code on the current page (for comparing a page with an export). */
  async readCodesOnPage(): Promise<string[]> {
    return this.readColumn(NETWORK_COLUMN.code);
  }

  /** The language toggle on this page - for the bilingual cases and for other sessions. */
  languageSwitcher(): LanguageSwitcher {
    return new LanguageSwitcher(this.page);
  }

  /**
   * Whether this session reaches the list at all: the table, the KPI band,
   * and where the browser ended up. For the "no view permission" cases.
   */
  async readListAccess(): Promise<{ table: boolean; kpis: boolean; url: string }> {
    await this.goto(AppRoutes.networkManagement);
    const table = await this.tableFor(this.screen)
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
    return { table, kpis: await this.isKpiBandVisible(), url: this.page.url() };
  }

  // ---- story 31 additions (lifecycle job) ----

  /**
   * `stageEdit` for SEVERAL fields at once - the reactivation cases change the
   * effective and the expiry date together, and two separate saves would stage
   * two drafts. Returns UpdateNetwork's answer, the messages shown, and the
   * inline error under each edited field ('' for none), read BEFORE the drawer
   * is closed (a refused save keeps it open; its errors are the evidence).
   */
  async stageMultiFieldEdit(
    networkName: string,
    changes: Partial<Record<NetworkFieldKey, string>>,
  ): Promise<{ outcome: SaveOutcome; messages: string[]; errors: Partial<Record<NetworkFieldKey, string>> }> {
    const form = await this.openEditForm(networkName);
    const keys = Object.keys(changes) as NetworkFieldKey[];
    for (const key of keys) await form.editField(key, changes[key]!);
    const report = await form.saveEditAndReport();
    const errors: Partial<Record<NetworkFieldKey, string>> = {};
    // Errors only exist on a REFUSED save (2026-10-25). After a good save the
    // drawer is still closing when isOpen() asks, and reading errors then clicks
    // the stepper of a vanishing form - 18126-18130 failed on that click.
    if (report.refused && (await form.isOpen())) {
      for (const key of keys) errors[key] = await form.readFieldError(key);
    }
    await form.closeAndDiscard();
    return { ...report, errors };
  }
}

/** The network actions the permission stories compare, as readActionAccess reads them. */
export type NetworkAccessAction =
  | 'viewList'
  | 'viewDetails'
  | 'dashboard'
  | 'export'
  | 'create'
  | 'edit'
  | 'delete'
  | 'activate'
  | 'inactivate'
  | 'versionHistory'
  | 'revert'
  | 'auditLog'
  | 'assignFacilities';
