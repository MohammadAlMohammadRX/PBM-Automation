import { test, expect } from '../../../fixtures';
import type { PlanFormDialog, SaveReport } from '../../../pages/plan/PlanFormDialog';
import { PLAN_LIFECYCLE, planPayer } from '../../../data/plans/plan.data';
import {
  ACTIVE_REFERENCE,
  ACTIVE_WAIT_MS,
  APPROVED_ANSWER,
  DUPLICATE_NAME,
  UNIQUE,
  newPlanNamed,
} from '../../../data/plans/uniqueActivePlanName.data';

/**
 * User story 14325: Enforce unique active plan name at every stage of a change.
 * The THREE CHECKPOINTS - a duplicate Active name is refused when the change is
 * drafted, again when it is sent for approval and again at approval - and the
 * ways round them a user might try (case, spacing, a pasted rename, a race
 * between two approvals).
 *
 * Same-name plans are driven by id: the detail screen for Send for Approval
 * and PlanManagementPage.approveRequestOfPlan for an approval, because the
 * list and queue rows are matched by name.
 */
test.describe('US 14325 - Duplicate Active names at every checkpoint', () => {
  test(`TC-${UNIQUE.duplicateActive.azureId}: should refuse to save the draft with a duplicate-name error when an Active plan already has the name`, async ({
    planManagementPage,
    planIn,
    steps,
    cleanup,
  }) => {
    test.setTimeout(12 * 60_000);
    const holder = await planIn('Active', { nameEn: UNIQUE.duplicateActive.name() });
    let form!: PlanFormDialog;
    let report!: SaveReport;

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(holder.payerName);
      expect(await planManagementPage.readStatus(holder.name)).toBe(PLAN_LIFECYCLE.active);
    });

    await steps.critical('Create New Plan opens a blank plan creation form', async () => {
      form = await planManagementPage.openAddForm();
      expect(await form.readField('nameEn')).toBe('');
    });

    await steps.step('The Active plan\'s name, with the other mandatory fields, is accepted as typed text', async () => {
      await form.fill(newPlanNamed(holder.name));
      expect(await form.readField('nameEn')).toBe(holder.name);
    });

    await steps.step('Saving the draft is blocked with a duplicate-name error referencing the existing Active plan', async () => {
      report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, `a duplicate Active name must not be drafted: ${report.text}`).toBe(true);
      const said = [...report.messages, report.outcome?.text ?? ''].join(' | ');
      expect(said, 'a duplicate-name error').toMatch(DUPLICATE_NAME);
      expect(said, 'the error should say the name is held by an Active plan').toMatch(ACTIVE_REFERENCE);
    });
  });

  test(`TC-${UNIQUE.blockedAtSubmit.azureId}: should refuse Send for Approval when another plan became Active with the draft's name after it was saved`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const draft = await planIn('Draft', { nameEn: UNIQUE.blockedAtSubmit.name() });

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(draft.payerName);
      expect(await planManagementPage.isListed(draft.name)).toBe(true);
    });

    await steps.critical('In a separate plan, another plan with the same name is activated', async () => {
      const other = await planIn('Active', { nameEn: draft.name });
      await planDetailPage.open(other.id);
      expect(await planDetailPage.getName()).toBe(draft.name);
      await planDetailPage.expectStatus(PLAN_LIFECYCLE.active);
    });

    await steps.critical('Draft Plan B opens showing its saved name', async () => {
      await planDetailPage.open(draft.id);
      expect(await planDetailPage.getName()).toBe(draft.name);
    });

    await steps.step('Submitting Plan B for approval is blocked with a duplicate-name error', async () => {
      const sent = await planDetailPage.attemptSubmit();
      expect(sent.offered !== 'available' || sent.status >= 300, `the submission must be refused: ${sent.offered} ${sent.status} ${sent.text.slice(0, 200)}`).toBe(true);
      expect([sent.text, ...sent.messages].join(' | '), 'a duplicate-name error naming the Active plan').toMatch(DUPLICATE_NAME);
    });
  });

  test(`TC-${UNIQUE.blockedAtApproval.azureId}: should refuse the final approval when another plan became Active with the name while it waited`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const pending = await planIn('PendingApproval', { nameEn: UNIQUE.blockedAtApproval.name() });

    await steps.critical('Navigate to the Plans Management module - Plan B is pending approval', async () => {
      await planManagementPage.openListFor(pending.payerName);
      expect(await planManagementPage.isListed(pending.name)).toBe(true);
    });

    await steps.critical('While Plan B waits, another plan with the same name becomes Active through a separate approval', async () => {
      const other = await planIn('Draft', { nameEn: pending.name });
      const sent = await planManagementPage.submitViaApi(other.id);
      expect(sent.status, `the other plan's submission: ${sent.text.slice(0, 200)}`).toBeLessThan(300);
      await planManagementPage.waitForEffectiveToPass(other.id);
      const approved = await planManagementPage.approveRequestOfPlan(other.id, pending.name);
      expect(approved.status, `the other plan's approval: ${approved.text.slice(0, 200)}`).toBeLessThan(300);
      await planDetailPage.open(other.id);
      await planDetailPage.expectStatusEventually(PLAN_LIFECYCLE.active, ACTIVE_WAIT_MS);
    });

    await steps.step('As an approver, approving Plan B is blocked with a duplicate-name error', async () => {
      await planApprovalsPage.open();
      const decision = await planApprovalsPage.attemptApprove(pending.name);
      expect(decision.answer, 'the approval must be refused').not.toMatch(APPROVED_ANSWER);
      expect(decision.answer, 'with a duplicate-name error').toMatch(DUPLICATE_NAME);
      expect(decision.stillQueued, 'Plan B stays pending').toBe(true);
    });
  });

  test(`TC-${UNIQUE.normalised.azureId}: should treat names as duplicates when they differ only in case or surrounding spaces`, async ({
    planManagementPage,
    planIn,
    steps,
    cleanup,
  }) => {
    test.setTimeout(12 * 60_000);
    const holder = await planIn('Active', { nameEn: UNIQUE.normalised.name() });
    const [differentCase, spaced] = UNIQUE.normalised.variants(holder.name);
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(holder.payerName);
      expect(await planManagementPage.readStatus(holder.name)).toBe(PLAN_LIFECYCLE.active);
    });

    await steps.step(`The name in ${differentCase.label} is entered and evaluated against the Active plans`, async () => {
      form = await planManagementPage.openAddForm();
      await form.fill(newPlanNamed(differentCase.value));
      expect(await form.readField('nameEn')).toBe(differentCase.value);
    });

    await steps.step(`Saving the draft is blocked as a duplicate whatever the ${differentCase.label}`, async () => {
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, `"${differentCase.value}" must count as "${holder.name}": ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).toMatch(DUPLICATE_NAME);
      await form.closeAndDiscard();
    });

    await steps.step(`With ${spaced.label}, the name is blocked as a duplicate too`, async () => {
      await planManagementPage.openListFor(holder.payerName);
      const again = await planManagementPage.openAddForm();
      await again.fill(newPlanNamed(spaced.value));
      const report = await again.saveNewAndReport();
      cleanup.register(() => again.discardCreated(report.outcome));
      expect(report.refused, `"${spaced.value}" must count as "${holder.name}": ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).toMatch(DUPLICATE_NAME);
      await again.closeAndDiscard();
    });
  });

  test(`TC-${UNIQUE.simultaneousApprovals.azureId}: should let only the first plan become Active when two same-named plans are approved in quick succession`, async ({
    planManagementPage,
    planDetailPage,
    planFormulary,
    steps,
    cleanup,
  }) => {
    test.setTimeout(30 * 60_000);
    const name = UNIQUE.simultaneousApprovals.name();
    const formulary = await planFormulary();
    const ids: string[] = [];

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(planPayer());
      expect(await planManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Two separate drafts, Plan D and Plan E, are saved with the same name - neither is Active yet', async () => {
      for (const label of UNIQUE.simultaneousApprovals.labels) {
        const form = await planManagementPage.openAddForm();
        await form.fill(newPlanNamed(name));
        const report = await form.saveNewAndReport();
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.created, `${label} should save as a draft: ${report.text}`).toBe(true);
        ids.push(form.createdId(report.outcome));
        await planDetailPage.open(ids[ids.length - 1]);
        const tab = planDetailPage.formulary();
        await tab.open();
        expect((await tab.assign(String(formulary.formularyCode)))?.status ?? 0, `${label}'s formulary`).toBeLessThan(300);
        await planManagementPage.openListFor(planPayer());
      }
    });

    await steps.critical('Both are submitted for approval at the same time - both submissions are accepted', async () => {
      const answers = await Promise.all(ids.map((id) => planManagementPage.submitViaApi(id)));
      expect(answers.every((answer) => answer.status < 300), answers.map((answer) => `${answer.status} ${answer.text.slice(0, 120)}`).join(' | ')).toBe(true);
    });

    await steps.critical('Plan D is approved first and becomes Active with the name', async () => {
      await planManagementPage.waitForEffectiveToPass(ids[0]);
      const approved = await planManagementPage.approveRequestOfPlan(ids[0], name);
      expect(approved.status, `Plan D's approval: ${approved.text.slice(0, 200)}`).toBeLessThan(300);
      await planDetailPage.open(ids[0]);
      await planDetailPage.expectStatusEventually(PLAN_LIFECYCLE.active, ACTIVE_WAIT_MS);
    });

    await steps.step('Approving Plan E right after is blocked with a duplicate-name error', async () => {
      await planManagementPage.waitForEffectiveToPass(ids[1]);
      const refused = await planManagementPage.approveRequestOfPlan(ids[1], name);
      expect(refused.status, `Plan E's approval must be refused: ${refused.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(refused.text).toMatch(DUPLICATE_NAME);
    });
  });

  test(`TC-${UNIQUE.renameMidEdit.azureId}: should block the save when a draft is renamed by pasting the name of an Active plan`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const reserved = await planIn('Active', { nameEn: UNIQUE.renameMidEdit.reserved() });
    const draft = await planIn('Draft', { nameEn: UNIQUE.renameMidEdit.draft() });
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the landing page is displayed', async () => {
      await planManagementPage.openListFor(draft.payerName);
      expect(await planManagementPage.isListed(draft.name)).toBe(true);
    });

    await steps.step('Draft Plan F, renamed mid-edit by pasting the Active plan\'s name, holds the pasted value', async () => {
      form = await planManagementPage.openEditForm(draft.name);
      expect(await form.insertInto('nameEn', reserved.name), 'the pasted name').toBe(reserved.name);
    });

    await steps.step('Saving the draft with the pasted name is blocked and flagged as a duplicate', async () => {
      const report = await form.attemptEditSave();
      expect(report.refused, `a pasted Active name must not save: ${report.text}`).toBe(true);
      expect([...report.messages, await form.readFieldError('nameEn')].join(' | ')).toMatch(DUPLICATE_NAME);
      expect((await planManagementPage.readPlanRecord(draft.id)).planNameEn, 'the draft keeps its own name').toBe(draft.name);
      await form.closeAndDiscard();
    });
  });
});
