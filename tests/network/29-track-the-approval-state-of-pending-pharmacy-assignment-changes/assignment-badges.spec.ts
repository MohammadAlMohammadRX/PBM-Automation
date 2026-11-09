import { test, expect } from '../../../fixtures';
import { readAssignmentBadges } from '../../../utils/jobDriven/writerN1Helpers';
import { BUDGET, CASES, FACILITY_ACTIVE, IN_PROGRESS, PROPOSED, START } from '../../../data/networks/assignmentBadges.data';

/**
 * User story 14307: Track the approval state of pending pharmacy assignment
 * changes. Case 18107 - every assignment status renders with its own label and
 * visual treatment (see assignmentBadges.data.ts).
 */
test.describe('US 14307 - Assignment status badges', () => {
  test(`TC-${CASES.badgesDistinct.azureId}: should render every assignment status with its own complete label and distinct visual treatment`, async ({
    page,
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.twoLiveNetworks);
    const drafted = await networkIn('Pending', { facilityCodes: [START.kept.code, START.removed.code] });
    const pending = await networkIn('Pending', { facilityCodes: [START.kept.code, START.removed.code] });
    const badges: { label: string; tone: string; className: string }[] = [];

    await steps.critical('Navigate to the Network Management module - both networks hold every assignment state', async () => {
      for (const network of [drafted, pending]) {
        await networkDetailPage.open(network.id);
        await networkDetailPage.facilities().open();
        expect((await networkDetailPage.facilities().assign([PROPOSED.code]))?.status).toBeLessThan(300);
        expect((await networkDetailPage.facilities().attemptRemove(START.removed.code)).outcome?.status).toBeLessThan(300);
      }
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(pending.name);
      expect(await networkManagementPage.isListed(pending.name)).toBe(true);
    });

    await steps.step("Opening each network's assigned facilities list displays its rows", async () => {
      for (const network of [drafted, pending]) {
        await networkDetailPage.open(network.id);
        await networkDetailPage.facilities().open();
        expect((await networkDetailPage.facilities().readRows()).length, `"${network.name}" rows`).toBeGreaterThanOrEqual(3);
        badges.push(...(await readAssignmentBadges(page)).filter((b) => b.label !== '' && b.label !== '—'));
      }
    });

    await steps.step('Each checklist status renders with its correct, distinct label and visual treatment', async () => {
      const byLabel = new Map(badges.map((b) => [b.label, `${b.tone}|${b.className}`]));
      expect([...byLabel.keys()].sort(), 'every in-progress label, complete').toEqual([...IN_PROGRESS].sort());
      expect(new Set(byLabel.values()).size, `visual treatments: ${JSON.stringify(Object.fromEntries(byLabel))}`).toBe(IN_PROGRESS.length);
      await networkDetailPage.open(drafted.id);
      await networkDetailPage.facilities().open();
      expect((await networkDetailPage.facilities().findRow(START.kept.code))?.status, 'the approved row').toBe(FACILITY_ACTIVE);
    });
  });
});
