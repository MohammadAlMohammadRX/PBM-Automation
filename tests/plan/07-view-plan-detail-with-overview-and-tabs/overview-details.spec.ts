import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { PLAN_PERMISSION } from '../../../data/accounts/payerAdminRole.data';
import {
  ACCESS_DENIED_MESSAGE,
  ACTIVE_STATUS,
  APPLICATION_ERROR,
  BREADCRUMB_PLANS_LINK,
  CASE,
  DEFAULT_PLAN_TYPE,
  EMPTY_PLACEHOLDER,
  FALLBACK,
  NONEXISTENT_PLAN_ID,
  OVERVIEW_DATE,
  OVERVIEW_DESCRIPTION,
  PLAN_CODE,
  SCOPED_PAYER,
  VIEW_PERMISSION,
  dateBoundaries,
  ddMMyyyy,
} from '../../../data/plans/planDetailOverview.data';

/**
 * User story 14155: View plan detail with overview and tabs.
 * The Overview's attributes and metadata, the localized fallback, the date
 * format, the not-found and no-permission cases, empty optional fields and the
 * breadcrumb. Twin: tests/network/12-view-network-overview-and-details.
 *
 * Each case opens a plan it provisioned itself (fixture `planIn`).
 */
test.describe('US 14155 - Plan detail overview', () => {
  test(`TC-${CASE.overviewFields}: should show every plan attribute, its audit metadata and the status badge when the Overview opens`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active', { descriptionEn: OVERVIEW_DESCRIPTION });

    await steps.critical('Navigate to the Plans Management module - the list shows the plan', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name), 'the case\'s plan should be listed').toBe(true);
    });

    await steps.critical('Select the plan and click View - the detail opens with the Overview tab active', async () => {
      const detail = await planManagementPage.openDetails(plan.name);
      expect(await detail.getName()).toBe(plan.name);
      expect(await planDetailPage.getActiveTab(), 'the detail should open on Overview').toBe('overview');
    });

    await steps.step('Created By, Created At and Last Updated all display populated values', async () => {
      const overview = await planDetailPage.readOverview();
      expect(overview.createdBy, 'Created By').not.toBe('');
      expect(overview.createdAt, 'Created At').toMatch(OVERVIEW_DATE);
      expect(overview.lastUpdated, 'Last Updated').toMatch(OVERVIEW_DATE);
    });

    await steps.step('The remaining attributes (name, description, type, payer, code) show the plan\'s values', async () => {
      const overview = await planDetailPage.readOverview();
      expect(overview.nameEn, 'English name').toBe(plan.name);
      expect(overview.nameAr, 'Arabic name').toBe(plan.nameAr);
      expect(overview.description, 'description').toBe(OVERVIEW_DESCRIPTION);
      expect(overview.type, 'type').toBe(DEFAULT_PLAN_TYPE);
      expect(overview.payer, 'payer').toBe(plan.payerName);
      expect(overview.code, 'plan code').toMatch(PLAN_CODE);
    });

    await steps.step('The status badge next to the plan name shows Active', async () => {
      await planDetailPage.expectStatus(ACTIVE_STATUS);
    });
  });

  test(`TC-${CASE.translationFallback}: should show the default-language description instead of a blank when the interface language has no translation`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', { descriptionEn: FALLBACK.englishDescription, descriptionAr: null });

    await steps.critical('Navigate to the Plans Management module - the list loads in the current language', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Switch the interface to a language the plan has no description in - the interface changes', async () => {
      await planManagementPage.languageSwitcher().switchTo(FALLBACK.locale);
      expect(await planManagementPage.languageSwitcher().currentLanguage()).toBe(FALLBACK.locale);
    });

    await steps.critical('Open the plan missing that translation - the detail page loads', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName(), 'the plan name must not be blank').not.toBe('');
    });

    await steps.step('The default-language description is shown instead of a blank value', async () => {
      await planDetailPage.openTab('overview');
      expect(
        await planDetailPage.readOverviewField('description'),
        'with no Arabic description the English one should be shown',
      ).toBe(FALLBACK.englishDescription);
    });
  });

  test(`TC-${CASE.dateFormat}: should show plan dates as dd/MM/yyyy when they fall on the first and the last day of a month`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const dates = dateBoundaries();
    const plan = await planIn('Draft', { effectiveInMinutes: dates.effectiveInMinutes, expiryInMinutes: dates.expiryInMinutes });

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan whose effective date is the 1st of a month - the detail loads', async () => {
      const detail = await planManagementPage.openDetails(plan.name);
      expect(await detail.getName()).toBe(plan.name);
    });

    await steps.step('The 1st-of-month date reads 01/MM/yyyy, and Created At uses the same format', async () => {
      const overview = await planDetailPage.readOverview();
      expect(overview.effectiveDate, 'effective date on the 1st').toMatch(new RegExp(`^${ddMMyyyy(dates.effective)}`));
      expect(overview.createdAt, 'Created At').toMatch(OVERVIEW_DATE);
    });

    await steps.critical('Reopen the plan whose expiry date is the 31st of a month - the detail loads', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.step('The 31st-of-month date reads 31/MM/yyyy', async () => {
      expect((await planDetailPage.readOverview()).expiryDate, 'expiry date on the 31st').toMatch(new RegExp(`^${ddMMyyyy(dates.expiry)}`));
    });
  });

  // Returning to the list (at most a short "Unable to load" toast) is the accepted handling (QA lead, 2026-11-01).
  test(`TC-${CASE.notFound}: should return to the plan list without a blank page or an application error when a plan id that does not exist is opened`, async ({
    planManagementPage,
    planDetailPage,
    steps,
  }) => {
    let said = '';

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Opening a plan id that never existed displays no plan data', async () => {
      said = await planDetailPage.openAndReadRefusal(NONEXISTENT_PLAN_ID);
      expect(await planDetailPage.isLoaded(), 'no plan should render for an unknown id').toBe(false);
    });

    await steps.step('The app returns to the plan list, with no blank page or application error', async () => {
      await planManagementPage.expectRowsRendered();
      expect(said, 'no application error should be shown').not.toMatch(APPLICATION_ERROR);
    });
  });

  test(`TC-${CASE.breadcrumb}: should navigate back to the plans list when the Plans breadcrumb link is selected`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan\'s detail page - the breadcrumb shows Plans > plan name', async () => {
      await planManagementPage.openDetails(plan.name);
      const trail = await planDetailPage.getBreadcrumb();
      expect(trail, 'the breadcrumb should name the Plans list').toMatch(BREADCRUMB_PLANS_LINK);
      expect(trail, 'the breadcrumb should end with the plan').toContain(plan.name);
    });

    await steps.step('Selecting the Plans link returns to the plans list', async () => {
      await planDetailPage.openBreadcrumbLink(BREADCRUMB_PLANS_LINK);
      await planManagementPage.expectRowsRendered();
      expect(await planDetailPage.isLoaded(1_000), 'the detail screen should have been left').toBe(false);
    });
  });

  test(`TC-${CASE.noViewPermission}: should deny the detail page and show an access message when a user without the view-plan permission opens a plan`, async ({
    planDetailPage,
    planIn,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const plan = await planIn('Draft', { payerName: SCOPED_PAYER, noFormulary: true });
    let session: ShapedSession | null = null;

    await steps.critical('Navigate to the module as a user stripped of the view-plan permission - access follows the role', async () => {
      await planDetailPage.open(plan.id);
      requireBaseline(await planDetailPage.isLoaded(), 'the plan detail screen');
      session = await shapedNonAdmin({ without: VIEW_PERMISSION });
      expect(session.removed, 'the role should have lost the view-plan permission').toContain(PLAN_PERMISSION.viewPlanDetails);
    });

    await steps.step('Opening the plan\'s detail page directly is blocked', async () => {
      await session!.planDetail.openExpectingFailure(plan.id);
      expect(await session!.planDetail.isLoaded(), 'the detail screen must not load for this user').toBe(false);
    });

    await steps.step('An access-denied message is shown, and no plan data', async () => {
      const said = `${await session!.planDetail.readToast()} ${await session!.planDetail.getMainText()}`;
      expect(said, 'the user should be told access is denied').toMatch(ACCESS_DENIED_MESSAGE);
      expect(said, 'the plan\'s data must not be exposed').not.toContain(plan.name);
    });
  });

  test(`TC-${CASE.emptyPlaceholder}: should show a placeholder for an empty optional attribute when the Overview renders`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', { descriptionEn: null, descriptionAr: null });

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan with an empty description - the detail loads without errors', async () => {
      const detail = await planManagementPage.openDetails(plan.name);
      expect(await detail.isLoaded()).toBe(true);
    });

    await steps.step('The empty description shows a placeholder instead of a blank gap', async () => {
      expect((await planDetailPage.readOverview()).description, 'an empty optional field should show a placeholder').toMatch(EMPTY_PLACEHOLDER);
    });
  });
});
