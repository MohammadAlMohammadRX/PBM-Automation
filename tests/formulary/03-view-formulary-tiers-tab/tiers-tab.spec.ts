import { test, expect } from '../../../fixtures';
import type { AdvancedSearchDrawer } from '../../../pages/payer/AdvancedSearchDrawer';
import type { FormularyTierDrawer } from '../../../pages/formulary/FormularyTierDrawer';
import type { TierCard } from '../../../pages/formulary/FormularyTiersTab';
import { MESSAGE, SERVER_MESSAGE, TOAST_TEXT } from '../../../data/formulary/formulary.data';
import { COVERAGE_RANGE, CASES, IN_USE_WARNING, POSITIVE_ORDER } from '../../../data/formulary/tiersTab.data';
import { deleteTier } from '../../../utils/FormularyProvisioning';

/**
 * User story 15193: View Formulary - Tiers tab.
 * Tiers are added, edited and deleted inside the tab and shown as cards (Tier
 * Order, Tier Name EN / AR, Default Coverage %, Description). Names are
 * mandatory and at most 100 characters, the order is positive and unique within
 * the formulary, coverage takes 0-100, and the tab's advanced search filters by
 * tier name and description. Every case builds its own Draft formulary.
 */
test.describe('US 15193 - View Formulary - Tiers tab', () => {
  test(`TC-${CASES.nameAtLimit.azureId}: should save the tier with its full name when the English name is exactly 100 characters`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.nameAtLimit;
    const formulary = await formularyIn('Draft');
    let drawer!: FormularyTierDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary and select the Tiers tab - the Tiers tab is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(formulary.tiers.length);
    });

    await steps.step('Add Tier and enter exactly 100 English characters - the field accepts the full text', async () => {
      drawer = await formularyTiersTab.openAdd();
      await drawer.type('nameEn', data.nameEn);
      expect((await drawer.getValue('nameEn')).length).toBe(100);
    });

    await steps.step('Complete the remaining mandatory fields and save - the tier is saved with the full 100-character name', async () => {
      await drawer.fill({ nameAr: data.nameAr, order: data.order, coverage: data.coverage });
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).map((t) => t.tierNameEn)).toContain(data.nameEn);
    });
  });

  test(`TC-${CASES.nameOverLimit.azureId}: should refuse the tier with a maximum length message when the English name is 101 characters`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.nameOverLimit;
    const formulary = await formularyIn('Draft');
    let drawer!: FormularyTierDrawer;
    let typed = '';

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary and select the Tiers tab - the Tiers tab is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(formulary.tiers.length);
    });

    await steps.step('Add Tier and enter 101 characters - the field prevents further input or flags the value as too long', async () => {
      drawer = await formularyTiersTab.openAdd();
      await drawer.type('nameEn', data.nameEn);
      typed = await drawer.getValue('nameEn');
      const flagged = await drawer.getFieldError('nameEn');
      expect(typed.length <= 100 || MESSAGE.maxLength.test(flagged), `typed ${typed.length} characters, error "${flagged}"`).toBe(true);
    });

    await steps.step('Attempt to save - saving is blocked with a maximum length validation message', async () => {
      await drawer.fill({ nameAr: data.nameAr, order: data.order, coverage: data.coverage });
      const answer = await drawer.attemptSave();
      expect(answer.status, 'a 101-character name must not be saved').not.toBe(200);
      expect(answer.messages.join(' | ')).toMatch(MESSAGE.maxLength);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).some((t) => t.tierNameEn.length > 100)).toBe(false);
    });
  });

  test(`TC-${CASES.addGeneric.azureId}: should show the new tier as a card with every entered value when a coverage tier is added`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const tier = CASES.addGeneric.tier;
    const formulary = await formularyIn('Draft', { tiers: 0 });

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary and select the Tiers tab - the current list of tier cards is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(0);
    });

    await steps.step('Add Tier with order 1, "Generic", "جنيسة", coverage 80 and a description, then save - the tier is saved', async () => {
      const drawer = await formularyTiersTab.openAdd();
      await drawer.fill({ order: tier.order, nameEn: tier.nameEn, nameAr: tier.nameAr, coverage: tier.coverage, descriptionEn: tier.descriptionEn });
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.tierCreated);
    });

    await steps.step('Review the Tiers tab - a new card shows Tier Order, names, Default Coverage % and Description as entered', async () => {
      const card = await formularyTiersTab.readCard(await formularyTiersTab.tierIdByName(tier.nameEn));
      expect(card.order).toContain(String(tier.order));
      expect(card.nameEn).toContain(tier.nameEn);
      expect(card.nameAr).toContain(tier.nameAr);
      expect(card.coverage).toContain(String(tier.coverage));
      expect(card.description).toContain(tier.descriptionEn);
    });
  });

  test(`TC-${CASES.namesRequired.azureId}: should refuse the tier and flag the missing name when either the English or the Arabic name is blank`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.namesRequired;
    const formulary = await formularyIn('Draft');
    let drawer!: FormularyTierDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary and select the Tiers tab - the Tiers tab is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(formulary.tiers.length);
    });

    await steps.step('Leave Tier Name (EN) blank, fill the Arabic name and save - saving is blocked and the English name is flagged as required', async () => {
      drawer = await formularyTiersTab.openAdd();
      await drawer.fill({ nameAr: data.nameAr, order: data.order, coverage: data.coverage });
      const answer = await drawer.attemptSave();
      expect(answer.status, 'nothing may be saved without the English name').not.toBe(200);
      expect(await drawer.getFieldError('nameEn')).toMatch(MESSAGE.required);
    });

    await steps.step('Fill the English name, leave the Arabic name blank and save - saving is blocked and the Arabic name is flagged as required', async () => {
      await drawer.fill({ nameEn: data.nameEn, nameAr: '' });
      const answer = await drawer.attemptSave();
      expect(answer.status, 'nothing may be saved without the Arabic name').not.toBe(200);
      expect(await drawer.getFieldError('nameAr')).toMatch(MESSAGE.required);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).map((t) => t.tierNameEn)).not.toContain(data.nameEn);
    });
  });

  test(`TC-${CASES.orderPositive.azureId}: should refuse a tier order of zero or a negative number and accept a positive one`, async ({
    page,
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.orderPositive;
    const formulary = await formularyIn('Draft', { tiers: 0 });
    let drawer!: FormularyTierDrawer;
    let zeroMessage = '';

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary and select the Tiers tab - the Tiers tab is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(0);
    });

    await steps.step('Add Tier with Tier Order 0 and the other mandatory fields, then save - the order is rejected as it must be positive', async () => {
      drawer = await formularyTiersTab.openAdd();
      await drawer.fill({ nameEn: data.nameEn, nameAr: data.nameAr, coverage: data.coverage, order: data.invalid[0] });
      const answer = await drawer.attemptSave();
      zeroMessage = (await drawer.getFieldError('order')) || answer.messages.join(' | ');
      expect(answer.status, 'order 0 must not be saved').not.toBe(200);
      expect(zeroMessage).toMatch(POSITIVE_ORDER);
    });

    // A save that went through closes the drawer; the next attempt opens it again.
    const drawerWith = async (order: number): Promise<void> => {
      if (!(await drawer.isOpen())) {
        drawer = await formularyTiersTab.openAdd();
        await drawer.fill({ nameEn: `${data.nameEn} ${order}`, nameAr: data.nameAr, coverage: data.coverage, order });
      } else {
        await drawer.type('order', order);
      }
    };

    await steps.step('Enter Tier Order -1 and save - the order is rejected with the same validation message', async () => {
      await drawerWith(data.invalid[1]);
      const value = await drawer.getValue('order');
      if (value.includes('-')) {
        const answer = await drawer.attemptSave();
        expect(answer.status, 'order -1 must not be saved').not.toBe(200);
        expect((await drawer.getFieldError('order')) || answer.messages.join(' | ')).toBe(zeroMessage);
      } else {
        expect(value, 'the order field refused the minus sign').not.toBe(String(data.invalid[1]));
      }
      expect((await formularyTiersTab.fetchTiers(formulary.id)).filter((t) => t.tierOrder <= 0)).toEqual([]);
    });

    await steps.step('Enter Tier Order 1 and save - the positive order is accepted and the tier is saved', async () => {
      // A tier the app wrongly saved in step 3 holds order 1 (the 0 is stored as
      // 1), so order 1 answered 409 "must be unique" (2026-11-02). Step 3 already
      // reports that; it is removed here so this step tests order 1 on its own.
      for (const tier of await formularyTiersTab.fetchTiers(formulary.id)) {
        if (tier.tierNameEn === data.nameEn) await deleteTier(page, tier.id);
      }
      await drawerWith(data.valid);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).map((t) => t.tierOrder)).toContain(data.valid);
    });
  });

  test(`TC-${CASES.orderUnique.azureId}: should refuse a second tier with the same order and accept a unique one in the same formulary`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.orderUnique;
    const formulary = await formularyIn('Draft');
    let drawer!: FormularyTierDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - an existing tier with Order 1 is shown', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect((await formularyTiersTab.readCards()).map((c) => c.order.replace(/\D/g, ''))).toContain(String(data.duplicate));
    });

    await steps.step('Add Tier with Tier Order 1 (duplicate) and save - the save is rejected with a message that the order must be unique', async () => {
      drawer = await formularyTiersTab.openAdd();
      await drawer.fill({ nameEn: data.nameEn, nameAr: data.nameAr, coverage: data.coverage, order: data.duplicate });
      const answer = await drawer.attemptSave();
      expect(answer.status, 'a duplicate order must be refused').not.toBe(200);
      expect(answer.messages.join(' | ')).toContain(SERVER_MESSAGE.tierOrderUnique);
    });

    await steps.step('Change Tier Order to 2 and save - the tier is accepted and saved', async () => {
      await drawer.type('order', data.unique);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).map((t) => t.tierOrder).sort()).toEqual([data.duplicate, data.unique]);
    });
  });

  test(`TC-${CASES.coverageRange.azureId}: should accept a default coverage of 0 and 100 and reject -1 and 101`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.coverageRange;
    const formulary = await formularyIn('Draft', { tiers: 0 });

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary and select the Tiers tab - the Tiers tab is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(0);
    });

    for (const [index, coverage] of data.valid.entries()) {
      await steps.step(`Add a tier with Default Coverage % = ${coverage} and save - the tier is saved with ${coverage}% coverage`, async () => {
        const drawer = await formularyTiersTab.openAdd();
        await drawer.fill({ nameEn: `Coverage ${coverage} Tier`, nameAr: data.nameAr, order: index + 1, coverage });
        const answer = await drawer.attemptSave();
        expect(answer.status, answer.messages.join(' | ')).toBe(200);
        expect((await formularyTiersTab.fetchTiers(formulary.id)).find((t) => t.tierNameEn === `Coverage ${coverage} Tier`)?.defaultCoveragePercentage).toBe(coverage);
      });
    }

    await steps.step('Attempt a tier with Default Coverage % = -1, then 101 - both are rejected with a 0-100 validation message', async () => {
      const outcomes: string[] = [];
      for (const [index, coverage] of data.invalid.entries()) {
        const drawer = await formularyTiersTab.openAdd();
        await drawer.fill({ nameEn: `Coverage ${coverage} Tier`, nameAr: data.nameAr, order: 3 + index, coverage });
        const value = await drawer.getValue('coverage');
        if (value !== String(coverage)) {
          // The field would not take the value (it drops the minus sign and caps
          // at 100, 2026-11-02): an out-of-range coverage cannot be entered at all.
          outcomes.push(`${coverage}: the field would not take it (shows "${value}")`);
          await drawer.cancel();
          continue;
        }
        const answer = await drawer.attemptSave();
        const message = (await drawer.getFieldError('coverage')) || answer.messages.join(' | ');
        outcomes.push(`${coverage}: typed "${value}", answered ${answer.status}, "${message}"`);
        expect(answer.status, `coverage ${coverage} must not be saved (${outcomes.join('; ')})`).not.toBe(200);
        expect(message, `coverage ${coverage} must be refused with a range message`).toMatch(COVERAGE_RANGE);
        if (await drawer.isOpen()) await drawer.cancel();
      }
      expect((await formularyTiersTab.fetchTiers(formulary.id)).every((t) => t.defaultCoveragePercentage >= 0 && t.defaultCoveragePercentage <= 100)).toBe(true);
    });
  });

  test(`TC-${CASES.editCoverage.azureId}: should show the new coverage on the card and keep every other value when a tier is edited`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.editCoverage;
    const formulary = await formularyIn('Draft', { tiers: [{ nameEn: 'Automation Tier 1', nameAr: 'مستوى الأتمتة 1', order: 1, coverage: data.from, descriptionEn: 'Edited by a case' }] });
    const tierId = formulary.tiers[0].id;
    let before!: TierCard;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the existing tier card is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      before = await formularyTiersTab.readCard(tierId);
      expect(before.nameEn).toContain('Automation Tier 1');
    });

    await steps.step('Edit the tier card, change Default Coverage % from 80 to 90 and save - the update is accepted and saved', async () => {
      const drawer = await formularyTiersTab.openEdit(tierId);
      await drawer.type('coverage', data.to);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.tierUpdated);
    });

    await steps.step('Review the tier card - it shows 90% while every other field is unchanged', async () => {
      const after = await formularyTiersTab.readCard(tierId);
      expect(after.coverage).toContain(String(data.to));
      expect({ order: after.order, nameEn: after.nameEn, nameAr: after.nameAr, description: after.description })
        .toEqual({ order: before.order, nameEn: before.nameEn, nameAr: before.nameAr, description: before.description });
    });
  });

  test(`TC-${CASES.deleteUnused.azureId}: should remove the tier from the list when an unused tier is deleted`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { tiers: [{ nameEn: 'Automation Tier 1', nameAr: 'مستوى الأتمتة 1', order: 1, coverage: 80 }, CASES.deleteUnused.unused] });
    const unused = formulary.tiers.find((t) => t.tierNameEn === CASES.deleteUnused.unused.nameEn);
    let answer = { status: -1, text: '', messages: [] as string[] };

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the existing tier card is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(unused, 'the unused tier was provisioned').toBeDefined();
      expect(await formularyTiersTab.card(unused?.id ?? '').isVisible()).toBe(true);
    });

    await steps.step('Delete the tier card and confirm - the deletion is processed', async () => {
      answer = await formularyTiersTab.deleteTier(unused?.id ?? '');
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
    });

    await steps.step('Review the Tiers tab - the deleted tier card no longer appears', async () => {
      await expect(formularyTiersTab.card(unused?.id ?? '')).toBeHidden();
      expect((await formularyTiersTab.fetchTiers(formulary.id)).map((t) => t.id)).not.toContain(unused?.id);
    });
  });

  test(`TC-${CASES.warnInUse.azureId}: should warn that the tier is in use and refuse the deletion when trades are linked to it`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const tierId = formulary.tiers[0].id;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the tier card with linked trades is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect((await formularyTiersTab.fetchTiers(formulary.id)).find((t) => t.id === tierId)?.tradeCount).toBeGreaterThan(0);
    });

    await steps.step('Select Delete on the tier with trades - a warning that the tier is in use is shown', async () => {
      const dialog = await formularyTiersTab.requestDelete(tierId);
      const prompt = `${await dialog.getTitle()} ${await dialog.getMessage()}`;
      await dialog.cancel();
      expect(prompt).toMatch(IN_USE_WARNING);
    });

    await steps.step('Click delete - the deletion is prevented with "A tier cannot be deleted while trades are assigned to it."', async () => {
      const answer = await formularyTiersTab.deleteTier(tierId);
      expect(answer.status, 'the deletion must be refused').not.toBe(200);
      expect(`${answer.messages.join(' | ')} ${answer.text}`).toContain(SERVER_MESSAGE.tierInUse);
      expect((await formularyTiersTab.fetchTiers(formulary.id)).map((t) => t.id)).toContain(tierId);
    });
  });

  test(`TC-${CASES.tierNameSearch.azureId}: should show only what belongs to tiers matching the name when the tier name filter is applied`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.tierNameSearch;
    const formulary = await formularyIn('Draft', { tiers: [...data.tiers] });
    let drawer!: AdvancedSearchDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the Tiers tab is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(data.tiers.length);
    });

    await steps.step('Open the Advanced Search and enter the tier name "Generic" - the input is accepted', async () => {
      drawer = await formularyTiersTab.openAdvancedSearch();
      await drawer.typeText('name', data.term);
      expect(await drawer.getValue('name')).toBe(data.term);
    });

    await steps.step('Apply the search - only what belongs to tiers matching "Generic" is displayed', async () => {
      await drawer.submit();
      await expect.poll(async () => (await formularyTiersTab.readCards()).map((c) => c.nameEn), { message: 'only the Generic tier should remain' })
        .toEqual([expect.stringContaining(data.term)]);
    });
  });

  test(`TC-${CASES.descriptionSearch.azureId}: should show only tiers whose description matches when the description filter is applied`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.descriptionSearch;
    const formulary = await formularyIn('Draft', { tiers: [...data.tiers] });
    let drawer!: AdvancedSearchDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the Tiers tab is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(data.tiers.length);
    });

    await steps.step('Open the tier Advanced Search and enter a keyword from a tier description - the input is accepted', async () => {
      drawer = await formularyTiersTab.openAdvancedSearch();
      await drawer.typeText('description', data.term);
      expect(await drawer.getValue('description')).toBe(data.term);
    });

    await steps.step('Apply the search - only tiers whose description matches "specialist" are displayed', async () => {
      await drawer.submit();
      await expect.poll(async () => (await formularyTiersTab.readCards()).map((c) => c.description.toLowerCase()), { message: 'only the tier described as specialist should remain' })
        .toEqual([expect.stringContaining(data.term)]);
    });
  });

  test(`TC-${CASES.cardFormat.azureId}: should show every required field on every tier card in the correct format`, async ({
    formularyManagementPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.cardFormat;
    const formulary = await formularyIn('Draft', { tiers: [...data.tiers] });
    let cards: Awaited<ReturnType<typeof formularyTiersTab.readCards>> = [];

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the list of tier cards is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      cards = await formularyTiersTab.readCards();
      expect(cards).toHaveLength(data.tiers.length);
    });

    await steps.step('Check each card for Tier Order, Tier Name (EN) and Tier Name (AR) - all three are populated on every card', async () => {
      for (const tier of data.tiers) {
        const card = cards.find((c) => c.nameEn.includes(tier.nameEn));
        expect(card, `a card for "${tier.nameEn}"`).toBeDefined();
        expect(card?.order).toContain(String(tier.order));
        expect(card?.nameAr).toContain(tier.nameAr);
      }
    });

    await steps.step('Check each card for Default Coverage % and Description - coverage carries a % symbol and the description shows or is blank', async () => {
      for (const tier of data.tiers) {
        const card = cards.find((c) => c.nameEn.includes(tier.nameEn));
        expect(card?.coverage, `coverage of "${tier.nameEn}"`).toMatch(new RegExp(`${tier.coverage}(\\.0+)?\\s*%`));
        if ('descriptionEn' in tier) expect(card?.description).toContain(tier.descriptionEn);
        else expect(card?.description ?? '', 'no description was given').toMatch(/^(|—|-|N\/A)$/);
      }
    });
  });

  test(`TC-${CASES.rapidChanges.azureId}: should list exactly the final tiers after two tiers are added, one edited and the other deleted in quick succession`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.rapidChanges;
    const formulary = await formularyIn('Draft', { tiers: 0 });

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the Tiers tab is displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(0);
    });

    await steps.step('Quickly add two tiers, edit one and delete the other - each action is processed without errors', async () => {
      const statuses: number[] = [];
      for (const tier of [data.first, data.second]) {
        const drawer = await formularyTiersTab.openAdd();
        await drawer.fill(tier);
        statuses.push((await drawer.attemptSave()).status);
      }
      const editor = await formularyTiersTab.openEdit(await formularyTiersTab.tierIdByName(data.first.nameEn));
      await editor.type('coverage', data.editedCoverage);
      statuses.push((await editor.attemptSave()).status);
      statuses.push((await formularyTiersTab.deleteTier(await formularyTiersTab.tierIdByName(data.second.nameEn))).status);
      expect(statuses).toEqual([200, 200, 200, 200]);
    });

    await steps.step('Refresh the Tiers tab - exactly the edited tier is listed and the deleted one is absent', async () => {
      await formularyDetailPage.reload();
      await formularyTiersTab.open();
      const cards = await formularyTiersTab.readCards();
      expect(cards.map((c) => c.nameEn)).toEqual([expect.stringContaining(data.first.nameEn)]);
      expect(cards[0]?.coverage).toContain(String(data.editedCoverage));
    });
  });
});
