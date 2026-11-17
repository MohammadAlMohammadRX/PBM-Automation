import { test, expect } from '../../../fixtures';
import { NC_FORM } from '../../../constants/notification/notificationIds';
import { listDefinitions } from '../../../utils/notification/notificationApi';
import { activeCheckbox, cancelWizard, generalFieldErrors } from '../../../utils/notification/writerEHelpers';
import {
  ACTIVE_ACTION,
  CASES,
  FIELD_REQUIRED,
  FILL_GENERAL,
  PAYER_ACTIONS,
  PAYER_MODULE,
  STORY,
  TC_DESCRIPTION,
  TC_NAME,
} from '../../../data/notification/payerStatusMessages.data';

/**
 * US 12941 - the General step of the App Notification wizard for payer status
 * messages: the mandatory Action, the accepted General step, Cancel, and Back
 * from Content. Nothing here is saved (21353 checks that); see
 * data/notification/payerStatusMessages.data.ts for the literal readings.
 */
test.describe(STORY, () => {
  test(`TC-${CASES.actionRequired.azureId}: should keep the wizard on General and require Action when Next is clicked without one`, async ({ steps, ncDefinitions, ncDefinitionDrawer }) => {
    await steps.critical('Navigate to the Notification Center Management module - the module loads', async () => {
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
    });

    await steps.step('Open the create wizard, fill in Name and Module and leave Action unselected - Action stays empty', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name: TC_NAME, module: PAYER_MODULE });
      await expect(ncDefinitionDrawer.el('name')).toHaveValue(TC_NAME);
      expect(await ncDefinitionDrawer.selected(NC_FORM.part.module)).toContain(PAYER_MODULE);
      const action = await ncDefinitionDrawer.selected(NC_FORM.part.action);
      expect(PAYER_ACTIONS.filter((a) => action.includes(a)), `Action should be empty, it shows "${action}"`).toEqual([]);
    });

    await steps.step('Click Next - Action is required and the wizard does not advance to Content', async () => {
      const toast = await ncDefinitionDrawer.next();
      expect(toast, 'the toast after Next').toBe(FILL_GENERAL);
      await expect
        .poll(() => generalFieldErrors(ncDefinitionDrawer), { message: 'exactly one field (Action) should be flagged "This field is required."', timeout: 5_000 })
        .toEqual({ name: '', module: '', action: FIELD_REQUIRED });
      await expect(ncDefinitionDrawer.byPart('english-message-input'), 'the Content step must not open').toBeHidden();
      await expect(ncDefinitionDrawer.el('name')).toBeVisible();
    });
  });

  test(`TC-${CASES.generalStepAccepted.azureId}: should accept the General step and advance to Content when Name, Module, Action and Description are given`, async ({ steps, ncDefinitions, ncDefinitionDrawer }) => {
    await steps.critical('Navigate to the Notification Center Management module - the module loads', async () => {
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
    });

    await steps.step('Open the create wizard and enter the Name - the Name field accepts the text', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name: TC_NAME });
      await expect(ncDefinitionDrawer.el('name')).toHaveValue(TC_NAME);
    });

    await steps.step('Select Module "Payer Management" - Action offers the payer status actions', async () => {
      await ncDefinitionDrawer.fillGeneral({ module: PAYER_MODULE });
      expect(await ncDefinitionDrawer.selected(NC_FORM.part.module)).toContain(PAYER_MODULE);
      expect([...(await ncDefinitionDrawer.options(NC_FORM.part.action))].sort()).toEqual([...PAYER_ACTIONS].sort());
    });

    await steps.step('Select Action "Active" - the Action field is set to Active', async () => {
      await ncDefinitionDrawer.fillGeneral({ action: ACTIVE_ACTION });
      expect(await ncDefinitionDrawer.selected(NC_FORM.part.action)).toContain(ACTIVE_ACTION);
    });

    await steps.step('Enter a Description and leave Active enabled - the fields accept the values', async () => {
      await ncDefinitionDrawer.fillGeneral({ description: TC_DESCRIPTION, active: true });
      await expect(ncDefinitionDrawer.byPart('description-input')).toHaveValue(TC_DESCRIPTION);
      await expect(activeCheckbox(ncDefinitionDrawer)).toBeChecked();
    });

    await steps.step('Click Next - the wizard advances to the Content step', async () => {
      const toast = await ncDefinitionDrawer.next();
      await expect(ncDefinitionDrawer.byPart('english-message-input'), `Content should open (toast: "${toast}")`).toBeVisible();
      await expect(ncDefinitionDrawer.byPart('arabic-message-input')).toBeVisible();
      // "The General step data is accepted" = Content opened with no refusal toast. The Content step itself shows
      // "This field is required." under its still-empty English / Arabic boxes on arrival (full run 2026-11-11) -
      // those are Content-step fields the TC does not check here, so they are not counted against General.
      expect(toast, 'no refusal toast after Next on a complete General step').not.toBe(FILL_GENERAL);
    });
  });

  test(`TC-${CASES.cancelDiscards.azureId}: should discard the entered values and create nothing when Cancel is clicked on General`, async ({ steps, page, ncDefinitions, ncDefinitionDrawer, suiteDefinitions }) => {
    const name = suiteDefinitions.newName('cancel');

    await steps.critical('Navigate to the Notification Center Management module - the list of definitions loads', async () => {
      await suiteDefinitions.watch();
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
      expect((await ncDefinitions.rowIds()).length, 'the list shows definitions').toBeGreaterThan(0);
    });

    await steps.step('Click Create and enter Name, Module and Action - the values display in the form', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name, module: PAYER_MODULE, action: ACTIVE_ACTION });
      await expect(ncDefinitionDrawer.el('name')).toHaveValue(name);
      expect(await ncDefinitionDrawer.selected(NC_FORM.part.module)).toContain(PAYER_MODULE);
      expect(await ncDefinitionDrawer.selected(NC_FORM.part.action)).toContain(ACTIVE_ACTION);
    });

    await steps.step('Click Cancel - the changes are discarded and the list is shown again', async () => {
      const prompt = await cancelWizard(page, ncDefinitionDrawer);
      await expect(ncDefinitionDrawer.el('close'), `the wizard should close (prompt seen: "${prompt}")`).toBeHidden();
      await expect(ncDefinitions.addButton()).toBeVisible();
    });

    await steps.step('Review the list - no definition with the entered name was created', async () => {
      const answer = await ncDefinitions.search(name);
      expect(answer?.totalRows, `GetDefinitions "${name}"`).toBe(0);
      await expect(ncDefinitions.emptyState()).toBeVisible();
      expect((await listDefinitions(page)).some((d) => d.name === name)).toBe(false);
    });
  });

  test(`TC-${CASES.backKeepsGeneral.azureId}: should show the General values again when Back is clicked on Content`, async ({ steps, ncDefinitions, ncDefinitionDrawer }) => {
    await steps.critical('Navigate to the Notification Center Management module - the landing page loads', async () => {
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
    });

    await steps.step('Complete General with Name, Module "Payer Management" and Action "Active" and click Next - Content is displayed', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name: TC_NAME, module: PAYER_MODULE, action: ACTIVE_ACTION });
      await ncDefinitionDrawer.next();
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toBeVisible();
    });

    await steps.step('Click Back - the General step is displayed again', async () => {
      await ncDefinitionDrawer.back();
      await expect(ncDefinitionDrawer.el('name')).toBeVisible();
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toBeHidden();
    });

    await steps.step('Review Name, Module and Action - the entered values are still populated', async () => {
      await expect(ncDefinitionDrawer.el('name')).toHaveValue(TC_NAME);
      expect(await ncDefinitionDrawer.selected(NC_FORM.part.module)).toContain(PAYER_MODULE);
      expect(await ncDefinitionDrawer.selected(NC_FORM.part.action)).toContain(ACTIVE_ACTION);
    });
  });

  test(`TC-${CASES.backFromContentKeepsGeneral.azureId}: should keep Name, Module and Action when navigating back from Content to General`, async ({ steps, ncDefinitions, ncDefinitionDrawer }) => {
    await steps.critical('Navigate to the Notification Center Management module - the list of definitions loads', async () => {
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
    });

    await steps.step('Complete General with Name, Module and Action and click Next - Content opens', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name: TC_NAME, module: PAYER_MODULE, action: ACTIVE_ACTION });
      await ncDefinitionDrawer.next();
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toBeVisible();
    });

    await steps.step('Click Back - General reopens', async () => {
      await ncDefinitionDrawer.back();
      await expect(ncDefinitionDrawer.el('name')).toBeVisible();
    });

    await steps.step('Review the General fields - Name, Module and Action are still populated', async () => {
      await expect(ncDefinitionDrawer.el('name')).toHaveValue(TC_NAME);
      expect(await ncDefinitionDrawer.selected(NC_FORM.part.module)).toContain(PAYER_MODULE);
      expect(await ncDefinitionDrawer.selected(NC_FORM.part.action)).toContain(ACTIVE_ACTION);
    });
  });
});
