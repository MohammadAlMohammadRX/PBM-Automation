import { expect } from '../../../fixtures';
import { SCOPED_PAYER } from '../../../data/formulary/formularyPermissions.data';
import { test } from '../../../utils/formulary/writerCHelpers';
import { FormularyDetailPage } from '../../../pages/formulary/FormularyDetailPage';
import { FormularyManagementPage } from '../../../pages/formulary/FormularyManagementPage';
import { FormularyTiersTab } from '../../../pages/formulary/FormularyTiersTab';
import { DIALOG_TITLE, SERVER_MESSAGE } from '../../../data/formulary/formulary.data';
import { BLOCKED_CASES, CASES, EXPIRED_TRADE_REASON, IN_USE, SUSPENDED } from '../../../data/formulary/tierDeletionBlockers.data';
import { deleteTier, deleteTrade, readTiers } from '../../../utils/FormularyProvisioning';
import { addTradesToTiers, blockRemainingSteps, isoDaysAfter, requireDone, signInWithFormularyRights } from '../../../utils/formulary/writerBHelpers';

/**
 * User story 15195: Prevent deletion of tiers that are currently used.
 * Deleting a tier is blocked while any trade references it, whatever that
 * trade's status, with a message saying why; a tier nobody references is
 * deleted. Every case builds its own Draft formulary.
 */
test.describe('US 15195 - Prevent deletion of tiers that are currently used', () => {
  test(`TC-${CASES.deleteUnused.azureId}: should remove the tier after confirmation when no trade references it`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { tiers: 2 });
    const unused = formulary.tiers.find((t) => t.tradeCount === 0) ?? formulary.tiers[1];
    let answer = { status: -1, text: '', messages: [] as string[] };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the tier management list - the list of tiers displays', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(2);
    });

    await steps.step('Select the unused tier and choose Delete - a confirmation prompt appears', async () => {
      const dialog = await formularyTiersTab.requestDelete(unused.id);
      expect(await dialog.getTitle()).toBe(DIALOG_TITLE.deleteTier);
      await dialog.cancel();
    });

    await steps.step('Confirm the deletion - the tier is removed from the list', async () => {
      answer = await formularyTiersTab.deleteTier(unused.id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      await expect(formularyTiersTab.card(unused.id)).toBeHidden();
    });
  });

  test(`TC-${CASES.activeReference.azureId}: should block the deletion and keep the tier when an active trade references it`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const tier = formulary.tiers[0];
    let answer = { status: -1, text: '', messages: [] as string[] };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Locate the tier referenced by an active trade - the tier is listed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.card(tier.id).isVisible()).toBe(true);
      expect(formulary.trades[0]?.tierId).toBe(tier.id);
    });

    await steps.step('Attempt to delete the tier - the system checks for referencing trades', async () => {
      answer = await formularyTiersTab.deleteTier(tier.id);
      expect(answer.status, 'the deletion request should be answered').toBeGreaterThan(0);
    });

    await steps.step('Review the result - the deletion is blocked with an explanatory message and the tier remains', async () => {
      expect(answer.status, 'the deletion must be refused').not.toBe(200);
      expect(`${answer.messages.join(' | ')} ${answer.text}`).toMatch(IN_USE);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).map((t) => t.id)).toContain(tier.id);
    });
  });

  test(`TC-${CASES.singleReference.azureId}: should block the deletion when exactly one trade references the tier`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const tier = formulary.tiers[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Locate the tier referenced by exactly one trade - the tier shows its single reference', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.card(tier.id).isVisible()).toBe(true);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).find((t) => t.id === tier.id)?.tradeCount).toBe(1);
    });

    await steps.step('Attempt to delete the tier - the reference is detected and the deletion is blocked', async () => {
      const answer = await formularyTiersTab.deleteTier(tier.id);
      expect(answer.status, 'one referencing trade must block the deletion').not.toBe(200);
      expect(`${answer.messages.join(' | ')} ${answer.text}`).toMatch(IN_USE);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).map((t) => t.id)).toContain(tier.id);
    });
  });

  test(`TC-${CASES.zeroReferences.azureId}: should delete the tier without blocking when no trade references it`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { tiers: 2 });
    const unused = formulary.tiers.find((t) => t.tradeCount === 0) ?? formulary.tiers[1];

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Locate the tier with no referencing trades - the tier shows zero references', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.card(unused.id).isVisible()).toBe(true);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).find((t) => t.id === unused.id)?.tradeCount).toBe(0);
    });

    await steps.step('Delete the tier - the deletion proceeds', async () => {
      const answer = await formularyTiersTab.deleteTier(unused.id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).map((t) => t.id)).not.toContain(unused.id);
    });
  });

  test(`TC-${CASES.everyStatus.azureId}: should block the deletion of every tier whatever the status of the trade referencing it`, async ({
    page,
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Draft', { tiers: 3, trades: 0 });
    const [active, inactive, pending] = [...formulary.tiers].sort((a, b) => a.tierOrder - b.tierOrder);
    await requireDone(testInfo, 'trades of every status in their own tiers', () => addTradesToTiers(page, formulary.id, [
      { trade: 0, tierId: active.id },
      { trade: 1, tierId: inactive.id, suspend: true },
      { trade: 2, tierId: pending.id, effectiveFrom: isoDaysAfter(formulary.effectiveDate, CASES.everyStatus.pendingAfterDays) },
    ]));
    /** Attempts the deletion on the card; returns the answer's status and whether the tier is still there and the message names its use. */
    const attempt = async (tierId: string): Promise<{ status: number; kept: boolean; explained: boolean }> => {
      const answer = await formularyTiersTab.deleteTier(tierId);
      return {
        status: answer.status,
        kept: (await readTiers(page, formulary.id)).some((t) => t.id === tierId),
        explained: IN_USE.test(`${answer.messages.join(' | ')} ${answer.text}`),
      };
    };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(3);
    });

    await steps.step('Attempt to delete the tier referenced by the active trade - deletion is blocked', async () => {
      const outcome = await attempt(active.id);
      expect(outcome.status, 'the deletion must be refused').not.toBe(200);
      expect({ kept: outcome.kept, explained: outcome.explained }).toEqual({ kept: true, explained: true });
    });

    await steps.step('Attempt to delete the tier referenced by the inactive trade - deletion is blocked', async () => {
      const outcome = await attempt(inactive.id);
      expect(outcome.status, 'the deletion must be refused').not.toBe(200);
      expect({ kept: outcome.kept, explained: outcome.explained }).toEqual({ kept: true, explained: true });
    });

    await steps.step('Attempt to delete the tier referenced by the pending trade - deletion is blocked', async () => {
      const outcome = await attempt(pending.id);
      expect(outcome.status, 'the deletion must be refused').not.toBe(200);
      expect({ kept: outcome.kept, explained: outcome.explained }).toEqual({ kept: true, explained: true });
    });

    await steps.step('Attempt to delete the tier referenced by the expired trade - deletion is blocked', async () => {
      expect(await formularyTiersTab.countCards(), 'the three referenced tiers are still listed').toBe(3);
      blockRemainingSteps(steps, EXPIRED_TRADE_REASON);
    });
  });

  test(`TC-${CASES.becameInactive.azureId}: should keep the deletion blocked after the referencing trade becomes inactive`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const tier = formulary.tiers[0];
    const trade = formulary.trades[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Change the referencing trade from Active to Inactive - the trade status updates to Inactive', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const answer = await formularyTradesTab.toggleStatus(trade.id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      await expect.poll(async () => (await formularyTradesTab.readCard(trade.id)).status).toMatch(SUSPENDED);
    });

    await steps.step('Attempt to delete the tier referenced by the now-inactive trade - the deletion stays blocked', async () => {
      await formularyTiersTab.open();
      const answer = await formularyTiersTab.deleteTier(tier.id);
      expect(answer.status, 'the deletion must be refused').not.toBe(200);
      expect(`${answer.messages.join(' | ')} ${answer.text}`).toMatch(IN_USE);
    });
  });

  test(`TC-${CASES.explainBlock.azureId}: should explain that the tier is in use when its deletion is blocked`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const tier = formulary.tiers[0];
    let answer = { status: -1, text: '', messages: [] as string[] };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.card(tier.id).isVisible()).toBe(true);
    });

    await steps.step('Attempt to delete the referenced tier - the deletion is blocked', async () => {
      answer = await formularyTiersTab.deleteTier(tier.id);
      expect(answer.status, 'the deletion must be refused').not.toBe(200);
    });

    await steps.step('Review the message - "A tier cannot be deleted while trades are assigned to it"', async () => {
      expect(answer.messages.join(' | ')).toContain(SERVER_MESSAGE.tierInUse);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should withhold tier deletion from a user without the tier deletion permission`, async ({
    page,
    formularyIn,
    formularyRole,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 2 });
    const unused = formulary.tiers.find((t) => t.tradeCount === 0) ?? formulary.tiers[1];
    const session = await signInWithFormularyRights(formularyRole, { lacking: ['deleteTier'] });
    const list = new FormularyManagementPage(session.page);
    const detail = new FormularyDetailPage(session.page);
    const tiers = new FormularyTiersTab(session.page);

    await steps.critical('Navigate to the Formulary Management module - the module loads for the user', async () => {
      await list.openExpectingDenial();
      expect(await list.getPageText(), 'the application should render for the user').not.toBe('');
    });

    await steps.step('Attempt to reach the Delete option of a tier as the unauthorized user - it is disabled or not visible', async () => {
      await detail.openExpectingFailure(formulary.id);
      if (await detail.isLoaded()) await tiers.open().catch(() => undefined);
      expect(await tiers.getCardActionAvailability(unused.id, 'delete')).not.toBe('available');
      const direct = await deleteTier(session.page, unused.id);
      expect(direct.status, `a direct DeleteTier answered ${direct.status}`).toBeGreaterThanOrEqual(400);
      expect((await readTiers(page, formulary.id)).map((t) => t.id), 'the tier must still exist').toContain(unused.id);
    });
  });

  test(`TC-${CASES.otherPath.azureId}: should block the deletion of a referenced tier through the alternate deletion path too`, async ({
    page,
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const tier = formulary.tiers[0];
    let answer = { status: -1, text: '' };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Attempt to delete the referenced tier through the alternate path (a direct DeleteTier request) - the request is processed', async () => {
      answer = await deleteTier(page, tier.id);
      expect(answer.status, 'the request should be answered').toBeGreaterThan(0);
    });

    await steps.step('Review the result - the deletion is blocked as it is on the card', async () => {
      expect(answer.status, 'the deletion must be refused').toBeGreaterThanOrEqual(400);
      expect(answer.text).toContain(SERVER_MESSAGE.tierInUse);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.card(tier.id).isVisible()).toBe(true);
    });
  });

  test(`TC-${CASES.checklist.azureId}: should block the deletion for one reference, several references and references of mixed statuses`, async ({
    page,
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Draft', { tiers: 2, trades: 0 });
    const [single, multiple] = [...formulary.tiers].sort((a, b) => a.tierOrder - b.tierOrder);
    await requireDone(testInfo, 'one tier with one trade and one with two of mixed statuses', () => addTradesToTiers(page, formulary.id, [
      { trade: 0, tierId: single.id },
      { trade: 1, tierId: multiple.id },
      { trade: 2, tierId: multiple.id, suspend: true },
    ]));

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(2);
    });

    await steps.step('Check deletion with one reference, several references and mixed-status references - each is blocked', async () => {
      const outcomes: string[] = [];
      for (const [label, tier] of [['one reference', single], ['two references, one suspended', multiple]] as const) {
        const answer = await formularyTiersTab.deleteTier(tier.id);
        outcomes.push(`${label}: ${answer.status}`);
        expect(answer.status, outcomes.join('; ')).not.toBe(200);
      }
      expect((await readTiers(page, formulary.id)).map((t) => t.tradeCount).sort()).toEqual([1, 2]);
    });
  });

  test(`TC-${CASES.becomesDeletable.azureId}: should allow the deletion once the only referencing trade is removed`, async ({
    page,
    formularyManagementPage,
    formularyTiersTab,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const tier = formulary.tiers[0];
    let answer = { status: -1, text: '', messages: [] as string[] };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Remove the trade that references the tier - the trade no longer references it', async () => {
      const removed = await deleteTrade(page, formulary.trades[0].id);
      expect(removed.status, removed.text.slice(0, 300)).toBe(200);
      expect((await readTiers(page, formulary.id)).find((t) => t.id === tier.id)?.tradeCount).toBe(0);
    });

    await steps.step('Attempt to delete the tier - the references are re-evaluated', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      answer = await formularyTiersTab.deleteTier(tier.id);
      expect(answer.status, `${answer.text.slice(0, 300)} ${answer.messages.join(' | ')}`).toBe(200);
    });

    await steps.step('Refresh the tier list - the tier deletion has succeeded', async () => {
      await formularyDetailPage.reload();
      await formularyTiersTab.open();
      await expect(formularyTiersTab.card(tier.id)).toBeHidden();
      expect((await readTiers(page, formulary.id)).map((t) => t.id)).not.toContain(tier.id);
    });
  });

  test(`TC-${CASES.deleteHiddenAfterBlock.azureId}: should stop offering Delete on a tier whose deletion was just blocked`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const tier = formulary.tiers[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.card(tier.id).isVisible()).toBe(true);
    });

    await steps.step('Attempt to delete the referenced tier - the Delete button is no longer displayed for the blocked tier', async () => {
      const answer = await formularyTiersTab.deleteTier(tier.id);
      expect(answer.status, 'the deletion must be refused').not.toBe(200);
      expect(await formularyTiersTab.getCardActionAvailability(tier.id, 'delete')).toBe('absent');
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
