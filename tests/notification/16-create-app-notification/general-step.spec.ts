import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { DefinitionDrawer } from '../../../pages/notification/Drawers';
import type { DefinitionsTab } from '../../../pages/notification/NotificationCenterPage';
import { DEF_ACTION, DEF_DRAWER_PART, DEF_MODULE } from '../../../constants/notification/writerCIds';
import { SUITE_DEFINITION_PREFIX, actionVariablesNc } from '../../../utils/notification/notificationApi';
import {
  APPROVAL_MODULE,
  CASES,
  DESCRIPTION_MAX,
  ERROR_FIELD,
  LONG_TEXT,
  NAME_MAX,
  NEED_TO_APPROVE_PAYER,
  NETWORK_INACTIVE,
  NETWORK_MODULE,
  PLAN_INACTIVE,
  PLAN_MODULE,
  POLICY_EXPIRING,
  POLICY_MODULE,
  STORY,
  TEXT,
} from '../../../data/notification/createAppNotification.data';
import {
  actionLabelsOf,
  anyContains,
  attemptInArabic,
  backToGeneral,
  currentStep,
  describeAttempt,
  discardDrawer,
  errorOf,
  forwardTo,
  generalShown,
  insertMenuVariables,
  labelOf,
  saveFromHere,
  visibleErrors,
} from '../../../utils/notification/writerCHelpers';

/** Step 1: the App Notification tab of the Notification Center. */
async function openList(steps: TestSteps, tab: DefinitionsTab): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
    const answer = await tab.open();
    expect(answer?.status, 'GetDefinitions should answer the App Notification tab').toBe(200);
  });
}

/** Step 2 of the field cases: the Create drawer on General. */
async function openCreate(steps: TestSteps, drawer: DefinitionDrawer): Promise<void> {
  await steps.critical('Open the Create drawer - the General step displays', async () => {
    await drawer.openCreate();
    expect(await currentStep(drawer), 'the drawer opens on General').toBe('general');
  });
}

/**
 * User story 21000: Create App Notification - the General step (Name, Module,
 * Action, Description, Active) and its validation. Nothing is saved in this
 * file: every drawer is discarded. See the data file for the readings.
 */
test.describe(`US ${STORY.id} - ${STORY.title} (General step)`, () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.name100.azureId}: should accept a Name of exactly ${NAME_MAX} characters without truncation or error`, async ({ page, steps, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const name = LONG_TEXT(SUITE_DEFINITION_PREFIX, NAME_MAX);
    await openList(steps, ncDefinitions);
    await openCreate(steps, drawer);

    await steps.step(`Enter a Name value exactly ${NAME_MAX} characters long - the field accepts the full text without truncation or error`, async () => {
      await drawer.fillGeneral({ name });
      await drawer.byPart(DEF_DRAWER_PART.name).blur();
      expect((await generalShown(drawer)).name, `the Name field should hold all ${NAME_MAX} characters`).toBe(name);
      expect(errorOf(await visibleErrors(page), ERROR_FIELD.name), 'no error under Name').toBe('');
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.name101.azureId}: should stop the Name at ${NAME_MAX} characters or flag a ${NAME_MAX + 1}st as invalid`, async ({ page, steps, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    await openList(steps, ncDefinitions);
    await openCreate(steps, drawer);

    await steps.step(`Attempt to enter a Name value of ${NAME_MAX + 1} characters - the field blocks input at ${NAME_MAX} characters or flags the excess as invalid`, async () => {
      const input = drawer.byPart(DEF_DRAWER_PART.name);
      await input.fill(LONG_TEXT(SUITE_DEFINITION_PREFIX, NAME_MAX));
      await input.pressSequentially('y');
      await input.blur();
      const held = (await generalShown(drawer)).name.length;
      const errors = await visibleErrors(page);
      expect(held <= NAME_MAX || errorOf(errors, ERROR_FIELD.name) !== '', `the Name field holds ${held} characters (input maxlength ${await input.getAttribute('maxlength')}); field errors ${JSON.stringify(errors)}`).toBe(true);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.noName.azureId}: should block saving with "${TEXT.fillNameModuleAction.en}" when the Name is left blank`, async ({ page, steps, ncDefinitions, ncDefinitionDrawer: drawer, languageSwitcher }) => {
    await openList(steps, ncDefinitions);

    await steps.critical('Open the Create drawer, select Module and Action, leave Name empty - the Name field remains blank', async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ module: NETWORK_MODULE, action: NETWORK_INACTIVE });
      const shown = await generalShown(drawer);
      expect(shown, 'Module and Action chosen, Name blank').toEqual(expect.objectContaining({ name: '', module: NETWORK_MODULE, action: NETWORK_INACTIVE }));
    });

    await steps.step(`Click Save - save is blocked, "${TEXT.fillNameModuleAction.en}" / "${TEXT.fillNameModuleAction.ar}" is displayed and the drawer remains open`, async () => {
      const english = await saveFromHere(page, drawer);
      expect(english.status, `nothing should be sent: ${describeAttempt(english)}`).toBeNull();
      expect(anyContains(english.toasts, TEXT.fillNameModuleAction.en), `English UI: ${describeAttempt(english)}`).toBe(true);
      expect(english.drawerOpen, 'the drawer stays open').toBe(true);
      const moduleAr = await labelOf(page, DEF_MODULE.networkManagement, 'ar');
      const actionAr = await labelOf(page, DEF_ACTION.networkInactive, 'ar');
      const arabic = await attemptInArabic(page, languageSwitcher, ncDefinitions, drawer, () => drawer.fillGeneral({ module: moduleAr, action: actionAr }));
      expect(anyContains(arabic.toasts, TEXT.fillNameModuleAction.ar), `Arabic UI: ${describeAttempt(arabic)}`).toBe(true);
      expect(arabic.drawerOpen && arabic.status === null, 'the Arabic attempt is blocked too').toBe(true);
    });
  });

  test(`TC-${CASES.noAction.azureId}: should block saving with "${TEXT.fieldRequired.en}" under Action when no action is selected`, async ({ page, steps, ncDefinitions, ncDefinitionDrawer: drawer, languageSwitcher }) => {
    const name = `${SUITE_DEFINITION_PREFIX} no action`;
    await openList(steps, ncDefinitions);

    await steps.critical('Open the Create drawer, enter Name, select Module, leave Action unselected - the Action field remains empty', async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ name, module: NETWORK_MODULE });
      expect((await generalShown(drawer)).action, 'Action is empty').toBe('');
    });

    await steps.step(`Click Save - save is blocked and "${TEXT.fieldRequired.en}" / "${TEXT.fieldRequired.ar}" is displayed for the Action field`, async () => {
      const english = await saveFromHere(page, drawer);
      expect(english.status, `nothing should be sent: ${describeAttempt(english)}`).toBeNull();
      expect(errorOf(english.errors, ERROR_FIELD.action), `English UI: ${describeAttempt(english)}`).toBe(TEXT.fieldRequired.en);
      const moduleAr = await labelOf(page, DEF_MODULE.networkManagement, 'ar');
      const arabic = await attemptInArabic(page, languageSwitcher, ncDefinitions, drawer, () => drawer.fillGeneral({ name, module: moduleAr }));
      expect(errorOf(arabic.errors, ERROR_FIELD.action), `Arabic UI: ${describeAttempt(arabic)}`).toBe(TEXT.fieldRequired.ar);
    });
  });

  test(`TC-${CASES.actionsByModule.azureId}: should list only the chosen module's actions and offer the chosen action's placeholders`, async ({ page, steps, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    await openList(steps, ncDefinitions);
    await openCreate(steps, drawer);

    await steps.step(`Select Module "${APPROVAL_MODULE}" - the Action dropdown lists only events relevant to Approval Management`, async () => {
      await drawer.fillGeneral({ module: APPROVAL_MODULE });
      const offered = await drawer.options(DEF_DRAWER_PART.action);
      const expected = await actionLabelsOf(page, DEF_MODULE.approvalManagement);
      expect([...offered].sort(), 'Action options = GetOptions actions of Approval Management').toEqual([...expected].sort());
    });

    await steps.step(`Select an Action, "${NEED_TO_APPROVE_PAYER}" - the system displays the placeholders available for that event`, async () => {
      await drawer.fillGeneral({ action: NEED_TO_APPROVE_PAYER, name: `${SUITE_DEFINITION_PREFIX} placeholders` });
      const reached = await forwardTo(page, drawer, 'content');
      expect(reached.reached, `the Content step should open: toasts [${reached.toasts.join(' | ')}]`).toBe('content');
      const offered = await insertMenuVariables(drawer);
      const expected = (await actionVariablesNc(page, DEF_ACTION.payerNeedApprove)).map((v) => v.name);
      expect([...offered].sort(), 'Insert-variable menu = GetActionVariables of the action').toEqual([...expected].sort());
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.moduleResetsAction.azureId}: should clear the chosen action and its placeholders when the module changes`, async ({ page, steps, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const policyVariables = (await actionVariablesNc(page, DEF_ACTION.policyExpiringSoon)).map((v) => v.name);
    const planVariables = (await actionVariablesNc(page, DEF_ACTION.planInactive)).map((v) => v.name);
    await openList(steps, ncDefinitions);

    await steps.critical(`Open the Create drawer, select Module "${POLICY_MODULE}" and Action "${POLICY_EXPIRING}" - placeholders for that event display`, async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ name: `${SUITE_DEFINITION_PREFIX} module switch`, module: POLICY_MODULE, action: POLICY_EXPIRING });
      await forwardTo(page, drawer, 'content');
      expect([...(await insertMenuVariables(drawer))].sort(), 'the Policy action variables are offered').toEqual([...policyVariables].sort());
      expect(await backToGeneral(page, drawer), 'back on General').toBe('general');
    });

    await steps.step(`Change Module to "${PLAN_MODULE}" - the previously selected Action and its placeholders are cleared`, async () => {
      await drawer.fillGeneral({ module: PLAN_MODULE });
      expect((await generalShown(drawer)).action, 'the Action is cleared').toBe('');
      const offered = await drawer.options(DEF_DRAWER_PART.action);
      expect(offered, `no ${POLICY_MODULE} action is offered any more`).not.toContain(POLICY_EXPIRING);
      await drawer.fillGeneral({ action: PLAN_INACTIVE });
      await forwardTo(page, drawer, 'content');
      const now = await insertMenuVariables(drawer);
      expect([...now].sort(), `the variables offered are now "${PLAN_INACTIVE}"'s`).toEqual([...planVariables].sort());
      expect(now.filter((v) => policyVariables.includes(v) && !planVariables.includes(v)), 'stale Policy-only variables').toEqual([]);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.noModule.azureId}: should block saving with "${TEXT.fieldRequired.en}" under Module when no module is selected`, async ({ page, steps, ncDefinitions, ncDefinitionDrawer: drawer, languageSwitcher }) => {
    const name = `${SUITE_DEFINITION_PREFIX} no module`;
    await openList(steps, ncDefinitions);

    await steps.critical('Open the Create drawer, enter Name, leave Module unselected - the Module field remains empty', async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ name });
      expect((await generalShown(drawer)).module, 'Module is empty').toBe('');
    });

    await steps.step(`Click Save - save is blocked and "${TEXT.fieldRequired.en}" / "${TEXT.fieldRequired.ar}" is displayed for the Module field`, async () => {
      const english = await saveFromHere(page, drawer);
      expect(english.status, `nothing should be sent: ${describeAttempt(english)}`).toBeNull();
      expect(errorOf(english.errors, ERROR_FIELD.module), `English UI: ${describeAttempt(english)}`).toBe(TEXT.fieldRequired.en);
      const arabic = await attemptInArabic(page, languageSwitcher, ncDefinitions, drawer, () => drawer.fillGeneral({ name }));
      expect(errorOf(arabic.errors, ERROR_FIELD.module), `Arabic UI: ${describeAttempt(arabic)}`).toBe(TEXT.fieldRequired.ar);
    });
  });

  test(`TC-${CASES.description1000.azureId}: should accept a Description of exactly ${DESCRIPTION_MAX} characters`, async ({ steps, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    const description = LONG_TEXT('QA automation description', DESCRIPTION_MAX);
    await openList(steps, ncDefinitions);
    await openCreate(steps, drawer);

    await steps.step(`Enter a Description value exactly ${DESCRIPTION_MAX} characters long - the field accepts the full text`, async () => {
      await drawer.fillGeneral({ description });
      expect((await generalShown(drawer)).description, `the Description should hold all ${DESCRIPTION_MAX} characters`).toBe(description);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.description1001.azureId}: should stop the Description at ${DESCRIPTION_MAX} characters or flag the excess as invalid`, async ({ page, steps, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    await openList(steps, ncDefinitions);
    await openCreate(steps, drawer);

    await steps.step(`Attempt to enter a Description value of ${DESCRIPTION_MAX + 1} characters - the field blocks input at ${DESCRIPTION_MAX} or flags the excess as invalid`, async () => {
      const input = drawer.byPart(DEF_DRAWER_PART.description);
      await input.fill(LONG_TEXT('QA automation description', DESCRIPTION_MAX));
      await input.pressSequentially('y');
      await input.blur();
      const held = (await generalShown(drawer)).description.length;
      const errors = await visibleErrors(page);
      expect(held <= DESCRIPTION_MAX || errorOf(errors, 'description') !== '', `the Description holds ${held} characters; field errors ${JSON.stringify(errors)}`).toBe(true);
      await discardDrawer(drawer);
    });
  });

  test(`TC-${CASES.activeByDefault.azureId}: should have the Active option switched on when the Create drawer opens`, async ({ steps, ncDefinitions, ncDefinitionDrawer: drawer }) => {
    await openList(steps, ncDefinitions);

    await steps.step('Open the Create drawer and view the Active checkbox on the General step - the checkbox is checked by default', async () => {
      await drawer.openCreate();
      expect((await generalShown(drawer)).active, 'Active is ticked on a new notification').toBe(true);
      await discardDrawer(drawer);
    });
  });
});
