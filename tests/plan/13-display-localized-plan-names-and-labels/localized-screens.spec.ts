import { test, expect } from '../../../fixtures';
import type { PlanManagementPage } from '../../../pages/plan/PlanManagementPage';
import type { PlanDetailPage } from '../../../pages/plan/PlanDetailPage';
import { ARABIC_TEXT, CASES, LATIN_WORD, untranslatedWords } from '../../../data/plans/localizedPlanLabels.data';

/**
 * User story 14162: Display localized plan names and labels.
 * Whole SCREENS in each language - the directory, the KPI band, Export, the
 * Version History and Audit History tabs - the five Arabic labels the AC
 * names, a language switch mid-session, and the right-to-left layout.
 *
 * Every case restores English in cleanup: the language is a remembered
 * per-user preference, and a case left in Arabic would break every English
 * assertion after it.
 */

/** The labels of the areas 19127 / 19128 browse: directory, dashboard, export, version history and audit tabs. */
async function readModuleLabels(plans: PlanManagementPage, planName: string): Promise<string[]> {
  await plans.openList();
  const texts = [...(await plans.getHeaderTexts()), ...(await plans.getKpiLabels()), await plans.getExportTriggerLabel()];
  const menu = plans.exportMenu();
  await menu.open();
  texts.push(...(await menu.getScopeLabels()));
  await menu.cancelMenu();
  const detail = await plans.openDetails(planName);
  texts.push(...(await detail.getTabLabels()));
  await detail.versions().open();
  texts.push(...(await detail.versions().getHeaders()));
  await detail.audit().open();
  return texts.filter((text) => text.trim() !== '');
}

test.describe('US 14162 - Screens and labels in each language', () => {
  test.beforeEach(async ({ languageSwitcher, cleanup }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
  });

  test(`TC-${CASES.arabicEverywhere.azureId}: should show every label of the directory, dashboard, export, version history and audit tabs in Arabic when Arabic is selected`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the module opens', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('Switching to Arabic shows the menus, buttons and headers in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
      await planManagementPage.openList();
      const headers = await planManagementPage.getHeaderTexts();
      expect(headers.join(' '), 'Arabic headers').toMatch(ARABIC_TEXT);
      expect(untranslatedWords(headers), 'English words left in the headers').toEqual([]);
    });

    await steps.step('The directory, dashboard, export option, version history and audit tabs all read in Arabic', async () => {
      const texts = await readModuleLabels(planManagementPage, plan.nameAr);
      expect(untranslatedWords(texts), 'English words left on the Arabic screens').toEqual([]);
    });
  });

  test(`TC-${CASES.englishEverywhere.azureId}: should show every label of the directory, dashboard, export, version history and audit tabs in English when English is selected`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the module opens', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('With English selected the menus, buttons and headers are English', async () => {
      await languageSwitcher.switchTo('en');
      await languageSwitcher.expectLeftToRight();
      const headers = await planManagementPage.getHeaderTexts();
      expect(headers.join(' ')).toMatch(LATIN_WORD);
      expect(headers.filter((header) => ARABIC_TEXT.test(header)), 'Arabic left in the headers').toEqual([]);
    });

    await steps.step('The directory, dashboard, export option, version history and audit tabs all read in English', async () => {
      const texts = await readModuleLabels(planManagementPage, plan.name);
      expect(texts.filter((text) => ARABIC_TEXT.test(text)), 'Arabic text on the English screens').toEqual([]);
    });
  });

  test(`TC-${CASES.viewDetailsLabel.azureId}: should label the view plan details action "${CASES.viewDetailsLabel.label}" when the interface is in Arabic`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module in Arabic - the directory is visible', async () => {
      await languageSwitcher.switchTo('ar');
      await planManagementPage.openList();
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step(`The action to view a plan's details is labelled "${CASES.viewDetailsLabel.label}"`, async () => {
      expect(await planManagementPage.getRowActionLabel(plan.nameAr, 'view')).toBe(CASES.viewDetailsLabel.label);
    });

    await steps.step('Selecting the action opens the plan details view', async () => {
      const detail = await planManagementPage.openDetails(plan.nameAr);
      expect(await detail.getName()).toContain(plan.nameAr);
    });
  });

  test(`TC-${CASES.dashboardLabel.azureId}: should label the plan dashboard of five counters "${CASES.dashboardLabel.label}" when the interface is in Arabic`, async ({
    planManagementPage,
    languageSwitcher,
    steps,
  }) => {
    const data = CASES.dashboardLabel;

    await steps.critical('Navigate to the Plans Management module in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await planManagementPage.openList();
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step(`The plan dashboard with the five counters is labelled "${data.label}"`, async () => {
      expect(await planManagementPage.getKpiBandLabel()).toBe(data.label);
    });

    await steps.step('The dashboard shows its five counters', async () => {
      expect(await planManagementPage.getKpiTileKeys()).toHaveLength(data.tiles);
      expect(Object.values(await planManagementPage.readKpis()).every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
    });
  });

  test(`TC-${CASES.exportLabel.azureId}: should label the export action "${CASES.exportLabel.label}" when the interface is in Arabic`, async ({
    planManagementPage,
    languageSwitcher,
    steps,
  }) => {
    const data = CASES.exportLabel;

    await steps.critical('Navigate to the Plans Management module in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await planManagementPage.openList();
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step(`The export action is labelled "${data.label}"`, async () => {
      expect(await planManagementPage.getExportTriggerLabel()).toBe(data.label);
    });

    await steps.step('Selecting the export action starts the export', async () => {
      const menu = planManagementPage.exportMenu();
      await menu.open();
      expect(await menu.isMenuOpen(), 'the export prompt should open').toBe(true);
      await menu.cancelMenu();
    });
  });

  test(`TC-${CASES.versionsLabel.azureId}: should label the Version History tab "${CASES.versionsLabel.label}" when the interface is in Arabic`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    steps,
  }) => {
    const plan = await planIn('PendingApproval');
    let detail!: PlanDetailPage;

    await steps.critical('Navigate to the Plans Management module in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await planManagementPage.openList();
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step(`The plan's version history tab is labelled "${CASES.versionsLabel.label}"`, async () => {
      detail = await planManagementPage.openDetails(plan.nameAr);
      expect(await detail.getTabLabels()).toContain(CASES.versionsLabel.label);
    });

    await steps.step('Selecting the tab opens the version history list', async () => {
      await detail.versions().open();
      expect((await detail.versions().readRows()).length, 'the plan\'s versions').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.auditLabel.azureId}: should label the Audit History tab "${CASES.auditLabel.label}" when the interface is in Arabic`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');
    let detail!: PlanDetailPage;

    await steps.critical('Navigate to the Plans Management module in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await planManagementPage.openList();
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step(`The plan's audit history tab is labelled "${CASES.auditLabel.label}"`, async () => {
      detail = await planManagementPage.openDetails(plan.nameAr);
      expect(await detail.getTabLabels()).toContain(CASES.auditLabel.label);
    });

    await steps.step('Selecting the tab opens the audit log list', async () => {
      await detail.audit().open();
      expect((await detail.audit().readEntries()).length, 'the plan\'s audit entries').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.midSessionSwitch.azureId}: should update every visible label at once when the language is switched mid-session and back`, async ({
    planManagementPage,
    languageSwitcher,
    steps,
  }) => {
    await steps.critical('Navigate to the Plans Management module in English', async () => {
      await languageSwitcher.switchTo('en');
      await planManagementPage.openList();
      expect((await planManagementPage.getHeaderTexts()).filter((header) => ARABIC_TEXT.test(header))).toEqual([]);
    });

    await steps.step('Switching to Arabic without a reload turns every visible label Arabic at once', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
      const texts = [...(await planManagementPage.getHeaderTexts()), ...(await planManagementPage.getKpiLabels())];
      expect(texts.join(' ')).toMatch(ARABIC_TEXT);
      expect(untranslatedWords(texts), 'stale English labels after the switch').toEqual([]);
    });

    await steps.step('Switching back to English turns every label English again at once', async () => {
      await languageSwitcher.switchTo('en');
      await languageSwitcher.expectLeftToRight();
      const texts = [...(await planManagementPage.getHeaderTexts()), ...(await planManagementPage.getKpiLabels())];
      expect(texts.filter((text) => ARABIC_TEXT.test(text)), 'stale Arabic labels after switching back').toEqual([]);
    });
  });

  test(`TC-${CASES.rightToLeft.azureId}: should lay out the directory, dashboard, export, version history and audit screens right-to-left when Arabic is selected`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');
    const directions: Record<string, string> = {};

    await steps.critical('Navigate to the Plans Management module in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await planManagementPage.openList();
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step('The directory, dashboard, export dialog, version history and audit log follow right-to-left with every label shown', async () => {
      directions.directory = await languageSwitcher.getDirection();
      expect((await planManagementPage.getKpiLabels()).filter((label) => label === ''), 'empty KPI labels').toEqual([]);
      const menu = planManagementPage.exportMenu();
      await menu.open();
      directions.export = await languageSwitcher.getDirection();
      await menu.cancelMenu();
      const detail = await planManagementPage.openDetails(plan.nameAr);
      expect((await detail.getTabLabels()).filter((label) => label === ''), 'empty tab labels').toEqual([]);
      await detail.versions().open();
      directions.versions = await languageSwitcher.getDirection();
      await detail.audit().open();
      directions.audit = await languageSwitcher.getDirection();
      expect(Object.entries(directions).filter(([, dir]) => dir !== CASES.rightToLeft.direction), 'screens not laid out right-to-left').toEqual([]);
    });
  });
});
