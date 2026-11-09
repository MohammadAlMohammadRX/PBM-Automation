import { test, expect } from '../../../fixtures';
import { requireJobSeed } from '../../../utils/jobDriven/jobSeeds';
import { changeNetworkExpiry, networkSnapshot } from '../../../utils/jobDriven/lifecycle';
import { notExercised, seedTrail } from '../../../utils/jobDriven/writerN1Helpers';
import { PENDING_APPROVAL_CELL, PURPOSE, READ_SEED_BUDGET, SHOWN } from '../../../data/networks/jobDrivenNetwork.data';
import { CASES, EXTENDED_EXPIRY_DAYS } from '../../../data/networks/expiredPendingExtension.data';

/**
 * User story 14309: Reactivate an expired network when its expiry date is
 * extended. Case 18131 - the network stays Expired while the extending edit
 * awaits approval (see expiredPendingExtension.data.ts).
 */
test.describe('US 14309 - Expired while an extension is pending', () => {
  test(`TC-${CASES.expiredWhilePending.azureId}: should keep a network Expired while an edit extending its expiry date awaits approval`, async ({
    page,
    networkManagementPage,
    networkDetailPage,
    steps,
  }, testInfo) => {
    test.setTimeout(READ_SEED_BUDGET + 5 * 60_000);
    const seed = await requireJobSeed(page, testInfo, PURPOSE.expiredExtend, { exclusive: true });
    notExercised(testInfo, "A daily job run AFTER the case's own unapproved edit - the case does not move the job; the status after the edit is asserted.");

    await steps.critical('Navigate to the Network Management module - the list of networks loads', async () => {
      expect(await networkManagementPage.isListed(seed.name), `"${seed.name}" should be listed`).toBe(true);
    });

    await steps.step('The Expired network opens reading Expired', async () => {
      expect(seed.now?.status, seedTrail(seed)).toBe(SHOWN.expired);
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });

    await steps.critical("An edit extending the expiry is submitted but not approved - Pending Approval, the network's status unchanged", async () => {
      const extended = new Date(Date.now() + EXTENDED_EXPIRY_DAYS * 86_400_000);
      const edit = await changeNetworkExpiry(page, { id: seed.id, name: seed.name }, extended, { approve: false });
      expect(edit.update.status, `the edit should save: ${edit.update.text.slice(0, 200)}`).toBeLessThan(300);
      expect(edit.submitted, 'sent for approval').toBe(true);
      await networkManagementPage.openList();
      await networkManagementPage.search(seed.name);
      await networkManagementPage.expectApprovalCell(seed.name, PENDING_APPROVAL_CELL);
      expect((await networkSnapshot(page, seed.id)).status).toBe(SHOWN.expired);
    });

    await steps.step('Reopened while the edit is pending, the record reads Expired', async () => {
      await networkDetailPage.open(seed.id);
      await networkDetailPage.expectStatus(SHOWN.expired);
    });

    await steps.step('With the edit still unapproved the status is unchanged', async () => {
      const now = await networkSnapshot(page, seed.id);
      expect(now.status, 'recalculation happens only on approval').toBe(SHOWN.expired);
      expect(now.hasPendingVersion, 'the extension is still awaiting approval').toBe(true);
    });
  });
});
