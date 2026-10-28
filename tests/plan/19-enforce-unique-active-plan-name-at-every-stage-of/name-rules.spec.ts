import { test, expect } from '../../../fixtures';
import type { SaveReport } from '../../../pages/plan/PlanFormDialog';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { PLAN_LIFECYCLE, planPayer } from '../../../data/plans/plan.data';
import { PLAN_FORM_MESSAGE } from '../../../data/plans/createPlan.data';
import {
  DENIED_STATUSES,
  DUPLICATE_NAME,
  MESSAGE_CHECKLIST,
  NON_ADMIN_VISIBLE_DRAFT,
  PLAN_NAME_MAX,
  UNIQUE,
  newPlanNamed,
} from '../../../data/plans/uniqueActivePlanName.data';

/**
 * User story 14325: Enforce unique active plan name at every stage of a change.
 * The name's RULES around the uniqueness check: a clear, actionable message
 * when it refuses, who may draft or submit a name change at all, and the
 * name's length boundaries.
 */
test.describe('US 14325 - Plan name message, permissions and length', () => {
  test(`TC-${UNIQUE.clearMessage.azureId}: should explain the block in clear, actionable business language when a duplicate Active name is refused`, async ({
    planManagementPage,
    planIn,
    steps,
    cleanup,
  }) => {
    test.setTimeout(12 * 60_000);
    const holder = await planIn('Active', { nameEn: UNIQUE.clearMessage.name() });
    let report!: SaveReport;
    let said = '';

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(holder.payerName);
      expect(await planManagementPage.readStatus(holder.name)).toBe(PLAN_LIFECYCLE.active);
    });

    await steps.critical('Creating a new plan with the duplicate name is blocked on save', async () => {
      const form = await planManagementPage.openAddForm();
      await form.fill(newPlanNamed(holder.name));
      report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      said = [...report.messages, await form.readFieldError('nameEn')].filter((m) => m !== '').join(' | ');
      expect(report.refused, `the duplicate must not be created: ${report.text}`).toBe(true);
      expect(said, 'a duplicate-name message').toMatch(DUPLICATE_NAME);
    });

    await steps.step('The message names the field, states the reason, avoids jargon and suggests a corrective action', async () => {
      expect(said, 'it should name the field in error').toMatch(MESSAGE_CHECKLIST.namesField);
      expect(said, 'it should say the name is already held by an Active plan').toMatch(MESSAGE_CHECKLIST.statesReason);
      expect(said, 'it should carry no technical jargon').not.toMatch(MESSAGE_CHECKLIST.jargon);
      expect(said, 'it should suggest what to do instead').toMatch(MESSAGE_CHECKLIST.suggestsAction);
    });
  });

  test(`TC-${UNIQUE.viewerRole.azureId}: should keep the user from drafting or submitting a plan name change when their role lacks plan administration rights`, async ({
    planManagementPage,
    planIn,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    const draft = await planIn('Draft', NON_ADMIN_VISIBLE_DRAFT);
    let session!: ShapedSession;

    await steps.critical('Navigate to the Plans Management module as the restricted role - the landing page is displayed', async () => {
      await planManagementPage.openListFor(draft.payerName);
      const held = (await planManagementPage.isAddOffered()) && (await planManagementPage.getActionAvailabilityIfListed(draft.name, 'edit')) === 'available';
      requireBaseline(held, 'Create New Plan and Edit for a session holding CreatePlan and UpdatePlan');
      session = await shapedNonAdmin({ without: ['createPlan', 'editPlan', 'submitPlan'] });
      await session.plans.openListFor(draft.payerName);
      expect(await session.plans.getHeaderTexts(), 'the plan list should render for the role').not.toEqual([]);
    });

    await steps.step('Creating a plan or editing a plan\'s name is not offered to the role', async () => {
      expect(await session.plans.isAddOffered(), 'Create New Plan must be hidden or disabled').toBe(false);
      expect(await session.plans.getActionAvailabilityIfListed(draft.name, 'edit'), 'Edit must be hidden or disabled').not.toBe('available');
    });

    await steps.step('Submitting a plan for approval directly is denied with a permissions error', async () => {
      expect(await session.plans.getActionAvailabilityIfListed(draft.name, 'submit-for-approval'), 'Send for Approval must not be offered').not.toBe('available');
      const answer = await session.plans.submitViaApi(draft.id);
      expect(DENIED_STATUSES as readonly number[], `SubmitPlanForApproval answered ${answer.status} ${answer.text.slice(0, 200)}`).toContain(answer.status);
    });
  });

  test(`TC-${UNIQUE.lengthLimits.azureId}: should enforce the plan name's required and length boundaries when the plan is saved`, async ({
    planManagementPage,
    steps,
    cleanup,
  }) => {
    test.setTimeout(10 * 60_000);
    const payer = planPayer();

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(payer);
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('With the name left empty, the save is blocked and the name flagged as required', async () => {
      const form = await planManagementPage.openAddForm();
      const data = newPlanNamed('');
      await form.fillBasicInformation(data, 'nameEn');
      const report = await form.attemptNewSave(data);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, `an unnamed plan must not save: ${report.text}`).toBe(true);
      expect([await form.readFieldError('nameEn'), ...report.messages].join(' | ')).toMatch(PLAN_FORM_MESSAGE.required);
      await form.closeAndDiscard();
    });

    await steps.step('A one-character name is accepted, or refused with a minimum-length message, consistently', async () => {
      await planManagementPage.openListFor(payer);
      const form = await planManagementPage.openAddForm();
      await form.fill(newPlanNamed(UNIQUE.lengthLimits.oneCharacter));
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created || PLAN_FORM_MESSAGE.lengthLimit.test(report.text), `one character: ${report.text}`).toBe(true);
      await form.closeAndDiscard();
    });

    await steps.step(`A name over ${PLAN_NAME_MAX} characters is blocked and flagged as too long, or never held`, async () => {
      await planManagementPage.openListFor(payer);
      const form = await planManagementPage.openAddForm();
      const data = newPlanNamed(UNIQUE.lengthLimits.atMax());
      await form.fillBasicInformation(data);
      const held = await form.insertInto('nameEn', UNIQUE.lengthLimits.overMax());
      const report = await form.attemptNewSave(data);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(held.length <= PLAN_NAME_MAX || report.refused, `held ${held.length} characters; ${report.text}`).toBe(true);
      expect((await form.readCreated(report.outcome))?.planNameEn.length ?? 0, 'no over-limit name may be stored').toBeLessThanOrEqual(PLAN_NAME_MAX);
      await form.closeAndDiscard();
    });

    await steps.step(`A name of exactly ${PLAN_NAME_MAX} characters is accepted and the draft saved`, async () => {
      await planManagementPage.openListFor(payer);
      const form = await planManagementPage.openAddForm();
      const atMax = UNIQUE.lengthLimits.atMax();
      await form.fill(newPlanNamed(atMax));
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `a name at the limit should save: ${report.text}`).toBe(true);
      expect((await form.readCreated(report.outcome))?.planNameEn, 'the full-length name is stored').toBe(atMax);
    });
  });
});
