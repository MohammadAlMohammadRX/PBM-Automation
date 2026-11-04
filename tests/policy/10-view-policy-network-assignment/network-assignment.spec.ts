import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import type { AdvancedSearchDrawer } from '../../../pages/payer/AdvancedSearchDrawer';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { POLICY_NETWORKS, POLICY_NETWORK_FILTER_FIELD } from '../../../constants/ElementIds';
import { TAB_FILTER } from '../../../constants/policy/writerCIds';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { DIALOG, NOTICE } from '../../../data/policy/policy.data';
import { BLOCKED_CASES, CASES, NOT_ASSIGNED_YET } from '../../../data/policy/networkAssignment.data';
import {
  activeNetworkOfAnotherPayer,
  blockUnless,
  chooseNetworkOption,
  clearTabFilters,
  clickAssign,
  findExpiredPolicy,
  futureNetworkOf,
  networkSelectUsable,
  payerWithoutNetworks,
  rowControlAvailability,
  rowControlTitle,
  unassignedActiveNetworks,
} from '../../../utils/policy/writerCHelpers';
import { assignPolicyNetwork, assignableNetworks, readPolicyNetworks } from '../../../utils/PolicyProvisioning';

const NETWORKS_LIST = /\/GetPolicyNetworks$/;

/**
 * User story 15177: View Policy - Network Assignment. The administrator plays
 * the Policy Administrator; every policy is the case's own suite policy (payer
 * "Al sharq"), except the Expired one of 19547, which is only looked at.
 * Cases needing two distinct active networks of the payer are BLOCKED when the
 * select offers fewer (see data/policy/networkAssignment.data.ts).
 */
test.describe('US 15177 - View Policy - Network Assignment', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.addActiveAndFuture.azureId}: should add an active and a future network of the payer to the policy's assignment list`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    networkIn,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Draft', { networks: 0 });
    const active = (await assignableNetworks(page, policy.payerId))[0];
    // No Future network of the payer left once NET-001133 turned Active (2026-11-04):
    // the case builds one (approved, effective in two days - the network lifecycle
    // job now runs daily, so it stays Future through the case).
    const future = (await futureNetworkOf(page, policy.payerId))
      ?? await networkIn('Pending', { payerId: policy.payerId }).then((n) => ({ id: n.id, name: n.name }));
    blockUnless(testInfo, active !== undefined, `an active network of "${policy.payerName}"`, 'the payer has no active network to assign');
    blockUnless(testInfo, future !== null, `a Future network of "${policy.payerName}"`, 'the payer has no approved, not-yet-effective network for the "future network" step');

    await steps.critical('Navigate to the Policy Management module - the module loads with the list of policies', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy and go to the Network Assignment tab - the network assignment table is shown', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.countRows()).toBe(0);
    });

    await steps.critical('Click Add Network Assignment - the Select Network Assignment list is displayed', async () => {
      expect(await policyNetworksTab.isAssignOffered(), 'the network select').toBe(true);
      expect(await policyNetworksTab.getAssignAvailability()).not.toBe('absent');
    });

    await steps.step('Select an active network from the list - it is shown as the chosen value', async () => {
      expect(await chooseNetworkOption(page, active.networkNameEn)).toContain(active.networkNameEn.slice(0, 30));
    });

    await steps.step('Select a future network from the list - it is shown as the chosen value', async () => {
      const options = await policyNetworksTab.getAssignableOptions();
      expect(options.some((o) => o.includes(future!.name)), `the future network "${future!.name}" among ${JSON.stringify(options)}`).toBe(true);
      expect(await chooseNetworkOption(page, future!.name)).toContain(future!.name.slice(0, 30));
    });

    await steps.step('Save the network assignment - a row is added with Network Code, Network Name, Status, Approval Status and Assigned On populated', async () => {
      const answer = await clickAssign(page);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await policyNetworksTab.open();
      const headers = await policyNetworksTab.getHeaders();
      expect(headers, 'the columns').toEqual(expect.arrayContaining(['Network Code', 'Network Name', 'Status', 'Approval Status', 'Assigned On']));
      const rows = await policyNetworksTab.readRows();
      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) {
        expect(row.code && row.name && row.status && row.assignment, JSON.stringify(row)).toBeTruthy();
        expect(row.assignedOn, `Assigned On of ${row.code}`).not.toMatch(NOT_ASSIGNED_YET);
      }
    });
  });

  test(`TC-${CASES.twoDistinct.azureId}: should list two distinct networks once each when both are assigned to the policy`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Draft', { networks: 0 });
    const offered = await assignableNetworks(page, policy.payerId);
    blockUnless(testInfo, offered.length >= 2, `two active networks of "${policy.payerName}"`, `the assign select offers ${offered.length} network(s): ${offered.map((n) => n.networkNameEn).join(', ')}`);

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy and go to the Network Assignment tab - the current assignments are shown', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.countRows()).toBe(0);
    });

    await steps.critical(`Add the first network "${offered[0].networkNameEn}" - its row is added`, async () => {
      const answer = await policyNetworksTab.assign(offered[0].networkNameEn);
      expect(answer.status, answer.text.slice(0, 200)).toBe(200);
      await policyNetworksTab.open();
      expect((await policyNetworksTab.readRows()).some((r) => r.name === offered[0].networkNameEn)).toBe(true);
    });

    await steps.step(`Add the second, distinct network "${offered[1].networkNameEn}" - its row is added`, async () => {
      const answer = await policyNetworksTab.assign(offered[1].networkNameEn);
      expect(answer.status, answer.text.slice(0, 200)).toBe(200);
      await policyNetworksTab.open();
      expect((await policyNetworksTab.readRows()).some((r) => r.name === offered[1].networkNameEn)).toBe(true);
    });

    await steps.step('Verify both rows exist once each with distinct assignment dates', async () => {
      const rows = await policyNetworksTab.readRows();
      expect(rows.length, 'two rows').toBe(2);
      expect(new Set(rows.map((r) => r.code)).size, 'no duplicate network').toBe(2);
      for (const row of rows) expect(row.assignedOn, `Assigned On of ${row.code}`).not.toMatch(NOT_ASSIGNED_YET);
      expect(rows[0].assignedOn, 'distinct assignment dates').not.toBe(rows[1].assignedOn);
    });
  });

  test(`TC-${CASES.noDuplicateInSelect.azureId}: should not offer a network that is already assigned when adding another assignment`, async ({
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    const assigned = policy.networks[0];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the policy's Network Assignment tab - the assignment ${assigned.networkCode} is visible`, async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      await expect(policyNetworksTab.rowOf(assigned.networkCode)).toBeVisible();
    });

    await steps.step('Click Add Network Assignment and look for the same network - it is not offered in the list', async () => {
      const options = await policyNetworksTab.getAssignableOptions();
      expect(options.some((o) => o.includes(assigned.networkNameEn)), `"${assigned.networkNameEn}" among ${JSON.stringify(options)}`).toBe(false);
    });
  });

  test(`TC-${CASES.expiredReadOnly.azureId}: should block adding and removing network assignments on an expired policy`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    steps,
  }, testInfo) => {
    const data = CASES.expiredReadOnly;
    const expired = await findExpiredPolicy(page, { networks: true });
    blockUnless(testInfo, expired !== null, 'an Expired policy with an assigned network (read-only use)', 'the register holds no Expired policy with a network, and Expired cannot be produced on demand (daily lifecycle job)');
    let firstCode = '';

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(expired!.policyNameEn)).toBe(true);
    });

    await steps.critical('Open the Expired policy\'s Network Assignment tab - the assignments are displayed read-only', async () => {
      await policyDetailPage.open(expired!.id);
      expect(await policyDetailPage.getStatus()).toMatch(/Expired/);
      await policyNetworksTab.open();
      const rows = await policyNetworksTab.readRows();
      expect(rows.length).toBeGreaterThan(0);
      firstCode = rows[0].code;
      expect(await policyNetworksTab.getPanelHeaderText(), 'the read-only notice').toContain(NOTICE.networksReadOnly);
    });

    await steps.step('Attempt to click Add Network Assignment - the action is disabled or blocked', async () => {
      expect(await networkSelectUsable(page), 'the network select + Assign').toBe(false);
    });

    await steps.step(`Attempt to delete an existing assignment - Delete is disabled with "${data.message}"`, async () => {
      const row = policyNetworksTab.rowOf(firstCode);
      expect(await rowControlAvailability(row, POLICY_NETWORKS.remove)).not.toBe('available');
      const shown = `${await rowControlTitle(row, POLICY_NETWORKS.remove)} ${await policyNetworksTab.getPanelHeaderText()}`;
      expect(shown).toContain(data.message);
    });
  });

  test(`TC-${CASES.inactiveChangeable.azureId}: should add and delete network assignments on an inactive policy`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Inactive');
    const extra = (await unassignedActiveNetworks(page, policy.payerId, policy.networks))[0];
    blockUnless(testInfo, extra !== undefined, `a second active network of "${policy.payerName}" to add`, 'the assign select offers no network the policy does not already hold');
    const existing = policy.networks[0];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Inactive policy\'s Network Assignment tab - its assignments are displayed', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getStatus()).toMatch(/Inactive/);
      await policyNetworksTab.open();
      await expect(policyNetworksTab.rowOf(existing.networkCode)).toBeVisible();
    });

    await steps.step(`Add the network "${extra.networkNameEn}" - it is added successfully`, async () => {
      const answer = await policyNetworksTab.assign(extra.networkNameEn);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect((await readPolicyNetworks(page, policy.id)).some((n) => n.networkId === extra.id)).toBe(true);
    });

    await steps.step(`Delete the existing assignment ${existing.networkCode} - it is deleted successfully`, async () => {
      await policyNetworksTab.open();
      const answer = await policyNetworksTab.removeNetwork(existing.networkCode);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      const after = (await readPolicyNetworks(page, policy.id)).find((n) => n.networkId === existing.networkId);
      expect(after === undefined || /removal/i.test(after.assignmentState), `assignment now ${after?.assignmentState}`).toBe(true);
    });
  });

  test(`TC-${CASES.removeWithoutTransactions.azureId}: should remove a network assignment that has no transactions from the table`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future');
    const network = policy.networks[0];
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the policy's Network Assignment tab - ${network.networkCode} is visible`, async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      await expect(policyNetworksTab.rowOf(network.networkCode)).toBeVisible();
    });

    await steps.critical(`Click Delete on ${network.networkCode} - a confirmation prompt is displayed`, async () => {
      dialog = await policyNetworksTab.requestRemove(network.networkCode);
      expect(await dialog.getTitle()).toBe(DIALOG.removeNetwork.title);
    });

    await steps.step('Confirm the deletion - the row is removed from the table', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.policyUnassignNetwork, async () => { await dialog.confirmWithFollowUps(); });
      expect(answer?.status ?? -1, answer?.text.slice(0, 200)).toBe(200);
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.rowOf(network.networkCode).count(), `the row reads "${await policyNetworksTab.readAssignment(network.networkCode)}"`).toBe(0);
    });
  });

  test(`TC-${CASES.payerNetworksOnly.azureId}: should offer only the networks of the policy's payer for linking`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Draft', { networks: 0 });
    const foreign = await activeNetworkOfAnotherPayer(page, policy.payerId);
    blockUnless(testInfo, foreign !== null, 'an active network of another payer', 'no other payer has an active network to compare with');
    const payerNetworks = (await assignableNetworks(page, policy.payerId)).map((n) => n.networkNameEn);

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Network Assignment tab and click Add Network Assignment - the Select Network Assignment list opens', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.isAssignOffered()).toBe(true);
    });

    await steps.step(`Inspect the selectable networks - only the payer's networks are listed, "${foreign!.name}" is not`, async () => {
      const options = await policyNetworksTab.getAssignableOptions();
      expect(options.every((o) => payerNetworks.some((n) => o.includes(n))), `${JSON.stringify(options)} vs the payer's ${JSON.stringify(payerNetworks)}`).toBe(true);
      expect(options.some((o) => o.includes(foreign!.name))).toBe(false);
    });

    await steps.step('Attempt to link a network outside the payer\'s list - it is not selectable and not found', async () => {
      expect((await policyNetworksTab.getAssignableOptions()).some((o) => o.includes(foreign!.name))).toBe(false);
      const direct = await assignPolicyNetwork(page, policy.id, foreign!.id);
      expect(direct.status, direct.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.payerWithoutNetworks.azureId}: should direct the user to Network Management when the payer has no networks`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }, testInfo) => {
    const payerName = await payerWithoutNetworks(page, CASES.payerWithoutNetworks.candidatePayers);
    blockUnless(testInfo, payerName !== null, `a payer the suite can build a policy for with no active network (${CASES.payerWithoutNetworks.candidatePayers.join(', ')})`, 'every candidate payer has an active network');
    const policy = await policyIn('Draft', { payerName: payerName!, networks: 0 });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy and go to the Network Assignment tab - the assignment table is empty', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.countRows()).toBe(0);
    });

    await steps.step('Click Add Network Assignment - the Select Network Assignment list opens', async () => {
      expect(await policyNetworksTab.isAssignOffered()).toBe(true);
    });

    await steps.step('Review the list - it is empty and a message directs the user to assign a network to the payer in Network Management', async () => {
      expect(await policyNetworksTab.getAssignableOptions()).toEqual([]);
      expect(await policyNetworksTab.getPanelHeaderText()).toContain(NOTICE.noNetworkForPayer(payerName!));
    });
  });

  test(`TC-${CASES.searchByCode.azureId}: should show only the assignment matching the Network Code entered in Advance Search`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Draft');
    const second = (await unassignedActiveNetworks(page, policy.payerId, policy.networks))[0];
    blockUnless(testInfo, second !== undefined, `two active networks of "${policy.payerName}" (multiple assignments)`, 'the assign select offers only the network already assigned');
    const code = policy.networks[0].networkCode;
    let drawer!: AdvancedSearchDrawer;

    await steps.critical('Precondition: the policy holds a second network assignment', async () => {
      const linked = await assignPolicyNetwork(page, policy.id, second.id);
      expect(linked.status, linked.text.slice(0, 200)).toBe(200);
    });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Network Assignment tab - several assignments are shown', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.countRows()).toBe(2);
    });

    await steps.step(`Open Advance Search and enter the Network Code ${code} - the field holds the value`, async () => {
      drawer = await policyNetworksTab.openAdvancedSearch();
      await drawer.typeText(POLICY_NETWORK_FILTER_FIELD.code, code);
      expect(await drawer.getValue(POLICY_NETWORK_FILTER_FIELD.code)).toBe(code);
    });

    await steps.step('Click Search - only the assignment with that Network Code is shown', async () => {
      const answered = page.waitForResponse((r) => NETWORKS_LIST.test(new URL(r.url()).pathname)).catch(() => null);
      await drawer.submit();
      await answered;
      const rows = await policyNetworksTab.readRows();
      expect(rows.map((r) => r.code)).toEqual([code]);
    });
  });

  test(`TC-${CASES.combinedFilters.azureId}: should show only the assignments matching Network, Status and Assignment together and the full list after clearing`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Draft');
    const second = (await unassignedActiveNetworks(page, policy.payerId, policy.networks))[0];
    blockUnless(testInfo, second !== undefined, `two active networks of "${policy.payerName}" (assignments with different values)`, 'the assign select offers only the network already assigned');
    const target = policy.networks[0];
    let drawer!: AdvancedSearchDrawer;
    let assignment = '';

    await steps.critical('Precondition: the policy holds a second network assignment', async () => {
      expect((await assignPolicyNetwork(page, policy.id, second.id)).status).toBe(200);
    });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Network Assignment tab - the full assignment list is shown', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.countRows()).toBe(2);
      assignment = await policyNetworksTab.readAssignment(target.networkCode);
    });

    await steps.step(`Open Advance Search and set Network, Status = ${CASES.combinedFilters.status} and Assignment together - the criteria are set`, async () => {
      drawer = await policyNetworksTab.openAdvancedSearch();
      await drawer.typeText(POLICY_NETWORK_FILTER_FIELD.name, target.networkNameEn);
      await drawer.choose(POLICY_NETWORK_FILTER_FIELD.status, CASES.combinedFilters.status);
      await drawer.choose(POLICY_NETWORK_FILTER_FIELD.assignment, assignment);
      expect(await drawer.getValue(POLICY_NETWORK_FILTER_FIELD.name)).toBe(target.networkNameEn);
    });

    await steps.step('Click Search - only the rows matching every criterion are shown', async () => {
      const answered = page.waitForResponse((r) => NETWORKS_LIST.test(new URL(r.url()).pathname)).catch(() => null);
      await drawer.submit();
      await answered;
      const rows = await policyNetworksTab.readRows();
      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({ name: target.networkNameEn, status: CASES.combinedFilters.status, assignment });
    });

    await steps.step('Clear the filters - the full, unfiltered list returns', async () => {
      await clearTabFilters(page, TAB_FILTER.networks, NETWORKS_LIST);
      expect(await policyNetworksTab.countRows()).toBe(2);
      expect(await policyNetworksTab.getChips()).toEqual([]);
    });
  });

  test(`TC-${CASES.columns.azureId}: should display every required column and a Delete action on the network assignment table`, async ({
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Network Assignment tab - the assignment table loads', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Verify the columns ${CASES.columns.headers.join(', ')} - the labels are correct and the data populated`, async () => {
      expect(await policyNetworksTab.getHeaders()).toEqual(expect.arrayContaining([...CASES.columns.headers]));
      for (const row of await policyNetworksTab.readRows()) {
        expect(row.code && row.name && row.status && row.assignment, JSON.stringify(row)).toBeTruthy();
        expect(row.assignedOn).not.toMatch(NOT_ASSIGNED_YET);
      }
    });

    await steps.step('Verify the Delete action in the Actions column of each eligible row - it is visible and clickable', async () => {
      for (const row of await policyNetworksTab.readRows()) {
        expect(await policyNetworksTab.getRemoveAvailability(row.code), row.code).toBe('available');
      }
    });
  });

  test(`TC-${CASES.selectFromList.azureId}: should populate the form with the network chosen from the dropdown`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft', { networks: 0 });
    let options: string[] = [];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Network Assignment tab and click Add Network Assignment - the Select Network Assignment list is displayed', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expect(await policyNetworksTab.isAssignOffered()).toBe(true);
    });

    await steps.critical('Click the list - the available networks are displayed', async () => {
      options = await policyNetworksTab.getAssignableOptions();
      expect(options.length).toBeGreaterThan(0);
    });

    await steps.step('Select a network from the list - the chosen network populates the form field', async () => {
      expect(await chooseNetworkOption(page, options[0])).toContain(options[0].slice(0, 30));
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should keep the network assignment table consistent through mixed adds, deletes and cancelled searches`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    const network = policy.networks[0];
    const findings: string[] = [];
    const note = (what: string, status: number, text: string): void => {
      if (status >= 500 || status === -1) findings.push(`${what} answered ${status} ${text.slice(0, 160)}`);
    };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Interact with Add, Delete, Search and the list in varied sequences - each action is answered consistently', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      const drawer = await policyNetworksTab.openAdvancedSearch();
      await drawer.cancel();
      await policyNetworksTab.search(network.networkCode);
      await policyNetworksTab.search('');
      const removed = await policyNetworksTab.removeNetwork(network.networkCode);
      note('Delete', removed.status, removed.text);
      await policyNetworksTab.open();
      const added = await policyNetworksTab.assign(network.networkNameEn);
      note('Add', added.status, added.text);
      expect(findings).toEqual([]);
    });

    await steps.step('Try rapid consecutive adds / deletes and cancelled searches - no corruption, broken table state or crash', async () => {
      for (let round = 0; round < CASES.exploratory.rounds; round += 1) {
        await policyNetworksTab.open();
        if (await policyNetworksTab.rowOf(network.networkCode).count()) {
          const removed = await policyNetworksTab.removeNetwork(network.networkCode);
          note(`Delete (round ${round + 1})`, removed.status, removed.text);
        }
        await policyNetworksTab.open();
        const added = await policyNetworksTab.assign(network.networkNameEn);
        note(`Add (round ${round + 1})`, added.status, added.text);
        await policyNetworksTab.search('zz-no-such-network');
        await policyNetworksTab.search('');
      }
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      const onScreen = (await policyNetworksTab.readRows()).map((r) => r.code);
      const stored = (await readPolicyNetworks(page, policy.id)).map((n) => n.networkCode);
      if (new Set(onScreen).size !== onScreen.length) findings.push(`duplicate rows on screen: ${onScreen.join(', ')}`);
      if ([...onScreen].sort().join() !== [...stored].sort().join()) findings.push(`screen ${onScreen.join(', ')} vs stored ${stored.join(', ')}`);
      expect(findings).toEqual([]);
    });

    await steps.step('Note any inconsistent or unexpected behaviour - the findings are documented for follow-up', async () => {
      await testInfoAttach(findings);
      expect(findings, 'inconsistencies seen while exploring').toEqual([]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});

/** Attaches the exploratory findings to the report (empty when none). */
async function testInfoAttach(findings: string[]): Promise<void> {
  await test.info().attach('exploration-findings.txt', { body: findings.length ? findings.join('\n') : 'none', contentType: 'text/plain' });
}
