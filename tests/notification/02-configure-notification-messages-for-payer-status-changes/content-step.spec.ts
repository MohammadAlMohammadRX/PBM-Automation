import { test, expect } from '../../../fixtures';
import { STATUS_ACTION } from '../../../constants/notification/writerEIds';
import { actionVariables, listDefinitions } from '../../../utils/notification/notificationApi';
import { definitionListed, directionOf, finishWizard, messageWithout } from '../../../utils/notification/writerEHelpers';
import {
  ACTIVE_ACTION,
  ADMIN_AUDIENCE_NAME,
  ARABIC_MESSAGE,
  CASES,
  ENGLISH_MESSAGE,
  EXPIRING_SOON_ACTION,
  FIELD_REQUIRED,
  MISSING_VARIABLE,
  PAYER_MODULE,
  SAVED,
  STORY,
} from '../../../data/notification/payerStatusMessages.data';

/**
 * US 12941 - the Content and Audiences steps of the App Notification wizard
 * for payer status messages: both messages required, the Arabic box RTL, the
 * mandatory Expiring Soon placeholders, optional Description / Notes, and Back
 * from Audiences. Saves only suite definitions (watched - deleted at
 * teardown). See data/notification/payerStatusMessages.data.ts.
 */
test.describe(STORY, () => {
  test(`TC-${CASES.englishRequired.azureId}: should require the English message and stay on Content when it is left empty`, async ({ steps, ncDefinitions, ncDefinitionDrawer, suiteDefinitions }) => {
    await steps.critical('Navigate to the Notification Center Management module - the module loads', async () => {
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
    });

    await steps.step('Proceed to Content, leave the English message empty and fill the Arabic message - English stays blank', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name: suiteDefinitions.newName('english required'), module: PAYER_MODULE, action: ACTIVE_ACTION });
      await ncDefinitionDrawer.next();
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toBeVisible();
      await ncDefinitionDrawer.fillContent({ arabic: ARABIC_MESSAGE });
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toHaveValue('');
      await expect(ncDefinitionDrawer.byPart('arabic-message-input')).toHaveValue(ARABIC_MESSAGE);
    });

    await steps.step('Click Next - the English message is required and the wizard does not proceed', async () => {
      const toast = await ncDefinitionDrawer.next();
      expect(await ncDefinitionDrawer.fieldError('english-message'), `the English message error (toast: "${toast}")`).toBe(FIELD_REQUIRED);
      expect(await ncDefinitionDrawer.fieldError('arabic-message'), 'the filled Arabic message is not flagged').toBe('');
      await expect(ncDefinitionDrawer.el('addAudience'), 'Audiences must not open').toBeHidden();
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toBeVisible();
    });
  });

  test(`TC-${CASES.arabicRequiredRtl.azureId}: should require the Arabic message and show it right-to-left once typed`, async ({ steps, ncDefinitions, ncDefinitionDrawer, suiteDefinitions }) => {
    await steps.critical('Navigate to the Notification Center Management module - the module loads', async () => {
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
    });

    await steps.step('Proceed to Content, enter the English message and leave the Arabic message empty - Arabic stays blank', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name: suiteDefinitions.newName('arabic required'), module: PAYER_MODULE, action: ACTIVE_ACTION });
      await ncDefinitionDrawer.next();
      await ncDefinitionDrawer.fillContent({ english: ENGLISH_MESSAGE });
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toHaveValue(ENGLISH_MESSAGE);
      await expect(ncDefinitionDrawer.byPart('arabic-message-input')).toHaveValue('');
    });

    await steps.step('Click Next - a validation error requires the Arabic message', async () => {
      const toast = await ncDefinitionDrawer.next();
      expect(await ncDefinitionDrawer.fieldError('arabic-message'), `the Arabic message error (toast: "${toast}")`).toBe(FIELD_REQUIRED);
      await expect(ncDefinitionDrawer.el('addAudience'), 'Audiences must not open').toBeHidden();
    });

    await steps.step('Enter a valid Arabic message and check its direction - the text box is right-to-left', async () => {
      await ncDefinitionDrawer.fillContent({ arabic: ARABIC_MESSAGE });
      await expect(ncDefinitionDrawer.byPart('arabic-message-input')).toHaveValue(ARABIC_MESSAGE);
      expect(await directionOf(ncDefinitionDrawer.byPart('arabic-message-input'))).toBe('rtl');
    });
  });

  test(`TC-${CASES.expiringSoonNeedsDaysRemaining.azureId}: should refuse an Expiring Soon payer message that leaves out DaysRemaining`, async ({ steps, page, ncDefinitions, ncDefinitionDrawer, suiteDefinitions }) => {
    const name = suiteDefinitions.newName('expiring soon missing');
    let variables: string[] = [];
    let outcome = { reachedAudiences: false, messages: '', saveStatus: null as number | null, drawerOpen: true };

    await steps.critical('Navigate to the Notification Center Management module - the definitions list loads', async () => {
      await suiteDefinitions.watch();
      variables = (await actionVariables(page, STATUS_ACTION.payer.expiringSoon)).map((v) => v.name);
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
      expect(variables, 'GetActionVariables of "Expiring Soon - Payer"').toContain(MISSING_VARIABLE);
    });

    await steps.step('Create a definition with Payer Management and Expiring Soon and proceed to Content - Content opens', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name, module: PAYER_MODULE, action: EXPIRING_SOON_ACTION, active: false });
      await ncDefinitionDrawer.next();
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toBeVisible();
    });

    await steps.step('Enter messages with every placeholder except DaysRemaining and try to proceed / save', async () => {
      await ncDefinitionDrawer.fillContent({
        english: messageWithout('QA expiring soon', variables, MISSING_VARIABLE),
        arabic: messageWithout('اختبار قرب الانتهاء', variables, MISSING_VARIABLE),
      });
      await expect(ncDefinitionDrawer.byPart('english-message-input')).not.toHaveValue(new RegExp(MISSING_VARIABLE));
      outcome = await finishWizard(ncDefinitionDrawer, [ADMIN_AUDIENCE_NAME]);
      expect(outcome.saveStatus === null || outcome.saveStatus >= 400, `the definition should not be saved (save answered ${outcome.saveStatus}; seen: "${outcome.messages.slice(0, 300)}")`).toBe(true);
    });

    await steps.step('Review the outcome - saving is blocked and DaysRemaining is named as required', async () => {
      expect(outcome.messages, 'a message should name the missing placeholder').toContain(MISSING_VARIABLE);
      expect(await definitionListed(page, name), `"${name}" must not exist`).toBe(false);
    });
  });

  test(`TC-${CASES.optionalFieldsBlank.azureId}: should save a payer status message when Description and Notes are left blank`, async ({ steps, page, ncDefinitions, ncDefinitionDrawer, suiteDefinitions }) => {
    const name = suiteDefinitions.newName('optional blank');

    await steps.critical('Navigate to the Notification Center Management module - the definitions list loads', async () => {
      await suiteDefinitions.watch();
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
    });

    await steps.step('Complete General leaving Description blank and click Next - Content opens', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name, module: PAYER_MODULE, action: ACTIVE_ACTION, active: false });
      await expect(ncDefinitionDrawer.byPart('description-input')).toHaveValue('');
      await ncDefinitionDrawer.next();
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toBeVisible();
    });

    await steps.step('Complete Content with the English and Arabic messages, Notes blank, and click Next - Audiences opens', async () => {
      await ncDefinitionDrawer.fillContent({ english: ENGLISH_MESSAGE, arabic: ARABIC_MESSAGE });
      await expect(ncDefinitionDrawer.byPart('notes-input')).toHaveValue('');
      const toast = await ncDefinitionDrawer.next();
      await expect(ncDefinitionDrawer.el('addAudience'), `Audiences should open (toast: "${toast}")`).toBeVisible();
    });

    await steps.step('Click Save - the notification is saved', async () => {
      const idx = await ncDefinitionDrawer.addAudience('Users');
      await ncDefinitionDrawer.assign(idx, [ADMIN_AUDIENCE_NAME]);
      const saved = await ncDefinitionDrawer.save();
      expect(saved.status, `CreateDefinition answered ${saved.status}: ${saved.answer.slice(0, 200)}`).toBe(200);
      expect(saved.toast).toBe(SAVED);
      // The TC asks only that the notification saves; whether the drawer is already gone at the instant the toast
      // shows is not asked (full run 2026-11-11: "Saved successfully." while the drawer was still closing).
      expect((await listDefinitions(page)).some((d) => d.name === name), `"${name}" is listed`).toBe(true);
    });
  });

  test(`TC-${CASES.backFromAudiencesKeepsMessages.azureId}: should keep the English and Arabic messages when navigating back from Audiences to Content`, async ({ steps, ncDefinitions, ncDefinitionDrawer, suiteDefinitions }) => {
    await steps.critical('Navigate to the Notification Center Management module - the definitions list loads', async () => {
      await ncDefinitions.open();
      await expect(ncDefinitions.addButton()).toBeVisible();
    });

    await steps.step('Complete General and Content with English and Arabic messages and click Next - Audiences opens', async () => {
      await ncDefinitionDrawer.openCreate();
      await ncDefinitionDrawer.fillGeneral({ name: suiteDefinitions.newName('back from audiences'), module: PAYER_MODULE, action: ACTIVE_ACTION });
      await ncDefinitionDrawer.next();
      await ncDefinitionDrawer.fillContent({ english: ENGLISH_MESSAGE, arabic: ARABIC_MESSAGE });
      await ncDefinitionDrawer.next();
      await expect(ncDefinitionDrawer.el('addAudience')).toBeVisible();
    });

    await steps.step('Click Back - Content reopens', async () => {
      await ncDefinitionDrawer.back();
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toBeVisible();
      await expect(ncDefinitionDrawer.el('addAudience')).toBeHidden();
    });

    await steps.step('Review the Content fields - the English and Arabic messages are still populated', async () => {
      await expect(ncDefinitionDrawer.byPart('english-message-input')).toHaveValue(ENGLISH_MESSAGE);
      await expect(ncDefinitionDrawer.byPart('arabic-message-input')).toHaveValue(ARABIC_MESSAGE);
    });
  });
});
