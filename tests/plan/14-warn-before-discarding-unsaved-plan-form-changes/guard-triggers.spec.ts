import { test, expect } from '../../../fixtures';
import type { PlanFormDialog } from '../../../pages/plan/PlanFormDialog';
import { PLAN_FIELD } from '../../../pages/plan/PlanFormDialog';
import { planPayer } from '../../../data/plans/plan.data';
import { PLAN_FORM_MESSAGE } from '../../../data/plans/createPlan.data';
import {
  EXIT_PATHS,
  GUARD,
  GUARD_ACTIONS,
  GUARD_PLAN,
  NAVIGATION_TARGET,
  NON_ADMIN_GUARD_PLAN,
} from '../../../data/plans/unsavedChangesGuard.data';

/**
 * User story 14165: Warn before discarding unsaved plan form changes.
 * WHEN the guard comes up: closing a dirty create or edit form, in-app
 * navigation, every exit path of the drawer, leaving the page, every role
 * that may edit, and after a save that failed.
 * The guard is the shared dialog with `stay` / `discard` (pages/components/
 * EntityWizardDialog.ts, plan folder 14 additions). Twin:
 * tests/network/11 (edit form) and the payer drawer's discard handling.
 */
test.describe('US 14165 - When the unsaved-changes guard appears', () => {
  test(`TC-${GUARD.createDirty.azureId}: should offer Discard and Cancel when a create form with unsaved data is closed`, async ({
    planManagementPage,
    steps,
  }) => {
    const name = GUARD.createDirty.typedName();
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(planPayer());
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Data entered in the create drawer makes the form dirty', async () => {
      form = await planManagementPage.openAddForm();
      await form.fillTextField(PLAN_FIELD.nameEn, name);
      expect(await form.readField('nameEn')).toBe(name);
    });

    await steps.step('Closing the drawer with its X raises a confirmation offering Discard and Cancel', async () => {
      expect(await form.requestClose('close-button'), 'closing a dirty create form must raise the guard').toBe(true);
      expect((await form.readGuard()).actions).toEqual(expect.arrayContaining([...GUARD_ACTIONS]));
      await form.answerGuard('discard');
    });
  });

  test(`TC-${GUARD.editDirty.azureId}: should offer Discard and Cancel when an edit form with an unsaved change is closed`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', GUARD_PLAN);
    const newExpiry = GUARD.editDirty.newExpiry();
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Changing the Expiry Date of an existing plan makes the edit form dirty', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      await form.editField('expiryDate', newExpiry);
      expect(await form.readField('expiryDate')).toBe(newExpiry);
    });

    await steps.step('Closing the edit drawer raises the same confirmation, offering Discard and Cancel', async () => {
      expect(await form.requestClose('close-button'), 'closing a dirty edit form must raise the guard').toBe(true);
      expect((await form.readGuard()).actions).toEqual(expect.arrayContaining([...GUARD_ACTIONS]));
      await form.answerGuard('discard');
    });
  });

  test(`TC-${GUARD.navigateAway.azureId}: should intercept in-app navigation with the guard when the form is dirty`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', GUARD_PLAN);
    const description = GUARD.navigateAway.description();
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('An edit in the plan form makes it dirty', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      await form.editField('descriptionEn', description);
      expect(await form.readField('descriptionEn')).toBe(description);
    });

    await steps.step('Navigating to another module without closing the drawer raises the Discard / Cancel confirmation', async () => {
      expect(await form.requestNavigation(NAVIGATION_TARGET), 'in-app navigation away from a dirty form must raise the guard').toBe(true);
      expect((await form.readGuard()).actions).toEqual(expect.arrayContaining([...GUARD_ACTIONS]));
      await form.answerGuard('stay');
      await form.closeAndDiscard();
    });
  });

  test(`TC-${GUARD.everyExitPath.azureId}: should raise the guard through the close icon, the Escape key and an outside click when the form is dirty`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', GUARD_PLAN);

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('An edit in the plan form makes it dirty', async () => {
      const form = await planManagementPage.openEditForm(plan.name);
      const value = GUARD.everyExitPath.description();
      await form.editField('descriptionEn', value);
      expect(await form.readField('descriptionEn')).toBe(value);
    });

    for (const path of EXIT_PATHS) {
      await steps.step(`Leaving the dirty form via ${path.label} raises the confirmation`, async () => {
        const form = await planManagementPage.reopenEditForm(plan.name, plan.payerName);
        await form.editField('descriptionEn', GUARD.everyExitPath.description());
        expect(await form.requestClose(path.via), `${path.label} must raise the unsaved-changes guard`).toBe(true);
        await form.answerGuard('discard');
        expect(await form.closesWithin(), 'Discard closes the drawer').toBe(true);
      });
    }
  });

  test(`TC-${GUARD.browserLeave.azureId}: should warn before the page is left entirely when a reload is attempted with a dirty form`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', GUARD_PLAN);
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('An edit in the plan form makes it dirty', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      const value = GUARD.browserLeave.description();
      await form.editField('descriptionEn', value);
      expect(await form.readField('descriptionEn')).toBe(value);
    });

    await steps.step('Refreshing the page raises the browser\'s native unsaved-changes prompt', async () => {
      expect(await form.reloadReportingUnloadPrompt(), 'leaving the page with a dirty form should raise a beforeunload warning').toBe(true);
    });
  });

  test(`TC-${GUARD.everyRole.azureId}: should raise the same guard when any role permitted to edit plans leaves a dirty form`, async ({
    planManagementPage,
    planIn,
    shapedNonAdmin,
    steps,
  }) => {
    const plan = await planIn('Draft', NON_ADMIN_GUARD_PLAN);
    let first!: Awaited<ReturnType<PlanFormDialog['readGuard']>>;

    await steps.critical('Navigate to the Plans Management module as the first authorised role - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('As the Plan Administrator, a change in the edit drawer and a close raise Discard / Cancel', async () => {
      const form = await planManagementPage.openEditForm(plan.name);
      await form.editField('descriptionEn', GUARD.everyRole.description());
      expect(await form.requestClose('close-button'), 'the guard for the administrator').toBe(true);
      first = await form.readGuard();
      expect(first.actions).toEqual(expect.arrayContaining([...GUARD_ACTIONS]));
      await form.answerGuard('discard');
    });

    await steps.step('As the second role holding the plan edit right, the identical confirmation appears', async () => {
      const session = await shapedNonAdmin({ with: ['editPlan'] });
      await session.plans.openListFor(plan.payerName);
      const form = await session.plans.openEditForm(plan.name);
      await form.editField('descriptionEn', GUARD.everyRole.description());
      expect(await form.requestClose('close-button'), 'the guard for the second role').toBe(true);
      const second = await form.readGuard();
      expect(second.actions, 'the same choices').toEqual(first.actions);
      expect(second.title, 'the same title').toBe(first.title);
      await form.answerGuard('discard');
    });
  });

  test(`TC-${GUARD.failedSave.azureId}: should keep the guard active when a save attempt fails validation`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', GUARD_PLAN);
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('In the edit drawer, a required field is cleared beside another dirty field - dirty and invalid', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      await form.editField('descriptionEn', GUARD.failedSave.description());
      await form.clearField(PLAN_FIELD.nameEn);
      expect(await form.readField('nameEn')).toBe('');
    });

    await steps.step('Save is blocked and a validation error is displayed', async () => {
      const report = await form.attemptEditSave();
      expect(report.refused, `a plan without its name must not save: ${report.text}`).toBe(true);
      expect([await form.readFieldError('nameEn'), ...report.messages].join(' | ')).toMatch(PLAN_FORM_MESSAGE.required);
    });

    await steps.step('Closing the drawer after the failed save still raises the confirmation', async () => {
      expect(await form.requestClose('close-button'), 'the unsaved changes were not persisted, so the guard must stay active').toBe(true);
      await form.answerGuard('discard');
    });
  });
});
