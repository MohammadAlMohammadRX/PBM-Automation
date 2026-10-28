import { test, expect } from '../../../fixtures';
import type { PlanFormDialog, SaveReport } from '../../../pages/plan/PlanFormDialog';
import { planPayer } from '../../../data/plans/plan.data';
import { PLAN_FORM_MESSAGE } from '../../../data/plans/createPlan.data';
import {
  EXPECTED_TABLE,
  GUARD,
  GUARD_ACTIONS,
  GUARD_LABEL,
  GUARD_PLAN,
  GUARD_WARNING,
  RAPID_CLOSE_CLICKS,
  modeStateRows,
} from '../../../data/plans/unsavedChangesGuard.data';

/**
 * User story 14165: Warn before discarding unsaved plan form changes.
 * What the guard OFFERS and what each answer does: Discard closes and drops
 * the change, Cancel keeps the form; no guard after a save or on a pristine
 * form; the dirty / pristine x create / edit table; rapid closes; the wording.
 */
test.describe('US 14165 - Answering the unsaved-changes guard', () => {
  test(`TC-${GUARD.discard.azureId}: should close the form and drop the unsaved change when Discard is chosen`, async ({
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

    await steps.critical('Changing the plan type in the edit form makes it dirty', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      await form.editField('type', GUARD.discard.changedType);
      expect(await form.readField('type')).toBe(GUARD.discard.changedType);
    });

    await steps.critical('Closing the drawer raises the confirmation', async () => {
      expect(await form.requestClose('close-button'), 'closing a dirty form must raise the guard').toBe(true);
    });

    await steps.step('Discard closes the drawer immediately', async () => {
      await form.answerGuard('discard');
      expect(await form.closesWithin(), 'the drawer should close at once').toBe(true);
    });

    await steps.step('Reopened, the plan does not carry the discarded change', async () => {
      const reopened = await planManagementPage.reopenEditForm(plan.name, plan.payerName);
      expect(await reopened.readField('type'), 'the discarded type change must not be kept').toBe(GUARD.discard.originalType);
      await reopened.closeAndDiscard();
    });
  });

  test(`TC-${GUARD.cancel.azureId}: should keep the form open with its unsaved data when the warning is cancelled`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', GUARD_PLAN);
    const description = GUARD.cancel.description();
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

    await steps.critical('Closing the drawer raises the confirmation', async () => {
      expect(await form.requestClose('close-button'), 'closing a dirty form must raise the guard').toBe(true);
    });

    await steps.step('Cancel closes the confirmation dialog', async () => {
      await form.answerGuard('stay');
      expect(await form.countOpenDialogs(), 'no dialog should be left on screen').toBe(0);
    });

    await steps.step('The form stays open with the unsaved data intact', async () => {
      expect(await form.isOpen(), 'the form should still be open').toBe(true);
      expect(await form.readField('descriptionEn')).toBe(description);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${GUARD.afterSave.azureId}: should close without a warning when the form is closed right after a successful save`, async ({
    planManagementPage,
    steps,
    cleanup,
  }) => {
    const data = GUARD.afterSave.build();
    let form!: PlanFormDialog;
    let report!: SaveReport;

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(data.payer);
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Valid data entered in the plan form makes it dirty', async () => {
      form = await planManagementPage.openAddForm();
      await form.fill(data);
      expect(await form.readField('nameEn')).toBe(data.nameEn);
    });

    await steps.critical('Save succeeds with a confirmation message', async () => {
      report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `the plan should save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | '), 'a confirmation message').toMatch(PLAN_FORM_MESSAGE.savedAsDraftShown);
    });

    await steps.step('Closing the drawer straight after the save raises no confirmation', async () => {
      expect(await form.requestClose('close-button'), 'a saved form must close without the guard').toBe(false);
      expect(await form.closesWithin(), 'the drawer should be closed').toBe(true);
    });
  });

  test(`TC-${GUARD.pristine.azureId}: should close at once without a warning when an untouched form is closed`, async ({
    planManagementPage,
    steps,
  }) => {
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(planPayer());
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('The create drawer opened without any change stays pristine', async () => {
      form = await planManagementPage.openAddForm();
      expect(await form.readField('nameEn'), 'nothing has been typed').toBe('');
    });

    await steps.step('Closing the drawer closes it immediately with no confirmation', async () => {
      expect(await form.requestClose('close-button'), 'a pristine form must not raise the guard').toBe(false);
      expect(await form.closesWithin(), 'the drawer should close at once').toBe(true);
    });
  });

  test(`TC-${GUARD.decisionTable.azureId}: should raise the guard only for a dirty form when a create or an edit form is closed`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', GUARD_PLAN);
    const seen: Record<string, boolean> = {};

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    for (const row of modeStateRows()) {
      await steps.step(`${row.label}: closing the drawer is recorded as warned or closed`, async () => {
        await planManagementPage.openListFor(plan.payerName);
        const form = await planManagementPage.openPlanForm(row.mode, plan.name);
        await form.makeDirty(row.dirtyValue);
        seen[row.label] = await form.requestClose('close-button');
        const closed = await form.closesWithin();
        expect(seen[row.label] || closed, `${row.label}: the drawer should either warn or close`).toBe(true);
        await form.settleAfterExit();
      });
    }

    await steps.step('The guard appears only for the dirty combinations, in both create and edit mode', async () => {
      expect(seen, 'guard shown per combination').toEqual(EXPECTED_TABLE);
    });
  });

  test(`TC-${GUARD.rapidClose.azureId}: should show a single guard and answer it cleanly when the close control is clicked rapidly`, async ({
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
      const value = GUARD.rapidClose.description();
      await form.editField('descriptionEn', value);
      expect(await form.readField('descriptionEn')).toBe(value);
    });

    await steps.step(`Clicking close ${RAPID_CLOSE_CLICKS} times in quick succession shows only a single confirmation`, async () => {
      expect(await form.requestCloseRepeatedly(RAPID_CLOSE_CLICKS), 'rapid closes must not bypass the guard').toBe(true);
      expect(await form.countOpenDialogs(), 'exactly one confirmation dialog').toBe(1);
    });

    await steps.step('Discard is honoured with no duplicate dialog and no error', async () => {
      await form.answerGuard('discard');
      expect(await form.closesWithin(), 'the drawer should close').toBe(true);
      expect(await form.countOpenDialogs(), 'no dialog may be left behind').toBe(0);
      expect((await form.waitForVisibleMessages()).join(' | '), 'no error should be shown').not.toMatch(/error|failed|exception/i);
    });
  });

  test(`TC-${GUARD.dialogContent.azureId}: should present a clear warning with distinct Discard and Cancel buttons when the guard is raised`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', GUARD_PLAN);
    let guard!: Awaited<ReturnType<PlanFormDialog['readGuard']>>;
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan directory list is visible', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('An edit followed by a close raises the confirmation', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      await form.editField('descriptionEn', GUARD.dialogContent.description());
      expect(await form.requestClose('close-button'), 'closing a dirty form must raise the guard').toBe(true);
      guard = await form.readGuard();
    });

    await steps.step('The dialog shows a warning message with a "Discard" button and a "Cancel" button', async () => {
      expect(`${guard.title} ${guard.message}`, 'the warning should say unsaved changes will be lost').toMatch(GUARD_WARNING);
      expect(guard.actions).toEqual(expect.arrayContaining([...GUARD_ACTIONS]));
      expect(guard.labels.some((label) => GUARD_LABEL.discard.test(label)), `a Discard button among ${guard.labels.join(' / ')}`).toBe(true);
      expect(guard.labels.some((label) => GUARD_LABEL.cancel.test(label)), `a Cancel button among ${guard.labels.join(' / ')}`).toBe(true);
      await form.answerGuard('discard');
    });
  });
});
