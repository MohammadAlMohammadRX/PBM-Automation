import { test, expect } from '../../../fixtures';
import type { PlanFormDialog, SaveReport } from '../../../pages/plan/PlanFormDialog';
import type { ProvisionedPlan } from '../../../utils/PlanProvisioning';
import { planFormData } from '../../../data/plans/plan.data';
import { CASES, LANGUAGES, type ShownName } from '../../../data/plans/localizedPlanLabels.data';

/**
 * User story 14162: Display localized plan names and labels.
 * Plan NAMES - shown in the interface language, falling back to the other
 * language when one is blank and to "—" when both are - and the script rules
 * on the two name fields.
 *
 * Every case restores English in cleanup (a remembered per-user preference).
 */
test.describe('US 14162 - Localized plan names', () => {
  test.beforeEach(async ({ languageSwitcher, cleanup }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
  });

  test(`TC-${CASES.englishFallback.azureId}: should show the English name when the Arabic name is blank and the interface is in Arabic`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', CASES.englishFallback.spec);
    let shown = '';

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('In Arabic, the plan with a blank Arabic name appears in the directory', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
      shown = await planManagementPage.readDisplayedName(plan.id);
      expect(shown, 'the row should show a name').not.toBe('');
    });

    await steps.step('Its name is displayed using the English value as the fallback', async () => {
      expect(shown).toBe(plan.name);
    });
  });

  test(`TC-${CASES.selectedLanguage.azureId}: should show the plan name in the selected interface language when both translations exist`, async ({
    planManagementPage,
    planDetailPage,
    languageSwitcher,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await languageSwitcher.switchTo('en');
      await planManagementPage.openList();
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('In English the opened plan record shows its English name', async () => {
      const detail = await planManagementPage.openDetails(plan.name);
      expect(await detail.getName()).toContain(plan.name);
    });

    await steps.step('In Arabic the reopened plan record shows its Arabic name', async () => {
      await languageSwitcher.switchTo('ar');
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toContain(plan.nameAr);
    });
  });

  test(`TC-${CASES.bothBlank.azureId}: should show "${CASES.bothBlank.placeholder}" as the plan name when both language names are blank`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', CASES.bothBlank.spec);
    let shown = '';

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('The plan with both names blank appears in the directory', async () => {
      shown = await planManagementPage.readDisplayedName(plan.id);
      expect(await planManagementPage.isRowVisibleById(plan.id)).toBe(true);
    });

    await steps.step(`The name column shows "${CASES.bothBlank.placeholder}" rather than a blank or an error`, async () => {
      expect(shown).toBe(CASES.bothBlank.placeholder);
    });
  });

  test(`TC-${CASES.latinInArabic.azureId}: should flag and refuse to save when Latin text is entered in the Arabic plan name field`, async ({
    planManagementPage,
    cleanup,
    steps,
  }) => {
    const data = planFormData({ nameAr: CASES.latinInArabic.value });
    let form!: PlanFormDialog;
    let report: SaveReport | null = null;
    cleanup.register(async () => form?.discardCreated(report?.outcome ?? null));

    await steps.critical('Navigate to the Plans Management module - the create plan form opens', async () => {
      await planManagementPage.openList();
      form = await planManagementPage.openAddForm();
      expect(await form.getTitleText()).not.toBe('');
    });

    await steps.step(`Typing "${CASES.latinInArabic.value}" into the Arabic name flags it as invalid`, async () => {
      await form.fillBasicInformation(data);
      expect(await form.readFieldError('nameAr'), 'the Arabic name should be flagged').not.toBe('');
    });

    await steps.step('Saving is blocked with a validation message', async () => {
      report = await form.attemptNewSave(data);
      expect(report.refused, `the save should be blocked: ${report.text}`).toBe(true);
      expect(await form.readFieldError('nameAr'), 'the validation message should stay').not.toBe('');
    });
  });

  test(`TC-${CASES.arabicInEnglish.azureId}: should flag and refuse to save when Arabic text is entered in the English plan name field`, async ({
    planManagementPage,
    cleanup,
    steps,
  }) => {
    const data = planFormData({ nameEn: CASES.arabicInEnglish.value });
    let form!: PlanFormDialog;
    let report: SaveReport | null = null;
    cleanup.register(async () => form?.discardCreated(report?.outcome ?? null));

    await steps.critical('Navigate to the Plans Management module - the create plan form opens', async () => {
      await planManagementPage.openList();
      form = await planManagementPage.openAddForm();
      expect(await form.getTitleText()).not.toBe('');
    });

    await steps.step(`Typing "${CASES.arabicInEnglish.value}" into the English name flags it as invalid`, async () => {
      await form.fillBasicInformation(data);
      expect(await form.readFieldError('nameEn'), 'the English name should be flagged').not.toBe('');
    });

    await steps.step('Saving is blocked with a validation message', async () => {
      report = await form.attemptNewSave(data);
      expect(report.refused, `the save should be blocked: ${report.text}`).toBe(true);
      expect(await form.readFieldError('nameEn'), 'the validation message should stay').not.toBe('');
    });
  });

  test(`TC-${CASES.allCombinations.azureId}: should show the localized name, the fallback or "${CASES.allCombinations.placeholder}" when the English and Arabic names are populated in every combination in both languages`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    steps,
  }) => {
    const data = CASES.allCombinations;
    const plans: { label: string; plan: ProvisionedPlan; shows: Record<'en' | 'ar', ShownName> }[] = [];
    for (const combination of data.combinations) {
      plans.push({ label: combination.label, plan: await planIn('Draft', combination.spec), shows: combination.shows });
    }
    const recorded: { combination: string; language: string; shown: string; expected: string }[] = [];

    await steps.critical('Navigate to the Plans Management module - the plan directory is visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Each combination, viewed in English and in Arabic, shows the expected name', async () => {
      for (const language of LANGUAGES) {
        await languageSwitcher.switchTo(language);
        for (const { label, plan, shows } of plans) {
          const expected = { en: plan.name, ar: plan.nameAr, placeholder: data.placeholder }[shows[language]];
          recorded.push({ combination: label, language, shown: await planManagementPage.readDisplayedName(plan.id), expected });
        }
      }
      expect(recorded.filter((entry) => entry.shown !== entry.expected), 'combinations showing the wrong name').toEqual([]);
    });

    await steps.step('Every combination was recorded and follows the fallback and placeholder rules', async () => {
      expect(recorded).toHaveLength(data.combinations.length * LANGUAGES.length);
    });
  });
});
