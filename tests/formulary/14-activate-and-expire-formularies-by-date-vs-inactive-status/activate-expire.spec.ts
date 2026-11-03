import { test, expect } from '../../../fixtures';
import type { FormularyFormDrawer } from '../../../pages/formulary/FormularyFormDrawer';
import type { FormularyDeactivateDrawer } from '../../../pages/formulary/FormularyDeactivateDrawer';
import { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { FORMULARY_STATUS, STATUS_CODE } from '../../../data/formulary/formulary.data';
import { ALL_STATUSES, BLOCKED_CASES, CASES, END_BEFORE_START, endBeforeStart } from '../../../data/formulary/activateExpire.data';
import { attemptEditSave, findExpiredFormulary } from '../../../utils/formulary/writerCHelpers';
import { formularyStatusIds } from '../../../utils/FormularyProvisioning';

/**
 * User story 15209: Activate and expire formularies by date vs Inactive status.
 * Inactive is a temporary, manual status (Deactivate / Activate, through the
 * approval gate); Expired comes with the end date. The two stay distinct
 * everywhere, an Expired formulary cannot be activated by hand, and the end
 * date may not precede the start date. The date-driven cases are Manual.
 */
test.describe('US 15209 - Activate and expire formularies by date vs Inactive status', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.setInactive.azureId}: should set an Active formulary to Inactive without marking it Expired`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    let drawer!: FormularyDeactivateDrawer;
    let expiryBefore = '';

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Active formulary and select Set Inactive - a confirmation prompt is displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getStatus()).toBe(FORMULARY_STATUS.active);
      expiryBefore = await formularyDetailPage.readOverviewField('expiryDate');
      drawer = await formularyDetailPage.openDeactivate();
      expect(await drawer.getWarning()).toContain(formulary.nameEn);
    });

    await steps.critical('Confirm the action - the formulary status changes to Inactive', async () => {
      const staged = await drawer.deactivate();
      expect(staged.status, staged.text.slice(0, 200)).toBe(200);
      await formularyDetailPage.open(formulary.id);
      expect((await formularyDetailPage.sendForApproval()).status).toBe(200);
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(formulary.nameEn);
      // Back on the formulary: expectStatus reloads the page it is on, and that
      // was still Approval Mgmt (90 s of polling the wrong page, 2026-11-02).
      await formularyDetailPage.open(formulary.id);
      await formularyDetailPage.expectStatus(FORMULARY_STATUS.inactive);
    });

    await steps.step('Verify the end date - it is unchanged and the status is not Expired', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.readOverviewField('expiryDate')).toBe(expiryBefore);
      expect(await formularyDetailPage.getStatus()).not.toBe(FORMULARY_STATUS.expired);
      expect(await formularyDetailPage.readStatusCodeViaApi(formulary.id)).toBe(STATUS_CODE.inactive);
    });
  });

  test(`TC-${CASES.activateInactive.azureId}: should activate an Inactive formulary that meets the activation requirements`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Inactive');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Inactive formulary and select Activate - a confirmation prompt is displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getStatus()).toBe(FORMULARY_STATUS.inactive);
      await formularyDetailPage.clickAction('activate');
      dialog = new ConfirmDialog(page);
      expect(await dialog.isVisible(), 'the Activate confirmation').toBe(true);
    });

    await steps.step('Confirm the activation - the formulary status changes to Active', async () => {
      const staged = await NetworkUtils.captureResponse(page, ApiEndpoints.formularySetActive, async () => { await dialog.confirmWithFollowUps(); });
      expect(staged?.status, staged?.text.slice(0, 200)).toBe(200);
      await formularyDetailPage.open(formulary.id);
      expect((await formularyDetailPage.sendForApproval()).status).toBe(200);
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(formulary.nameEn);
      // Back on the formulary: expectStatus reloads the page it is on, and that
      // was still Approval Mgmt (90 s of polling the wrong page, 2026-11-02).
      await formularyDetailPage.open(formulary.id);
      await formularyDetailPage.expectStatus(FORMULARY_STATUS.active);
    });
  });

  test(`TC-${CASES.expiredNotActivatable.azureId}: should not offer the manual Activate action on an Expired formulary`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    steps,
  }) => {
    const expired = await findExpiredFormulary(page).catch(() => null);
    if (expired === null) {
      steps.blocked('Needs a formulary in status Expired. Expired cannot be produced on demand (the formulary lifecycle job is daily) and '
        + 'the register holds no Expired formulary to look at read-only. Runnable once one exists.');
    }

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(expired!.formularyNameEn)).toBe(true);
    });

    await steps.critical('Open the Expired formulary - the detail page loads showing status Expired', async () => {
      await formularyDetailPage.open(expired!.id);
      expect(await formularyDetailPage.getStatus()).toBe(FORMULARY_STATUS.expired);
    });

    await steps.step('Check for an Activate action - it is not available for an Expired formulary', async () => {
      expect(await formularyDetailPage.getActionAvailability('activate'), 'Activate').not.toBe('available');
      const toggle = await formularyDetailPage.getActionState('setActive');
      expect(toggle.availability === 'available' && /^Activate$/i.test(toggle.label), `the status toggle reads "${toggle.label}" (${toggle.availability})`).toBe(false);
    });
  });

  test(`TC-${CASES.distinctStatuses.azureId}: should show and filter Inactive and Expired as two separate statuses`, async ({
    page,
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    const expired = await findExpiredFormulary(page).catch(() => null);
    if (expired === null) {
      steps.blocked('Needs a formulary in status Expired next to the Draft, Active and Inactive ones. Expired cannot be produced on demand '
        + '(daily lifecycle job) and the register holds none to look at read-only. Runnable once one exists.');
    }
    const draft = await formularyIn('Draft');
    const active = await formularyIn('Active');
    const inactive = await formularyIn('Inactive');
    const ids = await formularyStatusIds(page);

    await steps.critical('Navigate to the Formulary Management module - the list loads with a Status filter', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.getStatusFilterOptions()).toEqual(expect.arrayContaining([FORMULARY_STATUS.inactive, FORMULARY_STATUS.expired]));
    });

    await steps.step('Filter the list by Inactive - only Inactive formularies are displayed', async () => {
      const answer = await formularyManagementPage.filterByStatus(FORMULARY_STATUS.inactive);
      expect(answer.items.filter((f) => f.effectiveStatusId !== ids[STATUS_CODE.inactive]).map((f) => f.formularyNameEn), 'rows that are not Inactive').toEqual([]);
      expect((await formularyManagementPage.readColumnValues('status')).filter((s) => s !== FORMULARY_STATUS.inactive)).toEqual([]);
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.step('Filter the list by Expired - only Expired formularies, none of the Inactive ones', async () => {
      const answer = await formularyManagementPage.filterByStatus(FORMULARY_STATUS.expired);
      expect(answer.items.filter((f) => f.effectiveStatusId !== ids[STATUS_CODE.expired]).map((f) => f.formularyNameEn), 'rows that are not Expired').toEqual([]);
      expect(answer.items.map((f) => f.id)).not.toContain(inactive.id);
    });

    await steps.step('Clear the filters and check each status badge - each shows exactly one status, Inactive and Expired distinct', async () => {
      await formularyManagementPage.filterByStatus(ALL_STATUSES);
      const badges = {
        draft: (await formularyManagementPage.readRow(draft.nameEn)).status,
        active: (await formularyManagementPage.readRow(active.nameEn)).status,
        inactive: (await formularyManagementPage.readRow(inactive.nameEn)).status,
        expired: (await formularyManagementPage.readRow(expired!.formularyNameEn)).status,
      };
      expect(badges).toEqual({
        draft: FORMULARY_STATUS.notLive,
        active: FORMULARY_STATUS.active,
        inactive: FORMULARY_STATUS.inactive,
        expired: FORMULARY_STATUS.expired,
      });
    });
  });

  test(`TC-${CASES.endBeforeStart.azureId}: should block the save with a message when the end date is earlier than the start date`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const dates = endBeforeStart();
    const formulary = await formularyIn('Draft');
    let drawer!: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical(`Open the formulary and set the start date to ${dates.effectiveDate} - the start date updates`, async () => {
      await formularyDetailPage.open(formulary.id);
      drawer = await formularyDetailPage.openEditDrawer();
      expect(await drawer.next(), 'step 2 of the drawer').toBe(true);
      await drawer.type('effectiveDate', dates.effectiveDate);
      expect(await drawer.getValue('effectiveDate')).toBe(dates.effectiveDate);
    });

    await steps.step(`Set the end date to ${dates.expiryDate} (one day before) and save - a message says the end date cannot precede the start, and the save is blocked`, async () => {
      await drawer.type('expiryDate', dates.expiryDate);
      const answer = await attemptEditSave(drawer);
      expect(answer.status === -1 || answer.status >= 400, `the save answered ${answer.status}`).toBe(true);
      expect([answer.errors.expiryDate ?? '', answer.errors.effectiveDate ?? '', ...answer.messages].join(' | ')).toMatch(END_BEFORE_START);
      expect((await formularyDetailPage.readViaApi(formulary.id)).expiryDate).toBe(formulary.expiryDate);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
