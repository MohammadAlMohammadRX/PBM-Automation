import { test, expect } from '../../../fixtures';
import { formularyCode } from '../../../data/plans/assignPlanFormulary.data';
import {
  APPROVER_NAME,
  BADGE,
  BLOCKED_CASES,
  CASE,
  DATE_TIME,
  SUITE_PAYER,
  TAB_LABEL,
  tierText,
  tradeText,
  versionAttribution,
} from '../../../data/plans/planFormularyHistory.data';

/**
 * User story 14327: View formulary assignment history for a plan.
 * The Formulary Assignment tab as the plan's formulary history: every
 * formulary ever assigned, per version, with tier / trade counts, who assigned
 * it and when, the live one marked - and its label in both languages.
 *
 * Histories are built by approved formulary changes (`planWithFormularyHistory`).
 */
test.describe('US 14327 - Formulary assignment history', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASE.completeHistory}: should list every formulary the plan has ever had when the history opens`, async ({
    planManagementPage,
    planDetailPage,
    suitePayerFormularies,
    planWithFormularyHistory,
    steps,
  }) => {
    const formularies = await suitePayerFormularies(3);
    const plan = await planWithFormularyHistory(formularies);
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan V and select the formulary history tab - the history view opens', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.readAssignmentCards()).length).toBeGreaterThan(0);
    });

    await steps.step('Review the entries - F1, F2 and F3 are all listed', async () => {
      const text = (await tab.readAssignmentCards()).map((card) => card.text).join(' | ');
      for (const formulary of formularies) expect(text, `${formularyCode(formulary)} in the history`).toContain(formularyCode(formulary));
    });
  });

  test(`TC-${CASE.entryDetails}: should show tier count, trade count, assigned-by and assignment time when a history entry is reviewed`, async ({
    planManagementPage,
    planDetailPage,
    suitePayerFormularies,
    planWithFormularyHistory,
    steps,
  }) => {
    const [first, second] = await suitePayerFormularies(2);
    const plan = await planWithFormularyHistory([first, second]);
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan V\'s formulary history - the history list is displayed', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.readAssignmentCards()).length).toBeGreaterThanOrEqual(2);
    });

    await steps.step('Review F2\'s entry against the checklist - tier count, trade count, assigned-by and date / time match', async () => {
      const entry = (await tab.readHistoryViaApi(plan.id)).find((e) => e.formularyId === second.id);
      expect(entry, 'F2 in the recorded history').toBeDefined();
      const card = (await tab.readAssignmentCards()).find((c) => c.text.includes(formularyCode(second)));
      const text = card?.text ?? '';
      expect({
        tiers: tierText(entry?.tierCount ?? -1).test(text),
        trades: tradeText(entry?.tradeCount ?? -1).test(text),
        assignedBy: text.includes(APPROVER_NAME),
        assignedOn: DATE_TIME.test(text),
      }, `F2's entry read: ${text}`).toEqual({ tiers: true, trades: true, assignedBy: true, assignedOn: true });
    });
  });

  test(`TC-${CASE.activeMarked}: should mark the current formulary apart from the historical ones when the plan has had several`, async ({
    planManagementPage,
    planDetailPage,
    suitePayerFormularies,
    planWithFormularyHistory,
    steps,
  }) => {
    const formularies = await suitePayerFormularies(3);
    const plan = await planWithFormularyHistory(formularies);
    const [f1, f2, f3] = formularies;
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan V\'s formulary history - the history list is displayed', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.readAssignmentCards()).length).toBeGreaterThanOrEqual(3);
    });

    await steps.step('Review the indicators - F3 is marked as the active formulary, F1 and F2 as historical', async () => {
      const cards = await tab.readAssignmentCards();
      const badgeOf = (code: string): string => cards.find((card) => card.text.includes(code))?.badge ?? '';
      expect(badgeOf(formularyCode(f3)), 'F3 is the active one').toMatch(BADGE.active);
      for (const old of [f1, f2]) expect(badgeOf(formularyCode(old)), `${formularyCode(old)} is historical`).toMatch(BADGE.previous);
      expect(cards.filter((card) => BADGE.active.test(card.badge)).length, 'exactly one active formulary').toBe(1);
    });
  });

  test(`TC-${CASE.singleEntry}: should show exactly one entry marked active when the plan only ever had one formulary`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    planFormulary,
    steps,
  }) => {
    const formulary = await planFormulary();
    const plan = await planIn('Active');
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan W\'s formulary history - the history list is displayed', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.readAssignmentCards()).length).toBeGreaterThan(0);
    });

    await steps.step('Review the list - exactly one entry, F1, marked as the active formulary', async () => {
      const cards = await tab.readAssignmentCards();
      expect(cards.length).toBe(1);
      expect(cards[0].text).toContain(formularyCode(formulary));
      expect(cards[0].badge).toMatch(BADGE.active);
    });
  });

  test(`TC-${CASE.perVersion}: should attribute each assignment to its own plan version when the plan has several versions`, async ({
    planManagementPage,
    planDetailPage,
    suitePayerFormularies,
    planWithFormularyHistory,
    steps,
  }) => {
    const [first, second] = await suitePayerFormularies(2);
    const plan = await planWithFormularyHistory([first, second]);
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan X\'s formulary history - it is organized per plan version', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      const versions = new Set((await tab.readHistoryViaApi(plan.id)).map((entry) => entry.version));
      expect(versions.size, 'the history spans more than one version').toBeGreaterThanOrEqual(2);
    });

    await steps.step('Review the entries across versions - each is attributed to the version that carried it', async () => {
      const text = (await tab.readAssignmentCards()).map((card) => card.text).join(' | ');
      const history = await tab.readHistoryViaApi(plan.id);
      const unattributed = history
        .filter((entry) => entry.formularyCode)
        .map((entry) => versionAttribution(entry.formularyCode, entry.version))
        .filter((label) => !text.includes(label));
      expect(unattributed, `the cards read: ${text}`).toEqual([]);
    });
  });

  test(`TC-${CASE.emptyState}: should load the Formulary Assignment tab without an error or a blank screen when the plan never had a formulary`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', { noFormulary: true });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open Plan Y\'s formulary history - the history is requested', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.readHistoryViaApi(plan.id).then((entries) => entries.filter((entry) => entry.formularyId))).toEqual([]);
    });

    // No dedicated "no formulary yet" message is required (QA lead, 2026-11-01).
    await steps.step('Review the content - the tab loads without an error or a blank screen', async () => {
      expect(await tab.getPanelText(), 'the tab should not be blank').not.toBe('');
      expect((await planDetailPage.readMessages()).join(' '), 'no error should be shown').not.toMatch(/error|failed|unable/i);
    });
  });

  test(`TC-${CASE.bilingual}: should label the tab and render its history correctly when the interface is in English or Arabic`, async ({
    planManagementPage,
    planDetailPage,
    languageSwitcher,
    planIn,
    planFormulary,
    cleanup,
    steps,
  }) => {
    const formulary = await planFormulary();
    const plan = await planIn('Active');
    cleanup.register(() => languageSwitcher.switchTo('en'));

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Locate the formulary history tab in English and in Arabic - its label reads as the story names it in each', async () => {
      await planDetailPage.open(plan.id);
      // Both labels are read before either is checked: a wrong English label
      // stopped the switch to Arabic, and step 3 then failed on a page that was
      // never switched (19217, 2026-10-28).
      const english = await planDetailPage.getTabLabel('formulary');
      await languageSwitcher.switchTo('ar');
      const arabic = await planDetailPage.getTabLabel('formulary');
      expect({ english, arabic }, 'the tab labels').toEqual({ english: TAB_LABEL.en, arabic: TAB_LABEL.ar });
    });

    await steps.step('Switch between the languages and reopen the tab - Arabic renders right-to-left and the history stays accurate in both', async () => {
      await languageSwitcher.expectRightToLeft();
      await planDetailPage.formulary().open();
      expect((await planDetailPage.formulary().readAssignmentCards()).map((card) => card.text).join(' '), 'the history in Arabic').toContain(formularyCode(formulary));
      await languageSwitcher.switchTo('en');
      await languageSwitcher.expectLeftToRight();
      await planDetailPage.formulary().open();
      expect((await planDetailPage.formulary().readAssignmentCards()).map((card) => card.text).join(' '), 'the history in English').toContain(formularyCode(formulary));
    });
  });

  test(`TC-${CASE.updatesAfterApproval}: should show the old formulary as historical and the new one active with its assigner when a reassignment is approved`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    suitePayerFormularies,
    steps,
  }) => {
    const [current, next] = await suitePayerFormularies(2);
    const plan = await planIn('Active', { formularyId: current.id });
    const tab = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('As a Plan Administrator, reassign Plan V from F2 to F3 and complete the approval - F3 becomes active', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.replaceWith(formularyCode(next)))?.status).toBeLessThan(300);
      await planDetailPage.submitForApproval();
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await expect.poll(() => tab.readLiveFormularyIdViaApi(plan.id), { timeout: 60_000 }).toBe(next.id);
    });

    await steps.critical('Open Plan V\'s formulary history - the history view reloads', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect((await tab.readAssignmentCards()).length).toBeGreaterThanOrEqual(2);
    });

    await steps.step('Review the updated history - F2 historical, F3 newly active with its assigner and date', async () => {
      const cards = await tab.readAssignmentCards();
      const old = cards.find((card) => card.text.includes(formularyCode(current)));
      const fresh = cards.find((card) => card.text.includes(formularyCode(next)));
      expect(old?.badge, 'F2 is now historical').toMatch(BADGE.previous);
      expect(fresh?.badge, 'F3 is now active').toMatch(BADGE.active);
      expect(fresh?.text, 'F3\'s assigner').toContain(APPROVER_NAME);
      expect(fresh?.text, 'F3\'s assignment date').toMatch(DATE_TIME);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
