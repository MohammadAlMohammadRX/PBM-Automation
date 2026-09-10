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
