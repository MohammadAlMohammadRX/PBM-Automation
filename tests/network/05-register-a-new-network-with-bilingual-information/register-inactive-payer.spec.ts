import { test, expect } from '../../../fixtures';
import { waitUntilInstant } from '../../../utils/JobClock';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { pendingRequestId, provisionNetwork, readNetwork, type ProvisionedNetwork } from '../../../utils/NetworkProvisioning';
import { networkSnapshot } from '../../../utils/jobDriven/lifecycle';
import { notExercised } from '../../../utils/jobDriven/writerN1Helpers';
import { APPROVE_REQUEST_ENDPOINT } from '../../../data/networks/seedNetworks.data';
import { BUILD_BUDGET, SHOWN } from '../../../data/networks/jobDrivenNetwork.data';
import { AWAITING_APPROVAL, CASES, EFFECTIVE_IN_MINUTES, PERMANENT_CODE } from '../../../data/networks/inactivePayerRegistration.data';

/**
 * User story 14122: Register a new network with bilingual information.
 * Case 17789 - an approved registration whose owning payer is inactive is not
 * activated (see inactivePayerRegistration.data.ts).
 */
test.describe('US 14122 - Registration with an inactive payer', () => {
  test(`TC-${CASES.inactivePayerPending.azureId}: should set an approved registration to Pending rather than Active when its owning payer is inactive`, async ({
    page,
    networkManagementPage,
    inactivePayer,
    steps,
  }, testInfo) => {
    test.setTimeout(BUILD_BUDGET + 10 * 60_000);
    notExercised(testInfo, "The daily job's later decision on this network (US 14129 17845) - the case does not move the job.");
    let network!: ProvisionedNetwork;

    await steps.critical("Navigate to the Network Management module - the 'Register Network' action is offered", async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered(), 'Add Network should be offered').toBe(true);
    });

    await steps.critical('A network with bilingual names, effective today, a pharmacy and the inactive payer is saved as a draft', async () => {
      network = await provisionNetwork(page, { payerName: inactivePayer.nameEn, effectiveInMinutes: EFFECTIVE_IN_MINUTES, draftOnly: true });
      expect(network.stage).toBe('draft');
      expect(network.facilityIds.length, 'a pharmacy is assigned').toBeGreaterThan(0);
      expect((await readNetwork(page, network.id)).payerId, 'owned by the inactive payer').toBeTruthy();
    });

    await steps.critical("'Send for Approval' moves the registration to Pending Approval", async () => {
      const submitted = await NetworkUtils.postAsSession(page, ApiEndpoints.networkSubmit, { networkId: network.id });
      expect(submitted.status, submitted.text.slice(0, 200)).toBeLessThan(300);
      expect(String((await readNetwork(page, network.id)).versionStatusCode ?? '')).toMatch(AWAITING_APPROVAL);
    });

    await steps.step('The reviewer approves it - the approval is processed and a network code is issued', async () => {
      const requestId = await pendingRequestId(page, network.name);
      expect(requestId, 'the registration is in the approval queue').not.toBe('');
      const approved = await NetworkUtils.postAsSession(page, APPROVE_REQUEST_ENDPOINT, { id: requestId });
      expect(approved.status, `approval: ${approved.text.slice(0, 300)}`).toBeLessThan(300);
      expect(String((await readNetwork(page, network.id)).networkCode ?? '')).toMatch(PERMANENT_CODE);
    });

    await steps.step('With its effective time reached the network reads Pending (Future), not Active', async () => {
      await waitUntilInstant(page, new Date((await networkSnapshot(page, network.id)).effectiveDate), 5_000);
      const snapshot = await networkSnapshot(page, network.id);
      expect(snapshot.status, `"${network.name}" owned by the inactive payer`).toBe(SHOWN.future);
    });
  });
});
